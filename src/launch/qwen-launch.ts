import { createHash } from 'node:crypto';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { constants as osConstants } from 'node:os';
import path from 'node:path';
import { ensureStateTree, getStatePaths } from '../state/paths.js';
import { findExecutable } from '../qwen/probe.js';
import { writeModeState } from '../state/modes.js';

export type QwenLaunchPolicy = 'inside-tmux' | 'detached-tmux' | 'direct';

export const OMQ_LAUNCH_POLICY_ENV = 'OMQ_LAUNCH_POLICY';
export const OMQ_SESSION_ID_ENV = 'OMQ_SESSION_ID';
export const OMQ_ENGINE_ENV = 'OMQ_ENGINE';
export const OMQ_TMUX_BIN_ENV = 'OMQ_TMUX_BIN';
export const OMQ_LAUNCH_HOLD_SECONDS_ENV = 'OMQ_LAUNCH_HOLD_SECONDS';

const DEFAULT_QUICK_EXIT_HOLD_SECONDS = 10;
const DEFAULT_STALE_ENV_FILE_MAX_AGE_MS = 10 * 60 * 1000;

export interface LaunchPolicySplit {
  explicitPolicy?: QwenLaunchPolicy;
  remainingArgs: string[];
}

export interface QwenLaunchOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  stdinIsTTY?: boolean;
  stdoutIsTTY?: boolean;
  tmuxAvailable?: boolean;
  platform?: NodeJS.Platform;
  spawnSyncImpl?: typeof spawnSync;
  sessionId?: string;
}

export interface QwenLaunchResult {
  policy: QwenLaunchPolicy;
  sessionId: string;
  sessionName?: string;
  exitCode: number;
  signal: NodeJS.Signals | null;
  command: string;
  args: string[];
  cwd: string;
  tmuxPaneId?: string;
  fallback?: 'direct-after-tmux-failure';
}

