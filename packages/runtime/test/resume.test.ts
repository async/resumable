import { expect, test } from 'vitest';
import { createResumeRuntime, createRuntimeGraph, RuntimeResumeError } from '../src/index.ts';
import type { RuntimeGraph, RuntimeGraphWrite } from '../src/index.ts';

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

async function settleMicrotasks(count = 4): Promise<void> {
	for (let index = 0; index < count; index++) {
		await Promise.resolve();
	}
}

test('resume runtime materializes view records and dispatches lazy symbols after sync policy', async () => {
	const input = element('INPUT');
	const root = element('SECTION', [input]);
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:menu', value: { open: true, title: 'Menu' } }],
	});
	const loadedSymbols: string[] = [];

	graph.subscribe({
		id: 'dom-update:open',
		graphNodeId: 'state:menu',
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
								{ type: 'graph-truthy', graphNodeId: 'state:menu', path: ['open'] },
								{ type: 'event-equals', field: 'key', value: 'Escape' },
							],
						},
						actions: ['preventDefault', 'stopPropagation'],
					},
					symbolIds: ['symbol:key'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return async ({ graph: runtimeGraph }) => {
				runtimeGraph.write({
					graphNodeId: 'state:menu',
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

test('resume runtime startup installs container wiring without importing app symbols', async () => {
	const button = element('BUTTON');
	const image = element('IMG');
	const canvas = element('CANVAS');
	const start = comment('async:boundary:0:start');
	const paragraph = element('P');
	const end = comment('async:boundary:0:end');
	const root = element('SECTION', [button, image, canvas, start, paragraph, end]);
	const loadedSymbols: string[] = [];
	const observed: FakeElement[] = [];
	const result = deferred<string>();
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:userId', value: 'a' }],
		asyncComputed: [
			{
				graphNodeId: 'computed:details',
				dependencies: [{ graphNodeId: 'state:userId', path: [] }],
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
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
				{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'img' },
				{ hostNodeId: 'h3', strategy: 'dom-order', index: 3, tagName: 'canvas' },
				{ hostNodeId: 'h4', strategy: 'dom-order', index: 4, tagName: 'p' },
			],
			events: [
				{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:click'] },
				{ hostNodeId: 'h2', eventName: 'visible', symbolIds: ['symbol:visible'] },
			],
			domUpdates: [],
			behaviors: [{ hostNodeId: 'h3', source: 'chart(config)', symbolId: 'symbol:chart' }],
			elementHandles: [],
			asyncBoundaries: [
				{
					id: 'boundary:0',
					startAnchor: { strategy: 'dom-order-comment', index: 0 },
					endAnchor: { strategy: 'dom-order-comment', index: 1 },
					asyncReads: [
						{
							source: 'details.title',
							graphNodeId: 'computed:details',
							path: [],
							runnerSymbolId: 'symbol:details-runner',
						},
					],
				},
			],
		},
		createVisibilityObserver() {
			return {
				observe(target) {
					observed.push(target);
				},
			};
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return () => undefined;
		},
	});

	await resume.start();

	expect(root.listeners).toEqual([
		expect.objectContaining({
			type: 'click',
			options: { capture: true },
		}),
	]);
	expect(observed).toEqual([image]);
	expect(loadedSymbols).toEqual([]);
	expect(graph.read('computed:details')).toEqual({
		status: 'pending',
		version: 1,
		key: 'a',
	});
	await graph.flush();
	expect(loadedSymbols).toEqual(['symbol:details-runner']);
});

test('resume runtime applies DOM journal entries after dispatch-owned graph flushes', async () => {
	const input = element('INPUT');
	const root = element('SECTION', [input]);
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:menu', value: { open: true } }],
	});
	const appliedEntries: unknown[] = [];

	graph.subscribe({
		id: 'dom-update:open',
		graphNodeId: 'state:menu',
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
					eventName: 'click',
					symbolIds: ['symbol:toggle'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol() {
			return ({ graph: runtimeGraph }) => {
				runtimeGraph.write({
					graphNodeId: 'state:menu',
					path: ['open'],
					value: false,
				});
			};
		},
		applyDomJournal(entries) {
			appliedEntries.push(...entries);
		},
	});

	await resume.start();
	await root.listeners[0].listener(event('click', input, ''));

	expect(appliedEntries).toEqual([
		{ type: 'setAttr', locator: 'input:open', name: 'data-open', value: false },
	]);
	expect(graph.takeJournal()).toEqual([]);
});

test('resume runtime evaluates constant sync policy guards before lazy symbols', async () => {
	const input = element('INPUT');
	const root = element('SECTION', [input]);
	const loadedSymbols: string[] = [];
	const resume = createResumeRuntime({
		root,
		graph: createRuntimeGraph({ cells: [] }),
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
								{ type: 'constant-truthy', value: true },
								{ type: 'event-equals', field: 'key', value: 'Escape' },
							],
						},
						actions: ['preventDefault'],
					},
					symbolIds: ['symbol:key'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return () => undefined;
		},
	});

	await resume.start();

	const keydown = event('keydown', input, 'Escape');
	await root.listeners[0].listener(keydown);

	expect(keydown.defaultPrevented).toBe(true);
	expect(loadedSymbols).toEqual(['symbol:key']);
});

