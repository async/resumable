import { expect, test } from 'vitest';
import { emitSymbolModules } from '../src/passes/symbol-modules.ts';

test('emitSymbolModules emits event and DOM update modules that consume resume context', () => {
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
							graphNodeId: 'state:count',
							path: [],
							operation: 'update',
							updateOperator: '++',
							prefix: false,
						},
					],
				},
				{
					id: 'symbol:domUpdate',
					kind: 'dom-update',
					hostNodeId: 'h1',
					source: 'query',
					graphNodeId: 'state:query',
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
	expect(artifact.modules[0].source).toContain('graphNodeId: "state:count"');
	expect(artifact.modules[0].source).toContain('path: []');
	expect(artifact.modules[0].source).toContain('return Number(value) + 1;');
	expect(artifact.modules[1]).toMatchObject({
		symbolId: 'symbol:domUpdate',
		kind: 'dom-update',
		exportName: 'symbol_domUpdate',
	});
	expect(artifact.modules[1].source).toContain(
		"import { createDomUpdateEntry } from '@async/resumable/runtime';",
	);
	expect(artifact.modules[1].source).toContain('export function symbol_domUpdate(context)');
	expect(artifact.modules[1].source).toContain('locator: context.domUpdate?.hostNodeId ?? "h1"');
	expect(artifact.modules[1].source).toContain(
		'target: context.domUpdate?.target ?? {"kind":"property","name":"value"}',
	);
	expect(artifact.modules[1].source).toContain('value: context.value');
});
