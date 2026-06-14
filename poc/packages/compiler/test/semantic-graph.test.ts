import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../src/index.ts';

function includes(values: ReadonlyArray<string>, expected: string, label: string): void {
	expect(values, `${label} should include ${expected}`).toContain(expected);
}

function hasWrite(
	writes: ReadonlyArray<{ target: string; operation: string; method?: string }>,
	expected: { target: string; operation: string; method?: string },
	label: string,
): void {
	expect(
		writes.some(
			(write) =>
				write.target === expected.target &&
				write.operation === expected.operation &&
				write.method === expected.method,
		),
		`${label} should include ${expected.operation} ${expected.target}${
			expected.method ? `.${expected.method}` : ''
		}`,
	).toBe(true);
}

test('resume-basic semantic graph exposes pass-boundary facts', async () => {
	const fixturePath = 'fixtures/proofs/resume-basic/src/App.tsrx';
	const fixtureUrl = new URL(`../../../${fixturePath}`, import.meta.url);
	const source = await readFile(fixtureUrl, 'utf8');

	const graph = await buildSemanticGraph({
		filename: fixturePath,
		source,
	});

	expect(graph.passId, 'passId should identify the semantic graph pass').toBe(
		'tsrx-semantic-graph',
	);

	includes(
		graph.components.map((component) => component.name),
		'App',
		'components',
	);
	includes(
		graph.stateSites.map((site) => site.name),
		'count',
		'state sites',
	);
	includes(
		graph.stateSites.map((site) => site.name),
		'menu',
		'state sites',
	);
	includes(
		graph.computedSites.map((site) => site.name),
		'details',
		'computed sites',
	);
	expect(
		graph.computedSites.some((site) => site.name === 'details' && site.async),
		'details should be marked as an async computed site',
	).toBe(true);
	includes(
		graph.elementHandles.map((handle) => handle.name),
		'searchInput',
		'element handles',
	);
	includes(
		graph.eventProps.map((event) => event.eventName),
		'keydown',
		'event props',
	);
	expect(
		graph.eventProps.some((event) => event.eventName === 'keydown' && event.hasSyncPolicy),
		'keydown should expose a sync preventDefault policy',
	).toBe(true);
	expect(graph.behaviorProps, 'one use behavior should be discovered').toHaveLength(1);
	expect(graph.asyncBoundaries, 'one @try async boundary should be discovered').toHaveLength(1);
	includes(
		graph.stateWrites.map((write) => write.target),
		'count',
		'state writes',
	);
	includes(
		graph.stateWrites.map((write) => write.target),
		'menu.open',
		'state writes',
	);
	includes(
		graph.bindingReads.map((read) => read.source),
		'details.title',
		'binding reads',
	);
});

test('state-lvalues semantic graph exposes valid lvalue pass-boundary facts', async () => {
	const fixturePath = 'fixtures/proofs/state-lvalues/src/valid.tsrx';
	const fixtureUrl = new URL(`../../../${fixturePath}`, import.meta.url);
	const source = await readFile(fixtureUrl, 'utf8');

	const graph = await buildSemanticGraph({
		filename: fixturePath,
		source,
	});

	includes(
		graph.components.map((component) => component.name),
		'App',
		'components',
	);
	expect(graph.stateSites).toContainEqual({ name: 'count', kind: 'scalar' });
	expect(graph.stateSites).toContainEqual({ name: 'obj', kind: 'object' });
	expect(graph.computedSites).toContainEqual({ name: 'total', async: false });
	expect(graph.computedSites).toContainEqual({ name: 'currentTitle', async: false });
	includes(
		graph.eventProps.map((event) => event.eventName),
		'click',
		'event props',
	);
	includes(
		graph.eventProps.map((event) => event.eventName),
		'input',
		'event props',
	);
	includes(
		graph.eventProps.map((event) => event.eventName),
		'change',
		'event props',
	);

	hasWrite(graph.stateWrites, { target: 'count', operation: 'update' }, 'state writes');
	hasWrite(graph.stateWrites, { target: 'count', operation: 'assign' }, 'state writes');
	hasWrite(graph.stateWrites, { target: 'obj.x', operation: 'assign' }, 'state writes');
	hasWrite(graph.stateWrites, { target: 'obj.nested.title', operation: 'assign' }, 'state writes');
	hasWrite(
		graph.stateWrites,
		{ target: 'obj.nested.meta.saves', operation: 'update' },
		'state writes',
	);
	hasWrite(graph.stateWrites, { target: 'obj.tags.0', operation: 'assign' }, 'state writes');
	hasWrite(
		graph.stateWrites,
		{ target: 'obj.items', operation: 'call', method: 'push' },
		'state writes',
	);
	hasWrite(
		graph.stateWrites,
		{ target: 'obj.items', operation: 'call', method: 'splice' },
		'state writes',
	);
	hasWrite(
		graph.stateWrites,
		{ target: 'obj.items.index.done', operation: 'assign' },
		'state writes',
	);
	hasWrite(
		graph.stateWrites,
		{ target: 'obj.items.index.meta.edits', operation: 'update' },
		'state writes',
	);

	expect(graph.destructuredAliases).toContainEqual({
		name: 'nested',
		source: 'obj.nested',
		kind: 'state-path',
		writability: 'writable-path',
	});
});

