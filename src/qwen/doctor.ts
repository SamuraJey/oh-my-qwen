import path from 'node:path';
import { pathExists, readJsonIfExists } from '../utils/fs.js';
import { qwenDir, qwenExtensionDir, qwenSettingsPath, type SetupScope } from './paths.js';
import { isOmqHook, type JsonObject } from './settings.js';
import { probeQwen, type QwenProbeResult } from './probe.js';

export interface DoctorCheck {
  name: string;
  ok: boolean;
  level: 'ok' | 'warn' | 'fail';
  message: string;
}

export interface DoctorReport {
  scope: SetupScope;
  cwd: string;
  probe: QwenProbeResult;
  settingsPath: string;
  extensionDir: string;
  disableAllHooks: boolean;
  hookEventsPresent: string[];
  checks: DoctorCheck[];
  ok: boolean;
}

function check(name: string, ok: boolean, message: string, fail = false): DoctorCheck {
  return { name, ok, level: ok ? 'ok' : fail ? 'fail' : 'warn', message };
}

export async function buildDoctorReport(scope: SetupScope, cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): Promise<DoctorReport> {
  const probe = probeQwen(env);
  const settingsPath = qwenSettingsPath(scope, { cwd, env });
  const extensionDir = qwenExtensionDir(scope, { cwd, env });
  const userExtensionDir = qwenExtensionDir('user', { cwd, env });
  const projectQwenDir = qwenDir('project', { cwd, env });
  const settings = await readJsonIfExists<JsonObject>(settingsPath, {});
  const hooks = (settings.hooks && typeof settings.hooks === 'object' ? settings.hooks : {}) as Record<string, unknown>;
  const hookEventsPresent = Object.entries(hooks)
    .filter(([, groups]) => Array.isArray(groups) && groups.some((group) => group && typeof group === 'object' && Array.isArray((group as { hooks?: unknown }).hooks) && ((group as { hooks: unknown[] }).hooks.some(isOmqHook))))
    .map(([event]) => event)
    .sort();
  const disableAllHooks = settings.disableAllHooks === true;
  const extensionExists = await pathExists(extensionDir);
  const userExtensionExists = await pathExists(userExtensionDir);
  const projectCommandMirrorExists = await pathExists(path.join(projectQwenDir, 'commands', 'ultragoal.md'));
  const projectSkillMirrorExists = await pathExists(path.join(projectQwenDir, 'skills', 'ultragoal', 'SKILL.md'));
  const projectAgentMirrorExists = await pathExists(path.join(projectQwenDir, 'agents', 'planner.md'));
  const settingsExists = await pathExists(settingsPath);
  const checks = [
    check('node', probe.nodeOk, probe.nodeOk ? `Node ${probe.nodeVersion}` : `Node >=22 required, current ${probe.nodeVersion}`, true),
    check('qwen-binary', probe.qwenOk, probe.qwenBinary ? `qwen found: ${probe.qwenBinary}` : 'qwen not found on PATH or QWEN_BIN'),
    check('qwen-version', Boolean(probe.qwenVersion), probe.qwenVersion ? `qwen version: ${probe.qwenVersion}` : 'qwen version unavailable'),
    check('settings', settingsExists, settingsExists ? `settings: ${settingsPath}` : `settings will be created at ${settingsPath}`),
    check('extension', extensionExists, extensionExists ? `extension installed: ${extensionDir}` : `extension missing: ${extensionDir}`),
    ...(scope === 'project' ? [
      check('project-surfaces', projectCommandMirrorExists && projectSkillMirrorExists && projectAgentMirrorExists, projectCommandMirrorExists && projectSkillMirrorExists && projectAgentMirrorExists ? `project commands/skills/agents mirror installed under ${projectQwenDir}` : `project mirror missing under ${projectQwenDir}; run omq setup --scope project`),
      check('extension-visibility', userExtensionExists, userExtensionExists ? `Qwen installed extension also present in user scope: ${userExtensionDir}` : 'Qwen Code 0.17 lists installed extensions from QWEN_HOME; project .qwen/extensions is package metadata, while project commands/skills/agents are loaded from the mirror. Use omq setup --scope user for /extensions visibility.'),
    ] : []),
    check('hooks', hookEventsPresent.length > 0, hookEventsPresent.length > 0 ? `OMQ hook events: ${hookEventsPresent.join(', ')}` : 'OMQ hook entries missing'),
    check('hooks-enabled', !disableAllHooks, disableAllHooks ? 'settings.disableAllHooks is true; installed hooks are inactive' : 'hooks are not globally disabled', true),
    check('project-trust', scope === 'user', scope === 'user' ? 'user scope does not require project trust' : 'project trust detection is advisory in MVP; verify Qwen trusts this workspace'),
  ];
  const ok = checks.every((item) => item.ok || item.level !== 'fail');
  return { scope, cwd, probe, settingsPath, extensionDir, disableAllHooks, hookEventsPresent, checks, ok };
}

export function renderDoctorReport(report: DoctorReport): string {
  const lines = [`oh-my-qwen doctor (${report.scope} scope)`, `cwd: ${report.cwd}`];
  for (const item of report.checks) {
    const icon = item.level === 'ok' ? 'ok' : item.level === 'warn' ? 'warn' : 'fail';
    lines.push(`- [${icon}] ${item.name}: ${item.message}`);
  }
  return `${lines.join('\n')}\n`;
}
