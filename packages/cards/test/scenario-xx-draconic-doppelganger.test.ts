// Draconic Dissent deck (issue 167), copy group: Mocking Doppelganger read from its real Oracle text and run by the engine at three seats.
// "You may have ~ enter as a copy of a creature an opponent controls, except it has \"Other creatures with the same name as ~ are goaded.\""
// Pins: CR 614.12 (enters as a copy), CR 707.9a-b (the exception is part of the copy), CR 201.2 (same name), CR 701.15a-b (goad).
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const DOPPEL = real('Mocking Doppelganger');
const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 14 }, () => 'Island');

/** Seat 0 holds the Doppelganger with four Islands; seats 1 and 2 each control Grizzly Bears, seat 2 also a Serra Angel. */
function board(): ScenarioGame {
  const b = scenario({ seats: 3 }).define(DOPPEL);
  for (let seat = 0; seat < 3; seat += 1) b.seat(seat).library(...FILLER);
  b.seat(0).hand(DOPPEL.name).battlefield('Island', { count: 4 });
  b.seat(1).battlefield(BEARS, { label: 'c' });
  b.seat(2).battlefield(BEARS, { label: 'd' }).battlefield('Serra Angel', { label: 'angel' });
  return b.at('precombatMain', { active: 0, turn: 3 }).build();
}

describe('Mocking Doppelganger', () => {
  test('the lowering is an entersAsCopy of a creature an opponent controls with a static goad of the creatures with its name', () => {
    const replacement = DOPPEL.faces[0]?.abilities.find((a) => a.kind === 'replacement');
    expect(replacement).toMatchObject({
      kind: 'replacement',
      replacement: {
        kind: 'entersAsCopy',
        what: { types: ['creature'], controller: 'opponent' },
        optional: true,
        duration: 'permanent',
        addStatics: [
          {
            kind: 'static',
            static: {
              kind: 'goaded',
              subject: {
                kind: 'filter',
                other: true,
                filter: { types: ['creature'], sameNameAsSource: true },
              },
            },
          },
        ],
      },
    });
  });

  test('only a creature an opponent controls may be copied', () => {
    const g = board();
    g.act(0).cast(DOPPEL.name, { pay: true });
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('choosePermanent');
    if (d?.kind !== 'choosePermanent') return;
    expect(d.purpose).toBe('entersCopy');
    expect(d.legal).toHaveLength(3);
  });

  test('every other creature with the copied name is goaded, whoever controls it, and a creature with another name is not (CR 701.15b, 201.2)', () => {
    const g = board();
    g.act(0).cast(DOPPEL.name, { pay: true });
    g.passAll();
    g.act(0).choosePermanents('c');
    g.expect.pt(`${BEARS}[2]`, 2, 2);
    g.advanceTo('declareAttackers', { attack: false });
    // Seat 1's Bears is goaded by seat 0: it must attack, and not seat 0.
    g.advanceTo('declareAttackers', { attack: false, turn: 'next' });
    expect(g.state.turn.activeSeat).toBe(1);
    expect(() => g.act(1).declareAttackers([])).toThrow();
    expect(() => g.act(1).declareAttackers([{ attacker: 'c', target: { player: 0 } }])).toThrow();
    g.act(1).declareAttackers([{ attacker: 'c', target: { player: 2 } }]);
    g.advanceTo('declareAttackers', { attack: false, turn: 'next' });
    // Seat 2: its Bears must attack, the Angel (another name) need not.
    expect(g.state.turn.activeSeat).toBe(2);
    expect(() => g.act(2).declareAttackers([])).toThrow();
    g.act(2).declareAttackers([{ attacker: 'd', target: { player: 1 } }]);
  });

  test('"you may": declining leaves a 0/0 that dies, and nothing is goaded', () => {
    const g = board();
    g.act(0).cast(DOPPEL.name, { pay: true });
    g.passAll();
    g.act(0).choosePermanents();
    g.advanceTo('declareAttackers', { attack: false });
    g.advanceTo('declareAttackers', { attack: false, turn: 'next' });
    expect(g.state.turn.activeSeat).toBe(1);
    expect(() => g.act(1).declareAttackers([])).not.toThrow();
  });
});
