// A non-Aura enchantment that returns a creature card and is linked to it (the shape of Diabolic Servitude, SYNTHETIC here): "When this enchantment enters, return target creature card
// from your graveyard to the battlefield. When the creature put onto the battlefield with this enchantment dies, exile it and return this enchantment to its owner's hand. When this
// enchantment leaves the battlefield, exile the creature put onto the battlefield with this enchantment."
// Pins: CR 607.1 and 607.2 (the abilities are linked: the later two refer to the creature the first put onto the battlefield), CR 400.7 (a permanent that left and came back is a new object, so
// the link is gone), CR 603.10a (a leaves-the-battlefield or dies trigger looks back in time), CR 110.2a (the creature enters under the control of the player performing the effect), CR 603.4
// is not needed (no intervening if). Cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import type { Ability } from '../src/ast/types';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const SERVITUDE = 'SYNTHETIC Linked Return';
const BOLT = 'Lightning Bolt';
const DISENCHANT = 'SYNTHETIC Linked Disenchant';
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const LIBRARY = Array.from({ length: 8 }, () => 'Swamp');

const abilities: readonly Ability[] = [
  {
    kind: 'triggered',
    trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
    targets: [
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: { zone: 'graveyard', types: ['creature'], controller: 'you' },
        },
      },
    ],
    effect: {
      kind: 'moveToZone',
      objects: { kind: 'target', id: 't1' },
      to: 'battlefield',
      putWithSource: true,
    },
  },
  {
    kind: 'triggered',
    trigger: { kind: 'dies', what: { types: ['creature'], putWithSource: true } },
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'exile', objects: { kind: 'triggerSubject' } },
        { kind: 'moveToZone', objects: { kind: 'this' }, to: 'hand' },
      ],
    },
  },
  {
    kind: 'triggered',
    trigger: { kind: 'leavesBattlefield', what: { kind: 'this' } },
    effect: { kind: 'exile', objects: { kind: 'putWithThis' } },
  },
];

const servitude = singleFaceCard({
  name: SERVITUDE,
  manaCost: ['3', 'B'],
  types: ['enchantment'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText: 'SYNTHETIC test text.',
  abilities,
});

const disenchant = singleFaceCard({
  name: DISENCHANT,
  manaCost: ['U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'Destroy target enchantment.',
  spell: {
    targets: [
      {
        id: 't1',
        what: { kind: 'object', filter: { zone: 'battlefield', types: ['enchantment'] } },
      },
    ],
    effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
  },
});

/** Seat 0 casts the enchantment with a Bears in its graveyard and a Llanowar Elves on the battlefield; seat 1 holds a Bolt and a Disenchant. */
const board = (seats: 2 | 3 = 2) => {
  const b = scenario({ seats })
    .define(servitude)
    .define(disenchant)
    .seat(0)
    .library(...LIBRARY)
    .hand(SERVITUDE)
    .battlefield('Swamp', { count: 4 })
    .graveyard(BEARS)
    .seat(1)
    .library(...LIBRARY)
    .hand(BOLT, DISENCHANT)
    .battlefield('Mountain', { count: 3 })
    .battlefield('Island')
    .graveyard(ELVES);
  return (
    seats === 3
      ? b
          .seat(2)
          .library(...LIBRARY)
          .graveyard(ELVES)
      : b
  )
    .at('precombatMain', { active: 0 })
    .build();
};

/** Casts the enchantment, lets it and its enters trigger resolve: the Bears is returned with it. */
const entered = (seats: 2 | 3 = 2) => {
  const g = board(seats);
  g.act(0).cast(SERVITUDE, { pay: true });
  // The enchantment resolves, then its enters ability, whose one legal target is chosen by the engine.
  g.passAll();
  return g;
};

describe('the card is valid', () => {
  test('the three linked abilities', () => {
    expect(validateCard(servitude)).toEqual([]);
  });
});

describe('the enters ability', () => {
  test('returns the creature card of its controller’s graveyard to the battlefield, under their control (CR 110.2a)', () => {
    const g = entered();
    g.expect.zone(SERVITUDE, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('only the controller’s own graveyard offers targets, with any number of seats', () => {
    const g = board(3);
    g.act(0).cast(SERVITUDE, { pay: true });
    g.passAll();
    const d = g.state.pending;
    // One legal target only, so the engine may choose it itself; either way Elves of the opponents are no candidates.
    if (d?.kind === 'targets') expect(d.specs[0]?.legal).toHaveLength(1);
    else g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    g.expect.zone(ELVES, 'graveyard', { seat: 2 });
  });
});

describe('the linked leaves ability (CR 607.2, 603.10a)', () => {
  test('when the enchantment leaves the battlefield the creature it put there is exiled', () => {
    const g = entered();
    // Seat 1 destroys the enchantment with its Disenchant.
    g.act(0).pass();
    g.act(1).cast(DISENCHANT, { targets: [SERVITUDE], pay: true });
    g.passAll();
    g.expect.zone(SERVITUDE, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('a creature that is not the one the enchantment put there is left alone', () => {
    const g = scenario()
      .define(servitude)
      .define(disenchant)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SERVITUDE)
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .hand(DISENCHANT)
      .battlefield('Island')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).pass();
    g.act(1).cast(DISENCHANT, { targets: [SERVITUDE], pay: true });
    g.passAll();
    g.expect.zone(SERVITUDE, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });
});

describe('the linked dies ability (CR 607.2, 603.10a, 400.7)', () => {
  test('when the creature put onto the battlefield with it dies it is exiled and the enchantment returns to its owner’s hand', () => {
    const g = entered();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    // The dies trigger goes on the stack and resolves.
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.zone(SERVITUDE, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('another creature of the same controller that dies does not trigger it', () => {
    // A second creature enters under seat 0's control through the scenario, not put there by the enchantment.
    const other = scenario()
      .define(servitude)
      .define(disenchant)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SERVITUDE)
      .battlefield(ELVES)
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .at('precombatMain', { active: 0 })
      .build();
    other.act(0).pass();
    other.act(1).cast(BOLT, { targets: [ELVES], pay: true });
    other.passAll();
    other.expect.zone(ELVES, 'graveyard', { seat: 0 });
    other.expect.zone(SERVITUDE, 'battlefield', { seat: 0 });
    other.expect.invariants();
  });
});
