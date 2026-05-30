import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { VERSION } from '../constants.js';
import { autoStartStdioMcpServer } from './bootstrap.js';
import { buildStateTools, callToolForTarget, objectArgs } from './tools.js';

const server = new Server(
  { name: 'omq-state', version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: buildStateTools() }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  return callToolForTarget('state', name, objectArgs(request.params.arguments));
});

autoStartStdioMcpServer('state', server);
