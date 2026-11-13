// The Hashaton deck program (issue 31), group 3 (D-1150 to D-1152, provisional): a line the grammar reads whose engine feature is not listed is reported as
// "recognised, not runnable" naming that feature, never built (D-068). The engine lists every feature below, so the support check is replaced here by one that
// lacks one feature at a time, and the lowering must name it. The lines are the real Oracle text of the golden corpus.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { read, withoutFeature } from './parser-p5-helpers';

const CASES = [
  [
    'static:cantHaveCounters',
    'Creatures you control can’t have -1/-1 counters put on them.',
    'creature',
  ],
  [
    'replacement:drawInstead',
    'If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.',
    'creature',
  ],
  [
    'replacement:tokensInstead',
    'If one or more tokens would be created under your control, twice that many of those tokens are created instead.',
    'creature',
  ],
] as const;

describe('the lines of the primitives name the feature the engine lacks (D-068)', () => {
  test.each(CASES)('without %s: %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a blocked line leaves the face with no ability (never half-executed)', () => {
    for (const [ref, text, type] of CASES) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        const parsed = read(text, type);
        expect(parsed.abilities, `${ref}: ${text}`).toEqual([]);
      } finally {
        BLOCKED.clear();
      }
    }
  });

  test('every feature the lowerings of this slice name is declared', () => {
    for (const ref of [
      'static:cantHaveCounters',
      'replacement:drawInstead',
      'replacement:tokensInstead',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
