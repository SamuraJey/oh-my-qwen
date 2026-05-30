import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { callToolForTarget, toolsForTarget } from '../tools.js';

function textOf(result: { content?: Array<{ type: string; text?: string }> }): string {
  return result.content?.map((item) => item.text || '').join('\n') || '';
}

async function readFirstJsonLine(child: ReturnType<typeof spawn>, stdoutRef: { value: string }, stderrRef: { value: string }): Promise<unknown> {
  await new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (stdoutRef.value.includes('\n')) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > 3000) {
        clearInterval(timer);
        reject(new Error(`timed out waiting for MCP response; stderr=${stderrRef.value}`));
      }
    }, 25);
  });
  const firstLine = stdoutRef.value.trim().split('\n')[0];
  child.stdin?.destroy();
  child.stdout?.destroy();
  child.stderr?.destroy();
  child.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
    setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 1000).unref();
  });
  assert.equal(firstLine.startsWith('Content-Length:'), false);
  return JSON.parse(firstLine) as unknown;
}

test('state tools expose and persist mode state', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'omq-mcp-state-'));
  const tools = toolsForTarget('state').map((tool) => tool.name).sort();
  assert.deepEqual(tools, ['state_read_mode', 'state_status', 'state_write_mode']);

  const written = await callToolForTarget('state', 'state_write_mode', { cwd, mode: 'goal', state: { active: true, status: 'active', objective: 'test' } });
  assert.match(textOf(written), /goal\.json/);

  const read = await callToolForTarget('state', 'state_read_mode', { cwd, mode: 'goal' });
  assert.match(textOf(read), /objective/);
});

test('memory and wiki tools write durable project context', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'omq-mcp-memory-'));
  assert.deepEqual(toolsForTarget('memory').map((tool) => tool.name).sort(), ['memory_read', 'memory_write']);
  assert.deepEqual(toolsForTarget('wiki').map((tool) => tool.name).sort(), ['wiki_read', 'wiki_search', 'wiki_write']);

  await callToolForTarget('memory', 'memory_write', { cwd, section: 'decision', content: 'Use project MCP settings.' });
  const memory = await callToolForTarget('memory', 'memory_read', { cwd });
  assert.match(textOf(memory), /project MCP settings/);

  await callToolForTarget('wiki', 'wiki_write', { cwd, title: 'MCP setup', content: 'Qwen loads mcpServers from settings.' });
  const search = await callToolForTarget('wiki', 'wiki_search', { cwd, query: 'mcpservers' });
  assert.match(textOf(search), /mcp-setup/);
});

test('official SDK stdio MCP entrypoint responds with newline-delimited JSON', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'omq-mcp-stdio-'));
  const child = spawn(process.execPath, [path.join(process.cwd(), 'dist', 'mcp', 'state-server.js')], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stdoutRef = { value: '' };
  const stderrRef = { value: '' };
  child.stdout.on('data', (chunk) => { stdoutRef.value += String(chunk); });
  child.stderr.on('data', (chunk) => { stderrRef.value += String(chunk); });
  child.stdin.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'omq-test', version: '0.0.0' } },
  })}\n`);

  const parsed = await readFirstJsonLine(child, stdoutRef, stderrRef) as { result?: { serverInfo?: { name?: string } } };
  assert.equal(parsed.result?.serverInfo?.name, 'omq-state');
});

test('omq mcp-serve dispatcher launches server entrypoints', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'omq-mcp-dispatcher-'));
  const child = spawn(process.execPath, [path.join(process.cwd(), 'dist', 'cli', 'omq.js'), 'mcp-serve', 'wiki'], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stdoutRef = { value: '' };
  const stderrRef = { value: '' };
  child.stdout.on('data', (chunk) => { stdoutRef.value += String(chunk); });
  child.stderr.on('data', (chunk) => { stderrRef.value += String(chunk); });
  child.stdin.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'omq-test', version: '0.0.0' } },
  })}\n`);

  const parsed = await readFirstJsonLine(child, stdoutRef, stderrRef) as { result?: { serverInfo?: { name?: string } } };
  assert.equal(parsed.result?.serverInfo?.name, 'omq-wiki');
});
