import { resumeFromPayloadDocument } from '../../../../resumable/src/runtime.ts';
import { loadSymbol } from './root.tsrx';

const counter = document.querySelector<HTMLElement>('[data-counter]');
if (!counter) {
	throw new Error('Expected server-rendered counter before browser resume.');
}

await resumeFromPayloadDocument({
	document,
	root: counter as never,
	loadSymbol,
});
