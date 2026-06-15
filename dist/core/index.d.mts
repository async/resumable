//#region packages/core/src/index.d.ts
type AsyncComputedValue<T> = T extends Promise<infer Value> ? Awaited<Value> : T;
type ElementHandle<T extends Element = Element> = T | undefined;
type SharedScope = 'request' | 'container' | 'page';
type SharedOptions = {
  readonly scope: SharedScope;
};
declare function state<T>(initial: T): T;
declare function computed<T>(derive: () => T): AsyncComputedValue<T>;
declare function element<T extends Element = Element>(): ElementHandle<T>;
declare function shared<T>(id: string, create: () => T, options: SharedOptions): T;
//#endregion
export { AsyncComputedValue, ElementHandle, SharedOptions, SharedScope, computed, element, shared, state };