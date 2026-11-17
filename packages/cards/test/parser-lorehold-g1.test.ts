// The Lorehold Spirit deck (issue 86), group 1 (D-563 to D-569, provisional): the lines of Claim Jumper, Containment Construct, Conspiracy Theorist, Perpetual Timepiece and Wave of
// Reckoning. The real lines are the Oracle text of the acceptance cards of the golden corpus read through the whole pipeline; the other lines are SYNTHETIC siblings and the near
// misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-lorehold-g1.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { readAll as readAllFace, read as readFace } from './parser-p5-helpers';

type Type = Parameters<typeof readFace>[1];

const read = (text: string, type: Type = 'creature') => readFace(text, type);
const readAll = (text: string, type: Type = 'creature') => readAllFace(text, type);

const NOT_READ = (text: string, type: Type = 'creature') => {
  const parsed = read(text, type);
  expect(parsed.abilities, text).toEqual([]);
  expect(parsed.spell, text).toBeFalsy();
  expect(parsed.unparsed, text).toHaveLength(1);
};

const YOU = { kind: 'you' } as const;
const DRAW = { kind: 'draw', player: YOU, count: 1 } as const;
const OPPONENT_HAS_MORE_LANDS = {
  kind: 'amountIs',
  amount: { kind: 'opponentsWithMore', stat: 'lands' },
  compare: { cmp: 'atLeast', value: 1 },
} as const;
const SEARCH_PLAINS = {
  kind: 'search',
  player: YOU,
  optional: true,
  filter: { subtypes: ['Plains'] },
  max: 1,
  destinations: [{ zone: 'battlefield', tapped: true, count: 1 }],
  reveal: false,
  shuffle: false,
} as const;

describe('"you may pay {1} and discard a card. If you do, ..." (D-563, CR 118.3, 701.9, 608.2c)', () => {
  test('the real line of Conspiracy Theorist: the payment is mana and a discard of the engine`s `mayPay`', () => {
    expect(
      readAll('Whenever ~ attacks, you may pay {1} and discard a card. If you do, draw a card.')
        .abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        effect: {
          kind: 'mayPay',
          cost: [
            { kind: 'mana', symbols: ['1'] },
            { kind: 'discard', count: 1 },
          ],
          effect: DRAW,
        },
      },
    ]);
  });

  test('more mana and more cards (SYNTHETIC)', () => {
    expect(
      readAll(
        'Whenever ~ attacks, you may pay {2}{R} and discard two cards. If you do, draw a card.',
      ).abilities,
    ).toMatchObject([
      {
        effect: {
          kind: 'mayPay',
          cost: [
            { kind: 'mana', symbols: ['2', 'R'] },
            { kind: 'discard', count: 2 },
          ],
        },
      },
    ]);
  });

  test('a payment of mana alone is read as it was before', () => {
    expect(
      readAll('Whenever ~ attacks, you may pay {1}. If you do, draw a card.').abilities,
    ).toMatchObject([
      { effect: { kind: 'mayPay', cost: [{ kind: 'mana', symbols: ['1'] }], effect: DRAW } },
    ]);
  });

  test.each([
    // No "If you do" after the offer: nothing says what the payment buys.
    'Whenever ~ attacks, you may pay {1} and discard a card.',
    // A quality of the card, a number it does not say, another cost: the engine discards any cards of the hand.
    'Whenever ~ attacks, you may pay {1} and discard a creature card. If you do, draw a card.',
    'Whenever ~ attacks, you may pay {1} and discard a card at random. If you do, draw a card.',
    'Whenever ~ attacks, you may pay {1}, discard a card. If you do, draw a card.',
    'Whenever ~ attacks, you may pay 2 life and discard a card. If you do, draw a card.',
    'Whenever ~ attacks, you may pay {1} and sacrifice a creature. If you do, draw a card.',
    'Whenever ~ attacks, you may pay {1} and discard a card and draw a card. If you do, draw a card.',
    'Whenever ~ attacks, you may pay {X} and discard a card. If you do, draw a card.',
  ])('not read: %s', (text) => {
    NOT_READ(text);
  });
});

