import test from 'node:test';
import assert from 'node:assert/strict';
import { access, chmod, mkdir, mkdtemp, readFile, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildDetachedLeaderCommand,
  buildDetachedTmuxNewSessionArgs,
  cleanupStaleLaunchEnvFiles,
  launchEnvFilePath,
  resolveQwenLaunchPolicy,
  resolveQuickExitHoldSeconds,
  runInteractiveQwenLaunch,
  serializeLaunchEnv,
  splitLaunchPolicyArgs,
} from '../qwen-launch.js';

async function fakeQwen(dir: string, exitCode = 0): Promise<{ bin: string; capture: string }> {
  const bin = path.join(dir, 'qwen');
  const capture = path.join(dir, 'qwen-capture.json');
  await writeFile(bin, `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(capture)}, JSON.stringify({ argv: process.argv.slice(2), env: { OMQ_SESSION_ID: process.env.OMQ_SESSION_ID, OMQ_ENGINE: process.env.OMQ_ENGINE, QWEN_HOME: process.env.QWEN_HOME } }));
process.exit(${exitCode});
`);
  await chmod(bin, 0o755);
  return { bin, capture };
}

test('launch policy parsing supports direct/tmux flags', () => {
  assert.deepEqual(splitLaunchPolicyArgs(['--tmux', '--model', 'q']), { explicitPolicy: 'detached-tmux', remainingArgs: ['--model', 'q'] });
  assert.deepEqual(splitLaunchPolicyArgs(['--direct', '--', '--tmux']), { explicitPolicy: 'direct', remainingArgs: ['--', '--tmux'] });
  assert.equal(resolveQwenLaunchPolicy({}, 'linux', true, true, true), 'detached-tmux');
  assert.equal(resolveQwenLaunchPolicy({ TMUX: '/tmp/tmux,1,0' }, 'linux', true, true, true), 'inside-tmux');
  assert.equal(resolveQwenLaunchPolicy({ TMUX: '/tmp/tmux,1,0' }, 'linux', true, true, true, 'detached-tmux'), 'detached-tmux');
  assert.equal(resolveQwenLaunchPolicy({}, 'linux', true, false, true), 'direct');
});

test('direct launch runs Qwen with OMQ session environment', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'omq-launch-direct-'));
  const { bin, capture } = await fakeQwen(dir);
  const result = await runInteractiveQwenLaunch(['--direct', '--model', 'test-model'], {
    cwd: dir,
    env: { ...process.env, QWEN_BIN: bin, QWEN_HOME: path.join(dir, '.qwen'), OMQ_LAUNCH_HOLD_SECONDS: '0' },
    sessionId: 'omq-test-session',
    tmuxAvailable: false,
  });
  assert.equal(result.policy, 'direct');
  assert.equal(result.exitCode, 0);
  const captured = JSON.parse(await readFile(capture, 'utf8')) as { argv: string[]; env: Record<string, string> };
  assert.deepEqual(captured.argv, ['--model', 'test-model']);
  assert.equal(captured.env.OMQ_SESSION_ID, 'omq-test-session');
  assert.equal(captured.env.OMQ_ENGINE, 'qwen');
  assert.equal(captured.env.QWEN_HOME, path.join(dir, '.qwen'));
});

test('detached tmux launch creates a tmux session and attaches instead of running direct', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'omq-launch-tmux-'));
  const { bin } = await fakeQwen(dir);
  const tmux = path.join(dir, 'tmux');
  const log = path.join(dir, 'tmux.log');
  await writeFile(tmux, `#!/usr/bin/env bash
printf 'tmux:%s\n' "$*" >> ${JSON.stringify(log)}
if [ "$1" = "new-session" ]; then printf '%%42\n'; exit 0; fi
if [ "$1" = "attach-session" ]; then exit 0; fi
if [ "$1" = "-V" ]; then printf 'tmux 3.4\n'; exit 0; fi
exit 0
`);
  await chmod(tmux, 0o755);
  const env: NodeJS.ProcessEnv = { ...process.env, QWEN_BIN: bin, QWEN_HOME: path.join(dir, '.nessy'), OMQ_TMUX_BIN: tmux };
  delete env.TMUX;

  const result = await runInteractiveQwenLaunch(['--tmux', '--model', 'test-model'], {
    cwd: dir,
    env,
    sessionId: 'omq-test-tmux',
    tmuxAvailable: true,
    stdinIsTTY: true,
    stdoutIsTTY: true,
  });

  assert.equal(result.policy, 'detached-tmux');
  assert.equal(result.tmuxPaneId, '%42');
  const tmuxLog = await readFile(log, 'utf8');
  assert.match(tmuxLog, /tmux:new-session .* -s omq-/);
  assert.match(tmuxLog, /-e QWEN_BIN=/);
  assert.match(tmuxLog, /-e QWEN_HOME=/);
  assert.match(tmuxLog, /tmux:attach-session -t omq-/);
});

