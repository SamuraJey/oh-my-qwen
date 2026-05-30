import { read, writeSync } from 'node:fs';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { ReadBuffer, serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

export const MCP_ENTRYPOINT_MARKER_ENV = 'OMQ_MCP_ENTRYPOINT_MARKER';

export interface StdioConnectableServer {
  connect(transport: Transport): Promise<unknown>;
  close?(): Promise<unknown>;
}

class FdStdioServerTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: <T extends JSONRPCMessage>(message: T) => void;

  private readonly readBuffer = new ReadBuffer();
  private started = false;
  private closed = false;

  async start(): Promise<void> {
    if (this.started) throw new Error('FdStdioServerTransport already started');
    this.started = true;
    this.readNextChunk();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    writeSync(1, Buffer.from(serializeMessage(message), 'utf8'));
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.readBuffer.clear();
    this.onclose?.();
  }

  private readNextChunk(): void {
    if (this.closed) return;
    const buffer = Buffer.alloc(65536);
    read(0, buffer, 0, buffer.length, null, (error, bytesRead) => {
      if (this.closed) return;
      if (error) {
        this.onerror?.(error);
        this.readNextChunk();
        return;
      }
      if (bytesRead === 0) {
        void this.close();
        return;
      }
      this.readBuffer.append(buffer.subarray(0, bytesRead));
      this.processReadBuffer();
      this.readNextChunk();
    });
  }

  private processReadBuffer(): void {
    while (!this.closed) {
      try {
        const message = this.readBuffer.readMessage();
        if (message === null) break;
        this.onmessage?.(message as JSONRPCMessage);
      } catch (error) {
        this.onerror?.(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
}

function logLifecycle(serverName: string, message: string, error?: unknown): void {
  const detail = error instanceof Error ? error.stack || error.message : error ? String(error) : '';
  writeSync(2, Buffer.from(`[omq:mcp:${serverName}] ${message}${detail ? `\n${detail}` : ''}\n`, 'utf8'));
}

export function autoStartStdioMcpServer(serverName: string, server: StdioConnectableServer): void {
  process.env[MCP_ENTRYPOINT_MARKER_ENV] = process.env[MCP_ENTRYPOINT_MARKER_ENV] || serverName;

  const transport = new FdStdioServerTransport();
  const parentPid = process.ppid;
  const keepAlive = setInterval(() => undefined, 1 << 30);
  let shuttingDown = false;

  async function shutdown(code = 0): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(keepAlive);
    try {
      await transport.close();
    } catch (error) {
      logLifecycle(serverName, 'transport close failed', error);
    }
    try {
      await server.close?.();
    } catch (error) {
      logLifecycle(serverName, 'server close failed', error);
    }
    process.exit(code);
  }

  transport.onclose = () => { void shutdown(0); };
  transport.onerror = (error) => { logLifecycle(serverName, 'transport error', error); };

  process.once('SIGINT', () => { void shutdown(0); });
  process.once('SIGTERM', () => { void shutdown(0); });

  const parentWatchdog = setInterval(() => {
    if (parentPid <= 1) return;
    try {
      process.kill(parentPid, 0);
    } catch {
      void shutdown(0);
    }
  }, 5000);
  parentWatchdog.unref();

  server.connect(transport).catch((error) => {
    logLifecycle(serverName, 'server.connect failed', error);
    void shutdown(1);
  });
}
