import { defineConfig } from 'vite-plus';

export default defineConfig({
	staged: {
		'*': 'vp check --fix',
	},
	pack: {
		deps: {
			neverBundle: ['rolldown', 'vite', 'vitest', 'vitest/browser'],
		},
		entry: {
			'core/index': './packages/core/src/index.ts',
			'protocol/index': './packages/protocol/src/index.ts',
			'serializer/index': './packages/serializer/src/index.ts',
			'compiler/index': './packages/compiler/src/index.ts',
			'runtime/index': './packages/runtime/src/index.ts',
			'bundler/rolldown': './packages/bundler/src/rolldown.ts',
			'bundler/vite': './packages/bundler/src/vite/index.ts',
			'resumable/index': './packages/resumable/src/index.ts',
			'resumable/rolldown': './packages/resumable/src/rolldown.ts',
			'resumable/runtime': './packages/resumable/src/runtime.ts',
			'resumable/vite': './packages/resumable/src/vite.ts',
			'test-utils/index': './packages/test-utils/src/index.ts',
			'vitest-browser/index': './packages/vitest-browser/src/index.ts',
			'vitest-browser/vitest': './packages/vitest-browser/src/vitest.ts',
		},
		format: ['esm'],
		dts: true,
		clean: true,
	},
	test: {
		environment: 'node',
		include: ['packages/*/test/**/*.test.ts'],
	},
	lint: {
		ignorePatterns: ['dist/**', 'node_modules/**'],
	},
	fmt: {
		useTabs: true,
		tabWidth: 4,
		printWidth: 100,
		endOfLine: 'lf',
		singleQuote: true,
		ignorePatterns: ['dist/**', 'node_modules/**'],
	},
});
