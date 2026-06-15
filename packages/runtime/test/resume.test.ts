import { expect, test } from 'vitest';
import { createResumeRuntime, createRuntimeGraph } from '../src/index.ts';

type FakeElement = {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly childNodes: FakeNode[];
	parentElement?: FakeElement | null;
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

type FakeComment = {
	readonly nodeType: 8;
	readonly data: string;
};

type FakeNode = FakeElement | FakeComment;

type FakeEvent = {
	readonly type: string;
	readonly target: FakeElement;
	readonly key: string;
	defaultPrevented: boolean;
	propagationStopped: boolean;
	preventDefault(): void;
	stopPropagation(): void;
};

function element(tagName: string, childNodes: FakeNode[] = []): FakeElement {
	const node: FakeElement = {
		nodeType: 1,
		tagName,
		childNodes,
		listeners: [],
		addEventListener(type, listener, options) {
			this.listeners.push({ type, listener, options });
		},
	};
	for (const child of childNodes) {
		if (child.nodeType === 1) child.parentElement = node;
	}
	return node;
}

function comment(data: string): FakeComment {
	return {
		nodeType: 8,
		data,
	};
}

function event(type: string, target: FakeElement, key: string): FakeEvent {
	return {
		type,
		target,
		key,
		defaultPrevented: false,
		propagationStopped: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
		stopPropagation() {
			this.propagationStopped = true;
		},
	};
}

test('resume runtime materializes view records and dispatches lazy symbols after sync policy', async () => {
	const input = element('INPUT');
	const root = element('SECTION', [input]);
	const graph = createRuntimeGraph({
		cells: [{ bindingId: 'state:menu', value: { open: true, title: 'Menu' } }],
	});
	const loadedSymbols: string[] = [];

	graph.subscribe({
		id: 'binding:open',
		bindingId: 'state:menu',
		path: ['open'],
		run(value) {
			return { type: 'setAttr', locator: 'input:open', name: 'data-open', value };
		},
	});

	const resume = createResumeRuntime({
		root,
		graph,
		view: {
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
						actions: ['preventDefault', 'stopPropagation'],
					},
					symbolIds: ['symbol:key'],
				},
			],
			bindings: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return async ({ graph: runtimeGraph }) => {
				runtimeGraph.write({
					bindingId: 'state:menu',
					path: ['open'],
					value: false,
				});
			};
		},
	});

	resume.start();

	expect(root.listeners).toEqual([
		expect.objectContaining({
			type: 'keydown',
			options: { capture: true },
		}),
	]);

	const keydown = event('keydown', input, 'Escape');
	const dispatch = root.listeners[0].listener(keydown);

	expect(keydown.defaultPrevented).toBe(true);
	expect(keydown.propagationStopped).toBe(true);
	expect(loadedSymbols).toEqual(['symbol:key']);

	await dispatch;

	expect(graph.read('state:menu', ['open'])).toBe(false);
	expect(graph.takeJournal()).toEqual([
		{ type: 'setAttr', locator: 'input:open', name: 'data-open', value: false },
	]);
});

test('resume runtime dispatches delegated events from nested targets to the owner element record', async () => {
	const label = element('SPAN');
	const button = element('BUTTON', [label]);
	const root = element('SECTION', [button]);
	const graph = createRuntimeGraph({
		cells: [{ bindingId: 'state:count', value: 0 }],
	});
	const handledElements: string[] = [];

	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
				{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'span' },
			],
			events: [
				{
					hostNodeId: 'h1',
					eventName: 'click',
					symbolIds: ['symbol:click'],
				},
			],
			bindings: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol() {
			return ({ element: ownerElement, graph: runtimeGraph }) => {
				handledElements.push(ownerElement.tagName);
				runtimeGraph.update({
					bindingId: 'state:count',
					update: (value) => Number(value) + 1,
				});
			};
		},
	});

	await resume.start();

	const click = event('click', label, '');
	await root.listeners[0].listener(click);

	expect(handledElements).toEqual(['BUTTON']);
	expect(graph.read('state:count')).toBe(1);
});

