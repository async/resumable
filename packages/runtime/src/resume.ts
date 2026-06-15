import type { ProtocolViewPayload } from '@async/resumable-protocol';
import type { DomJournalRecord, DomJournalResult, RuntimeGraph } from './graph.ts';

export type ResumeDomNode = {
	readonly nodeType: number;
	readonly childNodes?: ReadonlyArray<ResumeDomNode>;
};

export type ResumeDomElement = ResumeDomNode & {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly childNodes?: ReadonlyArray<ResumeDomNode>;
	readonly parentElement?: ResumeDomElement | null;
	readonly addEventListener?: (
		type: string,
		listener: (event: ResumeDomEvent) => Promise<void>,
		options?: { readonly capture?: boolean },
	) => void;
};

export type ResumeDomComment = ResumeDomNode & {
	readonly nodeType: 8;
	readonly data?: string;
};

export type ResumeDomEvent = {
	readonly type: string;
	readonly target: ResumeDomElement | null;
	readonly [key: string]: unknown;
	readonly preventDefault?: () => void;
	readonly stopPropagation?: () => void;
};

export type ResumeVisibilityEntry = {
	readonly target: ResumeDomElement;
	readonly isIntersecting?: boolean;
	readonly intersectionRatio?: number;
};

export type ResumeVisibilityObserver = {
	readonly observe: (element: ResumeDomElement) => void;
	readonly unobserve?: (element: ResumeDomElement) => void;
	readonly disconnect?: () => void;
};

export type ResumeVisibilityObserverFactory = (
	callback: (entries: ReadonlyArray<ResumeVisibilityEntry>) => void,
) => ResumeVisibilityObserver;

type ResumeVisibilityObserverConstructor = new (
	callback: (entries: ReadonlyArray<ResumeVisibilityEntry>) => void,
) => ResumeVisibilityObserver;

