import type { CodeSplittingOptions, OutputOptions } from 'rolldown';
import type { ResumableEnvironment } from '../types.ts';

export const ASYNC_RESUMABLE_BUILD_DIR = 'build';
export const ASYNC_RESUMABLE_BUILD_PREFIX = `${ASYNC_RESUMABLE_BUILD_DIR}/`;
export const ASYNC_RESUMABLE_BUNDLE_GRAPH = `${ASYNC_RESUMABLE_BUILD_PREFIX}bundle-graph.json`;

const ASYNC_RESUMABLE_RUNTIME_GROUPS = [
	{
		name: 'async-resumable-runtime',
		test: /[/\\]@async[/\\]resumable-runtime[/\\]/,
	},
	{
		name: 'async-resumable-symbols',
		test: /virtual:async-resumable:symbol:/,
	},
] satisfies NonNullable<CodeSplittingOptions['groups']>;

export function outputDefaults(
	output: OutputOptions,
	environment: ResumableEnvironment,
): OutputOptions {
	if (environment === 'lib') {
		return output;
	}

	const next: OutputOptions = { ...output, hoistTransitiveImports: false };
	if (environment === 'server') {
		next.entryFileNames ??= '[name].js';
		next.chunkFileNames ??= 'async-[hash].js';
		next.codeSplitting = resumableCodeSplitting(next.codeSplitting);
		return next;
	}

	next.entryFileNames ??= `${ASYNC_RESUMABLE_BUILD_PREFIX}async-[hash].js`;
	next.chunkFileNames ??= `${ASYNC_RESUMABLE_BUILD_PREFIX}async-[hash].js`;
	next.minifyInternalExports = false;
	next.strictExecutionOrder = true;
	next.codeSplitting = resumableCodeSplitting(next.codeSplitting);
	return next;
}

function resumableCodeSplitting(codeSplitting: OutputOptions['codeSplitting']) {
	if (typeof codeSplitting === 'boolean') {
		throw new Error(
			'@async/resumable requires output.codeSplitting to be an object so runtime chunks can be grouped.',
		);
	}

	return {
		...codeSplitting,
		groups: [...ASYNC_RESUMABLE_RUNTIME_GROUPS, ...(codeSplitting?.groups ?? [])],
	} satisfies CodeSplittingOptions;
}
