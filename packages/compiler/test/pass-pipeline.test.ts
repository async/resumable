import { expect, test } from 'vitest';
import {
	compileTsrxModule,
	defaultCompilerPasses,
	validateCompilerPassGraph,
} from '../src/index.ts';

const source = `
export function App() @{
	let count = state(0);

	<button onClick={() => count++}>{count}</button>
}
`;

test('default compiler passes declare stable artifact boundaries', () => {
	expect(defaultCompilerPasses.map((pass) => pass.passId)).toEqual([
		'tsrx-semantic-graph',
		'state-lowering',
		'payload-arena',
		'symbol-resolver',
		'capture-analysis',
		'protocol-state',
		'protocol-view',
		'payload-scripts',
		'symbol-resolver-module',
	]);

	expect(defaultCompilerPasses).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				passId: 'state-lowering',
				description: expect.stringContaining('state'),
				consumes: ['semanticGraph'],
				produces: ['stateLowering'],
			}),
			expect.objectContaining({
				passId: 'payload-arena',
				description: expect.stringContaining('payload'),
				consumes: ['semanticGraph', 'stateLowering'],
				produces: ['payloadArena'],
			}),
			expect.objectContaining({
				passId: 'symbol-resolver',
				description: expect.stringContaining('symbol'),
				consumes: ['semanticGraph', 'payloadArena'],
				produces: ['symbolResolver'],
			}),
			expect.objectContaining({
				passId: 'capture-analysis',
				description: expect.stringContaining('capture'),
				consumes: ['semanticGraph', 'symbolResolver'],
				produces: ['captureAnalysis'],
			}),
			expect.objectContaining({
				passId: 'symbol-resolver-module',
				description: expect.stringContaining('resolver module'),
				consumes: ['symbols'],
				produces: ['symbolResolverModule', 'symbolResolverModuleManifest'],
			}),
		]),
	);
});

test('validateCompilerPassGraph derives runnable order and rejects invalid graphs', () => {
	const ordered = validateCompilerPassGraph(
		[
			{
				passId: 'final',
				description: 'Consumes the middle artifact.',
				consumes: ['middle'],
				produces: ['finalArtifact'],
			},
			{
				passId: 'middle',
				description: 'Consumes the source artifact.',
				consumes: ['source'],
				produces: ['middle'],
			},
		],
		['source'],
	);

	expect(ordered.orderedPassIds).toEqual(['middle', 'final']);
	expect(ordered.artifacts).toEqual(['source', 'middle', 'finalArtifact']);

	expect(() =>
		validateCompilerPassGraph(
			[
				{
					passId: 'state-lowering',
					description: 'Needs semantic graph input.',
					consumes: ['semanticGraph'],
					produces: ['stateLowering'],
				},
			],
			['source'],
		),
	).toThrow('Missing compiler artifact "semanticGraph" consumed by pass "state-lowering".');

	expect(() =>
		validateCompilerPassGraph(
			[
				{
					passId: 'one',
					description: 'First producer.',
					consumes: ['source'],
					produces: ['semanticGraph'],
				},
				{
					passId: 'two',
					description: 'Duplicate producer.',
					consumes: ['source'],
					produces: ['semanticGraph'],
				},
			],
			['source'],
		),
	).toThrow('Compiler artifact "semanticGraph" is produced by both "one" and "two".');

	expect(() =>
		validateCompilerPassGraph(
			[
				{
					passId: 'one',
					description: 'Waits on two.',
					consumes: ['twoArtifact'],
					produces: ['oneArtifact'],
				},
				{
					passId: 'two',
					description: 'Waits on one.',
					consumes: ['oneArtifact'],
					produces: ['twoArtifact'],
				},
			],
			['source'],
		),
	).toThrow('Compiler pass graph has a dependency cycle involving one, two.');
});

test('compileTsrxModule validates and returns the default pass graph', async () => {
	const result = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source,
		symbols: [
			{
				id: 'symbol:0',
				chunk: '/assets/app.handlers.js',
				exportName: 'onClick_0',
			},
			{
				id: 'symbol:1',
				chunk: '/assets/app.bindings.js',
				exportName: 'buttonText_1',
			},
		],
	});

	expect(result.passGraph.orderedPassIds).toEqual(
		defaultCompilerPasses.map((pass) => pass.passId),
	);
	expect(result.passGraph.artifacts).toEqual(
		expect.arrayContaining([
			'source',
			'symbols',
			'semanticGraph',
			'stateLowering',
			'payloadArena',
			'symbolResolver',
			'captureAnalysis',
			'protocolState',
			'protocolView',
			'payloadScripts',
			'renderShell',
			'symbolResolverModule',
			'symbolResolverModuleManifest',
		]),
	);
});
