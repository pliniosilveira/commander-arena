// Ahoy Mateys deck, group 10: stack and cost effects.
// The CR text was not available in this worktree (`docs/rules/comprehensive-rules.txt` is not there): the rule numbers are only those the engine's own comments cite.
// Pins: CR 601.2f and 602.2b (the cost of an activated ability is worked out as it is activated: "this ability costs {2} less to activate if ..." takes generic mana off the equip
// cost when the condition holds), CR 702.6a (Equip), CR 702.51a (Convoke: the creatures tapped to cast the spell are remembered, and "each creature that convoked this spell" is those
// creatures), CR 701.50a (Connive), CR 400.7 (a creature that left is a new object and is skipped), CR 115.1 and 601.2c ("a spell or ability that targets you or a creature you
// control": the chosen targets of a spell or ability on the stack), CR 701.6a (Counter), CR 701.20a (Reveal), CR 608.2c (an effect that counts what was revealed this way).
// Cards are SYNTHETIC: built here from the parts of the real cards.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type Ability, getLegalActions, getView } from '../src/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision, choosePermanentDecision } from './pending-helpers';

const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';

// ---------------------------------------------------------------- equip, cheaper with few cards in hand
const ANCHOR = 'SYNTHETIC Anchor';
const anchor = singleFace({
  name: ANCHOR,
  manaCost: ['3'],
  types: ['artifact'],
  subtypes: ['Equipment'],
  colors: [],
  colorIdentity: [],
  oracleText:
    'Equip {2}. This ability costs {2} less to activate if you have one or fewer cards in hand.',
  abilities: [
    {
      kind: 'keyword',
      keyword: {
        kind: 'equip',
        cost: [{ kind: 'mana', symbols: ['2'] }],
        costReducedIf: {
          generic: 2,
          condition: {
            kind: 'amountIs',
            amount: { kind: 'countOf', filter: { zone: 'hand', controller: 'you' } },
            compare: { cmp: 'atMost', value: 1 },
          },
        },
      },
    },
  ],
});

describe('equip that costs less with one or fewer cards in hand (CR 601.2f, 602.2b, 702.6a)', () => {
  const equips = (g: ReturnType<typeof anchorGame>) =>
    getLegalActions(g.state, 0).filter((a) => a.kind === 'activate');

  function anchorGame(hand: readonly string[]) {
    return scenario()
      .define(anchor)
      .seat(0)
      .hand(...hand)
      .battlefield(ANCHOR, BEARS)
      .seat(1)
      .build();
  }

  test('with one card in hand the equip ability needs no mana', () => {
    const g = anchorGame([BEARS]);
    expect(equips(g).length).toBeGreaterThan(0);
    g.act(0).activate(ANCHOR, { targets: [{ name: BEARS, zone: 'battlefield' }] });
    g.passAll();
    g.expect.attached(ANCHOR, { name: BEARS, zone: 'battlefield' });
    g.expect.invariants();
  });

  test('with no card in hand it is free too', () => {
    const g = anchorGame([]);
    g.act(0).activate(ANCHOR, { targets: [{ name: BEARS, zone: 'battlefield' }] });
    g.passAll();
    g.expect.attached(ANCHOR, { name: BEARS, zone: 'battlefield' });
  });

  test('with two cards in hand it costs {2}: with no mana it cannot be activated', () => {
    const g = anchorGame([BEARS, BEARS]);
    expect(equips(g)).toEqual([]);
  });

  test('with two cards in hand and two lands it is paid with mana', () => {
    const g = scenario()
      .define(anchor)
      .seat(0)
      .hand(BEARS, BEARS)
      .battlefield(ANCHOR, BEARS, 'Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).activate(ANCHOR, { targets: [{ name: BEARS, zone: 'battlefield' }], pay: true });
    g.passAll();
    g.expect.attached(ANCHOR, { name: BEARS, zone: 'battlefield' });
    g.expect.tapped({ name: 'Forest', nth: 0 });
    g.expect.tapped({ name: 'Forest', nth: 1 });
  });
});

// ---------------------------------------------------------------- convoke, "each creature that convoked this spell connives"
const SCHEME = 'SYNTHETIC Scheme';
const scheme = singleFace({
  name: SCHEME,
  manaCost: ['2', 'B', 'B'],
  types: ['instant'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText:
    'Convoke\nDestroy target creature or planeswalker. Each creature that convoked this spell connives.',
  abilities: [{ kind: 'keyword', keyword: { kind: 'convoke' } }],
  spell: {
    targets: [
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: { anyOf: [{ types: ['creature'] }, { types: ['planeswalker'] }] },
        },
      },
    ],
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
        { kind: 'connive', objects: { kind: 'convokers' } },
      ],
    },
  },
});

