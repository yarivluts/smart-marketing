import { describe, expect, it, vi } from 'vitest';

const connectMock = vi.fn().mockResolvedValue(undefined);
const closeMock = vi.fn();
let capturedClientInfo: unknown;
let capturedTransportArgs: unknown[] = [];

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation((info: unknown) => {
    capturedClientInfo = info;
    return { connect: connectMock, close: closeMock };
  }),
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation((...args: unknown[]) => {
    capturedTransportArgs = args;
    return { kind: 'fake-transport' };
  }),
}));

const { connectGrowthOsMcpClient } = await import('./growthos-mcp-client');

describe('connectGrowthOsMcpClient', () => {
  it('builds a StreamableHTTPClientTransport carrying the bearer token and connects the SDK client', async () => {
    const client = await connectGrowthOsMcpClient({ mcpUrl: 'https://api.example.com/v1/mcp', bearerToken: 'gos_live_abc' });

    expect(capturedClientInfo).toMatchObject({ name: 'growthos-headless-agent-example', version: '1.0.0' });

    const [url, transportOptions] = capturedTransportArgs as [URL, { requestInit?: { headers?: Record<string, string> } }];
    expect(url.toString()).toBe('https://api.example.com/v1/mcp');
    expect(transportOptions.requestInit?.headers).toEqual({ Authorization: 'Bearer gos_live_abc' });

    expect(connectMock).toHaveBeenCalledWith({ kind: 'fake-transport' });
    expect(client).toMatchObject({ close: closeMock });
  });

  it('honors a custom clientName/clientVersion', async () => {
    await connectGrowthOsMcpClient({
      mcpUrl: 'https://api.example.com/v1/mcp',
      bearerToken: 'gos_live_abc',
      clientName: 'my-cron-agent',
      clientVersion: '2.3.4',
    });

    expect(capturedClientInfo).toMatchObject({ name: 'my-cron-agent', version: '2.3.4' });
  });
});
