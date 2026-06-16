import {
	ASYNC_PROTOCOL_VERSION,
	type ProtocolStatePayload,
	type ProtocolViewPayload,
} from '@async/resumable-protocol';
import { renderPayloadScripts } from '@async/resumable-serializer';
import { createRuntimeGraph, type RuntimeGraph } from './graph.ts';
import { createRuntimeGraphFromStatePayload } from './payload.ts';
import {
	createResumeRuntime,
	type ResumeDomElement,
	type ResumeRuntime,
	type ResumeRuntimeInput,
	type ResumeSymbol,
} from './resume.ts';

export type RenderTarget = {
	readonly replaceChildren?: (...children: ReadonlyArray<ResumeDomElement>) => void;
	readonly appendChild?: (child: ResumeDomElement) => unknown;
};

export type CsrRenderOutput = {
	readonly root: ResumeDomElement;
	readonly graph?: RuntimeGraph;
	readonly state?: ProtocolStatePayload;
	readonly view?: ProtocolViewPayload;
	readonly loadSymbol?: ResumeRuntimeInput['loadSymbol'];
};

export type CsrRenderOptions = {
	readonly target: RenderTarget;
	readonly loadSymbol?: ResumeRuntimeInput['loadSymbol'];
	readonly createVisibilityObserver?: ResumeRuntimeInput['createVisibilityObserver'];
	readonly applyDomJournal?: ResumeRuntimeInput['applyDomJournal'];
};

export type CsrRenderContainer = {
	readonly phase: 'csr';
	readonly root: ResumeDomElement;
	readonly graph: RuntimeGraph;
	readonly runtime: ResumeRuntime;
	readonly payloadScripts?: undefined;
	readonly resumerScript?: undefined;
};

export type SsrRenderOutput = {
	readonly html: string;
	readonly state?: ProtocolStatePayload;
	readonly view?: ProtocolViewPayload;
};

export type RenderToStringOptions = {
	readonly nonce?: string;
	readonly resumeModuleUrl?: string;
	readonly resumerSource?: string;
	readonly containerId?: string;
};

export async function render(
	component: () => CsrRenderOutput,
	options: CsrRenderOptions,
): Promise<CsrRenderContainer> {
	const output = component();
	const graph =
		output.graph ??
		(output.state
			? createRuntimeGraphFromStatePayload(output.state)
			: createRuntimeGraph({ cells: [] }));
	const view = output.view ?? emptyViewPayload();
	const runtime = createResumeRuntime({
		root: output.root,
		graph,
		view,
		loadSymbol: output.loadSymbol ?? options.loadSymbol ?? missingLoadSymbol,
		createVisibilityObserver: options.createVisibilityObserver,
		applyDomJournal: options.applyDomJournal,
	});

	mountRoot(options.target, output.root);
	await runtime.start();

	return {
		phase: 'csr',
		root: output.root,
		graph,
		runtime,
	};
}

export function renderToString(
	component: () => SsrRenderOutput,
	options: RenderToStringOptions = {},
): string {
	const output = component();
	const hasPayload = !!output.state || !!output.view;
	const state = output.state ?? emptyStatePayload();
	const view = containerScopedView(output.view ?? emptyViewPayload());
	const payloadScripts = hasPayload ? renderPayloadScripts({ state, view }) : undefined;
	const resumerScript =
		hasPayload && hasBrowserTriggers(view)
			? renderInlineResumerScript(
					options.resumerSource ?? defaultInlineResumerSource(options.resumeModuleUrl),
					options.nonce,
				)
			: '';

	return [
		`<div${renderContainerAttributes(options.containerId)}>`,
		output.html,
		payloadScripts?.stateScript,
		payloadScripts?.viewScript,
		resumerScript,
		'</div>',
	]
		.filter(Boolean)
		.join('');
}

function mountRoot(target: RenderTarget, root: ResumeDomElement): void {
	if (target.replaceChildren) {
		target.replaceChildren(root);
		return;
	}
	if (target.appendChild) {
		target.appendChild(root);
		return;
	}
	throw new TypeError(
		'render(App, { target }) requires a target that can receive the root node.',
	);
}

function hasBrowserTriggers(view: ProtocolViewPayload): boolean {
	return (
		view.events.length > 0 ||
		view.behaviors.some((behavior) => !!behavior.symbolId) ||
		view.asyncBoundaries.some((boundary) =>
			boundary.asyncReads.some((read) => !!read.runnerSymbolId),
		)
	);
}

function containerScopedView(view: ProtocolViewPayload): ProtocolViewPayload {
	return {
		...view,
		locators: view.locators.map((locator) => ({
			...locator,
			index: locator.index + 1,
		})),
	};
}

function renderContainerAttributes(containerId: string | undefined): string {
	return containerId
		? ` data-async-container="${escapeAttribute(containerId)}"`
		: ' data-async-container';
}

function renderInlineResumerScript(source: string, nonce: string | undefined): string {
	const nonceAttribute = nonce ? ` nonce="${escapeAttribute(nonce)}"` : '';
	return `<script data-async-resumer${nonceAttribute}>${escapeInlineScript(source)}</script>`;
}

function emptyStatePayload(): ProtocolStatePayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		cells: [],
		computed: [],
	};
}

function emptyViewPayload(): ProtocolViewPayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}

function missingLoadSymbol(symbolId: string): ResumeSymbol {
	throw new Error(`Cannot load async symbol ${symbolId} without a generated symbol resolver.`);
}

function defaultInlineResumerSource(resumeModuleUrl: string | undefined): string {
	if (!resumeModuleUrl) {
		return '(() => {})();';
	}

	return `(() => {
	const d = document;
	const s = d.currentScript;
	const r = s && s.closest('[data-async-container]');
	if (!r) return;
	const p = r.querySelector('script[type="async/view"]');
	if (!p) return;
	const v = JSON.parse(p.textContent || 'null');
	const w = d.createTreeWalker(r, 1);
	const n = [r];
	let x;
	while ((x = w.nextNode())) n.push(x);
	const h = new Map(v.locators.map((l) => [l.index, l.hostNodeId]));
	const m = new Map();
	let started = false;
	for (const e of v.events) {
		if (e.eventName === 'visible') continue;
		const k = e.hostNodeId + '\\n' + e.eventName;
		m.set(k, e);
	}
	for (const t of new Set(v.events.map((e) => e.eventName).filter((e) => e !== 'visible'))) {
		r.addEventListener(t, async (e) => {
			if (started) return;
			for (let a = e.target; a; a = a.parentElement) {
				const id = h.get(n.indexOf(a));
				const record = id && m.get(id + '\\n' + e.type);
				if (record) {
					started = true;
					const mod = await import(${JSON.stringify(resumeModuleUrl)});
					await mod.resumeContainerEvent({ root: r, event: e, element: a, eventRecord: record });
					break;
				}
				if (a === r) break;
			}
		}, true);
	}
})();`;
}

function escapeAttribute(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeInlineScript(value: string): string {
	return value.replace(/<\/script/gi, '<\\/script');
}
