import type {
	BuildEnvironment,
	Environment,
	EnvironmentOptions,
	Plugin,
	UserConfig,
	ViteBuilder,
	ViteDevServer,
} from 'vite';
import type { OutputOptions } from 'rolldown';
import { joinURL } from 'ufo';
import { createPreloadGraphAdder } from '../build/bundle-graph.ts';
import { outputDefaults } from '../build/chunking.ts';
import { createResumableRolldownPlugin } from '../rolldown.ts';
import {
	type BundleGraphAdder,
	type GlobalInjections,
	type PreloadGraphEntriesAdder,
	type ResumableEnvironment,
	type ResumableManifest,
	type ResumableRolldownOptions,
} from '../types.ts';
import { createDevTags } from './dev-tags.ts';
import {
	isServerViteEnvironment,
	resumableEnvironment,
	transformResumableRequest,
	viteEnvironmentName,
} from './environment.ts';
import { createViteHmr } from './hmr.ts';

export type {
	BundleGraphAdder,
	GlobalInjections,
	PreloadGraphContext,
	PreloadGraphEntries,
	PreloadGraphEntriesAdder,
	ResumableEnvironment,
	ResumableManifest,
	ResumableRolldownOptions,
} from '../types.ts';

export interface ResumableViteOptions extends ResumableRolldownOptions {
	clientEnvironment?: string;
	serverEnvironment?: string;
}

type ResumableOutputOptions = OutputOptions | OutputOptions[] | undefined;
type InternalResumableRolldownOptions = ResumableRolldownOptions & {
	publicPath?: (fileName: string) => string;
};
const ASYNC_RESUMABLE_SKIP_DUPLICATE_BUILDS = Symbol('async-resumable-skip-duplicate-builds');

export function resumable(options: ResumableViteOptions = {}): Plugin[] {
	let manifest: ResumableManifest | null = null;
	const bundleGraphAdders = new Set<BundleGraphAdder>();
	const rolldownOptions: InternalResumableRolldownOptions = { ...options };
	rolldownOptions.bundleGraphAdders = bundleGraphAdders;
	rolldownOptions.onManifest = (nextManifest) => {
		manifest = nextManifest;
		options.onManifest?.(nextManifest);
	};
	const hmrOptions = {
		base: '/',
		clientEnvironment: viteEnvironmentName('client', options),
		enabled: false,
		invalidateGeneratedModules: (parent: string, environment?: ResumableEnvironment) =>
			resumablePlugin.api.invalidateGeneratedModules(parent, environment),
	};
	const devTags = createDevTags();
	rolldownOptions.devInjections = devTags.tags;
	const basePlugin = createResumableRolldownPlugin({
		environment: getBuildEnvironment,
		options: rolldownOptions,
	}) as Plugin & {
		api: { invalidateGeneratedModules: typeof hmrOptions.invalidateGeneratedModules };
	};
	const hmr = createViteHmr(hmrOptions);

	const resumablePlugin = {
		...basePlugin,
		name: 'vite-plugin-async-resumable',
		enforce: 'post',
		sharedDuringBuild: true,
		api: {
			...basePlugin.api,
			getManifest: () => manifest,
			registerBundleGraphAdder: (adder: BundleGraphAdder) => bundleGraphAdders.add(adder),
			registerDevInjection: (injection: GlobalInjections) => devTags.register(injection),
			registerPreloadGraphEntries: (adder: PreloadGraphEntriesAdder) =>
				bundleGraphAdders.add(createPreloadGraphAdder(adder)),
		},
		config(config) {
			configDefaults(config);
		},
		configResolved(resolvedConfig) {
			const serve = resolvedConfig.command === 'serve';
			hmrOptions.base = resolvedConfig.base;
			hmrOptions.enabled = serve && options.hmr !== false;
			rolldownOptions.dev = serve;
			rolldownOptions.rootDir = resolvedConfig.root;
			rolldownOptions.publicPath = (fileName) => joinURL(resolvedConfig.base, fileName);
			if (serve) {
				devTags.registerViteTags(resolvedConfig.base, hmrOptions.enabled);
			}
		},
		configEnvironment(name, config) {
			const environment = configEnvironmentKind(name, config, options);
			if (!environment) {
				return undefined;
			}

			const build = config.build ?? {};
			const rolldownOptions = build.rolldownOptions ?? {};
			const outDir = defaultOutDir(environment);
			return {
				build: {
					...build,
					...(environment === 'client'
						? { modulePreload: build.modulePreload ?? false }
						: {}),
					...(build.outDir || !outDir ? {} : { outDir }),
					rolldownOptions: {
						...rolldownOptions,
						output: withOutputDefaults(rolldownOptions.output, environment),
					},
				},
			};
		},
		buildApp: {
			order: 'pre',
			handler(builder) {
				return buildResumableEnvironments(builder, options);
			},
		},
		configureServer(server: ViteDevServer) {
			rolldownOptions.devServer = {
				transformRequest: (url, environment) =>
					transformResumableRequest(server, url, environment, options),
			};
			hmr.configureServer(server);
		},
		transformIndexHtml() {
			return hmr.transformIndexHtml();
		},
		resolveId: {
			order: 'pre',
			async handler(source, importer, opts) {
				const hmrResolved = hmr.resolveId(source);
				if (hmrResolved) return hmrResolved;

				return runHook(basePlugin.resolveId, this, source, importer, opts);
			},
		},
		load(id, loadOptions) {
			return hmr.load(id) ?? runHook(basePlugin.load, this, id, loadOptions);
		},
		transform: {
			async handler(code, id, transformOptions) {
				return runHook(basePlugin.transform, this, code, id, transformOptions);
			},
		},
		hotUpdate(ctx) {
			return hmr.hotUpdate(this.environment, ctx);
		},
	} satisfies Plugin & { api: ResumableVitePluginApi };

	return [resumablePlugin];
}

