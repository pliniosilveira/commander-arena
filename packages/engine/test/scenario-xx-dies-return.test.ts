// "When this creature dies, you may return it to the battlefield under its owner's control at the beginning of your next upkeep" (D-982): a delayed
// triggered ability, created as the dies ability resolves, about the card the creature became in the graveyard.
// Pins: CR 603.7a (a delayed ability created during a step triggers at the next such step: a dies resolving in your own upkeep returns the card at the
// NEXT upkeep), CR 603.7b (once), CR 603.7c (only the object still in the zone it is expected to be in: a card that left the graveyard is a new object),
// CR 603.5 (an optional ability's choice is made as it resolves: declining creates no delayed ability), CR 400.7 and 603.10a (the card is a new object;
// the ability looks back), CR 111.8 (a token that died is gone), CR 903.9a (a commander may go to the command zone: nothing returns), CR 110.2 (under
// its owner's control, or under yours).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-dies-return.ts), and a SYNTHETIC token copier defined here.
import { describe, expect, test } from 'vitest';
import type { Ability, Effect } from '../src/ast/types';
import { singleFace } from '../src/cards/fixtures/helpers';
import { stateHash, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { confirmOptionalDecision } from './pending-helpers';

const CUB = 'SYNTHETIC Ember Cub';
const THIEF = 'SYNTHETIC Grave Thief';
const BOLT = 'Lightning Bolt';
const COPIER = 'SYNTHETIC Cub Copier';
const copier = singleFace({
  name: COPIER,
  manaCost: ['1'],
  types: ['sorcery'],
  colors: [],
  colorIdentity: [],
  oracleText: "SYNTHETIC: create a token that's a copy of target creature you control.",
  spell: {
    targets: [
      {
        id: 't1',
        min: 1,
        max: 1,
        what: {
          kind: 'object',
          filter: { zone: 'battlefield', controller: 'you', types: ['creature'] },
        },
      },
    ],
    effect: {
      kind: 'createToken',
      token: { kind: 'copyOf', object: { kind: 'target', id: 't1' } },
      count: 1,
    },
  },
});
const BANISH = 'SYNTHETIC Grave Banish';
const banish = singleFace({
  name: BANISH,
  manaCost: ['B'],
  types: ['instant'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText: 'SYNTHETIC: exile target card from a graveyard.',
  spell: {
    targets: [
      {
        id: 't1',
        min: 1,
        max: 1,
        what: { kind: 'object', filter: { zone: 'graveyard', types: ['creature'] } },
      },
    ],
    effect: { kind: 'exile', objects: { kind: 'target', id: 't1' } },
  },
});

/** Seat 0 (active, turn 1) has the Cub, a Mountain and Bolts; seat 1 has an Island. */
function game(step: 'precombatMain' | 'upkeep' = 'precombatMain') {
  return scenario()
    .define(copier)
    .define(banish)
    .seat(0)
    .hand(BOLT, BOLT)
    .battlefield(CUB)
    .battlefield('Mountain', { count: 4 })
    .library('Island', 'Island', 'Island', 'Island')
    .seat(1)
    .battlefield('Island')
    .library('Island', 'Island', 'Island', 'Island')
    .at(step, { active: 0, turn: 1 })
    .build();
}

/** Bolts the Cub of seat 0 and resolves the Bolt; the dies ability is then on the stack. */
function killCub(g: ScenarioGame, bolt = `${BOLT}[0]`) {
  g.act(0).cast(bolt, { targets: [CUB], pay: true });
  g.pass();
  g.pass();
}

const resolveTop = (g: ScenarioGame) => {
  g.pass();
  g.pass();
};

describe('the cards are valid', () => {
  test('validateCard finds nothing wrong', () => {
    expect(validateCard(syntheticCard(CUB))).toEqual([]);
    expect(validateCard(syntheticCard(THIEF))).toEqual([]);
  });
});

describe('dies, accept, return at the beginning of your next upkeep (CR 603.7, 603.5)', () => {
  test('the ability asks as it resolves, accepting creates the delayed ability, and the card returns in the next upkeep as a new object', () => {
    const g = game();
    const before = g.id(CUB);
    killCub(g);
    g.expect.zone(CUB, 'graveyard', { seat: 0 });
    g.expect.stack([`${CUB} (ability)`]);
    expect(g.state.delayedTriggers).toEqual([]); // nothing yet: it is made as the dies ability resolves
    g.pass();
    g.pass();
    confirmOptionalDecision(g);
    g.act(0).accept();
    expect(g.state.delayedTriggers).toHaveLength(1);
    g.expect.zone(CUB, 'graveyard', { seat: 0 });
    // Seat 1's turn: nothing yet. Seat 0's next upkeep: the delayed ability triggers.
    g.advanceTo('upkeep', { turn: 3 });
    g.expect.stack([`${CUB} (ability)`]);
    resolveTop(g);
    g.expect.zone(CUB, 'battlefield', { seat: 0 });
    expect(g.id(CUB)).not.toBe(before); // CR 400.7
    expect(g.state.delayedTriggers).toEqual([]); // CR 603.7b: once
    g.expect.invariants();
  });

  test('declining creates no delayed ability and the card stays in the graveyard', () => {
    const g = game();
    killCub(g);
    g.pass();
    g.pass();
    g.act(0).decline();
    expect(g.state.delayedTriggers).toEqual([]);
    g.advanceTo('upkeep', { turn: 3 });
    g.expect.stack([]);
    g.expect.zone(CUB, 'graveyard', { seat: 0 });
  });

  test('it does not return in the opponent upkeep: "your next upkeep"', () => {
    const g = game();
    killCub(g);
    g.pass();
    g.pass();
    g.act(0).accept();
    g.advanceTo('upkeep', { turn: 2 });
    g.expect.stack([]);
    g.expect.zone(CUB, 'graveyard', { seat: 0 });
    expect(g.state.delayedTriggers).toHaveLength(1);
  });

  test('a dies ability that resolves in your own upkeep returns the card at the NEXT upkeep (CR 603.7a)', () => {
    const g = game('upkeep');
    killCub(g);
    g.pass();
    g.pass();
    g.act(0).accept();
    expect(g.state.delayedTriggers).toHaveLength(1);
    // The rest of this upkeep: the delayed ability does not trigger in the step that is already under way.
    g.expect.stack([]);
    g.advanceTo('precombatMain');
    g.expect.zone(CUB, 'graveyard', { seat: 0 });
    g.advanceTo('upkeep', { turn: 3 });
    resolveTop(g);
    g.expect.zone(CUB, 'battlefield', { seat: 0 });
  });

  test('a card exiled in the meantime does not return: it is a new object (CR 603.7c)', () => {
    const g = scenario()
      .define(banish)
      .seat(0)
      .hand(BOLT)
      .battlefield(CUB)
      .battlefield('Mountain', { count: 2 })
      .library('Island', 'Island', 'Island', 'Island')
      .seat(1)
      .battlefield('Swamp')
      .hand(BANISH)
      .library('Island', 'Island', 'Island', 'Island')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    killCub(g, BOLT);
    g.pass();
    g.pass();
    g.act(0).accept();
    g.act(0).pass(); // seat 1 may act: it exiles the card from the graveyard
    g.act(1).cast(BANISH, { targets: [{ name: CUB, zone: 'graveyard' }], pay: true });
    resolveTop(g);
    g.expect.zone(CUB, 'exile', { seat: 0 });
    g.advanceTo('upkeep', { turn: 3 });
    g.expect.stack([`${CUB} (ability)`]); // it triggers, but finds nothing
    resolveTop(g);
    g.expect.zone(CUB, 'exile', { seat: 0 });
    g.expect.noObject(CUB, { zone: 'battlefield' });
    expect(g.state.delayedTriggers).toEqual([]);
    g.expect.invariants();
  });

  test('a commander that went to the command zone instead is not in the graveyard: nothing returns (CR 903.9a)', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield(CUB, { commander: true })
      .battlefield('Mountain', { count: 2 })
      .library('Island', 'Island', 'Island', 'Island')
      .seat(1)
      .battlefield('Island')
      .library('Island', 'Island', 'Island', 'Island')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(BOLT, { targets: [CUB], pay: true });
    g.pass();
    g.pass();
    // The commander replacement is a choice of the owner (CR 903.9a): the command zone.
    if (g.state.pending?.kind === 'commanderZone') g.act(0).sendToCommandZone();
    g.expect.zone(CUB, 'command', { seat: 0 });
    // Its dies ability is on the stack (it died, whatever the owner chose for the card): accepting finds no card in the graveyard.
    g.expect.stack([`${CUB} (ability)`]);
    g.pass();
    g.pass();
    g.act(0).accept();
    expect(g.state.delayedTriggers).toEqual([]);
    g.advanceTo('upkeep', { turn: 3 });
    g.expect.zone(CUB, 'command', { seat: 0 });
    g.expect.noObject(CUB, { zone: 'battlefield' });
  });

  test('a token that died has ceased to exist: nothing is returned (CR 111.8)', () => {
    const g = scenario()
      .define(copier)
      .seat(0)
      .hand(COPIER, BOLT)
      .battlefield(CUB, { label: 'cub' })
      .battlefield('Mountain', { count: 4 })
      .library('Island', 'Island', 'Island', 'Island')
      .seat(1)
      .battlefield('Island')
      .library('Island', 'Island', 'Island', 'Island')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(COPIER, { targets: ['cub'], pay: true });
    resolveTop(g);
    const tokens = g.find({ name: CUB, zone: 'battlefield' }).filter((o) => o.token !== null);
    expect(tokens).toHaveLength(1);
    g.act(0).cast(BOLT, { targets: [tokens[0]?.id ?? ''], pay: true });
    resolveTop(g);
    // The token died: its dies ability (a copy of the card's) goes on the stack; accepting creates nothing to return.
    g.expect.stack([`${CUB} (ability)`]);
    g.pass();
    g.pass();
    g.act(0).accept();
    expect(g.state.delayedTriggers).toEqual([]);
    g.advanceTo('upkeep', { turn: 3 });
    expect(g.find({ name: CUB, zone: 'battlefield' }).filter((o) => o.token !== null)).toEqual([]);
    g.expect.invariants();
  });

  test('two creatures that die together: two delayed abilities, both cards return', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CUB, { label: 'a', damage: 2 })
      .battlefield(CUB, { label: 'b', damage: 2 })
      .library('Island', 'Island', 'Island', 'Island')
      .seat(1)
      .battlefield('Island')
      .library('Island', 'Island', 'Island', 'Island')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    // Both have lethal damage: the next state-based-action check kills them together, and each has its own dies ability.
    g.act(0).pass();
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.expect.stack([`${CUB} (ability)`, `${CUB} (ability)`]);
    for (let i = 0; i < 2; i += 1) {
      g.pass();
      g.pass();
      g.act(0).accept();
    }
    expect(g.state.delayedTriggers).toHaveLength(2);
    g.advanceTo('upkeep', { turn: 3 });
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.passAll();
    expect(g.find({ name: CUB, zone: 'battlefield' })).toHaveLength(2);
    g.expect.invariants();
  });
});

