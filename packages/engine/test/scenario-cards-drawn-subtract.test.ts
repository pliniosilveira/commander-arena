// Three primitives of the Peace Offering deck, group E: the `thisWay` count `cardsDrawn` ("for each card drawn this way", Communal Brewing), the amount `subtract` ("the number of cards
// in defending player's hand minus the number of cards in your hand", Mr. Foxglove) and `spellEntersWithCounters` with an amount (Communal Brewing's "X additional +1/+1 counters").
// Pins: CR 121.1 (Drawing a Card: only a card really drawn counts), CR 608.2c (an instruction reads what an earlier one of the same resolution did), CR 107.1b (a negative result of a
// calculation is 0), CR 614.1c, 608.2h (the counters are read as the ability resolves).
// The cards are SYNTHETIC (defined here).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type Ability, type CardDefinition, validateAbility, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const WELL: CardDefinition = singleFace({
  name: 'SYNTHETIC Wishing Well',
  manaCost: ['U'],
  types: ['sorcery'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText:
    'SYNTHETIC: Each opponent draws two cards. You gain 1 life for each card drawn this way.',
  abilities: [],
  spell: {
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'draw', player: { kind: 'eachOpponent' }, count: 2 },
        {
          kind: 'gainLife',
          player: { kind: 'you' },
          amount: { kind: 'thisWay', what: 'cardsDrawn' },
        },
      ],
    },
  },
});

const GAP: CardDefinition = singleFace({
  name: 'SYNTHETIC Mind the Gap',
  manaCost: ['U'],
  types: ['sorcery'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText:
    "SYNTHETIC: Draw cards equal to the number of cards in target opponent's hand minus the number of cards in your hand.",
  abilities: [],
  spell: {
    targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
    effect: {
      kind: 'draw',
      player: { kind: 'you' },
      count: {
        kind: 'subtract',
        of: [
          { kind: 'countOf', filter: { zone: 'hand', owner: { kind: 'target', id: 't1' } } },
          { kind: 'countOf', filter: { zone: 'hand', controller: 'you' } },
        ],
      },
    },
  },
});

const GROVE: CardDefinition = singleFace({
  name: 'SYNTHETIC Growing Grove',
  manaCost: ['G'],
  types: ['enchantment'],
  colors: ['G'],
  colorIdentity: ['G'],
  oracleText:
    'SYNTHETIC: Whenever you cast a creature spell, that creature enters with X additional +1/+1 counters on it, where X is the number of lore counters on this enchantment.',
  abilities: [
    {
      kind: 'triggered',
      trigger: {
        kind: 'castSpell',
        filter: { types: ['creature'], stackKind: 'spell' },
        by: 'you',
      },
      effect: {
        kind: 'spellEntersWithCounters',
        counter: '+1/+1',
        count: { kind: 'countersOn', of: { kind: 'this' }, counter: 'lore' },
      },
    },
  ],
});

const LIBRARY = Array.from({ length: 10 }, () => 'Island');

describe('CR 121.1, 608.2c: "for each card drawn this way" counts every card drawn', () => {
  test('two opponents drawing two each: four cards, four life (not the two players)', () => {
    const g = scenario({ seats: 3 })
      .define(WELL)
      .seat(0)
      .hand(WELL.name)
      .battlefield('Island')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(WELL.name, { pay: true });
    g.passAll();
    g.expect.life(0, 44);
    g.expect.invariants();
  });

  test('a library with one card draws one: only that card counts', () => {
    const g = scenario()
      .define(WELL)
      .seat(0)
      .hand(WELL.name)
      .battlefield('Island')
      .library(...LIBRARY)
      .seat(1)
      .library('Island')
      .build();
    g.act(0).cast(WELL.name, { pay: true });
    g.passAll();
    g.expect.life(0, 41);
  });

  test('validateCard refuses the count with no draw before it', () => {
    const ability: Ability = {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: {
        kind: 'gainLife',
        player: { kind: 'you' },
        amount: { kind: 'thisWay', what: 'cardsDrawn' },
      },
    };
    expect(validateAbility(ability).length).toBeGreaterThan(0);
  });
});

describe('CR 107.1b: one amount less another, never below 0', () => {
  const cast = (mine: number, theirs: number) => {
    const g = scenario()
      .define(GAP)
      .seat(0)
      .hand(GAP.name)
      .hand('Forest', { count: mine })
      .battlefield('Island')
      .library(...LIBRARY)
      .seat(1)
      .hand('Forest', { count: theirs })
      .library(...LIBRARY)
      .build();
    g.act(0).cast(GAP.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    return g;
  };

  test('the opponent holds four more: four cards', () => {
    cast(1, 5).expect.handSize(0, 5);
  });

  test('the opponent holds fewer: nothing is drawn', () => {
    const g = cast(4, 1);
    g.expect.handSize(0, 4);
    g.expect.noEvent({ kind: 'cardDrawn' });
  });

  test('validateAbility refuses a subtract of one amount', () => {
    const ability = {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: { kind: 'draw', player: { kind: 'you' }, count: { kind: 'subtract', of: [1] } },
    } as unknown as Ability;
    expect(validateAbility(ability).length).toBeGreaterThan(0);
  });
});

describe('CR 614.1c, 608.2h: a creature spell enters with an amount of counters, read as the trigger resolves', () => {
  const board = (lore: number) => {
    const g = scenario()
      .define(GROVE)
      .seat(0)
      .hand('Grizzly Bears')
      .battlefield(GROVE.name, { counters: lore > 0 ? { lore } : {} })
      .battlefield('Forest', 'Forest')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    return g;
  };

  test('three lore counters: the Bears enter with three +1/+1 counters', () => {
    const g = board(3);
    g.expect.counters('Grizzly Bears', { '+1/+1': 3 });
    g.expect.invariants();
  });

  test('no lore counters: the Bears enter with none', () => {
    const g = board(0);
    g.expect.pt('Grizzly Bears', 2, 2);
  });
});

describe("CR 508.5: a count of defending player's hand belongs to an ability of an attacking creature", () => {
  const handOfDefender = {
    kind: 'draw',
    player: { kind: 'you' },
    count: { kind: 'countOf', filter: { zone: 'hand', owner: { kind: 'defendingPlayer' } } },
  } as const;
  const withAbility = (ability: Ability): CardDefinition =>
    singleFace({
      name: 'SYNTHETIC Hand Reader',
      manaCost: ['U'],
      types: ['creature'],
      colors: ['U'],
      colorIdentity: ['U'],
      power: 1,
      toughness: 1,
      oracleText: "SYNTHETIC: draw cards equal to the number of cards in defending player's hand.",
      abilities: [ability],
    });

  test('an attacks trigger may count it', () => {
    const card = withAbility({
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      effect: handOfDefender,
    } as Ability);
    expect(validateCard(card)).toEqual([]);
  });

  test('an upkeep trigger may not: no defending player exists then', () => {
    const card = withAbility({
      kind: 'triggered',
      trigger: { kind: 'step', step: 'upkeep', whose: 'you' },
      effect: handOfDefender,
    } as Ability);
    expect(validateCard(card).length).toBeGreaterThan(0);
  });

  test('a spell may not', () => {
    const card: CardDefinition = singleFace({
      name: 'SYNTHETIC Hand Reading',
      manaCost: ['U'],
      types: ['sorcery'],
      colors: ['U'],
      colorIdentity: ['U'],
      oracleText: "SYNTHETIC: draw cards equal to the number of cards in defending player's hand.",
      abilities: [],
      spell: { effect: handOfDefender },
    });
    expect(validateCard(card).length).toBeGreaterThan(0);
  });
});
