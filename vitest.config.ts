import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		watch: false,
		pool: 'threads',
		environment: 'node',
		setupFiles: ['./src/test/setup.ts'],
		// Exclude worktree directories from test discovery
		exclude: [
			'**/node_modules/**',
			'**/dist/**',
			'.dev-projects/**',
		],
		coverage: {
			reporter: ['text', 'json', 'html'],
			exclude: [
				'node_modules/',
				'dist/',
				'test/',
				'**/*.d.ts',
				'**/*.config.*',
				'**/mockups/**',
			],
		},
	},
});

