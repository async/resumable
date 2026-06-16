import { payloadScripts } from './root.tsrx';
import { renderServerShell } from './render-shell.ts';

export function render(resumeModuleUrl = ''): string {
	return renderServerShell(payloadScripts, resumeModuleUrl);
}
