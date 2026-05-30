import path from 'node:path';
import { ensureStateTree } from '../state/paths.js';
import { writeFileIfChanged, writeJson } from '../utils/fs.js';
import { writeModeState } from '../state/modes.js';

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'task';
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export interface ArtifactResult {
  path: string;
  kind: string;
}

export async function createDeepInterviewContext(task: string, cwd = process.cwd()): Promise<ArtifactResult> {
  const paths = await ensureStateTree(cwd);
  const file = path.join(paths.context, `${slugify(task)}-${stamp()}.md`);
  const content = `# Deep Interview Context\n\n- task statement: ${task}\n- desired outcome: clarify requirements enough for safe Qwen execution\n- constraints: use Qwen-native extension/hooks/headless surfaces; write durable state under .omq\n- unknowns/open questions:\n  1. What acceptance evidence proves success?\n  2. Are there destructive/external side effects?\n  3. Which files or systems are in scope?\n- next step: answer unknowns or proceed to /ralplan when sufficiently clear\n`;
  await writeFileIfChanged(file, content);
  await writeModeState('deep-interview', { active: true, task, artifact: file, status: 'context-created' }, cwd);
  return { path: file, kind: 'context' };
}

export async function createRalplanArtifacts(task: string, cwd = process.cwd()): Promise<ArtifactResult[]> {
  const paths = await ensureStateTree(cwd);
  const base = `${slugify(task)}-${stamp()}`;
  const prd = path.join(paths.plans, `prd-${base}.md`);
  const testSpec = path.join(paths.plans, `test-spec-${base}.md`);
  await writeFileIfChanged(prd, `# PRD: ${task}\n\n## Principles\n\n1. Qwen-native integration; no qwen-code fork.\n2. Marker-owned reversible edits.\n3. Durable artifacts under .omq.\n\n## Decision Drivers\n\n- Maintainability across Qwen releases.\n- Safe setup/uninstall.\n- Testable workflow behavior.\n\n## Acceptance Criteria\n\n- Implementation scope is explicit.\n- Verification commands are listed before execution.\n- Architect then Critic review occurs before handoff.\n`);
  await writeFileIfChanged(testSpec, `# Test Spec: ${task}\n\n## Required checks\n\n- Unit tests for touched modules.\n- Integration/smoke checks for setup, hooks, and exec when relevant.\n- Manual QA notes for user-visible workflow behavior.\n`);
  await writeModeState('ralplan', { active: true, task, planning_artifacts: { prd, test_spec: testSpec }, status: 'draft-created' }, cwd);
  return [
    { path: prd, kind: 'prd' },
    { path: testSpec, kind: 'test-spec' },
  ];
}

export async function createGoal(objective: string, cwd = process.cwd()): Promise<ArtifactResult> {
  const paths = await ensureStateTree(cwd);
  const id = `${slugify(objective)}-${stamp()}`;
  const file = path.join(paths.goals, `${id}.json`);
  await writeJson(file, { id, objective, status: 'active', checkpoints: [], created_at: new Date().toISOString() });
  await writeModeState('goal', { active: true, objective, goal_file: file, status: 'active' }, cwd);
  return { path: file, kind: 'goal' };
}

export async function completeGoal(status: 'finished' | 'blocked' | 'failed', cwd = process.cwd()): Promise<ArtifactResult> {
  const file = await writeModeState('goal', { active: false, lifecycle_outcome: status, status }, cwd);
  return { path: file, kind: 'goal-state' };
}

export async function createTeamPlan(task: string, cwd = process.cwd()): Promise<ArtifactResult> {
  const paths = await ensureStateTree(cwd);
  const file = path.join(paths.team, `team-plan-${slugify(task)}-${stamp()}.md`);
  await writeFileIfChanged(file, `# Team Plan\n\nTask: ${task}\n\n## MVP orchestration\n\n- Use tmux panes and git worktrees for write-heavy Qwen workers.\n- Give each worker a disjoint write scope.\n- Collect changed files, logs, and validation evidence back into this directory.\n\n## Suggested launch\n\n\`omq exec -C <worktree> --approval-mode auto_edit "<bounded worker prompt>"\`\n`);
  await writeModeState('team', { active: true, task, plan_file: file, status: 'planned' }, cwd);
  return { path: file, kind: 'team-plan' };
}
