import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildQwenArgs, normalizeApprovalMode, parseQwenOutput, runQwenExec } from '../qwen-exec.js';

test('approval mode auto-edit normalizes to Qwen CLI auto_edit', () => {
  assert.equal(normalizeApprovalMode('auto-edit'), 'auto_edit');
  assert.deepEqual(buildQwenArgs('hello', { cwd: '.', approvalMode: 'auto-edit' }).slice(0, 6), ['-p', 'hello', '--output-format', 'stream-json', '--approval-mode', 'auto_edit']);
});

test('parse stream-json result and session id', () => {
  const parsed = parseQwenOutput('{"type":"system","session_id":"s1"}\n{"type":"assistant","message":{"content":[{"type":"text","text":"Hi"}]}}\n{"type":"result","result":" done","usage":{"input":1}}\n');
  assert.equal(parsed.sessionId, 's1');
  assert.equal(parsed.response, 'Hi done');
  assert.deepEqual(parsed.usage, { input: 1 });
});

test('parse json array result', () => {
  const parsed = parseQwenOutput('[{"type":"result","response":"OK","session_id":"s2"}]', 'json');
  assert.equal(parsed.response, 'OK');
  assert.equal(parsed.sessionId, 's2');
});

test('malformed stream-json line fails clearly', () => {
  assert.throws(() => parseQwenOutput('not-json\n'), /Malformed stream-json line/);
});

test('runQwenExec forwards args to fake qwen and writes log', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'omq-exec-'));
  const bin = path.join(dir, 'qwen');
  const argvPath = path.join(dir, 'argv.json');
  await writeFile(bin, `#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(argvPath)}, JSON.stringify(process.argv.slice(2)));\nconsole.log(JSON.stringify({type:'system', session_id:'fake'}));\nconsole.log(JSON.stringify({type:'result', result:'OMQ-EXEC-OK'}));\n`);
  await chmod(bin, 0o755);
  const result = await runQwenExec('Reply OK', { cwd: dir, qwenBinary: bin, approvalMode: 'auto-edit' });
  assert.equal(result.response, 'OMQ-EXEC-OK');
  assert.equal(result.sessionId, 'fake');
  const argv = JSON.parse(await readFile(argvPath, 'utf8')) as string[];
  assert.deepEqual(argv.slice(0, 6), ['-p', 'Reply OK', '--output-format', 'stream-json', '--approval-mode', 'auto_edit']);
});
