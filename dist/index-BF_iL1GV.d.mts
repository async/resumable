import { o as ProtocolViewPayload, r as ProtocolStatePayload } from "./index-CkXNK4ag.mjs";
import { p as RenderedPayloadScripts } from "./index-jxFduNzP.mjs";

//#region packages/compiler/src/diagnostics.d.ts
type SourceSpan = {
  readonly filename: string;
  readonly start: number;
  readonly end: number;
};
type DiagnosticSuggestion = {
  readonly message: string;
};
type CompilerDiagnostic = {
  readonly code: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly phase: 'parse' | 'semantic-graph' | 'state-lowering' | 'capture-analysis' | 'sync-policy' | 'serialization' | 'payload' | 'resume' | 'runtime';
  readonly title: string;
  readonly message: string;
  readonly why: string;
  readonly primarySpan?: SourceSpan;
  readonly passId?: string;
  readonly artifactKeys?: ReadonlyArray<string>;
  readonly statePath?: string;
  readonly symbolId?: string;
  readonly elementLocator?: string;
  readonly suggestions: ReadonlyArray<DiagnosticSuggestion>;
  readonly docsUrl: string;
};
//#endregion
//#region packages/compiler/src/artifacts.d.ts
type SemanticGraphInput = {
  readonly filename: string;
  readonly source: string;
};
type SemanticComponent = {
  readonly name: string;
};
type SemanticGraphBinding = {
  readonly id: string;
  readonly name: string;
  readonly kind: 'state' | 'computed' | 'element' | 'prop';
  readonly declarationKind?: 'const' | 'let' | 'var';
  readonly writable: boolean;
  readonly valueKind?: 'scalar' | 'object' | 'array' | 'unknown';
  readonly initialValue?: unknown;
  readonly async?: boolean;
  readonly asyncCapable?: boolean;
  readonly dependencies?: ReadonlyArray<SemanticGraphDependency>;
};
type SemanticGraphDependency = {
  readonly source: string;
  readonly bindingId: string;
  readonly path: ReadonlyArray<string>;
};
type SemanticHostNode = {
  readonly id: string;
  readonly tagName: string;
};
type SemanticSyncPolicyCondition = {
  readonly type: 'and';
  readonly conditions: ReadonlyArray<SemanticSyncPolicyCondition>;
} | {
  readonly type: 'or';
  readonly conditions: ReadonlyArray<SemanticSyncPolicyCondition>;
} | {
  readonly type: 'not';
  readonly condition: SemanticSyncPolicyCondition;
} | {
  readonly type: 'graph-truthy';
  readonly bindingId: string;
  readonly path: ReadonlyArray<string>;
} | {
  readonly type: 'event-equals';
  readonly field: string;
  readonly value: unknown;
};
type SemanticSyncPolicyAction = 'preventDefault' | 'stopPropagation';
type SemanticSyncPolicy = {
  readonly when: SemanticSyncPolicyCondition;
  readonly actions: ReadonlyArray<SemanticSyncPolicyAction>;
};
type SemanticEvent = {
  readonly id: string;
  readonly hostNodeId: string;
  readonly eventName: string;
  readonly handlerCount: number;
  readonly handlerSources: ReadonlyArray<string>;
  readonly hasSyncPolicyCandidate: boolean;
  readonly syncPolicy?: SemanticSyncPolicy;
};
type SemanticGraphDiagnostic = CompilerDiagnostic & {
  readonly code: 'AA_STATE_MODULE_SCOPE' | 'AA_ASYNC_POST_AWAIT_READ' | 'AA_ASYNC_BOUNDARY_REQUIRED' | 'AA_ELEMENT_HANDLE_REQUIRED' | 'AA_ELEMENT_HANDLE_DUPLICATE' | 'AA_USE_HOST_ELEMENT_REQUIRED' | 'AA_SYNC_POLICY_UNEXTRACTABLE';
  readonly phase: 'semantic-graph' | 'sync-policy';
  readonly passId: 'tsrx-semantic-graph';
};
type SemanticStateWrite = {
  readonly target: string;
  readonly targetSpan?: SourceSpan;
  readonly operation: 'assign' | 'update' | 'call' | 'delete';
  readonly assignmentOperator?: string;
  readonly optional?: boolean;
  readonly prefix?: boolean;
  readonly updateOperator?: '++' | '--';
  readonly method?: string;
  readonly argumentSources?: ReadonlyArray<string>;
};
type SemanticStateRead = {
  readonly source: string;
  readonly sourceSpan?: SourceSpan;
};
type SemanticGraphAlias = {
  readonly name: string;
  readonly target: string;
  readonly excludedPaths?: ReadonlyArray<ReadonlyArray<string>>;
  readonly declarationKind?: SemanticGraphBinding['declarationKind'];
  readonly sourceSpan?: SourceSpan;
};
type SemanticTemplateRead = {
  readonly source: string;
  readonly sourceSpan?: SourceSpan;
  readonly hostNodeId: string;
  readonly asyncBoundaryId?: string;
};
type SemanticElementHandleBinding = {
  readonly hostNodeId: string;
  readonly handleName: string;
  readonly sourceSpan?: SourceSpan;
};
type SemanticLocalBinding = {
  readonly name: string;
  readonly kind: 'function' | 'class-instance' | 'dom-node' | 'non-serializable-constant';
  readonly declarationKind?: SemanticGraphBinding['declarationKind'];
  readonly sourceSpan?: SourceSpan;
};
type SemanticGraphArtifact = {
  readonly passId: 'tsrx-semantic-graph';
  readonly filename: string;
  readonly components: ReadonlyArray<SemanticComponent>;
  readonly graphBindings: ReadonlyArray<SemanticGraphBinding>;
  readonly hostNodes: ReadonlyArray<SemanticHostNode>;
  readonly events: ReadonlyArray<SemanticEvent>;
  readonly behaviors: ReadonlyArray<{
    readonly hostNodeId: string;
    readonly source: string;
  }>;
  readonly elementHandleBindings: ReadonlyArray<SemanticElementHandleBinding>;
  readonly localBindings: ReadonlyArray<SemanticLocalBinding>;
  readonly aliases: ReadonlyArray<SemanticGraphAlias>;
  readonly stateReads: ReadonlyArray<SemanticStateRead>;
  readonly templateReads: ReadonlyArray<SemanticTemplateRead>;
  readonly stateWrites: ReadonlyArray<SemanticStateWrite>;
  readonly asyncBoundaries: ReadonlyArray<{
    readonly id: string;
  }>;
  readonly diagnostics: ReadonlyArray<SemanticGraphDiagnostic>;
};
type StateLoweringInput = {
  readonly semanticGraph: SemanticGraphArtifact;
};
type StateLoweringDiagnostic = CompilerDiagnostic & {
  readonly code: 'AA_STATE_UNRESOLVED_WRITE' | 'AA_STATE_DYNAMIC_PATH_READ' | 'AA_STATE_DYNAMIC_PATH_WRITE' | 'AA_STATE_OPTIONAL_CHAIN_WRITE' | 'AA_STATE_REST_ALIAS_EXCLUDED_PATH' | 'AA_STATE_READ_ONLY_WRITE' | 'AA_STATE_CONST_REASSIGNMENT';
  readonly phase: 'state-lowering';
  readonly passId: 'state-lowering';
  readonly source: string;
};
type LoweredStateRead = {
  readonly source: string;
  readonly bindingId: string;
  readonly path: ReadonlyArray<string>;
};
type LoweredStateWrite = {
  readonly source: string;
  readonly bindingId: string;
  readonly path: ReadonlyArray<string>;
  readonly operation: SemanticStateWrite['operation'];
  readonly assignmentOperator?: string;
  readonly prefix?: boolean;
  readonly updateOperator?: SemanticStateWrite['updateOperator'];
  readonly method?: string;
  readonly argumentSources?: ReadonlyArray<string>;
};
type StateLoweringArtifact = {
  readonly passId: 'state-lowering';
  readonly reads: ReadonlyArray<LoweredStateRead>;
  readonly writes: ReadonlyArray<LoweredStateWrite>;
  readonly diagnostics: ReadonlyArray<StateLoweringDiagnostic>;
};
type PayloadArenaInput = {
  readonly semanticGraph: SemanticGraphArtifact;
  readonly stateLowering: StateLoweringArtifact;
};
type PayloadArenaDiagnostic = StateLoweringDiagnostic;
type PayloadAsyncBoundary = {
  readonly id: string;
  readonly startAnchor: {
    readonly strategy: 'dom-order-comment';
    readonly index: number;
  };
  readonly endAnchor: {
    readonly strategy: 'dom-order-comment';
    readonly index: number;
  };
  readonly asyncReads: ReadonlyArray<{
    readonly source: string;
    readonly bindingId: string;
    readonly path: ReadonlyArray<string>;
  }>;
};
type PayloadArenaArtifact = {
  readonly passId: 'payload-arena';
  readonly state: {
    readonly cells: ReadonlyArray<{
      readonly bindingId: string;
      readonly name: string;
      readonly valueKind: SemanticGraphBinding['valueKind'];
    }>;
    readonly computed: ReadonlyArray<{
      readonly bindingId: string;
      readonly name: string;
      readonly async: boolean;
    }>;
  };
  readonly view: {
    readonly locators: ReadonlyArray<{
      readonly hostNodeId: string;
      readonly strategy: 'dom-order';
      readonly index: number;
      readonly tagName: string;
    }>;
    readonly events: SemanticGraphArtifact['events'];
    readonly bindings: ReadonlyArray<{
      readonly hostNodeId: string;
      readonly source: string;
      readonly bindingId: string;
      readonly path: ReadonlyArray<string>;
    }>;
    readonly behaviors: SemanticGraphArtifact['behaviors'];
    readonly elementHandles: ReadonlyArray<{
      readonly hostNodeId: string;
      readonly handleId: string;
      readonly name: string;
    }>;
    readonly asyncBoundaries: ReadonlyArray<PayloadAsyncBoundary>;
  };
  readonly diagnostics: ReadonlyArray<PayloadArenaDiagnostic>;
};
type SymbolResolverInput = {
  readonly semanticGraph: SemanticGraphArtifact;
  readonly payloadArena: PayloadArenaArtifact;
};
type PlannedSymbol = {
  readonly id: string;
  readonly kind: 'event-handler';
  readonly hostNodeId: string;
  readonly eventName: string;
  readonly source: string;
  readonly order: number;
} | {
  readonly id: string;
  readonly kind: 'dom-binding';
  readonly hostNodeId: string;
  readonly source: string;
  readonly bindingId: string;
} | {
  readonly id: string;
  readonly kind: 'behavior';
  readonly hostNodeId: string;
  readonly source: string;
  readonly order: number;
} | {
  readonly id: string;
  readonly kind: 'async-computed-runner';
  readonly bindingId: string;
  readonly name: string;
};
type SymbolResolverPlan = {
  readonly passId: 'symbol-resolver';
  readonly dynamicImportOwner: 'generated-symbol-resolver';
  readonly symbols: ReadonlyArray<PlannedSymbol>;
  readonly syncPolicies: ReadonlyArray<{
    readonly eventId: string;
    readonly hostNodeId: string;
    readonly eventName: string;
    readonly syncPolicy?: SemanticSyncPolicy;
  }>;
  readonly diagnostics: ReadonlyArray<PayloadArenaDiagnostic>;
};
type CaptureAnalysisInput = {
  readonly semanticGraph: SemanticGraphArtifact;
  readonly symbolResolver: SymbolResolverPlan;
};
type CaptureAnalysisDiagnostic = CompilerDiagnostic & {
  readonly code: 'AA_CAPTURE_UNSUPPORTED_VALUE';
  readonly phase: 'capture-analysis';
  readonly passId: 'capture-analysis';
  readonly symbolId?: string;
  readonly source: string;
};
type CaptureAnalysisArtifact = {
  readonly passId: 'capture-analysis';
  readonly extractedSymbols: ReadonlyArray<{
    readonly symbolId: string;
    readonly kind: PlannedSymbol['kind'];
    readonly source: string;
  }>;
  readonly diagnostics: ReadonlyArray<CaptureAnalysisDiagnostic>;
};
type SymbolResolverModuleInput = {
  readonly buildId?: string;
  readonly resolverId?: string;
  readonly symbols: ReadonlyArray<{
    readonly id: string;
    readonly chunk: string;
    readonly exportName: string;
  }>;
};
type SymbolResolverModuleManifest = {
  readonly protocolVersion: number;
  readonly buildId: string | null;
  readonly resolverId: string | null;
  readonly symbols: SymbolResolverModuleInput['symbols'];
};
type ProtocolStatePayloadInput = {
  readonly semanticGraph: SemanticGraphArtifact;
  readonly payloadArena: PayloadArenaArtifact;
};
type ProtocolViewPayloadInput = {
  readonly payloadArena: PayloadArenaArtifact;
  readonly symbolResolver: SymbolResolverPlan;
};
type PayloadScriptsInput = {
  readonly protocolState: ProtocolStatePayload;
  readonly protocolView: ProtocolViewPayload;
};
type PayloadScriptsArtifact = {
  readonly payloadScripts: RenderedPayloadScripts;
  readonly renderShell: string;
};
type CompileTsrxModuleInput = SemanticGraphInput & SymbolResolverModuleInput;
type CompilerPassDefinition = {
  readonly passId: string;
  readonly description: string;
  readonly consumes: ReadonlyArray<string>;
  readonly produces: ReadonlyArray<string>;
};
type CompilerPassGraph = {
  readonly orderedPassIds: ReadonlyArray<string>;
  readonly artifacts: ReadonlyArray<string>;
};
type CompileTsrxModuleResult = {
  readonly passGraph: CompilerPassGraph;
  readonly semanticGraph: SemanticGraphArtifact;
  readonly stateLowering: StateLoweringArtifact;
  readonly payloadArena: PayloadArenaArtifact;
  readonly symbolResolver: SymbolResolverPlan;
  readonly captureAnalysis: CaptureAnalysisArtifact;
  readonly protocolState: ProtocolStatePayload;
  readonly protocolView: ProtocolViewPayload;
  readonly payloadScripts: RenderedPayloadScripts;
  readonly renderShell: string;
  readonly symbolResolverModule: string;
  readonly symbolResolverModuleManifest: SymbolResolverModuleManifest;
};
//#endregion
//#region packages/compiler/src/compile-module.d.ts
declare function compileTsrxModule(input: CompileTsrxModuleInput): Promise<CompileTsrxModuleResult>;
//#endregion
//#region packages/compiler/src/pass-graph.d.ts
declare function validateCompilerPassGraph(passes: ReadonlyArray<CompilerPassDefinition>, initialArtifacts: ReadonlyArray<string>): CompilerPassGraph;
//#endregion
//#region packages/compiler/src/pass-registry.d.ts
declare const defaultCompilerPasses: ReadonlyArray<CompilerPassDefinition>;
//#endregion
//#region packages/compiler/src/passes/capture-analysis.d.ts
declare function analyzeCaptures(input: CaptureAnalysisInput): CaptureAnalysisArtifact;
//#endregion
//#region packages/compiler/src/passes/payload-arena.d.ts
declare function planPayloadArena(input: PayloadArenaInput): PayloadArenaArtifact;
//#endregion
//#region packages/compiler/src/passes/payload-scripts.d.ts
declare function renderPayloadScriptArtifact(input: PayloadScriptsInput): PayloadScriptsArtifact;
//#endregion
//#region packages/compiler/src/passes/protocol-state.d.ts
declare function createProtocolStatePayloadFromArena(input: ProtocolStatePayloadInput): ProtocolStatePayload;
//#endregion
//#region packages/compiler/src/passes/protocol-view.d.ts
declare function createProtocolViewPayload(input: ProtocolViewPayloadInput): ProtocolViewPayload;
//#endregion
//#region packages/compiler/src/passes/semantic-graph/index.d.ts
declare function buildSemanticGraph(input: SemanticGraphInput): Promise<SemanticGraphArtifact>;
//#endregion
//#region packages/compiler/src/passes/state-lowering.d.ts
declare function lowerStateAccess(input: StateLoweringInput): StateLoweringArtifact;
//#endregion
//#region packages/compiler/src/passes/symbol-resolver-module.d.ts
declare function createSymbolResolverModuleManifest(input: SymbolResolverModuleInput): SymbolResolverModuleManifest;
declare function emitSymbolResolverModule(input: SymbolResolverModuleInput): string;
//#endregion
//#region packages/compiler/src/passes/symbol-resolver.d.ts
declare function planSymbolResolver(input: SymbolResolverInput): SymbolResolverPlan;
//#endregion
export { SymbolResolverModuleInput as $, ProtocolStatePayloadInput as A, SemanticGraphInput as B, PayloadArenaArtifact as C, PayloadScriptsArtifact as D, PayloadAsyncBoundary as E, SemanticGraphAlias as F, SemanticSyncPolicy as G, SemanticLocalBinding as H, SemanticGraphArtifact as I, SemanticTemplateRead as J, SemanticSyncPolicyAction as K, SemanticGraphBinding as L, SemanticComponent as M, SemanticElementHandleBinding as N, PayloadScriptsInput as O, SemanticEvent as P, SymbolResolverInput as Q, SemanticGraphDependency as R, LoweredStateWrite as S, PayloadArenaInput as T, SemanticStateRead as U, SemanticHostNode as V, SemanticStateWrite as W, StateLoweringDiagnostic as X, StateLoweringArtifact as Y, StateLoweringInput as Z, CompileTsrxModuleInput as _, buildSemanticGraph as a, CompilerPassGraph as b, renderPayloadScriptArtifact as c, defaultCompilerPasses as d, SymbolResolverModuleManifest as et, validateCompilerPassGraph as f, CaptureAnalysisInput as g, CaptureAnalysisDiagnostic as h, lowerStateAccess as i, SourceSpan as it, ProtocolViewPayloadInput as j, PlannedSymbol as k, planPayloadArena as l, CaptureAnalysisArtifact as m, createSymbolResolverModuleManifest as n, CompilerDiagnostic as nt, createProtocolViewPayload as o, compileTsrxModule as p, SemanticSyncPolicyCondition as q, emitSymbolResolverModule as r, DiagnosticSuggestion as rt, createProtocolStatePayloadFromArena as s, planSymbolResolver as t, SymbolResolverPlan as tt, analyzeCaptures as u, CompileTsrxModuleResult as v, PayloadArenaDiagnostic as w, LoweredStateRead as x, CompilerPassDefinition as y, SemanticGraphDiagnostic as z };