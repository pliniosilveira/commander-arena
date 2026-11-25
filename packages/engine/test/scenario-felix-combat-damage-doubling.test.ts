// "If a creature you control dealing combat damage to a player causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time."
// (Felix Five-Boots): the static `doubleTriggers` with the cause `creatureDealsCombatDamageToPlayer`.
// Pins: CR 603.2d (an additional time), CR 510.2 (combat damage), CR 603.2c (one trigger for each source). Played with three seats.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-felix.ts).
import { describe, expect, test } from 'vitest';
import { checkInvariants, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const DOUBLER = 'SYNTHETIC Hit Doubler';
const ANY_HIT = 'SYNTHETIC Any Hit Watcher'; // any creature deals combat damage to a player: gain 1
const ANYTHING_HIT = 'SYNTHETIC Anything Hit Watcher'; // a creature you control deals combat damage to anything: gain 1
const BATCH_HIT = 'SYNTHETIC Batch Hit Watcher'; // one or more creatures you control deal combat damage to a player: gain 1
const V22 = 'SYNTHETIC Vanilla 2/2';
const V33 = 'SYNTHETIC Vanilla 3/3';

describe('the cards are valid', () => {
  test.each([DOUBLER, ANY_HIT, ANYTHING_HIT, BATCH_HIT])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

type Game = ReturnType<ReturnType<typeof scenario>['build']>;

/** Three seats. Seat 0 has the doubler and `mine`; `theirs` are seat 1's permanents; seat 0 attacks seat 1 with `attackers`, and seat 1's `blockers` block the first attacker. */
function attack(
  mine: readonly string[],
  attackers: readonly string[],
  theirs: readonly string[] = [],
  blockers: readonly string[] = [],
): Game {
  const g = scenario({ seats: 3 })
    .seat(0)
    .life(20)
    .battlefield(...mine, ...attackers)
    .seat(1)
    .life(20)
    .battlefield(...theirs, ...blockers)
    .seat(2)
    .life(20)
    .at('precombatMain', { active: 0 })
    .build();
  g.advanceTo('declareAttackers');
  g.act(0).declareAttackers(
    attackers.map((name) => ({ attacker: { name, seat: 0 as const }, target: { player: 1 } })),
  );
  g.advanceTo('declareBlockers');
  if (g.state.pending?.kind === 'declareBlockers') {
    g.act(1).declareBlockers(
      blockers.map((name) => ({
        blocker: { name, seat: 1 as const },
        attacker: { name: attackers[0] as string, seat: 0 as const },
      })),
    );
  }
  g.advanceTo('combatDamage');
  const d = g.state.pending;
  if (d?.kind === 'orderTriggers') g.act(d.seat).orderTriggers(...d.triggers.map((_, i) => i));
  return g;
}

function gained(g: Game, seat: 0 | 1 | 2 = 0): number {
  const before = g.state.seats[seat]?.life ?? 0;
  g.passAll();
  return (g.state.seats[seat]?.life ?? 0) - before;
}

describe('a creature you control deals combat damage to a player (CR 603.2d, 510.2)', () => {
  test('a trigger of that damage triggers twice', () => {
    const g = attack([DOUBLER, ANY_HIT], [V22]);
    expect(g.state.stack).toHaveLength(2);
    expect(gained(g)).toBe(2);
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('each damaging creature is its own cause', () => {
    const g = attack([DOUBLER, ANY_HIT], [V22, V33]);
    expect(g.state.stack).toHaveLength(4);
    expect(gained(g)).toBe(4);
  });

  test('a batch trigger of creatures you control triggers twice', () => {
    const g = attack([DOUBLER, BATCH_HIT], [V22, V33]);
    expect(g.state.stack).toHaveLength(2);
    expect(gained(g)).toBe(2);
  });

  test('two doublers make three triggers', () => {
    const g = attack([DOUBLER, DOUBLER, ANY_HIT], [V22]);
    expect(g.state.stack).toHaveLength(3);
    expect(gained(g)).toBe(3);
  });

  test('without the doubler it triggers once', () => {
    const g = attack([ANY_HIT], [V22]);
    expect(g.state.stack).toHaveLength(1);
  });

  test('damage dealt to a creature is not a cause (the trigger is not doubled)', () => {
    const g = attack([DOUBLER, ANYTHING_HIT], [V33], [], [V22]);
    // The blocked attacker damages a creature: one trigger, not two.
    expect(g.state.stack).toHaveLength(1);
  });

  test("another player's creature dealing damage to a player is not a cause", () => {
    // Seat 1's creature hits seat 2; seat 0's watcher sees it, but the damaging creature is not seat 0's.
    const g = scenario({ seats: 3 })
      .seat(0)
      .life(20)
      .battlefield(DOUBLER, ANY_HIT)
      .seat(1)
      .life(20)
      .battlefield(V22)
      .seat(2)
      .life(20)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).declareAttackers([
      { attacker: { name: V22, seat: 1 as const }, target: { player: 2 } },
    ]);
    g.advanceTo('combatDamage');
    expect(g.state.stack).toHaveLength(1);
  });
});
