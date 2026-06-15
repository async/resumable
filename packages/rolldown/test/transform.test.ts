import { expect, test } from 'vitest';
import { asyncResumableRolldown, transformTsrxModule } from '../src/index.ts';

const source = `
export function App() @{
	let count = state(1);
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
		<button onClick={() => count++}>{count}</button>
	</section>
}
`;

test('asyncResumableRolldown exposes a Rolldown-first plugin identity', () => {
	const plugin = asyncResumableRolldown({
		symbols: [],
	});

	expect(plugin.name).toBe('@async/resumable/rolldown');
});

test('asyncResumableRolldown routes .tsrx transforms and virtual module loads', async () => {
	const plugin = asyncResumableRolldown({
		symbols: [
			{
				id: 'symbol:0',
				chunk: '/assets/app.handlers.js',
				exportName: 'onClick_0',
			},
			{
				id: 'symbol:1',
				chunk: '/assets/app.bindings.js',
				exportName: 'buttonText_1',
			},
		],
	});

	const transformed = await plugin.transform?.(
		`export function App() @{ let count = state(1); <button onClick={() => count++}>{count}</button> }`,
		'/src/App.tsrx',
	);

	expect(transformed?.code).toContain('export const __async_resumable_module');
	expect(plugin.load?.('\0async-resumable/resolver:/src/App.tsrx')).toContain(
		'return import("/assets/app.handlers.js")',
	);
	expect(plugin.load?.('\0async-resumable/payload:/src/App.tsrx')).toContain(
		'<script type="async/state">',
	);
});

test('asyncResumableRolldown normalizes .tsrx ids before planning virtual modules', async () => {
	const plugin = asyncResumableRolldown({
		symbols: [
			{
				id: 'symbol:0',
				chunk: '/assets/app.handlers.js',
				exportName: 'onClick_0',
			},
		],
	});

	const transformed = await plugin.transform?.(
		`export function App() @{ let count = state(1); <button onClick={() => count++}>{count}</button> }`,
		'/src/routes/../App.tsrx?async-resumable&type=component',
	);

	expect(transformed?.code).toContain('"source":"/src/App.tsrx"');
	expect(plugin.load?.('\0async-resumable/resolver:/src/App.tsrx')).toContain(
		'return import("/assets/app.handlers.js")',
	);
	expect(plugin.load?.('\0async-resumable/payload:/src/App.tsrx')).toContain(
		'<script type="async/state">',
	);
});

test('transformTsrxModule compiles .tsrx source into virtual build artifacts', async () => {
	const result = await transformTsrxModule({
		id: '/src/App.tsrx',
		code: source,
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
				chunk: '/assets/app.bindings.js',
				exportName: 'buttonText_2',
			},
		],
	});

	expect(result.id).toBe('/src/App.tsrx');
	expect(result.code).toContain('export const __async_resumable_module');
	expect(result.code).toContain('"source":"/src/App.tsrx"');
	expect(result.code).toContain('"resolver":"\\u0000async-resumable/resolver:/src/App.tsrx"');
	expect(result.virtualModules).toEqual([
		{
			id: '\0async-resumable/resolver:/src/App.tsrx',
			kind: 'symbol-resolver',
			code: expect.stringContaining('return import("/assets/app.handlers.js")'),
		},
		{
			id: '\0async-resumable/payload:/src/App.tsrx',
			kind: 'payload',
			code: expect.stringContaining('<script type="async/state">'),
		},
	]);
	expect(result.manifest).toEqual(
		expect.objectContaining({
			moduleId: '/src/App.tsrx',
			symbolIds: ['symbol:0', 'symbol:1', 'symbol:2'],
			virtualModuleIds: [
				'\0async-resumable/resolver:/src/App.tsrx',
				'\0async-resumable/payload:/src/App.tsrx',
			],
		}),
	);
});
