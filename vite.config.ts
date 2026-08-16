import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Self-hosted in Docker (see Dockerfile) -> adapter-node produces a
			// standalone Node server started with `node build`.
			adapter: adapter()
		})
	],
	ssr: {
		external: ['better-sqlite3', '@huggingface/transformers']
	},
	optimizeDeps: {
		exclude: ['better-sqlite3', '@huggingface/transformers']
	}
});
