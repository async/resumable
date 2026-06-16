export type PayloadScripts = {
	readonly stateScript: string;
	readonly viewScript: string;
	readonly view: {
		readonly locators: ReadonlyArray<{
			readonly hostNodeId: string;
			readonly tagName: string;
		}>;
	};
};

export function renderServerShell(payloadScripts: PayloadScripts, clientEntry = ''): string {
	return [
		'<div id="app">',
		'<button type="button" data-counter>0</button>',
		'</div>',
		payloadScripts.stateScript,
		payloadScripts.viewScript,
		clientEntry,
	]
		.filter(Boolean)
		.join('\n');
}
