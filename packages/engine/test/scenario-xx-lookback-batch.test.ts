// Last-known information of permanents that leave together (D-981): a "dies" trigger that a permanent GAVE its neighbour (layer 6
// `grantAbility`) must fire for every creature that dies in the same event, whichever of them the engine happens to move first.
// Pins: CR 603.10a (leaves-the-battlefield abilities look back in time: the example is two permanents put into graveyards at the same
// time, each seeing the other), CR 113.7a (last-known information is how the object was just before it left), CR 704.3 (the creatures
// put into graveyards by one state-based-action check die together), CR 701.8 and 701.21 (destroy and sacrifice of several permanents
// are one event), CR 701.19a (a regeneration shield replaces the destruction: the creature stays).
// Cards are SYNTHETIC and defined here: a Lord that gives the dies trigger "you gain 1 life" to creatures you control.
import { describe, expect, test } from 'vitest';
import type { CardDefinition } from '../src/cards/definition';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type ScenarioGame, scenario } from '../src/testing/index';

const YOU = { kind: 'you' } as const;
const GRANT = {
  kind: 'triggered',
  trigger: { kind: 'dies', what: { kind: 'this' } },
  effect: { kind: 'gainLife', player: YOU, amount: 1 },
} as const;

/** SYNTHETIC Lord: "Creatures you control (other creatures you control, when `other`) have 'When this creature dies, you gain 1 life.'" */
const lord = (name: string, other: boolean): CardDefinition =>
  singleFace({
    name,
    manaCost: ['1'],
    types: ['creature'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText:
      'SYNTHETIC lord: creatures you control have "When this creature dies, you gain 1 life."',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'grantAbility',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'you' },
            ...(other ? { other: true } : {}),
          },
          ability: GRANT as never,
        },
      },
    ],
  });