describe('"Whenever you discard one or more nonland cards" (D-564, CR 603.2c, 701.9a)', () => {
  test('a batch trigger of the cards discarded together, of a kind of card', () => {
    expect(
      readAll(
        'Whenever you discard one or more nonland cards, you may exile one of them from your graveyard.',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'discarded', who: 'you', batch: true, filter: { notTypes: ['land'] } },
        effect: { kind: 'exileFromTriggerCards' },
      },
    ]);
  });

  test('cards of any kind, of a creature kind, and of an opponent (SYNTHETIC)', () => {
    expect(readAll('Whenever you discard one or more cards, draw a card.').abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'discarded', who: 'you', batch: true },
        effect: DRAW,
      },
    ]);
    expect(
      readAll('Whenever you discard one or more creature cards, draw a card.').abilities,
    ).toMatchObject([
      { trigger: { kind: 'discarded', who: 'you', batch: true, filter: { types: ['creature'] } } },
    ]);
    expect(
      readAll('Whenever an opponent discards one or more cards, draw a card.').abilities,
    ).toMatchObject([{ trigger: { kind: 'discarded', who: 'opponent', batch: true } }]);
  });

  test('one card is a trigger of its own, as before', () => {
    expect(readAll('Whenever you discard a card, draw a card.').abilities).toEqual([
      { kind: 'triggered', trigger: { kind: 'discarded', who: 'you' }, effect: DRAW },
    ]);
  });

  test.each([
    'Whenever you discard one or more, draw a card.',
    'Whenever you discard one or more card, draw a card.',
    'Whenever you discard two or more cards, draw a card.',
    'Whenever you discard one or more creature or land cards, draw a card.',
    'Whenever you discard one or more Zombie cards, draw a card.',
    'Whenever you discarded one or more cards, draw a card.',
    'Whenever you discard one or more nonlandcards, draw a card.',
  ])('not read: %s', (text) => {
    NOT_READ(text);
  });
});

describe('"you may exile one of them from your graveyard. If you do, you may cast it this turn." (D-565, CR 603.2c, 608.2d, 601.2, 305.1)', () => {
  test('the real line of Conspiracy Theorist: the engine`s `exileFromTriggerCards`, then the permission to cast the card', () => {
    expect(
      readAll(
        'Whenever you discard one or more nonland cards, you may exile one of them from your graveyard. If you do, you may cast it this turn.',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'discarded', who: 'you', batch: true, filter: { notTypes: ['land'] } },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exileFromTriggerCards' },
            {
              kind: 'conditional',
              condition: { kind: 'didPrevious' },
              effect: {
                kind: 'mayPlay',
                objects: { kind: 'moved' },
                lasts: 'endOfTurn',
                castOnly: true,
              },
            },
          ],
        },
      },
    ]);
  });

  test('the same trigger of any cards, with a draw for what was done (SYNTHETIC)', () => {
    expect(
      readAll(
        'Whenever you discard one or more cards, you may exile one of them from your graveyard. If you do, draw a card.',
      ).abilities,
    ).toMatchObject([
      {
        trigger: { kind: 'discarded', who: 'you', batch: true },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exileFromTriggerCards' },
            { kind: 'conditional', condition: { kind: 'didPrevious' }, effect: DRAW },
          ],
        },
      },
    ]);
  });

  test.each([
    // The cards of one discard are not "them": only a trigger about a batch of cards names several.
    'Whenever you discard a card, you may exile one of them from your graveyard.',
    'When ~ enters, you may exile one of them from your graveyard.',
    // The engine's question is the "you may": a mandatory exile is not what it asks.
    'Whenever you discard one or more nonland cards, exile one of them from your graveyard.',
    'Whenever you discard one or more nonland cards, you may exile one of them from a graveyard.',
    'Whenever you discard one or more nonland cards, you may exile two of them from your graveyard.',
    'Whenever you discard one or more nonland cards, you may exile them from your graveyard.',
    'Whenever you discard one or more nonland cards, you may exile one of them from your graveyard and draw a card.',
  ])('not read: %s', (text) => {
    NOT_READ(text);
  });
});

