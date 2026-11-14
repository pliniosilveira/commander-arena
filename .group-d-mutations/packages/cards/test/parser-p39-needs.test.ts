// Stage P39 (M54): a line of the Korvold deck's mana-spent slice that the grammar reads whose engine feature is not listed is reported as "recognised, not
// runnable" naming that feature, never built (D-068, D-183, D-184). The engine lists every feature below, so the support check is replaced here by one
// that lacks one feature at a time, and the lowering must name it. The lines are the real Oracle text of the two cards (names replaced by ~).
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { BLOCKED } from './blocked-features';
import { read, withoutFeature } from './parser-p5-helpers';

const PROSSH =
  'When you cast this spell, create X 0/1 red Kobold creature tokens named Kobolds of Kher Keep, where X is the amount of mana spent to cast it.';
const COIN =
  'Each creature you control enters with an additional +1/+1 counter on it for each mana from an artifact source spent to cast it.';

const CASES = [
  ['amount:manaSpent', PROSSH, 'creature'],
  ['trigger:castSpell', PROSSH, 'creature'],
  ['amount:manaSpent', COIN, 'artifact'],
  ['replacement:othersEnterWithCounters', COIN, 'artifact'],
] as const;

describe('the lines of the Korvold slice 5 name the feature the engine lacks (D-183, D-184)', () => {
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
