import { describe, expect, it } from 'vitest';
import type { LogEntry } from '../src/game/protocol';
import { type BugReportInput, bugReport, bugReportBody } from '../src/import/bug-report';
import { MAX_ISSUE_URL_LENGTH } from '../src/import/deck-issue';

const entry = (id: number, text: string): LogEntry =>
  ({ id, turn: 2, seat: null, level: 'info', text, objects: [] }) as unknown as LogEntry;

const input = (over: Partial<BugReportInput> = {}): BugReportInput => ({
  description: 'The stack froze\nafter I cast a spell',
  version: { commit: 'abc1234', date: '2026-11-20', engine: 5, parser: 6 },
  turn: 2,
  log: [entry(1, 'You cast Sol Ring'), entry(2, 'Sol Ring resolves')],
  stack: [{ label: 'Sol Ring', controller: 'You' }],
  ...over,
});

describe('bug report', () => {
  it('carries the description, build, stack and log', () => {
    const r = bugReport(input());
    expect(r.title).toBe('Issue: The stack froze');
    expect(r.fitsInLink).toBe(true);
    expect(r.body).toContain('after I cast a spell');
    expect(r.body).toContain('Build abc1234 (2026-11-20)');
    expect(r.body).toContain('1. Sol Ring (You)');
    expect(r.body).toContain('T2 You cast Sol Ring');
    expect(decodeURIComponent(r.url)).toContain('T2 Sol Ring resolves');
  });

  it('says when the stack is empty', () => {
    expect(bugReportBody(input({ stack: [] }))).toContain('The stack is empty.');
  });

  it('falls back to a short link and keeps the newest log lines when too long', () => {
    const log = Array.from({ length: 4000 }, (_, i) => entry(i, `line ${i} ${'x'.repeat(40)}`));
    const r = bugReport(input({ log }));
    expect(r.fitsInLink).toBe(false);
    expect(r.url.length).toBeLessThanOrEqual(MAX_ISSUE_URL_LENGTH);
    expect(r.body).toContain('line 3999');
    expect(r.body).toContain('older lines cut');
  });
});
