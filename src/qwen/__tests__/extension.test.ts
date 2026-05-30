import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { materializeExtension, uninstallExtension } from '../extension.js';

test('materializeExtension writes Qwen-native extension files idempotently', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'omq-ext-'));
  const first = await materializeExtension({ scope: 'project', cwd });
  assert.equal(first.created.includes('qwen-extension.json'), true);
  assert.equal(first.created.includes('QWEN.md'), true);
  const manifestPath = path.join(first.extensionDir, 'qwen-extension.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { name: string; commands: string; skills: string; agents: string };
  assert.equal(manifest.name, 'oh-my-qwen');
  assert.equal(manifest.commands, 'commands');
  assert.equal(manifest.skills, 'skills');
  assert.equal(manifest.agents, 'agents');
  const second = await materializeExtension({ scope: 'project', cwd });
  assert.equal(second.created.length, 0);
  assert.equal(second.updated.length, 0);
  assert.ok(second.unchanged.length > 5);
});

test('uninstallExtension removes only owned extension manifest', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'omq-uninstall-'));
  const setup = await materializeExtension({ scope: 'project', cwd });
  const result = await uninstallExtension({ scope: 'project', cwd });
  assert.equal(result.extensionDir, setup.extensionDir);
  assert.equal(result.removed, true);
});
