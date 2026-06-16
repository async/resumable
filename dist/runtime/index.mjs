import "../protocol/index.mjs";
import { deserializeGraphValue } from "../serializer/index.mjs";
//#region packages/runtime/src/dom-journal.ts
function createBindingDomJournalRecord(input) {
	if (input.target.kind === "text") return {
		type: "setText",
		locator: input.locator,
		value: input.value
	};
	if (input.target.kind === "property") return {
		type: "setProp",
		locator: input.locator,
		name: input.target.name,
		value: input.value
	};
	if (input.target.kind === "class") return {
		type: "setAttr",
		locator: input.locator,
		name: "class",
		value: input.value
	};
	if (input.target.kind === "style") return {
		type: "setAttr",
		locator: input.locator,
		name: "style",
		value: input.value
	};
	return {
		type: "setAttr",
		locator: input.locator,
		name: input.target.name,
		value: input.value
	};
}
function applyDomJournalRecords(records, options) {
	for (const record of records) {
		if (record.type === "runCleanup") {
			options.runCleanup?.(record.locator, record);
			continue;
		}
		if (record.type === "insertRange") {
			options.insertRange?.(record.locator, record.fragment, record);
			continue;
		}
		if (record.type === "removeRange") {
			options.removeRange?.(record.locator, record);
			continue;
		}
		if (record.type === "moveRange") {
			options.moveRange?.(record.locator, record.before, record);
			continue;
		}
		const target = options.resolveTarget(record.locator, record);
		if (!target) continue;
		if (record.type === "setText") {
			setText(target, record.value);
			continue;
		}
		if (record.type === "setAttr") {
			setAttr(target, record.name, record.value);
			continue;
		}
		if (record.type === "setProp") {
			setProp(target, record.name, record.value);
			continue;
		}
		throw new TypeError(`Unsupported DOM journal record "${record.type}".`);
	}
}
function setText(target, value) {
	target.textContent = stringifyDomValue(value);
}
function setAttr(target, name, value) {
	const element = target;
	if (value == null || value === false) {
		element.removeAttribute?.(name);
		return;
	}
	element.setAttribute?.(name, stringifyDomValue(value));
}
function setProp(target, name, value) {
	target[name] = value;
}
function stringifyDomValue(value) {
	if (value == null) return "";
	return String(value);
}
//#endregion
//#region packages/runtime/src/graph.ts
function createRuntimeGraph(input) {
	const cells = /* @__PURE__ */ new Map();
	const computedNodes = /* @__PURE__ */ new Map();
	const asyncComputedNodes = /* @__PURE__ */ new Map();
	const subscriptions = [];
	const journalListeners = [];
	const dirtyPaths = [];
	const journal = [];
	let flushScheduled = false;
	let flushing = false;
	for (const cell of input.cells) cells.set(cell.bindingId, cell.value);
	for (const computed of input.computed ?? []) computedNodes.set(computed.bindingId, {
		...computed,
		dirty: true,
		value: void 0
	});
	for (const asyncComputed of input.asyncComputed ?? []) asyncComputedNodes.set(asyncComputed.bindingId, {
		...asyncComputed,
		demanded: false,
		keyValue: void 0,
		snapshot: {
			status: "idle",
			version: 0
		},
		version: 0
	});
	const readGraph = (bindingId, path = []) => {
		const computed = computedNodes.get(bindingId);
		if (computed) {
			if (computed.dirty) {
				computed.value = computed.compute(readGraph);
				computed.dirty = false;
			}
			return readPath(computed.value, path);
		}
		const asyncComputed = asyncComputedNodes.get(bindingId);
		if (asyncComputed) {
			demandAsyncComputed(asyncComputed);
			return readPath(asyncComputed.snapshot, path);
		}
		return readPath(cells.get(bindingId), path);
	};
	const markComputedDirty = (bindingId, visited) => {
		if (visited.has(bindingId)) return;
		visited.add(bindingId);
		const computed = computedNodes.get(bindingId);
		if (computed) computed.dirty = true;
		dirtyPaths.push({
			bindingId,
			path: []
		});
		for (const dependent of computedNodes.values()) if (dependent.dependencies.some((dependency) => dependency.bindingId === bindingId)) markComputedDirty(dependent.bindingId, visited);
		for (const dependent of asyncComputedNodes.values()) if (dependent.dependencies.some((dependency) => dependency.bindingId === bindingId)) invalidateAsyncComputed(dependent);
	};
	const markDirtyPath = (bindingId, path) => {
		dirtyPaths.push({
			bindingId,
			path
		});
		for (const computed of computedNodes.values()) if (computed.dependencies.some((dependency) => dependency.bindingId === bindingId && pathsIntersect(path, dependency.path ?? []))) markComputedDirty(computed.bindingId, /* @__PURE__ */ new Set());
		for (const asyncComputed of asyncComputedNodes.values()) if (asyncComputed.dependencies.some((dependency) => dependency.bindingId === bindingId && pathsIntersect(path, dependency.path ?? []))) invalidateAsyncComputed(asyncComputed);
	};
	const scheduleFlush = () => {
		if (flushScheduled || flushing) return;
		flushScheduled = true;
		scheduleMicrotask(() => {
			flush();
		});
	};
	const demandAsyncComputed = (node) => {
		if (node.snapshot.status !== "idle") return;
		node.demanded = true;
		startAsyncComputed(node, node.key(readGraph));
	};
	const invalidateAsyncComputed = (node) => {
		if (!node.demanded) return;
		const nextKey = node.key(readGraph);
		if (node.snapshot.status !== "idle" && Object.is(node.keyValue, nextKey)) return;
		startAsyncComputed(node, nextKey);
	};
	const startAsyncComputed = (node, key) => {
		node.controller?.abort();
		const controller = new AbortController();
		const version = node.version + 1;
		node.controller = controller;
		node.keyValue = key;
		node.version = version;
		node.snapshot = {
			status: "pending",
			version,
			key
		};
		const commitFulfilled = (value) => {
			if (node.version !== version || controller.signal.aborted) return;
			node.snapshot = {
				status: "fulfilled",
				version,
				key,
				value
			};
			markDirtyPath(node.bindingId, []);
			scheduleFlush();
		};
		const commitRejected = (error) => {
			if (node.version !== version || controller.signal.aborted) return;
			node.snapshot = {
				status: "rejected",
				version,
				key,
				error
			};
			markDirtyPath(node.bindingId, []);
			scheduleFlush();
		};
		try {
			Promise.resolve(node.run({
				key,
				signal: controller.signal,
				read: readGraph
			})).then(commitFulfilled, commitRejected);
		} catch (error) {
			commitRejected(error);
		}
		markDirtyPath(node.bindingId, []);
		scheduleFlush();
	};
	const flush = async () => {
		if (flushing) return;
		flushScheduled = false;
		flushing = true;
		try {
			while (dirtyPaths.length > 0) {
				const pending = dirtyPaths.splice(0);
				const ranSubscriptions = /* @__PURE__ */ new Set();
				for (const subscription of subscriptions) {
					const subscriptionPath = subscription.path ?? [];
					if (!pending.some((path) => path.bindingId === subscription.bindingId && pathsIntersect(path.path, subscriptionPath)) || ranSubscriptions.has(subscription.id)) continue;
					ranSubscriptions.add(subscription.id);
					appendJournalResult(journal, await subscription.run(readGraph(subscription.bindingId, subscriptionPath)));
				}
			}
		} finally {
			flushing = false;
			if (dirtyPaths.length > 0) scheduleFlush();
		}
		await notifyJournalListeners();
	};
	const notifyJournalListeners = async () => {
		if (journalListeners.length === 0 || journal.length === 0) return;
		const records = journal.splice(0);
		for (const listener of journalListeners) await listener(records);
	};
	return {
		read: readGraph,
		write(write) {
			const path = write.path ?? [];
			const current = cells.get(write.bindingId);
			cells.set(write.bindingId, writePath(current, path, write.value));
			markDirtyPath(write.bindingId, path);
			scheduleFlush();
		},
		update(update) {
			const path = update.path ?? [];
			const currentValue = readPath(cells.get(update.bindingId), path);
			const nextValue = update.update(currentValue);
			const current = cells.get(update.bindingId);
			cells.set(update.bindingId, writePath(current, path, nextValue));
			markDirtyPath(update.bindingId, path);
			scheduleFlush();
			if (update.returnValue === "previous") return currentValue;
			if (update.returnValue === "next") return nextValue;
		},
		call(call) {
			const path = call.path ?? [];
			const target = readPath(cells.get(call.bindingId), path);
			const beforeMutation = collectionMutationSnapshot(target, call.method, call.args ?? []);
			const result = applyCollectionCall(target, call.method, call.args ?? []);
			if (collectionCallMutated(call.method, result, beforeMutation)) {
				markDirtyPath(call.bindingId, path);
				scheduleFlush();
			}
			return result;
		},
		delete(deletion) {
			const outcome = deletePath(cells.get(deletion.bindingId), deletion.path);
			if (outcome.mutated) {
				markDirtyPath(deletion.bindingId, deletion.path);
				scheduleFlush();
			}
			return outcome.result;
		},
		subscribe(subscription) {
			subscriptions.push(subscription);
		},
		subscribeJournal(listener) {
			journalListeners.push(listener);
			return () => {
				const index = journalListeners.indexOf(listener);
				if (index >= 0) journalListeners.splice(index, 1);
			};
		},
		flush,
		takeJournal() {
			return journal.splice(0);
		}
	};
}
function appendJournalResult(journal, result) {
	if (!result) return;
	if (Array.isArray(result)) {
		journal.push(...result);
		return;
	}
	journal.push(result);
}
function readPath(value, path) {
	let current = value;
	for (const segment of path) {
		if (current == null) return void 0;
		current = current[segment];
	}
	return current;
}
function writePath(value, path, nextValue) {
	if (path.length === 0) return nextValue;
	const root = isObject(value) ? value : {};
	let current = root;
	for (const segment of path.slice(0, -1)) {
		const child = current[segment];
		if (!isObject(child)) current[segment] = {};
		current = current[segment];
	}
	current[path[path.length - 1]] = nextValue;
	return root;
}
function deletePath(value, path) {
	if (path.length === 0) throw new TypeError("Cannot delete a graph binding root. Delete a property path instead.");
	let current = value;
	for (const segment of path.slice(0, -1)) {
		if (current == null) throw new TypeError(`Cannot delete graph path "${path.join(".")}".`);
		current = current[segment];
	}
	if (current == null) throw new TypeError(`Cannot delete graph path "${path.join(".")}".`);
	if (!isObject(current)) return {
		result: true,
		mutated: false
	};
	const key = path[path.length - 1];
	const hadProperty = Object.prototype.hasOwnProperty.call(current, key);
	const result = delete current[key];
	return {
		result,
		mutated: hadProperty && result
	};
}
function applyCollectionCall(target, method, args) {
	if (!isSupportedCollectionTarget(target)) throw new TypeError(`Cannot call collection method "${method}" because the graph path is not an Array, Map, or Set.`);
	if (!isSupportedCollectionMethod(method)) throw new TypeError(`Unsupported graph collection method "${method}".`);
	const callable = target[method];
	if (typeof callable !== "function") throw new TypeError(`Unsupported graph collection method "${method}".`);
	return Reflect.apply(callable, target, [...args]);
}
function collectionCallMutated(method, result, beforeMutation) {
	if (method === "delete") return result === true;
	if (method === "clear") return beforeMutation?.type === "size" && beforeMutation.value > 0;
	if (method === "pop") return beforeMutation?.type === "size" && beforeMutation.value > 0;
	if (method === "shift") return beforeMutation?.type === "size" && beforeMutation.value > 0;
	if (method === "push" || method === "unshift") return beforeMutation?.type !== "size" || result !== beforeMutation.value;
	if (method === "add") return beforeMutation?.type !== "set-add" || !beforeMutation.hadValue;
	if (method === "set") return beforeMutation?.type !== "map-set" || !beforeMutation.hadKey || beforeMutation.valueChanged;
	return true;
}
function collectionMutationSnapshot(target, method, args) {
	if (method === "add" && target instanceof Set) return {
		type: "set-add",
		hadValue: target.has(args[0])
	};
	if (method === "set" && target instanceof Map) {
		const hadKey = target.has(args[0]);
		return {
			type: "map-set",
			hadKey,
			valueChanged: !hadKey || !Object.is(target.get(args[0]), args[1])
		};
	}
	if (Array.isArray(target)) return {
		type: "size",
		value: target.length
	};
	if (target instanceof Map || target instanceof Set) return {
		type: "size",
		value: target.size
	};
	return null;
}
function isSupportedCollectionMethod(name) {
	return name === "add" || name === "clear" || name === "copyWithin" || name === "delete" || name === "fill" || name === "pop" || name === "push" || name === "reverse" || name === "set" || name === "shift" || name === "sort" || name === "splice" || name === "unshift";
}
function isSupportedCollectionTarget(target) {
	return Array.isArray(target) || target instanceof Map || target instanceof Set;
}
function pathsIntersect(a, b) {
	return isPrefix(a, b) || isPrefix(b, a);
}
function isPrefix(prefix, value) {
	if (prefix.length > value.length) return false;
	return prefix.every((segment, index) => value[index] === segment);
}
function isObject(value) {
	return typeof value === "object" && value !== null;
}
function scheduleMicrotask(callback) {
	if (typeof queueMicrotask === "function") {
		queueMicrotask(callback);
		return;
	}
	Promise.resolve().then(callback);
}
//#endregion
//#region packages/runtime/src/resume.ts
var RuntimeResumeError = class extends Error {
	code;
	severity;
	phase;
	title;
	why;
	hostNodeId;
	boundaryId;
	elementLocator;
	expectedTagName;
	actualTagName;
	suggestions;
	docsUrl;
	constructor(diagnostic) {
		super(diagnostic.message);
		this.name = "RuntimeResumeError";
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
};
function createResumeRuntime(input) {
	const elementsByHostId = materializeDomLocators(input.root, input.view.locators);
	const asyncBoundariesById = materializeAsyncBoundaryLocators(input.root, input.view.asyncBoundaries);
	const eventRecords = /* @__PURE__ */ new WeakMap();
	const visibleRecords = /* @__PURE__ */ new WeakMap();
	const visibleEntries = [];
	const visibleElementsByHostId = /* @__PURE__ */ new Map();
	const activeVisibleElements = /* @__PURE__ */ new Set();
	const disposedHosts = /* @__PURE__ */ new Set();
	const eventTypes = /* @__PURE__ */ new Set();
	const elementHandles = materializeElementHandles(elementsByHostId, input.view.elementHandles);
	const hostCleanups = /* @__PURE__ */ new Map();
	if (input.applyDomJournal) input.graph.subscribeJournal(input.applyDomJournal);
	let visibilityObserver;
	for (const eventRecord of input.view.events) {
		const element = elementsByHostId.get(eventRecord.hostNodeId);
		if (!element) continue;
		if (eventRecord.eventName === "visible") {
			visibleRecords.set(element, eventRecord);
			visibleEntries.push({
				element,
				eventRecord
			});
			visibleElementsByHostId.set(eventRecord.hostNodeId, element);
			continue;
		}
		let recordsByEventName = eventRecords.get(element);
		if (!recordsByEventName) {
			recordsByEventName = /* @__PURE__ */ new Map();
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
			id: `view-binding:${binding.hostNodeId}:${binding.bindingId}:${binding.path.join(".")}`,
			bindingId: binding.bindingId,
			path: binding.path,
			async run(value) {
				return await (await input.loadSymbol(binding.symbolId))({
					graph: input.graph,
					element,
					getElementHandle: elementHandles.get,
					binding,
					value
				});
			}
		});
	}
	for (const boundary of asyncBoundariesById.values()) for (const asyncRead of boundary.asyncReads) {
		if (!asyncRead.runnerSymbolId) continue;
		input.graph.subscribe({
			id: `async-boundary:${boundary.id}:${asyncRead.bindingId}:${asyncRead.path.join(".")}`,
			bindingId: asyncRead.bindingId,
			path: asyncRead.path,
			async run() {
				return await (await input.loadSymbol(asyncRead.runnerSymbolId))({
					graph: input.graph,
					element: input.root,
					getElementHandle: elementHandles.get,
					asyncBoundary: boundary,
					asyncRead
				});
			}
		});
	}
	async function dispatch(event) {
		const target = event.target;
		if (!target) return;
		const matched = findEventRecord(target, event.type, eventRecords);
		if (!matched) return;
		const { element, eventRecord } = matched;
		if (eventRecord.syncPolicy) runSyncPolicyActions(eventRecord.syncPolicy, input.graph, event);
		try {
			for (const symbolId of eventRecord.symbolIds) await (await input.loadSymbol(symbolId))({
				graph: input.graph,
				event,
				element,
				getElementHandle: elementHandles.get
			});
		} finally {
			await input.graph.flush();
		}
	}
	async function installBehaviors() {
		for (const behavior of input.view.behaviors) {
			if (!behavior.symbolId) continue;
			const element = elementsByHostId.get(behavior.hostNodeId);
			if (!element) continue;
			const result = await (await input.loadSymbol(behavior.symbolId))({
				graph: input.graph,
				element,
				getElementHandle: elementHandles.get
			});
			if (typeof result === "function") storeHostCleanup(behavior.hostNodeId, result);
		}
	}
	function storeHostCleanup(hostNodeId, cleanup) {
		const cleanups = hostCleanups.get(hostNodeId) ?? [];
		cleanups.push(cleanup);
		hostCleanups.set(hostNodeId, cleanups);
	}
	async function runVisibleEvent(element, eventRecord) {
		try {
			for (const symbolId of eventRecord.symbolIds) {
				const result = await (await input.loadSymbol(symbolId))({
					graph: input.graph,
					element,
					getElementHandle: elementHandles.get
				});
				if (typeof result === "function") storeHostCleanup(eventRecord.hostNodeId, result);
			}
		} finally {
			await input.graph.flush();
		}
	}
	function installVisibilityObserver() {
		const createObserver = input.createVisibilityObserver ?? defaultVisibilityObserverFactory();
		if (visibleEntries.length === 0 || !createObserver) return;
		const fired = /* @__PURE__ */ new WeakSet();
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
				runVisibleEvent(entry.target, eventRecord);
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
	async function demandAsyncBoundaries() {
		for (const boundary of asyncBoundariesById.values()) for (const asyncRead of boundary.asyncReads) input.graph.read(asyncRead.bindingId, asyncRead.path);
		await input.graph.flush();
	}
	return {
		async start() {
			for (const eventType of eventTypes) input.root.addEventListener?.(eventType, dispatch, { capture: true });
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
			for (const cleanup of [...cleanups].reverse()) cleanup();
			hostCleanups.delete(hostNodeId);
		}
	};
}
function isVisibleEntry(entry) {
	return entry.isIntersecting === true || (entry.intersectionRatio ?? 0) > 0;
}
function defaultVisibilityObserverFactory() {
	const observer = globalThis.IntersectionObserver;
	if (!observer) return void 0;
	return (callback) => new observer(callback);
}
function materializeElementHandles(elementsByHostId, handles) {
	const byHandleId = /* @__PURE__ */ new Map();
	const byName = /* @__PURE__ */ new Map();
	const keysByHostId = /* @__PURE__ */ new Map();
	for (const handle of handles) {
		const element = elementsByHostId.get(handle.hostNodeId);
		if (!element) continue;
		byHandleId.set(handle.handleId, element);
		byName.set(handle.name, element);
		keysByHostId.set(handle.hostNodeId, {
			handleId: handle.handleId,
			name: handle.name
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
		}
	};
}
function materializeAsyncBoundaryLocators(root, boundaries) {
	const comments = walkComments(root);
	const byBoundaryId = /* @__PURE__ */ new Map();
	for (const boundary of boundaries) {
		const startAnchor = comments[boundary.startAnchor.index];
		const endAnchor = comments[boundary.endAnchor.index];
		if (!startAnchor) throw missingCommentAnchorError(boundary.id, "startAnchor", boundary.startAnchor.index);
		if (!endAnchor) throw missingCommentAnchorError(boundary.id, "endAnchor", boundary.endAnchor.index);
		byBoundaryId.set(boundary.id, {
			id: boundary.id,
			startAnchor,
			endAnchor,
			asyncReads: boundary.asyncReads
		});
	}
	return byBoundaryId;
}
function findEventRecord(target, eventName, eventRecords) {
	let current = target;
	while (current) {
		const eventRecord = eventRecords.get(current)?.get(eventName);
		if (eventRecord) return {
			element: current,
			eventRecord
		};
		current = current.parentElement;
	}
	return null;
}
function materializeDomLocators(root, locators) {
	const elements = walkElements(root);
	const byHostId = /* @__PURE__ */ new Map();
	for (const locator of locators) {
		const element = elements[locator.index];
		if (!element) throw missingElementLocatorError(locator);
		const expectedTagName = locator.tagName.toLowerCase();
		const actualTagName = element.tagName.toLowerCase();
		if (actualTagName !== expectedTagName) throw mismatchedElementLocatorError(locator, actualTagName);
		byHostId.set(locator.hostNodeId, element);
	}
	return byHostId;
}
function walkElements(root) {
	const elements = [];
	function visit(node) {
		if (node.nodeType === 1) elements.push(node);
		for (const child of node.childNodes ?? []) visit(child);
	}
	visit(root);
	return elements;
}
function walkComments(root) {
	const comments = [];
	function visit(node) {
		if (node.nodeType === 8) comments.push(node);
		for (const child of node.childNodes ?? []) visit(child);
	}
	visit(root);
	return comments;
}
function missingElementLocatorError(locator) {
	return new RuntimeResumeError({
		code: "AA_RESUME_LOCATOR_MISSING",
		severity: "error",
		phase: "resume",
		title: "Resume locator did not match the document",
		message: `Resume locator ${locator.hostNodeId} expected <${locator.tagName}> at DOM order index ${String(locator.index)}.`,
		why: "The async/view payload points at an element that was not present in the resumed document. The runtime cannot safely attach events, behaviors, element handles, or bindings to a missing host node.",
		hostNodeId: locator.hostNodeId,
		elementLocator: domOrderLocator(locator.index),
		expectedTagName: locator.tagName.toLowerCase(),
		suggestions: [{ message: "Regenerate the async/view payload from the same initial render output that the browser is resuming." }],
		docsUrl: "https://async.await.dev/errors/AA_RESUME_LOCATOR_MISSING"
	});
}
function mismatchedElementLocatorError(locator, actualTagName) {
	const expectedTagName = locator.tagName.toLowerCase();
	return new RuntimeResumeError({
		code: "AA_RESUME_LOCATOR_MISMATCH",
		severity: "error",
		phase: "resume",
		title: "Resume locator matched a different element",
		message: `Resume locator ${locator.hostNodeId} expected <${expectedTagName}> at DOM order index ${String(locator.index)} but found <${actualTagName}>.`,
		why: "The async/view payload no longer matches the document being resumed. The runtime cannot safely reuse a DOM-order locator when the element at that position has a different tag.",
		hostNodeId: locator.hostNodeId,
		elementLocator: domOrderLocator(locator.index),
		expectedTagName,
		actualTagName,
		suggestions: [{ message: "Resume the exact document produced with the matching async/view payload, or regenerate the payload after changing markup." }],
		docsUrl: "https://async.await.dev/errors/AA_RESUME_LOCATOR_MISMATCH"
	});
}
function missingCommentAnchorError(boundaryId, anchorName, index) {
	return new RuntimeResumeError({
		code: "AA_RESUME_LOCATOR_MISSING",
		severity: "error",
		phase: "resume",
		title: "Resume locator did not match the document",
		message: `Resume locator ${boundaryId} ${anchorName} expected a comment at DOM order index ${String(index)}.`,
		why: "The async/view payload references an async boundary comment anchor that was not present in the resumed document. The runtime needs both comment anchors before it can replace pending, fulfilled, or rejected boundary content.",
		boundaryId,
		elementLocator: domOrderCommentLocator(index),
		suggestions: [{ message: "Keep compiler-generated async boundary comments in the initial render output and resume with the matching async/view payload." }],
		docsUrl: "https://async.await.dev/errors/AA_RESUME_LOCATOR_MISSING"
	});
}
function domOrderLocator(index) {
	return `dom-order:${String(index)}`;
}
function domOrderCommentLocator(index) {
	return `dom-order-comment:${String(index)}`;
}
function evaluateSyncPolicy(condition, graph, event) {
	if (condition.type === "and") return condition.conditions.every((child) => evaluateSyncPolicy(child, graph, event));
	if (condition.type === "or") return condition.conditions.some((child) => evaluateSyncPolicy(child, graph, event));
	if (condition.type === "not") return !evaluateSyncPolicy(condition.condition, graph, event);
	if (condition.type === "graph-truthy") return Boolean(graph.read(condition.bindingId, condition.path ?? []));
	if (condition.type === "constant-truthy") return Boolean(condition.value);
	return event[condition.field] === condition.value;
}
function runSyncPolicyActions(policy, graph, event) {
	for (const branch of syncPolicyBranches(policy)) {
		if (!evaluateSyncPolicy(branch.when, graph, event)) continue;
		for (const action of branch.actions) {
			if (action === "preventDefault") event.preventDefault?.();
			if (action === "stopPropagation") event.stopPropagation?.();
		}
	}
}
function syncPolicyBranches(policy) {
	if ("branches" in policy) return policy.branches;
	return [policy];
}
//#endregion
//#region packages/runtime/src/payload.ts
var RuntimePayloadError = class extends Error {
	code;
	severity;
	phase;
	title;
	why;
	payloadType;
	payloadScript;
	expectedVersion;
	actualVersion;
	suggestions;
	docsUrl;
	constructor(diagnostic) {
		super(diagnostic.message);
		this.name = "RuntimePayloadError";
		this.code = diagnostic.code;
		this.severity = diagnostic.severity;
		this.phase = diagnostic.phase;
		this.title = diagnostic.title;
		this.why = diagnostic.why;
		this.payloadType = diagnostic.payloadType;
		this.payloadScript = diagnostic.payloadScript;
		this.expectedVersion = diagnostic.expectedVersion;
		this.actualVersion = diagnostic.actualVersion;
		this.suggestions = diagnostic.suggestions;
		this.docsUrl = diagnostic.docsUrl;
	}
};
function decodePayloadScripts(input) {
	const state = parseDataScript(input.stateScript, "async/state");
	const view = parseDataScript(input.viewScript, "async/view");
	assertStatePayloadShape(state);
	assertViewPayloadShape(view);
	assertProtocolVersion(state.version, "async/state");
	assertProtocolVersion(view.version, "async/view");
	return {
		state,
		view
	};
}
function readPayloadScriptsFromDocument(document) {
	return {
		stateScript: readPayloadScriptFromDocument(document, "async/state"),
		viewScript: readPayloadScriptFromDocument(document, "async/view")
	};
}
function decodePayloadScriptsFromDocument(document) {
	return decodePayloadScripts(readPayloadScriptsFromDocument(document));
}
function createRuntimeGraphFromStatePayload(payload) {
	return createRuntimeGraph({ cells: payload.cells.map((cell) => ({
		bindingId: cell.bindingId,
		value: cell.value === void 0 ? void 0 : deserializeGraphValue(cell.value)
	})) });
}
async function resumeFromPayloadScripts(input) {
	const decoded = decodePayloadScripts(input);
	const graph = createRuntimeGraphFromStatePayload(decoded.state);
	let runtime;
	const applyDomJournal = input.applyDomJournal ?? ((records) => applyDomJournalRecords(records, { resolveTarget(locator) {
		return runtime?.getElement(String(locator));
	} }));
	runtime = createResumeRuntime({
		root: input.root,
		graph,
		view: decoded.view,
		loadSymbol: input.loadSymbol,
		createVisibilityObserver: input.createVisibilityObserver,
		applyDomJournal
	});
	await runtime.start();
	return {
		decoded,
		graph,
		runtime
	};
}
async function resumeFromPayloadDocument(input) {
	return resumeFromPayloadScripts({
		...readPayloadScriptsFromDocument(input.document),
		root: input.root,
		loadSymbol: input.loadSymbol,
		createVisibilityObserver: input.createVisibilityObserver,
		applyDomJournal: input.applyDomJournal
	});
}
function parseDataScript(script, type) {
	const prefix = `<script type="${type}">`;
	if (!script.startsWith(prefix) || !script.endsWith("<\/script>")) throw payloadInvalidError(type, `Expected ${type} payload script.`, `Browser resume expects the ${type} data to arrive in a canonical ${payloadScriptSelector(type)} script wrapper before decoding the resumability protocol.`, [{ message: `Emit the ${type} payload with renderPayloadScripts or an equivalent canonical script wrapper.` }]);
	try {
		return JSON.parse(script.slice(prefix.length, -9));
	} catch {
		throw payloadInvalidError(type, `Invalid ${type} payload JSON.`, `The ${type} payload script must contain valid JSON before the runtime can validate the resumability protocol fields.`, [{ message: `Emit valid JSON inside the ${payloadScriptSelector(type)} script content.` }]);
	}
}
function assertStatePayloadShape(payload) {
	if (!isRecord(payload)) throw invalidPayloadShapeError("async/state", "Invalid async/state payload: expected object.");
	if (!("version" in payload)) throw invalidPayloadShapeError("async/state", "Invalid async/state payload: expected version.");
	if (!Array.isArray(payload.cells)) throw invalidPayloadShapeError("async/state", "Invalid async/state payload: expected cells array.");
	for (const [index, cell] of payload.cells.entries()) {
		const context = `async/state cell[${index}]`;
		assertRecordShape(cell, context);
		assertStringField(cell, "bindingId", context);
		assertStringField(cell, "name", context);
		assertStateValueKind(cell, context);
	}
	if ("computed" in payload) {
		if (!Array.isArray(payload.computed)) throw invalidPayloadShapeError("async/state", "Invalid async/state payload: expected computed array.");
		for (const [index, computed] of payload.computed.entries()) {
			const context = `async/state computed[${index}]`;
			assertRecordShape(computed, context);
			assertStringField(computed, "bindingId", context);
			assertStringField(computed, "name", context);
			assertBooleanField(computed, "async", context);
		}
	}
}
function assertViewPayloadShape(payload) {
	if (!isRecord(payload)) throw invalidPayloadShapeError("async/view", "Invalid async/view payload: expected object.");
	if (!("version" in payload)) throw invalidPayloadShapeError("async/view", "Invalid async/view payload: expected version.");
	for (const key of [
		"locators",
		"events",
		"bindings",
		"behaviors",
		"elementHandles",
		"asyncBoundaries"
	]) if (!Array.isArray(payload[key])) throw invalidPayloadShapeError("async/view", `Invalid async/view payload: expected ${key} array.`);
	for (const [index, locator] of payload.locators.entries()) {
		const context = `async/view locator[${index}]`;
		assertRecordShape(locator, context);
		assertStringField(locator, "hostNodeId", context);
		assertLiteralField(locator, "strategy", "dom-order", context);
		assertNumberField(locator, "index", context);
		assertStringField(locator, "tagName", context);
	}
	for (const [index, event] of payload.events.entries()) {
		const context = `async/view event[${index}]`;
		assertRecordShape(event, context);
		assertStringField(event, "hostNodeId", context);
		assertStringField(event, "eventName", context);
		assertStringArrayField(event, "symbolIds", context);
		if (event.syncPolicy !== void 0) assertSyncPolicy(event.syncPolicy, `${context}.syncPolicy`);
	}
	for (const [index, binding] of payload.bindings.entries()) {
		const context = `async/view binding[${index}]`;
		assertRecordShape(binding, context);
		assertStringField(binding, "hostNodeId", context);
		assertStringField(binding, "source", context);
		assertStringField(binding, "bindingId", context);
		assertStringArrayField(binding, "path", context);
		assertOptionalBindingTarget(binding.target, `${context}.target`);
		assertOptionalStringField(binding, "symbolId", context);
	}
	for (const [index, behavior] of payload.behaviors.entries()) {
		const context = `async/view behavior[${index}]`;
		assertRecordShape(behavior, context);
		assertStringField(behavior, "hostNodeId", context);
		assertStringField(behavior, "source", context);
		assertOptionalStringField(behavior, "symbolId", context);
	}
	for (const [index, handle] of payload.elementHandles.entries()) {
		const context = `async/view elementHandle[${index}]`;
		assertRecordShape(handle, context);
		assertStringField(handle, "hostNodeId", context);
		assertStringField(handle, "handleId", context);
		assertStringField(handle, "name", context);
	}
	for (const [index, boundary] of payload.asyncBoundaries.entries()) {
		const context = `async/view asyncBoundary[${index}]`;
		assertRecordShape(boundary, context);
		assertStringField(boundary, "id", context);
		assertCommentAnchor(boundary.startAnchor, `${context}.startAnchor`);
		assertCommentAnchor(boundary.endAnchor, `${context}.endAnchor`);
		assertAsyncBoundaryReads(boundary.asyncReads, context);
	}
}
function assertProtocolVersion(version, type) {
	if (version !== 1) throw protocolVersionMismatchError(type, version);
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function assertRecordShape(value, context) {
	if (!isRecord(value)) throw invalidPayloadShapeError(contextPayloadType(context), `Invalid ${context}: expected object.`);
}
function assertStringField(record, key, context) {
	if (typeof record[key] !== "string") throw invalidPayloadShapeError(contextPayloadType(context), `Invalid ${context}: expected ${key} string.`);
}
function assertOptionalStringField(record, key, context) {
	if (record[key] !== void 0 && typeof record[key] !== "string") throw invalidPayloadShapeError(contextPayloadType(context), `Invalid ${context}: expected ${key} string.`);
}
function assertNumberField(record, key, context) {
	if (typeof record[key] !== "number") throw invalidPayloadShapeError(contextPayloadType(context), `Invalid ${context}: expected ${key} number.`);
}
function assertBooleanField(record, key, context) {
	if (typeof record[key] !== "boolean") throw invalidPayloadShapeError(contextPayloadType(context), `Invalid ${context}: expected ${key} boolean.`);
}
function assertLiteralField(record, key, expected, context) {
	if (record[key] !== expected) throw invalidPayloadShapeError(contextPayloadType(context), `Invalid ${context}: expected ${key} "${expected}".`);
}
function assertStringArrayField(record, key, context) {
	if (!Array.isArray(record[key])) throw invalidPayloadShapeError(contextPayloadType(context), `Invalid ${context}: expected ${key} array.`);
	for (const value of record[key]) if (typeof value !== "string") throw invalidPayloadShapeError(contextPayloadType(context), `Invalid ${context}: expected ${key} string array.`);
}
function assertOptionalStringArrayField(record, key, context) {
	if (record[key] !== void 0) assertStringArrayField(record, key, context);
}
function assertStateValueKind(record, context) {
	if (record.valueKind !== "scalar" && record.valueKind !== "object" && record.valueKind !== "array" && record.valueKind !== "unknown") throw invalidPayloadShapeError(contextPayloadType(context), "Invalid " + context + ": expected valueKind scalar, object, array, or unknown.");
}
function assertCommentAnchor(value, context) {
	assertRecordShape(value, context);
	assertLiteralField(value, "strategy", "dom-order-comment", context);
	assertNumberField(value, "index", context);
}
function assertAsyncBoundaryReads(value, context) {
	if (!Array.isArray(value)) throw invalidPayloadShapeError(contextPayloadType(context), `Invalid ${context}: expected asyncReads array.`);
	for (const [index, read] of value.entries()) {
		const readContext = `${context}.asyncRead[${index}]`;
		assertRecordShape(read, readContext);
		assertStringField(read, "source", readContext);
		assertStringField(read, "bindingId", readContext);
		assertStringArrayField(read, "path", readContext);
		assertOptionalStringField(read, "runnerSymbolId", readContext);
	}
}
function assertOptionalBindingTarget(value, context) {
	if (value === void 0) return;
	assertRecordShape(value, context);
	if (value.kind === "text") return;
	if (value.kind === "class") return;
	if (value.kind === "style") return;
	if (value.kind === "attribute") {
		if (typeof value.name !== "string") throw invalidPayloadShapeError(contextPayloadType(context), `Invalid ${context}: expected attribute name string.`);
		return;
	}
	if (value.kind === "property") {
		if (typeof value.name !== "string") throw invalidPayloadShapeError(contextPayloadType(context), `Invalid ${context}: expected property name string.`);
		return;
	}
	throw invalidPayloadShapeError(contextPayloadType(context), `Invalid ${context}: expected supported binding target kind.`);
}
function assertSyncPolicy(value, context) {
	assertRecordShape(value, context);
	if ("branches" in value) {
		if (!Array.isArray(value.branches)) throw invalidPayloadShapeError(contextPayloadType(context), `Invalid ${context}: expected branches array.`);
		for (const [index, branch] of value.branches.entries()) assertSyncPolicyBranch(branch, `${context}.branch[${index}]`);
		return;
	}
	assertSyncPolicyBranch(value, context);
}
function assertSyncPolicyBranch(value, context) {
	assertRecordShape(value, context);
	assertSyncPolicyCondition(value.when, `${context}.when`);
	if (!Array.isArray(value.actions)) throw invalidPayloadShapeError(contextPayloadType(context), `Invalid ${context}: expected actions array.`);
	for (const action of value.actions) if (action !== "preventDefault" && action !== "stopPropagation") throw invalidPayloadShapeError(contextPayloadType(context), `Invalid ${context}: expected supported sync action.`);
}
function assertSyncPolicyCondition(value, context) {
	assertRecordShape(value, context);
	if (value.type === "and" || value.type === "or") {
		if (!Array.isArray(value.conditions)) throw invalidPayloadShapeError(contextPayloadType(context), `Invalid ${context}: expected conditions array.`);
		for (const [index, condition] of value.conditions.entries()) assertSyncPolicyCondition(condition, `${context}.condition[${index}]`);
		return;
	}
	if (value.type === "not") {
		assertSyncPolicyCondition(value.condition, `${context}.condition`);
		return;
	}
	if (value.type === "graph-truthy") {
		assertStringField(value, "bindingId", context);
		assertOptionalStringArrayField(value, "path", context);
		return;
	}
	if (value.type === "constant-truthy") {
		if (!("value" in value)) throw invalidPayloadShapeError(contextPayloadType(context), `Invalid ${context}: expected value.`);
		return;
	}
	if (value.type === "event-equals") {
		assertStringField(value, "field", context);
		if (!("value" in value)) throw invalidPayloadShapeError(contextPayloadType(context), `Invalid ${context}: expected value.`);
		return;
	}
	throw invalidPayloadShapeError(contextPayloadType(context), `Invalid ${context}: expected supported condition type.`);
}
function readPayloadScriptFromDocument(document, type) {
	const element = document.querySelector(`script[type="${type}"]`);
	if (!element) throw payloadInvalidError(type, `Missing ${type} payload script.`, `Browser resume requires the ${payloadScriptSelector(type)} script to exist before the runtime can decode the resumability payload.`, [{ message: `Include a ${payloadScriptSelector(type)} script in the rendered document.` }]);
	const text = element.textContent ?? element.text ?? element.innerHTML;
	if (text == null) throw payloadInvalidError(type, `Missing ${type} payload script content.`, `Browser resume found ${payloadScriptSelector(type)}, but the script did not expose text content for the runtime to decode.`, [{ message: `Render JSON payload content inside ${payloadScriptSelector(type)}.` }]);
	return `<script type="${type}">${text}<\/script>`;
}
function payloadInvalidError(payloadType, message, why, suggestions) {
	return new RuntimePayloadError({
		code: "AA_PAYLOAD_INVALID",
		severity: "error",
		phase: "payload",
		title: "Invalid resumability payload",
		message,
		why,
		payloadType,
		payloadScript: payloadScriptSelector(payloadType),
		suggestions,
		docsUrl: "https://async.await.dev/errors/AA_PAYLOAD_INVALID"
	});
}
function invalidPayloadShapeError(payloadType, message) {
	return payloadInvalidError(payloadType, message, `The ${payloadType} payload did not match the resumability protocol shape required by this runtime.`, [{ message: `Regenerate the ${payloadType} payload with the matching @async/resumable compiler/runtime version.` }]);
}
function protocolVersionMismatchError(payloadType, actualVersion) {
	return new RuntimePayloadError({
		code: "AA_PROTOCOL_VERSION_MISMATCH",
		severity: "error",
		phase: "payload",
		title: "Unsupported resumability protocol version",
		message: `Unsupported ${payloadType} protocol version ${String(actualVersion)}.`,
		why: `The ${payloadType} payload was produced for protocol version ${String(actualVersion)}, but this runtime can only decode version ${String(1)}.`,
		payloadType,
		payloadScript: payloadScriptSelector(payloadType),
		expectedVersion: 1,
		actualVersion,
		suggestions: [{ message: "Use matching @async/resumable compiler and runtime package versions." }],
		docsUrl: "https://async.await.dev/errors/AA_PROTOCOL_VERSION_MISMATCH"
	});
}
function contextPayloadType(context) {
	return context.startsWith("async/state") ? "async/state" : "async/view";
}
function payloadScriptSelector(type) {
	return `script[type="${type}"]`;
}
//#endregion
export { RuntimePayloadError, RuntimeResumeError, applyDomJournalRecords, createBindingDomJournalRecord, createResumeRuntime, createRuntimeGraph, createRuntimeGraphFromStatePayload, decodePayloadScripts, decodePayloadScriptsFromDocument, readPayloadScriptsFromDocument, resumeFromPayloadDocument, resumeFromPayloadScripts };
