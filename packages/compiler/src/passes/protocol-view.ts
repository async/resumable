import { ASYNC_PROTOCOL_VERSION, type ProtocolViewPayload } from '@async/resumable-protocol';
import type { ProtocolViewPayloadInput } from '../artifacts.ts';

export function createProtocolViewPayload(input: ProtocolViewPayloadInput): ProtocolViewPayload {
	const eventSymbols = new Map<string, string[]>();
	const bindingSymbols = new Map<string, string>();
	const behaviorSymbols = new Map<string, string[]>();
	const asyncRunnerSymbols = new Map<string, string>();

	for (const symbol of input.symbolResolver.symbols) {
		if (symbol.kind === 'event-handler') {
			const key = `${symbol.hostNodeId}:${symbol.eventName}`;
			const symbols = eventSymbols.get(key) ?? [];
			symbols[symbol.order] = symbol.id;
			eventSymbols.set(key, symbols);
		}

		if (symbol.kind === 'dom-binding') {
			bindingSymbols.set(
				`${symbol.hostNodeId}:${symbol.bindingId}:${symbol.source}`,
				symbol.id,
			);
		}

		if (symbol.kind === 'behavior') {
			const symbols = behaviorSymbols.get(symbol.hostNodeId) ?? [];
			symbols[symbol.order] = symbol.id;
			behaviorSymbols.set(symbol.hostNodeId, symbols);
		}

		if (symbol.kind === 'async-computed-runner') {
			asyncRunnerSymbols.set(symbol.bindingId, symbol.id);
		}
	}

	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: input.payloadArena.view.locators,
		events: input.payloadArena.view.events.map((event) => ({
			hostNodeId: event.hostNodeId,
			eventName: event.eventName,
			syncPolicy: event.syncPolicy,
			symbolIds: eventSymbols.get(`${event.hostNodeId}:${event.eventName}`) ?? [],
		})),
		bindings: input.payloadArena.view.bindings.map((binding) => ({
			...binding,
			symbolId: bindingSymbols.get(
				`${binding.hostNodeId}:${binding.bindingId}:${binding.source}`,
			),
		})),
		behaviors: input.payloadArena.view.behaviors.map((behavior, index) => ({
			...behavior,
			symbolId: behaviorSymbols.get(behavior.hostNodeId)?.[index],
		})),
		elementHandles: input.payloadArena.view.elementHandles,
		asyncBoundaries: input.payloadArena.view.asyncBoundaries.map((boundary) => ({
			...boundary,
			asyncReads: boundary.asyncReads.map((read) => ({
				...read,
				runnerSymbolId: asyncRunnerSymbols.get(read.bindingId),
			})),
		})),
	};
}
