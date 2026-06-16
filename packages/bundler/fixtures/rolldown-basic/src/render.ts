import App from './root.tsrx';

export function render() {
	return `<main data-source="${App.source}"></main>`;
}
