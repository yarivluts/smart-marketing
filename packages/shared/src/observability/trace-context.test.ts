import { describe, expect, it } from 'vitest';
import { generateTraceId, getTraceId, runWithTraceId } from './trace-context';

describe('trace-context', () => {
  it('generates 32-hex-char ids', () => {
    const id = generateTraceId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(generateTraceId()).not.toBe(id);
  });

  it('exposes the bound trace id only within runWithTraceId', () => {
    expect(getTraceId()).toBeUndefined();
    runWithTraceId('abc123', () => {
      expect(getTraceId()).toBe('abc123');
    });
    expect(getTraceId()).toBeUndefined();
  });

  it('propagates the trace id across an async call graph', async () => {
    const traceId = generateTraceId();
    const observed = await runWithTraceId(traceId, async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return getTraceId();
    });
    expect(observed).toBe(traceId);
  });

  it('keeps nested trace ids isolated from the outer scope', () => {
    runWithTraceId('outer', () => {
      runWithTraceId('inner', () => {
        expect(getTraceId()).toBe('inner');
      });
      expect(getTraceId()).toBe('outer');
    });
  });
});
