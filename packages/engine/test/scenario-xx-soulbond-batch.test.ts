// A pair that leaves the battlefield together (D-981, D-984), CR 603.10a: the dies-and-return ability the Seraph gives its pair is a "dies" trigger, which looks
// back in time, so when both creatures die in one event each sees the grant. The batch movers that are not destroy-all or sacrifice-all: the "each player
// sacrifices all other nonland permanents" of a spare effect (CR 701.21a, 101.4), "Sacrifice two creatures" as a cost (CR 701.21a, 118.3, 601.2h), a choice of
// several creatures to put into a graveyard (CR 608.2d), the creatures sacrificed to devour (CR 702.82a) and the legend rule (CR 704.5j, 704.3).
// Cards are SYNTHETIC (synthetic-soulbond.ts, synthetic-hofri.ts) or defined here.
import { describe, expect, test } from 'vitest';
import { kw, singleFace } from '../src/cards/fixtures/helpers';
import { DIES_RETURN_ABILITY } from '../src/cards/fixtures/synthetic-dies-return';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { settle } from './meld-helpers';

const SERAPH = 'SYNTHETIC Soulbound Seraph';
const BEARS = 'Grizzly Bears';
const SERRA = 'Serra Angel';
const KEEP_RITE = 'SYNTHETIC Keep Rite';
const ALTAR = 'SYNTHETIC Pair Altar';
const SEER = 'SYNTHETIC Chooser Rite';
const LEGEND = 'SYNTHETIC Legendary Bondsman';
const LIBRARY = ['Island', 'Island', 'Island', 'Island'] as const;

/** "Sacrifice two creatures: Draw a card." */
const altar = singleFace({
  name: ALTAR,
  manaCost: ['1'],
  types: ['artifact'],
  colors: [],
  colorIdentity: [],
  oracleText: 'SYNTHETIC: Sacrifice two creatures: Draw a card.',
  abilities: [
    {
      kind: 'activated',
      cost: [{ kind: 'sacrifice', what: { types: ['creature'] }, count: 2 }],
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    },
  ],
});

/** "Put two creatures you control into your graveyard." */
const chooser = singleFace({
  name: SEER,
  manaCost: ['1'],
  types: ['sorcery'],
  colors: [],
  colorIdentity: [],
  oracleText: 'SYNTHETIC: Put two creatures you control into your graveyard.',
  spell: {
    effect: {
      kind: 'moveToZone',
      objects: { kind: 'choose', filter: { types: ['creature'], controller: 'you' }, count: 2 },
      to: 'graveyard',
    },
  },
});

