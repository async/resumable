import { defineConfig } from 'vite';
import { resumable } from '@async/resumable/vite';

export default defineConfig({
	plugins: [resumable()],
	build: {
		lib: {
			entry: 'src/index.ts',
			formats: ['es'],
		},
		rolldownOptions: {
			external: [/^@async\/resumable/],
		},
	},
});
