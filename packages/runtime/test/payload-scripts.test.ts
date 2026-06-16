import { expect, test } from 'vitest';
import { createProtocolStatePayload, renderPayloadScripts } from '../../serializer/src/index.ts';
import {
	createBindingDomJournalRecord,
	createResumeRuntime,
	createRuntimeGraphFromStatePayload,
	decodePayloadScripts,
	decodePayloadScriptsFromDocument,
	resumeFromPayloadDocument,
	resumeFromPayloadScripts,
	RuntimePayloadError,
} from '../src/index.ts';
import type { ProtocolViewPayload } from '@async/resumable-protocol';

type FakeElement = {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly childNodes: FakeElement[];
	textContent?: string | null;
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

type FakePayloadScript = {
	readonly textContent: string;
};

type FakePayloadDocument = {
	readonly scripts: Record<string, FakePayloadScript | undefined>;
	querySelector(selector: string): FakePayloadScript | null;
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

function payloadDocument(stateScript: string, viewScript: string): FakePayloadDocument {
	return {
		scripts: {
			'script[type="async/state"]': { textContent: scriptContent(stateScript) },
			'script[type="async/view"]': { textContent: scriptContent(viewScript) },
		},
		querySelector(selector) {
			return this.scripts[selector] ?? null;
		},
	};
}

function scriptContent(script: string): string {
	return script.replace(/^<script type="async\/(?:state|view)">/, '').replace('</script>', '');
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

test('runtime decodes async payload scripts from a document-like script lookup', () => {
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
		locators: [],
		events: [],
		bindings: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view });

	expect(
		decodePayloadScriptsFromDocument(payloadDocument(scripts.stateScript, scripts.viewScript)),
	).toEqual({
		state,
		view,
	});
});

test('payload document resume applies DOM journal records through async/view locators by default', async () => {
	const button = element('BUTTON');
	const root = element('SECTION', [button]);
	const state = createProtocolStatePayload({
		cells: [{ bindingId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
	});
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
		],
		events: [],
		bindings: [
			{
				hostNodeId: 'h1',
				source: 'count',
				bindingId: 'state:count',
				path: [],
				target: { kind: 'text' },
				symbolId: 'symbol:binding',
			},
		],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view });
	const resumed = await resumeFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root,
		loadSymbol() {
			return (context) =>
				createBindingDomJournalRecord({
					locator: context.binding!.hostNodeId,
					target: context.binding!.target!,
					value: context.value,
				});
		},
	});

	resumed.graph.write({ bindingId: 'state:count', value: 1 });
	await resumed.graph.flush();

	expect(button.textContent).toBe('1');
	expect(resumed.graph.takeJournal()).toEqual([]);
});

test('runtime rejects payload scripts missing required state or view fields', () => {
	const validState = '<script type="async/state">{"version":1,"cells":[]}</script>';
	const validView =
		'<script type="async/view">{"version":1,"locators":[],"events":[],"bindings":[],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>';

	expect(() =>
		decodePayloadScripts({
			stateScript: '<script type="async/state">{"version":1}</script>',
			viewScript: validView,
		}),
	).toThrow('Invalid async/state payload: expected cells array.');

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript: '<script type="async/view">{"version":1,"locators":[]}</script>',
		}),
	).toThrow('Invalid async/view payload: expected events array.');
});

test('runtime rejects payload scripts with malformed nested view records', () => {
	const validState = '<script type="async/state">{"version":1,"cells":[]}</script>';

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="async/view">{"version":1,"locators":[{"strategy":"dom-order","index":0,"tagName":"section"}],"events":[],"bindings":[],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>',
		}),
	).toThrow('Invalid async/view locator[0]: expected hostNodeId string.');

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="async/view">{"version":1,"locators":[],"events":[{"hostNodeId":"h1","eventName":"click"}],"bindings":[],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>',
		}),
	).toThrow('Invalid async/view event[0]: expected symbolIds array.');

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="async/view">{"version":1,"locators":[],"events":[],"bindings":[{"hostNodeId":"h1","source":"count","bindingId":"state:count","path":[],"target":{"kind":"attribute"}}],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>',
		}),
	).toThrow('Invalid async/view binding[0].target: expected attribute name string.');

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="async/view">{"version":1,"locators":[],"events":[],"bindings":[{"hostNodeId":"h1","source":"count","bindingId":"state:count","path":[],"target":{"kind":"property"}}],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>',
		}),
	).toThrow('Invalid async/view binding[0].target: expected property name string.');

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="async/view">{"version":1,"locators":[],"events":[],"bindings":[{"hostNodeId":"h1","source":"count","bindingId":"state:count","path":[],"target":{"kind":"class"}}],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>',
		}),
	).not.toThrow();

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="async/view">{"version":1,"locators":[],"events":[],"bindings":[{"hostNodeId":"h1","source":"count","bindingId":"state:count","path":[],"target":{"kind":"style"}}],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>',
		}),
	).not.toThrow();
});

