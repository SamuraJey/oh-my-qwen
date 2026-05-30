import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDeepInterviewContext, createGoal, createRalplanArtifacts, createTeamPlan } from '../artifacts.js';
import { pathExists } from '../../utils/fs.js';

test('workflow MVP writes durable .omq artifacts', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'omq-artifacts-'));
  const context = await createDeepInterviewContext('clarify Qwen setup', cwd);
  assert.equal(await pathExists(context.path), true);
  const plans = await createRalplanArtifacts('build qwen harness', cwd);
  assert.equal(plans.length, 2);
  assert.equal(await pathExists(plans[0].path), true);
  const goal = await createGoal('ship MVP', cwd);
  assert.equal(await pathExists(goal.path), true);
  const team = await createTeamPlan('parallel verification', cwd);
  assert.equal(await pathExists(team.path), true);
});
