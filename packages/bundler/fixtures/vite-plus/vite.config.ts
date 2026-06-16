import { defineConfig } from 'vite-plus';
import { resumable } from '@async/resumable/vite';

export default defineConfig({
	plugins: [resumable()],
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts'],
	},
});
