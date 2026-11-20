// Reading the file times out of a Vitest log (shard-weights.ts): the colours, the plain reporter, files without a duration, and the mean over several runs.
import { describe, expect, test } from 'vitest';
import { DEFAULT_SECONDS, parseVitestLog, projectDirectories, weightsOf } from './shard-weights.ts';

const ESC = String.fromCharCode(27);

describe('parseVitestLog', () => {
  test('reads a coloured line of a log file', () => {
    const line = ` ${ESC}[32m✓${ESC}[39m ${ESC}[30m${ESC}[42m @commander-arena/ai ${ESC}[49m${ESC}[39m test/hidden-info.test.ts ${ESC}[2m(${ESC}[22m${ESC}[2m12 tests${ESC}[22m${ESC}[2m)${ESC}[22m${ESC}[33m 201896${ESC}[2mms${ESC}[22m${ESC}[39m`;
    expect(parseVitestLog(line)).toEqual([
      { project: '@commander-arena/ai', path: 'test/hidden-info.test.ts', seconds: 201.896 },
    ]);
  });

  test('reads a line of `gh run view --log`, which writes the escape byte as "^[" and starts with the job and the time', () => {
    const line =
      'unit tests (shard 3/4)\tUNKNOWN STEP\t2026-11-20T19:01:33.7789794Z  ^[[32m✓^[[39m ^[[30m^[[46m @commander-arena/web ^[[49m^[[39m test/ward-host.test.ts ^[[2m(^[[22m^[[2m16 tests^[[22m^[[2m)^[[22m^[[33m 41018^[[2mms^[[22m^[[39m';
    expect(parseVitestLog(line)).toEqual([
      { project: '@commander-arena/web', path: 'test/ward-host.test.ts', seconds: 41.018 },
    ]);
  });

  test('reads the plain reporter, with the project between bars and a count of skipped tests', () => {
    expect(
      parseVitestLog(' ✓ |@commander-arena/engine| test/a.test.ts (4 tests | 1 skipped) 1500ms'),
    ).toEqual([{ project: '@commander-arena/engine', path: 'test/a.test.ts', seconds: 1.5 }]);
  });

  test('a file without a duration is a light file: null seconds', () => {
    expect(parseVitestLog(' ✓ |@commander-arena/cards| test/b.test.tsx (3 tests)')).toEqual([
      { project: '@commander-arena/cards', path: 'test/b.test.tsx', seconds: null },
    ]);
  });

  test('ignores lines that are not a file line, and a file printed twice counts once with its last line', () => {
    const log = [
      ' RUN  v5.0.5 /repo',
      ' ✓ |@commander-arena/ai| test/c.test.ts (1 test) 400ms',
      ' stdout | something',
      ' ✓ |@commander-arena/ai| test/c.test.ts (1 test) 900ms',
      ' Test Files  1 passed (1)',
    ].join('\n');
    expect(parseVitestLog(log)).toEqual([
      { project: '@commander-arena/ai', path: 'test/c.test.ts', seconds: 0.9 },
    ]);
  });
});

describe('weightsOf', () => {
  const dirs = new Map([['@commander-arena/ai', 'packages/ai']]);
  const run = (seconds: number | null, path = 'test/x.test.ts') => [
    { project: '@commander-arena/ai', path, seconds },
  ];

  test('the weight of a file is its mean over the runs, by repository path', () => {
    expect(weightsOf([run(100), run(200)], dirs)).toEqual({ 'packages/ai/test/x.test.ts': 150 });
  });

  test('a file without a duration in a run counts as a light file in that run', () => {
    // (4 + 0.3) / 2 = 2.15: a file that is slow in one run only still keeps a weight
    expect(weightsOf([run(4), run(null)], dirs)).toEqual({ 'packages/ai/test/x.test.ts': 2.2 });
  });

  test('a light file is not written down', () => {
    expect(weightsOf([run(0.8), run(null)], dirs)).toEqual({});
    expect(DEFAULT_SECONDS).toBeLessThan(1);
  });

  test('a project that is not in the workspace is refused', () => {
    expect(() =>
      weightsOf([[{ project: '@commander-arena/gone', path: 'test/y.test.ts', seconds: 5 }]], dirs),
    ).toThrow('not in the workspace');
  });
});

describe('projectDirectories', () => {
  test('finds the packages, the apps and the tools of this repository by their package names', () => {
    const dirs = projectDirectories(new URL('../..', import.meta.url).pathname);
    expect(dirs.get('@commander-arena/ai')).toBe('packages/ai');
    expect(dirs.get('@commander-arena/web')).toBe('apps/web');
    expect(dirs.get('@commander-arena/tools')).toBe('tools');
  });
});
