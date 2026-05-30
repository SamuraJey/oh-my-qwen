import { spawnSync } from 'node:child_process';
import { VERSION } from '../constants.js';

export interface QwenProbeResult {
  omqVersion: string;
  nodeVersion: string;
  nodeOk: boolean;
  qwenBinary?: string;
  qwenVersion?: string;
  qwenOk: boolean;
  errors: string[];
}

export function nodeMajor(version = process.versions.node): number {
  return Number.parseInt(version.split('.')[0] || '0', 10);
}

export function findExecutable(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (name === 'qwen' && env.QWEN_BIN) return env.QWEN_BIN;
  const command = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(command, [name], { encoding: 'utf8', env });
  if (result.status === 0) return result.stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
  return undefined;
}

export function readQwenVersion(qwenBinary: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  for (const args of [['--version'], ['-v']]) {
    const result = spawnSync(qwenBinary, args, { encoding: 'utf8', env, timeout: 10000 });
    if (result.status === 0) {
      const text = `${result.stdout || ''}${result.stderr || ''}`.trim();
      if (text) return text.split(/\r?\n/)[0];
    }
  }
  return undefined;
}

export function probeQwen(env: NodeJS.ProcessEnv = process.env): QwenProbeResult {
  const errors: string[] = [];
  const nodeOk = nodeMajor() >= 22;
  if (!nodeOk) errors.push(`Node >=22 required, current ${process.version}`);
  const qwenBinary = findExecutable('qwen', env);
  const qwenVersion = qwenBinary ? readQwenVersion(qwenBinary, env) : undefined;
  if (!qwenBinary) errors.push('qwen binary not found on PATH (or QWEN_BIN)');
  return {
    omqVersion: VERSION,
    nodeVersion: process.version,
    nodeOk,
    qwenBinary,
    qwenVersion,
    qwenOk: Boolean(qwenBinary),
    errors,
  };
}
