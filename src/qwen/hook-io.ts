import { QWEN_HOOK_EVENTS, type QwenHookEventName } from '../constants.js';

export interface HookEnvelope {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name: QwenHookEventName | string;
  timestamp?: string;
  prompt?: string;
  permission_mode?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  tool_use_id?: string;
  agent_id?: string;
  agent_type?: string;
  stop_hook_active?: boolean;
  last_assistant_message?: string;
  [key: string]: unknown;
}

export interface HookOutput {
  continue?: boolean;
  stopReason?: string;
  suppressOutput?: boolean;
  systemMessage?: string;
  decision?: 'allow' | 'deny' | 'block' | 'ask';
  reason?: string;
  hookSpecificOutput: {
    hookEventName: string;
    additionalContext?: string;
    permissionDecision?: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;
    updatedInput?: unknown;
    [key: string]: unknown;
  };
}

export function normalizeHookEventName(input: unknown): string {
  if (!input || typeof input !== 'object') return 'Unknown';
  const value =
    (input as Record<string, unknown>).hook_event_name ??
    (input as Record<string, unknown>).hookEventName ??
    (input as Record<string, unknown>).event ??
    (input as Record<string, unknown>).eventName;
  return typeof value === 'string' && value ? value : 'Unknown';
}

export function isKnownHookEvent(name: string): name is QwenHookEventName {
  return (QWEN_HOOK_EVENTS as readonly string[]).includes(name);
}

export function parseHookInput(raw: string): HookEnvelope {
  const parsed = JSON.parse(raw || '{}') as Record<string, unknown>;
  const hook_event_name = normalizeHookEventName(parsed);
  return { ...parsed, hook_event_name } as HookEnvelope;
}

export function formatHookOutput(output: HookOutput): string {
  return `${JSON.stringify(output)}\n`;
}

export function allowOutput(event: string, additionalContext?: string): HookOutput {
  return {
    decision: 'allow',
    reason: 'oh-my-qwen hook allowed event',
    hookSpecificOutput: {
      hookEventName: event,
      ...(additionalContext ? { additionalContext } : {}),
    },
  };
}