const SHELL_ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function randomSessionId(): string {
  return `omq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function splitLaunchPolicyArgs(args: string[]): LaunchPolicySplit {
  const remainingArgs: string[] = [];
  let explicitPolicy: QwenLaunchPolicy | undefined;
  let passthroughOnly = false;

  for (const arg of args) {
    if (passthroughOnly) {
      remainingArgs.push(arg);
      continue;
    }
    if (arg === '--') {
      passthroughOnly = true;
      remainingArgs.push(arg);
      continue;
    }
    if (arg === '--direct') {
      explicitPolicy = 'direct';
      continue;
    }
    if (arg === '--tmux') {
      explicitPolicy = 'detached-tmux';
      continue;
    }
    remainingArgs.push(arg);
  }

  return { explicitPolicy, remainingArgs };
}

export function resolveEnvLaunchPolicyOverride(env: NodeJS.ProcessEnv = process.env): QwenLaunchPolicy | undefined {
  const raw = env[OMQ_LAUNCH_POLICY_ENV]?.trim();
  if (!raw) return undefined;
  const value = raw.toLowerCase();
  if (value === 'auto') return undefined;
  if (value === 'direct') return 'direct';
  if (value === 'tmux' || value === 'detached-tmux') return 'detached-tmux';
  return undefined;
}

export function resolveQuickExitHoldSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[OMQ_LAUNCH_HOLD_SECONDS_ENV]?.trim();
  if (!raw) return DEFAULT_QUICK_EXIT_HOLD_SECONDS;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return DEFAULT_QUICK_EXIT_HOLD_SECONDS;
  return Math.max(0, Math.min(value, 3600));
}

export function resolveEffectiveLaunchPolicyOverride(args: string[], env: NodeJS.ProcessEnv = process.env): QwenLaunchPolicy | undefined {
  return splitLaunchPolicyArgs(args).explicitPolicy ?? resolveEnvLaunchPolicyOverride(env);
}

export function resolveTmuxBinary(env: NodeJS.ProcessEnv = process.env): string {
  return env[OMQ_TMUX_BIN_ENV] || 'tmux';
}

export function isTmuxAvailable(env: NodeJS.ProcessEnv = process.env, spawnSyncImpl: typeof spawnSync = spawnSync): boolean {
  const result = spawnSyncImpl(resolveTmuxBinary(env), ['-V'], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] });
  return !result.error && result.status === 0;
}

export function resolveQwenLaunchPolicy(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  tmuxAvailable = isTmuxAvailable(env),
  stdinIsTTY = Boolean(process.stdin.isTTY),
  stdoutIsTTY = Boolean(process.stdout.isTTY),
  explicitPolicy?: QwenLaunchPolicy,
): QwenLaunchPolicy {
  if (explicitPolicy === 'direct') return 'direct';
  if (explicitPolicy === 'detached-tmux') return tmuxAvailable ? 'detached-tmux' : 'direct';
  if (env.TMUX) return 'inside-tmux';
  if (platform === 'win32') return 'direct';
  if (!stdinIsTTY || !stdoutIsTTY) return 'direct';
  return tmuxAvailable ? 'detached-tmux' : 'direct';
}

export function quoteShellArg(value: string): string {
  if (value === '') return "''";
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function buildShellCommand(command: string, args: string[]): string {
  return [command, ...args].map(quoteShellArg).join(' ');
}

export function buildTmuxSessionName(cwd: string, sessionId: string): string {
  const base = path.basename(cwd).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'qwen';
  const digest = createHash('sha1').update(`${cwd}\0${sessionId}`).digest('hex').slice(0, 8);
  return `omq-${base.slice(0, 24)}-${digest}`;
}

export function serializeLaunchEnv(env: NodeJS.ProcessEnv): string {
  const lines: string[] = [];
  for (const key of Object.keys(env).sort()) {
    if (!SHELL_ENV_NAME_PATTERN.test(key)) continue;
    const value = env[key];
    if (typeof value !== 'string') continue;
    if (value.includes('\0')) continue;
    lines.push(`export ${key}=${quoteShellArg(value)}`);
  }
  return `${lines.join('\n')}\n`;
}

export function launchEnvFilePath(cwd: string, sessionId: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9_.-]/g, '_');
  return path.join(getStatePaths(cwd).root, 'runtime', 'tmux-env', `${safe}.env`);
}

export function cleanupStaleLaunchEnvFiles(cwd: string, maxAgeMs = DEFAULT_STALE_ENV_FILE_MAX_AGE_MS, now = Date.now()): number {
  const dir = path.join(getStatePaths(cwd).root, 'runtime', 'tmux-env');
  let removed = 0;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.env')) continue;
    const target = path.join(dir, entry);
    try {
      const stat = statSync(target);
      if (maxAgeMs <= 0 || now - stat.mtimeMs > maxAgeMs) {
        rmSync(target, { force: true });
        removed += 1;
      }
    } catch {
      // Ignore races with the tmux leader removing its own env file.
    }
  }
  return removed;
}

export function writeLaunchEnvFile(cwd: string, sessionId: string, env: NodeJS.ProcessEnv): string {
  cleanupStaleLaunchEnvFiles(cwd);
  const filePath = launchEnvFilePath(cwd, sessionId);
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  writeFileSync(filePath, serializeLaunchEnv(env), { encoding: 'utf8', mode: 0o600 });
  return filePath;
}

export function buildDetachedLeaderCommand(sessionName: string, qwenCommand: string, qwenArgs: string[], envFilePath: string, quickExitHoldSeconds = DEFAULT_QUICK_EXIT_HOLD_SECONDS): string {
  const qwenCmd = buildShellCommand(qwenCommand, qwenArgs);
  const envFile = quoteShellArg(envFilePath);
  const escapedSession = sessionName.replace(/["\\$`]/g, '\\$&');
  const holdSeconds = Math.max(0, Math.min(Math.trunc(quickExitHoldSeconds), 3600));
  const script = [
    `trap 'rm -f ${envFile} 2>/dev/null || true' EXIT HUP INT TERM`,
    `if [ -r ${envFile} ]; then . ${envFile}; rm -f ${envFile}; fi`,
    'omq_qwen_started_at=$(date +%s 2>/dev/null || printf 0)',
    `${qwenCmd}`,
    'omq_qwen_status=$?',
    'omq_qwen_finished_at=$(date +%s 2>/dev/null || printf 0)',
    'omq_qwen_elapsed=$((omq_qwen_finished_at - omq_qwen_started_at))',
    `rm -f ${envFile} 2>/dev/null || true`,
    `if [ "$omq_qwen_status" -eq 0 ] && [ "$omq_qwen_elapsed" -le ${holdSeconds} ]; then`,
    `  printf "\\n[omq] qwen exited after %ss with code 0 during startup. Press Enter to close this OMQ tmux session.\\n" "$omq_qwen_elapsed" >&2`,
    '  IFS= read -r _omq_close || true',
    'elif [ "$omq_qwen_status" -gt 0 ] && [ "$omq_qwen_status" -lt 128 ]; then',
    '  printf "\\n[omq] qwen exited with code %s after %ss. Press Enter to close this OMQ tmux session.\\n" "$omq_qwen_status" "$omq_qwen_elapsed" >&2',
    '  IFS= read -r _omq_close || true',
    'fi',
    'if [ "$omq_qwen_status" -eq 0 ]; then',
    `  tmux kill-session -t "${escapedSession}" >/dev/null 2>&1 || true`,
    'fi',
    'exit "$omq_qwen_status"',
  ].join('; ');
  return `/bin/sh -c ${quoteShellArg(script)}`;
}

