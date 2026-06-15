import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../src/index.ts';

const moduleScopeSource = `
const leaked = state(0);
export const doubled = computed(() => leaked * 2);

export function App() @{
	<p>ok</p>
}
`;

const asyncPostAwaitReadSource = `
export function UserRoute(route: { params: { userId: string } }) @{
	const settings = state({ locale: 'en' });
	const user = computed(async ({ signal }) => {
		const id = route.params.userId;
		const response = await fetch('/api/users/' + id, { signal });
		return formatUser(response, settings.locale);
	});

	@try {
		<p>{user.name}</p>
	} @pending {
		<p>Loading</p>
	} @catch (error) {
		<p>{error.message}</p>
	}
}
`;

const missingAsyncBoundarySource = `
export function UserRoute() @{
	const user = computed(async ({ signal }) => {
		const response = await fetch('/api/user', { signal });
		return await response.json();
	});

	<p>{user.name}</p>
}
`;

const transitiveAsyncBoundarySource = `
export function UserRoute() @{
	const user = computed(async ({ signal }) => {
		const response = await fetch('/api/user', { signal });
		return await response.json();
	});
	const userName = computed(() => user.name.toUpperCase());

	<p>{userName}</p>
}
`;

const elementHandleDiagnosticsSource = `
export function Handles() @{
	const menu = state({ open: false });
	let input = element<HTMLInputElement>();

	<section>
		<input el={menu} />
		<button el={input}>One</button>
		<button el={input}>Two</button>
	</section>
}
`;

const componentUseSource = `
function ChartWrapper() @{
	<canvas />
}

export function Dashboard() @{
	const config = state({ color: 'red' });

	<section>
		<ChartWrapper use={chart(config)} />
	</section>
}
`;

const unextractableSyncPolicySource = `
export function Form() @{
	const allowSubmit = state(false);

	<form>
		<button
			onClick={(event) => {
				if (canSubmit(allowSubmit, event)) {
					event.preventDefault();
				}
			}}
		>
			Save
		</button>
	</form>
}
`;

test('buildSemanticGraph reports module-scope graph state creation', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/ModuleScope.tsrx',
		source: moduleScopeSource,
	});
	const stateStart = moduleScopeSource.indexOf('state(0)');
	const computedStart = moduleScopeSource.indexOf('computed(() => leaked * 2)');

	expect(graph.components).toEqual([{ name: 'App' }]);
	expect(graph.graphBindings).toEqual([]);
	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'AA_STATE_MODULE_SCOPE',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'state() and computed() cannot be created at module scope',
			message: 'Cannot create "leaked" with state() at module scope.',
			why: 'Module-scope graph state would be shared across requests and has no per-document serialization payload.',
			primarySpan: {
				filename: 'src/ModuleScope.tsrx',
				start: stateStart,
				end: stateStart + 'state(0)'.length,
			},
			suggestions: [
				{
					message:
						'Move state() or computed() creation into a component or declare request/container/page state with shared().',
				},
			],
			docsUrl: 'https://async.await.dev/errors/AA_STATE_MODULE_SCOPE',
		}),
		expect.objectContaining({
			code: 'AA_STATE_MODULE_SCOPE',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'state() and computed() cannot be created at module scope',
			message: 'Cannot create "doubled" with computed() at module scope.',
			primarySpan: {
				filename: 'src/ModuleScope.tsrx',
				start: computedStart,
				end: computedStart + 'computed(() => leaked * 2)'.length,
			},
			docsUrl: 'https://async.await.dev/errors/AA_STATE_MODULE_SCOPE',
		}),
	]);
});

test('buildSemanticGraph reports unextractable synchronous event policy', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Form.tsrx',
		source: unextractableSyncPolicySource,
	});
	const actionStart = unextractableSyncPolicySource.indexOf('event.preventDefault()');

	expect(graph.events).toEqual([
		expect.objectContaining({
			eventName: 'click',
			hasSyncPolicyCandidate: true,
			syncPolicy: undefined,
		}),
	]);
	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'AA_SYNC_POLICY_UNEXTRACTABLE',
			severity: 'error',
			phase: 'sync-policy',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'Cannot extract synchronous event policy',
			message:
				'Cannot extract a synchronous preventDefault policy for onClick because the guard is not limited to graph state, event fields, props, and constants.',
			why: 'preventDefault() and stopPropagation() must run before lazy handler symbols load. The compiler can only emit a synchronous policy when the condition is fully represented in the resumable graph/event data plane.',
			primarySpan: {
				filename: 'src/Form.tsrx',
				start: actionStart,
				end: actionStart + 'event.preventDefault()'.length,
			},
			suggestions: [
				{
					message:
						'Move the browser-critical condition into graph state and simple event-field comparisons, or remove preventDefault()/stopPropagation() from the lazy handler.',
				},
			],
			docsUrl: 'https://async.await.dev/errors/AA_SYNC_POLICY_UNEXTRACTABLE',
		}),
	]);
});

test('buildSemanticGraph reports reactive reads after await in async computed bodies', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/UserRoute.tsrx',
		source: asyncPostAwaitReadSource,
	});
	const invalidReadStart = asyncPostAwaitReadSource.indexOf('settings.locale');

	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'AA_ASYNC_POST_AWAIT_READ',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'Reactive reads after await are not resumable',
			message:
				'Cannot read "settings.locale" after await in async computed "user". Snapshot the value before awaiting.',
			why: 'Async computed dependency keys are captured before the first await. Reading graph state after suspension would make revalidation and resume depend on hidden async timing.',
			primarySpan: {
				filename: 'src/UserRoute.tsrx',
				start: invalidReadStart,
				end: invalidReadStart + 'settings.locale'.length,
			},
			suggestions: [
				{
					message:
						'Read the graph value before the first await, or split post-await formatting into a separate sync computed().',
				},
			],
			docsUrl: 'https://async.await.dev/errors/AA_ASYNC_POST_AWAIT_READ',
		}),
	]);
	expect(graph.diagnostics).not.toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: 'AA_ASYNC_POST_AWAIT_READ',
				message: expect.stringContaining('route.params.userId'),
			}),
		]),
	);
});

