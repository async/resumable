import { expect, test } from 'vitest';
import { buildSemanticGraph, lowerStateAccess, planPayloadArena } from '../src/index.ts';

const source = `
export function Menu() @{
	const menu = state({ open: true });

	<input
		onKeyDown={(event) => {
			if (menu.open && event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				menu.open = false;
			}
		}}
	/>
}
`;

const negatedGuardSource = `
export function Menu() @{
	const menu = state({ open: false });

	<input
		onKeyDown={(event) => {
			if (!menu.open || event.key === 'Escape') {
				event.stopPropagation();
			}
		}}
	/>
}
`;

test('compiler extracts sync preventDefault policy while keeping writes lazy', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/Menu.tsrx',
		source,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payload = planPayloadArena({ semanticGraph, stateLowering });

	expect(semanticGraph.events).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			hasSyncPolicyCandidate: true,
			syncPolicy: {
				when: {
					type: 'and',
					conditions: [
						{ type: 'graph-truthy', bindingId: 'state:menu', path: ['open'] },
						{ type: 'event-equals', field: 'key', value: 'Escape' },
					],
				},
				actions: ['preventDefault', 'stopPropagation'],
			},
		}),
	]);

	expect(stateLowering.writes).toEqual([
		{
			source: 'menu.open',
			bindingId: 'state:menu',
			path: ['open'],
			operation: 'assign',
			method: undefined,
		},
	]);

	expect(payload.view.events).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			syncPolicy: {
				when: {
					type: 'and',
					conditions: [
						{ type: 'graph-truthy', bindingId: 'state:menu', path: ['open'] },
						{ type: 'event-equals', field: 'key', value: 'Escape' },
					],
				},
				actions: ['preventDefault', 'stopPropagation'],
			},
		}),
	]);
});

test('compiler extracts negated graph-state guards in sync event policy', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/Menu.tsrx',
		source: negatedGuardSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payload = planPayloadArena({ semanticGraph, stateLowering });

	const syncPolicy = {
		when: {
			type: 'or',
			conditions: [
				{
					type: 'not',
					condition: {
						type: 'graph-truthy',
						bindingId: 'state:menu',
						path: ['open'],
					},
				},
				{ type: 'event-equals', field: 'key', value: 'Escape' },
			],
		},
		actions: ['stopPropagation'],
	};

	expect(semanticGraph.events).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			hasSyncPolicyCandidate: true,
			syncPolicy,
		}),
	]);
	expect(semanticGraph.diagnostics).toEqual([]);
	expect(payload.view.events).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			syncPolicy,
		}),
	]);
});
