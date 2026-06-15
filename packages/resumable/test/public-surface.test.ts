import { expect, test } from 'vitest';
import {
	asyncResumableRolldown,
	computed,
	element,
	resumeFromPayloadScripts,
	shared,
	state,
} from '../src/index.ts';
import { asyncResumableVite } from '../src/vite.ts';

test('main package exposes the curated author and build surface', () => {
	expect(typeof state).toBe('function');
	expect(typeof computed).toBe('function');
	expect(typeof element).toBe('function');
	expect(typeof shared).toBe('function');
	expect(typeof resumeFromPayloadScripts).toBe('function');
	expect(typeof asyncResumableRolldown).toBe('function');
	expect(typeof asyncResumableVite).toBe('function');
});