test('buildSemanticGraph reports async computed template reads outside async boundaries', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/MissingBoundary.tsrx',
		source: missingAsyncBoundarySource,
	});
	const invalidReadStart = missingAsyncBoundarySource.indexOf('user.name');

	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'AA_ASYNC_BOUNDARY_REQUIRED',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'Async computed reads need an async boundary',
			message:
				'Cannot read async computed "user.name" outside @try/@pending/@catch. Wrap the read in an async boundary.',
			why: 'Async computed values can be pending or rejected during initial render and resume. The runtime needs an explicit TSRX async boundary to render pending and error UI.',
			primarySpan: {
				filename: 'src/MissingBoundary.tsrx',
				start: invalidReadStart,
				end: invalidReadStart + 'user.name'.length,
			},
			suggestions: [
				{
					message:
						'Wrap this template read in @try with @pending and @catch branches, or read a sync computed that is already guarded by an async boundary.',
				},
			],
			docsUrl: 'https://async.await.dev/errors/AA_ASYNC_BOUNDARY_REQUIRED',
		}),
	]);
});

test('buildSemanticGraph reports sync computed reads that transitively depend on async computeds', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/TransitiveBoundary.tsrx',
		source: transitiveAsyncBoundarySource,
	});
	const invalidReadStart = transitiveAsyncBoundarySource.indexOf('userName}</p>');

	expect(graph.graphBindings).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				name: 'userName',
				kind: 'computed',
				async: false,
				asyncCapable: true,
				dependencies: [
					{
						source: 'user.name',
						bindingId: 'computed:user',
						path: ['name'],
					},
				],
			}),
		]),
	);
	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'AA_ASYNC_BOUNDARY_REQUIRED',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'Async computed reads need an async boundary',
			message:
				'Cannot read async-capable computed "userName" outside @try/@pending/@catch. Wrap the read in an async boundary.',
			primarySpan: {
				filename: 'src/TransitiveBoundary.tsrx',
				start: invalidReadStart,
				end: invalidReadStart + 'userName'.length,
			},
			docsUrl: 'https://async.await.dev/errors/AA_ASYNC_BOUNDARY_REQUIRED',
		}),
	]);
});

test('buildSemanticGraph reports invalid and duplicate element handle bindings', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Handles.tsrx',
		source: elementHandleDiagnosticsSource,
	});
	const invalidHandleStart = elementHandleDiagnosticsSource.indexOf('menu} />');
	const duplicateHandleStart = elementHandleDiagnosticsSource.lastIndexOf('input}>Two');

	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'AA_ELEMENT_HANDLE_REQUIRED',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'el expects an element() handle',
			message: 'Cannot bind el={menu} because "menu" is state(), not an element() handle.',
			why: 'DOM elements are host resources. el can only bind element() handles so resume can recover the current DOM locator without serializing a DOM node.',
			primarySpan: {
				filename: 'src/Handles.tsrx',
				start: invalidHandleStart,
				end: invalidHandleStart + 'menu'.length,
			},
			elementLocator: 'h1',
			suggestions: [
				{
					message:
						'Create a handle with element<T>() and bind that handle with el={handle}. Keep DOM-backed resources in use={...}.',
				},
			],
			docsUrl: 'https://async.await.dev/errors/AA_ELEMENT_HANDLE_REQUIRED',
		}),
		expect.objectContaining({
			code: 'AA_ELEMENT_HANDLE_DUPLICATE',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'element() handle is bound more than once',
			message: 'Cannot bind element handle "input" to multiple live host elements.',
			why: 'A resumed element handle must resolve to one current DOM locator. Binding one handle to multiple live elements would make lazy event code ambiguous.',
			primarySpan: {
				filename: 'src/Handles.tsrx',
				start: duplicateHandleStart,
				end: duplicateHandleStart + 'input'.length,
			},
			elementLocator: 'h3',
			suggestions: [
				{
					message:
						'Create a separate element() handle for each host element, or move repeated element access into keyed state and behavior records.',
				},
			],
			docsUrl: 'https://async.await.dev/errors/AA_ELEMENT_HANDLE_DUPLICATE',
		}),
	]);
});

test('buildSemanticGraph reports use on components instead of treating it as a host behavior', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Dashboard.tsrx',
		source: componentUseSource,
	});
	const behaviorStart = componentUseSource.indexOf('chart(config)');

	expect(graph.behaviors).toEqual([]);
	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'AA_USE_HOST_ELEMENT_REQUIRED',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			title: 'use can only be bound to host elements',
			message:
				'Cannot bind use={chart(config)} on component <ChartWrapper>. use installs DOM behavior and needs a concrete host element owner.',
			why: 'Element behaviors are resumed by locating the owning DOM element. A component is not a DOM locator and may render zero, one, or many host nodes.',
			primarySpan: {
				filename: 'src/Dashboard.tsrx',
				start: behaviorStart,
				end: behaviorStart + 'chart(config)'.length,
			},
			suggestions: [
				{
					message:
						'Move use={...} to a host element such as <canvas>, or make the component forward behavior to a known host element in its own TSRX body.',
				},
			],
			docsUrl: 'https://async.await.dev/errors/AA_USE_HOST_ELEMENT_REQUIRED',
		}),
	]);
});
