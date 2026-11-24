// Calculating Lich (Party Time deck, issue 170): "Whenever a creature attacks one of your opponents, that player loses 1 life."
// Pins: CR 508.1b and 508.6 (a creature attacks a player only when declared as attacking that player, not their planeswalker),
// CR 603.2 (one trigger for each creature that attacks), "one of your opponents" (a player other than the controller, whoever the attacker is)
// and "that player" (the player attacked, not the attacking player), in a four-player game.
// Cards: the SYNTHETIC "Opponent Drain" of this file, the SYNTHETIC Vanilla Planeswalker and the real Grizzly Bears, Healer's Hawk.
import { describe, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const LICH = 'SYNTHETIC Opponent Drain';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk";
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const lich = singleFaceCard({
  name: LICH,
  manaCost: ['2', 'B'],
  types: ['creature'],
  subtypes: ['Zombie'],
  colors: ['B'],
  colorIdentity: ['B'],
  power: 1,
  toughness: 1,
  oracleText: 'Whenever a creature attacks one of your opponents, that player loses 1 life.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { types: ['creature'] }, at: 'opponent' },
      effect: { kind: 'loseLife', player: { kind: 'triggerAttackedPlayer' }, amount: 1 },
    },
  ],
});

const table = (active: number) =>
  scenario({ seats: 4 })
    .seat(0)
    .define(lich)
    .library(...LIBRARY)
    .battlefield(LICH, BEARS)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS, HAWK)
    .seat(2)
    .library(...LIBRARY)
    .battlefield(WALKER)
    .seat(3)
    .library(...LIBRARY)
    .at('precombatMain', { active })
    .build();

describe('"Whenever a creature attacks one of your opponents, that player loses 1 life"', () => {
  test('my creature attacks one opponent: that opponent, and only that one, loses 1 life', () => {
    const g = table(0);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: BEARS, target: { player: 2 } }]);
    g.passAll();
    g.expect.life(2, 39);
    g.expect.life(1, 40);
    g.expect.life(3, 40);
    g.expect.life(0, 40);
    g.expect.invariants();
  });

  test("another player's creatures attack two players: one trigger for each creature that attacks one of my opponents", () => {
    const g = table(1);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).declareAttackers([
      { attacker: BEARS, target: { player: 3 } },
      { attacker: HAWK, target: { player: 0 } },
    ]);
    // Only the attack on seat 3 is at one of seat 0's opponents; the attack on seat 0 (the controller) is not.
    g.passAll();
    g.expect.life(3, 39);
    g.expect.life(0, 40);
    g.expect.life(1, 40);
    g.expect.invariants();
  });

  test('two creatures at the same opponent trigger twice (CR 603.2)', () => {
    const g = table(1);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).declareAttackers([
      { attacker: BEARS, target: { player: 3 } },
      { attacker: HAWK, target: { player: 3 } },
    ]);
    g.passAll();
    g.expect.life(3, 38);
  });

  test("an attack on an opponent's planeswalker is not an attack on that player (CR 508.6)", () => {
    const g = table(0);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: BEARS, target: WALKER }]);
    g.expect.stack([]);
    g.expect.life(2, 40);
  });

  test('an attack on the controller does not trigger it: the controller is not their own opponent', () => {
    const g = table(1);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).declareAttackers([{ attacker: BEARS, target: { player: 0 } }]);
    g.expect.stack([]);
    g.expect.life(0, 40);
  });
});
