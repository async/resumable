import { expect, test } from 'vitest';
import { createResumeRuntime, createRuntimeGraph } from '../src/index.ts';

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
