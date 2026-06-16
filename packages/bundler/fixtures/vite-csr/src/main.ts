import { render } from '@async/resumable/runtime/render';
import { loadSymbol, payloadScripts } from './root.tsrx';

const app = document.querySelector('#app');
if (!app) {
	throw new Error('Expected #app target for CSR render.');
}

const status = document.createElement('p');
status.id = 'hmr-status';
status.textContent = 'ready';

const counter = document.createElement('button');

counter.type = 'button';
counter.dataset.counter = '';
counter.textContent = '0';

await render(
	() => {
		return {
			root: counter,
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

if (import.meta.hot) {
	document.addEventListener('async-resumable:update', (event) => {
		event.preventDefault();
		status.textContent = event.type;
	});
}
