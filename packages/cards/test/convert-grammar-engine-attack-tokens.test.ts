// Parsed text is only worth something if the engine runs it as written. These tests import SYNTHETIC cards through the grammar (never through a
// fixture) and play them through applyAction: a token that has its own quoted static abilities ("~ can't block", "Creatures you control attack
// each combat if able.", CR 111.4, 113.1, 508.1d), made for a player other than the controller of the source (CR 111.2: the player who creates a
// token owns it and controls it). Every card name starts with "SYNTHETIC"; the wording is that of the Draconic Dissent cards of the deck
// support request (issue 167).
import { validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const FILLER = Array.from({ length: 12 }, () => 'Mountain');

const mustAttack = (g: ScenarioGame): string[] => {
  const d = g.state.pending;
  if (d?.kind !== 'declareAttackers') throw new Error(`expected declareAttackers, got ${d?.kind}`);
  return [...d.mustAttack].sort();
};

describe('"At the beginning of each opponent\'s end step, that player creates a 1/1 red Goblin creature token with \\"Creatures you control attack each combat if able.\\""', () => {
  const spymaster = parsed(
    'SYNTHETIC Parsed Spymaster',
    'Creature — Goblin Rogue',
    'First strike\nAt the beginning of each opponent\'s end step, that player creates a 1/1 red Goblin creature token with "Creatures you control attack each combat if able."',
    { manaCost: '{2}{R}', colors: ['R'], power: '2', toughness: '1' },
  );

  const table = (seats: 2 | 3) => {
    const b = scenario({ seats })
      .define(spymaster)
      .seat(0)
      .battlefield(spymaster.name, BEARS)
      .library(...FILLER)
      .seat(1)
      .battlefield(ANGEL)
      .library(...FILLER);
    if (seats === 3)
      b.seat(2)
        .battlefield('Typhoid Rats')
        .library(...FILLER);
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('the card is valid', () => {
    expect(validateCard(spymaster)).toEqual([]);
  });

  test("nothing happens at its own controller's end step", () => {
    const g = table(2);
    g.advanceTo('end');
    g.passAll();
    expect(g.events.filter((e) => e.kind === 'tokenCreated')).toEqual([]);
  });

  test("at an opponent's end step that opponent creates the token and controls it, and must then attack with every creature", () => {
    const g = table(2);
    g.advanceTo('end', { turn: 'next' });
    g.passAll();
    g.expect.zone('Goblin', 'battlefield', { seat: 1 });
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    // Seat 0's turn comes first: the token is the opponent's and constrains only its controller's creatures, not the Spymaster's.
    expect(g.state.turn.activeSeat).toBe(0);
    expect(mustAttack(g)).toEqual([]);
    g.act(0).attack(BEARS);
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    expect(g.state.turn.activeSeat).toBe(1);
    expect(mustAttack(g)).toEqual([g.id(ANGEL), g.id('Goblin')].sort());
    expect(g.act(1).try.declareAttackers([]).ok).toBe(false);
  });

  test('with three seats only the opponent whose end step it is gets a token, and only its creatures must attack', () => {
    const g = table(3);
    g.advanceTo('end', { turn: 'next' });
    g.passAll();
    g.expect.zone('Goblin', 'battlefield', { seat: 1 });
    expect(g.state.turn.activeSeat).toBe(1);
    g.advanceTo('end', { turn: 'next' });
    g.passAll();
    g.expect.zone('Goblin', 'battlefield', { seat: 2 });
    // Each token constrains only the creatures of its own controller.
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    expect(g.state.turn.activeSeat).toBe(0);
    expect(mustAttack(g)).toEqual([]);
    g.act(0).declareAttackers([]);
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    expect(g.state.turn.activeSeat).toBe(1);
    expect(mustAttack(g)).toEqual([g.id(ANGEL), g.id({ name: 'Goblin', seat: 1 })].sort());
    // The helper declares the required attackers for seat 1 and stops at seat 2's declaration.
    g.advanceTo('declareAttackers', { turn: 'next' });
    expect(g.state.turn.activeSeat).toBe(2);
    expect(mustAttack(g)).toEqual([g.id('Typhoid Rats'), g.id({ name: 'Goblin', seat: 2 })].sort());
  });
});

describe('"When ~ enters, each opponent creates a 1/1 red Pirate creature token with \\"~ can\'t block\\" and \\"Creatures you control attack each combat if able.\\""', () => {
  const whale = parsed(
    'SYNTHETIC Parsed Whale',
    'Creature — Whale',
    'When ~ enters, each opponent creates a 1/1 red Pirate creature token with "~ can\'t block" and "Creatures you control attack each combat if able."',
    { manaCost: '{5}{U}{U}', colors: ['U'], power: '8', toughness: '8' },
  );

  const cast = () => {
    const g = scenario({ seats: 3 })
      .define(whale)
      .seat(0)
      .hand(whale.name)
      .battlefield(...Array.from({ length: 7 }, () => 'Island'), BEARS)
      .library(...FILLER)
      .seat(1)
      .battlefield(ANGEL)
      .library(...FILLER)
      .seat(2)
      .battlefield('Typhoid Rats')
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(whale.name, { pay: true });
    g.passAll();
    return g;
  };

  test('the card is valid', () => {
    expect(validateCard(whale)).toEqual([]);
  });

  test('each opponent (not the caster) creates and controls a Pirate token', () => {
    const g = cast();
    g.expect.zone('Pirate', 'battlefield', { seat: 1 });
    g.expect.zone('Pirate', 'battlefield', { seat: 2 });
    expect(g.events.filter((e) => e.kind === 'tokenCreated' && e.name === 'Pirate')).toHaveLength(
      2,
    );
  });

  test('each token makes its own controller attack with every creature, and the caster is not affected', () => {
    const g = cast();
    g.advanceTo('declareAttackers', { attack: false });
    expect(mustAttack(g)).toEqual([]);
    g.act(0).declareAttackers([]);
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    expect(g.state.turn.activeSeat).toBe(1);
    expect(mustAttack(g)).toEqual([g.id(ANGEL), g.id({ name: 'Pirate', seat: 1 })].sort());
  });

  test("the token can't block, but another creature of its controller can (CR 509.1b)", () => {
    const g = cast();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(BEARS, { player: 1 });
    g.advanceTo('declareBlockers', { block: false });
    expect(g.act(1).try.declareBlockers([{ blocker: 'Pirate', attacker: BEARS }]).ok).toBe(false);
    expect(g.act(1).try.declareBlockers([{ blocker: ANGEL, attacker: BEARS }]).ok).toBe(true);
  });
});
