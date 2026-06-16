import { expect, test } from 'vitest';
import {
	computed,
	element,
	resumeFromPayloadDocument,
	resumeFromPayloadScripts,
	resumableClient,
	shared,
	state,
} from '../src/index.ts';
import { createBindingDomJournalRecord } from '../src/runtime.ts';
import { resumable as viteResumable } from '../src/vite.ts';

test('main package exposes the curated author and build surface', () => {
	expect(typeof state).toBe('function');
	expect(typeof computed).toBe('function');
	expect(typeof element).toBe('function');
	expect(typeof shared).toBe('function');
	expect(typeof resumeFromPayloadDocument).toBe('function');
	expect(typeof resumeFromPayloadScripts).toBe('function');
	expect(typeof createBindingDomJournalRecord).toBe('function');
	expect(typeof resumableClient).toBe('function');
	expect(typeof viteResumable).toBe('function');
});
