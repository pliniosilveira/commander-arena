// Stage P38 (M53): a line of the Korvold deck's casting and targets slice that the grammar reads whose engine feature is not listed is reported as
// "recognised, not runnable" naming that feature, never built (D-068, D-181, D-182). The engine lists every feature below, so the support check is
// replaced here by one that lacks one feature at a time, and the lowering must name it. The lines are the real Oracle text of the three cards (names
// replaced by ~) and the sibling that declares only a kicked target.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { BLOCKED } from './blocked-features';
import { read, withoutFeature } from './parser-p5-helpers';

const TEAR =
  'Kicker {1}{B}\nExile target artifact or enchantment. If this spell was kicked, exile target nonland permanent instead.';
const HEX = 'Kicker {2}\nDraw a card. If ~ was kicked, destroy target creature.';
const STIR = 'As an additional cost to cast ~, sacrifice an artifact or creature or pay {4}.';
const REDUCTION = '~ costs {3} less to cast if you control a creature with power 4 or greater.';
const CHANGE = 'Change the target of target spell or ability with a single target.';

const CASES = [
  ['ability:ifKicked', TEAR, 'instant'],
  ['ability:ifKicked', HEX, 'sorcery'],
  ['ability:additionalCostChoice', STIR, 'sorcery'],
  ['ability:selfCostReducedIf', REDUCTION, 'instant'],
  ['effect:changeTarget', CHANGE, 'instant'],
  ['selector:singleTarget', CHANGE, 'instant'],
] as const;

describe('the lines of the Korvold slice 3 name the feature the engine lacks (D-181, D-182)', () => {
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