describe('under whose control it returns (CR 110.2)', () => {
  // The Cub is owned by seat 0 and controlled by seat 1 when it dies: "under its owner's control" is seat 0, "under your control" is seat 1.
  const stolen = (card: string) =>
    scenario()
      .seat(0)
      .library('Island', 'Island', 'Island', 'Island')
      .seat(1)
      .hand(BOLT)
      .battlefield('Island')
      .battlefield('Mountain', { count: 2 })
      .library('Island', 'Island', 'Island', 'Island')
      .seat(0)
      .battlefield(card, { controller: 1 })
      .at('precombatMain', { active: 1, turn: 2 })
      .build();

  test("under its owner's control: the owner gets it back, at the controller's next upkeep", () => {
    const g = stolen(CUB);
    g.act(1).cast(BOLT, { targets: [CUB], pay: true });
    resolveTop(g);
    g.pass();
    g.pass();
    g.act(1).accept();
    g.advanceTo('upkeep', { turn: 4 });
    resolveTop(g);
    g.expect.zone(CUB, 'battlefield', { seat: 0 });
    expect(g.object(CUB).controller).toBe(0);
  });

  test('under your control: the controller of the ability gets it', () => {
    const g = stolen(THIEF);
    g.act(1).cast(BOLT, { targets: [THIEF], pay: true });
    resolveTop(g);
    g.pass();
    g.pass();
    g.act(1).accept();
    g.advanceTo('upkeep', { turn: 4 });
    resolveTop(g);
    g.expect.zone(THIEF, 'battlefield', { seat: 1 });
  });
});

