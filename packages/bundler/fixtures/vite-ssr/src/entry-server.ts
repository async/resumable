import { payloadScripts } from './root.tsrx';
import { renderServerShell } from './render-shell.ts';

export function render(clientEntry = ''): string {
	return renderServerShell(payloadScripts, clientEntry);
}
