import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { handleHook } from '../lifecycle.js';
import { writeModeState } from '../../state/modes.js';

test('UserPromptSubmit injects ralplan routing context', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'omq-hook-'));
  const out = await handleHook({ hook_event_name: 'UserPromptSubmit', cwd, prompt: '/ralplan build this' });
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.equal(out.decision, 'allow');
  assert.match(out.hookSpecificOutput.additionalContext || '', /ralplan consensus workflow/);
});

test('PreToolUse uses hookSpecificOutput permission decision', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'omq-hook-pre-'));
  const out = await handleHook({ hook_event_name: 'PreToolUse', cwd, tool_name: 'Bash', tool_input: { command: 'rm -rf /' } });
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'ask');
  assert.match(out.hookSpecificOutput.permissionDecisionReason || '', /destructive/);
});

test('Stop blocks active non-terminal workflow and allows terminal state', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'omq-stop-'));
  await writeModeState('ralplan', { active: true, status: 'draft-created' }, cwd);
  const blocked = await handleHook({ hook_event_name: 'Stop', cwd });
  assert.equal(blocked.hookSpecificOutput.hookEventName, 'Stop');
  assert.equal(blocked.decision, 'block');
  await writeModeState('ralplan', { active: false, lifecycle_outcome: 'finished' }, cwd);
  const allowed = await handleHook({ hook_event_name: 'Stop', cwd });
  assert.equal(allowed.decision, 'allow');
});

test('all supported hook events return hookSpecificOutput.hookEventName', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'omq-all-hooks-'));
  for (const event of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Stop', 'SubagentStart', 'SubagentStop', 'SessionEnd', 'PreCompact', 'PostCompact']) {
    const out = await handleHook({ hook_event_name: event, cwd, prompt: 'hello', tool_name: 'ReadFile' });
    assert.equal(out.hookSpecificOutput.hookEventName, event);
  }
});
