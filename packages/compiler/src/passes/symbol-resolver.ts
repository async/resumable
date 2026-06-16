import type {
	LoweredStateWrite,
	PlannedSymbol,
	SymbolResolverInput,
	SymbolResolverPlan,
} from '../artifacts.ts';

export function planSymbolResolver(input: SymbolResolverInput): SymbolResolverPlan {
	const symbols: PlannedSymbol[] = [];
	let nextSymbolId = 0;

	for (const event of input.payloadArena.view.events) {
		for (let order = 0; order < event.handlerCount; order++) {
			symbols.push({
				id: `symbol:${nextSymbolId++}`,
				kind: 'event-handler',
				hostNodeId: event.hostNodeId,
				eventName: event.eventName,
				source: event.handlerSources[order] ?? '',
				order,
				writes: eventWrites(event.handlerSources[order] ?? '', input.stateLowering?.writes),
			});
		}
	}

	for (const domUpdate of input.payloadArena.view.domUpdates) {
		symbols.push({
			id: `symbol:${nextSymbolId++}`,
			kind: 'dom-update',
			hostNodeId: domUpdate.hostNodeId,
			source: domUpdate.source,
			graphNodeId: domUpdate.graphNodeId,
			target: domUpdate.target,
		});
	}

	input.payloadArena.view.behaviors.forEach((behavior, order) => {
		symbols.push({
			id: `symbol:${nextSymbolId++}`,
			kind: 'behavior',
			hostNodeId: behavior.hostNodeId,
			source: behavior.source,
			order,
		});
	});

	for (const computed of input.payloadArena.state.computed) {
		symbols.push({
			id: `symbol:${nextSymbolId++}`,
			kind: 'async-computed-runner',
			graphNodeId: computed.graphNodeId,
			name: computed.name,
		});
	}

	return {
		passId: 'symbol-resolver',
		dynamicImportOwner: 'generated-symbol-resolver',
		symbols,
		syncPolicies: input.semanticGraph.events
			.filter((event) => event.hasSyncPolicyCandidate)
			.map((event) => ({
				eventId: event.id,
				hostNodeId: event.hostNodeId,
				eventName: event.eventName,
				syncPolicy: event.syncPolicy,
			})),
		diagnostics: input.payloadArena.diagnostics,
	};
}

function eventWrites(
	handlerSource: string,
	writes: ReadonlyArray<LoweredStateWrite> | undefined,
): ReadonlyArray<LoweredStateWrite> {
	if (!handlerSource || !writes?.length) return [];

	return writes.filter((write) => handlerContainsWrite(handlerSource, write));
}

function handlerContainsWrite(handlerSource: string, write: LoweredStateWrite): boolean {
	if (write.operation === 'update' && write.updateOperator) {
		const source = escapeRegExp(write.source);
		const operator = escapeRegExp(write.updateOperator);
		return (
			new RegExp(`(?:^|[^$0-9A-Z_a-z])${source}\\s*${operator}`).test(handlerSource) ||
			new RegExp(`${operator}\\s*${source}(?:$|[^$0-9A-Z_a-z])`).test(handlerSource)
		);
	}

	return handlerSource.includes(write.source);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
