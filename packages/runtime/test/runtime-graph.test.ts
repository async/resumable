import { expect, test } from 'vitest';
import { createRuntimeGraph } from '../src/index.ts';

test('runtime graph invalidates path subscribers and flushes concrete journal entries', async () => {
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:count', value: 0 },
			{ graphNodeId: 'state:menu', value: { open: true, title: 'Menu' } },
		],
	});

	expect(graph.read('state:count')).toBe(0);
	expect(graph.read('state:menu', ['title'])).toBe('Menu');

	graph.subscribe({
		id: 'dom-update:title',
		graphNodeId: 'state:menu',
		path: ['title'],
		run(value) {
			return { type: 'setText', locator: 'text:title', value };
		},
	});

	graph.write({
		graphNodeId: 'state:menu',
		path: ['open'],
		value: false,
	});
	await graph.flush();
	expect(graph.takeJournal()).toEqual([]);

	graph.write({
		graphNodeId: 'state:menu',
		path: ['title'],
		value: 'File',
	});
	await graph.flush();
	expect(graph.read('state:menu', ['title'])).toBe('File');
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:title', value: 'File' },
	]);

	graph.update({
		graphNodeId: 'state:count',
		path: [],
		update: (value) => Number(value) + 1,
	});
	await graph.flush();
	expect(graph.read('state:count')).toBe(1);
	expect(graph.takeJournal()).toEqual([]);
});

test('runtime graph appends multiple DOM journal entries from one subscription in order', async () => {
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:count', value: 0 }],
	});

	graph.subscribe({
		id: 'dom-update:count',
		graphNodeId: 'state:count',
		path: [],
		run(value) {
			return [
				{ type: 'setText', locator: 'text:count', value },
				{
					type: 'setAttr',
					locator: 'button:count',
					name: 'data-count',
					value: String(value),
				},
				{
					type: 'setProp',
					locator: 'button:count',
					name: 'disabled',
					value: Number(value) > 0,
				},
			];
		},
	});

	graph.write({ graphNodeId: 'state:count', value: 1 });
	await graph.flush();

	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:count', value: 1 },
		{
			type: 'setAttr',
			locator: 'button:count',
			name: 'data-count',
			value: '1',
		},
		{
			type: 'setProp',
			locator: 'button:count',
			name: 'disabled',
			value: true,
		},
	]);
});

test('runtime graph applies collection method calls with path invalidation', async () => {
	const cache = new Map<string, string>();
	const selected = new Set<string>();
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:collections',
				value: {
					items: ['first'],
					cache,
					selected,
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:items',
		graphNodeId: 'state:collections',
		path: ['items'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:items',
				value: (value as string[]).join(','),
			};
		},
	});
	graph.subscribe({
		id: 'dom-update:cache',
		graphNodeId: 'state:collections',
		path: ['cache'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:cache',
				value: (value as Map<string, string>).get('next'),
			};
		},
	});
	graph.subscribe({
		id: 'dom-update:selected',
		graphNodeId: 'state:collections',
		path: ['selected'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:selected',
				value: (value as Set<string>).has('item'),
			};
		},
	});

	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['items'],
			method: 'push',
			args: ['second'],
		}),
	).toBe(2);
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['cache'],
			method: 'set',
			args: ['next', 'value'],
		}),
	).toBe(cache);
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['selected'],
			method: 'add',
			args: ['item'],
		}),
	).toBe(selected);

	await graph.flush();

	expect(graph.read('state:collections', ['items'])).toEqual(['first', 'second']);
	expect(graph.read('state:collections', ['cache'])).toBe(cache);
	expect(cache.get('next')).toBe('value');
	expect(graph.read('state:collections', ['selected'])).toBe(selected);
	expect(selected.has('item')).toBe(true);
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:items', value: 'first,second' },
		{ type: 'setText', locator: 'text:cache', value: 'value' },
		{ type: 'setText', locator: 'text:selected', value: true },
	]);
});