test('explicit detached tmux launch switches client when already inside tmux', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'omq-launch-tmux-inside-'));
  const { bin } = await fakeQwen(dir);
  const tmux = path.join(dir, 'tmux');
  const log = path.join(dir, 'tmux.log');
  await writeFile(tmux, `#!/usr/bin/env bash
printf 'tmux:%s\n' "$*" >> ${JSON.stringify(log)}
if [ "$1" = "new-session" ]; then printf '%%43\n'; exit 0; fi
if [ "$1" = "switch-client" ]; then exit 0; fi
if [ "$1" = "-V" ]; then printf 'tmux 3.4\n'; exit 0; fi
exit 0
`);
  await chmod(tmux, 0o755);
  const env: NodeJS.ProcessEnv = { ...process.env, QWEN_BIN: bin, OMQ_TMUX_BIN: tmux, TMUX: '/tmp/tmux,1,0' };

  const result = await runInteractiveQwenLaunch(['--tmux'], {
    cwd: dir,
    env,
    sessionId: 'omq-test-tmux-inside',
    tmuxAvailable: true,
    stdinIsTTY: true,
    stdoutIsTTY: true,
  });

  assert.equal(result.policy, 'detached-tmux');
  assert.equal(result.exitCode, 0);
  const tmuxLog = await readFile(log, 'utf8');
  assert.match(tmuxLog, /tmux:new-session .* -s omq-/);
  assert.match(tmuxLog, /tmux:switch-client -t omq-/);
  assert.doesNotMatch(tmuxLog, /attach-session/);
});

test('detached tmux args include only explicit launch env entries', () => {
  const args = buildDetachedTmuxNewSessionArgs('omq-demo', '/repo', 'qwen', {
    OMQ_SESSION_ID: 's1',
    OMQ_STATE_ROOT: '/repo/.omq',
    QWEN_BIN: '/bin/qwen',
    QWEN_HOME: '/home/me/.qwen',
    OMQ_ENGINE: 'nessy',
  });
  assert.deepEqual(args.slice(0, 9), ['new-session', '-d', '-P', '-F', '#{pane_id}', '-s', 'omq-demo', '-c', '/repo']);
  assert.ok(args.includes('OMQ_SESSION_ID=s1'));
  assert.ok(args.includes('QWEN_BIN=/bin/qwen'));
  assert.ok(args.includes('QWEN_HOME=/home/me/.qwen'));
  assert.ok(args.includes('OMQ_ENGINE=nessy'));
});

test('tmux env file serialization preserves parent provider env without NUL values', () => {
  const serialized = serializeLaunchEnv({
    PATH: '/bin',
    TERM: 'xterm-256color',
    QWEN_HOME: '/tmp/qwen',
    OMQ_SESSION_ID: 's1',
    GITHUB_PAT_TOKEN: 'secret',
    OPENAI_API_KEY: 'secret',
    BAD_NUL: 'a\0b',
  });
  assert.ok(serialized.includes("export PATH='/bin'"));
  assert.ok(serialized.includes("export QWEN_HOME='/tmp/qwen'"));
  assert.match(serialized, /export OPENAI_API_KEY='secret'/);
  assert.match(serialized, /export GITHUB_PAT_TOKEN='secret'/);
  assert.doesNotMatch(serialized, /BAD_NUL/);
});

test('tmux env file cleanup removes stale launch env files only', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'omq-launch-env-cleanup-'));
  const stale = launchEnvFilePath(dir, 'omq-stale');
  const fresh = launchEnvFilePath(dir, 'omq-fresh');
  await mkdir(path.dirname(stale), { recursive: true });
  await writeFile(stale, 'SECRET=old\n');
  await writeFile(fresh, 'SECRET=fresh\n');
  const oldDate = new Date(Date.now() - 20 * 60 * 1000);
  await utimes(stale, oldDate, oldDate);

  assert.equal(cleanupStaleLaunchEnvFiles(dir, 10 * 60 * 1000, Date.now()), 1);
  await assert.rejects(() => access(stale));
  await access(fresh);
});

test('quick exit hold seconds is configurable and used by tmux leader', () => {
  assert.equal(resolveQuickExitHoldSeconds({}), 10);
  assert.equal(resolveQuickExitHoldSeconds({ OMQ_LAUNCH_HOLD_SECONDS: '25' }), 25);
  const command = buildDetachedLeaderCommand('omq-demo', '/bin/qwen', [], '/tmp/env', 25);
  assert.match(command, /-le 25/);
  assert.match(command, /qwen exited after %ss with code 0/);
  assert.match(command, /trap .*rm -f/);
});
