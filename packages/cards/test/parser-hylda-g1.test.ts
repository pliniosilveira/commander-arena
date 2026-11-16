// The Hylda deck (issue 42), group 1 (D-510 to D-514): the lines of Hylda of the Icy Crown, Icewrought Sentry, Sharae of Numbing Depths, Verity Circle, Hammers of Moradin, Elvish Mariner
// and Pippin, Guard of the Citadel. The real lines are the Oracle text of the acceptance cards of the golden corpus read through the whole pipeline; the other lines are SYNTHETIC siblings
// and the near misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-hylda-g1.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { normalizeOracleText } from '../src/index';
import { readAll as readAllFace, read as readFace, withoutFeature } from './parser-p5-helpers';

/** The abilities of a creature card: every line of this group is the line of a creature. */
const read = (text: string, type: Parameters<typeof readFace>[1] = 'creature') =>
  readFace(text, type);
const readAll = (text: string, type: Parameters<typeof readAllFace>[1] = 'creature') =>
  readAllFace(text, type);

const NOT_READ = (text: string, type: Parameters<typeof read>[1] = 'creature') => {
  const parsed = read(text, type);
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.unparsed, text).toHaveLength(1);
};

const OPPONENT_CREATURE = { types: ['creature'], controller: 'opponent' };

describe('"Whenever you tap an untapped creature an opponent controls" (D-510, CR 701.26a)', () => {
  test('the real line of Icewrought Sentry: +2/+1 until end of turn', () => {
    expect(
      readAll(
        'Whenever you tap an untapped creature an opponent controls, ~ gets +2/+1 until end of turn.',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'becomesTapped', what: OPPONENT_CREATURE, by: 'you' },
        effect: {
          kind: 'modifyPt',
          objects: { kind: 'this' },
          power: 2,
          toughness: 1,
          duration: 'untilEndOfTurn',
        },
      },
    ]);
  });

  test('the real line of Sharae: one or more, a card, once each turn', () => {
    expect(
      readAll(
        'Whenever you tap one or more untapped creatures your opponents control, draw a card. This ability triggers only once each turn.',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'becomesTapped', what: OPPONENT_CREATURE, by: 'you', batch: true },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        oncePerTurn: true,
      },
    ]);
  });

  test('a creature of your own and another kind of permanent (SYNTHETIC)', () => {
    expect(
      readAll('Whenever you tap an untapped creature you control, you gain 1 life.').abilities,
    ).toMatchObject([
      {
        kind: 'triggered',
        trigger: {
          kind: 'becomesTapped',
          what: { types: ['creature'], controller: 'you' },
          by: 'you',
        },
      },
    ]);
    expect(
      readAll('Whenever you tap an untapped artifact an opponent controls, you gain 1 life.')
        .abilities,
    ).toMatchObject([
      {
        kind: 'triggered',
        trigger: {
          kind: 'becomesTapped',
          what: { types: ['artifact'], controller: 'opponent' },
          by: 'you',
        },
      },
    ]);
  });

  test('the old "becomes tapped" is untouched', () => {
    expect(readAll('Whenever ~ becomes tapped, you gain 1 life.').abilities).toMatchObject([
      { kind: 'triggered', trigger: { kind: 'becomesTapped', what: { kind: 'this' } } },
    ]);
  });

  test.each([
    'Whenever an opponent taps an untapped creature you control, you gain 1 life.',
    'Whenever you tap a creature an opponent controls, you gain 1 life.',
    'Whenever you tap one or more creatures your opponents control, you gain 1 life.',
    'Whenever you tapped an untapped creature an opponent controls, you gain 1 life.',
    'Whenever you tap two untapped creatures an opponent controls, you gain 1 life.',
    'Whenever you tap an untapped creature an opponent controls for mana, you gain 1 life.',
    'Whenever you tap an untapped creature an opponent controls or untap a land, you gain 1 life.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text);
  });

  test('without the engine features the line is dropped and says what it needs', () => {
    const line =
      'Whenever you tap an untapped creature an opponent controls, ~ gets +2/+1 until end of turn.';
    expect(withoutFeature('trigger:tappedBy', line).needs).toContain('trigger:tappedBy');
    const batch =
      'Whenever you tap one or more untapped creatures your opponents control, draw a card.';
    expect(withoutFeature('trigger:tapBatch', batch).needs).toContain('trigger:tapBatch');
  });
});

