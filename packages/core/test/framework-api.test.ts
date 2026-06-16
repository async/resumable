import { expect, test } from 'vitest';
import { computed, element, FrameworkApiRuntimeError, shared, state } from '../src/index.ts';

test('framework APIs fail loudly when executed without the TSRX compiler', () => {
	expect(() => state(0)).toThrow(
		'@async/resumable state() must be compiled from a .tsrx file before it can run.',
	);
	expect(() => computed(() => 1)).toThrow(
		'@async/resumable computed() must be compiled from a .tsrx file before it can run.',
	);
	expect(() => element()).toThrow(
		'@async/resumable element() must be compiled from a .tsrx file before it can run.',
	);
	expect(() => shared(() => ({ user: 'Ada' }), { scope: 'page' })).toThrow(
		'@async/resumable shared() must be compiled from a .tsrx file before it can run.',
	);
});

test('framework APIs expose structured runtime diagnostics when executed directly', () => {
	const error = captureThrown(() => state(0));

	expect(error).toBeInstanceOf(FrameworkApiRuntimeError);
	expect(error).toMatchObject({
		code: 'AA_FRAMEWORK_API_RUNTIME_CALL',
		severity: 'error',
		phase: 'runtime',
		title: 'Framework API executed without compiler output',
		apiName: 'state',
		docsUrl: 'https://async.await.dev/errors/AA_FRAMEWORK_API_RUNTIME_CALL',
		suggestions: [
			{
				message: expect.stringContaining('.tsrx'),
			},
		],
	});
	expect(error).toMatchObject({
		message: '@async/resumable state() must be compiled from a .tsrx file before it can run.',
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
