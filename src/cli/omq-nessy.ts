#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { findExecutable } from '../qwen/probe.js';
import { OMQ_ENGINE_ENV } from '../launch/qwen-launch.js';

export interface NessyEnvOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}

export interface NessyEnvResult {
  env: NodeJS.ProcessEnv;
  nessyBinary: string;
  qwenHome: string;
  warnings: string[];
}

function homeDir(env: NodeJS.ProcessEnv): string {
  return env.HOME || env.USERPROFILE || os.homedir();
}

export function buildNessyOmqEnv(options: NessyEnvOptions = {}): NessyEnvResult {
  const env = options.env ?? process.env;
  const warnings: string[] = [];
  const configuredBinary = env.NESSY_BIN || env.QWEN_BIN;
  const detectedBinary = configuredBinary || findExecutable('nessy', env) || 'nessy';
  if (!configuredBinary && detectedBinary === 'nessy') warnings.push('nessy binary was not found on PATH during wrapper setup; omq will still try to execute "nessy". Set NESSY_BIN=/absolute/path/to/nessy if needed.');
  const qwenHome = env.NESSY_HOME || env.QWEN_HOME || path.join(homeDir(env), '.nessy');
  return {
    env: {
      ...env,
      QWEN_BIN: detectedBinary,
      QWEN_HOME: qwenHome,
      NESSY_HOME: qwenHome,
      [OMQ_ENGINE_ENV]: 'nessy',
    },
    nessyBinary: detectedBinary,
    qwenHome,
    warnings,
  };
}

export function omqEntryPath(): string {
  return fileURLToPath(new URL('./omq.js', import.meta.url));
}

export function runNessyWrapper(argv = process.argv.slice(2), env = process.env): number {
  const resolved = buildNessyOmqEnv({ env });
  for (const warning of resolved.warnings) process.stderr.write(`[omq-nessy] warning: ${warning}\n`);
  const result = spawnSync(process.execPath, [omqEntryPath(), ...argv], {
    stdio: 'inherit',
    env: resolved.env,
  });
  if (result.error) throw result.error;
  if (typeof result.status === 'number') return result.status;
  return result.signal ? 1 : 0;
}

const isDirectRun = process.argv[1] ? realpathSync(process.argv[1]) === fileURLToPath(import.meta.url) : false;

if (isDirectRun) {
  try {
    process.exit(runNessyWrapper());
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