test('runtime rejects payload scripts with malformed sync policy records', () => {
	const validState = '<script type="async/state">{"version":1,"cells":[]}</script>';

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="async/view">{"version":1,"locators":[],"events":[{"hostNodeId":"h1","eventName":"click","symbolIds":[],"syncPolicy":{"when":{"type":"event-equals","field":"key","value":"Escape"},"actions":["cancel"]}}],"bindings":[],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>',
		}),
	).toThrow('Invalid async/view event[0].syncPolicy: expected supported sync action.');

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="async/view">{"version":1,"locators":[],"events":[{"hostNodeId":"h1","eventName":"click","symbolIds":[],"syncPolicy":{"when":{"type":"graph-truthy","path":[]},"actions":["preventDefault"]}}],"bindings":[],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>',
		}),
	).toThrow('Invalid async/view event[0].syncPolicy.when: expected bindingId string.');
});

test('runtime payload decode errors expose structured payload diagnostics', () => {
	const validView =
		'<script type="async/view">{"version":1,"locators":[],"events":[],"bindings":[],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>';
	const error = captureThrown(() =>
		decodePayloadScripts({
			stateScript: '{"version":1,"cells":[]}',
			viewScript: validView,
		}),
	);

	expect(error).toBeInstanceOf(RuntimePayloadError);
	expect(error).toMatchObject({
		code: 'AA_PAYLOAD_INVALID',
		severity: 'error',
		phase: 'payload',
		title: 'Invalid resumability payload',
		payloadType: 'async/state',
		payloadScript: 'script[type="async/state"]',
		docsUrl: 'https://async.await.dev/errors/AA_PAYLOAD_INVALID',
		suggestions: [
			{
				message: expect.stringContaining('async/state'),
			},
		],
	});
	expect(error).toMatchObject({
		message: 'Expected async/state payload script.',
		why: expect.stringContaining('async/state'),
	});
});

test('runtime protocol version mismatch errors expose expected and actual versions', () => {
	const validView =
		'<script type="async/view">{"version":1,"locators":[],"events":[],"bindings":[],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>';
	const error = captureThrown(() =>
		decodePayloadScripts({
			stateScript: '<script type="async/state">{"version":2,"cells":[]}</script>',
			viewScript: validView,
		}),
	);

	expect(error).toBeInstanceOf(RuntimePayloadError);
	expect(error).toMatchObject({
		code: 'AA_PROTOCOL_VERSION_MISMATCH',
		severity: 'error',
		phase: 'payload',
		title: 'Unsupported resumability protocol version',
		payloadType: 'async/state',
		payloadScript: 'script[type="async/state"]',
		expectedVersion: 1,
		actualVersion: 2,
		docsUrl: 'https://async.await.dev/errors/AA_PROTOCOL_VERSION_MISMATCH',
	});
	expect(error).toMatchObject({
		message: 'Unsupported async/state protocol version 2.',
		why: expect.stringContaining('version 1'),
	});
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

test('runtime resumes from async payload scripts found in a document-like root', async () => {
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
					when: { type: 'event-equals', field: 'key', value: 'Escape' },
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
	const resumed = await resumeFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root,
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return ({ graph }) => {
				graph.write({ bindingId: 'state:menu', path: ['open'], value: false });
			};
		},
	});

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
	expect(resumed.decoded.state).toEqual(state);
	expect(resumed.decoded.view).toEqual(view);
});

function captureThrown(run: () => unknown): unknown {
	try {
		run();
	} catch (error) {
		return error;
	}

	throw new Error('Expected callback to throw.');
}
