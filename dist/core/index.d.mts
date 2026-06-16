//#region packages/core/src/index.d.ts
type AsyncComputedValue<T> = T extends Promise<infer Value> ? Awaited<Value> : T;
type ElementHandle<T extends Element = Element> = T | undefined;
type SharedScope = 'request' | 'container' | 'page';
type SharedOptions = {
  readonly scope: SharedScope;
};
type IntrinsicName = 'state' | 'computed' | 'element' | 'shared';
type IntrinsicRuntimeDiagnostic = {
  readonly code: 'AA_INTRINSIC_RUNTIME_CALL';
  readonly severity: 'error';
  readonly phase: 'runtime';
  readonly title: 'Compiler intrinsic executed at runtime';
  readonly message: string;
  readonly why: string;
  readonly intrinsic: IntrinsicName;
  readonly suggestions: ReadonlyArray<{
    readonly message: string;
  }>;
  readonly docsUrl: string;
};
declare class IntrinsicRuntimeError extends Error implements IntrinsicRuntimeDiagnostic {
  readonly code: "AA_INTRINSIC_RUNTIME_CALL";
  readonly severity: "error";
  readonly phase: "runtime";
  readonly title: "Compiler intrinsic executed at runtime";
  readonly why: string;
  readonly intrinsic: IntrinsicName;
  readonly suggestions: ReadonlyArray<{
    readonly message: string;
  }>;
  readonly docsUrl = "https://async.await.dev/errors/AA_INTRINSIC_RUNTIME_CALL";
  constructor(intrinsic: IntrinsicName);
}
declare function state<T>(initial: T): T;
declare function computed<T>(derive: () => T): AsyncComputedValue<T>;
declare function element<T extends Element = Element>(): ElementHandle<T>;
declare function shared<T>(id: string, create: () => T, options: SharedOptions): T;
//#endregion
export { AsyncComputedValue, ElementHandle, IntrinsicName, IntrinsicRuntimeDiagnostic, IntrinsicRuntimeError, SharedOptions, SharedScope, computed, element, shared, state };