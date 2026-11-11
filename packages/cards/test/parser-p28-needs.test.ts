// Stage P28 (M10): a line of the counted-amounts slice that the grammar reads whose engine feature is not listed is
// reported as "recognised, not runnable" naming that feature, never built (D-068, D-131). The engine lists every feature
// below, so the support check is replaced here by one that lacks one feature at a time, and the lowering must name it.
// The wordings are those of reports/decks.md (parser version 32), with SYNTHETIC numbers, and SYNTHETIC variants.
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
  // The amounts.
  ['amount:toughnessOf', 'Exile target creature. You gain life equal to its toughness.', 'sorcery'],
  [
    'amount:countersOn',
    'At the beginning of your upkeep, you lose 1 life for each burden counter on ~.',
    'creature',
  ],
  [
    'amount:aggregate',
    'Draw cards equal to the greatest power among creatures you control.',
    'sorcery',
  ],
  [
    'amount:devotion',
    'When ~ enters, each opponent loses X life, where X is your devotion to black.',
    'creature',
  ],
  [
    'amount:commanderColors',
    'Draw cards equal to the number of colors in your commanders’ color identity.',
    'sorcery',
  ],
  [
    'amount:half',
    'Create X 2/2 black Zombie creature tokens, where X is half the number of Zombies you control, rounded down.',
    'sorcery',
  ],
  ['amount:multiple', 'You gain 2 life for each creature you control.', 'sorcery'],
  [
    'amount:sum',
    'You gain life equal to the number of creatures you control plus the number of lands you control.',
    'sorcery',
  ],
  [
    'amount:opponentsWithMore',
    'Draw a card for each opponent who has more cards in hand than you.',
    'sorcery',
  ],
  [
    'amount:thisWay',
    'Each opponent draws a card, then you draw a card for each opponent who drew a card this way.',
    'sorcery',
  ],
  [
    'amount:times',
    'All creatures get -2/-2 until end of turn for each Swamp you control.',
    'sorcery',
  ],
  ['amount:countOf', 'Draw a card for each creature you control.', 'sorcery'],
  [
    'amount:powerOf',
    'Target creature you control deals damage equal to its power to any target.',
    'sorcery',
  ],
  // The conditions.
  [
    'condition:amountIs',
    'When ~ enters, if an opponent has more life than you, you gain 4 life.',
    'creature',
  ],
  [
    'condition:amountIs',
    'At the beginning of your upkeep, if you have 7 or more creature cards in your graveyard, you may return target creature card from your graveyard to your hand.',
    'creature',
  ],
  [
    'condition:playerHasDesignation',
    "When ~ enters, if you're the monarch, you gain 1 life.",
    'creature',
  ],
  [
    'condition:playerHasDesignation',
    "Draw a card. If you're the monarch, draw two cards.",
    'sorcery',
  ],
  // The selectors, effects and tokens.
  [
    'selector:attackingYou',
    'Draw cards equal to the number of creatures attacking you.',
    'sorcery',
  ],
  ['selector:all', 'You and target opponent each draw 2 cards.', 'sorcery'],
  [
    'selector:damageSource',
    'Target creature you control deals damage equal to its power to any target.',
    'sorcery',
  ],
  [
    'selector:triggerSubject',
    'Whenever a creature you control enters, it deals damage equal to its power to any target.',
    'enchantment',
  ],
  [
    'selector:defendingPlayer',
    'Defending player sacrifices a creature of their choice.',
    'sorcery',
  ],
  ['selector:eachOpponent', 'Each other player sacrifices a creature of their choice.', 'sorcery'],
  ['selector:choose', 'Each player sacrifices a creature of their choice.', 'sorcery'],
  ['effect:sacrifice', 'Each player sacrifices a creature of their choice.', 'sorcery'],
  ['effect:mill', 'When ~ enters, mill 2 cards.', 'creature'],
  ['effect:conditional', "Draw a card. If you're the monarch, draw two cards.", 'sorcery'],
  ['token:tapped', 'Create thirteen tapped 2/2 black Zombie creature tokens.', 'sorcery'],
  ['token:custom', 'Create thirteen tapped 2/2 black Zombie creature tokens.', 'sorcery'],
  [
    'token:Clue',
    'Destroy target creature or planeswalker. Its controller investigates.',
    'sorcery',
  ],
  [
    'static:costReduction',
    '~ costs {X} less to cast, where X is the total power of creatures you control.',
    'creature',
  ],
] as const;

describe('the lines of the counted-amounts slice name the feature the engine lacks (D-131)', () => {
  test.each(CASES)('without %s: %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toEqual([ref]);
  });

  test('a kind the engine does not list does not block the others', () => {
    BLOCKED.clear();
    BLOCKED.add('amount:aggregate');
    try {
      expect(read('Draw a card for each creature you control.', 'sorcery').unparsed).toEqual([]);
      expect(read('You gain 2 life for each creature you control.', 'sorcery').unparsed).toEqual(
        [],
      );
      expect(
        read('Draw cards equal to the greatest power among creatures you control.', 'sorcery')
          .unparsed,
      ).toHaveLength(1);
    } finally {
      BLOCKED.clear();
    }
  });

  test('a blocked line leaves the face with no ability and no spell (never half-executed)', () => {
    for (const [ref, text, type] of [
      ['effect:mill', 'When ~ enters, mill 2 cards and you gain 2 life.', 'creature'],
      [
        'condition:playerHasDesignation',
        "When ~ enters, if you're the monarch, you gain 1 life.",
        'creature',
      ],
      [
        'amount:aggregate',
        '~ costs {X} less to cast, where X is the total power of creatures you control.',
        'creature',
      ],
    ] as const) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        expect(read(text, type).abilities, ref).toEqual([]);
      } finally {
        BLOCKED.clear();
      }
    }
    BLOCKED.add('selector:all');
    try {
      expect(read('You and target opponent each draw 2 cards.', 'sorcery').spell).toBeNull();
    } finally {
      BLOCKED.clear();
    }
  });

  test('every feature the lowering can name is declared for the dimension test', () => {
    for (const ref of [
      'amount:toughnessOf',
      'amount:countersOn',
      'amount:aggregate',
      'amount:devotion',
      'amount:commanderColors',
      'amount:half',
      'amount:multiple',
      'amount:sum',
      'amount:opponentsWithMore',
      'amount:thisWay',
      'condition:amountIs',
      'condition:playerHasDesignation',
      'selector:attackingYou',
      'selector:all',
      'selector:damageSource',
      'selector:defendingPlayer',
      'selector:triggerSubject',
      'effect:mill',
      'token:tapped',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
