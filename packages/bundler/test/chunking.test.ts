import { describe, expect, test } from 'vitest';
import { resumableClient, resumableLib, resumableServer } from '../src/rolldown.ts';
import { callOutputOptions } from './helpers.ts';

type ResumableOutputOptions = {
	codeSplitting?: {
		groups?: Array<{ name: string }>;
	};
};

describe('resumable chunking defaults', () => {
	test('uses explicit output defaults for each environment', () => {
		const clientOutput = callOutputOptions(resumableClient(), {
			dir: 'dist/client',
		}) as ResumableOutputOptions;

		expect(clientOutput).toMatchObject({
			dir: 'dist/client',
			entryFileNames: 'build/async-[hash].js',
			chunkFileNames: 'build/async-[hash].js',
			hoistTransitiveImports: false,
			minifyInternalExports: false,
			strictExecutionOrder: true,
		});
		expect(clientOutput.codeSplitting?.groups?.map((group) => group.name)).toEqual([
			'async-resumable-runtime',
			'async-resumable-symbols',
		]);
		expect(callOutputOptions(resumableServer(), { dir: 'dist/server' })).toMatchObject({
			dir: 'dist/server',
			chunkFileNames: 'async-[hash].js',
			hoistTransitiveImports: false,
		});
		expect(callOutputOptions(resumableLib(), { entryFileNames: '[name].js' })).toEqual({
			entryFileNames: '[name].js',
		});
	});

	test('appends user code splitting groups after framework groups', () => {
		const userGroup = { name: 'vendor', test: /vendor/ };
		const output = callOutputOptions(resumableClient(), {
			codeSplitting: { groups: [userGroup] },
		}) as ResumableOutputOptions;

		expect(output.codeSplitting?.groups?.map((group) => group.name)).toEqual([
			'async-resumable-runtime',
			'async-resumable-symbols',
			'vendor',
		]);
		expect(output.codeSplitting?.groups?.at(-1)).toBe(userGroup);
	});

	test('rejects boolean code splitting for client builds', () => {
		expect(() => callOutputOptions(resumableClient(), { codeSplitting: true })).toThrow(
			'@async/resumable requires output.codeSplitting to be an object',
		);
	});
});
