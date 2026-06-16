//#region packages/core/src/index.ts
var IntrinsicRuntimeError = class extends Error {
	code = "AA_INTRINSIC_RUNTIME_CALL";
	severity = "error";
	phase = "runtime";
	title = "Compiler intrinsic executed at runtime";
	why;
	intrinsic;
	suggestions;
	docsUrl = "https://async.await.dev/errors/AA_INTRINSIC_RUNTIME_CALL";
	constructor(intrinsic) {
		super(intrinsicRuntimeMessage(intrinsic));
		this.name = "IntrinsicRuntimeError";
		this.intrinsic = intrinsic;
		this.why = `${intrinsic}() is an @async/resumable compiler intrinsic. It must be compiled from a .tsrx reactive scope before runtime execution.`;
		this.suggestions = [{ message: "Use this API from a .tsrx file processed by the @async/resumable compiler, not from plain runtime JavaScript." }];
	}
};
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
	throw new IntrinsicRuntimeError(name);
}
function intrinsicRuntimeMessage(name) {
	return `@async/resumable ${name}() is a TSRX compiler intrinsic and cannot run directly.`;
}
//#endregion
export { IntrinsicRuntimeError, computed, element, shared, state };
