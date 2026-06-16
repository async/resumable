import { defineConfig } from 'vite';
import { resumable } from '@async/resumable/vite';

export default defineConfig({
	plugins: [resumable()],
});
