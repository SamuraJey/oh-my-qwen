import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { VERSION } from '../constants.js';
import { autoStartStdioMcpServer } from './bootstrap.js';
import { buildWikiTools, callToolForTarget, objectArgs } from './tools.js';

const server = new Server(
  { name: 'omq-wiki', version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: buildWikiTools() }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  return callToolForTarget('wiki', name, objectArgs(request.params.arguments));
});

autoStartStdioMcpServer('wiki', server);
