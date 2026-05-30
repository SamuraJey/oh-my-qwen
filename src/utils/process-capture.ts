import { spawn, spawnSync, type SpawnOptions, type SpawnSyncOptions } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface CapturedProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

export interface CapturedSyncResult {
  stdout: string;
  stderr: string;
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
}

function capturePaths(label: string): { dir: string; stdoutPath: string; stderrPath: string; stdoutFd: number; stderrFd: number } {
  const dir = mkdtempSync(path.join(os.tmpdir(), `${label}-`));
  const stdoutPath = path.join(dir, 'stdout.log');
  const stderrPath = path.join(dir, 'stderr.log');
  return {
    dir,
    stdoutPath,
    stderrPath,
    stdoutFd: openSync(stdoutPath, 'w+'),
    stderrFd: openSync(stderrPath, 'w+'),
  };
}

function readAndCleanup(paths: { dir: string; stdoutPath: string; stderrPath: string; stdoutFd: number; stderrFd: number }): { stdout: string; stderr: string } {
  closeSync(paths.stdoutFd);
  closeSync(paths.stderrFd);
  const stdout = readFileSync(paths.stdoutPath, 'utf8');
  const stderr = readFileSync(paths.stderrPath, 'utf8');
  rmSync(paths.dir, { recursive: true, force: true });
  return { stdout, stderr };
}

export async function spawnCaptured(command: string, args: string[], options: Pick<SpawnOptions, 'cwd' | 'env'> = {}): Promise<CapturedProcessResult> {
  const paths = capturePaths('omq-capture');
  const child = spawn(command, args, { ...options, stdio: ['ignore', paths.stdoutFd, paths.stderrFd] });
  return new Promise<CapturedProcessResult>((resolve, reject) => {
    let settled = false;
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      const captured = readAndCleanup(paths);
      Object.assign(error, captured);
      reject(error);
    });
    child.on('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      const captured = readAndCleanup(paths);
      resolve({ ...captured, exitCode, signal });
    });
  });
}

export function spawnSyncCaptured(command: string, args: string[], options: Pick<SpawnSyncOptions, 'cwd' | 'env' | 'timeout'> = {}): CapturedSyncResult {
  const paths = capturePaths('omq-capture-sync');
  const result = spawnSync(command, args, { ...options, stdio: ['ignore', paths.stdoutFd, paths.stderrFd] });
  const captured = readAndCleanup(paths);
  return { ...captured, status: result.status, signal: result.signal, error: result.error };
}
