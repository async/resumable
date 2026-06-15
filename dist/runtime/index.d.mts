import { o as ProtocolViewPayload, r as ProtocolStatePayload } from "../index-CkXNK4ag.mjs";

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
  readonly type: 'insertRange' | 'removeRange' | 'moveRange' | 'runCleanup';
  readonly locator: string;
  readonly before?: string;
};
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
  readonly run: (value: unknown) => DomJournalRecord | void | Promise<DomJournalRecord | void>;
};
type RuntimeGraph = {
  readonly read: (bindingId: string, path?: ReadonlyArray<string>) => unknown;
  readonly write: (write: RuntimeGraphWrite) => void;
  readonly update: (update: RuntimeGraphUpdate) => unknown;
  readonly call: (call: RuntimeGraphCall) => unknown;
  readonly delete: (deletion: RuntimeGraphDelete) => boolean;
  readonly subscribe: (subscription: RuntimeGraphSubscription) => void;
  readonly flush: () => Promise<void>;
  readonly takeJournal: () => DomJournalRecord[];
};
declare function createRuntimeGraph(input: RuntimeGraphInput): RuntimeGraph;
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
  readonly type: 'event-equals';
  readonly field: string;
  readonly value: unknown;
};
type ResumeSyncPolicy = {
  readonly when: ResumeSyncPolicyCondition;
  readonly actions: ReadonlyArray<'preventDefault' | 'stopPropagation'>;
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
  readonly asyncBoundary?: ResumeAsyncBoundaryRecord;
  readonly asyncRead?: ResumeAsyncBoundaryRead;
};
type ResumeBehaviorCleanup = () => void;
type ResumeSymbol = (context: ResumeSymbolContext) => void | DomJournalRecord | ResumeBehaviorCleanup | Promise<void | DomJournalRecord | ResumeBehaviorCleanup>;
type ResumeRuntimeInput = {
  readonly root: ResumeDomElement;
  readonly graph: RuntimeGraph;
  readonly view: ResumeViewRecord;
  readonly loadSymbol: (symbolId: string) => ResumeSymbol | Promise<ResumeSymbol>;
};
type ResumeRuntime = {
  readonly start: () => Promise<void>;
  readonly dispatch: (event: ResumeDomEvent) => Promise<void>;
  readonly getElement: (hostNodeId: string) => ResumeDomElement | undefined;
  readonly getAsyncBoundary: (boundaryId: string) => ResumeAsyncBoundaryRecord | undefined;
  readonly disposeHost: (hostNodeId: string) => void;
};
declare function createResumeRuntime(input: ResumeRuntimeInput): ResumeRuntime;
//#endregion
//#region packages/runtime/src/payload.d.ts
type EncodedPayloadScripts = {
  readonly stateScript: string;
  readonly viewScript: string;
};
type DecodedPayloadScripts = {
  readonly state: ProtocolStatePayload;
  readonly view: ProtocolViewPayload;
};
type ResumePayloadScriptsInput = EncodedPayloadScripts & {
  readonly root: ResumeDomElement;
  readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
};
type ResumePayloadScriptsResult = {
  readonly decoded: DecodedPayloadScripts;
  readonly graph: RuntimeGraph;
  readonly runtime: ResumeRuntime;
};
declare function decodePayloadScripts(input: EncodedPayloadScripts): DecodedPayloadScripts;
declare function createRuntimeGraphFromStatePayload(payload: ProtocolStatePayload): RuntimeGraph;
declare function resumeFromPayloadScripts(input: ResumePayloadScriptsInput): Promise<ResumePayloadScriptsResult>;
//#endregion
export { DecodedPayloadScripts, DomJournalRecord, EncodedPayloadScripts, ResumeAsyncBoundaryRead, ResumeAsyncBoundaryRecord, ResumeBehaviorCleanup, ResumeDomComment, ResumeDomElement, ResumeDomEvent, ResumeDomNode, ResumeEventRecord, ResumePayloadScriptsInput, ResumePayloadScriptsResult, ResumeRuntime, ResumeRuntimeInput, ResumeSymbol, ResumeSymbolContext, ResumeSyncPolicy, ResumeSyncPolicyCondition, ResumeViewRecord, RuntimeGraph, RuntimeGraphAsyncComputed, RuntimeGraphAsyncSnapshot, RuntimeGraphCall, RuntimeGraphCell, RuntimeGraphComputed, RuntimeGraphComputedDependency, RuntimeGraphDelete, RuntimeGraphInput, RuntimeGraphRead, RuntimeGraphSubscription, RuntimeGraphUpdate, RuntimeGraphWrite, createResumeRuntime, createRuntimeGraph, createRuntimeGraphFromStatePayload, decodePayloadScripts, resumeFromPayloadScripts };