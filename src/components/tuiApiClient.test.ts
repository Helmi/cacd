import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {tuiApiClient} from './tuiApiClient.js';

function jsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: {'content-type': 'application/json'},
	});
}

describe('tuiApiClient.createWorktree warning mapping', () => {
	const createParams = {
		path: '/repo/.worktrees/feat-warning',
		branch: 'feat-warning',
		baseBranch: 'main',
		copySessionData: false,
		copyClaudeDirectory: false,
	};

	beforeEach(() => {
		tuiApiClient.configure({
			baseUrl: 'http://127.0.0.1:3000',
			accessToken: undefined,
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns top-level warnings when present', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				jsonResponse({success: true, warnings: ['hook failed']}),
			);
		vi.stubGlobal('fetch', fetchMock);

		const result = await tuiApiClient.createWorktree(createParams);

		expect(result.warnings).toEqual(['hook failed']);
	});

	it('falls back to nested worktree warnings for older api shape', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
			jsonResponse({
				success: true,
				worktree: {
					path: '/repo/.worktrees/feat-warning',
					warnings: ['setup hook warning'],
				},
			}),
		);
		vi.stubGlobal('fetch', fetchMock);

		const result = await tuiApiClient.createWorktree(createParams);

		expect(result.warnings).toEqual(['setup hook warning']);
	});
});
