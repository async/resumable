import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { deserializeGraphValue } from '../../serializer/src/index.ts';

const source = `
import { state } from '@async/resumable';

export function App() @{
	let count = state(1);
	const menu = state({ open: true, title: 'Menu' });

	<section>
		<input
			value={menu.title}
			onKeyDown={(event) => {
				if (menu.open && event.key === 'Escape') {
					event.preventDefault();
					menu.open = false;
				}
			}}
		/>
		<button onClick={() => count++}>{count}</button>
	</section>
}
`;

const eventWriteSource = `
import { state } from '@async/resumable';
import { clamp } from './math';

export function App() @{
	const menu = state({ open: true, title: 'Menu' });
	const profile = state({ name: 'Profile', step: 2, scale: 3, enabled: true });
	let total = state(0);
	let items = state(['first', 'second']);
	const nextItem = state('next');
	const nextItems = state(['third', 'fourth']);
	let settings = state({ title: 'Initial', step: 0 });
	const currentDate = state(new Date('2026-06-16T12:00:00.000Z'));
	const nextTime = state(1800000000000);

	<section>
		<input value={menu.title} onInput={(event) => menu.title = event.currentTarget.value} />
		<input value={menu.title} onInput={(event) => items.push(event.currentTarget.value)} />
		<button onClick={() => menu.title = profile.name}>{profile.name}</button>
		<button onClick={() => menu.open = !menu.open}>{menu.open}</button>
		<button onClick={() => total += profile.step}>{total}</button>
		<button onClick={() => total = total + profile.step}>{total}</button>
		<button onClick={() => total = (total + profile.step) * profile.scale}>{total}</button>
		<button onClick={() => total = menu.open ? profile.step : total}>{total}</button>
		<button onClick={() => total = Math.max(total, profile.step)}>{total}</button>
		<button onClick={() => total = clamp(total, profile.step)}>{total}</button>
		<button onClick={() => items = [nextItem, "fallback"]}>{items.length}</button>
		<button onClick={() => items = [...nextItems, nextItem]}>{items.length}</button>
		<button onClick={() => settings = { title: menu.title, step: profile.step }}>
			{settings.title}
		</button>
		<button onClick={() => settings = { ...settings, title: menu.title }}>
			{settings.title}
		</button>
		<button onClick={() => settings = { [menu.title]: profile.step }}>
			{settings.title}
		</button>
		<button onClick={() => currentDate.setTime(nextTime)}>{nextTime}</button>
		<button onClick={() => menu.open &&= profile.enabled}>{menu.open}</button>
		<button
			onClick={() => {
				menu.open = false;
				delete menu.title;
				items.pop();
				items.push("third");
				items.push(menu.title);
				items.push(...nextItems);
			}}
		>
			{menu.title}
		</button>
	</section>
}
`;

