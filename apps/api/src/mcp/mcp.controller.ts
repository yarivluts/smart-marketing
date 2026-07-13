import type { ServerResponse } from 'node:http';
import { Controller, Delete, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Public } from '../authz/public.decorator';
import { McpAuthGuard, type McpAuthenticatedRequest } from './mcp-auth.guard';
import { registerMcpTools } from './mcp-tools';
import { registerMcpActTools } from './mcp-act-tools';

const SERVER_NAME = 'growthos';
const SERVER_VERSION = '1.0.0';

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  if (response.headersSent) {
    return;
  }
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

const METHOD_NOT_ALLOWED_BODY = {
  jsonrpc: '2.0' as const,
  error: { code: -32000, message: 'Method not allowed — this MCP server is stateless: only POST is supported.' },
  id: null,
};

/**
 * `POST /v1/mcp` — GrowthOS's MCP (Model Context Protocol) server over
 * Streamable HTTP (KAN-75, plan `12 §6.1`), scoped to exactly one
 * org/project per {@link McpAuthGuard}'s resolved `McpAuthContext`
 * — the plan's "one server scope per project" isolation property, expressed
 * through the *credential* rather than the URL (see `IngestController`'s
 * flat `/v1/ingest/*` and `MetricsController`'s flat `/v1/metrics` for the
 * same established pattern: KAN-32/KAN-42 already resolve org/project from
 * a bearer credential's own hash rather than a path segment).
 *
 * Stateless mode (`sessionIdGenerator: undefined`, no `GET`/`DELETE`
 * session lifecycle): a fresh {@link McpServer} + {@link
 * StreamableHTTPServerTransport} pair is built for *every* request rather
 * than kept alive across calls, exactly the SDK's own documented pattern
 * for a server that may run behind multiple stateless instances (this app
 * already has no in-process session state anywhere else — every other
 * bearer credential in this codebase, API keys included, re-authenticates
 * from scratch on every call). The tradeoff (no server-initiated
 * notifications, no multi-request session) is the right one here: nothing
 * in KAN-75's read-tool surface needs either.
 */
@Controller('mcp')
@Public()
@UseGuards(McpAuthGuard)
export class McpController {
  @Post()
  async handlePost(@Req() request: McpAuthenticatedRequest, @Res() response: ServerResponse): Promise<void> {
    const auth = request.mcpAuthContext;
    if (!auth) {
      throw new Error('McpAuthGuard did not populate mcpAuthContext before the route handler ran.');
    }

    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
    registerMcpTools(server, auth);
    registerMcpActTools(server, auth);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    response.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      // No structured logger exists in apps/api yet (KAN-20's observability baseline is still an
      // unmerged, unreconciled PR — see PROGRESS.md) — console.error is the honest baseline until
      // that lands, not a placeholder for something already wired in elsewhere in this app.
      console.error('MCP request failed', error);
      writeJson(response, 500, { jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error.' }, id: null });
    }
  }

  @Get()
  handleGet(@Res() response: ServerResponse): void {
    writeJson(response, 405, METHOD_NOT_ALLOWED_BODY);
  }

  @Delete()
  handleDelete(@Res() response: ServerResponse): void {
    writeJson(response, 405, METHOD_NOT_ALLOWED_BODY);
  }
}
