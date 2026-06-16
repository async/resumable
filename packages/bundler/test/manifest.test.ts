import { describe, expect, test } from 'vitest';
import {
	convertManifestToBundleGraph,
	createPreloadGraphAdder,
} from '../src/build/bundle-graph.ts';
import { ASYNC_RESUMABLE_BUNDLE_GRAPH } from '../src/build/chunking.ts';
import {
	ASYNC_RESUMABLE_MANIFEST,
	createManifest,
	injectManifest,
	type ResumableManifestBundle,
} from '../src/build/manifest.ts';
import type { ResumableManifest, ResumableTransformManifest } from '../src/types.ts';

const transformManifest: ResumableTransformManifest = {
	source: '/workspace/app/src/root.tsrx',
	payload: { virtualModuleId: 'virtual:async-resumable:payload:root' },
	resolver: { virtualModuleId: 'virtual:async-resumable:resolver:root' },
	moduleManifest: { virtualModuleId: 'virtual:async-resumable:module-manifest:root' },
	symbols: [
		{
			symbolId: 'root#click',
			kind: 'event-handler',
			exportName: 'onClick',
			virtualModuleId: 'virtual:async-resumable:symbol:root:click',
		},
	],
};

describe('resumable manifest output', () => {
	test('creates a manifest from bundler output and transform artifacts', () => {
		const manifest = createManifest(
			{
				'build/async-entry.js': chunk({
					fileName: 'build/async-entry.js',
					name: 'entry',
					code: 'import "./async-symbol.js"; export default {};',
					imports: ['build/async-symbol.js'],
					moduleIds: ['/workspace/app/src/root.tsrx'],
					facadeModuleId: '/workspace/app/src/root.tsrx',
				}),
				'build/async-symbol.js': chunk({
					fileName: 'build/async-symbol.js',
					name: 'root_click',
					code: 'export const onClick = () => {};',
					moduleIds: ['\0virtual:async-resumable:symbol:root:click'],
					facadeModuleId: '\0virtual:async-resumable:symbol:root:click',
				}),
				'build/root.css': {
					type: 'asset',
					fileName: 'build/root.css',
					name: 'root.css',
					names: ['root.css'],
					source: 'body{}',
				},
				'build/async-entry.js.map': {
					type: 'asset',
					fileName: 'build/async-entry.js.map',
					name: 'async-entry.js.map',
					names: ['async-entry.js.map'],
					source: '{}',
				},
			},
			[transformManifest],
			'/workspace/app',
			{
				bundleGraphAsset: ASYNC_RESUMABLE_BUNDLE_GRAPH,
				publicPath: (fileName) => `/assets/${fileName}`,
			},
		);

		expect(manifest.modules[0]).toMatchObject({
			source: '/workspace/app/src/root.tsrx',
			symbols: [
				expect.objectContaining({
					symbolId: 'root#click',
					fileName: 'build/async-symbol.js',
				}),
			],
		});
		expect(manifest.bundles['build/async-entry.js']).toMatchObject({
			imports: ['build/async-symbol.js'],
			origins: ['src/root.tsrx'],
		});
		expect(manifest.bundles['build/async-symbol.js']).toMatchObject({
			symbols: ['root#click'],
		});
		expect(manifest.assets?.['build/root.css']).toEqual({ name: 'root.css', size: 6 });
		expect(manifest.assets?.['build/async-entry.js.map']).toBeUndefined();
		expect(manifest.bundleGraphAsset).toBe(ASYNC_RESUMABLE_BUNDLE_GRAPH);
		expect(manifest.bundleGraph).toContain('root#click');
		expect(manifest.injections).toContainEqual({
			tag: 'link',
			location: 'head',
			attributes: {
				rel: 'stylesheet',
				href: '/assets/build/root.css',
			},
		});
		expect(manifest.manifestHash).toEqual(expect.any(String));
	});

	test('converts symbol and custom preload entries into the bundle graph', () => {
		const manifest: ResumableManifest = {
			version: 1,
			manifestHash: 'test',
			modules: [
				{
					...transformManifest,
					symbols: [
						{
							...transformManifest.symbols[0]!,
							fileName: 'build/async-symbol.js',
						},
					],
				},
			],
			bundles: {
				'build/async-entry.js': {
					size: 100,
					total: 200,
					dynamicImports: ['build/async-symbol.js'],
					origins: ['src/root.tsrx'],
				},
				'build/async-symbol.js': {
					size: 50,
					total: 50,
					symbols: ['root#click'],
					origins: ['src/root.tsrx'],
				},
			},
		};
		const adders = new Set([
			createPreloadGraphAdder(({ bundlesForOrigins }) => ({
				'entry-preload': {
					dynamicImports: bundlesForOrigins(['/src/root.tsrx']),
				},
			})),
		]);

		const graph = convertManifestToBundleGraph(manifest, adders);

		expect(graph).toContain('root#click');
		expect(graph).toContain('entry-preload');
		expect(graph).toContain('build/async-symbol.js');
	});

	test('injects build manifests into server output without a manifest input option', () => {
		const manifest: ResumableManifest = {
			version: 1,
			manifestHash: 'abc',
			modules: [transformManifest],
			bundles: {},
			bundleGraph: ['root#click'],
			bundleGraphAsset: ASYNC_RESUMABLE_BUNDLE_GRAPH,
			injections: [{ tag: 'script', location: 'head', attributes: { src: '/runtime.js' } }],
		};

		const code = injectManifest(
			`if (!${ASYNC_RESUMABLE_MANIFEST}) throw new Error(); export default ${ASYNC_RESUMABLE_MANIFEST};`,
			manifest,
		);

		expect(code).toContain('"manifestHash":"abc"');
		expect(code).toContain('"bundleGraph":["root#click"]');
		expect(code).toContain('if (false) throw new Error();');
	});
});

function chunk(input: {
	fileName: string;
	name: string;
	code: string;
	imports?: string[];
	dynamicImports?: string[];
	moduleIds: string[];
	facadeModuleId: string;
}): ResumableManifestBundle[string] {
	return {
		type: 'chunk',
		fileName: input.fileName,
		name: input.name,
		code: input.code,
		exports: [],
		imports: input.imports ?? [],
		dynamicImports: input.dynamicImports ?? [],
		moduleIds: input.moduleIds,
		facadeModuleId: input.facadeModuleId,
	};
}
