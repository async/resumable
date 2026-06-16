import { render } from '@async/resumable/runtime';
import { loadSymbol, payloadScripts } from './root.tsrx';

const app = document.querySelector('#app');
if (!app) {
	throw new Error('Expected #app target for CSR render.');
}

const status = document.createElement('p');
status.dataset.status = '';
status.textContent = 'ready';

const host = document.createElement('section');
host.dataset.dashboard = '';
host.textContent = 'ready';

await render(
	() => {
		return {
			root: host,
			state: payloadScripts.state,
			view: payloadScripts.view,
			loadSymbol,
		};
	},
	{
		target: app,
	},
);
app.appendChild(status);