const vanilla = (name: string): CardDefinition =>
  singleFace({
    name,
    manaCost: ['1'],
    types: ['creature'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: 'SYNTHETIC vanilla creature',
  });
const wrath = singleFace({
  name: 'SYNTHETIC Batch Wrath',
  manaCost: ['1'],
  types: ['sorcery'],
  colors: [],
  colorIdentity: [],
  oracleText: 'SYNTHETIC: destroy all creatures.',
  spell: {
    effect: { kind: 'destroy', objects: { kind: 'each', filter: { types: ['creature'] } } },
  },
});
const sweep = singleFace({
  name: 'SYNTHETIC Batch Sweep',
  manaCost: ['1'],
  types: ['sorcery'],
  colors: [],
  colorIdentity: [],
  oracleText: 'SYNTHETIC: each player sacrifices all creatures they control.',
  spell: {
    effect: { kind: 'sacrifice', objects: { kind: 'each', filter: { types: ['creature'] } } },
  },
});
const banish = singleFace({
  name: 'SYNTHETIC Batch Banish',
  manaCost: ['1'],
  types: ['sorcery'],
  colors: [],
  colorIdentity: [],
  oracleText: 'SYNTHETIC: exile all creatures.',
  spell: { effect: { kind: 'exile', objects: { kind: 'each', filter: { types: ['creature'] } } } },
});

const LORD = 'SYNTHETIC Lord';
const LORD_OTHERS = 'SYNTHETIC Other Lord';
const BEAR = 'SYNTHETIC Bear';

/** Two creatures of seat 0, both with lethal damage; `lordOlder` says which was put onto the battlefield first (moved first). */
function damaged(lordCard: string, lordOlder: boolean, killLord = true, killBear = true) {
  let b = scenario()
    .define(lord(LORD, false))
    .define(lord(LORD_OTHERS, true))
    .define(vanilla(BEAR))
    .seat(0)
    .life(10);
  const lordOpts = { label: 'lord', ...(killLord ? { damage: 2 } : {}) };
  const bearOpts = { label: 'bear', ...(killBear ? { damage: 2 } : {}) };
  b = lordOlder
    ? b.battlefield(lordCard, lordOpts).battlefield(BEAR, bearOpts)
    : b.battlefield(BEAR, bearOpts).battlefield(lordCard, lordOpts);
  const g = b.seat(1).at('precombatMain').build();
  g.act(0).pass(); // the next player would get priority: state-based actions run and the triggers are collected
  return { g, state: g.state };
}

/** The two dies triggers are ordered by their controller and resolve: both gain life. */
function resolveBoth(g: ScenarioGame): void {
  g.passAll();
  if (g.state.pending?.kind === 'orderTriggers') g.act(0).orderTriggers(0, 1);
  g.passAll();
}

const waiting = (s: { stack: readonly unknown[]; pendingTriggers: readonly unknown[] }) =>
  s.stack.length + s.pendingTriggers.length;

describe('state-based actions: creatures that die together all see the grant (CR 603.10a, 704.3)', () => {
  for (const lordOlder of [true, false]) {
    test(`the Lord gives it to the others only: the Bear's trigger fires (Lord older: ${lordOlder})`, () => {
      const { state } = damaged(LORD_OTHERS, lordOlder);
      // The Lord itself has no grant (it says "other"), the Bear has: one trigger.
      expect(waiting(state)).toBe(1);
    });
    test(`the Lord gives it to every creature, itself included: both triggers fire (Lord older: ${lordOlder})`, () => {
      const { state } = damaged(LORD, lordOlder);
      expect(waiting(state)).toBe(2);
    });
  }

  test('only the Bear dies while the Lord stays: the Bear has the grant (one trigger)', () => {
    const { state } = damaged(LORD_OTHERS, true, false, true);
    expect(waiting(state)).toBe(1);
  });

  test('only the Lord dies, with the grant to itself: one trigger', () => {
    const { state } = damaged(LORD, true, true, false);
    expect(waiting(state)).toBe(1);
  });
});

describe('destroy all, sacrifice all, exile all: one event, each creature sees the grant', () => {
  const setup = (spell: CardDefinition, lordOlder: boolean) => {
    let b = scenario()
      .define(lord(LORD, false))
      .define(vanilla(BEAR))
      .define(spell)
      .seat(0)
      .life(10)
      .hand(spell.faces[0]?.name ?? '')
      .battlefield('Plains');
    b = lordOlder ? b.battlefield(LORD).battlefield(BEAR) : b.battlefield(BEAR).battlefield(LORD);
    return b.seat(1).at('precombatMain').build();
  };
  for (const lordOlder of [true, false]) {
    test(`destroy all: both triggers fire and both resolve (Lord older: ${lordOlder})`, () => {
      const g = setup(wrath, lordOlder);
      g.act(0).cast('SYNTHETIC Batch Wrath', { pay: true });
      resolveBoth(g);
      expect(g.state.seats[0]?.life).toBe(12);
    });
    test(`sacrifice all: both triggers fire and both resolve (Lord older: ${lordOlder})`, () => {
      const g = setup(sweep, lordOlder);
      g.act(0).cast('SYNTHETIC Batch Sweep', { pay: true });
      resolveBoth(g);
      expect(g.state.seats[0]?.life).toBe(12);
    });
  }
  // Exile is not a death: the grant is a "dies" trigger, so nothing triggers; this pins that the batch record does not make it fire.
  test('exile all: nothing dies, nothing triggers', () => {
    const g = setup(banish, true);
    g.act(0).cast('SYNTHETIC Batch Banish', { pay: true });
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(10);
  });
});

describe('a record made for the event is never reused by a later departure', () => {
  const burn = singleFace({
    name: 'SYNTHETIC Batch Burn',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'SYNTHETIC: 2 damage to each creature.',
    spell: {
      effect: {
        kind: 'dealDamage',
        amount: 2,
        to: { kind: 'each', filter: { types: ['creature'] } },
      },
    },
  });
  const charm = singleFace({
    name: 'SYNTHETIC Batch Charm',
    manaCost: ['G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'SYNTHETIC: regenerate target creature.',
    spell: {
      targets: [
        {
          id: 't1',
          min: 1,
          max: 1,
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: {
        kind: 'regenerate',
        objects: { kind: 'target', id: 't1' },
        duration: 'untilEndOfTurn',
      },
    },
  });

  // The Lord and the Bear are dealt lethal damage together; the Bear has a regeneration shield, so it stays (its record, made with the Lord's grant
  // in it, is not used). The Lord's death trigger gives 1 life. Then the Bear is killed alone: the Lord is gone, so the Bear has no grant now.
  test('a regenerated creature that dies later has the abilities it has then, not the ones of the first event', () => {
    const g = scenario()
      .define(lord(LORD, false))
      .define(vanilla(BEAR))
      .define(burn)
      .define(charm)
      .seat(0)
      .life(10)
      .battlefield(LORD)
      .battlefield(BEAR)
      .battlefield('Forest')
      .hand('SYNTHETIC Batch Charm')
      .seat(1)
      .life(10)
      .battlefield('Mountain', { count: 2 })
      .hand('SYNTHETIC Batch Burn', 'SYNTHETIC Batch Burn')
      .at('precombatMain')
      .build();
    g.act(0).cast('SYNTHETIC Batch Charm', { targets: [{ name: BEAR }], pay: true });
    g.passAll();
    g.act(0).pass();
    g.act(1).cast('SYNTHETIC Batch Burn[0]', { pay: true });
    g.passAll();
    if (g.state.pending?.kind === 'orderTriggers') g.act(0).orderTriggers(0);
    g.passAll();
    g.expect.zone(BEAR, 'battlefield', { seat: 0 });
    g.expect.zone(LORD, 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.life).toBe(11); // the Lord's own trigger, nothing else
    // The Bear again, alone: the second burn.
    g.act(0).pass();
    g.act(1).cast('SYNTHETIC Batch Burn', { pay: true });
    g.passAll();
    g.expect.zone(BEAR, 'graveyard', { seat: 0 });
    expect(g.state.pendingTriggers).toEqual([]);
    expect(g.state.stack).toEqual([]);
    expect(g.state.seats[0]?.life).toBe(11); // a stale record would have given 12
  });
});
