// The Gisa deck (issue 41), group 1 (D-1400): Afflict N (CR 702.130) and a group that is given it ("Other Zombies you control have afflict 3", Lost Monarch of Ifnir).
// Pins: CR 702.130a (a triggered ability: whenever this creature becomes blocked, defending player loses N life), CR 702.130b (each instance triggers separately: a
// creature with two instances triggers twice), CR 509.3c (a creature becomes blocked once however many creatures block it), CR 508.5 (the defending player is the player the
// creature attacks), CR 613.1f (a granted keyword is a layer 6 effect that ends when the permanent leaves, CR 611.3a) and CR 603.2 (an unblocked creature does not trigger it).
// Cards: the SYNTHETIC cards of src/cards/fixtures/synthetic-gisa-g1.ts, Grizzly Bears and the basic lands.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';

const MONARCH = 'SYNTHETIC Afflict Monarch'; // 4/4 {3}{B}: afflict 3 and Zombies you control have it
const ZOMBIE = 'SYNTHETIC Gisa Zombie'; // 2/2 {1}{B}
const BEARS = 'Grizzly Bears'; // 2/2
const AFFLICTED = 'SYNTHETIC Test Afflicted'; // 2/2 afflict 2 (a printed keyword on its own)

const afflicted = singleFace({
  name: AFFLICTED,
  manaCost: ['1', 'B'],
  types: ['creature'],
  subtypes: ['Rogue'],
  colors: ['B'],
  colorIdentity: ['B'],
  power: 2,
  toughness: 2,
  oracleText: 'Afflict 2',
  abilities: [{ kind: 'keyword', keyword: { kind: 'afflict', count: 2 } }],
});

const LIBRARY = ['Island', 'Island', 'Island', 'Island'] as const;

/** Seat 0 attacks with `attackers`; seat 1 has `defenders` and is asked to block. */
function attacked(
  attackers: readonly string[],
  defenders: readonly string[],
  refs: readonly string[] = attackers,
): ScenarioGame {
  const g = scenario()
    .seat(0)
    .define(afflicted)
    .library(...LIBRARY)
    .battlefield(...attackers)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(...defenders)
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).attack(refs);
  g.advanceTo('declareBlockers', { block: false });
  return g;
}

describe('CR 702.130a (Afflict): whenever this creature becomes blocked, defending player loses N life', () => {
  test('blocked: the trigger goes on the stack and the defending player loses 2 life as it resolves', () => {
    const g = attacked([AFFLICTED], [BEARS]);
    g.act(1).declareBlockers([{ blocker: BEARS, attacker: AFFLICTED }]);
    g.expect.stack([`${AFFLICTED} (ability)`]);
    g.expect.life(1, 40);
    g.passAll();
    g.expect.life(1, 38);
    g.expect.life(0, 40);
    g.expect.invariants();
  });

  test('unblocked: nothing triggers and the defending player loses only the combat damage', () => {
    const g = attacked([AFFLICTED], [BEARS]);
    g.act(1).declareBlockers([]);
    expect(g.state.pendingTriggers).toHaveLength(0);
    g.expect.stack([]);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 38); // 2 combat damage, not 2 + 2
  });

  test('two creatures block it: it becomes blocked once, so the player loses life once (CR 509.3c)', () => {
    const g = attacked([AFFLICTED], [BEARS, BEARS]);
    g.act(1).declareBlockers([
      { blocker: { name: BEARS, nth: 0 }, attacker: AFFLICTED },
      { blocker: { name: BEARS, nth: 1 }, attacker: AFFLICTED },
    ]);
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    g.expect.life(1, 38);
  });

  test('the life is lost even when the blocker would not have been able to stop the damage (it is not damage)', () => {
    const g = attacked([AFFLICTED], [BEARS]);
    g.act(1).declareBlockers([{ blocker: BEARS, attacker: AFFLICTED }]);
    g.passAll();
    g.expect.life(1, 38);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 38); // blocked, so no combat damage to the player
  });

  test('the attacker may leave before the trigger resolves: the defending player is no one any more and nothing breaks', () => {
    const g = scenario()
      .seat(0)
      .define(afflicted)
      .library(...LIBRARY)
      .battlefield(AFFLICTED)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, 'Mountain')
      .hand('Lightning Bolt')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([AFFLICTED]);
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).declareBlockers([{ blocker: BEARS, attacker: AFFLICTED }]);
    g.expect.stack([`${AFFLICTED} (ability)`]);
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [AFFLICTED], pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(AFFLICTED, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});

