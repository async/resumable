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

test('resume runtime loads element behaviors and runs cleanup on host disposal', async () => {
	const canvas = element('CANVAS');
	const root = element('SECTION', [canvas]);
	const installedOn: string[] = [];
	const cleanups: string[] = [];
	const resume = createResumeRuntime({
		root,
		graph: createRuntimeGraph({ cells: [] }),
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'canvas' },
			],
			events: [],
			bindings: [],
			behaviors: [{ hostNodeId: 'h1', source: 'chart(config)', symbolId: 'symbol:chart' }],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			expect(symbolId).toBe('symbol:chart');
			return ({ element: host }) => {
				installedOn.push(host.tagName);
				return () => cleanups.push('chart');
			};
		},
	});

	await resume.start();

	expect(installedOn).toEqual(['CANVAS']);
	expect(cleanups).toEqual([]);

	resume.disposeHost('h1');

	expect(cleanups).toEqual(['chart']);
});
