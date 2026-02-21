import {useState} from 'react';
import {ChevronRight} from 'lucide-react';
import {cn} from '@/lib/utils';

type VariableItem = {
	token: string;
	description: string;
};

const PROMPT_TEMPLATE_VARIABLES: VariableItem[] = [
	{token: '{{task.id}}', description: 'TD task ID (e.g. td-da83e1)'},
	{token: '{{task.title}}', description: 'Task title'},
	{
		token: '{{task.description}}',
		description: 'Task description (can be empty)',
	},
	{
		token: '{{task.status}}',
		description: 'Current status (open, in_progress, in_review, closed)',
	},
	{token: '{{task.priority}}', description: 'Priority (P0-P5)'},
	{
		token: '{{task.acceptance}}',
		description: 'Acceptance criteria (can be empty)',
	},
];

const BRANCH_AND_SESSION_TEMPLATE_VARIABLES: VariableItem[] = [
	{token: '{{task.id}}', description: 'TD task ID'},
	{
		token: '{{task.title}}',
		description: 'Task title (sanitized when used in branch names)',
	},
	{
		token: '{{task.title-slug}}',
		description: 'Slugified title (lowercase, dashes)',
	},
	{
		token: '{{task.title_slug}}',
		description: 'Alias for {{task.title-slug}}',
	},
	{
		token: '{{task.title-short-slug}}',
		description: 'Slugified first words of title (shorter branch names)',
	},
	{
		token: '{{task.title_short_slug}}',
		description: 'Alias for {{task.title-short-slug}}',
	},
	{
		token: '{{task.type-prefix}}',
		description: 'Type prefix (feature, fix, task, chore, epic)',
	},
	{
		token: '{{task.type_prefix}}',
		description: 'Alias for {{task.type-prefix}}',
	},
];

function VariableGroup({
	title,
	variables,
}: {
	title: string;
	variables: VariableItem[];
}) {
	return (
		<div className="space-y-1.5">
			<p className="text-[11px] font-medium text-foreground/80">{title}</p>
			<div className="space-y-1">
				{variables.map(variable => (
					<div
						key={`${title}-${variable.token}`}
						className="grid gap-1 rounded border border-border/70 bg-background/80 px-2 py-1.5 md:grid-cols-[170px_1fr]"
					>
						<code className="text-[11px] text-foreground">
							{variable.token}
						</code>
						<span className="text-[11px] text-muted-foreground">
							{variable.description}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

export function PromptTemplateVariableLegend() {
	const [open, setOpen] = useState(false);

	return (
		<div className="rounded-md border border-border/80 bg-muted/20 p-2">
			<button
				type="button"
				onClick={() => setOpen(prev => !prev)}
				className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
			>
				<ChevronRight
					className={cn(
						'h-3.5 w-3.5 transition-transform',
						open && 'rotate-90',
					)}
				/>
				Available variables
			</button>

			{open && (
				<div className="mt-2 space-y-2">
					<VariableGroup
						title="Prompt templates"
						variables={PROMPT_TEMPLATE_VARIABLES}
					/>
					<VariableGroup
						title="Branch/session name templates"
						variables={BRANCH_AND_SESSION_TEMPLATE_VARIABLES}
					/>
					<p className="text-[11px] text-muted-foreground">
						Branch/session variables apply to naming templates, not prompt body
						rendering.
					</p>
				</div>
			)}
		</div>
	);
}
