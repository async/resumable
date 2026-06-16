import type {
	GeneratedSymbolModule,
	LoweredStateWrite,
	PlannedSymbol,
	SymbolModulesArtifact,
	SymbolModulesInput,
} from '../artifacts.ts';

export function emitSymbolModules(input: SymbolModulesInput): SymbolModulesArtifact {
	return {
		passId: 'symbol-modules',
		modules: input.symbolResolver.symbols.flatMap(emitSymbolModule),
		diagnostics: input.captureAnalysis.diagnostics,
	};
}

function emitSymbolModule(symbol: PlannedSymbol): GeneratedSymbolModule[] {
	if (symbol.kind === 'event-handler') {
		return [
			{
				symbolId: symbol.id,
				kind: symbol.kind,
				exportName: symbolExportName(symbol.id),
				source: emitEventHandlerModule(symbol),
			},
		];
	}

	if (symbol.kind !== 'dom-binding') return [];

	return [
		{
			symbolId: symbol.id,
			kind: symbol.kind,
			exportName: symbolExportName(symbol.id),
			source: emitDomBindingModule(symbol),
		},
	];
}

function emitEventHandlerModule(
	symbol: Extract<PlannedSymbol, { readonly kind: 'event-handler' }>,
): string {
	const exportName = symbolExportName(symbol.id);
	const writes = (symbol.writes ?? []).flatMap(emitEventWrite);

	return [
		`export const authoredSource = ${JSON.stringify(symbol.source)};`,
		'',
		`export function ${exportName}(context) {`,
		...(writes.length > 0 ? writes : ['	void context;']),
		'}',
		'',
	].join('\n');
}

function emitEventWrite(write: LoweredStateWrite): string[] {
	if (write.operation === 'update' && write.updateOperator) {
		const operator = write.updateOperator;
		return [
			'	context.graph.update({',
			`		bindingId: ${JSON.stringify(write.bindingId)},`,
			`		path: ${JSON.stringify(write.path)},`,
			'		returnValue: "next",',
			'		update(value) {',
			`			return Number(value) ${operator === '++' ? '+' : '-'} 1;`,
			'		},',
			'	});',
		];
	}

	return [];
}

function emitDomBindingModule(
	symbol: Extract<PlannedSymbol, { readonly kind: 'dom-binding' }>,
): string {
	const exportName = symbolExportName(symbol.id);

	return [
		"import { createBindingDomJournalRecord } from '@async/resumable/runtime';",
		'',
		`export function ${exportName}(context) {`,
		'	return createBindingDomJournalRecord({',
		`		locator: context.binding?.hostNodeId ?? ${JSON.stringify(symbol.hostNodeId)},`,
		`		target: context.binding?.target ?? ${JSON.stringify(symbol.target)},`,
		'		value: context.value,',
		'	});',
		'}',
		'',
	].join('\n');
}

function symbolExportName(symbolId: string): string {
	const name = symbolId.replace(/[^$0-9A-Z_a-z]/g, '_');
	if (/^[$A-Z_a-z]/.test(name)) return name;
	return `_${name}`;
}
