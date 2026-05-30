#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { handleHook } from '../hooks/lifecycle.js';
import { formatHookOutput, parseHookInput } from '../qwen/hook-io.js';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

export async function main(): Promise<void> {
  try {
    const raw = await readStdin();
    const input = parseHookInput(raw);
    const output = await handleHook(input);
    process.stdout.write(formatHookOutput(output));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(formatHookOutput({
      decision: 'allow',
      reason: `oh-my-qwen hook parse/runtime error; fail-open: ${message}`,
      hookSpecificOutput: { hookEventName: 'Unknown', additionalContext: `oh-my-qwen hook error: ${message}` },
    }));
  }
}

const isDirectRun = process.argv[1] ? realpathSync(process.argv[1]) === fileURLToPath(import.meta.url) : false;

if (isDirectRun) {
  await main();
}
