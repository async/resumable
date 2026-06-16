import { defineConfig } from 'vite';
import { resumable } from '../../../resumable/src/vite.ts';
import { fixtureSsrHost } from './src/dev-server.ts';

export default defineConfig({
	environments: {
		ssr: {
			build: {
				rolldownOptions: {
					input: 'src/entry-server.ts',
				},
			},
		},
	},
	plugins: [resumable(), fixtureSsrHost()],
});
