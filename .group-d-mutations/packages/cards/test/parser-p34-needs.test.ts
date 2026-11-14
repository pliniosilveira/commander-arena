// Stage P34 (M9): a line of the Dragons slice that the grammar reads whose engine feature is not listed is reported as "recognised, not
// runnable" naming that feature, never built (D-068, D-151, D-152). The engine lists every feature below, so the support check is
// replaced here by one that lacks one feature at a time, and the lowering must name it. The lines are the real Oracle text of the golden
// corpus (names replaced by ~) and SYNTHETIC variants.
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
  ['keyword:dethrone', 'Dethrone', 'creature', []],
  ['keyword:myriad', 'Myriad', 'creature', []],
  ['keyword:readAhead', 'Read ahead', 'enchantment', ['Saga']],
  [
    'effect:exileTop',
    'Exile the top three cards of your library. You may play them this turn.',
    'sorcery',
    [],
  ],
  [
    'effect:mayPlay',
    'Exile the top three cards of your library. You may play them this turn.',
    'sorcery',
    [],
  ],
  [
    'effect:extraCombat',
    'Whenever ~ attacks, after this phase, there is an additional combat phase.',
    'creature',
    [],
  ],
  [
    'effect:enterAttacking',
    'Whenever ~ attacks, you may put a Dragon creature card from your hand onto the battlefield tapped and attacking.',
    'creature',
    [],
  ],
  ['effect:exileUntilCast', 'Discover 5.', 'sorcery', []],
  [
    'amount:shortfall',
    "Discover 4. If the discovered card's mana value is less than 4, create a number of Treasure tokens equal to the difference.",
    'sorcery',
    [],
  ],
  [
    'effect:revealTop',
    "The owner of target creature shuffles it into their library, then reveals the top card of their library. If it's a creature card, they put it onto the battlefield.",
    'sorcery',
    [],
  ],
  [
    'effect:behold',
    'When ~ enters, you may behold an artifact. If you do, draw a card.',
    'creature',
    [],
  ],
  [
    'effect:payAnyAmount',
    'When ~ dies, you may pay any amount of {G}. When you do, it deals that much damage to any target.',
    'creature',
    [],
  ],
  [
    'manaProduction:anyCombination',
    '{T}: Add three mana in any combination of colors.',
    'artifact',
    [],
  ],
  [
    'ability:manaSpentRider',
    '{T}: Add {G}. If that mana is spent on an Elf creature spell, it gains haste until end of turn.',
    'creature',
    [],
  ],
  [
    'static:unspentManaStays',
    "You don't lose unspent green mana as steps and phases end.",
    'creature',
    [],
  ],
  [
    'static:castFromTopOfLibrary',
    'You may cast artifact spells with mana value 3 or less from the top of your library.',
    'creature',
    [],
  ],
  [
    'ability:functionsInGraveyard',
    'As long as this card is in your graveyard, creatures you control get +1/+0.',
    'creature',
    [],
  ],
  [
    'condition:enteredThisTurn',
    'As long as a creature entered the battlefield under your control this turn, ~ gets +1/+1.',
    'creature',
    [],
  ],
  [
    'condition:playerDealtDamage',
    'If an opponent was dealt 7 or more damage this turn, draw a card.',
    'sorcery',
    [],
  ],
  [
    'condition:attackingMostLife',
    "Whenever ~ attacks, if it's attacking the player with the most life or tied for most life, draw a card.",
    'creature',
    [],
  ],
  [
    'condition:attackersTotalPower',
    'Whenever ~ attacks, if you attacked with creatures with total power 10 or greater this combat, draw a card.',
    'creature',
    [],
  ],
  [
    'condition:chosenOption',
    'As ~ enters, choose Khans or Dragons.\n• Khans — At the beginning of your upkeep, draw a card.\n• Dragons — At the beginning of your end step, you gain 1 life.',
    'enchantment',
    [],
  ],
  [
    'replacement:asEntersChoose',
    'As ~ enters, choose Khans or Dragons.\n• Khans — At the beginning of your upkeep, draw a card.\n• Dragons — At the beginning of your end step, you gain 1 life.',
    'enchantment',
    [],
  ],
  [
    'replacement:entersAsCopy',
    'As ~ enters, you may have it become a copy of any artifact on the battlefield, except it has flying.',
    'creature',
    [],
  ],
  ['selector:eachOtherOpponent', '~ deals 3 damage to each other opponent.', 'sorcery', []],
] as const;

describe('the lines of the Dragons slice name the feature the engine lacks (D-151)', () => {
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
        // The line that chooses an option keeps the choice itself (it does nothing alone); the lines that use it are dropped and flagged.
        if (ref === 'condition:chosenOption' || ref === 'replacement:asEntersChoose') {
          expect(parsed.unparsed, `${ref}: ${text}`).not.toEqual([]);
          continue;
        }
        expect(parsed.abilities, `${ref}: ${text}`).toEqual([]);
        expect(parsed.spell ?? undefined, `${ref}: ${text}`).toBeUndefined();
        expect(parsed.alternativeCosts, `${ref}: ${text}`).toEqual([]);
      } finally {
        BLOCKED.clear();
      }
    }
  });

  // The plain keywords (Dethrone, Myriad, Read ahead) are gated by their own kind in the lowering of a keyword line, which the vocabulary lists.
  test('every feature the lowerings of this slice name is declared', () => {
    for (const ref of [
      'ability:functionsInGraveyard',
      'ability:manaSpentRider',
      'amount:shortfall',
      'condition:attackersTotalPower',
      'condition:attackingMostLife',
      'condition:chosenOption',
      'condition:enteredThisTurn',
      'condition:playerDealtDamage',
      'effect:behold',
      'effect:enterAttacking',
      'effect:exileTop',
      'effect:exileUntilCast',
      'effect:extraCombat',
      'effect:mayPlay',
      'effect:payAnyAmount',
      'effect:revealTop',
      'manaProduction:anyCombination',
      'replacement:asEntersChoose',
      'replacement:entersAsCopy',
      'selector:eachOtherOpponent',
      'static:castFromTopOfLibrary',
      'static:unspentManaStays',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
