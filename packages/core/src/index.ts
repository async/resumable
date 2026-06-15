export type AsyncComputedValue<T> = T extends Promise<infer Value> ? Awaited<Value> : T;

export type ElementHandle<T extends Element = Element> = T | undefined;

export type SharedScope = 'request' | 'container' | 'page';

export type SharedOptions = {
	readonly scope: SharedScope;
};

export type IntrinsicName = 'state' | 'computed' | 'element' | 'shared';

export type IntrinsicRuntimeDiagnostic = {
	readonly code: 'AA_INTRINSIC_RUNTIME_CALL';
	readonly severity: 'error';
	readonly phase: 'runtime';
	readonly title: 'Compiler intrinsic executed at runtime';
	readonly message: string;
	readonly why: string;
	readonly intrinsic: IntrinsicName;
	readonly suggestions: ReadonlyArray<{ readonly message: string }>;
	readonly docsUrl: string;
};

export class IntrinsicRuntimeError extends Error implements IntrinsicRuntimeDiagnostic {
	readonly code = 'AA_INTRINSIC_RUNTIME_CALL' as const;
	readonly severity = 'error' as const;
	readonly phase = 'runtime' as const;
	readonly title = 'Compiler intrinsic executed at runtime' as const;
	readonly why: string;
	readonly intrinsic: IntrinsicName;
	readonly suggestions: ReadonlyArray<{ readonly message: string }>;
	readonly docsUrl = 'https://async.await.dev/errors/AA_INTRINSIC_RUNTIME_CALL';

	constructor(intrinsic: IntrinsicName) {
		super(intrinsicRuntimeMessage(intrinsic));
		this.name = 'IntrinsicRuntimeError';
		this.intrinsic = intrinsic;
		this.why = `${intrinsic}() is an @async/resumable compiler intrinsic. It must be compiled from a .tsrx reactive scope before runtime execution.`;
		this.suggestions = [
			{
				message:
					'Use this API from a .tsrx file processed by the @async/resumable compiler, not from plain runtime JavaScript.',
			},
		];
	}
}

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
	throw new IntrinsicRuntimeError(name as IntrinsicName);
}

function intrinsicRuntimeMessage(name: IntrinsicName): string {
	return `@async/resumable ${name}() is a TSRX compiler intrinsic and cannot run directly.`;
}
