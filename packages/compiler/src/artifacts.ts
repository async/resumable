import type { ProtocolStatePayload, ProtocolViewPayload } from '@async/resumable-protocol';
import type { RenderedPayloadScripts } from '@async/resumable-serializer';
import type { CompilerDiagnostic, SourceSpan } from './diagnostics.ts';

export type { CompilerDiagnostic, DiagnosticSuggestion, SourceSpan } from './diagnostics.ts';

export type SemanticGraphInput = {
	readonly filename: string;
	readonly source: string;
};

export type SemanticComponent = {
	readonly name: string;
};

export type SemanticGraphBinding = {
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

export type SemanticGraphDependency = {
	readonly source: string;
	readonly bindingId: string;
	readonly path: ReadonlyArray<string>;
};

export type SemanticHostNode = {
	readonly id: string;
	readonly tagName: string;
};

export type SemanticSyncPolicyCondition =
	| {
			readonly type: 'and';
			readonly conditions: ReadonlyArray<SemanticSyncPolicyCondition>;
	  }
	| {
			readonly type: 'or';
			readonly conditions: ReadonlyArray<SemanticSyncPolicyCondition>;
	  }
	| {
			readonly type: 'not';
			readonly condition: SemanticSyncPolicyCondition;
	  }
	| {
			readonly type: 'graph-truthy';
			readonly bindingId: string;
			readonly path: ReadonlyArray<string>;
	  }
	| {
			readonly type: 'constant-truthy';
			readonly value: unknown;
	  }
	| {
			readonly type: 'event-equals';
			readonly field: string;
			readonly value: unknown;
	  };

export type SemanticSyncPolicyAction = 'preventDefault' | 'stopPropagation';

export type SemanticSyncPolicyBranch = {
	readonly when: SemanticSyncPolicyCondition;
	readonly actions: ReadonlyArray<SemanticSyncPolicyAction>;
};

export type SemanticSyncPolicy =
	| SemanticSyncPolicyBranch
	| {
			readonly branches: ReadonlyArray<SemanticSyncPolicyBranch>;
	  };

export type SemanticEvent = {
	readonly id: string;
	readonly hostNodeId: string;
	readonly eventName: string;
	readonly handlerCount: number;
	readonly handlerSources: ReadonlyArray<string>;
	readonly hasSyncPolicyCandidate: boolean;
	readonly syncPolicy?: SemanticSyncPolicy;
};

export type SemanticGraphDiagnostic = CompilerDiagnostic & {
	readonly code:
		| 'AA_STATE_MODULE_SCOPE'
		| 'AA_ASYNC_POST_AWAIT_READ'
		| 'AA_ASYNC_BOUNDARY_REQUIRED'
		| 'AA_ELEMENT_HANDLE_REQUIRED'
		| 'AA_ELEMENT_HANDLE_DUPLICATE'
		| 'AA_USE_HOST_ELEMENT_REQUIRED'
		| 'AA_SYNC_POLICY_UNEXTRACTABLE';
	readonly phase: 'semantic-graph' | 'sync-policy';
	readonly passId: 'tsrx-semantic-graph';
};

export type SemanticStateWrite = {
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

export type SemanticStateRead = {
	readonly source: string;
	readonly sourceSpan?: SourceSpan;
};

export type SemanticTemplateBindingTarget =
	| {
			readonly kind: 'text';
	  }
	| {
			readonly kind: 'attribute';
			readonly name: string;
	  }
	| {
			readonly kind: 'property';
			readonly name: string;
	  }
	| {
			readonly kind: 'class';
	  }
	| {
			readonly kind: 'style';
	  };

export type SemanticGraphAlias = {
	readonly name: string;
	readonly target: string;
	readonly excludedPaths?: ReadonlyArray<ReadonlyArray<string>>;
	readonly declarationKind?: SemanticGraphBinding['declarationKind'];
	readonly sourceSpan?: SourceSpan;
};

export type SemanticTemplateRead = {
	readonly source: string;
	readonly sourceSpan?: SourceSpan;
	readonly hostNodeId: string;
	readonly target: SemanticTemplateBindingTarget;
	readonly asyncBoundaryId?: string;
};

export type SemanticElementHandleBinding = {
	readonly hostNodeId: string;
	readonly handleName: string;
	readonly sourceSpan?: SourceSpan;
};

export type SemanticLocalBinding = {
	readonly name: string;
	readonly kind: 'function' | 'class-instance' | 'dom-node' | 'non-serializable-constant';
	readonly declarationKind?: SemanticGraphBinding['declarationKind'];
	readonly sourceSpan?: SourceSpan;
};

export type SemanticSyncPolicyConstant = {
	readonly name: string;
	readonly value: unknown;
};

export type SemanticGraphArtifact = {
	readonly passId: 'tsrx-semantic-graph';
	readonly filename: string;
	readonly components: ReadonlyArray<SemanticComponent>;
	readonly graphBindings: ReadonlyArray<SemanticGraphBinding>;
	readonly hostNodes: ReadonlyArray<SemanticHostNode>;
	readonly events: ReadonlyArray<SemanticEvent>;
	readonly syncPolicyConstants?: ReadonlyArray<SemanticSyncPolicyConstant>;
	readonly behaviors: ReadonlyArray<{ readonly hostNodeId: string; readonly source: string }>;
	readonly elementHandleBindings: ReadonlyArray<SemanticElementHandleBinding>;
	readonly localBindings: ReadonlyArray<SemanticLocalBinding>;
	readonly aliases: ReadonlyArray<SemanticGraphAlias>;
	readonly stateReads: ReadonlyArray<SemanticStateRead>;
	readonly templateReads: ReadonlyArray<SemanticTemplateRead>;
	readonly stateWrites: ReadonlyArray<SemanticStateWrite>;
	readonly asyncBoundaries: ReadonlyArray<{ readonly id: string }>;
	readonly diagnostics: ReadonlyArray<SemanticGraphDiagnostic>;
};

export type StateLoweringInput = {
	readonly semanticGraph: SemanticGraphArtifact;
};

export type StateLoweringDiagnostic = CompilerDiagnostic & {
	readonly code:
		| 'AA_STATE_UNRESOLVED_WRITE'
		| 'AA_STATE_DYNAMIC_PATH_READ'
		| 'AA_STATE_DYNAMIC_PATH_WRITE'
		| 'AA_STATE_OPTIONAL_CHAIN_WRITE'
		| 'AA_STATE_REST_ALIAS_EXCLUDED_PATH'
		| 'AA_STATE_READ_ONLY_WRITE'
		| 'AA_STATE_CONST_REASSIGNMENT';
	readonly phase: 'state-lowering';
	readonly passId: 'state-lowering';
	readonly source: string;
};

export type LoweredStateRead = {
	readonly source: string;
	readonly bindingId: string;
	readonly path: ReadonlyArray<string>;
};

export type LoweredStateWrite = {
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

export type StateLoweringArtifact = {
	readonly passId: 'state-lowering';
	readonly reads: ReadonlyArray<LoweredStateRead>;
	readonly writes: ReadonlyArray<LoweredStateWrite>;
	readonly diagnostics: ReadonlyArray<StateLoweringDiagnostic>;
};

export type PayloadArenaInput = {
	readonly semanticGraph: SemanticGraphArtifact;
	readonly stateLowering: StateLoweringArtifact;
};

export type PayloadArenaDiagnostic = StateLoweringDiagnostic;

export type PayloadAsyncBoundary = {
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

export type PayloadArenaArtifact = {
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
			readonly target: SemanticTemplateBindingTarget;
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

export type SymbolResolverInput = {
	readonly semanticGraph: SemanticGraphArtifact;
	readonly payloadArena: PayloadArenaArtifact;
};

export type PlannedSymbol =
	| {
			readonly id: string;
			readonly kind: 'event-handler';
			readonly hostNodeId: string;
			readonly eventName: string;
			readonly source: string;
			readonly order: number;
	  }
	| {
			readonly id: string;
			readonly kind: 'dom-binding';
			readonly hostNodeId: string;
			readonly source: string;
			readonly bindingId: string;
			readonly target: PayloadArenaArtifact['view']['bindings'][number]['target'];
	  }
	| {
			readonly id: string;
			readonly kind: 'behavior';
			readonly hostNodeId: string;
			readonly source: string;
			readonly order: number;
	  }
	| {
			readonly id: string;
			readonly kind: 'async-computed-runner';
			readonly bindingId: string;
			readonly name: string;
	  };

export type SymbolResolverPlan = {
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

export type CaptureAnalysisInput = {
	readonly semanticGraph: SemanticGraphArtifact;
	readonly symbolResolver: SymbolResolverPlan;
};

export type CaptureAnalysisDiagnostic = CompilerDiagnostic & {
	readonly code: 'AA_CAPTURE_UNSUPPORTED_VALUE';
	readonly phase: 'capture-analysis';
	readonly passId: 'capture-analysis';
	readonly symbolId?: string;
	readonly source: string;
};

export type CaptureAnalysisArtifact = {
	readonly passId: 'capture-analysis';
	readonly extractedSymbols: ReadonlyArray<{
		readonly symbolId: string;
		readonly kind: PlannedSymbol['kind'];
		readonly source: string;
	}>;
	readonly diagnostics: ReadonlyArray<CaptureAnalysisDiagnostic>;
};

export type SymbolModulesInput = {
	readonly symbolResolver: SymbolResolverPlan;
	readonly captureAnalysis: CaptureAnalysisArtifact;
};

export type GeneratedSymbolModule = {
	readonly symbolId: string;
	readonly kind: PlannedSymbol['kind'];
	readonly exportName: string;
	readonly source: string;
};

export type SymbolModulesArtifact = {
	readonly passId: 'symbol-modules';
	readonly modules: ReadonlyArray<GeneratedSymbolModule>;
	readonly diagnostics: ReadonlyArray<CaptureAnalysisDiagnostic>;
};

export type SymbolResolverModuleInput = {
	readonly buildId?: string;
	readonly resolverId?: string;
	readonly symbols: ReadonlyArray<{
		readonly id: string;
		readonly chunk: string;
		readonly exportName: string;
	}>;
};

export type SymbolResolverModuleManifest = {
	readonly protocolVersion: number;
	readonly buildId: string | null;
	readonly resolverId: string | null;
	readonly symbols: SymbolResolverModuleInput['symbols'];
};

export type ProtocolStatePayloadInput = {
	readonly semanticGraph: SemanticGraphArtifact;
	readonly payloadArena: PayloadArenaArtifact;
};

export type ProtocolViewPayloadInput = {
	readonly payloadArena: PayloadArenaArtifact;
	readonly symbolResolver: SymbolResolverPlan;
};

export type PayloadScriptsInput = {
	readonly protocolState: ProtocolStatePayload;
	readonly protocolView: ProtocolViewPayload;
};

export type PayloadScriptsArtifact = {
	readonly payloadScripts: RenderedPayloadScripts;
	readonly renderShell: string;
};

export type CompileTsrxModuleInput = SemanticGraphInput & SymbolResolverModuleInput;

export type CompilerPassDefinition = {
	readonly passId: string;
	readonly description: string;
	readonly consumes: ReadonlyArray<string>;
	readonly produces: ReadonlyArray<string>;
};

export type CompilerPassGraph = {
	readonly orderedPassIds: ReadonlyArray<string>;
	readonly artifacts: ReadonlyArray<string>;
};

export type CompileTsrxModuleResult = {
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
	readonly symbolModules: SymbolModulesArtifact;
	readonly symbolResolverModule: string;
	readonly symbolResolverModuleManifest: SymbolResolverModuleManifest;
};