export function buildDetachedTmuxNewSessionArgs(sessionName: string, cwd: string, leaderCommand: string, launchEnv: NodeJS.ProcessEnv): string[] {
  return [
    'new-session',
    '-d',
    '-P',
    '-F',
    '#{pane_id}',
    '-s',
    sessionName,
    '-c',
    cwd,
    ...(launchEnv[OMQ_SESSION_ID_ENV] ? ['-e', `${OMQ_SESSION_ID_ENV}=${launchEnv[OMQ_SESSION_ID_ENV]}`] : []),
    ...(launchEnv.OMQ_STATE_ROOT ? ['-e', `OMQ_STATE_ROOT=${launchEnv.OMQ_STATE_ROOT}`] : []),
    ...(launchEnv.QWEN_HOME ? ['-e', `QWEN_HOME=${launchEnv.QWEN_HOME}`] : []),
    ...(launchEnv.QWEN_BIN ? ['-e', `QWEN_BIN=${launchEnv.QWEN_BIN}`] : []),
    ...(launchEnv[OMQ_ENGINE_ENV] ? ['-e', `${OMQ_ENGINE_ENV}=${launchEnv[OMQ_ENGINE_ENV]}`] : []),
    leaderCommand,
  ];
}

function parsePaneId(output: string | Buffer | null | undefined): string | undefined {
  const text = Buffer.isBuffer(output) ? output.toString('utf8') : output || '';
  const first = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return first && first.startsWith('%') ? first : undefined;
}

function exitCodeFromSpawn(result: SpawnSyncReturns<string | Buffer>): number {
  if (typeof result.status === 'number') return result.status;
  if (result.signal) return 128 + (osConstants.signals[result.signal] ?? 0);
  return result.error ? 1 : 0;
}

function mergeLaunchEnv(env: NodeJS.ProcessEnv, sessionId: string): NodeJS.ProcessEnv {
  return {
    ...env,
    [OMQ_SESSION_ID_ENV]: sessionId,
    [OMQ_ENGINE_ENV]: env[OMQ_ENGINE_ENV] || 'qwen',
  };
}

