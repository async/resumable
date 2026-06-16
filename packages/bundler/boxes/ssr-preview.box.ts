import { box } from '@async/witness';

// Product truth: SSR resumability needs server-produced HTML. This box uses the
// fixture's real Vite app build, then serves it through Vite preview. Preview
// must run the built server entry for HTML requests; the box must not rewrite
// built HTML to make the assertion pass.
const FIXTURE = 'fixtures/vite-ssr';
const INDEX = `${FIXTURE}/dist/index.html`;
const COUNTER = '[data-counter]';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'ssr preview: built server entry shell resumes counter click',
		tags: ['ssr', 'build', 'preview', 'browser'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				mode: 'ssr',
			}),
		});

		await expect.build.environment(build, 'client');
		await expect.build.environment(build, 'ssr');
		await expect.build.artifact(build, INDEX);

		const preview = await pipeline.preview(build, {
			config: (config) => ({
				...config,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});
		const html = await preview.request('/');
		await expect.html.contains(html, 'data-counter');
		await expect.html.contains(html, 'type="async/state"');
		await expect.html.contains(html, 'type="async/view"');

		const page = await preview.browser.visit('/');

		await expect.page.text(page, COUNTER, '0', WAIT);
		await page.click(COUNTER, WAIT);
		await expect.page.text(page, COUNTER, '1', WAIT);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);

		await preview.close();
		await receipt.capture('ssr preview resumed server entry shell counter click');
	},
);