describe('CR 702.130b: each instance of afflict triggers separately', () => {
  test('a creature with two instances triggers twice and the player loses the sum', () => {
    const twice = singleFace({
      name: 'SYNTHETIC Test Double Afflict',
      manaCost: ['1', 'B'],
      types: ['creature'],
      colors: ['B'],
      colorIdentity: ['B'],
      power: 2,
      toughness: 2,
      oracleText: 'Afflict 2. Afflict 2.',
      abilities: [
        { kind: 'keyword', keyword: { kind: 'afflict', count: 2 } },
        { kind: 'keyword', keyword: { kind: 'afflict', count: 2 } },
      ],
    });
    const g = scenario()
      .seat(0)
      .define(twice)
      .library(...LIBRARY)
      .battlefield('SYNTHETIC Test Double Afflict')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(['SYNTHETIC Test Double Afflict']);
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).declareBlockers([{ blocker: BEARS, attacker: 'SYNTHETIC Test Double Afflict' }]);
    expect(g.state.stack).toHaveLength(2);
    g.passAll();
    g.expect.life(1, 36);
  });

  test('a creature given afflict while it has it printed has two instances (the printed one and the granted one)', () => {
    // Two Monarchs: each has its own afflict 3 and is given afflict 3 by the other ("Other Zombies you control").
    const g = attacked(
      [MONARCH, MONARCH],
      [BEARS, BEARS],
      ['SYNTHETIC Afflict Monarch[0]', 'SYNTHETIC Afflict Monarch[1]'],
    );
    const monarch = g.id('SYNTHETIC Afflict Monarch[0]');
    const kinds = derive(g.state, g.state.objects[monarch] as never).abilities.filter(
      (a) => a.kind === 'keyword' && a.keyword.kind === 'afflict',
    );
    expect(kinds).toHaveLength(2);
    g.act(1).declareBlockers([
      { blocker: 'Grizzly Bears[0]', attacker: 'SYNTHETIC Afflict Monarch[0]' },
    ]);
    // Two instances on the blocked Monarch: two triggers, 3 life each.
    expect(g.state.stack).toHaveLength(2);
    g.passAll();
    g.expect.life(1, 34);
  });
});

describe('CR 613.1f, 702.130a: "Other Zombies you control have afflict 3"', () => {
  test('a Zombie of the controller that becomes blocked makes the defender lose 3 life; the Monarch has it printed', () => {
    const g = attacked([MONARCH, ZOMBIE], [BEARS, BEARS]);
    g.act(1).declareBlockers([{ blocker: { name: BEARS, nth: 0 }, attacker: ZOMBIE }]);
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    g.expect.life(1, 37);
  });

  test('the Monarch itself is blocked: its own afflict 3 triggers once (the group says "other")', () => {
    const g = attacked([MONARCH, ZOMBIE], [BEARS, BEARS]);
    g.act(1).declareBlockers([{ blocker: { name: BEARS, nth: 0 }, attacker: MONARCH }]);
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    g.expect.life(1, 37);
  });

  test('a creature that is not a Zombie does not have it', () => {
    const g = attacked([MONARCH, BEARS], [ZOMBIE, ZOMBIE]);
    g.act(1).declareBlockers([{ blocker: { name: ZOMBIE, nth: 0 }, attacker: BEARS }]);
    expect(g.state.stack).toHaveLength(0);
    g.expect.life(1, 40);
  });

  test('a Zombie the defending player controls does not get it ("you control"), and the opponent\'s Zombie has no afflict', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(MONARCH)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(ZOMBIE)
      .build();
    const zombie = g.state.objects[g.id({ name: ZOMBIE, seat: 1 })];
    if (zombie === undefined) throw new Error('no zombie');
    const has = derive(g.state, zombie).abilities.some(
      (a) => a.kind === 'keyword' && a.keyword.kind === 'afflict',
    );
    expect(has).toBe(false);
  });

  test('the grant ends when the Monarch leaves the battlefield', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(MONARCH, ZOMBIE, 'Swamp', 'Swamp', 'Swamp')
      .hand('Murder')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .build();
    const zombie = () => g.state.objects[g.id({ name: ZOMBIE, seat: 0 })];
    const afflicts = () =>
      derive(g.state, zombie() as never).abilities.filter(
        (a) => a.kind === 'keyword' && a.keyword.kind === 'afflict',
      ).length;
    expect(afflicts()).toBe(1);
    g.act(0).cast('Murder', { targets: [MONARCH], pay: true });
    g.passAll();
    g.expect.zone(MONARCH, 'graveyard', { seat: 0 });
    expect(afflicts()).toBe(0);
  });
});
