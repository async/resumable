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
			'runtime/dom-update': './packages/runtime/src/dom-update.ts',
			'runtime/event-only-resume': './packages/runtime/src/event-only-resume.ts',
			'runtime/event-resume': './packages/runtime/src/event-resume.ts',
			'runtime/index': './packages/runtime/src/index.ts',
			'runtime/render': './packages/runtime/src/render.ts',
			'runtime/resume': './packages/runtime/src/payload.ts',
			'bundler/rolldown': './packages/bundler/src/rolldown.ts',
			'bundler/vite': './packages/bundler/src/vite/index.ts',
			'resumable/index': './packages/resumable/src/index.ts',
			'resumable/rolldown': './packages/resumable/src/rolldown.ts',
			'resumable/runtime': './packages/resumable/src/runtime.ts',
			'resumable/runtime/dom-update': './packages/resumable/src/runtime/dom-update.ts',
			'resumable/runtime/event-only-resume':
				'./packages/resumable/src/runtime/event-only-resume.ts',
			'resumable/runtime/event-resume': './packages/resumable/src/runtime/event-resume.ts',
			'resumable/runtime/render': './packages/resumable/src/runtime/render.ts',
			'resumable/runtime/resume': './packages/resumable/src/runtime/resume.ts',
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
