// Stage P36 (M51): a line of the Korvold deck's fetch lands, reflexive sacrifice and Treasure grants slice that the grammar reads whose engine
// feature is not listed is reported as "recognised, not runnable" naming that feature, never built (D-068, D-177, D-178). The engine lists every
// feature below, so the support check is replaced here by one that lacks one feature at a time, and the lowering must name it. The lines are the
// real Oracle text of the nine cards (names replaced by ~) and SYNTHETIC variants.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { BLOCKED } from './blocked-features';
import { read, withoutFeature } from './parser-p5-helpers';

const CASES = [
  [
    'selector:anyOf',
    '{1}, {T}, Sacrifice ~: Search your library for a basic Swamp, Mountain, or Forest card, put it onto the battlefield tapped, then shuffle.',
    'land',
    [],
  ],
  [
    'effect:reflexive',
    'When ~ enters, sacrifice it. When you do, search your library for a basic Island, Swamp, or Mountain card, put it onto the battlefield tapped, then shuffle and you gain 1 life.',
    'land',
    [],
  ],
  [
    'selector:moved',
    '{T}, Sacrifice ~: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control four or more lands, untap that land.',
    'land',
    [],
  ],
  [
    'selector:sacrificed',
    "At the beginning of your end step, you may sacrifice another creature. When you do, ~ deals damage equal to that creature's power to any target and you create three Treasure tokens.",
    'creature',
    [],
  ],
  [
    'trigger:becomesTargetSpell',
    'Whenever ~ attacks or becomes the target of a spell, create a Treasure token.',
    'creature',
    [],
  ],
  [
    'static:grantAbility',
    'Treasures you control have "{T}, Sacrifice ~: Add two mana of any one color."',
    'creature',
    [],
  ],
  [
    'manaCost:sacrifice',
    'Treasures you control have "{T}, Sacrifice ~: Add two mana of any one color."',
    'creature',
    [],
  ],
  [
    'manaProduction:anyColor',
    'Treasures you control have "{T}, Sacrifice ~: Add two mana of any one color."',
    'creature',
    [],
  ],
  ['ability:activated', 'Lands you control have "{T}: Create a Treasure token."', 'artifact', []],
  [
    'effect:conditional',
    'Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.\nThreshold — If there are seven or more cards in your graveyard, instead search your library for up to three basic land cards, put them onto the battlefield tapped, then shuffle.',
    'sorcery',
    [],
  ],
  [
    'condition:amountIs',
    'Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.\nThreshold — If there are seven or more cards in your graveyard, instead search your library for up to three basic land cards, put them onto the battlefield tapped, then shuffle.',
    'sorcery',
    [],
  ],
] as const;

describe('the lines of the Korvold slice 2 name the feature the engine lacks (D-177, D-178)', () => {
  test.each(CASES)('without %s: %s', (ref, text, type, subtypes) => {
    const missing = withoutFeature(ref, text, type, subtypes);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a blocked line leaves the face with no ability (never half-executed)', () => {
    for (const [ref, text, type, subtypes] of CASES) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        const parsed = read(text, type, subtypes);
        // The lines that hold other abilities beside the blocked one keep those; the blocked line is what is left out.
        expect(parsed.unparsed.length, `${ref}: ${text}`).toBeGreaterThan(0);
      } finally {
        BLOCKED.clear();
      }
    }
  });
});