export type ResumeSyncPolicyCondition =
	| {
			readonly type: 'and';
			readonly conditions: ReadonlyArray<ResumeSyncPolicyCondition>;
	  }
	| {
			readonly type: 'or';
			readonly conditions: ReadonlyArray<ResumeSyncPolicyCondition>;
	  }
	| {
			readonly type: 'not';
			readonly condition: ResumeSyncPolicyCondition;
	  }
	| {
			readonly type: 'graph-truthy';
			readonly bindingId: string;
			readonly path?: ReadonlyArray<string>;
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

export type ResumeSyncPolicyBranch = {
	readonly when: ResumeSyncPolicyCondition;
	readonly actions: ReadonlyArray<'preventDefault' | 'stopPropagation'>;
};

export type ResumeSyncPolicy =
	| ResumeSyncPolicyBranch
	| {
			readonly branches: ReadonlyArray<ResumeSyncPolicyBranch>;
	  };

export type ResumeEventRecord = {
	readonly hostNodeId: string;
	readonly eventName: string;
	readonly syncPolicy?: ResumeSyncPolicy;
	readonly symbolIds: ReadonlyArray<string>;
};

export type ResumeAsyncBoundaryRecord = {
	readonly id: string;
	readonly startAnchor: ResumeDomComment;
	readonly endAnchor: ResumeDomComment;
	readonly asyncReads: ProtocolViewPayload['asyncBoundaries'][number]['asyncReads'];
};

export type ResumeAsyncBoundaryRead =
	ProtocolViewPayload['asyncBoundaries'][number]['asyncReads'][number];

export type ResumeViewRecord = {
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

export type ResumeSymbolContext = {
	readonly graph: RuntimeGraph;
	readonly event?: ResumeDomEvent;
	readonly element: ResumeDomElement;
	readonly getElementHandle: (handleIdOrName: string) => ResumeDomElement | undefined;
	readonly binding?: ProtocolViewPayload['bindings'][number];
	readonly value?: unknown;
	readonly asyncBoundary?: ResumeAsyncBoundaryRecord;
	readonly asyncRead?: ResumeAsyncBoundaryRead;
};

export type ResumeBehaviorCleanup = () => void;

export type ResumeSymbol = (
	context: ResumeSymbolContext,
) =>
	| void
	| DomJournalResult
	| ResumeBehaviorCleanup
	| Promise<void | DomJournalResult | ResumeBehaviorCleanup>;

export type ResumeRuntimeInput = {
	readonly root: ResumeDomElement;
	readonly graph: RuntimeGraph;
	readonly view: ResumeViewRecord;
	readonly loadSymbol: (symbolId: string) => ResumeSymbol | Promise<ResumeSymbol>;
	readonly createVisibilityObserver?: ResumeVisibilityObserverFactory;
	readonly applyDomJournal?: (records: ReadonlyArray<DomJournalRecord>) => void | Promise<void>;
};

export type ResumeRuntime = {
	readonly start: () => Promise<void>;
	readonly dispatch: (event: ResumeDomEvent) => Promise<void>;
	readonly getElement: (hostNodeId: string) => ResumeDomElement | undefined;
	readonly getAsyncBoundary: (boundaryId: string) => ResumeAsyncBoundaryRecord | undefined;
	readonly disposeHost: (hostNodeId: string) => void;
};

export type RuntimeResumeErrorCode = 'AA_RESUME_LOCATOR_MISSING' | 'AA_RESUME_LOCATOR_MISMATCH';

export type RuntimeResumeDiagnostic = {
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
	readonly suggestions: ReadonlyArray<{ readonly message: string }>;
	readonly docsUrl: string;
};

export class RuntimeResumeError extends Error implements RuntimeResumeDiagnostic {
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
	readonly suggestions: ReadonlyArray<{ readonly message: string }>;
	readonly docsUrl: string;

	constructor(diagnostic: RuntimeResumeDiagnostic) {
		super(diagnostic.message);
		this.name = 'RuntimeResumeError';
		this.code = diagnostic.code;
		this.severity = diagnostic.severity;
		this.phase = diagnostic.phase;
		this.title = diagnostic.title;
		this.why = diagnostic.why;
		this.hostNodeId = diagnostic.hostNodeId;
		this.boundaryId = diagnostic.boundaryId;
		this.elementLocator = diagnostic.elementLocator;
		this.expectedTagName = diagnostic.expectedTagName;
		this.actualTagName = diagnostic.actualTagName;
		this.suggestions = diagnostic.suggestions;
		this.docsUrl = diagnostic.docsUrl;
	}
}

export function createResumeRuntime(input: ResumeRuntimeInput): ResumeRuntime {
	const elementsByHostId = materializeDomLocators(input.root, input.view.locators);
	const asyncBoundariesById = materializeAsyncBoundaryLocators(
		input.root,
		input.view.asyncBoundaries,
	);
	const eventRecords = new WeakMap<ResumeDomElement, Map<string, ResumeEventRecord>>();
	const visibleRecords = new WeakMap<ResumeDomElement, ResumeEventRecord>();
	const visibleEntries: Array<{
		readonly element: ResumeDomElement;
		readonly eventRecord: ResumeEventRecord;
	}> = [];
	const visibleElementsByHostId = new Map<string, ResumeDomElement>();
	const activeVisibleElements = new Set<ResumeDomElement>();
	const disposedHosts = new Set<string>();
	const eventTypes = new Set<string>();
	const elementHandles = materializeElementHandles(elementsByHostId, input.view.elementHandles);
	const hostCleanups = new Map<string, ResumeBehaviorCleanup[]>();
	if (input.applyDomJournal) {
		input.graph.subscribeJournal(input.applyDomJournal);
	}
	let visibilityObserver: ResumeVisibilityObserver | undefined;

	for (const eventRecord of input.view.events) {
		const element = elementsByHostId.get(eventRecord.hostNodeId);
		if (!element) continue;

		if (eventRecord.eventName === 'visible') {
			visibleRecords.set(element, eventRecord);
			visibleEntries.push({ element, eventRecord });
			visibleElementsByHostId.set(eventRecord.hostNodeId, element);
			continue;
		}

		let recordsByEventName = eventRecords.get(element);
		if (!recordsByEventName) {
			recordsByEventName = new Map();
			eventRecords.set(element, recordsByEventName);
		}
		recordsByEventName.set(eventRecord.eventName, eventRecord);
		eventTypes.add(eventRecord.eventName);
	}

	for (const binding of input.view.bindings) {
		if (!binding.symbolId) continue;

		const element = elementsByHostId.get(binding.hostNodeId);
		if (!element) continue;

		input.graph.subscribe({
			id: `view-binding:${binding.hostNodeId}:${binding.bindingId}:${binding.path.join('.')}`,
			bindingId: binding.bindingId,
			path: binding.path,
			async run(value) {
				const symbol = await input.loadSymbol(binding.symbolId!);
				return await symbol({
					graph: input.graph,
					element,
					getElementHandle: elementHandles.get,
					binding,
					value,
				});
			},
		});
	}

	for (const boundary of asyncBoundariesById.values()) {
		for (const asyncRead of boundary.asyncReads) {
			if (!asyncRead.runnerSymbolId) continue;

			input.graph.subscribe({
				id: `async-boundary:${boundary.id}:${asyncRead.bindingId}:${asyncRead.path.join('.')}`,
				bindingId: asyncRead.bindingId,
				path: asyncRead.path,
				async run() {
					const symbol = await input.loadSymbol(asyncRead.runnerSymbolId!);
					return await symbol({
						graph: input.graph,
						element: input.root,
						getElementHandle: elementHandles.get,
						asyncBoundary: boundary,
						asyncRead,
					});
				},
			});
		}
	}

	async function dispatch(event: ResumeDomEvent): Promise<void> {
		const target = event.target;
		if (!target) return;

		const matched = findEventRecord(target, event.type, eventRecords);
		if (!matched) return;

		const { element, eventRecord } = matched;

		if (eventRecord.syncPolicy)
			runSyncPolicyActions(eventRecord.syncPolicy, input.graph, event);

		try {
			for (const symbolId of eventRecord.symbolIds) {
				const symbol = await input.loadSymbol(symbolId);
				await symbol({
					graph: input.graph,
					event,
					element,
					getElementHandle: elementHandles.get,
				});
			}
		} finally {
			await input.graph.flush();
		}
	}

	async function installBehaviors(): Promise<void> {
		for (const behavior of input.view.behaviors) {
			if (!behavior.symbolId) continue;

			const element = elementsByHostId.get(behavior.hostNodeId);
			if (!element) continue;

			const symbol = await input.loadSymbol(behavior.symbolId);
			const result = await symbol({
				graph: input.graph,
				element,
				getElementHandle: elementHandles.get,
			});

			if (typeof result === 'function') {
				storeHostCleanup(behavior.hostNodeId, result);
			}
		}
	}

	function storeHostCleanup(hostNodeId: string, cleanup: ResumeBehaviorCleanup): void {
		const cleanups = hostCleanups.get(hostNodeId) ?? [];
		cleanups.push(cleanup);
		hostCleanups.set(hostNodeId, cleanups);
	}

	async function runVisibleEvent(
		element: ResumeDomElement,
		eventRecord: ResumeEventRecord,
	): Promise<void> {
		try {
			for (const symbolId of eventRecord.symbolIds) {
				const symbol = await input.loadSymbol(symbolId);
				const result = await symbol({
					graph: input.graph,
					element,
					getElementHandle: elementHandles.get,
				});

				if (typeof result === 'function') {
					storeHostCleanup(eventRecord.hostNodeId, result);
				}
			}
		} finally {
			await input.graph.flush();
		}
	}

	function installVisibilityObserver(): void {
		const createObserver = input.createVisibilityObserver ?? defaultVisibilityObserverFactory();
		if (visibleEntries.length === 0 || !createObserver) return;

		const fired = new WeakSet<ResumeDomElement>();
		const observer = createObserver((entries) => {
			for (const entry of entries) {
				if (!isVisibleEntry(entry) || fired.has(entry.target)) continue;

				const eventRecord = visibleRecords.get(entry.target);
				if (!eventRecord) continue;
				if (disposedHosts.has(eventRecord.hostNodeId)) continue;

				fired.add(entry.target);
				visibleRecords.delete(entry.target);
				activeVisibleElements.delete(entry.target);
				visibilityObserver?.unobserve?.(entry.target);
				void runVisibleEvent(entry.target, eventRecord);
			}
		});
		visibilityObserver = observer;

		for (const { element } of visibleEntries) {
			const eventRecord = visibleRecords.get(element);
			if (!eventRecord || disposedHosts.has(eventRecord.hostNodeId)) continue;

			activeVisibleElements.add(element);
			observer.observe(element);
		}
	}

	async function demandAsyncBoundaries(): Promise<void> {
		for (const boundary of asyncBoundariesById.values()) {
			for (const asyncRead of boundary.asyncReads) {
				input.graph.read(asyncRead.bindingId, asyncRead.path);
			}
		}

		await input.graph.flush();
	}

	return {
		async start() {
			for (const eventType of eventTypes) {
				input.root.addEventListener?.(eventType, dispatch, { capture: true });
			}

			installVisibilityObserver();
			await installBehaviors();
			await demandAsyncBoundaries();
		},
		dispatch,
		getElement(hostNodeId) {
			return elementsByHostId.get(hostNodeId);
		},
		getAsyncBoundary(boundaryId) {
			return asyncBoundariesById.get(boundaryId);
		},
		disposeHost(hostNodeId) {
			disposedHosts.add(hostNodeId);
			const element = elementsByHostId.get(hostNodeId);
			const visibleElement = visibleElementsByHostId.get(hostNodeId) ?? element;
			if (element) {
				eventRecords.delete(element);
				elementsByHostId.delete(hostNodeId);
			}
			if (visibleElement) {
				visibleRecords.delete(visibleElement);
				if (activeVisibleElements.has(visibleElement)) {
					visibilityObserver?.unobserve?.(visibleElement);
					activeVisibleElements.delete(visibleElement);
				}
			}
			visibleElementsByHostId.delete(hostNodeId);
			elementHandles.deleteHost(hostNodeId);

			const cleanups = hostCleanups.get(hostNodeId) ?? [];
			for (const cleanup of [...cleanups].reverse()) {
				cleanup();
			}
			hostCleanups.delete(hostNodeId);
		},
	};
}

function isVisibleEntry(entry: ResumeVisibilityEntry): boolean {
	return entry.isIntersecting === true || (entry.intersectionRatio ?? 0) > 0;
}

function defaultVisibilityObserverFactory(): ResumeVisibilityObserverFactory | undefined {
	const observer = (
		globalThis as {
			readonly IntersectionObserver?: ResumeVisibilityObserverConstructor;
		}
	).IntersectionObserver;
	if (!observer) return undefined;

	return (callback) => new observer(callback);
}

function materializeElementHandles(
	elementsByHostId: Map<string, ResumeDomElement>,
	handles: ResumeViewRecord['elementHandles'],
): {
	readonly get: (handleIdOrName: string) => ResumeDomElement | undefined;
	readonly deleteHost: (hostNodeId: string) => void;
} {
	const byHandleId = new Map<string, ResumeDomElement>();
	const byName = new Map<string, ResumeDomElement>();
	const keysByHostId = new Map<string, { readonly handleId: string; readonly name: string }>();

	for (const handle of handles) {
		const element = elementsByHostId.get(handle.hostNodeId);
		if (!element) continue;

		byHandleId.set(handle.handleId, element);
		byName.set(handle.name, element);
		keysByHostId.set(handle.hostNodeId, {
			handleId: handle.handleId,
			name: handle.name,
		});
	}

	return {
		get(handleIdOrName) {
			return byHandleId.get(handleIdOrName) ?? byName.get(handleIdOrName);
		},
		deleteHost(hostNodeId) {
			const keys = keysByHostId.get(hostNodeId);
			if (!keys) return;

			byHandleId.delete(keys.handleId);
			byName.delete(keys.name);
			keysByHostId.delete(hostNodeId);
		},
	};
}

function materializeAsyncBoundaryLocators(
	root: ResumeDomElement,
	boundaries: ResumeViewRecord['asyncBoundaries'],
): Map<string, ResumeAsyncBoundaryRecord> {
	const comments = walkComments(root);
	const byBoundaryId = new Map<string, ResumeAsyncBoundaryRecord>();

	for (const boundary of boundaries) {
		const startAnchor = comments[boundary.startAnchor.index];
		const endAnchor = comments[boundary.endAnchor.index];
		if (!startAnchor) {
			throw missingCommentAnchorError(boundary.id, 'startAnchor', boundary.startAnchor.index);
		}
		if (!endAnchor) {
			throw missingCommentAnchorError(boundary.id, 'endAnchor', boundary.endAnchor.index);
		}

		byBoundaryId.set(boundary.id, {
			id: boundary.id,
			startAnchor,
			endAnchor,
			asyncReads: boundary.asyncReads,
		});
	}

	return byBoundaryId;
}

function findEventRecord(
	target: ResumeDomElement,
	eventName: string,
	eventRecords: WeakMap<ResumeDomElement, Map<string, ResumeEventRecord>>,
): { readonly element: ResumeDomElement; readonly eventRecord: ResumeEventRecord } | null {
	let current: ResumeDomElement | null | undefined = target;

	while (current) {
		const eventRecord = eventRecords.get(current)?.get(eventName);
		if (eventRecord) return { element: current, eventRecord };

		current = current.parentElement;
	}

	return null;
}

function materializeDomLocators(
	root: ResumeDomElement,
	locators: ResumeViewRecord['locators'],
): Map<string, ResumeDomElement> {
	const elements = walkElements(root);
	const byHostId = new Map<string, ResumeDomElement>();

	for (const locator of locators) {
		const element = elements[locator.index];
		if (!element) {
			throw missingElementLocatorError(locator);
		}

		const expectedTagName = locator.tagName.toLowerCase();
		const actualTagName = element.tagName.toLowerCase();
		if (actualTagName !== expectedTagName) {
			throw mismatchedElementLocatorError(locator, actualTagName);
		}

		byHostId.set(locator.hostNodeId, element);
	}

	return byHostId;
}

function walkElements(root: ResumeDomElement): ResumeDomElement[] {
	const elements: ResumeDomElement[] = [];

	function visit(node: ResumeDomNode): void {
		if (node.nodeType === 1) {
			elements.push(node as ResumeDomElement);
		}

		for (const child of node.childNodes ?? []) {
			visit(child);
		}
	}

	visit(root);
	return elements;
}

function walkComments(root: ResumeDomElement): ResumeDomComment[] {
	const comments: ResumeDomComment[] = [];

	function visit(node: ResumeDomNode): void {
		if (node.nodeType === 8) {
			comments.push(node as ResumeDomComment);
		}

		for (const child of node.childNodes ?? []) {
			visit(child);
		}
	}

	visit(root);
	return comments;
}

function missingElementLocatorError(
	locator: ResumeViewRecord['locators'][number],
): RuntimeResumeError {
	return new RuntimeResumeError({
		code: 'AA_RESUME_LOCATOR_MISSING',
		severity: 'error',
		phase: 'resume',
		title: 'Resume locator did not match the document',
		message: `Resume locator ${locator.hostNodeId} expected <${locator.tagName}> at DOM order index ${String(locator.index)}.`,
		why: 'The async/view payload points at an element that was not present in the resumed document. The runtime cannot safely attach events, behaviors, element handles, or bindings to a missing host node.',
		hostNodeId: locator.hostNodeId,
		elementLocator: domOrderLocator(locator.index),
		expectedTagName: locator.tagName.toLowerCase(),
		suggestions: [
			{
				message:
					'Regenerate the async/view payload from the same initial render output that the browser is resuming.',
			},
		],
		docsUrl: 'https://async.await.dev/errors/AA_RESUME_LOCATOR_MISSING',
	});
}

function mismatchedElementLocatorError(
	locator: ResumeViewRecord['locators'][number],
	actualTagName: string,
): RuntimeResumeError {
	const expectedTagName = locator.tagName.toLowerCase();
	return new RuntimeResumeError({
		code: 'AA_RESUME_LOCATOR_MISMATCH',
		severity: 'error',
		phase: 'resume',
		title: 'Resume locator matched a different element',
		message: `Resume locator ${locator.hostNodeId} expected <${expectedTagName}> at DOM order index ${String(locator.index)} but found <${actualTagName}>.`,
		why: 'The async/view payload no longer matches the document being resumed. The runtime cannot safely reuse a DOM-order locator when the element at that position has a different tag.',
		hostNodeId: locator.hostNodeId,
		elementLocator: domOrderLocator(locator.index),
		expectedTagName,
		actualTagName,
		suggestions: [
			{
				message:
					'Resume the exact document produced with the matching async/view payload, or regenerate the payload after changing markup.',
			},
		],
		docsUrl: 'https://async.await.dev/errors/AA_RESUME_LOCATOR_MISMATCH',
	});
}

function missingCommentAnchorError(
	boundaryId: string,
	anchorName: 'startAnchor' | 'endAnchor',
	index: number,
): RuntimeResumeError {
	return new RuntimeResumeError({
		code: 'AA_RESUME_LOCATOR_MISSING',
		severity: 'error',
		phase: 'resume',
		title: 'Resume locator did not match the document',
		message: `Resume locator ${boundaryId} ${anchorName} expected a comment at DOM order index ${String(index)}.`,
		why: 'The async/view payload references an async boundary comment anchor that was not present in the resumed document. The runtime needs both comment anchors before it can replace pending, fulfilled, or rejected boundary content.',
		boundaryId,
		elementLocator: domOrderCommentLocator(index),
		suggestions: [
			{
				message:
					'Keep compiler-generated async boundary comments in the initial render output and resume with the matching async/view payload.',
			},
		],
		docsUrl: 'https://async.await.dev/errors/AA_RESUME_LOCATOR_MISSING',
	});
}

function domOrderLocator(index: number): string {
	return `dom-order:${String(index)}`;
}

function domOrderCommentLocator(index: number): string {
	return `dom-order-comment:${String(index)}`;
}

function evaluateSyncPolicy(
	condition: ResumeSyncPolicyCondition,
	graph: RuntimeGraph,
	event: ResumeDomEvent,
): boolean {
	if (condition.type === 'and') {
		return condition.conditions.every((child) => evaluateSyncPolicy(child, graph, event));
	}
	if (condition.type === 'or') {
		return condition.conditions.some((child) => evaluateSyncPolicy(child, graph, event));
	}
	if (condition.type === 'not') {
		return !evaluateSyncPolicy(condition.condition, graph, event);
	}
	if (condition.type === 'graph-truthy') {
		return Boolean(graph.read(condition.bindingId, condition.path ?? []));
	}
	if (condition.type === 'constant-truthy') {
		return Boolean(condition.value);
	}

	return event[condition.field] === condition.value;
}

function runSyncPolicyActions(
	policy: ResumeSyncPolicy,
	graph: RuntimeGraph,
	event: ResumeDomEvent,
): void {
	for (const branch of syncPolicyBranches(policy)) {
		if (!evaluateSyncPolicy(branch.when, graph, event)) continue;

		for (const action of branch.actions) {
			if (action === 'preventDefault') event.preventDefault?.();
			if (action === 'stopPropagation') event.stopPropagation?.();
		}
	}
}

function syncPolicyBranches(policy: ResumeSyncPolicy): ReadonlyArray<ResumeSyncPolicyBranch> {
	if ('branches' in policy) return policy.branches;

	return [policy];
}