describe('"Whenever a creature an opponent controls becomes tapped, if it isn\'t being declared as an attacker" (D-510, CR 508.1f)', () => {
  const LINE =
    "Whenever a creature an opponent controls becomes tapped, if it isn't being declared as an attacker, you may draw a card.";

  test('the real line of Verity Circle: a part of the event, not an intervening if; the draw is optional', () => {
    expect(readAll(LINE, 'enchantment').abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'becomesTapped', what: OPPONENT_CREATURE, notAsAttacker: true },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        optional: true,
      },
    ]);
  });

  test('on the permanent itself (SYNTHETIC)', () => {
    expect(
      readAll("Whenever ~ becomes tapped, if it isn't being declared as an attacker, draw a card."),
    ).toMatchObject({
      abilities: [{ kind: 'triggered', trigger: { kind: 'becomesTapped', notAsAttacker: true } }],
    });
  });

  test.each([
    "Whenever a creature an opponent controls becomes tapped, if it isn't being declared as a blocker, you may draw a card.",
    'Whenever a creature an opponent controls becomes tapped, if it is being declared as an attacker, you may draw a card.',
    "Whenever a creature an opponent controls becomes untapped, if it isn't being declared as an attacker, you may draw a card.",
    "Whenever a creature an opponent controls attacks, if it isn't being declared as an attacker, you may draw a card.",
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text, 'enchantment');
  });

  test('without the engine feature the line is dropped and says what it needs', () => {
    expect(withoutFeature('trigger:notAsAttacker', LINE, 'enchantment').needs).toContain(
      'trigger:notAsAttacker',
    );
  });
});

describe('"Whenever you scry" and "up to X target nonland permanents" (D-513, CR 701.22, 603.3d)', () => {
  const LINE =
    'Whenever you scry, tap up to X target nonland permanents, where X is the number of cards looked at while scrying this way.';

  test('the real line of Elvish Mariner: a slot of up to as many targets as the cards looked at', () => {
    expect(readAll(LINE).abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'scries', who: 'you' },
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', notTypes: ['land'] } },
            upToTriggerAmount: true,
          },
        ],
        effect: { kind: 'tap', objects: { kind: 'target', id: 't1' } },
      },
    ]);
  });

  test('another player who scries (SYNTHETIC)', () => {
    expect(readAll('Whenever an opponent scries, you gain 1 life.').abilities).toMatchObject([
      { kind: 'triggered', trigger: { kind: 'scries', who: 'opponent' } },
    ]);
    expect(readAll('Whenever a player scries, you gain 1 life.').abilities).toMatchObject([
      { kind: 'triggered', trigger: { kind: 'scries', who: 'any' } },
    ]);
  });

  test.each([
    'Whenever you scry 2, you gain 1 life.',
    // Galadriel group 1 reads "you scry or surveil" (two events); a number after it is an instruction's, not an event's.
    'Whenever you scry or surveil 2, you gain 1 life.',
    'Whenever you surveil, tap up to X target nonland permanents, where X is the number of cards looked at while scrying this way.',
    // The number is the event's of a scry: any other trigger has none to read.
    'Whenever ~ attacks, tap up to X target nonland permanents, where X is the number of cards looked at while scrying this way.',
    'Whenever you scry, tap up to X target creatures you control, where X is the number of cards looked at while scrying this way.',
    'Whenever you scry, tap up to X target nonland permanents.',
    'Whenever you scry, tap up to X target nonland permanents, where X is the number of cards in your hand.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text);
  });

  test('without the engine features the line is dropped and says what it needs', () => {
    expect(withoutFeature('trigger:scries', LINE).needs).toContain('trigger:scries');
    expect(withoutFeature('selector:upToTriggerAmount', LINE).needs).toContain(
      'selector:upToTriggerAmount',
    );
  });
});

