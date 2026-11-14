// Decayed (D-478): "This creature can't block" and "When this creature attacks, sacrifice it at end of combat." (CR 702.147a), a keyword the engine runs as a static restriction
// and a triggered ability that creates a delayed triggered ability (CR 603.7), as a printed keyword, a granted keyword (CR 613.1f) and a keyword counter (CR 122.1b).
// Pins: CR 702.147a (Decayed), CR 509.1b (a creature that can't block), CR 603.7 (a delayed triggered ability), CR 122.1b (a keyword counter gives the keyword),
// CR 613.1f (an ability granted in layer 6), CR 400.7 (a permanent that left is a new object), CR 701.21a (sacrifice).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-gisa-g5.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const HUSK = 'SYNTHETIC Decayed Husk'; // 2/2 Zombie with decayed
const TOUCH = 'SYNTHETIC Rot Touch'; // {B} sorcery: target creature gains decayed until end of turn
const SEED = 'SYNTHETIC Rot Seed'; // {B} sorcery: put a decayed counter on target creature
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const LIBRARY = ['Plains', 'Plains', 'Plains'] as const;

describe('the cards are valid', () => {
  test.each([HUSK, TOUCH, SEED])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('decayed is a keyword with no parameter', () => {
    const decayed = (keyword: unknown) =>
      singleFace({
        name: 'SYNTHETIC Test Decayed',
        manaCost: ['B'],
        types: ['creature'],
        colors: ['B'],
        colorIdentity: ['B'],
        power: 1,
        toughness: 1,
        oracleText: 'test',
        abilities: [{ kind: 'keyword', keyword } as never],
      });
    expect(validateCard(decayed({ kind: 'decayed' }))).toEqual([]);
  });

  test('the engine-only form `delayedSacrifice` of the keyword is not a thing a card writes', () => {
    const written = singleFace({
      name: 'SYNTHETIC Test Delayed',
      manaCost: ['B'],
      types: ['creature'],
      colors: ['B'],
      colorIdentity: ['B'],
      power: 1,
      toughness: 1,
      oracleText: 'test',
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'attacks', what: { kind: 'this' } },
          effect: { kind: 'delayedSacrifice', of: 'this' },
        },
      ],
    });
    expect(validateCard(written).length).toBeGreaterThan(0);
  });
});

describe('a printed decayed (CR 702.147a)', () => {
  const board = () =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(HUSK)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0 })
      .build();

  test('the creature has the keyword, and the abilities it stands for', () => {
    const g = board();
    g.expect.derived(HUSK, { keywords: ['decayed'] });
    expect(g.view(0).battlefield.find((o) => o.name === HUSK)?.keywords).toContain('decayed');
  });

  test("it can't block (CR 509.1b), though an ordinary creature can", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(HUSK)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('declareBlockers');
    g.expect.canBlock({ name: HUSK, seat: 1 }, { name: BEARS, seat: 0 }, false);
    g.expect.canBlock({ name: BEARS, seat: 1 }, { name: BEARS, seat: 0 }, true);
    expect(() =>
      g.act(1).declareBlockers([{ blocker: { name: HUSK, seat: 1 }, attacker: BEARS }]),
    ).toThrow();
  });

  test('it attacks: an ability goes on the stack, and the creature is sacrificed at end of combat, not before', () => {
    const g = board();
    g.advanceTo('declareAttackers');
    g.act(0).attack(HUSK);
    g.expect.stack([`${HUSK} (ability)`]);
    g.passAll();
    // the ability resolved: a delayed trigger waits for the end of combat, and the creature is still there, attacking
    expect(g.state.delayedTriggers).toHaveLength(1);
    g.expect.zone(HUSK, 'battlefield', { seat: 0 });
    g.advanceTo('combatDamage');
    g.passAll();
    g.expect.life(1, 38);
    g.expect.zone(HUSK, 'battlefield', { seat: 0 });
    g.advanceTo('endOfCombat');
    g.passAll();
    g.expect.zone(HUSK, 'graveyard', { seat: 0 });
    expect(g.state.delayedTriggers).toHaveLength(0);
    g.expect.invariants();
  });

  test('it deals its combat damage to a blocker and is sacrificed all the same', () => {
    const g = board();
    g.advanceTo('declareAttackers');
    g.act(0).attack(HUSK);
    g.passAll();
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: { name: BEARS, seat: 1 }, attacker: HUSK }]);
    g.advanceTo('combatDamage');
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(HUSK, 'graveyard', { seat: 0 });
  });

  test('a creature with decayed that does not attack is not sacrificed', () => {
    const g = board();
    g.advanceTo('declareAttackers');
    g.act(0).noAttackers();
    g.advanceTo('postcombatMain');
    g.expect.zone(HUSK, 'battlefield', { seat: 0 });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.zone(HUSK, 'battlefield', { seat: 0 });
    expect(g.state.delayedTriggers).toHaveLength(0);
  });

  test('a creature that died in combat is not sacrificed again: the delayed trigger finds nothing (CR 400.7)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(HUSK)
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(HUSK);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [{ name: HUSK, seat: 0 }], pay: true });
    g.passAll();
    g.expect.zone(HUSK, 'graveyard', { seat: 0 });
    g.advanceTo('endOfCombat');
    g.passAll();
    expect(g.find({ name: HUSK, zone: 'graveyard' })).toHaveLength(1);
    g.expect.invariants();
  });
});

