import path from 'node:path';

export const OMQ_MCP_COMMAND = 'omq';
export const OMQ_MCP_SERVE_SUBCOMMAND = 'mcp-serve';

export type OmqMcpTarget = 'state' | 'memory' | 'wiki';
export type OmqMcpEntrypoint = 'state-server.js' | 'memory-server.js' | 'wiki-server.js';

export interface OmqMcpSpec {
  name: string;
  title: string;
  description: string;
  target: OmqMcpTarget;
  entrypoint: OmqMcpEntrypoint;
  startupTimeoutSec: number;
}

export const OMQ_MCP_SPECS: readonly OmqMcpSpec[] = [
  {
    name: 'omq_state',
    title: '# OMQ State MCP Server',
    description: 'exposes .omq workflow state to Qwen Code',
    target: 'state',
    entrypoint: 'state-server.js',
    startupTimeoutSec: 5,
  },
  {
    name: 'omq_memory',
    title: '# OMQ Project Memory MCP Server',
    description: 'exposes .omq project memory to Qwen Code',
    target: 'memory',
    entrypoint: 'memory-server.js',
    startupTimeoutSec: 5,
  },
  {
    name: 'omq_wiki',
    title: '# OMQ Wiki MCP Server',
    description: 'exposes .omq project wiki to Qwen Code',
    target: 'wiki',
    entrypoint: 'wiki-server.js',
    startupTimeoutSec: 5,
  },
] as const;

export const OMQ_MCP_SERVER_NAMES = OMQ_MCP_SPECS.map((spec) => spec.name);
export const OMQ_MCP_TARGETS = OMQ_MCP_SPECS.map((spec) => spec.target);
export const OMQ_MCP_ENTRYPOINTS = OMQ_MCP_SPECS.map((spec) => spec.entrypoint);

const TARGET_ALIASES: Record<string, OmqMcpEntrypoint> = Object.fromEntries(
  OMQ_MCP_SPECS.flatMap((spec) => [
    [spec.target, spec.entrypoint],
    [`${spec.target}-server`, spec.entrypoint],
    [spec.entrypoint, spec.entrypoint],
  ]),
) as Record<string, OmqMcpEntrypoint>;

export function normalizeOmqMcpTarget(rawTarget: string | undefined): OmqMcpEntrypoint | null {
  if (typeof rawTarget !== 'string') return null;
  const normalized = rawTarget.trim().toLowerCase();
  if (!normalized) return null;
  return TARGET_ALIASES[normalized] ?? null;
}

export function mcpEntrypointPath(packageRoot: string, entrypoint: OmqMcpEntrypoint): string {
  return path.join(packageRoot, 'dist', 'mcp', entrypoint);
}

export function buildPluginMcpManifest(options: { enabled?: boolean } = {}): Record<string, { command: string; args: string[]; enabled: boolean }> {
  return Object.fromEntries(
    OMQ_MCP_SPECS.map((spec) => [
      spec.name,
      {
        command: OMQ_MCP_COMMAND,
        args: [OMQ_MCP_SERVE_SUBCOMMAND, spec.target],
        enabled: options.enabled === true,
      },
    ]),
  );
}
