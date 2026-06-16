import type { CompileTsrxModuleInput, CompileTsrxModuleResult } from './artifacts.ts';
import { validateCompilerPassGraph } from './pass-graph.ts';
import { defaultCompilerPasses } from './pass-registry.ts';
import { analyzeCaptures } from './passes/capture-analysis.ts';
import { planPayloadArena } from './passes/payload-arena.ts';
import { renderPayloadScriptArtifact } from './passes/payload-scripts.ts';
import { createProtocolStatePayloadFromArena } from './passes/protocol-state.ts';
import { createProtocolViewPayload } from './passes/protocol-view.ts';
import { buildSemanticGraph } from './passes/semantic-graph/index.ts';
import { lowerStateAccess } from './passes/state-lowering.ts';
import { emitSymbolModules } from './passes/symbol-modules.ts';
import {
	createSymbolResolverModuleManifest,
	emitSymbolResolverModule,
} from './passes/symbol-resolver-module.ts';
import { planSymbolResolver } from './passes/symbol-resolver.ts';

export async function compileTsrxModule(
	input: CompileTsrxModuleInput,
): Promise<CompileTsrxModuleResult> {
	const passGraph = validateCompilerPassGraph(defaultCompilerPasses, ['source', 'symbols']);
	const semanticGraph = await buildSemanticGraph(input);
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena, stateLowering });
	const captureAnalysis = analyzeCaptures({ semanticGraph, symbolResolver });
	const protocolState = createProtocolStatePayloadFromArena({ semanticGraph, payloadArena });
	const protocolView = createProtocolViewPayload({ payloadArena, symbolResolver });
	const { payloadScripts, renderShell } = renderPayloadScriptArtifact({
		protocolState,
		protocolView,
	});
	const symbolModules = emitSymbolModules({ symbolResolver, captureAnalysis });
	const symbolResolverModule = emitSymbolResolverModule({
		buildId: input.buildId,
		resolverId: input.resolverId,
		symbols: input.symbols,
	});
	const symbolResolverModuleManifest = createSymbolResolverModuleManifest({
		buildId: input.buildId,
		resolverId: input.resolverId,
		symbols: input.symbols,
	});

	return {
		passGraph,
		semanticGraph,
		stateLowering,
		payloadArena,
		symbolResolver,
		captureAnalysis,
		protocolState,
		protocolView,
		payloadScripts,
		renderShell,
		symbolModules,
		symbolResolverModule,
		symbolResolverModuleManifest,
	};
}
