export type RuntimeGraphCell = {
	readonly bindingId: string;
	readonly value: unknown;
};

export type RuntimeGraphRead = (bindingId: string, path?: ReadonlyArray<string>) => unknown;

export type RuntimeGraphComputedDependency = {
	readonly bindingId: string;
	readonly path?: ReadonlyArray<string>;
};

export type RuntimeGraphComputed = {
	readonly bindingId: string;
	readonly dependencies: ReadonlyArray<RuntimeGraphComputedDependency>;
	readonly compute: (read: RuntimeGraphRead) => unknown;
};

export type RuntimeGraphAsyncSnapshot =
	| {
			readonly status: 'idle';
			readonly version: 0;
	  }
	| {
			readonly status: 'pending';
			readonly version: number;
			readonly key: unknown;
	  }
	| {
			readonly status: 'fulfilled';
			readonly version: number;
			readonly key: unknown;
			readonly value: unknown;
	  }
	| {
			readonly status: 'rejected';
			readonly version: number;
			readonly key: unknown;
			readonly error: unknown;
	  };

export type RuntimeGraphAsyncComputed = {
	readonly bindingId: string;
	readonly dependencies: ReadonlyArray<RuntimeGraphComputedDependency>;
	readonly key: (read: RuntimeGraphRead) => unknown;
	readonly run: (input: {
		readonly key: unknown;
		readonly signal: AbortSignal;
		readonly read: RuntimeGraphRead;
	}) => unknown | Promise<unknown>;
};

export type DomJournalRecord =
	| {
			readonly type: 'setText';
			readonly locator: string;
			readonly value: unknown;
	  }
	| {
			readonly type: 'setAttr' | 'setProp';
			readonly locator: string;
			readonly name: string;
			readonly value: unknown;
	  }
	| {
			readonly type: 'insertRange';
			readonly locator: string;
			readonly fragment: unknown;
	  }
	| {
			readonly type: 'removeRange';
			readonly locator: string;
	  }
	| {
			readonly type: 'moveRange';
			readonly locator: string;
			readonly before: string;
	  }
	| {
			readonly type: 'runCleanup';
			readonly locator: string;
	  };

export type DomJournalResult = DomJournalRecord | ReadonlyArray<DomJournalRecord>;

export type DomJournalListener = (records: ReadonlyArray<DomJournalRecord>) => void | Promise<void>;

export type RuntimeGraphInput = {
	readonly cells: ReadonlyArray<RuntimeGraphCell>;
	readonly computed?: ReadonlyArray<RuntimeGraphComputed>;
	readonly asyncComputed?: ReadonlyArray<RuntimeGraphAsyncComputed>;
};

export type RuntimeGraphWrite = {
	readonly bindingId: string;
	readonly path?: ReadonlyArray<string>;
	readonly value: unknown;
};

export type RuntimeGraphUpdate = {
	readonly bindingId: string;
	readonly path?: ReadonlyArray<string>;
	readonly update: (value: unknown) => unknown;
	readonly returnValue?: 'previous' | 'next';
};

export type RuntimeGraphCall = {
	readonly bindingId: string;
	readonly path?: ReadonlyArray<string>;
	readonly method: string;
	readonly args?: ReadonlyArray<unknown>;
};

export type RuntimeGraphDelete = {
	readonly bindingId: string;
	readonly path: ReadonlyArray<string>;
};

export type RuntimeGraphSubscription = {
	readonly id: string;
	readonly bindingId: string;
	readonly path?: ReadonlyArray<string>;
	readonly run: (value: unknown) => DomJournalResult | void | Promise<DomJournalResult | void>;
};

