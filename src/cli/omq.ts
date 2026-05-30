#!/usr/bin/env node
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../constants.js';
import { buildDoctorReport, renderDoctorReport } from '../qwen/doctor.js';
import { probeQwen } from '../qwen/probe.js';
import { normalizeScope, type SetupScope } from '../qwen/paths.js';
import { parseHookInput, formatHookOutput } from '../qwen/hook-io.js';
import { handleHook } from '../hooks/lifecycle.js';
import { setup, uninstall } from './setup.js';
import { runQwenExec } from '../exec/qwen-exec.js';
import { completeGoal, createDeepInterviewContext, createGoal, createRalplanArtifacts, createTeamPlan } from '../workflows/artifacts.js';
import { mcpServeCommand } from './mcp-serve.js';
import { COMPAT_ROWS, compatSummary, renderCompatMarkdown } from '../compat/matrix.js';
import { probeQwenFeatures, renderQwenFeatures } from '../qwen/features.js';
import { OMQ_SKILL_CATALOG } from '../qwen/workflow-skill-catalog.js';
import { runInteractiveQwenLaunch } from '../launch/qwen-launch.js';
import { listActiveModes } from '../state/modes.js';
import { cancelWorkflow, checkpointWorkflow, finishWorkflow, renderWorkflowRuntimeResult, startWorkflow } from '../workflows/runtime.js';

interface ParsedGlobal {
  cwd: string;
  json: boolean;
  scope: SetupScope;
  dryRun: boolean;
  forceProject: boolean;
  rest: string[];
}

function help(): string {
  return `oh-my-qwen ${VERSION}\n\nUsage:\n  omq help\n  omq version [--json]\n  omq doctor [--json] [--scope user|project]\n  omq probe --json\n  omq status [--json] [--scope user|project]\n  omq setup --scope user|project [--dry-run] [--force-project]\n  omq uninstall --scope user|project [--dry-run]\n  omq [launch] [--tmux|--direct] [qwen args...]\n  omq resume [qwen resume args...]\n  omq exec [-C dir] [--approval-mode MODE] [--model MODEL] [--continue] [--resume [ID]] "prompt"\n  omq list [--json]\n  omq mcp-serve state|memory|wiki\n  omq workflow start|checkpoint|finish|cancel <mode|all> [text]\n  omq deep-interview "task"\n  omq ralplan "task"\n  omq goal start|complete|block|fail "objective"\n  omq team plan "task"\n\nLaunch policy: OMQ_LAUNCH_POLICY=auto|direct|tmux, or CLI --direct/--tmux. Default is detached tmux on supported interactive terminals, direct otherwise; inside tmux runs in the current pane.\nMVP constraints: no qwen-code fork, .omq state root, Qwen hooks via marker-owned settings entries.\n`;
}

function takeFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  args.splice(idx, value && !value.startsWith('--') ? 2 : 1);
  return value && !value.startsWith('--') ? value : undefined;
}

function takeBoolean(args: string[], name: string): boolean {
  const idx = args.indexOf(name);
  if (idx === -1) return false;
  args.splice(idx, 1);
  return true;
}

