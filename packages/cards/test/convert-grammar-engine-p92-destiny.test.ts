// Angel of Destiny (the Bruna deck, D-269): the real Oracle text goes through the grammar as a SYNTHETIC card (never a fixture override), is defined in an engine
// scenario and is played through applyAction, so the AST the parser writes for the real text is what the engine runs: the shared life gain of every creature of
// the controller (double strike deals twice), the end step ability with the intervening "if" (CR 603.4), and the loss of the players the creature attacked (CR 508.6,
// 104.3e). Pins: CR 508.6 (attacked a player), CR 506.3 (a planeswalker is not a player), CR 104.2a (the last player left wins), CR 603.4 (intervening "if").
import { readFileSync } from 'node:fs';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears';
const WALKER = 'SYNTHETIC Loyalty Walker';

const TEXT =
  'Flying, double strike\nWhenever a creature you control deals combat damage to a player, you and that player each gain that much life.\nAt the beginning of your end step, if you have at least 15 life more than your starting life total, each player this creature attacked this turn loses the game.';

const angel = () =>
  parsed('SYNTHETIC Parsed Destiny', 'Creature — Angel Cleric', TEXT, {
    manaCost: '{3}{W}{W}',
    power: '2',
    toughness: '6',
    colors: ['W'],
  });

/** Seat 0 has the angel and the given life in its precombat main phase; seat 1 holds the given board. */
function board(def: ReturnType<typeof angel>, life: number, theirs: string[] = []): ScenarioGame {
  return scenario()
    .define(def)
    .seat(0)
    .life(life)
    .battlefield(def.name, BEARS)
    .library('Plains', 'Plains', 'Plains')
    .seat(1)
    .library('Plains', 'Plains', 'Plains')
    .battlefield(...theirs)
    .seat(0)
    .at('precombatMain', { active: 0 })
    .build();
}

describe('Angel of Destiny, as the parser reads it', () => {
  test('the life it gains takes you 15 above the starting total: the player it attacked loses at the end step', () => {
    const def = angel();
    const g = board(def, 53);
    g.advanceTo('declareAttackers');
    g.act(0).attack(def.name);
    g.advanceTo('end');
    // 2 first-strike and 2 regular damage: 4 life for each player, and 4 lost to the damage, so the opponent is where it was.
    g.expect.life(0, 57);
    g.expect.life(1, 40);
    g.passAll();
    g.expect.hasLost(1, true);
    g.expect.gameOver({ win: 0 });
    g.expect.invariants();
  });

  test('without the 15 the ability does not trigger and the game goes on (CR 603.4)', () => {
    const def = angel();
    const g = board(def, 40);
    g.advanceTo('declareAttackers');
    g.act(0).attack(def.name);
    g.advanceTo('end');
    g.expect.life(0, 44);
    g.expect.stack([]);
    g.passAll();
    g.expect.hasLost(1, false);
  });

  test('the creature that did not attack: the other creatures that did are not what the ability reads', () => {
    const def = angel();
    const g = board(def, 60);
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('end');
    g.passAll();
    g.expect.hasLost(1, false);
    g.expect.life(0, 62);
  });

  test('every creature you control gains the life, with its own damage', () => {
    const def = angel();
    const g = board(def, 40);
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('endOfCombat');
    g.passAll();
    g.expect.life(0, 42);
    g.expect.life(1, 40);
  });

  test('an attack on a planeswalker is not an attack on the player who controls it (CR 506.3, 508.6)', () => {
    const def = angel();
    const g = board(def, 60, [WALKER]);
    g.advanceTo('declareAttackers');
    g.act(0).attack(def.name, WALKER);
    g.advanceTo('end');
    g.passAll();
    g.expect.hasLost(1, false);
    expect(g.state.result).toBeNull();
  });
});

// The emblem of Vraska, Golgari Queen is the other real text of the golden corpus that "loses the game" made readable: its trigger is the same effect for "that
// player", the player the creature damaged. Real data, so the name is the card's own.
describe('Vraska, Golgari Queen: the emblem of its -9', () => {
  const card = parseGolden(
    readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
  ).find((c) => c.name === 'Vraska, Golgari Queen');
  if (card === undefined) throw new Error('Vraska, Golgari Queen is not in the golden corpus');
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  const vraska = imported.definition;

  test('the card reads as supported', () => {
    expect(imported.support.status).toBe('supported');
  });

  test('after the -9, a creature that deals combat damage to a player makes that player lose the game', () => {
    const g = scenario()
      .define(vraska)
      .seat(0)
      .library('Plains', 'Plains', 'Plains')
      .battlefield(BEARS)
      .battlefield(vraska.name, { counters: { loyalty: 9 } })
      .seat(1)
      .library('Plains', 'Plains', 'Plains')
      .seat(0)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(vraska.name, { ability: 2 });
    g.passAll();
    g.expect.zone(vraska.name, 'graveyard', { seat: 0 });
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('combatDamage');
    g.passAll();
    g.expect.hasLost(1, true);
    g.expect.gameOver({ win: 0 });
  });

  test('without the emblem, damage is only damage', () => {
    const g = scenario()
      .define(vraska)
      .seat(0)
      .library('Plains', 'Plains', 'Plains')
      .battlefield(BEARS, vraska.name)
      .seat(1)
      .library('Plains', 'Plains', 'Plains')
      .seat(0)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEARS);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 38);
    g.expect.hasLost(1, false);
  });
});
