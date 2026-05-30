import { findExecutable, readQwenVersion } from './probe.js';
import { spawnSyncCaptured } from '../utils/process-capture.js';

export interface QwenFeatureProbe {
  qwenBinary?: string;
  qwenVersion?: string;
  helpAvailable: boolean;
  features: {
    headlessPrompt: boolean;
    outputFormat: boolean;
    streamJson: boolean;
    approvalMode: boolean;
    extensionsCli: boolean;
    mcpCli: boolean;
    serveCommand: boolean;
    jsonSchema: boolean;
  };
  experimental: {
    qwenServe: {
      available: boolean;
      policy: 'opt-in-only';
      reason: string;
    };
  };
  warnings: string[];
}

export function probeQwenFeatures(env: NodeJS.ProcessEnv = process.env): QwenFeatureProbe {
  const qwenBinary = findExecutable('qwen', env);
  const warnings: string[] = [];
  if (!qwenBinary) {
    warnings.push('qwen binary not found; feature probe is unavailable until Qwen Code is installed or QWEN_BIN is set.');
    return emptyProbe(undefined, undefined, warnings);
  }
  const help = spawnSyncCaptured(qwenBinary, ['--help'], { env, timeout: 5000 });
  const extensions = spawnSyncCaptured(qwenBinary, ['extensions', '--help'], { env, timeout: 5000 });
  const mcp = spawnSyncCaptured(qwenBinary, ['mcp', '--help'], { env, timeout: 5000 });
  const serve = spawnSyncCaptured(qwenBinary, ['serve', '--help'], { env, timeout: 5000 });
  const text = `${help.stdout || ''}\n${help.stderr || ''}`;
  const serveText = `${serve.stdout || ''}\n${serve.stderr || ''}`;
  const qwenVersion = readQwenVersion(qwenBinary, env);
  const features = {
    headlessPrompt: /(?:--prompt|\s-p[,\s])/.test(text),
    outputFormat: text.includes('--output-format'),
    streamJson: /stream-json/.test(text),
    approvalMode: text.includes('--approval-mode'),
    extensionsCli: extensions.status === 0 || /extensions/.test(text),
    mcpCli: mcp.status === 0 || /\bmcp\b/.test(text),
    serveCommand: serve.status === 0 || /qwen serve|--http-bridge|daemon/i.test(serveText),
    jsonSchema: text.includes('--json-schema') || /json-schema/.test(text),
  };
  if (!features.serveCommand) warnings.push('qwen serve not detected; omq will stay on headless qwen -p execution.');
  return {
    qwenBinary,
    qwenVersion,
    helpAvailable: help.status === 0,
    features,
    experimental: {
      qwenServe: {
        available: features.serveCommand,
        policy: 'opt-in-only',
        reason: 'Local Qwen docs describe qwen serve as Stage 1 experimental; omq treats it as a future/explicit bridge, not the default execution path.',
      },
    },
    warnings,
  };
}

function emptyProbe(qwenBinary: string | undefined, qwenVersion: string | undefined, warnings: string[]): QwenFeatureProbe {
  return {
    qwenBinary,
    qwenVersion,
    helpAvailable: false,
    features: {
      headlessPrompt: false,
      outputFormat: false,
      streamJson: false,
      approvalMode: false,
      extensionsCli: false,
      mcpCli: false,
      serveCommand: false,
      jsonSchema: false,
    },
    experimental: {
      qwenServe: {
        available: false,
        policy: 'opt-in-only',
        reason: 'qwen binary unavailable; cannot safely rely on daemon features.',
      },
    },
    warnings,
  };
}

export function renderQwenFeatures(probe: QwenFeatureProbe): string {
  const lines = ['Qwen feature probe'];
  lines.push(`binary: ${probe.qwenBinary || 'not found'}`);
  lines.push(`version: ${probe.qwenVersion || 'unknown'}`);
  for (const [name, ok] of Object.entries(probe.features)) lines.push(`- ${name}: ${ok ? 'yes' : 'no'}`);
  lines.push(`experimental qwen serve: ${probe.experimental.qwenServe.available ? 'available' : 'not available'} (${probe.experimental.qwenServe.policy})`);
  lines.push(`reason: ${probe.experimental.qwenServe.reason}`);
  for (const warning of probe.warnings) lines.push(`warning: ${warning}`);
  return `${lines.join('\n')}\n`;
}
