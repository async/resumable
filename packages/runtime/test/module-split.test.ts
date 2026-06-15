import { expect, test } from 'vitest';
import { createRuntimeGraph } from '../src/graph.ts';
import { decodePayloadScripts } from '../src/payload.ts';
import { createResumeRuntime } from '../src/resume.ts';

test('runtime split modules expose graph, payload, and resume boundaries', () => {
	expect(typeof createRuntimeGraph).toBe('function');
	expect(typeof decodePayloadScripts).toBe('function');
	expect(typeof createResumeRuntime).toBe('function');
});
