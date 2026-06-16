import type { InputOptions, Plugin } from 'rolldown';
import { parsePath } from 'ufo';
import {
	ASYNC_RESUMABLE_BUILD_PREFIX,
	ASYNC_RESUMABLE_BUNDLE_GRAPH,
	outputDefaults,
} from './build/chunking.ts';
import {
	ASYNC_RESUMABLE_MANIFEST,
	ASYNC_RESUMABLE_MANIFEST_FILE,
	createManifest,
	devTagsManifest,
	injectManifest,
} from './build/manifest.ts';
import { createResumableDevGraph } from './dev.ts';
import { ASYNC_RESUMABLE_VIRTUAL_PREFIX, transformTsrxModule } from './transform.ts';
import type {
	ResumableEnvironment,
	ResumableManifest,
	ResumableRolldownOptions,
	ResumableRolldownPluginApi,
	ResumableTransformManifest,
	ResumableVirtualModule,
	ServerResumableManifest,
	TransformTsrxModuleResult,
} from './types.ts';

export type {
	BundleGraphAdder,
	GlobalInjections,
	PreloadGraphContext,
	PreloadGraphEntries,
	PreloadGraphEntriesAdder,
	ResumableAsset,
	ResumableBundle,
	ResumableBundleGraph,
	ResumableDevServer,
	ResumableEnvironment,
	ResumableManifest,
	ResumableRolldownOptions,
	ResumableRolldownPluginApi,
	ResumableTransformManifest,
	ResumableVirtualModule,
	ServerResumableManifest,
	TransformTsrxModuleInput,
	TransformTsrxModuleResult,
} from './types.ts';

type Environment = ResumableEnvironment | ((context: unknown) => ResumableEnvironment);
export type ResumableRolldownPlugin = Plugin & { api: ResumableRolldownPluginApi };
type InternalResumableRolldownOptions = ResumableRolldownOptions & {
	publicPath?: (fileName: string) => string;
};

