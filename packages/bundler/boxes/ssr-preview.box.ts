import { box } from '@async/witness';

// Product truth: SSR resumability needs server-produced HTML. This box uses the
// fixture's real Vite app build, then serves it through Vite preview. Preview
// must run the built server entry for HTML requests; the box must not rewrite
// built HTML to make the assertion pass.
const FIXTURE = 'fixtures/vite-ssr';
const INDEX = `${FIXTURE}/dist/index.html`;
const COUNTER = '[data-counter]';
const REQUESTS = '/__async-resumable-fixture-requests';
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
		await expect.html.contains(html, 'data-async-resumer');
		assertHtmlHasNoExternalScripts(html);

		const page = await preview.browser.visit('/');

		await expect.page.text(page, COUNTER, '0', WAIT);
		const beforeInteraction = await readScriptRequests(preview);
		receipt.note(`SSR startup script requests: ${formatRequests(beforeInteraction)}`);
		assertNoScriptsLoaded(beforeInteraction);

		await page.click(COUNTER, WAIT);
		await expect.page.text(page, COUNTER, '1', WAIT);
		const afterInteraction = await readScriptRequests(preview);
		receipt.note(`SSR interaction script requests: ${formatRequests(afterInteraction)}`);
		assertScriptsLoadedAfterInteraction(beforeInteraction, afterInteraction);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);

		await preview.close();
		await receipt.capture('ssr preview resumed server entry shell counter click');
	},
);

type ScriptRequestLog = {
	readonly scripts: readonly string[];
};

type Requestable = {
	request(path: string): Promise<string>;
};

function assertHtmlHasNoExternalScripts(html: string): void {
	if (/<script\b[^>]*\bsrc=/.test(html) || /rel="modulepreload"/.test(html)) {
		throw new Error('Expected SSR HTML to ship only the inline resumer before interaction.');
	}
}

async function readScriptRequests(server: Requestable): Promise<ScriptRequestLog> {
	return JSON.parse(await server.request(REQUESTS)) as ScriptRequestLog;
}

function formatRequests(log: ScriptRequestLog): string {
	return log.scripts.length === 0 ? '(none)' : log.scripts.join(', ');
}

function assertNoScriptsLoaded(log: ScriptRequestLog): void {
	if (log.scripts.length !== 0) {
		throw new Error(
			`Expected SSR browser startup to request no JavaScript modules, but saw: ${log.scripts.join(', ')}`,
		);
	}
}

function assertScriptsLoadedAfterInteraction(
	beforeInteraction: ScriptRequestLog,
	afterInteraction: ScriptRequestLog,
): void {
	const loadedAfterInteraction = afterInteraction.scripts.slice(beforeInteraction.scripts.length);
	if (loadedAfterInteraction.length === 0) {
		throw new Error(
			'Expected first interaction to request the lazy SSR resume JavaScript module.',
		);
	}
	if (!loadedAfterInteraction.some((path) => path.includes('/build/async-'))) {
		throw new Error(
			`Expected first interaction to request built async chunks, but saw: ${loadedAfterInteraction.join(', ')}`,
		);
	}
}
