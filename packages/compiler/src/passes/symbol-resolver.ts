import type { PlannedSymbol, SymbolResolverInput, SymbolResolverPlan } from '../artifacts.ts';

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
			});
		}
	}

	for (const binding of input.payloadArena.view.bindings) {
		symbols.push({
			id: `symbol:${nextSymbolId++}`,
			kind: 'dom-binding',
			hostNodeId: binding.hostNodeId,
			source: binding.source,
			bindingId: binding.bindingId,
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
			bindingId: computed.bindingId,
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
