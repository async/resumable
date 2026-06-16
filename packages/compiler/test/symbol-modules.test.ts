import { expect, test } from 'vitest';
import { emitSymbolModules } from '../src/passes/symbol-modules.ts';

test('emitSymbolModules emits event and DOM binding modules that consume resume context', () => {
	const artifact = emitSymbolModules({
		symbolResolver: {
			passId: 'symbol-resolver',
			dynamicImportOwner: 'generated-symbol-resolver',
			symbols: [
				{
					id: 'symbol:click',
					kind: 'event-handler',
					hostNodeId: 'h1',
					eventName: 'click',
					source: '() => count++',
					order: 0,
					writes: [
						{
							source: 'count',
							bindingId: 'state:count',
							path: [],
							operation: 'update',
							updateOperator: '++',
							prefix: false,
						},
					],
				},
				{
					id: 'symbol:binding',
					kind: 'dom-binding',
					hostNodeId: 'h1',
					source: 'query',
					bindingId: 'state:query',
					target: { kind: 'property', name: 'value' },
				},
			],
			syncPolicies: [],
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis',
			extractedSymbols: [],
			diagnostics: [],
		},
	});

	expect(artifact.passId).toBe('symbol-modules');
	expect(artifact.modules).toHaveLength(2);
	expect(artifact.modules[0]).toMatchObject({
		symbolId: 'symbol:click',
		kind: 'event-handler',
		exportName: 'symbol_click',
	});
	expect(artifact.modules[0].source).toContain('export const authoredSource = "() => count++";');
	expect(artifact.modules[0].source).toContain('export function symbol_click(context)');
	expect(artifact.modules[0].source).toContain('context.graph.update({');
	expect(artifact.modules[0].source).toContain('bindingId: "state:count"');
	expect(artifact.modules[0].source).toContain('path: []');
	expect(artifact.modules[0].source).toContain('return Number(value) + 1;');
	expect(artifact.modules[1]).toMatchObject({
		symbolId: 'symbol:binding',
		kind: 'dom-binding',
		exportName: 'symbol_binding',
	});
	expect(artifact.modules[1].source).toContain(
		"import { createBindingDomJournalRecord } from '@async/resumable/runtime';",
	);
	expect(artifact.modules[1].source).toContain('export function symbol_binding(context)');
	expect(artifact.modules[1].source).toContain('locator: context.binding?.hostNodeId ?? "h1"');
	expect(artifact.modules[1].source).toContain(
		'target: context.binding?.target ?? {"kind":"property","name":"value"}',
	);
	expect(artifact.modules[1].source).toContain('value: context.value');
});