const manifests = new Map<string, ResumableManifest>();
const TSRX_SOURCE_FILE = /\.tsrx(?:[?#].*)?$/;

export const resumableClient = (options: ResumableRolldownOptions = {}) =>
	createResumableRolldownPlugin({ environment: 'client', options });
export const resumableServer = (options: ResumableRolldownOptions = {}) =>
	createResumableRolldownPlugin({ environment: 'server', options });
export const resumableLib = (options: ResumableRolldownOptions = {}) =>
	createResumableRolldownPlugin({ environment: 'lib', options });

export function createResumableRolldownPlugin(input: {
	environment: Environment;
	options?: ResumableRolldownOptions;
}): ResumableRolldownPlugin {
	const environment = input.environment;
	const internalOptions = (input.options ?? {}) as InternalResumableRolldownOptions;
	const virtualModules = new Map<string, ResumableVirtualModule>();
	const transformManifests = new Map<string, ResumableTransformManifest>();
	const sourceVirtualModules = new Map<string, Set<string>>();
	const dev = createResumableDevGraph();
	let manifest: ResumableManifest | ServerResumableManifest | null = null;
	let root = internalOptions.rootDir;
	const name = pluginName(environment);

	function getEnvironment(context: unknown) {
		if (typeof environment === 'function') {
			return environment(context);
		}

		return environment;
	}

	function getRoot() {
		return root ?? internalOptions.rootDir;
	}

	const plugin = {
		api: {
			invalidateGeneratedModules(parent: string, currentEnvironment?: ResumableEnvironment) {
				const ids = dev.clear(parent, currentEnvironment);
				for (const id of ids) {
					virtualModules.delete(id);
				}
				return ids.map(resolveVirtualId);
			},
		},
		name,
		options(input: InputOptions) {
			const currentEnvironment = getEnvironment(this);
			if (currentEnvironment !== 'client') {
				return input;
			}

			return {
				...input,
				preserveEntrySignatures:
					input.preserveEntrySignatures ?? 'allow-extension',
			};
		},
		async buildStart(input) {
			if (!root) {
				root = internalOptions.rootDir ?? input.cwd;
			}
			virtualModules.clear();
			transformManifests.clear();
			sourceVirtualModules.clear();
			dev.reset();

			const currentRoot = getRoot();
			manifest = null;
			if (currentRoot) {
				manifest = manifests.get(currentRoot) ?? null;
			}
		},
		outputOptions(output) {
			return outputDefaults(output, getEnvironment(this));
		},
		resolveId(source) {
			const normalized = normalizeVirtualId(source);
			if (virtualModules.has(normalized)) {
				return { id: resolveVirtualId(normalized), moduleSideEffects: true };
			}
			return null;
		},
		load(id) {
			const module = virtualModules.get(normalizeVirtualId(id));
			if (module) {
				return module.source;
			}
			return null;
		},
		async transform(code, id) {
			const currentEnvironment = getEnvironment(this);
			const virtualId = normalizeVirtualId(id);
			if (!TSRX_SOURCE_FILE.test(id)) {
				return null;
			}
			if (virtualId.startsWith(ASYNC_RESUMABLE_VIRTUAL_PREFIX)) {
				return null;
			}
			const source = pathname(id);
			clearSourceVirtualModules(source, virtualModules, sourceVirtualModules);
			const transformed = await transformTsrxModule({
				filename: source,
				source: code,
				buildId: internalOptions.buildId,
			});
			registerTransformArtifacts({
				source,
				result: transformed,
				virtualModules,
				transformManifests,
				sourceVirtualModules,
				dev,
				environment: currentEnvironment,
			});

			if (currentEnvironment === 'client' && !internalOptions.dev) {
				for (const module of transformed.virtualModules.filter(
					(item) => item.type === 'symbol',
				)) {
					this.emitFile({
						type: 'chunk',
						id: module.id,
						preserveSignature: 'strict',
					});
				}
			}

			if (currentEnvironment === 'server') {
				let serverManifest = manifest;
				if (
					!serverManifest &&
					internalOptions.dev &&
					internalOptions.devInjections?.length
				) {
					serverManifest = devTagsManifest(internalOptions.devInjections);
				}
				return {
					code: injectManifest(transformed.code, serverManifest),
					map: transformed.map,
				};
			}

			return transformed;
		},
		generateBundle: {
			order: 'post',
			handler(_, bundle) {
				if (getEnvironment(this) !== 'client') return;

				const clientManifest = createManifest(
					bundle,
					transformManifests.values(),
					getRoot(),
					{
						bundleGraphAsset: ASYNC_RESUMABLE_BUNDLE_GRAPH,
						bundleGraphAdders: internalOptions.bundleGraphAdders,
						canonPath: stripBuildPrefix,
						publicPath: internalOptions.publicPath,
						injections: internalOptions.devInjections,
					},
				);
				manifest = clientManifest;
				const currentRoot = getRoot();
				if (currentRoot) {
					manifests.set(currentRoot, clientManifest);
				}
				internalOptions.onManifest?.(clientManifest);

				for (const [fileName, source] of [
					[ASYNC_RESUMABLE_BUNDLE_GRAPH, JSON.stringify(clientManifest.bundleGraph)],
					[ASYNC_RESUMABLE_MANIFEST_FILE, JSON.stringify(clientManifest, null, '\t')],
				] as const) {
					this.emitFile({ type: 'asset', fileName, source });
				}
			},
		},
	} satisfies Plugin & { api: ResumableRolldownPluginApi };

	return plugin;
}

function pluginName(environment: Environment) {
	if (typeof environment === 'function') {
		return 'async-resumable:rolldown';
	}

	return `async-resumable:rolldown:${environment}`;
}

function registerTransformArtifacts(input: {
	source: string;
	result: TransformTsrxModuleResult;
	virtualModules: Map<string, ResumableVirtualModule>;
	transformManifests: Map<string, ResumableTransformManifest>;
	sourceVirtualModules: Map<string, Set<string>>;
	dev: ReturnType<typeof createResumableDevGraph>;
	environment: ResumableEnvironment;
}) {
	const ids = new Set<string>();
	for (const module of input.result.virtualModules) {
		input.virtualModules.set(module.id, module);
		ids.add(module.id);
	}
	input.transformManifests.set(input.source, input.result.manifest);
	input.sourceVirtualModules.set(input.source, ids);
	input.dev.record(input.source, ids, input.environment);
}

function clearSourceVirtualModules(
	source: string,
	virtualModules: Map<string, ResumableVirtualModule>,
	sourceVirtualModules: Map<string, Set<string>>,
) {
	const stale = sourceVirtualModules.get(source);
	if (!stale) return;
	for (const id of stale) {
		virtualModules.delete(id);
	}
	sourceVirtualModules.delete(source);
}

function stripBuildPrefix(fileName: string) {
	return fileName.startsWith(ASYNC_RESUMABLE_BUILD_PREFIX)
		? fileName.slice(ASYNC_RESUMABLE_BUILD_PREFIX.length)
		: fileName;
}

function normalizeVirtualId(id: string) {
	if (id.startsWith('\0')) {
		return id.slice(1);
	}

	return id;
}

function resolveVirtualId(id: string) {
	if (id.startsWith('\0')) {
		return id;
	}

	return `\0${id}`;
}

function pathname(id: string) {
	return parsePath(id).pathname;
}

export {
	ASYNC_RESUMABLE_BUNDLE_GRAPH,
	ASYNC_RESUMABLE_BUILD_PREFIX,
	outputDefaults,
} from './build/chunking.ts';
export {
	ASYNC_RESUMABLE_MANIFEST,
	ASYNC_RESUMABLE_MANIFEST_FILE,
	createManifest,
	devTagsManifest,
	injectManifest,
} from './build/manifest.ts';
export { convertManifestToBundleGraph, createPreloadGraphAdder } from './build/bundle-graph.ts';
export { ASYNC_RESUMABLE_VIRTUAL_PREFIX, transformTsrxModule } from './transform.ts';
