import type { ProtocolStatePayload, ProtocolViewPayload } from '@async/resumable-protocol';

export type PayloadScriptPair = {
	readonly stateScript: string;
	readonly viewScript: string;
};

export function assertPayloadScriptTypes(input: PayloadScriptPair): void {
	if (!input.stateScript.startsWith('<script type="async/state">')) {
		throw new Error('Expected async/state payload script.');
	}

	if (!input.viewScript.startsWith('<script type="async/view">')) {
		throw new Error('Expected async/view payload script.');
	}
}

export function summarizeProtocolPayload(input: {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
}): {
	readonly cells: number;
	readonly locators: number;
	readonly events: number;
	readonly bindings: number;
	readonly behaviors: number;
} {
	return {
		cells: input.state.cells.length,
		locators: input.view.locators.length,
		events: input.view.events.length,
		bindings: input.view.bindings.length,
		behaviors: input.view.behaviors.length,
	};
}
