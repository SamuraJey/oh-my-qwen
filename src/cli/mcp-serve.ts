import { MCP_ENTRYPOINT_MARKER_ENV } from '../mcp/bootstrap.js';
import { normalizeOmqMcpTarget, OMQ_MCP_SERVE_SUBCOMMAND, OMQ_MCP_TARGETS, type OmqMcpEntrypoint } from '../mcp/registry.js';

type McpServeLoader = () => Promise<unknown>;
type McpServeLoaderMap = Record<OmqMcpEntrypoint, McpServeLoader>;

interface McpServeCommandOptions {
  env?: Record<string, string | undefined>;
  loaders?: McpServeLoaderMap;
  keepProcessAlive?: boolean;
}

const MCP_SERVE_USAGE = [
  `Usage: omq ${OMQ_MCP_SERVE_SUBCOMMAND} <target>`,
  '',
  'Launch an OMQ stdio MCP server target via the installed omq CLI.',
  '',
  `Supported targets: ${OMQ_MCP_TARGETS.join(', ')}`,
].join('\n');

const MCP_SERVE_LOADERS: McpServeLoaderMap = {
  'state-server.js': async () => import('../mcp/state-server.js'),
  'memory-server.js': async () => import('../mcp/memory-server.js'),
  'wiki-server.js': async () => import('../mcp/wiki-server.js'),
};

export async function mcpServeCommand(args: string[], options: McpServeCommandOptions = {}): Promise<void> {
  const firstArg = args[0];
  if (!firstArg || firstArg === '--help' || firstArg === '-h' || firstArg === 'help') {
    console.log(MCP_SERVE_USAGE);
    return;
  }

  const target = normalizeOmqMcpTarget(firstArg);
  if (!target) throw new Error(`Unknown MCP target: ${firstArg}\n${MCP_SERVE_USAGE}`);
  if (args.length > 1) throw new Error(`Unexpected arguments: ${args.slice(1).join(' ')}\n${MCP_SERVE_USAGE}`);

  const env = options.env ?? process.env;
  const loaders = options.loaders ?? MCP_SERVE_LOADERS;
  env[MCP_ENTRYPOINT_MARKER_ENV] = target;
  await loaders[target]();
  if (options.keepProcessAlive === false) return;

  await new Promise<never>(() => undefined);
}