describe('"you may play that card this turn" and "you may cast it this turn" after an exile (D-566, CR 601.2, 305.1, 611.2a)', () => {
  test('the real line of Containment Construct: exile the card discarded, then the permission to play it', () => {
    expect(
      readAll(
        'Whenever you discard a card, you may exile that card from your graveyard. If you do, you may play that card this turn.',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'discarded', who: 'you' },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'may', effect: { kind: 'exile', objects: { kind: 'triggerSubject' } } },
            {
              kind: 'conditional',
              condition: { kind: 'didPrevious' },
              effect: { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
            },
          ],
        },
      },
    ]);
  });

  test('"cast" for the card exiled is a permission to cast only (SYNTHETIC)', () => {
    expect(
      readAll(
        'Whenever you discard a card, you may exile that card from your graveyard. If you do, you may cast that card this turn.',
      ).abilities,
    ).toMatchObject([
      {
        effect: {
          effects: [
            { kind: 'may' },
            { effect: { kind: 'mayPlay', lasts: 'endOfTurn', castOnly: true } },
          ],
        },
      },
    ]);
  });

  test('an exile of a target, then the permission (SYNTHETIC)', () => {
    expect(
      readAll(
        'When ~ enters, exile target card from a graveyard. You may play that card this turn.',
      ).abilities,
    ).toMatchObject([
      {
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exile', objects: { kind: 'target', id: 't1' } },
            { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
          ],
        },
      },
    ]);
  });

  test('the top card of the library is still read as before, and "cast" is cast only', () => {
    expect(
      readAll(
        'When ~ enters, exile the top card of your library. You may play that card this turn.',
      ).abilities,
    ).toMatchObject([
      { effect: { effects: [{ kind: 'exileTop' }, { kind: 'mayPlay', lasts: 'endOfTurn' }] } },
    ]);
    expect(
      readAll(
        'When ~ enters, exile the top card of your library. You may cast that card this turn.',
      ).abilities,
    ).toMatchObject([
      {
        effect: {
          effects: [{ kind: 'exileTop' }, { kind: 'mayPlay', lasts: 'endOfTurn', castOnly: true }],
        },
      },
    ]);
  });

  test.each([
    // No moment: a permission with no end is not the engine's.
    'Whenever you discard a card, you may exile that card from your graveyard. If you do, you may cast that card.',
    // Without an exile before it "that card" has nothing to name.
    'Whenever you discard a card, you may cast that card this turn.',
    'Whenever you discard a card, draw a card. You may play that card this turn.',
    // Another card, not the one exiled.
    'Whenever you discard a card, you may exile that card from your graveyard. If you do, you may cast target card this turn.',
    'Whenever you discard a card, you may exile that card from your graveyard. If you do, you may cast it without paying its mana cost.',
  ])('not read: %s', (text) => {
    NOT_READ(text);
  });
});

