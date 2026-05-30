import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENERATED_MARKER, OMQ_OWNER_ARG, QWEN_HOOK_EVENTS, type QwenHookEventName } from '../constants.js';
import { backupFile, ensureDir, pathExists, readJsonIfExists, stringifyJson, writeJson } from '../utils/fs.js';
import { backupRoot, qwenSettingsPath, type SetupScope } from './paths.js';

export type JsonObject = Record<string, unknown>;

export interface HookCommand {
  type: 'command';
  command: string;
  timeout?: number;
}

export interface HookGroup {
  matcher?: string;
  hooks: HookCommand[];
}

export interface SettingsMergeResult {
  settings: JsonObject;
  changed: boolean;
  disabled: boolean;
  installedEvents: QwenHookEventName[];
  removedOwnedHooks: number;
}

const MATCHER_EVENTS = new Set<QwenHookEventName>([
  'SessionStart',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'SubagentStart',
  'SubagentStop',
]);

export function defaultHookScriptPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../scripts/qwen-native-hook.js');
}

export function shellQuote(value: string): string {
  return JSON.stringify(value);
}

export function buildHookCommand(scriptPath = defaultHookScriptPath()): string {
  return `node ${shellQuote(scriptPath)} ${OMQ_OWNER_ARG}`;
}

export function isOmqHook(hook: unknown): boolean {
  return Boolean(
    hook &&
      typeof hook === 'object' &&
      typeof (hook as { command?: unknown }).command === 'string' &&
      (hook as { command: string }).command.includes(OMQ_OWNER_ARG),
  );
}

function normalizeHooks(value: unknown): HookGroup[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((group): group is HookGroup => Boolean(group && typeof group === 'object'))
    .map((group) => ({ ...(group as HookGroup), hooks: Array.isArray((group as HookGroup).hooks) ? (group as HookGroup).hooks : [] }));
}

function makeHookGroup(event: QwenHookEventName, command: string): HookGroup {
  const group: HookGroup = {
    hooks: [{ type: 'command', command, timeout: 60 }],
  };
  if (MATCHER_EVENTS.has(event)) group.matcher = '.*';
  return group;
}

export async function readQwenSettings(settingsPath: string): Promise<JsonObject> {
  return readJsonIfExists<JsonObject>(settingsPath, {});
}

export function removeOmqHooks(settings: JsonObject): { settings: JsonObject; changed: boolean; removed: number } {
  const next = structuredClone(settings) as JsonObject;
  const hooks = (next.hooks && typeof next.hooks === 'object' ? structuredClone(next.hooks) : {}) as Record<string, unknown>;
  let changed = false;
  let removed = 0;

  for (const [event, groupsValue] of Object.entries(hooks)) {
    const groups = normalizeHooks(groupsValue);
    const keptGroups: HookGroup[] = [];
    for (const group of groups) {
      const originalHooks = group.hooks ?? [];
      const keptHooks = originalHooks.filter((hook) => !isOmqHook(hook));
      removed += originalHooks.length - keptHooks.length;
      if (keptHooks.length !== originalHooks.length) changed = true;
      if (keptHooks.length > 0) keptGroups.push({ ...group, hooks: keptHooks });
    }
    if (keptGroups.length > 0) hooks[event] = keptGroups;
    else if (event in hooks) {
      delete hooks[event];
      if (groups.length > 0) changed = true;
    }
  }

  if (Object.keys(hooks).length > 0) next.hooks = hooks;
  else if ('hooks' in next) delete next.hooks;
  return { settings: next, changed, removed };
}

export function mergeOmqHooks(settings: JsonObject, command = buildHookCommand()): SettingsMergeResult {
  const disabled = settings.disableAllHooks === true;
  const removed = removeOmqHooks(settings);
  const next = structuredClone(removed.settings) as JsonObject;
  const hooks = (next.hooks && typeof next.hooks === 'object' ? structuredClone(next.hooks) : {}) as Record<string, unknown>;
  for (const event of QWEN_HOOK_EVENTS) {
    const existing = normalizeHooks(hooks[event]);
    hooks[event] = [...existing, makeHookGroup(event, command)];
  }
  next.hooks = hooks;
  const changed = stringifyJson(next) !== stringifyJson(settings);
  return { settings: next, changed, disabled, installedEvents: [...QWEN_HOOK_EVENTS], removedOwnedHooks: removed.removed };
}

export interface WriteSettingsOptions {
  scope: SetupScope;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  dryRun?: boolean;
}

export interface SettingsWriteSummary {
  settingsPath: string;
  changed: boolean;
  disabled: boolean;
  backupPath?: string;
  installedEvents: QwenHookEventName[];
  dryRun: boolean;
}

export async function upsertSettingsHooks(options: WriteSettingsOptions, command = buildHookCommand()): Promise<SettingsWriteSummary> {
  const env = options.env ?? process.env;
  const settingsPath = qwenSettingsPath(options.scope, { cwd: options.cwd, env });
  const current = await readQwenSettings(settingsPath);
  const merge = mergeOmqHooks(current, command);
  let backupPath: string | undefined;
  if (!options.dryRun && merge.changed) {
    if (await pathExists(settingsPath)) backupPath = await backupFile(settingsPath, backupRoot(options.scope, { cwd: options.cwd, env }), 'qwen-settings');
    await ensureDir(path.dirname(settingsPath));
    await writeJson(settingsPath, merge.settings);
  }
  return {
    settingsPath,
    changed: merge.changed,
    disabled: merge.disabled,
    backupPath,
    installedEvents: merge.installedEvents,
    dryRun: Boolean(options.dryRun),
  };
}

export interface RemoveSettingsOptions extends WriteSettingsOptions {}

export interface SettingsRemoveSummary {
  settingsPath: string;
  changed: boolean;
  removedOwnedHooks: number;
  backupPath?: string;
  dryRun: boolean;
}

export async function removeSettingsHooks(options: RemoveSettingsOptions): Promise<SettingsRemoveSummary> {
  const env = options.env ?? process.env;
  const settingsPath = qwenSettingsPath(options.scope, { cwd: options.cwd, env });
  const current = await readQwenSettings(settingsPath);
  const removed = removeOmqHooks(current);
  let backupPath: string | undefined;
  if (!options.dryRun && removed.changed) {
    backupPath = await backupFile(settingsPath, backupRoot(options.scope, { cwd: options.cwd, env }), 'qwen-settings');
    await writeJson(settingsPath, removed.settings);
  }
  return { settingsPath, changed: removed.changed, removedOwnedHooks: removed.removed, backupPath, dryRun: Boolean(options.dryRun) };
}

export function generatedFileHeader(relativePath: string): string {
  return `<!-- ${GENERATED_MARKER}: ${relativePath}. Re-run omq setup to refresh. -->\n`;
}
