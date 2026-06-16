import { expect, test } from 'vitest';
import { applyDomJournalEntries } from '../src/dom-journal.ts';
import { createDomUpdateEntry } from '../src/dom-update.ts';
import { resumeEventOnlyFromPayloadDocument } from '../src/event-only-resume.ts';
import { resumeEventFromPayloadDocument } from '../src/event-resume.ts';
import { createRuntimeGraph } from '../src/graph.ts';
import { decodePayloadScripts } from '../src/payload.ts';
import { createResumeRuntime } from '../src/resume.ts';

test('runtime split modules expose graph, payload, event resume, DOM update, DOM journal, and resume boundaries', () => {
	expect(typeof applyDomJournalEntries).toBe('function');
	expect(typeof createDomUpdateEntry).toBe('function');
	expect(typeof resumeEventOnlyFromPayloadDocument).toBe('function');
	expect(typeof resumeEventFromPayloadDocument).toBe('function');
	expect(typeof createRuntimeGraph).toBe('function');
	expect(typeof decodePayloadScripts).toBe('function');
	expect(typeof createResumeRuntime).toBe('function');
});
