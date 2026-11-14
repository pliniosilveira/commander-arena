// Stage P35 (M50): a line of the Korvold deck's text and token slice that the grammar reads whose engine feature is not listed is reported as
// "recognised, not runnable" naming that feature, never built (D-068, D-175, D-176). The engine lists every feature below, so the support
// check is replaced here by one that lacks one feature at a time, and the lowering must name it. The lines are the real Oracle text of the
// twelve cards (names replaced by ~) and SYNTHETIC variants.
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
    'effect:chooseOne',
    'Whenever a land you control enters, create a Food token or a Treasure token.',
    'creature',
    [],
  ],
  ['keyword:chooseBackground', 'Choose a Background', 'creature', []],
  [
    'selector:attached',
    'When ~ enters, enchanted creature gains trample and indestructible until end of turn.',
    'enchantment',
    ['Aura'],
  ],
  [
    'token:tapped',
    'When ~ dies, create a number of tapped Treasure tokens equal to its power.',
    'creature',
    [],
  ],
  [
    'token:custom',
    'At the beginning of each upkeep, create a 1/1 black and green Pest creature token with "When this token dies, you gain 1 life."',
    'creature',
    [],
  ],
  [
    'ability:mana',
    'At the beginning of your upkeep, you may create a 0/1 colorless Eldrazi Spawn creature token. It has "Sacrifice this token: Add {C}."',
    'enchantment',
    [],
  ],
  [
    'manaCost:sacrifice',
    'At the beginning of your upkeep, you may create a 0/1 colorless Eldrazi Spawn creature token. It has "Sacrifice this token: Add {C}."',
    'enchantment',
    [],
  ],
  [
    'selector:thisCard',
    "When ~ is put into a graveyard from the battlefield, return it to its owner's hand.",
    'enchantment',
    ['Aura'],
  ],
  [
    'selector:controllerOf',
    "{1}, Sacrifice ~: Destroy target artifact or enchantment. ~ deals 2 damage to that permanent's controller.",
    'enchantment',
    [],
  ],
  [
    'selector:choose',
    'Mill two cards, then you may return a creature card from your graveyard to your hand.',
    'sorcery',
    [],
  ],
  ['effect:moveToZone', 'Shuffle your graveyard into your library.', 'sorcery', []],
  ['effect:shuffle', 'Shuffle your graveyard into your library.', 'sorcery', []],
  ['selector:each', 'Shuffle your graveyard into your library.', 'sorcery', []],
  ['keyword:equip', 'Equip—{2}, Pay 2 life.', 'artifact', ['Equipment']],
  ['cost:payLife', 'Equip—{2}, Pay 2 life.', 'artifact', ['Equipment']],
] as const;

describe('the lines of the Korvold slice name the feature the engine lacks (D-175, D-176)', () => {
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
        expect(parsed.abilities, `${ref}: ${text}`).toEqual([]);
        expect(parsed.spell ?? undefined, `${ref}: ${text}`).toBeUndefined();
      } finally {
        BLOCKED.clear();
      }
    }
  });

  test('every feature the lowerings of this slice name is declared', () => {
    for (const ref of [
      'effect:chooseOne',
      'effect:moveToZone',
      'effect:shuffle',
      'keyword:chooseBackground',
      'selector:each',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
