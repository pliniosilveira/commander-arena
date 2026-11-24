// Draconic Dissent deck (issue 167), goad group: Bothersome Quasit read from its real Oracle text and run by the engine at three seats.
// "Goaded creatures your opponents control can't block." and "Whenever you cast a noncreature spell, goad target creature an opponent controls."
// Pins: CR 701.15a-b (goad, goaded), CR 509.1b (can't block), CR 613.11 (a rules-modifying effect applies after the layers), CR 500.1 (until the goader's next turn).
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const QUASIT = real('Bothersome Quasit');
const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 14 }, () => 'Island');

/**
 * Seat 2's turn, precombat main: seat 0 has Bothersome Quasit and a Bolt; seat 1 has the creatures `a` and `e`; seat 2 has the attacker `b`.
 * With `goad`, seat 0 casts the Bolt on seat 2's face (at their own priority) and the Quasit goads `a`.
 */
function board(goad: boolean): ScenarioGame {
  const b = scenario({ seats: 3 }).define(QUASIT);
  for (let seat = 0; seat < 3; seat += 1) b.seat(seat).library(...FILLER);
  b.seat(0).battlefield(QUASIT.name, 'Mountain').hand('Lightning Bolt');
  b.seat(1).battlefield(BEARS, { label: 'a' }).battlefield(BEARS, { label: 'e' });
  b.seat(2).battlefield(BEARS, { label: 'b' });
  const g = b.at('precombatMain', { active: 2, turn: 3 }).build();
  if (goad) {
    g.pass(2);
    g.act(0).cast('Lightning Bolt', { pay: true, targets: [{ player: 2 }] });
    if (g.state.pending?.kind === 'targets') g.act(0).chooseTargets('a');
    g.passAll();
    if (g.state.pending?.kind === 'targets') g.act(0).chooseTargets('a');
    g.passAll();
  }
  return g;
}

/** Whether the declare blockers decision lists `blocker` as able to block `attacker` (the scenario's own `canBlock` names no player at three seats). */
function canBlock(g: ScenarioGame, blocker: string, attacker: string): boolean {
  const d = g.state.pending;
  if (d?.kind !== 'declareBlockers') return false;
  return (
    d.candidates.find((c) => c.blocker === g.id(blocker))?.canBlock.includes(g.id(attacker)) ??
    false
  );
}

describe('Bothersome Quasit', () => {
  test('a goaded creature of an opponent can not block and another can (CR 701.15b, 509.1b)', () => {
    const g = board(true);
    g.advanceTo('declareAttackers');
    g.act(2).attack('b', { player: 1 });
    g.advanceTo('declareBlockers', { attack: false, block: false });
    expect(g.state.pending?.kind).toBe('declareBlockers');
    expect(canBlock(g, 'a', 'b')).toBe(false);
    expect(canBlock(g, 'e', 'b')).toBe(true);
  });

  test('control: without the goad the same creature can block', () => {
    const g = board(false);
    g.advanceTo('declareAttackers');
    g.act(2).attack('b', { player: 1 });
    g.advanceTo('declareBlockers', { attack: false, block: false });
    expect(canBlock(g, 'a', 'b')).toBe(true);
  });

  test('without the Quasit a goaded creature can block', () => {
    expect(QUASIT.name).toBe('Bothersome Quasit');
    const b = scenario({ seats: 3 });
    for (let seat = 0; seat < 3; seat += 1) b.seat(seat).library(...FILLER);
    b.seat(1).battlefield(BEARS, { label: 'a' });
    b.seat(2).battlefield(BEARS, { label: 'b' });
    const g = b.at('precombatMain', { active: 2, turn: 3 }).build();
    g.advanceTo('declareAttackers');
    g.act(2).attack('b', { player: 1 });
    g.advanceTo('declareBlockers', { attack: false, block: false });
    expect(canBlock(g, 'a', 'b')).toBe(true);
  });
});