test('runtime graph preserves collection delete return values and skips no-op invalidation', async () => {
	const cache = new Map<string, string>([['next', 'value']]);
	const selected = new Set<string>(['item']);
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:collections',
				value: {
					cache,
					selected,
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:cache',
		graphNodeId: 'state:collections',
		path: ['cache'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:cache',
				value: (value as Map<string, string>).has('next'),
			};
		},
	});
	graph.subscribe({
		id: 'dom-update:selected',
		graphNodeId: 'state:collections',
		path: ['selected'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:selected',
				value: (value as Set<string>).has('item'),
			};
		},
	});

	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['cache'],
			method: 'delete',
			args: ['next'],
		}),
	).toBe(true);
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['selected'],
			method: 'delete',
			args: ['missing'],
		}),
	).toBe(false);

	await graph.flush();

	expect(cache.has('next')).toBe(false);
	expect(selected.has('item')).toBe(true);
	expect(graph.takeJournal()).toEqual([{ type: 'setText', locator: 'text:cache', value: false }]);
});

test('runtime graph skips collection clear invalidation when the collection is already empty', async () => {
	const emptyCache = new Map<string, string>();
	const selected = new Set<string>(['item']);
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:collections',
				value: {
					emptyCache,
					selected,
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:empty-cache',
		graphNodeId: 'state:collections',
		path: ['emptyCache'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:empty-cache',
				value: (value as Map<string, string>).size,
			};
		},
	});
	graph.subscribe({
		id: 'dom-update:selected',
		graphNodeId: 'state:collections',
		path: ['selected'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:selected',
				value: (value as Set<string>).size,
			};
		},
	});

	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['emptyCache'],
			method: 'clear',
		}),
	).toBeUndefined();
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['selected'],
			method: 'clear',
		}),
	).toBeUndefined();

	await graph.flush();

	expect(emptyCache.size).toBe(0);
	expect(selected.size).toBe(0);
	expect(graph.takeJournal()).toEqual([{ type: 'setText', locator: 'text:selected', value: 0 }]);
});

test('runtime graph skips Set.add invalidation when the value already exists', async () => {
	const selected = new Set<string>(['item']);
	const pending = new Set<string>();
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:collections',
				value: {
					selected,
					pending,
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:selected',
		graphNodeId: 'state:collections',
		path: ['selected'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:selected',
				value: (value as Set<string>).size,
			};
		},
	});
	graph.subscribe({
		id: 'dom-update:pending',
		graphNodeId: 'state:collections',
		path: ['pending'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:pending',
				value: (value as Set<string>).size,
			};
		},
	});

	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['selected'],
			method: 'add',
			args: ['item'],
		}),
	).toBe(selected);
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['pending'],
			method: 'add',
			args: ['item'],
		}),
	).toBe(pending);

	await graph.flush();

	expect(selected.size).toBe(1);
	expect(pending.size).toBe(1);
	expect(graph.takeJournal()).toEqual([{ type: 'setText', locator: 'text:pending', value: 1 }]);
});

test('runtime graph skips Map.set invalidation when the key already has the same value', async () => {
	const cache = new Map<string, string>([['next', 'value']]);
	const pending = new Map<string, string>();
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:collections',
				value: {
					cache,
					pending,
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:cache',
		graphNodeId: 'state:collections',
		path: ['cache'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:cache',
				value: (value as Map<string, string>).get('next'),
			};
		},
	});
	graph.subscribe({
		id: 'dom-update:pending',
		graphNodeId: 'state:collections',
		path: ['pending'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:pending',
				value: (value as Map<string, string>).get('next'),
			};
		},
	});

	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['cache'],
			method: 'set',
			args: ['next', 'value'],
		}),
	).toBe(cache);
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['pending'],
			method: 'set',
			args: ['next', 'value'],
		}),
	).toBe(pending);

	await graph.flush();

	expect(cache.get('next')).toBe('value');
	expect(pending.get('next')).toBe('value');
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:pending', value: 'value' },
	]);
});

