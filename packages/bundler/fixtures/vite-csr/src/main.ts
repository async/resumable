import { resumeFromPayloadScripts } from '@async/resumable/runtime';
import { loadSymbol, payloadScripts } from './root.tsrx';

const status = document.createElement('p');
status.id = 'hmr-status';
status.textContent = 'ready';

const counter = document.createElement('button');

counter.type = 'button';
counter.dataset.counter = '';
counter.textContent = '0';

document.querySelector('#app')?.replaceChildren(counter, status);

await resumeFromPayloadScripts({
	stateScript: payloadScripts.stateScript,
	viewScript: payloadScripts.viewScript,
	root: counter,
	loadSymbol,
});

if (import.meta.hot) {
	document.addEventListener('async-resumable:update', (event) => {
		event.preventDefault();
		status.textContent = event.type;
	});
}