function resolveQwenCommand(env: NodeJS.ProcessEnv): string {
  const command = findExecutable('qwen', env);
  if (!command) throw new Error('qwen binary not found on PATH or QWEN_BIN');
  return command;
}

function spawnQwenBlocking(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, spawnSyncImpl: typeof spawnSync): SpawnSyncReturns<Buffer> {
  return spawnSyncImpl(command, args, { cwd, env, stdio: 'inherit' });
}

function shouldWarnAboutQuickDirectExit(exitCode: number, elapsedMs: number, holdSeconds: number): boolean {
  if (exitCode !== 0) return true;
  return holdSeconds > 0 && elapsedMs <= holdSeconds * 1000;
}

function writeDirectExitDiagnostic(policy: QwenLaunchPolicy, exitCode: number, elapsedMs: number, command: string, args: string[], holdSeconds: number): void {
  if (!shouldWarnAboutQuickDirectExit(exitCode, elapsedMs, holdSeconds)) return;
  const elapsedSeconds = Math.max(0, elapsedMs / 1000).toFixed(1);
  const renderedArgs = args.length ? ` ${args.map(quoteShellArg).join(' ')}` : '';
  const reason = exitCode === 0
    ? `qwen exited after ${elapsedSeconds}s with code 0 during startup`
    : `qwen exited after ${elapsedSeconds}s with code ${exitCode}`;
  process.stderr.write(`[omq] ${reason} (${policy}). Command: ${quoteShellArg(command)}${renderedArgs}\n`);
  process.stderr.write('[omq] Try `omq --direct` to see raw Qwen output, or run `qwen` directly to confirm the underlying CLI stays open.\n');
}

