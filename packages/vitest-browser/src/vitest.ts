import { afterEach, beforeEach } from 'vitest';
import { page } from 'vitest/browser';
import { cleanup, render } from './index.ts';

page.extend({
	render,
	[Symbol.for('vitest:component-cleanup')]: cleanup,
});

beforeEach(async () => {
	await cleanup();
});

afterEach(async () => {
	await cleanup();
});

export { cleanup, render } from './index.ts';
export type { BrowserRenderOptions, BrowserRenderResult } from './index.ts';

declare module 'vitest/browser' {
	interface BrowserPage {
		render: typeof render;
	}
}
