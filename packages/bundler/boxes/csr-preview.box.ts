import { box } from '@async/witness';

// Product truth: the Vite CSR fixture's production output is not only emitted
// correctly; it can be served by Vite preview and load the generated client
// payload/resolver/symbol pipeline for a counter click. This is client-created
// DOM, not a resumability proof.
const FIXTURE = 'fixtures/vite-csr';
const INDEX = `${FIXTURE}/dist/index.html`;
const COUNTER = '[data-counter]';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'csr preview: built app loads through vite preview',
		tags: ['csr', 'preview'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});

		await expect.build.environment(build, 'client');
		await expect.build.artifact(build, INDEX);

		const preview = await pipeline.preview(build, {
			config: (config) => ({
				...config,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});
		const page = await preview.browser.visit('/');

		await expect.page.exists(page, '#app', WAIT);
		await expect.page.text(page, '#hmr-status', 'ready', WAIT);
		await expect.page.text(page, COUNTER, '0', WAIT);
		await page.click(COUNTER, WAIT);
		await expect.page.text(page, COUNTER, '1', WAIT);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);

		await receipt.capture('csr preview loaded client counter click');
	},
);
