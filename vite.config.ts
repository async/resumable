import { defineConfig } from 'vite-plus';

export default defineConfig({
	staged: {
		'*': 'vp check --fix',
	},
	pack: {
		entry: {
			'compiler/index': './packages/compiler/src/index.ts',
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
