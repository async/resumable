import { expect, test } from 'vitest';
import { computed, element, shared, state } from '../src/index.ts';

test('author intrinsics fail loudly when executed without the TSRX compiler', () => {
	expect(() => state(0)).toThrow(
		'@async/resumable state() is a TSRX compiler intrinsic and cannot run directly.',
	);
	expect(() => computed(() => 1)).toThrow(
		'@async/resumable computed() is a TSRX compiler intrinsic and cannot run directly.',
	);
	expect(() => element()).toThrow(
		'@async/resumable element() is a TSRX compiler intrinsic and cannot run directly.',
	);
	expect(() => shared('session', () => ({ user: 'Ada' }), { scope: 'page' })).toThrow(
		'@async/resumable shared() is a TSRX compiler intrinsic and cannot run directly.',
	);
});
