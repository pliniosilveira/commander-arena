// Mirkwood Trapper through the grammar as a card with no override and played through applyAction with three seats, so the nodes the parser writes are what the engine runs. The name
// and the lines are the real ones; the mana cost is the printed one. The board is the engine's own fixtures (Grizzly Bears, Healer's Hawk, a SYNTHETIC vanilla planeswalker).
// Pins: CR 508.1b (an attack at a planeswalker is not an attack at its controller), CR 603.2c and 603.4 (a batch of attackers triggers once; the intervening "if" is read from the
// declaration), CR 608.2d ("that player chooses": the attacking player, not the controller of the ability, decides).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk";
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const TRAPPER = parsed(
  'Mirkwood Trapper',
  'Creature — Elf Scout',
  "Whenever a player attacks you, target attacking creature gets -2/-0 until end of turn.\nWhenever a player attacks, if they aren't attacking you, that player chooses an attacking creature. It gets +2/+0 until end of turn.",
  { manaCost: '{1}{G}{U}', colors: ['G', 'U'], power: '2', toughness: '3' },
);

/** Seats 0 and 2 each have a Trapper, seat 0 a planeswalker as well; seat 1 is the active player with the Bears and the Hawk. */
const table = () => {
  const g = scenario({ seats: 3 })
    .define(TRAPPER)
    .seat(0)
    .library(...LIBRARY)
    .battlefield(TRAPPER.name, WALKER)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS, HAWK)
    .seat(2)
    .library(...LIBRARY)
    .battlefield(TRAPPER.name)
    .at('precombatMain', { active: 1 })
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  return g;
};

describe('Mirkwood Trapper (CR 508.1b, 603.4, 608.2d)', () => {
  test('the card is read whole', () => {
    expect(TRAPPER.faces[0]?.abilities).toHaveLength(2);
  });

  test('both attackers hit different defenders: each Trapper shrinks the attacker of its own controller only', () => {
    const g = table();
    g.act(1).declareAttackers([
      { attacker: BEARS, target: { player: 0 } },
      { attacker: HAWK, target: { player: 2 } },
    ]);
    // Seat 2's ability asks for a target first (turn order from the active player), then seat 0's: both attackers are legal for both.
    g.act(2).chooseTargets(HAWK);
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    // Both players were attacked, so neither Trapper has a creature chosen.
    g.expect.pt(BEARS, 0, 2);
    g.expect.pt(HAWK, -1, 1);
  });

  test('an attack at seat 2 only: seat 0 is not attacked, so the attacker (seat 1) chooses for its Trapper', () => {
    const g = table();
    g.act(1).declareAttackers([
      { attacker: BEARS, target: { player: 2 } },
      { attacker: HAWK, target: { player: 2 } },
    ]);
    g.act(2).chooseTargets(HAWK);
    g.passAll();
    expect(g.state.pending?.kind).toBe('choosePermanent');
    expect(g.state.pending?.seat).toBe(1);
    g.act(1).choosePermanents(BEARS);
    g.passAll();
    g.expect.pt(BEARS, 4, 2);
    g.expect.pt(HAWK, -1, 1);
  });

  test("an attack at seat 0's planeswalker is not an attack at seat 0: both Trappers make the attacker choose", () => {
    const g = table();
    g.act(1).declareAttackers([{ attacker: BEARS, target: WALKER }]);
    g.passAll();
    expect(g.state.pending?.seat).toBe(1);
    g.act(1).choosePermanents(BEARS);
    g.passAll();
    expect(g.state.pending?.seat).toBe(1);
    g.act(1).choosePermanents(BEARS);
    g.passAll();
    g.expect.pt(BEARS, 6, 2);
  });
});
