import { defineConfig } from 'rolldown';
import { resumableClient, resumableServer } from '@async/resumable/rolldown';

export default defineConfig([
	{
		input: 'src/client.ts',
		output: {
			dir: 'dist/client',
			format: 'esm',
		},
		plugins: [resumableClient()],
	},
	{
		input: 'src/render.ts',
		output: {
			dir: 'dist/render',
			format: 'esm',
		},
		plugins: [resumableServer()],
	},
]);
