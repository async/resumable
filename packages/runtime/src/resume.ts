import type { ProtocolViewPayload } from '@async/resumable-protocol';
import type { DomJournalRecord, RuntimeGraph } from './graph.ts';

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
			readonly type: 'event-equals';
			readonly field: string;
			readonly value: unknown;
	  };

export type ResumeSyncPolicy = {
	readonly when: ResumeSyncPolicyCondition;
	readonly actions: ReadonlyArray<'preventDefault' | 'stopPropagation'>;
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
	readonly asyncBoundary?: ResumeAsyncBoundaryRecord;
	readonly asyncRead?: ResumeAsyncBoundaryRead;
};

export type ResumeBehaviorCleanup = () => void;

export type ResumeSymbol = (
	context: ResumeSymbolContext,
) =>
	| void
	| DomJournalRecord
	| ResumeBehaviorCleanup
	| Promise<void | DomJournalRecord | ResumeBehaviorCleanup>;

export type ResumeRuntimeInput = {
	readonly root: ResumeDomElement;
	readonly graph: RuntimeGraph;
	readonly view: ResumeViewRecord;
	readonly loadSymbol: (symbolId: string) => ResumeSymbol | Promise<ResumeSymbol>;
};

export type ResumeRuntime = {
	readonly start: () => Promise<void>;
	readonly dispatch: (event: ResumeDomEvent) => Promise<void>;
	readonly getElement: (hostNodeId: string) => ResumeDomElement | undefined;
	readonly getAsyncBoundary: (boundaryId: string) => ResumeAsyncBoundaryRecord | undefined;
	readonly disposeHost: (hostNodeId: string) => void;
};

export function createResumeRuntime(input: ResumeRuntimeInput): ResumeRuntime {
	const elementsByHostId = materializeDomLocators(input.root, input.view.locators);
	const asyncBoundariesById = materializeAsyncBoundaryLocators(
		input.root,
		input.view.asyncBoundaries,
	);
	const eventRecords = new WeakMap<ResumeDomElement, Map<string, ResumeEventRecord>>();
	const eventTypes = new Set<string>();
	const behaviorCleanups = new Map<string, ResumeBehaviorCleanup[]>();

	for (const eventRecord of input.view.events) {
		const element = elementsByHostId.get(eventRecord.hostNodeId);
		if (!element) continue;

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
			async run() {
				const symbol = await input.loadSymbol(binding.symbolId!);
				return await symbol({
					graph: input.graph,
					element,
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

		if (
			eventRecord.syncPolicy &&
			evaluateSyncPolicy(eventRecord.syncPolicy.when, input.graph, event)
		) {
			runSyncPolicyActions(eventRecord.syncPolicy, event);
		}

		for (const symbolId of eventRecord.symbolIds) {
			const symbol = await input.loadSymbol(symbolId);
			await symbol({
				graph: input.graph,
				event,
				element,
			});
		}

		await input.graph.flush();
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
			});

			if (typeof result === 'function') {
				const cleanups = behaviorCleanups.get(behavior.hostNodeId) ?? [];
				cleanups.push(result);
				behaviorCleanups.set(behavior.hostNodeId, cleanups);
			}
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
			const cleanups = behaviorCleanups.get(hostNodeId) ?? [];
			for (const cleanup of [...cleanups].reverse()) {
				cleanup();
			}
			behaviorCleanups.delete(hostNodeId);
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
		if (!startAnchor || !endAnchor) continue;

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
		if (!element) continue;
		if (element.tagName.toLowerCase() !== locator.tagName.toLowerCase()) continue;

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

	return event[condition.field] === condition.value;
}

function runSyncPolicyActions(policy: ResumeSyncPolicy, event: ResumeDomEvent): void {
	for (const action of policy.actions) {
		if (action === 'preventDefault') event.preventDefault?.();
		if (action === 'stopPropagation') event.stopPropagation?.();
	}
}