/** A legendary soulbond creature that, while paired, gives each creature of the pair the dies-and-return ability. */
const legend = singleFace({
  name: LEGEND,
  manaCost: ['2', 'W'],
  types: ['creature'],
  supertypes: ['legendary'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 2,
  toughness: 2,
  oracleText:
    'SYNTHETIC: Soulbond. While paired, each of those creatures has the dies-and-return ability.',
  abilities: [
    kw('soulbond'),
    {
      kind: 'static',
      static: { kind: 'grantAbility', subject: { kind: 'pair' }, ability: DIES_RETURN_ABILITY },
      condition: { kind: 'paired' },
    },
  ],
});

/** The number of abilities waiting: on the stack, or triggered and still to be put there. */
const waiting = (g: ScenarioGame) => g.state.stack.length + g.state.pendingTriggers.length;

describe('sparePermanents: the pair sacrificed with everything not kept dies together (CR 603.10a)', () => {
  for (const seraphFirst of [true, false]) {
    test(`both creatures see the grant (Seraph older: ${seraphFirst})`, () => {
      let b = scenario().seat(0).hand(KEEP_RITE).battlefield('Plains', { count: 5 });
      b = seraphFirst
        ? b
            .battlefield(SERAPH, { label: 'seraph', pairedWith: 'bears' })
            .battlefield(BEARS, { label: 'bears' })
        : b
            .battlefield(BEARS, { label: 'bears' })
            .battlefield(SERAPH, { label: 'seraph', pairedWith: 'bears' });
      const g = b
        .battlefield(SERRA, { label: 'serra' })
        .library(...LIBRARY)
        .seat(1)
        .library(...LIBRARY)
        .at('precombatMain', { active: 0, turn: 3 })
        .build();
      g.act(0).cast(KEEP_RITE, { pay: true });
      g.passAll();
      g.act(0).choosePermanents('serra');
      g.expect.zone(SERAPH, 'graveyard', { seat: 0 });
      g.expect.zone(BEARS, 'graveyard', { seat: 0 });
      g.expect.zone(SERRA, 'battlefield', { seat: 0 });
      // One dies ability per creature of the pair, each looking back at the grant it had as they died together.
      expect(waiting(g)).toBe(2);
    });
  }
});

describe('"Sacrifice two creatures" as a cost: the pair dies together (CR 603.10a, 701.21a)', () => {
  for (const seraphFirst of [true, false]) {
    test(`both creatures see the grant (Seraph older: ${seraphFirst})`, () => {
      let b = scenario().define(altar).seat(0).battlefield(ALTAR);
      b = seraphFirst
        ? b
            .battlefield(SERAPH, { label: 'seraph', pairedWith: 'bears' })
            .battlefield(BEARS, { label: 'bears' })
        : b
            .battlefield(BEARS, { label: 'bears' })
            .battlefield(SERAPH, { label: 'seraph', pairedWith: 'bears' });
      const g = b
        .library(...LIBRARY)
        .seat(1)
        .library(...LIBRARY)
        .at('precombatMain', { active: 0, turn: 3 })
        .build();
      g.act(0).activate(ALTAR);
      // Two candidates: the engine chose both. The altar's ability waits, and so do the two dies abilities.
      expect(g.state.stack.length + g.state.pendingTriggers.length).toBe(3);
      settle(g);
      g.expect.zone(SERAPH, 'graveyard', { seat: 0 });
      g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    });
  }
});

describe('a choice of two creatures to put into a graveyard: the pair dies together (CR 603.10a)', () => {
  for (const seraphFirst of [true, false]) {
    test(`both creatures see the grant (Seraph older: ${seraphFirst})`, () => {
      let b = scenario().define(chooser).seat(0).hand(SEER).battlefield('Plains');
      b = seraphFirst
        ? b
            .battlefield(SERAPH, { label: 'seraph', pairedWith: 'bears' })
            .battlefield(BEARS, { label: 'bears' })
        : b
            .battlefield(BEARS, { label: 'bears' })
            .battlefield(SERAPH, { label: 'seraph', pairedWith: 'bears' });
      const g = b
        .battlefield(SERRA, { label: 'serra' })
        .library(...LIBRARY)
        .seat(1)
        .library(...LIBRARY)
        .at('precombatMain', { active: 0, turn: 3 })
        .build();
      g.act(0).cast(SEER, { pay: true });
      g.passAll();
      g.act(0).choosePermanents('seraph', 'bears');
      g.expect.zone(SERAPH, 'graveyard', { seat: 0 });
      g.expect.zone(BEARS, 'graveyard', { seat: 0 });
      expect(waiting(g)).toBe(2);
    });
  }
});

describe('the legend rule: the pair that is not kept dies together (CR 704.5j, 603.10a)', () => {
  test('three legends, two of them paired: keeping the third, both of the pair see the grant', () => {
    const g = scenario()
      .define(legend)
      .seat(0)
      .battlefield(LEGEND, { label: 'a', pairedWith: 'b' })
      .battlefield(LEGEND, { label: 'b' })
      .battlefield(LEGEND, { label: 'c' })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build({ settle: true });
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents('c');
    expect(g.object('c').zone).toBe('battlefield');
    // Both creatures of the pair are Bondsmen: each has the grant of its own static ability and the one of the other, so two dies abilities each. If the
    // second to move had lost its grants when the first left, there would be two.
    expect(waiting(g)).toBe(4);
  });
});

describe('devour: the pair sacrificed as the creature enters dies together (CR 702.82a, 603.10a)', () => {
  const BRUTE = 'SYNTHETIC Devouring Brute'; // {2}{R} 2/2, devour 2
  for (const seraphFirst of [true, false]) {
    test(`both creatures see the grant (Seraph older: ${seraphFirst})`, () => {
      let b = scenario().seat(0).hand(BRUTE).battlefield('Mountain', { count: 3 });
      b = seraphFirst
        ? b
            .battlefield(SERAPH, { label: 'seraph', pairedWith: 'bears' })
            .battlefield(BEARS, { label: 'bears' })
        : b
            .battlefield(BEARS, { label: 'bears' })
            .battlefield(SERAPH, { label: 'seraph', pairedWith: 'bears' });
      const g = b
        .library(...LIBRARY)
        .seat(1)
        .library(...LIBRARY)
        .at('precombatMain', { active: 0, turn: 3 })
        .build();
      g.act(0).cast(BRUTE, { pay: true });
      g.passAll();
      g.act(0).choosePermanents('seraph', 'bears');
      g.expect.zone(SERAPH, 'graveyard', { seat: 0 });
      g.expect.zone(BEARS, 'graveyard', { seat: 0 });
      expect(waiting(g)).toBe(2);
    });
  }
});
