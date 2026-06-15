import { defineConfig } from 'vite-plus';

export default defineConfig({
	staged: {
		'*': 'vp check --fix',
	},
	pack: {
		entry: {
			'core/index': './packages/core/src/index.ts',
			'protocol/index': './packages/protocol/src/index.ts',
			'serializer/index': './packages/serializer/src/index.ts',
			'compiler/index': './packages/compiler/src/index.ts',
			'runtime/index': './packages/runtime/src/index.ts',
			'rolldown/index': './packages/rolldown/src/index.ts',
			'vite/index': './packages/vite/src/index.ts',
			'resumable/index': './packages/resumable/src/index.ts',
			'resumable/vite': './packages/resumable/src/vite.ts',
			'test-utils/index': './packages/test-utils/src/index.ts',
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
