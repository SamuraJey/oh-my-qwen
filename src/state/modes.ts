import path from 'node:path';
import { TERMINAL_OUTCOMES } from '../constants.js';
import { ensureDir, pathExists, readJsonIfExists, writeJson } from '../utils/fs.js';
import { getStatePaths } from './paths.js';

export interface ModeState {
  mode?: string;
  active?: boolean;
  status?: string;
  lifecycle_outcome?: string;
  terminal_outcome?: string;
  run_outcome?: string;
  waiting_for_user?: boolean;
  [key: string]: unknown;
}

export interface ActiveMode {
  mode: string;
  file: string;
  state: ModeState;
}

export function isTerminalModeState(state: ModeState): boolean {
  if (state.active === false) return true;
  const candidates = [state.lifecycle_outcome, state.terminal_outcome, state.run_outcome, state.status]
    .filter((value): value is string => typeof value === 'string');
  return candidates.some((value) => TERMINAL_OUTCOMES.has(value));
}

export async function listActiveModes(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): Promise<ActiveMode[]> {
  const modesDir = getStatePaths(cwd, env).modes;
  if (!(await pathExists(modesDir))) return [];
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(modesDir, { withFileTypes: true });
  const active: ActiveMode[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const file = path.join(modesDir, entry.name);
    const state = await readJsonIfExists<ModeState>(file, {});
    const mode = state.mode || entry.name.replace(/\.json$/, '');
    if (state.active !== false && !isTerminalModeState(state)) active.push({ mode, file, state });
  }
  return active;
}

export async function writeModeState(mode: string, state: ModeState, cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const modesDir = getStatePaths(cwd, env).modes;
  await ensureDir(modesDir);
  const file = path.join(modesDir, `${mode}.json`);
  await writeJson(file, { mode, updated_at: new Date().toISOString(), ...state });
  return file;
}
