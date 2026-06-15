import { expect, test } from 'vitest';
import { createProtocolStatePayload, ProtocolStateSerializationError } from '../src/index.ts';

test('createProtocolStatePayload preserves structured serialization diagnostics when a state cell fails', () => {
	const error = captureThrown(() =>
		createProtocolStatePayload({
			cells: [
				{
					bindingId: 'state:session',
					name: 'session',
					valueKind: 'object',
					value: {
						socket: () => undefined,
					},
				},
			],
		}),
	);

	expect(error).toBeInstanceOf(ProtocolStateSerializationError);
	expect(error).toMatchObject({
		code: 'AA_SERIALIZE_UNSUPPORTED_VALUE',
		severity: 'error',
		phase: 'serialization',
		title: 'Cannot serialize graph state value',
		bindingId: 'state:session',
		cellName: 'session',
		path: ['socket'],
		statePath: 'session.socket',
		valueKind: 'function',
		docsUrl: 'https://async.await.dev/errors/AA_SERIALIZE_UNSUPPORTED_VALUE',
		suggestions: [
			{
				message: expect.stringContaining('use={...}'),
			},
		],
	});
	expect(error).toMatchObject({
		message:
			'Cannot serialize value at session.socket because function values are not durable graph state.',
		why: expect.stringContaining('durable graph state'),
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
