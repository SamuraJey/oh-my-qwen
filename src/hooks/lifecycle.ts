import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { ensureDir } from '../utils/fs.js';
import { getStatePaths } from '../state/paths.js';
import { listActiveModes } from '../state/modes.js';
import type { HookEnvelope, HookOutput } from '../qwen/hook-io.js';
import { allowOutput, isKnownHookEvent } from '../qwen/hook-io.js';
import { detectWorkflowRoute, routingContext } from './keyword-detector.js';

function eventName(input: HookEnvelope): string {
  return String(input.hook_event_name || 'Unknown');
}

async function appendHookLog(input: HookEnvelope, cwd: string): Promise<void> {
  const paths = getStatePaths(cwd);
  await ensureDir(paths.logs);
  const day = new Date().toISOString().slice(0, 10);
  const line = JSON.stringify({ ts: new Date().toISOString(), event: eventName(input), session_id: input.session_id, tool_name: input.tool_name, agent_type: input.agent_type }) + '\n';
  await writeFile(path.join(paths.logs, `hooks-${day}.jsonl`), line, { flag: 'a' });
}

function preToolUse(input: HookEnvelope): HookOutput {
  const toolName = String(input.tool_name || 'unknown');
  const toolInput = input.tool_input && typeof input.tool_input === 'object' ? (input.tool_input as Record<string, unknown>) : {};
  const command = typeof toolInput.command === 'string' ? toolInput.command : '';
  const dangerous = /rm\s+-rf\s+(?:\/|~|\$HOME)(?:\s|$)|mkfs|:\(\)\{\s*:\|:&\s*\};:/i.test(command);
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: dangerous ? 'ask' : 'allow',
      permissionDecisionReason: dangerous ? 'Potentially destructive shell command; ask user before proceeding.' : `OMQ allows ${toolName}.`,
      ...(dangerous ? { additionalContext: 'oh-my-qwen safety check detected a destructive-looking command.' } : {}),
    },
  };
}

async function stopOutput(cwd: string): Promise<HookOutput> {
  const active = await listActiveModes(cwd);
  if (active.length === 0) return allowOutput('Stop', 'oh-my-qwen: no active non-terminal workflow modes.');
  const modes = active.map((mode) => mode.mode).join(', ');
  return {
    decision: 'block',
    reason: `Active OMQ workflow mode(s) still non-terminal: ${modes}`,
    stopReason: `Continue active oh-my-qwen workflow mode(s): ${modes}. Finish, block, fail, or ask the user explicitly before stopping.`,
    hookSpecificOutput: {
      hookEventName: 'Stop',
      additionalContext: `Active non-terminal OMQ mode(s): ${modes}`,
    },
  };
}

export async function handleHook(input: HookEnvelope): Promise<HookOutput> {
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const event = eventName(input);
  if (isKnownHookEvent(event)) await appendHookLog(input, cwd);

  switch (event) {
    case 'SessionStart': {
      const active = await listActiveModes(cwd);
      return allowOutput('SessionStart', `oh-my-qwen active. State root: ${getStatePaths(cwd).root}. Active modes: ${active.map((m) => m.mode).join(', ') || 'none'}.`);
    }
    case 'UserPromptSubmit': {
      const prompt = typeof input.prompt === 'string' ? input.prompt : '';
      const route = detectWorkflowRoute(prompt);
      return {
        decision: 'allow',
        reason: route ? `OMQ route detected: ${route.workflow} (${route.reason})` : 'No OMQ workflow route detected.',
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          ...(route ? { additionalContext: routingContext(route) } : {}),
        },
      };
    }
    case 'PreToolUse':
      return preToolUse(input);
    case 'PostToolUse':
      return allowOutput('PostToolUse', 'oh-my-qwen logged successful tool use.');
    case 'PostToolUseFailure':
      return allowOutput('PostToolUseFailure', 'oh-my-qwen observed a failed tool use. Capture root cause and retry only with a bounded fix.');
    case 'Stop':
      return stopOutput(cwd);
    case 'SubagentStart':
      return allowOutput('SubagentStart', `oh-my-qwen subagent context: role=${input.agent_type || 'unknown'}; respect assigned scope and return evidence.`);
    case 'SubagentStop':
      return allowOutput('SubagentStop', `oh-my-qwen subagent stopped: role=${input.agent_type || 'unknown'}; collect changed files and validation evidence if any.`);
    case 'SessionEnd':
      return allowOutput('SessionEnd');
    case 'PreCompact':
      return allowOutput('PreCompact', 'oh-my-qwen: preserve active workflow state and latest evidence before compaction.');
    case 'PostCompact':
      return allowOutput('PostCompact', 'oh-my-qwen: resume from .omq state and recent logs after compaction.');
    default:
      return allowOutput(event, 'oh-my-qwen: unknown hook event; fail-open.');
  }
}
