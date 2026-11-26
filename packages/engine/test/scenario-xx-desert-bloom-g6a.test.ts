// Desert Bloom group 6a: "choose an opponent. That player returns a card from their graveyard to their hand" (Skullwinder, CR 608.2d, 400.3, 102.2),
// "create that many ... tokens" after "return up to three target land cards ... to the battlefield" (Vengeful Regrowth, CR 608.2c) and "for each mana from a Desert spent to cast
// this spell" (Cataclysmic Prospecting, CR 601.2h, 205.3i: the mana a land of that type made). The cards are SYNTHETIC, with the AST the grammar lowers the real wording to.
import { describe, expect, test } from 'vitest';
import { type CardDefinition, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const SNAKE = 'SYNTHETIC Returning Snake';
const REGROWTH = 'SYNTHETIC Land Regrowth';
const PROSPECT = 'SYNTHETIC Desert Prospecting';
const DESERT = 'SYNTHETIC Mana Desert';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const ANGEL = 'Serra Angel';
const FILLER = ['Island', 'Island', 'Island', 'Island', 'Island', 'Island'] as const;

const returnOne = {
  kind: 'moveToZone',
  objects: { kind: 'choose', filter: { zone: 'graveyard', controller: 'you' }, count: 1 },
  to: 'hand',
} as const;

const snake: CardDefinition = singleFaceCard({
  name: SNAKE,
  manaCost: ['2', 'G'],
  types: ['creature'],
  subtypes: ['Snake'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 1,
  toughness: 3,
  oracleText:
    'When this creature enters, return target card from your graveyard to your hand, then choose an opponent. That player returns a card from their graveyard to their hand.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      targets: [
        { id: 't1', what: { kind: 'object', filter: { zone: 'graveyard', controller: 'you' } } },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'hand' },
          { kind: 'choosePlayer', among: 'opponent' },
          {
            kind: 'forEachPlayer',
            players: { kind: 'chosenPlayer' },
            runsAs: 'each',
            effect: returnOne,
          },
        ],
      },
    },
  ],
});

const regrowth: CardDefinition = singleFaceCard({
  name: REGROWTH,
  manaCost: ['G'],
  types: ['sorcery'],
  colors: ['G'],
  colorIdentity: ['G'],
  oracleText:
    'Return up to three target land cards from your graveyard to the battlefield tapped. Create that many 4/2 green Plant Warrior creature tokens with reach.',
  spell: {
    targets: [
      {
        id: 't1',
        what: { kind: 'object', filter: { zone: 'graveyard', types: ['land'], controller: 'you' } },
        min: 0,
        max: 3,
      },
    ],
    effect: {
      kind: 'sequence',
      effects: [
        {
          kind: 'moveToZone',
          objects: { kind: 'target', id: 't1' },
          to: 'battlefield',
          controller: 'you',
          tapped: true,
        },
        {
          kind: 'createToken',
          token: {
            kind: 'custom',
            definition: {
              name: 'Plant Warrior',
              manaCost: null,
              supertypes: [],
              types: ['creature'],
              subtypes: ['Plant', 'Warrior'],
              colors: ['G'],
              power: 4,
              toughness: 2,
              loyalty: null,
              defense: null,
              oracleText: '',
              abilities: [{ kind: 'keyword', keyword: { kind: 'reach' } }],
            },
          },
          count: { kind: 'movedCount' },
        },
      ],
    },
  },
});

const prospecting: CardDefinition = singleFaceCard({
  name: PROSPECT,
  manaCost: ['X', 'R'],
  types: ['sorcery'],
  colors: ['R'],
  colorIdentity: ['R'],
  oracleText:
    '~ deals X damage to each creature. For each mana from a Desert spent to cast this spell, create a tapped Treasure token.',
  spell: {
    x: true,
    effect: {
      kind: 'sequence',
      effects: [
        {
          kind: 'dealDamage',
          amount: { kind: 'x' },
          to: { kind: 'each', filter: { zone: 'battlefield', types: ['creature'] } },
        },
        {
          kind: 'createToken',
          token: { kind: 'preset', preset: 'Treasure' },
          count: { kind: 'manaSpent', fromType: 'Desert' },
          tapped: true,
        },
      ],
    },
  },
});

