import { expect, test } from 'vitest';
import { buildSemanticGraph, lowerStateAccess, planPayloadArena } from '../src/index.ts';
import { planSymbolResolver } from '../src/passes/symbol-resolver.ts';

const source = `
export function App() @{
	let count = state(0);
	let query = state('');
	const result = computed(async ({ signal }) => {
		const q = query;
		const response = await fetch('/api/search?q=' + q, { signal });
		return await response.json();
	});

	<section>
		<input
			value={query}
			onInput={(event) => query = event.currentTarget.value}
			onKeyDown={(event) => {
				if (query && event.key === 'Escape') {
					event.preventDefault();
					query = '';
				}
			}}
		/>
		<button onClick={[() => count++, () => query = 'clicked']}>
			{count} {result.title}
		</button>
		<canvas use={[chart(result), resizeCanvas]} />
	</section>
}
`;

test('planSymbolResolver assigns lazy symbols while resolver owns import boundaries', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });

	const plan = planSymbolResolver({
		semanticGraph,
		payloadArena,
	});

	expect(plan.passId).toBe('symbol-resolver');
	expect(plan.dynamicImportOwner).toBe('generated-symbol-resolver');
	expect(plan.symbols).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ kind: 'event-handler', eventName: 'input' }),
			expect.objectContaining({ kind: 'event-handler', eventName: 'keydown' }),
			expect.objectContaining({
				kind: 'event-handler',
				eventName: 'click',
				order: 0,
				source: '() => count++',
			}),
			expect.objectContaining({
				kind: 'event-handler',
				eventName: 'click',
				order: 1,
				source: "() => query = 'clicked'",
			}),
			expect.objectContaining({ kind: 'dom-binding', source: 'query' }),
			expect.objectContaining({ kind: 'dom-binding', source: 'count' }),
			expect.objectContaining({ kind: 'dom-binding', source: 'result.title' }),
			expect.objectContaining({ kind: 'behavior', source: 'chart(result)' }),
			expect.objectContaining({ kind: 'behavior', source: 'resizeCanvas' }),
			expect.objectContaining({
				kind: 'async-computed-runner',
				bindingId: 'computed:result',
			}),
		]),
	);
	expect(plan.syncPolicies).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			hostNodeId: 'h1',
		}),
	]);
	expect(plan.diagnostics).toEqual([]);
});
