import { expect, test } from 'vitest';
import { createProtocolStatePayload, renderPayloadScripts } from '../../serializer/src/index.ts';
import {
	createResumeRuntime,
	createRuntimeGraphFromStatePayload,
	decodePayloadScripts,
	resumeFromPayloadScripts,
} from '../src/index.ts';
import type { ProtocolViewPayload } from '@async/resumable-protocol';

type FakeElement = {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly childNodes: FakeElement[];
	readonly listeners: Array<{
		readonly type: string;
		readonly listener: (event: FakeEvent) => Promise<void>;
		readonly options?: { readonly capture?: boolean };
	}>;
	addEventListener(
		type: string,
		listener: (event: FakeEvent) => Promise<void>,
		options?: { readonly capture?: boolean },
	): void;
};

type FakeEvent = {
	readonly type: string;
	readonly target: FakeElement;
	readonly key: string;
	defaultPrevented: boolean;
	preventDefault(): void;
};

function element(tagName: string, childNodes: FakeElement[] = []): FakeElement {
	return {
		nodeType: 1,
		tagName,
		childNodes,
		listeners: [],
		addEventListener(type, listener, options) {
			this.listeners.push({ type, listener, options });
		},
	};
}

test('runtime decodes async payload scripts into graph state and resume view records', async () => {
	const input = element('INPUT');
	const root = element('SECTION', [input]);
	const state = createProtocolStatePayload({
		cells: [
			{
				bindingId: 'state:menu',
				name: 'menu',
				valueKind: 'object',
				value: { open: true },
			},
		],
	});
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'input' },
		],
		events: [
			{
				hostNodeId: 'h1',
				eventName: 'keydown',
				syncPolicy: {
					when: {
						type: 'and',
						conditions: [
							{ type: 'graph-truthy', bindingId: 'state:menu', path: ['open'] },
							{ type: 'event-equals', field: 'key', value: 'Escape' },
						],
					},
					actions: ['preventDefault'],
				},
				symbolIds: ['symbol:key'],
			},
		],
		bindings: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view });
	const decoded = decodePayloadScripts({
		stateScript: scripts.stateScript,
		viewScript: scripts.viewScript,
	});
	const graph = createRuntimeGraphFromStatePayload(decoded.state);
	const loadedSymbols: string[] = [];
	const resume = createResumeRuntime({
		root,
		graph,
		view: decoded.view,
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return ({ graph: runtimeGraph }) => {
				runtimeGraph.write({ bindingId: 'state:menu', path: ['open'], value: false });
			};
		},
	});

	resume.start();

	const keydown: FakeEvent = {
		type: 'keydown',
		target: input,
		key: 'Escape',
		defaultPrevented: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
	};
	await root.listeners[0].listener(keydown);

	expect(keydown.defaultPrevented).toBe(true);
	expect(loadedSymbols).toEqual(['symbol:key']);
	expect(graph.read('state:menu', ['open'])).toBe(false);
});

test('runtime resumes directly from async payload scripts', async () => {
	const input = element('INPUT');
	const root = element('SECTION', [input]);
	const state = createProtocolStatePayload({
		cells: [
			{
				bindingId: 'state:menu',
				name: 'menu',
				valueKind: 'object',
				value: { open: true },
			},
		],
	});
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'input' },
		],
		events: [
			{
				hostNodeId: 'h1',
				eventName: 'keydown',
				syncPolicy: {
					when: {
						type: 'and',
						conditions: [
							{ type: 'graph-truthy', bindingId: 'state:menu', path: ['open'] },
							{ type: 'event-equals', field: 'key', value: 'Escape' },
						],
					},
					actions: ['preventDefault'],
				},
				symbolIds: ['symbol:key'],
			},
		],
		bindings: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view });
	const loadedSymbols: string[] = [];
	const resumed = await resumeFromPayloadScripts({
		root,
		stateScript: scripts.stateScript,
		viewScript: scripts.viewScript,
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return ({ graph }) => {
				graph.write({ bindingId: 'state:menu', path: ['open'], value: false });
			};
		},
	});

	expect(root.listeners).toEqual([
		expect.objectContaining({
			type: 'keydown',
			options: { capture: true },
		}),
	]);

	const keydown: FakeEvent = {
		type: 'keydown',
		target: input,
		key: 'Escape',
		defaultPrevented: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
	};
	await root.listeners[0].listener(keydown);

	expect(keydown.defaultPrevented).toBe(true);
	expect(loadedSymbols).toEqual(['symbol:key']);
	expect(resumed.graph.read('state:menu', ['open'])).toBe(false);
	expect(resumed.runtime.getElement('h1')).toBe(input);
	expect(resumed.decoded.view).toEqual(view);
});