const asyncComputedSource = `
import { state, computed } from '@async/resumable';

export function App() @{
	const query = state('Ada');
	const details = computed(async ({ signal }) => {
		const q = query;
		const response = await fetch('/api/details/' + q, { signal });
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

test('compileTsrxModule orchestrates source to payload scripts and resolver module', async () => {
	const result = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source,
		symbols: [
			{
				id: 'symbol:0',
				chunk: '/assets/app.handlers.js',
				exportName: 'onKeyDown_0',
			},
			{
				id: 'symbol:1',
				chunk: '/assets/app.handlers.js',
				exportName: 'onClick_1',
			},
			{
				id: 'symbol:2',
				chunk: '/assets/app.domUpdates.js',
				exportName: 'inputValue_2',
			},
			{
				id: 'symbol:3',
				chunk: '/assets/app.domUpdates.js',
				exportName: 'buttonText_3',
			},
		],
	});

	expect(result.semanticGraph.components).toEqual([{ name: 'App' }]);
	expect(result.stateLowering.diagnostics).toEqual([]);
	expect(result.captureAnalysis.extractedSymbols).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'event-handler',
				source: "(event) => {\n\t\t\t\tif (menu.open && event.key === 'Escape') {\n\t\t\t\t\tevent.preventDefault();\n\t\t\t\t\tmenu.open = false;\n\t\t\t\t}\n\t\t\t}",
			}),
			expect.objectContaining({
				kind: 'event-handler',
				source: '() => count++',
			}),
		]),
	);
	expect(result.payloadScripts.stateScript).toMatch(/^<script type="async\/state">/);
	expect(result.payloadScripts.viewScript).toMatch(/^<script type="async\/view">/);
	expect(result.renderShell).toContain('<script type="async/state">');
	expect(result.renderShell).toContain('<script type="async/view">');
	expect(result.renderShell.indexOf('<script type="async/state">')).toBeLessThan(
		result.renderShell.indexOf('<script type="async/view">'),
	);
	expect(result.symbolResolverModule).toContain('return import("/assets/app.handlers.js")');
	expect(result.symbolResolverModule).toContain('return import("/assets/app.domUpdates.js")');

	const countCell = result.protocolState.cells.find((cell) => cell.graphNodeId === 'state:count');
	const menuCell = result.protocolState.cells.find((cell) => cell.graphNodeId === 'state:menu');

	expect(countCell?.valueKind).toBe('scalar');
	expect(deserializeGraphValue(countCell!.value!)).toBe(1);
	expect(menuCell?.valueKind).toBe('object');
	expect(deserializeGraphValue(menuCell!.value!)).toEqual({ open: true, title: 'Menu' });

	expect(result.protocolView.events).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				eventName: 'keydown',
				symbolIds: ['symbol:0'],
				syncPolicy: expect.objectContaining({ actions: ['preventDefault'] }),
			}),
			expect.objectContaining({
				eventName: 'click',
				symbolIds: ['symbol:1'],
			}),
		]),
	);
	expect(result.protocolView.domUpdates).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				source: 'menu.title',
				symbolId: 'symbol:2',
			}),
			expect.objectContaining({
				source: 'count',
				symbolId: 'symbol:3',
			}),
		]),
	);
});

test('compileTsrxModule emits generated event modules for supported graph write forms', async () => {
	const result = await compileTsrxModule({
		filename: 'src/EventWrites.tsrx',
		source: eventWriteSource,
		symbols: [],
	});

	const clickModule = result.symbolModules.modules.find(
		(module) => module.kind === 'event-handler' && module.source.includes('items.pop'),
	);
	const inputModule = result.symbolModules.modules.find(
		(module) =>
			module.kind === 'event-handler' && module.source.includes('event.currentTarget.value'),
	);
	const inputCollectionModule = result.symbolModules.modules.find(
		(module) =>
			module.kind === 'event-handler' &&
			module.source.includes('items.push(event.currentTarget.value)'),
	);
	const dateModule = result.symbolModules.modules.find(
		(module) =>
			module.kind === 'event-handler' &&
			module.source.includes('currentDate.setTime(nextTime)'),
	);

	expect(result.stateLowering.diagnostics).toEqual([]);
	expect(clickModule?.source).toContain('context.graph.write({');
	expect(clickModule?.source).toContain('graphNodeId: "state:menu"');
	expect(clickModule?.source).toContain('path: ["open"]');
	expect(clickModule?.source).toContain('value: false');
	expect(clickModule?.source).toContain('context.graph.delete({');
	expect(clickModule?.source).toContain('path: ["title"]');
	expect(clickModule?.source).toContain('context.graph.call({');
	expect(clickModule?.source).toContain('graphNodeId: "state:items"');
	expect(clickModule?.source).toContain('method: "pop"');
	expect(clickModule?.source).toContain('method: "push"');
	expect(clickModule?.source).toContain('args: ["third"]');
	expect(clickModule?.source).toContain('args: [context.graph.read("state:menu", ["title"])]');
	expect(clickModule?.source).toContain('args: [...context.graph.read("state:nextItems", [])]');
	expect(inputModule?.source).toContain('graphNodeId: "state:menu"');
	expect(inputModule?.source).toContain('path: ["title"]');
	expect(inputModule?.source).toContain('value: context.event?.currentTarget?.value');
	expect(inputCollectionModule?.source).toContain('graphNodeId: "state:items"');
	expect(inputCollectionModule?.source).toContain('args: [context.event?.currentTarget?.value]');
	expect(inputCollectionModule?.source).not.toContain('args: ["third"]');
	expect(dateModule?.source).toContain('context.graph.call({');
	expect(dateModule?.source).toContain('graphNodeId: "state:currentDate"');
	expect(dateModule?.source).toContain('path: []');
	expect(dateModule?.source).toContain('method: "setTime"');
	expect(dateModule?.source).toContain('args: [context.graph.read("state:nextTime", [])]');

	const copyModule = result.symbolModules.modules.find(
		(module) =>
			module.kind === 'event-handler' && module.source.includes('menu.title = profile.name'),
	);

	expect(copyModule?.source).toContain('graphNodeId: "state:menu"');
	expect(copyModule?.source).toContain('path: ["title"]');
	expect(copyModule?.source).toContain('value: context.graph.read("state:profile", ["name"])');

	const toggleModule = result.symbolModules.modules.find(
		(module) =>
			module.kind === 'event-handler' && module.source.includes('menu.open = !menu.open'),
	);

	expect(toggleModule?.source).toContain('context.graph.write({');
	expect(toggleModule?.source).toContain('graphNodeId: "state:menu"');
	expect(toggleModule?.source).toContain('path: ["open"]');
	expect(toggleModule?.source).toContain('value: !context.graph.read("state:menu", ["open"])');

	const addModule = result.symbolModules.modules.find(
		(module) =>
			module.kind === 'event-handler' && module.source.includes('total += profile.step'),
	);

	expect(addModule?.source).toContain('context.graph.update({');
	expect(addModule?.source).toContain('graphNodeId: "state:total"');
	expect(addModule?.source).toContain('path: []');
	expect(addModule?.source).toContain(
		'return value + context.graph.read("state:profile", ["step"]);',
	);

	const binaryAddModule = result.symbolModules.modules.find(
		(module) =>
			module.kind === 'event-handler' &&
			module.source.includes('total = total + profile.step'),
	);

	expect(binaryAddModule?.source).toContain('context.graph.write({');
	expect(binaryAddModule?.source).toContain('graphNodeId: "state:total"');
	expect(binaryAddModule?.source).toContain('path: []');
	expect(binaryAddModule?.source).toContain(
		'value: context.graph.read("state:total", []) + context.graph.read("state:profile", ["step"])',
	);

	const nestedAddModule = result.symbolModules.modules.find(
		(module) =>
			module.kind === 'event-handler' &&
			module.source.includes('total = (total + profile.step) * profile.scale'),
	);

	expect(nestedAddModule?.source).toContain('context.graph.write({');
	expect(nestedAddModule?.source).toContain('graphNodeId: "state:total"');
	expect(nestedAddModule?.source).toContain('path: []');
	expect(nestedAddModule?.source).toContain(
		'value: (context.graph.read("state:total", []) + context.graph.read("state:profile", ["step"])) * context.graph.read("state:profile", ["scale"])',
	);

	const conditionalModule = result.symbolModules.modules.find(
		(module) =>
			module.kind === 'event-handler' &&
			module.source.includes('total = menu.open ? profile.step : total'),
	);

	expect(conditionalModule?.source).toContain('context.graph.write({');
	expect(conditionalModule?.source).toContain('graphNodeId: "state:total"');
	expect(conditionalModule?.source).toContain('path: []');
	expect(conditionalModule?.source).toContain(
		'value: context.graph.read("state:menu", ["open"]) ? context.graph.read("state:profile", ["step"]) : context.graph.read("state:total", [])',
	);

	const callValueModule = result.symbolModules.modules.find(
		(module) =>
			module.kind === 'event-handler' &&
			module.source.includes('total = Math.max(total, profile.step)'),
	);

	expect(callValueModule?.source).toContain('context.graph.write({');
	expect(callValueModule?.source).toContain('graphNodeId: "state:total"');
	expect(callValueModule?.source).toContain('path: []');
	expect(callValueModule?.source).toContain(
		'value: Math.max(context.graph.read("state:total", []), context.graph.read("state:profile", ["step"]))',
	);

	const importedCallValueModule = result.symbolModules.modules.find(
		(module) =>
			module.kind === 'event-handler' &&
			module.source.includes('total = clamp(total, profile.step)'),
	);

	expect(importedCallValueModule?.source).toContain('import { clamp } from "./math";');
	expect(importedCallValueModule?.source).toContain('context.graph.write({');
	expect(importedCallValueModule?.source).toContain('graphNodeId: "state:total"');
	expect(importedCallValueModule?.source).toContain('path: []');
	expect(importedCallValueModule?.source).toContain(
		'value: clamp(context.graph.read("state:total", []), context.graph.read("state:profile", ["step"]))',
	);

	const arrayLiteralModule = result.symbolModules.modules.find(
		(module) => module.kind === 'event-handler' && module.source.includes('items = [nextItem'),
	);

	expect(arrayLiteralModule?.source).toContain('context.graph.write({');
	expect(arrayLiteralModule?.source).toContain('graphNodeId: "state:items"');
	expect(arrayLiteralModule?.source).toContain('path: []');
	expect(arrayLiteralModule?.source).toContain(
		'value: [context.graph.read("state:nextItem", []), "fallback"]',
	);

	const arraySpreadModule = result.symbolModules.modules.find(
		(module) =>
			module.kind === 'event-handler' && module.source.includes('items = [...nextItems'),
	);

	expect(arraySpreadModule?.source).toContain('context.graph.write({');
	expect(arraySpreadModule?.source).toContain('graphNodeId: "state:items"');
	expect(arraySpreadModule?.source).toContain('path: []');
	expect(arraySpreadModule?.source).toContain(
		'value: [...context.graph.read("state:nextItems", []), context.graph.read("state:nextItem", [])]',
	);

	const objectLiteralModule = result.symbolModules.modules.find(
		(module) =>
			module.kind === 'event-handler' &&
			module.source.includes('settings = { title: menu.title'),
	);

	expect(objectLiteralModule?.source).toContain('context.graph.write({');
	expect(objectLiteralModule?.source).toContain('graphNodeId: "state:settings"');
	expect(objectLiteralModule?.source).toContain('path: []');
	expect(objectLiteralModule?.source).toContain(
		'value: { title: context.graph.read("state:menu", ["title"]), step: context.graph.read("state:profile", ["step"]) }',
	);

	const objectSpreadModule = result.symbolModules.modules.find(
		(module) =>
			module.kind === 'event-handler' &&
			module.source.includes('settings = { ...settings, title: menu.title'),
	);

	expect(objectSpreadModule?.source).toContain('context.graph.write({');
	expect(objectSpreadModule?.source).toContain('graphNodeId: "state:settings"');
	expect(objectSpreadModule?.source).toContain('path: []');
	expect(objectSpreadModule?.source).toContain(
		'value: { ...context.graph.read("state:settings", []), title: context.graph.read("state:menu", ["title"]) }',
	);

	const computedKeyModule = result.symbolModules.modules.find(
		(module) =>
			module.kind === 'event-handler' &&
			module.source.includes('settings = { [menu.title]: profile.step'),
	);

	expect(computedKeyModule?.source).toContain('context.graph.write({');
	expect(computedKeyModule?.source).toContain('graphNodeId: "state:settings"');
	expect(computedKeyModule?.source).toContain('path: []');
	expect(computedKeyModule?.source).toContain(
		'value: { [context.graph.read("state:menu", ["title"])]: context.graph.read("state:profile", ["step"]) }',
	);

	const logicalModule = result.symbolModules.modules.find(
		(module) =>
			module.kind === 'event-handler' &&
			module.source.includes('menu.open &&= profile.enabled'),
	);

	expect(logicalModule?.source).toContain('context.graph.update({');
	expect(logicalModule?.source).toContain('graphNodeId: "state:menu"');
	expect(logicalModule?.source).toContain('path: ["open"]');
	expect(logicalModule?.source).toContain(
		'return value && context.graph.read("state:profile", ["enabled"]);',
	);
});

test('compileTsrxModule emits async computed runner modules without serializing runner source', async () => {
	const result = await compileTsrxModule({
		filename: 'src/AsyncComputed.tsrx',
		source: asyncComputedSource,
		symbols: [],
	});

	const runnerModule = result.symbolModules.modules.find(
		(module) => module.kind === 'async-computed-runner',
	);

	expect(result.protocolState.computed).toEqual([
		{
			graphNodeId: 'computed:details',
			name: 'details',
			async: true,
			dependencies: [{ graphNodeId: 'state:query', path: [] }],
		},
	]);
	expect(JSON.stringify(result.protocolState)).not.toContain('functionSource');
	expect(runnerModule).toMatchObject({
		kind: 'async-computed-runner',
		symbolId: 'symbol:1',
	});
	expect(runnerModule?.source).toContain('const query = read("state:query", []);');
	expect(runnerModule?.source).toContain(
		"const response = await fetch('/api/details/' + q, { signal });",
	);
	expect(result.protocolView.asyncBoundaries[0]?.asyncReads[0]?.runnerSymbolId).toBe('symbol:1');
});
