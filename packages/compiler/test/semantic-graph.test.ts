import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../src/index.ts';

const source = `
import { state, computed, element } from '@async/resumable';
import { makeChart } from './chart';

export function App({ label }: { label: string }) @{
	let count = state(0);
	const menu = state({ open: true, title: 'Menu', meta: { label: 'Main' } });
	const { title: menuTitle } = menu;
	const { meta: { label: menuLabel } } = menu;
	const { title: restTitle, ...menuRest } = menu;
	const doubled = computed(() => count * 2);
	const details = computed(async ({ signal }) => {
		const id = menu.title;
		const response = await fetch('/api/details/' + id, { signal });
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
					event.stopPropagation();
					menu.open = false;
				}
			}}
		/>
		<button onClick={() => count++}>{label}: {count} and {doubled} and {menuTitle} and {menuLabel} and {menuRest.meta.label}</button>
		<canvas use={makeChart(details)} />
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

test('buildSemanticGraph creates the first production compiler artifact', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source,
	});

	expect(graph.passId).toBe('tsrx-semantic-graph');
	expect(graph.components).toEqual([{ name: 'App' }]);

	expect(graph.graphBindings).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				name: 'count',
				kind: 'state',
				writable: true,
				valueKind: 'scalar',
			}),
			expect.objectContaining({
				name: 'menu',
				kind: 'state',
				writable: true,
				valueKind: 'object',
			}),
			expect.objectContaining({
				name: 'doubled',
				kind: 'computed',
				writable: false,
				async: false,
			}),
			expect.objectContaining({
				name: 'details',
				kind: 'computed',
				writable: false,
				async: true,
			}),
			expect.objectContaining({
				name: 'input',
				kind: 'element',
				writable: false,
			}),
			expect.objectContaining({
				name: 'props',
				kind: 'prop',
				writable: false,
				valueKind: 'object',
			}),
		]),
	);

	expect(graph.hostNodes.map((node) => node.tagName)).toEqual([
		'section',
		'input',
		'button',
		'canvas',
		'p',
		'p',
		'p',
	]);

	expect(graph.aliases).toEqual([
		{
			name: 'label',
			target: 'props.label',
			declarationKind: 'const',
			sourceSpan: expect.objectContaining({
				filename: 'src/App.tsrx',
			}),
		},
		{
			name: 'menuTitle',
			target: 'menu.title',
			declarationKind: 'const',
			sourceSpan: expect.objectContaining({
				filename: 'src/App.tsrx',
			}),
		},
		{
			name: 'menuLabel',
			target: 'menu.meta.label',
			declarationKind: 'const',
			sourceSpan: expect.objectContaining({
				filename: 'src/App.tsrx',
			}),
		},
		{
			name: 'restTitle',
			target: 'menu.title',
			declarationKind: 'const',
			sourceSpan: expect.objectContaining({
				filename: 'src/App.tsrx',
			}),
		},
		{
			name: 'menuRest',
			target: 'menu',
			declarationKind: 'const',
			excludedPaths: [['title']],
			sourceSpan: expect.objectContaining({
				filename: 'src/App.tsrx',
			}),
		},
	]);

	expect(graph.events).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				eventName: 'keydown',
				handlerCount: 1,
				hasSyncPolicyCandidate: true,
			}),
			expect.objectContaining({
				eventName: 'click',
				handlerCount: 1,
				hasSyncPolicyCandidate: false,
			}),
		]),
	);

	expect(graph.behaviors).toEqual([
		expect.objectContaining({
			source: 'makeChart(details)',
		}),
	]);

	expect(graph.templateReads).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ source: 'menu.title' }),
			expect.objectContaining({ source: 'label' }),
			expect.objectContaining({ source: 'count' }),
			expect.objectContaining({ source: 'doubled' }),
			expect.objectContaining({ source: 'menuTitle' }),
			expect.objectContaining({ source: 'menuLabel' }),
			expect.objectContaining({ source: 'menuRest.meta.label' }),
			expect.objectContaining({ source: 'details.title' }),
			expect.objectContaining({ source: 'error.message' }),
		]),
	);

	expect(graph.stateWrites).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ target: 'menu.open', operation: 'assign' }),
			expect.objectContaining({ target: 'count', operation: 'update' }),
		]),
	);

	expect(graph.asyncBoundaries).toHaveLength(1);
});
