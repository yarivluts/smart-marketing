import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertEmulatorReachable,
  emulatorUnreachableMessage,
  isEmulatorReachable,
  parseEmulatorHost,
} from './emulator-probe';

const servers: net.Server[] = [];

/** Starts a listener on an OS-assigned free port and returns its address, so "reachable" is tested against something genuinely accepting connections rather than a mock. */
function listenOnFreePort(): Promise<{ host: string; port: number }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    servers.push(server);
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('expected a TCP address'));
        return;
      }
      resolve({ host: '127.0.0.1', port: address.port });
    });
  });
}

/** A port nothing is listening on: bind one, record it, then release it. */
async function closedPort(): Promise<{ host: string; port: number }> {
  const address = await listenOnFreePort();
  const server = servers.pop();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  return address;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

describe('parseEmulatorHost', () => {
  it('splits an ordinary host:port pair', () => {
    expect(parseEmulatorHost('127.0.0.1:8090')).toEqual({ host: '127.0.0.1', port: 8090 });
  });

  it('accepts a named host', () => {
    expect(parseEmulatorHost('localhost:8090')).toEqual({ host: 'localhost', port: 8090 });
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseEmulatorHost('  127.0.0.1:8090  ')).toEqual({ host: '127.0.0.1', port: 8090 });
  });

  it('keeps a bracketed IPv6 address intact and strips its brackets', () => {
    // Splitting on the first colon would truncate this to "[" — the reason the
    // implementation splits on the last one.
    expect(parseEmulatorHost('[::1]:8090')).toEqual({ host: '::1', port: 8090 });
  });

  it.each(['', '   ', '127.0.0.1', ':8090', '127.0.0.1:', '127.0.0.1:not-a-port', '127.0.0.1:0', '127.0.0.1:70000'])(
    'returns undefined for the unreadable value %j rather than throwing',
    (value) => {
      expect(parseEmulatorHost(value)).toBeUndefined();
    },
  );
});

describe('emulatorUnreachableMessage', () => {
  it('names the address and the command that actually works', () => {
    const message = emulatorUnreachableMessage('127.0.0.1:8090');
    expect(message).toContain('127.0.0.1:8090');
    expect(message).toContain('pnpm test:unit:emulator');
  });
});

describe('isEmulatorReachable', () => {
  it('resolves true when something is accepting connections', async () => {
    await expect(isEmulatorReachable(await listenOnFreePort())).resolves.toBe(true);
  });

  it('resolves false when nothing is listening', async () => {
    await expect(isEmulatorReachable(await closedPort())).resolves.toBe(false);
  });
});

describe('assertEmulatorReachable', () => {
  it('resolves quietly when the emulator is up', async () => {
    const { host, port } = await listenOnFreePort();
    await expect(assertEmulatorReachable(`${host}:${port}`)).resolves.toBeUndefined();
  });

  it('throws an actionable error when the emulator is absent', async () => {
    const { host, port } = await closedPort();
    await expect(assertEmulatorReachable(`${host}:${port}`)).rejects.toThrow('pnpm test:unit:emulator');
  });

  it('fails fast rather than waiting out the probe timeout', async () => {
    // The whole point of the probe: a missing emulator must cost about a second,
    // not the minutes of SDK backoff it replaces.
    const { host, port } = await closedPort();
    const startedAt = Date.now();
    await expect(assertEmulatorReachable(`${host}:${port}`, 1500)).rejects.toThrow();
    expect(Date.now() - startedAt).toBeLessThan(1500);
  });

  it('stays out of the way when the host value cannot be parsed', async () => {
    // A malformed value must not turn into a probe failure that masks whatever
    // the SDK would have said about it.
    await expect(assertEmulatorReachable('nonsense-without-a-port')).resolves.toBeUndefined();
  });
});