export async function runInteractiveQwenLaunch(rawArgs: string[], options: QwenLaunchOptions): Promise<QwenLaunchResult> {
  const env = options.env ?? process.env;
  const sessionId = options.sessionId ?? randomSessionId();
  const split = splitLaunchPolicyArgs(rawArgs);
  const explicitPolicy = split.explicitPolicy ?? resolveEnvLaunchPolicyOverride(env);
  const spawnSyncImpl = options.spawnSyncImpl ?? spawnSync;
  const tmuxAvailable = options.tmuxAvailable ?? isTmuxAvailable(env, spawnSyncImpl);
  const quickExitHoldSeconds = resolveQuickExitHoldSeconds(env);
  const policy = resolveQwenLaunchPolicy(
    env,
    options.platform ?? process.platform,
    tmuxAvailable,
    options.stdinIsTTY ?? Boolean(process.stdin.isTTY),
    options.stdoutIsTTY ?? Boolean(process.stdout.isTTY),
    explicitPolicy,
  );
  const command = resolveQwenCommand(env);
  const launchEnv = mergeLaunchEnv(env, sessionId);

  await ensureStateTree(options.cwd, env);
  await writeModeState('launch', {
    active: true,
    status: 'running',
    policy,
    session_id: sessionId,
    command,
    args: split.remainingArgs,
    cwd: options.cwd,
  }, options.cwd, env);

  if (policy === 'direct' || policy === 'inside-tmux') {
    const startedAt = Date.now();
    const result = spawnQwenBlocking(command, split.remainingArgs, options.cwd, launchEnv, spawnSyncImpl);
    const elapsedMs = Date.now() - startedAt;
    const exitCode = exitCodeFromSpawn(result);
    await writeModeState('launch', {
      active: false,
      status: exitCode === 0 ? 'finished' : 'failed',
      lifecycle_outcome: exitCode === 0 ? 'finished' : 'failed',
      policy,
      session_id: sessionId,
      exit_code: exitCode,
    }, options.cwd, env);
    if (result.error) throw result.error;
    writeDirectExitDiagnostic(policy, exitCode, elapsedMs, command, split.remainingArgs, quickExitHoldSeconds);
    return { policy, sessionId, exitCode, signal: result.signal, command, args: split.remainingArgs, cwd: options.cwd };
  }

  const sessionName = buildTmuxSessionName(options.cwd, sessionId);
  const envFile = writeLaunchEnvFile(options.cwd, sessionId, launchEnv);
  const leaderCommand = buildDetachedLeaderCommand(sessionName, command, split.remainingArgs, envFile, quickExitHoldSeconds);
  const tmuxBin = resolveTmuxBinary(env);
  const newSessionArgs = buildDetachedTmuxNewSessionArgs(sessionName, options.cwd, leaderCommand, launchEnv);
  let tmuxPaneId: string | undefined;

  try {
    const created = spawnSyncImpl(tmuxBin, newSessionArgs, { cwd: options.cwd, env: launchEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (created.error) throw created.error;
    if (created.status !== 0) throw new Error(`tmux new-session failed with code ${created.status}: ${String(created.stderr || '').trim()}`);
    tmuxPaneId = parsePaneId(created.stdout);
    await writeModeState('launch', {
      active: true,
      status: 'tmux-attached',
      policy,
      session_id: sessionId,
      tmux_session_name: sessionName,
      tmux_pane_id: tmuxPaneId,
    }, options.cwd, env);
    const attachArgs = env.TMUX ? ['switch-client', '-t', sessionName] : ['attach-session', '-t', sessionName];
    const attached = spawnSyncImpl(tmuxBin, attachArgs, { cwd: options.cwd, env: launchEnv, stdio: 'inherit' });
    const exitCode = exitCodeFromSpawn(attached);
    if (env.TMUX && exitCode === 0 && !attached.error) {
      await writeModeState('launch', {
        active: true,
        status: 'tmux-switched',
        policy,
        session_id: sessionId,
        tmux_session_name: sessionName,
        tmux_pane_id: tmuxPaneId,
        exit_code: exitCode,
      }, options.cwd, env);
      return { policy, sessionId, sessionName, exitCode, signal: attached.signal, command, args: split.remainingArgs, cwd: options.cwd, tmuxPaneId };
    }
    await writeModeState('launch', {
      active: false,
      status: exitCode === 0 ? 'finished' : 'failed',
      lifecycle_outcome: exitCode === 0 ? 'finished' : 'failed',
      policy,
      session_id: sessionId,
      tmux_session_name: sessionName,
      tmux_pane_id: tmuxPaneId,
      exit_code: exitCode,
    }, options.cwd, env);
    if (attached.error) throw attached.error;
    return { policy, sessionId, sessionName, exitCode, signal: attached.signal, command, args: split.remainingArgs, cwd: options.cwd, tmuxPaneId };
  } catch (error) {
    rmSync(envFile, { force: true });
    process.stderr.write(`[omq] warning: tmux launch failed (${error instanceof Error ? error.message : String(error)}). Falling back to direct Qwen launch.\n`);
    const startedAt = Date.now();
    const result = spawnQwenBlocking(command, split.remainingArgs, options.cwd, launchEnv, spawnSyncImpl);
    const elapsedMs = Date.now() - startedAt;
    const exitCode = exitCodeFromSpawn(result);
    await writeModeState('launch', {
      active: false,
      status: exitCode === 0 ? 'finished' : 'failed',
      lifecycle_outcome: exitCode === 0 ? 'finished' : 'failed',
      policy: 'direct',
      requested_policy: policy,
      session_id: sessionId,
      exit_code: exitCode,
    }, options.cwd, env);
    if (result.error) throw result.error;
    writeDirectExitDiagnostic('direct', exitCode, elapsedMs, command, split.remainingArgs, quickExitHoldSeconds);
    return { policy: 'direct', fallback: 'direct-after-tmux-failure', sessionId, sessionName, exitCode, signal: result.signal, command, args: split.remainingArgs, cwd: options.cwd, tmuxPaneId };
  }
}