test('state-lvalues semantic graph exposes invalid write diagnostic targets', async () => {
	const fixturePath = 'fixtures/proofs/state-lvalues/src/diagnostics.tsrx';
	const fixtureUrl = new URL(`../../../${fixturePath}`, import.meta.url);
	const source = await readFile(fixtureUrl, 'utf8');

	const graph = await buildSemanticGraph({
		filename: fixturePath,
		source,
	});

	expect(graph.computedSites).toContainEqual({ name: 'doubled', async: false });
	hasWrite(graph.stateWrites, { target: 'doubled', operation: 'assign' }, 'invalid writes');
	hasWrite(graph.stateWrites, { target: 'computedAlias', operation: 'update' }, 'invalid writes');
	hasWrite(graph.stateWrites, { target: 'props.count', operation: 'assign' }, 'invalid writes');
	hasWrite(graph.stateWrites, { target: 'propCount', operation: 'update' }, 'invalid writes');
	hasWrite(graph.stateWrites, { target: 'settings.x', operation: 'assign' }, 'invalid writes');
	hasWrite(
		graph.stateWrites,
		{ target: 'settings.nested.title', operation: 'assign' },
		'invalid writes',
	);
	hasWrite(graph.stateWrites, { target: 'items', operation: 'call', method: 'push' }, 'invalid writes');
	hasWrite(graph.stateWrites, { target: 'xAlias', operation: 'assign' }, 'invalid writes');
	hasWrite(graph.stateWrites, { target: 'dynamicAlias', operation: 'assign' }, 'invalid writes');
	hasWrite(graph.stateWrites, { target: 'firstItem', operation: 'assign' }, 'invalid writes');

	expect(graph.destructuredAliases).toEqual(
		expect.arrayContaining([
			{
				name: 'propCount',
				source: 'props.count',
				kind: 'props-path',
				writability: 'read-only',
			},
			{
				name: 'xAlias',
				source: 'obj.x',
				kind: 'state-path',
				writability: 'ambiguous-write',
			},
			{
				name: 'dynamicAlias',
				source: null,
				kind: 'state-path',
				writability: 'ambiguous-write',
			},
			{
				name: 'firstItem',
				source: 'obj.items.*',
				kind: 'state-path',
				writability: 'local-copy',
			},
		]),
	);
});

test('payload-locators semantic graph exposes locator ownership facts', async () => {
	const fixturePath = 'fixtures/proofs/payload-locators/src/App.tsrx';
	const fixtureUrl = new URL(`../../../${fixturePath}`, import.meta.url);
	const source = await readFile(fixtureUrl, 'utf8');

	const graph = await buildSemanticGraph({
		filename: fixturePath,
		source,
	});
	const locatorGraph = graph as typeof graph & {
		readonly elementHandleBindings: ReadonlyArray<{
			readonly handleName: string;
			readonly hostNodeId: string;
		}>;
		readonly textBindings: ReadonlyArray<{ readonly source: string; readonly hostNodeId: string }>;
		readonly branchAnchors: ReadonlyArray<{
			readonly condition: string;
			readonly firstHostNodeId: string | null;
		}>;
		readonly keyedLoops: ReadonlyArray<{
			readonly iterable: string;
			readonly itemName: string;
			readonly indexName: string | null;
			readonly key: string | null;
			readonly firstHostNodeId: string | null;
		}>;
		readonly emptyFallbacks: ReadonlyArray<{ readonly firstHostNodeId: string | null }>;
	};

	expect(graph.hostNodes.map((node) => node.tagName)).toEqual([
		'main',
		'header',
		'h1',
		'p',
		'label',
		'input',
		'button',
		'section',
		'h2',
		'p',
		'section',
		'h2',
		'p',
		'p',
		'button',
		'ol',
		'li',
		'article',
		'h3',
		'p',
		'button',
		'li',
		'p',
		'footer',
		'button',
		'output',
	]);
	expect(locatorGraph.elementHandleBindings).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ handleName: 'filterInput', hostNodeId: 'h5' }),
			expect.objectContaining({ handleName: 'detailsPanel', hostNodeId: 'h10' }),
		]),
	);
	expect(locatorGraph.textBindings).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ source: 'summary', hostNodeId: 'h2' }),
			expect.objectContaining({ source: 'view.message', hostNodeId: 'h3' }),
			expect.objectContaining({ source: 'view.open ? "Hide" : "Show"', hostNodeId: 'h6' }),
			expect.objectContaining({ source: 'selected.title', hostNodeId: 'h11' }),
			expect.objectContaining({ source: 'selected.status', hostNodeId: 'h12' }),
			expect.objectContaining({ source: 'selected.count', hostNodeId: 'h13' }),
			expect.objectContaining({ source: 'index + 1', hostNodeId: 'h18' }),
			expect.objectContaining({ source: 'item.title', hostNodeId: 'h18' }),
			expect.objectContaining({
				source: 'item.status === "ready" ? "Ready" : "Blocked"',
				hostNodeId: 'h19',
			}),
			expect.objectContaining({ source: 'item.count', hostNodeId: 'h19' }),
			expect.objectContaining({ source: 'view.filter', hostNodeId: 'h22' }),
			expect.objectContaining({ source: 'view.message', hostNodeId: 'h25' }),
		]),
	);
	expect(locatorGraph.branchAnchors).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				condition: 'view.open',
				firstHostNodeId: 'h10',
			}),
		]),
	);
	expect(locatorGraph.keyedLoops).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				iterable: 'visibleItems',
				itemName: 'item',
				indexName: 'index',
				key: 'item.id',
				firstHostNodeId: 'h16',
			}),
		]),
	);
	expect(locatorGraph.emptyFallbacks).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				firstHostNodeId: 'h21',
			}),
		]),
	);
});
