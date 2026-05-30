export interface WorkflowSkillCatalogEntry {
  name: string;
  description: string;
  status: 'native' | 'adapter';
}

const NATIVE_QWEN_SKILLS = new Set(['deep-interview', 'plan', 'ralplan', 'team', 'omq-setup']);

// This catalog mirrors the first-party workflow skills packaged under
// skills/workflows/. Do not add generic/user skills here.
const WORKFLOW_SKILL_DEFINITIONS = [
  { name: 'ai-slop-cleaner', description: 'Run an anti-slop cleanup/refactor/deslop workflow' },
  { name: 'analyze', description: "Run read-only deep repository analysis and return a ranked synthesis with explicit confidence, concrete file references, and clear evidence-vs-inference boundaries. Use when a user says 'analyze', 'investigate', 'why does', 'what\'s causing', or needs grounded cross-file explanation before any changes are proposed." },
  { name: 'ask', description: 'Ask a local external advisor CLI (Claude or Gemini) and capture a reusable artifact' },
  { name: 'autopilot', description: 'Strict autonomous loop: $deep-interview -> $ralplan -> $ultragoal (+ $team if needed) -> $code-review -> $ultraqa' },
  { name: 'autoresearch', description: 'Stateful validator-gated research loop with native-hook persistence' },
  { name: 'autoresearch-goal', description: 'Durable professor-critic research workflow over goal mode' },
  { name: 'best-practice-research', description: 'Bounded best-practice research wrapper using official/upstream evidence first' },
  { name: 'cancel', description: 'Cancel any active workflow mode (autopilot, ralph, ultrawork, ultraqa, pipeline, team)' },
  { name: 'code-review', description: 'Run a comprehensive code review' },
  { name: 'configure-notifications', description: 'Configure notifications through a unified workflow entry point' },
  { name: 'deep-interview', description: 'Socratic deep interview with mathematical ambiguity gating before execution' },
  { name: 'design', description: 'Canonical repo-local DESIGN.md workflow for product, UI/UX, and frontend decision source of truth' },
  { name: 'doctor', description: 'Diagnose and fix oh-my-qwen installation issues' },
  { name: 'hud', description: 'Show or configure the Qwen workflow HUD/status surface' },
  { name: 'omq-setup', description: 'Setup and configure oh-my-qwen using current CLI behavior' },
  { name: 'performance-goal', description: 'Run an evaluator-gated performance optimization workflow with durable artifacts and safe goal handoffs.' },
  { name: 'pipeline', description: 'Configurable pipeline orchestrator for sequencing stages' },
  { name: 'plan', description: 'Strategic planning with optional interview workflow' },
  { name: 'prometheus-strict', description: 'Clean-room interview-driven planner: clarify, challenge, synthesize, then hand off to execution workflows.' },
  { name: 'ralph', description: 'Self-referential loop until task completion with architect verification' },
  { name: 'ralplan', description: 'Alias for $plan --consensus' },
  { name: 'skill', description: 'Manage local skills - list, add, remove, search, edit, setup wizard' },
  { name: 'team', description: 'N coordinated agents on shared task list using tmux-based orchestration' },
  { name: 'ultragoal', description: 'Create and execute durable repo-native multi-goal plans over goal-mode artifacts.' },
  { name: 'ultraqa', description: 'Adversarial dynamic e2e QA workflow - generate hostile scenarios, test, verify, fix, report, and clean up' },
  { name: 'ultrawork', description: 'Parallel execution engine for high-throughput task completion' },
  { name: 'visual-ralph', description: 'Visual Ralph orchestration for frontend UI from generated references, static references, or live URL targets, using $ralph with built-in visual verdict and pixel-diff evidence until the implementation matches and leaves a reproducible design system.' },
  { name: 'wiki', description: 'Persistent markdown project wiki stored under repository workflow_wiki with keyword search and lifecycle capture' },
  { name: 'worker', description: 'Team worker protocol (ACK, mailbox, task lifecycle) for tmux-based teams' },
] as const;

export const OMQ_NATIVE_EXTRA_SKILLS: WorkflowSkillCatalogEntry[] = [
  {
    name: 'goal',
    description: 'Durable goal ledger workflow for oh-my-qwen',
    status: 'native',
  },
];

export const WORKFLOW_SKILL_CATALOG: WorkflowSkillCatalogEntry[] = WORKFLOW_SKILL_DEFINITIONS.map((entry) => ({
  ...entry,
  status: NATIVE_QWEN_SKILLS.has(entry.name) ? 'native' : 'adapter',
}));

export const OMQ_SKILL_CATALOG: WorkflowSkillCatalogEntry[] = [
  ...WORKFLOW_SKILL_CATALOG,
  ...OMQ_NATIVE_EXTRA_SKILLS,
];

export function renderQwenSkillAdapterBody(entry: WorkflowSkillCatalogEntry): string {
  const nativeHint = entry.status === 'native'
    ? 'This skill has a Qwen-native OMQ implementation or command surface in this package.'
    : 'This is a Qwen adapter for a packaged workflow name; preserve the workflow intent while using Qwen-native execution surfaces.';

  return `# ${entry.name} — OMQ adapter

${nativeHint}

## Contract

- Interpret \`$${entry.name}\`, \`/${entry.name}\`, or the plain skill name as the same packaged workflow intent.
- Use Qwen Code as the execution engine; do not invoke or require another runtime state model.
- Store durable artifacts under \`.omq/\` and mention exact artifact paths in the final answer.
- Prefer \`omq launch\` for interactive work, \`omq exec\` for headless Qwen runs, and \`omq team plan\` / tmux worktrees for write-heavy parallel work.
- If the packaged workflow depends on a feature that OMQ has not ported yet, state the gap explicitly, perform the closest safe Qwen-native subset, and leave clear follow-up evidence.

## Verification

Before claiming completion, cite concrete Qwen/OMQ evidence: changed files, \`.omq/\` artifacts, command output, tests, or tmux session details.
`;
}

export function renderQwenCommandAdapterBody(entry: WorkflowSkillCatalogEntry): string {
  return `Activate the \`${entry.name}\` OMQ skill adapter.

- Read \`skills/${entry.name}/SKILL.md\` from this generated extension.
- Use Qwen/OMQ equivalents for source workflow operations.
- Persist workflow state under \`.omq/\`.
- For headless execution use \`omq exec <prompt>\`; for interactive execution use \`omq launch\` or plain \`omq\`.
`;
}
