// Issue 104 (Embalm): a line the grammar reads whose engine feature is not listed is reported as "recognised, not runnable" naming that feature, never built (D-068). The support
// check is replaced here by one that lacks one feature at a time, and the lowering must name it.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { read, withoutFeature } from './parser-p5-helpers';

const VIZIER =
  "You may have ~ enter as a copy of any creature on the battlefield, except if ~ was embalmed, the token has no mana cost, it's white, and it's a Zombie in addition to its other types.";

const CASES = [
  ['keyword:embalm', 'Embalm {5}{W}', 'creature'],
  ['replacement:entersAsCopy', VIZIER, 'creature'],
] as const;

describe('the lines of the slice name the feature the engine lacks (D-068)', () => {
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
        expect(read(text, type).abilities, `${ref}: ${text}`).toEqual([]);
      } finally {
        BLOCKED.clear();
      }
    }
  });

  test('the feature the lowerings name is declared', () => {
    expect(DECLARED_NEEDS).toContain('keyword:embalm');
  });
});
