import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPAT_ROWS, compatSummary, renderCompatMarkdown } from '../matrix.js';

test('compat matrix covers required parity areas', () => {
  const areas = new Set(COMPAT_ROWS.map((row) => row.area));
  for (const area of ['package-cli', 'setup-uninstall', 'native-hooks', 'exec-harness', 'workflow-default-flow', 'team-orchestration', 'qwen-serve-experimental']) {
    assert.equal(areas.has(area), true, `${area} missing`);
  }
  assert.ok(compatSummary().implemented >= 5);
});

test('compat markdown renders evidence and qwen serve policy', () => {
  const md = renderCompatMarkdown();
  assert.match(md, /oh-my-qwen functionality status/);
  assert.match(md, /qwen-serve-experimental/);
  assert.match(md, /opt-in|experimental|Stage 1/i);
});
