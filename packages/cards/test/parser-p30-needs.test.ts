// Stage P30 (M12): a line of the recursion slice that the grammar reads whose engine feature is not listed is reported as "recognised,
// not runnable" naming that feature, never built (D-068, D-135). The engine lists every feature below, so the support check is replaced
// here by one that lacks one feature at a time, and the lowering must name it. The lines are the real Oracle text of the golden corpus
// (names replaced by ~) and SYNTHETIC variants.
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
  // Conditions.
  [
    'condition:objectMatches',
    "Return target creature card from your graveyard to your hand. If it's a Zombie card, draw a card.",
    'sorcery',
    [],
  ],
  [
    'condition:objectMatches',
    "Return target creature card from your graveyard to the battlefield. If it's an Angel, put two +1/+1 counters on it.",
    'sorcery',
    [],
  ],
  [
    'condition:giftPromised',
    'When ~ enters, if the gift was promised, destroy target artifact or enchantment an opponent controls.',
    'creature',
    [],
  ],
  [
    'condition:giftPromised',
    'Destroy target creature. If the gift was promised, you gain 4 life.',
    'instant',
    [],
  ],
  [
    'condition:opponentControlsAtLeast',
    '{4}{B}{B}: Return this card from your graveyard to the battlefield. This ability costs {4} less to activate if an opponent controls four or more nonbasic lands.',
    'creature',
    [],
  ],
  [
    'condition:didPrevious',
    'When ~ enters, you may discard a card. If you do, draw a card.',
    'creature',
    [],
  ],
  // The effects of the offer and of the permission.
  ['effect:may', 'When ~ enters, you may discard a card. If you do, draw a card.', 'creature', []],
  [
    'effect:conditional',
    'When ~ enters, you may discard a card. If you do, draw a card.',
    'creature',
    [],
  ],
  [
    'effect:reflexive',
    'When ~ dies, you may exile it. When you do, return target creature card from your graveyard to your hand.',
    'creature',
    [],
  ],
  [
    'effect:may',
    'When ~ dies, you may exile it. When you do, return target creature card from your graveyard to your hand.',
    'creature',
    [],
  ],
  [
    'effect:mayCast',
    '{T}: You may cast target Zombie creature card from your graveyard this turn.',
    'creature',
    [],
  ],
  [
    'duration:untilEndOfTurn',
    '{T}: You may cast target Zombie creature card from your graveyard this turn.',
    'creature',
    [],
  ],
  // Selectors and the parts of a filter.
  [
    'selector:anyNumber',
    'When ~ enters, sacrifice any number of other permanents, then draw that many cards.',
    'creature',
    [],
  ],
  [
    'selector:greatest',
    'Target opponent sacrifices a creature with the greatest power among creatures they control.',
    'sorcery',
    [],
  ],
  ['selector:notSupertypes', 'Destroy target nonbasic land.', 'sorcery', []],
  [
    'selector:thisCard',
    "When ~ dies or is put into exile from the battlefield, you may put her into her owner's library third from the top.",
    'creature',
    [],
  ],
  [
    'selector:thisCard',
    'When ~ dies, you may exile it. When you do, return target creature card from your graveyard to your hand.',
    'creature',
    [],
  ],
  ['amount:thisWay', 'Sacrifice two creatures, then draw that many cards.', 'sorcery', []],
  // Triggers.
  [
    'trigger:entersUntapped',
    'When ~ enters untapped, you may put target creature card from your graveyard on top of your library.',
    'land',
    ['Swamp'],
  ],
  [
    'trigger:leavesToAnyOf',
    "When ~ dies or is put into exile from the battlefield, you may put her into her owner's library third from the top.",
    'creature',
    [],
  ],
  [
    'trigger:leavesToAnyOf',
    'Whenever ~ is put into exile from the battlefield, draw a card.',
    'creature',
    [],
  ],
  // Abilities and keywords.
  ['keyword:gift', 'Gift a card', 'creature', []],
  [
    'ability:costReducedIf',
    '{4}{B}{B}: Return this card from your graveyard to the battlefield. This ability costs {4} less to activate if an opponent controls four or more nonbasic lands.',
    'creature',
    [],
  ],
  [
    'cost:payLife',
    "{3}, {T}, Pay life equal to the number of colors in your commanders' color identity: Draw a card.",
    'land',
    [],
  ],
  [
    'amount:commanderColors',
    "{3}, {T}, Pay life equal to the number of colors in your commanders' color identity: Draw a card.",
    'land',
    [],
  ],
  [
    'effect:moveToZone',
    '{4}{B}{B}: Return this card from your graveyard to the battlefield with a +1/+1 counter on it.',
    'creature',
    [],
  ],
] as const;

describe('the lines of the recursion slice name the feature the engine lacks (D-135)', () => {
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

  test('a feature the engine does not list does not block the others', () => {
    BLOCKED.clear();
    BLOCKED.add('selector:notSupertypes');
    try {
      expect(read('Destroy target land.', 'sorcery').unparsed).toEqual([]);
      expect(read('Destroy target nonbasic land.', 'sorcery').unparsed).toHaveLength(1);
    } finally {
      BLOCKED.clear();
    }
  });

  test('every feature the lowerings of this slice name is declared', () => {
    for (const ref of [
      'condition:objectMatches',
      'condition:giftPromised',
      'condition:opponentControlsAtLeast',
      'condition:didPrevious',
      'effect:may',
      'effect:reflexive',
      'effect:mayCast',
      'selector:anyNumber',
      'selector:greatest',
      'selector:notSupertypes',
      'selector:thisCard',
      'trigger:entersUntapped',
      'trigger:leavesToAnyOf',
      'keyword:gift',
      'ability:costReducedIf',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
