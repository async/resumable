import { expect, test } from 'vitest';
import { computed, element, IntrinsicRuntimeError, shared, state } from '../src/index.ts';

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

test('author intrinsics expose structured runtime diagnostics when executed directly', () => {
	const error = captureThrown(() => state(0));

	expect(error).toBeInstanceOf(IntrinsicRuntimeError);
	expect(error).toMatchObject({
		code: 'AA_INTRINSIC_RUNTIME_CALL',
		severity: 'error',
		phase: 'runtime',
		title: 'Compiler intrinsic executed at runtime',
		intrinsic: 'state',
		docsUrl: 'https://async.await.dev/errors/AA_INTRINSIC_RUNTIME_CALL',
		suggestions: [
			{
				message: expect.stringContaining('.tsrx'),
			},
		],
	});
	expect(error).toMatchObject({
		message: '@async/resumable state() is a TSRX compiler intrinsic and cannot run directly.',
		why: expect.stringContaining('state()'),
	});
});

function captureThrown(run: () => unknown): unknown {
	try {
		run();
	} catch (error) {
		return error;
	}

	throw new Error('Expected callback to throw.');
}
