import { VERSION } from '../constants.js';
import { materializeExtension, uninstallExtension } from '../qwen/extension.js';
import { buildDoctorReport } from '../qwen/doctor.js';
import { configPath, normalizeScope, type SetupScope } from '../qwen/paths.js';
import { buildHookCommand, removeSettingsHooks, upsertSettingsHooks } from '../qwen/settings.js';
import { ensureStateTree } from '../state/paths.js';
import { writeJson } from '../utils/fs.js';

export interface SetupCommandOptions {
  scope: SetupScope;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  dryRun?: boolean;
  forceProject?: boolean;
}

export async function setup(options: SetupCommandOptions) {
  const env = options.env ?? process.env;
  await ensureStateTree(options.cwd, env);
  const extension = await materializeExtension(options);
  const settings = await upsertSettingsHooks(options, buildHookCommand());
  const doctor = await buildDoctorReport(options.scope, options.cwd, env);
  const config = {
    package: 'oh-my-qwen',
    version: VERSION,
    setup_scope: options.scope,
    installed_extension_path: extension.extensionDir,
    qwen_binary_path: doctor.probe.qwenBinary,
    hook_command: buildHookCommand(),
    trust_status: options.scope === 'project' ? 'unknown-mvp-detect-manually' : 'not-required-user-scope',
    hook_disabled: settings.disabled,
    updated_at: new Date().toISOString(),
  };
  if (!options.dryRun) await writeJson(configPath(options.cwd, env), config);
  return { extension, settings, config, doctor, dryRun: Boolean(options.dryRun) };
}

export async function uninstall(options: SetupCommandOptions) {
  const extension = await uninstallExtension(options);
  const settings = await removeSettingsHooks(options);
  return { extension, settings, dryRun: Boolean(options.dryRun) };
}

export function parseScope(value: string | undefined): SetupScope {
  return normalizeScope(value);
}
