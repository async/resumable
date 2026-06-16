//#region packages/test-utils/src/index.ts
function assertPayloadScriptTypes(input) {
	assertPayloadScriptWrapper(input.stateScript, "async/state");
	assertPayloadScriptWrapper(input.viewScript, "async/view");
}
function decodePayloadScriptPair(input) {
	return {
		state: parsePayloadScript(input.stateScript, "async/state"),
		view: parsePayloadScript(input.viewScript, "async/view")
	};
}
function summarizePayloadScripts(input) {
	return summarizeProtocolPayload(decodePayloadScriptPair(input));
}
function createPayloadDebugDump(input) {
	const decoded = decodePayloadScriptPair(input);
	return {
		summary: summarizeProtocolPayload(decoded),
		state: {
			version: decoded.state.version,
			cells: decoded.state.cells.map((cell) => ({
				bindingId: cell.bindingId,
				name: cell.name,
				valueKind: cell.valueKind
			})),
			computed: decoded.state.computed.map((computed) => ({ ...computed }))
		},
		view: {
			version: decoded.view.version,
			locators: decoded.view.locators.map((locator) => ({
				hostNodeId: locator.hostNodeId,
				index: locator.index,
				tagName: locator.tagName
			})),
			events: decoded.view.events.map((event) => ({
				hostNodeId: event.hostNodeId,
				eventName: event.eventName,
				symbolIds: [...event.symbolIds],
				hasSyncPolicy: event.syncPolicy !== void 0
			})),
			bindings: decoded.view.bindings.map((binding) => ({
				hostNodeId: binding.hostNodeId,
				source: binding.source,
				bindingId: binding.bindingId,
				path: [...binding.path],
				...binding.target ? { target: cloneBindingTarget(binding.target) } : {},
				symbolId: binding.symbolId
			})),
			behaviors: decoded.view.behaviors.map((behavior) => ({ ...behavior })),
			elementHandles: decoded.view.elementHandles.map((handle) => ({ ...handle })),
			asyncBoundaries: decoded.view.asyncBoundaries.map((boundary) => ({
				id: boundary.id,
				startIndex: boundary.startAnchor.index,
				endIndex: boundary.endAnchor.index,
				asyncReads: boundary.asyncReads.map((read) => ({
					source: read.source,
					bindingId: read.bindingId,
					path: [...read.path],
					runnerSymbolId: read.runnerSymbolId
				}))
			}))
		}
	};
}
function summarizeProtocolPayload(input) {
	return {
		cells: input.state.cells.length,
		computed: input.state.computed.length,
		locators: input.view.locators.length,
		events: input.view.events.length,
		bindings: input.view.bindings.length,
		behaviors: input.view.behaviors.length,
		elementHandles: input.view.elementHandles.length,
		asyncBoundaries: input.view.asyncBoundaries.length
	};
}
function parsePayloadScript(script, type) {
	assertPayloadScriptWrapper(script, type);
	try {
		return JSON.parse(script.slice(scriptPrefix(type).length, -scriptSuffix.length));
	} catch {
		throw new Error(`Invalid ${type} payload JSON.`);
	}
}
function cloneBindingTarget(target) {
	if (target.kind === "attribute") return {
		kind: "attribute",
		name: target.name
	};
	if (target.kind === "property") return {
		kind: "property",
		name: target.name
	};
	if (target.kind === "class") return { kind: "class" };
	if (target.kind === "style") return { kind: "style" };
	return { kind: "text" };
}
function assertPayloadScriptWrapper(script, type) {
	if (!script.startsWith(scriptPrefix(type)) || !script.endsWith(scriptSuffix)) throw new Error(`Expected ${type} payload script.`);
}
function scriptPrefix(type) {
	return `<script type="${type}">`;
}
const scriptSuffix = "<\/script>";
//#endregion
export { assertPayloadScriptTypes, createPayloadDebugDump, decodePayloadScriptPair, summarizePayloadScripts, summarizeProtocolPayload };
