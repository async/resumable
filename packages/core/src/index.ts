export type AsyncComputedValue<T> = T extends Promise<infer Value> ? Awaited<Value> : T;

export type ElementHandle<T extends Element = Element> = T | undefined;

export type SharedScope = 'request' | 'container' | 'page';

export type SharedOptions = {
	readonly scope: SharedScope;
};

export function state<T>(initial: T): T {
	return compilerIntrinsic<T>('state', initial);
}

export function computed<T>(derive: () => T): AsyncComputedValue<T> {
	return compilerIntrinsic<AsyncComputedValue<T>>('computed', derive);
}

export function element<T extends Element = Element>(): ElementHandle<T> {
	return compilerIntrinsic<ElementHandle<T>>('element');
}

export function shared<T>(id: string, create: () => T, options: SharedOptions): T {
	return compilerIntrinsic<T>('shared', id, create, options);
}

function compilerIntrinsic<T>(name: string, ..._args: unknown[]): T {
	throw new Error(
		`@async/resumable ${name}() is a TSRX compiler intrinsic and cannot run directly.`,
	);
}
