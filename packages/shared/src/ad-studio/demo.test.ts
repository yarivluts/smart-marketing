import { describe, expect, it } from 'vitest';
import { demoAccessFieldIssues, parseAdStudioDemoAccessInput, planDemoInserts } from './demo';

const segment = (id: string, start: number, end: number, selected = true) => ({ id, startSeconds: start, endSeconds: end, selected });

describe('demo access input', () => {
  it('trims the text fields but keeps the password exactly as typed', () => {
    expect(parseAdStudioDemoAccessInput({ loginUrl: ' https://app.example.com/login ', username: ' demo@example.com ', password: ' p w ', notes: ' show reports ' })).toEqual({
      loginUrl: 'https://app.example.com/login',
      username: 'demo@example.com',
      password: ' p w ',
      notes: 'show reports',
    });
    expect(parseAdStudioDemoAccessInput({ loginUrl: 'x', username: 'y' })).toEqual({ loginUrl: 'x', username: 'y', password: '', notes: '' });
    expect(parseAdStudioDemoAccessInput({ loginUrl: 1, username: 'y' })).toBeNull();
    expect(parseAdStudioDemoAccessInput(null)).toBeNull();
  });

  it('asks for a password only when none is stored', () => {
    const input = { loginUrl: 'https://a.example.com', username: 'u', password: '', notes: '' };
    expect(demoAccessFieldIssues(input, false)).toEqual(['password']);
    expect(demoAccessFieldIssues(input, true)).toEqual([]);
    expect(demoAccessFieldIssues({ ...input, loginUrl: '', username: '', notes: 'x'.repeat(1001) }, true)).toEqual(['login_url', 'username', 'notes']);
  });
});

describe('planDemoInserts', () => {
  it('takes at most two selected moments, each at most 5 seconds, in order', () => {
    const inserts = planDemoInserts({ segments: [segment('a', 0, 3, false), segment('b', 3, 12), segment('c', 12, 15), segment('d', 15, 20)], sceneSeconds: 30, maxTotalSeconds: 60 });
    expect(inserts).toEqual([
      { segmentId: 'b', startSeconds: 3, seconds: 5 },
      { segmentId: 'c', startSeconds: 12, seconds: 3 },
    ]);
  });

  it('shortens or drops moments so the ad stays within its limit', () => {
    expect(planDemoInserts({ segments: [segment('b', 0, 10), segment('c', 10, 20)], sceneSeconds: 53, maxTotalSeconds: 60 })).toEqual([
      { segmentId: 'b', startSeconds: 0, seconds: 5 },
      { segmentId: 'c', startSeconds: 10, seconds: 2 },
    ]);
    expect(planDemoInserts({ segments: [segment('b', 0, 10)], sceneSeconds: 59, maxTotalSeconds: 60 })).toEqual([]);
    // A moment too short to read is skipped; the next one is used.
    expect(planDemoInserts({ segments: [segment('a', 0, 1.5), segment('b', 2, 9)], sceneSeconds: 10, maxTotalSeconds: 60 })).toEqual([{ segmentId: 'b', startSeconds: 2, seconds: 5 }]);
  });

  it('never runs past the end of the recording', () => {
    expect(planDemoInserts({ segments: [segment('a', 20, 40)], sceneSeconds: 10, maxTotalSeconds: 60, recordingSeconds: 23 })).toEqual([{ segmentId: 'a', startSeconds: 20, seconds: 3 }]);
  });
});
