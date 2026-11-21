import { describe, expect, it } from 'vitest';
import { type BugReportInput, bugReport } from '../src/import/bug-report';
import { MAX_ISSUE_URL_LENGTH } from '../src/import/deck-issue';

const input = (over: Partial<BugReportInput> = {}): BugReportInput => ({
  description: 'The stack froze\nafter I cast a spell',
  version: { commit: 'abc1234', date: '2026-11-20', engine: 5, parser: 6 },
  screenshot: true,
  ...over,
});

describe('bug report', () => {
  it('carries the description, the build and a note to paste the screenshot', () => {
    const r = bugReport(input());
    expect(r.title).toBe('Issue: The stack froze');
    expect(r.fitsInLink).toBe(true);
    expect(r.body).toContain('after I cast a spell');
    expect(r.body).toContain('Build abc1234 (2026-11-20)');
    expect(r.body).toContain('paste it below');
    expect(r.body).not.toContain('Game log');
    expect(r.body).not.toContain('Stack');
  });

  it('leaves the screenshot note out when there is no screenshot', () => {
    expect(bugReport(input({ screenshot: false })).body).not.toContain('paste it below');
  });

  it('falls back to a short link when the description is too long for one', () => {
    const r = bugReport(input({ description: 'x'.repeat(9000) }));
    expect(r.fitsInLink).toBe(false);
    expect(r.url.length).toBeLessThanOrEqual(MAX_ISSUE_URL_LENGTH);
  });
});