describe('validation: what a delayed move may name (D-205, D-982)', () => {
  const delayedMove = (objects: unknown, to = 'battlefield'): Effect =>
    ({
      kind: 'delayedTrigger',
      at: { step: 'upkeep', whose: 'you' },
      effect: { kind: 'moveToZone', objects, to, controller: 'owner' },
    }) as unknown as Effect;
  const creatureWith = (name: string, abilities: Ability[]) =>
    singleFace({
      name,
      manaCost: ['1'],
      types: ['creature'],
      colors: [],
      colorIdentity: [],
      power: 1,
      toughness: 1,
      oracleText: 'SYNTHETIC validation card',
      abilities,
    });
  const trigger = (kind: 'dies' | 'leavesBattlefield', effect: Effect): Ability =>
    ({
      kind: 'triggered',
      trigger: { kind, what: { kind: 'this' } },
      optional: true,
      effect,
    }) as Ability;

  test('triggerCard is accepted in a dies trigger', () => {
    const card = creatureWith('SYNTHETIC V1', [
      trigger('dies', delayedMove({ kind: 'triggerCard' })),
    ]);
    expect(validateCard(card)).toEqual([]);
  });

  test('triggerCard is refused in a leaves-the-battlefield trigger (the card may be anywhere)', () => {
    const card = creatureWith('SYNTHETIC V2', [
      trigger('leavesBattlefield', delayedMove({ kind: 'triggerCard' })),
    ]);
    expect(validateCard(card).length).toBeGreaterThan(0);
  });

  test('triggerCard is refused in a spell and in an ETB trigger', () => {
    const spell = singleFace({
      name: 'SYNTHETIC V3',
      manaCost: ['1'],
      types: ['sorcery'],
      colors: [],
      colorIdentity: [],
      oracleText: 'SYNTHETIC validation card',
      spell: { effect: delayedMove({ kind: 'triggerCard' }) },
    });
    expect(validateCard(spell).length).toBeGreaterThan(0);
    const etb = creatureWith('SYNTHETIC V4', [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: delayedMove({ kind: 'triggerCard' }),
      } as Ability,
    ]);
    expect(validateCard(etb).length).toBeGreaterThan(0);
  });

  test('the other objects a delayed move could name stay refused, in a dies trigger too', () => {
    for (const objects of [
      { kind: 'thisCard' },
      { kind: 'moved' },
      { kind: 'triggerSubject' },
      { kind: 'each', filter: { types: ['creature'] } },
    ]) {
      const card = creatureWith(`SYNTHETIC V5 ${JSON.stringify(objects)}`, [
        trigger('dies', delayedMove(objects)),
      ]);
      expect(validateCard(card).length).toBeGreaterThan(0);
    }
  });

  test('a delayed move of triggerCard goes onto the battlefield and nowhere else', () => {
    const card = creatureWith('SYNTHETIC V6', [
      trigger('dies', delayedMove({ kind: 'triggerCard' }, 'hand')),
    ]);
    expect(validateCard(card).length).toBeGreaterThan(0);
  });
});

describe('determinism', () => {
  test('the same actions give the same state hash', () => {
    const run = () => {
      const g = game();
      killCub(g);
      g.pass();
      g.pass();
      g.act(0).accept();
      g.advanceTo('upkeep', { turn: 3 });
      resolveTop(g);
      return g;
    };
    expect(stateHash(run().state)).toBe(stateHash(run().state));
  });
});
