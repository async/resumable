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

test('resume runtime records element behaviors without loading app code during startup', async () => {
	const canvas = element('CANVAS');
	const root = element('SECTION', [canvas]);
	const loadedSymbols: string[] = [];
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
			domUpdates: [],
			behaviors: [
				{ hostNodeId: 'h1', source: 'chart(config)', symbolId: 'symbol:chart' },
				{ hostNodeId: 'h1', source: 'resizeCanvas', symbolId: 'symbol:resize' },
			],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return ({ element: host }) => {
				const label = symbolId.replace('symbol:', '');
				installedOn.push(`${label}:${host.tagName}`);
				return () => cleanups.push(label);
			};
		},
	});

	await resume.start();

	expect(loadedSymbols).toEqual([]);
	expect(installedOn).toEqual([]);
	expect(cleanups).toEqual([]);

	resume.disposeHost('h1');

	expect(cleanups).toEqual([]);

	resume.disposeHost('h1');

	expect(cleanups).toEqual([]);
});
