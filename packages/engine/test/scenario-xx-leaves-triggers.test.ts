// "Whenever [a permanent] leaves the battlefield [and is put into ...]" (D-111): `leavesBattlefield`.
// Pins: CR 603.6c (leaves-the-battlefield abilities trigger when a permanent moves from the
// battlefield to another zone; a token leaves too), CR 603.10a (they look back in time: the
// permanent is read as it last was, and permanents that leave together see each other leave),
// CR 113.7a and 608.2h (last-known information: who controlled it, what it was), CR 700.4 (dies is
// the special case of a creature put into a graveyard), CR 701.21 (sacrifice).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-triggers-more.ts) or fixtures; two are defined here.
import { describe, expect, test } from 'vitest';
import type { Zone } from '../src/ast/types';
import { leaverName } from '../src/cards/fixtures/synthetic-triggers-more';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const V22 = 'SYNTHETIC Vanilla 2/2';
const DEPARTURE = 'SYNTHETIC Departure Watcher';
const RIVAL_DEPARTURE = 'SYNTHETIC Rival Departure Watcher';
const EXILE_WATCHER = 'SYNTHETIC Exile Watcher';

/** "Put target creature on top of its owner's library": the one way to leave for the library. */
const HOURGLASS = singleFaceCard({
  name: 'SYNTHETIC Hourglass Spell',
  manaCost: ['U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: "Put target creature on top of its owner's library.",
  spell: {
    targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
    effect: {
      kind: 'moveToZone',
      objects: { kind: 'target', id: 't1' },
      to: 'library',
      position: 'top',
    },
  },
});

/** A creature that sees every creature you control leave, itself included (CR 603.10a). */
const MOURNING_BEAR = singleFaceCard({
  name: 'SYNTHETIC Mourning Bear',
  manaCost: ['1', 'B'],
  types: ['creature'],
  subtypes: ['Bear'],
  colors: ['B'],
  colorIdentity: ['B'],
  power: 2,
  toughness: 2,
  oracleText: 'Whenever a creature you control leaves the battlefield, you gain 1 life.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'leavesBattlefield', what: { types: ['creature'], controller: 'you' } },
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
    },
  ],
});

/** Any permanent leaving the battlefield: one more life. */
const GRAVE_WATCHER = singleFaceCard({
  name: 'SYNTHETIC Grave Watcher',
  manaCost: ['1'],
  types: ['enchantment'],
  colors: [],
  colorIdentity: [],
  oracleText: 'Whenever a permanent leaves the battlefield, you gain 1 life.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'leavesBattlefield', what: {} },
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
    },
  ],
});

type Way = 'destroy' | 'exile' | 'bounce' | 'sacrifice' | 'library';
const WAYS: readonly Way[] = ['destroy', 'exile', 'bounce', 'sacrifice', 'library'];
/** Where each way sends the creature. */
const GOES_TO: Record<Way, Zone> = {
  destroy: 'graveyard',
  exile: 'exile',
  bounce: 'hand',
  sacrifice: 'graveyard',
  library: 'library',
};

/**
 * Seat 0 controls `cards`; a spell removes `victim` (seat 0's) in the given way: seat 1 casts it,
 * except the edict, which seat 0 casts so that it sacrifices its own creature (CR 701.21a).
 */
function leave(way: Way, cards: readonly string[], victim: string = leaverName('any')) {
  const caster = way === 'sacrifice' ? 0 : 1;
  const spell = {
    destroy: ['Murder', 'BBB'],
    exile: ['SYNTHETIC Free Exile', 'BBBB'],
    bounce: ['Unsummon', 'U'],
    sacrifice: ['SYNTHETIC Edict', 'CB'],
    library: ['SYNTHETIC Hourglass Spell', 'U'],
  }[way] as [string, string];
  const b = scenario().define(HOURGLASS).define(MOURNING_BEAR);
  b.seat(0)
    .life(20)
    .battlefield(...cards);
  b.seat(1).life(20);
  b.seat(caster).hand(spell[0]).pool(spell[1]);
  const game = b.at('precombatMain', { active: caster }).build();
  game
    .act(caster)
    .cast(spell[0], way === 'sacrifice' ? {} : { targets: [victim] })
    .pay();
  game.pass();
  game.pass();
  return game;
}

describe('leaving for any zone, by every way (CR 603.6c)', () => {
  for (const way of WAYS) {
    test(`${way}: "leaves the battlefield" triggers once`, () => {
      const g = leave(way, [leaverName('any')]);
      g.expect.stack([`${leaverName('any')} (ability)`]);
      g.expect.zone(leaverName('any'), GOES_TO[way] === 'exile' ? 'exile' : GOES_TO[way], {
        seat: 0,
      });
      g.passAll();
      g.expect.life(0, 21);
    });
  }
});

