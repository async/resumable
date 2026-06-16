export function stripEmptyVitePreloadWrappers(code: string): string {
	const withoutDirectImports = stripDirectEmptyPreloadWrappers(code);
	const withoutAsyncLoaders = stripAsyncEmptyPreloadWrappers(withoutDirectImports);
	return stripUnusedVitePreloadHelper(withoutAsyncLoaders);
}

function stripDirectEmptyPreloadWrappers(code: string): string {
	let next = '';
	let cursor = 0;
	let changed = false;
	const wrapperRE = /\b[$A-Z_a-z][$\w]*\(\(\)\s*=>\s*/g;

	for (let match = wrapperRE.exec(code); match; match = wrapperRE.exec(code)) {
		const callStart = match.index;
		const bodyStart = match.index + match[0]!.length;
		if (!code.startsWith('import(', bodyStart)) continue;

		const wrapper = findEmptyPreloadWrapper(code, callStart, bodyStart);
		if (!wrapper) continue;

		next += code.slice(cursor, callStart);
		next += code.slice(bodyStart, wrapper.firstArgumentEnd);
		cursor = wrapper.callEnd + 1;
		wrapperRE.lastIndex = cursor;
		changed = true;
	}

	if (!changed) return code;
	return next + code.slice(cursor);
}

function stripAsyncEmptyPreloadWrappers(code: string): string {
	let next = '';
	let cursor = 0;
	let changed = false;
	const wrapperRE = /\b[$A-Z_a-z][$\w]*\(\s*async\s*\(\)\s*=>\s*\{/g;

	for (let match = wrapperRE.exec(code); match; match = wrapperRE.exec(code)) {
		const callStart = match.index;
		const callOpen = code.indexOf('(', callStart);
		if (callOpen < 0) continue;

		const firstArgumentEnd = findTopLevelComma(code, callOpen + 1);
		if (firstArgumentEnd < 0) continue;

		const wrapper = findEmptyPreloadWrapper(code, callStart, callOpen + 1);
		if (!wrapper) continue;

		const loader = code.slice(callOpen + 1, firstArgumentEnd);
		next += code.slice(cursor, callStart);
		next += `(${loader})()`;
		cursor = wrapper.callEnd + 1;
		wrapperRE.lastIndex = cursor;
		changed = true;
	}

	if (!changed) return code;
	return next + code.slice(cursor);
}

function findEmptyPreloadWrapper(
	code: string,
	callStart: number,
	bodyStart: number,
): { readonly firstArgumentEnd: number; readonly callEnd: number } | undefined {
	const callOpen = code.indexOf('(', callStart);
	if (callOpen < 0 || callOpen >= bodyStart) return undefined;

	const firstArgumentEnd = findTopLevelComma(code, callOpen + 1);
	if (firstArgumentEnd < 0) return undefined;

	let cursor = skipSpaces(code, firstArgumentEnd + 1);
	if (code[cursor] !== '[' || code[cursor + 1] !== ']') return undefined;
	cursor = skipSpaces(code, cursor + 2);

	if (code[cursor] === ')') {
		return { firstArgumentEnd, callEnd: cursor };
	}

	if (code[cursor] !== ',') return undefined;
	cursor = skipSpaces(code, cursor + 1);
	if (!code.startsWith('import.meta.url', cursor)) return undefined;
	cursor = skipSpaces(code, cursor + 'import.meta.url'.length);
	if (code[cursor] !== ')') return undefined;

	return { firstArgumentEnd, callEnd: cursor };
}

function findTopLevelComma(code: string, start: number): number {
	let depth = 1;
	let quote: string | null = null;
	let escaped = false;

	for (let index = start; index < code.length; index++) {
		const char = code[index]!;
		if (quote) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === '\\') {
				escaped = true;
				continue;
			}
			if (char === quote) quote = null;
			continue;
		}

		if (char === '"' || char === "'" || char === '`') {
			quote = char;
			continue;
		}
		if (char === '(' || char === '[' || char === '{') {
			depth++;
			continue;
		}
		if (char === ')' || char === ']' || char === '}') {
			depth--;
			if (depth === 0) return -1;
			continue;
		}
		if (char === ',' && depth === 1) return index;
	}

	return -1;
}

function skipSpaces(code: string, start: number): number {
	let cursor = start;
	while (/\s/.test(code[cursor] ?? '')) cursor++;
	return cursor;
}

function stripUnusedVitePreloadHelper(code: string): string {
	const marker = code.indexOf('vite:preloadError');
	if (marker < 0) return code;

	const helper = findVitePreloadHelperModule(code, marker);
	if (!helper) return code;

	const statementEnd =
		code[helper.removeStart] === ',' && code[helper.removeEnd - 1] === ';' ? ';' : '';
	const outsideHelper =
		code.slice(0, helper.removeStart) + statementEnd + code.slice(helper.removeEnd);
	if (new RegExp(`\\b${escapeRegExp(helper.preloadFunction)}\\s*\\(`).test(outsideHelper)) {
		return code;
	}

	let withoutHelper = outsideHelper;
	const chain = findVitePreloadHelperInitChain(withoutHelper, helper.moduleVariable);
	if (chain) {
		withoutHelper = removeInitCall(
			withoutHelper.slice(0, chain.removeStart) + withoutHelper.slice(chain.removeEnd),
			chain.entryVariable,
		);
	}

	return removeInitCall(withoutHelper, helper.moduleVariable);
}

function findVitePreloadHelperModule(
	code: string,
	marker: number,
):
	| {
			readonly moduleVariable: string;
			readonly preloadFunction: string;
			readonly removeStart: number;
			readonly removeEnd: number;
	  }
	| undefined {
	const initStart = code.lastIndexOf('=e((()=>{', marker);
	if (initStart < 0) return undefined;

	const moduleVariable = readIdentifierBefore(code, initStart);
	if (!moduleVariable) return undefined;

	const bodyStart = initStart + '=e((()=>{'.length;
	const bodyEnd = findModuleInitEnd(code, initStart);
	if (bodyEnd < 0) return undefined;

	const helperBody = code.slice(bodyStart, bodyEnd);
	const preloadFunction = helperBody.match(
		/,([$A-Z_a-z][$\w]*)=function\([^)]*\)\{let\s+[$A-Z_a-z][$\w]*=Promise\.resolve\(\)/,
	)?.[1];
	if (!preloadFunction) return undefined;

	const firstHelperVariable = helperBody.match(/^([$A-Z_a-z][$\w]*)=/)?.[1];
	if (!firstHelperVariable) return undefined;

	const removeStart = findHelperDeclarationStart(code, initStart, firstHelperVariable);
	if (removeStart < 0) return undefined;

	return {
		moduleVariable,
		preloadFunction,
		removeStart,
		removeEnd: bodyEnd + '}));'.length,
	};
}

function findVitePreloadHelperInitChain(
	code: string,
	moduleVariable: string,
):
	| {
			readonly entryVariable: string;
			readonly removeStart: number;
			readonly removeEnd: number;
	  }
	| undefined {
	const chainRE = new RegExp(
		`var\\s+([$A-Z_a-z][$\\w]*)=e\\(\\(\\(\\)=>\\{${escapeRegExp(
			moduleVariable,
		)}\\(\\)\\}\\)\\),([$A-Z_a-z][$\\w]*)=e\\(\\(\\(\\)=>\\{\\1\\(\\)\\}\\)\\);`,
	);
	const match = chainRE.exec(code);
	if (!match) return undefined;

	return {
		entryVariable: match[2]!,
		removeStart: match.index,
		removeEnd: match.index + match[0].length,
	};
}

function removeInitCall(code: string, entryVariable: string): string {
	return code
		.replace(new RegExp(`,${escapeRegExp(entryVariable)}\\(\\)`), '')
		.replace(new RegExp(`${escapeRegExp(entryVariable)}\\(\\),`), '')
		.replace(new RegExp(`\\{${escapeRegExp(entryVariable)}\\(\\)\\}`), '{}');
}

function readIdentifierBefore(code: string, index: number): string | undefined {
	let end = index;
	while (/\s/.test(code[end - 1] ?? '')) end--;
	let start = end;
	while (/[$\w]/.test(code[start - 1] ?? '')) start--;
	const value = code.slice(start, end);
	return /^[$A-Z_a-z][$\w]*$/.test(value) ? value : undefined;
}

function findModuleInitEnd(code: string, initStart: number): number {
	const end = code.indexOf('}));', initStart);
	return end;
}

function findHelperDeclarationStart(
	code: string,
	initStart: number,
	firstHelperVariable: string,
): number {
	const commaStart = code.lastIndexOf(`,${firstHelperVariable},`, initStart);
	if (commaStart >= 0) return commaStart;

	const varStart = code.lastIndexOf(`var ${firstHelperVariable},`, initStart);
	if (varStart >= 0) return varStart;

	return -1;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
