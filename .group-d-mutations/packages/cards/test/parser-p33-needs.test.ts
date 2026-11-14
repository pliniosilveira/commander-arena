// Stage P33 (M9): a line of the Angels slice that the grammar reads whose engine feature is not listed is reported as "recognised, not
// runnable" naming that feature, never built (D-068, D-149, D-150). The engine lists every feature below, so the support check is
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
  // Triggers and the abilities that hold them.
  ['trigger:lifeGained', 'Whenever you gain life, put a +1/+1 counter on ~.', 'creature', []],
  [
    'trigger:countersAdded',
    'Whenever you put one or more +1/+1 counters on ~, draw a card.',
    'creature',
    [],
  ],
  [
    'trigger:attackBatch',
    'Whenever you attack with two or more creatures, draw a card.',
    'creature',
    [],
  ],
  [
    'ability:oncePerTurn',
    'Whenever you put one or more +1/+1 counters on ~, draw a card. This ability triggers only once each turn.',
    'creature',
    [],
  ],
  [
    'selector:commander',
    'Whenever a commander you control enters or attacks, proliferate.',
    'creature',
    [],
  ],
  [
    'selector:hasCounter',
    'Whenever another permanent you control leaves the battlefield, if it had counters on it, investigate.',
    'creature',
    [],
  ],
  // Conditions.
  [
    'condition:attackersAttackedYou',
    'Whenever another player attacks with two or more creatures, they draw a card if none of those creatures attacked you.',
    'creature',
    [],
  ],
  [
    'condition:sameNameAtLeast',
    '{2}, {T}: Draw a card. Activate only if you control three or more lands with the same name.',
    'artifact',
    [],
  ],
  [
    'condition:ownTurnNumber',
    "You can't cast ~ during your first, second, or third turns of the game.",
    'creature',
    [],
  ],
  [
    'condition:objectMatches',
    'Whenever a land you control enters, you may return target nonland permanent card from your graveyard to your hand. If that land is a Plains, you may return that nonland permanent card to the battlefield instead.',
    'creature',
    [],
  ],
  [
    'selector:triggerSubject',
    'Whenever a land you control enters, you may return target nonland permanent card from your graveyard to your hand. If that land is a Plains, you may return that nonland permanent card to the battlefield instead.',
    'creature',
    [],
  ],
  [
    'effect:may',
    'Whenever a land you control enters, you may return target nonland permanent card from your graveyard to your hand. If that land is a Plains, you may return that nonland permanent card to the battlefield instead.',
    'creature',
    [],
  ],
  [
    'condition:didPrevious',
    'Whenever a land you control enters, you may return target nonland permanent card from your graveyard to your hand. If that land is a Plains, you may return that nonland permanent card to the battlefield instead.',
    'creature',
    [],
  ],
  // Effects and selectors.
  ['effect:proliferate', 'Proliferate.', 'sorcery', []],
  [
    'selector:thisCard',
    "When enchanted creature dies, return this card to its owner's hand.",
    'enchantment',
    ['Aura'],
  ],
  [
    'selector:keywords',
    'Other creatures you control with flying have indestructible.',
    'creature',
    [],
  ],
  // Replacements and statics.
  [
    'replacement:lifeGainBonus',
    'If you would gain life, you gain that much life plus 1 instead.',
    'creature',
    [],
  ],
  [
    'replacement:othersEnterWithCounters',
    'Each other Angel you control enters with an additional +1/+1 counter on it for each Angel you already control.',
    'creature',
    ['Angel'],
  ],
  ['static:playerHexproof', 'You have hexproof.', 'creature', []],
  [
    'static:cantLoseGame',
    "You can't lose the game and your opponents can't win the game.",
    'creature',
    [],
  ],
  [
    'static:opponentsCantWin',
    "You can't lose the game and your opponents can't win the game.",
    'creature',
    [],
  ],
  [
    'static:preventDamageToThis',
    'Prevent all combat damage that would be dealt to ~.',
    'creature',
    [],
  ],
  [
    'static:cantCastThis',
    "You can't cast ~ during your first, second, or third turns of the game.",
    'creature',
    [],
  ],
  [
    'ability:staticCondition',
    "You can't cast ~ during your first turn of the game.",
    'creature',
    [],
  ],
  [
    'static:blockTax',
    "As long as ~ is attacking, creatures can't block unless their controller pays {1} for each of those creatures.",
    'creature',
    [],
  ],
  [
    'castAlternative:tapPermanents',
    "You may pay {W} and tap four untapped creatures you control with flying rather than pay ~'s mana cost.",
    'creature',
    [],
  ],
  // Mana.
  ['manaProduction:chosenColor', '{T}: Add one mana of the chosen color.', 'artifact', []],
  [
    'ability:manaSpendOnly',
    '{T}: Add {W}. Spend this mana only to cast an Angel spell.',
    'creature',
    ['Angel'],
  ],
] as const;

describe('the lines of the Angels slice name the feature the engine lacks (D-149)', () => {
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
        expect(parsed.alternativeCosts, `${ref}: ${text}`).toEqual([]);
      } finally {
        BLOCKED.clear();
      }
    }
  });

  test('every feature the lowerings of this slice name is declared', () => {
    for (const ref of [
      'trigger:lifeGained',
      'trigger:countersAdded',
      'trigger:attackBatch',
      'ability:oncePerTurn',
      'condition:attackersAttackedYou',
      'condition:sameNameAtLeast',
      'condition:ownTurnNumber',
      'effect:proliferate',
      'selector:thisCard',
      'replacement:lifeGainBonus',
      'replacement:othersEnterWithCounters',
      'static:playerHexproof',
      'static:cantLoseGame',
      'static:opponentsCantWin',
      'static:preventDamageToThis',
      'static:cantCastThis',
      'static:blockTax',
      'castAlternative:tapPermanents',
      'manaProduction:chosenColor',
      'ability:manaSpendOnly',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
