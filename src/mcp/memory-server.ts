import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { VERSION } from '../constants.js';
import { autoStartStdioMcpServer } from './bootstrap.js';
import { buildMemoryTools, callToolForTarget, objectArgs } from './tools.js';

const server = new Server(
  { name: 'omq-memory', version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: buildMemoryTools() }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  return callToolForTarget('memory', name, objectArgs(request.params.arguments));
});

autoStartStdioMcpServer('memory', server);
