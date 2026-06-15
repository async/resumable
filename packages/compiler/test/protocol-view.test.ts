import { expect, test } from 'vitest';
import {
	buildSemanticGraph,
	createProtocolViewPayload,
	lowerStateAccess,
	planPayloadArena,
	planSymbolResolver,
} from '../src/index.ts';

const source = `
export function App() @{
	let count = state(0);
	const menu = state({ open: true });

	<section>
		<input
			onKeyDown={(event) => {
				if (menu.open && event.key === 'Escape') {
					event.preventDefault();
					menu.open = false;
				}
			}}
		/>
		<button onClick={[() => count++, () => menu.open = true]}>{count}</button>
		<canvas use={[chart(menu), resizeCanvas]} />
	</section>
}
`;

const asyncBoundarySource = `
export function App() @{
	const details = computed(async ({ signal }) => {
		const response = await fetch('/api/details', { signal });
		return await response.json();
	});

	<section>
		@try {
			<p>{details.title}</p>
		} @pending {
			<p>Loading</p>
		} @catch (error) {
			<p>{error.message}</p>
		}
	</section>
}
`;

test('createProtocolViewPayload links payload arena records to lazy symbol IDs', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const view = createProtocolViewPayload({ payloadArena, symbolResolver });

	expect(view.version).toBe(1);
	expect(view.events).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				hostNodeId: 'h1',
				eventName: 'keydown',
				symbolIds: ['symbol:0'],
				syncPolicy: expect.objectContaining({
					actions: ['preventDefault'],
				}),
			}),
			expect.objectContaining({
				hostNodeId: 'h2',
				eventName: 'click',
				symbolIds: ['symbol:1', 'symbol:2'],
			}),
		]),
	);
	expect(view.bindings).toEqual([
		{
			hostNodeId: 'h2',
			source: 'count',
			bindingId: 'state:count',
			path: [],
			symbolId: 'symbol:3',
		},
	]);
	expect(view.behaviors).toEqual([
		{ hostNodeId: 'h3', source: 'chart(menu)', symbolId: 'symbol:4' },
		{ hostNodeId: 'h3', source: 'resizeCanvas', symbolId: 'symbol:5' },
	]);
});

test('createProtocolViewPayload links async boundary reads to runner symbols', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/AsyncBoundary.tsrx',
		source: asyncBoundarySource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });

	const view = createProtocolViewPayload({ payloadArena, symbolResolver });

	expect(view.asyncBoundaries).toEqual([
		{
			id: 'boundary:0',
			startAnchor: {
				strategy: 'dom-order-comment',
				index: 0,
			},
			endAnchor: {
				strategy: 'dom-order-comment',
				index: 1,
			},
			asyncReads: [
				{
					source: 'details.title',
					bindingId: 'computed:details',
					path: ['title'],
					runnerSymbolId: 'symbol:1',
				},
			],
		},
	]);
});
