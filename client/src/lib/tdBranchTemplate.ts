import type { TdIssue } from '@/lib/types'

export const DEFAULT_TD_WORK_BRANCH_TEMPLATE = '{{task.type-prefix}}/{{task.id}}-{{task.title-short-slug}}'

const TYPE_PREFIX_BY_TASK_TYPE: Record<string, string> = {
  feature: 'feature',
  bug: 'fix',
  task: 'task',
  chore: 'chore',
  epic: 'epic',
}

type TemplateTask = Pick<TdIssue, 'id' | 'title'> & {
  type?: string
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function shortTitleSlug(title: string, maxWords = 2): string {
  const words = title
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)

  return toSlug(words.join(' '))
}

function typePrefix(taskType?: string): string {
  const normalized = (taskType || '').trim().toLowerCase()
  if (!normalized) return 'task'
  return TYPE_PREFIX_BY_TASK_TYPE[normalized] || toSlug(normalized) || 'task'
}

export function sanitizeBranchName(value: string): string {
  return value
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._/\-]+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/^-+|-+$/g, '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.-|\.\./g, '.')
}

export function renderTdTemplate(template: string, task: TemplateTask): string {
  const title = task.title || ''
  const titleSlug = toSlug(title)
  const titleShortSlug = shortTitleSlug(title)
  const mappedTypePrefix = typePrefix(task.type)

  return template
    .replace(/\{\{\s*task\.id\s*\}\}/g, task.id)
    .replace(/\{\{\s*task\.title\s*\}\}/g, title)
    .replace(/\{\{\s*task\.title-slug\s*\}\}/g, titleSlug)
    .replace(/\{\{\s*task\.title_slug\s*\}\}/g, titleSlug)
    .replace(/\{\{\s*task\.title-short-slug\s*\}\}/g, titleShortSlug)
    .replace(/\{\{\s*task\.title_short_slug\s*\}\}/g, titleShortSlug)
    .replace(/\{\{\s*task\.type-prefix\s*\}\}/g, mappedTypePrefix)
    .replace(/\{\{\s*task\.type_prefix\s*\}\}/g, mappedTypePrefix)
}

export function renderTdBranchTemplate(template: string | undefined, task: TemplateTask): string {
  const activeTemplate = template?.trim() || DEFAULT_TD_WORK_BRANCH_TEMPLATE
  const rendered = sanitizeBranchName(renderTdTemplate(activeTemplate, task))
  if (rendered) return rendered

  const fallback = sanitizeBranchName(renderTdTemplate('{{task.type-prefix}}/{{task.id}}', task))
  if (fallback) return fallback

  return 'task/unknown'
}
