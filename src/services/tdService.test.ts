import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {execFileSync} from 'child_process';
import {existsSync, statSync, readFileSync} from 'fs';
import path from 'path';

// Mock dependencies before importing tdService
vi.mock('child_process', () => ({
	execFileSync: vi.fn(),
}));

vi.mock('fs', () => ({
	existsSync: vi.fn(),
	statSync: vi.fn(),
	readFileSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
	readFile: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

// Import fresh for each test
const mockedExecFileSync = vi.mocked(execFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedStatSync = vi.mocked(statSync);
const mockedReadFileSync = vi.mocked(readFileSync);

describe('TdService', () => {
	let tdService: typeof import('./tdService.js').tdService;

	beforeEach(async () => {
		vi.clearAllMocks();

		// Reset module to get a fresh singleton
		vi.resetModules();
		const mod = await import('./tdService.js');
		tdService = mod.tdService;
	});

	describe('checkAvailability', () => {
		it('should detect td binary when available', () => {
			mockedExecFileSync
				.mockReturnValueOnce('/opt/homebrew/bin/td\n' as never) // which
				.mockReturnValueOnce('td v1.2.0\n' as never); // --version

			const result = tdService.checkAvailability();

			expect(result.binaryAvailable).toBe(true);
			expect(result.binaryPath).toBe('/opt/homebrew/bin/td');
			expect(result.version).toBe('td v1.2.0');
		});

		it('should return unavailable when td is not found', () => {
			mockedExecFileSync.mockImplementation(() => {
				throw new Error('not found');
			});

			const result = tdService.checkAvailability();

			expect(result.binaryAvailable).toBe(false);
			expect(result.binaryPath).toBeNull();
			expect(result.version).toBeNull();
		});

		it('should cache availability after first check', () => {
			mockedExecFileSync
				.mockReturnValueOnce('/opt/homebrew/bin/td\n' as never)
				.mockReturnValueOnce('td v1.2.0\n' as never);

			tdService.checkAvailability();
			tdService.checkAvailability();

			// which + --version = 2 calls total, not 4
			expect(mockedExecFileSync).toHaveBeenCalledTimes(2);
		});

		it('should handle binary found but --version failing', () => {
			mockedExecFileSync
				.mockReturnValueOnce('/opt/homebrew/bin/td\n' as never) // which succeeds
				.mockImplementationOnce(() => {
					throw new Error('unknown flag');
				}); // --version fails

			const result = tdService.checkAvailability();

			expect(result.binaryAvailable).toBe(true);
			expect(result.version).toBe('unknown');
		});
	});

	describe('resolveProjectState', () => {
		it('should return disabled when td binary is not available', () => {
			mockedExecFileSync.mockImplementation(() => {
				throw new Error('not found');
			});

			const result = tdService.resolveProjectState('/some/project');

			expect(result.enabled).toBe(false);
			expect(result.dbPath).toBeNull();
		});

		it('should resolve via .td-root file', () => {
			// Make td available
			mockedExecFileSync
				.mockReturnValueOnce('/usr/bin/td\n' as never)
				.mockReturnValueOnce('v1.0\n' as never);
			tdService.checkAvailability();

			// .td-root exists and points to /main/project
			mockedExistsSync.mockImplementation((p: unknown) => {
				const s = String(p);
				if (s === '/worktree/.td-root') return true;
				if (s === '/main/project/.todos') return true;
				if (s === '/main/project/.todos/issues.db') return true;
				return false;
			});

			mockedReadFileSync.mockReturnValue('/main/project\n');

			mockedStatSync.mockReturnValue({
				isFile: () => true,
				size: 1024,
			} as never);

			const result = tdService.resolveProjectState('/worktree');

			expect(result.enabled).toBe(true);
			expect(result.tdRoot).toBe('/main/project');
			expect(result.dbPath).toBe(
				path.join('/main/project', '.todos', 'issues.db'),
			);
		});

		it('should resolve from direct .todos/ directory', () => {
			mockedExecFileSync
				.mockReturnValueOnce('/usr/bin/td\n' as never)
				.mockReturnValueOnce('v1.0\n' as never);
			tdService.checkAvailability();

			mockedExistsSync.mockImplementation((p: unknown) => {
				const s = String(p);
				if (s.endsWith('.td-root')) return false;
				if (s === '/project/.todos') return true;
				if (s === '/project/.todos/issues.db') return true;
				return false;
			});

			mockedStatSync.mockReturnValue({
				isFile: () => true,
				size: 512,
			} as never);

			const result = tdService.resolveProjectState('/project');

			expect(result.enabled).toBe(true);
			expect(result.tdRoot).toBe('/project');
		});

		it('should return disabled when no .todos/ found', () => {
			mockedExecFileSync
				.mockReturnValueOnce('/usr/bin/td\n' as never)
				.mockReturnValueOnce('v1.0\n' as never);
			tdService.checkAvailability();

			mockedExistsSync.mockReturnValue(false);

			const result = tdService.resolveProjectState('/empty/project');

			expect(result.enabled).toBe(false);
		});
	});

	describe('resetCache', () => {
		it('should allow re-checking after reset', () => {
			mockedExecFileSync.mockImplementation(() => {
				throw new Error('not found');
			});

			expect(tdService.isAvailable()).toBe(false);

			tdService.resetCache();

			mockedExecFileSync
				.mockReturnValueOnce('/usr/bin/td\n' as never)
				.mockReturnValueOnce('v1.0\n' as never);

			expect(tdService.isAvailable()).toBe(true);
		});
	});
});
