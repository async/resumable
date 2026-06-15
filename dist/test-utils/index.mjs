//#region packages/test-utils/src/index.ts
function assertPayloadScriptTypes(input) {
	if (!input.stateScript.startsWith("<script type=\"async/state\">")) throw new Error("Expected async/state payload script.");
	if (!input.viewScript.startsWith("<script type=\"async/view\">")) throw new Error("Expected async/view payload script.");
}
function summarizeProtocolPayload(input) {
	return {
		cells: input.state.cells.length,
		locators: input.view.locators.length,
		events: input.view.events.length,
		bindings: input.view.bindings.length,
		behaviors: input.view.behaviors.length
	};
}
//#endregion
export { assertPayloadScriptTypes, summarizeProtocolPayload };
