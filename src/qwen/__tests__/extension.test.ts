import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { materializeExtension, uninstallExtension } from '../extension.js';
import { OMQ_SKILL_CATALOG, WORKFLOW_SKILL_CATALOG } from '../workflow-skill-catalog.js';

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

test('materializeExtension includes all packaged workflow skill adapters', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'omq-ext-skills-'));
  const setup = await materializeExtension({ scope: 'project', cwd });
  const packagedWorkflowSkills = (await readdir(path.join(process.cwd(), 'skills', 'workflows'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(WORKFLOW_SKILL_CATALOG.map((entry) => entry.name).sort(), packagedWorkflowSkills);
  assert.equal(OMQ_SKILL_CATALOG.some((entry) => entry.name === 'goal'), true);
  assert.equal(WORKFLOW_SKILL_CATALOG.some((entry) => entry.name === 'ask-claude'), false);
  assert.equal(WORKFLOW_SKILL_CATALOG.some((entry) => entry.name === 'git-master'), false);
  for (const skill of ['autopilot', 'ultragoal', 'ultraqa', 'visual-ralph', 'worker']) {
    const content = await readFile(path.join(setup.extensionDir, 'skills', skill, 'SKILL.md'), 'utf8');
    assert.match(content, new RegExp(`name: ${skill}`));
    assert.match(content, /OMQ adapter/);
    assert.match(content, /Packaged workflow skill body/);
    const command = await readFile(path.join(setup.extensionDir, 'commands', `${skill}.md`), 'utf8');
    assert.match(command, new RegExp(`# /${skill}`));
  }
});

test('uninstallExtension removes only owned extension manifest', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'omq-uninstall-'));
  const setup = await materializeExtension({ scope: 'project', cwd });
  const result = await uninstallExtension({ scope: 'project', cwd });
  assert.equal(result.extensionDir, setup.extensionDir);
  assert.equal(result.removed, true);
});
