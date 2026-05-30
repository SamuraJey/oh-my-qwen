import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNessyOmqEnv } from '../omq-nessy.js';

test('nessy wrapper maps Nessy binary and home into Qwen-compatible env', () => {
  const result = buildNessyOmqEnv({
    env: {
      HOME: '/home/test',
      NESSY_BIN: '/opt/nessy/bin/nessy',
      NESSY_HOME: '/home/test/.nessy-custom',
      PATH: '/bin',
    },
  });
  assert.equal(result.nessyBinary, '/opt/nessy/bin/nessy');
  assert.equal(result.qwenHome, '/home/test/.nessy-custom');
  assert.equal(result.env.QWEN_BIN, '/opt/nessy/bin/nessy');
  assert.equal(result.env.QWEN_HOME, '/home/test/.nessy-custom');
  assert.equal(result.env.NESSY_HOME, '/home/test/.nessy-custom');
  assert.equal(result.env.OMQ_ENGINE, 'nessy');
});

test('nessy wrapper defaults QWEN_HOME to ~/.nessy', () => {
  const result = buildNessyOmqEnv({ env: { HOME: '/home/test', QWEN_BIN: '/usr/bin/nessy', PATH: '/bin' } });
  assert.equal(result.qwenHome, '/home/test/.nessy');
  assert.equal(result.env.QWEN_HOME, '/home/test/.nessy');
});