describe('"and is put into [a zone]" (CR 603.6c)', () => {
  const zones: readonly Zone[] = ['graveyard', 'exile', 'hand', 'library'];
  for (const zone of zones) {
    for (const way of WAYS) {
      const expected = GOES_TO[way] === zone;
      test(`${zone} watcher, creature ${way}: ${expected ? 'triggers' : 'does not trigger'}`, () => {
        const g = leave(way, [leaverName(zone)], leaverName(zone));
        g.expect.stack(expected ? [`${leaverName(zone)} (ability)`] : []);
      });
    }
  }
});

describe('last-known information (CR 113.7a, 603.10a)', () => {
  test('a creature you control that is owned by the opponent: you see it leave, not the opponent', () => {
    const g = scenario()
      .define(MOURNING_BEAR)
      .seat(0)
      .life(20)
      .battlefield(DEPARTURE, RIVAL_DEPARTURE)
      .seat(1)
      .life(20)
      .battlefield(V22, { controller: 0 })
      .hand('Murder')
      .pool('BBB')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast('Murder', { targets: [V22], pay: true });
    g.pass();
    g.pass();
    // It went to its owner's graveyard, but it was seat 0's creature when it left.
    g.expect.zone(V22, 'graveyard', { seat: 1 });
    g.expect.stack([`${DEPARTURE} (ability)`]);
  });

  test("a creature the opponent controls leaving triggers the opponent's-creature watcher", () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(DEPARTURE, RIVAL_DEPARTURE)
      .seat(1)
      .battlefield(V22)
      .hand('Unsummon')
      .pool('U')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast('Unsummon', { targets: [V22], pay: true });
    g.pass();
    g.pass();
    g.expect.stack([`${RIVAL_DEPARTURE} (ability)`]);
  });

  test('permanents that leave together see each other leave, and a leaver sees itself (CR 603.10a)', () => {
    const g = scenario()
      .define(MOURNING_BEAR)
      .seat(0)
      .life(20)
      .battlefield('SYNTHETIC Mourning Bear', 'SYNTHETIC Mourning Bear')
      .seat(1)
      .hand('SYNTHETIC Wrath')
      .pool('CCWW')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast('SYNTHETIC Wrath', { pay: true });
    g.pass();
    g.pass();
    // Two bears, each sees both leave: four triggers.
    const pending = g.state.pending;
    if (pending?.kind === 'orderTriggers') {
      g.act(pending.seat).orderTriggers(...pending.triggers.map((_, i) => i));
    }
    expect(g.state.stack).toHaveLength(4);
  });

  test('a token that leaves triggers it too (CR 603.6c): a Treasure sacrificed for mana', () => {
    const g = scenario()
      .define(GRAVE_WATCHER)
      .seat(0)
      .life(20)
      .battlefield('SYNTHETIC Grave Watcher')
      .hand('SYNTHETIC Make Treasures')
      .pool('CR')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast('SYNTHETIC Make Treasures', { pay: true });
    g.passAll();
    g.expect.life(0, 20);
    g.act(0).tapForMana('Treasure[0]', { color: 'R' });
    g.expect.stack(['SYNTHETIC Grave Watcher (ability)']);
  });
});

describe('what leaving the battlefield does not include', () => {
  test('a creature entering, or a card leaving the hand, does not trigger it', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(DEPARTURE)
      .hand(V22, 'Plains')
      .pool('CC')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(V22, { pay: true });
    g.pass();
    g.pass();
    g.expect.stack([]);
  });

  test('an exile watcher sees a permanent put into exile from the battlefield, not one that is destroyed', () => {
    const exiled = scenario()
      .seat(0)
      .life(20)
      .battlefield(EXILE_WATCHER)
      .hand('SYNTHETIC Free Exile')
      .pool('BBBB')
      .seat(1)
      .battlefield(V22)
      .at('precombatMain', { active: 0 })
      .build();
    exiled.act(0).cast('SYNTHETIC Free Exile', { targets: [V22], pay: true });
    exiled.pass();
    exiled.pass();
    exiled.expect.stack([`${EXILE_WATCHER} (ability)`]);
    const destroyed = scenario()
      .seat(0)
      .life(20)
      .battlefield(EXILE_WATCHER)
      .hand('Murder')
      .pool('BBB')
      .seat(1)
      .battlefield(V22)
      .at('precombatMain', { active: 0 })
      .build();
    destroyed.act(0).cast('Murder', { targets: [V22], pay: true });
    destroyed.pass();
    destroyed.pass();
    destroyed.expect.stack([]);
  });
});

describe('determinism and legal actions', () => {
  test('the same removal twice gives the same hash', () => {
    const run = () => leave('destroy', [leaverName('any')]).hash();
    expect(run()).toBe(run());
  });

  test('every legal action with the trigger on the stack is accepted', () => {
    const build = () => leave('destroy', [leaverName('any')]);
    for (const action of build().legalActions(1)) {
      const probe = build();
      expect(probe.act(1).try.action(action).ok, JSON.stringify(action)).toBe(true);
    }
  });
});
