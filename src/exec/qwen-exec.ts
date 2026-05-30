import { spawn } from 'node:child_process';
import path from 'node:path';
import { ensureDir } from '../utils/fs.js';
import { getStatePaths } from '../state/paths.js';
import { findExecutable } from '../qwen/probe.js';

export interface ExecOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  qwenBinary?: string;
  approvalMode?: string;
  model?: string;
  systemPrompt?: string;
  appendSystemPrompt?: string;
  continueSession?: boolean;
  resume?: string | true;
  maxSessionTurns?: string;
  maxWallTime?: string;
  maxToolCalls?: string;
  includePartialMessages?: boolean;
  outputFormat?: 'json' | 'stream-json';
}

export interface ExecResult {
  command: string;
  args: string[];
  cwd: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  response: string;
  sessionId?: string;
  usage?: unknown;
  events: unknown[];
}

export function normalizeApprovalMode(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value === 'auto-edit') return 'auto_edit';
  return value;
}

export function buildQwenArgs(prompt: string, options: ExecOptions): string[] {
  const format = options.outputFormat ?? 'stream-json';
  const args = ['-p', prompt, '--output-format', format];
  const approvalMode = normalizeApprovalMode(options.approvalMode);
  if (approvalMode) args.push('--approval-mode', approvalMode);
  if (options.model) args.push('--model', options.model);
  if (options.systemPrompt) args.push('--system-prompt', options.systemPrompt);
  if (options.appendSystemPrompt) args.push('--append-system-prompt', options.appendSystemPrompt);
  if (options.continueSession) args.push('--continue');
  if (options.resume) {
    args.push('--resume');
    if (typeof options.resume === 'string') args.push(options.resume);
  }
  if (options.maxSessionTurns) args.push('--max-session-turns', options.maxSessionTurns);
  if (options.maxWallTime) args.push('--max-wall-time', options.maxWallTime);
  if (options.maxToolCalls) args.push('--max-tool-calls', options.maxToolCalls);
  if (options.includePartialMessages) args.push('--include-partial-messages');
  return args;
}

function extractText(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(extractText);
  const obj = value as Record<string, unknown>;
  const direct = [obj.response, obj.result, obj.text, obj.content]
    .filter((item): item is string => typeof item === 'string');
  const nested = [obj.message, obj.content, obj.delta, obj.event, obj.data].flatMap(extractText);
  return [...direct, ...nested];
}

export function parseQwenOutput(stdout: string, format: 'json' | 'stream-json' = 'stream-json'): { response: string; sessionId?: string; usage?: unknown; events: unknown[] } {
  const events: unknown[] = [];
  const textParts: string[] = [];
  let sessionId: string | undefined;
  let usage: unknown;

  if (!stdout.trim()) return { response: '', events };

  if (format === 'json') {
    const parsed = JSON.parse(stdout) as unknown;
    const list = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of list) {
      events.push(item);
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        if (typeof obj.session_id === 'string') sessionId = obj.session_id;
        if (typeof obj.sessionId === 'string') sessionId = obj.sessionId;
        if (obj.usage) usage = obj.usage;
      }
      textParts.push(...extractText(item));
    }
    return { response: textParts.join(''), sessionId, usage, events };
  }

  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch (error) {
      throw new Error(`Malformed stream-json line: ${line.slice(0, 160)}`);
    }
    events.push(event);
    if (event && typeof event === 'object') {
      const obj = event as Record<string, unknown>;
      if (typeof obj.session_id === 'string') sessionId = obj.session_id;
      if (typeof obj.sessionId === 'string') sessionId = obj.sessionId;
      if (obj.usage) usage = obj.usage;
      if (obj.type === 'result' || obj.type === 'assistant' || obj.type === 'message' || obj.type === 'content_block_delta') {
        textParts.push(...extractText(obj));
      }
    }
  }
  return { response: textParts.join(''), sessionId, usage, events };
}

export async function runQwenExec(prompt: string, options: ExecOptions): Promise<ExecResult> {
  const env = options.env ?? process.env;
  const command = options.qwenBinary || findExecutable('qwen', env);
  if (!command) throw new Error('qwen binary not found on PATH or QWEN_BIN');
  const format = options.outputFormat ?? 'stream-json';
  const args = buildQwenArgs(prompt, { ...options, outputFormat: format });

  const child = spawn(command, args, { cwd: options.cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => (stdout += chunk));
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const { exitCode, signal } = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, sig) => resolve({ exitCode: code, signal: sig }));
  });

  const parsed = parseQwenOutput(stdout, format);
  const result: ExecResult = { command, args, cwd: options.cwd, exitCode, signal, stdout, stderr, response: parsed.response, sessionId: parsed.sessionId, usage: parsed.usage, events: parsed.events };
  await writeExecLog(result, options.cwd);
  return result;
}

export async function writeExecLog(result: ExecResult, cwd = process.cwd()): Promise<string> {
  const paths = getStatePaths(cwd);
  await ensureDir(paths.logs);
  const day = new Date().toISOString().slice(0, 10);
  const logPath = path.join(paths.logs, `exec-${day}.jsonl`);
  const redactedArgs = result.args.map((arg, index, args) => (args[index - 1] === '-p' ? '<prompt>' : arg));
  const line = JSON.stringify({ ts: new Date().toISOString(), command: result.command, args: redactedArgs, cwd: result.cwd, exitCode: result.exitCode, signal: result.signal, sessionId: result.sessionId, responseBytes: Buffer.byteLength(result.response), stderrBytes: Buffer.byteLength(result.stderr) }) + '\n';
  const { writeFile } = await import('node:fs/promises');
  await writeFile(logPath, line, { flag: 'a' });
  return logPath;
}
