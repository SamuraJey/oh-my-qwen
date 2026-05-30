import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mergeOmqHooks, removeOmqHooks, upsertSettingsHooks } from '../settings.js';

test('settings merge preserves user hooks and upserts OMQ-owned hooks', () => {
  const input = {
    disableAllHooks: true,
    custom: { keep: true },
    hooks: {
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo user' }] },
        { matcher: '.*', hooks: [{ type: 'command', command: 'node old.js --omq-owned=oh-my-qwen' }] },
      ],
    },
  };
  const result = mergeOmqHooks(input, 'node hook.js --omq-owned=oh-my-qwen');
  assert.equal(result.disabled, true);
  assert.equal(result.removedOwnedHooks, 1);
  assert.equal((result.settings.custom as { keep: boolean }).keep, true);
  const pre = (result.settings.hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>).PreToolUse;
  assert.equal(pre.some((group) => group.hooks.some((hook) => hook.command === 'echo user')), true);
  assert.equal(pre.filter((group) => group.hooks.some((hook) => hook.command.includes('--omq-owned=oh-my-qwen'))).length, 1);
});

test('removeSettingsHooks removes only OMQ-owned hooks', () => {
  const result = removeOmqHooks({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'user' }, { type: 'command', command: 'omq --omq-owned=oh-my-qwen' }] }] } });
  assert.equal(result.removed, 1);
  const stop = (result.settings.hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>).Stop;
  assert.deepEqual(stop[0].hooks.map((hook) => hook.command), ['user']);
});

test('upsertSettingsHooks creates backups and respects QWEN_HOME', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'omq-home-'));
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'omq-cwd-'));
  const settingsPath = path.join(home, 'settings.json');
  await writeFile(settingsPath, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'user' }] }] } }));
  const summary = await upsertSettingsHooks({ scope: 'user', cwd, env: { ...process.env, QWEN_HOME: home } }, 'node hook.js --omq-owned=oh-my-qwen');
  assert.equal(summary.settingsPath, settingsPath);
  assert.ok(summary.backupPath);
  const written = JSON.parse(await readFile(settingsPath, 'utf8')) as { hooks: Record<string, unknown> };
  assert.ok(written.hooks.UserPromptSubmit);
  assert.ok(written.hooks.Stop);
});