describe('"shuffle any number of target cards from your graveyard into your library" (D-567, CR 701.24c, 701.24d, 115.1)', () => {
  const TARGET = {
    id: 't1',
    what: { kind: 'object', filter: { zone: 'graveyard', controller: 'you' } },
    anyNumber: true,
  };

  test('the real line of Perpetual Timepiece: the targets go into the library, which is shuffled', () => {
    expect(
      readAll(
        '{2}, Exile this artifact: Shuffle any number of target cards from your graveyard into your library.',
        'artifact',
      ).abilities,
    ).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['2'] }, { kind: 'exileThis' }],
        targets: [TARGET],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'library' },
            { kind: 'shuffle', player: YOU },
          ],
        },
      },
    ]);
  });

  test('a kind of card, one target and a spell (SYNTHETIC)', () => {
    expect(
      readAll(
        '{1}, {T}: Shuffle any number of target creature cards from your graveyard into your library.',
        'artifact',
      ).abilities,
    ).toMatchObject([
      {
        targets: [
          {
            what: {
              filter: { zone: 'graveyard', controller: 'you', types: ['creature'] },
            },
            anyNumber: true,
          },
        ],
      },
    ]);
    expect(
      readAll('Shuffle target card from your graveyard into your library.', 'sorcery').spell,
    ).toMatchObject({
      targets: [
        { id: 't1', what: { kind: 'object', filter: { zone: 'graveyard', controller: 'you' } } },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'library' },
          { kind: 'shuffle', player: YOU },
        ],
      },
    });
  });

  test.each([
    // Your graveyard only, into your library only.
    '{2}, Exile this artifact: Shuffle any number of target cards from a graveyard into your library.',
    "{2}, Exile this artifact: Shuffle any number of target cards from an opponent's graveyard into your library.",
    '{2}, Exile this artifact: Shuffle any number of target cards from your graveyard on top of your library.',
    '{2}, Exile this artifact: Shuffle any number of target cards from your graveyard into their library.',
    '{2}, Exile this artifact: Shuffle any number of target cards from your graveyard.',
    // Not a target.
    '{2}, Exile this artifact: Shuffle any number of cards from your graveyard into your library.',
    '{2}, Exile this artifact: Shuffle all cards from your graveyard into your library.',
    // More than the shuffle.
    '{2}, Exile this artifact: Shuffle any number of target cards from your graveyard into your library and draw a card.',
    '{2}, Exile this artifact: Shuffle any number of target creatures into your library.',
  ])('not read: %s', (text) => {
    NOT_READ(text, 'artifact');
  });
});

describe('"each creature deals damage to itself equal to its power" (D-568, CR 120.3, 608.2h)', () => {
  test('the real line of Wave of Reckoning: each creature, whoever controls it', () => {
    expect(
      readAll('Each creature deals damage to itself equal to its power.', 'sorcery').spell,
    ).toEqual({
      effect: {
        kind: 'dealDamageToSelf',
        objects: { kind: 'each', filter: { zone: 'battlefield', types: ['creature'] } },
      },
    });
  });

  test('the creatures of one player, other creatures, and another kind of permanent (SYNTHETIC)', () => {
    expect(
      readAll('Each creature you control deals damage to itself equal to its power.', 'sorcery')
        .spell,
    ).toMatchObject({
      effect: {
        kind: 'dealDamageToSelf',
        objects: { kind: 'each', filter: { types: ['creature'], controller: 'you' } },
      },
    });
    expect(
      readAll(
        'Each creature an opponent controls deals damage to itself equal to its power.',
        'sorcery',
      ).spell,
    ).toMatchObject({
      effect: { kind: 'dealDamageToSelf', objects: { filter: { controller: 'opponent' } } },
    });
    expect(
      readAll('Each other creature deals damage to itself equal to its power.', 'sorcery').spell,
    ).toMatchObject({
      effect: { kind: 'dealDamageToSelf', objects: { filter: { other: true } } },
    });
  });

  test.each([
    'Each creature deals damage to itself equal to its toughness.',
    'Each creature deals damage to itself.',
    'Each creature deals 2 damage to itself.',
    'Each creature deals damage to you equal to its power.',
    'Each creature deals damage to each opponent equal to its power.',
    'Each creature deals damage to itself equal to its power and gains flying.',
    'Each creature deals damage to itself equal to its power, then draw a card.',
    'Target creature deals damage to itself equal to its power.',
  ])('not read: %s', (text) => {
    NOT_READ(text, 'sorcery');
  });
});