describe('each creature that convoked this spell connives (CR 702.51a, 701.50a)', () => {
  const counters = (g: ReturnType<typeof schemeGame>, name: string) =>
    getView(g.state, 0).battlefield.find((o) => o.name === name && o.controller === 0)?.counters;

  function schemeGame() {
    return scenario()
      .define(scheme)
      .seat(0)
      .hand(SCHEME, BEARS)
      .battlefield('Swamp', 'Swamp', 'Swamp', BEARS, SPIDER)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .battlefield('Wall of Stone')
      .build();
  }

  const convokeWith = (g: ReturnType<typeof schemeGame>, names: readonly string[]) => {
    g.act(0).cast(SCHEME, { targets: ['Wall of Stone'] });
    g.act(0).choose({
      kind: 'choosePayOptions',
      objects: names.map((n) => g.id({ name: n, zone: 'battlefield', seat: 0 })),
    });
    g.act(0).payAuto();
  };

  test('the two creatures tapped for convoke connive, one after the other, and the lands do not', () => {
    const g = schemeGame();
    convokeWith(g, [BEARS, SPIDER]);
    g.passAll();
    g.expect.zone('Wall of Stone', 'graveyard', { seat: 1 });
    const order = choosePermanentDecision(g);
    expect(order).toMatchObject({ purpose: 'conniveOrder', seat: 0 });
    expect(order.legal).toHaveLength(2);
    g.act(0).choosePermanents({ name: SPIDER, seat: 0 });
    // The Spider draws and discards a nonland card: it gets the counter.
    g.act(0).chooseCards({ name: BEARS, zone: 'hand', nth: 0 });
    expect(counters(g, SPIDER)).toEqual({ '+1/+1': 1 });
    // The Bears is the only one left: it draws and discards a land: no counter.
    expect(chooseCardsDecision(g)).toMatchObject({ purpose: 'discard', seat: 0 });
    g.act(0).chooseCards({ name: 'Plains', zone: 'hand', nth: 0 });
    expect(counters(g, BEARS)).toEqual({});
    g.expect.invariants();
  });

  test('a creature that did not convoke does not connive', () => {
    const g = schemeGame();
    convokeWith(g, [BEARS]);
    g.passAll();
    // Only the Bears convoked: it connives without a question of order.
    expect(chooseCardsDecision(g)).toMatchObject({ purpose: 'discard', seat: 0 });
    g.act(0).chooseCards({ name: BEARS, zone: 'hand', nth: 0 });
    expect(counters(g, BEARS)).toEqual({ '+1/+1': 1 });
    expect(counters(g, SPIDER)).toEqual({});
  });

  test('a spell cast with mana alone convokes nothing: nobody connives', () => {
    const g = scenario()
      .define(scheme)
      .seat(0)
      .hand(SCHEME)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', BEARS)
      .library('Plains', 'Plains')
      .seat(1)
      .battlefield('Wall of Stone')
      .build();
    g.act(0).cast(SCHEME, { targets: ['Wall of Stone'] });
    g.act(0).choose({ kind: 'choosePayOptions', objects: [] });
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone('Wall of Stone', 'graveyard', { seat: 1 });
    expect(g.state.pending?.kind).toBe('priority');
    expect(counters(g, BEARS)).toEqual({});
  });
});

// ---------------------------------------------------------------- "counter target spell or ability that targets you or a creature you control"
const TAMER = 'SYNTHETIC Tamer';
const AIMED = {
  zone: 'stack',
  anyOf: [{ targetsPlayer: 'you' }, { targetsObject: { types: ['creature'], controller: 'you' } }],
} as const;
const tamer = singleFace({
  name: TAMER,
  manaCost: ['U'],
  types: ['creature'],
  colors: ['U'],
  colorIdentity: ['U'],
  power: 1,
  toughness: 1,
  oracleText:
    '{U}, Sacrifice this creature: Counter target spell or ability that targets you or a creature you control.',
  abilities: [
    {
      kind: 'activated',
      cost: [
        { kind: 'mana', symbols: ['U'] },
        { kind: 'sacrifice', what: { kind: 'this' } },
      ],
      targets: [{ id: 't1', what: { kind: 'object', filter: AIMED } }],
      effect: { kind: 'counter', objects: { kind: 'target', id: 't1' } },
    } as Ability,
  ],
});
const FLAME = 'Lightning Bolt';

