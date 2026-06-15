import { ASYNC_PROTOCOL_VERSION } from '@async/resumable-protocol';
import type { SymbolResolverModuleInput, SymbolResolverModuleManifest } from '../artifacts.ts';

export function createSymbolResolverModuleManifest(
	input: SymbolResolverModuleInput,
): SymbolResolverModuleManifest {
	return {
		protocolVersion: ASYNC_PROTOCOL_VERSION,
		buildId: input.buildId ?? null,
		resolverId: input.resolverId ?? null,
		symbols: input.symbols,
	};
}

export function emitSymbolResolverModule(input: SymbolResolverModuleInput): string {
	const manifest = createSymbolResolverModuleManifest(input);
	const cases = input.symbols.map((symbol) => {
		const exportAccess = isIdentifier(symbol.exportName)
			? `mod.${symbol.exportName}`
			: `mod[${JSON.stringify(symbol.exportName)}]`;

		return [
			`		case ${JSON.stringify(symbol.id)}:`,
			`			return import(${JSON.stringify(symbol.chunk)})`,
			`				.then((mod) => ${exportAccess});`,
		].join('\n');
	});

	return [
		'export const symbolManifest = ',
		JSON.stringify(manifest),
		';',
		'',
		'export async function loadSymbol(id) {',
		'	switch (id) {',
		...cases,
		'		default:',
		'			throw createUnknownSymbolError(id);',
		'	}',
		'}',
		'',
		'function createUnknownSymbolError(id) {',
		'	return Object.assign(new Error(`Unknown async symbol ${id}`), {',
		'		code: "AA_SYMBOL_UNKNOWN",',
		'		phase: "resume",',
		'		symbolId: String(id),',
		'		docsUrl: "https://async.await.dev/errors/AA_SYMBOL_UNKNOWN",',
		'	});',
		'}',
		'',
	].join('\n');
}

function isIdentifier(value: string): boolean {
	return /^[$A-Z_a-z][$\w]*$/.test(value);
}