describe('"you may search ... and put it onto the battlefield tapped. Then if ..., repeat this process once. If you search your library this way, shuffle." (D-569, CR 701.23, 608.2c)', () => {
  const CLAIM_JUMPER =
    'When ~ enters, if an opponent controls more lands than you, you may search your library for a Plains card and put it onto the battlefield tapped. Then if an opponent controls more lands than you, repeat this process once. If you search your library this way, shuffle.';

  test('the real line of Claim Jumper: an offered search, the same search again when there are still more lands, a shuffle if one was made', () => {
    expect(readAll(CLAIM_JUMPER).abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        interveningIf: OPPONENT_HAS_MORE_LANDS,
        effect: {
          kind: 'sequence',
          effects: [
            SEARCH_PLAINS,
            { kind: 'conditional', condition: OPPONENT_HAS_MORE_LANDS, effect: SEARCH_PLAINS },
            {
              kind: 'conditional',
              condition: { kind: 'thisWayAtLeast', what: 'searched', count: 1 },
              effect: { kind: 'shuffle', player: YOU },
            },
          ],
        },
      },
    ]);
  });

  test('a search with a put joined by "and" is the same search as with a comma, with no shuffle of its own (SYNTHETIC)', () => {
    expect(
      readAll(
        'When ~ enters, you may search your library for a basic land card and put it onto the battlefield tapped.',
      ).abilities,
    ).toMatchObject([
      {
        kind: 'triggered',
        optional: true,
        effect: {
          kind: 'search',
          filter: { supertypes: ['basic'], types: ['land'] },
          destinations: [{ zone: 'battlefield', tapped: true, count: 1 }],
          shuffle: false,
        },
      },
    ]);
  });

  test('the process repeats the one instruction before it, with any other instruction (SYNTHETIC)', () => {
    expect(
      readAll(
        'When ~ enters, draw a card. Then if an opponent controls more lands than you, repeat this process once.',
      ).abilities,
    ).toMatchObject([
      {
        effect: {
          kind: 'sequence',
          effects: [
            DRAW,
            { kind: 'conditional', condition: OPPONENT_HAS_MORE_LANDS, effect: DRAW },
          ],
        },
      },
    ]);
  });

  test('with no test the process is done again, once (SYNTHETIC)', () => {
    expect(
      readAll('When ~ enters, draw a card. Repeat this process once.').abilities,
    ).toMatchObject([{ effect: { kind: 'sequence', effects: [DRAW, DRAW] } }]);
  });

  test('a shuffle after a search the text made is read with it (SYNTHETIC)', () => {
    expect(
      readAll(
        'When ~ enters, you may search your library for a Plains card and put it onto the battlefield tapped. Repeat this process once. If you search your library this way, shuffle.',
      ).abilities,
    ).toMatchObject([
      {
        effect: {
          kind: 'sequence',
          effects: [
            SEARCH_PLAINS,
            SEARCH_PLAINS,
            { kind: 'conditional', effect: { kind: 'shuffle' } },
          ],
        },
      },
    ]);
  });

  test.each([
    // The words do not say how far back "this process" goes: only the one instruction before it.
    'When ~ enters, draw a card. You gain 3 life. Then if an opponent controls more lands than you, repeat this process once.',
    // Only "once".
    'When ~ enters, draw a card. Then if an opponent controls more lands than you, repeat this process twice.',
    'When ~ enters, draw a card. Then if an opponent controls more lands than you, repeat this process.',
    // Nothing to repeat.
    'When ~ enters, if an opponent controls more lands than you, repeat this process once.',
    // A search to ask about before "if you search your library this way".
    'When ~ enters, draw a card. If you search your library this way, shuffle.',
    // A choice of targets would be asked again.
    'When ~ enters, tap target creature. Then if an opponent controls more lands than you, repeat this process once.',
    // A "then shuffle" joined to the put is the older form and another sentence.
    'When ~ enters, you may search your library for a Plains card and put it onto the battlefield tapped, then shuffle.',
    'When ~ enters, you may search your library for a Plains card and put them onto the battlefield tapped.',
  ])('not read: %s', (text) => {
    NOT_READ(text);
  });
});
