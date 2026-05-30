import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { getStatePaths, ensureStateTree } from '../state/paths.js';
import { readJsonIfExists, stringifyJson } from '../utils/fs.js';
import { writeModeState, type ModeState } from '../state/modes.js';

export type WorkflowRuntimeAction = 'start' | 'checkpoint' | 'finish' | 'cancel';

export interface WorkflowRuntimeResult {
  action: WorkflowRuntimeAction;
  mode: string;
  stateFile: string;
  eventLog: string;
  state: ModeState;
}

function normalizeMode(mode: string): string {
  const value = mode.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]*$/.test(value)) throw new Error(`Invalid workflow mode: ${mode}`);
  return value;
}

async function appendWorkflowEvent(cwd: string, event: Record<string, unknown>): Promise<string> {
  const paths = await ensureStateTree(cwd);
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(paths.logs, `workflows-${day}.jsonl`);
  await writeFile(file, `${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`, { flag: 'a' });
  return file;
}

async function readMode(cwd: string, mode: string): Promise<ModeState> {
  const file = path.join(getStatePaths(cwd).modes, `${mode}.json`);
  return readJsonIfExists<ModeState>(file, {});
}

async function writeRuntimeState(cwd: string, action: WorkflowRuntimeAction, mode: string, state: ModeState): Promise<WorkflowRuntimeResult> {
  const stateFile = await writeModeState(mode, state, cwd);
  const writtenState = await readJsonIfExists<ModeState>(stateFile, state);
  const eventLog = await appendWorkflowEvent(cwd, { action, mode, stateFile, status: writtenState.status, lifecycle_outcome: writtenState.lifecycle_outcome });
  return { action, mode, stateFile, eventLog, state: writtenState };
}

export async function startWorkflow(modeInput: string, task: string, cwd = process.cwd()): Promise<WorkflowRuntimeResult> {
  const mode = normalizeMode(modeInput);
  const previous = await readMode(cwd, mode);
  const checkpoints = Array.isArray(previous.checkpoints) ? previous.checkpoints : [];
  return writeRuntimeState(cwd, 'start', mode, {
    ...previous,
    mode,
    active: true,
    status: 'running',
    lifecycle_outcome: undefined,
    terminal_outcome: undefined,
    run_outcome: undefined,
    task,
    started_at: typeof previous.started_at === 'string' ? previous.started_at : new Date().toISOString(),
    last_command_at: new Date().toISOString(),
    checkpoints,
  });
}

export async function checkpointWorkflow(modeInput: string, message: string, cwd = process.cwd()): Promise<WorkflowRuntimeResult> {
  const mode = normalizeMode(modeInput);
  const previous = await readMode(cwd, mode);
  const checkpoints = Array.isArray(previous.checkpoints) ? previous.checkpoints : [];
  checkpoints.push({ ts: new Date().toISOString(), message });
  return writeRuntimeState(cwd, 'checkpoint', mode, {
    ...previous,
    mode,
    active: previous.active !== false,
    status: 'checkpointed',
    last_checkpoint: message,
    last_command_at: new Date().toISOString(),
    checkpoints,
  });
}

export async function finishWorkflow(modeInput: string, status = 'finished', cwd = process.cwd()): Promise<WorkflowRuntimeResult> {
  const mode = normalizeMode(modeInput);
  const previous = await readMode(cwd, mode);
  return writeRuntimeState(cwd, 'finish', mode, {
    ...previous,
    mode,
    active: false,
    status,
    lifecycle_outcome: status,
    finished_at: new Date().toISOString(),
    last_command_at: new Date().toISOString(),
  });
}

export async function cancelWorkflow(modeInput: string, reason = 'cancelled by workflow command', cwd = process.cwd()): Promise<WorkflowRuntimeResult> {
  const mode = normalizeMode(modeInput);
  const previous = await readMode(cwd, mode);
  return writeRuntimeState(cwd, 'cancel', mode, {
    ...previous,
    mode,
    active: false,
    status: 'cancelled',
    lifecycle_outcome: 'cancelled',
    cancel_reason: reason,
    finished_at: new Date().toISOString(),
    last_command_at: new Date().toISOString(),
  });
}

export function renderWorkflowRuntimeResult(result: WorkflowRuntimeResult): string {
  return stringifyJson(result);
}
