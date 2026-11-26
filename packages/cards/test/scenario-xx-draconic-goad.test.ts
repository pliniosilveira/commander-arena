// Draconic Dissent deck (issue 167), goad group: Sly Instigator read from its real Oracle text and run by the engine at three seats.
// "{U}, {T}: Until your next turn, target creature an opponent controls can't be blocked. Goad that creature."
// Pins: CR 701.15a-b (goad), CR 509.1b (can't be blocked), CR 611.2a and 611.2c (the duration and the fixed set), CR 500.1 (the next turn of its controller).
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const SLY = real('Sly Instigator');
const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 14 }, () => 'Island');

/** Seat 0 has Sly Instigator and two Islands; seat 1 has the creature `c`, seat 2 the creature `d`. Sly's ability has resolved on `c`. */
function board(activate = true): ScenarioGame {
  const b = scenario({ seats: 3 }).define(SLY);
  for (let seat = 0; seat < 3; seat += 1) b.seat(seat).library(...FILLER);
  b.seat(0).battlefield(SLY.name, 'Island', 'Island');
  b.seat(1).battlefield(BEARS, { label: 'c' });
  b.seat(2).battlefield(BEARS, { label: 'd' });
  const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
  if (activate) {
    g.act(0).activate(SLY.name, { ability: 0, targets: ['c'], pay: true });
    g.passAll();
  }
  return g;
}

describe('Sly Instigator', () => {
  test('the creature is goaded: it attacks a player other than the goader (CR 701.15b)', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false, turn: 'next' });
    expect(g.state.turn.activeSeat).toBe(1);
    expect(() => g.act(1).declareAttackers([])).toThrow();
    g.act(1).declareAttackers([{ attacker: 'c', target: { player: 2 } }]);
  });

  test('the creature can not be blocked until the goader next turn (CR 509.1b, 611.2a)', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false, turn: 'next' });
    g.act(1).declareAttackers([{ attacker: 'c', target: { player: 2 } }]);
    g.advanceTo('declareBlockers', { attack: false, block: false });
    // No creature can block it, so there is no declare blockers decision at all.
    expect(g.state.pending?.kind).not.toBe('declareBlockers');
  });

  test('control: without the ability the same attacker can be blocked', () => {
    const g = board(false);
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([]);
    g.advanceTo('declareAttackers', { attack: false, turn: 'next' });
    g.act(1).declareAttackers([{ attacker: 'c', target: { player: 2 } }]);
    g.advanceTo('declareBlockers', { attack: false, block: false });
    expect(g.state.pending?.kind).toBe('declareBlockers');
  });

  test('the creature is not goaded and can be blocked once the goader next turn has begun (CR 500.1)', () => {
    const g = board();
    // Seat 1, seat 2, then seat 0's turn: the effects end as it begins.
    g.advanceTo('declareAttackers', { attack: false, turn: 'next' });
    g.act(1).declareAttackers([{ attacker: 'c', target: { player: 2 } }]);
    g.advanceTo('declareAttackers', { attack: false, turn: 'next' });
    expect(g.state.turn.activeSeat).toBe(2);
    g.act(2).declareAttackers([]);
    g.advanceTo('declareAttackers', { attack: false, turn: 'next' });
    expect(g.state.turn.activeSeat).toBe(0);
    g.act(0).declareAttackers([]);
    g.advanceTo('declareAttackers', { attack: false, turn: 'next' });
    expect(g.state.turn.activeSeat).toBe(1);
    expect(() => g.act(1).declareAttackers([])).not.toThrow();
  });
});
