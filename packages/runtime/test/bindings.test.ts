import { expect, test } from 'vitest';
import {
	createBindingDomJournalRecord,
	createResumeRuntime,
	createRuntimeGraph,
} from '../src/index.ts';

type FakeElement = {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly childNodes: FakeElement[];
};

function element(tagName: string, childNodes: FakeElement[] = []): FakeElement {
	return {
		nodeType: 1,
		tagName,
		childNodes,
	};
}

test('resume runtime registers async view bindings as graph subscriptions', async () => {
	const button = element('BUTTON');
	const root = element('SECTION', [button]);
	const graph = createRuntimeGraph({
		cells: [{ bindingId: 'state:count', value: 0 }],
	});
	const loadedSymbols: string[] = [];

	createResumeRuntime({
		root,
		graph,
		view: {
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
					symbolId: 'symbol:binding',
				},
			],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return ({ graph: runtimeGraph }) => ({
				type: 'setText',
				locator: 'button:text',
				value: runtimeGraph.read('state:count'),
			});
		},
	}).start();

	graph.write({ bindingId: 'state:count', value: 1 });
	await graph.flush();

	expect(loadedSymbols).toEqual(['symbol:binding']);
	expect(graph.takeJournal()).toEqual([{ type: 'setText', locator: 'button:text', value: 1 }]);
});

test('resume runtime applies DOM journal records after scheduled graph flushes', async () => {
	const button = element('BUTTON');
	const root = element('SECTION', [button]);
	const graph = createRuntimeGraph({
		cells: [{ bindingId: 'state:count', value: 0 }],
	});
	const appliedRecords: unknown[] = [];

	await createResumeRuntime({
		root,
		graph,
		view: {
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
					symbolId: 'symbol:binding',
				},
			],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol() {
			return ({ graph: runtimeGraph }) => ({
				type: 'setText',
				locator: 'button:text',
				value: runtimeGraph.read('state:count'),
			});
		},
		applyDomJournal(records) {
			appliedRecords.push(...records);
		},
	}).start();

	graph.write({ bindingId: 'state:count', value: 1 });
	await drainMicrotasks();

	expect(appliedRecords).toEqual([{ type: 'setText', locator: 'button:text', value: 1 }]);
	expect(graph.takeJournal()).toEqual([]);
});

test('resume runtime passes binding value and target metadata to lazy binding symbols', async () => {
	const input = element('INPUT');
	const root = element('SECTION', [input]);
	const graph = createRuntimeGraph({
		cells: [{ bindingId: 'state:query', value: '' }],
	});
	const appliedRecords: unknown[] = [];
	const bindingContexts: unknown[] = [];

	await createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'input' },
			],
			events: [],
			bindings: [
				{
					hostNodeId: 'h1',
					source: 'query',
					bindingId: 'state:query',
					path: [],
					target: { kind: 'property', name: 'value' },
					symbolId: 'symbol:binding',
				},
			],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol() {
			return (context) => {
				bindingContexts.push({
					value: context.value,
					binding: context.binding,
					elementTagName: context.element.tagName,
				});

				return createBindingDomJournalRecord({
					locator: 'input:value',
					target: context.binding!.target!,
					value: context.value,
				});
			};
		},
		applyDomJournal(records) {
			appliedRecords.push(...records);
		},
	}).start();

	graph.write({ bindingId: 'state:query', value: 'Search' });
	await graph.flush();

	expect(bindingContexts).toEqual([
		{
			value: 'Search',
			binding: {
				hostNodeId: 'h1',
				source: 'query',
				bindingId: 'state:query',
				path: [],
				target: { kind: 'property', name: 'value' },
				symbolId: 'symbol:binding',
			},
			elementTagName: 'INPUT',
		},
	]);
	expect(appliedRecords).toEqual([
		{ type: 'setProp', locator: 'input:value', name: 'value', value: 'Search' },
	]);
	expect(graph.takeJournal()).toEqual([]);
});

async function drainMicrotasks(): Promise<void> {
	for (let index = 0; index < 4; index++) {
		await Promise.resolve();
	}
}