describe('a granted decayed (CR 613.1f)', () => {
  const board = () =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(TOUCH)
      .battlefield('Swamp')
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0 })
      .build();

  test('"gains decayed until end of turn": the creature has the keyword, and it attacks and is sacrificed', () => {
    const g = board();
    g.act(0).cast(TOUCH, { targets: [{ name: BEARS, seat: 0 }], pay: true });
    g.passAll();
    g.expect.derived({ name: BEARS, seat: 0 }, { keywords: ['decayed'] });
    g.advanceTo('declareAttackers');
    g.act(0).attack({ name: BEARS, seat: 0 });
    g.expect.stack([`${BEARS} (ability)`]);
    g.passAll();
    g.advanceTo('endOfCombat');
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test("it can't block while it has it, and can again when the effect ends", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(TOUCH)
      .battlefield('Swamp')
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(TOUCH, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    g.expect.derived({ name: BEARS, seat: 1 }, { keywords: ['decayed'] });
    const restrictions = () =>
      g.view(0).battlefield.find((o) => o.name === BEARS && o.controller === 1)?.restrictions;
    expect(restrictions()).toContain('cantBlock');
    g.advanceTo('declareAttackers');
    g.act(0).attack({ name: BEARS, seat: 0 });
    // the creature that has it is no blocker, so nobody is asked to declare blockers
    expect(g.state.pending?.kind).not.toBe('declareBlockers');
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived({ name: BEARS, seat: 1 }, { keywords: [] });
    expect(restrictions() ?? []).not.toContain('cantBlock');
  });
});

describe('a decayed counter (CR 122.1b)', () => {
  const board = () =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(SEED)
      .battlefield('Swamp')
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the creature has the keyword for as long as the counter is on it', () => {
    const g = board();
    g.act(0).cast(SEED, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.counters(BEARS, { decayed: 1 });
    g.expect.derived(BEARS, { keywords: ['decayed'] });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived(BEARS, { keywords: ['decayed'] });
  });

  test('it attacks and is sacrificed at end of combat: the abilities of the keyword come with the counter', () => {
    const g = board();
    g.act(0).cast(SEED, { targets: [BEARS], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.expect.stack([`${BEARS} (ability)`]);
    g.passAll();
    g.advanceTo('endOfCombat');
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('a creature that has decayed and a decayed counter has the keyword once: one trigger when it attacks', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(HUSK, { counters: { decayed: 1 } })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(HUSK);
    g.expect.stack([`${HUSK} (ability)`]);
    g.passAll();
    expect(g.state.delayedTriggers).toHaveLength(1);
  });
});

describe('a static ability that gives decayed to a group (CR 613.1f)', () => {
  const LORD = singleFace({
    name: 'SYNTHETIC Test Rot Lord',
    manaCost: ['2', 'B'],
    types: ['creature'],
    subtypes: ['Zombie'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 1,
    oracleText: 'Other creatures you control have decayed.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'you', other: true },
          },
          keyword: { kind: 'decayed' },
        },
      },
    ],
  });

  test("the card is valid, and the creatures it names have the keyword, can't block and are sacrificed after attacking", () => {
    expect(validateCard(LORD)).toEqual([]);
    const g = scenario()
      .define(LORD)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(LORD.name)
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.derived(BEARS, { keywords: ['decayed'] });
    g.expect.derived(LORD.name, { keywords: [] });
    expect(g.view(0).battlefield.find((o) => o.name === BEARS)?.restrictions).toContain(
      'cantBlock',
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.expect.stack([`${BEARS} (ability)`]);
    g.passAll();
    g.advanceTo('endOfCombat');
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(LORD.name, 'battlefield', { seat: 0 });
  });
});
