import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkpointWorkflow, finishWorkflow, startWorkflow } from '../runtime.js';
import { listActiveModes } from '../../state/modes.js';
import { pathExists } from '../../utils/fs.js';

test('workflow runtime starts, checkpoints, and finishes durable mode state', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'omq-runtime-'));

  const start = await startWorkflow('ultraqa', 'probe runtime', cwd);
  assert.equal(start.state.active, true);
  assert.equal(start.state.status, 'running');
  assert.equal(await pathExists(start.stateFile), true);
  assert.equal(await pathExists(start.eventLog), true);
  assert.deepEqual((await listActiveModes(cwd)).map((mode) => mode.mode), ['ultraqa']);

  const checkpoint = await checkpointWorkflow('ultraqa', 'created test plan', cwd);
  assert.equal(checkpoint.state.status, 'checkpointed');
  assert.equal(checkpoint.state.last_checkpoint, 'created test plan');
  assert.equal(Array.isArray(checkpoint.state.checkpoints), true);

  const finish = await finishWorkflow('ultraqa', 'finished', cwd);
  assert.equal(finish.state.active, false);
  assert.equal(finish.state.lifecycle_outcome, 'finished');
  assert.deepEqual(await listActiveModes(cwd), []);

  const log = await readFile(start.eventLog, 'utf8');
  assert.match(log, /"action":"start"/);
  assert.match(log, /"action":"checkpoint"/);
  assert.match(log, /"action":"finish"/);
});
