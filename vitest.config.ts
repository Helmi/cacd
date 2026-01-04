import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		watch: false,
		pool: 'threads',
		environment: 'node',
		setupFiles: ['./src/test/setup.ts'],
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