const desert: CardDefinition = singleFaceCard({
  name: DESERT,
  manaCost: null,
  types: ['land'],
  subtypes: ['Desert'],
  colors: [],
  colorIdentity: [],
  oracleText: '{T}: Add {R}.',
  abilities: [
    { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['R'] } },
  ],
});

describe('the cards are valid', () => {
  test.each([snake, regrowth, prospecting, desert])('$faces.0.name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
  test('a mana source of a land type is valid, one of a creature type is not', () => {
    const bad = (type: string): CardDefinition => {
      const c = prospecting;
      const spell = c.faces[0]?.spell;
      if (spell === null || spell === undefined) throw new Error('no spell');
      return {
        ...c,
        faces: [
          {
            ...c.faces[0],
            spell: {
              ...spell,
              effect: {
                kind: 'createToken',
                token: { kind: 'preset', preset: 'Treasure' },
                count: { kind: 'manaSpent', fromType: type },
              },
            },
          },
        ],
      } as CardDefinition;
    };
    expect(validateCard(bad('Desert'))).toEqual([]);
    expect(JSON.stringify(validateCard(bad('Elf')))).toMatch(
      /fromType is a card type or a land type/,
    );
  });
});

const count = (g: ScenarioGame, name: string, seat: number, zone = 'battlefield') =>
  g.find({ name, zone: zone as 'battlefield', seat }).length;

describe('Skullwinder: "then choose an opponent. That player returns a card from their graveyard to their hand"', () => {
  const build = (seats: 2 | 3 | 4) => {
    const b = scenario({ seats })
      .define(snake)
      .seat(0)
      .hand(SNAKE)
      .graveyard(BEARS)
      .battlefield('Forest', 'Forest', 'Forest')
      .library(...FILLER)
      .seat(1)
      .graveyard(SPIDER)
      .library(...FILLER);
    if (seats >= 3)
      b.seat(2)
        .graveyard(ANGEL, BEARS)
        .library(...FILLER);
    if (seats >= 4)
      b.seat(3)
        .graveyard(SPIDER)
        .library(...FILLER);
    return b.at('precombatMain', { active: 0, turn: 1 }).build();
  };

  test('with one opponent nothing is asked of the controller: the opponent returns their card', () => {
    const g = build(2);
    g.act(0).cast(SNAKE, { pay: true });
    g.passAll();
    // The opponent has one card in their graveyard: it is returned without a question.
    expect(count(g, BEARS, 0, 'hand')).toBe(1);
    expect(count(g, SPIDER, 1, 'hand')).toBe(1);
    g.expect.invariants();
  });

  test('with three opponents the controller chooses one; only that player returns a card (CR 102.2)', () => {
    const g = build(4);
    g.act(0).cast(SNAKE, { pay: true });
    g.passAll();
    const q = g.state.pending;
    if (q?.kind !== 'chooseOption') throw new Error(`expected a choice, got ${q?.kind}`);
    expect(q.seat).toBe(0);
    expect(q.options).toEqual(['seat:1', 'seat:2', 'seat:3']);
    g.act(0).chooseOption('seat:2');
    // Seat 2 has two cards in their graveyard: they choose which one comes back.
    const pick = g.state.pending;
    if (pick?.kind !== 'chooseCards') throw new Error(`expected a card choice, got ${pick?.kind}`);
    expect(pick.seat).toBe(2);
    g.act(2).chooseCards(ANGEL);
    expect(count(g, ANGEL, 2, 'hand')).toBe(1);
    expect(count(g, BEARS, 2, 'hand')).toBe(0);
    expect(count(g, BEARS, 2, 'graveyard')).toBe(1);
    // The other opponents keep their cards in the graveyard.
    expect(count(g, SPIDER, 1, 'hand')).toBe(0);
    expect(count(g, SPIDER, 3, 'hand')).toBe(0);
    expect(count(g, BEARS, 0, 'hand')).toBe(1);
    g.expect.invariants();
  });

  test('an opponent with an empty graveyard returns nothing', () => {
    const g = scenario({ seats: 3 })
      .define(snake)
      .seat(0)
      .hand(SNAKE)
      .graveyard(BEARS)
      .battlefield('Forest', 'Forest', 'Forest')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .graveyard(SPIDER)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(SNAKE, { pay: true });
    g.passAll();
    g.act(0).chooseOption('seat:1');
    expect(g.state.pending?.kind).toBe('priority');
    expect(
      Object.values(g.state.objects).filter((o) => o.zone === 'hand' && o.owner === 1).length,
    ).toBe(0);
    expect(count(g, SPIDER, 2, 'graveyard')).toBe(1);
  });
});

describe('Vengeful Regrowth: "create that many tokens" counts the cards returned (CR 608.2c)', () => {
  const build = (graveyardLands: number, targets: number) => {
    const lands = Array.from({ length: graveyardLands }, () => 'Forest');
    const g = scenario()
      .define(regrowth)
      .seat(0)
      .hand(REGROWTH)
      .graveyard(...lands)
      .battlefield('Forest')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    return { g, targets };
  };

  test('three lands returned tapped, three 4/2 Plant Warriors with reach', () => {
    const { g } = build(3, 3);
    g.act(0).cast(REGROWTH, {
      targets: [
        { name: 'Forest', zone: 'graveyard', nth: 0 },
        { name: 'Forest', zone: 'graveyard', nth: 1 },
        { name: 'Forest', zone: 'graveyard', nth: 2 },
      ],
      pay: true,
    });
    g.passAll();
    expect(count(g, 'Forest', 0)).toBe(4);
    const plants = g.find({ name: 'Plant Warrior', zone: 'battlefield', seat: 0 });
    expect(plants.length).toBe(3);
    expect(plants[0]?.token?.characteristics).toMatchObject({ power: 4, toughness: 2 });
    g.expect.invariants();
  });

  test('two lands chosen, two tokens: the count is the cards returned, not three', () => {
    const { g } = build(3, 2);
    g.act(0).cast(REGROWTH, {
      targets: [
        { name: 'Forest', zone: 'graveyard', nth: 0 },
        { name: 'Forest', zone: 'graveyard', nth: 1 },
      ],
      pay: true,
    });
    g.passAll();
    expect(g.find({ name: 'Plant Warrior', zone: 'battlefield', seat: 0 }).length).toBe(2);
  });

  test('no target, no token', () => {
    const { g } = build(1, 0);
    g.act(0).cast(REGROWTH, { targets: [], pay: true });
    g.passAll();
    expect(g.find({ name: 'Plant Warrior', zone: 'battlefield', seat: 0 }).length).toBe(0);
  });
});

describe('Cataclysmic Prospecting: "for each mana from a Desert spent to cast this spell, create a tapped Treasure token"', () => {
  const build = (deserts: number, forests: number) => {
    const b = scenario()
      .define(prospecting)
      .define(desert)
      .seat(0)
      .hand(PROSPECT)
      .battlefield(...Array.from({ length: deserts }, () => DESERT))
      .battlefield(...Array.from({ length: forests }, () => 'Mountain'))
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS)
      .library(...FILLER);
    return b.at('precombatMain', { active: 0, turn: 1 }).build();
  };

  test('X = 2 paid with three Deserts: three tapped Treasures, and the damage is dealt', () => {
    const g = build(3, 0);
    g.act(0).cast(PROSPECT, { x: 2, pay: true });
    g.passAll();
    const treasures = g.find({ name: 'Treasure', zone: 'battlefield', seat: 0 });
    expect(treasures.length).toBe(3);
    expect(treasures.every((t) => t.tapped)).toBe(true);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('only the mana the Deserts made counts: one Desert and two Mountains make one Treasure', () => {
    const g = build(1, 2);
    g.act(0).cast(PROSPECT, { x: 2, pay: true });
    g.passAll();
    expect(g.find({ name: 'Treasure', zone: 'battlefield', seat: 0 }).length).toBe(1);
  });

  test('no Desert, no Treasure', () => {
    const g = build(0, 3);
    g.act(0).cast(PROSPECT, { x: 2, pay: true });
    g.passAll();
    expect(g.find({ name: 'Treasure', zone: 'battlefield', seat: 0 }).length).toBe(0);
  });
});
