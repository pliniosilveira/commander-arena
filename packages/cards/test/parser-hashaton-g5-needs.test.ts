// The Hashaton deck program (issue 31), group 5 (D-382 to D-385): a line the grammar reads whose engine feature is not listed is reported as "recognised, not
// runnable" naming that feature, never built (D-068). The engine lists every feature below, so the support check is replaced here by one that lacks one feature at a time, and the
// lowering must name it. The lines are the real Oracle text of the golden corpus.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { read, withoutFeature } from './parser-p5-helpers';

const HASHATON =
  'Whenever you discard a creature card, you may pay {2}{U}. If you do, create a tapped token that’s a copy of that card, except it’s a 4/4 black Zombie.';
const SOLIDARITY =
  'At the beginning of your end step, for each token you control of the chosen type that entered this turn, create a token that’s a copy of it.';

const CASES = [
  ['keyword:eternalize', 'Eternalize {5}{U}{U}', 'creature'],
  ['trigger:discarded', HASHATON, 'creature'],
  ['token:copyExceptions', HASHATON, 'creature'],
  ['token:tapped', HASHATON, 'creature'],
  ['effect:createCopies', SOLIDARITY, 'enchantment'],
  ['selector:token', SOLIDARITY, 'enchantment'],
  ['selector:chosenType', SOLIDARITY, 'enchantment'],
  ['selector:enteredThisTurn', SOLIDARITY, 'enchantment'],
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
        const parsed = read(text, type);
        expect(parsed.abilities, `${ref}: ${text}`).toEqual([]);
      } finally {
        BLOCKED.clear();
      }
    }
  });

  test('every feature the lowerings of this slice name is declared', () => {
    for (const ref of [
      'keyword:eternalize',
      'token:copyExceptions',
      'effect:createCopies',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