test('resume runtime evaluates sync policy branches independently before lazy symbols', async () => {
	const input = element('INPUT');
	const root = element('SECTION', [input]);
	const loadedSymbols: string[] = [];
	const resume = createResumeRuntime({
		root,
		graph: createRuntimeGraph({
			cells: [{ graphNodeId: 'state:menu', value: { open: true, locked: true } }],
		}),
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
						branches: [
							{
								when: {
									type: 'and',
									conditions: [
										{
											type: 'graph-truthy',
											graphNodeId: 'state:menu',
											path: ['open'],
										},
										{ type: 'event-equals', field: 'key', value: 'Escape' },
									],
								},
								actions: ['preventDefault'],
							},
							{
								when: {
									type: 'and',
									conditions: [
										{
											type: 'graph-truthy',
											graphNodeId: 'state:menu',
											path: ['locked'],
										},
										{ type: 'event-equals', field: 'key', value: 'Enter' },
									],
								},
								actions: ['stopPropagation'],
							},
						],
					},
					symbolIds: ['symbol:first', 'symbol:second'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return () => undefined;
		},
	});

	await resume.start();

	const escape = event('keydown', input, 'Escape');
	await root.listeners[0].listener(escape);

	expect(escape.defaultPrevented).toBe(true);
	expect(escape.propagationStopped).toBe(false);

	const enter = event('keydown', input, 'Enter');
	await root.listeners[0].listener(enter);

	expect(enter.defaultPrevented).toBe(false);
	expect(enter.propagationStopped).toBe(true);
	expect(loadedSymbols).toEqual([
		'symbol:first',
		'symbol:second',
		'symbol:first',
		'symbol:second',
	]);
});

