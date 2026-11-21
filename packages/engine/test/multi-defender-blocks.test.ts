// Issue 414 (part of 363): each defending player declares blockers, in turn order, for the attackers aimed at them.
// Pins: CR 509.1 (the defending player declares blockers; with several, in APNAP order from the active player), CR 508.5 (defending player),
// CR 509.1h (an attacker with no blocker is unblocked), CR 603.2 (the trigger of the declare blockers step), CR 509.1c (must be blocked if able).
import { describe, expect, test } from 'vitest';
import type { Ability } from '../src/ast/types';
import { singleFace } from '../src/cards/fixtures/helpers';
import { scenario } from '../src/testing/index';

const BEARS = 'Grizzly Bears';
const GOBLIN = 'Raging Goblin';
const WALL = 'SYNTHETIC Brick Wall';
const GEM = 'SYNTHETIC Greedy Gem';
const FILLER = Array.from({ length: 20 }, () => 'Island');

const MUST_BE_BLOCKED: Ability = {
  kind: 'static',
  static: { kind: 'restriction', subject: { kind: 'this' }, restriction: 'mustBeBlocked' },
};
const MUST_BE_BLOCKED_BEAR = singleFace({
  name: 'SYNTHETIC Multi Must Be Blocked Bear',
  manaCost: ['1', 'G'],
  types: ['creature'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 2,
  toughness: 2,
  oracleText: 'test',
  abilities: [MUST_BE_BLOCKED],
});

/** Three seats, seat 0 active with `attackers`; seats 1 and 2 each own a wall (and seat 2 `extra`). */
function game(attackers: readonly string[], extra: readonly string[] = [], seat2Wall = true) {
  const b = scenario({ seats: 3 }).define(MUST_BE_BLOCKED_BEAR).seat(0);
  for (const a of attackers) b.battlefield(a);
  b.library(...FILLER).seat(1);
  b.battlefield(WALL)
    .library(...FILLER)
    .seat(2);
  if (seat2Wall) b.battlefield(WALL);
  for (const e of extra) b.battlefield(e);
  b.library(...FILLER);
  return b.at('precombatMain', { active: 0 }).build();
}

type G = ReturnType<typeof game>;

/** The declarations reported since `mark`: the seat and how many blocks each holds. */
const declared = (g: G, mark: number) =>
  g.events
    .slice(mark)
    .flatMap((e) =>
      e.kind === 'blockersDeclared' ? [{ seat: e.seat, blocks: e.blocks.length }] : [],
    );

describe('several defending players', () => {
  test('attacking only seat 2: the declare blockers decision is seat 2’s, not seat 1’s', () => {
    const g = game([BEARS]);
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: BEARS, target: { player: 2 } }]);
    g.advanceTo('declareBlockers', { block: false });
    expect(g.state.pending?.kind).toBe('declareBlockers');
    expect(g.state.pending?.seat).toBe(2);
  });

  test('attacking two players: each declares for its own attacker, in turn order', () => {
    const g = game([BEARS, GOBLIN]);
    const mark = g.mark();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([
      { attacker: BEARS, target: { player: 1 } },
      { attacker: GOBLIN, target: { player: 2 } },
    ]);
    g.advanceTo('declareBlockers', { block: false });
    const first = g.state.pending;
    if (first?.kind !== 'declareBlockers') throw new Error('expected declareBlockers');
    expect(first.seat).toBe(1);
    expect(first.attackers.map((a) => a.attacker)).toHaveLength(1);
    g.act(1).declareBlockers([{ blocker: WALL, attacker: BEARS }]);
    const second = g.state.pending;
    if (second?.kind !== 'declareBlockers') throw new Error('expected declareBlockers');
    expect(second.seat).toBe(2);
    expect(second.attackers).toHaveLength(1);
    g.act(2).declareBlockers([{ blocker: WALL, attacker: GOBLIN }]);
    expect(g.state.combat?.blocks).toHaveLength(2);
    expect(declared(g, mark)).toEqual([
      { seat: 1, blocks: 1 },
      { seat: 2, blocks: 1 },
    ]);
    expect(g.state.pending?.kind).toBe('priority');
    expect(g.state.pending?.seat).toBe(0);
  });

  test('a defender who cannot block gets an empty declaration and is not asked', () => {
    const g = game([BEARS, GOBLIN], [], false);
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([
      { attacker: BEARS, target: { player: 1 } },
      { attacker: GOBLIN, target: { player: 2 } },
    ]);
    const mark = g.mark();
    g.advanceTo('declareBlockers', { block: false });
    expect(g.state.pending?.seat).toBe(1);
    g.act(1).declareBlockers([]);
    expect(g.state.pending?.kind).toBe('priority');
    expect(declared(g, mark)).toEqual([
      { seat: 1, blocks: 0 },
      { seat: 2, blocks: 0 },
    ]);
  });

  test('"attack you and aren’t blocked" triggers once for the seat that was attacked', () => {
    const g = game([BEARS, GOBLIN], [GEM], false);
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([
      { attacker: BEARS, target: { player: 1 } },
      { attacker: GOBLIN, target: { player: 2 } },
    ]);
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).declareBlockers([]);
    g.passAll();
    g.expect.handSize(0, 2);
  });

  test('a "must be blocked" attacker aimed at seat 1 is not in seat 2’s decision or duty', () => {
    const g = game([MUST_BE_BLOCKED_BEAR.name, GOBLIN]);
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([
      { attacker: MUST_BE_BLOCKED_BEAR.name, target: { player: 1 } },
      { attacker: GOBLIN, target: { player: 2 } },
    ]);
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).declareBlockers([{ blocker: WALL, attacker: MUST_BE_BLOCKED_BEAR.name }]);
    const second = g.state.pending;
    if (second?.kind !== 'declareBlockers') throw new Error('expected declareBlockers');
    expect(second.seat).toBe(2);
    expect(second.attackers.map((a) => a.mustBeBlocked)).not.toContain(true);
    expect(g.act(2).try.declareBlockers([])).toMatchObject({ ok: true });
  });
});

describe('one opponent', () => {
  test('a two-seat game still asks the defender once and gives priority to the attacker', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS)
      .seat(1)
      .battlefield(WALL)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('declareBlockers', { block: false });
    expect(g.state.pending?.seat).toBe(1);
    g.act(1).declareBlockers([]);
    expect(g.state.pending?.seat).toBe(0);
  });
});
