export type {
	BindingRead,
	BindingAlias,
	BranchAnchor,
	ComputedSite,
	DestructuredAlias,
	ElementHandle,
	ElementHandleBinding,
	EmptyFallback,
	EventProp,
	HostNode,
	KeyedLoop,
	SemanticGraphInput,
	SourceSpan,
	StatePathSegment,
	TsrxSemanticGraph,
	StateSite,
	StateWrite,
	TextBinding,
} from './semantic-graph.ts';

export { buildSemanticGraph } from './semantic-graph.ts';

export type {
	BehaviorHostLocatorRecord,
	BranchAnchorLocatorRecord,
	CommentLocatorRecord,
	ElementHandleLocatorRecord,
	ElementLocatorRecord,
	EmptyFallbackLocatorRecord,
	KeyedListLocatorRecord,
	LocatorOwnerKind,
	LocatorStrategy,
	PayloadLocatorPlanningArtifact,
	PayloadLocatorStreamRecord,
	SkipLocatorRecord,
	TextBindingLocatorRecord,
} from './payload-locators.ts';

export { planPayloadLocators } from './payload-locators.ts';

export type {
	LoweredStateOperation,
	StateLoweringArtifact,
	StateLoweringDiagnostic,
} from './state-lowering.ts';

export { lowerStateLvalues } from './state-lowering.ts';

export type {
	SyncEventHandlerRecord,
	SyncEventLazyWrite,
	SyncEventPolicyArtifact,
	SyncEventPolicyDiagnostic,
	SyncEventPolicyInput,
	SyncPolicyMethod,
	SyncPolicyRecord,
} from './sync-event-policy.ts';

export { extractSyncEventPolicies } from './sync-event-policy.ts';

export type {
	AsyncRunnerSymbolRecord,
	BehaviorSymbolRecord,
	BindingUpdateKind,
	BindingUpdateSymbolRecord,
	EventHandlerSymbolRecord,
	FailClosedSymbolCase,
	GeneratedResolverPlan,
	InlineSyncPolicyRecord,
	SymbolImportOwner,
	SymbolResolverInput,
	SymbolResolverPlanningArtifact,
} from './symbol-resolver.ts';

export { planSymbolResolver } from './symbol-resolver.ts';

export type {
	SerializerBehaviorRecord,
	SerializerBuiltinRecord,
	SerializerClassRestorePlan,
	SerializerCycleEdge,
	SerializerCyclePlan,
	SerializerDiagnostic,
	SerializerIdentityPlan,
	SerializerValueClassification,
	SerializerValueTier,
	SerializerValuesInput,
	SerializerValuesPlanningArtifact,
} from './serializer-values.ts';

export { planSerializerValues } from './serializer-values.ts';

export type {
	AsyncRunnerPlan,
	CleanupJournalPlan,
	DomLocatorJournalTarget,
	ErrorJournalPlan,
	InvalidationRootPlan,
	JournalRecordPlan,
	JournalTargetModel,
	OrderedHandlerGroupPlan,
	RangeJournalPlan,
	SchedulerJournalInput,
	SchedulerJournalPlanningArtifact,
	SchedulerPlan,
	StaleCompletionCase,
	WriteBatchPlan,
	WritePlan,
} from './scheduler-journal.ts';

export { planSchedulerJournal } from './scheduler-journal.ts';

export type {
	BundlerPipelineTransformArtifact,
	BundlerPipelineTransformInput,
	BundlerTransformedModule,
} from './bundler-pipeline.ts';

export { portableFingerprint, transformTsrxForBundler } from './bundler-pipeline.ts';