test('runtime graph skips Array.pop invalidation when the array is already empty', async () => {
	const emptyItems: string[] = [];
	const pending = ['item'];
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:collections',
				value: {
					emptyItems,
					pending,
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:empty-items',
		graphNodeId: 'state:collections',
		path: ['emptyItems'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:empty-items',
				value: (value as string[]).length,
			};
		},
	});
	graph.subscribe({
		id: 'dom-update:pending',
		graphNodeId: 'state:collections',
		path: ['pending'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:pending',
				value: (value as string[]).length,
			};
		},
	});

	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['emptyItems'],
			method: 'pop',
		}),
	).toBeUndefined();
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['pending'],
			method: 'pop',
		}),
	).toBe('item');

	await graph.flush();

	expect(emptyItems).toEqual([]);
	expect(pending).toEqual([]);
	expect(graph.takeJournal()).toEqual([{ type: 'setText', locator: 'text:pending', value: 0 }]);
});

test('runtime graph skips Array.shift invalidation when the array is already empty', async () => {
	const emptyItems: string[] = [];
	const pending = ['item'];
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:collections',
				value: {
					emptyItems,
					pending,
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:empty-items',
		graphNodeId: 'state:collections',
		path: ['emptyItems'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:empty-items',
				value: (value as string[]).length,
			};
		},
	});
	graph.subscribe({
		id: 'dom-update:pending',
		graphNodeId: 'state:collections',
		path: ['pending'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:pending',
				value: (value as string[]).length,
			};
		},
	});

	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['emptyItems'],
			method: 'shift',
		}),
	).toBeUndefined();
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['pending'],
			method: 'shift',
		}),
	).toBe('item');

	await graph.flush();

	expect(emptyItems).toEqual([]);
	expect(pending).toEqual([]);
	expect(graph.takeJournal()).toEqual([{ type: 'setText', locator: 'text:pending', value: 0 }]);
});

test('runtime graph skips Array.push and Array.unshift invalidation when no values are added', async () => {
	const appendItems = ['existing'];
	const prependItems = ['existing'];
	const pending: string[] = [];
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:collections',
				value: {
					appendItems,
					prependItems,
					pending,
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:append-items',
		graphNodeId: 'state:collections',
		path: ['appendItems'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:append-items',
				value: (value as string[]).join(','),
			};
		},
	});
	graph.subscribe({
		id: 'dom-update:prepend-items',
		graphNodeId: 'state:collections',
		path: ['prependItems'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:prepend-items',
				value: (value as string[]).join(','),
			};
		},
	});
	graph.subscribe({
		id: 'dom-update:pending',
		graphNodeId: 'state:collections',
		path: ['pending'],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:pending',
				value: (value as string[]).join(','),
			};
		},
	});

	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['appendItems'],
			method: 'push',
		}),
	).toBe(1);
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['prependItems'],
			method: 'unshift',
		}),
	).toBe(1);
	expect(
		graph.call({
			graphNodeId: 'state:collections',
			path: ['pending'],
			method: 'push',
			args: ['item'],
		}),
	).toBe(1);

	await graph.flush();

	expect(appendItems).toEqual(['existing']);
	expect(prependItems).toEqual(['existing']);
	expect(pending).toEqual(['item']);
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:pending', value: 'item' },
	]);
});

test('runtime graph rejects unsupported collection method calls without invalidation', async () => {
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:items',
				value: ['first'],
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:items',
		graphNodeId: 'state:items',
		path: [],
		run(value) {
			return {
				type: 'setText',
				locator: 'text:items',
				value: (value as string[]).join(','),
			};
		},
	});

	expect(() =>
		graph.call({
			graphNodeId: 'state:items',
			path: [],
			method: 'map',
			args: [(value: unknown) => value],
		}),
	).toThrow('Unsupported graph collection method "map".');

	await graph.flush();

	expect(graph.read('state:items')).toEqual(['first']);
	expect(graph.takeJournal()).toEqual([]);
});

test('runtime graph deletes object paths with path invalidation', async () => {
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:menu',
				value: { open: true, title: 'Menu' },
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:open',
		graphNodeId: 'state:menu',
		path: ['open'],
		run(value) {
			return { type: 'setText', locator: 'text:open', value };
		},
	});
	graph.subscribe({
		id: 'dom-update:title',
		graphNodeId: 'state:menu',
		path: ['title'],
		run(value) {
			return { type: 'setText', locator: 'text:title', value };
		},
	});

	expect(graph.delete({ graphNodeId: 'state:menu', path: ['open'] })).toBe(true);
	await graph.flush();

	expect(graph.read('state:menu', ['open'])).toBeUndefined();
	expect(graph.read('state:menu', ['title'])).toBe('Menu');
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:open', value: undefined },
	]);
});

