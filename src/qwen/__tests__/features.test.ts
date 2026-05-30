import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { probeQwenFeatures } from '../features.js';

test('probeQwenFeatures detects headless and experimental serve from fake qwen', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'omq-qwen-features-'));
  const bin = path.join(dir, 'qwen');
  await writeFile(bin, `#!/usr/bin/env node\nconst args=process.argv.slice(2);\nif(args[0]==='--version'){console.log('qwen 0.17.0'); process.exit(0);}\nif(args[0]==='serve' && args[1]==='--help'){console.log('Run Qwen Code as a local HTTP daemon Stage 1 experimental --http-bridge'); process.exit(0);}\nif(args[0]==='extensions' && args[1]==='--help'){console.log('extensions help'); process.exit(0);}\nif(args[0]==='mcp' && args[1]==='--help'){console.log('mcp help'); process.exit(0);}\nconsole.log('usage: qwen -p --prompt --output-format json stream-json --approval-mode --json-schema');\n`);
  await chmod(bin, 0o755);
  const probe = probeQwenFeatures({ ...process.env, QWEN_BIN: bin, PATH: `${dir}${path.delimiter}${process.env.PATH || ''}` });
  assert.equal(probe.features.headlessPrompt, true);
  assert.equal(probe.features.streamJson, true);
  assert.equal(probe.features.approvalMode, true);
  assert.equal(probe.features.serveCommand, true);
  assert.equal(probe.experimental.qwenServe.policy, 'opt-in-only');
});
