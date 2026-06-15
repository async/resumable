//#region packages/core/src/index.ts
function state(initial) {
	return compilerIntrinsic("state", initial);
}
function computed(derive) {
	return compilerIntrinsic("computed", derive);
}
function element() {
	return compilerIntrinsic("element");
}
function shared(id, create, options) {
	return compilerIntrinsic("shared", id, create, options);
}
function compilerIntrinsic(name, ..._args) {
	throw new Error(`@async/resumable ${name}() is a TSRX compiler intrinsic and cannot run directly.`);
}
//#endregion
export { computed, element, shared, state };
