export type * from './artifacts.ts';
export type * from './diagnostics.ts';

export { compileTsrxModule } from './compile-module.ts';
export { validateCompilerPassGraph } from './pass-graph.ts';
export { defaultCompilerPasses } from './pass-registry.ts';

export { analyzeCaptures } from './passes/capture-analysis.ts';
export { planPayloadArena } from './passes/payload-arena.ts';
export { renderPayloadScriptArtifact } from './passes/payload-scripts.ts';
export { createProtocolStatePayloadFromArena } from './passes/protocol-state.ts';
export { createProtocolViewPayload } from './passes/protocol-view.ts';
export { buildSemanticGraph } from './passes/semantic-graph/index.ts';
export { lowerStateAccess } from './passes/state-lowering.ts';
export {
	createSymbolResolverModuleManifest,
	emitSymbolResolverModule,
} from './passes/symbol-resolver-module.ts';
export { planSymbolResolver } from './passes/symbol-resolver.ts';
