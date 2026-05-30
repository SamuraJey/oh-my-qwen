import path from 'node:path';
import { EXTENSION_ID, GENERATED_MARKER } from '../constants.js';
import { backupFile, ensureDir, pathExists, readTextIfExists, removeDirIfExists, writeFileIfChanged } from '../utils/fs.js';
import { backupRoot, qwenExtensionDir, type SetupScope } from './paths.js';
import { renderExtensionFiles } from './extension-manifest.js';

export interface ExtensionSummary {
  extensionDir: string;
  dryRun: boolean;
  created: string[];
  updated: string[];
  unchanged: string[];
  backedUp: string[];
}

export interface ExtensionOptions {
  scope: SetupScope;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  dryRun?: boolean;
}

export async function materializeExtension(options: ExtensionOptions): Promise<ExtensionSummary> {
  const env = options.env ?? process.env;
  const extensionDir = qwenExtensionDir(options.scope, { cwd: options.cwd, env });
  const files = renderExtensionFiles();
  const summary: ExtensionSummary = { extensionDir, dryRun: Boolean(options.dryRun), created: [], updated: [], unchanged: [], backedUp: [] };

  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(extensionDir, relative);
    const current = await readTextIfExists(target);
    if (current === content) {
      summary.unchanged.push(relative);
      continue;
    }
    if (current === undefined) {
      summary.created.push(relative);
    } else {
      summary.updated.push(relative);
      if (!current.includes(GENERATED_MARKER)) {
        const backup = path.join(backupRoot(options.scope, { cwd: options.cwd, env }), 'extension');
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

export interface UninstallSummary {
  extensionDir: string;
  removed: boolean;
  skippedReason?: string;
  dryRun: boolean;
}

export async function uninstallExtension(options: ExtensionOptions): Promise<UninstallSummary> {
  const env = options.env ?? process.env;
  const extensionDir = qwenExtensionDir(options.scope, { cwd: options.cwd, env });
  const manifest = path.join(extensionDir, 'qwen-extension.json');
  if (!(await pathExists(extensionDir))) return { extensionDir, removed: false, skippedReason: 'extension directory not present', dryRun: Boolean(options.dryRun) };
  const manifestText = await readTextIfExists(manifest);
  if (!manifestText || !manifestText.includes(`"name": "${EXTENSION_ID}"`)) {
    return { extensionDir, removed: false, skippedReason: 'manifest is missing or not owned by oh-my-qwen', dryRun: Boolean(options.dryRun) };
  }
  if (!options.dryRun) await removeDirIfExists(extensionDir);
  return { extensionDir, removed: true, dryRun: Boolean(options.dryRun) };
}
