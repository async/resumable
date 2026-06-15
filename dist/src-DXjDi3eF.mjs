import { t as compileTsrxModule } from "./src-BIY-Cty9.mjs";
//#region node_modules/.pnpm/pathe@2.0.3/node_modules/pathe/dist/shared/pathe.M-eThtNZ.mjs
const _DRIVE_LETTER_START_RE = /^[A-Za-z]:\//;
function normalizeWindowsPath(input = "") {
	if (!input) return input;
	return input.replace(/\\/g, "/").replace(_DRIVE_LETTER_START_RE, (r) => r.toUpperCase());
}
const _UNC_REGEX = /^[/\\]{2}/;
const _IS_ABSOLUTE_RE = /^[/\\](?![/\\])|^[/\\]{2}(?!\.)|^[A-Za-z]:[/\\]/;
const _DRIVE_LETTER_RE = /^[A-Za-z]:$/;
const normalize = function(path) {
	if (path.length === 0) return ".";
	path = normalizeWindowsPath(path);
	const isUNCPath = path.match(_UNC_REGEX);
	const isPathAbsolute = isAbsolute(path);
	const trailingSeparator = path[path.length - 1] === "/";
	path = normalizeString(path, !isPathAbsolute);
	if (path.length === 0) {
		if (isPathAbsolute) return "/";
		return trailingSeparator ? "./" : ".";
	}
	if (trailingSeparator) path += "/";
	if (_DRIVE_LETTER_RE.test(path)) path += "/";
	if (isUNCPath) {
		if (!isPathAbsolute) return `//./${path}`;
		return `//${path}`;
	}
	return isPathAbsolute && !isAbsolute(path) ? `/${path}` : path;
};
function normalizeString(path, allowAboveRoot) {
	let res = "";
	let lastSegmentLength = 0;
	let lastSlash = -1;
	let dots = 0;
	let char = null;
	for (let index = 0; index <= path.length; ++index) {
		if (index < path.length) char = path[index];
		else if (char === "/") break;
		else char = "/";
		if (char === "/") {
			if (lastSlash === index - 1 || dots === 1);
			else if (dots === 2) {
				if (res.length < 2 || lastSegmentLength !== 2 || res[res.length - 1] !== "." || res[res.length - 2] !== ".") {
					if (res.length > 2) {
						const lastSlashIndex = res.lastIndexOf("/");
						if (lastSlashIndex === -1) {
							res = "";
							lastSegmentLength = 0;
						} else {
							res = res.slice(0, lastSlashIndex);
							lastSegmentLength = res.length - 1 - res.lastIndexOf("/");
						}
						lastSlash = index;
						dots = 0;
						continue;
					} else if (res.length > 0) {
						res = "";
						lastSegmentLength = 0;
						lastSlash = index;
						dots = 0;
						continue;
					}
				}
				if (allowAboveRoot) {
					res += res.length > 0 ? "/.." : "..";
					lastSegmentLength = 2;
				}
			} else {
				if (res.length > 0) res += `/${path.slice(lastSlash + 1, index)}`;
				else res = path.slice(lastSlash + 1, index);
				lastSegmentLength = index - lastSlash - 1;
			}
			lastSlash = index;
			dots = 0;
		} else if (char === "." && dots !== -1) ++dots;
		else dots = -1;
	}
	return res;
}
const isAbsolute = function(p) {
	return _IS_ABSOLUTE_RE.test(p);
};
//#endregion
//#region packages/rolldown/src/index.ts
function asyncResumableRolldown(options) {
	const virtualModules = /* @__PURE__ */ new Map();
	return {
		name: "@async/resumable/rolldown",
		async transform(code, id) {
			const moduleId = normalizeTsrxModuleId(id);
			if (!moduleId) return null;
			const transformed = await transformTsrxModule({
				id: moduleId,
				code,
				symbols: options.symbols
			});
			for (const virtualModule of transformed.virtualModules) virtualModules.set(virtualModule.id, virtualModule.code);
			return { code: transformed.code };
		},
		load(id) {
			return virtualModules.get(id) ?? null;
		}
	};
}
async function transformTsrxModule(input) {
	const moduleId = normalizeModulePath(input.id);
	const compiled = await compileTsrxModule({
		filename: moduleId,
		source: input.code,
		symbols: input.symbols
	});
	const resolverId = `\0async-resumable/resolver:${moduleId}`;
	const payloadId = `\0async-resumable/payload:${moduleId}`;
	const virtualModules = [{
		id: resolverId,
		kind: "symbol-resolver",
		code: compiled.symbolResolverModule
	}, {
		id: payloadId,
		kind: "payload",
		code: [
			`export const renderShell = ${templateLiteral(compiled.renderShell)};\n`,
			"export const state = ",
			JSON.stringify(compiled.protocolState),
			";\n",
			"export const view = ",
			JSON.stringify(compiled.protocolView),
			";\n"
		].join("")
	}];
	const manifest = {
		moduleId: input.id,
		symbolIds: input.symbols.map((symbol) => symbol.id),
		virtualModuleIds: virtualModules.map((module) => module.id)
	};
	return {
		id: moduleId,
		code: emitTransformedModule({
			source: moduleId,
			resolverId,
			payloadId,
			manifest
		}),
		virtualModules,
		manifest
	};
}
function normalizeTsrxModuleId(id) {
	const modulePath = normalizeModulePath(id);
	return modulePath.endsWith(".tsrx") ? modulePath : null;
}
function normalizeModulePath(id) {
	return normalize(stripModuleIdSuffix(id));
}
function stripModuleIdSuffix(id) {
	const suffixIndex = [id.indexOf("?"), id.indexOf("#")].filter((index) => index >= 0).sort((left, right) => left - right)[0];
	return suffixIndex === void 0 ? id : id.slice(0, suffixIndex);
}
function emitTransformedModule(input) {
	return [
		"export const __async_resumable_module = ",
		JSON.stringify({
			source: input.source,
			resolver: input.resolverId,
			payload: input.payloadId,
			manifest: input.manifest
		}),
		";\n"
	].join("");
}
function templateLiteral(value) {
	return `\`${value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")}\``;
}
//#endregion
export { normalizeTsrxModuleId as n, transformTsrxModule as r, asyncResumableRolldown as t };
