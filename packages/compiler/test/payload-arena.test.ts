import { expect, test } from 'vitest';
import { buildSemanticGraph, lowerStateAccess } from '../src/index.ts';
import { planPayloadArena } from '../src/passes/payload-arena.ts';

const source = `
import { state, computed, element } from '@async/resumable';

export function App() @{
	let count = state(0);
	const menu = state({ open: true, title: 'Menu' });
	const details = computed(async ({ signal }) => {
		const title = menu.title;
		const response = await fetch('/api/details/' + title, { signal });
		return await response.json();
	});
	let input = element<HTMLInputElement>();

	<section>
		<input
			el={input}
			value={menu.title}
			onKeyDown={(event) => {
				if (menu.open && event.key === 'Escape') {
					event.preventDefault();
					menu.open = false;
				}
			}}
		/>
		<button onClick={() => count++}>{count}</button>
		<canvas use={chart(details)} />
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

test('planPayloadArena separates graph state from view wiring metadata', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });

	const payload = planPayloadArena({
		semanticGraph,
		stateLowering,
	});

	expect(payload.passId).toBe('payload-arena');
	expect(payload.state.cells).toEqual(
		expect.arrayContaining([
			{
				bindingId: 'state:count',
				name: 'count',
				valueKind: 'scalar',
			},
			{
				bindingId: 'state:menu',
				name: 'menu',
				valueKind: 'object',
			},
		]),
	);
	expect(payload.state.computed).toEqual([
		{
			bindingId: 'computed:details',
			name: 'details',
			async: true,
		},
	]);

	expect(payload.view.locators).toEqual([
		{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
		{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'input' },
		{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'button' },
		{ hostNodeId: 'h3', strategy: 'dom-order', index: 3, tagName: 'canvas' },
		{ hostNodeId: 'h4', strategy: 'dom-order', index: 4, tagName: 'p' },
		{ hostNodeId: 'h5', strategy: 'dom-order', index: 5, tagName: 'p' },
		{ hostNodeId: 'h6', strategy: 'dom-order', index: 6, tagName: 'p' },
	]);

	expect(payload.view.events).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				hostNodeId: 'h1',
				eventName: 'keydown',
				hasSyncPolicyCandidate: true,
			}),
			expect.objectContaining({
				hostNodeId: 'h2',
				eventName: 'click',
				hasSyncPolicyCandidate: false,
			}),
		]),
	);
	expect(payload.view.bindings).toEqual(
		expect.arrayContaining([
			{
				hostNodeId: 'h1',
				source: 'menu.title',
				bindingId: 'state:menu',
				path: ['title'],
				target: {
					kind: 'property',
					name: 'value',
				},
			},
			{
				hostNodeId: 'h2',
				source: 'count',
				bindingId: 'state:count',
				path: [],
				target: {
					kind: 'text',
				},
			},
			{
				hostNodeId: 'h4',
				source: 'details.title',
				bindingId: 'computed:details',
				path: ['title'],
				target: {
					kind: 'text',
				},
			},
		]),
	);
	expect(payload.view.behaviors).toEqual([
		{
			hostNodeId: 'h3',
			source: 'chart(details)',
		},
	]);
	expect(payload.view.elementHandles).toEqual([
		{
			hostNodeId: 'h1',
			handleId: 'element:input',
			name: 'input',
		},
	]);
	expect(payload.view.asyncBoundaries).toEqual([
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
				},
			],
		},
	]);
	expect(payload.diagnostics).toEqual([]);
});

test('planPayloadArena keeps distinct targets for repeated graph reads on one host', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/RepeatedTarget.tsrx',
		source: `
import { state } from '@async/resumable';

export function App() @{
	const count = state(0);

	<button title={count}>{count}</button>
}
`,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });

	const payload = planPayloadArena({
		semanticGraph,
		stateLowering,
	});

	expect(payload.view.bindings).toEqual([
		{
			hostNodeId: 'h0',
			source: 'count',
			bindingId: 'state:count',
			path: [],
			target: {
				kind: 'attribute',
				name: 'title',
			},
		},
		{
			hostNodeId: 'h0',
			source: 'count',
			bindingId: 'state:count',
			path: [],
			target: {
				kind: 'text',
			},
		},
	]);
});

test('planPayloadArena classifies class and style binding targets', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/ClassStyleTargets.tsrx',
		source: `
import { state } from '@async/resumable';

export function App() @{
	const activeClass = state('is-active');
	const color = state('red');

	<div class={activeClass} style={color}>{activeClass}</div>
}
`,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });

	const payload = planPayloadArena({
		semanticGraph,
		stateLowering,
	});

	expect(payload.view.bindings).toEqual([
		{
			hostNodeId: 'h0',
			source: 'activeClass',
			bindingId: 'state:activeClass',
			path: [],
			target: {
				kind: 'class',
			},
		},
		{
			hostNodeId: 'h0',
			source: 'color',
			bindingId: 'state:color',
			path: [],
			target: {
				kind: 'style',
			},
		},
		{
			hostNodeId: 'h0',
			source: 'activeClass',
			bindingId: 'state:activeClass',
			path: [],
			target: {
				kind: 'text',
			},
		},
	]);
});
