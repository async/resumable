import { expect, test } from 'vitest';
import { asyncResumableVite } from '../src/index.ts';

test('asyncResumableVite wraps the Rolldown plugin behavior', async () => {
	const plugin = asyncResumableVite({
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

	expect(plugin.name).toBe('@async/resumable/vite');
	expect(plugin.basePluginName).toBe('@async/resumable/rolldown');
	expect(transformed?.code).toContain('export const __async_resumable_module');
	expect(plugin.load?.('\0async-resumable/payload:/src/App.tsrx')).toContain(
		'<script type="async/state">',
	);
});
