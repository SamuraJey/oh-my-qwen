export interface WorkflowRoute {
  workflow: 'ralplan' | 'deep-interview' | 'goal' | 'team';
  confidence: 'explicit' | 'keyword';
  reason: string;
}

const EXPLICIT: Array<[WorkflowRoute['workflow'], RegExp]> = [
  ['ralplan', /(?:^|\s)\/(?:ralplan|plan)(?:\s|$)|(?:^|\s)\$?(?:oh-my-qwen:)?ralplan(?:\s|$)/i],
  ['deep-interview', /(?:^|\s)\/(?:deep-interview|interview)(?:\s|$)|(?:^|\s)\$?(?:oh-my-qwen:)?deep-interview(?:\s|$)/i],
  ['goal', /(?:^|\s)\/(?:goal|ultragoal)(?:\s|$)|(?:^|\s)\$?(?:oh-my-qwen:)?goal(?:\s|$)/i],
  ['team', /(?:^|\s)\/(?:team)(?:\s|$)|(?:^|\s)\$?(?:oh-my-qwen:)?team(?:\s|$)/i],
];

const KEYWORDS: Array<[WorkflowRoute['workflow'], RegExp, string]> = [
  ['ralplan', /consensus|architect.*critic|critic.*architect|prd|test spec|план|спланируй/i, 'planning/consensus keyword'],
  ['deep-interview', /clarify|уточни|interview|requirements questions|ambigu/i, 'clarification keyword'],
  ['goal', /durable goal|goal ledger|checkpoint|цель/i, 'durable goal keyword'],
  ['team', /tmux|worktree|parallel qwen|team|команд/i, 'team orchestration keyword'],
];

export function detectWorkflowRoute(prompt: string): WorkflowRoute | undefined {
  const text = prompt.trim();
  for (const [workflow, pattern] of EXPLICIT) {
    if (pattern.test(text)) return { workflow, confidence: 'explicit', reason: `explicit ${workflow} command` };
  }
  for (const [workflow, pattern, reason] of KEYWORDS) {
    if (pattern.test(text)) return { workflow, confidence: 'keyword', reason };
  }
  return undefined;
}

export function routingContext(route: WorkflowRoute): string {
  switch (route.workflow) {
    case 'ralplan':
      return 'oh-my-qwen route: use the ralplan consensus workflow. Produce context, PRD/test-spec, Architect review, then Critic review before implementation. Store artifacts under .omq/plans and .omq/reviews.';
    case 'deep-interview':
      return 'oh-my-qwen route: run a concise deep-interview clarification pass and save a context snapshot under .omq/context before execution.';
    case 'goal':
      return 'oh-my-qwen route: use the durable goal ledger under .omq/goals with checkpoints and validation evidence.';
    case 'team':
      return 'oh-my-qwen route: use external-process team orchestration with tmux/git worktrees for write-heavy parallel work; use subagents mainly for read-only/review lanes.';
  }
}
