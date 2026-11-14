// Who "you" and "your" are in the sentences that ask another player (D-287, CR 608.2d, 603.7, 101.4): the texts are SYNTHETIC. "Each opponent may return it ... at the
// beginning of your next upkeep" is not read (the engine would run it with the asked player as "you"); the two shapes that are read are played through applyAction to
// show the delayed ability belongs to the player the text means: "may have you" (the controller acts, at their own upkeep) and a clause with no "your" ("each opponent may draw a
// card at the beginning of the next turn's upkeep": the asked player is "you" in it, and draws).
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = Array.from({ length: 30 }, () => 'Island');
const RETURN =
  "return it to the battlefield under its owner's control at the beginning of your next upkeep";

const card = (text: string) =>
  parsed('SYNTHETIC Dying Bear', 'Creature — Bear', text, {
    manaCost: '{1}{G}',
    power: '2',
    toughness: '2',
  });

/** Seat 0 controls the creature and bolts it at its own precombat main phase (turn 3); the ability goes on the stack and is resolved up to the question. */
function bolted(text: string) {
  const bear = card(text);
  const g = scenario()
    .define(bear)
    .seat(0)
    .hand('Lightning Bolt')
    .battlefield('Mountain')
    .battlefield(bear.name)
    .library(...FILLER)
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  g.act(0).cast('Lightning Bolt', { targets: [bear.name], pay: true });
  g.pass();
  g.pass();
  g.expect.stack([`${bear.name} (ability)`]);
  g.pass();
  g.pass();
  return { g, bear };
}

describe('"each opponent may have you return it ... at the beginning of your next upkeep"', () => {
  test("the opponent is asked, the controller gets the card back at the controller's upkeep and not at the opponent's", () => {
    const { g, bear } = bolted(`When ~ dies, each opponent may have you ${RETURN}.`);
    g.act(1).accept();
    g.expect.zone(bear.name, 'graveyard', { seat: 0 });
    g.advanceTo('upkeep', { turn: 4 });
    g.pass();
    g.pass();
    g.expect.zone(bear.name, 'graveyard', { seat: 0 });
    g.advanceTo('upkeep', { turn: 5 });
    g.pass();
    g.pass();
    g.expect.zone(bear.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('declined, it stays in the graveyard', () => {
    const { g, bear } = bolted(`When ~ dies, each opponent may have you ${RETURN}.`);
    g.act(1).decline();
    g.advanceTo('upkeep', { turn: 5 });
    g.pass();
    g.pass();
    g.expect.zone(bear.name, 'graveyard', { seat: 0 });
  });
});

describe('"each opponent may draw a card at the beginning of the next turn\'s upkeep"', () => {
  test('the player asked is "you" in the clause: they draw it, at the next upkeep, and the controller does not', () => {
    const { g } = bolted(
      "When ~ dies, each opponent may draw a card at the beginning of the next turn's upkeep.",
    );
    g.act(1).accept();
    g.advanceTo('upkeep', { turn: 4 });
    g.pass();
    g.pass();
    g.expect.handSize(1, 1);
    g.expect.librarySize(1, 29);
    g.expect.librarySize(0, 30);
    g.expect.invariants();
  });
});
