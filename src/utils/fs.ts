import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function readTextIfExists(filePath: string): Promise<string | undefined> {
  if (!(await pathExists(filePath))) return undefined;
  return readFile(filePath, 'utf8');
}

export async function readJsonIfExists<T = unknown>(filePath: string, fallback: T): Promise<T> {
  const text = await readTextIfExists(filePath);
  if (!text || !text.trim()) return fallback;
  return JSON.parse(text) as T;
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, Object.keys(value as object).sort(), 2)}\n`;
}

function stableSort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableSort);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = stableSort((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function stringifyJson(value: unknown): string {
  return `${JSON.stringify(stableSort(value), null, 2)}\n`;
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, stringifyJson(value));
}

export async function writeFileIfChanged(filePath: string, content: string): Promise<'created' | 'updated' | 'unchanged'> {
  const current = await readTextIfExists(filePath);
  if (current === content) return 'unchanged';
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, content);
  return current === undefined ? 'created' : 'updated';
}

export async function backupFile(source: string, backupDir: string, label: string): Promise<string | undefined> {
  if (!(await pathExists(source))) return undefined;
  await ensureDir(backupDir);
  const stamp = new Date().toISOString().replace(/[-:.]/g, '').replace('T', 'T').slice(0, 15) + 'Z';
  const backupPath = path.join(backupDir, `${label}-${stamp}.bak`);
  await copyFile(source, backupPath);
  return backupPath;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export async function listFilesRecursive(root: string): Promise<string[]> {
  if (!(await pathExists(root))) return [];
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) found.push(full);
    }
  }
  await walk(root);
  return found;
}

export async function removeDirIfExists(dir: string): Promise<void> {
  if (await pathExists(dir)) await rm(dir, { recursive: true, force: true });
}

export async function isDirectory(dir: string): Promise<boolean> {
  try {
    return (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
}