function parseGlobal(argv: string[]): ParsedGlobal {
  const args = [...argv];
  const cwdFlag = takeFlag(args, '-C') ?? takeFlag(args, '--cwd');
  const scope = normalizeScope(takeFlag(args, '--scope'));
  return {
    cwd: cwdFlag ? path.resolve(cwdFlag) : process.cwd(),
    json: takeBoolean(args, '--json'),
    scope,
    dryRun: takeBoolean(args, '--dry-run'),
    forceProject: takeBoolean(args, '--force-project'),
    rest: args,
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}


function localInstallText(): string {
  return `Local oh-my-qwen install (from repository checkout):

1. cd /home/samuraj/Documents/code/oh-my-qwen
2. npm install
3. npm test
4. npm install -g .
5. omq doctor --scope project
6. omq setup --scope project   # writes .qwen/ + .omq/ in the current project
   # or: omq setup --scope user # writes ${'${QWEN_HOME:-~/.qwen}'}/extensions/oh-my-qwen
7. qwen /extensions          # optional: verify extension visibility inside Qwen Code
8. omq exec "Reply with exactly OMQ-EXEC-OK"
9. omq --tmux                # interactive Qwen in an OMQ-managed tmux session
   omq --direct              # interactive Qwen without tmux

Safe dry-run/uninstall:
- omq setup --scope project --dry-run
- omq uninstall --scope project

Nessy fork wrapper:
- omq-nessy --tmux
- env NESSY_BIN=/path/to/nessy NESSY_HOME=$HOME/.nessy omq-nessy

No qwen-code fork is modified. Setup owns only generated oh-my-qwen extension files and hooks containing --omq-owned=oh-my-qwen.
`;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printSetupSummary(result: Awaited<ReturnType<typeof setup>>): void {
  const lines = [
    `omq setup ${result.dryRun ? '(dry-run) ' : ''}complete`,
    `extension: ${result.extension.extensionDir}`,
    `  created: ${result.extension.created.length}`,
    `  updated: ${result.extension.updated.length}`,
    `  unchanged: ${result.extension.unchanged.length}`,
  ];
  if (result.extension.skipped.length) lines.push(`  skipped: ${result.extension.skipped.length}`);
  if (result.extension.projectMirror) {
    const mirror = result.extension.projectMirror;
    lines.push(
      `project surfaces: ${mirror.rootDir}`,
      `  created: ${mirror.created.length}`,
      `  updated: ${mirror.updated.length}`,
      `  unchanged: ${mirror.unchanged.length}`,
      `  skipped: ${mirror.skipped.length}`,
    );
    if (mirror.skipped.length) lines.push('  WARNING: existing non-generated project command/skill/agent files were left untouched. Re-run with --force-project to overwrite after backup.');
    lines.push('  note: Qwen Code loads project commands/skills/agents from .qwen/{commands,skills,agents}; project .qwen/extensions is kept as package metadata.');
  }
  lines.push(
    `settings: ${result.settings.settingsPath}`,
    `  changed: ${result.settings.changed}`,
    `  hooks disabled: ${result.settings.disabled}`,
    `  mcp servers: ${result.settings.installedMcpServers.join(', ') || 'none'}`,
  );
  if (result.settings.skippedMcpServers.length) lines.push(`  WARNING: skipped existing non-generated MCP server keys: ${result.settings.skippedMcpServers.join(', ')}`);
  if (result.settings.disabled) lines.push('WARNING: settings.disableAllHooks is true; hooks are installed but inactive.');
  lines.push('Smoke checks: omq doctor; qwen -p "Reply with exactly OMQ-EXEC-OK" --output-format json; omq exec "Reply with exactly OMQ-EXEC-OK"');
  process.stdout.write(`${lines.join('\n')}\n`);
}

function printUninstallSummary(result: Awaited<ReturnType<typeof uninstall>>): void {
  process.stdout.write(`omq uninstall ${result.dryRun ? '(dry-run) ' : ''}complete\nextension removed: ${result.extension.removed}\nsettings changed: ${result.settings.changed}\nowned hooks removed: ${result.settings.removedOwnedHooks}\n`);
  process.stdout.write(`owned MCP servers removed: ${result.settings.removedOwnedMcpServers}\n`);
  if (result.extension.projectMirror) process.stdout.write(`project surfaces removed: ${result.extension.projectMirror.removed.length}\n`);
  if (result.extension.skippedReason) process.stdout.write(`extension skipped: ${result.extension.skippedReason}\n`);
}

async function commandExec(global: ParsedGlobal, args: string[]): Promise<number> {
  const approvalMode = takeFlag(args, '--approval-mode');
  const model = takeFlag(args, '--model');
  const systemPrompt = takeFlag(args, '--system-prompt');
  const appendSystemPrompt = takeFlag(args, '--append-system-prompt');
  const maxSessionTurns = takeFlag(args, '--max-session-turns');
  const maxWallTime = takeFlag(args, '--max-wall-time');
  const maxToolCalls = takeFlag(args, '--max-tool-calls');
  const includePartialMessages = takeBoolean(args, '--include-partial-messages');
  const continueSession = takeBoolean(args, '--continue');
  let resume: string | true | undefined;
  const resumeIdx = args.indexOf('--resume');
  if (resumeIdx !== -1) {
    const next = args[resumeIdx + 1];
    resume = next && !next.startsWith('--') ? next : true;
    args.splice(resumeIdx, resume === true ? 1 : 2);
  }
  const prompt = args.join(' ').trim();
  if (!prompt) throw new Error('omq exec requires a prompt');
  const result = await runQwenExec(prompt, { cwd: global.cwd, approvalMode, model, systemPrompt, appendSystemPrompt, continueSession, resume, maxSessionTurns, maxWallTime, maxToolCalls, includePartialMessages });
  if (global.json) printJson(result);
  else process.stdout.write(result.response || result.stdout);
  return result.exitCode ?? 1;
}

async function commandWorkflow(kind: string, args: string[], cwd: string): Promise<number> {
  const task = args.join(' ').trim();
  if (!task && kind !== 'goal') throw new Error(`omq ${kind} requires a task`);
  if (kind === 'deep-interview') {
    printJson(await createDeepInterviewContext(task, cwd));
  } else if (kind === 'ralplan' || kind === 'plan') {
    printJson(await createRalplanArtifacts(task, cwd));
  } else if (kind === 'team') {
    const sub = args.shift();
    if (sub !== 'plan') throw new Error('omq team currently supports: plan "task"');
    printJson(await createTeamPlan(args.join(' ').trim(), cwd));
  }
  return 0;
}

async function commandGoal(args: string[], cwd: string): Promise<number> {
  const sub = args.shift();
  if (sub === 'start') printJson(await createGoal(args.join(' ').trim(), cwd));
  else if (sub === 'complete') printJson(await completeGoal('finished', cwd));
  else if (sub === 'block') printJson(await completeGoal('blocked', cwd));
  else if (sub === 'fail') printJson(await completeGoal('failed', cwd));
  else throw new Error('omq goal supports: start|complete|block|fail');
  return 0;
}

async function commandWorkflowRuntime(json: boolean, args: string[], cwd: string): Promise<number> {
  const sub = args.shift();
  const mode = args.shift();
  const writeResult = (value: unknown): void => {
    if (json) printJson(value);
    else if (value && typeof value === 'object' && 'action' in value && 'state' in value) process.stdout.write(renderWorkflowRuntimeResult(value as Awaited<ReturnType<typeof startWorkflow>>));
    else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  };

  if (sub === 'start') {
    if (!mode) throw new Error('omq workflow start requires a mode');
    writeResult(await startWorkflow(mode, args.join(' ').trim(), cwd));
  } else if (sub === 'checkpoint') {
    if (!mode) throw new Error('omq workflow checkpoint requires a mode');
    writeResult(await checkpointWorkflow(mode, args.join(' ').trim(), cwd));
  } else if (sub === 'finish') {
    if (!mode) throw new Error('omq workflow finish requires a mode');
    writeResult(await finishWorkflow(mode, args.shift() || 'finished', cwd));
  } else if (sub === 'cancel') {
    const target = mode || 'all';
    const reason = args.join(' ').trim() || 'cancelled by command';
    if (target === 'all') {
      const active = await listActiveModes(cwd);
      const cancelled = [];
      for (const item of active) cancelled.push(await cancelWorkflow(item.mode, reason, cwd));
      writeResult({ action: 'cancel', mode: 'all', cancelled, count: cancelled.length });
    } else {
      writeResult(await cancelWorkflow(target, reason, cwd));
    }
  } else {
    throw new Error('omq workflow supports: start|checkpoint|finish|cancel');
  }
  return 0;
}

async function commandLaunch(global: ParsedGlobal, args: string[]): Promise<number> {
  const result = await runInteractiveQwenLaunch(args, { cwd: global.cwd });
  if (global.json) printJson(result);
  return result.exitCode;
}

function commandList(json: boolean): number {
  const value = {
    skills: OMQ_SKILL_CATALOG,
    count: OMQ_SKILL_CATALOG.length,
  };
  if (json) {
    printJson(value);
  } else {
    process.stdout.write(`oh-my-qwen skills (${value.count})\n`);
    for (const entry of value.skills) process.stdout.write(`- ${entry.name} [${entry.status}]: ${entry.description}\n`);
  }
  return 0;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const global = parseGlobal(argv);
  const [rawCmd, ...args] = global.rest;
  const cmd = !rawCmd
    ? 'launch'
    : rawCmd === '--help' || rawCmd === '-h'
      ? 'help'
      : rawCmd === '--version' || rawCmd === '-v'
        ? 'version'
        : rawCmd.startsWith('-')
          ? 'launch'
          : rawCmd;
  const launchArgs = rawCmd && rawCmd.startsWith('-') && cmd === 'launch' ? [rawCmd, ...args] : args;

  switch (cmd) {
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(help());
      return 0;
    case 'version':
    case '--version':
    case '-v':
      if (global.json) printJson({ version: VERSION });
      else process.stdout.write(`${VERSION}\n`);
      return 0;
    case 'probe':
      printJson(probeQwen());
      return 0;
    case 'doctor':
    case 'status': {
      const report = await buildDoctorReport(global.scope, global.cwd);
      if (global.json || cmd === 'status') printJson(report);
      else process.stdout.write(renderDoctorReport(report));
      return report.ok ? 0 : 1;
    }
    case 'compat': {
      if (global.json) printJson({ summary: compatSummary(), rows: COMPAT_ROWS });
      else process.stdout.write(renderCompatMarkdown());
      return 0;
    }
    case 'qwen-features':
    case 'features': {
      const probe = probeQwenFeatures();
      if (global.json) printJson(probe);
      else process.stdout.write(renderQwenFeatures(probe));
      return 0;
    }
    case 'list':
      return commandList(global.json);
    case 'install-local':
      process.stdout.write(localInstallText());
      return 0;
    case 'setup': {
      const result = await setup({ scope: global.scope, cwd: global.cwd, dryRun: global.dryRun, forceProject: global.forceProject });
      if (global.json) printJson(result);
      else printSetupSummary(result);
      return result.doctor.ok ? 0 : 0;
    }
    case 'uninstall': {
      const result = await uninstall({ scope: global.scope, cwd: global.cwd, dryRun: global.dryRun, forceProject: global.forceProject });
      if (global.json) printJson(result);
      else printUninstallSummary(result);
      return 0;
    }
    case 'hook': {
      const raw = await readStdin();
      process.stdout.write(formatHookOutput(await handleHook(parseHookInput(raw))));
      return 0;
    }
    case 'launch':
      return commandLaunch(global, launchArgs);
    case 'resume':
      return commandLaunch(global, ['--resume', ...launchArgs]);
    case 'exec':
      return commandExec(global, args);
    case 'workflow':
      return commandWorkflowRuntime(global.json, args, global.cwd);
    case 'deep-interview':
    case 'ralplan':
    case 'plan':
      return commandWorkflow(cmd, args, global.cwd);
    case 'team':
      return commandWorkflow(cmd, args, global.cwd);
    case 'goal':
      return commandGoal(args, global.cwd);
    case 'mcp-serve':
      await mcpServeCommand(args);
      return 0;
    default:
      throw new Error(`Unknown command: ${cmd}\n\n${help()}`);
  }
}

const isDirectRun = process.argv[1] ? realpathSync(process.argv[1]) === fileURLToPath(import.meta.url) : false;

if (isDirectRun) {
  main().then((code) => process.exit(code)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
