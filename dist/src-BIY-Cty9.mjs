import "./protocol/index.mjs";
import { createProtocolStatePayload, renderPayloadScripts } from "./serializer/index.mjs";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
//#endregion
//#region packages/compiler/src/pass-graph.ts
function validateCompilerPassGraph(passes, initialArtifacts) {
	const producers = /* @__PURE__ */ new Map();
	const passIds = /* @__PURE__ */ new Set();
	for (const pass of passes) {
		if (passIds.has(pass.passId)) throw new Error(`Compiler pass "${pass.passId}" is declared more than once.`);
		passIds.add(pass.passId);
		for (const artifact of pass.produces) {
			const producer = producers.get(artifact);
			if (producer) throw new Error(`Compiler artifact "${artifact}" is produced by both "${producer}" and "${pass.passId}".`);
			producers.set(artifact, pass.passId);
		}
	}
	const knownArtifacts = new Set(initialArtifacts);
	const orderedPassIds = [];
	const remaining = [...passes];
	while (remaining.length > 0) {
		const nextIndex = remaining.findIndex((pass) => pass.consumes.every((artifact) => knownArtifacts.has(artifact)));
		if (nextIndex === -1) {
			const missing = findMissingCompilerArtifact(remaining, knownArtifacts, producers);
			if (missing) throw new Error(`Missing compiler artifact "${missing.artifact}" consumed by pass "${missing.passId}".`);
			throw new Error(`Compiler pass graph has a dependency cycle involving ${remaining.map((pass) => pass.passId).join(", ")}.`);
		}
		const [pass] = remaining.splice(nextIndex, 1);
		orderedPassIds.push(pass.passId);
		for (const artifact of pass.produces) knownArtifacts.add(artifact);
	}
	return {
		orderedPassIds,
		artifacts: [...knownArtifacts]
	};
}
function findMissingCompilerArtifact(passes, knownArtifacts, producers) {
	for (const pass of passes) for (const artifact of pass.consumes) if (!knownArtifacts.has(artifact) && !producers.has(artifact)) return {
		artifact,
		passId: pass.passId
	};
	return null;
}
//#endregion
//#region packages/compiler/src/pass-registry.ts
const defaultCompilerPasses = [
	{
		passId: "tsrx-semantic-graph",
		description: "Build the TSRX semantic graph artifact from source.",
		consumes: ["source"],
		produces: ["semanticGraph"]
	},
	{
		passId: "state-lowering",
		description: "Lower graph state reads and writes into state access artifacts.",
		consumes: ["semanticGraph"],
		produces: ["stateLowering"]
	},
	{
		passId: "payload-arena",
		description: "Plan state and view payload arenas from semantic and state artifacts.",
		consumes: ["semanticGraph", "stateLowering"],
		produces: ["payloadArena"]
	},
	{
		passId: "symbol-resolver",
		description: "Plan lazy symbols and sync policy records for the generated resolver.",
		consumes: ["semanticGraph", "payloadArena"],
		produces: ["symbolResolver"]
	},
	{
		passId: "capture-analysis",
		description: "Analyze extracted symbol sources for resumable capture eligibility.",
		consumes: ["semanticGraph", "symbolResolver"],
		produces: ["captureAnalysis"]
	},
	{
		passId: "protocol-state",
		description: "Create the serializable protocol state payload.",
		consumes: ["semanticGraph", "payloadArena"],
		produces: ["protocolState"]
	},
	{
		passId: "protocol-view",
		description: "Create the protocol view payload with symbol IDs wired to view records.",
		consumes: ["payloadArena", "symbolResolver"],
		produces: ["protocolView"]
	},
	{
		passId: "payload-scripts",
		description: "Render async/state and async/view data scripts and the render shell.",
		consumes: ["protocolState", "protocolView"],
		produces: ["payloadScripts", "renderShell"]
	},
	{
		passId: "symbol-resolver-module",
		description: "Emit the generated symbol resolver module that owns dynamic imports.",
		consumes: ["symbols"],
		produces: ["symbolResolverModule", "symbolResolverModuleManifest"]
	}
];
//#endregion
//#region packages/compiler/src/passes/capture-analysis.ts
function analyzeCaptures(input) {
	const extractedSymbols = input.symbolResolver.symbols.map((symbol) => ({
		symbolId: symbol.id,
		kind: symbol.kind,
		source: symbolSource(symbol)
	}));
	return {
		passId: "capture-analysis",
		extractedSymbols,
		diagnostics: extractedSymbols.flatMap((symbol) => input.semanticGraph.localBindings.flatMap((binding) => isCaptured(symbol.source, binding.name) ? [unsupportedCaptureDiagnostic(symbol, binding)] : []))
	};
}
function unsupportedCaptureDiagnostic(symbol, binding) {
	return {
		code: "AA_CAPTURE_UNSUPPORTED_VALUE",
		severity: "error",
		phase: "capture-analysis",
		title: `Cannot capture local ${bindingKindLabel(binding.kind)} in lazy symbol`,
		message: `Cannot capture "${binding.name}" in lazy ${symbol.kind} symbol "${symbol.symbolId}" because local ${bindingKindLabel(binding.kind)} values cannot cross a resume boundary.`,
		why: "Lazy symbols run after browser resume. Captures must be graph references, element handles, props/shared values, module imports, or serializable constants.",
		primarySpan: binding.sourceSpan,
		passId: "capture-analysis",
		artifactKeys: [
			"semanticGraph",
			"symbolResolver",
			"captureAnalysis"
		],
		symbolId: symbol.symbolId,
		source: symbol.source,
		suggestions: [{ message: suggestionForBinding(binding.kind) }],
		docsUrl: "https://async.await.dev/errors/AA_CAPTURE_UNSUPPORTED_VALUE"
	};
}
function bindingKindLabel(kind) {
	if (kind === "class-instance") return "class instance";
	if (kind === "dom-node") return "DOM node";
	if (kind === "non-serializable-constant") return "non-serializable constant";
	return "function";
}
function suggestionForBinding(kind) {
	if (kind === "class-instance") return "Represent durable data with state()/computed(), hoist serializable helpers to module scope, or move DOM-backed setup into a host element behavior with use.";
	if (kind === "dom-node") return "Use element() with el={...} for DOM locators, or move DOM-backed setup into a host element behavior with use.";
	if (kind === "non-serializable-constant") return "Keep captured constants serializable, move functions to module scope, or represent durable data with state()/computed().";
	return "Move the helper to module scope, inline the derivation, or represent durable data with state()/computed().";
}
function isCaptured(source, name) {
	const searchableSource = sourceWithoutStringOrCommentText(source);
	if (symbolLocalBindingNames(searchableSource).has(name)) return false;
	for (let index = searchableSource.indexOf(name); index !== -1; index = searchableSource.indexOf(name, index + name.length)) {
		const before = searchableSource[index - 1] ?? "";
		const after = searchableSource[index + name.length] ?? "";
		if (isIdentifierChar$1(before) || before === ".") continue;
		if (isIdentifierChar$1(after)) continue;
		if (nextNonWhitespace(searchableSource, index + name.length) === ":") continue;
		if (isObjectMethodKey(searchableSource, index, name.length)) continue;
		return true;
	}
	return false;
}
function symbolLocalBindingNames(source) {
	const names = new Set(leadingArrowFunctionParameterNames(source));
	const body = leadingArrowFunctionBlockBody(source);
	if (body === null) return names;
	for (const name of topLevelDeclarationNames(body)) names.add(name);
	return names;
}
function leadingArrowFunctionParameterNames(source) {
	const start = nextNonWhitespaceIndex(source, 0);
	if (start === -1) return /* @__PURE__ */ new Set();
	return leadingArrowFunctionParameterNamesFrom(source, start);
}
function leadingArrowFunctionParameterNamesFrom(source, start) {
	if (startsWithKeyword(source, start, "async")) {
		const afterAsync = nextNonWhitespaceIndex(source, start + 5);
		if (afterAsync === -1) return /* @__PURE__ */ new Set();
		return leadingArrowFunctionParameterNamesFrom(source, afterAsync);
	}
	if (source[start] === "(") {
		const paramsEnd = matchingCloseParenIndex(source, start);
		if (paramsEnd === -1) return /* @__PURE__ */ new Set();
		if (!startsWithArrow(source, nextNonWhitespaceIndex(source, paramsEnd + 1))) return /* @__PURE__ */ new Set();
		return simpleParameterNames(source.slice(start + 1, paramsEnd));
	}
	const identifierEnd = identifierEndIndex(source, start);
	if (identifierEnd === start) return /* @__PURE__ */ new Set();
	if (!startsWithArrow(source, nextNonWhitespaceIndex(source, identifierEnd))) return /* @__PURE__ */ new Set();
	return new Set([source.slice(start, identifierEnd)]);
}
function leadingArrowFunctionBlockBody(source) {
	const bodyStart = leadingArrowFunctionBodyStart(source);
	if (bodyStart === -1 || source[bodyStart] !== "{") return null;
	const bodyEnd = matchingCloseBraceIndex(source, bodyStart);
	if (bodyEnd === -1) return null;
	return source.slice(bodyStart + 1, bodyEnd);
}
function leadingArrowFunctionBodyStart(source) {
	const start = nextNonWhitespaceIndex(source, 0);
	if (start === -1) return -1;
	return leadingArrowFunctionBodyStartFrom(source, start);
}
function leadingArrowFunctionBodyStartFrom(source, start) {
	if (startsWithKeyword(source, start, "async")) {
		const afterAsync = nextNonWhitespaceIndex(source, start + 5);
		if (afterAsync === -1) return -1;
		return leadingArrowFunctionBodyStartFrom(source, afterAsync);
	}
	if (source[start] === "(") {
		const paramsEnd = matchingCloseParenIndex(source, start);
		if (paramsEnd === -1) return -1;
		const afterParams = nextNonWhitespaceIndex(source, paramsEnd + 1);
		if (!startsWithArrow(source, afterParams)) return -1;
		return nextNonWhitespaceIndex(source, afterParams + 2);
	}
	const identifierEnd = identifierEndIndex(source, start);
	if (identifierEnd === start) return -1;
	const afterIdentifier = nextNonWhitespaceIndex(source, identifierEnd);
	if (!startsWithArrow(source, afterIdentifier)) return -1;
	return nextNonWhitespaceIndex(source, afterIdentifier + 2);
}
function simpleParameterNames(source) {
	const names = /* @__PURE__ */ new Set();
	for (const rawParam of source.split(",")) {
		const param = rawParam.trim().replace(/^\.\.\./, "").trim();
		const nameEnd = identifierEndIndex(param, 0);
		if (nameEnd > 0) names.add(param.slice(0, nameEnd));
	}
	return names;
}
function topLevelDeclarationNames(source) {
	const names = /* @__PURE__ */ new Set();
	let parenDepth = 0;
	let bracketDepth = 0;
	let braceDepth = 0;
	for (let index = 0; index < source.length; index++) {
		const char = source[index] ?? "";
		if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
			const variableKeyword = variableDeclarationKeywordAt(source, index);
			if (variableKeyword !== null) {
				index = collectVariableDeclarationNames(source, index + variableKeyword.length, names);
				continue;
			}
			const namedDeclarationKeyword = namedDeclarationKeywordAt(source, index);
			if (namedDeclarationKeyword !== null) {
				index = collectNamedDeclarationName(source, index + namedDeclarationKeyword.length, names);
				continue;
			}
		}
		if (char === "(") parenDepth++;
		if (char === ")" && parenDepth > 0) parenDepth--;
		if (char === "[") bracketDepth++;
		if (char === "]" && bracketDepth > 0) bracketDepth--;
		if (char === "{") braceDepth++;
		if (char === "}" && braceDepth > 0) braceDepth--;
	}
	return names;
}
function variableDeclarationKeywordAt(source, index) {
	if (startsWithKeyword(source, index, "const")) return "const";
	if (startsWithKeyword(source, index, "let")) return "let";
	if (startsWithKeyword(source, index, "var")) return "var";
	return null;
}
function namedDeclarationKeywordAt(source, index) {
	if (startsWithKeyword(source, index, "function")) return "function";
	if (startsWithKeyword(source, index, "class")) return "class";
	return null;
}
function collectVariableDeclarationNames(source, start, names) {
	let index = nextNonWhitespaceIndex(source, start);
	if (index === -1) return source.length;
	while (index < source.length) {
		const nameEnd = identifierEndIndex(source, index);
		if (nameEnd > index) {
			names.add(source.slice(index, nameEnd));
			index = nameEnd;
		}
		index = skipVariableDeclarator(source, index);
		const next = nextNonWhitespaceIndex(source, index);
		if (next === -1) return source.length;
		if (source[next] === ",") {
			index = nextNonWhitespaceIndex(source, next + 1);
			if (index === -1) return source.length;
			continue;
		}
		return next;
	}
	return source.length;
}
function skipVariableDeclarator(source, start) {
	let parenDepth = 0;
	let bracketDepth = 0;
	let braceDepth = 0;
	for (let index = start; index < source.length; index++) {
		const char = source[index] ?? "";
		if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
			if (char === "," || char === ";") return index;
		}
		if (char === "(") parenDepth++;
		if (char === ")" && parenDepth > 0) parenDepth--;
		if (char === "[") bracketDepth++;
		if (char === "]" && bracketDepth > 0) bracketDepth--;
		if (char === "{") braceDepth++;
		if (char === "}" && braceDepth > 0) braceDepth--;
	}
	return source.length;
}
function collectNamedDeclarationName(source, start, names) {
	let nameStart = nextNonWhitespaceIndex(source, start);
	if (source[nameStart] === "*") nameStart = nextNonWhitespaceIndex(source, nameStart + 1);
	if (nameStart === -1) return source.length;
	const nameEnd = identifierEndIndex(source, nameStart);
	if (nameEnd > nameStart) names.add(source.slice(nameStart, nameEnd));
	return nameEnd;
}
function startsWithKeyword(source, start, keyword) {
	const end = start + keyword.length;
	return source.slice(start, end) === keyword && !isIdentifierChar$1(source[start - 1] ?? "") && !isIdentifierChar$1(source[end] ?? "");
}
function startsWithArrow(source, start) {
	return start !== -1 && source[start] === "=" && source[start + 1] === ">";
}
function identifierEndIndex(source, start) {
	if (!isIdentifierStart$1(source[start] ?? "")) return start;
	let index = start + 1;
	while (isIdentifierChar$1(source[index] ?? "")) index++;
	return index;
}
function isIdentifierStart$1(char) {
	return /[A-Za-z_$]/.test(char);
}
function isIdentifierChar$1(char) {
	return /[\w$]/.test(char);
}
function nextNonWhitespace(source, startIndex) {
	for (let index = startIndex; index < source.length; index++) {
		const char = source[index] ?? "";
		if (!/\s/.test(char)) return char;
	}
	return "";
}
function previousNonWhitespace(source, startIndex) {
	for (let index = startIndex; index >= 0; index--) {
		const char = source[index] ?? "";
		if (!/\s/.test(char)) return char;
	}
	return "";
}
function isObjectMethodKey(source, nameStart, nameLength) {
	const previous = previousNonWhitespace(source, nameStart - 1);
	if (previous !== "{" && previous !== ",") return false;
	const paramsStart = nextNonWhitespaceIndex(source, nameStart + nameLength);
	if (source[paramsStart] !== "(") return false;
	const paramsEnd = matchingCloseParenIndex(source, paramsStart);
	if (paramsEnd === -1) return false;
	return nextNonWhitespace(source, paramsEnd + 1) === "{";
}
function nextNonWhitespaceIndex(source, startIndex) {
	for (let index = startIndex; index < source.length; index++) {
		const char = source[index] ?? "";
		if (!/\s/.test(char)) return index;
	}
	return -1;
}
function matchingCloseParenIndex(source, openParenIndex) {
	let depth = 0;
	for (let index = openParenIndex; index < source.length; index++) {
		const char = source[index] ?? "";
		if (char === "(") depth++;
		if (char === ")") {
			depth--;
			if (depth === 0) return index;
		}
	}
	return -1;
}
function matchingCloseBraceIndex(source, openBraceIndex) {
	let depth = 0;
	for (let index = openBraceIndex; index < source.length; index++) {
		const char = source[index] ?? "";
		if (char === "{") depth++;
		if (char === "}") {
			depth--;
			if (depth === 0) return index;
		}
	}
	return -1;
}
function sourceWithoutStringOrCommentText(source) {
	let output = "";
	const stack = [];
	for (let index = 0; index < source.length; index++) {
		const char = source[index] ?? "";
		const next = source[index + 1] ?? "";
		const mode = stack[stack.length - 1];
		if (mode === "template") {
			if (char === "\\") {
				output += "  ";
				index++;
				continue;
			}
			if (char === "`") {
				output += " ";
				stack.pop();
				continue;
			}
			if (char === "$" && next === "{") {
				output += "  ";
				index++;
				stack.push({
					mode: "template-expression",
					depth: 1
				});
				continue;
			}
			output += char === "\n" ? "\n" : " ";
			continue;
		}
		if (char === "'" || char === "\"") {
			const result = consumeQuotedText(source, index, char);
			output += result.replacement;
			index = result.endIndex;
			continue;
		}
		if (char === "`") {
			output += " ";
			stack.push("template");
			continue;
		}
		if (char === "/" && next === "/") {
			const result = consumeLineComment(source, index);
			output += result.replacement;
			index = result.endIndex;
			continue;
		}
		if (char === "/" && next === "*") {
			const result = consumeBlockComment(source, index);
			output += result.replacement;
			index = result.endIndex;
			continue;
		}
		if (typeof mode === "object") {
			if (char === "{") mode.depth++;
			if (char === "}") {
				mode.depth--;
				if (mode.depth === 0) {
					output += " ";
					stack.pop();
					continue;
				}
			}
		}
		output += char;
	}
	return output;
}
function consumeQuotedText(source, startIndex, quote) {
	let replacement = " ";
	for (let index = startIndex + 1; index < source.length; index++) {
		const char = source[index] ?? "";
		if (char === "\\") {
			replacement += "  ";
			index++;
			continue;
		}
		replacement += char === "\n" ? "\n" : " ";
		if (char === quote) return {
			replacement,
			endIndex: index
		};
	}
	return {
		replacement,
		endIndex: source.length - 1
	};
}
function consumeLineComment(source, startIndex) {
	let replacement = "  ";
	for (let index = startIndex + 2; index < source.length; index++) {
		if ((source[index] ?? "") === "\n") {
			replacement += "\n";
			return {
				replacement,
				endIndex: index
			};
		}
		replacement += " ";
	}
	return {
		replacement,
		endIndex: source.length - 1
	};
}
function consumeBlockComment(source, startIndex) {
	let replacement = "  ";
	for (let index = startIndex + 2; index < source.length; index++) {
		const char = source[index] ?? "";
		const next = source[index + 1] ?? "";
		if (char === "*" && next === "/") {
			replacement += "  ";
			return {
				replacement,
				endIndex: index + 1
			};
		}
		replacement += char === "\n" ? "\n" : " ";
	}
	return {
		replacement,
		endIndex: source.length - 1
	};
}
function symbolSource(symbol) {
	if (symbol.kind === "event-handler") return symbol.source;
	if (symbol.kind === "dom-binding") return symbol.source;
	if (symbol.kind === "behavior") return symbol.source;
	if (symbol.kind === "async-computed-runner") return symbol.name;
	return "";
}
//#endregion
//#region packages/compiler/src/artifact-helpers/graph-paths.ts
function resolveGraphPath(source, bindings, aliases = /* @__PURE__ */ new Map()) {
	return resolveGraphSegments(splitStaticGraphPath(source), bindings, aliases, /* @__PURE__ */ new Set());
}
function graphBindingMap(graph) {
	const bindings = /* @__PURE__ */ new Map();
	for (const binding of graph.graphBindings) bindings.set(binding.name, binding);
	return bindings;
}
function semanticAliasMap(graph) {
	const aliases = /* @__PURE__ */ new Map();
	for (const alias of graph.aliases) aliases.set(alias.name, alias);
	return aliases;
}
function graphPathSource(binding, path) {
	return [binding.name, ...path].join(".");
}
function uniqueBy(values, keyOf) {
	const seen = /* @__PURE__ */ new Set();
	const unique = [];
	for (const value of values) {
		const key = keyOf(value);
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(value);
	}
	return unique;
}
function resolveGraphSegments(segments, bindings, aliases, visitedAliases) {
	if (segments.length === 0) return null;
	const alias = aliases.get(segments[0]);
	if (alias) {
		if (visitedAliases.has(alias.name)) return null;
		if (aliasExcludesPath(alias, segments.slice(1))) return null;
		visitedAliases.add(alias.name);
		return resolveGraphSegments([...splitStaticGraphPath(alias.target), ...segments.slice(1)], bindings, aliases, visitedAliases);
	}
	const binding = bindings.get(segments[0]);
	if (!binding) return null;
	return {
		binding,
		path: segments.slice(1)
	};
}
function aliasExcludesPath(alias, path) {
	if (path.length === 0) return false;
	return (alias.excludedPaths ?? []).some((excludedPath) => {
		if (excludedPath.length > path.length) return false;
		return excludedPath.every((segment, index) => segment === path[index]);
	});
}
function splitStaticGraphPath(source) {
	return source.replace(/\[['"]([^'"]+)['"]\]/g, ".$1").replace(/\[(\d+)\]/g, ".$1").split(".").map((segment) => segment.trim()).filter(Boolean);
}
//#endregion
//#region packages/compiler/src/passes/payload-arena.ts
function planPayloadArena(input) {
	const bindings = /* @__PURE__ */ new Map();
	const aliases = semanticAliasMap(input.semanticGraph);
	for (const binding of input.semanticGraph.graphBindings) bindings.set(binding.name, binding);
	const cells = input.semanticGraph.graphBindings.filter((binding) => binding.kind === "state").map((binding) => ({
		bindingId: binding.id,
		name: binding.name,
		valueKind: binding.valueKind ?? "unknown"
	}));
	const computed = input.semanticGraph.graphBindings.filter((binding) => binding.kind === "computed" && binding.async === true).map((binding) => ({
		bindingId: binding.id,
		name: binding.name,
		async: binding.async === true
	}));
	const locators = input.semanticGraph.hostNodes.map((hostNode, index) => ({
		hostNodeId: hostNode.id,
		strategy: "dom-order",
		index,
		tagName: hostNode.tagName
	}));
	const viewBindings = input.semanticGraph.templateReads.flatMap((read) => {
		const resolved = resolveGraphPath(read.source, bindings, aliases);
		if (!resolved) return [];
		return [{
			hostNodeId: read.hostNodeId,
			source: read.source,
			bindingId: resolved.binding.id,
			path: resolved.path
		}];
	});
	const elementHandles = input.semanticGraph.elementHandleBindings.flatMap((binding) => {
		const graphBinding = bindings.get(binding.handleName);
		if (!graphBinding || graphBinding.kind !== "element") return [];
		return [{
			hostNodeId: binding.hostNodeId,
			handleId: graphBinding.id,
			name: binding.handleName
		}];
	});
	const asyncBoundaries = input.semanticGraph.asyncBoundaries.map((boundary, index) => ({
		id: boundary.id,
		startAnchor: {
			strategy: "dom-order-comment",
			index: index * 2
		},
		endAnchor: {
			strategy: "dom-order-comment",
			index: index * 2 + 1
		},
		asyncReads: uniqueBy(input.semanticGraph.templateReads.flatMap((read) => {
			if (read.asyncBoundaryId !== boundary.id) return [];
			const resolved = resolveGraphPath(read.source, bindings, aliases);
			if (!resolved) return [];
			if (resolved.binding.kind !== "computed" || resolved.binding.asyncCapable !== true) return [];
			return [{
				source: read.source,
				bindingId: resolved.binding.id,
				path: resolved.path
			}];
		}), (read) => `${read.bindingId}:${read.path.join(".")}:${read.source}`)
	}));
	return {
		passId: "payload-arena",
		state: {
			cells,
			computed
		},
		view: {
			locators,
			events: input.semanticGraph.events,
			bindings: uniqueBy(viewBindings, (binding) => `${binding.hostNodeId}:${binding.bindingId}:${binding.path.join(".")}`),
			behaviors: input.semanticGraph.behaviors,
			elementHandles,
			asyncBoundaries
		},
		diagnostics: input.stateLowering.diagnostics
	};
}
//#endregion
//#region packages/compiler/src/passes/payload-scripts.ts
function renderPayloadScriptArtifact(input) {
	const payloadScripts = renderPayloadScripts({
		state: input.protocolState,
		view: input.protocolView
	});
	return {
		payloadScripts,
		renderShell: `${payloadScripts.stateScript}${payloadScripts.viewScript}`
	};
}
//#endregion
//#region packages/compiler/src/passes/protocol-state.ts
function createProtocolStatePayloadFromArena(input) {
	return createProtocolStatePayload({
		cells: input.payloadArena.state.cells.map((cell) => {
			const binding = input.semanticGraph.graphBindings.find((candidate) => candidate.id === cell.bindingId);
			return {
				...cell,
				valueKind: cell.valueKind ?? "unknown",
				value: binding?.initialValue
			};
		}),
		computed: input.payloadArena.state.computed
	});
}
//#endregion
//#region packages/compiler/src/passes/protocol-view.ts
function createProtocolViewPayload(input) {
	const eventSymbols = /* @__PURE__ */ new Map();
	const bindingSymbols = /* @__PURE__ */ new Map();
	const behaviorSymbols = /* @__PURE__ */ new Map();
	const asyncRunnerSymbols = /* @__PURE__ */ new Map();
	for (const symbol of input.symbolResolver.symbols) {
		if (symbol.kind === "event-handler") {
			const key = `${symbol.hostNodeId}:${symbol.eventName}`;
			const symbols = eventSymbols.get(key) ?? [];
			symbols[symbol.order] = symbol.id;
			eventSymbols.set(key, symbols);
		}
		if (symbol.kind === "dom-binding") bindingSymbols.set(`${symbol.hostNodeId}:${symbol.bindingId}:${symbol.source}`, symbol.id);
		if (symbol.kind === "behavior") {
			const symbols = behaviorSymbols.get(symbol.hostNodeId) ?? [];
			symbols[symbol.order] = symbol.id;
			behaviorSymbols.set(symbol.hostNodeId, symbols);
		}
		if (symbol.kind === "async-computed-runner") asyncRunnerSymbols.set(symbol.bindingId, symbol.id);
	}
	return {
		version: 1,
		locators: input.payloadArena.view.locators,
		events: input.payloadArena.view.events.map((event) => ({
			hostNodeId: event.hostNodeId,
			eventName: event.eventName,
			syncPolicy: event.syncPolicy,
			symbolIds: eventSymbols.get(`${event.hostNodeId}:${event.eventName}`) ?? []
		})),
		bindings: input.payloadArena.view.bindings.map((binding) => ({
			...binding,
			symbolId: bindingSymbols.get(`${binding.hostNodeId}:${binding.bindingId}:${binding.source}`)
		})),
		behaviors: input.payloadArena.view.behaviors.map((behavior, index) => ({
			...behavior,
			symbolId: behaviorSymbols.get(behavior.hostNodeId)?.[index]
		})),
		elementHandles: input.payloadArena.view.elementHandles,
		asyncBoundaries: input.payloadArena.view.asyncBoundaries.map((boundary) => ({
			...boundary,
			asyncReads: boundary.asyncReads.map((read) => ({
				...read,
				runnerSymbolId: asyncRunnerSymbols.get(read.bindingId)
			}))
		}))
	};
}
//#endregion
//#region ../native-tsrx/node_modules/.pnpm/acorn@8.17.0/node_modules/acorn/dist/acorn.mjs
var acorn_exports = /* @__PURE__ */ __exportAll({
	Node: () => Node,
	Parser: () => Parser$1,
	Position: () => Position,
	SourceLocation: () => SourceLocation,
	TokContext: () => TokContext,
	Token: () => Token,
	TokenType: () => TokenType,
	defaultOptions: () => defaultOptions,
	getLineInfo: () => getLineInfo,
	isIdentifierChar: () => isIdentifierChar,
	isIdentifierStart: () => isIdentifierStart,
	isNewLine: () => isNewLine,
	keywordTypes: () => keywords,
	lineBreak: () => lineBreak,
	lineBreakG: () => lineBreakG,
	nonASCIIwhitespace: () => nonASCIIwhitespace,
	parse: () => parse$1,
	parseExpressionAt: () => parseExpressionAt,
	tokContexts: () => types,
	tokTypes: () => types$1,
	tokenizer: () => tokenizer,
	version: () => version
});
var astralIdentifierCodes = [
	509,
	0,
	227,
	0,
	150,
	4,
	294,
	9,
	1368,
	2,
	2,
	1,
	6,
	3,
	41,
	2,
	5,
	0,
	166,
	1,
	574,
	3,
	9,
	9,
	7,
	9,
	32,
	4,
	318,
	1,
	78,
	5,
	71,
	10,
	50,
	3,
	123,
	2,
	54,
	14,
	32,
	10,
	3,
	1,
	11,
	3,
	46,
	10,
	8,
	0,
	46,
	9,
	7,
	2,
	37,
	13,
	2,
	9,
	6,
	1,
	45,
	0,
	13,
	2,
	49,
	13,
	9,
	3,
	2,
	11,
	83,
	11,
	7,
	0,
	3,
	0,
	158,
	11,
	6,
	9,
	7,
	3,
	56,
	1,
	2,
	6,
	3,
	1,
	3,
	2,
	10,
	0,
	11,
	1,
	3,
	6,
	4,
	4,
	68,
	8,
	2,
	0,
	3,
	0,
	2,
	3,
	2,
	4,
	2,
	0,
	15,
	1,
	83,
	17,
	10,
	9,
	5,
	0,
	82,
	19,
	13,
	9,
	214,
	6,
	3,
	8,
	28,
	1,
	83,
	16,
	16,
	9,
	82,
	12,
	9,
	9,
	7,
	19,
	58,
	14,
	5,
	9,
	243,
	14,
	166,
	9,
	71,
	5,
	2,
	1,
	3,
	3,
	2,
	0,
	2,
	1,
	13,
	9,
	120,
	6,
	3,
	6,
	4,
	0,
	29,
	9,
	41,
	6,
	2,
	3,
	9,
	0,
	10,
	10,
	47,
	15,
	199,
	7,
	137,
	9,
	54,
	7,
	2,
	7,
	17,
	9,
	57,
	21,
	2,
	13,
	123,
	5,
	4,
	0,
	2,
	1,
	2,
	6,
	2,
	0,
	9,
	9,
	49,
	4,
	2,
	1,
	2,
	4,
	9,
	9,
	55,
	9,
	266,
	3,
	10,
	1,
	2,
	0,
	49,
	6,
	4,
	4,
	14,
	10,
	5350,
	0,
	7,
	14,
	11465,
	27,
	2343,
	9,
	87,
	9,
	39,
	4,
	60,
	6,
	26,
	9,
	535,
	9,
	470,
	0,
	2,
	54,
	8,
	3,
	82,
	0,
	12,
	1,
	19628,
	1,
	4178,
	9,
	519,
	45,
	3,
	22,
	543,
	4,
	4,
	5,
	9,
	7,
	3,
	6,
	31,
	3,
	149,
	2,
	1418,
	49,
	513,
	54,
	5,
	49,
	9,
	0,
	15,
	0,
	23,
	4,
	2,
	14,
	1361,
	6,
	2,
	16,
	3,
	6,
	2,
	1,
	2,
	4,
	101,
	0,
	161,
	6,
	10,
	9,
	357,
	0,
	62,
	13,
	499,
	13,
	245,
	1,
	2,
	9,
	233,
	0,
	3,
	0,
	8,
	1,
	6,
	0,
	475,
	6,
	110,
	6,
	6,
	9,
	4759,
	9,
	787719,
	239
];
var astralIdentifierStartCodes = [
	0,
	11,
	2,
	25,
	2,
	18,
	2,
	1,
	2,
	14,
	3,
	13,
	35,
	122,
	70,
	52,
	268,
	28,
	4,
	48,
	48,
	31,
	14,
	29,
	6,
	37,
	11,
	29,
	3,
	35,
	5,
	7,
	2,
	4,
	43,
	157,
	19,
	35,
	5,
	35,
	5,
	39,
	9,
	51,
	13,
	10,
	2,
	14,
	2,
	6,
	2,
	1,
	2,
	10,
	2,
	14,
	2,
	6,
	2,
	1,
	4,
	51,
	13,
	310,
	10,
	21,
	11,
	7,
	25,
	5,
	2,
	41,
	2,
	8,
	70,
	5,
	3,
	0,
	2,
	43,
	2,
	1,
	4,
	0,
	3,
	22,
	11,
	22,
	10,
	30,
	66,
	18,
	2,
	1,
	11,
	21,
	11,
	25,
	7,
	25,
	39,
	55,
	7,
	1,
	65,
	0,
	16,
	3,
	2,
	2,
	2,
	28,
	43,
	28,
	4,
	28,
	36,
	7,
	2,
	27,
	28,
	53,
	11,
	21,
	11,
	18,
	14,
	17,
	111,
	72,
	56,
	50,
	14,
	50,
	14,
	35,
	39,
	27,
	10,
	22,
	251,
	41,
	7,
	1,
	17,
	5,
	57,
	28,
	11,
	0,
	9,
	21,
	43,
	17,
	47,
	20,
	28,
	22,
	13,
	52,
	58,
	1,
	3,
	0,
	14,
	44,
	33,
	24,
	27,
	35,
	30,
	0,
	3,
	0,
	9,
	34,
	4,
	0,
	13,
	47,
	15,
	3,
	22,
	0,
	2,
	0,
	36,
	17,
	2,
	24,
	20,
	1,
	64,
	6,
	2,
	0,
	2,
	3,
	2,
	14,
	2,
	9,
	8,
	46,
	39,
	7,
	3,
	1,
	3,
	21,
	2,
	6,
	2,
	1,
	2,
	4,
	4,
	0,
	19,
	0,
	13,
	4,
	31,
	9,
	2,
	0,
	3,
	0,
	2,
	37,
	2,
	0,
	26,
	0,
	2,
	0,
	45,
	52,
	19,
	3,
	21,
	2,
	31,
	47,
	21,
	1,
	2,
	0,
	185,
	46,
	42,
	3,
	37,
	47,
	21,
	0,
	60,
	42,
	14,
	0,
	72,
	26,
	38,
	6,
	186,
	43,
	117,
	63,
	32,
	7,
	3,
	0,
	3,
	7,
	2,
	1,
	2,
	23,
	16,
	0,
	2,
	0,
	95,
	7,
	3,
	38,
	17,
	0,
	2,
	0,
	29,
	0,
	11,
	39,
	8,
	0,
	22,
	0,
	12,
	45,
	20,
	0,
	19,
	72,
	200,
	32,
	32,
	8,
	2,
	36,
	18,
	0,
	50,
	29,
	113,
	6,
	2,
	1,
	2,
	37,
	22,
	0,
	26,
	5,
	2,
	1,
	2,
	31,
	15,
	0,
	24,
	43,
	261,
	18,
	16,
	0,
	2,
	12,
	2,
	33,
	125,
	0,
	80,
	921,
	103,
	110,
	18,
	195,
	2637,
	96,
	16,
	1071,
	18,
	5,
	26,
	3994,
	6,
	582,
	6842,
	29,
	1763,
	568,
	8,
	30,
	18,
	78,
	18,
	29,
	19,
	47,
	17,
	3,
	32,
	20,
	6,
	18,
	433,
	44,
	212,
	63,
	33,
	24,
	3,
	24,
	45,
	74,
	6,
	0,
	67,
	12,
	65,
	1,
	2,
	0,
	15,
	4,
	10,
	7381,
	42,
	31,
	98,
	114,
	8702,
	3,
	2,
	6,
	2,
	1,
	2,
	290,
	16,
	0,
	30,
	2,
	3,
	0,
	15,
	3,
	9,
	395,
	2309,
	106,
	6,
	12,
	4,
	8,
	8,
	9,
	5991,
	84,
	2,
	70,
	2,
	1,
	3,
	0,
	3,
	1,
	3,
	3,
	2,
	11,
	2,
	0,
	2,
	6,
	2,
	64,
	2,
	3,
	3,
	7,
	2,
	6,
	2,
	27,
	2,
	3,
	2,
	4,
	2,
	0,
	4,
	6,
	2,
	339,
	3,
	24,
	2,
	24,
	2,
	30,
	2,
	24,
	2,
	30,
	2,
	24,
	2,
	30,
	2,
	24,
	2,
	30,
	2,
	24,
	2,
	7,
	1845,
	30,
	7,
	5,
	262,
	61,
	147,
	44,
	11,
	6,
	17,
	0,
	322,
	29,
	19,
	43,
	485,
	27,
	229,
	29,
	3,
	0,
	208,
	30,
	2,
	2,
	2,
	1,
	2,
	6,
	3,
	4,
	10,
	1,
	225,
	6,
	2,
	3,
	2,
	1,
	2,
	14,
	2,
	196,
	60,
	67,
	8,
	0,
	1205,
	3,
	2,
	26,
	2,
	1,
	2,
	0,
	3,
	0,
	2,
	9,
	2,
	3,
	2,
	0,
	2,
	0,
	7,
	0,
	5,
	0,
	2,
	0,
	2,
	0,
	2,
	2,
	2,
	1,
	2,
	0,
	3,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	2,
	0,
	2,
	1,
	2,
	0,
	3,
	3,
	2,
	6,
	2,
	3,
	2,
	3,
	2,
	0,
	2,
	9,
	2,
	16,
	6,
	2,
	2,
	4,
	2,
	16,
	4421,
	42719,
	33,
	4381,
	3,
	5773,
	3,
	7472,
	16,
	621,
	2467,
	541,
	1507,
	4938,
	6,
	8489
];
var nonASCIIidentifierChars = "‌‍·̀-ͯ·҃-֑҇-ׇֽֿׁׂׅׄؐ-ًؚ-٩ٰۖ-ۜ۟-۪ۤۧۨ-ۭ۰-۹ܑܰ-݊ަ-ް߀-߉߫-߽߳ࠖ-࠙ࠛ-ࠣࠥ-ࠧࠩ-࡙࠭-࡛ࢗ-࢟࣊-ࣣ࣡-ःऺ-़ा-ॏ॑-ॗॢॣ०-९ঁ-ঃ়া-ৄেৈো-্ৗৢৣ০-৯৾ਁ-ਃ਼ਾ-ੂੇੈੋ-੍ੑ੦-ੱੵઁ-ઃ઼ા-ૅે-ૉો-્ૢૣ૦-૯ૺ-૿ଁ-ଃ଼ା-ୄେୈୋ-୍୕-ୗୢୣ୦-୯ஂா-ூெ-ைொ-்ௗ௦-௯ఀ-ఄ఼ా-ౄె-ైొ-్ౕౖౢౣ౦-౯ಁ-ಃ಼ಾ-ೄೆ-ೈೊ-್ೕೖೢೣ೦-೯ೳഀ-ഃ഻഼ാ-ൄെ-ൈൊ-്ൗൢൣ൦-൯ඁ-ඃ්ා-ුූෘ-ෟ෦-෯ෲෳัิ-ฺ็-๎๐-๙ັິ-ຼ່-໎໐-໙༘༙༠-༩༹༵༷༾༿ཱ-྄྆྇ྍ-ྗྙ-ྼ࿆ါ-ှ၀-၉ၖ-ၙၞ-ၠၢ-ၤၧ-ၭၱ-ၴႂ-ႍႏ-ႝ፝-፟፩-፱ᜒ-᜕ᜲ-᜴ᝒᝓᝲᝳ឴-៓៝០-៩᠋-᠍᠏-᠙ᢩᤠ-ᤫᤰ-᤻᥆-᥏᧐-᧚ᨗ-ᨛᩕ-ᩞ᩠-᩿᩼-᪉᪐-᪙᪰-᪽ᪿ-᫝᫠-᫫ᬀ-ᬄ᬴-᭄᭐-᭙᭫-᭳ᮀ-ᮂᮡ-ᮭ᮰-᮹᯦-᯳ᰤ-᰷᱀-᱉᱐-᱙᳐-᳔᳒-᳨᳭᳴᳷-᳹᷀-᷿‌‍‿⁀⁔⃐-⃥⃜⃡-⃰⳯-⵿⳱ⷠ-〪ⷿ-゙゚〯・꘠-꘩꙯ꙴ-꙽ꚞꚟ꛰꛱ꠂ꠆ꠋꠣ-ꠧ꠬ꢀꢁꢴ-ꣅ꣐-꣙꣠-꣱ꣿ-꤉ꤦ-꤭ꥇ-꥓ꦀ-ꦃ꦳-꧀꧐-꧙ꧥ꧰-꧹ꨩ-ꨶꩃꩌꩍ꩐-꩙ꩻ-ꩽꪰꪲ-ꪴꪷꪸꪾ꪿꫁ꫫ-ꫯꫵ꫶ꯣ-ꯪ꯬꯭꯰-꯹ﬞ︀-️︠-︯︳︴﹍-﹏０-９＿･";
var nonASCIIidentifierStartChars = "ªµºÀ-ÖØ-öø-ˁˆ-ˑˠ-ˤˬˮͰ-ʹͶͷͺ-ͽͿΆΈ-ΊΌΎ-ΡΣ-ϵϷ-ҁҊ-ԯԱ-Ֆՙՠ-ֈא-תׯ-ײؠ-يٮٯٱ-ۓەۥۦۮۯۺ-ۼۿܐܒ-ܯݍ-ޥޱߊ-ߪߴߵߺࠀ-ࠕࠚࠤࠨࡀ-ࡘࡠ-ࡪࡰ-ࢇࢉ-࢏ࢠ-ࣉऄ-हऽॐक़-ॡॱ-ঀঅ-ঌএঐও-নপ-রলশ-হঽৎড়ঢ়য়-ৡৰৱৼਅ-ਊਏਐਓ-ਨਪ-ਰਲਲ਼ਵਸ਼ਸਹਖ਼-ੜਫ਼ੲ-ੴઅ-ઍએ-ઑઓ-નપ-રલળવ-હઽૐૠૡૹଅ-ଌଏଐଓ-ନପ-ରଲଳଵ-ହଽଡ଼ଢ଼ୟ-ୡୱஃஅ-ஊஎ-ஐஒ-கஙசஜஞடணதந-பம-ஹௐఅ-ఌఎ-ఐఒ-నప-హఽౘ-ౚ౜ౝౠౡಀಅ-ಌಎ-ಐಒ-ನಪ-ಳವ-ಹಽ೜-ೞೠೡೱೲഄ-ഌഎ-ഐഒ-ഺഽൎൔ-ൖൟ-ൡൺ-ൿඅ-ඖක-නඳ-රලව-ෆก-ะาำเ-ๆກຂຄຆ-ຊຌ-ຣລວ-ະາຳຽເ-ໄໆໜ-ໟༀཀ-ཇཉ-ཬྈ-ྌက-ဪဿၐ-ၕၚ-ၝၡၥၦၮ-ၰၵ-ႁႎႠ-ჅჇჍა-ჺჼ-ቈቊ-ቍቐ-ቖቘቚ-ቝበ-ኈኊ-ኍነ-ኰኲ-ኵኸ-ኾዀዂ-ዅወ-ዖዘ-ጐጒ-ጕጘ-ፚᎀ-ᎏᎠ-Ᏽᏸ-ᏽᐁ-ᙬᙯ-ᙿᚁ-ᚚᚠ-ᛪᛮ-ᛸᜀ-ᜑᜟ-ᜱᝀ-ᝑᝠ-ᝬᝮ-ᝰក-ឳៗៜᠠ-ᡸᢀ-ᢨᢪᢰ-ᣵᤀ-ᤞᥐ-ᥭᥰ-ᥴᦀ-ᦫᦰ-ᧉᨀ-ᨖᨠ-ᩔᪧᬅ-ᬳᭅ-ᭌᮃ-ᮠᮮᮯᮺ-ᯥᰀ-ᰣᱍ-ᱏᱚ-ᱽᲀ-ᲊᲐ-ᲺᲽ-Ჿᳩ-ᳬᳮ-ᳳᳵᳶᳺᴀ-ᶿḀ-ἕἘ-Ἕἠ-ὅὈ-Ὅὐ-ὗὙὛὝὟ-ώᾀ-ᾴᾶ-ᾼιῂ-ῄῆ-ῌῐ-ΐῖ-Ίῠ-Ῥῲ-ῴῶ-ῼⁱⁿₐ-ₜℂℇℊ-ℓℕ℘-ℝℤΩℨK-ℹℼ-ℿⅅ-ⅉⅎⅠ-ↈⰀ-ⳤⳫ-ⳮⳲⳳⴀ-ⴥⴧⴭⴰ-ⵧⵯⶀ-ⶖⶠ-ⶦⶨ-ⶮⶰ-ⶶⶸ-ⶾⷀ-ⷆⷈ-ⷎⷐ-ⷖⷘ-ⷞ々-〇〡-〩〱-〵〸-〼ぁ-ゖ゛-ゟァ-ヺー-ヿㄅ-ㄯㄱ-ㆎㆠ-ㆿㇰ-ㇿ㐀-䶿一-ꒌꓐ-ꓽꔀ-ꘌꘐ-ꘟꘪꘫꙀ-ꙮꙿ-ꚝꚠ-ꛯꜗ-ꜟꜢ-ꞈꞋ-Ƛ꟱-ꠁꠃ-ꠅꠇ-ꠊꠌ-ꠢꡀ-ꡳꢂ-ꢳꣲ-ꣷꣻꣽꣾꤊ-ꤥꤰ-ꥆꥠ-ꥼꦄ-ꦲꧏꧠ-ꧤꧦ-ꧯꧺ-ꧾꨀ-ꨨꩀ-ꩂꩄ-ꩋꩠ-ꩶꩺꩾ-ꪯꪱꪵꪶꪹ-ꪽꫀꫂꫛ-ꫝꫠ-ꫪꫲ-ꫴꬁ-ꬆꬉ-ꬎꬑ-ꬖꬠ-ꬦꬨ-ꬮꬰ-ꭚꭜ-ꭩꭰ-ꯢ가-힣ힰ-ퟆퟋ-ퟻ豈-舘並-龎ﬀ-ﬆﬓ-ﬗיִײַ-ﬨשׁ-זּטּ-לּמּנּסּףּפּצּ-ﮱﯓ-ﴽﵐ-ﶏﶒ-ﷇﷰ-ﷻﹰ-ﹴﹶ-ﻼＡ-Ｚａ-ｚｦ-ﾾￂ-ￇￊ-ￏￒ-ￗￚ-ￜ";
var reservedWords = {
	3: "abstract boolean byte char class double enum export extends final float goto implements import int interface long native package private protected public short static super synchronized throws transient volatile",
	5: "class enum extends super const export import",
	6: "enum",
	strict: "implements interface let package private protected public static yield",
	strictBind: "eval arguments"
};
var ecma5AndLessKeywords = "break case catch continue debugger default do else finally for function if return switch throw try var while with null true false instanceof typeof void delete new in this";
var keywords$1 = {
	5: ecma5AndLessKeywords,
	"5module": ecma5AndLessKeywords + " export import",
	6: ecma5AndLessKeywords + " const class extends export import super"
};
var keywordRelationalOperator = /^in(stanceof)?$/;
var nonASCIIidentifierStart = new RegExp("[" + nonASCIIidentifierStartChars + "]");
var nonASCIIidentifier = new RegExp("[" + nonASCIIidentifierStartChars + nonASCIIidentifierChars + "]");
function isInAstralSet(code, set) {
	var pos = 65536;
	for (var i = 0; i < set.length; i += 2) {
		pos += set[i];
		if (pos > code) return false;
		pos += set[i + 1];
		if (pos >= code) return true;
	}
	return false;
}
function isIdentifierStart(code, astral) {
	if (code < 65) return code === 36;
	if (code < 91) return true;
	if (code < 97) return code === 95;
	if (code < 123) return true;
	if (code <= 65535) return code >= 170 && nonASCIIidentifierStart.test(String.fromCharCode(code));
	if (astral === false) return false;
	return isInAstralSet(code, astralIdentifierStartCodes);
}
function isIdentifierChar(code, astral) {
	if (code < 48) return code === 36;
	if (code < 58) return true;
	if (code < 65) return false;
	if (code < 91) return true;
	if (code < 97) return code === 95;
	if (code < 123) return true;
	if (code <= 65535) return code >= 170 && nonASCIIidentifier.test(String.fromCharCode(code));
	if (astral === false) return false;
	return isInAstralSet(code, astralIdentifierStartCodes) || isInAstralSet(code, astralIdentifierCodes);
}
var TokenType = function TokenType(label, conf) {
	if (conf === void 0) conf = {};
	this.label = label;
	this.keyword = conf.keyword;
	this.beforeExpr = !!conf.beforeExpr;
	this.startsExpr = !!conf.startsExpr;
	this.isLoop = !!conf.isLoop;
	this.isAssign = !!conf.isAssign;
	this.prefix = !!conf.prefix;
	this.postfix = !!conf.postfix;
	this.binop = conf.binop || null;
	this.updateContext = null;
};
function binop(name, prec) {
	return new TokenType(name, {
		beforeExpr: true,
		binop: prec
	});
}
var beforeExpr = { beforeExpr: true }, startsExpr$1 = { startsExpr: true };
var keywords = {};
function kw(name, options) {
	if (options === void 0) options = {};
	options.keyword = name;
	return keywords[name] = new TokenType(name, options);
}
var types$1 = {
	num: new TokenType("num", startsExpr$1),
	regexp: new TokenType("regexp", startsExpr$1),
	string: new TokenType("string", startsExpr$1),
	name: new TokenType("name", startsExpr$1),
	privateId: new TokenType("privateId", startsExpr$1),
	eof: new TokenType("eof"),
	bracketL: new TokenType("[", {
		beforeExpr: true,
		startsExpr: true
	}),
	bracketR: new TokenType("]"),
	braceL: new TokenType("{", {
		beforeExpr: true,
		startsExpr: true
	}),
	braceR: new TokenType("}"),
	parenL: new TokenType("(", {
		beforeExpr: true,
		startsExpr: true
	}),
	parenR: new TokenType(")"),
	comma: new TokenType(",", beforeExpr),
	semi: new TokenType(";", beforeExpr),
	colon: new TokenType(":", beforeExpr),
	dot: new TokenType("."),
	question: new TokenType("?", beforeExpr),
	questionDot: new TokenType("?."),
	arrow: new TokenType("=>", beforeExpr),
	template: new TokenType("template"),
	invalidTemplate: new TokenType("invalidTemplate"),
	ellipsis: new TokenType("...", beforeExpr),
	backQuote: new TokenType("`", startsExpr$1),
	dollarBraceL: new TokenType("${", {
		beforeExpr: true,
		startsExpr: true
	}),
	eq: new TokenType("=", {
		beforeExpr: true,
		isAssign: true
	}),
	assign: new TokenType("_=", {
		beforeExpr: true,
		isAssign: true
	}),
	incDec: new TokenType("++/--", {
		prefix: true,
		postfix: true,
		startsExpr: true
	}),
	prefix: new TokenType("!/~", {
		beforeExpr: true,
		prefix: true,
		startsExpr: true
	}),
	logicalOR: binop("||", 1),
	logicalAND: binop("&&", 2),
	bitwiseOR: binop("|", 3),
	bitwiseXOR: binop("^", 4),
	bitwiseAND: binop("&", 5),
	equality: binop("==/!=/===/!==", 6),
	relational: binop("</>/<=/>=", 7),
	bitShift: binop("<</>>/>>>", 8),
	plusMin: new TokenType("+/-", {
		beforeExpr: true,
		binop: 9,
		prefix: true,
		startsExpr: true
	}),
	modulo: binop("%", 10),
	star: binop("*", 10),
	slash: binop("/", 10),
	starstar: new TokenType("**", { beforeExpr: true }),
	coalesce: binop("??", 1),
	_break: kw("break"),
	_case: kw("case", beforeExpr),
	_catch: kw("catch"),
	_continue: kw("continue"),
	_debugger: kw("debugger"),
	_default: kw("default", beforeExpr),
	_do: kw("do", {
		isLoop: true,
		beforeExpr: true
	}),
	_else: kw("else", beforeExpr),
	_finally: kw("finally"),
	_for: kw("for", { isLoop: true }),
	_function: kw("function", startsExpr$1),
	_if: kw("if"),
	_return: kw("return", beforeExpr),
	_switch: kw("switch"),
	_throw: kw("throw", beforeExpr),
	_try: kw("try"),
	_var: kw("var"),
	_const: kw("const"),
	_while: kw("while", { isLoop: true }),
	_with: kw("with"),
	_new: kw("new", {
		beforeExpr: true,
		startsExpr: true
	}),
	_this: kw("this", startsExpr$1),
	_super: kw("super", startsExpr$1),
	_class: kw("class", startsExpr$1),
	_extends: kw("extends", beforeExpr),
	_export: kw("export"),
	_import: kw("import", startsExpr$1),
	_null: kw("null", startsExpr$1),
	_true: kw("true", startsExpr$1),
	_false: kw("false", startsExpr$1),
	_in: kw("in", {
		beforeExpr: true,
		binop: 7
	}),
	_instanceof: kw("instanceof", {
		beforeExpr: true,
		binop: 7
	}),
	_typeof: kw("typeof", {
		beforeExpr: true,
		prefix: true,
		startsExpr: true
	}),
	_void: kw("void", {
		beforeExpr: true,
		prefix: true,
		startsExpr: true
	}),
	_delete: kw("delete", {
		beforeExpr: true,
		prefix: true,
		startsExpr: true
	})
};
var lineBreak = /\r\n?|\n|\u2028|\u2029/;
var lineBreakG = new RegExp(lineBreak.source, "g");
function isNewLine(code) {
	return code === 10 || code === 13 || code === 8232 || code === 8233;
}
function nextLineBreak(code, from, end) {
	if (end === void 0) end = code.length;
	for (var i = from; i < end; i++) {
		var next = code.charCodeAt(i);
		if (isNewLine(next)) return i < end - 1 && next === 13 && code.charCodeAt(i + 1) === 10 ? i + 2 : i + 1;
	}
	return -1;
}
var nonASCIIwhitespace = /[\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]/;
var skipWhiteSpace$1 = /(?:\s|\/\/.*|\/\*[^]*?\*\/)*/g;
var ref = Object.prototype;
var hasOwnProperty = ref.hasOwnProperty;
var toString = ref.toString;
var hasOwn = Object.hasOwn || (function(obj, propName) {
	return hasOwnProperty.call(obj, propName);
});
var isArray = Array.isArray || (function(obj) {
	return toString.call(obj) === "[object Array]";
});
var regexpCache = Object.create(null);
function wordsRegexp(words) {
	return regexpCache[words] || (regexpCache[words] = new RegExp("^(?:" + words.replace(/ /g, "|") + ")$"));
}
function codePointToString(code) {
	if (code <= 65535) return String.fromCharCode(code);
	code -= 65536;
	return String.fromCharCode((code >> 10) + 55296, (code & 1023) + 56320);
}
var loneSurrogate = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])/;
var Position = function Position(line, col) {
	this.line = line;
	this.column = col;
};
Position.prototype.offset = function offset(n) {
	return new Position(this.line, this.column + n);
};
var SourceLocation = function SourceLocation(p, start, end) {
	this.start = start;
	this.end = end;
	if (p.sourceFile !== null) this.source = p.sourceFile;
};
function getLineInfo(input, offset) {
	for (var line = 1, cur = 0;;) {
		var nextBreak = nextLineBreak(input, cur, offset);
		if (nextBreak < 0) return new Position(line, offset - cur);
		++line;
		cur = nextBreak;
	}
}
var defaultOptions = {
	ecmaVersion: null,
	sourceType: "script",
	strict: false,
	onInsertedSemicolon: null,
	onTrailingComma: null,
	allowReserved: null,
	allowReturnOutsideFunction: false,
	allowImportExportEverywhere: false,
	allowAwaitOutsideFunction: null,
	allowSuperOutsideMethod: null,
	allowHashBang: false,
	checkPrivateFields: true,
	locations: false,
	onToken: null,
	onComment: null,
	ranges: false,
	program: null,
	sourceFile: null,
	directSourceFile: null,
	preserveParens: false
};
var warnedAboutEcmaVersion = false;
function getOptions(opts) {
	var options = {};
	for (var opt in defaultOptions) options[opt] = opts && hasOwn(opts, opt) ? opts[opt] : defaultOptions[opt];
	if (options.ecmaVersion === "latest") options.ecmaVersion = 1e8;
	else if (options.ecmaVersion == null) {
		if (!warnedAboutEcmaVersion && typeof console === "object" && console.warn) {
			warnedAboutEcmaVersion = true;
			console.warn("Since Acorn 8.0.0, options.ecmaVersion is required.\nDefaulting to 2020, but this will stop working in the future.");
		}
		options.ecmaVersion = 11;
	} else if (options.ecmaVersion >= 2015) options.ecmaVersion -= 2009;
	if (options.allowReserved == null) options.allowReserved = options.ecmaVersion < 5;
	if (!opts || opts.allowHashBang == null) options.allowHashBang = options.ecmaVersion >= 14;
	if (isArray(options.onToken)) {
		var tokens = options.onToken;
		options.onToken = function(token) {
			return tokens.push(token);
		};
	}
	if (isArray(options.onComment)) options.onComment = pushComment(options, options.onComment);
	if (options.sourceType === "commonjs" && options.allowAwaitOutsideFunction) throw new Error("Cannot use allowAwaitOutsideFunction with sourceType: commonjs");
	return options;
}
function pushComment(options, array) {
	return function(block, text, start, end, startLoc, endLoc) {
		var comment = {
			type: block ? "Block" : "Line",
			value: text,
			start,
			end
		};
		if (options.locations) comment.loc = new SourceLocation(this, startLoc, endLoc);
		if (options.ranges) comment.range = [start, end];
		array.push(comment);
	};
}
var SCOPE_TOP = 1, SCOPE_FUNCTION = 2, SCOPE_ASYNC = 4, SCOPE_GENERATOR = 8, SCOPE_ARROW = 16, SCOPE_SIMPLE_CATCH = 32, SCOPE_SUPER = 64, SCOPE_DIRECT_SUPER = 128, SCOPE_CLASS_STATIC_BLOCK = 256, SCOPE_CLASS_FIELD_INIT = 512, SCOPE_SWITCH = 1024, SCOPE_VAR = SCOPE_TOP | SCOPE_FUNCTION | SCOPE_CLASS_STATIC_BLOCK;
function functionFlags$1(async, generator) {
	return SCOPE_FUNCTION | (async ? SCOPE_ASYNC : 0) | (generator ? SCOPE_GENERATOR : 0);
}
var BIND_NONE = 0, BIND_VAR = 1, BIND_LEXICAL = 2, BIND_FUNCTION = 3, BIND_SIMPLE_CATCH = 4, BIND_OUTSIDE = 5;
var Parser$1 = function Parser(options, input, startPos) {
	this.options = options = getOptions(options);
	this.sourceFile = options.sourceFile;
	this.keywords = wordsRegexp(keywords$1[options.ecmaVersion >= 6 ? 6 : options.sourceType === "module" ? "5module" : 5]);
	var reserved = "";
	if (options.allowReserved !== true) {
		reserved = reservedWords[options.ecmaVersion >= 6 ? 6 : options.ecmaVersion === 5 ? 5 : 3];
		if (options.sourceType === "module") reserved += " await";
	}
	this.reservedWords = wordsRegexp(reserved);
	var reservedStrict = (reserved ? reserved + " " : "") + reservedWords.strict;
	this.reservedWordsStrict = wordsRegexp(reservedStrict);
	this.reservedWordsStrictBind = wordsRegexp(reservedStrict + " " + reservedWords.strictBind);
	this.input = String(input);
	this.containsEsc = false;
	if (startPos) {
		this.pos = startPos;
		this.lineStart = this.input.lastIndexOf("\n", startPos - 1) + 1;
		this.curLine = this.input.slice(0, this.lineStart).split(lineBreak).length;
	} else {
		this.pos = this.lineStart = 0;
		this.curLine = 1;
	}
	this.type = types$1.eof;
	this.value = null;
	this.start = this.end = this.pos;
	this.startLoc = this.endLoc = this.curPosition();
	this.lastTokEndLoc = this.lastTokStartLoc = null;
	this.lastTokStart = this.lastTokEnd = this.pos;
	this.context = this.initialContext();
	this.exprAllowed = true;
	this.inModule = options.sourceType === "module";
	this.strict = this.inModule || options.strict === true || this.strictDirective(this.pos);
	this.potentialArrowAt = -1;
	this.potentialArrowInForAwait = false;
	this.yieldPos = this.awaitPos = this.awaitIdentPos = 0;
	this.labels = [];
	this.undefinedExports = Object.create(null);
	if (this.pos === 0 && options.allowHashBang && this.input.slice(0, 2) === "#!") this.skipLineComment(2);
	this.scopeStack = [];
	this.enterScope(this.options.sourceType === "commonjs" ? SCOPE_FUNCTION : SCOPE_TOP);
	this.regexpState = null;
	this.privateNameStack = [];
};
var prototypeAccessors = {
	inFunction: { configurable: true },
	inGenerator: { configurable: true },
	inAsync: { configurable: true },
	canAwait: { configurable: true },
	allowReturn: { configurable: true },
	allowSuper: { configurable: true },
	allowDirectSuper: { configurable: true },
	treatFunctionsAsVar: { configurable: true },
	allowNewDotTarget: { configurable: true },
	allowUsing: { configurable: true },
	inClassStaticBlock: { configurable: true }
};
Parser$1.prototype.parse = function parse() {
	var this$1$1 = this;
	var node = this.options.program || this.startNode();
	this.nextToken();
	return this.catchStackOverflow(function() {
		return this$1$1.parseTopLevel(node);
	});
};
prototypeAccessors.inFunction.get = function() {
	return (this.currentVarScope().flags & SCOPE_FUNCTION) > 0;
};
prototypeAccessors.inGenerator.get = function() {
	return (this.currentVarScope().flags & SCOPE_GENERATOR) > 0;
};
prototypeAccessors.inAsync.get = function() {
	return (this.currentVarScope().flags & SCOPE_ASYNC) > 0;
};
prototypeAccessors.canAwait.get = function() {
	for (var i = this.scopeStack.length - 1; i >= 0; i--) {
		var flags = this.scopeStack[i].flags;
		if (flags & (SCOPE_CLASS_STATIC_BLOCK | SCOPE_CLASS_FIELD_INIT)) return false;
		if (flags & SCOPE_FUNCTION) return (flags & SCOPE_ASYNC) > 0;
	}
	return this.inModule && this.options.ecmaVersion >= 13 || this.options.allowAwaitOutsideFunction;
};
prototypeAccessors.allowReturn.get = function() {
	if (this.inFunction) return true;
	if (this.options.allowReturnOutsideFunction && this.currentVarScope().flags & SCOPE_TOP) return true;
	return false;
};
prototypeAccessors.allowSuper.get = function() {
	return (this.currentThisScope().flags & SCOPE_SUPER) > 0 || this.options.allowSuperOutsideMethod;
};
prototypeAccessors.allowDirectSuper.get = function() {
	return (this.currentThisScope().flags & SCOPE_DIRECT_SUPER) > 0;
};
prototypeAccessors.treatFunctionsAsVar.get = function() {
	return this.treatFunctionsAsVarInScope(this.currentScope());
};
prototypeAccessors.allowNewDotTarget.get = function() {
	for (var i = this.scopeStack.length - 1; i >= 0; i--) {
		var flags = this.scopeStack[i].flags;
		if (flags & (SCOPE_CLASS_STATIC_BLOCK | SCOPE_CLASS_FIELD_INIT) || flags & SCOPE_FUNCTION && !(flags & SCOPE_ARROW)) return true;
	}
	return false;
};
prototypeAccessors.allowUsing.get = function() {
	var flags = this.currentScope().flags;
	if (flags & SCOPE_SWITCH) return false;
	if (!this.inModule && flags & SCOPE_TOP) return false;
	return true;
};
prototypeAccessors.inClassStaticBlock.get = function() {
	return (this.currentVarScope().flags & SCOPE_CLASS_STATIC_BLOCK) > 0;
};
Parser$1.extend = function extend() {
	var plugins = [], len = arguments.length;
	while (len--) plugins[len] = arguments[len];
	var cls = this;
	for (var i = 0; i < plugins.length; i++) cls = plugins[i](cls);
	return cls;
};
Parser$1.parse = function parse(input, options) {
	return new this(options, input).parse();
};
Parser$1.parseExpressionAt = function parseExpressionAt(input, pos, options) {
	var parser = new this(options, input, pos);
	parser.nextToken();
	return parser.parseExpression();
};
Parser$1.tokenizer = function tokenizer(input, options) {
	return new this(options, input);
};
Object.defineProperties(Parser$1.prototype, prototypeAccessors);
var pp$9 = Parser$1.prototype;
var literal$1 = /^(?:'((?:\\[^]|[^'\\])*?)'|"((?:\\[^]|[^"\\])*?)")/;
pp$9.strictDirective = function(start) {
	if (this.options.ecmaVersion < 5) return false;
	for (;;) {
		skipWhiteSpace$1.lastIndex = start;
		start += skipWhiteSpace$1.exec(this.input)[0].length;
		var match = literal$1.exec(this.input.slice(start));
		if (!match) return false;
		if ((match[1] || match[2]) === "use strict") {
			skipWhiteSpace$1.lastIndex = start + match[0].length;
			var spaceAfter = skipWhiteSpace$1.exec(this.input), end = spaceAfter.index + spaceAfter[0].length;
			var next = this.input.charAt(end);
			return next === ";" || next === "}" || lineBreak.test(spaceAfter[0]) && !(/[(`.[+\-/*%<>=,?^&]/.test(next) || next === "!" && this.input.charAt(end + 1) === "=");
		}
		start += match[0].length;
		skipWhiteSpace$1.lastIndex = start;
		start += skipWhiteSpace$1.exec(this.input)[0].length;
		if (this.input[start] === ";") start++;
	}
};
pp$9.eat = function(type) {
	if (this.type === type) {
		this.next();
		return true;
	} else return false;
};
pp$9.isContextual = function(name) {
	return this.type === types$1.name && this.value === name && !this.containsEsc;
};
pp$9.eatContextual = function(name) {
	if (!this.isContextual(name)) return false;
	this.next();
	return true;
};
pp$9.catchStackOverflow = function(f) {
	try {
		return f();
	} catch (e) {
		if (e instanceof Error && (/\bstack\b.*\b(exceeded|overflow)\b/i.test(e.message) || /\btoo much recursion\b/i.test(e.message))) this.raise(this.start, "Not enough stack space to parse input");
		else throw e;
	}
};
pp$9.expectContextual = function(name) {
	if (!this.eatContextual(name)) this.unexpected();
};
pp$9.canInsertSemicolon = function() {
	return this.type === types$1.eof || this.type === types$1.braceR || lineBreak.test(this.input.slice(this.lastTokEnd, this.start));
};
pp$9.insertSemicolon = function() {
	if (this.canInsertSemicolon()) {
		if (this.options.onInsertedSemicolon) this.options.onInsertedSemicolon(this.lastTokEnd, this.lastTokEndLoc);
		return true;
	}
};
pp$9.semicolon = function() {
	if (!this.eat(types$1.semi) && !this.insertSemicolon()) this.unexpected();
};
pp$9.afterTrailingComma = function(tokType, notNext) {
	if (this.type === tokType) {
		if (this.options.onTrailingComma) this.options.onTrailingComma(this.lastTokStart, this.lastTokStartLoc);
		if (!notNext) this.next();
		return true;
	}
};
pp$9.expect = function(type) {
	this.eat(type) || this.unexpected();
};
pp$9.unexpected = function(pos) {
	this.raise(pos != null ? pos : this.start, "Unexpected token");
};
var DestructuringErrors$2 = function DestructuringErrors() {
	this.shorthandAssign = this.trailingComma = this.parenthesizedAssign = this.parenthesizedBind = this.doubleProto = -1;
};
pp$9.checkPatternErrors = function(refDestructuringErrors, isAssign) {
	if (!refDestructuringErrors) return;
	if (refDestructuringErrors.trailingComma > -1) this.raiseRecoverable(refDestructuringErrors.trailingComma, "Comma is not permitted after the rest element");
	var parens = isAssign ? refDestructuringErrors.parenthesizedAssign : refDestructuringErrors.parenthesizedBind;
	if (parens > -1) this.raiseRecoverable(parens, isAssign ? "Assigning to rvalue" : "Parenthesized pattern");
};
pp$9.checkExpressionErrors = function(refDestructuringErrors, andThrow) {
	if (!refDestructuringErrors) return false;
	var shorthandAssign = refDestructuringErrors.shorthandAssign;
	var doubleProto = refDestructuringErrors.doubleProto;
	if (!andThrow) return shorthandAssign >= 0 || doubleProto >= 0;
	if (shorthandAssign >= 0) this.raise(shorthandAssign, "Shorthand property assignments are valid only in destructuring patterns");
	if (doubleProto >= 0) this.raiseRecoverable(doubleProto, "Redefinition of __proto__ property");
};
pp$9.checkYieldAwaitInDefaultParams = function() {
	if (this.yieldPos && (!this.awaitPos || this.yieldPos < this.awaitPos)) this.raise(this.yieldPos, "Yield expression cannot be a default value");
	if (this.awaitPos) this.raise(this.awaitPos, "Await expression cannot be a default value");
};
pp$9.isSimpleAssignTarget = function(expr) {
	if (expr.type === "ParenthesizedExpression") return this.isSimpleAssignTarget(expr.expression);
	return expr.type === "Identifier" || expr.type === "MemberExpression";
};
var pp$8 = Parser$1.prototype;
pp$8.parseTopLevel = function(node) {
	var exports$1 = Object.create(null);
	if (!node.body) node.body = [];
	while (this.type !== types$1.eof) {
		var stmt = this.parseStatement(null, true, exports$1);
		node.body.push(stmt);
	}
	if (this.inModule) for (var i = 0, list = Object.keys(this.undefinedExports); i < list.length; i += 1) {
		var name = list[i];
		this.raiseRecoverable(this.undefinedExports[name].start, "Export '" + name + "' is not defined");
	}
	this.adaptDirectivePrologue(node.body);
	this.next();
	node.sourceType = this.options.sourceType === "commonjs" ? "script" : this.options.sourceType;
	return this.finishNode(node, "Program");
};
var loopLabel = { kind: "loop" }, switchLabel = { kind: "switch" };
pp$8.isLet = function(context) {
	if (this.options.ecmaVersion < 6 || !this.isContextual("let")) return false;
	skipWhiteSpace$1.lastIndex = this.pos;
	var skip = skipWhiteSpace$1.exec(this.input);
	var next = this.pos + skip[0].length, nextCh = this.fullCharCodeAt(next);
	if (nextCh === 91 || nextCh === 92) return true;
	if (context) return false;
	if (nextCh === 123) return true;
	if (isIdentifierStart(nextCh)) {
		var start = next;
		do
			next += nextCh <= 65535 ? 1 : 2;
		while (isIdentifierChar(nextCh = this.fullCharCodeAt(next)));
		if (nextCh === 92) return true;
		var ident = this.input.slice(start, next);
		if (!keywordRelationalOperator.test(ident)) return true;
	}
	return false;
};
pp$8.isAsyncFunction = function() {
	if (this.options.ecmaVersion < 8 || !this.isContextual("async")) return false;
	skipWhiteSpace$1.lastIndex = this.pos;
	var skip = skipWhiteSpace$1.exec(this.input);
	var next = this.pos + skip[0].length, after;
	return !lineBreak.test(this.input.slice(this.pos, next)) && this.input.slice(next, next + 8) === "function" && (next + 8 === this.input.length || !(isIdentifierChar(after = this.fullCharCodeAt(next + 8)) || after === 92));
};
pp$8.isUsingKeyword = function(isAwaitUsing, isFor) {
	if (this.options.ecmaVersion < 17 || !this.isContextual(isAwaitUsing ? "await" : "using")) return false;
	skipWhiteSpace$1.lastIndex = this.pos;
	var skip = skipWhiteSpace$1.exec(this.input);
	var next = this.pos + skip[0].length;
	if (lineBreak.test(this.input.slice(this.pos, next))) return false;
	if (isAwaitUsing) {
		var usingEndPos = next + 5, after;
		if (this.input.slice(next, usingEndPos) !== "using" || usingEndPos === this.input.length || isIdentifierChar(after = this.fullCharCodeAt(usingEndPos)) || after === 92) return false;
		skipWhiteSpace$1.lastIndex = usingEndPos;
		var skipAfterUsing = skipWhiteSpace$1.exec(this.input);
		next = usingEndPos + skipAfterUsing[0].length;
		if (skipAfterUsing && lineBreak.test(this.input.slice(usingEndPos, next))) return false;
	}
	var ch = this.fullCharCodeAt(next);
	if (!isIdentifierStart(ch) && ch !== 92) return false;
	var idStart = next;
	do
		next += ch <= 65535 ? 1 : 2;
	while (isIdentifierChar(ch = this.fullCharCodeAt(next)));
	if (ch === 92) return true;
	var id = this.input.slice(idStart, next);
	if (keywordRelationalOperator.test(id)) return false;
	if (isFor && !isAwaitUsing && id === "of") {
		skipWhiteSpace$1.lastIndex = next;
		var skipAfterOf = skipWhiteSpace$1.exec(this.input);
		next = next + skipAfterOf[0].length;
		if (this.input.charCodeAt(next) !== 61 || (ch = this.input.charCodeAt(next + 1)) === 61 || ch === 62) return false;
	}
	return true;
};
pp$8.isAwaitUsing = function(isFor) {
	return this.isUsingKeyword(true, isFor);
};
pp$8.isUsing = function(isFor) {
	return this.isUsingKeyword(false, isFor);
};
pp$8.parseStatement = function(context, topLevel, exports$1) {
	var starttype = this.type, node = this.startNode(), kind;
	if (this.isLet(context)) {
		starttype = types$1._var;
		kind = "let";
	}
	switch (starttype) {
		case types$1._break:
		case types$1._continue: return this.parseBreakContinueStatement(node, starttype.keyword);
		case types$1._debugger: return this.parseDebuggerStatement(node);
		case types$1._do: return this.parseDoStatement(node);
		case types$1._for: return this.parseForStatement(node);
		case types$1._function:
			if (context && (this.strict || context !== "if" && context !== "label") && this.options.ecmaVersion >= 6) this.unexpected();
			return this.parseFunctionStatement(node, false, !context);
		case types$1._class:
			if (context) this.unexpected();
			return this.parseClass(node, true);
		case types$1._if: return this.parseIfStatement(node);
		case types$1._return: return this.parseReturnStatement(node);
		case types$1._switch: return this.parseSwitchStatement(node);
		case types$1._throw: return this.parseThrowStatement(node);
		case types$1._try: return this.parseTryStatement(node);
		case types$1._const:
		case types$1._var:
			kind = kind || this.value;
			if (context && kind !== "var") this.unexpected();
			return this.parseVarStatement(node, kind);
		case types$1._while: return this.parseWhileStatement(node);
		case types$1._with: return this.parseWithStatement(node);
		case types$1.braceL: return this.parseBlock(true, node);
		case types$1.semi: return this.parseEmptyStatement(node);
		case types$1._export:
		case types$1._import:
			if (this.options.ecmaVersion > 10 && starttype === types$1._import) {
				skipWhiteSpace$1.lastIndex = this.pos;
				var skip = skipWhiteSpace$1.exec(this.input);
				var next = this.pos + skip[0].length, nextCh = this.input.charCodeAt(next);
				if (nextCh === 40 || nextCh === 46) return this.parseExpressionStatement(node, this.parseExpression());
			}
			if (!this.options.allowImportExportEverywhere) {
				if (!topLevel) this.raise(this.start, "'import' and 'export' may only appear at the top level");
				if (!this.inModule) this.raise(this.start, "'import' and 'export' may appear only with 'sourceType: module'");
			}
			return starttype === types$1._import ? this.parseImport(node) : this.parseExport(node, exports$1);
		default:
			if (this.isAsyncFunction()) {
				if (context) this.unexpected();
				this.next();
				return this.parseFunctionStatement(node, true, !context);
			}
			var usingKind = this.isAwaitUsing(false) ? "await using" : this.isUsing(false) ? "using" : null;
			if (usingKind) {
				if (!this.allowUsing) this.raise(this.start, "Using declaration cannot appear in the top level when source type is `script` or in the bare case statement");
				if (context) this.raise(this.start, "Using declaration is not allowed in single-statement positions");
				if (usingKind === "await using") {
					if (!this.canAwait) this.raise(this.start, "Await using cannot appear outside of async function");
					this.next();
				}
				this.next();
				this.parseVar(node, false, usingKind);
				this.semicolon();
				return this.finishNode(node, "VariableDeclaration");
			}
			var maybeName = this.value, expr = this.parseExpression();
			if (starttype === types$1.name && expr.type === "Identifier" && this.eat(types$1.colon)) return this.parseLabeledStatement(node, maybeName, expr, context);
			else return this.parseExpressionStatement(node, expr);
	}
};
pp$8.parseBreakContinueStatement = function(node, keyword) {
	var isBreak = keyword === "break";
	this.next();
	if (this.eat(types$1.semi) || this.insertSemicolon()) node.label = null;
	else if (this.type !== types$1.name) this.unexpected();
	else {
		node.label = this.parseIdent();
		this.semicolon();
	}
	var i = 0;
	for (; i < this.labels.length; ++i) {
		var lab = this.labels[i];
		if (node.label == null || lab.name === node.label.name) {
			if (lab.kind != null && (isBreak || lab.kind === "loop")) break;
			if (node.label && isBreak) break;
		}
	}
	if (i === this.labels.length) this.raise(node.start, "Unsyntactic " + keyword);
	return this.finishNode(node, isBreak ? "BreakStatement" : "ContinueStatement");
};
pp$8.parseDebuggerStatement = function(node) {
	this.next();
	this.semicolon();
	return this.finishNode(node, "DebuggerStatement");
};
pp$8.parseDoStatement = function(node) {
	this.next();
	this.labels.push(loopLabel);
	node.body = this.parseStatement("do");
	this.labels.pop();
	this.expect(types$1._while);
	node.test = this.parseParenExpression();
	if (this.options.ecmaVersion >= 6) this.eat(types$1.semi);
	else this.semicolon();
	return this.finishNode(node, "DoWhileStatement");
};
pp$8.parseForStatement = function(node) {
	this.next();
	var awaitAt = this.options.ecmaVersion >= 9 && this.canAwait && this.eatContextual("await") ? this.lastTokStart : -1;
	this.labels.push(loopLabel);
	this.enterScope(0);
	this.expect(types$1.parenL);
	if (this.type === types$1.semi) {
		if (awaitAt > -1) this.unexpected(awaitAt);
		return this.parseFor(node, null);
	}
	var isLet = this.isLet();
	if (this.type === types$1._var || this.type === types$1._const || isLet) {
		var init$1 = this.startNode(), kind = isLet ? "let" : this.value;
		this.next();
		this.parseVar(init$1, true, kind);
		this.finishNode(init$1, "VariableDeclaration");
		return this.parseForAfterInit(node, init$1, awaitAt);
	}
	var startsWithLet = this.isContextual("let"), isForOf = false;
	var usingKind = this.isUsing(true) ? "using" : this.isAwaitUsing(true) ? "await using" : null;
	if (usingKind) {
		var init$2 = this.startNode();
		this.next();
		if (usingKind === "await using") {
			if (!this.canAwait) this.raise(this.start, "Await using cannot appear outside of async function");
			this.next();
		}
		this.parseVar(init$2, true, usingKind);
		this.finishNode(init$2, "VariableDeclaration");
		return this.parseForAfterInit(node, init$2, awaitAt);
	}
	var containsEsc = this.containsEsc;
	var refDestructuringErrors = new DestructuringErrors$2();
	var initPos = this.start;
	var init = awaitAt > -1 ? this.parseExprSubscripts(refDestructuringErrors, "await") : this.parseExpression(true, refDestructuringErrors);
	if (this.type === types$1._in || (isForOf = this.options.ecmaVersion >= 6 && this.isContextual("of"))) {
		if (awaitAt > -1) {
			if (this.type === types$1._in) this.unexpected(awaitAt);
			node.await = true;
		} else if (isForOf && this.options.ecmaVersion >= 8) {
			if (init.start === initPos && !containsEsc && init.type === "Identifier" && init.name === "async") this.unexpected();
			else if (this.options.ecmaVersion >= 9) node.await = false;
		}
		if (startsWithLet && isForOf) this.raise(init.start, "The left-hand side of a for-of loop may not start with 'let'.");
		this.toAssignable(init, false, refDestructuringErrors);
		this.checkLValPattern(init);
		return this.parseForIn(node, init);
	} else this.checkExpressionErrors(refDestructuringErrors, true);
	if (awaitAt > -1) this.unexpected(awaitAt);
	return this.parseFor(node, init);
};
pp$8.parseForAfterInit = function(node, init, awaitAt) {
	if ((this.type === types$1._in || this.options.ecmaVersion >= 6 && this.isContextual("of")) && init.declarations.length === 1) {
		if (this.type === types$1._in) {
			if ((init.kind === "using" || init.kind === "await using") && !init.declarations[0].init) this.raise(this.start, "Using declaration is not allowed in for-in loops");
			if (this.options.ecmaVersion >= 9 && awaitAt > -1) this.unexpected(awaitAt);
		} else if (this.options.ecmaVersion >= 9) node.await = awaitAt > -1;
		return this.parseForIn(node, init);
	}
	if (awaitAt > -1) this.unexpected(awaitAt);
	return this.parseFor(node, init);
};
pp$8.parseFunctionStatement = function(node, isAsync, declarationPosition) {
	this.next();
	return this.parseFunction(node, FUNC_STATEMENT$1 | (declarationPosition ? 0 : FUNC_HANGING_STATEMENT$1), false, isAsync);
};
pp$8.parseIfStatement = function(node) {
	this.next();
	node.test = this.parseParenExpression();
	node.consequent = this.parseStatement("if");
	node.alternate = this.eat(types$1._else) ? this.parseStatement("if") : null;
	return this.finishNode(node, "IfStatement");
};
pp$8.parseReturnStatement = function(node) {
	if (!this.allowReturn) this.raise(this.start, "'return' outside of function");
	this.next();
	if (this.eat(types$1.semi) || this.insertSemicolon()) node.argument = null;
	else {
		node.argument = this.parseExpression();
		this.semicolon();
	}
	return this.finishNode(node, "ReturnStatement");
};
pp$8.parseSwitchStatement = function(node) {
	this.next();
	node.discriminant = this.parseParenExpression();
	node.cases = [];
	this.expect(types$1.braceL);
	this.labels.push(switchLabel);
	this.enterScope(SCOPE_SWITCH);
	var cur;
	for (var sawDefault = false; this.type !== types$1.braceR;) if (this.type === types$1._case || this.type === types$1._default) {
		var isCase = this.type === types$1._case;
		if (cur) this.finishNode(cur, "SwitchCase");
		node.cases.push(cur = this.startNode());
		cur.consequent = [];
		this.next();
		if (isCase) cur.test = this.parseExpression();
		else {
			if (sawDefault) this.raiseRecoverable(this.lastTokStart, "Multiple default clauses");
			sawDefault = true;
			cur.test = null;
		}
		this.expect(types$1.colon);
	} else {
		if (!cur) this.unexpected();
		cur.consequent.push(this.parseStatement(null));
	}
	this.exitScope();
	if (cur) this.finishNode(cur, "SwitchCase");
	this.next();
	this.labels.pop();
	return this.finishNode(node, "SwitchStatement");
};
pp$8.parseThrowStatement = function(node) {
	this.next();
	if (lineBreak.test(this.input.slice(this.lastTokEnd, this.start))) this.raise(this.lastTokEnd, "Illegal newline after throw");
	node.argument = this.parseExpression();
	this.semicolon();
	return this.finishNode(node, "ThrowStatement");
};
var empty$1 = [];
pp$8.parseCatchClauseParam = function() {
	var param = this.parseBindingAtom();
	var simple = param.type === "Identifier";
	this.enterScope(simple ? SCOPE_SIMPLE_CATCH : 0);
	this.checkLValPattern(param, simple ? BIND_SIMPLE_CATCH : BIND_LEXICAL);
	this.expect(types$1.parenR);
	return param;
};
pp$8.parseTryStatement = function(node) {
	this.next();
	node.block = this.parseBlock();
	node.handler = null;
	if (this.type === types$1._catch) {
		var clause = this.startNode();
		this.next();
		if (this.eat(types$1.parenL)) clause.param = this.parseCatchClauseParam();
		else {
			if (this.options.ecmaVersion < 10) this.unexpected();
			clause.param = null;
			this.enterScope(0);
		}
		clause.body = this.parseBlock(false);
		this.exitScope();
		node.handler = this.finishNode(clause, "CatchClause");
	}
	node.finalizer = this.eat(types$1._finally) ? this.parseBlock() : null;
	if (!node.handler && !node.finalizer) this.raise(node.start, "Missing catch or finally clause");
	return this.finishNode(node, "TryStatement");
};
pp$8.parseVarStatement = function(node, kind, allowMissingInitializer) {
	this.next();
	this.parseVar(node, false, kind, allowMissingInitializer);
	this.semicolon();
	return this.finishNode(node, "VariableDeclaration");
};
pp$8.parseWhileStatement = function(node) {
	this.next();
	node.test = this.parseParenExpression();
	this.labels.push(loopLabel);
	node.body = this.parseStatement("while");
	this.labels.pop();
	return this.finishNode(node, "WhileStatement");
};
pp$8.parseWithStatement = function(node) {
	if (this.strict) this.raise(this.start, "'with' in strict mode");
	this.next();
	node.object = this.parseParenExpression();
	node.body = this.parseStatement("with");
	return this.finishNode(node, "WithStatement");
};
pp$8.parseEmptyStatement = function(node) {
	this.next();
	return this.finishNode(node, "EmptyStatement");
};
pp$8.parseLabeledStatement = function(node, maybeName, expr, context) {
	for (var i$1 = 0, list = this.labels; i$1 < list.length; i$1 += 1) if (list[i$1].name === maybeName) this.raise(expr.start, "Label '" + maybeName + "' is already declared");
	var kind = this.type.isLoop ? "loop" : this.type === types$1._switch ? "switch" : null;
	for (var i = this.labels.length - 1; i >= 0; i--) {
		var label$1 = this.labels[i];
		if (label$1.statementStart === node.start) {
			label$1.statementStart = this.start;
			label$1.kind = kind;
		} else break;
	}
	this.labels.push({
		name: maybeName,
		kind,
		statementStart: this.start
	});
	node.body = this.parseStatement(context ? context.indexOf("label") === -1 ? context + "label" : context : "label");
	this.labels.pop();
	node.label = expr;
	return this.finishNode(node, "LabeledStatement");
};
pp$8.parseExpressionStatement = function(node, expr) {
	node.expression = expr;
	this.semicolon();
	return this.finishNode(node, "ExpressionStatement");
};
pp$8.parseBlock = function(createNewLexicalScope, node, exitStrict) {
	if (createNewLexicalScope === void 0) createNewLexicalScope = true;
	if (node === void 0) node = this.startNode();
	node.body = [];
	this.expect(types$1.braceL);
	if (createNewLexicalScope) this.enterScope(0);
	while (this.type !== types$1.braceR) {
		var stmt = this.parseStatement(null);
		node.body.push(stmt);
	}
	if (exitStrict) this.strict = false;
	this.next();
	if (createNewLexicalScope) this.exitScope();
	return this.finishNode(node, "BlockStatement");
};
pp$8.parseFor = function(node, init) {
	node.init = init;
	this.expect(types$1.semi);
	node.test = this.type === types$1.semi ? null : this.parseExpression();
	this.expect(types$1.semi);
	node.update = this.type === types$1.parenR ? null : this.parseExpression();
	this.expect(types$1.parenR);
	node.body = this.parseStatement("for");
	this.exitScope();
	this.labels.pop();
	return this.finishNode(node, "ForStatement");
};
pp$8.parseForIn = function(node, init) {
	var isForIn = this.type === types$1._in;
	this.next();
	if (init.type === "VariableDeclaration" && init.declarations[0].init != null && (!isForIn || this.options.ecmaVersion < 8 || this.strict || init.kind !== "var" || init.declarations[0].id.type !== "Identifier")) this.raise(init.start, (isForIn ? "for-in" : "for-of") + " loop variable declaration may not have an initializer");
	node.left = init;
	node.right = isForIn ? this.parseExpression() : this.parseMaybeAssign();
	this.expect(types$1.parenR);
	node.body = this.parseStatement("for");
	this.exitScope();
	this.labels.pop();
	return this.finishNode(node, isForIn ? "ForInStatement" : "ForOfStatement");
};
pp$8.parseVar = function(node, isFor, kind, allowMissingInitializer) {
	node.declarations = [];
	node.kind = kind;
	for (;;) {
		var decl = this.startNode();
		this.parseVarId(decl, kind);
		if (this.eat(types$1.eq)) decl.init = this.parseMaybeAssign(isFor);
		else if (!allowMissingInitializer && kind === "const" && !(this.type === types$1._in || this.options.ecmaVersion >= 6 && this.isContextual("of"))) this.unexpected();
		else if (!allowMissingInitializer && (kind === "using" || kind === "await using") && this.options.ecmaVersion >= 17 && this.type !== types$1._in && !this.isContextual("of")) this.raise(this.lastTokEnd, "Missing initializer in " + kind + " declaration");
		else if (!allowMissingInitializer && decl.id.type !== "Identifier" && !(isFor && (this.type === types$1._in || this.isContextual("of")))) this.raise(this.lastTokEnd, "Complex binding patterns require an initialization value");
		else decl.init = null;
		node.declarations.push(this.finishNode(decl, "VariableDeclarator"));
		if (!this.eat(types$1.comma)) break;
	}
	return node;
};
pp$8.parseVarId = function(decl, kind) {
	decl.id = kind === "using" || kind === "await using" ? this.parseIdent() : this.parseBindingAtom();
	this.checkLValPattern(decl.id, kind === "var" ? BIND_VAR : BIND_LEXICAL, false);
};
var FUNC_STATEMENT$1 = 1, FUNC_HANGING_STATEMENT$1 = 2, FUNC_NULLABLE_ID$1 = 4;
pp$8.parseFunction = function(node, statement, allowExpressionBody, isAsync, forInit) {
	this.initFunction(node);
	if (this.options.ecmaVersion >= 9 || this.options.ecmaVersion >= 6 && !isAsync) {
		if (this.type === types$1.star && statement & FUNC_HANGING_STATEMENT$1) this.unexpected();
		node.generator = this.eat(types$1.star);
	}
	if (this.options.ecmaVersion >= 8) node.async = !!isAsync;
	if (statement & FUNC_STATEMENT$1) {
		node.id = statement & FUNC_NULLABLE_ID$1 && this.type !== types$1.name ? null : this.parseIdent();
		if (node.id && !(statement & FUNC_HANGING_STATEMENT$1)) this.checkLValSimple(node.id, this.strict || node.generator || node.async ? this.treatFunctionsAsVar ? BIND_VAR : BIND_LEXICAL : BIND_FUNCTION);
	}
	var oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
	this.yieldPos = 0;
	this.awaitPos = 0;
	this.awaitIdentPos = 0;
	this.enterScope(functionFlags$1(node.async, node.generator));
	if (!(statement & FUNC_STATEMENT$1)) node.id = this.type === types$1.name ? this.parseIdent() : null;
	this.parseFunctionParams(node);
	this.parseFunctionBody(node, allowExpressionBody, false, forInit);
	this.yieldPos = oldYieldPos;
	this.awaitPos = oldAwaitPos;
	this.awaitIdentPos = oldAwaitIdentPos;
	return this.finishNode(node, statement & FUNC_STATEMENT$1 ? "FunctionDeclaration" : "FunctionExpression");
};
pp$8.parseFunctionParams = function(node) {
	this.expect(types$1.parenL);
	node.params = this.parseBindingList(types$1.parenR, false, this.options.ecmaVersion >= 8);
	this.checkYieldAwaitInDefaultParams();
};
pp$8.parseClass = function(node, isStatement) {
	this.next();
	var oldStrict = this.strict;
	this.strict = true;
	this.parseClassId(node, isStatement);
	this.parseClassSuper(node);
	var privateNameMap = this.enterClassBody();
	var classBody = this.startNode();
	var hadConstructor = false;
	classBody.body = [];
	this.expect(types$1.braceL);
	while (this.type !== types$1.braceR) {
		var element = this.parseClassElement(node.superClass !== null);
		if (element) {
			classBody.body.push(element);
			if (element.type === "MethodDefinition" && element.kind === "constructor") {
				if (hadConstructor) this.raiseRecoverable(element.start, "Duplicate constructor in the same class");
				hadConstructor = true;
			} else if (element.key && element.key.type === "PrivateIdentifier" && isPrivateNameConflicted$1(privateNameMap, element)) this.raiseRecoverable(element.key.start, "Identifier '#" + element.key.name + "' has already been declared");
		}
	}
	this.strict = oldStrict;
	this.next();
	node.body = this.finishNode(classBody, "ClassBody");
	this.exitClassBody();
	return this.finishNode(node, isStatement ? "ClassDeclaration" : "ClassExpression");
};
pp$8.parseClassElement = function(constructorAllowsSuper) {
	if (this.eat(types$1.semi)) return null;
	var ecmaVersion = this.options.ecmaVersion;
	var node = this.startNode();
	var keyName = "";
	var isGenerator = false;
	var isAsync = false;
	var kind = "method";
	var isStatic = false;
	if (this.eatContextual("static")) {
		if (ecmaVersion >= 13 && this.eat(types$1.braceL)) {
			this.parseClassStaticBlock(node);
			return node;
		}
		if (this.isClassElementNameStart() || this.type === types$1.star) isStatic = true;
		else keyName = "static";
	}
	node.static = isStatic;
	if (!keyName && ecmaVersion >= 8 && this.eatContextual("async")) if ((this.isClassElementNameStart() || this.type === types$1.star) && !this.canInsertSemicolon()) isAsync = true;
	else keyName = "async";
	if (!keyName && (ecmaVersion >= 9 || !isAsync) && this.eat(types$1.star)) isGenerator = true;
	if (!keyName && !isAsync && !isGenerator) {
		var lastValue = this.value;
		if (this.eatContextual("get") || this.eatContextual("set")) if (this.isClassElementNameStart()) kind = lastValue;
		else keyName = lastValue;
	}
	if (keyName) {
		node.computed = false;
		node.key = this.startNodeAt(this.lastTokStart, this.lastTokStartLoc);
		node.key.name = keyName;
		this.finishNode(node.key, "Identifier");
	} else this.parseClassElementName(node);
	if (ecmaVersion < 13 || this.type === types$1.parenL || kind !== "method" || isGenerator || isAsync) {
		var isConstructor = !node.static && checkKeyName$1(node, "constructor");
		var allowsDirectSuper = isConstructor && constructorAllowsSuper;
		if (isConstructor && kind !== "method") this.raise(node.key.start, "Constructor can't have get/set modifier");
		node.kind = isConstructor ? "constructor" : kind;
		this.parseClassMethod(node, isGenerator, isAsync, allowsDirectSuper);
	} else this.parseClassField(node);
	return node;
};
pp$8.isClassElementNameStart = function() {
	return this.type === types$1.name || this.type === types$1.privateId || this.type === types$1.num || this.type === types$1.string || this.type === types$1.bracketL || this.type.keyword;
};
pp$8.parseClassElementName = function(element) {
	if (this.type === types$1.privateId) {
		if (this.value === "constructor") this.raise(this.start, "Classes can't have an element named '#constructor'");
		element.computed = false;
		element.key = this.parsePrivateIdent();
	} else this.parsePropertyName(element);
};
pp$8.parseClassMethod = function(method, isGenerator, isAsync, allowsDirectSuper) {
	var key = method.key;
	if (method.kind === "constructor") {
		if (isGenerator) this.raise(key.start, "Constructor can't be a generator");
		if (isAsync) this.raise(key.start, "Constructor can't be an async method");
	} else if (method.static && checkKeyName$1(method, "prototype")) this.raise(key.start, "Classes may not have a static property named prototype");
	var value = method.value = this.parseMethod(isGenerator, isAsync, allowsDirectSuper);
	if (method.kind === "get" && value.params.length !== 0) this.raiseRecoverable(value.start, "getter should have no params");
	if (method.kind === "set" && value.params.length !== 1) this.raiseRecoverable(value.start, "setter should have exactly one param");
	if (method.kind === "set" && value.params[0].type === "RestElement") this.raiseRecoverable(value.params[0].start, "Setter cannot use rest params");
	return this.finishNode(method, "MethodDefinition");
};
pp$8.parseClassField = function(field) {
	if (checkKeyName$1(field, "constructor")) this.raise(field.key.start, "Classes can't have a field named 'constructor'");
	else if (field.static && checkKeyName$1(field, "prototype")) this.raise(field.key.start, "Classes can't have a static field named 'prototype'");
	if (this.eat(types$1.eq)) {
		this.enterScope(SCOPE_CLASS_FIELD_INIT | SCOPE_SUPER);
		field.value = this.parseMaybeAssign();
		this.exitScope();
	} else field.value = null;
	this.semicolon();
	return this.finishNode(field, "PropertyDefinition");
};
pp$8.parseClassStaticBlock = function(node) {
	node.body = [];
	var oldLabels = this.labels;
	this.labels = [];
	this.enterScope(SCOPE_CLASS_STATIC_BLOCK | SCOPE_SUPER);
	while (this.type !== types$1.braceR) {
		var stmt = this.parseStatement(null);
		node.body.push(stmt);
	}
	this.next();
	this.exitScope();
	this.labels = oldLabels;
	return this.finishNode(node, "StaticBlock");
};
pp$8.parseClassId = function(node, isStatement) {
	if (this.type === types$1.name) {
		node.id = this.parseIdent();
		if (isStatement) this.checkLValSimple(node.id, BIND_LEXICAL, false);
	} else {
		if (isStatement === true) this.unexpected();
		node.id = null;
	}
};
pp$8.parseClassSuper = function(node) {
	node.superClass = this.eat(types$1._extends) ? this.parseExprSubscripts(null, false) : null;
};
pp$8.enterClassBody = function() {
	var element = {
		declared: Object.create(null),
		used: []
	};
	this.privateNameStack.push(element);
	return element.declared;
};
pp$8.exitClassBody = function() {
	var ref = this.privateNameStack.pop();
	var declared = ref.declared;
	var used = ref.used;
	if (!this.options.checkPrivateFields) return;
	var len = this.privateNameStack.length;
	var parent = len === 0 ? null : this.privateNameStack[len - 1];
	for (var i = 0; i < used.length; ++i) {
		var id = used[i];
		if (!hasOwn(declared, id.name)) if (parent) parent.used.push(id);
		else this.raiseRecoverable(id.start, "Private field '#" + id.name + "' must be declared in an enclosing class");
	}
};
function isPrivateNameConflicted$1(privateNameMap, element) {
	var name = element.key.name;
	var curr = privateNameMap[name];
	var next = "true";
	if (element.type === "MethodDefinition" && (element.kind === "get" || element.kind === "set")) next = (element.static ? "s" : "i") + element.kind;
	if (curr === "iget" && next === "iset" || curr === "iset" && next === "iget" || curr === "sget" && next === "sset" || curr === "sset" && next === "sget") {
		privateNameMap[name] = "true";
		return false;
	} else if (!curr) {
		privateNameMap[name] = next;
		return false;
	} else return true;
}
function checkKeyName$1(node, name) {
	var computed = node.computed;
	var key = node.key;
	return !computed && (key.type === "Identifier" && key.name === name || key.type === "Literal" && key.value === name);
}
pp$8.parseExportAllDeclaration = function(node, exports$1) {
	if (this.options.ecmaVersion >= 11) if (this.eatContextual("as")) {
		node.exported = this.parseModuleExportName();
		this.checkExport(exports$1, node.exported, this.lastTokStart);
	} else node.exported = null;
	this.expectContextual("from");
	if (this.type !== types$1.string) this.unexpected();
	node.source = this.parseExprAtom();
	if (this.options.ecmaVersion >= 16) node.attributes = this.parseWithClause();
	this.semicolon();
	return this.finishNode(node, "ExportAllDeclaration");
};
pp$8.parseExport = function(node, exports$1) {
	this.next();
	if (this.eat(types$1.star)) return this.parseExportAllDeclaration(node, exports$1);
	if (this.eat(types$1._default)) {
		this.checkExport(exports$1, "default", this.lastTokStart);
		node.declaration = this.parseExportDefaultDeclaration();
		return this.finishNode(node, "ExportDefaultDeclaration");
	}
	if (this.shouldParseExportStatement()) {
		node.declaration = this.parseExportDeclaration(node);
		if (node.declaration.type === "VariableDeclaration") this.checkVariableExport(exports$1, node.declaration.declarations);
		else this.checkExport(exports$1, node.declaration.id, node.declaration.id.start);
		node.specifiers = [];
		node.source = null;
		if (this.options.ecmaVersion >= 16) node.attributes = [];
	} else {
		node.declaration = null;
		node.specifiers = this.parseExportSpecifiers(exports$1);
		if (this.eatContextual("from")) {
			if (this.type !== types$1.string) this.unexpected();
			node.source = this.parseExprAtom();
			if (this.options.ecmaVersion >= 16) node.attributes = this.parseWithClause();
		} else {
			for (var i = 0, list = node.specifiers; i < list.length; i += 1) {
				var spec = list[i];
				this.checkUnreserved(spec.local);
				this.checkLocalExport(spec.local);
				if (spec.local.type === "Literal") this.raise(spec.local.start, "A string literal cannot be used as an exported binding without `from`.");
			}
			node.source = null;
			if (this.options.ecmaVersion >= 16) node.attributes = [];
		}
		this.semicolon();
	}
	return this.finishNode(node, "ExportNamedDeclaration");
};
pp$8.parseExportDeclaration = function(node) {
	return this.parseStatement(null);
};
pp$8.parseExportDefaultDeclaration = function() {
	var isAsync;
	if (this.type === types$1._function || (isAsync = this.isAsyncFunction())) {
		var fNode = this.startNode();
		this.next();
		if (isAsync) this.next();
		return this.parseFunction(fNode, FUNC_STATEMENT$1 | FUNC_NULLABLE_ID$1, false, isAsync);
	} else if (this.type === types$1._class) {
		var cNode = this.startNode();
		return this.parseClass(cNode, "nullableID");
	} else {
		var declaration = this.parseMaybeAssign();
		this.semicolon();
		return declaration;
	}
};
pp$8.checkExport = function(exports$1, name, pos) {
	if (!exports$1) return;
	if (typeof name !== "string") name = name.type === "Identifier" ? name.name : name.value;
	if (hasOwn(exports$1, name)) this.raiseRecoverable(pos, "Duplicate export '" + name + "'");
	exports$1[name] = true;
};
pp$8.checkPatternExport = function(exports$1, pat) {
	var type = pat.type;
	if (type === "Identifier") this.checkExport(exports$1, pat, pat.start);
	else if (type === "ObjectPattern") for (var i = 0, list = pat.properties; i < list.length; i += 1) {
		var prop = list[i];
		this.checkPatternExport(exports$1, prop);
	}
	else if (type === "ArrayPattern") for (var i$1 = 0, list$1 = pat.elements; i$1 < list$1.length; i$1 += 1) {
		var elt = list$1[i$1];
		if (elt) this.checkPatternExport(exports$1, elt);
	}
	else if (type === "Property") this.checkPatternExport(exports$1, pat.value);
	else if (type === "AssignmentPattern") this.checkPatternExport(exports$1, pat.left);
	else if (type === "RestElement") this.checkPatternExport(exports$1, pat.argument);
};
pp$8.checkVariableExport = function(exports$1, decls) {
	if (!exports$1) return;
	for (var i = 0, list = decls; i < list.length; i += 1) {
		var decl = list[i];
		this.checkPatternExport(exports$1, decl.id);
	}
};
pp$8.shouldParseExportStatement = function() {
	return this.type.keyword === "var" || this.type.keyword === "const" || this.type.keyword === "class" || this.type.keyword === "function" || this.isLet() || this.isAsyncFunction();
};
pp$8.parseExportSpecifier = function(exports$1) {
	var node = this.startNode();
	node.local = this.parseModuleExportName();
	node.exported = this.eatContextual("as") ? this.parseModuleExportName() : node.local;
	this.checkExport(exports$1, node.exported, node.exported.start);
	return this.finishNode(node, "ExportSpecifier");
};
pp$8.parseExportSpecifiers = function(exports$1) {
	var nodes = [], first = true;
	this.expect(types$1.braceL);
	while (!this.eat(types$1.braceR)) {
		if (!first) {
			this.expect(types$1.comma);
			if (this.afterTrailingComma(types$1.braceR)) break;
		} else first = false;
		nodes.push(this.parseExportSpecifier(exports$1));
	}
	return nodes;
};
pp$8.parseImport = function(node) {
	this.next();
	if (this.type === types$1.string) {
		node.specifiers = empty$1;
		node.source = this.parseExprAtom();
	} else {
		node.specifiers = this.parseImportSpecifiers();
		this.expectContextual("from");
		node.source = this.type === types$1.string ? this.parseExprAtom() : this.unexpected();
	}
	if (this.options.ecmaVersion >= 16) node.attributes = this.parseWithClause();
	this.semicolon();
	return this.finishNode(node, "ImportDeclaration");
};
pp$8.parseImportSpecifier = function() {
	var node = this.startNode();
	node.imported = this.parseModuleExportName();
	if (this.eatContextual("as")) node.local = this.parseIdent();
	else {
		this.checkUnreserved(node.imported);
		node.local = node.imported;
	}
	this.checkLValSimple(node.local, BIND_LEXICAL);
	return this.finishNode(node, "ImportSpecifier");
};
pp$8.parseImportDefaultSpecifier = function() {
	var node = this.startNode();
	node.local = this.parseIdent();
	this.checkLValSimple(node.local, BIND_LEXICAL);
	return this.finishNode(node, "ImportDefaultSpecifier");
};
pp$8.parseImportNamespaceSpecifier = function() {
	var node = this.startNode();
	this.next();
	this.expectContextual("as");
	node.local = this.parseIdent();
	this.checkLValSimple(node.local, BIND_LEXICAL);
	return this.finishNode(node, "ImportNamespaceSpecifier");
};
pp$8.parseImportSpecifiers = function() {
	var nodes = [], first = true;
	if (this.type === types$1.name) {
		nodes.push(this.parseImportDefaultSpecifier());
		if (!this.eat(types$1.comma)) return nodes;
	}
	if (this.type === types$1.star) {
		nodes.push(this.parseImportNamespaceSpecifier());
		return nodes;
	}
	this.expect(types$1.braceL);
	while (!this.eat(types$1.braceR)) {
		if (!first) {
			this.expect(types$1.comma);
			if (this.afterTrailingComma(types$1.braceR)) break;
		} else first = false;
		nodes.push(this.parseImportSpecifier());
	}
	return nodes;
};
pp$8.parseWithClause = function() {
	var nodes = [];
	if (!this.eat(types$1._with)) return nodes;
	this.expect(types$1.braceL);
	var attributeKeys = {};
	var first = true;
	while (!this.eat(types$1.braceR)) {
		if (!first) {
			this.expect(types$1.comma);
			if (this.afterTrailingComma(types$1.braceR)) break;
		} else first = false;
		var attr = this.parseImportAttribute();
		var keyName = attr.key.type === "Identifier" ? attr.key.name : attr.key.value;
		if (hasOwn(attributeKeys, keyName)) this.raiseRecoverable(attr.key.start, "Duplicate attribute key '" + keyName + "'");
		attributeKeys[keyName] = true;
		nodes.push(attr);
	}
	return nodes;
};
pp$8.parseImportAttribute = function() {
	var node = this.startNode();
	node.key = this.type === types$1.string ? this.parseExprAtom() : this.parseIdent(this.options.allowReserved !== "never");
	this.expect(types$1.colon);
	if (this.type !== types$1.string) this.unexpected();
	node.value = this.parseExprAtom();
	return this.finishNode(node, "ImportAttribute");
};
pp$8.parseModuleExportName = function() {
	if (this.options.ecmaVersion >= 13 && this.type === types$1.string) {
		var stringLiteral = this.parseLiteral(this.value);
		if (loneSurrogate.test(stringLiteral.value)) this.raise(stringLiteral.start, "An export name cannot include a lone surrogate.");
		return stringLiteral;
	}
	return this.parseIdent(true);
};
pp$8.adaptDirectivePrologue = function(statements) {
	for (var i = 0; i < statements.length && this.isDirectiveCandidate(statements[i]); ++i) statements[i].directive = statements[i].expression.raw.slice(1, -1);
};
pp$8.isDirectiveCandidate = function(statement) {
	return this.options.ecmaVersion >= 5 && statement.type === "ExpressionStatement" && statement.expression.type === "Literal" && typeof statement.expression.value === "string" && (this.input[statement.start] === "\"" || this.input[statement.start] === "'");
};
var pp$7 = Parser$1.prototype;
pp$7.toAssignable = function(node, isBinding, refDestructuringErrors) {
	if (this.options.ecmaVersion >= 6 && node) switch (node.type) {
		case "Identifier":
			if (this.inAsync && node.name === "await") this.raise(node.start, "Cannot use 'await' as identifier inside an async function");
			break;
		case "ObjectPattern":
		case "ArrayPattern":
		case "AssignmentPattern":
		case "RestElement": break;
		case "ObjectExpression":
			node.type = "ObjectPattern";
			if (refDestructuringErrors) this.checkPatternErrors(refDestructuringErrors, true);
			for (var i = 0, list = node.properties; i < list.length; i += 1) {
				var prop = list[i];
				this.toAssignable(prop, isBinding);
				if (prop.type === "RestElement" && (prop.argument.type === "ArrayPattern" || prop.argument.type === "ObjectPattern")) this.raise(prop.argument.start, "Unexpected token");
			}
			break;
		case "Property":
			if (node.kind !== "init") this.raise(node.key.start, "Object pattern can't contain getter or setter");
			this.toAssignable(node.value, isBinding);
			break;
		case "ArrayExpression":
			node.type = "ArrayPattern";
			if (refDestructuringErrors) this.checkPatternErrors(refDestructuringErrors, true);
			this.toAssignableList(node.elements, isBinding);
			break;
		case "SpreadElement":
			node.type = "RestElement";
			this.toAssignable(node.argument, isBinding);
			if (node.argument.type === "AssignmentPattern") this.raise(node.argument.start, "Rest elements cannot have a default value");
			break;
		case "AssignmentExpression":
			if (node.operator !== "=") this.raise(node.left.end, "Only '=' operator can be used for specifying default value.");
			node.type = "AssignmentPattern";
			delete node.operator;
			this.toAssignable(node.left, isBinding);
			break;
		case "ParenthesizedExpression":
			this.toAssignable(node.expression, isBinding, refDestructuringErrors);
			break;
		case "ChainExpression":
			this.raiseRecoverable(node.start, "Optional chaining cannot appear in left-hand side");
			break;
		case "MemberExpression": if (!isBinding) break;
		default: this.raise(node.start, "Assigning to rvalue");
	}
	else if (refDestructuringErrors) this.checkPatternErrors(refDestructuringErrors, true);
	return node;
};
pp$7.toAssignableList = function(exprList, isBinding) {
	var end = exprList.length;
	for (var i = 0; i < end; i++) {
		var elt = exprList[i];
		if (elt) this.toAssignable(elt, isBinding);
	}
	if (end) {
		var last = exprList[end - 1];
		if (this.options.ecmaVersion === 6 && isBinding && last && last.type === "RestElement" && last.argument.type !== "Identifier") this.unexpected(last.argument.start);
	}
	return exprList;
};
pp$7.parseSpread = function(refDestructuringErrors) {
	var node = this.startNode();
	this.next();
	node.argument = this.parseMaybeAssign(false, refDestructuringErrors);
	return this.finishNode(node, "SpreadElement");
};
pp$7.parseRestBinding = function() {
	var node = this.startNode();
	this.next();
	if (this.options.ecmaVersion === 6 && this.type !== types$1.name) this.unexpected();
	node.argument = this.parseBindingAtom();
	return this.finishNode(node, "RestElement");
};
pp$7.parseBindingAtom = function() {
	if (this.options.ecmaVersion >= 6) switch (this.type) {
		case types$1.bracketL:
			var node = this.startNode();
			this.next();
			node.elements = this.parseBindingList(types$1.bracketR, true, true);
			return this.finishNode(node, "ArrayPattern");
		case types$1.braceL: return this.parseObj(true);
	}
	return this.parseIdent();
};
pp$7.parseBindingList = function(close, allowEmpty, allowTrailingComma, allowModifiers) {
	var elts = [], first = true;
	while (!this.eat(close)) {
		if (first) first = false;
		else this.expect(types$1.comma);
		if (allowEmpty && this.type === types$1.comma) elts.push(null);
		else if (allowTrailingComma && this.afterTrailingComma(close)) break;
		else if (this.type === types$1.ellipsis) {
			var rest = this.parseRestBinding();
			this.parseBindingListItem(rest);
			elts.push(rest);
			if (this.type === types$1.comma) this.raiseRecoverable(this.start, "Comma is not permitted after the rest element");
			this.expect(close);
			break;
		} else elts.push(this.parseAssignableListItem(allowModifiers));
	}
	return elts;
};
pp$7.parseAssignableListItem = function(allowModifiers) {
	var elem = this.parseMaybeDefault(this.start, this.startLoc);
	this.parseBindingListItem(elem);
	return elem;
};
pp$7.parseBindingListItem = function(param) {
	return param;
};
pp$7.parseMaybeDefault = function(startPos, startLoc, left) {
	left = left || this.parseBindingAtom();
	if (this.options.ecmaVersion < 6 || !this.eat(types$1.eq)) return left;
	var node = this.startNodeAt(startPos, startLoc);
	node.left = left;
	node.right = this.parseMaybeAssign();
	return this.finishNode(node, "AssignmentPattern");
};
pp$7.checkLValSimple = function(expr, bindingType, checkClashes) {
	if (bindingType === void 0) bindingType = BIND_NONE;
	var isBind = bindingType !== BIND_NONE;
	switch (expr.type) {
		case "Identifier":
			if (this.strict && this.reservedWordsStrictBind.test(expr.name)) this.raiseRecoverable(expr.start, (isBind ? "Binding " : "Assigning to ") + expr.name + " in strict mode");
			if (isBind) {
				if (bindingType === BIND_LEXICAL && expr.name === "let") this.raiseRecoverable(expr.start, "let is disallowed as a lexically bound name");
				if (checkClashes) {
					if (hasOwn(checkClashes, expr.name)) this.raiseRecoverable(expr.start, "Argument name clash");
					checkClashes[expr.name] = true;
				}
				if (bindingType !== BIND_OUTSIDE) this.declareName(expr.name, bindingType, expr.start);
			}
			break;
		case "ChainExpression":
			this.raiseRecoverable(expr.start, "Optional chaining cannot appear in left-hand side");
			break;
		case "MemberExpression":
			if (isBind) this.raiseRecoverable(expr.start, "Binding member expression");
			break;
		case "ParenthesizedExpression":
			if (isBind) this.raiseRecoverable(expr.start, "Binding parenthesized expression");
			return this.checkLValSimple(expr.expression, bindingType, checkClashes);
		default: this.raise(expr.start, (isBind ? "Binding" : "Assigning to") + " rvalue");
	}
};
pp$7.checkLValPattern = function(expr, bindingType, checkClashes) {
	if (bindingType === void 0) bindingType = BIND_NONE;
	switch (expr.type) {
		case "ObjectPattern":
			for (var i = 0, list = expr.properties; i < list.length; i += 1) {
				var prop = list[i];
				this.checkLValInnerPattern(prop, bindingType, checkClashes);
			}
			break;
		case "ArrayPattern":
			for (var i$1 = 0, list$1 = expr.elements; i$1 < list$1.length; i$1 += 1) {
				var elem = list$1[i$1];
				if (elem) this.checkLValInnerPattern(elem, bindingType, checkClashes);
			}
			break;
		default: this.checkLValSimple(expr, bindingType, checkClashes);
	}
};
pp$7.checkLValInnerPattern = function(expr, bindingType, checkClashes) {
	if (bindingType === void 0) bindingType = BIND_NONE;
	switch (expr.type) {
		case "Property":
			this.checkLValInnerPattern(expr.value, bindingType, checkClashes);
			break;
		case "AssignmentPattern":
			this.checkLValPattern(expr.left, bindingType, checkClashes);
			break;
		case "RestElement":
			this.checkLValPattern(expr.argument, bindingType, checkClashes);
			break;
		default: this.checkLValPattern(expr, bindingType, checkClashes);
	}
};
var TokContext = function TokContext(token, isExpr, preserveSpace, override, generator) {
	this.token = token;
	this.isExpr = !!isExpr;
	this.preserveSpace = !!preserveSpace;
	this.override = override;
	this.generator = !!generator;
};
var types = {
	b_stat: new TokContext("{", false),
	b_expr: new TokContext("{", true),
	b_tmpl: new TokContext("${", false),
	p_stat: new TokContext("(", false),
	p_expr: new TokContext("(", true),
	q_tmpl: new TokContext("`", true, true, function(p) {
		return p.tryReadTemplateToken();
	}),
	f_stat: new TokContext("function", false),
	f_expr: new TokContext("function", true),
	f_expr_gen: new TokContext("function", true, false, null, true),
	f_gen: new TokContext("function", false, false, null, true)
};
var pp$6 = Parser$1.prototype;
pp$6.initialContext = function() {
	return [types.b_stat];
};
pp$6.curContext = function() {
	return this.context[this.context.length - 1];
};
pp$6.braceIsBlock = function(prevType) {
	var parent = this.curContext();
	if (parent === types.f_expr || parent === types.f_stat) return true;
	if (prevType === types$1.colon && (parent === types.b_stat || parent === types.b_expr)) return !parent.isExpr;
	if (prevType === types$1._return || prevType === types$1.name && this.exprAllowed) return lineBreak.test(this.input.slice(this.lastTokEnd, this.start));
	if (prevType === types$1._else || prevType === types$1.semi || prevType === types$1.eof || prevType === types$1.parenR || prevType === types$1.arrow) return true;
	if (prevType === types$1.braceL) return parent === types.b_stat;
	if (prevType === types$1._var || prevType === types$1._const || prevType === types$1.name) return false;
	return !this.exprAllowed;
};
pp$6.inGeneratorContext = function() {
	for (var i = this.context.length - 1; i >= 1; i--) {
		var context = this.context[i];
		if (context.token === "function") return context.generator;
	}
	return false;
};
pp$6.updateContext = function(prevType) {
	var update, type = this.type;
	if (type.keyword && prevType === types$1.dot) this.exprAllowed = false;
	else if (update = type.updateContext) update.call(this, prevType);
	else this.exprAllowed = type.beforeExpr;
};
pp$6.overrideContext = function(tokenCtx) {
	if (this.curContext() !== tokenCtx) this.context[this.context.length - 1] = tokenCtx;
};
types$1.parenR.updateContext = types$1.braceR.updateContext = function() {
	if (this.context.length === 1) {
		this.exprAllowed = true;
		return;
	}
	var out = this.context.pop();
	if (out === types.b_stat && this.curContext().token === "function") out = this.context.pop();
	this.exprAllowed = !out.isExpr;
};
types$1.braceL.updateContext = function(prevType) {
	this.context.push(this.braceIsBlock(prevType) ? types.b_stat : types.b_expr);
	this.exprAllowed = true;
};
types$1.dollarBraceL.updateContext = function() {
	this.context.push(types.b_tmpl);
	this.exprAllowed = true;
};
types$1.parenL.updateContext = function(prevType) {
	var statementParens = prevType === types$1._if || prevType === types$1._for || prevType === types$1._with || prevType === types$1._while;
	this.context.push(statementParens ? types.p_stat : types.p_expr);
	this.exprAllowed = true;
};
types$1.incDec.updateContext = function() {};
types$1._function.updateContext = types$1._class.updateContext = function(prevType) {
	if (prevType.beforeExpr && prevType !== types$1._else && !(prevType === types$1.semi && this.curContext() !== types.p_stat) && !(prevType === types$1._return && lineBreak.test(this.input.slice(this.lastTokEnd, this.start))) && !((prevType === types$1.colon || prevType === types$1.braceL) && this.curContext() === types.b_stat)) this.context.push(types.f_expr);
	else this.context.push(types.f_stat);
	this.exprAllowed = false;
};
types$1.colon.updateContext = function() {
	if (this.curContext().token === "function") this.context.pop();
	this.exprAllowed = true;
};
types$1.backQuote.updateContext = function() {
	if (this.curContext() === types.q_tmpl) this.context.pop();
	else this.context.push(types.q_tmpl);
	this.exprAllowed = false;
};
types$1.star.updateContext = function(prevType) {
	if (prevType === types$1._function) {
		var index = this.context.length - 1;
		if (this.context[index] === types.f_expr) this.context[index] = types.f_expr_gen;
		else this.context[index] = types.f_gen;
	}
	this.exprAllowed = true;
};
types$1.name.updateContext = function(prevType) {
	var allowed = false;
	if (this.options.ecmaVersion >= 6 && prevType !== types$1.dot) {
		if (this.value === "of" && !this.exprAllowed || this.value === "yield" && this.inGeneratorContext()) allowed = true;
	}
	this.exprAllowed = allowed;
};
var pp$5 = Parser$1.prototype;
pp$5.checkPropClash = function(prop, propHash, refDestructuringErrors) {
	if (this.options.ecmaVersion >= 9 && prop.type === "SpreadElement") return;
	if (this.options.ecmaVersion >= 6 && (prop.computed || prop.method || prop.shorthand)) return;
	var key = prop.key;
	var name;
	switch (key.type) {
		case "Identifier":
			name = key.name;
			break;
		case "Literal":
			name = String(key.value);
			break;
		default: return;
	}
	var kind = prop.kind;
	if (this.options.ecmaVersion >= 6) {
		if (name === "__proto__" && kind === "init") {
			if (propHash.proto) if (refDestructuringErrors) {
				if (refDestructuringErrors.doubleProto < 0) refDestructuringErrors.doubleProto = key.start;
			} else this.raiseRecoverable(key.start, "Redefinition of __proto__ property");
			propHash.proto = true;
		}
		return;
	}
	name = "$" + name;
	var other = propHash[name];
	if (other) {
		var redefinition;
		if (kind === "init") redefinition = this.strict && other.init || other.get || other.set;
		else redefinition = other.init || other[kind];
		if (redefinition) this.raiseRecoverable(key.start, "Redefinition of property");
	} else other = propHash[name] = {
		init: false,
		get: false,
		set: false
	};
	other[kind] = true;
};
pp$5.parseExpression = function(forInit, refDestructuringErrors) {
	var this$1$1 = this;
	return this.catchStackOverflow(function() {
		var startPos = this$1$1.start, startLoc = this$1$1.startLoc;
		var expr = this$1$1.parseMaybeAssign(forInit, refDestructuringErrors);
		if (this$1$1.type === types$1.comma) {
			var node = this$1$1.startNodeAt(startPos, startLoc);
			node.expressions = [expr];
			while (this$1$1.eat(types$1.comma)) node.expressions.push(this$1$1.parseMaybeAssign(forInit, refDestructuringErrors));
			return this$1$1.finishNode(node, "SequenceExpression");
		}
		return expr;
	});
};
pp$5.parseMaybeAssign = function(forInit, refDestructuringErrors, afterLeftParse) {
	if (this.isContextual("yield")) if (this.inGenerator) return this.parseYield(forInit);
	else this.exprAllowed = false;
	var ownDestructuringErrors = false, oldParenAssign = -1, oldTrailingComma = -1, oldDoubleProto = -1;
	if (refDestructuringErrors) {
		oldParenAssign = refDestructuringErrors.parenthesizedAssign;
		oldTrailingComma = refDestructuringErrors.trailingComma;
		oldDoubleProto = refDestructuringErrors.doubleProto;
		refDestructuringErrors.parenthesizedAssign = refDestructuringErrors.trailingComma = -1;
	} else {
		refDestructuringErrors = new DestructuringErrors$2();
		ownDestructuringErrors = true;
	}
	var startPos = this.start, startLoc = this.startLoc;
	if (this.type === types$1.parenL || this.type === types$1.name) {
		this.potentialArrowAt = this.start;
		this.potentialArrowInForAwait = forInit === "await";
	}
	var left = this.parseMaybeConditional(forInit, refDestructuringErrors);
	if (afterLeftParse) left = afterLeftParse.call(this, left, startPos, startLoc);
	if (this.type.isAssign) {
		var node = this.startNodeAt(startPos, startLoc);
		node.operator = this.value;
		if (this.type === types$1.eq) left = this.toAssignable(left, false, refDestructuringErrors);
		if (!ownDestructuringErrors) refDestructuringErrors.parenthesizedAssign = refDestructuringErrors.trailingComma = refDestructuringErrors.doubleProto = -1;
		if (refDestructuringErrors.shorthandAssign >= left.start) refDestructuringErrors.shorthandAssign = -1;
		if (this.type === types$1.eq) this.checkLValPattern(left);
		else this.checkLValSimple(left);
		node.left = left;
		this.next();
		node.right = this.parseMaybeAssign(forInit);
		if (oldDoubleProto > -1) refDestructuringErrors.doubleProto = oldDoubleProto;
		return this.finishNode(node, "AssignmentExpression");
	} else if (ownDestructuringErrors) this.checkExpressionErrors(refDestructuringErrors, true);
	if (oldParenAssign > -1) refDestructuringErrors.parenthesizedAssign = oldParenAssign;
	if (oldTrailingComma > -1) refDestructuringErrors.trailingComma = oldTrailingComma;
	return left;
};
pp$5.parseMaybeConditional = function(forInit, refDestructuringErrors) {
	var startPos = this.start, startLoc = this.startLoc;
	var expr = this.parseExprOps(forInit, refDestructuringErrors);
	if (this.checkExpressionErrors(refDestructuringErrors)) return expr;
	if (!(expr.type === "ArrowFunctionExpression" && expr.start === startPos) && this.eat(types$1.question)) {
		var node = this.startNodeAt(startPos, startLoc);
		node.test = expr;
		node.consequent = this.parseMaybeAssign();
		this.expect(types$1.colon);
		node.alternate = this.parseMaybeAssign(forInit);
		return this.finishNode(node, "ConditionalExpression");
	}
	return expr;
};
pp$5.parseExprOps = function(forInit, refDestructuringErrors) {
	var startPos = this.start, startLoc = this.startLoc;
	var expr = this.parseMaybeUnary(refDestructuringErrors, false, false, forInit);
	if (this.checkExpressionErrors(refDestructuringErrors)) return expr;
	return expr.start === startPos && expr.type === "ArrowFunctionExpression" ? expr : this.parseExprOp(expr, startPos, startLoc, -1, forInit);
};
pp$5.parseExprOp = function(left, leftStartPos, leftStartLoc, minPrec, forInit) {
	var prec = this.type.binop;
	if (prec != null && (!forInit || this.type !== types$1._in)) {
		if (prec > minPrec) {
			var logical = this.type === types$1.logicalOR || this.type === types$1.logicalAND;
			var coalesce = this.type === types$1.coalesce;
			if (coalesce) prec = types$1.logicalAND.binop;
			var op = this.value;
			this.next();
			var startPos = this.start, startLoc = this.startLoc;
			var right = this.parseExprOp(this.parseMaybeUnary(null, false, false, forInit), startPos, startLoc, prec, forInit);
			var node = this.buildBinary(leftStartPos, leftStartLoc, left, right, op, logical || coalesce);
			if (logical && this.type === types$1.coalesce || coalesce && (this.type === types$1.logicalOR || this.type === types$1.logicalAND)) this.raiseRecoverable(this.start, "Logical expressions and coalesce expressions cannot be mixed. Wrap either by parentheses");
			return this.parseExprOp(node, leftStartPos, leftStartLoc, minPrec, forInit);
		}
	}
	return left;
};
pp$5.buildBinary = function(startPos, startLoc, left, right, op, logical) {
	if (right.type === "PrivateIdentifier") this.raise(right.start, "Private identifier can only be left side of binary expression");
	var node = this.startNodeAt(startPos, startLoc);
	node.left = left;
	node.operator = op;
	node.right = right;
	return this.finishNode(node, logical ? "LogicalExpression" : "BinaryExpression");
};
pp$5.parseMaybeUnary = function(refDestructuringErrors, sawUnary, incDec, forInit) {
	var startPos = this.start, startLoc = this.startLoc, expr;
	if (this.isContextual("await") && this.canAwait) {
		expr = this.parseAwait(forInit);
		sawUnary = true;
	} else if (this.type.prefix) {
		var node = this.startNode(), update = this.type === types$1.incDec;
		node.operator = this.value;
		node.prefix = true;
		this.next();
		node.argument = this.parseMaybeUnary(null, true, update, forInit);
		this.checkExpressionErrors(refDestructuringErrors, true);
		if (update) this.checkLValSimple(node.argument);
		else if (this.strict && node.operator === "delete" && isLocalVariableAccess(node.argument)) this.raiseRecoverable(node.start, "Deleting local variable in strict mode");
		else if (node.operator === "delete" && isPrivateFieldAccess(node.argument)) this.raiseRecoverable(node.start, "Private fields can not be deleted");
		else sawUnary = true;
		expr = this.finishNode(node, update ? "UpdateExpression" : "UnaryExpression");
	} else if (!sawUnary && this.type === types$1.privateId) {
		if ((forInit || this.privateNameStack.length === 0) && this.options.checkPrivateFields) this.unexpected();
		expr = this.parsePrivateIdent();
		if (this.type !== types$1._in) this.unexpected();
	} else {
		expr = this.parseExprSubscripts(refDestructuringErrors, forInit);
		if (this.checkExpressionErrors(refDestructuringErrors)) return expr;
		while (this.type.postfix && !this.canInsertSemicolon()) {
			var node$1 = this.startNodeAt(startPos, startLoc);
			node$1.operator = this.value;
			node$1.prefix = false;
			node$1.argument = expr;
			this.checkLValSimple(expr);
			this.next();
			expr = this.finishNode(node$1, "UpdateExpression");
		}
	}
	if (!incDec && this.eat(types$1.starstar)) if (sawUnary) this.unexpected(this.lastTokStart);
	else return this.buildBinary(startPos, startLoc, expr, this.parseMaybeUnary(null, false, false, forInit), "**", false);
	else return expr;
};
function isLocalVariableAccess(node) {
	return node.type === "Identifier" || node.type === "ParenthesizedExpression" && isLocalVariableAccess(node.expression);
}
function isPrivateFieldAccess(node) {
	return node.type === "MemberExpression" && node.property.type === "PrivateIdentifier" || node.type === "ChainExpression" && isPrivateFieldAccess(node.expression) || node.type === "ParenthesizedExpression" && isPrivateFieldAccess(node.expression);
}
pp$5.parseExprSubscripts = function(refDestructuringErrors, forInit) {
	var startPos = this.start, startLoc = this.startLoc;
	var expr = this.parseExprAtom(refDestructuringErrors, forInit);
	if (expr.type === "ArrowFunctionExpression" && this.input.slice(this.lastTokStart, this.lastTokEnd) !== ")") return expr;
	var result = this.parseSubscripts(expr, startPos, startLoc, false, forInit);
	if (refDestructuringErrors && result.type === "MemberExpression") {
		if (refDestructuringErrors.parenthesizedAssign >= result.start) refDestructuringErrors.parenthesizedAssign = -1;
		if (refDestructuringErrors.parenthesizedBind >= result.start) refDestructuringErrors.parenthesizedBind = -1;
		if (refDestructuringErrors.trailingComma >= result.start) refDestructuringErrors.trailingComma = -1;
	}
	return result;
};
pp$5.parseSubscripts = function(base, startPos, startLoc, noCalls, forInit) {
	var maybeAsyncArrow = this.options.ecmaVersion >= 8 && base.type === "Identifier" && base.name === "async" && this.lastTokEnd === base.end && !this.canInsertSemicolon() && base.end - base.start === 5 && this.potentialArrowAt === base.start;
	var optionalChained = false;
	while (true) {
		var element = this.parseSubscript(base, startPos, startLoc, noCalls, maybeAsyncArrow, optionalChained, forInit);
		if (element.optional) optionalChained = true;
		if (element === base || element.type === "ArrowFunctionExpression") {
			if (optionalChained) {
				var chainNode = this.startNodeAt(startPos, startLoc);
				chainNode.expression = element;
				element = this.finishNode(chainNode, "ChainExpression");
			}
			return element;
		}
		base = element;
	}
};
pp$5.shouldParseAsyncArrow = function() {
	return !this.canInsertSemicolon() && this.eat(types$1.arrow);
};
pp$5.parseSubscriptAsyncArrow = function(startPos, startLoc, exprList, forInit) {
	return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), exprList, true, forInit);
};
pp$5.parseSubscript = function(base, startPos, startLoc, noCalls, maybeAsyncArrow, optionalChained, forInit) {
	var optionalSupported = this.options.ecmaVersion >= 11;
	var optional = optionalSupported && this.eat(types$1.questionDot);
	if (noCalls && optional) this.raise(this.lastTokStart, "Optional chaining cannot appear in the callee of new expressions");
	var computed = this.eat(types$1.bracketL);
	if (computed || optional && this.type !== types$1.parenL && this.type !== types$1.backQuote || this.eat(types$1.dot)) {
		var node = this.startNodeAt(startPos, startLoc);
		node.object = base;
		if (computed) {
			node.property = this.parseExpression();
			this.expect(types$1.bracketR);
		} else if (this.type === types$1.privateId && base.type !== "Super") node.property = this.parsePrivateIdent();
		else node.property = this.parseIdent(this.options.allowReserved !== "never");
		node.computed = !!computed;
		if (optionalSupported) node.optional = optional;
		base = this.finishNode(node, "MemberExpression");
	} else if (!noCalls && this.eat(types$1.parenL)) {
		var refDestructuringErrors = new DestructuringErrors$2(), oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
		this.yieldPos = 0;
		this.awaitPos = 0;
		this.awaitIdentPos = 0;
		var exprList = this.parseExprList(types$1.parenR, this.options.ecmaVersion >= 8, false, refDestructuringErrors);
		if (maybeAsyncArrow && !optional && this.shouldParseAsyncArrow()) {
			this.checkPatternErrors(refDestructuringErrors, false);
			this.checkYieldAwaitInDefaultParams();
			if (this.awaitIdentPos > 0) this.raise(this.awaitIdentPos, "Cannot use 'await' as identifier inside an async function");
			this.yieldPos = oldYieldPos;
			this.awaitPos = oldAwaitPos;
			this.awaitIdentPos = oldAwaitIdentPos;
			return this.parseSubscriptAsyncArrow(startPos, startLoc, exprList, forInit);
		}
		this.checkExpressionErrors(refDestructuringErrors, true);
		this.yieldPos = oldYieldPos || this.yieldPos;
		this.awaitPos = oldAwaitPos || this.awaitPos;
		this.awaitIdentPos = oldAwaitIdentPos || this.awaitIdentPos;
		var node$1 = this.startNodeAt(startPos, startLoc);
		node$1.callee = base;
		node$1.arguments = exprList;
		if (optionalSupported) node$1.optional = optional;
		base = this.finishNode(node$1, "CallExpression");
	} else if (this.type === types$1.backQuote) {
		if (optional || optionalChained) this.raise(this.start, "Optional chaining cannot appear in the tag of tagged template expressions");
		var node$2 = this.startNodeAt(startPos, startLoc);
		node$2.tag = base;
		node$2.quasi = this.parseTemplate({ isTagged: true });
		base = this.finishNode(node$2, "TaggedTemplateExpression");
	}
	return base;
};
pp$5.parseExprAtom = function(refDestructuringErrors, forInit, forNew) {
	if (this.type === types$1.slash) this.readRegexp();
	var node, canBeArrow = this.potentialArrowAt === this.start;
	switch (this.type) {
		case types$1._super:
			if (!this.allowSuper) this.raise(this.start, "'super' keyword outside a method");
			node = this.startNode();
			this.next();
			if (this.type === types$1.parenL && !this.allowDirectSuper) this.raise(node.start, "super() call outside constructor of a subclass");
			if (this.type !== types$1.dot && this.type !== types$1.bracketL && this.type !== types$1.parenL) this.unexpected();
			return this.finishNode(node, "Super");
		case types$1._this:
			node = this.startNode();
			this.next();
			return this.finishNode(node, "ThisExpression");
		case types$1.name:
			var startPos = this.start, startLoc = this.startLoc, containsEsc = this.containsEsc;
			var id = this.parseIdent(false);
			if (this.options.ecmaVersion >= 8 && !containsEsc && id.name === "async" && !this.canInsertSemicolon() && this.eat(types$1._function)) {
				this.overrideContext(types.f_expr);
				return this.parseFunction(this.startNodeAt(startPos, startLoc), 0, false, true, forInit);
			}
			if (canBeArrow && !this.canInsertSemicolon()) {
				if (this.eat(types$1.arrow)) return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), [id], false, forInit);
				if (this.options.ecmaVersion >= 8 && id.name === "async" && this.type === types$1.name && !containsEsc && (!this.potentialArrowInForAwait || this.value !== "of" || this.containsEsc)) {
					id = this.parseIdent(false);
					if (this.canInsertSemicolon() || !this.eat(types$1.arrow)) this.unexpected();
					return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), [id], true, forInit);
				}
			}
			return id;
		case types$1.regexp:
			var value = this.value;
			node = this.parseLiteral(value.value);
			node.regex = {
				pattern: value.pattern,
				flags: value.flags
			};
			return node;
		case types$1.num:
		case types$1.string: return this.parseLiteral(this.value);
		case types$1._null:
		case types$1._true:
		case types$1._false:
			node = this.startNode();
			node.value = this.type === types$1._null ? null : this.type === types$1._true;
			node.raw = this.type.keyword;
			this.next();
			return this.finishNode(node, "Literal");
		case types$1.parenL:
			var start = this.start, expr = this.parseParenAndDistinguishExpression(canBeArrow, forInit);
			if (refDestructuringErrors) {
				if (refDestructuringErrors.parenthesizedAssign < 0 && !this.isSimpleAssignTarget(expr)) refDestructuringErrors.parenthesizedAssign = start;
				if (refDestructuringErrors.parenthesizedBind < 0) refDestructuringErrors.parenthesizedBind = start;
			}
			return expr;
		case types$1.bracketL:
			node = this.startNode();
			this.next();
			node.elements = this.parseExprList(types$1.bracketR, true, true, refDestructuringErrors);
			return this.finishNode(node, "ArrayExpression");
		case types$1.braceL:
			this.overrideContext(types.b_expr);
			return this.parseObj(false, refDestructuringErrors);
		case types$1._function:
			node = this.startNode();
			this.next();
			return this.parseFunction(node, 0);
		case types$1._class: return this.parseClass(this.startNode(), false);
		case types$1._new: return this.parseNew();
		case types$1.backQuote: return this.parseTemplate();
		case types$1._import: if (this.options.ecmaVersion >= 11) return this.parseExprImport(forNew);
		else return this.unexpected();
		default: return this.parseExprAtomDefault();
	}
};
pp$5.parseExprAtomDefault = function() {
	this.unexpected();
};
pp$5.parseExprImport = function(forNew) {
	var node = this.startNode();
	if (this.containsEsc) this.raiseRecoverable(this.start, "Escape sequence in keyword import");
	this.next();
	if (this.type === types$1.parenL && !forNew) return this.parseDynamicImport(node);
	else if (this.type === types$1.dot) {
		var meta = this.startNodeAt(node.start, node.loc && node.loc.start);
		meta.name = "import";
		node.meta = this.finishNode(meta, "Identifier");
		return this.parseImportMeta(node);
	} else this.unexpected();
};
pp$5.parseDynamicImport = function(node) {
	this.next();
	node.source = this.parseMaybeAssign();
	if (this.options.ecmaVersion >= 16) if (!this.eat(types$1.parenR)) {
		this.expect(types$1.comma);
		if (!this.afterTrailingComma(types$1.parenR)) {
			node.options = this.parseMaybeAssign();
			if (!this.eat(types$1.parenR)) {
				this.expect(types$1.comma);
				if (!this.afterTrailingComma(types$1.parenR)) this.unexpected();
			}
		} else node.options = null;
	} else node.options = null;
	else if (!this.eat(types$1.parenR)) {
		var errorPos = this.start;
		if (this.eat(types$1.comma) && this.eat(types$1.parenR)) this.raiseRecoverable(errorPos, "Trailing comma is not allowed in import()");
		else this.unexpected(errorPos);
	}
	return this.finishNode(node, "ImportExpression");
};
pp$5.parseImportMeta = function(node) {
	this.next();
	var containsEsc = this.containsEsc;
	node.property = this.parseIdent(true);
	if (node.property.name !== "meta") this.raiseRecoverable(node.property.start, "The only valid meta property for import is 'import.meta'");
	if (containsEsc) this.raiseRecoverable(node.start, "'import.meta' must not contain escaped characters");
	if (this.options.sourceType !== "module" && !this.options.allowImportExportEverywhere) this.raiseRecoverable(node.start, "Cannot use 'import.meta' outside a module");
	return this.finishNode(node, "MetaProperty");
};
pp$5.parseLiteral = function(value) {
	var node = this.startNode();
	node.value = value;
	node.raw = this.input.slice(this.start, this.end);
	if (node.raw.charCodeAt(node.raw.length - 1) === 110) node.bigint = node.value != null ? node.value.toString() : node.raw.slice(0, -1).replace(/_/g, "");
	this.next();
	return this.finishNode(node, "Literal");
};
pp$5.parseParenExpression = function() {
	this.expect(types$1.parenL);
	var val = this.parseExpression();
	this.expect(types$1.parenR);
	return val;
};
pp$5.shouldParseArrow = function(exprList) {
	return !this.canInsertSemicolon();
};
pp$5.parseParenAndDistinguishExpression = function(canBeArrow, forInit) {
	var startPos = this.start, startLoc = this.startLoc, val, allowTrailingComma = this.options.ecmaVersion >= 8;
	if (this.options.ecmaVersion >= 6) {
		this.next();
		var innerStartPos = this.start, innerStartLoc = this.startLoc;
		var exprList = [], first = true, lastIsComma = false;
		var refDestructuringErrors = new DestructuringErrors$2(), oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, spreadStart;
		this.yieldPos = 0;
		this.awaitPos = 0;
		while (this.type !== types$1.parenR) {
			first ? first = false : this.expect(types$1.comma);
			if (allowTrailingComma && this.afterTrailingComma(types$1.parenR, true)) {
				lastIsComma = true;
				break;
			} else if (this.type === types$1.ellipsis) {
				spreadStart = this.start;
				exprList.push(this.parseParenItem(this.parseRestBinding()));
				if (this.type === types$1.comma) this.raiseRecoverable(this.start, "Comma is not permitted after the rest element");
				break;
			} else exprList.push(this.parseMaybeAssign(false, refDestructuringErrors, this.parseParenItem));
		}
		var innerEndPos = this.lastTokEnd, innerEndLoc = this.lastTokEndLoc;
		this.expect(types$1.parenR);
		if (canBeArrow && this.shouldParseArrow(exprList) && this.eat(types$1.arrow)) {
			this.checkPatternErrors(refDestructuringErrors, false);
			this.checkYieldAwaitInDefaultParams();
			this.yieldPos = oldYieldPos;
			this.awaitPos = oldAwaitPos;
			return this.parseParenArrowList(startPos, startLoc, exprList, forInit);
		}
		if (!exprList.length || lastIsComma) this.unexpected(this.lastTokStart);
		if (spreadStart) this.unexpected(spreadStart);
		this.checkExpressionErrors(refDestructuringErrors, true);
		this.yieldPos = oldYieldPos || this.yieldPos;
		this.awaitPos = oldAwaitPos || this.awaitPos;
		if (exprList.length > 1) {
			val = this.startNodeAt(innerStartPos, innerStartLoc);
			val.expressions = exprList;
			this.finishNodeAt(val, "SequenceExpression", innerEndPos, innerEndLoc);
		} else val = exprList[0];
	} else val = this.parseParenExpression();
	if (this.options.preserveParens) {
		var par = this.startNodeAt(startPos, startLoc);
		par.expression = val;
		return this.finishNode(par, "ParenthesizedExpression");
	} else return val;
};
pp$5.parseParenItem = function(item) {
	return item;
};
pp$5.parseParenArrowList = function(startPos, startLoc, exprList, forInit) {
	return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), exprList, false, forInit);
};
var empty = [];
pp$5.parseNew = function() {
	if (this.containsEsc) this.raiseRecoverable(this.start, "Escape sequence in keyword new");
	var node = this.startNode();
	this.next();
	if (this.options.ecmaVersion >= 6 && this.type === types$1.dot) {
		var meta = this.startNodeAt(node.start, node.loc && node.loc.start);
		meta.name = "new";
		node.meta = this.finishNode(meta, "Identifier");
		this.next();
		var containsEsc = this.containsEsc;
		node.property = this.parseIdent(true);
		if (node.property.name !== "target") this.raiseRecoverable(node.property.start, "The only valid meta property for new is 'new.target'");
		if (containsEsc) this.raiseRecoverable(node.start, "'new.target' must not contain escaped characters");
		if (!this.allowNewDotTarget) this.raiseRecoverable(node.start, "'new.target' can only be used in functions and class static block");
		return this.finishNode(node, "MetaProperty");
	}
	var startPos = this.start, startLoc = this.startLoc;
	node.callee = this.parseSubscripts(this.parseExprAtom(null, false, true), startPos, startLoc, true, false);
	if (node.callee.type === "Super") this.raiseRecoverable(startPos, "Invalid use of 'super'");
	if (this.eat(types$1.parenL)) node.arguments = this.parseExprList(types$1.parenR, this.options.ecmaVersion >= 8, false);
	else node.arguments = empty;
	return this.finishNode(node, "NewExpression");
};
pp$5.parseTemplateElement = function(ref) {
	var isTagged = ref.isTagged;
	var elem = this.startNode();
	if (this.type === types$1.invalidTemplate) {
		if (!isTagged) this.raiseRecoverable(this.start, "Bad escape sequence in untagged template literal");
		elem.value = {
			raw: this.value.replace(/\r\n?/g, "\n"),
			cooked: null
		};
	} else elem.value = {
		raw: this.input.slice(this.start, this.end).replace(/\r\n?/g, "\n"),
		cooked: this.value
	};
	this.next();
	elem.tail = this.type === types$1.backQuote;
	return this.finishNode(elem, "TemplateElement");
};
pp$5.parseTemplate = function(ref) {
	if (ref === void 0) ref = {};
	var isTagged = ref.isTagged;
	if (isTagged === void 0) isTagged = false;
	var node = this.startNode();
	this.next();
	node.expressions = [];
	var curElt = this.parseTemplateElement({ isTagged });
	node.quasis = [curElt];
	while (!curElt.tail) {
		if (this.type === types$1.eof) this.raise(this.pos, "Unterminated template literal");
		this.expect(types$1.dollarBraceL);
		node.expressions.push(this.parseExpression());
		this.expect(types$1.braceR);
		node.quasis.push(curElt = this.parseTemplateElement({ isTagged }));
	}
	this.next();
	return this.finishNode(node, "TemplateLiteral");
};
pp$5.isAsyncProp = function(prop) {
	return !prop.computed && prop.key.type === "Identifier" && prop.key.name === "async" && (this.type === types$1.name || this.type === types$1.num || this.type === types$1.string || this.type === types$1.bracketL || this.type.keyword || this.options.ecmaVersion >= 9 && this.type === types$1.star) && !lineBreak.test(this.input.slice(this.lastTokEnd, this.start));
};
pp$5.parseObj = function(isPattern, refDestructuringErrors) {
	var node = this.startNode(), first = true, propHash = {};
	node.properties = [];
	this.next();
	while (!this.eat(types$1.braceR)) {
		if (!first) {
			this.expect(types$1.comma);
			if (this.options.ecmaVersion >= 5 && this.afterTrailingComma(types$1.braceR)) break;
		} else first = false;
		var prop = this.parseProperty(isPattern, refDestructuringErrors);
		if (!isPattern) this.checkPropClash(prop, propHash, refDestructuringErrors);
		node.properties.push(prop);
	}
	return this.finishNode(node, isPattern ? "ObjectPattern" : "ObjectExpression");
};
pp$5.parseProperty = function(isPattern, refDestructuringErrors) {
	var prop = this.startNode(), isGenerator, isAsync, startPos, startLoc;
	if (this.options.ecmaVersion >= 9 && this.eat(types$1.ellipsis)) {
		if (isPattern) {
			prop.argument = this.parseIdent(false);
			if (this.type === types$1.comma) this.raiseRecoverable(this.start, "Comma is not permitted after the rest element");
			return this.finishNode(prop, "RestElement");
		}
		prop.argument = this.parseMaybeAssign(false, refDestructuringErrors);
		if (this.type === types$1.comma && refDestructuringErrors && refDestructuringErrors.trailingComma < 0) refDestructuringErrors.trailingComma = this.start;
		return this.finishNode(prop, "SpreadElement");
	}
	if (this.options.ecmaVersion >= 6) {
		prop.method = false;
		prop.shorthand = false;
		if (isPattern || refDestructuringErrors) {
			startPos = this.start;
			startLoc = this.startLoc;
		}
		if (!isPattern) isGenerator = this.eat(types$1.star);
	}
	var containsEsc = this.containsEsc;
	this.parsePropertyName(prop);
	if (!isPattern && !containsEsc && this.options.ecmaVersion >= 8 && !isGenerator && this.isAsyncProp(prop)) {
		isAsync = true;
		isGenerator = this.options.ecmaVersion >= 9 && this.eat(types$1.star);
		this.parsePropertyName(prop);
	} else isAsync = false;
	this.parsePropertyValue(prop, isPattern, isGenerator, isAsync, startPos, startLoc, refDestructuringErrors, containsEsc);
	return this.finishNode(prop, "Property");
};
pp$5.parseGetterSetter = function(prop) {
	var kind = prop.key.name;
	this.parsePropertyName(prop);
	prop.value = this.parseMethod(false);
	prop.kind = kind;
	var paramCount = prop.kind === "get" ? 0 : 1;
	if (prop.value.params.length !== paramCount) {
		var start = prop.value.start;
		if (prop.kind === "get") this.raiseRecoverable(start, "getter should have no params");
		else this.raiseRecoverable(start, "setter should have exactly one param");
	} else if (prop.kind === "set" && prop.value.params[0].type === "RestElement") this.raiseRecoverable(prop.value.params[0].start, "Setter cannot use rest params");
};
pp$5.parsePropertyValue = function(prop, isPattern, isGenerator, isAsync, startPos, startLoc, refDestructuringErrors, containsEsc) {
	if ((isGenerator || isAsync) && this.type === types$1.colon) this.unexpected();
	if (this.eat(types$1.colon)) {
		prop.value = isPattern ? this.parseMaybeDefault(this.start, this.startLoc) : this.parseMaybeAssign(false, refDestructuringErrors);
		prop.kind = "init";
	} else if (this.options.ecmaVersion >= 6 && this.type === types$1.parenL) {
		if (isPattern) this.unexpected();
		prop.method = true;
		prop.value = this.parseMethod(isGenerator, isAsync);
		prop.kind = "init";
	} else if (!isPattern && !containsEsc && this.options.ecmaVersion >= 5 && !prop.computed && prop.key.type === "Identifier" && (prop.key.name === "get" || prop.key.name === "set") && this.type !== types$1.comma && this.type !== types$1.braceR && this.type !== types$1.eq) {
		if (isGenerator || isAsync) this.unexpected();
		this.parseGetterSetter(prop);
	} else if (this.options.ecmaVersion >= 6 && !prop.computed && prop.key.type === "Identifier") {
		if (isGenerator || isAsync) this.unexpected();
		this.checkUnreserved(prop.key);
		if (prop.key.name === "await" && !this.awaitIdentPos) this.awaitIdentPos = startPos;
		if (isPattern) prop.value = this.parseMaybeDefault(startPos, startLoc, this.copyNode(prop.key));
		else if (this.type === types$1.eq && refDestructuringErrors) {
			if (refDestructuringErrors.shorthandAssign < 0) refDestructuringErrors.shorthandAssign = this.start;
			prop.value = this.parseMaybeDefault(startPos, startLoc, this.copyNode(prop.key));
		} else prop.value = this.copyNode(prop.key);
		prop.kind = "init";
		prop.shorthand = true;
	} else this.unexpected();
};
pp$5.parsePropertyName = function(prop) {
	if (this.options.ecmaVersion >= 6) if (this.eat(types$1.bracketL)) {
		prop.computed = true;
		prop.key = this.parseMaybeAssign();
		this.expect(types$1.bracketR);
		return prop.key;
	} else prop.computed = false;
	return prop.key = this.type === types$1.num || this.type === types$1.string ? this.parseExprAtom() : this.parseIdent(this.options.allowReserved !== "never");
};
pp$5.initFunction = function(node) {
	node.id = null;
	if (this.options.ecmaVersion >= 6) node.generator = node.expression = false;
	if (this.options.ecmaVersion >= 8) node.async = false;
};
pp$5.parseMethod = function(isGenerator, isAsync, allowDirectSuper) {
	var node = this.startNode(), oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
	this.initFunction(node);
	if (this.options.ecmaVersion >= 6) node.generator = isGenerator;
	if (this.options.ecmaVersion >= 8) node.async = !!isAsync;
	this.yieldPos = 0;
	this.awaitPos = 0;
	this.awaitIdentPos = 0;
	this.enterScope(functionFlags$1(isAsync, node.generator) | SCOPE_SUPER | (allowDirectSuper ? SCOPE_DIRECT_SUPER : 0));
	this.expect(types$1.parenL);
	node.params = this.parseBindingList(types$1.parenR, false, this.options.ecmaVersion >= 8);
	this.checkYieldAwaitInDefaultParams();
	this.parseFunctionBody(node, false, true, false);
	this.yieldPos = oldYieldPos;
	this.awaitPos = oldAwaitPos;
	this.awaitIdentPos = oldAwaitIdentPos;
	return this.finishNode(node, "FunctionExpression");
};
pp$5.parseArrowExpression = function(node, params, isAsync, forInit) {
	var oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
	this.enterScope(functionFlags$1(isAsync, false) | SCOPE_ARROW);
	this.initFunction(node);
	if (this.options.ecmaVersion >= 8) node.async = !!isAsync;
	this.yieldPos = 0;
	this.awaitPos = 0;
	this.awaitIdentPos = 0;
	node.params = this.toAssignableList(params, true);
	this.parseFunctionBody(node, true, false, forInit);
	this.yieldPos = oldYieldPos;
	this.awaitPos = oldAwaitPos;
	this.awaitIdentPos = oldAwaitIdentPos;
	return this.finishNode(node, "ArrowFunctionExpression");
};
pp$5.parseFunctionBody = function(node, isArrowFunction, isMethod, forInit) {
	var isExpression = isArrowFunction && this.type !== types$1.braceL;
	var oldStrict = this.strict, useStrict = false;
	if (isExpression) {
		node.body = this.parseMaybeAssign(forInit);
		node.expression = true;
		this.checkParams(node, false);
	} else {
		var nonSimple = this.options.ecmaVersion >= 7 && !this.isSimpleParamList(node.params);
		if (!oldStrict || nonSimple) {
			useStrict = this.strictDirective(this.end);
			if (useStrict && nonSimple) this.raiseRecoverable(node.start, "Illegal 'use strict' directive in function with non-simple parameter list");
		}
		var oldLabels = this.labels;
		this.labels = [];
		if (useStrict) this.strict = true;
		this.checkParams(node, !oldStrict && !useStrict && !isArrowFunction && !isMethod && this.isSimpleParamList(node.params));
		if (this.strict && node.id) this.checkLValSimple(node.id, BIND_OUTSIDE);
		node.body = this.parseBlock(false, void 0, useStrict && !oldStrict);
		node.expression = false;
		this.adaptDirectivePrologue(node.body.body);
		this.labels = oldLabels;
	}
	this.exitScope();
};
pp$5.isSimpleParamList = function(params) {
	for (var i = 0, list = params; i < list.length; i += 1) if (list[i].type !== "Identifier") return false;
	return true;
};
pp$5.checkParams = function(node, allowDuplicates) {
	var nameHash = Object.create(null);
	for (var i = 0, list = node.params; i < list.length; i += 1) {
		var param = list[i];
		this.checkLValInnerPattern(param, BIND_VAR, allowDuplicates ? null : nameHash);
	}
};
pp$5.parseExprList = function(close, allowTrailingComma, allowEmpty, refDestructuringErrors) {
	var elts = [], first = true;
	while (!this.eat(close)) {
		if (!first) {
			this.expect(types$1.comma);
			if (allowTrailingComma && this.afterTrailingComma(close)) break;
		} else first = false;
		var elt = void 0;
		if (allowEmpty && this.type === types$1.comma) elt = null;
		else if (this.type === types$1.ellipsis) {
			elt = this.parseSpread(refDestructuringErrors);
			if (refDestructuringErrors && this.type === types$1.comma && refDestructuringErrors.trailingComma < 0) refDestructuringErrors.trailingComma = this.start;
		} else elt = this.parseMaybeAssign(false, refDestructuringErrors);
		elts.push(elt);
	}
	return elts;
};
pp$5.checkUnreserved = function(ref) {
	var start = ref.start;
	var end = ref.end;
	var name = ref.name;
	if (this.inGenerator && name === "yield") this.raiseRecoverable(start, "Cannot use 'yield' as identifier inside a generator");
	if (this.inAsync && name === "await") this.raiseRecoverable(start, "Cannot use 'await' as identifier inside an async function");
	if (!(this.currentThisScope().flags & SCOPE_VAR) && name === "arguments") this.raiseRecoverable(start, "Cannot use 'arguments' in class field initializer");
	if (this.inClassStaticBlock && (name === "arguments" || name === "await")) this.raise(start, "Cannot use " + name + " in class static initialization block");
	if (this.keywords.test(name)) this.raise(start, "Unexpected keyword '" + name + "'");
	if (this.options.ecmaVersion < 6 && this.input.slice(start, end).indexOf("\\") !== -1) return;
	if ((this.strict ? this.reservedWordsStrict : this.reservedWords).test(name)) {
		if (!this.inAsync && name === "await") this.raiseRecoverable(start, "Cannot use keyword 'await' outside an async function");
		this.raiseRecoverable(start, "The keyword '" + name + "' is reserved");
	}
};
pp$5.parseIdent = function(liberal) {
	var node = this.parseIdentNode();
	this.next(!!liberal);
	this.finishNode(node, "Identifier");
	if (!liberal) {
		this.checkUnreserved(node);
		if (node.name === "await" && !this.awaitIdentPos) this.awaitIdentPos = node.start;
	}
	return node;
};
pp$5.parseIdentNode = function() {
	var node = this.startNode();
	if (this.type === types$1.name) node.name = this.value;
	else if (this.type.keyword) {
		node.name = this.type.keyword;
		if ((node.name === "class" || node.name === "function") && (this.lastTokEnd !== this.lastTokStart + 1 || this.input.charCodeAt(this.lastTokStart) !== 46)) this.context.pop();
		this.type = types$1.name;
	} else this.unexpected();
	return node;
};
pp$5.parsePrivateIdent = function() {
	var node = this.startNode();
	if (this.type === types$1.privateId) node.name = this.value;
	else this.unexpected();
	this.next();
	this.finishNode(node, "PrivateIdentifier");
	if (this.options.checkPrivateFields) if (this.privateNameStack.length === 0) this.raise(node.start, "Private field '#" + node.name + "' must be declared in an enclosing class");
	else this.privateNameStack[this.privateNameStack.length - 1].used.push(node);
	return node;
};
pp$5.parseYield = function(forInit) {
	if (!this.yieldPos) this.yieldPos = this.start;
	var node = this.startNode();
	this.next();
	if (this.type === types$1.semi || this.canInsertSemicolon() || this.type !== types$1.star && !this.type.startsExpr) {
		node.delegate = false;
		node.argument = null;
	} else {
		node.delegate = this.eat(types$1.star);
		node.argument = this.parseMaybeAssign(forInit);
	}
	return this.finishNode(node, "YieldExpression");
};
pp$5.parseAwait = function(forInit) {
	if (!this.awaitPos) this.awaitPos = this.start;
	var node = this.startNode();
	this.next();
	node.argument = this.parseMaybeUnary(null, true, false, forInit);
	return this.finishNode(node, "AwaitExpression");
};
var pp$4 = Parser$1.prototype;
pp$4.raise = function(pos, message) {
	var loc = getLineInfo(this.input, pos);
	message += " (" + loc.line + ":" + loc.column + ")";
	if (this.sourceFile) message += " in " + this.sourceFile;
	var err = new SyntaxError(message);
	err.pos = pos;
	err.loc = loc;
	err.raisedAt = this.pos;
	throw err;
};
pp$4.raiseRecoverable = pp$4.raise;
pp$4.curPosition = function() {
	if (this.options.locations) return new Position(this.curLine, this.pos - this.lineStart);
};
var pp$3 = Parser$1.prototype;
var Scope = function Scope(flags) {
	this.flags = flags;
	this.var = [];
	this.lexical = [];
	this.functions = [];
};
pp$3.enterScope = function(flags) {
	this.scopeStack.push(new Scope(flags));
};
pp$3.exitScope = function() {
	this.scopeStack.pop();
};
pp$3.treatFunctionsAsVarInScope = function(scope) {
	return scope.flags & SCOPE_FUNCTION || !this.inModule && scope.flags & SCOPE_TOP;
};
pp$3.declareName = function(name, bindingType, pos) {
	var redeclared = false;
	if (bindingType === BIND_LEXICAL) {
		var scope = this.currentScope();
		redeclared = scope.lexical.indexOf(name) > -1 || scope.functions.indexOf(name) > -1 || scope.var.indexOf(name) > -1;
		scope.lexical.push(name);
		if (this.inModule && scope.flags & SCOPE_TOP) delete this.undefinedExports[name];
	} else if (bindingType === BIND_SIMPLE_CATCH) this.currentScope().lexical.push(name);
	else if (bindingType === BIND_FUNCTION) {
		var scope$2 = this.currentScope();
		if (this.treatFunctionsAsVar) redeclared = scope$2.lexical.indexOf(name) > -1;
		else redeclared = scope$2.lexical.indexOf(name) > -1 || scope$2.var.indexOf(name) > -1;
		scope$2.functions.push(name);
	} else for (var i = this.scopeStack.length - 1; i >= 0; --i) {
		var scope$3 = this.scopeStack[i];
		if (scope$3.lexical.indexOf(name) > -1 && !(scope$3.flags & SCOPE_SIMPLE_CATCH && scope$3.lexical[0] === name) || !this.treatFunctionsAsVarInScope(scope$3) && scope$3.functions.indexOf(name) > -1) {
			redeclared = true;
			break;
		}
		scope$3.var.push(name);
		if (this.inModule && scope$3.flags & SCOPE_TOP) delete this.undefinedExports[name];
		if (scope$3.flags & SCOPE_VAR) break;
	}
	if (redeclared) this.raiseRecoverable(pos, "Identifier '" + name + "' has already been declared");
};
pp$3.checkLocalExport = function(id) {
	if (this.scopeStack[0].lexical.indexOf(id.name) === -1 && this.scopeStack[0].var.indexOf(id.name) === -1) this.undefinedExports[id.name] = id;
};
pp$3.currentScope = function() {
	return this.scopeStack[this.scopeStack.length - 1];
};
pp$3.currentVarScope = function() {
	for (var i = this.scopeStack.length - 1;; i--) {
		var scope = this.scopeStack[i];
		if (scope.flags & (SCOPE_VAR | SCOPE_CLASS_FIELD_INIT | SCOPE_CLASS_STATIC_BLOCK)) return scope;
	}
};
pp$3.currentThisScope = function() {
	for (var i = this.scopeStack.length - 1;; i--) {
		var scope = this.scopeStack[i];
		if (scope.flags & (SCOPE_VAR | SCOPE_CLASS_FIELD_INIT | SCOPE_CLASS_STATIC_BLOCK) && !(scope.flags & SCOPE_ARROW)) return scope;
	}
};
var Node = function Node(parser, pos, loc) {
	this.type = "";
	this.start = pos;
	this.end = 0;
	if (parser.options.locations) this.loc = new SourceLocation(parser, loc);
	if (parser.options.directSourceFile) this.sourceFile = parser.options.directSourceFile;
	if (parser.options.ranges) this.range = [pos, 0];
};
var pp$2 = Parser$1.prototype;
pp$2.startNode = function() {
	return new Node(this, this.start, this.startLoc);
};
pp$2.startNodeAt = function(pos, loc) {
	return new Node(this, pos, loc);
};
function finishNodeAt(node, type, pos, loc) {
	node.type = type;
	node.end = pos;
	if (this.options.locations) node.loc.end = loc;
	if (this.options.ranges) node.range[1] = pos;
	return node;
}
pp$2.finishNode = function(node, type) {
	return finishNodeAt.call(this, node, type, this.lastTokEnd, this.lastTokEndLoc);
};
pp$2.finishNodeAt = function(node, type, pos, loc) {
	return finishNodeAt.call(this, node, type, pos, loc);
};
pp$2.copyNode = function(node) {
	var newNode = new Node(this, node.start, this.startLoc);
	for (var prop in node) newNode[prop] = node[prop];
	return newNode;
};
var scriptValuesAddedInUnicode = "Berf Beria_Erfe Gara Garay Gukh Gurung_Khema Hrkt Katakana_Or_Hiragana Kawi Kirat_Rai Krai Nag_Mundari Nagm Ol_Onal Onao Sidetic Sidt Sunu Sunuwar Tai_Yo Tayo Todhri Todr Tolong_Siki Tols Tulu_Tigalari Tutg Unknown Zzzz";
var ecma9BinaryProperties = "ASCII ASCII_Hex_Digit AHex Alphabetic Alpha Any Assigned Bidi_Control Bidi_C Bidi_Mirrored Bidi_M Case_Ignorable CI Cased Changes_When_Casefolded CWCF Changes_When_Casemapped CWCM Changes_When_Lowercased CWL Changes_When_NFKC_Casefolded CWKCF Changes_When_Titlecased CWT Changes_When_Uppercased CWU Dash Default_Ignorable_Code_Point DI Deprecated Dep Diacritic Dia Emoji Emoji_Component Emoji_Modifier Emoji_Modifier_Base Emoji_Presentation Extender Ext Grapheme_Base Gr_Base Grapheme_Extend Gr_Ext Hex_Digit Hex IDS_Binary_Operator IDSB IDS_Trinary_Operator IDST ID_Continue IDC ID_Start IDS Ideographic Ideo Join_Control Join_C Logical_Order_Exception LOE Lowercase Lower Math Noncharacter_Code_Point NChar Pattern_Syntax Pat_Syn Pattern_White_Space Pat_WS Quotation_Mark QMark Radical Regional_Indicator RI Sentence_Terminal STerm Soft_Dotted SD Terminal_Punctuation Term Unified_Ideograph UIdeo Uppercase Upper Variation_Selector VS White_Space space XID_Continue XIDC XID_Start XIDS";
var ecma10BinaryProperties = ecma9BinaryProperties + " Extended_Pictographic";
var ecma11BinaryProperties = ecma10BinaryProperties;
var ecma12BinaryProperties = ecma11BinaryProperties + " EBase EComp EMod EPres ExtPict";
var ecma13BinaryProperties = ecma12BinaryProperties;
var unicodeBinaryProperties = {
	9: ecma9BinaryProperties,
	10: ecma10BinaryProperties,
	11: ecma11BinaryProperties,
	12: ecma12BinaryProperties,
	13: ecma13BinaryProperties,
	14: ecma13BinaryProperties
};
var unicodeBinaryPropertiesOfStrings = {
	9: "",
	10: "",
	11: "",
	12: "",
	13: "",
	14: "Basic_Emoji Emoji_Keycap_Sequence RGI_Emoji_Modifier_Sequence RGI_Emoji_Flag_Sequence RGI_Emoji_Tag_Sequence RGI_Emoji_ZWJ_Sequence RGI_Emoji"
};
var unicodeGeneralCategoryValues = "Cased_Letter LC Close_Punctuation Pe Connector_Punctuation Pc Control Cc cntrl Currency_Symbol Sc Dash_Punctuation Pd Decimal_Number Nd digit Enclosing_Mark Me Final_Punctuation Pf Format Cf Initial_Punctuation Pi Letter L Letter_Number Nl Line_Separator Zl Lowercase_Letter Ll Mark M Combining_Mark Math_Symbol Sm Modifier_Letter Lm Modifier_Symbol Sk Nonspacing_Mark Mn Number N Open_Punctuation Ps Other C Other_Letter Lo Other_Number No Other_Punctuation Po Other_Symbol So Paragraph_Separator Zp Private_Use Co Punctuation P punct Separator Z Space_Separator Zs Spacing_Mark Mc Surrogate Cs Symbol S Titlecase_Letter Lt Unassigned Cn Uppercase_Letter Lu";
var ecma9ScriptValues = "Adlam Adlm Ahom Anatolian_Hieroglyphs Hluw Arabic Arab Armenian Armn Avestan Avst Balinese Bali Bamum Bamu Bassa_Vah Bass Batak Batk Bengali Beng Bhaiksuki Bhks Bopomofo Bopo Brahmi Brah Braille Brai Buginese Bugi Buhid Buhd Canadian_Aboriginal Cans Carian Cari Caucasian_Albanian Aghb Chakma Cakm Cham Cham Cherokee Cher Common Zyyy Coptic Copt Qaac Cuneiform Xsux Cypriot Cprt Cyrillic Cyrl Deseret Dsrt Devanagari Deva Duployan Dupl Egyptian_Hieroglyphs Egyp Elbasan Elba Ethiopic Ethi Georgian Geor Glagolitic Glag Gothic Goth Grantha Gran Greek Grek Gujarati Gujr Gurmukhi Guru Han Hani Hangul Hang Hanunoo Hano Hatran Hatr Hebrew Hebr Hiragana Hira Imperial_Aramaic Armi Inherited Zinh Qaai Inscriptional_Pahlavi Phli Inscriptional_Parthian Prti Javanese Java Kaithi Kthi Kannada Knda Katakana Kana Kayah_Li Kali Kharoshthi Khar Khmer Khmr Khojki Khoj Khudawadi Sind Lao Laoo Latin Latn Lepcha Lepc Limbu Limb Linear_A Lina Linear_B Linb Lisu Lisu Lycian Lyci Lydian Lydi Mahajani Mahj Malayalam Mlym Mandaic Mand Manichaean Mani Marchen Marc Masaram_Gondi Gonm Meetei_Mayek Mtei Mende_Kikakui Mend Meroitic_Cursive Merc Meroitic_Hieroglyphs Mero Miao Plrd Modi Mongolian Mong Mro Mroo Multani Mult Myanmar Mymr Nabataean Nbat New_Tai_Lue Talu Newa Newa Nko Nkoo Nushu Nshu Ogham Ogam Ol_Chiki Olck Old_Hungarian Hung Old_Italic Ital Old_North_Arabian Narb Old_Permic Perm Old_Persian Xpeo Old_South_Arabian Sarb Old_Turkic Orkh Oriya Orya Osage Osge Osmanya Osma Pahawh_Hmong Hmng Palmyrene Palm Pau_Cin_Hau Pauc Phags_Pa Phag Phoenician Phnx Psalter_Pahlavi Phlp Rejang Rjng Runic Runr Samaritan Samr Saurashtra Saur Sharada Shrd Shavian Shaw Siddham Sidd SignWriting Sgnw Sinhala Sinh Sora_Sompeng Sora Soyombo Soyo Sundanese Sund Syloti_Nagri Sylo Syriac Syrc Tagalog Tglg Tagbanwa Tagb Tai_Le Tale Tai_Tham Lana Tai_Viet Tavt Takri Takr Tamil Taml Tangut Tang Telugu Telu Thaana Thaa Thai Thai Tibetan Tibt Tifinagh Tfng Tirhuta Tirh Ugaritic Ugar Vai Vaii Warang_Citi Wara Yi Yiii Zanabazar_Square Zanb";
var ecma10ScriptValues = ecma9ScriptValues + " Dogra Dogr Gunjala_Gondi Gong Hanifi_Rohingya Rohg Makasar Maka Medefaidrin Medf Old_Sogdian Sogo Sogdian Sogd";
var ecma11ScriptValues = ecma10ScriptValues + " Elymaic Elym Nandinagari Nand Nyiakeng_Puachue_Hmong Hmnp Wancho Wcho";
var ecma12ScriptValues = ecma11ScriptValues + " Chorasmian Chrs Diak Dives_Akuru Khitan_Small_Script Kits Yezi Yezidi";
var ecma13ScriptValues = ecma12ScriptValues + " Cypro_Minoan Cpmn Old_Uyghur Ougr Tangsa Tnsa Toto Vithkuqi Vith";
var unicodeScriptValues = {
	9: ecma9ScriptValues,
	10: ecma10ScriptValues,
	11: ecma11ScriptValues,
	12: ecma12ScriptValues,
	13: ecma13ScriptValues,
	14: ecma13ScriptValues + " " + scriptValuesAddedInUnicode
};
var data = {};
function buildUnicodeData(ecmaVersion) {
	var d = data[ecmaVersion] = {
		binary: wordsRegexp(unicodeBinaryProperties[ecmaVersion] + " " + unicodeGeneralCategoryValues),
		binaryOfStrings: wordsRegexp(unicodeBinaryPropertiesOfStrings[ecmaVersion]),
		nonBinary: {
			General_Category: wordsRegexp(unicodeGeneralCategoryValues),
			Script: wordsRegexp(unicodeScriptValues[ecmaVersion])
		}
	};
	d.nonBinary.Script_Extensions = d.nonBinary.Script;
	d.nonBinary.gc = d.nonBinary.General_Category;
	d.nonBinary.sc = d.nonBinary.Script;
	d.nonBinary.scx = d.nonBinary.Script_Extensions;
}
for (var i = 0, list = [
	9,
	10,
	11,
	12,
	13,
	14
]; i < list.length; i += 1) {
	var ecmaVersion = list[i];
	buildUnicodeData(ecmaVersion);
}
var pp$1 = Parser$1.prototype;
var BranchID = function BranchID(parent, base) {
	this.parent = parent;
	this.base = base || this;
};
BranchID.prototype.separatedFrom = function separatedFrom(alt) {
	for (var self = this; self; self = self.parent) for (var other = alt; other; other = other.parent) if (self.base === other.base && self !== other) return true;
	return false;
};
BranchID.prototype.sibling = function sibling() {
	return new BranchID(this.parent, this.base);
};
var RegExpValidationState = function RegExpValidationState(parser) {
	this.parser = parser;
	this.validFlags = "gim" + (parser.options.ecmaVersion >= 6 ? "uy" : "") + (parser.options.ecmaVersion >= 9 ? "s" : "") + (parser.options.ecmaVersion >= 13 ? "d" : "") + (parser.options.ecmaVersion >= 15 ? "v" : "");
	this.unicodeProperties = data[parser.options.ecmaVersion >= 14 ? 14 : parser.options.ecmaVersion];
	this.source = "";
	this.flags = "";
	this.start = 0;
	this.switchU = false;
	this.switchV = false;
	this.switchN = false;
	this.pos = 0;
	this.lastIntValue = 0;
	this.lastStringValue = "";
	this.lastAssertionIsQuantifiable = false;
	this.numCapturingParens = 0;
	this.maxBackReference = 0;
	this.groupNames = Object.create(null);
	this.backReferenceNames = [];
	this.branchID = null;
};
RegExpValidationState.prototype.reset = function reset(start, pattern, flags) {
	var unicodeSets = flags.indexOf("v") !== -1;
	var unicode = flags.indexOf("u") !== -1;
	this.start = start | 0;
	this.source = pattern + "";
	this.flags = flags;
	if (unicodeSets && this.parser.options.ecmaVersion >= 15) {
		this.switchU = true;
		this.switchV = true;
		this.switchN = true;
	} else {
		this.switchU = unicode && this.parser.options.ecmaVersion >= 6;
		this.switchV = false;
		this.switchN = unicode && this.parser.options.ecmaVersion >= 9;
	}
};
RegExpValidationState.prototype.raise = function raise(message) {
	this.parser.raiseRecoverable(this.start, "Invalid regular expression: /" + this.source + "/: " + message);
};
RegExpValidationState.prototype.at = function at(i, forceU) {
	if (forceU === void 0) forceU = false;
	var s = this.source;
	var l = s.length;
	if (i >= l) return -1;
	var c = s.charCodeAt(i);
	if (!(forceU || this.switchU) || c <= 55295 || c >= 57344 || i + 1 >= l) return c;
	var next = s.charCodeAt(i + 1);
	return next >= 56320 && next <= 57343 ? (c << 10) + next - 56613888 : c;
};
RegExpValidationState.prototype.nextIndex = function nextIndex(i, forceU) {
	if (forceU === void 0) forceU = false;
	var s = this.source;
	var l = s.length;
	if (i >= l) return l;
	var c = s.charCodeAt(i), next;
	if (!(forceU || this.switchU) || c <= 55295 || c >= 57344 || i + 1 >= l || (next = s.charCodeAt(i + 1)) < 56320 || next > 57343) return i + 1;
	return i + 2;
};
RegExpValidationState.prototype.current = function current(forceU) {
	if (forceU === void 0) forceU = false;
	return this.at(this.pos, forceU);
};
RegExpValidationState.prototype.lookahead = function lookahead(forceU) {
	if (forceU === void 0) forceU = false;
	return this.at(this.nextIndex(this.pos, forceU), forceU);
};
RegExpValidationState.prototype.advance = function advance(forceU) {
	if (forceU === void 0) forceU = false;
	this.pos = this.nextIndex(this.pos, forceU);
};
RegExpValidationState.prototype.eat = function eat(ch, forceU) {
	if (forceU === void 0) forceU = false;
	if (this.current(forceU) === ch) {
		this.advance(forceU);
		return true;
	}
	return false;
};
RegExpValidationState.prototype.eatChars = function eatChars(chs, forceU) {
	if (forceU === void 0) forceU = false;
	var pos = this.pos;
	for (var i = 0, list = chs; i < list.length; i += 1) {
		var ch = list[i];
		var current = this.at(pos, forceU);
		if (current === -1 || current !== ch) return false;
		pos = this.nextIndex(pos, forceU);
	}
	this.pos = pos;
	return true;
};
/**
* Validate the flags part of a given RegExpLiteral.
*
* @param {RegExpValidationState} state The state to validate RegExp.
* @returns {void}
*/
pp$1.validateRegExpFlags = function(state) {
	var validFlags = state.validFlags;
	var flags = state.flags;
	var u = false;
	var v = false;
	for (var i = 0; i < flags.length; i++) {
		var flag = flags.charAt(i);
		if (validFlags.indexOf(flag) === -1) this.raise(state.start, "Invalid regular expression flag");
		if (flags.indexOf(flag, i + 1) > -1) this.raise(state.start, "Duplicate regular expression flag");
		if (flag === "u") u = true;
		if (flag === "v") v = true;
	}
	if (this.options.ecmaVersion >= 15 && u && v) this.raise(state.start, "Invalid regular expression flag");
};
function hasProp(obj) {
	for (var _ in obj) return true;
	return false;
}
/**
* Validate the pattern part of a given RegExpLiteral.
*
* @param {RegExpValidationState} state The state to validate RegExp.
* @returns {void}
*/
pp$1.validateRegExpPattern = function(state) {
	this.regexp_pattern(state);
	if (!state.switchN && this.options.ecmaVersion >= 9 && hasProp(state.groupNames)) {
		state.switchN = true;
		this.regexp_pattern(state);
	}
};
pp$1.regexp_pattern = function(state) {
	state.pos = 0;
	state.lastIntValue = 0;
	state.lastStringValue = "";
	state.lastAssertionIsQuantifiable = false;
	state.numCapturingParens = 0;
	state.maxBackReference = 0;
	state.groupNames = Object.create(null);
	state.backReferenceNames.length = 0;
	state.branchID = null;
	this.regexp_disjunction(state);
	if (state.pos !== state.source.length) {
		if (state.eat(41)) state.raise("Unmatched ')'");
		if (state.eat(93) || state.eat(125)) state.raise("Lone quantifier brackets");
	}
	if (state.maxBackReference > state.numCapturingParens) state.raise("Invalid escape");
	for (var i = 0, list = state.backReferenceNames; i < list.length; i += 1) {
		var name = list[i];
		if (!state.groupNames[name]) state.raise("Invalid named capture referenced");
	}
};
pp$1.regexp_disjunction = function(state) {
	var trackDisjunction = this.options.ecmaVersion >= 16;
	if (trackDisjunction) state.branchID = new BranchID(state.branchID, null);
	this.regexp_alternative(state);
	while (state.eat(124)) {
		if (trackDisjunction) state.branchID = state.branchID.sibling();
		this.regexp_alternative(state);
	}
	if (trackDisjunction) state.branchID = state.branchID.parent;
	if (this.regexp_eatQuantifier(state, true)) state.raise("Nothing to repeat");
	if (state.eat(123)) state.raise("Lone quantifier brackets");
};
pp$1.regexp_alternative = function(state) {
	while (state.pos < state.source.length && this.regexp_eatTerm(state));
};
pp$1.regexp_eatTerm = function(state) {
	if (this.regexp_eatAssertion(state)) {
		if (state.lastAssertionIsQuantifiable && this.regexp_eatQuantifier(state)) {
			if (state.switchU) state.raise("Invalid quantifier");
		}
		return true;
	}
	if (state.switchU ? this.regexp_eatAtom(state) : this.regexp_eatExtendedAtom(state)) {
		this.regexp_eatQuantifier(state);
		return true;
	}
	return false;
};
pp$1.regexp_eatAssertion = function(state) {
	var start = state.pos;
	state.lastAssertionIsQuantifiable = false;
	if (state.eat(94) || state.eat(36)) return true;
	if (state.eat(92)) {
		if (state.eat(66) || state.eat(98)) return true;
		state.pos = start;
	}
	if (state.eat(40) && state.eat(63)) {
		var lookbehind = false;
		if (this.options.ecmaVersion >= 9) lookbehind = state.eat(60);
		if (state.eat(61) || state.eat(33)) {
			this.regexp_disjunction(state);
			if (!state.eat(41)) state.raise("Unterminated group");
			state.lastAssertionIsQuantifiable = !lookbehind;
			return true;
		}
	}
	state.pos = start;
	return false;
};
pp$1.regexp_eatQuantifier = function(state, noError) {
	if (noError === void 0) noError = false;
	if (this.regexp_eatQuantifierPrefix(state, noError)) {
		state.eat(63);
		return true;
	}
	return false;
};
pp$1.regexp_eatQuantifierPrefix = function(state, noError) {
	return state.eat(42) || state.eat(43) || state.eat(63) || this.regexp_eatBracedQuantifier(state, noError);
};
pp$1.regexp_eatBracedQuantifier = function(state, noError) {
	var start = state.pos;
	if (state.eat(123)) {
		var min = 0, max = -1;
		if (this.regexp_eatDecimalDigits(state)) {
			min = state.lastIntValue;
			if (state.eat(44) && this.regexp_eatDecimalDigits(state)) max = state.lastIntValue;
			if (state.eat(125)) {
				if (max !== -1 && max < min && !noError) state.raise("numbers out of order in {} quantifier");
				return true;
			}
		}
		if (state.switchU && !noError) state.raise("Incomplete quantifier");
		state.pos = start;
	}
	return false;
};
pp$1.regexp_eatAtom = function(state) {
	return this.regexp_eatPatternCharacters(state) || state.eat(46) || this.regexp_eatReverseSolidusAtomEscape(state) || this.regexp_eatCharacterClass(state) || this.regexp_eatUncapturingGroup(state) || this.regexp_eatCapturingGroup(state);
};
pp$1.regexp_eatReverseSolidusAtomEscape = function(state) {
	var start = state.pos;
	if (state.eat(92)) {
		if (this.regexp_eatAtomEscape(state)) return true;
		state.pos = start;
	}
	return false;
};
pp$1.regexp_eatUncapturingGroup = function(state) {
	var start = state.pos;
	if (state.eat(40)) {
		if (state.eat(63)) {
			if (this.options.ecmaVersion >= 16) {
				var addModifiers = this.regexp_eatModifiers(state);
				var hasHyphen = state.eat(45);
				if (addModifiers || hasHyphen) {
					for (var i = 0; i < addModifiers.length; i++) {
						var modifier = addModifiers.charAt(i);
						if (addModifiers.indexOf(modifier, i + 1) > -1) state.raise("Duplicate regular expression modifiers");
					}
					if (hasHyphen) {
						var removeModifiers = this.regexp_eatModifiers(state);
						if (!addModifiers && !removeModifiers && state.current() === 58) state.raise("Invalid regular expression modifiers");
						for (var i$1 = 0; i$1 < removeModifiers.length; i$1++) {
							var modifier$1 = removeModifiers.charAt(i$1);
							if (removeModifiers.indexOf(modifier$1, i$1 + 1) > -1 || addModifiers.indexOf(modifier$1) > -1) state.raise("Duplicate regular expression modifiers");
						}
					}
				}
			}
			if (state.eat(58)) {
				this.regexp_disjunction(state);
				if (state.eat(41)) return true;
				state.raise("Unterminated group");
			}
		}
		state.pos = start;
	}
	return false;
};
pp$1.regexp_eatCapturingGroup = function(state) {
	if (state.eat(40)) {
		if (this.options.ecmaVersion >= 9) this.regexp_groupSpecifier(state);
		else if (state.current() === 63) state.raise("Invalid group");
		this.regexp_disjunction(state);
		if (state.eat(41)) {
			state.numCapturingParens += 1;
			return true;
		}
		state.raise("Unterminated group");
	}
	return false;
};
pp$1.regexp_eatModifiers = function(state) {
	var modifiers = "";
	var ch = 0;
	while ((ch = state.current()) !== -1 && isRegularExpressionModifier(ch)) {
		modifiers += codePointToString(ch);
		state.advance();
	}
	return modifiers;
};
function isRegularExpressionModifier(ch) {
	return ch === 105 || ch === 109 || ch === 115;
}
pp$1.regexp_eatExtendedAtom = function(state) {
	return state.eat(46) || this.regexp_eatReverseSolidusAtomEscape(state) || this.regexp_eatCharacterClass(state) || this.regexp_eatUncapturingGroup(state) || this.regexp_eatCapturingGroup(state) || this.regexp_eatInvalidBracedQuantifier(state) || this.regexp_eatExtendedPatternCharacter(state);
};
pp$1.regexp_eatInvalidBracedQuantifier = function(state) {
	if (this.regexp_eatBracedQuantifier(state, true)) state.raise("Nothing to repeat");
	return false;
};
pp$1.regexp_eatSyntaxCharacter = function(state) {
	var ch = state.current();
	if (isSyntaxCharacter(ch)) {
		state.lastIntValue = ch;
		state.advance();
		return true;
	}
	return false;
};
function isSyntaxCharacter(ch) {
	return ch === 36 || ch >= 40 && ch <= 43 || ch === 46 || ch === 63 || ch >= 91 && ch <= 94 || ch >= 123 && ch <= 125;
}
pp$1.regexp_eatPatternCharacters = function(state) {
	var start = state.pos;
	var ch = 0;
	while ((ch = state.current()) !== -1 && !isSyntaxCharacter(ch)) state.advance();
	return state.pos !== start;
};
pp$1.regexp_eatExtendedPatternCharacter = function(state) {
	var ch = state.current();
	if (ch !== -1 && ch !== 36 && !(ch >= 40 && ch <= 43) && ch !== 46 && ch !== 63 && ch !== 91 && ch !== 94 && ch !== 124) {
		state.advance();
		return true;
	}
	return false;
};
pp$1.regexp_groupSpecifier = function(state) {
	if (state.eat(63)) {
		if (!this.regexp_eatGroupName(state)) state.raise("Invalid group");
		var trackDisjunction = this.options.ecmaVersion >= 16;
		var known = state.groupNames[state.lastStringValue];
		if (known) if (trackDisjunction) {
			for (var i = 0, list = known; i < list.length; i += 1) if (!list[i].separatedFrom(state.branchID)) state.raise("Duplicate capture group name");
		} else state.raise("Duplicate capture group name");
		if (trackDisjunction) (known || (state.groupNames[state.lastStringValue] = [])).push(state.branchID);
		else state.groupNames[state.lastStringValue] = true;
	}
};
pp$1.regexp_eatGroupName = function(state) {
	state.lastStringValue = "";
	if (state.eat(60)) {
		if (this.regexp_eatRegExpIdentifierName(state) && state.eat(62)) return true;
		state.raise("Invalid capture group name");
	}
	return false;
};
pp$1.regexp_eatRegExpIdentifierName = function(state) {
	state.lastStringValue = "";
	if (this.regexp_eatRegExpIdentifierStart(state)) {
		state.lastStringValue += codePointToString(state.lastIntValue);
		while (this.regexp_eatRegExpIdentifierPart(state)) state.lastStringValue += codePointToString(state.lastIntValue);
		return true;
	}
	return false;
};
pp$1.regexp_eatRegExpIdentifierStart = function(state) {
	var start = state.pos;
	var forceU = this.options.ecmaVersion >= 11;
	var ch = state.current(forceU);
	state.advance(forceU);
	if (ch === 92 && this.regexp_eatRegExpUnicodeEscapeSequence(state, forceU)) ch = state.lastIntValue;
	if (isRegExpIdentifierStart(ch)) {
		state.lastIntValue = ch;
		return true;
	}
	state.pos = start;
	return false;
};
function isRegExpIdentifierStart(ch) {
	return isIdentifierStart(ch, true) || ch === 36 || ch === 95;
}
pp$1.regexp_eatRegExpIdentifierPart = function(state) {
	var start = state.pos;
	var forceU = this.options.ecmaVersion >= 11;
	var ch = state.current(forceU);
	state.advance(forceU);
	if (ch === 92 && this.regexp_eatRegExpUnicodeEscapeSequence(state, forceU)) ch = state.lastIntValue;
	if (isRegExpIdentifierPart(ch)) {
		state.lastIntValue = ch;
		return true;
	}
	state.pos = start;
	return false;
};
function isRegExpIdentifierPart(ch) {
	return isIdentifierChar(ch, true) || ch === 36 || ch === 95 || ch === 8204 || ch === 8205;
}
pp$1.regexp_eatAtomEscape = function(state) {
	if (this.regexp_eatBackReference(state) || this.regexp_eatCharacterClassEscape(state) || this.regexp_eatCharacterEscape(state) || state.switchN && this.regexp_eatKGroupName(state)) return true;
	if (state.switchU) {
		if (state.current() === 99) state.raise("Invalid unicode escape");
		state.raise("Invalid escape");
	}
	return false;
};
pp$1.regexp_eatBackReference = function(state) {
	var start = state.pos;
	if (this.regexp_eatDecimalEscape(state)) {
		var n = state.lastIntValue;
		if (state.switchU) {
			if (n > state.maxBackReference) state.maxBackReference = n;
			return true;
		}
		if (n <= state.numCapturingParens) return true;
		state.pos = start;
	}
	return false;
};
pp$1.regexp_eatKGroupName = function(state) {
	if (state.eat(107)) {
		if (this.regexp_eatGroupName(state)) {
			state.backReferenceNames.push(state.lastStringValue);
			return true;
		}
		state.raise("Invalid named reference");
	}
	return false;
};
pp$1.regexp_eatCharacterEscape = function(state) {
	return this.regexp_eatControlEscape(state) || this.regexp_eatCControlLetter(state) || this.regexp_eatZero(state) || this.regexp_eatHexEscapeSequence(state) || this.regexp_eatRegExpUnicodeEscapeSequence(state, false) || !state.switchU && this.regexp_eatLegacyOctalEscapeSequence(state) || this.regexp_eatIdentityEscape(state);
};
pp$1.regexp_eatCControlLetter = function(state) {
	var start = state.pos;
	if (state.eat(99)) {
		if (this.regexp_eatControlLetter(state)) return true;
		state.pos = start;
	}
	return false;
};
pp$1.regexp_eatZero = function(state) {
	if (state.current() === 48 && !isDecimalDigit(state.lookahead())) {
		state.lastIntValue = 0;
		state.advance();
		return true;
	}
	return false;
};
pp$1.regexp_eatControlEscape = function(state) {
	var ch = state.current();
	if (ch === 116) {
		state.lastIntValue = 9;
		state.advance();
		return true;
	}
	if (ch === 110) {
		state.lastIntValue = 10;
		state.advance();
		return true;
	}
	if (ch === 118) {
		state.lastIntValue = 11;
		state.advance();
		return true;
	}
	if (ch === 102) {
		state.lastIntValue = 12;
		state.advance();
		return true;
	}
	if (ch === 114) {
		state.lastIntValue = 13;
		state.advance();
		return true;
	}
	return false;
};
pp$1.regexp_eatControlLetter = function(state) {
	var ch = state.current();
	if (isControlLetter(ch)) {
		state.lastIntValue = ch % 32;
		state.advance();
		return true;
	}
	return false;
};
function isControlLetter(ch) {
	return ch >= 65 && ch <= 90 || ch >= 97 && ch <= 122;
}
pp$1.regexp_eatRegExpUnicodeEscapeSequence = function(state, forceU) {
	if (forceU === void 0) forceU = false;
	var start = state.pos;
	var switchU = forceU || state.switchU;
	if (state.eat(117)) {
		if (this.regexp_eatFixedHexDigits(state, 4)) {
			var lead = state.lastIntValue;
			if (switchU && lead >= 55296 && lead <= 56319) {
				var leadSurrogateEnd = state.pos;
				if (state.eat(92) && state.eat(117) && this.regexp_eatFixedHexDigits(state, 4)) {
					var trail = state.lastIntValue;
					if (trail >= 56320 && trail <= 57343) {
						state.lastIntValue = (lead - 55296) * 1024 + (trail - 56320) + 65536;
						return true;
					}
				}
				state.pos = leadSurrogateEnd;
				state.lastIntValue = lead;
			}
			return true;
		}
		if (switchU && state.eat(123) && this.regexp_eatHexDigits(state) && state.eat(125) && isValidUnicode(state.lastIntValue)) return true;
		if (switchU) state.raise("Invalid unicode escape");
		state.pos = start;
	}
	return false;
};
function isValidUnicode(ch) {
	return ch >= 0 && ch <= 1114111;
}
pp$1.regexp_eatIdentityEscape = function(state) {
	if (state.switchU) {
		if (this.regexp_eatSyntaxCharacter(state)) return true;
		if (state.eat(47)) {
			state.lastIntValue = 47;
			return true;
		}
		return false;
	}
	var ch = state.current();
	if (ch !== 99 && (!state.switchN || ch !== 107)) {
		state.lastIntValue = ch;
		state.advance();
		return true;
	}
	return false;
};
pp$1.regexp_eatDecimalEscape = function(state) {
	state.lastIntValue = 0;
	var ch = state.current();
	if (ch >= 49 && ch <= 57) {
		do {
			state.lastIntValue = 10 * state.lastIntValue + (ch - 48);
			state.advance();
		} while ((ch = state.current()) >= 48 && ch <= 57);
		return true;
	}
	return false;
};
var CharSetNone = 0;
var CharSetOk = 1;
var CharSetString = 2;
pp$1.regexp_eatCharacterClassEscape = function(state) {
	var ch = state.current();
	if (isCharacterClassEscape(ch)) {
		state.lastIntValue = -1;
		state.advance();
		return CharSetOk;
	}
	var negate = false;
	if (state.switchU && this.options.ecmaVersion >= 9 && ((negate = ch === 80) || ch === 112)) {
		state.lastIntValue = -1;
		state.advance();
		var result;
		if (state.eat(123) && (result = this.regexp_eatUnicodePropertyValueExpression(state)) && state.eat(125)) {
			if (negate && result === CharSetString) state.raise("Invalid property name");
			return result;
		}
		state.raise("Invalid property name");
	}
	return CharSetNone;
};
function isCharacterClassEscape(ch) {
	return ch === 100 || ch === 68 || ch === 115 || ch === 83 || ch === 119 || ch === 87;
}
pp$1.regexp_eatUnicodePropertyValueExpression = function(state) {
	var start = state.pos;
	if (this.regexp_eatUnicodePropertyName(state) && state.eat(61)) {
		var name = state.lastStringValue;
		if (this.regexp_eatUnicodePropertyValue(state)) {
			var value = state.lastStringValue;
			this.regexp_validateUnicodePropertyNameAndValue(state, name, value);
			return CharSetOk;
		}
	}
	state.pos = start;
	if (this.regexp_eatLoneUnicodePropertyNameOrValue(state)) {
		var nameOrValue = state.lastStringValue;
		return this.regexp_validateUnicodePropertyNameOrValue(state, nameOrValue);
	}
	return CharSetNone;
};
pp$1.regexp_validateUnicodePropertyNameAndValue = function(state, name, value) {
	if (!hasOwn(state.unicodeProperties.nonBinary, name)) state.raise("Invalid property name");
	if (!state.unicodeProperties.nonBinary[name].test(value)) state.raise("Invalid property value");
};
pp$1.regexp_validateUnicodePropertyNameOrValue = function(state, nameOrValue) {
	if (state.unicodeProperties.binary.test(nameOrValue)) return CharSetOk;
	if (state.switchV && state.unicodeProperties.binaryOfStrings.test(nameOrValue)) return CharSetString;
	state.raise("Invalid property name");
};
pp$1.regexp_eatUnicodePropertyName = function(state) {
	var ch = 0;
	state.lastStringValue = "";
	while (isUnicodePropertyNameCharacter(ch = state.current())) {
		state.lastStringValue += codePointToString(ch);
		state.advance();
	}
	return state.lastStringValue !== "";
};
function isUnicodePropertyNameCharacter(ch) {
	return isControlLetter(ch) || ch === 95;
}
pp$1.regexp_eatUnicodePropertyValue = function(state) {
	var ch = 0;
	state.lastStringValue = "";
	while (isUnicodePropertyValueCharacter(ch = state.current())) {
		state.lastStringValue += codePointToString(ch);
		state.advance();
	}
	return state.lastStringValue !== "";
};
function isUnicodePropertyValueCharacter(ch) {
	return isUnicodePropertyNameCharacter(ch) || isDecimalDigit(ch);
}
pp$1.regexp_eatLoneUnicodePropertyNameOrValue = function(state) {
	return this.regexp_eatUnicodePropertyValue(state);
};
pp$1.regexp_eatCharacterClass = function(state) {
	if (state.eat(91)) {
		var negate = state.eat(94);
		var result = this.regexp_classContents(state);
		if (!state.eat(93)) state.raise("Unterminated character class");
		if (negate && result === CharSetString) state.raise("Negated character class may contain strings");
		return true;
	}
	return false;
};
pp$1.regexp_classContents = function(state) {
	if (state.current() === 93) return CharSetOk;
	if (state.switchV) return this.regexp_classSetExpression(state);
	this.regexp_nonEmptyClassRanges(state);
	return CharSetOk;
};
pp$1.regexp_nonEmptyClassRanges = function(state) {
	while (this.regexp_eatClassAtom(state)) {
		var left = state.lastIntValue;
		if (state.eat(45) && this.regexp_eatClassAtom(state)) {
			var right = state.lastIntValue;
			if (state.switchU && (left === -1 || right === -1)) state.raise("Invalid character class");
			if (left !== -1 && right !== -1 && left > right) state.raise("Range out of order in character class");
		}
	}
};
pp$1.regexp_eatClassAtom = function(state) {
	var start = state.pos;
	if (state.eat(92)) {
		if (this.regexp_eatClassEscape(state)) return true;
		if (state.switchU) {
			var ch$1 = state.current();
			if (ch$1 === 99 || isOctalDigit(ch$1)) state.raise("Invalid class escape");
			state.raise("Invalid escape");
		}
		state.pos = start;
	}
	var ch = state.current();
	if (ch !== 93) {
		state.lastIntValue = ch;
		state.advance();
		return true;
	}
	return false;
};
pp$1.regexp_eatClassEscape = function(state) {
	var start = state.pos;
	if (state.eat(98)) {
		state.lastIntValue = 8;
		return true;
	}
	if (state.switchU && state.eat(45)) {
		state.lastIntValue = 45;
		return true;
	}
	if (!state.switchU && state.eat(99)) {
		if (this.regexp_eatClassControlLetter(state)) return true;
		state.pos = start;
	}
	return this.regexp_eatCharacterClassEscape(state) || this.regexp_eatCharacterEscape(state);
};
pp$1.regexp_classSetExpression = function(state) {
	var result = CharSetOk, subResult;
	if (this.regexp_eatClassSetRange(state));
	else if (subResult = this.regexp_eatClassSetOperand(state)) {
		if (subResult === CharSetString) result = CharSetString;
		var start = state.pos;
		while (state.eatChars([38, 38])) {
			if (state.current() !== 38 && (subResult = this.regexp_eatClassSetOperand(state))) {
				if (subResult !== CharSetString) result = CharSetOk;
				continue;
			}
			state.raise("Invalid character in character class");
		}
		if (start !== state.pos) return result;
		while (state.eatChars([45, 45])) {
			if (this.regexp_eatClassSetOperand(state)) continue;
			state.raise("Invalid character in character class");
		}
		if (start !== state.pos) return result;
	} else state.raise("Invalid character in character class");
	for (;;) {
		if (this.regexp_eatClassSetRange(state)) continue;
		subResult = this.regexp_eatClassSetOperand(state);
		if (!subResult) return result;
		if (subResult === CharSetString) result = CharSetString;
	}
};
pp$1.regexp_eatClassSetRange = function(state) {
	var start = state.pos;
	if (this.regexp_eatClassSetCharacter(state)) {
		var left = state.lastIntValue;
		if (state.eat(45) && this.regexp_eatClassSetCharacter(state)) {
			var right = state.lastIntValue;
			if (left !== -1 && right !== -1 && left > right) state.raise("Range out of order in character class");
			return true;
		}
		state.pos = start;
	}
	return false;
};
pp$1.regexp_eatClassSetOperand = function(state) {
	if (this.regexp_eatClassSetCharacter(state)) return CharSetOk;
	return this.regexp_eatClassStringDisjunction(state) || this.regexp_eatNestedClass(state);
};
pp$1.regexp_eatNestedClass = function(state) {
	var start = state.pos;
	if (state.eat(91)) {
		var negate = state.eat(94);
		var result = this.regexp_classContents(state);
		if (state.eat(93)) {
			if (negate && result === CharSetString) state.raise("Negated character class may contain strings");
			return result;
		}
		state.pos = start;
	}
	if (state.eat(92)) {
		var result$1 = this.regexp_eatCharacterClassEscape(state);
		if (result$1) return result$1;
		state.pos = start;
	}
	return null;
};
pp$1.regexp_eatClassStringDisjunction = function(state) {
	var start = state.pos;
	if (state.eatChars([92, 113])) {
		if (state.eat(123)) {
			var result = this.regexp_classStringDisjunctionContents(state);
			if (state.eat(125)) return result;
		} else state.raise("Invalid escape");
		state.pos = start;
	}
	return null;
};
pp$1.regexp_classStringDisjunctionContents = function(state) {
	var result = this.regexp_classString(state);
	while (state.eat(124)) if (this.regexp_classString(state) === CharSetString) result = CharSetString;
	return result;
};
pp$1.regexp_classString = function(state) {
	var count = 0;
	while (this.regexp_eatClassSetCharacter(state)) count++;
	return count === 1 ? CharSetOk : CharSetString;
};
pp$1.regexp_eatClassSetCharacter = function(state) {
	var start = state.pos;
	if (state.eat(92)) {
		if (this.regexp_eatCharacterEscape(state) || this.regexp_eatClassSetReservedPunctuator(state)) return true;
		if (state.eat(98)) {
			state.lastIntValue = 8;
			return true;
		}
		state.pos = start;
		return false;
	}
	var ch = state.current();
	if (ch < 0 || ch === state.lookahead() && isClassSetReservedDoublePunctuatorCharacter(ch)) return false;
	if (isClassSetSyntaxCharacter(ch)) return false;
	state.advance();
	state.lastIntValue = ch;
	return true;
};
function isClassSetReservedDoublePunctuatorCharacter(ch) {
	return ch === 33 || ch >= 35 && ch <= 38 || ch >= 42 && ch <= 44 || ch === 46 || ch >= 58 && ch <= 64 || ch === 94 || ch === 96 || ch === 126;
}
function isClassSetSyntaxCharacter(ch) {
	return ch === 40 || ch === 41 || ch === 45 || ch === 47 || ch >= 91 && ch <= 93 || ch >= 123 && ch <= 125;
}
pp$1.regexp_eatClassSetReservedPunctuator = function(state) {
	var ch = state.current();
	if (isClassSetReservedPunctuator(ch)) {
		state.lastIntValue = ch;
		state.advance();
		return true;
	}
	return false;
};
function isClassSetReservedPunctuator(ch) {
	return ch === 33 || ch === 35 || ch === 37 || ch === 38 || ch === 44 || ch === 45 || ch >= 58 && ch <= 62 || ch === 64 || ch === 96 || ch === 126;
}
pp$1.regexp_eatClassControlLetter = function(state) {
	var ch = state.current();
	if (isDecimalDigit(ch) || ch === 95) {
		state.lastIntValue = ch % 32;
		state.advance();
		return true;
	}
	return false;
};
pp$1.regexp_eatHexEscapeSequence = function(state) {
	var start = state.pos;
	if (state.eat(120)) {
		if (this.regexp_eatFixedHexDigits(state, 2)) return true;
		if (state.switchU) state.raise("Invalid escape");
		state.pos = start;
	}
	return false;
};
pp$1.regexp_eatDecimalDigits = function(state) {
	var start = state.pos;
	var ch = 0;
	state.lastIntValue = 0;
	while (isDecimalDigit(ch = state.current())) {
		state.lastIntValue = 10 * state.lastIntValue + (ch - 48);
		state.advance();
	}
	return state.pos !== start;
};
function isDecimalDigit(ch) {
	return ch >= 48 && ch <= 57;
}
pp$1.regexp_eatHexDigits = function(state) {
	var start = state.pos;
	var ch = 0;
	state.lastIntValue = 0;
	while (isHexDigit(ch = state.current())) {
		state.lastIntValue = 16 * state.lastIntValue + hexToInt(ch);
		state.advance();
	}
	return state.pos !== start;
};
function isHexDigit(ch) {
	return ch >= 48 && ch <= 57 || ch >= 65 && ch <= 70 || ch >= 97 && ch <= 102;
}
function hexToInt(ch) {
	if (ch >= 65 && ch <= 70) return 10 + (ch - 65);
	if (ch >= 97 && ch <= 102) return 10 + (ch - 97);
	return ch - 48;
}
pp$1.regexp_eatLegacyOctalEscapeSequence = function(state) {
	if (this.regexp_eatOctalDigit(state)) {
		var n1 = state.lastIntValue;
		if (this.regexp_eatOctalDigit(state)) {
			var n2 = state.lastIntValue;
			if (n1 <= 3 && this.regexp_eatOctalDigit(state)) state.lastIntValue = n1 * 64 + n2 * 8 + state.lastIntValue;
			else state.lastIntValue = n1 * 8 + n2;
		} else state.lastIntValue = n1;
		return true;
	}
	return false;
};
pp$1.regexp_eatOctalDigit = function(state) {
	var ch = state.current();
	if (isOctalDigit(ch)) {
		state.lastIntValue = ch - 48;
		state.advance();
		return true;
	}
	state.lastIntValue = 0;
	return false;
};
function isOctalDigit(ch) {
	return ch >= 48 && ch <= 55;
}
pp$1.regexp_eatFixedHexDigits = function(state, length) {
	var start = state.pos;
	state.lastIntValue = 0;
	for (var i = 0; i < length; ++i) {
		var ch = state.current();
		if (!isHexDigit(ch)) {
			state.pos = start;
			return false;
		}
		state.lastIntValue = 16 * state.lastIntValue + hexToInt(ch);
		state.advance();
	}
	return true;
};
var Token = function Token(p) {
	this.type = p.type;
	this.value = p.value;
	this.start = p.start;
	this.end = p.end;
	if (p.options.locations) this.loc = new SourceLocation(p, p.startLoc, p.endLoc);
	if (p.options.ranges) this.range = [p.start, p.end];
};
var pp = Parser$1.prototype;
pp.next = function(ignoreEscapeSequenceInKeyword) {
	if (!ignoreEscapeSequenceInKeyword && this.type.keyword && this.containsEsc) this.raiseRecoverable(this.start, "Escape sequence in keyword " + this.type.keyword);
	if (this.options.onToken) this.options.onToken(new Token(this));
	this.lastTokEnd = this.end;
	this.lastTokStart = this.start;
	this.lastTokEndLoc = this.endLoc;
	this.lastTokStartLoc = this.startLoc;
	this.nextToken();
};
pp.getToken = function() {
	this.next();
	return new Token(this);
};
if (typeof Symbol !== "undefined") pp[Symbol.iterator] = function() {
	var this$1$1 = this;
	return { next: function() {
		var token = this$1$1.getToken();
		return {
			done: token.type === types$1.eof,
			value: token
		};
	} };
};
pp.nextToken = function() {
	var curContext = this.curContext();
	if (!curContext || !curContext.preserveSpace) this.skipSpace();
	this.start = this.pos;
	if (this.options.locations) this.startLoc = this.curPosition();
	if (this.pos >= this.input.length) return this.finishToken(types$1.eof);
	if (curContext.override) return curContext.override(this);
	else this.readToken(this.fullCharCodeAtPos());
};
pp.readToken = function(code) {
	if (isIdentifierStart(code, this.options.ecmaVersion >= 6) || code === 92) return this.readWord();
	return this.getTokenFromCode(code);
};
pp.fullCharCodeAt = function(pos) {
	var code = this.input.charCodeAt(pos);
	if (code <= 55295 || code >= 56320) return code;
	var next = this.input.charCodeAt(pos + 1);
	return next <= 56319 || next >= 57344 ? code : (code << 10) + next - 56613888;
};
pp.fullCharCodeAtPos = function() {
	return this.fullCharCodeAt(this.pos);
};
pp.skipBlockComment = function() {
	var startLoc = this.options.onComment && this.curPosition();
	var start = this.pos, end = this.input.indexOf("*/", this.pos += 2);
	if (end === -1) this.raise(this.pos - 2, "Unterminated comment");
	this.pos = end + 2;
	if (this.options.locations) for (var nextBreak = void 0, pos = start; (nextBreak = nextLineBreak(this.input, pos, this.pos)) > -1;) {
		++this.curLine;
		pos = this.lineStart = nextBreak;
	}
	if (this.options.onComment) this.options.onComment(true, this.input.slice(start + 2, end), start, this.pos, startLoc, this.curPosition());
};
pp.skipLineComment = function(startSkip) {
	var start = this.pos;
	var startLoc = this.options.onComment && this.curPosition();
	var ch = this.input.charCodeAt(this.pos += startSkip);
	while (this.pos < this.input.length && !isNewLine(ch)) ch = this.input.charCodeAt(++this.pos);
	if (this.options.onComment) this.options.onComment(false, this.input.slice(start + startSkip, this.pos), start, this.pos, startLoc, this.curPosition());
};
pp.skipSpace = function() {
	loop: while (this.pos < this.input.length) {
		var ch = this.input.charCodeAt(this.pos);
		switch (ch) {
			case 32:
			case 160:
				++this.pos;
				break;
			case 13: if (this.input.charCodeAt(this.pos + 1) === 10) ++this.pos;
			case 10:
			case 8232:
			case 8233:
				++this.pos;
				if (this.options.locations) {
					++this.curLine;
					this.lineStart = this.pos;
				}
				break;
			case 47:
				switch (this.input.charCodeAt(this.pos + 1)) {
					case 42:
						this.skipBlockComment();
						break;
					case 47:
						this.skipLineComment(2);
						break;
					default: break loop;
				}
				break;
			default: if (ch > 8 && ch < 14 || ch >= 5760 && nonASCIIwhitespace.test(String.fromCharCode(ch))) ++this.pos;
			else break loop;
		}
	}
};
pp.finishToken = function(type, val) {
	this.end = this.pos;
	if (this.options.locations) this.endLoc = this.curPosition();
	var prevType = this.type;
	this.type = type;
	this.value = val;
	this.updateContext(prevType);
};
pp.readToken_dot = function() {
	var next = this.input.charCodeAt(this.pos + 1);
	if (next >= 48 && next <= 57) return this.readNumber(true);
	var next2 = this.input.charCodeAt(this.pos + 2);
	if (this.options.ecmaVersion >= 6 && next === 46 && next2 === 46) {
		this.pos += 3;
		return this.finishToken(types$1.ellipsis);
	} else {
		++this.pos;
		return this.finishToken(types$1.dot);
	}
};
pp.readToken_slash = function() {
	var next = this.input.charCodeAt(this.pos + 1);
	if (this.exprAllowed) {
		++this.pos;
		return this.readRegexp();
	}
	if (next === 61) return this.finishOp(types$1.assign, 2);
	return this.finishOp(types$1.slash, 1);
};
pp.readToken_mult_modulo_exp = function(code) {
	var next = this.input.charCodeAt(this.pos + 1);
	var size = 1;
	var tokentype = code === 42 ? types$1.star : types$1.modulo;
	if (this.options.ecmaVersion >= 7 && code === 42 && next === 42) {
		++size;
		tokentype = types$1.starstar;
		next = this.input.charCodeAt(this.pos + 2);
	}
	if (next === 61) return this.finishOp(types$1.assign, size + 1);
	return this.finishOp(tokentype, size);
};
pp.readToken_pipe_amp = function(code) {
	var next = this.input.charCodeAt(this.pos + 1);
	if (next === code) {
		if (this.options.ecmaVersion >= 12) {
			if (this.input.charCodeAt(this.pos + 2) === 61) return this.finishOp(types$1.assign, 3);
		}
		return this.finishOp(code === 124 ? types$1.logicalOR : types$1.logicalAND, 2);
	}
	if (next === 61) return this.finishOp(types$1.assign, 2);
	return this.finishOp(code === 124 ? types$1.bitwiseOR : types$1.bitwiseAND, 1);
};
pp.readToken_caret = function() {
	if (this.input.charCodeAt(this.pos + 1) === 61) return this.finishOp(types$1.assign, 2);
	return this.finishOp(types$1.bitwiseXOR, 1);
};
pp.readToken_plus_min = function(code) {
	var next = this.input.charCodeAt(this.pos + 1);
	if (next === code) {
		if (next === 45 && !this.inModule && this.input.charCodeAt(this.pos + 2) === 62 && (this.lastTokEnd === 0 || lineBreak.test(this.input.slice(this.lastTokEnd, this.pos)))) {
			this.skipLineComment(3);
			this.skipSpace();
			return this.nextToken();
		}
		return this.finishOp(types$1.incDec, 2);
	}
	if (next === 61) return this.finishOp(types$1.assign, 2);
	return this.finishOp(types$1.plusMin, 1);
};
pp.readToken_lt_gt = function(code) {
	var next = this.input.charCodeAt(this.pos + 1);
	var size = 1;
	if (next === code) {
		size = code === 62 && this.input.charCodeAt(this.pos + 2) === 62 ? 3 : 2;
		if (this.input.charCodeAt(this.pos + size) === 61) return this.finishOp(types$1.assign, size + 1);
		return this.finishOp(types$1.bitShift, size);
	}
	if (next === 33 && code === 60 && !this.inModule && this.input.charCodeAt(this.pos + 2) === 45 && this.input.charCodeAt(this.pos + 3) === 45) {
		this.skipLineComment(4);
		this.skipSpace();
		return this.nextToken();
	}
	if (next === 61) size = 2;
	return this.finishOp(types$1.relational, size);
};
pp.readToken_eq_excl = function(code) {
	var next = this.input.charCodeAt(this.pos + 1);
	if (next === 61) return this.finishOp(types$1.equality, this.input.charCodeAt(this.pos + 2) === 61 ? 3 : 2);
	if (code === 61 && next === 62 && this.options.ecmaVersion >= 6) {
		this.pos += 2;
		return this.finishToken(types$1.arrow);
	}
	return this.finishOp(code === 61 ? types$1.eq : types$1.prefix, 1);
};
pp.readToken_question = function() {
	var ecmaVersion = this.options.ecmaVersion;
	if (ecmaVersion >= 11) {
		var next = this.input.charCodeAt(this.pos + 1);
		if (next === 46) {
			var next2 = this.input.charCodeAt(this.pos + 2);
			if (next2 < 48 || next2 > 57) return this.finishOp(types$1.questionDot, 2);
		}
		if (next === 63) {
			if (ecmaVersion >= 12) {
				if (this.input.charCodeAt(this.pos + 2) === 61) return this.finishOp(types$1.assign, 3);
			}
			return this.finishOp(types$1.coalesce, 2);
		}
	}
	return this.finishOp(types$1.question, 1);
};
pp.readToken_numberSign = function() {
	var ecmaVersion = this.options.ecmaVersion;
	var code = 35;
	if (ecmaVersion >= 13) {
		++this.pos;
		code = this.fullCharCodeAtPos();
		if (isIdentifierStart(code, true) || code === 92) return this.finishToken(types$1.privateId, this.readWord1());
	}
	this.raise(this.pos, "Unexpected character '" + codePointToString(code) + "'");
};
pp.getTokenFromCode = function(code) {
	switch (code) {
		case 46: return this.readToken_dot();
		case 40:
			++this.pos;
			return this.finishToken(types$1.parenL);
		case 41:
			++this.pos;
			return this.finishToken(types$1.parenR);
		case 59:
			++this.pos;
			return this.finishToken(types$1.semi);
		case 44:
			++this.pos;
			return this.finishToken(types$1.comma);
		case 91:
			++this.pos;
			return this.finishToken(types$1.bracketL);
		case 93:
			++this.pos;
			return this.finishToken(types$1.bracketR);
		case 123:
			++this.pos;
			return this.finishToken(types$1.braceL);
		case 125:
			++this.pos;
			return this.finishToken(types$1.braceR);
		case 58:
			++this.pos;
			return this.finishToken(types$1.colon);
		case 96:
			if (this.options.ecmaVersion < 6) break;
			++this.pos;
			return this.finishToken(types$1.backQuote);
		case 48:
			var next = this.input.charCodeAt(this.pos + 1);
			if (next === 120 || next === 88) return this.readRadixNumber(16);
			if (this.options.ecmaVersion >= 6) {
				if (next === 111 || next === 79) return this.readRadixNumber(8);
				if (next === 98 || next === 66) return this.readRadixNumber(2);
			}
		case 49:
		case 50:
		case 51:
		case 52:
		case 53:
		case 54:
		case 55:
		case 56:
		case 57: return this.readNumber(false);
		case 34:
		case 39: return this.readString(code);
		case 47: return this.readToken_slash();
		case 37:
		case 42: return this.readToken_mult_modulo_exp(code);
		case 124:
		case 38: return this.readToken_pipe_amp(code);
		case 94: return this.readToken_caret();
		case 43:
		case 45: return this.readToken_plus_min(code);
		case 60:
		case 62: return this.readToken_lt_gt(code);
		case 61:
		case 33: return this.readToken_eq_excl(code);
		case 63: return this.readToken_question();
		case 126: return this.finishOp(types$1.prefix, 1);
		case 35: return this.readToken_numberSign();
	}
	this.raise(this.pos, "Unexpected character '" + codePointToString(code) + "'");
};
pp.finishOp = function(type, size) {
	var str = this.input.slice(this.pos, this.pos + size);
	this.pos += size;
	return this.finishToken(type, str);
};
pp.readRegexp = function() {
	var escaped, inClass, start = this.pos;
	for (;;) {
		if (this.pos >= this.input.length) this.raise(start, "Unterminated regular expression");
		var ch = this.input.charAt(this.pos);
		if (lineBreak.test(ch)) this.raise(start, "Unterminated regular expression");
		if (!escaped) {
			if (ch === "[") inClass = true;
			else if (ch === "]" && inClass) inClass = false;
			else if (ch === "/" && !inClass) break;
			escaped = ch === "\\";
		} else escaped = false;
		++this.pos;
	}
	var pattern = this.input.slice(start, this.pos);
	++this.pos;
	var flagsStart = this.pos;
	var flags = this.readWord1();
	if (this.containsEsc) this.unexpected(flagsStart);
	var state = this.regexpState || (this.regexpState = new RegExpValidationState(this));
	state.reset(start, pattern, flags);
	this.validateRegExpFlags(state);
	this.validateRegExpPattern(state);
	var value = null;
	try {
		value = new RegExp(pattern, flags);
	} catch (e) {}
	return this.finishToken(types$1.regexp, {
		pattern,
		flags,
		value
	});
};
pp.readInt = function(radix, len, maybeLegacyOctalNumericLiteral) {
	var allowSeparators = this.options.ecmaVersion >= 12 && len === void 0;
	var isLegacyOctalNumericLiteral = maybeLegacyOctalNumericLiteral && this.input.charCodeAt(this.pos) === 48;
	var start = this.pos, total = 0, lastCode = 0;
	for (var i = 0, e = len == null ? Infinity : len; i < e; ++i, ++this.pos) {
		var code = this.input.charCodeAt(this.pos), val = void 0;
		if (allowSeparators && code === 95) {
			if (isLegacyOctalNumericLiteral) this.raiseRecoverable(this.pos, "Numeric separator is not allowed in legacy octal numeric literals");
			if (lastCode === 95) this.raiseRecoverable(this.pos, "Numeric separator must be exactly one underscore");
			if (i === 0) this.raiseRecoverable(this.pos, "Numeric separator is not allowed at the first of digits");
			lastCode = code;
			continue;
		}
		if (code >= 97) val = code - 97 + 10;
		else if (code >= 65) val = code - 65 + 10;
		else if (code >= 48 && code <= 57) val = code - 48;
		else val = Infinity;
		if (val >= radix) break;
		lastCode = code;
		total = total * radix + val;
	}
	if (allowSeparators && lastCode === 95) this.raiseRecoverable(this.pos - 1, "Numeric separator is not allowed at the last of digits");
	if (this.pos === start || len != null && this.pos - start !== len) return null;
	return total;
};
function stringToNumber(str, isLegacyOctalNumericLiteral) {
	if (isLegacyOctalNumericLiteral) return parseInt(str, 8);
	return parseFloat(str.replace(/_/g, ""));
}
function stringToBigInt(str) {
	if (typeof BigInt !== "function") return null;
	return BigInt(str.replace(/_/g, ""));
}
pp.readRadixNumber = function(radix) {
	var start = this.pos;
	this.pos += 2;
	var val = this.readInt(radix);
	if (val == null) this.raise(this.start + 2, "Expected number in radix " + radix);
	if (this.options.ecmaVersion >= 11 && this.input.charCodeAt(this.pos) === 110) {
		val = stringToBigInt(this.input.slice(start, this.pos));
		++this.pos;
	} else if (isIdentifierStart(this.fullCharCodeAtPos())) this.raise(this.pos, "Identifier directly after number");
	return this.finishToken(types$1.num, val);
};
pp.readNumber = function(startsWithDot) {
	var start = this.pos;
	if (!startsWithDot && this.readInt(10, void 0, true) === null) this.raise(start, "Invalid number");
	var octal = this.pos - start >= 2 && this.input.charCodeAt(start) === 48;
	if (octal && this.strict) this.raise(start, "Invalid number");
	var next = this.input.charCodeAt(this.pos);
	if (!octal && !startsWithDot && this.options.ecmaVersion >= 11 && next === 110) {
		var val$1 = stringToBigInt(this.input.slice(start, this.pos));
		++this.pos;
		if (isIdentifierStart(this.fullCharCodeAtPos())) this.raise(this.pos, "Identifier directly after number");
		return this.finishToken(types$1.num, val$1);
	}
	if (octal && /[89]/.test(this.input.slice(start, this.pos))) octal = false;
	if (next === 46 && !octal) {
		++this.pos;
		this.readInt(10);
		next = this.input.charCodeAt(this.pos);
	}
	if ((next === 69 || next === 101) && !octal) {
		next = this.input.charCodeAt(++this.pos);
		if (next === 43 || next === 45) ++this.pos;
		if (this.readInt(10) === null) this.raise(start, "Invalid number");
	}
	if (isIdentifierStart(this.fullCharCodeAtPos())) this.raise(this.pos, "Identifier directly after number");
	var val = stringToNumber(this.input.slice(start, this.pos), octal);
	return this.finishToken(types$1.num, val);
};
pp.readCodePoint = function() {
	var ch = this.input.charCodeAt(this.pos), code;
	if (ch === 123) {
		if (this.options.ecmaVersion < 6) this.unexpected();
		var codePos = ++this.pos;
		code = this.readHexChar(this.input.indexOf("}", this.pos) - this.pos);
		++this.pos;
		if (code > 1114111) this.invalidStringToken(codePos, "Code point out of bounds");
	} else code = this.readHexChar(4);
	return code;
};
pp.readString = function(quote) {
	var out = "", chunkStart = ++this.pos;
	for (;;) {
		if (this.pos >= this.input.length) this.raise(this.start, "Unterminated string constant");
		var ch = this.input.charCodeAt(this.pos);
		if (ch === quote) break;
		if (ch === 92) {
			out += this.input.slice(chunkStart, this.pos);
			out += this.readEscapedChar(false);
			chunkStart = this.pos;
		} else if (ch === 8232 || ch === 8233) {
			if (this.options.ecmaVersion < 10) this.raise(this.start, "Unterminated string constant");
			++this.pos;
			if (this.options.locations) {
				this.curLine++;
				this.lineStart = this.pos;
			}
		} else {
			if (isNewLine(ch)) this.raise(this.start, "Unterminated string constant");
			++this.pos;
		}
	}
	out += this.input.slice(chunkStart, this.pos++);
	return this.finishToken(types$1.string, out);
};
var INVALID_TEMPLATE_ESCAPE_ERROR = {};
pp.tryReadTemplateToken = function() {
	this.inTemplateElement = true;
	try {
		this.readTmplToken();
	} catch (err) {
		if (err === INVALID_TEMPLATE_ESCAPE_ERROR) this.readInvalidTemplateToken();
		else throw err;
	}
	this.inTemplateElement = false;
};
pp.invalidStringToken = function(position, message) {
	if (this.inTemplateElement && this.options.ecmaVersion >= 9) throw INVALID_TEMPLATE_ESCAPE_ERROR;
	else this.raise(position, message);
};
pp.readTmplToken = function() {
	var out = "", chunkStart = this.pos;
	for (;;) {
		if (this.pos >= this.input.length) this.raise(this.start, "Unterminated template");
		var ch = this.input.charCodeAt(this.pos);
		if (ch === 96 || ch === 36 && this.input.charCodeAt(this.pos + 1) === 123) {
			if (this.pos === this.start && (this.type === types$1.template || this.type === types$1.invalidTemplate)) if (ch === 36) {
				this.pos += 2;
				return this.finishToken(types$1.dollarBraceL);
			} else {
				++this.pos;
				return this.finishToken(types$1.backQuote);
			}
			out += this.input.slice(chunkStart, this.pos);
			return this.finishToken(types$1.template, out);
		}
		if (ch === 92) {
			out += this.input.slice(chunkStart, this.pos);
			out += this.readEscapedChar(true);
			chunkStart = this.pos;
		} else if (isNewLine(ch)) {
			out += this.input.slice(chunkStart, this.pos);
			++this.pos;
			switch (ch) {
				case 13: if (this.input.charCodeAt(this.pos) === 10) ++this.pos;
				case 10:
					out += "\n";
					break;
				default:
					out += String.fromCharCode(ch);
					break;
			}
			if (this.options.locations) {
				++this.curLine;
				this.lineStart = this.pos;
			}
			chunkStart = this.pos;
		} else ++this.pos;
	}
};
pp.readInvalidTemplateToken = function() {
	for (; this.pos < this.input.length; this.pos++) switch (this.input[this.pos]) {
		case "\\":
			++this.pos;
			break;
		case "$": if (this.input[this.pos + 1] !== "{") break;
		case "`": return this.finishToken(types$1.invalidTemplate, this.input.slice(this.start, this.pos));
		case "\r": if (this.input[this.pos + 1] === "\n") ++this.pos;
		case "\n":
		case "\u2028":
		case "\u2029":
			++this.curLine;
			this.lineStart = this.pos + 1;
			break;
	}
	this.raise(this.start, "Unterminated template");
};
pp.readEscapedChar = function(inTemplate) {
	var ch = this.input.charCodeAt(++this.pos);
	++this.pos;
	switch (ch) {
		case 110: return "\n";
		case 114: return "\r";
		case 120: return String.fromCharCode(this.readHexChar(2));
		case 117: return codePointToString(this.readCodePoint());
		case 116: return "	";
		case 98: return "\b";
		case 118: return "\v";
		case 102: return "\f";
		case 13: if (this.input.charCodeAt(this.pos) === 10) ++this.pos;
		case 10:
			if (this.options.locations) {
				this.lineStart = this.pos;
				++this.curLine;
			}
			return "";
		case 56:
		case 57:
			if (this.strict) this.invalidStringToken(this.pos - 1, "Invalid escape sequence");
			if (inTemplate) {
				var codePos = this.pos - 1;
				this.invalidStringToken(codePos, "Invalid escape sequence in template string");
			}
		default:
			if (ch >= 48 && ch <= 55) {
				var octalStr = this.input.substr(this.pos - 1, 3).match(/^[0-7]+/)[0];
				var octal = parseInt(octalStr, 8);
				if (octal > 255) {
					octalStr = octalStr.slice(0, -1);
					octal = parseInt(octalStr, 8);
				}
				this.pos += octalStr.length - 1;
				ch = this.input.charCodeAt(this.pos);
				if ((octalStr !== "0" || ch === 56 || ch === 57) && (this.strict || inTemplate)) this.invalidStringToken(this.pos - 1 - octalStr.length, inTemplate ? "Octal literal in template string" : "Octal literal in strict mode");
				return String.fromCharCode(octal);
			}
			if (isNewLine(ch)) {
				if (this.options.locations) {
					this.lineStart = this.pos;
					++this.curLine;
				}
				return "";
			}
			return String.fromCharCode(ch);
	}
};
pp.readHexChar = function(len) {
	var codePos = this.pos;
	var n = this.readInt(16, len);
	if (n === null) this.invalidStringToken(codePos, "Bad character escape sequence");
	return n;
};
pp.readWord1 = function() {
	this.containsEsc = false;
	var word = "", first = true, chunkStart = this.pos;
	var astral = this.options.ecmaVersion >= 6;
	while (this.pos < this.input.length) {
		var ch = this.fullCharCodeAtPos();
		if (isIdentifierChar(ch, astral)) this.pos += ch <= 65535 ? 1 : 2;
		else if (ch === 92) {
			this.containsEsc = true;
			word += this.input.slice(chunkStart, this.pos);
			var escStart = this.pos;
			if (this.input.charCodeAt(++this.pos) !== 117) this.invalidStringToken(this.pos, "Expecting Unicode escape sequence \\uXXXX");
			++this.pos;
			var esc = this.readCodePoint();
			if (!(first ? isIdentifierStart : isIdentifierChar)(esc, astral)) this.invalidStringToken(escStart, "Invalid Unicode escape");
			word += codePointToString(esc);
			chunkStart = this.pos;
		} else break;
		first = false;
	}
	return word + this.input.slice(chunkStart, this.pos);
};
pp.readWord = function() {
	var word = this.readWord1();
	var type = types$1.name;
	if (this.keywords.test(word)) type = keywords[word];
	return this.finishToken(type, word);
};
var version = "8.17.0";
Parser$1.acorn = {
	Parser: Parser$1,
	version,
	defaultOptions,
	Position,
	SourceLocation,
	getLineInfo,
	Node,
	TokenType,
	tokTypes: types$1,
	keywordTypes: keywords,
	TokContext,
	tokContexts: types,
	isIdentifierChar,
	isIdentifierStart,
	Token,
	isNewLine,
	lineBreak,
	lineBreakG,
	nonASCIIwhitespace
};
function parse$1(input, options) {
	return Parser$1.parse(input, options);
}
function parseExpressionAt(input, pos, options) {
	return Parser$1.parseExpressionAt(input, pos, options);
}
function tokenizer(input, options) {
	return Parser$1.tokenizer(input, options);
}
//#endregion
//#region ../native-tsrx/node_modules/.pnpm/@sveltejs+acorn-typescript@1.0.10_acorn@8.17.0/node_modules/@sveltejs/acorn-typescript/index.js
var startsExpr = true;
var acornTypeScriptMap = /* @__PURE__ */ new WeakMap();
function generateAcornTypeScript(_acorn) {
	const acorn = _acorn.Parser.acorn || _acorn;
	let acornTypeScript = acornTypeScriptMap.get(acorn);
	if (!acornTypeScript) {
		let tokenIsLiteralPropertyName = function(token) {
			return token === tokTypes.name || token === tokTypes.string || token === tokTypes.num || keywordTypeValues.includes(token) || tsKwTokenTypeValues.includes(token);
		}, tokenIsKeywordOrIdentifier = function(token) {
			return token === tokTypes.name || keywordTypeValues.includes(token) || tsKwTokenTypeValues.includes(token);
		}, tokenIsIdentifier = function(token) {
			return token === tokTypes.name || tsKwTokenTypeValues.includes(token);
		}, tokenIsTSDeclarationStart = function(token) {
			return token === tsKwTokenType.abstract || token === tsKwTokenType.declare || token === tsKwTokenType.enum || token === tsKwTokenType.module || token === tsKwTokenType.namespace || token === tsKwTokenType.interface || token === tsKwTokenType.type;
		}, tokenIsTSTypeOperator = function(token) {
			return token === tsKwTokenType.keyof || token === tsKwTokenType.readonly || token === tsKwTokenType.unique;
		}, tokenIsTemplate = function(token) {
			return token === tokTypes.invalidTemplate;
		};
		const { tokTypes, keywordTypes } = acorn;
		const keywordTypeValues = Object.values(keywordTypes);
		const tsKwTokenType = generateTsKwTokenType();
		const tsKwTokenTypeValues = Object.values(tsKwTokenType);
		const tsTokenType = generateTsTokenType();
		const tsTokenContext = generateTsTokenContext();
		const tsKeywordsRegExp = new RegExp(`^(?:${Object.keys(tsKwTokenType).join("|")})$`);
		tsTokenType.jsxTagStart.updateContext = function() {
			this.context.push(tsTokenContext.tc_expr);
			this.context.push(tsTokenContext.tc_oTag);
			this.exprAllowed = false;
		};
		tsTokenType.jsxTagEnd.updateContext = function(prevType) {
			let out = this.context.pop();
			if (out === tsTokenContext.tc_oTag && prevType === tokTypes.slash || out === tsTokenContext.tc_cTag) {
				this.context.pop();
				this.exprAllowed = this.curContext() === tsTokenContext.tc_expr;
			} else this.exprAllowed = true;
		};
		acornTypeScript = {
			tokTypes: {
				...tsKwTokenType,
				...tsTokenType
			},
			tokContexts: { ...tsTokenContext },
			keywordsRegExp: tsKeywordsRegExp,
			tokenIsLiteralPropertyName,
			tokenIsKeywordOrIdentifier,
			tokenIsIdentifier,
			tokenIsTSDeclarationStart,
			tokenIsTSTypeOperator,
			tokenIsTemplate
		};
	}
	return acornTypeScript;
	function kwLike(_name, options = {}) {
		return new acorn.TokenType("name", options);
	}
	function generateTsTokenContext() {
		return {
			tc_oTag: new acorn.TokContext("<tag", false, false),
			tc_cTag: new acorn.TokContext("</tag", false, false),
			tc_expr: new acorn.TokContext("<tag>...</tag>", true, true)
		};
	}
	function generateTsTokenType() {
		return {
			at: new acorn.TokenType("@"),
			jsxName: new acorn.TokenType("jsxName"),
			jsxText: new acorn.TokenType("jsxText", { beforeExpr: true }),
			jsxTagStart: new acorn.TokenType("jsxTagStart", { startsExpr: true }),
			jsxTagEnd: new acorn.TokenType("jsxTagEnd")
		};
	}
	function generateTsKwTokenType() {
		return {
			assert: kwLike("assert", { startsExpr }),
			asserts: kwLike("asserts", { startsExpr }),
			global: kwLike("global", { startsExpr }),
			keyof: kwLike("keyof", { startsExpr }),
			readonly: kwLike("readonly", { startsExpr }),
			unique: kwLike("unique", { startsExpr }),
			abstract: kwLike("abstract", { startsExpr }),
			declare: kwLike("declare", { startsExpr }),
			enum: kwLike("enum", { startsExpr }),
			module: kwLike("module", { startsExpr }),
			namespace: kwLike("namespace", { startsExpr }),
			interface: kwLike("interface", { startsExpr }),
			type: kwLike("type", { startsExpr })
		};
	}
}
var TS_SCOPE_OTHER = 512;
var TS_SCOPE_TS_MODULE = 1024;
var BIND_KIND_VALUE = 1;
var BIND_KIND_TYPE = 2;
var BIND_SCOPE_VAR = 4;
var BIND_SCOPE_LEXICAL = 8;
var BIND_SCOPE_FUNCTION = 16;
var BIND_FLAGS_NONE = 64;
var BIND_FLAGS_CLASS = 128;
var BIND_FLAGS_TS_ENUM = 256;
var BIND_FLAGS_TS_CONST_ENUM = 512;
var BIND_FLAGS_TS_EXPORT_ONLY = 1024;
BIND_KIND_VALUE | BIND_KIND_TYPE | BIND_SCOPE_LEXICAL | BIND_FLAGS_CLASS;
BIND_KIND_VALUE | 0 | BIND_SCOPE_LEXICAL | 0;
BIND_KIND_VALUE | 0 | BIND_SCOPE_VAR | 0;
BIND_KIND_VALUE | 0 | BIND_SCOPE_FUNCTION | 0;
BIND_KIND_TYPE | 0 | BIND_FLAGS_CLASS;
BIND_KIND_TYPE | 0;
var BIND_TS_ENUM = BIND_KIND_VALUE | BIND_KIND_TYPE | BIND_SCOPE_LEXICAL | BIND_FLAGS_TS_ENUM;
0 | BIND_FLAGS_TS_EXPORT_ONLY;
0 | BIND_FLAGS_NONE;
BIND_KIND_VALUE | 0 | BIND_FLAGS_NONE;
BIND_TS_ENUM | BIND_FLAGS_TS_CONST_ENUM;
0 | BIND_FLAGS_TS_EXPORT_ONLY;
var CLASS_ELEMENT_FLAG_STATIC = 4;
var CLASS_ELEMENT_KIND_GETTER = 2;
var CLASS_ELEMENT_KIND_SETTER = 1;
CLASS_ELEMENT_KIND_GETTER | CLASS_ELEMENT_KIND_SETTER;
CLASS_ELEMENT_KIND_GETTER | CLASS_ELEMENT_FLAG_STATIC;
CLASS_ELEMENT_KIND_SETTER | CLASS_ELEMENT_FLAG_STATIC;
var skipWhiteSpaceToLineBreak = new RegExp("(?=(" + /(?:[^\S\n\r\u2028\u2029]|\/\/.*|\/\*.*?\*\/)*/y.source + "))\\1" + /(?=[\n\r\u2028\u2029]|\/\*(?!.*?\*\/)|$)/.source, "y");
var DestructuringErrors$1 = class {
	constructor() {
		this.shorthandAssign = this.trailingComma = this.parenthesizedAssign = this.parenthesizedBind = this.doubleProto = -1;
	}
};
function isPrivateNameConflicted(privateNameMap, element) {
	const name = element.key.name;
	const curr = privateNameMap[name];
	let next = "true";
	if (element.type === "MethodDefinition" && (element.kind === "get" || element.kind === "set")) next = (element.static ? "s" : "i") + element.kind;
	if (curr === "iget" && next === "iset" || curr === "iset" && next === "iget" || curr === "sget" && next === "sset" || curr === "sset" && next === "sget") {
		privateNameMap[name] = "true";
		return false;
	} else if (!curr) {
		privateNameMap[name] = next;
		return false;
	} else return true;
}
function checkKeyName(node, name) {
	const { computed, key } = node;
	return !computed && (key.type === "Identifier" && key.name === name || key.type === "Literal" && key.value === name);
}
var TypeScriptError = {
	AbstractMethodHasImplementation: ({ methodName }) => `Method '${methodName}' cannot have an implementation because it is marked abstract.`,
	AbstractPropertyHasInitializer: ({ propertyName }) => `Property '${propertyName}' cannot have an initializer because it is marked abstract.`,
	AccesorCannotDeclareThisParameter: "'get' and 'set' accessors cannot declare 'this' parameters.",
	AccesorCannotHaveTypeParameters: "An accessor cannot have type parameters.",
	CannotFindName: ({ name }) => `Cannot find name '${name}'.`,
	ClassMethodHasDeclare: "Class methods cannot have the 'declare' modifier.",
	ClassMethodHasReadonly: "Class methods cannot have the 'readonly' modifier.",
	ConstInitiailizerMustBeStringOrNumericLiteralOrLiteralEnumReference: "A 'const' initializer in an ambient context must be a string or numeric literal or literal enum reference.",
	ConstructorHasTypeParameters: "Type parameters cannot appear on a constructor declaration.",
	DeclareAccessor: ({ kind }) => `'declare' is not allowed in ${kind}ters.`,
	DeclareClassFieldHasInitializer: "Initializers are not allowed in ambient contexts.",
	DeclareFunctionHasImplementation: "An implementation cannot be declared in ambient contexts.",
	DuplicateAccessibilityModifier: (() => `Accessibility modifier already seen.`),
	DuplicateModifier: ({ modifier }) => `Duplicate modifier: '${modifier}'.`,
	EmptyHeritageClauseType: ({ token }) => `'${token}' list cannot be empty.`,
	EmptyTypeArguments: "Type argument list cannot be empty.",
	EmptyTypeParameters: "Type parameter list cannot be empty.",
	ExpectedAmbientAfterExportDeclare: "'export declare' must be followed by an ambient declaration.",
	ImportAliasHasImportType: "An import alias can not use 'import type'.",
	IncompatibleModifiers: ({ modifiers }) => `'${modifiers[0]}' modifier cannot be used with '${modifiers[1]}' modifier.`,
	IndexSignatureHasAbstract: "Index signatures cannot have the 'abstract' modifier.",
	IndexSignatureHasAccessibility: ({ modifier }) => `Index signatures cannot have an accessibility modifier ('${modifier}').`,
	IndexSignatureHasDeclare: "Index signatures cannot have the 'declare' modifier.",
	IndexSignatureHasOverride: "'override' modifier cannot appear on an index signature.",
	IndexSignatureHasStatic: "Index signatures cannot have the 'static' modifier.",
	InitializerNotAllowedInAmbientContext: "Initializers are not allowed in ambient contexts.",
	InvalidModifierOnTypeMember: ({ modifier }) => `'${modifier}' modifier cannot appear on a type member.`,
	InvalidModifierOnTypeParameter: ({ modifier }) => `'${modifier}' modifier cannot appear on a type parameter.`,
	InvalidModifierOnTypeParameterPositions: ({ modifier }) => `'${modifier}' modifier can only appear on a type parameter of a class, interface or type alias.`,
	InvalidModifiersOrder: ({ orderedModifiers }) => `'${orderedModifiers[0]}' modifier must precede '${orderedModifiers[1]}' modifier.`,
	InvalidPropertyAccessAfterInstantiationExpression: "Invalid property access after an instantiation expression. You can either wrap the instantiation expression in parentheses, or delete the type arguments.",
	InvalidTupleMemberLabel: "Tuple members must be labeled with a simple identifier.",
	MissingInterfaceName: "'interface' declarations must be followed by an identifier.",
	NonAbstractClassHasAbstractMethod: "Abstract methods can only appear within an abstract class.",
	NonClassMethodPropertyHasAbstractModifer: "'abstract' modifier can only appear on a class, method, or property declaration.",
	OptionalTypeBeforeRequired: "A required element cannot follow an optional element.",
	OverrideNotInSubClass: "This member cannot have an 'override' modifier because its containing class does not extend another class.",
	PatternIsOptional: "A binding pattern parameter cannot be optional in an implementation signature.",
	PrivateElementHasAbstract: "Private elements cannot have the 'abstract' modifier.",
	PrivateElementHasAccessibility: ({ modifier }) => `Private elements cannot have an accessibility modifier ('${modifier}').`,
	PrivateMethodsHasAccessibility: ({ modifier }) => `Private methods cannot have an accessibility modifier ('${modifier}').`,
	ReadonlyForMethodSignature: "'readonly' modifier can only appear on a property declaration or index signature.",
	ReservedArrowTypeParam: "This syntax is reserved in files with the .mts or .cts extension. Add a trailing comma, as in `<T,>() => ...`.",
	ReservedTypeAssertion: "This syntax is reserved in files with the .mts or .cts extension. Use an `as` expression instead.",
	SetAccesorCannotHaveOptionalParameter: "A 'set' accessor cannot have an optional parameter.",
	SetAccesorCannotHaveRestParameter: "A 'set' accessor cannot have rest parameter.",
	SetAccesorCannotHaveReturnType: "A 'set' accessor cannot have a return type annotation.",
	SingleTypeParameterWithoutTrailingComma: ({ typeParameterName }) => `Single type parameter ${typeParameterName} should have a trailing comma. Example usage: <${typeParameterName},>.`,
	StaticBlockCannotHaveModifier: "Static class blocks cannot have any modifier.",
	TypeAnnotationAfterAssign: "Type annotations must come before default assignments, e.g. instead of `age = 25: number` use `age: number = 25`.",
	TypeImportCannotSpecifyDefaultAndNamed: "A type-only import can specify a default import or named bindings, but not both.",
	TypeModifierIsUsedInTypeExports: "The 'type' modifier cannot be used on a named export when 'export type' is used on its export statement.",
	TypeModifierIsUsedInTypeImports: "The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.",
	UnexpectedParameterModifier: "A parameter property is only allowed in a constructor implementation.",
	UnexpectedReadonly: "'readonly' type modifier is only permitted on array and tuple literal types.",
	GenericsEndWithComma: `Trailing comma is not allowed at the end of generics.`,
	UnexpectedTypeAnnotation: "Did not expect a type annotation here.",
	UnexpectedTypeCastInParameter: "Unexpected type cast in parameter position.",
	UnsupportedImportTypeArgument: "Argument in a type import must be a string literal.",
	UnsupportedParameterPropertyKind: "A parameter property may not be declared using a binding pattern.",
	UnsupportedSignatureParameterKind: ({ type }) => `Name in a signature must be an Identifier, ObjectPattern or ArrayPattern, instead got ${type}.`,
	LetInLexicalBinding: "'let' is not allowed to be used as a name in 'let' or 'const' declarations."
};
var DecoratorsError = {
	UnexpectedLeadingDecorator: "Leading decorators must be attached to a class declaration.",
	DecoratorConstructor: "Decorators can't be used with a constructor. Did you mean '@dec class { ... }'?",
	TrailingDecorator: "Decorators must be attached to a class element.",
	SpreadElementDecorator: `Decorators can't be used with SpreadElement`
};
function generateParseDecorators(Parse, acornTypeScript, acorn) {
	const { tokTypes: tt } = acorn;
	const { tokTypes } = acornTypeScript;
	return class ParseDecorators extends Parse {
		takeDecorators(node) {
			const decorators = this.decoratorStack[this.decoratorStack.length - 1];
			if (decorators.length) {
				node.decorators = decorators;
				this.resetStartLocationFromNode(node, decorators[0]);
				this.decoratorStack[this.decoratorStack.length - 1] = [];
			}
		}
		parseDecorators(allowExport) {
			const currentContextDecorators = this.decoratorStack[this.decoratorStack.length - 1];
			while (this.match(tokTypes.at)) {
				const decorator = this.parseDecorator();
				currentContextDecorators.push(decorator);
			}
			if (this.match(tt._export)) {
				if (!allowExport) this.unexpected();
			} else if (!this.canHaveLeadingDecorator()) this.raise(this.start, DecoratorsError.UnexpectedLeadingDecorator);
		}
		parseDecorator() {
			const node = this.startNode();
			this.next();
			this.decoratorStack.push([]);
			const startPos = this.start;
			const startLoc = this.startLoc;
			let expr;
			if (this.match(tt.parenL)) {
				const startPos2 = this.start;
				const startLoc2 = this.startLoc;
				this.next();
				expr = this.parseExpression();
				this.expect(tt.parenR);
				if (this.options.preserveParens) {
					let par = this.startNodeAt(startPos2, startLoc2);
					par.expression = expr;
					expr = this.finishNode(par, "ParenthesizedExpression");
				}
			} else {
				expr = this.parseIdent(false);
				while (this.eat(tt.dot)) {
					const node2 = this.startNodeAt(startPos, startLoc);
					node2.object = expr;
					node2.property = this.parseIdent(true);
					node2.computed = false;
					expr = this.finishNode(node2, "MemberExpression");
				}
			}
			node.expression = this.parseMaybeDecoratorArguments(expr);
			this.decoratorStack.pop();
			return this.finishNode(node, "Decorator");
		}
		parseMaybeDecoratorArguments(expr) {
			if (this.eat(tt.parenL)) {
				const node = this.startNodeAtNode(expr);
				node.callee = expr;
				node.arguments = this.parseExprList(tt.parenR, false);
				return this.finishNode(node, "CallExpression");
			}
			return expr;
		}
	};
}
var xhtml_default = {
	quot: "\"",
	amp: "&",
	apos: "'",
	lt: "<",
	gt: ">",
	nbsp: "\xA0",
	iexcl: "¡",
	cent: "¢",
	pound: "£",
	curren: "¤",
	yen: "¥",
	brvbar: "¦",
	sect: "§",
	uml: "¨",
	copy: "©",
	ordf: "ª",
	laquo: "«",
	not: "¬",
	shy: "­",
	reg: "®",
	macr: "¯",
	deg: "°",
	plusmn: "±",
	sup2: "²",
	sup3: "³",
	acute: "´",
	micro: "µ",
	para: "¶",
	middot: "·",
	cedil: "¸",
	sup1: "¹",
	ordm: "º",
	raquo: "»",
	frac14: "¼",
	frac12: "½",
	frac34: "¾",
	iquest: "¿",
	Agrave: "À",
	Aacute: "Á",
	Acirc: "Â",
	Atilde: "Ã",
	Auml: "Ä",
	Aring: "Å",
	AElig: "Æ",
	Ccedil: "Ç",
	Egrave: "È",
	Eacute: "É",
	Ecirc: "Ê",
	Euml: "Ë",
	Igrave: "Ì",
	Iacute: "Í",
	Icirc: "Î",
	Iuml: "Ï",
	ETH: "Ð",
	Ntilde: "Ñ",
	Ograve: "Ò",
	Oacute: "Ó",
	Ocirc: "Ô",
	Otilde: "Õ",
	Ouml: "Ö",
	times: "×",
	Oslash: "Ø",
	Ugrave: "Ù",
	Uacute: "Ú",
	Ucirc: "Û",
	Uuml: "Ü",
	Yacute: "Ý",
	THORN: "Þ",
	szlig: "ß",
	agrave: "à",
	aacute: "á",
	acirc: "â",
	atilde: "ã",
	auml: "ä",
	aring: "å",
	aelig: "æ",
	ccedil: "ç",
	egrave: "è",
	eacute: "é",
	ecirc: "ê",
	euml: "ë",
	igrave: "ì",
	iacute: "í",
	icirc: "î",
	iuml: "ï",
	eth: "ð",
	ntilde: "ñ",
	ograve: "ò",
	oacute: "ó",
	ocirc: "ô",
	otilde: "õ",
	ouml: "ö",
	divide: "÷",
	oslash: "ø",
	ugrave: "ù",
	uacute: "ú",
	ucirc: "û",
	uuml: "ü",
	yacute: "ý",
	thorn: "þ",
	yuml: "ÿ",
	OElig: "Œ",
	oelig: "œ",
	Scaron: "Š",
	scaron: "š",
	Yuml: "Ÿ",
	fnof: "ƒ",
	circ: "ˆ",
	tilde: "˜",
	Alpha: "Α",
	Beta: "Β",
	Gamma: "Γ",
	Delta: "Δ",
	Epsilon: "Ε",
	Zeta: "Ζ",
	Eta: "Η",
	Theta: "Θ",
	Iota: "Ι",
	Kappa: "Κ",
	Lambda: "Λ",
	Mu: "Μ",
	Nu: "Ν",
	Xi: "Ξ",
	Omicron: "Ο",
	Pi: "Π",
	Rho: "Ρ",
	Sigma: "Σ",
	Tau: "Τ",
	Upsilon: "Υ",
	Phi: "Φ",
	Chi: "Χ",
	Psi: "Ψ",
	Omega: "Ω",
	alpha: "α",
	beta: "β",
	gamma: "γ",
	delta: "δ",
	epsilon: "ε",
	zeta: "ζ",
	eta: "η",
	theta: "θ",
	iota: "ι",
	kappa: "κ",
	lambda: "λ",
	mu: "μ",
	nu: "ν",
	xi: "ξ",
	omicron: "ο",
	pi: "π",
	rho: "ρ",
	sigmaf: "ς",
	sigma: "σ",
	tau: "τ",
	upsilon: "υ",
	phi: "φ",
	chi: "χ",
	psi: "ψ",
	omega: "ω",
	thetasym: "ϑ",
	upsih: "ϒ",
	piv: "ϖ",
	ensp: " ",
	emsp: " ",
	thinsp: " ",
	zwnj: "‌",
	zwj: "‍",
	lrm: "‎",
	rlm: "‏",
	ndash: "–",
	mdash: "—",
	lsquo: "‘",
	rsquo: "’",
	sbquo: "‚",
	ldquo: "“",
	rdquo: "”",
	bdquo: "„",
	dagger: "†",
	Dagger: "‡",
	bull: "•",
	hellip: "…",
	permil: "‰",
	prime: "′",
	Prime: "″",
	lsaquo: "‹",
	rsaquo: "›",
	oline: "‾",
	frasl: "⁄",
	euro: "€",
	image: "ℑ",
	weierp: "℘",
	real: "ℜ",
	trade: "™",
	alefsym: "ℵ",
	larr: "←",
	uarr: "↑",
	rarr: "→",
	darr: "↓",
	harr: "↔",
	crarr: "↵",
	lArr: "⇐",
	uArr: "⇑",
	rArr: "⇒",
	dArr: "⇓",
	hArr: "⇔",
	forall: "∀",
	part: "∂",
	exist: "∃",
	empty: "∅",
	nabla: "∇",
	isin: "∈",
	notin: "∉",
	ni: "∋",
	prod: "∏",
	sum: "∑",
	minus: "−",
	lowast: "∗",
	radic: "√",
	prop: "∝",
	infin: "∞",
	ang: "∠",
	and: "∧",
	or: "∨",
	cap: "∩",
	cup: "∪",
	int: "∫",
	there4: "∴",
	sim: "∼",
	cong: "≅",
	asymp: "≈",
	ne: "≠",
	equiv: "≡",
	le: "≤",
	ge: "≥",
	sub: "⊂",
	sup: "⊃",
	nsub: "⊄",
	sube: "⊆",
	supe: "⊇",
	oplus: "⊕",
	otimes: "⊗",
	perp: "⊥",
	sdot: "⋅",
	lceil: "⌈",
	rceil: "⌉",
	lfloor: "⌊",
	rfloor: "⌋",
	lang: "〈",
	rang: "〉",
	loz: "◊",
	spades: "♠",
	clubs: "♣",
	hearts: "♥",
	diams: "♦"
};
var hexNumber = /^[\da-fA-F]+$/;
var decimalNumber = /^\d+$/;
function getQualifiedJSXName(object) {
	if (!object) return object;
	if (object.type === "JSXIdentifier") return object.name;
	if (object.type === "JSXNamespacedName") return object.namespace.name + ":" + object.name.name;
	if (object.type === "JSXMemberExpression") return getQualifiedJSXName(object.object) + "." + getQualifiedJSXName(object.property);
}
function generateJsxParser(acorn, acornTypeScript, Parser, jsxOptions) {
	const tt = acorn.tokTypes;
	const tok = acornTypeScript.tokTypes;
	const isNewLine = acorn.isNewLine;
	const isIdentifierChar = acorn.isIdentifierChar;
	const options = Object.assign({
		allowNamespaces: true,
		allowNamespacedObjects: true
	}, jsxOptions || {});
	return class JsxParser extends Parser {
		jsx_readToken() {
			let out = "", chunkStart = this.pos;
			for (;;) {
				if (this.pos >= this.input.length) this.raise(this.start, "Unterminated JSX contents");
				let ch = this.input.charCodeAt(this.pos);
				switch (ch) {
					case 60:
					case 123:
						if (this.pos === this.start) {
							if (ch === 60 && this.exprAllowed) {
								++this.pos;
								return this.finishToken(tok.jsxTagStart);
							}
							return this.getTokenFromCode(ch);
						}
						out += this.input.slice(chunkStart, this.pos);
						return this.finishToken(tok.jsxText, out);
					case 38:
						out += this.input.slice(chunkStart, this.pos);
						out += this.jsx_readEntity();
						chunkStart = this.pos;
						break;
					case 62:
					case 125: this.raise(this.pos, "Unexpected token `" + this.input[this.pos] + "`. Did you mean `" + (ch === 62 ? "&gt;" : "&rbrace;") + "` or `{\"" + this.input[this.pos] + "\"}`?");
					default: if (isNewLine(ch)) {
						out += this.input.slice(chunkStart, this.pos);
						out += this.jsx_readNewLine(true);
						chunkStart = this.pos;
					} else ++this.pos;
				}
			}
		}
		jsx_readNewLine(normalizeCRLF) {
			let ch = this.input.charCodeAt(this.pos);
			let out;
			++this.pos;
			if (ch === 13 && this.input.charCodeAt(this.pos) === 10) {
				++this.pos;
				out = normalizeCRLF ? "\n" : "\r\n";
			} else out = String.fromCharCode(ch);
			if (this.options.locations) {
				++this.curLine;
				this.lineStart = this.pos;
			}
			return out;
		}
		jsx_readString(quote) {
			let out = "", chunkStart = ++this.pos;
			for (;;) {
				if (this.pos >= this.input.length) this.raise(this.start, "Unterminated string constant");
				let ch = this.input.charCodeAt(this.pos);
				if (ch === quote) break;
				if (ch === 38) {
					out += this.input.slice(chunkStart, this.pos);
					out += this.jsx_readEntity();
					chunkStart = this.pos;
				} else if (isNewLine(ch)) {
					out += this.input.slice(chunkStart, this.pos);
					out += this.jsx_readNewLine(false);
					chunkStart = this.pos;
				} else ++this.pos;
			}
			out += this.input.slice(chunkStart, this.pos++);
			return this.finishToken(tt.string, out);
		}
		jsx_readEntity() {
			let str = "", count = 0, entity;
			let ch = this.input[this.pos];
			if (ch !== "&") this.raise(this.pos, "Entity must start with an ampersand");
			let startPos = ++this.pos;
			while (this.pos < this.input.length && count++ < 10) {
				ch = this.input[this.pos++];
				if (ch === ";") {
					if (str[0] === "#") if (str[1] === "x") {
						str = str.substr(2);
						if (hexNumber.test(str)) entity = String.fromCharCode(parseInt(str, 16));
					} else {
						str = str.substr(1);
						if (decimalNumber.test(str)) entity = String.fromCharCode(parseInt(str, 10));
					}
					else entity = xhtml_default[str];
					break;
				}
				str += ch;
			}
			if (!entity) {
				this.pos = startPos;
				return "&";
			}
			return entity;
		}
		jsx_readWord() {
			let ch, start = this.pos;
			do
				ch = this.input.charCodeAt(++this.pos);
			while (isIdentifierChar(ch) || ch === 45);
			return this.finishToken(tok.jsxName, this.input.slice(start, this.pos));
		}
		jsx_parseIdentifier() {
			let node = this.startNode();
			if (this.type === tok.jsxName) node.name = this.value;
			else if (this.type.keyword) node.name = this.type.keyword;
			else this.unexpected();
			this.next();
			return this.finishNode(node, "JSXIdentifier");
		}
		jsx_parseNamespacedName() {
			let startPos = this.start, startLoc = this.startLoc;
			let name = this.jsx_parseIdentifier();
			if (!options.allowNamespaces || !this.eat(tt.colon)) return name;
			var node = this.startNodeAt(startPos, startLoc);
			node.namespace = name;
			node.name = this.jsx_parseIdentifier();
			return this.finishNode(node, "JSXNamespacedName");
		}
		jsx_parseElementName() {
			if (this.type === tok.jsxTagEnd) return "";
			let startPos = this.start, startLoc = this.startLoc;
			let node = this.jsx_parseNamespacedName();
			if (this.type === tt.dot && node.type === "JSXNamespacedName" && !options.allowNamespacedObjects) this.unexpected();
			while (this.eat(tt.dot)) {
				let newNode = this.startNodeAt(startPos, startLoc);
				newNode.object = node;
				newNode.property = this.jsx_parseIdentifier();
				node = this.finishNode(newNode, "JSXMemberExpression");
			}
			return node;
		}
		jsx_parseAttributeValue() {
			switch (this.type) {
				case tt.braceL:
					let node = this.jsx_parseExpressionContainer();
					if (node.expression.type === "JSXEmptyExpression") this.raise(node.start, "JSX attributes must only be assigned a non-empty expression");
					return node;
				case tok.jsxTagStart:
				case tt.string: return this.parseExprAtom();
				default: this.raise(this.start, "JSX value should be either an expression or a quoted JSX text");
			}
		}
		jsx_parseEmptyExpression() {
			let node = this.startNodeAt(this.lastTokEnd, this.lastTokEndLoc);
			return this.finishNodeAt(node, "JSXEmptyExpression", this.start, this.startLoc);
		}
		jsx_parseExpressionContainer() {
			let node = this.startNode();
			this.next();
			node.expression = this.type === tt.braceR ? this.jsx_parseEmptyExpression() : this.parseExpression();
			this.expect(tt.braceR);
			return this.finishNode(node, "JSXExpressionContainer");
		}
		jsx_parseAttribute() {
			let node = this.startNode();
			if (this.eat(tt.braceL)) {
				this.expect(tt.ellipsis);
				node.argument = this.parseMaybeAssign();
				this.expect(tt.braceR);
				return this.finishNode(node, "JSXSpreadAttribute");
			}
			node.name = this.jsx_parseNamespacedName();
			node.value = this.eat(tt.eq) ? this.jsx_parseAttributeValue() : null;
			return this.finishNode(node, "JSXAttribute");
		}
		jsx_parseOpeningElementAt(startPos, startLoc) {
			let node = this.startNodeAt(startPos, startLoc);
			node.attributes = [];
			let nodeName = this.jsx_parseElementName();
			if (nodeName) node.name = nodeName;
			while (this.type !== tt.slash && this.type !== tok.jsxTagEnd) node.attributes.push(this.jsx_parseAttribute());
			node.selfClosing = this.eat(tt.slash);
			this.expect(tok.jsxTagEnd);
			return this.finishNode(node, nodeName ? "JSXOpeningElement" : "JSXOpeningFragment");
		}
		jsx_parseClosingElementAt(startPos, startLoc) {
			let node = this.startNodeAt(startPos, startLoc);
			let nodeName = this.jsx_parseElementName();
			if (nodeName) node.name = nodeName;
			this.expect(tok.jsxTagEnd);
			return this.finishNode(node, nodeName ? "JSXClosingElement" : "JSXClosingFragment");
		}
		jsx_parseElementAt(startPos, startLoc) {
			let node = this.startNodeAt(startPos, startLoc);
			let children = [];
			let openingElement = this.jsx_parseOpeningElementAt(startPos, startLoc);
			let closingElement = null;
			if (!openingElement.selfClosing) {
				contents: for (;;) switch (this.type) {
					case tok.jsxTagStart:
						startPos = this.start;
						startLoc = this.startLoc;
						this.next();
						if (this.eat(tt.slash)) {
							closingElement = this.jsx_parseClosingElementAt(startPos, startLoc);
							break contents;
						}
						children.push(this.jsx_parseElementAt(startPos, startLoc));
						break;
					case tok.jsxText:
						children.push(this.parseExprAtom());
						break;
					case tt.braceL:
						children.push(this.jsx_parseExpressionContainer());
						break;
					default: this.unexpected();
				}
				if (getQualifiedJSXName(closingElement.name) !== getQualifiedJSXName(openingElement.name)) this.raise(closingElement.start, "Expected corresponding JSX closing tag for <" + getQualifiedJSXName(openingElement.name) + ">");
			}
			let fragmentOrElement = openingElement.name ? "Element" : "Fragment";
			node["opening" + fragmentOrElement] = openingElement;
			node["closing" + fragmentOrElement] = closingElement;
			node.children = children;
			if (this.type === tt.relational && this.value === "<") this.raise(this.start, "Adjacent JSX elements must be wrapped in an enclosing tag");
			return this.finishNode(node, "JSX" + fragmentOrElement);
		}
		jsx_parseText() {
			let node = this.parseLiteral(this.value);
			node.type = "JSXText";
			return node;
		}
		jsx_parseElement() {
			let startPos = this.start, startLoc = this.startLoc;
			this.next();
			return this.jsx_parseElementAt(startPos, startLoc);
		}
	};
}
function generateParseImportAssertions(Parse, acornTypeScript, acorn) {
	const { tokTypes } = acornTypeScript;
	const { tokTypes: tt } = acorn;
	return class ImportAttributes extends Parse {
		parseMaybeImportAttributes(node) {
			if (this.type === tt._with || this.type === tokTypes.assert) {
				this.next();
				const attributes = this.parseImportAttributes();
				if (attributes) node.attributes = attributes;
			}
		}
		parseImportAttributes() {
			this.expect(tt.braceL);
			const attrs = this.parseWithEntries();
			this.expect(tt.braceR);
			return attrs;
		}
		parseWithEntries() {
			const attrs = [];
			const attrNames = /* @__PURE__ */ new Set();
			do {
				if (this.type === tt.braceR) break;
				const node = this.startNode();
				let withionKeyNode;
				if (this.type === tt.string) withionKeyNode = this.parseLiteral(this.value);
				else withionKeyNode = this.parseIdent(true);
				this.next();
				node.key = withionKeyNode;
				if (attrNames.has(node.key.name)) this.raise(this.pos, "Duplicated key in attributes");
				attrNames.add(node.key.name);
				if (this.type !== tt.string) this.raise(this.pos, "Only string is supported as an attribute value");
				node.value = this.parseLiteral(this.value);
				attrs.push(this.finishNode(node, "ImportAttribute"));
			} while (this.eat(tt.comma));
			return attrs;
		}
	};
}
var skipWhiteSpace = /(?:\s|\/\/.*|\/\*[^]*?\*\/)*/g;
function assert(x) {
	if (!x) throw new Error("Assert fail");
}
function tsIsClassAccessor(modifier) {
	return modifier === "accessor";
}
function tsIsVarianceAnnotations(modifier) {
	return modifier === "in" || modifier === "out";
}
var FUNC_STATEMENT = 1;
var FUNC_HANGING_STATEMENT = 2;
var FUNC_NULLABLE_ID = 4;
var acornScope = {
	SCOPE_TOP: 1,
	SCOPE_FUNCTION: 2,
	SCOPE_ASYNC: 4,
	SCOPE_GENERATOR: 8,
	SCOPE_ARROW: 16,
	SCOPE_SIMPLE_CATCH: 32,
	SCOPE_SUPER: 64,
	SCOPE_DIRECT_SUPER: 128,
	SCOPE_CLASS_STATIC_BLOCK: 256,
	SCOPE_VAR: 256,
	BIND_NONE: 0,
	BIND_VAR: 1,
	BIND_LEXICAL: 2,
	BIND_FUNCTION: 3,
	BIND_SIMPLE_CATCH: 4,
	BIND_OUTSIDE: 5,
	BIND_TS_TYPE: 6,
	BIND_TS_INTERFACE: 7,
	BIND_TS_NAMESPACE: 1032,
	BIND_FLAGS_TS_EXPORT_ONLY: 1024,
	BIND_FLAGS_TS_IMPORT: 4096,
	BIND_FLAGS_TS_ENUM: 256,
	BIND_FLAGS_TS_CONST_ENUM: 512,
	BIND_FLAGS_CLASS: 128
};
function functionFlags(async, generator) {
	return acornScope.SCOPE_FUNCTION | (async ? acornScope.SCOPE_ASYNC : 0) | (generator ? acornScope.SCOPE_GENERATOR : 0);
}
function isPossiblyLiteralEnum(expression) {
	if (expression.type !== "MemberExpression") return false;
	const { computed, property } = expression;
	if (computed && (property.type !== "TemplateLiteral" || property.expressions.length > 0)) return false;
	return isUncomputedMemberExpressionChain(expression.object);
}
function isUncomputedMemberExpressionChain(expression) {
	if (expression.type === "Identifier") return true;
	if (expression.type !== "MemberExpression") return false;
	if (expression.computed) return false;
	return isUncomputedMemberExpressionChain(expression.object);
}
function tsIsAccessModifier(modifier) {
	return modifier === "private" || modifier === "public" || modifier === "protected";
}
function tokenCanStartExpression(token) {
	return Boolean(token.startsExpr);
}
function nonNull(x) {
	if (x == null) throw new Error(`Unexpected ${x} value.`);
	return x;
}
function keywordTypeFromName(value) {
	switch (value) {
		case "any": return "TSAnyKeyword";
		case "boolean": return "TSBooleanKeyword";
		case "bigint": return "TSBigIntKeyword";
		case "never": return "TSNeverKeyword";
		case "number": return "TSNumberKeyword";
		case "object": return "TSObjectKeyword";
		case "string": return "TSStringKeyword";
		case "symbol": return "TSSymbolKeyword";
		case "undefined": return "TSUndefinedKeyword";
		case "unknown": return "TSUnknownKeyword";
		default: return;
	}
}
function tsPlugin(options) {
	const { dts = false } = options || {};
	const disallowAmbiguousJSXLike = !!options?.jsx;
	return function(Parser) {
		const _acorn = Parser.acorn || acorn_exports;
		const acornTypeScript = generateAcornTypeScript(_acorn);
		const tt = _acorn.tokTypes;
		const keywordTypes = _acorn.keywordTypes;
		const isIdentifierStart = _acorn.isIdentifierStart;
		const lineBreak = _acorn.lineBreak;
		const isNewLine = _acorn.isNewLine;
		const tokContexts = _acorn.tokContexts;
		const isIdentifierChar = _acorn.isIdentifierChar;
		const { tokTypes, tokContexts: tsTokContexts, keywordsRegExp, tokenIsLiteralPropertyName, tokenIsTemplate, tokenIsTSDeclarationStart, tokenIsIdentifier, tokenIsKeywordOrIdentifier, tokenIsTSTypeOperator } = acornTypeScript;
		function nextLineBreak(code, from, end = code.length) {
			for (let i = from; i < end; i++) {
				let next = code.charCodeAt(i);
				if (isNewLine(next)) return i < end - 1 && next === 13 && code.charCodeAt(i + 1) === 10 ? i + 2 : i + 1;
			}
			return -1;
		}
		Parser = generateParseDecorators(Parser, acornTypeScript, _acorn);
		if (options?.jsx) Parser = generateJsxParser(_acorn, acornTypeScript, Parser, typeof options.jsx === "boolean" ? {} : options.jsx);
		Parser = generateParseImportAssertions(Parser, acornTypeScript, _acorn);
		class TypeScriptParser extends Parser {
			constructor(options2, input, startPos) {
				super(options2, input, startPos);
				this.preValue = null;
				this.preToken = null;
				this.isLookahead = false;
				this.isAmbientContext = false;
				this.inAbstractClass = false;
				this.inType = false;
				this.inDisallowConditionalTypesContext = false;
				this.maybeInArrowParameters = false;
				this.shouldParseArrowReturnType = void 0;
				this.shouldParseAsyncArrowReturnType = void 0;
				this.decoratorStack = [[]];
				this.importsStack = [[]];
				/**
				* we will only parse one import node or export node at same time.
				* default kind is undefined
				* */
				this.importOrExportOuterKind = void 0;
				this.tsParseConstModifier = (node) => {
					this.tsParseModifiers({
						modified: node,
						allowedModifiers: ["const"],
						disallowedModifiers: ["in", "out"],
						errorTemplate: TypeScriptError.InvalidModifierOnTypeParameterPositions
					});
				};
				this.ecmaVersion = this.options.ecmaVersion;
			}
			static get acornTypeScript() {
				return acornTypeScript;
			}
			get acornTypeScript() {
				return acornTypeScript;
			}
			getTokenFromCodeInType(code) {
				if (code === 62) return this.finishOp(tt.relational, 1);
				if (code === 60) return this.finishOp(tt.relational, 1);
				return super.getTokenFromCode(code);
			}
			readToken(code) {
				if (!this.inType) {
					let context = this.curContext();
					if (context === tsTokContexts.tc_expr) return this.jsx_readToken();
					if (context === tsTokContexts.tc_oTag || context === tsTokContexts.tc_cTag) {
						if (isIdentifierStart(code)) return this.jsx_readWord();
						if (code == 62) {
							++this.pos;
							return this.finishToken(tokTypes.jsxTagEnd);
						}
						if ((code === 34 || code === 39) && context == tsTokContexts.tc_oTag) return this.jsx_readString(code);
					}
					if (code === 60 && this.exprAllowed && this.input.charCodeAt(this.pos + 1) !== 33) {
						++this.pos;
						if (options?.jsx) return this.finishToken(tokTypes.jsxTagStart);
						else return this.finishToken(tt.relational, "<");
					}
				}
				return super.readToken(code);
			}
			getTokenFromCode(code) {
				if (this.inType) return this.getTokenFromCodeInType(code);
				if (code === 64) {
					++this.pos;
					return this.finishToken(tokTypes.at);
				}
				return super.getTokenFromCode(code);
			}
			isAbstractClass() {
				return this.ts_isContextual(tokTypes.abstract) && this.lookahead().type === tt._class;
			}
			finishNode(node, type) {
				if (node.type !== "" && node.end !== 0) return node;
				return super.finishNode(node, type);
			}
			tryParse(fn, oldState = this.cloneCurLookaheadState()) {
				const abortSignal = { node: null };
				try {
					return {
						node: fn((node2 = null) => {
							abortSignal.node = node2;
							throw abortSignal;
						}),
						error: null,
						thrown: false,
						aborted: false,
						failState: null
					};
				} catch (error) {
					const failState = this.getCurLookaheadState();
					this.setLookaheadState(oldState);
					if (error instanceof SyntaxError) return {
						node: null,
						error,
						thrown: true,
						aborted: false,
						failState
					};
					if (error === abortSignal) return {
						node: abortSignal.node,
						error: null,
						thrown: false,
						aborted: true,
						failState
					};
					throw error;
				}
			}
			setOptionalParametersError(refExpressionErrors, resultError) {
				refExpressionErrors.optionalParametersLoc = resultError?.loc ?? this.startLoc;
			}
			reScan_lt_gt() {
				if (this.type === tt.relational) {
					this.pos -= 1;
					this.readToken_lt_gt(this.fullCharCodeAtPos());
				}
			}
			reScan_lt() {
				const { type } = this;
				if (type === tt.bitShift) {
					this.pos -= 2;
					this.finishOp(tt.relational, 1);
					return tt.relational;
				}
				return type;
			}
			resetEndLocation(node, endPos = this.lastTokEnd, endLoc = this.lastTokEndLoc) {
				node.end = endPos;
				node.loc.end = endLoc;
				if (this.options.ranges) node.range[1] = endPos;
			}
			startNodeAtNode(type) {
				return super.startNodeAt(type.start, type.loc.start);
			}
			nextTokenStart() {
				return this.nextTokenStartSince(this.pos);
			}
			tsHasSomeModifiers(member, modifiers) {
				return modifiers.some((modifier) => {
					if (tsIsAccessModifier(modifier)) return member.accessibility === modifier;
					return !!member[modifier];
				});
			}
			tsIsStartOfStaticBlocks() {
				return this.isContextual("static") && this.lookaheadCharCode() === 123;
			}
			tsCheckForInvalidTypeCasts(items) {
				items.forEach((node) => {
					if (node?.type === "TSTypeCastExpression") this.raise(node.typeAnnotation.start, TypeScriptError.UnexpectedTypeAnnotation);
				});
			}
			atPossibleAsyncArrow(base) {
				return base.type === "Identifier" && base.name === "async" && this.lastTokEnd === base.end && !this.canInsertSemicolon() && base.end - base.start === 5 && base.start === this.potentialArrowAt;
			}
			tsIsIdentifier() {
				return tokenIsIdentifier(this.type);
			}
			tsTryParseTypeOrTypePredicateAnnotation() {
				return this.match(tt.colon) ? this.tsParseTypeOrTypePredicateAnnotation(tt.colon) : void 0;
			}
			tsTryParseGenericAsyncArrowFunction(startPos, startLoc, forInit) {
				if (!this.tsMatchLeftRelational()) return;
				const oldMaybeInArrowParameters = this.maybeInArrowParameters;
				this.maybeInArrowParameters = true;
				const res = this.tsTryParseAndCatch(() => {
					const node = this.startNodeAt(startPos, startLoc);
					node.typeParameters = this.tsParseTypeParameters(this.tsParseConstModifier);
					super.parseFunctionParams(node);
					node.returnType = this.tsTryParseTypeOrTypePredicateAnnotation();
					this.expect(tt.arrow);
					return node;
				});
				this.maybeInArrowParameters = oldMaybeInArrowParameters;
				if (!res) return;
				return super.parseArrowExpression(res, null, true, forInit);
			}
			tsParseTypeArgumentsInExpression() {
				if (this.reScan_lt() !== tt.relational) return;
				return this.tsParseTypeArguments();
			}
			tsInNoContext(cb) {
				const oldContext = this.context;
				this.context = [oldContext[0]];
				try {
					return cb();
				} finally {
					this.context = oldContext;
				}
			}
			tsTryParseTypeAnnotation() {
				return this.match(tt.colon) ? this.tsParseTypeAnnotation() : void 0;
			}
			isUnparsedContextual(nameStart, name) {
				const nameEnd = nameStart + name.length;
				if (this.input.slice(nameStart, nameEnd) === name) {
					const nextCh = this.input.charCodeAt(nameEnd);
					return !(isIdentifierChar(nextCh) || (nextCh & 64512) === 55296);
				}
				return false;
			}
			isAbstractConstructorSignature() {
				return this.ts_isContextual(tokTypes.abstract) && this.lookahead().type === tt._new;
			}
			nextTokenStartSince(pos) {
				skipWhiteSpace.lastIndex = pos;
				return skipWhiteSpace.test(this.input) ? skipWhiteSpace.lastIndex : pos;
			}
			lookaheadCharCode() {
				return this.input.charCodeAt(this.nextTokenStart());
			}
			compareLookaheadState(state, state2) {
				for (const key of Object.keys(state)) if (state[key] !== state2[key]) return false;
				return true;
			}
			createLookaheadState() {
				this.value = null;
				this.context = [this.curContext()];
			}
			getCurLookaheadState() {
				return {
					endLoc: this.endLoc,
					lastTokEnd: this.lastTokEnd,
					lastTokStart: this.lastTokStart,
					lastTokStartLoc: this.lastTokStartLoc,
					pos: this.pos,
					value: this.value,
					type: this.type,
					start: this.start,
					end: this.end,
					context: this.context,
					startLoc: this.startLoc,
					lastTokEndLoc: this.lastTokEndLoc,
					curLine: this.curLine,
					lineStart: this.lineStart,
					curPosition: this.curPosition,
					containsEsc: this.containsEsc
				};
			}
			cloneCurLookaheadState() {
				return {
					pos: this.pos,
					value: this.value,
					type: this.type,
					start: this.start,
					end: this.end,
					context: this.context && this.context.slice(),
					startLoc: this.startLoc,
					lastTokEndLoc: this.lastTokEndLoc,
					endLoc: this.endLoc,
					lastTokEnd: this.lastTokEnd,
					lastTokStart: this.lastTokStart,
					lastTokStartLoc: this.lastTokStartLoc,
					curLine: this.curLine,
					lineStart: this.lineStart,
					curPosition: this.curPosition,
					containsEsc: this.containsEsc
				};
			}
			setLookaheadState(state) {
				this.pos = state.pos;
				this.value = state.value;
				this.endLoc = state.endLoc;
				this.lastTokEnd = state.lastTokEnd;
				this.lastTokStart = state.lastTokStart;
				this.lastTokStartLoc = state.lastTokStartLoc;
				this.type = state.type;
				this.start = state.start;
				this.end = state.end;
				this.context = state.context;
				this.startLoc = state.startLoc;
				this.lastTokEndLoc = state.lastTokEndLoc;
				this.curLine = state.curLine;
				this.lineStart = state.lineStart;
				this.curPosition = state.curPosition;
				this.containsEsc = state.containsEsc;
			}
			tsLookAhead(f) {
				const state = this.getCurLookaheadState();
				const res = f();
				this.setLookaheadState(state);
				return res;
			}
			lookahead(number) {
				const oldState = this.getCurLookaheadState();
				this.createLookaheadState();
				this.isLookahead = true;
				if (number !== void 0) for (let i = 0; i < number; i++) this.nextToken();
				else this.nextToken();
				this.isLookahead = false;
				const curState = this.getCurLookaheadState();
				this.setLookaheadState(oldState);
				return curState;
			}
			readWord() {
				let word = this.readWord1();
				let type = tt.name;
				if (this.keywords.test(word)) type = keywordTypes[word];
				else if (new RegExp(keywordsRegExp).test(word)) type = tokTypes[word];
				return this.finishToken(type, word);
			}
			skipBlockComment() {
				let startLoc;
				if (!this.isLookahead) startLoc = this.options.onComment && this.curPosition();
				let start = this.pos, end = this.input.indexOf("*/", this.pos += 2);
				if (end === -1) this.raise(this.pos - 2, "Unterminated comment");
				this.pos = end + 2;
				if (this.options.locations) for (let nextBreak, pos = start; (nextBreak = nextLineBreak(this.input, pos, this.pos)) > -1;) {
					++this.curLine;
					pos = this.lineStart = nextBreak;
				}
				if (this.isLookahead) return;
				if (this.options.onComment) this.options.onComment(true, this.input.slice(start + 2, end), start, this.pos, startLoc, this.curPosition());
			}
			skipLineComment(startSkip) {
				let start = this.pos;
				let startLoc;
				if (!this.isLookahead) startLoc = this.options.onComment && this.curPosition();
				let ch = this.input.charCodeAt(this.pos += startSkip);
				while (this.pos < this.input.length && !isNewLine(ch)) ch = this.input.charCodeAt(++this.pos);
				if (this.isLookahead) return;
				if (this.options.onComment) this.options.onComment(false, this.input.slice(start + startSkip, this.pos), start, this.pos, startLoc, this.curPosition());
			}
			finishToken(type, val) {
				this.preValue = this.value;
				this.preToken = this.type;
				this.end = this.pos;
				if (this.options.locations) this.endLoc = this.curPosition();
				let prevType = this.type;
				this.type = type;
				this.value = val;
				if (!this.isLookahead) this.updateContext(prevType);
			}
			resetStartLocation(node, start, startLoc) {
				node.start = start;
				node.loc.start = startLoc;
				if (this.options.ranges) node.range[0] = start;
			}
			isLineTerminator() {
				return this.eat(tt.semi) || super.canInsertSemicolon();
			}
			hasFollowingLineBreak() {
				skipWhiteSpaceToLineBreak.lastIndex = this.end;
				return skipWhiteSpaceToLineBreak.test(this.input);
			}
			addExtra(node, key, value, enumerable = true) {
				if (!node) return;
				const extra = node.extra = node.extra || {};
				if (enumerable) extra[key] = value;
				else Object.defineProperty(extra, key, {
					enumerable,
					value
				});
			}
			/**
			* Test if current token is a literal property name
			* https://tc39.es/ecma262/#prod-LiteralPropertyName
			* LiteralPropertyName:
			*   IdentifierName
			*   StringLiteral
			*   NumericLiteral
			*   BigIntLiteral
			*/
			isLiteralPropertyName() {
				return tokenIsLiteralPropertyName(this.type);
			}
			hasPrecedingLineBreak() {
				return lineBreak.test(this.input.slice(this.lastTokEnd, this.start));
			}
			createIdentifier(node, name) {
				node.name = name;
				return this.finishNode(node, "Identifier");
			}
			/**
			* Reset the start location of node to the start location of locationNode
			*/
			resetStartLocationFromNode(node, locationNode) {
				this.resetStartLocation(node, locationNode.start, locationNode.loc.start);
			}
			isThisParam(param) {
				return param.type === "Identifier" && param.name === "this";
			}
			isLookaheadContextual(name) {
				const next = this.nextTokenStart();
				return this.isUnparsedContextual(next, name);
			}
			/**
			* ts type isContextual
			* @param {TokenType} type
			* @param {TokenType} token
			* @returns {boolean}
			* */
			ts_type_isContextual(type, token) {
				return type === token && !this.containsEsc;
			}
			/**
			* ts isContextual
			* @param {TokenType} token
			* @returns {boolean}
			* */
			ts_isContextual(token) {
				return this.type === token && !this.containsEsc;
			}
			ts_isContextualWithState(state, token) {
				return state.type === token && !state.containsEsc;
			}
			isContextualWithState(keyword, state) {
				return state.type === tt.name && state.value === keyword && !state.containsEsc;
			}
			tsIsStartOfMappedType() {
				this.next();
				if (this.eat(tt.plusMin)) return this.ts_isContextual(tokTypes.readonly);
				if (this.ts_isContextual(tokTypes.readonly)) this.next();
				if (!this.match(tt.bracketL)) return false;
				this.next();
				if (!this.tsIsIdentifier()) return false;
				this.next();
				return this.match(tt._in);
			}
			tsInDisallowConditionalTypesContext(cb) {
				const oldInDisallowConditionalTypesContext = this.inDisallowConditionalTypesContext;
				this.inDisallowConditionalTypesContext = true;
				try {
					return cb();
				} finally {
					this.inDisallowConditionalTypesContext = oldInDisallowConditionalTypesContext;
				}
			}
			tsTryParseType() {
				return this.tsEatThenParseType(tt.colon);
			}
			/**
			* Whether current token matches given type
			*
			* @param {TokenType} type
			* @returns {boolean}
			* @memberof Tokenizer
			*/
			match(type) {
				return this.type === type;
			}
			matchJsx(type) {
				return this.type === acornTypeScript.tokTypes[type];
			}
			ts_eatWithState(type, nextCount, state) {
				if (type === state.type) {
					for (let i = 0; i < nextCount; i++) this.next();
					return true;
				} else return false;
			}
			ts_eatContextualWithState(name, nextCount, state) {
				if (keywordsRegExp.test(name)) {
					if (this.ts_isContextualWithState(state, tokTypes[name])) {
						for (let i = 0; i < nextCount; i++) this.next();
						return true;
					}
					return false;
				} else {
					if (!this.isContextualWithState(name, state)) return false;
					for (let i = 0; i < nextCount; i++) this.next();
					return true;
				}
			}
			canHaveLeadingDecorator() {
				return this.match(tt._class) || this.isAbstractClass();
			}
			eatContextual(name) {
				if (keywordsRegExp.test(name)) {
					if (this.ts_isContextual(tokTypes[name])) {
						this.next();
						return true;
					}
					return false;
				} else return super.eatContextual(name);
			}
			tsIsExternalModuleReference() {
				return this.isContextual("require") && this.lookaheadCharCode() === 40;
			}
			tsParseExternalModuleReference() {
				const node = this.startNode();
				this.expectContextual("require");
				this.expect(tt.parenL);
				if (!this.match(tt.string)) this.unexpected();
				node.expression = this.parseExprAtom();
				this.expect(tt.parenR);
				return this.finishNode(node, "TSExternalModuleReference");
			}
			tsParseEntityName(allowReservedWords = true) {
				let entity = this.parseIdent(allowReservedWords);
				while (this.eat(tt.dot)) {
					const node = this.startNodeAtNode(entity);
					node.left = entity;
					node.right = this.parseIdent(allowReservedWords);
					entity = this.finishNode(node, "TSQualifiedName");
				}
				return entity;
			}
			tsParseEnumMember() {
				const node = this.startNode();
				node.id = this.match(tt.string) ? this.parseLiteral(this.value) : this.parseIdent(true);
				if (this.eat(tt.eq)) node.initializer = this.parseMaybeAssign();
				return this.finishNode(node, "TSEnumMember");
			}
			tsParseEnumDeclaration(node, properties = {}) {
				if (properties.const) node.const = true;
				if (properties.declare) node.declare = true;
				this.expectContextual("enum");
				node.id = this.parseIdent();
				this.checkLValSimple(node.id);
				this.expect(tt.braceL);
				node.members = this.tsParseDelimitedList("EnumMembers", this.tsParseEnumMember.bind(this));
				this.expect(tt.braceR);
				return this.finishNode(node, "TSEnumDeclaration");
			}
			tsParseModuleBlock() {
				const node = this.startNode();
				this.enterScope(TS_SCOPE_OTHER);
				this.expect(tt.braceL);
				node.body = [];
				while (this.type !== tt.braceR) {
					let stmt = this.parseStatement(null, true);
					node.body.push(stmt);
				}
				this.next();
				super.exitScope();
				return this.finishNode(node, "TSModuleBlock");
			}
			tsParseAmbientExternalModuleDeclaration(node) {
				if (this.ts_isContextual(tokTypes.global)) {
					node.global = true;
					node.id = this.parseIdent();
				} else if (this.match(tt.string)) node.id = this.parseLiteral(this.value);
				else this.unexpected();
				if (this.match(tt.braceL)) {
					this.enterScope(TS_SCOPE_TS_MODULE);
					node.body = this.tsParseModuleBlock();
					super.exitScope();
				} else super.semicolon();
				return this.finishNode(node, "TSModuleDeclaration");
			}
			tsTryParseDeclare(nany) {
				if (this.isLineTerminator()) return;
				let starttype = this.type;
				let kind;
				if (this.isContextual("let")) {
					starttype = tt._var;
					kind = "let";
				}
				return this.tsInAmbientContext(() => {
					if (starttype === tt._function) {
						nany.declare = true;
						return this.parseFunctionStatement(nany, false, true);
					}
					if (starttype === tt._class) {
						nany.declare = true;
						return this.parseClass(nany, true);
					}
					if (starttype === tokTypes.enum) return this.tsParseEnumDeclaration(nany, { declare: true });
					if (starttype === tokTypes.global) return this.tsParseAmbientExternalModuleDeclaration(nany);
					if (starttype === tt._const || starttype === tt._var) {
						if (!this.match(tt._const) || !this.isLookaheadContextual("enum")) {
							nany.declare = true;
							return this.parseVarStatement(nany, kind || this.value, true);
						}
						this.expect(tt._const);
						return this.tsParseEnumDeclaration(nany, {
							const: true,
							declare: true
						});
					}
					if (starttype === tokTypes.interface) {
						const result = this.tsParseInterfaceDeclaration(nany, { declare: true });
						if (result) return result;
					}
					if (tokenIsIdentifier(starttype)) return this.tsParseDeclaration(nany, this.value, true);
				});
			}
			tsIsListTerminator(kind) {
				switch (kind) {
					case "EnumMembers":
					case "TypeMembers": return this.match(tt.braceR);
					case "HeritageClauseElement": return this.match(tt.braceL);
					case "TupleElementTypes": return this.match(tt.bracketR);
					case "TypeParametersOrArguments": return this.tsMatchRightRelational();
				}
			}
			/**
			* If !expectSuccess, returns undefined instead of failing to parse.
			* If expectSuccess, parseElement should always return a defined value.
			*/
			tsParseDelimitedListWorker(kind, parseElement, expectSuccess, refTrailingCommaPos) {
				const result = [];
				let trailingCommaPos = -1;
				for (;;) {
					if (this.tsIsListTerminator(kind)) break;
					trailingCommaPos = -1;
					const element = parseElement();
					if (element == null) return;
					result.push(element);
					if (this.eat(tt.comma)) {
						trailingCommaPos = this.lastTokStart;
						continue;
					}
					if (this.tsIsListTerminator(kind)) break;
					if (expectSuccess) this.expect(tt.comma);
					return;
				}
				if (refTrailingCommaPos) refTrailingCommaPos.value = trailingCommaPos;
				return result;
			}
			tsParseDelimitedList(kind, parseElement, refTrailingCommaPos) {
				return nonNull(this.tsParseDelimitedListWorker(kind, parseElement, true, refTrailingCommaPos));
			}
			tsParseBracketedList(kind, parseElement, bracket, skipFirstToken, refTrailingCommaPos) {
				if (!skipFirstToken) if (bracket) this.expect(tt.bracketL);
				else this.expect(tt.relational);
				const result = this.tsParseDelimitedList(kind, parseElement, refTrailingCommaPos);
				if (bracket) this.expect(tt.bracketR);
				else this.expect(tt.relational);
				return result;
			}
			tsParseTypeParameterName() {
				return this.parseIdent().name;
			}
			tsEatThenParseType(token) {
				return !this.match(token) ? void 0 : this.tsNextThenParseType();
			}
			tsExpectThenParseType(token) {
				return this.tsDoThenParseType(() => this.expect(token));
			}
			tsNextThenParseType() {
				return this.tsDoThenParseType(() => this.next());
			}
			tsDoThenParseType(cb) {
				return this.tsInType(() => {
					cb();
					return this.tsParseType();
				});
			}
			tsSkipParameterStart() {
				if (tokenIsIdentifier(this.type) || this.match(tt._this)) {
					this.next();
					return true;
				}
				if (this.match(tt.braceL)) try {
					this.parseObj(true);
					return true;
				} catch {
					return false;
				}
				if (this.match(tt.bracketL)) {
					this.next();
					try {
						this.parseBindingList(tt.bracketR, true, true);
						return true;
					} catch {
						return false;
					}
				}
				return false;
			}
			tsIsUnambiguouslyStartOfFunctionType() {
				this.next();
				if (this.match(tt.parenR) || this.match(tt.ellipsis)) return true;
				if (this.tsSkipParameterStart()) {
					if (this.match(tt.colon) || this.match(tt.comma) || this.match(tt.question) || this.match(tt.eq)) return true;
					if (this.match(tt.parenR)) {
						this.next();
						if (this.match(tt.arrow)) return true;
					}
				}
				return false;
			}
			tsIsStartOfFunctionType() {
				if (this.tsMatchLeftRelational()) return true;
				return this.match(tt.parenL) && this.tsLookAhead(this.tsIsUnambiguouslyStartOfFunctionType.bind(this));
			}
			tsInAllowConditionalTypesContext(cb) {
				const oldInDisallowConditionalTypesContext = this.inDisallowConditionalTypesContext;
				this.inDisallowConditionalTypesContext = false;
				try {
					return cb();
				} finally {
					this.inDisallowConditionalTypesContext = oldInDisallowConditionalTypesContext;
				}
			}
			tsParseBindingListForSignature() {
				return super.parseBindingList(tt.parenR, true, true).map((pattern) => {
					if (pattern.type !== "Identifier" && pattern.type !== "RestElement" && pattern.type !== "ObjectPattern" && pattern.type !== "ArrayPattern") this.raise(pattern.start, TypeScriptError.UnsupportedSignatureParameterKind({ type: pattern.type }));
					return pattern;
				});
			}
			tsParseTypePredicateAsserts() {
				if (this.type !== tokTypes.asserts) return false;
				const containsEsc = this.containsEsc;
				this.next();
				if (!tokenIsIdentifier(this.type) && !this.match(tt._this)) return false;
				if (containsEsc) this.raise(this.lastTokStart, "Escape sequence in keyword asserts");
				return true;
			}
			tsParseThisTypeNode() {
				const node = this.startNode();
				this.next();
				return this.finishNode(node, "TSThisType");
			}
			tsParseTypeAnnotation(eatColon = true, t = this.startNode()) {
				this.tsInType(() => {
					if (eatColon) this.expect(tt.colon);
					t.typeAnnotation = this.tsParseType();
				});
				return this.finishNode(t, "TSTypeAnnotation");
			}
			tsParseThisTypePredicate(lhs) {
				this.next();
				const node = this.startNodeAtNode(lhs);
				node.parameterName = lhs;
				node.typeAnnotation = this.tsParseTypeAnnotation(false);
				node.asserts = false;
				return this.finishNode(node, "TSTypePredicate");
			}
			tsParseThisTypeOrThisTypePredicate() {
				const thisKeyword = this.tsParseThisTypeNode();
				if (this.isContextual("is") && !this.hasPrecedingLineBreak()) return this.tsParseThisTypePredicate(thisKeyword);
				else return thisKeyword;
			}
			tsParseTypePredicatePrefix() {
				const id = this.parseIdent();
				if (this.isContextual("is") && !this.hasPrecedingLineBreak()) {
					this.next();
					return id;
				}
			}
			tsParseTypeOrTypePredicateAnnotation(returnToken) {
				return this.tsInType(() => {
					const t = this.startNode();
					this.expect(returnToken);
					const node = this.startNode();
					const asserts = !!this.tsTryParse(this.tsParseTypePredicateAsserts.bind(this));
					if (asserts && this.match(tt._this)) {
						let thisTypePredicate = this.tsParseThisTypeOrThisTypePredicate();
						if (thisTypePredicate.type === "TSThisType") {
							node.parameterName = thisTypePredicate;
							node.asserts = true;
							node.typeAnnotation = null;
							thisTypePredicate = this.finishNode(node, "TSTypePredicate");
						} else {
							this.resetStartLocationFromNode(thisTypePredicate, node);
							thisTypePredicate.asserts = true;
						}
						t.typeAnnotation = thisTypePredicate;
						return this.finishNode(t, "TSTypeAnnotation");
					}
					const typePredicateVariable = this.tsIsIdentifier() && this.tsTryParse(this.tsParseTypePredicatePrefix.bind(this));
					if (!typePredicateVariable) {
						if (!asserts) return this.tsParseTypeAnnotation(false, t);
						node.parameterName = this.parseIdent();
						node.asserts = asserts;
						node.typeAnnotation = null;
						t.typeAnnotation = this.finishNode(node, "TSTypePredicate");
						return this.finishNode(t, "TSTypeAnnotation");
					}
					const type = this.tsParseTypeAnnotation(false);
					node.parameterName = typePredicateVariable;
					node.typeAnnotation = type;
					node.asserts = asserts;
					t.typeAnnotation = this.finishNode(node, "TSTypePredicate");
					return this.finishNode(t, "TSTypeAnnotation");
				});
			}
			tsFillSignature(returnToken, signature) {
				const returnTokenRequired = returnToken === tt.arrow;
				const paramsKey = "parameters";
				const returnTypeKey = "typeAnnotation";
				signature.typeParameters = this.tsTryParseTypeParameters();
				this.expect(tt.parenL);
				signature[paramsKey] = this.tsParseBindingListForSignature();
				if (returnTokenRequired) signature[returnTypeKey] = this.tsParseTypeOrTypePredicateAnnotation(returnToken);
				else if (this.match(returnToken)) signature[returnTypeKey] = this.tsParseTypeOrTypePredicateAnnotation(returnToken);
			}
			tsTryNextParseConstantContext() {
				if (this.lookahead().type !== tt._const) return null;
				this.next();
				const typeReference = this.tsParseTypeReference();
				if (typeReference.typeParameters || typeReference.typeArguments) this.raise(typeReference.typeName.start, TypeScriptError.CannotFindName({ name: "const" }));
				return typeReference;
			}
			tsParseFunctionOrConstructorType(type, abstract) {
				const node = this.startNode();
				if (type === "TSConstructorType") {
					node.abstract = !!abstract;
					if (abstract) this.next();
					this.next();
				}
				this.tsInAllowConditionalTypesContext(() => this.tsFillSignature(tt.arrow, node));
				return this.finishNode(node, type);
			}
			tsParseUnionOrIntersectionType(kind, parseConstituentType, operator) {
				const node = this.startNode();
				const hasLeadingOperator = this.eat(operator);
				const types = [];
				do
					types.push(parseConstituentType());
				while (this.eat(operator));
				if (types.length === 1 && !hasLeadingOperator) return types[0];
				node.types = types;
				return this.finishNode(node, kind);
			}
			tsCheckTypeAnnotationForReadOnly(node) {
				switch (node.typeAnnotation.type) {
					case "TSTupleType":
					case "TSArrayType": return;
					default: this.raise(node.start, TypeScriptError.UnexpectedReadonly);
				}
			}
			tsParseTypeOperator() {
				const node = this.startNode();
				const operator = this.value;
				this.next();
				node.operator = operator;
				node.typeAnnotation = this.tsParseTypeOperatorOrHigher();
				if (operator === "readonly") this.tsCheckTypeAnnotationForReadOnly(node);
				return this.finishNode(node, "TSTypeOperator");
			}
			tsParseConstraintForInferType() {
				if (this.eat(tt._extends)) {
					const constraint = this.tsInDisallowConditionalTypesContext(() => this.tsParseType());
					if (this.inDisallowConditionalTypesContext || !this.match(tt.question)) return constraint;
				}
			}
			tsParseInferType() {
				const node = this.startNode();
				this.expectContextual("infer");
				const typeParameter = this.startNode();
				typeParameter.name = this.tsParseTypeParameterName();
				typeParameter.constraint = this.tsTryParse(() => this.tsParseConstraintForInferType());
				node.typeParameter = this.finishNode(typeParameter, "TSTypeParameter");
				return this.finishNode(node, "TSInferType");
			}
			tsParseLiteralTypeNode() {
				const node = this.startNode();
				node.literal = (() => {
					switch (this.type) {
						case tt.num:
						case tt.string:
						case tt._true:
						case tt._false: return this.parseExprAtom();
						default: this.unexpected();
					}
				})();
				return this.finishNode(node, "TSLiteralType");
			}
			tsParseImportType() {
				const node = this.startNode();
				this.expect(tt._import);
				this.expect(tt.parenL);
				if (!this.match(tt.string)) this.raise(this.start, TypeScriptError.UnsupportedImportTypeArgument);
				node.argument = this.parseExprAtom();
				this.expect(tt.parenR);
				if (this.eat(tt.dot)) node.qualifier = this.tsParseEntityName();
				if (this.tsMatchLeftRelational()) node.typeArguments = this.tsParseTypeArguments();
				return this.finishNode(node, "TSImportType");
			}
			tsParseTypeQuery() {
				const node = this.startNode();
				this.expect(tt._typeof);
				if (this.match(tt._import)) node.exprName = this.tsParseImportType();
				else node.exprName = this.tsParseEntityName();
				if (!this.hasPrecedingLineBreak() && this.tsMatchLeftRelational()) node.typeArguments = this.tsParseTypeArguments();
				return this.finishNode(node, "TSTypeQuery");
			}
			tsParseMappedTypeParameter() {
				const node = this.startNode();
				node.name = this.tsParseTypeParameterName();
				node.constraint = this.tsExpectThenParseType(tt._in);
				return this.finishNode(node, "TSTypeParameter");
			}
			tsParseMappedType() {
				const node = this.startNode();
				this.expect(tt.braceL);
				if (this.match(tt.plusMin)) {
					node.readonly = this.value;
					this.next();
					this.expectContextual("readonly");
				} else if (this.eatContextual("readonly")) node.readonly = true;
				this.expect(tt.bracketL);
				node.typeParameter = this.tsParseMappedTypeParameter();
				node.nameType = this.eatContextual("as") ? this.tsParseType() : null;
				this.expect(tt.bracketR);
				if (this.match(tt.plusMin)) {
					node.optional = this.value;
					this.next();
					this.expect(tt.question);
				} else if (this.eat(tt.question)) node.optional = true;
				node.typeAnnotation = this.tsTryParseType();
				this.semicolon();
				this.expect(tt.braceR);
				return this.finishNode(node, "TSMappedType");
			}
			tsParseTypeLiteral() {
				const node = this.startNode();
				node.members = this.tsParseObjectTypeMembers();
				return this.finishNode(node, "TSTypeLiteral");
			}
			tsParseTupleElementType() {
				const startLoc = this.startLoc;
				const startPos = this["start"];
				const rest = this.eat(tt.ellipsis);
				let type = this.tsParseType();
				const optional = this.eat(tt.question);
				if (this.eat(tt.colon)) {
					const labeledNode = this.startNodeAtNode(type);
					labeledNode.optional = optional;
					if (type.type === "TSTypeReference" && !type.typeArguments && type.typeName.type === "Identifier") labeledNode.label = type.typeName;
					else {
						this.raise(type.start, TypeScriptError.InvalidTupleMemberLabel);
						labeledNode.label = type;
					}
					labeledNode.elementType = this.tsParseType();
					type = this.finishNode(labeledNode, "TSNamedTupleMember");
				} else if (optional) {
					const optionalTypeNode = this.startNodeAtNode(type);
					optionalTypeNode.typeAnnotation = type;
					type = this.finishNode(optionalTypeNode, "TSOptionalType");
				}
				if (rest) {
					const restNode = this.startNodeAt(startPos, startLoc);
					restNode.typeAnnotation = type;
					type = this.finishNode(restNode, "TSRestType");
				}
				return type;
			}
			tsParseTupleType() {
				const node = this.startNode();
				node.elementTypes = this.tsParseBracketedList("TupleElementTypes", this.tsParseTupleElementType.bind(this), true, false);
				let seenOptionalElement = false;
				node.elementTypes.forEach((elementNode) => {
					const { type } = elementNode;
					if (seenOptionalElement && type !== "TSRestType" && type !== "TSOptionalType" && !(type === "TSNamedTupleMember" && elementNode.optional)) this.raise(elementNode.start, TypeScriptError.OptionalTypeBeforeRequired);
					seenOptionalElement ||= type === "TSNamedTupleMember" && elementNode.optional || type === "TSOptionalType";
					if (type === "TSRestType") elementNode = elementNode.typeAnnotation;
				});
				return this.finishNode(node, "TSTupleType");
			}
			tsParseTemplateLiteralType() {
				const node = this.startNode();
				node.literal = this.parseTemplate({ isTagged: false });
				return this.finishNode(node, "TSLiteralType");
			}
			tsParseTypeReference() {
				const node = this.startNode();
				node.typeName = this.tsParseEntityName();
				if (!this.hasPrecedingLineBreak() && this.tsMatchLeftRelational()) node.typeArguments = this.tsParseTypeArguments();
				return this.finishNode(node, "TSTypeReference");
			}
			tsMatchLeftRelational() {
				return this.match(tt.relational) && this.value === "<";
			}
			tsMatchRightRelational() {
				return this.match(tt.relational) && this.value === ">";
			}
			tsParseParenthesizedType() {
				const node = this.startNode();
				this.expect(tt.parenL);
				node.typeAnnotation = this.tsParseType();
				this.expect(tt.parenR);
				return this.finishNode(node, "TSParenthesizedType");
			}
			tsParseNonArrayType() {
				switch (this.type) {
					case tt.string:
					case tt.num:
					case tt._true:
					case tt._false: return this.tsParseLiteralTypeNode();
					case tt.plusMin:
						if (this.value === "-") {
							const node = this.startNode();
							if (this.lookahead().type !== tt.num) this.unexpected();
							node.literal = this.parseMaybeUnary();
							return this.finishNode(node, "TSLiteralType");
						}
						break;
					case tt._this: return this.tsParseThisTypeOrThisTypePredicate();
					case tt._typeof: return this.tsParseTypeQuery();
					case tt._import: return this.tsParseImportType();
					case tt.braceL: return this.tsLookAhead(this.tsIsStartOfMappedType.bind(this)) ? this.tsParseMappedType() : this.tsParseTypeLiteral();
					case tt.bracketL: return this.tsParseTupleType();
					case tt.parenL: return this.tsParseParenthesizedType();
					case tt.backQuote:
					case tt.dollarBraceL: return this.tsParseTemplateLiteralType();
					default: {
						const { type } = this;
						if (tokenIsIdentifier(type) || type === tt._void || type === tt._null) {
							const nodeType = type === tt._void ? "TSVoidKeyword" : type === tt._null ? "TSNullKeyword" : keywordTypeFromName(this.value);
							if (nodeType !== void 0 && this.lookaheadCharCode() !== 46) {
								const node = this.startNode();
								this.next();
								return this.finishNode(node, nodeType);
							}
							return this.tsParseTypeReference();
						}
					}
				}
				this.unexpected();
			}
			tsParseArrayTypeOrHigher() {
				let type = this.tsParseNonArrayType();
				while (!this.hasPrecedingLineBreak() && this.eat(tt.bracketL)) if (this.match(tt.bracketR)) {
					const node = this.startNodeAtNode(type);
					node.elementType = type;
					this.expect(tt.bracketR);
					type = this.finishNode(node, "TSArrayType");
				} else {
					const node = this.startNodeAtNode(type);
					node.objectType = type;
					node.indexType = this.tsParseType();
					this.expect(tt.bracketR);
					type = this.finishNode(node, "TSIndexedAccessType");
				}
				return type;
			}
			tsParseTypeOperatorOrHigher() {
				return tokenIsTSTypeOperator(this.type) && !this.containsEsc ? this.tsParseTypeOperator() : this.isContextual("infer") ? this.tsParseInferType() : this.tsInAllowConditionalTypesContext(() => this.tsParseArrayTypeOrHigher());
			}
			tsParseIntersectionTypeOrHigher() {
				return this.tsParseUnionOrIntersectionType("TSIntersectionType", this.tsParseTypeOperatorOrHigher.bind(this), tt.bitwiseAND);
			}
			tsParseUnionTypeOrHigher() {
				return this.tsParseUnionOrIntersectionType("TSUnionType", this.tsParseIntersectionTypeOrHigher.bind(this), tt.bitwiseOR);
			}
			tsParseNonConditionalType() {
				if (this.tsIsStartOfFunctionType()) return this.tsParseFunctionOrConstructorType("TSFunctionType");
				if (this.match(tt._new)) return this.tsParseFunctionOrConstructorType("TSConstructorType");
				else if (this.isAbstractConstructorSignature()) return this.tsParseFunctionOrConstructorType("TSConstructorType", true);
				return this.tsParseUnionTypeOrHigher();
			}
			/** Be sure to be in a type context before calling this, using `tsInType`. */
			tsParseType() {
				assert(this.inType);
				const type = this.tsParseNonConditionalType();
				if (this.inDisallowConditionalTypesContext || this.hasPrecedingLineBreak() || !this.eat(tt._extends)) return type;
				const node = this.startNodeAtNode(type);
				node.checkType = type;
				node.extendsType = this.tsInDisallowConditionalTypesContext(() => this.tsParseNonConditionalType());
				this.expect(tt.question);
				node.trueType = this.tsInAllowConditionalTypesContext(() => this.tsParseType());
				this.expect(tt.colon);
				node.falseType = this.tsInAllowConditionalTypesContext(() => this.tsParseType());
				return this.finishNode(node, "TSConditionalType");
			}
			tsIsUnambiguouslyIndexSignature() {
				this.next();
				if (tokenIsIdentifier(this.type)) {
					this.next();
					return this.match(tt.colon);
				}
				return false;
			}
			/**
			* Runs `cb` in a type context.
			* This should be called one token *before* the first type token,
			* so that the call to `next()` is run in type context.
			*/
			tsInType(cb) {
				const oldInType = this.inType;
				this.inType = true;
				try {
					return cb();
				} finally {
					this.inType = oldInType;
				}
			}
			tsTryParseIndexSignature(node) {
				if (!(this.match(tt.bracketL) && this.tsLookAhead(this.tsIsUnambiguouslyIndexSignature.bind(this)))) return;
				this.expect(tt.bracketL);
				const id = this.parseIdent();
				id.typeAnnotation = this.tsParseTypeAnnotation();
				this.resetEndLocation(id);
				this.expect(tt.bracketR);
				node.parameters = [id];
				const type = this.tsTryParseTypeAnnotation();
				if (type) node.typeAnnotation = type;
				this.tsParseTypeMemberSemicolon();
				return this.finishNode(node, "TSIndexSignature");
			}
			tsParseNoneModifiers(node) {
				this.tsParseModifiers({
					modified: node,
					allowedModifiers: [],
					disallowedModifiers: ["in", "out"],
					errorTemplate: TypeScriptError.InvalidModifierOnTypeParameterPositions
				});
			}
			tsParseTypeParameter(parseModifiers = this.tsParseNoneModifiers.bind(this)) {
				const node = this.startNode();
				parseModifiers(node);
				node.name = this.tsParseTypeParameterName();
				node.constraint = this.tsEatThenParseType(tt._extends);
				node.default = this.tsEatThenParseType(tt.eq);
				return this.finishNode(node, "TSTypeParameter");
			}
			tsParseTypeParameters(parseModifiers) {
				const node = this.startNode();
				if (this.tsMatchLeftRelational() || this.matchJsx("jsxTagStart")) this.next();
				else this.unexpected();
				const refTrailingCommaPos = { value: -1 };
				node.params = this.tsParseBracketedList("TypeParametersOrArguments", this.tsParseTypeParameter.bind(this, parseModifiers), false, true, refTrailingCommaPos);
				if (node.params.length === 0) this.raise(this.start, TypeScriptError.EmptyTypeParameters);
				if (refTrailingCommaPos.value !== -1) this.addExtra(node, "trailingComma", refTrailingCommaPos.value);
				return this.finishNode(node, "TSTypeParameterDeclaration");
			}
			tsTryParseTypeParameters(parseModifiers) {
				if (this.tsMatchLeftRelational()) return this.tsParseTypeParameters(parseModifiers);
			}
			tsTryParse(f) {
				const state = this.getCurLookaheadState();
				const result = f();
				if (result !== void 0 && result !== false) return result;
				else {
					this.setLookaheadState(state);
					return;
				}
			}
			tsTokenCanFollowModifier() {
				return (this.match(tt.bracketL) || this.match(tt.braceL) || this.match(tt.star) || this.match(tt.ellipsis) || this.match(tt.privateId) || this.isLiteralPropertyName()) && !this.hasPrecedingLineBreak();
			}
			tsNextTokenCanFollowModifier() {
				this.next(true);
				return this.tsTokenCanFollowModifier();
			}
			/** Parses a modifier matching one the given modifier names. */
			tsParseModifier(allowedModifiers, stopOnStartOfClassStaticBlock) {
				const modifier = this.value;
				if (allowedModifiers.indexOf(modifier) !== -1 && !this.containsEsc) {
					if (stopOnStartOfClassStaticBlock && this.tsIsStartOfStaticBlocks()) return;
					if (this.tsTryParse(this.tsNextTokenCanFollowModifier.bind(this))) return modifier;
				}
			}
			tsParseModifiersByMap({ modified, map }) {
				for (const key of Object.keys(map)) modified[key] = map[key];
			}
			/** Parses a list of modifiers, in any order.
			*  If you need a specific order, you must call this function multiple times:
			*    this.tsParseModifiers({ modified: node, allowedModifiers: ['public'] });
			*    this.tsParseModifiers({ modified: node, allowedModifiers: ["abstract", "readonly"] });
			*/
			tsParseModifiers({ modified, allowedModifiers, disallowedModifiers, stopOnStartOfClassStaticBlock, errorTemplate = TypeScriptError.InvalidModifierOnTypeMember }) {
				const modifiedMap = {};
				const enforceOrder = (loc, modifier, before, after) => {
					if (modifier === before && modified[after]) this.raise(loc.column, TypeScriptError.InvalidModifiersOrder({ orderedModifiers: [before, after] }));
				};
				const incompatible = (loc, modifier, mod1, mod2) => {
					if (modified[mod1] && modifier === mod2 || modified[mod2] && modifier === mod1) this.raise(loc.column, TypeScriptError.IncompatibleModifiers({ modifiers: [mod1, mod2] }));
				};
				for (;;) {
					const startLoc = this.startLoc;
					const modifier = this.tsParseModifier(allowedModifiers.concat(disallowedModifiers ?? []), stopOnStartOfClassStaticBlock);
					if (!modifier) break;
					if (tsIsAccessModifier(modifier)) if (modified.accessibility) this.raise(this.start, TypeScriptError.DuplicateAccessibilityModifier());
					else {
						enforceOrder(startLoc, modifier, modifier, "override");
						enforceOrder(startLoc, modifier, modifier, "static");
						enforceOrder(startLoc, modifier, modifier, "readonly");
						enforceOrder(startLoc, modifier, modifier, "accessor");
						modifiedMap.accessibility = modifier;
						modified["accessibility"] = modifier;
					}
					else if (tsIsVarianceAnnotations(modifier)) if (modified[modifier]) this.raise(this.start, TypeScriptError.DuplicateModifier({ modifier }));
					else {
						enforceOrder(startLoc, modifier, "in", "out");
						modifiedMap[modifier] = modifier;
						modified[modifier] = true;
					}
					else if (tsIsClassAccessor(modifier)) if (modified[modifier]) this.raise(this.start, TypeScriptError.DuplicateModifier({ modifier }));
					else {
						incompatible(startLoc, modifier, "accessor", "readonly");
						incompatible(startLoc, modifier, "accessor", "static");
						incompatible(startLoc, modifier, "accessor", "override");
						modifiedMap[modifier] = modifier;
						modified[modifier] = true;
					}
					else if (modifier === "const") if (modified[modifier]) this.raise(this.start, TypeScriptError.DuplicateModifier({ modifier }));
					else {
						modifiedMap[modifier] = modifier;
						modified[modifier] = true;
					}
					else if (Object.hasOwnProperty.call(modified, modifier)) this.raise(this.start, TypeScriptError.DuplicateModifier({ modifier }));
					else {
						enforceOrder(startLoc, modifier, "static", "readonly");
						enforceOrder(startLoc, modifier, "static", "override");
						enforceOrder(startLoc, modifier, "override", "readonly");
						enforceOrder(startLoc, modifier, "abstract", "override");
						incompatible(startLoc, modifier, "declare", "override");
						incompatible(startLoc, modifier, "static", "abstract");
						modifiedMap[modifier] = modifier;
						modified[modifier] = true;
					}
					if (disallowedModifiers?.includes(modifier)) this.raise(this.start, errorTemplate);
				}
				return modifiedMap;
			}
			tsParseInOutModifiers(node) {
				this.tsParseModifiers({
					modified: node,
					allowedModifiers: ["in", "out"],
					disallowedModifiers: [
						"public",
						"private",
						"protected",
						"readonly",
						"declare",
						"abstract",
						"override"
					],
					errorTemplate: TypeScriptError.InvalidModifierOnTypeParameter
				});
			}
			parseMaybeUnary(refExpressionErrors, sawUnary, incDec, forInit) {
				if (!options?.jsx && this.tsMatchLeftRelational()) return this.tsParseTypeAssertion();
				else return super.parseMaybeUnary(refExpressionErrors, sawUnary, incDec, forInit);
			}
			tsParseTypeAssertion() {
				if (disallowAmbiguousJSXLike) this.raise(this.start, TypeScriptError.ReservedTypeAssertion);
				const result = this.tryParse(() => {
					const node = this.startNode();
					node.typeAnnotation = this.tsTryNextParseConstantContext() || this.tsNextThenParseType();
					this.expect(tt.relational);
					node.expression = this.parseMaybeUnary();
					return this.finishNode(node, "TSTypeAssertion");
				});
				if (result.error) return this.tsParseTypeParameters(this.tsParseConstModifier);
				else return result.node;
			}
			tsParseTypeArguments() {
				const node = this.startNode();
				node.params = this.tsInType(() => this.tsInNoContext(() => {
					this.expect(tt.relational);
					return this.tsParseDelimitedList("TypeParametersOrArguments", this.tsParseType.bind(this));
				}));
				if (node.params.length === 0) this.raise(this.start, TypeScriptError.EmptyTypeArguments);
				this.exprAllowed = false;
				this.expect(tt.relational);
				return this.finishNode(node, "TSTypeParameterInstantiation");
			}
			tsParseHeritageClause(token) {
				const originalStart = this.start;
				const delimitedList = this.tsParseDelimitedList("HeritageClauseElement", () => {
					const node = this.startNode();
					node.expression = this.tsParseEntityName();
					if (this.tsMatchLeftRelational()) node.typeParameters = this.tsParseTypeArguments();
					return this.finishNode(node, "TSExpressionWithTypeArguments");
				});
				if (!delimitedList.length) this.raise(originalStart, TypeScriptError.EmptyHeritageClauseType({ token }));
				return delimitedList;
			}
			tsParseTypeMemberSemicolon() {
				if (!this.eat(tt.comma) && !this.isLineTerminator()) this.expect(tt.semi);
			}
			tsTryParseAndCatch(f) {
				const result = this.tryParse((abort) => f() || abort());
				if (result.aborted || !result.node) return void 0;
				if (result.error) this.setLookaheadState(result.failState);
				return result.node;
			}
			tsParseSignatureMember(kind, node) {
				this.tsFillSignature(tt.colon, node);
				this.tsParseTypeMemberSemicolon();
				return this.finishNode(node, kind);
			}
			tsParsePropertyOrMethodSignature(node, readonly) {
				if (this.eat(tt.question)) node.optional = true;
				const nodeAny = node;
				if (this.match(tt.parenL) || this.tsMatchLeftRelational()) {
					if (readonly) this.raise(node.start, TypeScriptError.ReadonlyForMethodSignature);
					const method = nodeAny;
					if (method.kind && this.tsMatchLeftRelational()) this.raise(this.start, TypeScriptError.AccesorCannotHaveTypeParameters);
					this.tsFillSignature(tt.colon, method);
					this.tsParseTypeMemberSemicolon();
					const paramsKey = "parameters";
					const returnTypeKey = "typeAnnotation";
					if (method.kind === "get") {
						if (method[paramsKey].length > 0) {
							this.raise(this.start, "A 'get' accesor must not have any formal parameters.");
							if (this.isThisParam(method[paramsKey][0])) this.raise(this.start, TypeScriptError.AccesorCannotDeclareThisParameter);
						}
					} else if (method.kind === "set") {
						if (method[paramsKey].length !== 1) this.raise(this.start, "A 'get' accesor must not have any formal parameters.");
						else {
							const firstParameter = method[paramsKey][0];
							if (this.isThisParam(firstParameter)) this.raise(this.start, TypeScriptError.AccesorCannotDeclareThisParameter);
							if (firstParameter.type === "Identifier" && firstParameter.optional) this.raise(this.start, TypeScriptError.SetAccesorCannotHaveOptionalParameter);
							if (firstParameter.type === "RestElement") this.raise(this.start, TypeScriptError.SetAccesorCannotHaveRestParameter);
						}
						if (method[returnTypeKey]) this.raise(method[returnTypeKey].start, TypeScriptError.SetAccesorCannotHaveReturnType);
					} else method.kind = "method";
					return this.finishNode(method, "TSMethodSignature");
				} else {
					const property = nodeAny;
					if (readonly) property.readonly = true;
					const type = this.tsTryParseTypeAnnotation();
					if (type) property.typeAnnotation = type;
					this.tsParseTypeMemberSemicolon();
					return this.finishNode(property, "TSPropertySignature");
				}
			}
			tsParseTypeMember() {
				const node = this.startNode();
				if (this.match(tt.parenL) || this.tsMatchLeftRelational()) return this.tsParseSignatureMember("TSCallSignatureDeclaration", node);
				if (this.match(tt._new)) {
					const id = this.startNode();
					this.next();
					if (this.match(tt.parenL) || this.tsMatchLeftRelational()) return this.tsParseSignatureMember("TSConstructSignatureDeclaration", node);
					else {
						node.key = this.createIdentifier(id, "new");
						return this.tsParsePropertyOrMethodSignature(node, false);
					}
				}
				this.tsParseModifiers({
					modified: node,
					allowedModifiers: ["readonly"],
					disallowedModifiers: [
						"declare",
						"abstract",
						"private",
						"protected",
						"public",
						"static",
						"override"
					]
				});
				const idx = this.tsTryParseIndexSignature(node);
				if (idx) return idx;
				this.parsePropertyName(node);
				if (!node.computed && node.key.type === "Identifier" && (node.key.name === "get" || node.key.name === "set") && this.tsTokenCanFollowModifier()) {
					node.kind = node.key.name;
					this.parsePropertyName(node);
				}
				return this.tsParsePropertyOrMethodSignature(node, !!node.readonly);
			}
			tsParseList(kind, parseElement) {
				const result = [];
				while (!this.tsIsListTerminator(kind)) result.push(parseElement());
				return result;
			}
			tsParseObjectTypeMembers() {
				this.expect(tt.braceL);
				const members = this.tsParseList("TypeMembers", this.tsParseTypeMember.bind(this));
				this.expect(tt.braceR);
				return members;
			}
			tsParseInterfaceDeclaration(node, properties = {}) {
				if (this.hasFollowingLineBreak()) return null;
				this.expectContextual("interface");
				if (properties.declare) node.declare = true;
				if (tokenIsIdentifier(this.type)) {
					node.id = this.parseIdent();
					this.checkLValSimple(node.id, acornScope.BIND_TS_INTERFACE);
				} else {
					node.id = null;
					this.raise(this.start, TypeScriptError.MissingInterfaceName);
				}
				node.typeParameters = this.tsTryParseTypeParameters(this.tsParseInOutModifiers.bind(this));
				if (this.eat(tt._extends)) node.extends = this.tsParseHeritageClause("extends");
				const body = this.startNode();
				body.body = this.tsParseInterfaceBody();
				node.body = this.finishNode(body, "TSInterfaceBody");
				return this.finishNode(node, "TSInterfaceDeclaration");
			}
			/**
			* Parse interface body, ensuring the closing brace is read outside of type context
			* so that decorators following the interface are properly tokenized.
			*/
			tsParseInterfaceBody() {
				this.expect(tt.braceL);
				const oldInType = this.inType;
				this.inType = true;
				let members = this.tsParseList("TypeMembers", this.tsParseTypeMember.bind(this));
				this.inType = oldInType;
				this.expect(tt.braceR);
				return members;
			}
			tsParseAbstractDeclaration(node) {
				if (this.match(tt._class)) {
					node.abstract = true;
					return this.parseClass(node, true);
				} else if (this.ts_isContextual(tokTypes.interface)) {
					if (!this.hasFollowingLineBreak()) {
						node.abstract = true;
						return this.tsParseInterfaceDeclaration(node);
					}
				} else this.unexpected(node.start);
			}
			tsIsDeclarationStart() {
				return tokenIsTSDeclarationStart(this.type);
			}
			tsParseExpressionStatement(node, expr) {
				switch (expr.name) {
					case "declare": {
						const declaration = this.tsTryParseDeclare(node);
						if (declaration) {
							declaration.declare = true;
							return declaration;
						}
						break;
					}
					case "global":
						if (this.match(tt.braceL)) {
							this.enterScope(TS_SCOPE_TS_MODULE);
							const mod = node;
							mod.global = true;
							mod.id = expr;
							mod.body = this.tsParseModuleBlock();
							super.exitScope();
							return this.finishNode(mod, "TSModuleDeclaration");
						}
						break;
					default: return this.tsParseDeclaration(node, expr.name, false);
				}
			}
			tsParseModuleReference() {
				return this.tsIsExternalModuleReference() ? this.tsParseExternalModuleReference() : this.tsParseEntityName(false);
			}
			tsIsExportDefaultSpecifier() {
				const { type } = this;
				const isAsync = this.isAsyncFunction();
				const isLet = this.isLet();
				if (tokenIsIdentifier(type)) {
					if (isAsync && !this.containsEsc || isLet) return false;
					if ((type === tokTypes.type || type === tokTypes.interface) && !this.containsEsc) {
						const ahead = this.lookahead();
						if (tokenIsIdentifier(ahead.type) && !this.isContextualWithState("from", ahead) || ahead.type === tt.braceL) return false;
					}
				} else if (!this.match(tt._default)) return false;
				const next = this.nextTokenStart();
				const hasFrom = this.isUnparsedContextual(next, "from");
				if (this.input.charCodeAt(next) === 44 || tokenIsIdentifier(this.type) && hasFrom) return true;
				if (this.match(tt._default) && hasFrom) {
					const nextAfterFrom = this.input.charCodeAt(this.nextTokenStartSince(next + 4));
					return nextAfterFrom === 34 || nextAfterFrom === 39;
				}
				return false;
			}
			tsInAmbientContext(cb) {
				const oldIsAmbientContext = this.isAmbientContext;
				this.isAmbientContext = true;
				try {
					return cb();
				} finally {
					this.isAmbientContext = oldIsAmbientContext;
				}
			}
			tsCheckLineTerminator(next) {
				if (next) {
					if (this.hasFollowingLineBreak()) return false;
					this.next();
					return true;
				}
				return !this.isLineTerminator();
			}
			tsParseModuleOrNamespaceDeclaration(node, nested = false) {
				node.id = this.parseIdent();
				if (!nested) this.checkLValSimple(node.id, acornScope.BIND_TS_NAMESPACE);
				if (this.eat(tt.dot)) {
					const inner = this.startNode();
					this.tsParseModuleOrNamespaceDeclaration(inner, true);
					node.body = inner;
				} else {
					this.enterScope(TS_SCOPE_TS_MODULE);
					node.body = this.tsParseModuleBlock();
					super.exitScope();
				}
				return this.finishNode(node, "TSModuleDeclaration");
			}
			checkLValSimple(expr, bindingType = acornScope.BIND_NONE, checkClashes) {
				if (expr.type === "TSNonNullExpression" || expr.type === "TSAsExpression") expr = expr.expression;
				return super.checkLValSimple(expr, bindingType, checkClashes);
			}
			tsParseTypeAliasDeclaration(node) {
				node.id = this.parseIdent();
				this.checkLValSimple(node.id, acornScope.BIND_TS_TYPE);
				node.typeAnnotation = this.tsInType(() => {
					node.typeParameters = this.tsTryParseTypeParameters(this.tsParseInOutModifiers.bind(this));
					this.expect(tt.eq);
					if (this.ts_isContextual(tokTypes.interface) && this.lookahead().type !== tt.dot) {
						const node2 = this.startNode();
						this.next();
						return this.finishNode(node2, "TSIntrinsicKeyword");
					}
					return this.tsParseType();
				});
				this.semicolon();
				return this.finishNode(node, "TSTypeAliasDeclaration");
			}
			tsParseDeclaration(node, value, next) {
				switch (value) {
					case "abstract":
						if (this.tsCheckLineTerminator(next) && (this.match(tt._class) || tokenIsIdentifier(this.type))) return this.tsParseAbstractDeclaration(node);
						break;
					case "module":
						if (this.tsCheckLineTerminator(next)) {
							if (this.match(tt.string)) return this.tsParseAmbientExternalModuleDeclaration(node);
							else if (tokenIsIdentifier(this.type)) return this.tsParseModuleOrNamespaceDeclaration(node);
						}
						break;
					case "namespace":
						if (this.tsCheckLineTerminator(next) && tokenIsIdentifier(this.type)) return this.tsParseModuleOrNamespaceDeclaration(node);
						break;
					case "type":
						if (this.tsCheckLineTerminator(next) && tokenIsIdentifier(this.type)) return this.tsParseTypeAliasDeclaration(node);
						break;
				}
			}
			tsTryParseExportDeclaration() {
				return this.tsParseDeclaration(this.startNode(), this.value, true);
			}
			tsParseImportEqualsDeclaration(node, isExport) {
				node.isExport = isExport || false;
				node.id = this.parseIdent();
				this.checkLValSimple(node.id, acornScope.BIND_LEXICAL);
				super.expect(tt.eq);
				const moduleReference = this.tsParseModuleReference();
				if (node.importKind === "type" && moduleReference.type !== "TSExternalModuleReference") this.raise(moduleReference.start, TypeScriptError.ImportAliasHasImportType);
				node.moduleReference = moduleReference;
				super.semicolon();
				return this.finishNode(node, "TSImportEqualsDeclaration");
			}
			isExportDefaultSpecifier() {
				if (this.tsIsDeclarationStart()) return false;
				const { type } = this;
				if (tokenIsIdentifier(type)) {
					if (this.isContextual("async") || this.isContextual("let")) return false;
					if ((type === tokTypes.type || type === tokTypes.interface) && !this.containsEsc) {
						const ahead = this.lookahead();
						if (tokenIsIdentifier(ahead.type) && !this.isContextualWithState("from", ahead) || ahead.type === tt.braceL) return false;
					}
				} else if (!this.match(tt._default)) return false;
				const next = this.nextTokenStart();
				const hasFrom = this.isUnparsedContextual(next, "from");
				if (this.input.charCodeAt(next) === 44 || tokenIsIdentifier(this.type) && hasFrom) return true;
				if (this.match(tt._default) && hasFrom) {
					const nextAfterFrom = this.input.charCodeAt(this.nextTokenStartSince(next + 4));
					return nextAfterFrom === 34 || nextAfterFrom === 39;
				}
				return false;
			}
			parseTemplate({ isTagged = false } = {}) {
				let node = this.startNode();
				this.next();
				node.expressions = [];
				let curElt = this.parseTemplateElement({ isTagged });
				node.quasis = [curElt];
				while (!curElt.tail) {
					if (this.type === tt.eof) this.raise(this.pos, "Unterminated template literal");
					this.expect(tt.dollarBraceL);
					node.expressions.push(this.inType ? this.tsParseType() : this.parseExpression());
					this.expect(tt.braceR);
					node.quasis.push(curElt = this.parseTemplateElement({ isTagged }));
				}
				this.next();
				return this.finishNode(node, "TemplateLiteral");
			}
			parseFunction(node, statement, allowExpressionBody, isAsync, forInit) {
				this.initFunction(node);
				if (this.ecmaVersion >= 9 || this.ecmaVersion >= 6 && !isAsync) {
					if (this.type === tt.star && statement & FUNC_HANGING_STATEMENT) this.unexpected();
					node.generator = this.eat(tt.star);
				}
				if (this.ecmaVersion >= 8) node.async = !!isAsync;
				if (statement & FUNC_STATEMENT) node.id = statement & FUNC_NULLABLE_ID && this.type !== tt.name ? null : this.parseIdent();
				let oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
				const oldMaybeInArrowParameters = this.maybeInArrowParameters;
				this.maybeInArrowParameters = false;
				this.yieldPos = 0;
				this.awaitPos = 0;
				this.awaitIdentPos = 0;
				this.enterScope(functionFlags(node.async, node.generator));
				if (!(statement & FUNC_STATEMENT)) node.id = this.type === tt.name ? this.parseIdent() : null;
				this.parseFunctionParams(node);
				const isDeclaration = statement & FUNC_STATEMENT;
				this.parseFunctionBody(node, allowExpressionBody, false, forInit, { isFunctionDeclaration: isDeclaration });
				this.yieldPos = oldYieldPos;
				this.awaitPos = oldAwaitPos;
				this.awaitIdentPos = oldAwaitIdentPos;
				if (statement & FUNC_STATEMENT && node.id && !(statement & FUNC_HANGING_STATEMENT)) if (node.body) this.checkLValSimple(node.id, this.strict || node.generator || node.async ? this.treatFunctionsAsVar ? acornScope.BIND_VAR : acornScope.BIND_LEXICAL : acornScope.BIND_FUNCTION);
				else this.checkLValSimple(node.id, acornScope.BIND_NONE);
				this.maybeInArrowParameters = oldMaybeInArrowParameters;
				return this.finishNode(node, isDeclaration ? "FunctionDeclaration" : "FunctionExpression");
			}
			parseFunctionBody(node, isArrowFunction = false, isMethod = false, forInit = false, tsConfig) {
				if (this.match(tt.colon)) node.returnType = this.tsParseTypeOrTypePredicateAnnotation(tt.colon);
				const bodilessType = tsConfig?.isFunctionDeclaration ? "TSDeclareFunction" : tsConfig?.isClassMethod ? "TSDeclareMethod" : void 0;
				if (bodilessType && !this.match(tt.braceL) && this.isLineTerminator()) {
					this.exitScope();
					return this.finishNode(node, bodilessType);
				}
				if (bodilessType === "TSDeclareFunction" && this.isAmbientContext) {
					this.raise(node.start, TypeScriptError.DeclareFunctionHasImplementation);
					if (node.declare) {
						super.parseFunctionBody(node, isArrowFunction, isMethod, false);
						return this.finishNode(node, bodilessType);
					}
				}
				super.parseFunctionBody(node, isArrowFunction, isMethod, forInit);
				return node;
			}
			parseNew() {
				if (this.containsEsc) this.raiseRecoverable(this.start, "Escape sequence in keyword new");
				let node = this.startNode();
				let meta = this.parseIdent(true);
				if (this.ecmaVersion >= 6 && this.eat(tt.dot)) {
					node.meta = meta;
					let containsEsc = this.containsEsc;
					node.property = this.parseIdent(true);
					if (node.property.name !== "target") this.raiseRecoverable(node.property.start, "The only valid meta property for new is 'new.target'");
					if (containsEsc) this.raiseRecoverable(node.start, "'new.target' must not contain escaped characters");
					if (!this["allowNewDotTarget"]) this.raiseRecoverable(node.start, "'new.target' can only be used in functions and class static block");
					return this.finishNode(node, "MetaProperty");
				}
				let startPos = this.start, startLoc = this.startLoc, isImport = this.type === tt._import;
				node.callee = this.parseSubscripts(this.parseExprAtom(), startPos, startLoc, true, false);
				if (isImport && node.callee.type === "ImportExpression") this.raise(startPos, "Cannot use new with import()");
				const { callee } = node;
				if (callee.type === "TSInstantiationExpression" && !callee.extra?.parenthesized) {
					node.typeArguments = callee.typeArguments;
					node.callee = callee.expression;
				}
				if (this.eat(tt.parenL)) node.arguments = this.parseExprList(tt.parenR, this.ecmaVersion >= 8, false);
				else node.arguments = [];
				return this.finishNode(node, "NewExpression");
			}
			parseExprOp(left, leftStartPos, leftStartLoc, minPrec, forInit) {
				if (tt._in.binop > minPrec && !this.hasPrecedingLineBreak()) {
					let nodeType;
					if (this.isContextual("as")) nodeType = "TSAsExpression";
					if (this.isContextual("satisfies")) nodeType = "TSSatisfiesExpression";
					if (nodeType) {
						const node = this.startNodeAt(leftStartPos, leftStartLoc);
						node.expression = left;
						const _const = this.tsTryNextParseConstantContext();
						if (_const) node.typeAnnotation = _const;
						else node.typeAnnotation = this.tsNextThenParseType();
						this.finishNode(node, nodeType);
						this.reScan_lt_gt();
						return this.parseExprOp(node, leftStartPos, leftStartLoc, minPrec, forInit);
					}
				}
				return super.parseExprOp(left, leftStartPos, leftStartLoc, minPrec, forInit);
			}
			parseImportSpecifiers() {
				let nodes = [], first = true;
				if (acornTypeScript.tokenIsIdentifier(this.type)) {
					nodes.push(this.parseImportDefaultSpecifier());
					if (!this.eat(tt.comma)) return nodes;
				}
				if (this.type === tt.star) {
					nodes.push(this.parseImportNamespaceSpecifier());
					return nodes;
				}
				this.expect(tt.braceL);
				while (!this.eat(tt.braceR)) {
					if (!first) {
						this.expect(tt.comma);
						if (this.afterTrailingComma(tt.braceR)) break;
					} else first = false;
					nodes.push(this.parseImportSpecifier());
				}
				return nodes;
			}
			/**
			* @param {Node} node this may be ImportDeclaration |
			* TsImportEqualsDeclaration
			* @returns AnyImport
			* */
			parseImport(node) {
				let enterHead = this.lookahead();
				node.importKind = "value";
				this.importOrExportOuterKind = "value";
				if (tokenIsIdentifier(enterHead.type) || this.match(tt.star) || this.match(tt.braceL)) {
					let ahead = this.lookahead(2);
					if (ahead.type !== tt.comma && !this.isContextualWithState("from", ahead) && ahead.type !== tt.eq && this.ts_eatContextualWithState("type", 1, enterHead)) {
						this.importOrExportOuterKind = "type";
						node.importKind = "type";
						enterHead = this.lookahead();
						ahead = this.lookahead(2);
					}
					if (tokenIsIdentifier(enterHead.type) && ahead.type === tt.eq) {
						this.next();
						const importNode = this.tsParseImportEqualsDeclaration(node);
						this.importOrExportOuterKind = "value";
						return importNode;
					}
				}
				this.next();
				if (this.type === tt.string) {
					node.specifiers = [];
					node.source = this.parseExprAtom();
				} else {
					node.specifiers = this.parseImportSpecifiers();
					this.expectContextual("from");
					node.source = this.type === tt.string ? this.parseExprAtom() : this.unexpected();
				}
				this.parseMaybeImportAttributes(node);
				this.semicolon();
				this.finishNode(node, "ImportDeclaration");
				this.importOrExportOuterKind = "value";
				if (node.importKind === "type" && node.specifiers.length > 1 && node.specifiers[0].type === "ImportDefaultSpecifier") this.raise(node.start, TypeScriptError.TypeImportCannotSpecifyDefaultAndNamed);
				return node;
			}
			parseExportDefaultDeclaration() {
				if (this.isAbstractClass()) {
					const cls = this.startNode();
					this.next();
					cls.abstract = true;
					return this.parseClass(cls, true);
				}
				if (this.match(tokTypes.interface)) {
					const result = this.tsParseInterfaceDeclaration(this.startNode());
					if (result) return result;
				}
				return super.parseExportDefaultDeclaration();
			}
			parseExportAllDeclaration(node, exports) {
				if (this.ecmaVersion >= 11) if (this.eatContextual("as")) {
					node.exported = this.parseModuleExportName();
					this.checkExport(exports, node.exported, this.lastTokStart);
				} else node.exported = null;
				this.expectContextual("from");
				if (this.type !== tt.string) this.unexpected();
				node.source = this.parseExprAtom();
				this.parseMaybeImportAttributes(node);
				this.semicolon();
				return this.finishNode(node, "ExportAllDeclaration");
			}
			parseDynamicImport(node) {
				this.next();
				node.source = this.parseMaybeAssign();
				if (this.eat(tt.comma)) node.arguments = [this.parseExpression()];
				if (!this.eat(tt.parenR)) {
					const errorPos = this.start;
					if (this.eat(tt.comma) && this.eat(tt.parenR)) this.raiseRecoverable(errorPos, "Trailing comma is not allowed in import()");
					else this.unexpected(errorPos);
				}
				return this.finishNode(node, "ImportExpression");
			}
			parseExport(node, exports) {
				let enterHead = this.lookahead();
				if (this.ts_eatWithState(tt._import, 2, enterHead)) {
					if (this.ts_isContextual(tokTypes.type) && this.lookaheadCharCode() !== 61) {
						node.importKind = "type";
						this.importOrExportOuterKind = "type";
						this.next();
					} else {
						node.importKind = "value";
						this.importOrExportOuterKind = "value";
					}
					const exportEqualsNode = this.tsParseImportEqualsDeclaration(node, true);
					this.importOrExportOuterKind = void 0;
					return exportEqualsNode;
				} else if (this.ts_eatWithState(tt.eq, 2, enterHead)) {
					const assign = node;
					assign.expression = this.parseExpression();
					this.semicolon();
					this.importOrExportOuterKind = void 0;
					return this.finishNode(assign, "TSExportAssignment");
				} else if (this.ts_eatContextualWithState("as", 2, enterHead)) {
					const decl = node;
					this.expectContextual("namespace");
					decl.id = this.parseIdent();
					this.semicolon();
					this.importOrExportOuterKind = void 0;
					return this.finishNode(decl, "TSNamespaceExportDeclaration");
				} else {
					const lookahead2 = this.lookahead(2).type;
					if (this.ts_isContextualWithState(enterHead, tokTypes.type) && (lookahead2 === tt.braceL || lookahead2 === tt.star)) {
						this.next();
						this.importOrExportOuterKind = "type";
						node.exportKind = "type";
					} else {
						this.importOrExportOuterKind = "value";
						node.exportKind = "value";
					}
					this.next();
					if (this.eat(tt.star)) return this.parseExportAllDeclaration(node, exports);
					if (this.eat(tt._default)) {
						this.checkExport(exports, "default", this.lastTokStart);
						node.declaration = this.parseExportDefaultDeclaration();
						return this.finishNode(node, "ExportDefaultDeclaration");
					}
					if (this.shouldParseExportStatement()) {
						node.declaration = this.parseExportDeclaration(node);
						if (node.declaration.type === "VariableDeclaration") this.checkVariableExport(exports, node.declaration.declarations);
						else this.checkExport(exports, node.declaration.id, node.declaration.id.start);
						node.specifiers = [];
						node.source = null;
					} else {
						node.declaration = null;
						node.specifiers = this.parseExportSpecifiers(exports);
						if (this.eatContextual("from")) {
							if (this.type !== tt.string) this.unexpected();
							node.source = this.parseExprAtom();
							this.parseMaybeImportAttributes(node);
						} else {
							for (let spec of node.specifiers) {
								this.checkUnreserved(spec.local);
								this.checkLocalExport(spec.local);
								if (spec.local.type === "Literal") this.raise(spec.local.start, "A string literal cannot be used as an exported binding without `from`.");
							}
							node.source = null;
						}
						this.semicolon();
					}
					return this.finishNode(node, "ExportNamedDeclaration");
				}
			}
			checkExport(exports, name, _) {
				if (!exports) return;
				if (typeof name !== "string") name = name.type === "Identifier" ? name.name : name.value;
				exports[name] = true;
			}
			parseMaybeDefault(startPos, startLoc, left) {
				const node = super.parseMaybeDefault(startPos, startLoc, left);
				if (node.type === "AssignmentPattern" && node.typeAnnotation && node.right.start < node.typeAnnotation.start) this.raise(node.typeAnnotation.start, TypeScriptError.TypeAnnotationAfterAssign);
				return node;
			}
			typeCastToParameter(node) {
				node.expression.typeAnnotation = node.typeAnnotation;
				this.resetEndLocation(node.expression, node.typeAnnotation.end, node.typeAnnotation.loc?.end);
				return node.expression;
			}
			toAssignableList(exprList, isBinding) {
				if (!exprList) exprList = [];
				for (let i = 0; i < exprList.length; i++) {
					const expr = exprList[i];
					if (expr?.type === "TSTypeCastExpression") exprList[i] = this.typeCastToParameter(expr);
				}
				return super.toAssignableList(exprList, isBinding);
			}
			reportReservedArrowTypeParam(node) {
				if (node.params.length === 1 && !node.extra?.trailingComma && disallowAmbiguousJSXLike) this.raise(node.start, TypeScriptError.ReservedArrowTypeParam);
			}
			parseExprAtom(refDestructuringErrors, forInit, forNew) {
				if (this.type === tokTypes.jsxText) return this.jsx_parseText();
				else if (this.type === tokTypes.jsxTagStart) return this.jsx_parseElement();
				else if (this.type === tokTypes.at) {
					this.parseDecorators();
					return this.parseExprAtom();
				} else if (tokenIsIdentifier(this.type)) {
					let canBeArrow = this.potentialArrowAt === this.start;
					let startPos = this.start, startLoc = this.startLoc, containsEsc = this.containsEsc;
					let id = this.parseIdent(false);
					if (this.ecmaVersion >= 8 && !containsEsc && id.name === "async" && !this.canInsertSemicolon() && this.eat(tt._function)) {
						this.overrideContext(tokContexts.f_expr);
						return this.parseFunction(this.startNodeAt(startPos, startLoc), 0, false, true, forInit);
					}
					if (canBeArrow && !this.canInsertSemicolon()) {
						if (this.eat(tt.arrow)) return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), [id], false, forInit);
						if (this.ecmaVersion >= 8 && id.name === "async" && this.type === tt.name && !containsEsc && (!this.potentialArrowInForAwait || this.value !== "of" || this.containsEsc)) {
							id = this.parseIdent(false);
							if (this.canInsertSemicolon() || !this.eat(tt.arrow)) this.unexpected();
							return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), [id], true, forInit);
						}
					}
					return id;
				} else return super.parseExprAtom(refDestructuringErrors, forInit, forNew);
			}
			parseExprAtomDefault() {
				if (tokenIsIdentifier(this.type)) {
					const canBeArrow = this["potentialArrowAt"] === this.start;
					const containsEsc = this.containsEsc;
					const id = this.parseIdent();
					if (!containsEsc && id.name === "async" && !this.canInsertSemicolon()) {
						const { type } = this;
						if (type === tt._function) {
							this.next();
							return this.parseFunction(this.startNodeAtNode(id), void 0, true, true);
						} else if (tokenIsIdentifier(type)) if (this.lookaheadCharCode() === 61) {
							const paramId = this.parseIdent(false);
							if (this.canInsertSemicolon() || !this.eat(tt.arrow)) this.unexpected();
							return this.parseArrowExpression(this.startNodeAtNode(id), [paramId], true);
						} else return id;
					}
					if (canBeArrow && this.match(tt.arrow) && !this.canInsertSemicolon()) {
						this.next();
						return this.parseArrowExpression(this.startNodeAtNode(id), [id], false);
					}
					return id;
				} else this.unexpected();
			}
			parseIdentNode() {
				let node = this.startNode();
				if (tokenIsKeywordOrIdentifier(this.type) && !((this.type.keyword === "class" || this.type.keyword === "function") && (this.lastTokEnd !== this.lastTokStart + 1 || this.input.charCodeAt(this.lastTokStart) !== 46))) node.name = this.value;
				else return super.parseIdentNode();
				return node;
			}
			parseVarStatement(node, kind, allowMissingInitializer = false) {
				const { isAmbientContext } = this;
				this.next();
				super.parseVar(node, false, kind, allowMissingInitializer || isAmbientContext);
				this.semicolon();
				const declaration = this.finishNode(node, "VariableDeclaration");
				if (!isAmbientContext) return declaration;
				for (const { id, init } of declaration.declarations) {
					if (!init) continue;
					if (kind !== "const" || !!id.typeAnnotation) this.raise(init.start, TypeScriptError.InitializerNotAllowedInAmbientContext);
					else if (init.type !== "StringLiteral" && init.type !== "BooleanLiteral" && init.type !== "NumericLiteral" && init.type !== "BigIntLiteral" && (init.type !== "TemplateLiteral" || init.expressions.length > 0) && !isPossiblyLiteralEnum(init)) this.raise(init.start, TypeScriptError.ConstInitiailizerMustBeStringOrNumericLiteralOrLiteralEnumReference);
				}
				return declaration;
			}
			parseStatement(context, topLevel, exports) {
				if (this.match(tokTypes.at)) this.parseDecorators(true);
				if (this.match(tt._const) && this.isLookaheadContextual("enum")) {
					const node = this.startNode();
					this.expect(tt._const);
					return this.tsParseEnumDeclaration(node, { const: true });
				}
				if (this.ts_isContextual(tokTypes.enum)) return this.tsParseEnumDeclaration(this.startNode());
				if (this.ts_isContextual(tokTypes.interface)) {
					const result = this.tsParseInterfaceDeclaration(this.startNode());
					if (result) return result;
				}
				return super.parseStatement(context, topLevel, exports);
			}
			parseAccessModifier() {
				return this.tsParseModifier([
					"public",
					"protected",
					"private"
				]);
			}
			parsePostMemberNameModifiers(methodOrProp) {
				if (this.eat(tt.question)) methodOrProp.optional = true;
				if (methodOrProp.readonly && this.match(tt.parenL)) this.raise(methodOrProp.start, TypeScriptError.ClassMethodHasReadonly);
				if (methodOrProp.declare && this.match(tt.parenL)) this.raise(methodOrProp.start, TypeScriptError.ClassMethodHasDeclare);
			}
			parseExpressionStatement(node, expr) {
				return (expr.type === "Identifier" ? this.tsParseExpressionStatement(node, expr) : void 0) || super.parseExpressionStatement(node, expr);
			}
			shouldParseExportStatement() {
				if (this.tsIsDeclarationStart()) return true;
				if (this.match(tokTypes.at)) return true;
				return super.shouldParseExportStatement();
			}
			parseConditional(expr, startPos, startLoc, forInit, refDestructuringErrors) {
				if (this.eat(tt.question)) {
					let node = this.startNodeAt(startPos, startLoc);
					node.test = expr;
					node.consequent = this.parseMaybeAssign();
					this.expect(tt.colon);
					node.alternate = this.parseMaybeAssign(forInit);
					return this.finishNode(node, "ConditionalExpression");
				}
				return expr;
			}
			parseMaybeConditional(forInit, refDestructuringErrors) {
				let startPos = this.start, startLoc = this.startLoc;
				let expr = this.parseExprOps(forInit, refDestructuringErrors);
				if (this.checkExpressionErrors(refDestructuringErrors)) return expr;
				if (!this.maybeInArrowParameters || !this.match(tt.question)) return this.parseConditional(expr, startPos, startLoc, forInit, refDestructuringErrors);
				const result = this.tryParse(() => this.parseConditional(expr, startPos, startLoc, forInit, refDestructuringErrors));
				if (!result.node) {
					if (result.error) this.setOptionalParametersError(refDestructuringErrors, result.error);
					return expr;
				}
				if (result.error) this.setLookaheadState(result.failState);
				return result.node;
			}
			parseParenItem(node) {
				const startPos = this.start;
				const startLoc = this.startLoc;
				node = super.parseParenItem(node);
				if (this.eat(tt.question)) {
					node.optional = true;
					this.resetEndLocation(node);
				}
				if (this.match(tt.colon)) {
					const typeCastNode = this.startNodeAt(startPos, startLoc);
					typeCastNode.expression = node;
					typeCastNode.typeAnnotation = this.tsParseTypeAnnotation();
					return this.finishNode(typeCastNode, "TSTypeCastExpression");
				}
				return node;
			}
			parseExportDeclaration(node) {
				if (!this.isAmbientContext && this.ts_isContextual(tokTypes.declare)) return this.tsInAmbientContext(() => this.parseExportDeclaration(node));
				const startPos = this.start;
				const startLoc = this.startLoc;
				const isDeclare = this.eatContextual("declare");
				if (isDeclare && (this.ts_isContextual(tokTypes.declare) || !this.shouldParseExportStatement())) this.raise(this.start, TypeScriptError.ExpectedAmbientAfterExportDeclare);
				const declaration = tokenIsIdentifier(this.type) && this.tsTryParseExportDeclaration() || this.parseStatement(null);
				if (!declaration) return null;
				if (declaration.type === "TSInterfaceDeclaration" || declaration.type === "TSTypeAliasDeclaration" || isDeclare) node.exportKind = "type";
				if (isDeclare) {
					this.resetStartLocation(declaration, startPos, startLoc);
					declaration.declare = true;
				}
				return declaration;
			}
			parseClassId(node, isStatement) {
				if (!isStatement && this.isContextual("implements")) return;
				super.parseClassId(node, isStatement);
				const typeParameters = this.tsTryParseTypeParameters(this.tsParseInOutModifiers.bind(this));
				if (typeParameters) node.typeParameters = typeParameters;
			}
			parseClassPropertyAnnotation(node) {
				if (!node.optional) {
					if (this.value === "!" && this.eat(tt.prefix)) node.definite = true;
					else if (this.eat(tt.question)) node.optional = true;
				}
				const type = this.tsTryParseTypeAnnotation();
				if (type) node.typeAnnotation = type;
			}
			parseClassField(field) {
				if (field.key.type === "PrivateIdentifier") {
					if (field.abstract) this.raise(field.start, TypeScriptError.PrivateElementHasAbstract);
					if (field.accessibility) this.raise(field.start, TypeScriptError.PrivateElementHasAccessibility({ modifier: field.accessibility }));
					this.parseClassPropertyAnnotation(field);
				} else {
					this.parseClassPropertyAnnotation(field);
					if (this.isAmbientContext && !(field.readonly && !field.typeAnnotation) && this.match(tt.eq)) this.raise(this.start, TypeScriptError.DeclareClassFieldHasInitializer);
					if (field.abstract && this.match(tt.eq)) {
						const { key } = field;
						this.raise(this.start, TypeScriptError.AbstractPropertyHasInitializer({ propertyName: key.type === "Identifier" && !field.computed ? key.name : `[${this.input.slice(key.start, key.end)}]` }));
					}
				}
				return super.parseClassField(field);
			}
			parseClassMethod(method, isGenerator, isAsync, allowsDirectSuper) {
				const isConstructor = method.kind === "constructor";
				const isPrivate = method.key.type === "PrivateIdentifier";
				const typeParameters = this.tsTryParseTypeParameters(this.tsParseConstModifier);
				if (isPrivate) {
					if (typeParameters) method.typeParameters = typeParameters;
					if (method.accessibility) this.raise(method.start, TypeScriptError.PrivateMethodsHasAccessibility({ modifier: method.accessibility }));
				} else if (typeParameters && isConstructor) this.raise(typeParameters.start, TypeScriptError.ConstructorHasTypeParameters);
				const { declare = false, kind } = method;
				if (declare && (kind === "get" || kind === "set")) this.raise(method.start, TypeScriptError.DeclareAccessor({ kind }));
				if (typeParameters) method.typeParameters = typeParameters;
				const key = method.key;
				if (method.kind === "constructor") {
					if (isGenerator) this.raise(key.start, "Constructor can't be a generator");
					if (isAsync) this.raise(key.start, "Constructor can't be an async method");
				} else if (method.static && checkKeyName(method, "prototype")) this.raise(key.start, "Classes may not have a static property named prototype");
				const value = method.value = this.parseMethod(isGenerator, isAsync, allowsDirectSuper, true, method);
				if (method.kind === "get" && value["params"].length !== 0) this.raiseRecoverable(value.start, "getter should have no params");
				if (method.kind === "set" && value["params"].length !== 1) this.raiseRecoverable(value.start, "setter should have exactly one param");
				if (method.kind === "set" && value["params"][0].type === "RestElement") this.raiseRecoverable(value["params"][0].start, "Setter cannot use rest params");
				return this.finishNode(method, "MethodDefinition");
			}
			isClassMethod() {
				return this.match(tt.relational);
			}
			parseClassElement(constructorAllowsSuper) {
				if (this.eat(tt.semi)) return null;
				let node = this.startNode();
				let keyName = "";
				let isGenerator = false;
				let isAsync = false;
				let kind = "method";
				let isStatic = false;
				const modifiers = [
					"declare",
					"private",
					"public",
					"protected",
					"accessor",
					"override",
					"abstract",
					"readonly",
					"static"
				];
				const modifierMap = this.tsParseModifiers({
					modified: node,
					allowedModifiers: modifiers,
					disallowedModifiers: ["in", "out"],
					stopOnStartOfClassStaticBlock: true,
					errorTemplate: TypeScriptError.InvalidModifierOnTypeParameterPositions
				});
				isStatic = Boolean(modifierMap.static);
				const callParseClassMemberWithIsStatic = () => {
					if (this.tsIsStartOfStaticBlocks()) {
						this.next();
						this.next();
						if (this.tsHasSomeModifiers(node, modifiers)) this.raise(this.start, TypeScriptError.StaticBlockCannotHaveModifier);
						if (this.ecmaVersion >= 13) {
							super.parseClassStaticBlock(node);
							return node;
						}
					} else {
						const idx = this.tsTryParseIndexSignature(node);
						if (idx) {
							if (node.abstract) this.raise(node.start, TypeScriptError.IndexSignatureHasAbstract);
							if (node.accessibility) this.raise(node.start, TypeScriptError.IndexSignatureHasAccessibility({ modifier: node.accessibility }));
							if (node.declare) this.raise(node.start, TypeScriptError.IndexSignatureHasDeclare);
							if (node.override) this.raise(node.start, TypeScriptError.IndexSignatureHasOverride);
							return idx;
						}
						if (!this.inAbstractClass && node.abstract) this.raise(node.start, TypeScriptError.NonAbstractClassHasAbstractMethod);
						if (node.override) {
							if (!constructorAllowsSuper) this.raise(node.start, TypeScriptError.OverrideNotInSubClass);
						}
						node.static = isStatic;
						if (isStatic) {
							if (!(this.isClassElementNameStart() || this.type === tt.star)) keyName = "static";
						}
						if (!keyName && this.ecmaVersion >= 8 && this.eatContextual("async")) if ((this.isClassElementNameStart() || this.type === tt.star) && !this.canInsertSemicolon()) isAsync = true;
						else keyName = "async";
						if (!keyName && (this.ecmaVersion >= 9 || !isAsync) && this.eat(tt.star)) isGenerator = true;
						if (!keyName && !isAsync && !isGenerator) {
							const lastValue = this.value;
							if (this.eatContextual("get") || this.eatContextual("set")) if (this.isClassElementNameStart()) kind = lastValue;
							else keyName = lastValue;
						}
						if (keyName) {
							node.computed = false;
							node.key = this.startNodeAt(this.lastTokStart, this.lastTokStartLoc);
							node.key.name = keyName;
							this.finishNode(node.key, "Identifier");
						} else this.parseClassElementName(node);
						this.parsePostMemberNameModifiers(node);
						if (this.isClassMethod() || this.ecmaVersion < 13 || this.type === tt.parenL || kind !== "method" || isGenerator || isAsync) {
							const isConstructor = !node.static && checkKeyName(node, "constructor");
							const allowsDirectSuper = isConstructor && constructorAllowsSuper;
							if (isConstructor && kind !== "method") this.raise(node.key.start, "Constructor can't have get/set modifier");
							node.kind = isConstructor ? "constructor" : kind;
							this.parseClassMethod(node, isGenerator, isAsync, allowsDirectSuper);
						} else this.parseClassField(node);
						return node;
					}
				};
				if (node.declare) this.tsInAmbientContext(callParseClassMemberWithIsStatic);
				else callParseClassMemberWithIsStatic();
				return node;
			}
			isClassElementNameStart() {
				if (this.tsIsIdentifier()) return true;
				return super.isClassElementNameStart();
			}
			parseClassSuper(node) {
				super.parseClassSuper(node);
				if (node.superClass && (this.tsMatchLeftRelational() || this.match(tt.bitShift))) node.superTypeParameters = this.tsParseTypeArgumentsInExpression();
				if (this.eatContextual("implements")) node.implements = this.tsParseHeritageClause("implements");
			}
			parseFunctionParams(node) {
				const typeParameters = this.tsTryParseTypeParameters(this.tsParseConstModifier);
				if (typeParameters) node.typeParameters = typeParameters;
				super.parseFunctionParams(node);
			}
			parseVarId(decl, kind) {
				super.parseVarId(decl, kind);
				if (decl.id.type === "Identifier" && !this.hasPrecedingLineBreak() && this.value === "!" && this.eat(tt.prefix)) decl.definite = true;
				const type = this.tsTryParseTypeAnnotation();
				if (type) {
					decl.id.typeAnnotation = type;
					this.resetEndLocation(decl.id);
				}
			}
			parseArrowExpression(node, params, isAsync, forInit) {
				if (this.match(tt.colon)) node.returnType = this.tsParseTypeAnnotation();
				let oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
				this.enterScope(functionFlags(isAsync, false) | acornScope.SCOPE_ARROW);
				this.initFunction(node);
				const oldMaybeInArrowParameters = this.maybeInArrowParameters;
				if (this.ecmaVersion >= 8) node.async = !!isAsync;
				this.yieldPos = 0;
				this.awaitPos = 0;
				this.awaitIdentPos = 0;
				this.maybeInArrowParameters = true;
				node.params = this.toAssignableList(params, true);
				this.maybeInArrowParameters = false;
				this.parseFunctionBody(node, true, false, forInit);
				this.yieldPos = oldYieldPos;
				this.awaitPos = oldAwaitPos;
				this.awaitIdentPos = oldAwaitIdentPos;
				this.maybeInArrowParameters = oldMaybeInArrowParameters;
				return this.finishNode(node, "ArrowFunctionExpression");
			}
			parseMaybeAssignOrigin(forInit, refDestructuringErrors, afterLeftParse) {
				if (this.isContextual("yield")) if (this.inGenerator) return this.parseYield(forInit);
				else this.exprAllowed = false;
				let ownDestructuringErrors = false, oldParenAssign = -1, oldTrailingComma = -1, oldDoubleProto = -1;
				if (refDestructuringErrors) {
					oldParenAssign = refDestructuringErrors.parenthesizedAssign;
					oldTrailingComma = refDestructuringErrors.trailingComma;
					oldDoubleProto = refDestructuringErrors.doubleProto;
					refDestructuringErrors.parenthesizedAssign = refDestructuringErrors.trailingComma = -1;
				} else {
					refDestructuringErrors = new DestructuringErrors$1();
					ownDestructuringErrors = true;
				}
				let startPos = this.start, startLoc = this.startLoc;
				if (this.type === tt.parenL || tokenIsIdentifier(this.type)) {
					this.potentialArrowAt = this.start;
					this.potentialArrowInForAwait = forInit === "await";
				}
				let left = this.parseMaybeConditional(forInit, refDestructuringErrors);
				if (afterLeftParse) left = afterLeftParse.call(this, left, startPos, startLoc);
				if (this.type.isAssign) {
					let node = this.startNodeAt(startPos, startLoc);
					node.operator = this.value;
					if (this.type === tt.eq) left = this.toAssignable(left, true, refDestructuringErrors);
					if (!ownDestructuringErrors) refDestructuringErrors.parenthesizedAssign = refDestructuringErrors.trailingComma = refDestructuringErrors.doubleProto = -1;
					if (refDestructuringErrors.shorthandAssign >= left.start) refDestructuringErrors.shorthandAssign = -1;
					if (!this.maybeInArrowParameters) if (this.type === tt.eq) this.checkLValPattern(left);
					else this.checkLValSimple(left);
					node.left = left;
					this.next();
					node.right = this.parseMaybeAssign(forInit);
					if (oldDoubleProto > -1) refDestructuringErrors.doubleProto = oldDoubleProto;
					return this.finishNode(node, "AssignmentExpression");
				} else if (ownDestructuringErrors) this.checkExpressionErrors(refDestructuringErrors, true);
				if (oldParenAssign > -1) refDestructuringErrors.parenthesizedAssign = oldParenAssign;
				if (oldTrailingComma > -1) refDestructuringErrors.trailingComma = oldTrailingComma;
				return left;
			}
			parseMaybeAssign(forInit, refExpressionErrors, afterLeftParse) {
				let state;
				let jsx;
				let typeCast;
				if (options?.jsx && (this.matchJsx("jsxTagStart") || this.tsMatchLeftRelational())) {
					state = this.cloneCurLookaheadState();
					jsx = this.tryParse(() => this.parseMaybeAssignOrigin(forInit, refExpressionErrors, afterLeftParse), state);
					if (!jsx.error) return jsx.node;
					const context = this.context;
					const currentContext = context[context.length - 1];
					const lastCurrentContext = context[context.length - 2];
					if (currentContext === acornTypeScript.tokContexts.tc_oTag && lastCurrentContext === acornTypeScript.tokContexts.tc_expr) {
						context.pop();
						context.pop();
					} else if (currentContext === acornTypeScript.tokContexts.tc_oTag || currentContext === acornTypeScript.tokContexts.tc_expr) context.pop();
				}
				if (!jsx?.error && !this.tsMatchLeftRelational()) return this.parseMaybeAssignOrigin(forInit, refExpressionErrors, afterLeftParse);
				if (!state || this.compareLookaheadState(state, this.getCurLookaheadState())) state = this.cloneCurLookaheadState();
				let typeParameters;
				const arrow = this.tryParse((abort) => {
					typeParameters = this.tsParseTypeParameters(this.tsParseConstModifier);
					const expr = this.parseMaybeAssignOrigin(forInit, refExpressionErrors, afterLeftParse);
					if (expr.type !== "ArrowFunctionExpression" || expr.extra?.parenthesized) abort();
					if (typeParameters?.params.length !== 0) this.resetStartLocationFromNode(expr, typeParameters);
					expr.typeParameters = typeParameters;
					return expr;
				}, state);
				if (!arrow.error && !arrow.aborted) {
					if (typeParameters) this.reportReservedArrowTypeParam(typeParameters);
					return arrow.node;
				}
				if (!jsx) {
					assert(true);
					typeCast = this.tryParse(() => this.parseMaybeAssignOrigin(forInit, refExpressionErrors, afterLeftParse), state);
					if (!typeCast.error) return typeCast.node;
				}
				if (jsx?.node) {
					this.setLookaheadState(jsx.failState);
					return jsx.node;
				}
				if (arrow.node) {
					this.setLookaheadState(arrow.failState);
					if (typeParameters) this.reportReservedArrowTypeParam(typeParameters);
					return arrow.node;
				}
				if (typeCast?.node) {
					this.setLookaheadState(typeCast.failState);
					return typeCast.node;
				}
				if (jsx?.thrown) throw jsx.error;
				if (arrow.thrown) throw arrow.error;
				if (typeCast?.thrown) throw typeCast.error;
				throw jsx?.error || arrow.error || typeCast?.error;
			}
			parseAssignableListItem(allowModifiers) {
				const decorators = [];
				while (this.match(tokTypes.at)) decorators.push(this.parseDecorator());
				const startPos = this.start;
				const startLoc = this.startLoc;
				let accessibility;
				let readonly = false;
				let override = false;
				if (allowModifiers !== void 0) {
					const modified = {};
					this.tsParseModifiers({
						modified,
						allowedModifiers: [
							"public",
							"private",
							"protected",
							"override",
							"readonly"
						]
					});
					accessibility = modified.accessibility;
					override = modified.override;
					readonly = modified.readonly;
					if (allowModifiers === false && (accessibility || readonly || override)) this.raise(startLoc.column, TypeScriptError.UnexpectedParameterModifier);
				}
				const left = this.parseMaybeDefault(startPos, startLoc);
				this.parseBindingListItem(left);
				const elt = this.parseMaybeDefault(left["start"], left["loc"].start, left);
				if (decorators.length) elt.decorators = decorators;
				if (accessibility || readonly || override) {
					const pp = this.startNodeAt(startPos, startLoc);
					if (accessibility) pp.accessibility = accessibility;
					if (readonly) pp.readonly = readonly;
					if (override) pp.override = override;
					if (elt.type !== "Identifier" && elt.type !== "AssignmentPattern") this.raise(pp.start, TypeScriptError.UnsupportedParameterPropertyKind);
					pp.parameter = elt;
					return this.finishNode(pp, "TSParameterProperty");
				}
				return elt;
			}
			checkLValInnerPattern(expr, bindingType = acornScope.BIND_NONE, checkClashes) {
				switch (expr.type) {
					case "TSParameterProperty":
						this.checkLValInnerPattern(expr.parameter, bindingType, checkClashes);
						break;
					default:
						super.checkLValInnerPattern(expr, bindingType, checkClashes);
						break;
				}
			}
			parseBindingListItem(param) {
				if (this.eat(tt.question)) {
					if (param.type !== "Identifier" && !this.isAmbientContext && !this.inType) this.raise(param.start, TypeScriptError.PatternIsOptional);
					param.optional = true;
				}
				const type = this.tsTryParseTypeAnnotation();
				if (type) param.typeAnnotation = type;
				this.resetEndLocation(param);
				return param;
			}
			isAssignable(node, isBinding) {
				switch (node.type) {
					case "TSTypeCastExpression": return this.isAssignable(node.expression, isBinding);
					case "TSParameterProperty": return true;
					case "Identifier":
					case "ObjectPattern":
					case "ArrayPattern":
					case "AssignmentPattern":
					case "RestElement": return true;
					case "ObjectExpression": {
						const last = node.properties.length - 1;
						return node.properties.every((prop, i) => {
							return prop.type !== "ObjectMethod" && (i === last || prop.type !== "SpreadElement") && this.isAssignable(prop);
						});
					}
					case "Property":
					case "ObjectProperty": return this.isAssignable(node.value);
					case "SpreadElement": return this.isAssignable(node.argument);
					case "ArrayExpression": return node.elements.every((element) => element === null || this.isAssignable(element));
					case "AssignmentExpression": return node.operator === "=";
					case "ParenthesizedExpression": return this.isAssignable(node.expression);
					case "MemberExpression":
					case "OptionalMemberExpression": return !isBinding;
					default: return false;
				}
			}
			toAssignable(node, isBinding = false, refDestructuringErrors = new DestructuringErrors$1()) {
				switch (node.type) {
					case "ParenthesizedExpression": return this.toAssignableParenthesizedExpression(node, isBinding, refDestructuringErrors);
					case "TSAsExpression":
					case "TSSatisfiesExpression":
					case "TSNonNullExpression":
					case "TSTypeAssertion":
						if (isBinding) {} else this.raise(node.start, TypeScriptError.UnexpectedTypeCastInParameter);
						return this.toAssignable(node.expression, isBinding, refDestructuringErrors);
					case "MemberExpression": break;
					case "AssignmentExpression":
						if (!isBinding && node.left.type === "TSTypeCastExpression") node.left = this.typeCastToParameter(node.left);
						return super.toAssignable(node, isBinding, refDestructuringErrors);
					case "TSTypeCastExpression": return this.typeCastToParameter(node);
					default: return super.toAssignable(node, isBinding, refDestructuringErrors);
				}
				return node;
			}
			toAssignableParenthesizedExpression(node, isBinding, refDestructuringErrors) {
				switch (node.expression.type) {
					case "TSAsExpression":
					case "TSSatisfiesExpression":
					case "TSNonNullExpression":
					case "TSTypeAssertion":
					case "ParenthesizedExpression": return this.toAssignable(node.expression, isBinding, refDestructuringErrors);
					default: return super.toAssignable(node, isBinding, refDestructuringErrors);
				}
			}
			parseBindingAtom() {
				switch (this.type) {
					case tt._this: return this.parseIdent(true);
					default: return super.parseBindingAtom();
				}
			}
			shouldParseArrow(exprList) {
				let shouldParseArrowRes;
				if (this.match(tt.colon)) shouldParseArrowRes = exprList.every((expr) => this.isAssignable(expr, true));
				else shouldParseArrowRes = !this.canInsertSemicolon();
				if (shouldParseArrowRes) {
					if (this.match(tt.colon)) {
						const result = this.tryParse((abort) => {
							const returnType = this.tsParseTypeOrTypePredicateAnnotation(tt.colon);
							if (this.canInsertSemicolon() || !this.match(tt.arrow)) abort();
							return returnType;
						});
						if (result.aborted) {
							this.shouldParseArrowReturnType = void 0;
							return false;
						}
						if (!result.thrown) {
							if (result.error) this.setLookaheadState(result.failState);
							this.shouldParseArrowReturnType = result.node;
						}
					}
					if (!this.match(tt.arrow)) {
						this.shouldParseArrowReturnType = void 0;
						return false;
					}
					return true;
				}
				this.shouldParseArrowReturnType = void 0;
				return shouldParseArrowRes;
			}
			parseParenArrowList(startPos, startLoc, exprList, forInit) {
				const node = this.startNodeAt(startPos, startLoc);
				node.returnType = this.shouldParseArrowReturnType;
				this.shouldParseArrowReturnType = void 0;
				return this.parseArrowExpression(node, exprList, false, forInit);
			}
			parseParenAndDistinguishExpression(canBeArrow, forInit) {
				let startPos = this.start, startLoc = this.startLoc, val, allowTrailingComma = this.ecmaVersion >= 8;
				if (this.ecmaVersion >= 6) {
					const oldMaybeInArrowParameters = this.maybeInArrowParameters;
					this.maybeInArrowParameters = true;
					this.next();
					let innerStartPos = this.start, innerStartLoc = this.startLoc;
					let exprList = [], first = true, lastIsComma = false;
					let refDestructuringErrors = new DestructuringErrors$1(), oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, spreadStart;
					this.yieldPos = 0;
					this.awaitPos = 0;
					while (this.type !== tt.parenR) {
						first ? first = false : this.expect(tt.comma);
						if (allowTrailingComma && this.afterTrailingComma(tt.parenR, true)) {
							lastIsComma = true;
							break;
						} else if (this.type === tt.ellipsis) {
							spreadStart = this.start;
							exprList.push(this.parseParenItem(this.parseRestBinding()));
							if (this.type === tt.comma) this.raise(this.start, "Comma is not permitted after the rest element");
							break;
						} else exprList.push(this.parseMaybeAssign(forInit, refDestructuringErrors, this.parseParenItem));
					}
					let innerEndPos = this.lastTokEnd, innerEndLoc = this.lastTokEndLoc;
					this.expect(tt.parenR);
					this.maybeInArrowParameters = oldMaybeInArrowParameters;
					if (canBeArrow && this.shouldParseArrow(exprList) && this.eat(tt.arrow)) {
						this.checkPatternErrors(refDestructuringErrors, false);
						this.checkYieldAwaitInDefaultParams();
						this.yieldPos = oldYieldPos;
						this.awaitPos = oldAwaitPos;
						return this.parseParenArrowList(startPos, startLoc, exprList, forInit);
					}
					if (!exprList.length || lastIsComma) this.unexpected(this.lastTokStart);
					if (spreadStart) this.unexpected(spreadStart);
					this.checkExpressionErrors(refDestructuringErrors, true);
					this.yieldPos = oldYieldPos || this.yieldPos;
					this.awaitPos = oldAwaitPos || this.awaitPos;
					if (exprList.length > 1) {
						val = this.startNodeAt(innerStartPos, innerStartLoc);
						val.expressions = exprList;
						this.finishNodeAt(val, "SequenceExpression", innerEndPos, innerEndLoc);
					} else val = exprList[0];
				} else val = this.parseParenExpression();
				if (this.options.preserveParens) {
					let par = this.startNodeAt(startPos, startLoc);
					par.expression = val;
					return this.finishNode(par, "ParenthesizedExpression");
				} else return val;
			}
			parseTaggedTemplateExpression(base, startPos, startLoc, optionalChainMember) {
				const node = this.startNodeAt(startPos, startLoc);
				node.tag = base;
				node.quasi = this.parseTemplate({ isTagged: true });
				if (optionalChainMember) this.raise(startPos, "Tagged Template Literals are not allowed in optionalChain.");
				return this.finishNode(node, "TaggedTemplateExpression");
			}
			shouldParseAsyncArrow() {
				if (this.match(tt.colon)) {
					const result = this.tryParse((abort) => {
						const returnType = this.tsParseTypeOrTypePredicateAnnotation(tt.colon);
						if (this.canInsertSemicolon() || !this.match(tt.arrow)) abort();
						return returnType;
					});
					if (result.aborted) {
						this.shouldParseAsyncArrowReturnType = void 0;
						return false;
					}
					if (!result.thrown) {
						if (result.error) this.setLookaheadState(result.failState);
						this.shouldParseAsyncArrowReturnType = result.node;
						return !this.canInsertSemicolon() && this.eat(tt.arrow);
					}
				} else return !this.canInsertSemicolon() && this.eat(tt.arrow);
			}
			parseSubscriptAsyncArrow(startPos, startLoc, exprList, forInit) {
				const arrN = this.startNodeAt(startPos, startLoc);
				arrN.returnType = this.shouldParseAsyncArrowReturnType;
				this.shouldParseAsyncArrowReturnType = void 0;
				return this.parseArrowExpression(arrN, exprList, true, forInit);
			}
			parseExprList(close, allowTrailingComma, allowEmpty, refDestructuringErrors) {
				let elts = [], first = true;
				while (!this.eat(close)) {
					if (!first) {
						this.expect(tt.comma);
						if (allowTrailingComma && this.afterTrailingComma(close)) break;
					} else first = false;
					let elt;
					if (allowEmpty && this.type === tt.comma) elt = null;
					else if (this.type === tt.ellipsis) {
						elt = this.parseSpread(refDestructuringErrors);
						if (this.maybeInArrowParameters && this.match(tt.colon)) elt.typeAnnotation = this.tsParseTypeAnnotation();
						if (refDestructuringErrors && this.type === tt.comma && refDestructuringErrors.trailingComma < 0) refDestructuringErrors.trailingComma = this.start;
					} else elt = this.parseMaybeAssign(false, refDestructuringErrors, this.parseParenItem);
					elts.push(elt);
				}
				return elts;
			}
			parseSubscript(base, startPos, startLoc, noCalls, maybeAsyncArrow, optionalChained, forInit) {
				let _optionalChained = optionalChained;
				if (!this.hasPrecedingLineBreak() && this.value === "!" && this.match(tt.prefix)) {
					this.exprAllowed = false;
					this.next();
					const nonNullExpression = this.startNodeAt(startPos, startLoc);
					nonNullExpression.expression = base;
					base = this.finishNode(nonNullExpression, "TSNonNullExpression");
					return base;
				}
				let isOptionalCall = false;
				if (this.match(tt.questionDot) && this.lookaheadCharCode() === 60) {
					if (noCalls) return base;
					base.optional = true;
					_optionalChained = isOptionalCall = true;
					this.next();
				}
				if (this.tsMatchLeftRelational() || this.match(tt.bitShift)) {
					let missingParenErrorLoc;
					const result = this.tsTryParseAndCatch(() => {
						if (!noCalls && this.atPossibleAsyncArrow(base)) {
							const asyncArrowFn = this.tsTryParseGenericAsyncArrowFunction(startPos, startLoc, forInit);
							if (asyncArrowFn) {
								base = asyncArrowFn;
								return base;
							}
						}
						const typeArguments = this.tsParseTypeArgumentsInExpression();
						if (!typeArguments) return base;
						if (isOptionalCall && !this.match(tt.parenL)) {
							missingParenErrorLoc = this.curPosition();
							return base;
						}
						if (tokenIsTemplate(this.type) || this.type === tt.backQuote) {
							const result2 = this.parseTaggedTemplateExpression(base, startPos, startLoc, _optionalChained);
							result2.typeArguments = typeArguments;
							return result2;
						}
						if (!noCalls && this.eat(tt.parenL)) {
							let refDestructuringErrors = new DestructuringErrors$1();
							const node2 = this.startNodeAt(startPos, startLoc);
							node2.callee = base;
							node2.arguments = this.parseExprList(tt.parenR, this.ecmaVersion >= 8, false, refDestructuringErrors);
							this.tsCheckForInvalidTypeCasts(node2.arguments);
							node2.typeArguments = typeArguments;
							if (_optionalChained) node2.optional = isOptionalCall;
							this.checkExpressionErrors(refDestructuringErrors, true);
							base = this.finishNode(node2, "CallExpression");
							return base;
						}
						const tokenType = this.type;
						if (this.tsMatchRightRelational() || tokenType === tt.bitShift || tokenType !== tt.parenL && tokenCanStartExpression(tokenType) && !this.hasPrecedingLineBreak()) return;
						const node = this.startNodeAt(startPos, startLoc);
						node.expression = base;
						node.typeArguments = typeArguments;
						return this.finishNode(node, "TSInstantiationExpression");
					});
					if (missingParenErrorLoc) this.unexpected(missingParenErrorLoc);
					if (result) {
						if (result.type === "TSInstantiationExpression" && (this.match(tt.dot) || this.match(tt.questionDot) && this.lookaheadCharCode() !== 40)) this.raise(this.start, TypeScriptError.InvalidPropertyAccessAfterInstantiationExpression);
						base = result;
						return base;
					}
				}
				let optionalSupported = this.ecmaVersion >= 11;
				let optional = optionalSupported && this.eat(tt.questionDot);
				if (noCalls && optional) this.raise(this.lastTokStart, "Optional chaining cannot appear in the callee of new expressions");
				let computed = this.eat(tt.bracketL);
				if (computed || optional && this.type !== tt.parenL && this.type !== tt.backQuote || this.eat(tt.dot)) {
					let node = this.startNodeAt(startPos, startLoc);
					node.object = base;
					if (computed) {
						node.property = this.parseExpression();
						this.expect(tt.bracketR);
					} else if (this.type === tt.privateId && base.type !== "Super") node.property = this.parsePrivateIdent();
					else node.property = this.parseIdent(this.options.allowReserved !== "never");
					node.computed = !!computed;
					if (optionalSupported) node.optional = optional;
					base = this.finishNode(node, "MemberExpression");
				} else if (!noCalls && this.eat(tt.parenL)) {
					const oldMaybeInArrowParameters = this.maybeInArrowParameters;
					this.maybeInArrowParameters = true;
					let refDestructuringErrors = new DestructuringErrors$1(), oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
					this.yieldPos = 0;
					this.awaitPos = 0;
					this.awaitIdentPos = 0;
					let exprList = this.parseExprList(tt.parenR, this.ecmaVersion >= 8, false, refDestructuringErrors);
					if (maybeAsyncArrow && !optional && this.shouldParseAsyncArrow()) {
						this.checkPatternErrors(refDestructuringErrors, false);
						this.checkYieldAwaitInDefaultParams();
						if (this.awaitIdentPos > 0) this.raise(this.awaitIdentPos, "Cannot use 'await' as identifier inside an async function");
						this.yieldPos = oldYieldPos;
						this.awaitPos = oldAwaitPos;
						this.awaitIdentPos = oldAwaitIdentPos;
						base = this.parseSubscriptAsyncArrow(startPos, startLoc, exprList, forInit);
					} else {
						this.checkExpressionErrors(refDestructuringErrors, true);
						this.yieldPos = oldYieldPos || this.yieldPos;
						this.awaitPos = oldAwaitPos || this.awaitPos;
						this.awaitIdentPos = oldAwaitIdentPos || this.awaitIdentPos;
						let node = this.startNodeAt(startPos, startLoc);
						node.callee = base;
						node.arguments = exprList;
						if (optionalSupported) node.optional = optional;
						base = this.finishNode(node, "CallExpression");
					}
					this.maybeInArrowParameters = oldMaybeInArrowParameters;
				} else if (this.type === tt.backQuote) {
					if (optional || _optionalChained) this.raise(this.start, "Optional chaining cannot appear in the tag of tagged template expressions");
					let node = this.startNodeAt(startPos, startLoc);
					node.tag = base;
					node.quasi = this.parseTemplate({ isTagged: true });
					base = this.finishNode(node, "TaggedTemplateExpression");
				}
				return base;
			}
			parseGetterSetter(prop) {
				prop.kind = prop.key.name;
				this.parsePropertyName(prop);
				const typeParameters = this.tsTryParseTypeParameters(this.tsParseConstModifier);
				prop.value = this.parseMethod(false);
				if (typeParameters) prop.value.typeParameters = typeParameters;
				let paramCount = prop.kind === "get" ? 0 : 1;
				const firstParam = prop.value.params[0];
				paramCount = firstParam && this.isThisParam(firstParam) ? paramCount + 1 : paramCount;
				if (prop.value.params.length !== paramCount) {
					let start = prop.value.start;
					if (prop.kind === "get") this.raiseRecoverable(start, "getter should have no params");
					else this.raiseRecoverable(start, "setter should have exactly one param");
				} else if (prop.kind === "set" && prop.value.params[0].type === "RestElement") this.raiseRecoverable(prop.value.params[0].start, "Setter cannot use rest params");
			}
			parsePropertyValue(prop, isPattern, isGenerator, isAsync, startPos, startLoc, refDestructuringErrors, containsEsc) {
				if (this.tsMatchLeftRelational()) {
					if (isPattern) this.unexpected();
					prop.kind = "init";
					prop.method = true;
					const typeParameters = this.tsTryParseTypeParameters(this.tsParseConstModifier);
					prop.value = this.parseMethod(isGenerator, isAsync);
					if (typeParameters) prop.value.typeParameters = typeParameters;
					return;
				}
				return super.parsePropertyValue(prop, isPattern, isGenerator, isAsync, startPos, startLoc, refDestructuringErrors, containsEsc);
			}
			parseProperty(isPattern, refDestructuringErrors) {
				if (!isPattern) {
					let decorators = [];
					if (this.match(tokTypes.at)) while (this.match(tokTypes.at)) decorators.push(this.parseDecorator());
					const property = super.parseProperty(isPattern, refDestructuringErrors);
					if (property.type === "SpreadElement") {
						if (decorators.length) this.raise(property.start, DecoratorsError.SpreadElementDecorator);
					}
					if (decorators.length) {
						property.decorators = decorators;
						decorators = [];
					}
					return property;
				}
				return super.parseProperty(isPattern, refDestructuringErrors);
			}
			parseCatchClauseParam() {
				const param = this.parseBindingAtom();
				let simple = param.type === "Identifier";
				this.enterScope(simple ? acornScope.SCOPE_SIMPLE_CATCH : 0);
				this.checkLValPattern(param, simple ? acornScope.BIND_SIMPLE_CATCH : acornScope.BIND_LEXICAL);
				const type = this.tsTryParseTypeAnnotation();
				if (type) {
					param.typeAnnotation = type;
					this.resetEndLocation(param);
				}
				this.expect(tt.parenR);
				return param;
			}
			parseClass(node, isStatement) {
				const oldInAbstractClass = this.inAbstractClass;
				this.inAbstractClass = !!node.abstract;
				try {
					this.next();
					this.takeDecorators(node);
					const oldStrict = this.strict;
					this.strict = true;
					this.parseClassId(node, isStatement);
					this.parseClassSuper(node);
					const privateNameMap = this.enterClassBody();
					const classBody = this.startNode();
					let hadConstructor = false;
					classBody.body = [];
					let decorators = [];
					this.expect(tt.braceL);
					while (this.type !== tt.braceR) {
						if (this.match(tokTypes.at)) {
							decorators.push(this.parseDecorator());
							continue;
						}
						const element = this.parseClassElement(node.superClass !== null);
						if (decorators.length) {
							element.decorators = decorators;
							this.resetStartLocationFromNode(element, decorators[0]);
							decorators = [];
						}
						if (element) {
							classBody.body.push(element);
							if (element.type === "MethodDefinition" && element.kind === "constructor" && element.value.type === "FunctionExpression") {
								if (hadConstructor) this.raiseRecoverable(element.start, "Duplicate constructor in the same class");
								hadConstructor = true;
								if (element.decorators && element.decorators.length > 0) this.raise(element.start, DecoratorsError.DecoratorConstructor);
							} else if (element.key && element.key.type === "PrivateIdentifier" && element.value?.type !== "TSDeclareMethod" && isPrivateNameConflicted(privateNameMap, element)) this.raiseRecoverable(element.key.start, `Identifier '#${element.key.name}' has already been declared`);
						}
					}
					this.strict = oldStrict;
					this.next();
					if (decorators.length) this.raise(this.start, DecoratorsError.TrailingDecorator);
					node.body = this.finishNode(classBody, "ClassBody");
					this.exitClassBody();
					return this.finishNode(node, isStatement ? "ClassDeclaration" : "ClassExpression");
				} finally {
					this.inAbstractClass = oldInAbstractClass;
				}
			}
			parseClassFunctionParams() {
				const typeParameters = this.tsTryParseTypeParameters();
				let params = this.parseBindingList(tt.parenR, false, this.ecmaVersion >= 8, true);
				if (typeParameters) params.typeParameters = typeParameters;
				return params;
			}
			parseMethod(isGenerator, isAsync, allowDirectSuper, inClassScope, method) {
				let node = this.startNode(), oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
				this.initFunction(node);
				if (this.ecmaVersion >= 6) node.generator = isGenerator;
				if (this.ecmaVersion >= 8) node.async = !!isAsync;
				this.yieldPos = 0;
				this.awaitPos = 0;
				this.awaitIdentPos = 0;
				this.enterScope(functionFlags(isAsync, node.generator) | acornScope.SCOPE_SUPER | (allowDirectSuper ? acornScope.SCOPE_DIRECT_SUPER : 0));
				this.expect(tt.parenL);
				node.params = this.parseClassFunctionParams();
				this.checkYieldAwaitInDefaultParams();
				this.parseFunctionBody(node, false, true, false, { isClassMethod: inClassScope });
				this.yieldPos = oldYieldPos;
				this.awaitPos = oldAwaitPos;
				this.awaitIdentPos = oldAwaitIdentPos;
				if (method && method.abstract) {
					if (!!node.body) {
						const { key } = method;
						this.raise(method.start, TypeScriptError.AbstractMethodHasImplementation({ methodName: key.type === "Identifier" && !method.computed ? key.name : `[${this.input.slice(key.start, key.end)}]` }));
					}
				}
				return this.finishNode(node, "FunctionExpression");
			}
			static parse(input, options2) {
				if (options2.locations === false) throw new Error(`You have to enable options.locations while using acorn-typescript`);
				else options2.locations = true;
				const parser = new this(options2, input);
				if (dts) parser.isAmbientContext = true;
				return parser.parse();
			}
			static parseExpressionAt(input, pos, options2) {
				if (options2.locations === false) throw new Error(`You have to enable options.locations while using acorn-typescript`);
				else options2.locations = true;
				const parser = new this(options2, input, pos);
				if (dts) parser.isAmbientContext = true;
				parser.nextToken();
				return parser.parseExpression();
			}
			parseImportSpecifier() {
				if (this.ts_isContextual(tokTypes.type)) {
					let node = this.startNode();
					node.imported = this.parseModuleExportName();
					this.parseTypeOnlyImportExportSpecifier(node, true, this.importOrExportOuterKind === "type");
					return this.finishNode(node, "ImportSpecifier");
				} else {
					const node = super.parseImportSpecifier();
					node.importKind = "value";
					return node;
				}
			}
			parseExportSpecifier(exports) {
				const isMaybeTypeOnly = this.ts_isContextual(tokTypes.type);
				if (!this.match(tt.string) && isMaybeTypeOnly) {
					let node = this.startNode();
					node.local = this.parseModuleExportName();
					this.parseTypeOnlyImportExportSpecifier(node, false, this.importOrExportOuterKind === "type");
					this.finishNode(node, "ExportSpecifier");
					this.checkExport(exports, node.exported, node.exported.start);
					return node;
				} else {
					const node = super.parseExportSpecifier(exports);
					node.exportKind = "value";
					return node;
				}
			}
			parseTypeOnlyImportExportSpecifier(node, isImport, isInTypeOnlyImportExport) {
				const leftOfAsKey = isImport ? "imported" : "local";
				const rightOfAsKey = isImport ? "local" : "exported";
				let leftOfAs = node[leftOfAsKey];
				let rightOfAs;
				let hasTypeSpecifier = false;
				let canParseAsKeyword = true;
				const loc = leftOfAs.start;
				if (this.isContextual("as")) {
					const firstAs = this.parseIdent();
					if (this.isContextual("as")) {
						const secondAs = this.parseIdent();
						if (tokenIsKeywordOrIdentifier(this.type)) {
							hasTypeSpecifier = true;
							leftOfAs = firstAs;
							rightOfAs = isImport ? this.parseIdent() : this.parseModuleExportName();
							canParseAsKeyword = false;
						} else {
							rightOfAs = secondAs;
							canParseAsKeyword = false;
						}
					} else if (tokenIsKeywordOrIdentifier(this.type)) {
						canParseAsKeyword = false;
						rightOfAs = isImport ? this.parseIdent() : this.parseModuleExportName();
					} else {
						hasTypeSpecifier = true;
						leftOfAs = firstAs;
					}
				} else if (tokenIsKeywordOrIdentifier(this.type)) {
					hasTypeSpecifier = true;
					if (isImport) {
						leftOfAs = super.parseIdent(true);
						if (!this.isContextual("as")) this.checkUnreserved(leftOfAs);
					} else leftOfAs = this.parseModuleExportName();
				}
				if (hasTypeSpecifier && isInTypeOnlyImportExport) this.raise(loc, isImport ? TypeScriptError.TypeModifierIsUsedInTypeImports : TypeScriptError.TypeModifierIsUsedInTypeExports);
				node[leftOfAsKey] = leftOfAs;
				node[rightOfAsKey] = rightOfAs;
				const kindKey = isImport ? "importKind" : "exportKind";
				node[kindKey] = hasTypeSpecifier ? "type" : "value";
				if (canParseAsKeyword && this.eatContextual("as")) node[rightOfAsKey] = isImport ? this.parseIdent() : this.parseModuleExportName();
				if (!node[rightOfAsKey]) node[rightOfAsKey] = this.copyNode(node[leftOfAsKey]);
				if (isImport) this.checkLValSimple(node[rightOfAsKey], acornScope.BIND_LEXICAL);
			}
			raiseCommonCheck(pos, message, recoverable) {
				switch (message) {
					case "Comma is not permitted after the rest element": if (this.isAmbientContext && this.match(tt.comma) && this.lookaheadCharCode() === 41) {
						this.next();
						return;
					} else return super.raise(pos, message);
				}
				return recoverable ? super.raiseRecoverable(pos, message) : super.raise(pos, message);
			}
			raiseRecoverable(pos, message) {
				return this.raiseCommonCheck(pos, message, true);
			}
			raise(pos, message) {
				return this.raiseCommonCheck(pos, message, true);
			}
			updateContext(prevType) {
				const { type } = this;
				if (type == tt.braceL) {
					var curContext = this.curContext();
					if (curContext == tsTokContexts.tc_oTag) this.context.push(tokContexts.b_expr);
					else if (curContext == tsTokContexts.tc_expr) this.context.push(tokContexts.b_tmpl);
					else super.updateContext(prevType);
					this.exprAllowed = true;
				} else if (type === tt.slash && prevType === tokTypes.jsxTagStart) {
					this.context.length -= 2;
					this.context.push(tsTokContexts.tc_cTag);
					this.exprAllowed = false;
				} else return super.updateContext(prevType);
			}
			jsx_parseOpeningElementAt(startPos, startLoc) {
				let node = this.startNodeAt(startPos, startLoc);
				let nodeName = this.jsx_parseElementName();
				if (nodeName) node.name = nodeName;
				if (this.match(tt.relational) || this.match(tt.bitShift)) {
					const typeArguments = this.tsTryParseAndCatch(() => this.tsParseTypeArgumentsInExpression());
					if (typeArguments) node.typeArguments = typeArguments;
				}
				node.attributes = [];
				while (this.type !== tt.slash && this.type !== tokTypes.jsxTagEnd) node.attributes.push(this.jsx_parseAttribute());
				node.selfClosing = this.eat(tt.slash);
				this.expect(tokTypes.jsxTagEnd);
				return this.finishNode(node, nodeName ? "JSXOpeningElement" : "JSXOpeningFragment");
			}
			enterScope(flags) {
				if (flags === TS_SCOPE_TS_MODULE) this.importsStack.push([]);
				super.enterScope(flags);
				const scope = super.currentScope();
				scope.types = [];
				scope.enums = [];
				scope.constEnums = [];
				scope.classes = [];
				scope.exportOnlyBindings = [];
			}
			exitScope() {
				if (super.currentScope().flags === TS_SCOPE_TS_MODULE) this.importsStack.pop();
				super.exitScope();
			}
			hasImport(name, allowShadow) {
				const len = this.importsStack.length;
				if (this.importsStack[len - 1].indexOf(name) > -1) return true;
				if (!allowShadow && len > 1) {
					for (let i = 0; i < len - 1; i++) if (this.importsStack[i].indexOf(name) > -1) return true;
				}
				return false;
			}
			maybeExportDefined(scope, name) {
				if (this.inModule && scope.flags & acornScope.SCOPE_TOP) delete this.undefinedExports[name];
			}
			declareName(name, bindingType, pos) {
				if (bindingType & acornScope.BIND_FLAGS_TS_IMPORT) {
					if (this.hasImport(name, true)) this.raise(pos, `Identifier '${name}' has already been declared.`);
					this.importsStack[this.importsStack.length - 1].push(name);
					return;
				}
				const scope = this.currentScope();
				if (bindingType & acornScope.BIND_FLAGS_TS_EXPORT_ONLY) {
					this.maybeExportDefined(scope, name);
					scope.exportOnlyBindings.push(name);
					return;
				}
				if (bindingType === acornScope.BIND_TS_TYPE || bindingType === acornScope.BIND_TS_INTERFACE) {
					if (bindingType === acornScope.BIND_TS_TYPE && scope.types.includes(name)) this.raise(pos, `type '${name}' has already been declared.`);
					scope.types.push(name);
				} else super.declareName(name, bindingType, pos);
				if (bindingType & acornScope.BIND_FLAGS_TS_ENUM) scope.enums.push(name);
				if (bindingType & acornScope.BIND_FLAGS_TS_CONST_ENUM) scope.constEnums.push(name);
				if (bindingType & acornScope.BIND_FLAGS_CLASS) scope.classes.push(name);
			}
			checkLocalExport(id) {
				const { name } = id;
				if (this.hasImport(name)) return;
				const len = this.scopeStack.length;
				for (let i = len - 1; i >= 0; i--) {
					const scope = this.scopeStack[i];
					if (scope.types.indexOf(name) > -1 || scope.exportOnlyBindings.indexOf(name) > -1) return;
				}
				super.checkLocalExport(id);
			}
		}
		return TypeScriptParser;
	};
}
//#endregion
//#region ../native-tsrx/node_modules/.pnpm/zimmerframe@1.1.4/node_modules/zimmerframe/src/walk.js
/** @import { Context, Visitor, Visitors } from './types.js' */
/**
* @template {{ type: string }} T
* @template {Record<string, any> | null} U
* @param {T} node
* @param {U} state
* @param {Visitors<T, U>} visitors
*/
function walk$1(node, state, visitors) {
	const universal = visitors._;
	let stopped = false;
	/** @type {Visitor<T, U, T>} _ */
	function default_visitor(_, { next, state }) {
		next(state);
	}
	/**
	* @param {T} node
	* @param {T[]} path
	* @param {U} state
	* @returns {T | undefined}
	*/
	function visit(node, path, state) {
		if (stopped) return;
		if (!node.type) return;
		/** @type {T | void} */
		let result;
		/** @type {Record<string, any>} */
		const mutations = {};
		/** @type {Context<T, U>} */
		const context = {
			path,
			state,
			next: (next_state = state) => {
				path.push(node);
				for (const key in node) {
					if (key === "type") continue;
					const child_node = node[key];
					if (child_node && typeof child_node === "object") if (Array.isArray(child_node)) {
						/** @type {Record<number, T>} */
						const array_mutations = {};
						const len = child_node.length;
						let mutated = false;
						for (let i = 0; i < len; i++) {
							const node = child_node[i];
							if (node && typeof node === "object") {
								const result = visit(node, path, next_state);
								if (result) {
									array_mutations[i] = result;
									mutated = true;
								}
							}
						}
						if (mutated) mutations[key] = child_node.map((node, i) => array_mutations[i] ?? node);
					} else {
						const result = visit(child_node, path, next_state);
						if (result) mutations[key] = result;
					}
				}
				path.pop();
				if (Object.keys(mutations).length > 0) return apply_mutations(node, mutations);
			},
			stop: () => {
				stopped = true;
			},
			visit: (next_node, next_state = state) => {
				path.push(node);
				const result = visit(next_node, path, next_state) ?? next_node;
				path.pop();
				return result;
			}
		};
		let visitor = visitors[node.type] ?? default_visitor;
		if (universal) {
			/** @type {T | void} */
			let inner_result;
			result = universal(node, {
				...context,
				/** @param {U} next_state */
				next: (next_state = state) => {
					state = next_state;
					inner_result = visitor(node, {
						...context,
						state: next_state
					});
					return inner_result;
				}
			});
			if (!result && inner_result) result = inner_result;
		} else result = visitor(node, context);
		if (!result) {
			if (Object.keys(mutations).length > 0) result = apply_mutations(node, mutations);
		}
		if (result) return result;
	}
	return visit(node, [], state) ?? node;
}
/**
* @template {Record<string, any>} T
* @param {T} node
* @param {Record<string, any>} mutations
* @returns {T}
*/
function apply_mutations(node, mutations) {
	/** @type {Record<string, any>} */
	const obj = {};
	const descriptors = Object.getOwnPropertyDescriptors(node);
	for (const key in descriptors) Object.defineProperty(obj, key, descriptors[key]);
	for (const key in mutations) obj[key] = mutations[key];
	return obj;
}
//#endregion
//#region ../native-tsrx/src/parse/index.js
/**
@import * as AST from 'estree'
@import * as ESTreeJSX from 'estree-jsx'
@import { Parse } from '../../types/parse'
*/
/**
* @typedef {(BaseParser: typeof acorn.Parser) => typeof acorn.Parser} AcornPlugin
*/
/** @type {Parse.BindingType} */
const BINDING_TYPES = {
	BIND_NONE: 0,
	BIND_VAR: 1,
	BIND_LEXICAL: 2,
	BIND_FUNCTION: 3,
	BIND_SIMPLE_CATCH: 4,
	BIND_OUTSIDE: 5
};
/**
* @this {Parse.DestructuringErrors}
* @returns {Parse.DestructuringErrors}
*/
function DestructuringErrors() {
	if (!(this instanceof DestructuringErrors)) throw new TypeError("'DestructuringErrors' must be invoked with 'new'");
	this.shorthandAssign = -1;
	this.trailingComma = -1;
	this.parenthesizedAssign = -1;
	this.parenthesizedBind = -1;
	this.doubleProto = -1;
	return this;
}
/**
* Convert JSX node types to regular JavaScript node types
* @param {ESTreeJSX.JSXIdentifier | ESTreeJSX.JSXMemberExpression | AST.Node} node - The JSX node to convert
* @returns {AST.Identifier | AST.MemberExpression | AST.Node} The converted node
*/
function convert_from_jsx(node) {
	/** @type {AST.Identifier | AST.MemberExpression | AST.Node} */
	let converted_node;
	if (node.type === "JSXIdentifier") {
		converted_node = node;
		converted_node.type = "Identifier";
	} else if (node.type === "JSXMemberExpression") {
		converted_node = node;
		converted_node.type = "MemberExpression";
		converted_node.object = convert_from_jsx(converted_node.object);
		converted_node.property = convert_from_jsx(converted_node.property);
	} else converted_node = node;
	return converted_node;
}
const regex_whitespace_only = /\s/;
/**
* Skip whitespace characters without skipping comments.
* This is needed because Acorn's skipSpace() also skips comments, which breaks
* parsing in certain contexts. Updates parser position and line tracking.
* @param {Parse.Parser} parser
*/
function skipWhitespace(parser) {
	const originalStart = parser.start;
	/** @type {acorn.Position | undefined} */
	let lineInfo;
	while (parser.start < parser.input.length && regex_whitespace_only.test(parser.input[parser.start])) parser.start++;
	if (parser.start !== originalStart) {
		lineInfo = getLineInfo(parser.input, parser.start);
		if (parser.pos <= parser.start) {
			parser.curLine = lineInfo.line;
			parser.lineStart = parser.start - lineInfo.column;
		}
	}
	parser.startLoc = lineInfo || getLineInfo(parser.input, parser.start);
}
/**
* @param {AST.Node | null | undefined} node
* @returns {boolean}
*/
function isWhitespaceTextNode(node) {
	if (!node || node.type !== "Text") return false;
	const expr = node.expression;
	if (expr && expr.type === "Literal" && typeof expr.value === "string") return /^\s*$/.test(expr.value);
	return false;
}
/**
* @type {AcornPlugin}
*/
function elementTemplateClosingTagPlugin(Base) {
	const jsxTagStart = Base.acornTypeScript?.tokTypes?.jsxTagStart;
	if (!jsxTagStart) return Base;
	/**
	* @param {any} parser
	*/
	function inElementTemplateBodyDirect(parser) {
		const stack = parser.context;
		const top = stack[stack.length - 1];
		const below = stack[stack.length - 2];
		return top && top.token === "{" && below && below.token === "<tag>...</tag>";
	}
	/**
	* @param {any} parser
	*/
	function inElementTemplateBodyAnywhere(parser) {
		const stack = parser.context;
		for (let i = 1; i < stack.length; i++) if (stack[i] && stack[i].token === "{" && stack[i - 1] && stack[i - 1].token === "<tag>...</tag>") return true;
		return false;
	}
	/**
	* @param {any} parser
	*/
	function isOpeningTagAfterReturnKeyword(parser) {
		if (parser.input.charCodeAt(parser.start + 1) === 47) return false;
		let index = parser.start - 1;
		while (index >= 0) {
			const ch = parser.input.charCodeAt(index);
			if (ch === 32 || ch === 9) {
				index--;
				continue;
			}
			if (ch === 10 || ch === 13) return false;
			break;
		}
		const end = index + 1;
		const start = end - 6;
		if (start < 0 || parser.input.slice(start, end) !== "return") return false;
		const before = start > 0 ? parser.input.charCodeAt(start - 1) : -1;
		return !(before >= 48 && before <= 57 || before >= 65 && before <= 90 || before >= 97 && before <= 122 || before === 36 || before === 95);
	}
	return class extends Base {
		/** @param {number} code */
		getTokenFromCode(code) {
			if (code === 60 && !this.inType) {
				const self = this;
				if ((self.pos + 1 < self.input.length ? self.input.charCodeAt(self.pos + 1) : -1) === 47 && inElementTemplateBodyDirect(self)) {
					++self.pos;
					return self.finishToken(jsxTagStart);
				}
			}
			return super.getTokenFromCode(code);
		}
		canInsertSemicolon() {
			const self = this;
			if (self.type === jsxTagStart && inElementTemplateBodyAnywhere(self) && !isOpeningTagAfterReturnKeyword(self)) return true;
			return super.canInsertSemicolon();
		}
	};
}
/**
* Create a parser by composing Acorn with TypeScript/JSX support and optional framework plugins.
*
* This is the core factory for building tsrx-based parsers. Framework plugins (like TSRXPlugin)
* extend the base parser with framework-specific syntax.
*
* @param {...(AcornPlugin | Function)} plugins - Framework parser plugins to compose
* @returns {(source: string, filename?: string, options?: any) => AST.Program} A parse function
*/
function createParser(...plugins) {
	const parser = Parser$1.extend(tsPlugin({ jsx: true }), ...plugins.map((p) => p), elementTemplateClosingTagPlugin);
	/**
	* @param {string} source
	* @param {string} [filename]
	* @param {any} [options]
	* @returns {AST.Program}
	*/
	return function parse(source, filename, options) {
		/** @type {AST.CommentWithLocation[]} */
		const comments = [];
		const collect = !!(options?.collect || options?.loose);
		const output_comments = collect ? options?.comments : void 0;
		const { onComment, add_comments } = get_comment_handlers(source, comments);
		/** @type {AST.Program} */
		let ast;
		try {
			ast = parser.parse(source, {
				sourceType: "module",
				ecmaVersion: 13,
				allowReturnOutsideFunction: true,
				locations: true,
				onComment,
				tsrxOptions: {
					filename,
					collect,
					errors: collect ? options?.errors ?? [] : void 0,
					loose: options?.loose || false
				}
			});
		} catch (e) {
			throw e;
		}
		if (output_comments) for (let i = 0; i < comments.length; i++) output_comments.push(comments[i]);
		add_comments(ast);
		return ast;
	};
}
/**
* Create comment handlers for tracking and attaching comments to AST nodes.
* Used by parse functions to collect and attach comments during parsing.
* @param {string} source - The source code being parsed
* @param {AST.CommentWithLocation[]} comments - Array to collect comments into
* @param {number} [index=0] - Starting index for comment filtering
* @returns {{ onComment: Parse.Options['onComment'], add_comments: (ast: AST.Node | AST.CSS.StyleSheet) => void }}
*/
function get_comment_handlers(source, comments, index = 0) {
	/**
	* @param {string} text
	* @param {number} startIndex
	* @returns {string | null}
	*/
	function getNextNonWhitespaceCharacter(text, startIndex) {
		for (let i = startIndex; i < text.length; i++) {
			const char = text[i];
			if (char !== " " && char !== "	" && char !== "\n" && char !== "\r") return char;
		}
		return null;
	}
	return {
		/**
		* @type {Parse.Options['onComment']}
		*/
		onComment: (block, value, start, end, start_loc, end_loc, metadata) => {
			if (block && /\n/.test(value)) {
				let a = start;
				while (a > 0 && source[a - 1] !== "\n") a -= 1;
				let b = a;
				while (/[ \t]/.test(source[b])) b += 1;
				const indentation = source.slice(a, b);
				value = value.replace(new RegExp(`^${indentation}`, "gm"), "");
			}
			comments.push({
				type: block ? "Block" : "Line",
				value,
				start,
				end,
				loc: {
					start: start_loc,
					end: end_loc
				},
				context: metadata ?? null
			});
		},
		/**
		* @param {AST.Node | AST.CSS.StyleSheet} ast
		*/
		add_comments: (ast) => {
			if (comments.length === 0) return;
			comments = comments.filter((comment) => comment.start >= index).map(({ type, value, start, end, loc, context }) => ({
				type,
				value,
				start,
				end,
				loc,
				context
			}));
			walk$1(ast, null, { _(node, { next, path }) {
				const metadata = node?.metadata;
				/**
				* Check if a comment is inside an attribute expression
				* of any ancestor Elements.
				* @returns {boolean}
				*/
				function isCommentInsideAttributeExpression() {
					for (let i = path.length - 1; i >= 0; i--) {
						const ancestor = path[i];
						if (ancestor && (ancestor.type === "JSXAttribute" || ancestor.type === "Attribute" || ancestor.type === "JSXExpressionContainer")) return true;
					}
					return false;
				}
				/**
				* Check if a comment is inside any attribute of ancestor Elements,
				* but NOT if we're currently traversing inside that attribute.
				* @param {AST.CommentWithLocation} comment
				* @returns {boolean}
				*/
				function isCommentInsideUnvisitedAttribute(comment) {
					for (let i = path.length - 1; i >= 0; i--) {
						const ancestor = path[i];
						if (ancestor.type === "JSXAttribute" || ancestor.type === "Attribute") return false;
						if (ancestor && ancestor.type === "Element") {
							for (const attr of ancestor.attributes) if (comment.start >= attr.start && comment.end <= attr.end) return true;
						}
					}
					return false;
				}
				/**
				* If a comment is located between an empty Element's opening and closing tags,
				* attach it to the Element as `innerComments`.
				* @param {AST.CommentWithLocation} comment
				* @returns {AST.Element | null}
				*/
				function getEmptyElementInnerCommentTarget(comment) {
					const element = path.findLast((ancestor) => ancestor && ancestor.type === "Element");
					if (!element || element.children.length > 0 || !element.closingElement || !(comment.start >= element.openingElement.end && comment.end <= element.end)) return null;
					return element;
				}
				if (node.type === "StyleSheet") {
					const styleElement = path.findLast((ancestor) => ancestor && ancestor.type === "Element" && ancestor.id && ancestor.id.name === "style");
					if (styleElement) {
						const cssStart = styleElement.openingElement?.end ?? styleElement.start;
						const cssEnd = styleElement.closingElement?.start ?? styleElement.end;
						while (comments[0] && comments[0].start >= cssStart && comments[0].end <= cssEnd) comments.shift();
					}
					return;
				}
				if (metadata && metadata.commentContainerId !== void 0) {
					if (!(node.type === "Element" && (!node.children || node.children.length === 0))) while (comments[0] && comments[0].context && comments[0].context.containerId === metadata.commentContainerId && comments[0].context.beforeMeaningfulChild) {
						const commentStart = comments[0].start;
						if (node.children?.some((child) => child && child.start !== void 0 && child.end !== void 0 && commentStart >= child.start && commentStart < child.end)) break;
						const elementComment = comments.shift();
						(metadata.elementLeadingComments ||= []).push(elementComment);
					}
				}
				while (comments[0] && comments[0].start < node.start) {
					if (isCommentInsideUnvisitedAttribute(comments[0])) break;
					const maybeInner = getEmptyElementInnerCommentTarget(comments[0]);
					if (maybeInner) {
						(maybeInner.innerComments ||= []).push(comments.shift());
						continue;
					}
					const comment = comments.shift();
					if (node.type === "BlockStatement") {
						const parent = path.at(-1);
						if (parent && (parent.type === "FunctionDeclaration" || parent.type === "FunctionExpression" || parent.type === "ArrowFunctionExpression") && parent.body === node) {
							(parent.comments ||= []).push(comment);
							continue;
						}
					}
					if (isCommentInsideAttributeExpression()) {
						(node.leadingComments ||= []).push(comment);
						continue;
					}
					const targetAncestor = path.filter((ancestor) => ancestor && ancestor.type === "Element" && ancestor.loc).sort((a, b) => a.loc.start.line - b.loc.start.line).find((ancestor) => comment.loc.start.line < ancestor.loc.start.line);
					if (targetAncestor) {
						targetAncestor.metadata ??= { path: [] };
						(targetAncestor.metadata.elementLeadingComments ||= []).push(comment);
						continue;
					}
					(node.leadingComments ||= []).push(comment);
				}
				next();
				if (comments[0]) {
					if (node.type === "Program" && node.body.length === 0) {
						while (comments.length) {
							const comment = comments.shift();
							(node.innerComments ||= []).push(comment);
						}
						if (node.innerComments && node.innerComments.length > 0) return;
					}
					if (node.type === "BlockStatement" && node.body.length === 0) {
						while (comments[0] && comments[0].start < node.end && comments[0].end < node.end) {
							const comment = comments.shift();
							(node.innerComments ||= []).push(comment);
						}
						if (node.innerComments && node.innerComments.length > 0) return;
					}
					if (node.type === "JSXEmptyExpression") {
						while (comments[0] && comments[0].start >= node.start && comments[0].end <= node.end) {
							const comment = comments.shift();
							(node.innerComments ||= []).push(comment);
						}
						if (node.innerComments && node.innerComments.length > 0) return;
					}
					if (node.type === "Element" && (!node.children || node.children.length === 0)) {
						while (comments[0] && comments[0].start < node.end && comments[0].end < node.end) {
							const comment = comments.shift();
							(node.innerComments ||= []).push(comment);
						}
						if (node.innerComments && node.innerComments.length > 0) return;
					}
					const parent = path.at(-1);
					if (parent === void 0 || node.end !== parent.end) {
						const slice = source.slice(node.end, comments[0].start);
						let is_last_in_array = false;
						/** @type {(AST.Node | null)[] | null} */
						let node_array = null;
						let isParam = false;
						let isArgument = false;
						let isSwitchCaseSibling = false;
						if (parent) {
							if (parent.type === "BlockStatement" || parent.type === "Program" || parent.type === "ClassBody") node_array = parent.body;
							else if (parent.type === "SwitchStatement") {
								node_array = parent.cases;
								isSwitchCaseSibling = true;
							} else if (parent.type === "SwitchCase") node_array = parent.consequent;
							else if (parent.type === "ArrayExpression") node_array = parent.elements;
							else if (parent.type === "ObjectExpression") node_array = parent.properties;
							else if (parent.type === "ObjectPattern") node_array = parent.properties;
							else if (parent.type === "TSTypeLiteral") node_array = parent.members;
							else if (parent.type === "FunctionDeclaration" || parent.type === "FunctionExpression" || parent.type === "ArrowFunctionExpression") {
								node_array = parent.params;
								isParam = true;
							} else if (parent.type === "CallExpression" || parent.type === "NewExpression") {
								node_array = parent.arguments;
								isArgument = true;
							}
						}
						if (node_array && Array.isArray(node_array)) is_last_in_array = node_array.indexOf(node) === node_array.length - 1;
						const trailingCommentBoundary = parent && parent.type === "ObjectPattern" && parent.typeAnnotation && parent.typeAnnotation.start !== void 0 ? parent.typeAnnotation.start : parent?.end;
						if (is_last_in_array) if (isParam || isArgument) while (comments.length) {
							const potentialComment = comments[0];
							if (trailingCommentBoundary !== void 0 && potentialComment.start >= trailingCommentBoundary) break;
							const maybeInner = getEmptyElementInnerCommentTarget(potentialComment);
							if (maybeInner) {
								(maybeInner.innerComments ||= []).push(comments.shift());
								continue;
							}
							if (getNextNonWhitespaceCharacter(source, potentialComment.end) === ")") {
								(node.trailingComments ||= []).push(comments.shift());
								continue;
							}
							break;
						}
						else while (comments.length) {
							const comment = comments[0];
							if (trailingCommentBoundary !== void 0 && comment.start >= trailingCommentBoundary) break;
							const maybeInner = getEmptyElementInnerCommentTarget(comment);
							if (maybeInner) {
								(maybeInner.innerComments ||= []).push(comments.shift());
								continue;
							}
							(node.trailingComments ||= []).push(comment);
							comments.shift();
						}
						else if (node.end <= comments[0].start) {
							const maybeInner = getEmptyElementInnerCommentTarget(comments[0]);
							if (maybeInner) {
								(maybeInner.innerComments ||= []).push(comments.shift());
								return;
							}
							const onlySimpleWhitespace = /^[,) \t]*$/.test(slice);
							const onlyWhitespace = /^\s*$/.test(slice);
							const hasBlankLine = /\n\s*\n/.test(slice);
							const nodeEndLine = node.loc?.end?.line ?? null;
							const commentStartLine = comments[0].loc?.start?.line ?? null;
							const isImmediateNextLine = nodeEndLine !== null && commentStartLine !== null && commentStartLine === nodeEndLine + 1;
							if (isSwitchCaseSibling && !is_last_in_array) {
								if (nodeEndLine !== null && commentStartLine !== null && nodeEndLine === commentStartLine) node.trailingComments = [comments.shift()];
								return;
							}
							if (onlySimpleWhitespace || onlyWhitespace && !hasBlankLine && isImmediateNextLine) {
								if (comments[0].type === "Block" && !is_last_in_array && node_array) {
									const currentIndex = node_array.indexOf(node);
									const nextSibling = node_array[currentIndex + 1];
									if (nextSibling && nextSibling.loc) {
										if (comments[0].loc?.end?.line === nextSibling.loc?.start?.line) return;
									}
								}
								if (isParam) {
									if (source.slice(0, node.end).split("\n").length === source.slice(0, comments[0].start).split("\n").length) node.trailingComments = [comments.shift()];
								} else if (nodeEndLine !== null && commentStartLine !== null && nodeEndLine === commentStartLine || is_last_in_array) node.trailingComments = [comments.shift()];
							} else if (hasBlankLine && onlyWhitespace && node_array) {
								if (!(parent.type === "BlockStatement" || parent.type === "Program")) return;
								const currentIndex = node_array.indexOf(node);
								const nextSibling = node_array[currentIndex + 1];
								if (nextSibling && nextSibling.loc) {
									let lastCommentIndex = 0;
									let lastCommentEnd = comments[0].end;
									while (comments[lastCommentIndex + 1]) {
										const currentComment = comments[lastCommentIndex];
										const nextComment = comments[lastCommentIndex + 1];
										const sliceBetween = source.slice(currentComment.end, nextComment.start);
										if (/\n\s*\n/.test(sliceBetween)) break;
										lastCommentIndex++;
										lastCommentEnd = nextComment.end;
									}
									const sliceAfterComments = source.slice(lastCommentEnd, nextSibling.start);
									if (/\n\s*\n/.test(sliceAfterComments)) {
										if (!(nextSibling.type === "Element" && nextSibling.loc && comments.some((c) => {
											if (!c.loc) return false;
											return c.loc.start.line >= nextSibling.loc.start.line && c.loc.end.line <= nextSibling.loc.end.line;
										}))) for (let i = 0; i <= lastCommentIndex; i++) (node.trailingComments ||= []).push(comments.shift());
									}
								}
							}
						}
					}
				}
			} });
		}
	};
}
//#endregion
//#region ../native-tsrx/src/utils/hashing.js
const regex_return_characters = /\r/g;
/**
* Fast non-cryptographic string hash (djb2, base36).
*
* Cheap and small, producing 4–7 chars — good for high-volume identifiers like
* CSS class-name prefixes where the output multiplies across every scoped rule
* and DOM reference in the shipped bundle. Trivially reversible for short
* inputs, so never use this for hashes derived from server-only data that
* ships to the client (absolute file paths, function ids, etc.) — use
* {@link strong_hash} for those.
* @param {string} str
* @returns {string}
*/
function simple_hash(str) {
	str = str.replace(regex_return_characters, "");
	let hash = 5381;
	let i = str.length;
	while (i--) hash = (hash << 5) - hash ^ str.charCodeAt(i);
	return (hash >>> 0).toString(36);
}
//#endregion
//#region ../native-tsrx/src/parse/style.js
/** @import * as AST from 'estree' */
const REGEX_MATCHER = /^[~^$*|]?=/;
const REGEX_ATTRIBUTE_FLAGS = /^[a-zA-Z]+/;
const REGEX_COMMENT_CLOSE = /\*\//;
const REGEX_HTML_COMMENT_CLOSE = /-->/;
const REGEX_PERCENTAGE = /^\d+(\.\d+)?%/;
const REGEX_COMBINATOR = /^(\+|~|>|\|\|)/;
const REGEX_VALID_IDENTIFIER_CHAR = /[a-zA-Z0-9_-]/;
const REGEX_LEADING_HYPHEN_OR_DIGIT = /-?\d/;
const REGEX_WHITESPACE_OR_COLON = /[\s:]/;
const REGEX_NTH_OF = /^(even|odd|\+?(\d+|\d*n(\s*[+-]\s*\d+)?)|-\d*n(\s*\+\s*\d+))((?=\s*[,)])|\s+of\s+)/;
const regex_whitespace = /\s/;
var Parser = class {
	index = 0;
	/**
	* @param {string} template
	* @param {boolean} loose
	*/
	constructor(template, loose) {
		if (typeof template !== "string") throw new TypeError("Template must be a string");
		this.loose = loose;
		this.template_untrimmed = template;
		this.template = template.trimEnd();
	}
	/** @param {string} str */
	match(str) {
		const length = str.length;
		if (length === 1) return this.template[this.index] === str;
		return this.template.slice(this.index, this.index + length) === str;
	}
	/**
	* @param {string} str
	* @param {boolean} required
	* @param {boolean} required_in_loose
	*/
	eat(str, required = false, required_in_loose = true) {
		if (this.match(str)) {
			this.index += str.length;
			return true;
		}
		if (required && (!this.loose || required_in_loose)) throw new Error(`Expected ${str}`);
		return false;
	}
	/**
	* Match a regex at the current index
	* @param {RegExp} pattern  Should have a ^ anchor at the start so the regex doesn't search past the beginning, resulting in worse performance
	*/
	match_regex(pattern) {
		const match = pattern.exec(this.template.slice(this.index));
		if (!match || match.index !== 0) return null;
		return match[0];
	}
	/**
	* Search for a regex starting at the current index and return the result if it matches
	* @param {RegExp} pattern  Should have a ^ anchor at the start so the regex doesn't search past the beginning, resulting in worse performance
	*/
	read(pattern) {
		const result = this.match_regex(pattern);
		if (result) this.index += result.length;
		return result;
	}
	allow_whitespace() {
		while (this.index < this.template.length && regex_whitespace.test(this.template[this.index])) this.index++;
	}
	/** @param {RegExp} pattern */
	read_until(pattern) {
		if (this.index >= this.template.length) {
			if (this.loose) return "";
			throw new Error("Unexpected end of input");
		}
		const start = this.index;
		const match = pattern.exec(this.template.slice(start));
		if (match) {
			this.index = start + match.index;
			return this.template.slice(start, this.index);
		}
		this.index = this.template.length;
		return this.template.slice(start);
	}
};
/**
* @param {string} content
* @param {{ loose?: boolean }} options
* @returns {AST.CSS.StyleSheet}
*/
function parse_style(content, options) {
	const parser = new Parser(content, options.loose || false);
	return {
		source: content,
		hash: `tsrx-${simple_hash(content)}`,
		type: "StyleSheet",
		children: read_body(parser),
		start: 0,
		end: content.length
	};
}
/** @param {Parser} parser */
function allow_comment_or_whitespace(parser) {
	parser.allow_whitespace();
	while (parser.match("/*") || parser.match("<!--")) {
		if (parser.eat("/*")) {
			parser.read_until(REGEX_COMMENT_CLOSE);
			parser.eat("*/", true);
		}
		if (parser.eat("<!--")) {
			parser.read_until(REGEX_HTML_COMMENT_CLOSE);
			parser.eat("-->", true);
		}
		parser.allow_whitespace();
	}
}
/**
* @param {Parser} parser
* @returns {Array<AST.CSS.Rule | AST.CSS.Atrule>}
*/
function read_body(parser) {
	/** @type {Array<AST.CSS.Rule | AST.CSS.Atrule>} */
	const children = [];
	while (parser.index < parser.template.length) {
		allow_comment_or_whitespace(parser);
		if (parser.match("@")) children.push(read_at_rule(parser));
		else children.push(read_rule(parser));
	}
	return children;
}
/**
* @param {Parser} parser
* @returns {AST.CSS.Atrule}
*/
function read_at_rule(parser) {
	const start = parser.index;
	parser.eat("@", true);
	const name = read_identifier(parser);
	const prelude = read_value(parser);
	/** @type {AST.CSS.Block | null} */
	let block = null;
	if (parser.match("{")) block = read_block(parser);
	else parser.eat(";", true);
	return {
		type: "Atrule",
		start,
		end: parser.index,
		name,
		prelude,
		block
	};
}
/**
* @param {Parser} parser
* @returns {AST.CSS.Rule}
*/
function read_rule(parser) {
	const start = parser.index;
	return {
		type: "Rule",
		prelude: read_selector_list(parser),
		block: read_block(parser),
		start,
		end: parser.index,
		metadata: {
			parent_rule: null,
			has_local_selectors: false,
			is_global_block: false
		}
	};
}
/**
* @param {Parser} parser
* @returns {AST.CSS.Block}
*/
function read_block(parser) {
	const start = parser.index;
	parser.eat("{", true);
	/** @type {Array<AST.CSS.Declaration | AST.CSS.Rule | AST.CSS.Atrule>} */
	const children = [];
	while (parser.index < parser.template.length) {
		allow_comment_or_whitespace(parser);
		if (parser.match("}")) break;
		else children.push(read_block_item(parser));
	}
	parser.eat("}", true);
	return {
		type: "Block",
		start,
		end: parser.index,
		children
	};
}
/**
* Reads a declaration, rule or at-rule
*
* @param {Parser} parser
* @returns {AST.CSS.Declaration | AST.CSS.Rule | AST.CSS.Atrule}
*/
function read_block_item(parser) {
	if (parser.match("@")) return read_at_rule(parser);
	const start = parser.index;
	read_value(parser);
	const char = parser.template[parser.index];
	parser.index = start;
	return char === "{" ? read_rule(parser) : read_declaration(parser);
}
/**
* @param {Parser} parser
* @returns {AST.CSS.Declaration}
*/
function read_declaration(parser) {
	const start = parser.index;
	const property = parser.read_until(REGEX_WHITESPACE_OR_COLON);
	parser.allow_whitespace();
	parser.eat(":");
	parser.index;
	parser.allow_whitespace();
	const value = read_value(parser);
	if (!value && !property.startsWith("--") && !parser.loose) throw new Error("CSS Declaration cannot be empty");
	const end = parser.index;
	if (!parser.match("}")) parser.eat(";", true);
	return {
		type: "Declaration",
		start,
		end,
		property,
		value
	};
}
/**
* @param {Parser} parser
* @returns {string}
*/
function read_value(parser) {
	let value = "";
	let escaped = false;
	let in_url = false;
	/** @type {null | '"' | "'"} */
	let quote_mark = null;
	while (parser.index < parser.template.length) {
		const char = parser.template[parser.index];
		if (escaped) {
			value += "\\" + char;
			escaped = false;
		} else if (char === "\\") escaped = true;
		else if (char === quote_mark) quote_mark = null;
		else if (char === ")") in_url = false;
		else if (quote_mark === null && (char === "\"" || char === "'")) quote_mark = char;
		else if (char === "(" && value.slice(-3) === "url") in_url = true;
		else if ((char === ";" || char === "{" || char === "}") && !in_url && !quote_mark) return value.trim();
		value += char;
		parser.index++;
	}
	throw new Error("Unexpected end of input");
}
/**
* @param {Parser} parser
* @param {boolean} [inside_pseudo_class]
* @returns {AST.CSS.SelectorList}
*/
function read_selector_list(parser, inside_pseudo_class = false) {
	/** @type {AST.CSS.ComplexSelector[]} */
	const children = [];
	allow_comment_or_whitespace(parser);
	const start = parser.index;
	while (parser.index < parser.template.length) {
		children.push(read_selector(parser, inside_pseudo_class));
		const end = parser.index;
		allow_comment_or_whitespace(parser);
		if (inside_pseudo_class ? parser.match(")") : parser.match("{")) return {
			type: "SelectorList",
			start,
			end,
			children
		};
		else {
			parser.eat(",", true);
			allow_comment_or_whitespace(parser);
		}
	}
	throw new Error("Unexpected end of input");
}
/**
* @param {Parser} parser
* @returns {AST.CSS.Combinator | null}
*/
function read_combinator(parser) {
	const start = parser.index;
	parser.allow_whitespace();
	const index = parser.index;
	const name = parser.read(REGEX_COMBINATOR);
	if (name) {
		const end = parser.index;
		parser.allow_whitespace();
		return {
			type: "Combinator",
			name,
			start: index,
			end
		};
	}
	if (parser.index !== start) return {
		type: "Combinator",
		name: " ",
		start,
		end: parser.index
	};
	return null;
}
/**
* @param {Parser} parser
* @param {boolean} [inside_pseudo_class]
* @returns {AST.CSS.ComplexSelector}
*/
function read_selector(parser, inside_pseudo_class = false) {
	const list_start = parser.index;
	/** @type {AST.CSS.RelativeSelector[]} */
	const children = [];
	/**
	* @param {AST.CSS.Combinator | null} combinator
	* @param {number} start
	* @returns {AST.CSS.RelativeSelector}
	*/
	function create_selector(combinator, start) {
		return {
			type: "RelativeSelector",
			combinator,
			selectors: [],
			start,
			end: -1,
			metadata: {
				is_global: false,
				is_global_like: false,
				scoped: false
			}
		};
	}
	/** @type {AST.CSS.RelativeSelector} */
	let relative_selector = create_selector(null, parser.index);
	while (parser.index < parser.template.length) {
		let start = parser.index;
		if (parser.eat("&")) relative_selector.selectors.push({
			type: "NestingSelector",
			name: "&",
			start,
			end: parser.index
		});
		else if (parser.eat("*")) {
			let name = "*";
			if (parser.eat("|")) name = read_identifier(parser);
			relative_selector.selectors.push({
				type: "TypeSelector",
				name,
				start,
				end: parser.index
			});
		} else if (parser.eat("#")) relative_selector.selectors.push({
			type: "IdSelector",
			name: read_identifier(parser),
			start,
			end: parser.index
		});
		else if (parser.eat(".")) relative_selector.selectors.push({
			type: "ClassSelector",
			name: read_identifier(parser),
			start,
			end: parser.index
		});
		else if (parser.eat("::")) {
			relative_selector.selectors.push({
				type: "PseudoElementSelector",
				name: read_identifier(parser),
				start,
				end: parser.index
			});
			if (parser.eat("(")) {
				read_selector_list(parser, true);
				parser.eat(")", true);
			}
		} else if (parser.eat(":")) {
			const name = read_identifier(parser);
			/** @type {null | AST.CSS.SelectorList} */
			let args = null;
			if (parser.eat("(")) {
				args = read_selector_list(parser, true);
				parser.eat(")", true);
			}
			relative_selector.selectors.push({
				type: "PseudoClassSelector",
				name,
				args,
				start,
				end: parser.index
			});
		} else if (parser.eat("[")) {
			parser.allow_whitespace();
			const name = read_identifier(parser);
			parser.allow_whitespace();
			/** @type {string | null} */
			let value = null;
			const matcher = parser.read(REGEX_MATCHER);
			if (matcher) {
				parser.allow_whitespace();
				value = read_attribute_value(parser);
			}
			parser.allow_whitespace();
			const flags = parser.read(REGEX_ATTRIBUTE_FLAGS);
			parser.allow_whitespace();
			parser.eat("]", true);
			relative_selector.selectors.push({
				type: "AttributeSelector",
				start,
				end: parser.index,
				name,
				matcher,
				value,
				flags
			});
		} else if (inside_pseudo_class && parser.match_regex(REGEX_NTH_OF)) relative_selector.selectors.push({
			type: "Nth",
			value: parser.read(REGEX_NTH_OF),
			start,
			end: parser.index
		});
		else if (parser.match_regex(REGEX_PERCENTAGE)) relative_selector.selectors.push({
			type: "Percentage",
			value: parser.read(REGEX_PERCENTAGE),
			start,
			end: parser.index
		});
		else if (!parser.match_regex(REGEX_COMBINATOR)) {
			let name = read_identifier(parser);
			if (parser.eat("|")) name = read_identifier(parser);
			relative_selector.selectors.push({
				type: "TypeSelector",
				name,
				start,
				end: parser.index
			});
		}
		const index = parser.index;
		allow_comment_or_whitespace(parser);
		if (parser.match(",") || (inside_pseudo_class ? parser.match(")") : parser.match("{"))) {
			parser.index = index;
			relative_selector.end = index;
			children.push(relative_selector);
			return {
				type: "ComplexSelector",
				start: list_start,
				end: index,
				children,
				metadata: {
					rule: null,
					used: false
				}
			};
		}
		parser.index = index;
		const combinator = read_combinator(parser);
		if (combinator) {
			if (relative_selector.selectors.length > 0) {
				relative_selector.end = index;
				children.push(relative_selector);
			}
			relative_selector = create_selector(combinator, combinator.start);
			parser.allow_whitespace();
			if (parser.match(",") || (inside_pseudo_class ? parser.match(")") : parser.match("{"))) throw new Error(`Invalid selector at parser.index: ${parser.index}`);
		}
	}
	throw new Error("Unexpected end of input");
}
/**
* Read a property that may or may not be quoted, e.g.
* `foo` or `'foo bar'` or `"foo bar"`
* @param {Parser} parser
*/
function read_attribute_value(parser) {
	let value = "";
	let escaped = false;
	const quote_mark = parser.eat("\"") ? "\"" : parser.eat("'") ? "'" : null;
	while (parser.index < parser.template.length) {
		const char = parser.template[parser.index];
		if (escaped) {
			value += "\\" + char;
			escaped = false;
		} else if (char === "\\") escaped = true;
		else if (quote_mark ? char === quote_mark : /[\s\]]/.test(char)) {
			if (quote_mark) parser.eat(quote_mark, true);
			return value.trim();
		} else value += char;
		parser.index++;
	}
	throw new Error("Unexpected end of input");
}
/**
* https://www.w3.org/TR/css-syntax-3/#ident-token-diagram
* @param {Parser} parser
*/
function read_identifier(parser) {
	parser.index;
	let identifier = "";
	if (parser.match_regex(REGEX_LEADING_HYPHEN_OR_DIGIT)) throw new Error("Unexpected CSS identifier");
	let escaped = false;
	while (parser.index < parser.template.length) {
		const char = parser.template[parser.index];
		if (escaped) {
			identifier += "\\" + char;
			escaped = false;
		} else if (char === "\\") escaped = true;
		else if (char.codePointAt(0) >= 160 || REGEX_VALID_IDENTIFIER_CHAR.test(char)) identifier += char;
		else break;
		parser.index++;
	}
	if (identifier === "") throw new Error("Expected identifier");
	return identifier;
}
//#endregion
//#region ../native-tsrx/src/utils/patterns.js
const regex_newline_characters = /\n/g;
//#endregion
//#region ../native-tsrx/src/errors.js
/**
@import * as AST from 'estree';
@import { CompileError } from '../types/index';
*/
/**
*
* @param {string} message
* @param {string | null} filename
* @param {AST.Node | AST.NodeWithLocation} node
* @param {CompileError[]} [errors]
* @param {AST.CommentWithLocation[]} [comments]
* @param {string} [code]
* @returns {void}
*/
function error(message, filename, node, errors, comments, code) {
	if (errors && comments && is_error_suppressed(node, comments)) return;
	const error = new Error(message);
	error.pos = node.start ?? void 0;
	error.raisedAt = node.end ?? void 0;
	error.fileName = filename;
	error.code = code;
	error.end = node.end ?? void 0;
	error.loc = !node.loc ? void 0 : {
		start: {
			line: node.loc.start.line,
			column: node.loc.start.column
		},
		end: {
			line: node.loc.end.line,
			column: node.loc.end.column
		}
	};
	if (errors) {
		error.type = "usage";
		errors.push(error);
		return;
	}
	error.type = "fatal";
	throw error;
}
/**
* @param {AST.CommentWithLocation} comment
* @return {boolean}
*/
function is_error_suppress_comment(comment) {
	const text = comment.value.trim();
	return text.startsWith("@tsrx-ignore") || text.startsWith("@tsrx-expect-error") || text.startsWith("@ripple-ignore") || text.startsWith("@ripple-expect-error");
}
/**
* @param {AST.Node | AST.NodeWithLocation} node
* @param {AST.CommentWithLocation[]} comments
*/
function is_error_suppressed(node, comments) {
	if (node.loc) {
		const node_start_line = node.loc.start.line;
		for (const comment of comments) if (comment.type === "Line" && comment.loc.start.line === node_start_line - 1) {
			if (is_error_suppress_comment(comment)) return true;
		}
	}
	return false;
}
//#endregion
//#region ../native-tsrx/src/diagnostics.js
const DIAGNOSTIC_CODES = {
	JSX_EXPRESSION_VALUE: "tsrx-jsx-expression-value",
	UNCLOSED_TAG: "tsrx-unclosed-tag",
	MISMATCHED_CLOSING_TAG: "tsrx-mismatched-closing-tag",
	TEMPLATE_EXPRESSION_TRAILING_SEMICOLON: "tsrx-template-expression-trailing-semicolon",
	TEMPLATE_RETURN_STATEMENT: "tsrx-template-return-statement"
};
//#endregion
//#region ../native-tsrx/src/analyze/validation.js
const TSRX_RETURN_STATEMENT_ERROR = "Return statements are not allowed inside TSRX templates. Move the return before the TSRX return value, or use conditional rendering instead.";
//#endregion
//#region ../native-tsrx/src/plugin.js
/**
@import * as AST from 'estree'
@import * as ESTreeJSX from 'estree-jsx'
@import { Parse } from '@tsrx/core/types'
*/
const DYNAMIC_ATTRIBUTE_NAME_ERROR = "Dynamic component / element syntax (`@`) is only supported on native TSRX element names, not attribute names.";
const CharCode = Object.freeze({
	tab: 9,
	lineFeed: 10,
	carriageReturn: 13,
	space: 32,
	doubleQuote: 34,
	dollar: 36,
	ampersand: 38,
	singleQuote: 39,
	openParen: 40,
	closeParen: 41,
	asterisk: 42,
	slash: 47,
	colon: 58,
	semicolon: 59,
	lessThan: 60,
	equals: 61,
	greaterThan: 62,
	at: 64,
	digit0: 48,
	digit9: 57,
	uppercaseA: 65,
	uppercaseZ: 90,
	openBracket: 91,
	backslash: 92,
	underscore: 95,
	backtick: 96,
	lowercaseA: 97,
	lowercaseZ: 122,
	openBrace: 123,
	closeBrace: 125
});
/** @type {WeakMap<Record<string, boolean>, Map<string, number>>} */
const argument_clash_first_positions = /* @__PURE__ */ new WeakMap();
/** @type {WeakMap<Record<string, boolean>, Set<string>>} */
const argument_clash_reported_names = /* @__PURE__ */ new WeakMap();
/**
* @param {Record<string, boolean>} check_clashes
* @returns {Map<string, number>}
*/
function get_argument_clash_first_positions(check_clashes) {
	let first_positions = argument_clash_first_positions.get(check_clashes);
	if (!first_positions) {
		first_positions = /* @__PURE__ */ new Map();
		argument_clash_first_positions.set(check_clashes, first_positions);
	}
	return first_positions;
}
/**
* @param {Record<string, boolean>} check_clashes
* @returns {Set<string>}
*/
function get_argument_clash_reported_names(check_clashes) {
	let reported_names = argument_clash_reported_names.get(check_clashes);
	if (!reported_names) {
		reported_names = /* @__PURE__ */ new Set();
		argument_clash_reported_names.set(check_clashes, reported_names);
	}
	return reported_names;
}
/**
* @param {string} input
* @param {number} i
*/
function skip_whitespace_from(input, i) {
	while (i < input.length) {
		const ch = input.charCodeAt(i);
		if (ch !== CharCode.space && ch !== CharCode.tab && ch !== CharCode.lineFeed && ch !== CharCode.carriageReturn) break;
		i++;
	}
	return i;
}
/**
* Skip past a string literal opened at `i` with the given quote char code.
* @param {string} input
* @param {number} i
* @param {number} quote
*/
function skip_string_from(input, i, quote) {
	i++;
	while (i < input.length) {
		const ch = input.charCodeAt(i);
		i++;
		if (ch === CharCode.backslash) i++;
		else if (ch === quote) return i;
	}
	return i;
}
/**
* Scan past a balanced pair starting at `i` (which must point at `open`).
* Returns the position after the matching close, or -1 if unbalanced.
* @param {string} input
* @param {number} i
* @param {number} open
* @param {number} close
*/
function scan_balanced_from(input, i, open, close) {
	let depth = 1;
	i++;
	while (i < input.length) {
		const ch = input.charCodeAt(i);
		if (ch === CharCode.doubleQuote || ch === CharCode.singleQuote || ch === CharCode.backtick) {
			i = skip_string_from(input, i, ch);
			continue;
		}
		if (ch === open) depth++;
		else if (ch === close && --depth === 0) return i + 1;
		i++;
	}
	return -1;
}
/**
* Best-effort lookahead at a `<` to decide whether it starts a generic arrow
* expression — `<...>(...)[: T] => ...`. Conservative: returns false on any
* unexpected shape so JSX continues to parse as JSX.
* @param {string} input
* @param {number} pos
*/
function looks_like_generic_arrow(input, pos) {
	if (input.charCodeAt(pos) !== CharCode.lessThan) return false;
	let i = pos + 1;
	let depth = 1;
	while (i < input.length) {
		const ch = input.charCodeAt(i);
		if (ch === CharCode.doubleQuote || ch === CharCode.singleQuote || ch === CharCode.backtick) {
			i = skip_string_from(input, i, ch);
			continue;
		}
		if (ch === CharCode.lessThan) depth++;
		else if (ch === CharCode.greaterThan && --depth === 0) break;
		i++;
	}
	if (depth !== 0) return false;
	i = skip_whitespace_from(input, i + 1);
	if (input.charCodeAt(i) !== CharCode.openParen) return false;
	i = scan_balanced_from(input, i, CharCode.openParen, CharCode.closeParen);
	if (i === -1) return false;
	i = skip_whitespace_from(input, i);
	if (input.charCodeAt(i) === CharCode.colon) {
		i++;
		while (i < input.length) {
			const ch = input.charCodeAt(i);
			if (ch === CharCode.doubleQuote || ch === CharCode.singleQuote || ch === CharCode.backtick) {
				i = skip_string_from(input, i, ch);
				continue;
			}
			if (ch === CharCode.equals && input.charCodeAt(i + 1) === CharCode.greaterThan) return true;
			if (ch === CharCode.semicolon || ch === CharCode.openBrace || ch === CharCode.closeBrace) return false;
			i++;
		}
		return false;
	}
	return input.charCodeAt(i) === CharCode.equals && input.charCodeAt(i + 1) === CharCode.greaterThan;
}
/**
* Acorn parser plugin for Ripple syntax extensions.
* Adds support for: native TSRX templates, &[]/&{} lazy destructuring,
* submodule imports, TSRX directives, and enhanced JSX handling.
*
* @param {import('../types/index').TSRXPluginConfig} [config] - Plugin configuration
* @returns {(Parser: Parse.ParserConstructor) => Parse.ParserConstructor} Parser extension function
*/
function TSRXPlugin(config) {
	return (Parser) => {
		const original = Parser$1.prototype;
		const tt = Parser.tokTypes || types$1;
		const tc = Parser.tokContexts || types;
		const b_stat = tc.b_stat || types.b_stat;
		const b_expr = tc.b_expr || types.b_expr;
		const tstt = Parser.acornTypeScript.tokTypes;
		const tstc = Parser.acornTypeScript.tokContexts;
		class TSRXParser extends Parser {
			/** @type {AST.Node[]} */
			#path = [];
			#allowTagStartAfterDoubleQuotedText = false;
			#allowDoubleQuotedTextChildAfterBrace = false;
			#commentContextId = 0;
			#collect = false;
			#loose = false;
			/** @type {import('../types/index').CompileError[] | undefined} */
			#errors = void 0;
			/** @type {string | null} */
			#filename = null;
			#functionBodyDepth = 0;
			#parseNextFunctionBodyAsNativeTemplate = false;
			#allowExpressionContainerTrailingSemicolon = false;
			#jsxAttributeValueExpressionDepth = 0;
			/**
			* @type {Parse.Parser['finishNode']}
			*/
			finishNode(node, type) {
				const finished = super.finishNode(node, type);
				if (type === "TSModuleDeclaration") {
					const start = finished.start;
					const source = this.input.slice(start, start + 9);
					finished.metadata ??= { path: [] };
					finished.metadata.module_keyword = source.startsWith("namespace") ? "namespace" : "module";
				}
				return finished;
			}
			/**
			* @param {Parse.Options} options
			* @param {string} input
			*/
			constructor(options, input) {
				super(options, input);
				const tsrx_options = options?.tsrxOptions ?? options?.rippleOptions;
				this.#collect = tsrx_options?.collect === true || tsrx_options?.loose === true;
				this.#loose = tsrx_options?.loose === true;
				this.#errors = tsrx_options?.errors;
				this.#filename = tsrx_options?.filename || null;
			}
			#resetTokenStartToCurrentPosition() {
				if (this.start !== this.pos) {
					this.start = this.pos;
					this.startLoc = this.curPosition();
				}
			}
			#previousNonWhitespaceChar() {
				let index = this.pos - 1;
				while (index >= 0) {
					const ch = this.input.charCodeAt(index);
					if (ch !== CharCode.space && ch !== CharCode.tab && ch !== CharCode.lineFeed && ch !== CharCode.carriageReturn) return ch;
					index--;
				}
				return null;
			}
			/**
			* Native TSRX template bodies share one grammar across elements and fragments.
			* This helper keeps the parser-state setup in one place while callers keep
			* ownership of their distinct closing delimiter handling (`}` vs `</tag>`).
			*
			* @param {AST.Node} node
			* @param {AST.Node[]} body
			* @param {{
			*   enterScope?: boolean,
			*   pushPath?: boolean,
			*   resetFunctionBodyDepth?: boolean,
			* }} [options]
			*/
			#parseNativeTemplateBody(node, body, { enterScope = false, pushPath = false, resetFunctionBodyDepth = false } = {}) {
				const parent_function_body_depth = this.#functionBodyDepth;
				if (resetFunctionBodyDepth) this.#functionBodyDepth = 0;
				if (enterScope) this.enterScope(0);
				if (pushPath) this.#path.push(node);
				try {
					this.parseTemplateBody(body);
				} finally {
					if (pushPath) this.#path.pop();
					if (enterScope) this.exitScope();
					if (resetFunctionBodyDepth) this.#functionBodyDepth = parent_function_body_depth;
				}
			}
			/**
			* @param {AST.Node | undefined} node
			*/
			#isNativeTemplateNode(node) {
				return node?.type === "Element" || node?.type === "TsrxFragment";
			}
			/**
			* @param {AST.Node | undefined} node
			*/
			#isNativeTemplateContextNode(node) {
				const metadata = node?.metadata;
				return this.#isNativeTemplateNode(node) || metadata?.nativeTemplateBody === true;
			}
			#isNativeFunctionBodyStatementContainerStart() {
				return this.type.label === "@" && this.input.charCodeAt(this.end) === CharCode.openBrace;
			}
			#isNativeTemplateStatementContainerStart() {
				return this.type.label === "@" && this.input.charCodeAt(this.end) === CharCode.openBrace;
			}
			#parseNativeTemplateStatementContainer() {
				this.next();
				return this.parseBlock();
			}
			/**
			* @param {AST.Node} node
			*/
			#markNativeDynamicElementName(node) {
				if (node.type === "Identifier" || node.type === "JSXIdentifier") node.tracked = true;
				else if (node.type === "MemberExpression" || node.type === "JSXMemberExpression") this.#markNativeDynamicElementName(node.object);
				return node;
			}
			#parseNativeDynamicElementName() {
				this.expect(tt.braceL);
				const expression = this.parseExpression();
				this.expect(tt.braceR);
				return this.#markNativeDynamicElementName(expression);
			}
			#isNativeTemplateDirectiveMarker() {
				if (this.type.label !== "@") return false;
				return this.#functionBodyDepth === 0 && this.#isNativeTemplateContextNode(this.#path.at(-1)) || this.context.at(-1) === b_stat;
			}
			#isNativeTemplateDirectiveStatementStart() {
				if (!this.#isNativeTemplateDirectiveMarker()) return false;
				const ahead = this.lookahead();
				return ahead.type === tt._if || ahead.type === tt._for || ahead.type === tt._switch || ahead.type === tt._try || ahead.type === tt.name && ahead.value === "empty";
			}
			/**
			* @param {Parse.TokenType} type
			*/
			#isNativeTemplateDirectiveToken(type) {
				return this.type === type || this.type.label === "@" && this.lookahead().type === type;
			}
			/**
			* @param {Parse.TokenType} type
			*/
			#eatNativeTemplateDirectiveToken(type) {
				if (this.eat(type)) return true;
				if (this.type.label !== "@" || this.lookahead().type !== type) return false;
				this.next();
				this.expect(type);
				return true;
			}
			/**
			* @param {string} name
			*/
			#eatNativeTemplateContextualDirective(name) {
				if (this.isContextual(name)) {
					this.next();
					return true;
				}
				if (this.type.label !== "@" || this.lookahead().type !== tt.name || this.lookahead().value !== name) return false;
				this.next();
				this.expectContextual(name);
				return true;
			}
			/**
			* @param {AST.IfStatement} node
			*/
			#parseNativeEmptyDirective(node) {
				this.next();
				const test = this.startNodeAt(this.lastTokStart, this.lastTokStartLoc);
				test.value = false;
				test.raw = "false";
				node.test = this.finishNodeAt(test, "Literal", this.lastTokEnd, this.lastTokEndLoc);
				node.consequent = this.parseStatement("if");
				node.alternate = null;
				return this.finishNode(node, "IfStatement");
			}
			/**
			* @param {string | undefined | null} context
			* @param {boolean | undefined} topLevel
			* @param {any} exports
			*/
			#parseNativeTemplateDirectiveStatement(context, topLevel, exports) {
				if (!this.#isNativeTemplateDirectiveStatementStart()) return null;
				const node = this.startNode();
				this.next();
				if (this.type === tt._if) return this.parseIfStatement(node);
				if (this.type === tt._for) return this.parseForStatement(node);
				if (this.type === tt._switch) return this.parseSwitchStatement(node);
				if (this.type === tt._try) return this.parseTryStatement(node);
				if (this.isContextual("empty")) return this.#parseNativeEmptyDirective(node);
				return super.parseStatement(context, topLevel, exports);
			}
			#parseNativeTemplateExpressionContainer() {
				const allow_trailing_semicolon = this.#allowExpressionContainerTrailingSemicolon;
				this.#allowExpressionContainerTrailingSemicolon = true;
				let node;
				try {
					node = this.jsx_parseExpressionContainer();
				} finally {
					this.#allowExpressionContainerTrailingSemicolon = allow_trailing_semicolon;
				}
				if (node.expression.type !== "JSXEmptyExpression")
 /** @type {AST.TSRXExpression | AST.TextNode} */ node.type = "TSRXExpression";
				return node;
			}
			#popTemplateTokenContextBeforeExpressionChild() {
				let index = this.pos;
				let has_newline = false;
				while (index < this.input.length) {
					const ch = this.input.charCodeAt(index);
					if (ch === CharCode.space || ch === CharCode.tab) index++;
					else if (ch === CharCode.lineFeed || ch === CharCode.carriageReturn) {
						has_newline = true;
						index++;
					} else if (ch === CharCode.slash && this.input.charCodeAt(index + 1) === CharCode.asterisk) {
						const end = this.input.indexOf("*/", index + 2);
						const comment_end = end === -1 ? this.input.length : end + 2;
						if (this.input.slice(index, comment_end).match(regex_newline_characters)) has_newline = true;
						index = comment_end;
					} else if (ch === CharCode.slash && this.input.charCodeAt(index + 1) === CharCode.slash) {
						has_newline = true;
						index += 2;
						while (index < this.input.length) {
							const comment_ch = this.input.charCodeAt(index);
							if (comment_ch === CharCode.lineFeed || comment_ch === CharCode.carriageReturn) break;
							index++;
						}
					} else break;
				}
				if (!has_newline || this.input.charCodeAt(index) !== CharCode.openBrace) return;
				const context_index = this.context.lastIndexOf(tstc.tc_expr);
				if (context_index !== -1) this.context.length = context_index;
			}
			#popTemplateLiteralTokenContext() {
				while (this.curContext()?.token === "`") this.context.pop();
			}
			/**
			* @param {number} index
			* @returns {number}
			*/
			#skipWhitespaceAndComments(index) {
				while (index < this.input.length) {
					const ch = this.input.charCodeAt(index);
					if (ch === CharCode.space || ch === CharCode.tab || ch === CharCode.lineFeed || ch === CharCode.carriageReturn) index++;
					else if (ch === CharCode.slash && this.input.charCodeAt(index + 1) === CharCode.asterisk) {
						const end = this.input.indexOf("*/", index + 2);
						index = end === -1 ? this.input.length : end + 2;
					} else if (ch === CharCode.slash && this.input.charCodeAt(index + 1) === CharCode.slash) {
						index += 2;
						while (index < this.input.length) {
							const comment_ch = this.input.charCodeAt(index);
							if (comment_ch === CharCode.lineFeed || comment_ch === CharCode.carriageReturn) break;
							index++;
						}
					} else break;
				}
				return index;
			}
			/** @returns {number} */
			#countFollowingRightBraces() {
				let index = this.end;
				let count = 0;
				while (index < this.input.length) {
					index = this.#skipWhitespaceAndComments(index);
					if (this.input.charCodeAt(index) !== CharCode.closeBrace) break;
					count++;
					index++;
				}
				return count;
			}
			/**
			* @param {AST.TsrxFragment} node
			* @returns {boolean}
			*/
			#hasDirectStatementChild(node) {
				return node.children?.some((child) => child.type.endsWith("Statement") || child.type === "VariableDeclaration");
			}
			/**
			* @param {AST.TsrxFragment} node
			*/
			#popTokenContextsAfterTemplateExpressionElement(node) {
				const ctx = this.context;
				const ci = ctx.length - 1;
				const top = ctx[ci];
				const second = ctx[ci - 1];
				const has_stmt_child = this.#hasDirectStatementChild(node);
				if (this.type === tt.comma && !has_stmt_child) {
					if (top === b_stat && second === tstc.tc_expr) {
						let expr_count = 0;
						for (let i = ci - 2; ctx[i] === b_expr; i--) expr_count++;
						const following_braces = this.#countFollowingRightBraces();
						if (expr_count === 2 || following_braces > 1) {
							if (following_braces > 1 && expr_count > 1) {
								ctx.splice(ci - 2, expr_count - 1);
								ctx.pop();
								this.exprAllowed = false;
								return;
							}
							if (expr_count === 2 && following_braces === 0) {
								ctx.length = ci - 1;
								return;
							}
							ctx.pop();
							this.exprAllowed = false;
							return;
						}
					}
					if (top === b_expr && second === b_expr) {
						if (ctx[ci - 2] !== b_expr && ctx[ci - 2] !== tstc.tc_oTag) ctx.push(b_expr);
						return;
					}
				}
				if (top === b_stat && second === tstc.tc_expr) {
					ctx.length = ci - 1;
					return;
				}
				if (this.type === tt.braceR && top === tstc.tc_expr && second === b_expr && ctx[ci - 2] === tstc.tc_oTag) {
					ctx.length = ci - 1;
					return;
				}
				if (this.type === tt.braceR && top === b_expr && (this.#countFollowingRightBraces() === 0 || second === b_expr) || this.type === tt.parenR && top?.token === "(" || this.type === tt.bracketR && top?.token === "[") {
					ctx.pop();
					this.exprAllowed = false;
				}
			}
			#isDoubleQuotedTextChildStart() {
				const parent = this.#path.at(-1);
				if (!this.#isNativeTemplateContextNode(parent)) return false;
				const context = this.curContext();
				if (context === tstc.tc_oTag || context === tstc.tc_cTag) return false;
				const prev = this.#previousNonWhitespaceChar();
				return prev === null || prev === CharCode.doubleQuote || prev === CharCode.semicolon || prev === CharCode.greaterThan || prev === CharCode.openBrace && this.#allowDoubleQuotedTextChildAfterBrace || prev === CharCode.closeBrace;
			}
			#readDoubleQuotedTextChildToken() {
				const start = this.pos;
				let out = "";
				this.pos++;
				let chunkStart = this.pos;
				while (this.pos < this.input.length) {
					const ch = this.input.charCodeAt(this.pos);
					if (ch === CharCode.doubleQuote) {
						out += this.input.slice(chunkStart, this.pos);
						this.pos++;
						return this.finishToken(tt.string, out);
					}
					if (ch === CharCode.ampersand) {
						out += this.input.slice(chunkStart, this.pos);
						out += this.jsx_readEntity();
						chunkStart = this.pos;
						continue;
					}
					if (isNewLine(ch)) {
						out += this.input.slice(chunkStart, this.pos);
						out += this.jsx_readNewLine(true);
						chunkStart = this.pos;
						continue;
					}
					this.pos++;
				}
				this.raise(start, "Unterminated double-quoted text child");
			}
			/**
			* @param {number} position
			* @param {number} end
			* @param {string} message
			* @param {string} [code]
			*/
			#report_recoverable_error_range(position, end, message, code) {
				const start = Math.max(0, Math.min(position, this.input.length));
				const range_end = Math.max(start, Math.min(end, this.input.length));
				const start_loc = getLineInfo(this.input, start);
				const end_loc = getLineInfo(this.input, range_end);
				error(message, this.#filename, {
					start,
					end: range_end,
					loc: {
						start: start_loc,
						end: end_loc
					}
				}, this.#collect ? this.#errors : void 0, void 0, code);
			}
			/**
			* @param {number} position
			* @param {string} message
			* @param {string} [code]
			*/
			#report_recoverable_error(position, message, code) {
				this.#report_recoverable_error_range(position, position + 1, message, code);
			}
			/**
			* @param {number} position
			* @param {string} message
			* @param {string} [code]
			*/
			#report_broken_markup_error(position, message, code = DIAGNOSTIC_CODES.UNCLOSED_TAG) {
				if (this.#loose) return;
				if (this.#collect) {
					this.#report_recoverable_error(position, message, code);
					return;
				}
				this.raise(position, message);
			}
			/**
			* @param {AST.Node | AST.Node[] | unknown} maybe_node
			* @param {boolean} [inside_nested_function]
			* @param {boolean} [inside_loop]
			*/
			#report_invalid_template_return_statements(maybe_node, inside_nested_function = false, inside_loop = false) {
				if (!maybe_node || typeof maybe_node !== "object") return;
				let node = maybe_node;
				if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") inside_nested_function = true;
				if (node.type === "ForStatement" || node.type === "ForInStatement" || node.type === "ForOfStatement" || node.type === "WhileStatement" || node.type === "DoWhileStatement") inside_loop = true;
				if (!inside_nested_function && !inside_loop && node.type === "ReturnStatement") {
					node.metadata = {
						...node.metadata,
						invalid_tsrx_template_return: true
					};
					this.#report_recoverable_error(
						/** @type {AST.NodeWithLocation} */
						node.start ?? this.start,
						TSRX_RETURN_STATEMENT_ERROR,
						DIAGNOSTIC_CODES.TEMPLATE_RETURN_STATEMENT
					);
					return;
				}
				if (Array.isArray(node)) {
					for (const child of node) this.#report_invalid_template_return_statements(child, inside_nested_function, inside_loop);
					return;
				}
				for (const key of Object.keys(node)) {
					if (key === "loc" || key === "start" || key === "end" || key === "metadata") continue;
					this.#report_invalid_template_return_statements(
						/** @type {Record<string, unknown>} */
						node[key],
						inside_nested_function,
						inside_loop
					);
				}
			}
			/**
			* When collecting, keep parsing after duplicate declaration diagnostics so
			* editor tooling can continue producing AST and mappings.
			* @param {number} position
			* @param {string | { message?: string }} message
			*/
			raiseRecoverable(position, message) {
				const error_message = typeof message === "string" ? message : typeof message?.message === "string" ? message.message : String(message);
				if (error_message.includes("has already been declared") || error_message === "Argument name clash") {
					this.#report_recoverable_error(position, error_message);
					return;
				}
				return super.raiseRecoverable(position, error_message);
			}
			/**
			* Override to allow single-parameter generic arrow functions without trailing comma.
			* By default, @sveltejs/acorn-typescript throws an error for `<T>() => {}` when JSX is enabled
			* because it can't disambiguate from JSX. However, the parser still parses it correctly
			* using tryParse - it just throws afterwards. By overriding this to do nothing, we allow
			* the valid parse to succeed.
			* @param {AST.TSTypeParameterDeclaration} node
			*/
			reportReservedArrowTypeParam(node) {
				if (this.#collect && node.params.length === 1 && node.extra?.trailingComma === void 0) error("This syntax is reserved in files with the .mts or .cts extension. Add a trailing comma, as in `<T,>() => ...`.", this.#filename, node, this.#errors);
			}
			/**
			* Override to allow `readonly` type modifier on any type when collecting.
			* By default, @sveltejs/acorn-typescript throws an error for `readonly { ... }`
			* because TypeScript only permits `readonly` on array and tuple types.
			* Suppress the error in the strict mode as ts is compiled away.
			* @param {AST.TSTypeOperator} node
			*/
			tsCheckTypeAnnotationForReadOnly(node) {
				const typeAnnotation = node.typeAnnotation;
				if (typeAnnotation.type === "TSTupleType" || typeAnnotation.type === "TSArrayType") return;
				if (this.#collect) error("'readonly' type modifier is only permitted on array and tuple literal types.", this.#filename, typeAnnotation, this.#errors);
			}
			/**
			* Override parsePropertyValue to support TypeScript generic methods in object literals.
			* By default, acorn-typescript doesn't handle `{ method<T>() {} }` syntax.
			* This override checks for type parameters before parsing the method.
			* @type {Parse.Parser['parsePropertyValue']}
			*/
			parsePropertyValue(prop, isPattern, isGenerator, isAsync, startPos, startLoc, refDestructuringErrors, containsEsc) {
				if (!isPattern && !isGenerator && !isAsync && this.type === tt.relational && this.value === "<") {
					const typeParameters = this.tsTryParseTypeParameters();
					if (typeParameters && this.type === tt.parenL) {
						/** @type {AST.Property} */ prop.method = true;
						/** @type {AST.Property} */ prop.kind = "init";
						/** @type {AST.Property} */ prop.value = this.parseMethod(false, false);
						/** @type {AST.FunctionExpression} */ prop.value.typeParameters = typeParameters;
						return;
					}
				}
				return super.parsePropertyValue(prop, isPattern, isGenerator, isAsync, startPos, startLoc, refDestructuringErrors, containsEsc);
			}
			/**
			* Acorn expects `this.context` to always contain at least one tokContext.
			* Some of our template/JSX escape hatches can pop contexts aggressively;
			* if the stack becomes empty, Acorn will crash reading `curContext().override`.
			* @type {Parse.Parser['nextToken']}
			*/
			nextToken() {
				while (this.context.length && this.context[this.context.length - 1] == null) this.context.pop();
				if (this.context.length === 0) this.context.push(b_stat);
				return super.nextToken();
			}
			/**
			* @returns {Parse.CommentMetaData | null}
			*/
			#createCommentMetadata() {
				if (this.#path.length === 0) return null;
				const container = this.#path[this.#path.length - 1];
				if (!container || container.type !== "Element") return null;
				const children = Array.isArray(container.children) ? container.children : [];
				const hasMeaningfulChildren = children.some((child) => child && !isWhitespaceTextNode(child));
				if (hasMeaningfulChildren) return null;
				container.metadata ??= { path: [] };
				if (container.metadata.commentContainerId === void 0) container.metadata.commentContainerId = ++this.#commentContextId;
				return {
					containerId: container.metadata.commentContainerId,
					childIndex: children.length,
					beforeMeaningfulChild: !hasMeaningfulChildren
				};
			}
			/**
			* Helper method to get the element name from a JSX identifier or member expression
			* @type {Parse.Parser['getElementName']}
			*/
			getElementName(node) {
				if (!node) return null;
				if (node.type === "Identifier" || node.type === "JSXIdentifier") return node.name;
				else if (node.type === "MemberExpression" || node.type === "JSXMemberExpression") return this.getElementName(node.object) + "." + this.getElementName(node.property);
				return null;
			}
			/**
			* `<T,>(x: T) => x` and `<T>(x: T): T => x` should parse as generic
			* arrow functions, not JSX elements. acorn-typescript's `readToken`
			* can otherwise tokenize `<` as `jsxTagStart` when expression parsing
			* allows JSX, bypassing our `getTokenFromCode` override. We intercept
			* only when the source from `<` actually looks like a generic arrow
			* expression, so JSX like `<div>` keeps parsing normally.
			*
			* @type {Parse.Parser['readToken']}
			*/
			readToken(code) {
				if (code === CharCode.lessThan && looks_like_generic_arrow(this.input, this.pos)) {
					++this.pos;
					return this.finishToken(tt.relational, "<");
				}
				return super.readToken(code);
			}
			/**
			* Get token from character code - handles Ripple-specific tokens
			* @type {Parse.Parser['getTokenFromCode']}
			*/
			getTokenFromCode(code) {
				if (code === CharCode.slash && this.input.charCodeAt(this.pos - 1) === CharCode.lessThan && this.#path.findLast((n) => n.type === "Element" || n.type === "TsrxFragment")) {
					++this.pos;
					return this.finishToken(tt.slash, "/");
				}
				if (code === CharCode.slash && this.input.charCodeAt(this.pos + 1) === CharCode.greaterThan && this.context.includes(tstc.tc_oTag)) {
					while (this.context.length > 0 && this.curContext() !== tstc.tc_oTag) this.context.pop();
					this.exprAllowed = false;
				}
				if (code === CharCode.doubleQuote) {
					const is_double_quoted_text_child = this.#isDoubleQuotedTextChildStart();
					this.#allowDoubleQuotedTextChildAfterBrace = false;
					if (is_double_quoted_text_child) return this.#readDoubleQuotedTextChildToken();
				} else this.#allowDoubleQuotedTextChildAfterBrace = false;
				if (code !== CharCode.lessThan) this.#allowTagStartAfterDoubleQuotedText = false;
				if (code === CharCode.lessThan) {
					const parent = this.#path.at(-1);
					const inNativeTemplate = this.#functionBodyDepth === 0 && this.#isNativeTemplateContextNode(parent);
					/** @type {number | null} */
					let prevNonWhitespaceChar = null;
					let lookback = this.pos - 1;
					while (lookback >= 0) {
						const ch = this.input.charCodeAt(lookback);
						if (ch !== CharCode.space && ch !== CharCode.tab) break;
						lookback--;
					}
					if (lookback >= 0) {
						const prevChar = this.input.charCodeAt(lookback);
						prevNonWhitespaceChar = prevChar;
						if (prevChar >= CharCode.uppercaseA && prevChar <= CharCode.uppercaseZ || prevChar >= CharCode.lowercaseA && prevChar <= CharCode.lowercaseZ || prevChar >= CharCode.digit0 && prevChar <= CharCode.digit9 || prevChar === CharCode.underscore || prevChar === CharCode.dollar || prevChar === CharCode.closeParen) return super.getTokenFromCode(code);
					}
					const nextChar = this.pos + 1 < this.input.length ? this.input.charCodeAt(this.pos + 1) : -1;
					const isWhitespaceAfterLt = nextChar === CharCode.space || nextChar === CharCode.tab || nextChar === CharCode.lineFeed || nextChar === CharCode.carriageReturn;
					const isTagLikeAfterLt = !isWhitespaceAfterLt && (nextChar === CharCode.slash || nextChar === CharCode.greaterThan || nextChar === CharCode.openBrace || nextChar === CharCode.at || nextChar === CharCode.dollar || nextChar === CharCode.underscore || nextChar >= CharCode.uppercaseA && nextChar <= CharCode.uppercaseZ || nextChar >= CharCode.lowercaseA && nextChar <= CharCode.lowercaseZ);
					const prevAllowsTagStart = prevNonWhitespaceChar === null || prevNonWhitespaceChar === CharCode.lineFeed || prevNonWhitespaceChar === CharCode.carriageReturn || prevNonWhitespaceChar === CharCode.openBrace || prevNonWhitespaceChar === CharCode.closeBrace || prevNonWhitespaceChar === CharCode.greaterThan;
					if (!inNativeTemplate && prevAllowsTagStart && isTagLikeAfterLt) {
						++this.pos;
						return this.finishToken(tstt.jsxTagStart);
					}
					if (inNativeTemplate) {
						if (prevNonWhitespaceChar === CharCode.doubleQuote && this.#allowTagStartAfterDoubleQuotedText || prevNonWhitespaceChar === CharCode.openBrace || prevNonWhitespaceChar === CharCode.greaterThan) {
							if (!isWhitespaceAfterLt) {
								this.#allowTagStartAfterDoubleQuotedText = false;
								++this.pos;
								return this.finishToken(tstt.jsxTagStart);
							}
						}
						let lineStart = this.pos - 1;
						while (lineStart >= 0 && this.input.charCodeAt(lineStart) !== CharCode.lineFeed && this.input.charCodeAt(lineStart) !== CharCode.carriageReturn) lineStart--;
						lineStart++;
						let allWhitespace = true;
						for (let i = lineStart; i < this.pos; i++) {
							const ch = this.input.charCodeAt(i);
							if (ch !== CharCode.space && ch !== CharCode.tab) {
								allWhitespace = false;
								break;
							}
						}
						if (allWhitespace && isTagLikeAfterLt) {
							++this.pos;
							return this.finishToken(tstt.jsxTagStart);
						}
					}
				}
				this.#allowTagStartAfterDoubleQuotedText = false;
				return super.getTokenFromCode(code);
			}
			/**
			* Override isLet to recognize `let &{` and `let &[` as variable declarations.
			* Acorn's isLet checks the char after `let` and only recognizes `{`, `[`, or identifiers.
			* The `&` character is not in that set, so `let &{...}` would not be parsed as a declaration.
			* @type {Parse.Parser['isLet']}
			*/
			isLet(context) {
				if (!this.isContextual("let")) return false;
				const skip = /\s*/y;
				skip.lastIndex = this.pos;
				const match = skip.exec(this.input);
				if (!match) return super.isLet(context);
				const next = this.pos + match[0].length;
				if (this.input.charCodeAt(next) === CharCode.ampersand) {
					const afterAmp = this.input.charCodeAt(next + 1);
					if (afterAmp === CharCode.openBrace || afterAmp === CharCode.openBracket) return true;
				}
				return super.isLet(context);
			}
			/**
			* Parse binding atom - handles lazy destructuring patterns (&{...} and &[...])
			* When & is directly followed by { or [, parse as a lazy destructuring pattern.
			* The resulting ObjectPattern/ArrayPattern node gets a `lazy: true` flag.
			*/
			parseBindingAtom() {
				if (this.type === tt.bitwiseAND) {
					const charAfterAmp = this.input.charCodeAt(this.end);
					if (charAfterAmp === CharCode.openBrace || charAfterAmp === CharCode.openBracket) {
						this.next();
						const pattern = super.parseBindingAtom();
						/** @type {AST.ObjectPattern | AST.ArrayPattern} */ pattern.lazy = true;
						return pattern;
					}
				}
				return super.parseBindingAtom();
			}
			/**
			* Acorn reports only the second duplicate function parameter. When collecting,
			* report the first one too so editor diagnostics can underline both
			* binding sites. Keep strict mode on Acorn's normal fatal path.
			*
			* @type {Parse.Parser['checkLValSimple']}
			*/
			checkLValSimple(expr, bindingType = BINDING_TYPES.BIND_NONE, checkClashes) {
				if (this.#collect && expr.type === "Identifier" && bindingType !== BINDING_TYPES.BIND_NONE && checkClashes) {
					const first_positions = get_argument_clash_first_positions(checkClashes);
					const reported_names = get_argument_clash_reported_names(checkClashes);
					const first_position = first_positions.get(expr.name);
					if (Object.prototype.hasOwnProperty.call(checkClashes, expr.name)) {
						if (first_position != null && !reported_names.has(expr.name)) {
							this.#report_recoverable_error_range(first_position, first_position + expr.name.length, "Argument name clash");
							reported_names.add(expr.name);
						}
						const start = expr.start;
						this.#report_recoverable_error_range(start, expr.end ?? start + expr.name.length, "Argument name clash");
						return;
					}
					const result = super.checkLValSimple(expr, bindingType, checkClashes);
					first_positions.set(expr.name, expr.start);
					return result;
				}
				return super.checkLValSimple(expr, bindingType, checkClashes);
			}
			/**
			* Override to track parenthesized expressions in metadata
			* This allows the prettier plugin to preserve parentheses where they existed
			* @type {Parse.Parser['parseParenAndDistinguishExpression']}
			*/
			parseParenAndDistinguishExpression(canBeArrow, forInit) {
				const startPos = this.start;
				const expr = super.parseParenAndDistinguishExpression(canBeArrow, forInit);
				if (expr && expr.start > startPos) {
					expr.metadata ??= { path: [] };
					expr.metadata.parenthesized = true;
				}
				return expr;
			}
			/**
			* Override checkLocalExport to check all scopes in the scope stack.
			* This is needed because submodules create nested scopes, but exports
			* from within submodules should still be valid if the identifier is
			* declared in the submodule scope (not just the top-level module scope).
			* @type {Parse.Parser['checkLocalExport']}
			*/
			checkLocalExport(id) {
				const { name } = id;
				if (this.hasImport(name)) return;
				for (let i = this.scopeStack.length - 1; i >= 0; i--) {
					const scope = this.scopeStack[i];
					if (scope.lexical.indexOf(name) !== -1 || scope.var.indexOf(name) !== -1) {
						delete this.undefinedExports[name];
						return;
					}
				}
				this.undefinedExports[name] = id;
			}
			/** @type {Parse.Parser['parseForStatement']} */
			parseForStatement(node) {
				this.next();
				let awaitAt = this.options.ecmaVersion >= 9 && this.canAwait && this.eatContextual("await") ? this.lastTokStart : -1;
				this.labels.push({ kind: "loop" });
				this.enterScope(0);
				this.expect(tt.parenL);
				if (this.type === tt.semi) {
					if (awaitAt > -1) this.unexpected(awaitAt);
					return this.parseFor(node, null);
				}
				let isLet = this.isLet();
				if (this.type === tt._var || this.type === tt._const || isLet) {
					let init = this.startNode(), kind = isLet ? "let" : this.value;
					this.next();
					this.parseVar(init, true, kind);
					this.finishNode(init, "VariableDeclaration");
					return this.parseForAfterInitWithIndex(node, init, awaitAt);
				}
				let startsWithLet = this.isContextual("let"), isForOf = false;
				let usingKind = this.isUsing && this.isUsing(true) ? "using" : this.isAwaitUsing && this.isAwaitUsing(true) ? "await using" : null;
				if (usingKind) {
					let init = this.startNode();
					this.next();
					if (usingKind === "await using") {
						if (!this.canAwait) this.raise(this.start, "Await using cannot appear outside of async function");
						this.next();
					}
					this.parseVar(init, true, usingKind);
					this.finishNode(init, "VariableDeclaration");
					return this.parseForAfterInitWithIndex(node, init, awaitAt);
				}
				let containsEsc = this.containsEsc;
				let refDestructuringErrors = new DestructuringErrors();
				let initPos = this.start;
				let init_expr = awaitAt > -1 ? this.parseExprSubscripts(refDestructuringErrors, "await") : this.parseExpression(true, refDestructuringErrors);
				if (this.type === tt._in || (isForOf = this.options.ecmaVersion >= 6 && this.isContextual("of"))) {
					if (awaitAt > -1) {
						if (this.type === tt._in) this.unexpected(awaitAt);
						/** @type {AST.ForOfStatement} */ node.await = true;
					} else if (isForOf && this.options.ecmaVersion >= 8) {
						if (init_expr.start === initPos && !containsEsc && init_expr.type === "Identifier" && init_expr.name === "async") this.unexpected();
						else if (this.options.ecmaVersion >= 9)
 /** @type {AST.ForOfStatement} */ node.await = false;
					}
					if (startsWithLet && isForOf) this.raise(
						/** @type {AST.NodeWithLocation} */
						init_expr.start,
						"The left-hand side of a for-of loop may not start with 'let'."
					);
					const init = this.toAssignable(init_expr, false, refDestructuringErrors);
					this.checkLValPattern(init);
					return this.parseForInWithIndex(node, init);
				} else this.checkExpressionErrors(refDestructuringErrors, true);
				if (awaitAt > -1) this.unexpected(awaitAt);
				return this.parseFor(node, init_expr);
			}
			/** @type {Parse.Parser['parseForAfterInitWithIndex']} */
			parseForAfterInitWithIndex(node, init, awaitAt) {
				if ((this.type === tt._in || this.options.ecmaVersion >= 6 && this.isContextual("of")) && init.declarations.length === 1) {
					if (this.options.ecmaVersion >= 9) if (this.type === tt._in) {
						if (awaitAt > -1) this.unexpected(awaitAt);
					} else
 /** @type {AST.ForOfStatement} */ node.await = awaitAt > -1;
					return this.parseForInWithIndex(node, init);
				}
				if (awaitAt > -1) this.unexpected(awaitAt);
				return this.parseFor(node, init);
			}
			/** @type {Parse.Parser['parseForInWithIndex']} */
			parseForInWithIndex(node, init) {
				const isForIn = this.type === tt._in;
				this.next();
				if (init.type === "VariableDeclaration" && init.declarations[0].init != null && (!isForIn || this.options.ecmaVersion < 8 || this.strict || init.kind !== "var" || init.declarations[0].id.type !== "Identifier")) this.raise(
					/** @type {AST.NodeWithLocation} */
					init.start,
					`${isForIn ? "for-in" : "for-of"} loop variable declaration may not have an initializer`
				);
				node.left = init;
				node.right = isForIn ? this.parseExpression() : this.parseMaybeAssign();
				if (!isForIn && this.type === tt.semi) {
					this.next();
					if (this.isContextual("index")) {
						this.next();
						/** @type {AST.ForOfStatement} */ node.index = this.parseExpression();
						if (node.index.type !== "Identifier") this.raise(this.start, "Expected identifier after \"index\" keyword");
						this.eat(tt.semi);
					}
					if (this.isContextual("key")) {
						this.next();
						/** @type {AST.ForOfStatement} */ node.key = this.parseExpression();
					}
					if (this.isContextual("index")) this.raise(this.start, "\"index\" must come before \"key\" in for-of loop");
				} else if (!isForIn)
 /** @type {AST.ForOfStatement} */ node.index = null;
				this.expect(tt.parenR);
				node.body = this.parseStatement("for");
				this.exitScope();
				this.labels.pop();
				return this.finishNode(node, isForIn ? "ForInStatement" : "ForOfStatement");
			}
			/** @type {Parse.Parser['parseIfStatement']} */
			parseIfStatement(node) {
				const ifNode = node;
				this.next();
				ifNode.test = this.parseParenExpression();
				ifNode.consequent = this.parseStatement("if");
				ifNode.alternate = this.#eatNativeTemplateDirectiveToken(tt._else) ? this.parseStatement("if") : null;
				return this.finishNode(ifNode, "IfStatement");
			}
			/**
			* @type {Parse.Parser['parseFunctionBody']}
			*/
			parseFunctionBody(node, isArrowFunction, isMethod, forInit, ...args) {
				const isNativeTemplateBody = this.#isNativeFunctionBodyStatementContainerStart();
				if (isNativeTemplateBody) {
					this.next();
					this.#parseNextFunctionBodyAsNativeTemplate = true;
				}
				this.#functionBodyDepth++;
				try {
					return super.parseFunctionBody(node, isArrowFunction, isMethod, forInit, ...args);
				} finally {
					this.#functionBodyDepth--;
					if (isNativeTemplateBody) this.#parseNextFunctionBodyAsNativeTemplate = false;
				}
			}
			/**
			* @return {ESTreeJSX.JSXExpressionContainer}
			*/
			jsx_parseExpressionContainer() {
				let node = this.startNode();
				this.next();
				node.expression = this.type === tt.braceR ? this.jsx_parseEmptyExpression() : this.parseExpression();
				if (this.#allowExpressionContainerTrailingSemicolon && this.type === tt.semi) {
					if (this.#collect) this.#report_recoverable_error(this.start, "TSRX expression containers do not use semicolons. Remove this semicolon.", DIAGNOSTIC_CODES.TEMPLATE_EXPRESSION_TRAILING_SEMICOLON);
					this.next();
				}
				this.expect(tt.braceR);
				return this.finishNode(node, "JSXExpressionContainer");
			}
			/**
			* @type {Parse.Parser['jsx_parseEmptyExpression']}
			*/
			jsx_parseEmptyExpression() {
				const node = this.startNodeAt(this.lastTokEnd, this.lastTokEndLoc);
				node.end = this.start;
				node.loc.end = this.startLoc;
				return this.finishNodeAt(node, "JSXEmptyExpression", this.start, this.startLoc);
			}
			/**
			* @type {Parse.Parser['jsx_parseTupleContainer']}
			*/
			jsx_parseTupleContainer() {
				const t = this.startNode();
				return this.next(), t.expression = this.type === tt.bracketR ? this.jsx_parseEmptyExpression() : this.parseExpression(), this.expect(tt.bracketR), this.finishNode(t, "JSXExpressionContainer");
			}
			/**
			* @returns {AST.TextNode}
			*/
			parseDoubleQuotedTextChild() {
				const node = this.startNode();
				const expression = this.startNode();
				node.raw = this.input.slice(this.start, this.end);
				const end = this.end;
				const endLoc = this.endLoc;
				expression.value = this.value;
				expression.raw = JSON.stringify(this.value);
				node.expression = this.finishNodeAt(expression, "Literal", end, endLoc);
				this.#allowTagStartAfterDoubleQuotedText = true;
				try {
					this.next();
				} finally {
					this.#allowTagStartAfterDoubleQuotedText = false;
				}
				return this.finishNodeAt(node, "Text", end, endLoc);
			}
			/**
			* @returns {AST.TextNode}
			*/
			parseNativeTextChild() {
				const node = this.startNode();
				const expression = this.startNode();
				node.raw = this.input.slice(this.start, this.end);
				const end = this.end;
				const endLoc = this.endLoc;
				expression.value = this.value;
				expression.raw = JSON.stringify(this.value);
				node.expression = this.finishNodeAt(expression, "Literal", end, endLoc);
				this.next();
				return this.finishNodeAt(node, "Text", end, endLoc);
			}
			#parseAndPushNativeTextChild(body) {
				const node = this.parseNativeTextChild();
				if (!isWhitespaceTextNode(node)) body.push(node);
			}
			/**
			* @type {Parse.Parser['jsx_parseAttribute']}
			*/
			jsx_parseAttribute() {
				let node = this.startNode();
				if (this.eat(tt.braceL)) if (this.type === tt.ellipsis) {
					this.expect(tt.ellipsis);
					/** @type {AST.SpreadAttribute} */ node.argument = this.parseMaybeAssign();
					this.expect(tt.braceR);
					return this.finishNode(node, "SpreadAttribute");
				} else if (this.lookahead().type === tt.ellipsis) {
					this.expect(tt.ellipsis);
					/** @type {AST.SpreadAttribute} */ node.argument = this.parseMaybeAssign();
					this.expect(tt.braceR);
					return this.finishNode(node, "SpreadAttribute");
				} else {
					const id = this.parseIdentNode();
					id.tracked = false;
					this.finishNode(id, "Identifier");
					/** @type {AST.Attribute} */ node.name = id;
					/** @type {AST.Attribute} */ node.value = id;
					/** @type {AST.Attribute} */ node.shorthand = true;
					this.next();
					this.expect(tt.braceR);
					return this.finishNode(node, "Attribute");
				}
				/** @type {ESTreeJSX.JSXAttribute} */ node.name = this.jsx_parseNamespacedName();
				if (node.name.type === "JSXIdentifier" && node.name.tracked) this.#report_recoverable_error_range(
					/** @type {AST.NodeWithLocation} */
					node.start,
					/** @type {AST.NodeWithLocation} */
					node.name.end ?? node.end ?? node.start,
					DYNAMIC_ATTRIBUTE_NAME_ERROR
				);
				/** @type {ESTreeJSX.JSXAttribute} */ node.value = this.eat(tt.eq) ? this.jsx_parseAttributeValue() : null;
				return this.finishNode(node, "JSXAttribute");
			}
			/**
			* @type {Parse.Parser['jsx_parseNamespacedName']}
			*/
			jsx_parseNamespacedName() {
				const base = this.jsx_parseIdentifier();
				if (!this.eat(tt.colon)) return base;
				const node = this.startNodeAt(
					/** @type {AST.NodeWithLocation} */
					base.start,
					/** @type {AST.NodeWithLocation} */
					base.loc.start
				);
				node.namespace = base;
				node.name = this.jsx_parseIdentifier();
				return this.finishNode(node, "JSXNamespacedName");
			}
			/**
			* @type {Parse.Parser['jsx_parseIdentifier']}
			*/
			jsx_parseIdentifier() {
				const node = this.startNode();
				if (this.type.label === "@") {
					this.next();
					if (this.type === tt.name || this.type === tstt.jsxName) {
						node.name = this.value;
						node.tracked = true;
						this.next();
					} else this.unexpected();
				} else if (this.type === tt.name || this.type.keyword || this.type === tstt.jsxName) {
					node.name = this.value;
					node.tracked = false;
					this.next();
				} else return super.jsx_parseIdentifier();
				return this.finishNode(node, "JSXIdentifier");
			}
			/**
			* @type {Parse.Parser['jsx_parseElementName']}
			*/
			jsx_parseElementName() {
				if (this.type === tstt.jsxTagEnd) return "";
				if (this.type === tt.braceL) return this.#parseNativeDynamicElementName();
				let node = this.jsx_parseNamespacedName();
				if (node.type === "JSXNamespacedName") return node;
				if (this.eat(tt.dot)) {
					let memberExpr = this.startNodeAt(
						/** @type {AST.NodeWithLocation} */
						node.start,
						/** @type {AST.NodeWithLocation} */
						node.loc.start
					);
					memberExpr.object = node;
					memberExpr.property = this.jsx_parseIdentifier();
					memberExpr.computed = false;
					memberExpr = this.finishNode(memberExpr, "JSXMemberExpression");
					while (this.eat(tt.dot)) {
						let newMemberExpr = this.startNodeAt(
							/** @type {AST.NodeWithLocation} */
							memberExpr.start,
							/** @type {AST.NodeWithLocation} */
							memberExpr.loc.start
						);
						newMemberExpr.object = memberExpr;
						newMemberExpr.property = this.jsx_parseIdentifier();
						newMemberExpr.computed = false;
						memberExpr = this.finishNode(newMemberExpr, "JSXMemberExpression");
					}
					return memberExpr;
				}
				return node;
			}
			/** @type {Parse.Parser['jsx_parseAttributeValue']} */
			jsx_parseAttributeValue() {
				switch (this.type) {
					case tt.braceL:
						this.#jsxAttributeValueExpressionDepth++;
						try {
							return this.jsx_parseExpressionContainer();
						} finally {
							this.#jsxAttributeValueExpressionDepth--;
						}
					case tstt.jsxTagStart:
					case tt.string: return this.parseExprAtom();
					default: this.raise(this.start, "value should be either an expression or a quoted text");
				}
			}
			/**
			* @type {Parse.Parser['parseTryStatement']}
			*/
			parseTryStatement(node) {
				this.next();
				node.block = this.parseBlock();
				node.handler = null;
				if (this.#eatNativeTemplateContextualDirective("pending")) node.pending = this.parseBlock();
				else node.pending = null;
				if (this.#isNativeTemplateDirectiveToken(tt._catch)) {
					const clause = this.startNode();
					this.#eatNativeTemplateDirectiveToken(tt._catch);
					if (this.eat(tt.parenL)) {
						const param = this.parseBindingAtom();
						const simple = param.type === "Identifier";
						this.enterScope(simple ? BINDING_TYPES.BIND_SIMPLE_CATCH : 0);
						this.checkLValPattern(param, simple ? BINDING_TYPES.BIND_SIMPLE_CATCH : BINDING_TYPES.BIND_LEXICAL);
						const type = this.tsTryParseTypeAnnotation();
						if (type) {
							param.typeAnnotation = type;
							this.resetEndLocation(param);
						}
						clause.param = param;
						if (this.eat(tt.comma)) {
							const reset_param = this.parseBindingAtom();
							this.checkLValSimple(reset_param, BINDING_TYPES.BIND_LEXICAL);
							const reset_type = this.tsTryParseTypeAnnotation();
							if (reset_type) {
								reset_param.typeAnnotation = reset_type;
								this.resetEndLocation(reset_param);
							}
							clause.resetParam = reset_param;
						} else clause.resetParam = null;
						this.expect(tt.parenR);
					} else {
						clause.param = null;
						clause.resetParam = null;
						this.enterScope(0);
					}
					clause.body = this.parseBlock(false);
					this.exitScope();
					node.handler = this.finishNode(clause, "CatchClause");
				}
				node.finalizer = this.#eatNativeTemplateDirectiveToken(tt._finally) ? this.parseBlock() : null;
				if (!node.handler && !node.finalizer && !node.pending) this.raise(
					/** @type {AST.NodeWithLocation} */
					node.start,
					"Missing catch or finally clause"
				);
				return this.finishNode(node, "TryStatement");
			}
			/** @type {Parse.Parser['parseSwitchStatement']} */
			parseSwitchStatement(node) {
				const switchNode = node;
				this.next();
				switchNode.discriminant = this.parseParenExpression();
				switchNode.cases = [];
				this.expect(tt.braceL);
				this.labels.push({ kind: "switch" });
				this.enterScope(0);
				/** @type {AST.SwitchCase | undefined} */
				let cur;
				let sawDefault = false;
				while (this.type !== tt.braceR) if (this.#isNativeTemplateDirectiveToken(tt._case) || this.#isNativeTemplateDirectiveToken(tt._default)) {
					const isCase = this.#isNativeTemplateDirectiveToken(tt._case);
					if (cur) this.finishNode(cur, "SwitchCase");
					switchNode.cases.push(cur = this.startNode());
					cur.consequent = [];
					if (isCase) {
						this.#eatNativeTemplateDirectiveToken(tt._case);
						cur.test = this.parseExpression();
					} else {
						this.#eatNativeTemplateDirectiveToken(tt._default);
						if (sawDefault) this.raiseRecoverable(this.lastTokStart, "Multiple default clauses");
						sawDefault = true;
						cur.test = null;
					}
					this.expect(tt.colon);
				} else {
					if (!cur) this.unexpected();
					cur.consequent.push(this.parseStatement(null));
				}
				this.exitScope();
				if (cur) this.finishNode(cur, "SwitchCase");
				this.next();
				this.labels.pop();
				return this.finishNode(switchNode, "SwitchStatement");
			}
			/** @type {Parse.Parser['jsx_readToken']} */
			jsx_readToken() {
				let out = "", chunkStart = this.pos;
				while (true) {
					if (this.pos >= this.input.length) {
						if (!this.#path.findLast((n) => n.type === "Element" || n.type === "TsrxFragment")) {
							while (this.curContext() === tstc.tc_expr) this.context.pop();
							return this.finishToken(tt.eof);
						}
						this.raise(this.start, "Unterminated JSX contents");
					}
					let ch = this.input.charCodeAt(this.pos);
					switch (ch) {
						case CharCode.lessThan:
						case CharCode.openBrace:
							if (this.pos !== chunkStart) {
								out += this.input.slice(chunkStart, this.pos);
								return this.finishToken(tstt.jsxText, out);
							}
							this.start = this.pos;
							this.startLoc = this.curPosition();
							if (ch === CharCode.lessThan) {
								++this.pos;
								return this.finishToken(tstt.jsxTagStart);
							}
							return this.getTokenFromCode(ch);
						case CharCode.slash:
							if (this.input.charCodeAt(this.pos + 1) === CharCode.slash) {
								const commentStart = this.pos;
								const startLoc = this.curPosition();
								this.pos += 2;
								let commentText = "";
								while (this.pos < this.input.length) {
									if (isNewLine(this.input.charCodeAt(this.pos))) break;
									commentText += this.input[this.pos];
									this.pos++;
								}
								const commentEnd = this.pos;
								const endLoc = this.curPosition();
								if (this.options.onComment) {
									const metadata = this.#createCommentMetadata();
									this.options.onComment(false, commentText, commentStart, commentEnd, startLoc, endLoc, metadata);
								}
								break;
							} else if (this.input.charCodeAt(this.pos + 1) === CharCode.asterisk) {
								const commentStart = this.pos;
								const startLoc = this.curPosition();
								this.pos += 2;
								let commentText = "";
								while (this.pos < this.input.length - 1) {
									if (this.input.charCodeAt(this.pos) === CharCode.asterisk && this.input.charCodeAt(this.pos + 1) === CharCode.slash) {
										this.pos += 2;
										break;
									}
									commentText += this.input[this.pos];
									this.pos++;
								}
								const commentEnd = this.pos;
								const endLoc = this.curPosition();
								if (this.options.onComment) {
									const metadata = this.#createCommentMetadata();
									this.options.onComment(true, commentText, commentStart, commentEnd, startLoc, endLoc, metadata);
								}
								break;
							}
							this.#resetTokenStartToCurrentPosition();
							this.context.push(b_stat);
							this.exprAllowed = true;
							return original.readToken.call(this, ch);
						case CharCode.ampersand:
							out += this.input.slice(chunkStart, this.pos);
							out += this.jsx_readEntity();
							chunkStart = this.pos;
							break;
						case CharCode.greaterThan:
						case CharCode.closeBrace:
							if (ch === CharCode.closeBrace && (this.#path.length === 0 || this.#path.at(-1)?.type === "Element" || this.#path.at(-1)?.type === "TsrxFragment")) {
								this.#resetTokenStartToCurrentPosition();
								return original.readToken.call(this, ch);
							}
							this.raise(this.pos, "Unexpected token `" + this.input[this.pos] + "`. Did you mean `" + (ch === CharCode.greaterThan ? "&gt;" : "&rbrace;") + "` or `{\"" + this.input[this.pos] + "\"}`?");
						case CharCode.at:
							if (this.pos !== chunkStart) {
								out += this.input.slice(chunkStart, this.pos);
								return this.finishToken(tstt.jsxText, out);
							}
							this.#resetTokenStartToCurrentPosition();
							this.context.push(b_stat);
							this.exprAllowed = true;
							return original.readToken.call(this, ch);
						default: if (isNewLine(ch)) {
							out += this.input.slice(chunkStart, this.pos);
							out += this.jsx_readNewLine(true);
							chunkStart = this.pos;
						} else ++this.pos;
					}
				}
			}
			/**
			* Override jsx_parseElement to parse tags and bare fragments as native TSRX
			* by default.
			* @type {Parse.Parser['jsx_parseElement']}
			*/
			jsx_parseElement() {
				this.next();
				const parsed = this.parseElement();
				this.#popTokenContextsAfterTemplateExpressionElement(parsed);
				return parsed;
			}
			/**
			* @type {Parse.Parser['parseElement']}
			*/
			parseElement() {
				const inside_head = this.#path.findLast((n) => n.type === "Element" && n.id && n.id.type === "Identifier" && n.id.name === "head");
				const start = this.start - 1;
				const position = new Position(this.curLine, start - this.lineStart);
				const element = this.startNode();
				element.start = start;
				/** @type {AST.NodeWithLocation} */ element.loc.start = position;
				element.metadata = { path: [] };
				element.children = [];
				element.type = "Element";
				this.#path.push(element);
				const open = this.jsx_parseOpeningElementAt(start, position);
				element.openingElement = open;
				const is_fragment = !open.name;
				if (!is_fragment && open.name.type === "JSXNamespacedName") {
					const namespace_node = open.name;
					const tagName = namespace_node.namespace.name + ":" + namespace_node.name.name;
					this.raise(open.start, `Namespaced elements are not supported in TSRX templates: <${tagName}>.`);
				}
				if (is_fragment)
 /** @type {AST.TsrxFragment} */ element.type = "TsrxFragment";
				else element.type = "Element";
				for (const attr of open.attributes) if (attr.type === "JSXAttribute") {
					/** @type {AST.Attribute} */ attr.type = "Attribute";
					if (attr.name.type === "JSXIdentifier")
 /** @type {AST.Identifier} */ attr.name.type = "Identifier";
					if (attr.value !== null) {
						if (attr.value.type === "JSXExpressionContainer") {
							const expression = attr.value.expression;
							if (expression.type === "Literal") expression.was_expression = true;
							/** @type {ESTreeJSX.JSXAttribute} */ attr.value = expression;
						}
					}
				}
				if (!is_fragment) {
					/** @type {AST.Element} */ element.id = convert_from_jsx(open.name);
					element.selfClosing = open.selfClosing;
				} else if (is_fragment) element.selfClosing = false;
				element.attributes = open.attributes;
				element.metadata ??= { path: [] };
				if (element.metadata.commentContainerId === void 0) element.metadata.commentContainerId = ++this.#commentContextId;
				if (element.selfClosing) {
					this.#path.pop();
					if (this.type.label === "</>/<=/>=") {
						this.pos--;
						this.next();
					}
				} else if (is_fragment) {
					this.#parseNativeTemplateBody(
						element,
						/** @type {AST.Element} */
						element.children,
						{
							enterScope: true,
							resetFunctionBodyDepth: true
						}
					);
					this.#path.pop();
					if (!element.unclosed) {
						const raise_error = () => {
							this.raise(this.start, `Expected closing tag '</>'`);
						};
						this.next();
						if (this.value !== "/") raise_error();
						this.next();
						if (this.type !== tstt.jsxTagEnd) raise_error();
						this.#popTemplateTokenContextBeforeExpressionChild();
						this.next();
					}
				} else {
					if (open.name.name === "script") {
						let content = "";
						const start = open.end;
						const input = this.input.slice(start);
						const end = input.indexOf("<\/script>");
						content = end === -1 ? input : input.slice(0, end);
						const newLines = content.match(regex_newline_characters)?.length;
						if (newLines) {
							this.curLine = open.loc.end.line + newLines;
							this.lineStart = start + content.lastIndexOf("\n") + 1;
						}
						if (end !== -1) {
							const closingStart = start + content.length;
							const closingLineInfo = getLineInfo(this.input, closingStart);
							const closingStartLoc = new Position(closingLineInfo.line, closingLineInfo.column);
							this.exprAllowed = false;
							this.pos = closingStart + 1;
							this.type = tstt.jsxTagStart;
							this.start = closingStart;
							this.startLoc = closingStartLoc;
							this.next();
							this.next();
							element.closingElement = this.jsx_parseClosingElementAt(closingStart, closingStartLoc);
							this.exprAllowed = false;
							const contentStartLineInfo = getLineInfo(this.input, start);
							const contentStartLoc = new Position(contentStartLineInfo.line, contentStartLineInfo.column);
							const contentEndLineInfo = getLineInfo(this.input, closingStart);
							const contentEndLoc = new Position(contentEndLineInfo.line, contentEndLineInfo.column);
							element.children = [{
								type: "ScriptContent",
								content,
								start,
								end: closingStart,
								loc: {
									start: contentStartLoc,
									end: contentEndLoc
								}
							}];
							this.#path.pop();
						} else {
							this.#report_broken_markup_error(open.end, "Unclosed tag '<script>'. Expected '<\/script>' before end of template.");
							/** @type {AST.Element} */ element.unclosed = true;
							this.#path.pop();
						}
					} else if (open.name.name === "style") {
						const start = open.end;
						const input = this.input.slice(start);
						const end = input.indexOf("</style>");
						const content = end === -1 ? input : input.slice(0, end);
						const parsed_css = parse_style(content, { loose: this.#loose });
						if (!inside_head)
 /** @type {AST.Element} */ element.metadata.styleScopeHash = parsed_css.hash;
						const newLines = content.match(regex_newline_characters)?.length;
						if (newLines) {
							this.curLine = open.loc.end.line + newLines;
							this.lineStart = start + content.lastIndexOf("\n") + 1;
						}
						if (end !== -1) {
							const closingStart = start + content.length;
							const closingLineInfo = getLineInfo(this.input, closingStart);
							const closingStartLoc = new Position(closingLineInfo.line, closingLineInfo.column);
							this.exprAllowed = false;
							this.pos = closingStart + 1;
							this.type = tstt.jsxTagStart;
							this.start = closingStart;
							this.startLoc = closingStartLoc;
							this.next();
							this.next();
							element.closingElement = this.jsx_parseClosingElementAt(closingStart, closingStartLoc);
							this.exprAllowed = false;
							this.#path.pop();
						} else {
							this.#report_broken_markup_error(open.end, "Unclosed tag '<style>'. Expected '</style>' before end of template.");
							/** @type {AST.Element} */ element.unclosed = true;
							this.#path.pop();
						}
						/** @type {AST.Element} */ element.children = [parsed_css];
						const curContext = this.curContext();
						const parent = this.#path.at(-1);
						const insideTemplate = this.#isNativeTemplateNode(parent);
						if (curContext === tstc.tc_expr && !insideTemplate) this.context.pop();
						/** @type {AST.Element} */ element.css = content;
					} else {
						this.#parseNativeTemplateBody(
							element,
							/** @type {AST.Element} */
							element.children,
							{
								enterScope: true,
								resetFunctionBodyDepth: true
							}
						);
						if (element.type === "TsrxFragment" && this.#path[this.#path.length - 1] === element) {
							const displayTag = element.openingElement.name ? "tsrx" : "";
							this.#report_broken_markup_error(this.start, `Unclosed tag '<${displayTag}>'. Expected '</${displayTag}>' before end of template.`);
							element.unclosed = true;
							/** @type {AST.SourceLocation} */ element.loc.end = { ...element.openingElement.loc.end };
							element.end = element.openingElement.end;
							this.#path.pop();
						} else if (element.type === "Element" && this.#path[this.#path.length - 1] === element) {
							const tagName = this.getElementName(element.id);
							this.#report_broken_markup_error(this.start, `Unclosed tag '<${tagName}>'. Expected '</${tagName}>' before end of template.`);
							element.unclosed = true;
							/** @type {AST.SourceLocation} */ element.loc.end = { ...element.openingElement.loc.end };
							element.end = element.openingElement.end;
							this.#path.pop();
						}
					}
					const curContext = this.curContext();
					const parent = this.#path.at(-1);
					const insideTemplate = this.#isNativeTemplateNode(parent);
					if (curContext === tstc.tc_expr && !insideTemplate) this.context.pop();
				}
				if (element.closingElement && element.closingElement.name)
 /** @type {unknown} */ element.closingElement.name = convert_from_jsx(element.closingElement.name);
				this.finishNode(element, element.type);
				return element;
			}
			/**
			* @type {Parse.Parser['parseTemplateBody']}
			*/
			parseTemplateBody(body) {
				const inside_func = this.context.some((n) => n.token === "function") || this.scopeStack.length > 1;
				const current_template_node = this.#path.findLast((n) => n.type === "Element" || n.type === "TsrxFragment");
				if (current_template_node?.type === "TsrxFragment" && this.type === tstt.jsxText) {
					while (this.curContext() === tstc.tc_expr) this.context.pop();
					this.pos = this.start;
					this.next();
					this.parseTemplateBody(body);
					return;
				}
				if (current_template_node && this.type === tstt.jsxText) {
					this.#parseAndPushNativeTextChild(body);
					this.parseTemplateBody(body);
					return;
				}
				if (!inside_func) {
					if (this.type.label === "continue") throw new Error("`continue` statements are not allowed in native templates");
					if (this.type.label === "break") throw new Error("`break` statements are not allowed in native templates");
				}
				if (current_template_node?.type === "TsrxFragment" && !current_template_node.openingElement.name && (this.type === tstt.jsxTagStart && this.input.slice(this.pos, this.pos + 2) === "/>" || this.input.charCodeAt(this.start) === CharCode.lessThan && this.input.slice(this.start + 1, this.start + 3) === "/>")) {
					this.exprAllowed = false;
					return;
				}
				if (this.#isNativeTemplateStatementContainerStart()) body.push(this.#parseNativeTemplateStatementContainer());
				else if (this.type === tt.braceL) body.push(this.#parseNativeTemplateExpressionContainer());
				else if (this.type === tt.string && this.input.charCodeAt(this.start) === CharCode.doubleQuote) body.push(this.parseDoubleQuotedTextChild());
				else if (this.type === tt.braceR) {
					while (this.curContext() === tstc.tc_expr) this.context.pop();
					return;
				} else if (this.type === tstt.jsxTagStart || this.input.charCodeAt(this.start) === CharCode.lessThan && this.input.charCodeAt(this.start + 1) === CharCode.slash) {
					const startPos = this.start;
					const startLoc = this.startLoc;
					if (this.type === tstt.jsxTagStart) {
						if (this.input.charCodeAt(this.pos) === CharCode.slash) this.exprAllowed = false;
						this.next();
					} else {
						this.pos = startPos + 1;
						this.type = tstt.jsxTagStart;
						this.start = startPos;
						this.startLoc = startLoc;
						this.exprAllowed = false;
						this.next();
					}
					if (this.value === "/" || this.type === tt.slash) {
						this.next();
						const closingElement = this.jsx_parseClosingElementAt(startPos, startLoc);
						this.exprAllowed = false;
						const currentElement = this.#path[this.#path.length - 1];
						if (!currentElement || currentElement.type !== "Element" && currentElement.type !== "TsrxFragment") this.raise(this.start, "Unexpected closing tag");
						/** @type {string | null} */
						let openingTagName;
						/** @type {string | null} */
						let closingTagName;
						if (currentElement.type === "TsrxFragment") {
							openingTagName = "";
							closingTagName = closingElement.name?.type === "JSXNamespacedName" ? closingElement.name.namespace.name + ":" + closingElement.name.name.name : this.getElementName(closingElement.name);
						} else {
							openingTagName = currentElement.id ? this.getElementName(currentElement.id) : null;
							closingTagName = closingElement.name ? closingElement.name?.type === "JSXNamespacedName" ? closingElement.name.namespace.name + ":" + closingElement.name.name.name : this.getElementName(closingElement.name) : null;
						}
						if (openingTagName !== closingTagName) {
							this.#report_broken_markup_error(closingElement.start, `Expected closing tag to match opening tag. Expected '</${openingTagName}>' but found '</${closingTagName}>'`, DIAGNOSTIC_CODES.MISMATCHED_CLOSING_TAG);
							while (this.#path.length > 0) {
								const elem = this.#path[this.#path.length - 1];
								if (elem.type !== "Element" && elem.type !== "TsrxFragment") break;
								if ((elem.type === "TsrxFragment" ? "" : elem.id ? this.getElementName(elem.id) : null) === closingTagName) break;
								elem.unclosed = true;
								/** @type {AST.NodeWithLocation} */ elem.loc.end = { ...elem.openingElement.loc.end };
								elem.end = elem.openingElement.end;
								this.#path.pop();
							}
						}
						const elementToClose = this.#path[this.#path.length - 1];
						if (elementToClose && (elementToClose.type === "Element" || elementToClose.type === "TsrxFragment")) {
							if ((elementToClose.type === "TsrxFragment" ? "" : 							/** @type {AST.Element} */ elementToClose.id ? this.getElementName(
								/** @type {AST.Element} */
								elementToClose.id
							) : null) === closingTagName)
 /** @type {AST.Element | AST.TsrxFragment} */ elementToClose.closingElement = closingElement;
						}
						this.#path.pop();
						skipWhitespace(this);
						return;
					}
					const node = this.parseElement();
					if (node !== null) body.push(node);
				} else {
					skipWhitespace(this);
					const node = this.parseStatement(null);
					this.#report_invalid_template_return_statements(node);
					body.push(node);
					if (this.curContext() === tstc.tc_expr) this.context.pop();
				}
				this.parseTemplateBody(body);
			}
			/**
			* Parse proposal-style imports from an inline module declaration:
			* `import { foo } from server;`
			*
			* Acorn's import parser currently requires a string literal source. TSRX
			* extends only the source position; all specifier parsing stays delegated
			* to Acorn/@sveltejs/acorn-typescript.
			* @type {Parse.Parser['parseImport']}
			*/
			parseImport(node) {
				const tokenIsIdentifier = Parser.acornTypeScript.tokenIsIdentifier;
				const parser = this;
				const import_node = node;
				let enterHead = parser.lookahead();
				import_node.importKind = "value";
				parser.importOrExportOuterKind = "value";
				if (tokenIsIdentifier(enterHead.type) || this.match(tt.star) || this.match(tt.braceL)) {
					let ahead = parser.lookahead(2);
					if (ahead.type !== tt.comma && !parser.isContextualWithState("from", ahead) && ahead.type !== tt.eq && parser.ts_eatContextualWithState("type", 1, enterHead)) {
						parser.importOrExportOuterKind = "type";
						import_node.importKind = "type";
						enterHead = parser.lookahead();
						ahead = parser.lookahead(2);
					}
					if (tokenIsIdentifier(enterHead.type) && ahead.type === tt.eq) {
						this.next();
						const importNode = parser.tsParseImportEqualsDeclaration(node);
						parser.importOrExportOuterKind = "value";
						return importNode;
					}
				}
				this.next();
				if (this.type === tt.string) {
					import_node.specifiers = [];
					import_node.source = this.parseExprAtom();
				} else {
					import_node.specifiers = this.parseImportSpecifiers();
					this.expectContextual("from");
					if (this.type === tt.string) import_node.source = this.parseExprAtom();
					else if (tokenIsIdentifier(this.type)) {
						const source = this.parseIdent(false);
						source.metadata ??= { path: [] };
						import_node.source = source;
					} else this.unexpected();
				}
				parser.parseMaybeImportAttributes(node);
				this.semicolon();
				this.finishNode(node, "ImportDeclaration");
				parser.importOrExportOuterKind = "value";
				return import_node;
			}
			/**
			* @type {Parse.Parser['parseStatement']}
			*/
			parseStatement(context, topLevel, exports) {
				const nativeDirective = this.#parseNativeTemplateDirectiveStatement(context, topLevel, exports);
				if (nativeDirective) return nativeDirective;
				if (context !== "for" && context !== "if" && this.#functionBodyDepth === 0 && this.context.at(-1) === b_stat && this.type === tt.braceL && this.context.some((c) => c === tstc.tc_expr)) return this.#parseNativeTemplateExpressionContainer();
				if (this.type === tstt.jsxTagStart) {
					this.next();
					if (this.value === "/") this.unexpected();
					const node = this.parseElement();
					if (!node) this.unexpected();
					if (this.#functionBodyDepth > 0 && node.type === "TsrxFragment" && this.curContext() === b_stat) {
						this.context.pop();
						if (this.curContext() === tstc.tc_expr) this.context.pop();
						if (this.curContext() === b_stat) this.context.pop();
					}
					return node;
				}
				if (this.#functionBodyDepth === 0 && this.type === tt.string && this.input.charCodeAt(this.start) === CharCode.doubleQuote && this.#isNativeTemplateContextNode(this.#path.at(-1))) {
					this.pos = this.start;
					this.#readDoubleQuotedTextChildToken();
					const node = this.parseDoubleQuotedTextChild();
					this.semicolon();
					return node;
				}
				if (this.type === tt.bitwiseAND) {
					const charAfterAmp = this.input.charCodeAt(this.end);
					if (charAfterAmp === CharCode.openBrace || charAfterAmp === CharCode.openBracket) {
						const node = this.startNode();
						const assign_node = this.startNode();
						this.next();
						const left = this.parseExprAtom();
						this.toAssignable(left, false);
						left.lazy = true;
						this.expect(tt.eq);
						assign_node.operator = "=";
						assign_node.left = left;
						assign_node.right = this.parseMaybeAssign();
						node.expression = this.finishNode(assign_node, "AssignmentExpression");
						this.semicolon();
						return this.finishNode(node, "ExpressionStatement");
					}
				}
				return super.parseStatement(context, topLevel, exports);
			}
			/**
			* @type {Parse.Parser['parseBlock']}
			*/
			parseBlock(createNewLexicalScope, node, exitStrict) {
				const parent = this.#path.at(-1);
				const isNativeFunctionBodyBlock = this.#parseNextFunctionBodyAsNativeTemplate;
				if (isNativeFunctionBodyBlock || this.#functionBodyDepth === 0 && this.#isNativeTemplateContextNode(parent)) {
					this.#parseNextFunctionBodyAsNativeTemplate = false;
					if (createNewLexicalScope === void 0) createNewLexicalScope = true;
					if (node === void 0) node = this.startNode();
					if (isNativeFunctionBodyBlock) {
						node.metadata ??= { path: [] };
						/** @type {{ nativeTemplateBody?: boolean }} */ node.metadata.nativeTemplateBody = true;
					}
					node.body = [];
					this.#allowDoubleQuotedTextChildAfterBrace = true;
					this.expect(tt.braceL);
					this.#parseNativeTemplateBody(node, node.body, {
						enterScope: createNewLexicalScope,
						pushPath: isNativeFunctionBodyBlock,
						resetFunctionBodyDepth: isNativeFunctionBodyBlock
					});
					if (exitStrict) this.strict = false;
					this.exprAllowed = true;
					this.next();
					return this.finishNode(node, "BlockStatement");
				}
				return super.parseBlock(createNewLexicalScope, node, exitStrict);
			}
		}
		return TSRXParser;
	};
}
//#endregion
//#region ../native-tsrx/src/native.js
const require = createRequire(import.meta.url);
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const nativeNames = {
	"darwin:arm64": "tsrx_core.darwin-arm64.node",
	"darwin:x64": "tsrx_core.darwin-x64.node",
	"linux:x64": "tsrx_core.linux-x64-gnu.node",
	"linux:arm64": "tsrx_core.linux-arm64-gnu.node",
	"win32:x64": "tsrx_core.win32-x64-msvc.node"
};
let binding;
let bindingError;
/**
* @returns {string}
*/
function native_binding_path() {
	if (process.env.TSRX_NATIVE_BINDING_PATH) return process.env.TSRX_NATIVE_BINDING_PATH;
	const name = nativeNames[`${process.platform}:${process.arch}`] ?? `tsrx_core.${process.platform}-${process.arch}.node`;
	const packagePath = join(packageRoot, name);
	if (existsSync(packagePath)) return packagePath;
	return join(packageRoot, "zig-out", name);
}
/**
* @returns {{ parseModuleAst(source: string, filename?: string): import('estree').Program, parseModuleBuffer?: (source: string, filename?: string) => ArrayBuffer }}
*/
function load_native_binding() {
	if (binding) return binding;
	if (bindingError) throw bindingError;
	const path = native_binding_path();
	if (!existsSync(path)) {
		bindingError = /* @__PURE__ */ new Error(`@tsrx/core native binding was not found at ${path}. Run \`zig build\` first.`);
		throw bindingError;
	}
	try {
		binding = require(path);
	} catch (error) {
		bindingError = error;
		throw error;
	}
	if (typeof binding.parseModuleAst !== "function") {
		bindingError = /* @__PURE__ */ new Error("@tsrx/core native binding does not export parseModuleAst");
		throw bindingError;
	}
	return binding;
}
/**
* Parse source through the Zig N-API backend.
*
* This is intentionally opt-in while the Zig parser reaches full public AST
* parity. It must not silently fall back to the JavaScript parser.
*
* @param {string} source
* @param {string} [filename]
* @param {any} [options]
* @returns {import('estree').Program}
*/
function parse_module_native(source, filename, options) {
	if (options?.collect || options?.loose || options?.comments || options?.errors) throw new Error("@tsrx/core native parser does not support collect/loose parsing yet");
	return load_native_binding().parseModuleAst(source, filename);
}
//#endregion
//#region ../native-tsrx/src/parse/parse-module.js
/** @import * as AST from 'estree' */
/** @import { ParseOptions } from '../../types/index' */
const parse = createParser(TSRXPlugin());
/**
* Parse source code to an ESTree AST using the TSRX parser.
* @param {string} source
* @param {string} [filename]
* @param {ParseOptions} [options]
* @returns {AST.Program}
*/
function parse_module(source, filename, options) {
	if (options?.backend === "native") return parse_module_native(source, filename, options);
	return parse(source, filename, options);
}
//#endregion
//#region ../native-tsrx/src/utils/builders.js
/**
* @template {AST.Node} T
* @param {T} node
* @param {AST.NodeWithLocation | undefined} loc_info
* @param {boolean} is_deep_copy
* @returns {T}
*/
function set_location(node, loc_info, is_deep_copy = false) {
	if (loc_info) {
		node.start = loc_info.start;
		node.end = loc_info.end;
		if (is_deep_copy) node.loc = {
			start: { ...loc_info.loc.start },
			end: { ...loc_info.loc.end }
		};
		else node.loc = loc_info.loc;
	}
	return node;
}
/**
* @param {AST.UnaryOperator} operator
* @param {AST.Expression} argument
* @returns {AST.UnaryExpression}
*/
function unary(operator, argument) {
	return {
		type: "UnaryExpression",
		argument,
		operator,
		prefix: true,
		metadata: { path: [] }
	};
}
/**
* @param {boolean | string | number | bigint | false | RegExp | null | undefined} value
* @param {string} [raw]
* @param {AST.NodeWithLocation} [loc_info]
* @returns {AST.Literal}
*/
function literal(value, raw, loc_info) {
	return set_location({
		type: "Literal",
		value,
		raw,
		metadata: { path: [] }
	}, loc_info);
}
literal(true);
literal(false);
literal(null);
unary("void", literal(0));
//#endregion
//#region ../native-tsrx/src/utils/events.js
/**
* Determines if an attribute is an event attribute (e.g., 'onClick').
* @param {string} attr - The attribute name.
* @returns {boolean}
*/
function is_event_attribute(attr) {
	return attr.startsWith("on") && attr.length > 2 && attr[2] === attr[2].toUpperCase();
}
/**
* Checks if the event is a capture event.
* @param {string} event_name - The event name.
* @returns {boolean}
*/
function is_capture_event(event_name) {
	var lowered = event_name.toLowerCase();
	return event_name.endsWith("Capture") && lowered !== "gotpointercapture" && lowered !== "lostpointercapture";
}
/**
* Retrieves the original event name from an event attribute.
* @param {string} name
* @returns {string}
*/
function get_original_event_name(name) {
	return name.slice(2);
}
/**
* Normalizes the event name to lowercase.
* @param {string} name
* @returns {string}
*/
function normalize_event_name(name) {
	return extract_event_name(name).toLowerCase();
}
/**
* Extracts the base event name from an event attribute.
* @param {string} name
* @returns {string}
*/
function extract_event_name(name) {
	name = get_original_event_name(name);
	if (is_capture_event(name)) return event_name_from_capture(name);
	return name;
}
/**
* Converts a capture event name to its base event name.
* @param {string} event_name
* @returns {string}
*/
function event_name_from_capture(event_name) {
	return event_name.slice(0, -7);
}
",".charCodeAt(0);
";".charCodeAt(0);
var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var intToChar = new Uint8Array(64);
var charToInt = new Uint8Array(128);
for (let i = 0; i < chars.length; i++) {
	const c = chars.charCodeAt(i);
	intToChar[i] = c;
	charToInt[c] = i;
}
if (typeof window !== "undefined" && typeof window.btoa === "function");
else if (typeof Buffer === "function");
new Set("a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta meter nav noscript object ol optgroup option output p picture pre progress q rp rt ruby s samp script search section select slot small source span strong style sub summary sup table tbody td template textarea tfoot th thead time title tr track u ul var video wbr".split(" "));
new Set("a animate animateMotion animateTransform circle clipPath defs desc ellipse feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence filter foreignObject g image line linearGradient marker mask metadata mpath path pattern polygon polyline radialGradient rect script set stop style svg switch symbol text textPath title tspan use view".split(" "));
new Set("annotation annotation-xml maction math merror mfrac mi mmultiscripts mn mo mover mpadded mphantom mprescripts mroot mrow ms mspace msqrt mstyle msub msubsup msup mtable mtd mtext mtr munder munderover semantics".split(" "));
//#endregion
//#region packages/compiler/src/ast/nodes.ts
const ignoredWalkKeys = new Set([
	"closingElement",
	"id",
	"leadingComments",
	"loc",
	"metadata",
	"openingElement",
	"parent",
	"range",
	"trailingComments"
]);
function walkNode(node, visit) {
	if (!node || typeof node !== "object") return;
	visit(node);
	for (const child of childNodes(node)) walkNode(child, visit);
}
function childNodes(node) {
	const children = [];
	for (const [key, value] of Object.entries(node)) {
		if (ignoredWalkKeys.has(key)) continue;
		if (Array.isArray(value)) {
			for (const item of value) if (isNode(item)) children.push(item);
			continue;
		}
		if (isNode(value)) children.push(value);
	}
	return children;
}
function asNodes(value) {
	return Array.isArray(value) ? value.filter(isNode) : [];
}
function isNode(value) {
	return typeof value === "object" && value !== null && typeof value.type === "string";
}
function getIdentifierName(node) {
	return typeof node?.name === "string" ? node.name : null;
}
//#endregion
//#region packages/compiler/src/ast/source.ts
function expressionSource(node, source) {
	if (typeof node.start !== "number" || typeof node.end !== "number") return "";
	return source.slice(node.start, node.end).trim();
}
function expressionSourceOrFallback(node, source, fallback) {
	if (!node) return fallback;
	return expressionSource(node, source) || fallback;
}
function sourceSpan(node, filename) {
	if (typeof node.start !== "number" || typeof node.end !== "number") return void 0;
	return {
		filename,
		start: node.start,
		end: node.end
	};
}
//#endregion
//#region packages/compiler/src/passes/semantic-graph/diagnostics.ts
function moduleScopeGraphCreationDiagnostic(name, callName, init, filename) {
	return {
		code: "AA_STATE_MODULE_SCOPE",
		severity: "error",
		phase: "semantic-graph",
		title: "state() and computed() cannot be created at module scope",
		message: `Cannot create "${name}" with ${callName}() at module scope.`,
		why: "Module-scope graph state would be shared across requests and has no per-document serialization payload.",
		primarySpan: init ? sourceSpan(init, filename) : fallbackSpan$2(filename),
		passId: "tsrx-semantic-graph",
		artifactKeys: ["semanticGraph"],
		suggestions: [{ message: "Move state() or computed() creation into a component or declare request/container/page state with shared()." }],
		docsUrl: "https://async.await.dev/errors/AA_STATE_MODULE_SCOPE"
	};
}
function asyncPostAwaitReadDiagnostic(computedName, read) {
	return {
		code: "AA_ASYNC_POST_AWAIT_READ",
		severity: "error",
		phase: "semantic-graph",
		title: "Reactive reads after await are not resumable",
		message: `Cannot read "${read.source}" after await in async computed "${computedName}". Snapshot the value before awaiting.`,
		why: "Async computed dependency keys are captured before the first await. Reading graph state after suspension would make revalidation and resume depend on hidden async timing.",
		primarySpan: read.sourceSpan,
		passId: "tsrx-semantic-graph",
		artifactKeys: ["semanticGraph"],
		suggestions: [{ message: "Read the graph value before the first await, or split post-await formatting into a separate sync computed()." }],
		docsUrl: "https://async.await.dev/errors/AA_ASYNC_POST_AWAIT_READ"
	};
}
function asyncBoundaryRequiredDiagnostic(read, binding) {
	return {
		code: "AA_ASYNC_BOUNDARY_REQUIRED",
		severity: "error",
		phase: "semantic-graph",
		title: "Async computed reads need an async boundary",
		message: `Cannot read ${binding.async === true ? "async computed" : "async-capable computed"} "${read.source}" outside @try/@pending/@catch. Wrap the read in an async boundary.`,
		why: "Async computed values can be pending or rejected during initial render and resume. The runtime needs an explicit TSRX async boundary to render pending and error UI.",
		primarySpan: read.sourceSpan,
		passId: "tsrx-semantic-graph",
		artifactKeys: ["semanticGraph"],
		suggestions: [{ message: "Wrap this template read in @try with @pending and @catch branches, or read a sync computed that is already guarded by an async boundary." }],
		docsUrl: "https://async.await.dev/errors/AA_ASYNC_BOUNDARY_REQUIRED"
	};
}
function elementHandleRequiredDiagnostic(binding, graphBinding) {
	const actual = graphBinding ? `${graphBinding.kind}()` : "an unknown value";
	return {
		code: "AA_ELEMENT_HANDLE_REQUIRED",
		severity: "error",
		phase: "semantic-graph",
		title: "el expects an element() handle",
		message: `Cannot bind el={${binding.handleName}} because "${binding.handleName}" is ${actual}, not an element() handle.`,
		why: "DOM elements are host resources. el can only bind element() handles so resume can recover the current DOM locator without serializing a DOM node.",
		primarySpan: binding.sourceSpan,
		passId: "tsrx-semantic-graph",
		artifactKeys: ["semanticGraph"],
		elementLocator: binding.hostNodeId,
		suggestions: [{ message: "Create a handle with element<T>() and bind that handle with el={handle}. Keep DOM-backed resources in use={...}." }],
		docsUrl: "https://async.await.dev/errors/AA_ELEMENT_HANDLE_REQUIRED"
	};
}
function duplicateElementHandleDiagnostic(binding) {
	return {
		code: "AA_ELEMENT_HANDLE_DUPLICATE",
		severity: "error",
		phase: "semantic-graph",
		title: "element() handle is bound more than once",
		message: `Cannot bind element handle "${binding.handleName}" to multiple live host elements.`,
		why: "A resumed element handle must resolve to one current DOM locator. Binding one handle to multiple live elements would make lazy event code ambiguous.",
		primarySpan: binding.sourceSpan,
		passId: "tsrx-semantic-graph",
		artifactKeys: ["semanticGraph"],
		elementLocator: binding.hostNodeId,
		suggestions: [{ message: "Create a separate element() handle for each host element, or move repeated element access into keyed state and behavior records." }],
		docsUrl: "https://async.await.dev/errors/AA_ELEMENT_HANDLE_DUPLICATE"
	};
}
function useHostElementRequiredDiagnostic(ownerTagName, value, state) {
	return {
		code: "AA_USE_HOST_ELEMENT_REQUIRED",
		severity: "error",
		phase: "semantic-graph",
		title: "use can only be bound to host elements",
		message: `Cannot bind use={${expressionSource(value, state.source)}} on component ${ownerTagName ? `<${ownerTagName}>` : "a non-host element"}. use installs DOM behavior and needs a concrete host element owner.`,
		why: "Element behaviors are resumed by locating the owning DOM element. A component is not a DOM locator and may render zero, one, or many host nodes.",
		primarySpan: sourceSpan(value, state.filename),
		passId: "tsrx-semantic-graph",
		artifactKeys: ["semanticGraph"],
		suggestions: [{ message: "Move use={...} to a host element such as <canvas>, or make the component forward behavior to a known host element in its own TSRX body." }],
		docsUrl: "https://async.await.dev/errors/AA_USE_HOST_ELEMENT_REQUIRED"
	};
}
function fallbackSpan$2(filename) {
	return {
		filename,
		start: 0,
		end: 0
	};
}
//#endregion
//#region packages/compiler/src/passes/semantic-graph/collect-async.ts
function collectAsyncBoundary(node, state, walk) {
	const boundaryId = `boundary:${state.nextBoundaryId++}`;
	const previousBoundaryId = state.currentAsyncBoundaryId;
	state.graph.asyncBoundaries.push({ id: boundaryId });
	state.currentAsyncBoundaryId = boundaryId;
	for (const child of childNodes(node)) walk(child, state);
	state.currentAsyncBoundaryId = previousBoundaryId;
}
function propagateAsyncComputedCapability(graph) {
	const asyncCapableIds = new Set(graph.graphBindings.filter((binding) => binding.kind === "computed" && binding.async === true).map((binding) => binding.id));
	let changed = true;
	while (changed) {
		changed = false;
		for (const binding of graph.graphBindings) {
			if (binding.kind !== "computed" || asyncCapableIds.has(binding.id)) continue;
			if (!(binding.dependencies ?? []).some((dependency) => asyncCapableIds.has(dependency.bindingId))) continue;
			asyncCapableIds.add(binding.id);
			changed = true;
		}
	}
	graph.graphBindings = graph.graphBindings.map((binding) => {
		if (binding.kind !== "computed") return binding;
		return {
			...binding,
			asyncCapable: asyncCapableIds.has(binding.id)
		};
	});
}
function collectAsyncBoundaryDiagnostics(graph) {
	const bindings = graphBindingMap(graph);
	const aliases = semanticAliasMap(graph);
	for (const read of graph.templateReads) {
		if (read.asyncBoundaryId) continue;
		const resolved = resolveGraphPath(read.source, bindings, aliases);
		if (!resolved) continue;
		if (resolved.binding.kind !== "computed" || resolved.binding.asyncCapable !== true) continue;
		graph.diagnostics.push(asyncBoundaryRequiredDiagnostic(read, resolved.binding));
	}
}
function collectGraphDependencies(node, state) {
	const dependencies = [];
	const bindings = graphBindingMap(state.graph);
	const aliases = semanticAliasMap(state.graph);
	const visit = (candidate) => {
		if (!candidate) return;
		if (candidate.type === "ArrowFunctionExpression" || candidate.type === "FunctionExpression" || candidate.type === "FunctionDeclaration") {
			visit(candidate.body);
			return;
		}
		if (candidate.type === "CallExpression") {
			const callee = candidate.callee;
			if (callee?.type === "MemberExpression") {
				visit(callee.object);
				for (const argument of asNodes(candidate.arguments)) visit(argument);
				return;
			}
		}
		if (candidate.type === "MemberExpression") {
			const dependency = graphDependency(candidate, state, bindings, aliases);
			if (dependency) {
				dependencies.push(dependency);
				return;
			}
			if (candidate.computed === true) visit(candidate.property);
			return;
		}
		if (candidate.type === "Identifier") {
			const dependency = graphDependency(candidate, state, bindings, aliases);
			if (dependency) dependencies.push(dependency);
			return;
		}
		for (const child of childNodes(candidate)) visit(child);
	};
	visit(node);
	return uniqueBy(dependencies, (dependency) => `${dependency.bindingId}:${dependency.path.join(".")}:${dependency.source}`);
}
function collectAsyncComputedPostAwaitReads(computedName, body, state) {
	const firstAwaitEnd = findFirstAwaitEnd(body);
	if (firstAwaitEnd === null) return;
	for (const read of postAwaitGraphReads(body, firstAwaitEnd, state)) state.graph.diagnostics.push(asyncPostAwaitReadDiagnostic(computedName, read));
}
function graphDependency(node, state, bindings, aliases) {
	const source = expressionSource(node, state.source);
	const resolved = resolveGraphPath(source, bindings, aliases);
	if (!resolved) return null;
	return {
		source,
		bindingId: resolved.binding.id,
		path: resolved.path
	};
}
function findFirstAwaitEnd(node) {
	let first = null;
	walkNode(node, (candidate) => {
		if (candidate.type !== "AwaitExpression") return;
		if (typeof candidate.start !== "number" || typeof candidate.end !== "number") return;
		if (first && candidate.start >= first.start) return;
		first = {
			start: candidate.start,
			end: candidate.end
		};
	});
	return first?.end ?? null;
}
function postAwaitGraphReads(node, firstAwaitEnd, state) {
	const reads = [];
	const bindings = graphBindingMap(state.graph);
	const aliases = semanticAliasMap(state.graph);
	const visit = (candidate) => {
		if (!candidate) return;
		if (candidate.type === "MemberExpression") {
			const read = postAwaitRead(candidate, firstAwaitEnd, state, bindings, aliases);
			if (read) {
				reads.push(read);
				return;
			}
			if (candidate.computed === true) visit(candidate.property);
			return;
		}
		if (candidate.type === "Identifier") {
			const read = postAwaitRead(candidate, firstAwaitEnd, state, bindings, aliases);
			if (read) reads.push(read);
			return;
		}
		for (const child of childNodes(candidate)) visit(child);
	};
	visit(node);
	return uniqueBy(reads, (read) => read.source);
}
function postAwaitRead(node, firstAwaitEnd, state, bindings, aliases) {
	const span = sourceSpan(node, state.filename);
	if (!span || span.start <= firstAwaitEnd) return null;
	const source = expressionSource(node, state.source);
	if (!resolveGraphPath(source, bindings, aliases)) return null;
	return {
		source,
		sourceSpan: span
	};
}
//#endregion
//#region packages/compiler/src/passes/semantic-graph/collect-aliases.ts
function collectDestructuredAliases(id, init, declarationKind, state) {
	if (id?.type !== "ObjectPattern" && id?.type !== "ArrayPattern") return;
	const resolved = resolveGraphPath(expressionSource(init, state.source), graphBindingMap(state.graph), semanticAliasMap(state.graph));
	if (!resolved) return;
	const targetBase = graphPathSource(resolved.binding, resolved.path);
	if (id.type === "ObjectPattern") {
		collectObjectPatternAliases(id, targetBase, declarationKind, state);
		return;
	}
	collectArrayPatternAliases(id, targetBase, declarationKind, state);
}
function collectObjectPatternAliases(pattern, targetBase, declarationKind, state) {
	const excludedPaths = objectPatternExcludedPaths(pattern);
	for (const property of asNodes(pattern.properties)) {
		if (property.type === "RestElement") {
			const local = localAliasIdentifier(property.argument);
			if (!local) continue;
			state.graph.aliases.push({
				name: local.name,
				target: targetBase,
				excludedPaths,
				declarationKind,
				sourceSpan: sourceSpan(local, state.filename)
			});
			continue;
		}
		if (property.type !== "Property") continue;
		const key = objectPropertyKey$1(property.key);
		if (!key) continue;
		const target = `${targetBase}.${key}`;
		const value = property.value;
		const nested = nestedDestructuringPattern(value);
		if (nested?.type === "ObjectPattern") {
			collectObjectPatternAliases(nested, target, declarationKind, state);
			continue;
		}
		if (nested?.type === "ArrayPattern") {
			collectArrayPatternAliases(nested, target, declarationKind, state);
			continue;
		}
		const local = localAliasIdentifier(value);
		if (!local) continue;
		state.graph.aliases.push({
			name: local.name,
			target,
			declarationKind,
			sourceSpan: sourceSpan(local, state.filename)
		});
	}
}
function collectArrayPatternAliases(pattern, targetBase, declarationKind, state) {
	(Array.isArray(pattern.elements) ? pattern.elements : []).forEach((element, index) => {
		if (!isNode(element)) return;
		if (element.type === "RestElement") return;
		const target = `${targetBase}.${index}`;
		const nested = nestedDestructuringPattern(element);
		if (nested?.type === "ObjectPattern") {
			collectObjectPatternAliases(nested, target, declarationKind, state);
			return;
		}
		if (nested?.type === "ArrayPattern") {
			collectArrayPatternAliases(nested, target, declarationKind, state);
			return;
		}
		const local = localAliasIdentifier(element);
		if (!local) return;
		state.graph.aliases.push({
			name: local.name,
			target,
			declarationKind,
			sourceSpan: sourceSpan(local, state.filename)
		});
	});
}
function objectPatternExcludedPaths(pattern) {
	return asNodes(pattern.properties).flatMap((property) => {
		if (property.type !== "Property") return [];
		const key = objectPropertyKey$1(property.key);
		return key ? [[key]] : [];
	});
}
function nestedDestructuringPattern(node) {
	if (!node) return null;
	if (node.type === "ObjectPattern" || node.type === "ArrayPattern") return node;
	if (node.type === "AssignmentPattern") return nestedDestructuringPattern(node.left);
	return null;
}
function localAliasIdentifier(node) {
	if (!node) return null;
	if (typeof node.name === "string") return node;
	if (node.type === "AssignmentPattern") return localAliasIdentifier(node.left);
	return null;
}
function objectPropertyKey$1(node) {
	if (!node) return null;
	if (typeof node.name === "string") return node.name;
	if (typeof node.value === "string" || typeof node.value === "number") return String(node.value);
	return null;
}
//#endregion
//#region packages/compiler/src/passes/semantic-graph/collect-components.ts
function getComponent(node) {
	if (node.type === "FunctionDeclaration") return node;
	if (node.type === "ExportNamedDeclaration") {
		const declaration = node.declaration;
		return declaration?.type === "FunctionDeclaration" ? declaration : null;
	}
	return null;
}
function collectComponentProps(component, state) {
	const firstParam = asNodes(component.params)[0];
	if (!firstParam) return;
	if (firstParam.type === "Identifier") {
		const name = getIdentifierName(firstParam);
		if (!name) return;
		state.graph.graphBindings.push({
			id: `prop:${name}`,
			name,
			kind: "prop",
			declarationKind: "const",
			writable: false,
			valueKind: "object"
		});
		return;
	}
	if (firstParam.type !== "ObjectPattern") return;
	state.graph.graphBindings.push({
		id: "prop:props",
		name: "props",
		kind: "prop",
		declarationKind: "const",
		writable: false,
		valueKind: "object"
	});
	collectObjectPatternAliases(firstParam, "props", "const", state);
}
//#endregion
//#region packages/compiler/src/passes/semantic-graph/collect-expressions.ts
function collectAssignment(node, state) {
	const target = node.left;
	if (!target) return;
	const operator = typeof node.operator === "string" ? node.operator : "=";
	state.graph.stateWrites.push({
		target: expressionSource(target, state.source),
		targetSpan: sourceSpan(target, state.filename),
		operation: "assign",
		assignmentOperator: operator === "=" ? void 0 : operator
	});
}
function collectUpdate(node, state) {
	const target = node.argument;
	if (!target) return;
	state.graph.stateWrites.push({
		target: expressionSource(target, state.source),
		targetSpan: sourceSpan(target, state.filename),
		operation: "update",
		prefix: node.prefix === true,
		updateOperator: node.operator === "--" ? "--" : "++"
	});
}
function collectCollectionCall(node, state) {
	const callee = node.callee;
	if (callee?.type !== "MemberExpression") return;
	const method = getStaticMemberPropertyName(callee);
	if (!method || !isMutatingCollectionMethod(method)) return;
	const target = callee.object;
	if (!target) return;
	state.graph.stateWrites.push({
		target: expressionSource(target, state.source),
		targetSpan: sourceSpan(target, state.filename),
		operation: "call",
		method,
		argumentSources: asNodes(node.arguments).map((argument) => expressionSource(argument, state.source)),
		optional: node.optional === true || callee.optional === true
	});
}
function collectDelete(node, state) {
	if (node.operator !== "delete") return;
	const target = node.argument;
	if (target?.type !== "MemberExpression") return;
	state.graph.stateWrites.push({
		target: expressionSource(target, state.source),
		targetSpan: sourceSpan(target, state.filename),
		operation: "delete",
		optional: target.optional === true
	});
}
function collectExpressionReads(node, state) {
	if (!node) return;
	if (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression" || node.type === "FunctionDeclaration") {
		collectExpressionReads(node.body, state);
		return;
	}
	if (node.type === "AssignmentExpression") {
		if ((typeof node.operator === "string" ? node.operator : "=") !== "=") collectExpressionReads(node.left, state);
		collectExpressionReads(node.right, state);
		return;
	}
	if (node.type === "UpdateExpression") {
		collectExpressionReads(node.argument, state);
		return;
	}
	if (node.type === "UnaryExpression" && node.operator === "delete") {
		collectDeleteComputedPropertyReads(node.argument, state);
		return;
	}
	if (node.type === "CallExpression") {
		const callee = node.callee;
		if (callee?.type === "MemberExpression") {
			const method = getStaticMemberPropertyName(callee);
			if (method && isMutatingCollectionMethod(method)) {
				collectExpressionReads(callee.object, state);
				for (const argument of asNodes(node.arguments)) collectExpressionReads(argument, state);
				return;
			}
		}
	}
	if (node.type === "MemberExpression") {
		addStateRead(node, state);
		if (node.computed === true) collectExpressionReads(node.property, state);
		return;
	}
	if (node.type === "Identifier") {
		addStateRead(node, state);
		return;
	}
	for (const child of childNodes(node)) collectExpressionReads(child, state);
}
function collectDeleteComputedPropertyReads(node, state) {
	if (node?.type !== "MemberExpression") return;
	if (node.computed !== true) return;
	collectExpressionReads(node.property, state);
}
function addStateRead(node, state) {
	const source = expressionSource(node, state.source);
	if (!source) return;
	state.graph.stateReads.push({
		source,
		sourceSpan: sourceSpan(node, state.filename)
	});
}
function getStaticMemberPropertyName(member) {
	const property = member.property;
	if (!property) return null;
	if (member.computed === true) {
		if (typeof property.value === "string" || typeof property.value === "number") return String(property.value);
		return null;
	}
	if (typeof property.name === "string") return property.name;
	if (typeof property.value === "string" || typeof property.value === "number") return String(property.value);
	return null;
}
function isMutatingCollectionMethod(name) {
	return name === "add" || name === "clear" || name === "copyWithin" || name === "delete" || name === "fill" || name === "pop" || name === "push" || name === "reverse" || name === "set" || name === "shift" || name === "sort" || name === "splice" || name === "unshift";
}
//#endregion
//#region packages/compiler/src/passes/semantic-graph/collect-sync-policy.ts
function getHandlerCount(node) {
	if (!node) return 0;
	if (node.type === "ArrayExpression") return asNodes(node.elements).length;
	return 1;
}
function extractSyncPolicy(node, state) {
	for (const handler of handlerExpressions(node)) {
		const eventParam = getIdentifierName(asNodes(handler.params)[0]) ?? "event";
		const policy = extractSyncPolicyFromBody(handler.body, eventParam, state);
		if (policy) return policy;
	}
}
function hasSyncEventPolicyCandidate(node) {
	return firstSyncPolicyActionCall(node) !== null;
}
function firstSyncPolicyActionCall(node) {
	let found = null;
	walkNode(node, (candidate) => {
		if (found) return;
		if (candidate.type !== "CallExpression") return;
		const callee = candidate.callee;
		if (callee?.type !== "MemberExpression") return;
		const propertyName = getStaticPropertyName(callee.property);
		if (propertyName === "preventDefault" || propertyName === "stopPropagation") found = {
			action: propertyName,
			node: candidate
		};
	});
	return found;
}
function handlerExpressions(node) {
	if (!node) return [];
	if (node.type === "ArrayExpression") return asNodes(node.elements);
	return [node];
}
function extractSyncPolicyFromBody(body, eventParam, state) {
	if (!body) return void 0;
	const statements = body.type === "BlockStatement" ? asNodes(body.body) : [body];
	for (const statement of statements) {
		if (statement.type !== "IfStatement") continue;
		const actions = extractSyncActions(statement.consequent, eventParam);
		if (actions.length === 0) continue;
		const when = extractSyncCondition(statement.test, eventParam, state);
		if (!when) continue;
		return {
			when,
			actions
		};
	}
}
function extractSyncActions(node, eventParam) {
	const actions = [];
	walkNode(node, (candidate) => {
		if (candidate.type !== "CallExpression") return;
		const callee = candidate.callee;
		if (callee?.type !== "MemberExpression") return;
		if (getIdentifierName(callee.object) !== eventParam) return;
		const propertyName = getStaticPropertyName(callee.property);
		if (propertyName === "preventDefault" || propertyName === "stopPropagation") actions.push(propertyName);
	});
	return uniqueBy(actions, (action) => action);
}
function extractSyncCondition(node, eventParam, state) {
	if (!node) return void 0;
	if (node.type === "LogicalExpression") {
		const operator = typeof node.operator === "string" ? node.operator : "";
		const left = extractSyncCondition(node.left, eventParam, state);
		const right = extractSyncCondition(node.right, eventParam, state);
		if (!left || !right) return void 0;
		if (operator === "&&") return {
			type: "and",
			conditions: flattenSyncConditions("and", [left, right])
		};
		if (operator === "||") return {
			type: "or",
			conditions: flattenSyncConditions("or", [left, right])
		};
		return;
	}
	if (node.type === "BinaryExpression") {
		const operator = typeof node.operator === "string" ? node.operator : "";
		if (operator !== "===" && operator !== "==") return void 0;
		const leftField = eventFieldName(node.left, eventParam);
		const rightValue = literalValue(node.right);
		if (leftField && rightValue.ok) return {
			type: "event-equals",
			field: leftField,
			value: rightValue.value
		};
		const rightField = eventFieldName(node.right, eventParam);
		const leftValue = literalValue(node.left);
		if (rightField && leftValue.ok) return {
			type: "event-equals",
			field: rightField,
			value: leftValue.value
		};
		return;
	}
	if (node.type === "UnaryExpression") {
		if ((typeof node.operator === "string" ? node.operator : "") !== "!") return void 0;
		const condition = extractSyncCondition(node.argument, eventParam, state);
		if (!condition) return void 0;
		return {
			type: "not",
			condition
		};
	}
	const resolved = resolveGraphPath(expressionSource(node, state.source), graphBindingMap(state.graph), semanticAliasMap(state.graph));
	if (!resolved) return void 0;
	return {
		type: "graph-truthy",
		bindingId: resolved.binding.id,
		path: resolved.path
	};
}
function flattenSyncConditions(type, conditions) {
	return conditions.flatMap((condition) => {
		if (condition.type === type) return condition.conditions;
		return [condition];
	});
}
function eventFieldName(node, eventParam) {
	if (node?.type !== "MemberExpression") return null;
	if (getIdentifierName(node.object) !== eventParam) return null;
	return getStaticPropertyName(node.property);
}
function literalValue(node) {
	if (node?.type !== "Literal") return { ok: false };
	return {
		ok: true,
		value: node.value
	};
}
function getStaticPropertyName(node) {
	if (!node) return null;
	if (typeof node.name === "string") return node.name;
	if (typeof node.value === "string" || typeof node.value === "number") return String(node.value);
	return null;
}
//#endregion
//#region packages/compiler/src/passes/semantic-graph/collect-elements.ts
function collectElement(node, state, walk) {
	const tagName = getElementTagName(node);
	const previousHost = state.currentHostNodeId;
	const isHostElement = tagName ? isHostTagName(tagName) : false;
	let hostNodeId = previousHost;
	if (tagName && isHostElement) {
		hostNodeId = `h${state.nextHostId++}`;
		state.hostIds.set(node, hostNodeId);
		state.graph.hostNodes.push({
			id: hostNodeId,
			tagName
		});
		state.currentHostNodeId = hostNodeId;
	}
	for (const attribute of asNodes(node.attributes)) collectAttribute(attribute, state, walk, isHostElement ? hostNodeId : null, tagName, isHostElement);
	for (const child of asNodes(node.children)) walk(child, state);
	state.currentHostNodeId = previousHost;
}
function collectTemplateExpression(node, state) {
	if (!state.currentHostNodeId) return;
	const expression = node.expression;
	if (!expression) return;
	state.graph.templateReads.push({
		hostNodeId: state.currentHostNodeId,
		source: expressionSource(expression, state.source),
		sourceSpan: sourceSpan(expression, state.filename),
		asyncBoundaryId: state.currentAsyncBoundaryId ?? void 0
	});
}
function collectElementHandleDiagnostics(graph) {
	const bindings = graphBindingMap(graph);
	const validElementHandleBindings = [];
	for (const binding of graph.elementHandleBindings) {
		const graphBinding = bindings.get(binding.handleName);
		if (!graphBinding || graphBinding.kind !== "element") {
			graph.diagnostics.push(elementHandleRequiredDiagnostic(binding, graphBinding));
			continue;
		}
		validElementHandleBindings.push(binding);
	}
	const firstBindingByHandle = /* @__PURE__ */ new Map();
	for (const binding of validElementHandleBindings) {
		if (!firstBindingByHandle.has(binding.handleName)) {
			firstBindingByHandle.set(binding.handleName, binding);
			continue;
		}
		graph.diagnostics.push(duplicateElementHandleDiagnostic(binding));
	}
}
function collectAttribute(attribute, state, walk, hostNodeId, ownerTagName, isHostElement) {
	const attributeName = getIdentifierName(attribute.name);
	if (!attributeName) return;
	const value = attribute.value;
	if (attributeName === "use" && !isHostElement) {
		if (value) {
			state.graph.diagnostics.push(useHostElementRequiredDiagnostic(ownerTagName, value, state));
			collectExpressionReads(value, state);
			walk(value, state);
		}
		return;
	}
	if (!hostNodeId) return;
	if (is_event_attribute(attributeName)) {
		const handlerSources = eventHandlerExpressions(value).map((handler) => expressionSource(handler, state.source));
		const syncPolicy = extractSyncPolicy(value, state);
		const hasSyncPolicyCandidate = hasSyncEventPolicyCandidate(value);
		if (hasSyncPolicyCandidate && !syncPolicy) state.graph.diagnostics.push(unextractableSyncPolicyDiagnostic(attributeName, value, state));
		state.graph.events.push({
			id: `event:${state.nextEventId++}`,
			hostNodeId,
			eventName: normalize_event_name(attributeName),
			handlerCount: getHandlerCount(value),
			handlerSources,
			hasSyncPolicyCandidate,
			syncPolicy
		});
		collectExpressionReads(value, state);
		walk(value, state);
		return;
	}
	if (attributeName === "use") {
		if (value) {
			for (const behavior of behaviorExpressions(value)) state.graph.behaviors.push({
				hostNodeId,
				source: expressionSource(behavior, state.source)
			});
			collectExpressionReads(value, state);
			walk(value, state);
		}
		return;
	}
	if (attributeName === "el") {
		if (value) state.graph.elementHandleBindings.push({
			hostNodeId,
			handleName: expressionSource(value, state.source),
			sourceSpan: sourceSpan(value, state.filename)
		});
		return;
	}
	if (value && value.type !== "Literal") {
		state.graph.templateReads.push({
			hostNodeId,
			source: expressionSource(value, state.source),
			sourceSpan: sourceSpan(value, state.filename),
			asyncBoundaryId: state.currentAsyncBoundaryId ?? void 0
		});
		walk(value, state);
	}
}
function unextractableSyncPolicyDiagnostic(attributeName, value, state) {
	const actionCall = firstSyncPolicyActionCall(value);
	return {
		code: "AA_SYNC_POLICY_UNEXTRACTABLE",
		severity: "error",
		phase: "sync-policy",
		title: "Cannot extract synchronous event policy",
		message: `Cannot extract a synchronous ${actionCall?.action ?? "preventDefault/stopPropagation"} policy for ${attributeName} because the guard is not limited to graph state, event fields, props, and constants.`,
		why: "preventDefault() and stopPropagation() must run before lazy handler symbols load. The compiler can only emit a synchronous policy when the condition is fully represented in the resumable graph/event data plane.",
		primarySpan: (actionCall ? sourceSpan(actionCall.node, state.filename) : void 0) ?? (value ? sourceSpan(value, state.filename) : void 0) ?? fallbackSpan$1(state.filename),
		passId: "tsrx-semantic-graph",
		artifactKeys: ["semanticGraph"],
		suggestions: [{ message: "Move the browser-critical condition into graph state and simple event-field comparisons, or remove preventDefault()/stopPropagation() from the lazy handler." }],
		docsUrl: "https://async.await.dev/errors/AA_SYNC_POLICY_UNEXTRACTABLE"
	};
}
function fallbackSpan$1(filename) {
	return {
		filename,
		start: 0,
		end: 0
	};
}
function getElementTagName(node) {
	return getIdentifierName(node.id) ?? getIdentifierName(node.openingElement?.name);
}
function isHostTagName(name) {
	return name.length > 0 && name[0] === name[0].toLowerCase();
}
function behaviorExpressions(node) {
	if (node.type === "ArrayExpression") return asNodes(node.elements);
	return [node];
}
function eventHandlerExpressions(node) {
	if (!node) return [];
	if (node.type === "ArrayExpression") return asNodes(node.elements);
	return [node];
}
//#endregion
//#region packages/compiler/src/passes/semantic-graph/collect-module-scope.ts
function collectModuleScopeGraphCreation(statement, graph, source, filename) {
	const declaration = moduleScopeVariableDeclaration(statement);
	if (!declaration) return;
	for (const declarator of asNodes(declaration.declarations)) {
		const id = declarator.id;
		const init = declarator.init;
		const callName = getCallName$1(init);
		if (callName !== "state" && callName !== "computed") continue;
		graph.diagnostics.push(moduleScopeGraphCreationDiagnostic(moduleScopeDeclarationName(id, source), callName, init, filename));
	}
}
function moduleScopeVariableDeclaration(statement) {
	if (statement.type === "VariableDeclaration") return statement;
	if (statement.type === "ExportNamedDeclaration") {
		const declaration = statement.declaration;
		return declaration?.type === "VariableDeclaration" ? declaration : null;
	}
	return null;
}
function moduleScopeDeclarationName(node, source) {
	return getIdentifierName(node) ?? expressionSourceOrFallback(node, source, "graph binding");
}
function getCallName$1(node) {
	if (node?.type !== "CallExpression") return null;
	return getIdentifierName(node.callee);
}
//#endregion
//#region packages/compiler/src/passes/semantic-graph/collect-state.ts
function collectVariableDeclaration(node, state) {
	const declarationKind = variableDeclarationKind(node);
	for (const declaration of asNodes(node.declarations)) {
		const id = declaration.id;
		const init = declaration.init;
		if (init) {
			collectDestructuredAliases(id, init, declarationKind, state);
			collectUnsupportedDestructuredLocalBindings(id, init, declarationKind, state);
		}
		const name = getIdentifierName(id);
		const callName = getCallName(init);
		if (!name || !init) continue;
		const localBindingAlias = aliasedLocalBinding(init, state);
		if (localBindingAlias) state.graph.localBindings.push({
			name,
			kind: localBindingAlias.kind,
			declarationKind,
			sourceSpan: sourceSpan(id, state.filename)
		});
		if (isFunctionValue(init)) state.graph.localBindings.push({
			name,
			kind: "function",
			declarationKind,
			sourceSpan: sourceSpan(id, state.filename)
		});
		if (isClassInstanceValue(init)) state.graph.localBindings.push({
			name,
			kind: "class-instance",
			declarationKind,
			sourceSpan: sourceSpan(id, state.filename)
		});
		if (isDomNodeValue(init)) state.graph.localBindings.push({
			name,
			kind: "dom-node",
			declarationKind,
			sourceSpan: sourceSpan(id, state.filename)
		});
		if (isNonSerializableConstantValue(init, state)) state.graph.localBindings.push({
			name,
			kind: "non-serializable-constant",
			declarationKind,
			sourceSpan: sourceSpan(id, state.filename)
		});
		if (callName === "state") {
			const initial = firstArgument(init);
			state.graph.graphBindings.push({
				id: `state:${name}`,
				name,
				kind: "state",
				declarationKind,
				writable: true,
				valueKind: initialValueKind(initial),
				initialValue: evaluateInitialStateValue(initial)
			});
		}
		if (callName === "computed") {
			const body = firstArgument(init);
			const isAsync = body?.async === true;
			const dependencies = collectGraphDependencies(body, state);
			state.graph.graphBindings.push({
				id: `computed:${name}`,
				name,
				kind: "computed",
				declarationKind,
				writable: false,
				async: isAsync,
				asyncCapable: isAsync,
				dependencies
			});
			collectExpressionReads(body, state);
			if (isAsync) collectAsyncComputedPostAwaitReads(name, body, state);
		}
		if (callName === "element") state.graph.graphBindings.push({
			id: `element:${name}`,
			name,
			kind: "element",
			declarationKind,
			writable: false
		});
	}
}
function collectUnsupportedDestructuredLocalBindings(id, init, declarationKind, state) {
	if (id?.type !== "ObjectPattern" && id?.type !== "ArrayPattern") return;
	const binding = aliasedLocalBinding(init, state);
	if (binding) {
		for (const local of bindingPatternIdentifiers(id)) state.graph.localBindings.push({
			name: local.name,
			kind: binding.kind,
			declarationKind,
			sourceSpan: sourceSpan(local, state.filename)
		});
		return;
	}
	collectUnsupportedInlineDestructuredLocalBindings(id, init, declarationKind, state);
}
function collectUnsupportedInlineDestructuredLocalBindings(pattern, value, declarationKind, state) {
	if (!pattern || !value) return;
	if (typeof pattern.name === "string") {
		const kind = unsupportedLocalBindingKind(value, state);
		if (!kind) return;
		state.graph.localBindings.push({
			name: pattern.name,
			kind,
			declarationKind,
			sourceSpan: sourceSpan(pattern, state.filename)
		});
		return;
	}
	if (pattern.type === "ObjectPattern" && value.type === "ObjectExpression") {
		collectUnsupportedObjectPatternValueBindings(pattern, value, declarationKind, state);
		return;
	}
	if (pattern.type === "ArrayPattern" && value.type === "ArrayExpression") {
		const elements = asNodes(value.elements);
		asNodes(pattern.elements).forEach((element, index) => {
			collectUnsupportedInlineDestructuredLocalBindings(element, elements[index], declarationKind, state);
		});
		return;
	}
	if (pattern.type === "AssignmentPattern") {
		const left = pattern.left;
		const fallback = pattern.right;
		collectUnsupportedInlineDestructuredLocalBindings(left, unsupportedLocalBindingKind(value, state) ? value : fallback, declarationKind, state);
	}
}
function collectUnsupportedObjectPatternValueBindings(pattern, value, declarationKind, state) {
	for (const property of asNodes(pattern.properties)) {
		if (property.type !== "Property") continue;
		const key = objectPropertyKey(property.key);
		if (!key) continue;
		collectUnsupportedInlineDestructuredLocalBindings(property.value, objectExpressionPropertyValue(value, key), declarationKind, state);
	}
}
function objectExpressionPropertyValue(node, key) {
	for (const property of asNodes(node.properties)) {
		if (property.type !== "Property") continue;
		if (objectPropertyKey(property.key) !== key) continue;
		return property.value;
	}
}
function unsupportedLocalBindingKind(node, state) {
	const binding = aliasedLocalBinding(node, state);
	if (binding) return binding.kind;
	if (isFunctionValue(node)) return "function";
	if (isClassInstanceValue(node)) return "class-instance";
	if (isDomNodeValue(node)) return "dom-node";
	if (isNonSerializableConstantValue(node, state)) return "non-serializable-constant";
	return null;
}
function bindingPatternIdentifiers(node) {
	if (!node) return [];
	if (typeof node.name === "string") return [node];
	if (node.type === "ObjectPattern") return asNodes(node.properties).flatMap((property) => {
		if (property.type === "RestElement") return bindingPatternIdentifiers(property.argument);
		if (property.type !== "Property") return [];
		return bindingPatternIdentifiers(property.value);
	});
	if (node.type === "ArrayPattern") return asNodes(node.elements).flatMap((element) => bindingPatternIdentifiers(element));
	if (node.type === "RestElement") return bindingPatternIdentifiers(node.argument);
	if (node.type === "AssignmentPattern") return bindingPatternIdentifiers(node.left);
	return [];
}
function aliasedLocalBinding(node, state) {
	const name = localBindingReferenceName(node);
	if (!name) return null;
	for (let index = state.graph.localBindings.length - 1; index >= 0; index--) {
		const binding = state.graph.localBindings[index];
		if (binding?.name === name) return binding;
	}
	return null;
}
function localBindingReferenceName(node) {
	const name = getIdentifierName(node);
	if (!name) return null;
	return name.startsWith("...") ? name.slice(3) : name;
}
function isFunctionValue(node) {
	return node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression";
}
function isClassInstanceValue(node) {
	const constructorName = getNewConstructorName(node);
	if (constructorName) return !isSerializableBuiltInConstructorName(constructorName);
	return false;
}
function getNewConstructorName(node) {
	if (node.type === "NewExpression") return getIdentifierName(node.callee);
	if (node.type !== "CallExpression") return null;
	const calleeName = getIdentifierName(node.callee);
	if (typeof calleeName !== "string" || !calleeName.startsWith("new ")) return null;
	return calleeName.slice(4);
}
function isSerializableBuiltInConstructorName(name) {
	return name === "Date" || name === "RegExp" || name === "Map" || name === "Set" || name === "URL" || name === "ArrayBuffer" || name === "Int8Array" || name === "Uint8Array" || name === "Uint8ClampedArray" || name === "Int16Array" || name === "Uint16Array" || name === "Int32Array" || name === "Uint32Array" || name === "Float32Array" || name === "Float64Array" || name === "BigInt64Array" || name === "BigUint64Array";
}
function isDomNodeValue(node) {
	if (node.type !== "CallExpression") return false;
	const callee = node.callee;
	if (callee?.type !== "MemberExpression") return false;
	const objectName = getIdentifierName(callee.object);
	const propertyName = getIdentifierName(callee.property);
	return objectName === "document" && (propertyName === "querySelector" || propertyName === "getElementById" || propertyName === "createElement");
}
function isNonSerializableConstantValue(node, state) {
	if (isSerializableBuiltInConstructorName(getNewConstructorName(node))) return asNodes(node.arguments).some((argument) => containsNonSerializableConstantValue(argument, state));
	if (node.type === "ObjectExpression") return asNodes(node.properties).some((property) => {
		if (property.type === "SpreadElement") return containsNonSerializableConstantValue(property.argument, state);
		if (property.type !== "Property") return false;
		return containsNonSerializableConstantValue(property.value, state);
	});
	if (node.type === "ArrayExpression") return asNodes(node.elements).some((element) => containsNonSerializableConstantValue(element, state));
	return false;
}
function containsNonSerializableConstantValue(node, state) {
	if (!node) return false;
	if (node.type === "SpreadElement") return containsNonSerializableConstantValue(node.argument, state);
	if (aliasedLocalBinding(node, state)) return true;
	if (isFunctionValue(node) || isClassInstanceValue(node) || isDomNodeValue(node)) return true;
	return isNonSerializableConstantValue(node, state);
}
function getCallName(node) {
	if (node?.type !== "CallExpression") return null;
	return getIdentifierName(node.callee);
}
function variableDeclarationKind(node) {
	if (node.kind === "const" || node.kind === "let" || node.kind === "var") return node.kind;
}
function firstArgument(node) {
	return asNodes(node.arguments)[0];
}
function initialValueKind(node) {
	if (!node) return "unknown";
	if (node.type === "ObjectExpression") return "object";
	if (node.type === "ArrayExpression") return "array";
	if (node.type === "Literal") return "scalar";
	return "unknown";
}
function evaluateInitialStateValue(node) {
	if (!node) return void 0;
	if (node.type === "Literal") return node.value;
	if (node.type === "ObjectExpression") return evaluateObjectExpression(node);
	if (node.type === "ArrayExpression") return asNodes(node.elements).map(evaluateInitialStateValue);
	if (node.type === "UnaryExpression") {
		const argument = evaluateInitialStateValue(node.argument);
		if (node.operator === "-") return -Number(argument);
		if (node.operator === "+") return Number(argument);
		if (node.operator === "!") return !argument;
	}
}
function evaluateObjectExpression(node) {
	const output = {};
	for (const property of asNodes(node.properties)) {
		if (property.type !== "Property") continue;
		const key = objectPropertyKey(property.key);
		if (!key) continue;
		output[key] = evaluateInitialStateValue(property.value);
	}
	return output;
}
function objectPropertyKey(node) {
	if (!node) return null;
	if (typeof node.name === "string") return node.name;
	if (typeof node.value === "string" || typeof node.value === "number") return String(node.value);
	return null;
}
//#endregion
//#region packages/compiler/src/passes/semantic-graph/types.ts
function createMutableSemanticGraphArtifact(filename) {
	return {
		passId: "tsrx-semantic-graph",
		filename,
		components: [],
		graphBindings: [],
		hostNodes: [],
		events: [],
		behaviors: [],
		elementHandleBindings: [],
		localBindings: [],
		aliases: [],
		stateReads: [],
		templateReads: [],
		stateWrites: [],
		asyncBoundaries: [],
		diagnostics: []
	};
}
function createWalkState(input) {
	return {
		filename: input.filename,
		source: input.source,
		graph: input.graph,
		hostIds: /* @__PURE__ */ new WeakMap(),
		currentHostNodeId: null,
		currentAsyncBoundaryId: null,
		nextHostId: 0,
		nextEventId: 0,
		nextBoundaryId: 0
	};
}
//#endregion
//#region packages/compiler/src/passes/semantic-graph/index.ts
async function buildSemanticGraph(input) {
	const ast = parse_module(input.source, input.filename);
	const graph = createMutableSemanticGraphArtifact(input.filename);
	const state = createWalkState({
		filename: input.filename,
		source: input.source,
		graph
	});
	for (const statement of asNodes(ast.body)) {
		collectModuleScopeGraphCreation(statement, graph, input.source, input.filename);
		const component = getComponent(statement);
		const name = getIdentifierName(component?.id);
		if (!component || !name) continue;
		graph.components.push({ name });
		collectComponentProps(component, state);
		walk(component.body, state);
	}
	propagateAsyncComputedCapability(graph);
	collectElementHandleDiagnostics(graph);
	collectAsyncBoundaryDiagnostics(graph);
	return graph;
}
function walk(node, state) {
	if (!node || typeof node !== "object") return;
	switch (node.type) {
		case "Element":
			collectElement(node, state, walk);
			return;
		case "TSRXExpression":
			collectTemplateExpression(node, state);
			break;
		case "VariableDeclaration":
			collectVariableDeclaration(node, state);
			break;
		case "AssignmentExpression":
			collectAssignment(node, state);
			collectExpressionReads(node, state);
			return;
		case "UpdateExpression":
			collectUpdate(node, state);
			collectExpressionReads(node.argument, state);
			return;
		case "UnaryExpression":
			if (node.operator === "delete") {
				collectDelete(node, state);
				collectExpressionReads(node, state);
				return;
			}
			break;
		case "CallExpression":
			collectCollectionCall(node, state);
			break;
		case "TryStatement":
			collectAsyncBoundary(node, state, walk);
			return;
	}
	for (const child of childNodes(node)) walk(child, state);
}
//#endregion
//#region packages/compiler/src/passes/state-lowering.ts
function lowerStateAccess(input) {
	const bindings = /* @__PURE__ */ new Map();
	const aliases = semanticAliasMap(input.semanticGraph);
	const reads = [];
	const writes = [];
	const diagnostics = [];
	for (const binding of input.semanticGraph.graphBindings) bindings.set(binding.name, binding);
	for (const read of input.semanticGraph.templateReads) {
		const resolved = resolveGraphPath(read.source, bindings, aliases);
		if (!resolved) {
			if (isDynamicGraphPathSource(read.source, bindings, aliases)) diagnostics.push(dynamicGraphPathReadDiagnostic(read.source, read.sourceSpan, input.semanticGraph.filename));
			continue;
		}
		reads.push({
			source: read.source,
			bindingId: resolved.binding.id,
			path: resolved.path
		});
	}
	for (const read of input.semanticGraph.stateReads) {
		const resolved = resolveGraphPath(read.source, bindings, aliases);
		if (!resolved) {
			if (isDynamicGraphPathSource(read.source, bindings, aliases)) diagnostics.push(dynamicGraphPathReadDiagnostic(read.source, read.sourceSpan, input.semanticGraph.filename));
			continue;
		}
		reads.push({
			source: read.source,
			bindingId: resolved.binding.id,
			path: resolved.path
		});
	}
	for (const write of input.semanticGraph.stateWrites) {
		if (write.optional === true) {
			diagnostics.push(optionalChainWriteDiagnostic(write, input.semanticGraph.filename));
			continue;
		}
		const resolved = resolveGraphPath(write.target, bindings, aliases);
		if (!resolved) {
			const excludedAliasPath = findRestAliasExcludedPath(write.target, aliases);
			if (excludedAliasPath) {
				diagnostics.push(restAliasExcludedPathDiagnostic({
					source: write.target,
					sourceSpan: write.targetSpan,
					filename: input.semanticGraph.filename,
					excludedAliasPath
				}));
				continue;
			}
			if (isDynamicGraphPathSource(write.target, bindings, aliases)) {
				diagnostics.push(dynamicGraphPathWriteDiagnostic(write, input.semanticGraph.filename));
				continue;
			}
			diagnostics.push(unresolvedWriteDiagnostic(write, input.semanticGraph.filename));
			continue;
		}
		if (!resolved.binding.writable) {
			diagnostics.push(readOnlyWriteDiagnostic(write, resolved.binding));
			continue;
		}
		if (isConstAliasReassignment(write, aliases)) {
			diagnostics.push(constBindingReassignmentDiagnostic(write));
			continue;
		}
		if (isConstBindingReassignment(write, resolved.binding, resolved.path)) {
			diagnostics.push(constBindingReassignmentDiagnostic(write));
			continue;
		}
		writes.push({
			source: write.target,
			bindingId: resolved.binding.id,
			path: resolved.path,
			operation: write.operation,
			assignmentOperator: write.assignmentOperator,
			prefix: write.prefix,
			updateOperator: write.updateOperator,
			method: write.method,
			argumentSources: write.argumentSources
		});
	}
	return {
		passId: "state-lowering",
		reads: uniqueBy(reads, (read) => `${read.bindingId}:${read.path.join(".")}:${read.source}`),
		writes,
		diagnostics
	};
}
function unresolvedWriteDiagnostic(write, filename) {
	return {
		code: "AA_STATE_UNRESOLVED_WRITE",
		severity: "error",
		phase: "state-lowering",
		title: "Cannot resolve graph write target",
		message: `Cannot write to "${write.target}" because it does not resolve to graph state.`,
		why: "Only state() bindings and supported graph paths can be mutated across a resume boundary.",
		primarySpan: write.targetSpan ?? fallbackSpan(filename),
		passId: "state-lowering",
		artifactKeys: ["semanticGraph", "stateLowering"],
		statePath: write.target,
		source: write.target,
		suggestions: [{ message: "Write to a state() binding, a path inside object state, or move non-graph mutation into normal local code." }],
		docsUrl: "https://async.await.dev/errors/AA_STATE_UNRESOLVED_WRITE"
	};
}
function dynamicGraphPathReadDiagnostic(source, sourceSpan, filename) {
	return {
		code: "AA_STATE_DYNAMIC_PATH_READ",
		severity: "error",
		phase: "state-lowering",
		title: "Cannot read from a dynamic graph path",
		message: `Cannot read "${source}" because graph read paths must be statically resolvable.`,
		why: "The resumable state graph records path-level subscriptions in the payload. A dynamic property expression cannot be represented as a stable graph subscription by the current compiler pass.",
		primarySpan: sourceSpan ?? fallbackSpan(filename),
		passId: "state-lowering",
		artifactKeys: ["semanticGraph", "stateLowering"],
		statePath: source,
		source,
		suggestions: [{ message: "Use a statically named property path, a literal array index, or model the dynamic lookup as a computed() with explicit compiler support." }],
		docsUrl: "https://async.await.dev/errors/AA_STATE_DYNAMIC_PATH_READ"
	};
}
function dynamicGraphPathWriteDiagnostic(write, filename) {
	return {
		code: "AA_STATE_DYNAMIC_PATH_WRITE",
		severity: "error",
		phase: "state-lowering",
		title: "Cannot write to a dynamic graph path",
		message: `Cannot write to "${write.target}" because graph write paths must be statically resolvable.`,
		why: "The resumable state graph records path-level writes in the payload and runtime journal. A dynamic property expression cannot be represented as a stable graph path by the current compiler pass.",
		primarySpan: write.targetSpan ?? fallbackSpan(filename),
		passId: "state-lowering",
		artifactKeys: ["semanticGraph", "stateLowering"],
		statePath: write.target,
		source: write.target,
		suggestions: [{ message: "Use a statically named property path, a literal array index, or a collection method with compiler coverage for this state update." }],
		docsUrl: "https://async.await.dev/errors/AA_STATE_DYNAMIC_PATH_WRITE"
	};
}
function optionalChainWriteDiagnostic(write, filename) {
	return {
		code: "AA_STATE_OPTIONAL_CHAIN_WRITE",
		severity: "error",
		phase: "state-lowering",
		title: "Cannot write graph state through optional chaining",
		message: `Cannot write to "${write.target}" through optional chaining because graph writes must have definite targets.`,
		why: "Optional chaining can skip the method call and its arguments at runtime. The current graph write artifact cannot preserve that short-circuit behavior safely across resume.",
		primarySpan: write.targetSpan ?? fallbackSpan(filename),
		passId: "state-lowering",
		artifactKeys: ["semanticGraph", "stateLowering"],
		statePath: write.target,
		source: write.target,
		suggestions: [{ message: "Guard explicitly before mutating graph state, or initialize the state path so the collection method call always has a definite target." }],
		docsUrl: "https://async.await.dev/errors/AA_STATE_OPTIONAL_CHAIN_WRITE"
	};
}
function restAliasExcludedPathDiagnostic({ source, sourceSpan, filename, excludedAliasPath }) {
	return {
		code: "AA_STATE_REST_ALIAS_EXCLUDED_PATH",
		severity: "error",
		phase: "state-lowering",
		title: "Cannot write through an object-rest excluded path",
		message: `Cannot write to "${source}" because "${excludedAliasPath.excludedPath.join(".")}" was excluded when "${excludedAliasPath.aliasName}" was created.`,
		why: "Object rest destructuring creates an alias for the remaining graph paths only. Paths explicitly destructured out of the source object are not owned by the rest alias.",
		primarySpan: sourceSpan ?? fallbackSpan(filename),
		passId: "state-lowering",
		artifactKeys: ["semanticGraph", "stateLowering"],
		statePath: source,
		source,
		suggestions: [{ message: "Write through the original graph path, or use the explicit destructured alias for the excluded property." }],
		docsUrl: "https://async.await.dev/errors/AA_STATE_REST_ALIAS_EXCLUDED_PATH"
	};
}
function readOnlyWriteDiagnostic(write, binding) {
	const details = readOnlyWriteDetails(binding);
	return {
		code: "AA_STATE_READ_ONLY_WRITE",
		severity: "error",
		phase: "state-lowering",
		title: "Cannot write to a read-only graph binding",
		message: `Cannot write to "${write.target}" because ${details.bindingLabel} are read-only.`,
		why: details.why,
		primarySpan: write.targetSpan,
		passId: "state-lowering",
		artifactKeys: ["semanticGraph", "stateLowering"],
		statePath: write.target,
		source: write.target,
		suggestions: [{ message: details.suggestion }],
		docsUrl: "https://async.await.dev/errors/AA_STATE_READ_ONLY_WRITE"
	};
}
function readOnlyWriteDetails(binding) {
	if (binding.kind === "computed") return {
		bindingLabel: "computed() values",
		why: "computed() creates derived graph state. Mutating it would make the serialized graph ambiguous after resume.",
		suggestion: "Write to the source state that the computed value derives from, or make a separate state() value for mutable data."
	};
	if (binding.kind === "prop") return {
		bindingLabel: "prop bindings",
		why: "Props are owned by the parent graph projection. Mutating a child prop binding would create resume state that has no stable owner.",
		suggestion: "Write to state owned by the parent graph, or pass an event handler/shared graph method that performs the update at the owner."
	};
	return {
		bindingLabel: `${binding.kind} bindings`,
		why: "This graph binding is read-only in the current compiler pass, so mutating it would create resume state the runtime cannot own safely.",
		suggestion: "Write to a state() binding or a writable path inside object state instead."
	};
}
function isConstBindingReassignment(write, binding, path) {
	if (binding.kind !== "state" || binding.declarationKind !== "const") return false;
	if (path.length > 0) return false;
	return write.operation === "assign" || write.operation === "update";
}
function isConstAliasReassignment(write, aliases) {
	if (write.operation !== "assign" && write.operation !== "update") return false;
	const segments = splitStaticGraphPath(write.target);
	if (segments.length !== 1) return false;
	return aliases.get(segments[0])?.declarationKind === "const";
}
function isDynamicGraphPathSource(source, bindings, aliases) {
	if (!hasDynamicBracketSegment(source)) return false;
	const root = graphPathRoot(source);
	if (!root) return false;
	return resolveGraphPath(root, bindings, aliases) !== null;
}
function findRestAliasExcludedPath(source, aliases) {
	const segments = splitStaticGraphPath(source);
	if (segments.length < 2) return null;
	const aliasName = segments[0];
	const alias = aliases.get(aliasName);
	if (!alias?.excludedPaths) return null;
	const requestedPath = segments.slice(1);
	const excludedPath = alias.excludedPaths.find((path) => pathStartsWith(requestedPath, path));
	if (!excludedPath) return null;
	return {
		aliasName,
		excludedPath
	};
}
function pathStartsWith(path, prefix) {
	if (prefix.length > path.length) return false;
	return prefix.every((segment, index) => segment === path[index]);
}
function graphPathRoot(source) {
	return /^\s*([$A-Z_a-z][$\w]*)/.exec(source)?.[1] ?? null;
}
function hasDynamicBracketSegment(source) {
	let index = 0;
	while (index < source.length) {
		const open = source.indexOf("[", index);
		if (open === -1) return false;
		const close = source.indexOf("]", open + 1);
		if (close === -1) return true;
		if (!isStaticBracketSegment(source.slice(open + 1, close).trim())) return true;
		index = close + 1;
	}
	return false;
}
function isStaticBracketSegment(segment) {
	if (/^\d+$/.test(segment)) return true;
	if (segment.length < 2) return false;
	const quote = segment[0];
	return (quote === "\"" || quote === "'") && segment[segment.length - 1] === quote;
}
function constBindingReassignmentDiagnostic(write) {
	return {
		code: "AA_STATE_CONST_REASSIGNMENT",
		severity: "error",
		phase: "state-lowering",
		title: "Cannot reassign a const graph binding",
		message: `Cannot update "${write.target}" because it was declared with const. JavaScript const binding semantics are preserved for state().`,
		why: "state() removes marker syntax, but it does not change JavaScript binding rules. A const binding cannot be reassigned during resume or initial render.",
		primarySpan: write.targetSpan,
		passId: "state-lowering",
		artifactKeys: ["semanticGraph", "stateLowering"],
		statePath: write.target,
		source: write.target,
		suggestions: [{ message: "Use let for scalar state you reassign, or mutate a property path on object state such as menu.open." }],
		docsUrl: "https://async.await.dev/errors/AA_STATE_CONST_REASSIGNMENT"
	};
}
function fallbackSpan(filename) {
	return {
		filename,
		start: 0,
		end: 0
	};
}
//#endregion
//#region packages/compiler/src/passes/symbol-resolver-module.ts
function createSymbolResolverModuleManifest(input) {
	return {
		protocolVersion: 1,
		buildId: input.buildId ?? null,
		resolverId: input.resolverId ?? null,
		symbols: input.symbols
	};
}
function emitSymbolResolverModule(input) {
	const manifest = createSymbolResolverModuleManifest(input);
	const cases = input.symbols.map((symbol) => {
		const exportAccess = isIdentifier(symbol.exportName) ? `mod.${symbol.exportName}` : `mod[${JSON.stringify(symbol.exportName)}]`;
		return [
			`		case ${JSON.stringify(symbol.id)}:`,
			`			return import(${JSON.stringify(symbol.chunk)})`,
			`				.then((mod) => ${exportAccess});`
		].join("\n");
	});
	return [
		"export const symbolManifest = ",
		JSON.stringify(manifest),
		";",
		"",
		"export async function loadSymbol(id) {",
		"	switch (id) {",
		...cases,
		"		default:",
		"			throw createUnknownSymbolError(id);",
		"	}",
		"}",
		"",
		"function createUnknownSymbolError(id) {",
		"	return Object.assign(new Error(`Unknown async symbol ${id}`), {",
		"		code: \"AA_SYMBOL_UNKNOWN\",",
		"		phase: \"resume\",",
		"		symbolId: String(id),",
		"		docsUrl: \"https://async.await.dev/errors/AA_SYMBOL_UNKNOWN\",",
		"	});",
		"}",
		""
	].join("\n");
}
function isIdentifier(value) {
	return /^[$A-Z_a-z][$\w]*$/.test(value);
}
//#endregion
//#region packages/compiler/src/passes/symbol-resolver.ts
function planSymbolResolver(input) {
	const symbols = [];
	let nextSymbolId = 0;
	for (const event of input.payloadArena.view.events) for (let order = 0; order < event.handlerCount; order++) symbols.push({
		id: `symbol:${nextSymbolId++}`,
		kind: "event-handler",
		hostNodeId: event.hostNodeId,
		eventName: event.eventName,
		source: event.handlerSources[order] ?? "",
		order
	});
	for (const binding of input.payloadArena.view.bindings) symbols.push({
		id: `symbol:${nextSymbolId++}`,
		kind: "dom-binding",
		hostNodeId: binding.hostNodeId,
		source: binding.source,
		bindingId: binding.bindingId
	});
	input.payloadArena.view.behaviors.forEach((behavior, order) => {
		symbols.push({
			id: `symbol:${nextSymbolId++}`,
			kind: "behavior",
			hostNodeId: behavior.hostNodeId,
			source: behavior.source,
			order
		});
	});
	for (const computed of input.payloadArena.state.computed) symbols.push({
		id: `symbol:${nextSymbolId++}`,
		kind: "async-computed-runner",
		bindingId: computed.bindingId,
		name: computed.name
	});
	return {
		passId: "symbol-resolver",
		dynamicImportOwner: "generated-symbol-resolver",
		symbols,
		syncPolicies: input.semanticGraph.events.filter((event) => event.hasSyncPolicyCandidate).map((event) => ({
			eventId: event.id,
			hostNodeId: event.hostNodeId,
			eventName: event.eventName,
			syncPolicy: event.syncPolicy
		})),
		diagnostics: input.payloadArena.diagnostics
	};
}
//#endregion
//#region packages/compiler/src/compile-module.ts
async function compileTsrxModule(input) {
	const passGraph = validateCompilerPassGraph(defaultCompilerPasses, ["source", "symbols"]);
	const semanticGraph = await buildSemanticGraph(input);
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({
		semanticGraph,
		stateLowering
	});
	const symbolResolver = planSymbolResolver({
		semanticGraph,
		payloadArena
	});
	const captureAnalysis = analyzeCaptures({
		semanticGraph,
		symbolResolver
	});
	const protocolState = createProtocolStatePayloadFromArena({
		semanticGraph,
		payloadArena
	});
	const protocolView = createProtocolViewPayload({
		payloadArena,
		symbolResolver
	});
	const { payloadScripts, renderShell } = renderPayloadScriptArtifact({
		protocolState,
		protocolView
	});
	return {
		passGraph,
		semanticGraph,
		stateLowering,
		payloadArena,
		symbolResolver,
		captureAnalysis,
		protocolState,
		protocolView,
		payloadScripts,
		renderShell,
		symbolResolverModule: emitSymbolResolverModule({
			buildId: input.buildId,
			resolverId: input.resolverId,
			symbols: input.symbols
		}),
		symbolResolverModuleManifest: createSymbolResolverModuleManifest({
			buildId: input.buildId,
			resolverId: input.resolverId,
			symbols: input.symbols
		})
	};
}
//#endregion
export { lowerStateAccess as a, createProtocolStatePayloadFromArena as c, analyzeCaptures as d, defaultCompilerPasses as f, emitSymbolResolverModule as i, renderPayloadScriptArtifact as l, planSymbolResolver as n, buildSemanticGraph as o, validateCompilerPassGraph as p, createSymbolResolverModuleManifest as r, createProtocolViewPayload as s, compileTsrxModule as t, planPayloadArena as u };
