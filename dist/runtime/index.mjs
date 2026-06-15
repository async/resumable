import "../protocol/index.mjs";
import { deserializeGraphValue } from "../serializer/index.mjs";
//#region packages/runtime/src/graph.ts
function createRuntimeGraph(input) {
	const cells = /* @__PURE__ */ new Map();
	const computedNodes = /* @__PURE__ */ new Map();
	const asyncComputedNodes = /* @__PURE__ */ new Map();
	const subscriptions = [];
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
					const record = await subscription.run(readGraph(subscription.bindingId, subscriptionPath));
					if (record) journal.push(record);
				}
			}
		} finally {
			flushing = false;
			if (dirtyPaths.length > 0) scheduleFlush();
		}
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
		flush,
		takeJournal() {
			return journal.splice(0);
		}
	};
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
function createResumeRuntime(input) {
	const elementsByHostId = materializeDomLocators(input.root, input.view.locators);
	const asyncBoundariesById = materializeAsyncBoundaryLocators(input.root, input.view.asyncBoundaries);
	const eventRecords = /* @__PURE__ */ new WeakMap();
	const eventTypes = /* @__PURE__ */ new Set();
	const behaviorCleanups = /* @__PURE__ */ new Map();
	for (const eventRecord of input.view.events) {
		const element = elementsByHostId.get(eventRecord.hostNodeId);
		if (!element) continue;
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
			async run() {
				return await (await input.loadSymbol(binding.symbolId))({
					graph: input.graph,
					element
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
		if (eventRecord.syncPolicy && evaluateSyncPolicy(eventRecord.syncPolicy.when, input.graph, event)) runSyncPolicyActions(eventRecord.syncPolicy, event);
		for (const symbolId of eventRecord.symbolIds) await (await input.loadSymbol(symbolId))({
			graph: input.graph,
			event,
			element
		});
		await input.graph.flush();
	}
	async function installBehaviors() {
		for (const behavior of input.view.behaviors) {
			if (!behavior.symbolId) continue;
			const element = elementsByHostId.get(behavior.hostNodeId);
			if (!element) continue;
			const result = await (await input.loadSymbol(behavior.symbolId))({
				graph: input.graph,
				element
			});
			if (typeof result === "function") {
				const cleanups = behaviorCleanups.get(behavior.hostNodeId) ?? [];
				cleanups.push(result);
				behaviorCleanups.set(behavior.hostNodeId, cleanups);
			}
		}
	}
	async function demandAsyncBoundaries() {
		for (const boundary of asyncBoundariesById.values()) for (const asyncRead of boundary.asyncReads) input.graph.read(asyncRead.bindingId, asyncRead.path);
		await input.graph.flush();
	}
	return {
		async start() {
			for (const eventType of eventTypes) input.root.addEventListener?.(eventType, dispatch, { capture: true });
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
			for (const cleanup of [...cleanups].reverse()) cleanup();
			behaviorCleanups.delete(hostNodeId);
		}
	};
}
function materializeAsyncBoundaryLocators(root, boundaries) {
	const comments = walkComments(root);
	const byBoundaryId = /* @__PURE__ */ new Map();
	for (const boundary of boundaries) {
		const startAnchor = comments[boundary.startAnchor.index];
		const endAnchor = comments[boundary.endAnchor.index];
		if (!startAnchor || !endAnchor) continue;
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
		if (!element) continue;
		if (element.tagName.toLowerCase() !== locator.tagName.toLowerCase()) continue;
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
function evaluateSyncPolicy(condition, graph, event) {
	if (condition.type === "and") return condition.conditions.every((child) => evaluateSyncPolicy(child, graph, event));
	if (condition.type === "or") return condition.conditions.some((child) => evaluateSyncPolicy(child, graph, event));
	if (condition.type === "not") return !evaluateSyncPolicy(condition.condition, graph, event);
	if (condition.type === "graph-truthy") return Boolean(graph.read(condition.bindingId, condition.path ?? []));
	return event[condition.field] === condition.value;
}
function runSyncPolicyActions(policy, event) {
	for (const action of policy.actions) {
		if (action === "preventDefault") event.preventDefault?.();
		if (action === "stopPropagation") event.stopPropagation?.();
	}
}
//#endregion
//#region packages/runtime/src/payload.ts
function decodePayloadScripts(input) {
	const state = parseDataScript(input.stateScript, "async/state");
	const view = parseDataScript(input.viewScript, "async/view");
	assertProtocolVersion(state.version, "async/state");
	assertProtocolVersion(view.version, "async/view");
	return {
		state,
		view
	};
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
	const runtime = createResumeRuntime({
		root: input.root,
		graph,
		view: decoded.view,
		loadSymbol: input.loadSymbol
	});
	await runtime.start();
	return {
		decoded,
		graph,
		runtime
	};
}
function parseDataScript(script, type) {
	const prefix = `<script type="${type}">`;
	if (!script.startsWith(prefix) || !script.endsWith("<\/script>")) throw new Error(`Expected ${type} payload script.`);
	return JSON.parse(script.slice(prefix.length, -9));
}
function assertProtocolVersion(version, type) {
	if (version !== 1) throw new Error(`Unsupported ${type} protocol version ${String(version)}.`);
}
//#endregion
export { createResumeRuntime, createRuntimeGraph, createRuntimeGraphFromStatePayload, decodePayloadScripts, resumeFromPayloadScripts };
