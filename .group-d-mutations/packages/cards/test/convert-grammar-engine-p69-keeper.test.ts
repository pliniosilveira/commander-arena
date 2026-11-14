// Keeper of the Accord and the other texts of a step of another player (the Bruna deck, D-263): "that player" of "at the beginning of each
// opponent's end step" is the player whose turn it is, and the intervening "if that player controls more creatures [lands] than you" compares that
// player with the controller. These tests import SYNTHETIC cards through the grammar (never a fixture override), define them in an engine scenario
// and play them through applyAction, so the AST the parser writes for the real text is what the engine runs: the Soldier token, the search filter
// ("basic Plains card", not any land), and the sacrifice, the "unless that player pays" and the life loss of a step of another player.
// Pins: CR 603.2b (the beginning of a step triggers) and CR 102.1 (the active player is the player whose turn it is), CR 603.4 (intervening
// "if"), CR 110.2 (a permanent's controller), CR 701.23 (Search), CR 118.12a (unless a player pays).
import {
  type ChooseCardsDecision,
  type ConfirmOptionalDecision,
  getView,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears';

const KEEPER_TEXT =
  "At the beginning of each opponent's end step, if that player controls more creatures than you, create a 1/1 white Soldier creature token.\nAt the beginning of each opponent's end step, if that player controls more lands than you, you may search your library for a basic Plains card, put it onto the battlefield tapped, then shuffle.";

const keeper = () =>
  parsed('SYNTHETIC Parsed Keeper', 'Creature — Human Soldier', KEEPER_TEXT, {
    manaCost: '{3}{W}',
    power: '3',
    toughness: '4',
    colors: ['W'],
  });

/** Seat 0 has the card and the given library; it is seat 1's second main phase, seat 1 holds the given board. */
function board(def: ReturnType<typeof keeper>, theirs: string[], library: string[] = []) {
  return scenario()
    .define(def)
    .seat(0)
    .battlefield(def.name)
    .library(...(library.length === 0 ? ['Plains', 'Island'] : library))
    .seat(1)
    .library('Plains', 'Plains')
    .battlefield(...theirs)
    .seat(0)
    .at('postcombatMain', { active: 1 })
    .build();
}

describe('Keeper of the Accord, as the parser reads it', () => {
  test('more creatures: a 1/1 white Soldier creature token for the controller', () => {
    const def = keeper();
    const g = board(def, [BEARS, BEARS]);
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Soldier', 'battlefield', { seat: 0, count: 1 });
    const soldier = getView(g.state, 0).battlefield.find((o) => o.name === 'Soldier');
    expect(soldier).toMatchObject({
      types: ['creature'],
      subtypes: ['Soldier'],
      colors: ['W'],
      power: 1,
      toughness: 1,
    });
    g.expect.invariants();
  });

  test('as many creatures: nothing', () => {
    const def = keeper();
    const g = board(def, [BEARS]);
    g.advanceTo('end');
    g.passAll();
    g.expect.noObject('Soldier');
  });

  test('more lands: the search finds only a basic Plains, which comes in tapped', () => {
    const def = keeper();
    const g = board(def, ['Forest', 'Forest'], ['Plains', 'Island', 'Forest']);
    g.advanceTo('end');
    g.passAll();
    g.act(0).accept();
    const d = g.state.pending as ChooseCardsDecision;
    expect(d.kind).toBe('chooseCards');
    // The Island and the Forest of the library are not offered: the filter is the basic Plains card, not any land.
    expect(d.legal).toHaveLength(1);
    g.act(0).chooseCards(d.legal[0] as never);
    g.expect.zone('Plains', 'battlefield', { seat: 0, count: 1 });
    g.expect.zone('Island', 'library', { seat: 0, count: 1 });
    g.expect.invariants();
  });
});

describe('the other texts of a step of another player read "that player" as the player whose turn it is', () => {
  const upkeepCard = (text: string) =>
    parsed('SYNTHETIC Parsed Upkeep Watcher', 'Enchantment', text, {
      manaCost: '{2}{W}',
      colors: ['W'],
    });

  function upkeep(def: ReturnType<typeof upkeepCard>, theirs: string[]) {
    const g = scenario()
      .define(def)
      .seat(0)
      .battlefield(def.name)
      .life(20)
      .library('Plains', 'Island')
      .seat(1)
      .life(20)
      .library('Plains', 'Island')
      .battlefield(...theirs)
      .seat(0)
      .at('end', { active: 0 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    return g;
  }

  test('"that player sacrifices a creature of their choice": the opponent whose turn it is sacrifices', () => {
    const def = upkeepCard(
      "At the beginning of each opponent's upkeep, that player sacrifices a creature of their choice.",
    );
    const g = upkeep(def, [BEARS, 'Llanowar Elves']);
    g.passAll();
    g.expect.pending('choosePermanent', 1);
    g.act(1).choosePermanents('Llanowar Elves');
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('"draw a card unless that player pays {1}": the opponent whose turn it is is asked', () => {
    const def = upkeepCard(
      "At the beginning of each opponent's upkeep, draw a card unless that player pays {1}.",
    );
    const g = upkeep(def, ['Forest']);
    g.passAll();
    g.expect.pending('confirmOptional', 1);
    expect((g.state.pending as ConfirmOptionalDecision).purpose).toBe('unlessPays');
    g.act(1).decline();
    g.expect.handSize(0, 1);
  });

  test('"draw a card unless that player pays {1}": paying stops the draw', () => {
    const def = upkeepCard(
      "At the beginning of each opponent's upkeep, draw a card unless that player pays {1}.",
    );
    const g = upkeep(def, ['Forest']);
    g.passAll();
    g.act(1).accept();
    g.act(1).payAuto();
    g.expect.handSize(0, 0);
  });

  test('"that player loses 1 life": the opponent whose turn it is loses it', () => {
    const def = upkeepCard("At the beginning of each opponent's upkeep, that player loses 1 life.");
    const g = upkeep(def, []);
    g.passAll();
    g.expect.life(1, 19);
    g.expect.life(0, 20);
  });
});

describe('the lands comparison at an upkeep of each player (CR 603.4)', () => {
  test("the controller's own upkeep never triggers a comparison of the controller with itself", () => {
    const def = parsed(
      'SYNTHETIC Parsed Land Tax',
      'Enchantment',
      "At the beginning of each player's upkeep, if that player controls more lands than you, that player loses 1 life.",
      { manaCost: '{2}{W}', colors: ['W'] },
    );
    const g: ScenarioGame = scenario()
      .define(def)
      .seat(0)
      .battlefield(def.name, 'Forest', 'Forest')
      .life(20)
      .library('Plains', 'Island')
      .seat(1)
      .life(20)
      .library('Plains', 'Island')
      .seat(0)
      .at('end', { active: 1 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.expect.life(0, 20);
    g.expect.life(1, 20);
  });
});
