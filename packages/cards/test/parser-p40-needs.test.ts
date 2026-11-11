// Stage P40 (M55): a line of the Korvold deck's keywords slice that the grammar reads whose engine feature is not listed is reported as "recognised, not
// runnable" naming that feature, never built (D-068, D-185, D-186). The engine lists every feature below, so the support check is replaced here by one
// that lacks one feature at a time, and the lowering must name it. The lines are the real Oracle text of the three cards (names replaced by ~).
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { BLOCKED } from './blocked-features';
import { read, withoutFeature } from './parser-p5-helpers';

const ENCORE = 'Encore {3}{R}';
const BROOD =
  'At the beginning of each upkeep, create a 1/1 red and green Dragon creature token with flying and devour 2.';
const UNCOUNTERABLE = "Creature spells you control can't be countered.";
const RIOT = 'Nontoken creatures you control have riot.';

const CASES = [
  ['keyword:encore', ENCORE, 'creature'],
  ['keyword:devour', BROOD, 'creature'],
  ['static:spellsCantBeCountered', UNCOUNTERABLE, 'enchantment'],
  ['keyword:riot', RIOT, 'enchantment'],
] as const;

describe('the lines of the Korvold slice 6 name the feature the engine lacks (D-185, D-186)', () => {
  test.each(CASES)('without %s: %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type, []);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a blocked line leaves the face with no ability (never half-executed)', () => {
    for (const [ref, text, type] of CASES) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        const parsed = read(text, type, []);
        expect(parsed.unparsed.length, `${ref}: ${text}`).toBeGreaterThan(0);
      } finally {
        BLOCKED.clear();
      }
    }
  });
});
