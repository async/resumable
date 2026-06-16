import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
	createFetchableDevEnvironment,
	createServerHotChannel,
	createServerModuleRunner,
	type EnvironmentOptions,
	type FetchableDevEnvironment,
	type Plugin,
} from 'vite';

type CreateEnvironment = NonNullable<NonNullable<EnvironmentOptions['dev']>['createEnvironment']>;
type SsrRunner = ReturnType<typeof createServerModuleRunner>;

type SsrEntry = {
	render: (clientEntry?: string) => string | Promise<string>;
};

type DevRequest = {
	url?: string;
	method?: string;
	headers: Record<string, string | string[] | undefined>;
};

type DevResponse = {
	statusCode: number;
	statusMessage: string;
	setHeader(name: string, value: string): void;
	end(body?: Uint8Array): void;
};

const CLIENT_ENTRY = '<script type="module" src="/src/entry-client.ts"></script>';

// Fixture-only SSR host. Real apps should provide this from a runtime adapter
// or meta-framework; the async-resumable bundler only needs SSR artifacts.
export function fixtureSsrHost(): Plugin {
	return {
		name: 'fixture:async-resumable-ssr-host',
		config() {
			return {
				environments: {
					ssr: {
						dev: {
							createEnvironment: ((name, config) => {
								let runner: SsrRunner | undefined;
								const environment = createFetchableDevEnvironment(name, config, {
									hot: true,
									transport: createServerHotChannel(),
									handleRequest(request) {
										runner ??= createServerModuleRunner(environment);
										return renderDevRequest(runner, request);
									},
								});
								const close = environment.close.bind(environment);
								environment.close = async () => {
									await runner?.close();
									await close();
								};
								return environment;
							}) satisfies CreateEnvironment,
						},
					},
				},
			};
		},
		configureServer(server) {
			server.middlewares.use(async (incomingRequest, outgoingResponse, next) => {
				const request = incomingRequest as DevRequest;
				if (!shouldRenderHtml(request)) {
					next();
					return;
				}

				try {
					const environment = server.environments.ssr as FetchableDevEnvironment;
					const response = await environment.dispatchFetch(toFetchRequest(request));
					await sendResponse(outgoingResponse as DevResponse, response);
				} catch (error) {
					server.ssrFixStacktrace(error as Error);
					next(error);
				}
			});
		},
		configurePreviewServer(server) {
			server.middlewares.use(async (incomingRequest, outgoingResponse, next) => {
				const request = incomingRequest as DevRequest;
				if (!shouldRenderHtml(request)) {
					next();
					return;
				}

				try {
					const response = await renderPreviewRequest(
						server.config.root,
						server.config.build.outDir,
					);
					await sendResponse(outgoingResponse as DevResponse, response);
				} catch (error) {
					next(error);
				}
			});
		},
	};
}

async function renderDevRequest(runner: SsrRunner, request: Request) {
	const url = new URL(request.url);
	if (url.pathname !== '/' && url.pathname !== '/index.html') {
		return new Response('Not found', { status: 404 });
	}

	const entry = (await runner.import('/src/entry-server.ts')) as SsrEntry;
	return new Response(await entry.render(CLIENT_ENTRY), {
		headers: { 'Content-Type': 'text/html;charset=utf-8' },
	});
}

async function renderPreviewRequest(root: string, outDir: string) {
	const dist = resolve(root, outDir);
	const index = await readFile(resolve(dist, 'index.html'), 'utf8');
	const clientEntry = index
		.split('\n')
		.filter((line) => line.includes('/build/async-'))
		.join('\n');
	const entry = (await import(
		`${pathToFileURL(resolve(dist, 'server/entry-server.js')).href}?preview=${Date.now()}`
	)) as SsrEntry;

	return new Response(await entry.render(clientEntry), {
		headers: { 'Content-Type': 'text/html;charset=utf-8' },
	});
}

function shouldRenderHtml(request: DevRequest) {
	if (!request.url || request.method !== 'GET') {
		return false;
	}

	const pathname = new URL(request.url, requestOrigin(request)).pathname;
	if (pathname !== '/' && pathname !== '/index.html') {
		return false;
	}

	const accept = request.headers.accept;
	return typeof accept !== 'string' || accept.includes('text/html') || accept.includes('*/*');
}

function toFetchRequest(request: DevRequest) {
	return new Request(new URL(request.url ?? '/', requestOrigin(request)), {
		headers: toFetchHeaders(request.headers),
		method: request.method,
	});
}

function toFetchHeaders(headers: DevRequest['headers']) {
	const next = new Headers();
	for (const [name, value] of Object.entries(headers)) {
		if (Array.isArray(value)) {
			for (const item of value) next.append(name, item);
		} else if (value) {
			next.set(name, value);
		}
	}
	return next;
}

function requestOrigin(request: DevRequest) {
	const host = typeof request.headers.host === 'string' ? request.headers.host : 'localhost';
	return `http://${host}`;
}

async function sendResponse(response: DevResponse, rendered: Response) {
	response.statusCode = rendered.status;
	response.statusMessage = rendered.statusText;
	for (const [name, value] of rendered.headers) {
		response.setHeader(name, value);
	}
	response.end(new Uint8Array(await rendered.arrayBuffer()));
}
