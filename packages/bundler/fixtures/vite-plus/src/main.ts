import { resumeFromPayloadScripts } from '@async/resumable/runtime';
import { loadSymbol, payloadScripts } from './root.tsrx';

const status = document.createElement('p');
status.dataset.status = '';
status.textContent = 'ready';

const host = document.createElement('section');
host.dataset.dashboard = '';
host.textContent = 'ready';

document.querySelector('#app')?.replaceChildren(host, status);

await resumeFromPayloadScripts({
	stateScript: payloadScripts.stateScript,
	viewScript: payloadScripts.viewScript,
	root: host,
	loadSymbol,
});
