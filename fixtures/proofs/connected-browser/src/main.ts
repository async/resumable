import fixtureSource from '../../bundler-pipeline/src/App.tsrx?raw';
import { transformTsrxForBundler } from '../../../../packages/compiler/src/index.ts';
import { createConnectedBrowserPageFromBundlerOutput } from '../../../../packages/runtime/src/index.ts';

const fixturePath = 'fixtures/proofs/bundler-pipeline/src/App.tsrx';
const artifact = await transformTsrxForBundler({
	filename: fixturePath,
	source: fixtureSource,
});
const connectedPage = createConnectedBrowserPageFromBundlerOutput({
	artifact,
});
const app = document.querySelector<HTMLElement>('#app');

if (!app) {
	throw new Error('Connected browser proof root #app is missing.');
}

app.innerHTML = connectedPage.html;
await connectedPage.load();
await connectedPage.resume();
syncDom();

app.addEventListener(
	'click',
	async (event) => {
		const target = event.target;

		if (!(target instanceof Element) || target.id !== 'select-symbol') return;

		await connectedPage.dispatch('click', 'select-symbol');
		syncDom();
	},
	true,
);

app.addEventListener(
	'keydown',
	async (event) => {
		const target = event.target;

		if (!(target instanceof Element) || target.id !== 'filter-input') return;

		const result = await connectedPage.dispatch('keydown', 'filter-input', {
			key: event.key,
		});

		if (result.defaultPrevented) {
			event.preventDefault();
		}

		syncDom();
	},
	true,
);

Object.assign(globalThis, {
	__asyncConnectedBrowserPoc: {
		page: connectedPage,
		click: async () => {
			const result = await connectedPage.dispatch('click', 'select-symbol');
			syncDom();
			return result;
		},
		keydownEscape: async () => {
			const result = await connectedPage.dispatch('keydown', 'filter-input', {
				key: 'Escape',
			});
			syncDom();
			return result;
		},
		receipts: () => connectedPage.receipts(),
		graph: () => connectedPage.graph(),
		domJournal: () => connectedPage.domJournal(),
		constraints: () => connectedPage.constraints(),
	},
});

void runBrowserProof();

function syncDom(): void {
	const label = document.querySelector<HTMLElement>('#pipeline-label');
	const root = document.querySelector<HTMLElement>('#page-root');
	const output = document.querySelector<HTMLElement>('#journal-output');

	if (label) {
		label.textContent = connectedPage.text('pipeline-label') ?? '';
	}

	if (root) {
		const open = connectedPage.attr('page-root', 'data-open');
		const selected = connectedPage.attr('page-root', 'data-selected');

		if (open !== undefined) root.dataset.open = open;
		if (selected !== undefined) root.dataset.selected = selected;
	}

	if (output) {
		output.textContent = JSON.stringify(connectedPage.receipts(), null, 2);
	}
}

async function runBrowserProof(): Promise<void> {
	await waitForBrowserFrame();

	document.querySelector<HTMLElement>('#select-symbol')?.click();

	const keydown = new KeyboardEvent('keydown', {
		key: 'Escape',
		bubbles: true,
		cancelable: true,
	});
	document.querySelector<HTMLElement>('#filter-input')?.dispatchEvent(keydown);

	await waitForBrowserFrame();

	const params = new URLSearchParams(location.search);
	const proof = {
		runId: params.get('runId') ?? 'manual',
		label: document.querySelector('#pipeline-label')?.textContent ?? '',
		rootAttrs: {
			open: document.querySelector<HTMLElement>('#page-root')?.dataset.open,
			selected: document.querySelector<HTMLElement>('#page-root')?.dataset.selected,
		},
		keydownDefaultPrevented: keydown.defaultPrevented,
		graph: connectedPage.graph(),
		domJournal: connectedPage.domJournal(),
		receipts: connectedPage.receipts(),
		constraints: connectedPage.constraints(),
	};

	await fetch('/__async_connected_browser_receipts', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify(proof, null, 2),
	});
}

function waitForBrowserFrame(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => resolve());
	});
}