export type RuntimeGraph = {
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

type DirtyPath = {
	readonly bindingId: string;
	readonly path: ReadonlyArray<string>;
};

type RuntimeComputedNode = RuntimeGraphComputed & {
	dirty: boolean;
	value: unknown;
};

type RuntimeAsyncComputedNode = RuntimeGraphAsyncComputed & {
	controller?: AbortController;
	demanded: boolean;
	keyValue: unknown;
	snapshot: RuntimeGraphAsyncSnapshot;
	version: number;
};

type CollectionMutationSnapshot =
	| {
			readonly type: 'size';
			readonly value: number;
	  }
	| {
			readonly type: 'set-add';
			readonly hadValue: boolean;
	  }
	| {
			readonly type: 'map-set';
			readonly hadKey: boolean;
			readonly valueChanged: boolean;
	  };

export function createRuntimeGraph(input: RuntimeGraphInput): RuntimeGraph {
	const cells = new Map<string, unknown>();
	const computedNodes = new Map<string, RuntimeComputedNode>();
	const asyncComputedNodes = new Map<string, RuntimeAsyncComputedNode>();
	const subscriptions: RuntimeGraphSubscription[] = [];
	const journalListeners: DomJournalListener[] = [];
	const dirtyPaths: DirtyPath[] = [];
	const journal: DomJournalRecord[] = [];
	let flushScheduled = false;
	let flushing = false;

	for (const cell of input.cells) {
		cells.set(cell.bindingId, cell.value);
	}

	for (const computed of input.computed ?? []) {
		computedNodes.set(computed.bindingId, {
			...computed,
			dirty: true,
			value: undefined,
		});
	}

	for (const asyncComputed of input.asyncComputed ?? []) {
		asyncComputedNodes.set(asyncComputed.bindingId, {
			...asyncComputed,
			demanded: false,
			keyValue: undefined,
			snapshot: { status: 'idle', version: 0 },
			version: 0,
		});
	}

	const readGraph: RuntimeGraphRead = (bindingId, path = []) => {
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

	const markComputedDirty = (bindingId: string, visited: Set<string>): void => {
		if (visited.has(bindingId)) return;
		visited.add(bindingId);

		const computed = computedNodes.get(bindingId);
		if (computed) computed.dirty = true;

		dirtyPaths.push({ bindingId, path: [] });

		for (const dependent of computedNodes.values()) {
			const dirty = dependent.dependencies.some(
				(dependency) => dependency.bindingId === bindingId,
			);
			if (dirty) markComputedDirty(dependent.bindingId, visited);
		}

		for (const dependent of asyncComputedNodes.values()) {
			const dirty = dependent.dependencies.some(
				(dependency) => dependency.bindingId === bindingId,
			);
			if (dirty) invalidateAsyncComputed(dependent);
		}
	};

	const markDirtyPath = (bindingId: string, path: ReadonlyArray<string>): void => {
		dirtyPaths.push({ bindingId, path });

		for (const computed of computedNodes.values()) {
			const dirty = computed.dependencies.some(
				(dependency) =>
					dependency.bindingId === bindingId &&
					pathsIntersect(path, dependency.path ?? []),
			);
			if (dirty) markComputedDirty(computed.bindingId, new Set());
		}

		for (const asyncComputed of asyncComputedNodes.values()) {
			const dirty = asyncComputed.dependencies.some(
				(dependency) =>
					dependency.bindingId === bindingId &&
					pathsIntersect(path, dependency.path ?? []),
			);
			if (dirty) invalidateAsyncComputed(asyncComputed);
		}
	};

	const scheduleFlush = (): void => {
		if (flushScheduled || flushing) return;

		flushScheduled = true;
		scheduleMicrotask(() => {
			void flush();
		});
	};

	const demandAsyncComputed = (node: RuntimeAsyncComputedNode): void => {
		if (node.snapshot.status !== 'idle') return;

		node.demanded = true;
		startAsyncComputed(node, node.key(readGraph));
	};

	const invalidateAsyncComputed = (node: RuntimeAsyncComputedNode): void => {
		if (!node.demanded) return;

		const nextKey = node.key(readGraph);
		if (node.snapshot.status !== 'idle' && Object.is(node.keyValue, nextKey)) return;

		startAsyncComputed(node, nextKey);
	};

	const startAsyncComputed = (node: RuntimeAsyncComputedNode, key: unknown): void => {
		node.controller?.abort();

		const controller = new AbortController();
		const version = node.version + 1;
		node.controller = controller;
		node.keyValue = key;
		node.version = version;
		node.snapshot = { status: 'pending', version, key };

		const commitFulfilled = (value: unknown): void => {
			if (node.version !== version || controller.signal.aborted) return;

			node.snapshot = { status: 'fulfilled', version, key, value };
			markDirtyPath(node.bindingId, []);
			scheduleFlush();
		};
		const commitRejected = (error: unknown): void => {
			if (node.version !== version || controller.signal.aborted) return;

			node.snapshot = { status: 'rejected', version, key, error };
			markDirtyPath(node.bindingId, []);
			scheduleFlush();
		};

		try {
			Promise.resolve(node.run({ key, signal: controller.signal, read: readGraph })).then(
				commitFulfilled,
				commitRejected,
			);
		} catch (error) {
			commitRejected(error);
		}

		markDirtyPath(node.bindingId, []);
		scheduleFlush();
	};

	const flush = async (): Promise<void> => {
		if (flushing) return;

		flushScheduled = false;
		flushing = true;

		try {
			while (dirtyPaths.length > 0) {
				const pending = dirtyPaths.splice(0);
				const ranSubscriptions = new Set<string>();

				for (const subscription of subscriptions) {
					const subscriptionPath = subscription.path ?? [];
					const dirty = pending.some(
						(path) =>
							path.bindingId === subscription.bindingId &&
							pathsIntersect(path.path, subscriptionPath),
					);
					if (!dirty || ranSubscriptions.has(subscription.id)) continue;

					ranSubscriptions.add(subscription.id);
					const record = await subscription.run(
						readGraph(subscription.bindingId, subscriptionPath),
					);
					appendJournalResult(journal, record);
				}
			}
		} finally {
			flushing = false;

			if (dirtyPaths.length > 0) {
				scheduleFlush();
			}
		}

		await notifyJournalListeners();
	};

	const notifyJournalListeners = async (): Promise<void> => {
		if (journalListeners.length === 0 || journal.length === 0) return;

		const records = journal.splice(0);
		for (const listener of journalListeners) {
			await listener(records);
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
			if (update.returnValue === 'previous') return currentValue;
			if (update.returnValue === 'next') return nextValue;
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
		},
	};
}

function appendJournalResult(journal: DomJournalRecord[], result: DomJournalResult | void): void {
	if (!result) return;
	if (Array.isArray(result)) {
		journal.push(...result);
		return;
	}

	journal.push(result);
}

function readPath(value: unknown, path: ReadonlyArray<string>): unknown {
	let current = value;

	for (const segment of path) {
		if (current == null) return undefined;
		current = (current as Record<string, unknown>)[segment];
	}

	return current;
}

function writePath(value: unknown, path: ReadonlyArray<string>, nextValue: unknown): unknown {
	if (path.length === 0) return nextValue;

	const root = isObject(value) ? value : {};
	let current = root as Record<string, unknown>;

	for (const segment of path.slice(0, -1)) {
		const child = current[segment];
		if (!isObject(child)) {
			current[segment] = {};
		}
		current = current[segment] as Record<string, unknown>;
	}

	current[path[path.length - 1]] = nextValue;
	return root;
}

function deletePath(
	value: unknown,
	path: ReadonlyArray<string>,
): {
	readonly result: boolean;
	readonly mutated: boolean;
} {
	if (path.length === 0) {
		throw new TypeError('Cannot delete a graph binding root. Delete a property path instead.');
	}

	let current = value;

	for (const segment of path.slice(0, -1)) {
		if (current == null) {
			throw new TypeError(`Cannot delete graph path "${path.join('.')}".`);
		}

		current = (current as Record<string, unknown>)[segment];
	}

	if (current == null) {
		throw new TypeError(`Cannot delete graph path "${path.join('.')}".`);
	}

	if (!isObject(current)) {
		return { result: true, mutated: false };
	}

	const key = path[path.length - 1];
	const hadProperty = Object.prototype.hasOwnProperty.call(current, key);
	const result = delete current[key];

	return { result, mutated: hadProperty && result };
}

function applyCollectionCall(
	target: unknown,
	method: string,
	args: ReadonlyArray<unknown>,
): unknown {
	if (!isSupportedCollectionTarget(target)) {
		throw new TypeError(
			`Cannot call collection method "${method}" because the graph path is not an Array, Map, or Set.`,
		);
	}

	if (!isSupportedCollectionMethod(method)) {
		throw new TypeError(`Unsupported graph collection method "${method}".`);
	}

	const callable = (target as { readonly [key: string]: unknown })[method];
	if (typeof callable !== 'function') {
		throw new TypeError(`Unsupported graph collection method "${method}".`);
	}

	return Reflect.apply(callable, target, [...args]);
}

function collectionCallMutated(
	method: string,
	result: unknown,
	beforeMutation: CollectionMutationSnapshot | null,
): boolean {
	if (method === 'delete') return result === true;
	if (method === 'clear') {
		return beforeMutation?.type === 'size' && beforeMutation.value > 0;
	}
	if (method === 'pop') {
		return beforeMutation?.type === 'size' && beforeMutation.value > 0;
	}
	if (method === 'shift') {
		return beforeMutation?.type === 'size' && beforeMutation.value > 0;
	}
	if (method === 'push' || method === 'unshift') {
		return beforeMutation?.type !== 'size' || result !== beforeMutation.value;
	}
	if (method === 'add') {
		return beforeMutation?.type !== 'set-add' || !beforeMutation.hadValue;
	}
	if (method === 'set') {
		return (
			beforeMutation?.type !== 'map-set' ||
			!beforeMutation.hadKey ||
			beforeMutation.valueChanged
		);
	}

	return true;
}

function collectionMutationSnapshot(
	target: unknown,
	method: string,
	args: ReadonlyArray<unknown>,
): CollectionMutationSnapshot | null {
	if (method === 'add' && target instanceof Set) {
		return { type: 'set-add', hadValue: target.has(args[0]) };
	}
	if (method === 'set' && target instanceof Map) {
		const hadKey = target.has(args[0]);
		return {
			type: 'map-set',
			hadKey,
			valueChanged: !hadKey || !Object.is(target.get(args[0]), args[1]),
		};
	}

	if (Array.isArray(target)) return { type: 'size', value: target.length };
	if (target instanceof Map || target instanceof Set) return { type: 'size', value: target.size };

	return null;
}

function isSupportedCollectionMethod(name: string): boolean {
	return (
		name === 'add' ||
		name === 'clear' ||
		name === 'copyWithin' ||
		name === 'delete' ||
		name === 'fill' ||
		name === 'pop' ||
		name === 'push' ||
		name === 'reverse' ||
		name === 'set' ||
		name === 'shift' ||
		name === 'sort' ||
		name === 'splice' ||
		name === 'unshift'
	);
}

function isSupportedCollectionTarget(
	target: unknown,
): target is unknown[] | Map<unknown, unknown> | Set<unknown> {
	return Array.isArray(target) || target instanceof Map || target instanceof Set;
}

function pathsIntersect(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
	return isPrefix(a, b) || isPrefix(b, a);
}

function isPrefix(prefix: ReadonlyArray<string>, value: ReadonlyArray<string>): boolean {
	if (prefix.length > value.length) return false;

	return prefix.every((segment, index) => value[index] === segment);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function scheduleMicrotask(callback: () => void): void {
	if (typeof queueMicrotask === 'function') {
		queueMicrotask(callback);
		return;
	}

	void Promise.resolve().then(callback);
}