async function buildResumableEnvironments(builder: ViteBuilder, options: ResumableViteOptions) {
	const environments = buildEnvironments(builder, options);
	const names = environments.map((environment) => environment.name);
	skipDuplicateBuilds(builder, names);

	for (const environment of environments) {
		if (!environment.isBuilt) {
			await builder.build(environment);
		}
	}
}

function buildEnvironments(builder: ViteBuilder, options: ResumableViteOptions) {
	const environments = new Map<string, BuildEnvironment>();
	for (const name of [
		viteEnvironmentName('client', options),
		viteEnvironmentName('server', options),
	]) {
		const environment = builder.environments[name];
		if (environment) {
			environments.set(name, environment);
		}
	}

	for (const environment of Object.values(builder.environments)) {
		if (resumableEnvironment(environment) === 'server') {
			environments.set(environment.name, environment);
		}
	}

	return [...environments.values()];
}

function skipDuplicateBuilds(builder: ViteBuilder, names: readonly string[]) {
	const guarded = builder as ViteBuilder & {
		[ASYNC_RESUMABLE_SKIP_DUPLICATE_BUILDS]?: Set<string>;
	};

	const guardedNames = guarded[ASYNC_RESUMABLE_SKIP_DUPLICATE_BUILDS] ?? new Set<string>();
	for (const name of names) {
		guardedNames.add(name);
	}

	if (guarded[ASYNC_RESUMABLE_SKIP_DUPLICATE_BUILDS]) return;

	guarded[ASYNC_RESUMABLE_SKIP_DUPLICATE_BUILDS] = guardedNames;
	const build = builder.build.bind(builder);
	builder.build = (environment: BuildEnvironment) => {
		if (guardedNames.has(environment.name) && environment.isBuilt) {
			return Promise.resolve([]);
		}
		return build(environment);
	};
}

function configDefaults(config: UserConfig) {
	if (config.build?.lib || config.build?.ssr) {
		return;
	}

	const build = (config.build ??= {});
	build.modulePreload ??= false;
}

function withOutputDefaults(
	output: ResumableOutputOptions,
	environment: ResumableEnvironment,
): OutputOptions | OutputOptions[] {
	if (Array.isArray(output)) {
		return output.map((item) => outputDefaults(item, environment));
	}

	if (!output) {
		return outputDefaults({}, environment);
	}

	return outputDefaults(output, environment);
}

function defaultOutDir(environment: ResumableEnvironment) {
	if (environment === 'server') {
		return 'dist/server';
	}

	return undefined;
}

function configEnvironmentKind(
	name: string,
	config: EnvironmentOptions,
	options: ResumableViteOptions,
): ResumableEnvironment | null {
	if (config.build?.lib) {
		return null;
	}

	if (name === viteEnvironmentName('client', options)) {
		return 'client';
	}

	if (name === viteEnvironmentName('server', options)) {
		return 'server';
	}

	if (isServerViteEnvironment({ name, config })) {
		return 'server';
	}

	return null;
}

function runHook(hook: unknown, context: unknown, ...args: unknown[]) {
	if (typeof hook !== 'function') {
		return null;
	}
	return hook.call(context, ...args);
}

type ResumableVitePluginApi = {
	invalidateGeneratedModules: (parent: string, environment?: ResumableEnvironment) => string[];
	getManifest?: () => ResumableManifest | null;
	registerBundleGraphAdder?: (adder: BundleGraphAdder) => void;
	registerDevInjection?: (injection: GlobalInjections) => void;
	registerPreloadGraphEntries?: (adder: PreloadGraphEntriesAdder) => void;
};

function getBuildEnvironment(context: unknown): ResumableEnvironment {
	const pluginContext = context as { environment?: Environment };
	return resumableEnvironment(pluginContext.environment);
}

export type ResumableVitePlugin = ReturnType<typeof resumable>[number];
