import { describe, expect, test, vi } from 'vitest';
import {
	ASYNC_RESUMABLE_BUNDLE_GRAPH,
	ASYNC_RESUMABLE_MANIFEST_FILE,
	resumableLib,
	resumableClient,
	resumableServer,
	transformTsrxModule,
} from '../src/rolldown.ts';
import {
	callBuildStart,
	callGenerateBundle,
	callLoad,
	callOptions,
	callResolveId,
	callTransform,
} from './helpers.ts';

const source = `
import { state } from '@async/resumable';

export function App() @{
	let count = state(0);

	<button onClick={() => count++}>{count}</button>
}
`;

describe('TSRX Rolldown plugin structure', () => {
	test('client build options allow generated entries to extend the app entry surface', () => {
		expect(callOptions(resumableClient(), {})).toMatchObject({
			preserveEntrySignatures: 'allow-extension',
		});
		expect(callOptions(resumableClient(), { preserveEntrySignatures: 'strict' })).toMatchObject(
			{
				preserveEntrySignatures: 'strict',
			},
		);
		expect(callOptions(resumableServer(), {})).toEqual({});
		expect(callOptions(resumableLib(), {})).toEqual({});
	});

	test('transformTsrxModule produces virtual payload, resolver, manifest, and symbol modules', async () => {
		const result = await transformTsrxModule({
			filename: '/workspace/app/src/App.tsrx',
			source,
		});

		expect(result.code).toContain('export const resumableSource');
		expect(result.code).toContain(
			"import payloadScripts from 'virtual:async-resumable:payload:",
		);
		expect(result.code).toContain(
			"import { loadSymbol, symbolManifest } from 'virtual:async-resumable:resolver:",
		);
		expect(result.code).toContain(
			"import moduleManifest from 'virtual:async-resumable:module-manifest:",
		);
		expect(result.code).toContain(
			'export { loadSymbol, moduleManifest, payloadScripts, symbolManifest };',
		);
		expect(result.virtualModules.map((item) => item.type)).toEqual(
			expect.arrayContaining(['payload', 'resolver', 'module-manifest', 'symbol']),
		);
		expect(result.manifest.source).toBe('/workspace/app/src/App.tsrx');
		expect(result.manifest.symbols).toContainEqual(
			expect.objectContaining({
				kind: 'event-handler',
				virtualModuleId: expect.stringContaining('virtual:async-resumable:symbol:'),
			}),
		);
		expect(result.manifest.symbols).toContainEqual(
			expect.objectContaining({
				kind: 'dom-update',
				virtualModuleId: expect.stringContaining('virtual:async-resumable:symbol:'),
			}),
		);
	});

	test('base plugin transforms TSRX and serves generated virtual modules', async () => {
		const plugin = resumableClient();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		const result = (await callTransform(plugin, source, '/workspace/app/src/App.tsrx')) as {
			code: string;
		};
		const encoded = encodeURIComponent('/workspace/app/src/App.tsrx');
		const payloadId = `virtual:async-resumable:payload:${encoded}`;
		const resolverId = `virtual:async-resumable:resolver:${encoded}`;

		expect(result.code).toContain('virtual:async-resumable:payload:');
		expect(payloadId).toBeTruthy();
		expect(resolverId).toBeTruthy();
		expect(await callResolveId(plugin, payloadId!)).toEqual(
			expect.objectContaining({ id: `\0${payloadId}` }),
		);
		expect(await callLoad(plugin, `\0${payloadId}`)).toContain('export default');
		const resolverSource = (await callLoad(plugin, `\0${resolverId}`)) as string;
		const symbolIds = [...resolverSource.matchAll(/import\("([^"]+)"\)/g)].map(
			(match) => match[1],
		);
		const symbolSources = await Promise.all(
			symbolIds.map((symbolId) => callLoad(plugin, `\0${symbolId}`) as Promise<string>),
		);
		expect(symbolSources).toEqual(
			expect.arrayContaining([
				expect.stringContaining('context.graph.update({'),
				expect.stringContaining('type: "setText"'),
			]),
		);
	});

	test('buildStart clears stale virtual modules and transform manifests', async () => {
		const plugin = resumableClient();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		const result = (await callTransform(plugin, source, '/workspace/app/src/App.tsrx')) as {
			code: string;
		};
		const payloadId = `virtual:async-resumable:payload:${encodeURIComponent(
			'/workspace/app/src/App.tsrx',
		)}`;
		expect(await callLoad(plugin, `\0${payloadId}`)).toContain('export default');

		callBuildStart(plugin, { cwd: '/workspace/app' });
		expect(await callLoad(plugin, `\0${payloadId}`)).toBeNull();
		const emitFile = vi.fn();
		callGenerateBundle(plugin, {}, emitFile);
		const manifestAsset = emitFile.mock.calls
			.map((call) => call[0])
			.find((item) => item.fileName === ASYNC_RESUMABLE_MANIFEST_FILE);
		expect(JSON.parse(manifestAsset.source).modules).toEqual([]);
	});

	test('generateBundle emits manifest and bundle graph assets from build output', async () => {
		let manifest:
			| {
					version?: number;
					modules?: Array<{
						source?: string;
						symbols?: Array<{ fileName?: string }>;
					}>;
					bundleGraphAsset?: string;
			  }
			| undefined;
		const plugin = resumableClient({
			onManifest: (next) => {
				manifest = next as never;
			},
		});
		const emitFile = vi.fn();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		const result = (await callTransform(plugin, source, '/workspace/app/src/App.tsrx')) as {
			code: string;
		};
		expect(result.code).toContain('virtual:async-resumable:payload:');
		const encoded = encodeURIComponent('/workspace/app/src/App.tsrx');
		const entryVirtualIds = [
			`virtual:async-resumable:payload:${encoded}`,
			`virtual:async-resumable:resolver:${encoded}`,
			`virtual:async-resumable:module-manifest:${encoded}`,
		];
		const resolverId = `virtual:async-resumable:resolver:${encoded}`;
		const resolverSource = (await callLoad(plugin, `\0${resolverId}`)) as string;
		const symbolVirtualIds = [...resolverSource.matchAll(/import\("([^"]+)"\)/g)].map(
			(match) => match[1],
		);
		const virtualIds = [...entryVirtualIds, ...symbolVirtualIds].map((id) => `\0${id}`);

		callGenerateBundle(
			plugin,
			Object.fromEntries(
				virtualIds.map((id, index) => [
					`build/async-${index}.js`,
					{
						type: 'chunk',
						fileName: `build/async-${index}.js`,
						name: `async-${index}`,
						code: 'export default {};',
						exports: ['default'],
						imports: [],
						dynamicImports: [],
						moduleIds: [id],
						facadeModuleId: id,
					},
				]),
			),
			emitFile,
		);

		expect(manifest).toMatchObject({
			version: 1,
			modules: [expect.objectContaining({ source: '/workspace/app/src/App.tsrx' })],
		});
		expect(manifest?.bundleGraphAsset).toBe(ASYNC_RESUMABLE_BUNDLE_GRAPH);
		expect(manifest?.modules[0]?.symbols[0]?.fileName).toMatch(/^async-\d+\.js$/);
		expect(emitFile).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'asset',
				fileName: ASYNC_RESUMABLE_BUNDLE_GRAPH,
			}),
		);
		expect(emitFile).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'asset',
				fileName: ASYNC_RESUMABLE_MANIFEST_FILE,
			}),
		);
	});
});