describe('a spell or ability that targets you or a creature you control (CR 115.1, 601.2c)', () => {
  function tamerGame() {
    return scenario()
      .define(tamer)
      .seat(0)
      .battlefield(TAMER, BEARS, 'Island')
      .seat(1)
      .hand(FLAME)
      .battlefield('Mountain', 'Wall of Stone')
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
  }
  const offered = (g: ReturnType<typeof tamerGame>) => {
    g.act(1).pass();
    return getLegalActions(g.state, 0).some((a) => a.kind === 'activate');
  };

  test('a spell aimed at you is countered', () => {
    const g = tamerGame();
    g.act(1).cast(FLAME, { targets: [{ player: 0 }], pay: true });
    expect(offered(g)).toBe(true);
    g.act(0).activate(TAMER, { targets: [FLAME], pay: true });
    g.passAll();
    g.expect.zone(FLAME, 'graveyard', { seat: 1 });
    g.expect.zone(TAMER, 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.life).toBe(40);
    g.expect.invariants();
  });

  test('a spell aimed at a creature you control is countered', () => {
    const g = tamerGame();
    g.act(1).cast(FLAME, { targets: [{ name: BEARS, zone: 'battlefield' }], pay: true });
    expect(offered(g)).toBe(true);
    g.act(0).activate(TAMER, { targets: [FLAME], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.noEvent({ kind: 'damaged' });
  });

  test('a spell aimed at the opponent is not a legal target', () => {
    const g = tamerGame();
    g.act(1).cast(FLAME, { targets: [{ player: 1 }], pay: true });
    expect(offered(g)).toBe(false);
  });

  test('a spell aimed at a creature of the opponent is not a legal target', () => {
    const g = tamerGame();
    g.act(1).cast(FLAME, { targets: ['Wall of Stone'], pay: true });
    expect(offered(g)).toBe(false);
  });
});

// ---------------------------------------------------------------- reveal, count the nonland cards for you, then everyone draws
const PARLEY = 'SYNTHETIC Parley';
const parley = singleFace({
  name: PARLEY,
  manaCost: ['1', 'U'],
  types: ['sorcery'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText:
    'Each player reveals the top card of their library. For each nonland card revealed this way, you create a Map token. Then each player draws a card.',
  spell: {
    effect: {
      kind: 'sequence',
      effects: [
        {
          kind: 'revealTopBranches',
          player: { kind: 'eachPlayer' },
          branches: [
            {
              ifMatches: { notTypes: ['land'] },
              onMatch: {
                kind: 'createToken',
                token: { kind: 'preset', preset: 'Map' },
                count: 1,
              },
              asController: true,
            },
          ],
        },
        { kind: 'draw', player: { kind: 'eachPlayer' }, count: 1 },
      ],
    },
  },
});

describe('each player reveals, you create a Map for each nonland card, then each player draws (CR 701.20a, 608.2c)', () => {
  const maps = (g: ReturnType<typeof parleyGame>, seat: 0 | 1) =>
    g.state.battlefield.filter((id) => {
      const o = g.state.objects[id];
      return (
        o !== undefined &&
        o.controller === seat &&
        g.view(0).battlefield.some((v) => v.id === id && v.name === 'Map')
      );
    }).length;

  function parleyGame(mine: string, theirs: string) {
    return scenario()
      .define(parley)
      .seat(0)
      .hand(PARLEY)
      .battlefield('Island', 'Island')
      .library(mine, 'Plains')
      .seat(1)
      .library(theirs, 'Plains')
      .build();
  }

  test('two nonland cards make two Maps for the caster, none for the other player', () => {
    const g = parleyGame(BEARS, SPIDER);
    g.act(0).cast(PARLEY, { pay: true });
    g.passAll();
    expect(maps(g, 0)).toBe(2);
    expect(maps(g, 1)).toBe(0);
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.zone(SPIDER, 'hand', { seat: 1 });
    g.expect.invariants();
  });

  test('a land card makes no Map', () => {
    const g = parleyGame('Forest', SPIDER);
    g.act(0).cast(PARLEY, { pay: true });
    g.passAll();
    expect(maps(g, 0)).toBe(1);
    g.expect.zone('Forest', 'hand', { seat: 0 });
  });

  test('two lands make none', () => {
    const g = parleyGame('Forest', 'Forest');
    g.act(0).cast(PARLEY, { pay: true });
    g.passAll();
    expect(maps(g, 0)).toBe(0);
  });
});

void chooseCardsDecision;
void choosePermanentDecision;