test('runtime graph skips object delete invalidation when no property is removed', async () => {
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:menu',
				value: { open: true },
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:missing',
		graphNodeId: 'state:menu',
		path: ['missing'],
		run(value) {
			return { type: 'setText', locator: 'text:missing', value };
		},
	});

	expect(graph.delete({ graphNodeId: 'state:menu', path: ['missing'] })).toBe(true);
	await graph.flush();

	expect(graph.read('state:menu', ['missing'])).toBeUndefined();
	expect(graph.takeJournal()).toEqual([]);
});

test('runtime graph update can return previous or next graph values', async () => {
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:count', value: 1 }],
	});

	graph.subscribe({
		id: 'dom-update:count',
		graphNodeId: 'state:count',
		path: [],
		run(value) {
			return { type: 'setText', locator: 'text:count', value };
		},
	});

	expect(
		graph.update({
			graphNodeId: 'state:count',
			update: (value) => Number(value) + 1,
			returnValue: 'previous',
		}),
	).toBe(1);
	expect(graph.read('state:count')).toBe(2);

	expect(
		graph.update({
			graphNodeId: 'state:count',
			update: (value) => Number(value) + 1,
			returnValue: 'next',
		}),
	).toBe(3);
	expect(graph.read('state:count')).toBe(3);

	await graph.flush();

	expect(graph.takeJournal()).toEqual([{ type: 'setText', locator: 'text:count', value: 3 }]);
});

test('runtime graph schedules a microtask flush for writes in an idle turn', async () => {
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:count', value: 0 }],
	});

	graph.subscribe({
		id: 'dom-update:count',
		graphNodeId: 'state:count',
		path: [],
		run(value) {
			return { type: 'setText', locator: 'button:text', value };
		},
	});

	graph.write({ graphNodeId: 'state:count', value: 1 });
	graph.write({ graphNodeId: 'state:count', value: 2 });

	expect(graph.takeJournal()).toEqual([]);

	await drainMicrotasks();

	expect(graph.takeJournal()).toEqual([{ type: 'setText', locator: 'button:text', value: 2 }]);
});

test('runtime graph lazily recomputes sync computed nodes after path-granular invalidation', async () => {
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:menu', value: { open: true, title: 'Menu' } }],
		computed: [
			{
				graphNodeId: 'computed:menuTitle',
				dependencies: [{ graphNodeId: 'state:menu', path: ['title'] }],
				compute: (read) => `${String(read('state:menu', ['title']))}!`,
			},
		],
	});

	expect(graph.read('computed:menuTitle')).toBe('Menu!');

	graph.subscribe({
		id: 'dom-update:menuTitle',
		graphNodeId: 'computed:menuTitle',
		path: [],
		run(value) {
			return { type: 'setText', locator: 'text:menu-title', value };
		},
	});

	graph.write({ graphNodeId: 'state:menu', path: ['open'], value: false });
	await graph.flush();
	expect(graph.read('computed:menuTitle')).toBe('Menu!');
	expect(graph.takeJournal()).toEqual([]);

	graph.write({ graphNodeId: 'state:menu', path: ['title'], value: 'File' });
	expect(graph.read('computed:menuTitle')).toBe('File!');
	await graph.flush();

	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:menu-title', value: 'File!' },
	]);
});

