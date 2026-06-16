export type ResumableEnvironment = 'client' | 'server' | 'lib';

export interface ResumableDevServer {
	transformRequest: (
		url: string,
		environment: ResumableEnvironment,
	) => Promise<unknown> | unknown;
}

export interface ResumableRolldownOptions {
	dev?: boolean;
	devInjections?: GlobalInjections[];
	devServer?: ResumableDevServer;
	hmr?: boolean;
	bundleGraphAdders?: Set<BundleGraphAdder>;
	onManifest?: (manifest: ResumableManifest) => void;
	rootDir?: string;
	buildId?: string;
}

export type ResumableVirtualModuleType = 'payload' | 'resolver' | 'module-manifest' | 'symbol';

export interface ResumableVirtualModule {
	id: string;
	type: ResumableVirtualModuleType;
	source: string;
	symbolId?: string;
	exportName?: string;
}

export interface TransformTsrxModuleInput {
	filename: string;
	source: string;
	buildId?: string;
}

export interface TransformTsrxModuleResult {
	code: string;
	map: null;
	virtualModules: ResumableVirtualModule[];
	manifest: ResumableTransformManifest;
}

export interface ResumableTransformManifest {
	source: string;
	payload: ResumableBuildModuleReference;
	resolver: ResumableBuildModuleReference;
	moduleManifest: ResumableBuildModuleReference;
	symbols: ResumableSymbolManifestEntry[];
}

export interface ResumableBuildModuleReference {
	virtualModuleId: string;
	fileName?: string;
}

export interface ResumableSymbolManifestEntry extends ResumableBuildModuleReference {
	symbolId: string;
	exportName: string;
	kind: string;
}

export interface ResumableManifest {
	version: number;
	manifestHash: string;
	modules: ResumableTransformManifest[];
	bundles: Record<string, ResumableBundle>;
	assets?: Record<string, ResumableAsset>;
	bundleGraph?: ResumableBundleGraph;
	bundleGraphAsset?: string;
	injections?: GlobalInjections[];
}

export type ServerResumableManifest = Pick<
	ResumableManifest,
	'version' | 'manifestHash' | 'modules' | 'bundleGraph' | 'bundleGraphAsset' | 'injections'
>;

export interface ResumableBundle {
	size: number;
	total: number;
	symbols?: string[];
	imports?: string[];
	dynamicImports?: string[];
	origins?: string[];
}

export type ResumableAsset = {
	name: string | undefined;
	size: number;
};

export type GlobalInjections = {
	tag: string;
	attributes?: Record<string, string>;
	location: 'head' | 'body';
};

export type ResumableBundleGraph = Array<string | number>;

export type PreloadGraphEntries = Record<string, { imports?: string[]; dynamicImports?: string[] }>;

export interface PreloadGraphContext {
	readonly manifest: ResumableManifest;
	readonly hasBundle: (bundleName: string) => boolean;
	readonly bundlesForOrigins: (origins: readonly string[]) => string[];
}

export type PreloadGraphEntriesAdder = (
	context: PreloadGraphContext,
) => PreloadGraphEntries | undefined;

export type BundleGraphAdder = (manifest: ResumableManifest) => PreloadGraphEntries | undefined;

export type ResumableRolldownPluginApi = {
	invalidateGeneratedModules: (parent: string, environment?: ResumableEnvironment) => string[];
};
