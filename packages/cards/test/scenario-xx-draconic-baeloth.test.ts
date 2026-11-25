// Draconic Dissent deck (issue 167), goad group: Baeloth Barrityl read from its real Oracle text and run by the engine at three seats.
// "Creatures your opponents control with power less than ~'s power are goaded." and "Whenever a goaded attacking or blocking creature dies, you create a Treasure token."
// Pins: CR 701.15a-b (goad), CR 208.1 (power), CR 613.4 (the power each creature has after layer 7), CR 604.1 (a static ability).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const BAELOTH = real('Baeloth Barrityl, Entertainer');
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const FILLER = Array.from({ length: 14 }, () => 'Island');

describe('Baeloth Barrityl, Entertainer', () => {
  test('the lowering is a static goad of the opponents creatures with power less than its own', () => {
    expect(BAELOTH.faces[0]?.abilities).toContainEqual({
      kind: 'static',
      static: {
        kind: 'goaded',
        subject: {
          kind: 'filter',
          filter: { types: ['creature'], controller: 'opponent', powerLessThanSource: true },
        },
      },
    });
  });

  test('a creature with less power than Baeloth must attack and not its goader; one with equal power need not (CR 701.15a, 208.1)', () => {
    const b = scenario({ seats: 3 }).define(BAELOTH);
    for (let seat = 0; seat < 3; seat += 1) b.seat(seat).library(...FILLER);
    b.seat(0).battlefield(BAELOTH.name);
    b.seat(1).battlefield(ELVES, { label: 'elf' });
    b.seat(2).battlefield(BEARS);
    const g = b.at('precombatMain', { active: 1, turn: 3 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    expect(() => g.act(1).declareAttackers([])).toThrow();
    expect(() => g.act(1).declareAttackers([{ attacker: 'elf', target: { player: 0 } }])).toThrow();
    g.act(1).declareAttackers([{ attacker: 'elf', target: { player: 2 } }]);
  });

  test('a creature with power equal to Baeloth is not goaded', () => {
    const b = scenario({ seats: 3 }).define(BAELOTH);
    for (let seat = 0; seat < 3; seat += 1) b.seat(seat).library(...FILLER);
    b.seat(0).battlefield(BAELOTH.name);
    b.seat(1).battlefield(BEARS);
    const g = b.at('precombatMain', { active: 1, turn: 3 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    expect(() => g.act(1).declareAttackers([])).not.toThrow();
  });

  test('a creature of the controller of Baeloth is not goaded', () => {
    const b = scenario({ seats: 3 }).define(BAELOTH);
    for (let seat = 0; seat < 3; seat += 1) b.seat(seat).library(...FILLER);
    b.seat(0).battlefield(BAELOTH.name).battlefield(ELVES);
    b.seat(1).battlefield(BEARS);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    expect(() => g.act(0).declareAttackers([])).not.toThrow();
  });

  test('two Baeloths do not loop: each goads the creatures with less power than it (CR 613.4)', () => {
    const b = scenario({ seats: 3 }).define(BAELOTH);
    for (let seat = 0; seat < 3; seat += 1) b.seat(seat).library(...FILLER);
    b.seat(0).battlefield(BAELOTH.name);
    b.seat(1).battlefield(BAELOTH.name);
    b.seat(2).battlefield(ELVES, { label: 'elf' });
    const g = b.at('precombatMain', { active: 2, turn: 3 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    expect(() => g.act(2).declareAttackers([])).toThrow();
    g.act(2).declareAttackers([{ attacker: 'elf', target: { player: 1 } }]);
  });
});
