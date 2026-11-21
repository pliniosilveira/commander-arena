// Federation Fleet deck, group F (Chronomantic Escape): "Until your next turn, creatures can't attack you." The effect of a spell: a restriction on a group of creatures that is read whenever
// attackers are declared, so it reaches creatures that are not yet there, and it ends as the next turn of its controller begins.
// Pins (rule numbers the repository's own comments already cite; the rules text is not in this worktree, so none is quoted): CR 508.1a (a creature that can't attack a player is not declared
// attacking it), CR 508.1c (a creature with no one left to attack is not able to attack), CR 506.3 (a player or a planeswalker can be attacked), CR 611.2a and 611.2c (a continuous effect
// of a spell lasts for its duration and a restriction reaches creatures that arrive later), CR 500.1 (the turn it resolves in is not counted: "your next turn").
// Cards: the SYNTHETIC "Day of Quiet" of this file, the SYNTHETIC Vanilla Planeswalker, and the real Grizzly Bears and Llanowar Elves.
import { describe, test } from 'vitest';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const QUIET = 'SYNTHETIC Day of Quiet'; // Until your next turn, creatures can't attack you.
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const quiet = singleFaceCard({
  name: QUIET,
  manaCost: ['1', 'W'],
  types: ['sorcery'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: "Until your next turn, creatures can't attack you.",
  spell: {
    effect: {
      kind: 'creaturesCantAttackYou',
      creatures: { types: ['creature'] },
      duration: 'untilYourNextTurn',
    },
  },
});

/** Seat 0's precombat main phase with the sorcery in hand; seat 1 has the creatures and seat 0 a planeswalker. */
const board = () =>
  scenario()
    .define(quiet)
    .seat(0)
    .hand(QUIET)
    .library(...LIBRARY)
    .battlefield('Plains', 'Plains', WALKER)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS, ELVES)
    .at('precombatMain', { active: 0 })
    .build();

describe('"Until your next turn, creatures can\'t attack you."', () => {
  test('the card is valid', () => {
    const issues = validateCard(quiet);
    if (issues.length > 0) throw new Error(JSON.stringify(issues));
  });

  test("no creature can attack the controller on the opponent's turn (CR 508.1a, 508.1c)", () => {
    const g = board();
    g.act(0).cast(QUIET, { pay: true });
    g.passAll();
    g.expect.zone(QUIET, 'graveyard', { seat: 0 });
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    g.expect.step('declareAttackers', { active: 1 });
    g.expect.illegal(1, { declareAttackers: [{ attacker: BEARS, target: { player: 0 } }] });
    g.expect.illegal(1, { declareAttackers: [{ attacker: ELVES, target: { player: 0 } }] });
    g.expect.invariants();
  });

  test('the planeswalker of the controller can still be attacked (CR 506.3): only the player is protected', () => {
    const g = board();
    g.act(0).cast(QUIET, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    g.expect.legal(1, { declareAttackers: [{ attacker: BEARS, target: WALKER }] });
  });

  test('it ends as the next turn of the controller begins (CR 500.1): the turn after, the creatures attack again', () => {
    const g = board();
    g.act(0).cast(QUIET, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    g.expect.illegal(1, { declareAttackers: [{ attacker: BEARS, target: { player: 0 } }] });
    // Seat 0's next turn begins: the effect has ended; seat 1's turn after it is free.
    g.act(1).declareAttackers([]);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    g.expect.step('declareAttackers', { active: 1 });
    g.expect.legal(1, { declareAttackers: [{ attacker: BEARS, target: { player: 0 } }] });
  });
});