test('resume runtime dispatches delegated events from nested targets to the owner element record', async () => {
	const label = element('SPAN');
	const button = element('BUTTON', [label]);
	const root = element('SECTION', [button]);
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:count', value: 0 }],
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
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol() {
			return ({ element: ownerElement, graph: runtimeGraph }) => {
				handledElements.push(ownerElement.tagName);
				runtimeGraph.update({
					graphNodeId: 'state:count',
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

test('resume runtime reports structured errors for mismatched DOM-order locators', () => {
	const input = element('INPUT');
	const root = element('SECTION', [input]);
	const error = captureThrown(() =>
		createResumeRuntime({
			root,
			graph: createRuntimeGraph({ cells: [] }),
			view: {
				locators: [
					{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
					{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
				],
				events: [],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				asyncBoundaries: [],
			},
			loadSymbol() {
				return () => undefined;
			},
		}),
	);

	expect(error).toBeInstanceOf(RuntimeResumeError);
	expect(error).toMatchObject({
		code: 'AA_RESUME_LOCATOR_MISMATCH',
		severity: 'error',
		phase: 'resume',
		title: 'Resume locator matched a different element',
		hostNodeId: 'h1',
		elementLocator: 'dom-order:1',
		expectedTagName: 'button',
		actualTagName: 'input',
		docsUrl: 'https://async.await.dev/errors/AA_RESUME_LOCATOR_MISMATCH',
	});
	expect(error).toMatchObject({
		message: 'Resume locator h1 expected <button> at DOM order index 1 but found <input>.',
		why: expect.stringContaining('async/view'),
	});
});

test('resume runtime reports structured errors for missing async boundary anchors', () => {
	const start = comment('async:boundary:0:start');
	const root = element('SECTION', [start]);
	const error = captureThrown(() =>
		createResumeRuntime({
			root,
			graph: createRuntimeGraph({ cells: [] }),
			view: {
				locators: [
					{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				],
				events: [],
				domUpdates: [],
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
						asyncReads: [],
					},
				],
			},
			loadSymbol() {
				return () => undefined;
			},
		}),
	);

	expect(error).toBeInstanceOf(RuntimeResumeError);
	expect(error).toMatchObject({
		code: 'AA_RESUME_LOCATOR_MISSING',
		severity: 'error',
		phase: 'resume',
		title: 'Resume locator did not match the document',
		boundaryId: 'boundary:0',
		elementLocator: 'dom-order-comment:1',
		docsUrl: 'https://async.await.dev/errors/AA_RESUME_LOCATOR_MISSING',
	});
	expect(error).toMatchObject({
		message: 'Resume locator boundary:0 endAnchor expected a comment at DOM order index 1.',
		why: expect.stringContaining('comment anchor'),
	});
});

test('resume runtime invalidates disposed host locators and delegated event records', async () => {
	const button = element('BUTTON');
	const root = element('SECTION', [button]);
	const loadedSymbols: string[] = [];
	const resume = createResumeRuntime({
		root,
		graph: createRuntimeGraph({ cells: [] }),
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
			],
			events: [
				{
					hostNodeId: 'h1',
					eventName: 'click',
					symbolIds: ['symbol:click'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return () => undefined;
		},
	});

	await resume.start();

	expect(resume.getElement('h1')).toBe(button);

	resume.disposeHost('h1');

	expect(resume.getElement('h1')).toBeUndefined();

	await root.listeners[0].listener(event('click', button, ''));

	expect(loadedSymbols).toEqual([]);
});

test('resume runtime exposes element handles to lazy symbols by handle id and local name', async () => {
	const input = element('INPUT');
	const button = element('BUTTON');
	const root = element('SECTION', [input, button]);
	const resolvedHandles: unknown[] = [];
	const resume = createResumeRuntime({
		root,
		graph: createRuntimeGraph({ cells: [] }),
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'input' },
				{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'button' },
			],
			events: [
				{
					hostNodeId: 'h2',
					eventName: 'click',
					symbolIds: ['symbol:focus'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [
				{ hostNodeId: 'h1', handleId: 'handle:search', name: 'searchInput' },
				{ hostNodeId: 'missing-host', handleId: 'handle:missing', name: 'missingInput' },
			],
			asyncBoundaries: [],
		},
		loadSymbol() {
			return (context) => {
				resolvedHandles.push(context.getElementHandle('handle:search')?.tagName);
				resolvedHandles.push(context.getElementHandle('searchInput')?.tagName);
				resolvedHandles.push(context.getElementHandle('handle:missing'));
				resolvedHandles.push(context.getElementHandle('missingInput'));
			};
		},
	});

	await resume.start();
	await root.listeners[0].listener(event('click', button, ''));

	expect(resolvedHandles).toEqual(['INPUT', 'INPUT', undefined, undefined]);
});

test('resume runtime returns undefined for element handles after host disposal', async () => {
	const input = element('INPUT');
	const button = element('BUTTON');
	const root = element('SECTION', [input, button]);
	const resolvedHandles: unknown[] = [];
	const resume = createResumeRuntime({
		root,
		graph: createRuntimeGraph({ cells: [] }),
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'input' },
				{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'button' },
			],
			events: [
				{
					hostNodeId: 'h2',
					eventName: 'click',
					symbolIds: ['symbol:focus'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [{ hostNodeId: 'h1', handleId: 'handle:search', name: 'searchInput' }],
			asyncBoundaries: [],
		},
		loadSymbol() {
			return (context) => {
				resolvedHandles.push(context.getElementHandle('handle:search'));
				resolvedHandles.push(context.getElementHandle('searchInput'));
			};
		},
	});

	await resume.start();
	resume.disposeHost('h1');
	await root.listeners[0].listener(event('click', button, ''));

	expect(resolvedHandles).toEqual([undefined, undefined]);
});

test('resume runtime wires onVisible through a shared observer and runs cleanup once', async () => {
	const image = element('IMG');
	const root = element('SECTION', [image]);
	const observed: FakeElement[] = [];
	const unobserved: FakeElement[] = [];
	const loadedSymbols: string[] = [];
	const cleanups: string[] = [];
	let visibilityCallback:
		| ((
				entries: ReadonlyArray<{
					readonly target: FakeElement;
					readonly isIntersecting: boolean;
				}>,
		  ) => void)
		| undefined;
	const resume = createResumeRuntime({
		root,
		graph: createRuntimeGraph({ cells: [] }),
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'img' },
			],
			events: [
				{
					hostNodeId: 'h1',
					eventName: 'visible',
					symbolIds: ['symbol:first', 'symbol:second'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		createVisibilityObserver(callback) {
			visibilityCallback = callback;
			return {
				observe(target) {
					observed.push(target);
				},
				unobserve(target) {
					unobserved.push(target);
				},
			};
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return () => () => cleanups.push(symbolId);
		},
	});

	await resume.start();

	expect(root.listeners).toEqual([]);
	expect(observed).toEqual([image]);

	visibilityCallback?.([{ target: image, isIntersecting: false }]);
	expect(loadedSymbols).toEqual([]);

	visibilityCallback?.([{ target: image, isIntersecting: true }]);
	await settleMicrotasks();
	expect(loadedSymbols).toEqual(['symbol:first', 'symbol:second']);
	expect(unobserved).toEqual([image]);

	visibilityCallback?.([{ target: image, isIntersecting: true }]);
	await settleMicrotasks();
	expect(loadedSymbols).toEqual(['symbol:first', 'symbol:second']);

	resume.disposeHost('h1');

	expect(cleanups).toEqual(['symbol:second', 'symbol:first']);
});

test('resume runtime uses a global IntersectionObserver for visible events when no observer factory is injected', async () => {
	const image = element('IMG');
	const root = element('SECTION', [image]);
	const observed: FakeElement[] = [];
	const unobserved: FakeElement[] = [];
	const loadedSymbols: string[] = [];
	const globalScope = globalThis as {
		IntersectionObserver?: new (
			callback: (
				entries: ReadonlyArray<{
					readonly target: FakeElement;
					readonly isIntersecting?: boolean;
					readonly intersectionRatio?: number;
				}>,
			) => void,
		) => {
			observe(element: FakeElement): void;
			unobserve(element: FakeElement): void;
			disconnect(): void;
		};
	};
	const previousObserver = globalScope.IntersectionObserver;
	let visibilityCallback:
		| ((
				entries: ReadonlyArray<{
					readonly target: FakeElement;
					readonly isIntersecting?: boolean;
					readonly intersectionRatio?: number;
				}>,
		  ) => void)
		| undefined;

	globalScope.IntersectionObserver = class {
		constructor(
			callback: (
				entries: ReadonlyArray<{
					readonly target: FakeElement;
					readonly isIntersecting?: boolean;
					readonly intersectionRatio?: number;
				}>,
			) => void,
		) {
			visibilityCallback = callback;
		}

		observe(element: FakeElement): void {
			observed.push(element);
		}

		unobserve(element: FakeElement): void {
			unobserved.push(element);
		}

		disconnect(): void {}
	};

	try {
		const resume = createResumeRuntime({
			root,
			graph: createRuntimeGraph({ cells: [] }),
			view: {
				locators: [
					{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
					{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'img' },
				],
				events: [
					{
						hostNodeId: 'h1',
						eventName: 'visible',
						symbolIds: ['symbol:visible'],
					},
				],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				asyncBoundaries: [],
			},
			loadSymbol(symbolId) {
				loadedSymbols.push(symbolId);
				return () => undefined;
			},
		});

		await resume.start();

		expect(observed).toEqual([image]);
		expect(visibilityCallback).toBeDefined();

		visibilityCallback?.([{ target: image, isIntersecting: true }]);
		await settleMicrotasks();

		expect(unobserved).toEqual([image]);
		expect(loadedSymbols).toEqual(['symbol:visible']);
	} finally {
		globalScope.IntersectionObserver = previousObserver;
	}
});

test('resume runtime unobserves visible hosts disposed before first intersection', async () => {
	const image = element('IMG');
	const root = element('SECTION', [image]);
	const observed: FakeElement[] = [];
	const unobserved: FakeElement[] = [];
	const loadedSymbols: string[] = [];
	let visibilityCallback:
		| ((
				entries: ReadonlyArray<{
					readonly target: FakeElement;
					readonly isIntersecting: boolean;
				}>,
		  ) => void)
		| undefined;
	const resume = createResumeRuntime({
		root,
		graph: createRuntimeGraph({ cells: [] }),
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'img' },
			],
			events: [
				{
					hostNodeId: 'h1',
					eventName: 'visible',
					symbolIds: ['symbol:visible'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		createVisibilityObserver(callback) {
			visibilityCallback = callback;
			return {
				observe(target) {
					observed.push(target);
				},
				unobserve(target) {
					unobserved.push(target);
				},
			};
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return () => undefined;
		},
	});

	await resume.start();

	expect(observed).toEqual([image]);

	resume.disposeHost('h1');

	expect(unobserved).toEqual([image]);

	visibilityCallback?.([{ target: image, isIntersecting: true }]);
	await settleMicrotasks();

	expect(loadedSymbols).toEqual([]);
});

test('resume runtime dispatches handler arrays in order and flushes committed writes on error', async () => {
	const button = element('BUTTON');
	const root = element('SECTION', [button]);
	const writes: RuntimeGraphWrite[] = [];
	const flushedWrites: RuntimeGraphWrite[][] = [];
	const loadedSymbols: string[] = [];
	const ignoredReturns: unknown[] = [];
	const failure = new Error('second handler failed');
	const graph: RuntimeGraph = {
		read() {
			return undefined;
		},
		write(write) {
			writes.push(write);
		},
		update() {
			return undefined;
		},
		call() {
			return undefined;
		},
		delete() {
			return true;
		},
		subscribe() {},
		async flush() {
			flushedWrites.push([...writes]);
		},
		takeJournal() {
			return [];
		},
	};

	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
			],
			events: [
				{
					hostNodeId: 'h1',
					eventName: 'click',
					symbolIds: ['symbol:first', 'symbol:second', 'symbol:third'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);

			if (symbolId === 'symbol:first') {
				return ({ graph: runtimeGraph }) => {
					runtimeGraph.write({
						graphNodeId: 'state:count',
						value: 1,
					});
					const ignored = { type: 'setText', locator: 'ignored', value: 'ignored' };
					ignoredReturns.push(ignored);
					return ignored;
				};
			}

			if (symbolId === 'symbol:second') {
				return async () => {
					throw failure;
				};
			}

			return ({ graph: runtimeGraph }) => {
				runtimeGraph.write({
					graphNodeId: 'state:count',
					value: 3,
				});
			};
		},
	});

	await resume.start();
	flushedWrites.splice(0);

	await expect(root.listeners[0].listener(event('click', button, ''))).rejects.toBe(failure);

	expect(loadedSymbols).toEqual(['symbol:first', 'symbol:second']);
	expect(writes).toEqual([{ graphNodeId: 'state:count', value: 1 }]);
	expect(flushedWrites).toEqual([[{ graphNodeId: 'state:count', value: 1 }]]);
	expect(ignoredReturns).toHaveLength(1);
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
			domUpdates: [],
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
							graphNodeId: 'computed:details',
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
				graphNodeId: 'computed:details',
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
		cells: [{ graphNodeId: 'state:userId', value: 'a' }],
		asyncComputed: [
			{
				graphNodeId: 'computed:details',
				dependencies: [{ graphNodeId: 'state:userId', path: [] }],
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
			domUpdates: [],
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
							graphNodeId: 'computed:details',
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
				const snapshot = runtimeGraph.read(asyncRead!.graphNodeId) as {
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

	expect(loadedSymbols).toEqual([]);
	expect(seenStatuses).toEqual([]);

	graph.read('computed:details');
	await graph.flush();

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

function captureThrown(run: () => unknown): unknown {
	try {
		run();
	} catch (error) {
		return error;
	}

	throw new Error('Expected callback to throw.');
}