test('runtime graph invalidates computed dependency chains', async () => {
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:user', value: { first: 'Ada', last: 'Lovelace' } }],
		computed: [
			{
				graphNodeId: 'computed:displayName',
				dependencies: [{ graphNodeId: 'state:user', path: ['first'] }],
				compute: (read) => String(read('state:user', ['first'])).toUpperCase(),
			},
			{
				graphNodeId: 'computed:greeting',
				dependencies: [{ graphNodeId: 'computed:displayName', path: [] }],
				compute: (read) => `Hello ${String(read('computed:displayName'))}`,
			},
		],
	});

	expect(graph.read('computed:greeting')).toBe('Hello ADA');

	graph.subscribe({
		id: 'dom-update:greeting',
		graphNodeId: 'computed:greeting',
		path: [],
		run(value) {
			return { type: 'setText', locator: 'text:greeting', value };
		},
	});

	graph.write({ graphNodeId: 'state:user', path: ['first'], value: 'Grace' });
	await graph.flush();

	expect(graph.read('computed:greeting')).toBe('Hello GRACE');
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:greeting', value: 'Hello GRACE' },
	]);
});

test('runtime graph versions async computed requests and ignores stale completions', async () => {
	const first = deferred<string>();
	const second = deferred<string>();
	const runs: Array<{ readonly key: unknown; readonly signal: AbortSignal }> = [];

	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:userId', value: 'a' }],
		asyncComputed: [
			{
				graphNodeId: 'computed:user',
				dependencies: [{ graphNodeId: 'state:userId', path: [] }],
				key: (read) => read('state:userId'),
				run({ key, signal }) {
					runs.push({ key, signal });
					return key === 'a' ? first.promise : second.promise;
				},
			},
		],
	});

	expect(graph.read('computed:user')).toEqual({
		status: 'pending',
		version: 1,
		key: 'a',
	});
	expect(runs).toHaveLength(1);

	graph.subscribe({
		id: 'dom-update:user',
		graphNodeId: 'computed:user',
		path: [],
		run(value) {
			const snapshot = value as { readonly status: string; readonly value?: unknown };
			return {
				type: 'setText',
				locator: 'text:user',
				value: snapshot.status === 'fulfilled' ? snapshot.value : snapshot.status,
			};
		},
	});

	graph.write({ graphNodeId: 'state:userId', value: 'b' });
	await graph.flush();

	expect(runs[0].signal.aborted).toBe(true);
	expect(runs).toHaveLength(2);
	expect(graph.read('computed:user')).toEqual({
		status: 'pending',
		version: 2,
		key: 'b',
	});
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:user', value: 'pending' },
	]);

	first.resolve('Alice');
	await drainMicrotasks();
	await graph.flush();

	expect(graph.read('computed:user')).toEqual({
		status: 'pending',
		version: 2,
		key: 'b',
	});
	expect(graph.takeJournal()).toEqual([]);

	second.resolve('Bob');
	await drainMicrotasks();
	await graph.flush();

	expect(graph.read('computed:user')).toEqual({
		status: 'fulfilled',
		version: 2,
		key: 'b',
		value: 'Bob',
	});
	expect(graph.takeJournal()).toEqual([{ type: 'setText', locator: 'text:user', value: 'Bob' }]);
});

test('runtime graph ignores stale rejected async computed completions', async () => {
	const first = deferred<string>();
	const second = deferred<string>();
	const staleError = new Error('stale');
	const runs: Array<{ readonly key: unknown; readonly signal: AbortSignal }> = [];

	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:userId', value: 'a' }],
		asyncComputed: [
			{
				graphNodeId: 'computed:user',
				dependencies: [{ graphNodeId: 'state:userId', path: [] }],
				key: (read) => read('state:userId'),
				run({ key, signal }) {
					runs.push({ key, signal });
					return key === 'a' ? first.promise : second.promise;
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:user',
		graphNodeId: 'computed:user',
		path: [],
		run(value) {
			const snapshot = value as { readonly status: string; readonly value?: unknown };
			return {
				type: 'setText',
				locator: 'text:user',
				value: snapshot.status === 'fulfilled' ? snapshot.value : snapshot.status,
			};
		},
	});

	expect(graph.read('computed:user')).toEqual({
		status: 'pending',
		version: 1,
		key: 'a',
	});
	await drainMicrotasks();
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:user', value: 'pending' },
	]);

	graph.write({ graphNodeId: 'state:userId', value: 'b' });
	await graph.flush();

	expect(runs[0].signal.aborted).toBe(true);
	expect(runs).toHaveLength(2);
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:user', value: 'pending' },
	]);

	first.reject(staleError);
	await drainMicrotasks();
	await graph.flush();

	expect(graph.read('computed:user')).toEqual({
		status: 'pending',
		version: 2,
		key: 'b',
	});
	expect(graph.takeJournal()).toEqual([]);

	second.resolve('Bob');
	await drainMicrotasks();

	expect(graph.read('computed:user')).toEqual({
		status: 'fulfilled',
		version: 2,
		key: 'b',
		value: 'Bob',
	});
	expect(graph.takeJournal()).toEqual([{ type: 'setText', locator: 'text:user', value: 'Bob' }]);
});

