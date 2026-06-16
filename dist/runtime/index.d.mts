import { r as ProtocolStatePayload, s as ProtocolViewPayload } from "../index-Bi_snVSJ.mjs";

//#region packages/runtime/src/graph.d.ts
type RuntimeGraphCell = {
  readonly bindingId: string;
  readonly value: unknown;
};
type RuntimeGraphRead = (bindingId: string, path?: ReadonlyArray<string>) => unknown;
type RuntimeGraphComputedDependency = {
  readonly bindingId: string;
  readonly path?: ReadonlyArray<string>;
};
type RuntimeGraphComputed = {
  readonly bindingId: string;
  readonly dependencies: ReadonlyArray<RuntimeGraphComputedDependency>;
  readonly compute: (read: RuntimeGraphRead) => unknown;
};
type RuntimeGraphAsyncSnapshot = {
  readonly status: 'idle';
  readonly version: 0;
} | {
  readonly status: 'pending';
  readonly version: number;
  readonly key: unknown;
} | {
  readonly status: 'fulfilled';
  readonly version: number;
  readonly key: unknown;
  readonly value: unknown;
} | {
  readonly status: 'rejected';
  readonly version: number;
  readonly key: unknown;
  readonly error: unknown;
};
type RuntimeGraphAsyncComputed = {
  readonly bindingId: string;
  readonly dependencies: ReadonlyArray<RuntimeGraphComputedDependency>;
  readonly key: (read: RuntimeGraphRead) => unknown;
  readonly run: (input: {
    readonly key: unknown;
    readonly signal: AbortSignal;
    readonly read: RuntimeGraphRead;
  }) => unknown | Promise<unknown>;
};
type DomJournalRecord = {
  readonly type: 'setText';
  readonly locator: string;
  readonly value: unknown;
} | {
  readonly type: 'setAttr' | 'setProp';
  readonly locator: string;
  readonly name: string;
  readonly value: unknown;
} | {
  readonly type: 'insertRange';
  readonly locator: string;
  readonly fragment: unknown;
} | {
  readonly type: 'removeRange';
  readonly locator: string;
} | {
  readonly type: 'moveRange';
  readonly locator: string;
  readonly before: string;
} | {
  readonly type: 'runCleanup';
  readonly locator: string;
};
type DomJournalResult = DomJournalRecord | ReadonlyArray<DomJournalRecord>;
type DomJournalListener = (records: ReadonlyArray<DomJournalRecord>) => void | Promise<void>;
type RuntimeGraphInput = {
  readonly cells: ReadonlyArray<RuntimeGraphCell>;
  readonly computed?: ReadonlyArray<RuntimeGraphComputed>;
  readonly asyncComputed?: ReadonlyArray<RuntimeGraphAsyncComputed>;
};
type RuntimeGraphWrite = {
  readonly bindingId: string;
  readonly path?: ReadonlyArray<string>;
  readonly value: unknown;
};
type RuntimeGraphUpdate = {
  readonly bindingId: string;
  readonly path?: ReadonlyArray<string>;
  readonly update: (value: unknown) => unknown;
  readonly returnValue?: 'previous' | 'next';
};
type RuntimeGraphCall = {
  readonly bindingId: string;
  readonly path?: ReadonlyArray<string>;
  readonly method: string;
  readonly args?: ReadonlyArray<unknown>;
};
type RuntimeGraphDelete = {
  readonly bindingId: string;
  readonly path: ReadonlyArray<string>;
};
type RuntimeGraphSubscription = {
  readonly id: string;
  readonly bindingId: string;
  readonly path?: ReadonlyArray<string>;
  readonly run: (value: unknown) => DomJournalResult | void | Promise<DomJournalResult | void>;
};
type RuntimeGraph = {
  readonly read: (bindingId: string, path?: ReadonlyArray<string>) => unknown;
  readonly write: (write: RuntimeGraphWrite) => void;
  readonly update: (update: RuntimeGraphUpdate) => unknown;
  readonly call: (call: RuntimeGraphCall) => unknown;
  readonly delete: (deletion: RuntimeGraphDelete) => boolean;
  readonly subscribe: (subscription: RuntimeGraphSubscription) => void;
  readonly subscribeJournal: (listener: DomJournalListener) => () => void;
  readonly flush: () => Promise<void>;
  readonly takeJournal: () => DomJournalRecord[];
};
declare function createRuntimeGraph(input: RuntimeGraphInput): RuntimeGraph;
//#endregion
//#region packages/runtime/src/dom-journal.d.ts
type InsertRangeRecord = Extract<DomJournalRecord, {
  readonly type: 'insertRange';
}>;
type RemoveRangeRecord = Extract<DomJournalRecord, {
  readonly type: 'removeRange';
}>;
type MoveRangeRecord = Extract<DomJournalRecord, {
  readonly type: 'moveRange';
}>;
type DomJournalApplyTarget = {
  textContent?: string | null;
  setAttribute?: (name: string, value: string) => void;
  removeAttribute?: (name: string) => void;
  readonly [name: string]: unknown;
};
type DomJournalApplyOptions = {
  readonly resolveTarget: (locator: string, record: DomJournalRecord) => unknown;
  readonly runCleanup?: (cleanupId: string, record: DomJournalRecord) => void;
  readonly insertRange?: (anchorLocator: string, fragment: unknown, record: InsertRangeRecord) => void;
  readonly removeRange?: (rangeLocator: string, record: RemoveRangeRecord) => void;
  readonly moveRange?: (rangeLocator: string, beforeLocator: string, record: MoveRangeRecord) => void;
};
type BindingDomJournalInput = {
  readonly locator: string;
  readonly target: NonNullable<ProtocolViewPayload['bindings'][number]['target']>;
  readonly value: unknown;
};
declare function createBindingDomJournalRecord(input: BindingDomJournalInput): DomJournalRecord;
declare function applyDomJournalRecords(records: ReadonlyArray<DomJournalRecord>, options: DomJournalApplyOptions): void;
//#endregion
//#region packages/runtime/src/resume.d.ts
type ResumeDomNode = {
  readonly nodeType: number;
  readonly childNodes?: ReadonlyArray<ResumeDomNode>;
};
type ResumeDomElement = ResumeDomNode & {
  readonly nodeType: 1;
  readonly tagName: string;
  readonly childNodes?: ReadonlyArray<ResumeDomNode>;
  readonly parentElement?: ResumeDomElement | null;
  readonly addEventListener?: (type: string, listener: (event: ResumeDomEvent) => Promise<void>, options?: {
    readonly capture?: boolean;
  }) => void;
};
type ResumeDomComment = ResumeDomNode & {
  readonly nodeType: 8;
  readonly data?: string;
};
type ResumeDomEvent = {
  readonly type: string;
  readonly target: ResumeDomElement | null;
  readonly [key: string]: unknown;
  readonly preventDefault?: () => void;
  readonly stopPropagation?: () => void;
};
type ResumeVisibilityEntry = {
  readonly target: ResumeDomElement;
  readonly isIntersecting?: boolean;
  readonly intersectionRatio?: number;
};
type ResumeVisibilityObserver = {
  readonly observe: (element: ResumeDomElement) => void;
  readonly unobserve?: (element: ResumeDomElement) => void;
  readonly disconnect?: () => void;
};
type ResumeVisibilityObserverFactory = (callback: (entries: ReadonlyArray<ResumeVisibilityEntry>) => void) => ResumeVisibilityObserver;
type ResumeSyncPolicyCondition = {
  readonly type: 'and';
  readonly conditions: ReadonlyArray<ResumeSyncPolicyCondition>;
} | {
  readonly type: 'or';
  readonly conditions: ReadonlyArray<ResumeSyncPolicyCondition>;
} | {
  readonly type: 'not';
  readonly condition: ResumeSyncPolicyCondition;
} | {
  readonly type: 'graph-truthy';
  readonly bindingId: string;
  readonly path?: ReadonlyArray<string>;
} | {
  readonly type: 'constant-truthy';
  readonly value: unknown;
} | {
  readonly type: 'event-equals';
  readonly field: string;
  readonly value: unknown;
};
type ResumeSyncPolicyBranch = {
  readonly when: ResumeSyncPolicyCondition;
  readonly actions: ReadonlyArray<'preventDefault' | 'stopPropagation'>;
};
type ResumeSyncPolicy = ResumeSyncPolicyBranch | {
  readonly branches: ReadonlyArray<ResumeSyncPolicyBranch>;
};
type ResumeEventRecord = {
  readonly hostNodeId: string;
  readonly eventName: string;
  readonly syncPolicy?: ResumeSyncPolicy;
  readonly symbolIds: ReadonlyArray<string>;
};
type ResumeAsyncBoundaryRecord = {
  readonly id: string;
  readonly startAnchor: ResumeDomComment;
  readonly endAnchor: ResumeDomComment;
  readonly asyncReads: ProtocolViewPayload['asyncBoundaries'][number]['asyncReads'];
};
type ResumeAsyncBoundaryRead = ProtocolViewPayload['asyncBoundaries'][number]['asyncReads'][number];
type ResumeViewRecord = {
  readonly locators: ReadonlyArray<{
    readonly hostNodeId: string;
    readonly strategy: 'dom-order';
    readonly index: number;
    readonly tagName: string;
  }>;
  readonly events: ReadonlyArray<ResumeEventRecord>;
  readonly bindings: ProtocolViewPayload['bindings'];
  readonly behaviors: ProtocolViewPayload['behaviors'];
  readonly elementHandles: ProtocolViewPayload['elementHandles'];
  readonly asyncBoundaries: ProtocolViewPayload['asyncBoundaries'];
};
type ResumeSymbolContext = {
  readonly graph: RuntimeGraph;
  readonly event?: ResumeDomEvent;
  readonly element: ResumeDomElement;
  readonly getElementHandle: (handleIdOrName: string) => ResumeDomElement | undefined;
  readonly binding?: ProtocolViewPayload['bindings'][number];
  readonly value?: unknown;
  readonly asyncBoundary?: ResumeAsyncBoundaryRecord;
  readonly asyncRead?: ResumeAsyncBoundaryRead;
};
type ResumeBehaviorCleanup = () => void;
type ResumeSymbol = (context: ResumeSymbolContext) => void | DomJournalResult | ResumeBehaviorCleanup | Promise<void | DomJournalResult | ResumeBehaviorCleanup>;
type ResumeRuntimeInput = {
  readonly root: ResumeDomElement;
  readonly graph: RuntimeGraph;
  readonly view: ResumeViewRecord;
  readonly loadSymbol: (symbolId: string) => ResumeSymbol | Promise<ResumeSymbol>;
  readonly createVisibilityObserver?: ResumeVisibilityObserverFactory;
  readonly applyDomJournal?: (records: ReadonlyArray<DomJournalRecord>) => void | Promise<void>;
};
type ResumeRuntime = {
  readonly start: () => Promise<void>;
  readonly dispatch: (event: ResumeDomEvent) => Promise<void>;
  readonly getElement: (hostNodeId: string) => ResumeDomElement | undefined;
  readonly getAsyncBoundary: (boundaryId: string) => ResumeAsyncBoundaryRecord | undefined;
  readonly disposeHost: (hostNodeId: string) => void;
};
type RuntimeResumeErrorCode = 'AA_RESUME_LOCATOR_MISSING' | 'AA_RESUME_LOCATOR_MISMATCH';
type RuntimeResumeDiagnostic = {
  readonly code: RuntimeResumeErrorCode;
  readonly severity: 'error';
  readonly phase: 'resume';
  readonly title: string;
  readonly message: string;
  readonly why: string;
  readonly hostNodeId?: string;
  readonly boundaryId?: string;
  readonly elementLocator?: string;
  readonly expectedTagName?: string;
  readonly actualTagName?: string;
  readonly suggestions: ReadonlyArray<{
    readonly message: string;
  }>;
  readonly docsUrl: string;
};
declare class RuntimeResumeError extends Error implements RuntimeResumeDiagnostic {
  readonly code: RuntimeResumeErrorCode;
  readonly severity: 'error';
  readonly phase: 'resume';
  readonly title: string;
  readonly why: string;
  readonly hostNodeId?: string;
  readonly boundaryId?: string;
  readonly elementLocator?: string;
  readonly expectedTagName?: string;
  readonly actualTagName?: string;
  readonly suggestions: ReadonlyArray<{
    readonly message: string;
  }>;
  readonly docsUrl: string;
  constructor(diagnostic: RuntimeResumeDiagnostic);
}
declare function createResumeRuntime(input: ResumeRuntimeInput): ResumeRuntime;
//#endregion
//#region packages/runtime/src/payload.d.ts
type EncodedPayloadScripts = {
  readonly stateScript: string;
  readonly viewScript: string;
};
type PayloadScriptElement = {
  readonly textContent?: string | null;
  readonly text?: string | null;
  readonly innerHTML?: string | null;
};
type PayloadScriptDocument = {
  readonly querySelector: (selector: string) => PayloadScriptElement | null;
};
type DecodedPayloadScripts = {
  readonly state: ProtocolStatePayload;
  readonly view: ProtocolViewPayload;
};
type ResumePayloadScriptsInput = EncodedPayloadScripts & {
  readonly root: ResumeDomElement;
  readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
  readonly createVisibilityObserver?: ResumeRuntimeInput['createVisibilityObserver'];
  readonly applyDomJournal?: ResumeRuntimeInput['applyDomJournal'];
};
type ResumePayloadDocumentInput = Omit<ResumePayloadScriptsInput, 'stateScript' | 'viewScript'> & {
  readonly document: PayloadScriptDocument;
};
type ResumePayloadScriptsResult = {
  readonly decoded: DecodedPayloadScripts;
  readonly graph: RuntimeGraph;
  readonly runtime: ResumeRuntime;
};
type RuntimePayloadType = 'async/state' | 'async/view';
type RuntimePayloadErrorCode = 'AA_PAYLOAD_INVALID' | 'AA_PROTOCOL_VERSION_MISMATCH';
type RuntimePayloadDiagnostic = {
  readonly code: RuntimePayloadErrorCode;
  readonly severity: 'error';
  readonly phase: 'payload';
  readonly title: string;
  readonly message: string;
  readonly why: string;
  readonly payloadType: RuntimePayloadType;
  readonly payloadScript: string;
  readonly expectedVersion?: number;
  readonly actualVersion?: unknown;
  readonly suggestions: ReadonlyArray<{
    readonly message: string;
  }>;
  readonly docsUrl: string;
};
declare class RuntimePayloadError extends Error implements RuntimePayloadDiagnostic {
  readonly code: RuntimePayloadErrorCode;
  readonly severity: 'error';
  readonly phase: 'payload';
  readonly title: string;
  readonly why: string;
  readonly payloadType: RuntimePayloadType;
  readonly payloadScript: string;
  readonly expectedVersion?: number;
  readonly actualVersion?: unknown;
  readonly suggestions: ReadonlyArray<{
    readonly message: string;
  }>;
  readonly docsUrl: string;
  constructor(diagnostic: RuntimePayloadDiagnostic);
}
declare function decodePayloadScripts(input: EncodedPayloadScripts): DecodedPayloadScripts;
declare function readPayloadScriptsFromDocument(document: PayloadScriptDocument): EncodedPayloadScripts;
declare function decodePayloadScriptsFromDocument(document: PayloadScriptDocument): DecodedPayloadScripts;
declare function createRuntimeGraphFromStatePayload(payload: ProtocolStatePayload): RuntimeGraph;
declare function resumeFromPayloadScripts(input: ResumePayloadScriptsInput): Promise<ResumePayloadScriptsResult>;
declare function resumeFromPayloadDocument(input: ResumePayloadDocumentInput): Promise<ResumePayloadScriptsResult>;
//#endregion
export { BindingDomJournalInput, DecodedPayloadScripts, DomJournalApplyOptions, DomJournalApplyTarget, DomJournalListener, DomJournalRecord, DomJournalResult, EncodedPayloadScripts, PayloadScriptDocument, PayloadScriptElement, ResumeAsyncBoundaryRead, ResumeAsyncBoundaryRecord, ResumeBehaviorCleanup, ResumeDomComment, ResumeDomElement, ResumeDomEvent, ResumeDomNode, ResumeEventRecord, ResumePayloadDocumentInput, ResumePayloadScriptsInput, ResumePayloadScriptsResult, ResumeRuntime, ResumeRuntimeInput, ResumeSymbol, ResumeSymbolContext, ResumeSyncPolicy, ResumeSyncPolicyBranch, ResumeSyncPolicyCondition, ResumeViewRecord, ResumeVisibilityEntry, ResumeVisibilityObserver, ResumeVisibilityObserverFactory, RuntimeGraph, RuntimeGraphAsyncComputed, RuntimeGraphAsyncSnapshot, RuntimeGraphCall, RuntimeGraphCell, RuntimeGraphComputed, RuntimeGraphComputedDependency, RuntimeGraphDelete, RuntimeGraphInput, RuntimeGraphRead, RuntimeGraphSubscription, RuntimeGraphUpdate, RuntimeGraphWrite, RuntimePayloadDiagnostic, RuntimePayloadError, RuntimePayloadErrorCode, RuntimePayloadType, RuntimeResumeDiagnostic, RuntimeResumeError, RuntimeResumeErrorCode, applyDomJournalRecords, createBindingDomJournalRecord, createResumeRuntime, createRuntimeGraph, createRuntimeGraphFromStatePayload, decodePayloadScripts, decodePayloadScriptsFromDocument, readPayloadScriptsFromDocument, resumeFromPayloadDocument, resumeFromPayloadScripts };