import os from 'node:os';
import path from 'node:path';
import { EXTENSION_ID, STATE_DIR } from '../constants.js';

export type SetupScope = 'user' | 'project';

export interface PathOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export function normalizeScope(scope: string | undefined): SetupScope {
  if (!scope || scope === 'project') return 'project';
  if (scope === 'user') return 'user';
  throw new Error(`Invalid scope "${scope}"; expected user or project`);
}

export function homeDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOME || env.USERPROFILE || os.homedir();
}

export function qwenHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.QWEN_HOME || path.join(homeDir(env), '.qwen');
}

export function projectQwenDir(cwd = process.cwd()): string {
  return path.join(cwd, '.qwen');
}

export function qwenDir(scope: SetupScope, opts: PathOptions = {}): string {
  const cwd = opts.cwd ?? process.cwd();
  const env = opts.env ?? process.env;
  return scope === 'user' ? qwenHome(env) : projectQwenDir(cwd);
}

export function qwenSettingsPath(scope: SetupScope, opts: PathOptions = {}): string {
  return path.join(qwenDir(scope, opts), 'settings.json');
}

export function qwenExtensionDir(scope: SetupScope, opts: PathOptions = {}): string {
  return path.join(qwenDir(scope, opts), 'extensions', EXTENSION_ID);
}

export function stateRoot(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.OMQ_STATE_ROOT;
  if (configured) return path.isAbsolute(configured) ? configured : path.resolve(cwd, configured);
  return path.join(cwd, STATE_DIR);
}

export function backupRoot(scope: SetupScope, opts: PathOptions = {}): string {
  if (scope === 'user') return path.join(qwenDir(scope, opts), '.omq-backups');
  return path.join(stateRoot(opts.cwd ?? process.cwd(), opts.env ?? process.env), 'backups');
}

export function configPath(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): string {
  return path.join(stateRoot(cwd, env), 'config.json');
}