test('resume runtime materializes async boundary comment anchors', async () => {
	const start = comment('async:boundary:0:start');
	const paragraph = element('P');
	const end = comment('async:boundary:0:end');
	const root = element('SECTION', [start, paragraph, end]);
	const graph = createRuntimeGraph({
		cells: [],
	});

	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'p' },
			],
			events: [],
			bindings: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [
				{
					id: 'boundary:0',
					startAnchor: {
						strategy: 'dom-order-comment',
						index: 0,
					},
					endAnchor: {
						strategy: 'dom-order-comment',
						index: 1,
					},
					asyncReads: [
						{
							source: 'details.title',
							bindingId: 'computed:details',
							path: ['title'],
							runnerSymbolId: 'symbol:details',
						},
					],
				},
			],
		},
		loadSymbol() {
			return () => undefined;
		},
	});

	await resume.start();

	expect(resume.getAsyncBoundary('boundary:0')).toEqual({
		id: 'boundary:0',
		startAnchor: start,
		endAnchor: end,
		asyncReads: [
			{
				source: 'details.title',
				bindingId: 'computed:details',
				path: ['title'],
				runnerSymbolId: 'symbol:details',
			},
		],
	});
});

test('resume runtime demands async boundary reads and runs runner symbols on status changes', async () => {
	const result = deferred<string>();
	const start = comment('async:boundary:0:start');
	const paragraph = element('P');
	const end = comment('async:boundary:0:end');
	const root = element('SECTION', [start, paragraph, end]);
	const loadedSymbols: string[] = [];
	const seenStatuses: string[] = [];
	const graph = createRuntimeGraph({
		cells: [{ bindingId: 'state:userId', value: 'a' }],
		asyncComputed: [
			{
				bindingId: 'computed:details',
				dependencies: [{ bindingId: 'state:userId', path: [] }],
				key: (read) => read('state:userId'),
				run() {
					return result.promise;
				},
			},
		],
	});

	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'p' },
			],
			events: [],
			bindings: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [
				{
					id: 'boundary:0',
					startAnchor: {
						strategy: 'dom-order-comment',
						index: 0,
					},
					endAnchor: {
						strategy: 'dom-order-comment',
						index: 1,
					},
					asyncReads: [
						{
							source: 'details.title',
							bindingId: 'computed:details',
							path: [],
							runnerSymbolId: 'symbol:details-runner',
						},
					],
				},
			],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return ({ asyncBoundary, asyncRead, graph: runtimeGraph }) => {
				const snapshot = runtimeGraph.read(asyncRead!.bindingId) as {
					readonly status: string;
				};
				seenStatuses.push(`${asyncBoundary!.id}:${snapshot.status}`);
				return {
					type: 'setText',
					locator: `boundary:${asyncBoundary!.id}`,
					value: snapshot.status,
				};
			};
		},
	});

	await resume.start();

	expect(loadedSymbols).toEqual(['symbol:details-runner']);
	expect(seenStatuses).toEqual(['boundary:0:pending']);
	expect(graph.read('computed:details')).toEqual({
		status: 'pending',
		version: 1,
		key: 'a',
	});
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'boundary:boundary:0', value: 'pending' },
	]);

	result.resolve('Alice');
	await drainMicrotasks();
	await graph.flush();

	expect(loadedSymbols).toEqual(['symbol:details-runner', 'symbol:details-runner']);
	expect(seenStatuses).toEqual(['boundary:0:pending', 'boundary:0:fulfilled']);
	expect(graph.read('computed:details')).toEqual({
		status: 'fulfilled',
		version: 1,
		key: 'a',
		value: 'Alice',
	});
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'boundary:boundary:0', value: 'fulfilled' },
	]);
});

function deferred<T>(): {
	readonly promise: Promise<T>;
	readonly resolve: (value: T) => void;
	readonly reject: (error: unknown) => void;
} {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});

	return { promise, resolve, reject };
}

async function drainMicrotasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}