describe('"for each opponent, tap up to one target creature that player controls" (D-512, CR 115.1)', () => {
  test('the real line of Hammers of Moradin: one slot, at most one target of each opponent', () => {
    expect(
      readAll(
        'Whenever ~ attacks, for each opponent, tap up to one target creature that player controls.',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
            },
            onePerOpponent: true,
          },
        ],
        effect: { kind: 'tap', objects: { kind: 'target', id: 't1' } },
      },
    ]);
  });

  test.each([
    'Whenever ~ attacks, for each opponent, tap target creature that player controls.',
    'Whenever ~ attacks, for each opponent, tap up to two target creatures that player controls.',
    'Whenever ~ attacks, for each opponent, tap up to one target creature.',
    'Whenever ~ attacks, for each player, tap up to one target creature that player controls.',
    'Whenever ~ attacks, for each opponent, untap up to one target creature that player controls.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text);
  });
});

describe('"you may pay {1}. When you do, ..." (D-511, CR 603.12)', () => {
  const SENTRY_LINE =
    'Whenever ~ attacks, you may pay {1}{U}. When you do, tap target creature an opponent controls.';
  const HYLDA_LINE =
    'Whenever you tap an untapped creature an opponent controls, you may pay {1}. When you do, choose one —\n• Create a 4/4 white and blue Elemental creature token.\n• Put a +1/+1 counter on each creature you control.\n• Scry 2, then draw a card.';

  test('the real line of Icewrought Sentry: the payment creates a reflexive ability with its own target', () => {
    expect(readAll(SENTRY_LINE).abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        effect: {
          kind: 'mayPay',
          cost: [{ kind: 'mana', symbols: ['1', 'U'] }],
          effect: {
            kind: 'reflexive',
            afterPayment: true,
            targets: [
              {
                id: 't1',
                what: {
                  kind: 'object',
                  filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
                },
              },
            ],
            effect: { kind: 'tap', objects: { kind: 'target', id: 't1' } },
          },
        },
      },
    ]);
  });

  test('the real line of Hylda: the reflexive ability is modal, three modes, one chosen', () => {
    const [ability, ...more] = readAll(HYLDA_LINE).abilities;
    expect(more).toEqual([]);
    expect(ability).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'becomesTapped', what: OPPONENT_CREATURE, by: 'you' },
      effect: {
        kind: 'mayPay',
        cost: [{ kind: 'mana', symbols: ['1'] }],
        effect: {
          kind: 'reflexive',
          afterPayment: true,
          effect: { kind: 'sequence', effects: [] },
          chooseModes: { min: 1, max: 1 },
        },
      },
    });
    const modes =
      ability?.kind === 'triggered' &&
      ability.effect.kind === 'mayPay' &&
      ability.effect.effect.kind === 'reflexive'
        ? ability.effect.effect.modes
        : undefined;
    expect(modes?.map((m) => m.text)).toEqual([
      'Create a 4/4 white and blue Elemental creature token.',
      'Put a +1/+1 counter on each creature you control.',
      'Scry 2, then draw a card.',
    ]);
  });

  test('a payment of mana and a reflexive ability that draws (SYNTHETIC)', () => {
    expect(
      readAll('Whenever ~ attacks, you may pay {2}. When you do, draw a card.').abilities,
    ).toMatchObject([
      {
        kind: 'triggered',
        effect: {
          kind: 'mayPay',
          cost: [{ kind: 'mana', symbols: ['2'] }],
          effect: { kind: 'reflexive', afterPayment: true, effect: { kind: 'draw' } },
        },
      },
    ]);
  });

  test('the old "If you do" payment is untouched', () => {
    expect(
      readAll('Whenever ~ attacks, you may pay {2}. If you do, draw a card.').abilities,
    ).toMatchObject([{ kind: 'triggered', effect: { kind: 'mayPay', effect: { kind: 'draw' } } }]);
  });

  test.each([
    // A payment with no reflexive ability, a reflexive ability with no payment, and a modal one with fewer than two modes.
    'Whenever ~ attacks, you may pay {2}. When you do,',
    'Whenever ~ attacks, draw a card. When you do, choose one —\n• Draw a card.\n• Scry 2.',
    'Whenever ~ attacks, you may pay {2}. When you do, choose one —\n• Draw a card.',
    'Whenever ~ attacks, you may pay {2}. When you do, you may draw a card.',
    'Whenever ~ attacks, you may pay {2}. When you do, choose one —\n• Draw X cards.\n• Scry 2.',
    'Whenever ~ attacks, you may pay {2}. Draw a card. When you do, choose one —\n• Draw a card.\n• Scry 2.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text);
  });

  test('without the engine features the lines are dropped and say what they need', () => {
    expect(withoutFeature('ability:reflexivePaid', SENTRY_LINE).needs).toContain(
      'ability:reflexivePaid',
    );
    expect(withoutFeature('ability:reflexiveModal', HYLDA_LINE).needs).toContain(
      'ability:reflexiveModal',
    );
  });
});

