export async function runMcpServer(kind: string): Promise<void> {
  process.stderr.write(`oh-my-qwen ${kind} MCP stub started. Full MCP server is non-MVP.\n`);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line) as { id?: unknown; method?: string };
        if (message.method === 'initialize') {
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: `omq_${kind}`, version: '0.1.0' } } }) + '\n');
        } else if (message.method === 'tools/list') {
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: [] } }) + '\n');
        } else if (message.id !== undefined) {
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {} }) + '\n');
        }
      } catch (error) {
        process.stderr.write(`Invalid MCP line: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
  });
}
