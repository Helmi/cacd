import type {TdIssue, TdIssueWithChildren} from './types'

export interface TaskDetailTabCounts {
	overview: number
	activity: number
	details: number
}

export function parseAcceptanceCriteria(acceptance: string): string[] {
	return acceptance
		.split('\n')
		.map(item => item.replace(/^\s*[-*]\s*/, '').trim())
		.filter(Boolean)
}

export function getLinkedSessions(
	issue: Pick<TdIssue, 'implementer_session' | 'reviewer_session'>,
): Array<{label: string; id: string}> {
	return [
		{label: 'Implementer', id: issue.implementer_session},
		{label: 'Reviewer', id: issue.reviewer_session},
	]
		.map(entry => ({...entry, id: entry.id.trim()}))
		.filter(
			(entry): entry is {label: string; id: string} => entry.id.length > 0,
		)
}

export function getTaskDetailLayoutCounts(
	issue: TdIssueWithChildren,
): TaskDetailTabCounts {
	const labels = issue.labels
		? issue.labels
				.split(',')
				.map(label => label.trim())
				.filter(Boolean)
		: []
	const acceptance = parseAcceptanceCriteria(issue.acceptance)
	const linkedSessions = getLinkedSessions(issue)

	return {
		overview:
			(issue.description ? 1 : 0) +
			(acceptance.length > 0 ? 1 : 0) +
			(issue.children.length > 0 ? 1 : 0) +
			(labels.length > 0 ? 1 : 0),
		activity:
			(linkedSessions.length > 0 ? 1 : 0) + (issue.handoffs.length > 0 ? 1 : 0),
		details: (issue.files.length > 0 ? 1 : 0) + 1,
	}
}
