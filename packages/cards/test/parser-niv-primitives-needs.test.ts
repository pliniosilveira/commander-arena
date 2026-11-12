// The Niv-Mizzet deck (issue 25), four primitives (D-318 to D-321): a line the grammar reads whose engine feature is not listed is reported as
// "recognised, not runnable" naming that feature, never built (D-068). The engine lists every feature below, so the support check is replaced here by one
// that lacks one feature at a time, and the lowering must name it. The lines are the real Oracle text of the golden corpus (names replaced by ~).
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
    'condition:spellsCastThisTurn',
    "{T}: Copy target instant or sorcery spell you control. You may choose new targets for the copy. Activate only if you've cast three or more spells this turn.",
    'creature',
  ],
  ['ability:manaDistinctColors', '{T}: Add two mana of different colors.', 'artifact'],
  ['static:untapInOthersUntapStep', "Untap ~ during each other player's untap step.", 'artifact'],
  [
    'amount:minus',
    'At the beginning of your upkeep, you gain X life, where X is the number of cards in your hand minus 4.',
    'artifact',
  ],
] as const;

describe('the lines of the four primitives name the feature the engine lacks (D-068)', () => {
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
      'condition:spellsCastThisTurn',
      'ability:manaDistinctColors',
      'static:untapInOthersUntapStep',
      'amount:minus',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
