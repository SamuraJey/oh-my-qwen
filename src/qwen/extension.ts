import path from 'node:path';
import { EXTENSION_ID, GENERATED_MARKER } from '../constants.js';
import { backupFile, ensureDir, pathExists, readTextIfExists, removeDirIfExists, writeFileIfChanged } from '../utils/fs.js';
import { backupRoot, qwenDir, qwenExtensionDir, type SetupScope } from './paths.js';
import { renderExtensionFiles } from './extension-manifest.js';

export interface FileMaterializeSummary {
  rootDir: string;
  created: string[];
  updated: string[];
  unchanged: string[];
  skipped: string[];
  backedUp: string[];
}

export interface ExtensionSummary {
  extensionDir: string;
  dryRun: boolean;
  created: string[];
  updated: string[];
  unchanged: string[];
  skipped: string[];
  backedUp: string[];
  projectMirror?: FileMaterializeSummary;
}

export interface ExtensionOptions {
  scope: SetupScope;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  dryRun?: boolean;
  forceProject?: boolean;
}

const PROJECT_MIRROR_PREFIXES = ['commands/', 'skills/', 'agents/'];

function projectMirrorFiles(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).filter(([relative]) => PROJECT_MIRROR_PREFIXES.some((prefix) => relative.startsWith(prefix))));
}

async function materializeFiles(rootDir: string, files: Record<string, string>, options: ExtensionOptions & { backupLabel: string; overwriteUnowned: boolean }): Promise<FileMaterializeSummary> {
  const env = options.env ?? process.env;
  const summary: FileMaterializeSummary = { rootDir, created: [], updated: [], unchanged: [], skipped: [], backedUp: [] };

  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(rootDir, relative);
    const current = await readTextIfExists(target);
    if (current === content) {
      summary.unchanged.push(relative);
      continue;
    }
    if (current !== undefined && !current.includes(GENERATED_MARKER) && !options.overwriteUnowned) {
      summary.skipped.push(relative);
      continue;
    }
    if (current === undefined) {
      summary.created.push(relative);
    } else {
      summary.updated.push(relative);
      if (!current.includes(GENERATED_MARKER)) {
        const backup = path.join(backupRoot(options.scope, { cwd: options.cwd, env }), options.backupLabel);
        if (!options.dryRun) {
          const backed = await backupFile(target, backup, relative.replace(/[\\/]/g, '__'));
          if (backed) summary.backedUp.push(backed);
        } else {
          summary.backedUp.push(path.join(backup, `${relative.replace(/[\\/]/g, '__')}-DRY-RUN.bak`));
        }
      }
    }
    if (!options.dryRun) {
      await ensureDir(path.dirname(target));
      await writeFileIfChanged(target, content);
    }
  }

  return summary;
}

export async function materializeExtension(options: ExtensionOptions): Promise<ExtensionSummary> {
  const env = options.env ?? process.env;
  const extensionDir = qwenExtensionDir(options.scope, { cwd: options.cwd, env });
  const files = renderExtensionFiles();
  const extension = await materializeFiles(extensionDir, files, { ...options, backupLabel: 'extension', overwriteUnowned: true });
  const summary: ExtensionSummary = { extensionDir, dryRun: Boolean(options.dryRun), created: extension.created, updated: extension.updated, unchanged: extension.unchanged, skipped: extension.skipped, backedUp: extension.backedUp };

  // Qwen Code 0.17 loads installed extensions from QWEN_HOME/USER scope, but
  // project-local Qwen surfaces are loaded from .qwen/{commands,skills,agents}.
  // Keep the extension package in place and mirror the runtime-visible surfaces
  // for project-scope installs without clobbering user-owned project files.
  if (options.scope === 'project') {
    summary.projectMirror = await materializeFiles(qwenDir('project', { cwd: options.cwd, env }), projectMirrorFiles(files), {
      ...options,
      backupLabel: 'project-surfaces',
      overwriteUnowned: Boolean(options.forceProject),
    });
  }

  return summary;
}

export interface UninstallSummary {
  extensionDir: string;
  removed: boolean;
  skippedReason?: string;
  dryRun: boolean;
  projectMirror?: {
    rootDir: string;
    removed: string[];
    skipped: string[];
  };
}

async function removeGeneratedProjectMirror(options: ExtensionOptions): Promise<{ rootDir: string; removed: string[]; skipped: string[] }> {
  const env = options.env ?? process.env;
  const rootDir = qwenDir('project', { cwd: options.cwd, env });
  const files = projectMirrorFiles(renderExtensionFiles());
  const removed: string[] = [];
  const skipped: string[] = [];

  for (const relative of Object.keys(files).sort().reverse()) {
    const target = path.join(rootDir, relative);
    const current = await readTextIfExists(target);
    if (current === undefined) continue;
    if (!current.includes(GENERATED_MARKER)) {
      skipped.push(relative);
      continue;
    }
    removed.push(relative);
    if (!options.dryRun) await removeDirIfExists(target);
  }

  return { rootDir, removed, skipped };
}

export async function uninstallExtension(options: ExtensionOptions): Promise<UninstallSummary> {
  const env = options.env ?? process.env;
  const extensionDir = qwenExtensionDir(options.scope, { cwd: options.cwd, env });
  const manifest = path.join(extensionDir, 'qwen-extension.json');
  const projectMirror = options.scope === 'project' ? await removeGeneratedProjectMirror(options) : undefined;
  if (!(await pathExists(extensionDir))) return { extensionDir, removed: false, skippedReason: 'extension directory not present', dryRun: Boolean(options.dryRun), projectMirror };
  const manifestText = await readTextIfExists(manifest);
  if (!manifestText || !manifestText.includes(`"name": "${EXTENSION_ID}"`)) {
    return { extensionDir, removed: false, skippedReason: 'manifest is missing or not owned by oh-my-qwen', dryRun: Boolean(options.dryRun), projectMirror };
  }
  if (!options.dryRun) await removeDirIfExists(extensionDir);
  return { extensionDir, removed: true, dryRun: Boolean(options.dryRun), projectMirror };
}