describe('"gains protection from the card type of your choice" (D-514, CR 702.16a, 608.2d)', () => {
  const LINE =
    '{T}: Another target creature you control gains protection from the card type of your choice until end of turn.';

  test('the real line of Pippin: a protection the controller names as the effect resolves', () => {
    expect(readAll(LINE).abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], controller: 'you', other: true },
            },
          },
        ],
        effect: {
          kind: 'grantKeyword',
          objects: { kind: 'target', id: 't1' },
          keyword: { kind: 'protection', from: 'cardTypeOfChoice' },
          duration: 'untilEndOfTurn',
        },
      },
    ]);
  });

  test('a spell for one creature (SYNTHETIC)', () => {
    expect(
      readAll(
        'Target creature you control gains protection from the card type of your choice until end of turn.',
        'instant',
      ).spell?.effect,
    ).toMatchObject({
      kind: 'grantKeyword',
      keyword: { kind: 'protection', from: 'cardTypeOfChoice' },
    });
  });

  test('the color of your choice is untouched', () => {
    expect(
      readAll(
        'Target creature you control gains protection from the color of your choice until end of turn.',
        'instant',
      ).spell?.effect,
    ).toMatchObject({
      kind: 'grantKeyword',
      keyword: { kind: 'protection', from: 'colorOfChoice' },
    });
  });

  test.each([
    '{T}: Another target creature you control gains protection from the card types of your choice until end of turn.',
    '{T}: Another target creature you control gains protection from a card type of your choice until end of turn.',
    '{T}: Another target creature you control gains protection from the card type of your choice.',
    '{T}: Another target creature you control gains protection from the card type of your choice until your next turn.',
    '{T}: Creatures you control gain protection from the card type of your choice until end of turn.',
  ])('near misses are not read, never half read: %s', (text) => {
    NOT_READ(text);
  });
});

describe('a legendary creature named for a person and a place (D-515)', () => {
  const NAME = 'Sharae of Numbing Depths';
  const TEXT = 'When Sharae enters, tap target creature an opponent controls.';

  test('a creature: the first word is the card ("When Sharae enters")', () => {
    expect(normalizeOracleText(TEXT, { name: NAME, legendary: true, creature: true })).toBe(
      'When ~ enters, tap target creature an opponent controls.',
    );
  });

  test('not a creature, not legendary, or a title that is no name: the words stay as they are', () => {
    expect(normalizeOracleText(TEXT, { name: NAME, legendary: true })).toBe(TEXT);
    expect(normalizeOracleText(TEXT, { name: NAME, legendary: false, creature: true })).toBe(TEXT);
    // "Gideon of the Trials": the planeswalker type "a Gideon planeswalker" is not the card; and "of the" is a place of the plane, not a title that starts with a capital.
    const gideon = 'As long as you control a Gideon planeswalker, ~ is a 4/4.';
    expect(
      normalizeOracleText(gideon.replace('~', 'Gideon of the Trials'), {
        name: 'Gideon of the Trials',
        legendary: true,
        creature: true,
      }),
    ).toContain('Gideon planeswalker');
  });
});