test('runtime graph skips async computed invalidation when the dependency key is unchanged', async () => {
	const request = deferred<string>();
	const runs: Array<{ readonly key: unknown; readonly signal: AbortSignal }> = [];
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:route', value: { id: 'a', tab: 'overview' } }],
		asyncComputed: [
			{
				graphNodeId: 'computed:user',
				dependencies: [{ graphNodeId: 'state:route', path: [] }],
				key: (read) => read('state:route', ['id']),
				run({ key, signal }) {
					runs.push({ key, signal });
					return request.promise;
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:user',
		graphNodeId: 'computed:user',
		path: [],
		run(value) {
			const snapshot = value as { readonly status: string };
			return { type: 'setText', locator: 'text:user', value: snapshot.status };
		},
	});

	expect(graph.read('computed:user')).toEqual({
		status: 'pending',
		version: 1,
		key: 'a',
	});
	await drainMicrotasks();
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:user', value: 'pending' },
	]);

	graph.write({ graphNodeId: 'state:route', path: ['tab'], value: 'details' });
	await graph.flush();

	expect(runs).toHaveLength(1);
	expect(runs[0].signal.aborted).toBe(false);
	expect(graph.read('computed:user')).toEqual({
		status: 'pending',
		version: 1,
		key: 'a',
	});
	expect(graph.takeJournal()).toEqual([]);
});

test('runtime graph schedules pending flush after standalone async computed demand', async () => {
	const request = deferred<string>();
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:userId', value: 'a' }],
		asyncComputed: [
			{
				graphNodeId: 'computed:user',
				dependencies: [{ graphNodeId: 'state:userId', path: [] }],
				key: (read) => read('state:userId'),
				run() {
					return request.promise;
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:user',
		graphNodeId: 'computed:user',
		path: [],
		run(value) {
			const snapshot = value as { readonly status: string; readonly value?: unknown };
			return {
				type: 'setText',
				locator: 'text:user',
				value: snapshot.status === 'fulfilled' ? snapshot.value : snapshot.status,
			};
		},
	});

	expect(graph.read('computed:user')).toEqual({
		status: 'pending',
		version: 1,
		key: 'a',
	});

	await drainMicrotasks();

	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:user', value: 'pending' },
	]);

	request.resolve('Alice');
	await drainMicrotasks();

	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:user', value: 'Alice' },
	]);
});

test('runtime graph commits rejected async computed snapshots by request version', async () => {
	const request = deferred<string>();
	const failure = new Error('No user');
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:userId', value: 'missing' }],
		asyncComputed: [
			{
				graphNodeId: 'computed:user',
				dependencies: [{ graphNodeId: 'state:userId', path: [] }],
				key: (read) => read('state:userId'),
				run() {
					return request.promise;
				},
			},
		],
	});

	graph.subscribe({
		id: 'dom-update:user',
		graphNodeId: 'computed:user',
		path: [],
		run(value) {
			const snapshot = value as { readonly status: string };
			return { type: 'setText', locator: 'text:user', value: snapshot.status };
		},
	});

	expect(graph.read('computed:user')).toEqual({
		status: 'pending',
		version: 1,
		key: 'missing',
	});

	await drainMicrotasks();

	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:user', value: 'pending' },
	]);

	request.reject(failure);
	await drainMicrotasks();

	expect(graph.read('computed:user')).toEqual({
		status: 'rejected',
		version: 1,
		key: 'missing',
		error: failure,
	});
	expect(graph.takeJournal()).toEqual([
		{ type: 'setText', locator: 'text:user', value: 'rejected' },
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
