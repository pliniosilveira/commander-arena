// "Whenever your opponents are dealt combat damage, if any of that damage was dealt by a Warrior" with the real text of Mindblade Render (issue 508, "more opponents").
// The official rulings of the card (Scryfall, source wotc, 2018-06-08): its ability "triggers only once, regardless of how many opponents were dealt damage, how much damage they
// were dealt, or how many Warriors dealt damage", and it "triggers if a Warrior an opponent controls deals combat damage to another player who's also your opponent".
// The Warrior here is SYNTHETIC (a vanilla creature with the type); the Render is the real card of the golden corpus.
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const RENDER = real('Mindblade Render');
const WARRIOR = parsed('Test Warrior', 'Creature — Human Warrior', '', {
  manaCost: '{1}',
  power: '2',
  toughness: '2',
});
const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 14 }, () => 'Island');

/** `seats` seats, the Render under seat 0, and `attackers` (label, controller, defender) already on the battlefield; the turn is `active`'s combat. */
function game(
  seats: 2 | 3 | 4,
  active: number,
  attackers: readonly (readonly [label: string, controller: number, kind: 'warrior' | 'bears'])[],
): ScenarioGame {
  const b = scenario({ seats }).define(RENDER).define(WARRIOR);
  for (let seat = 0; seat < seats; seat += 1) b.seat(seat).library(...FILLER);
  b.seat(0).battlefield(RENDER.name);
  for (const [label, controller, kind] of attackers) {
    b.seat(controller).battlefield(kind === 'warrior' ? WARRIOR.name : BEARS, { label });
  }
  return b.at('precombatMain', { active, turn: 3 }).build();
}

function attack(
  g: ScenarioGame,
  seat: number,
  declared: readonly (readonly [label: string, defender: number])[],
): void {
  g.advanceTo('declareAttackers', { attack: false });
  g.act(seat).declareAttackers(
    declared.map(([attacker, player]) => ({ attacker, target: { player } })),
  );
  g.advanceTo('declareBlockers');
  // The defender answers "no blocks" when asked (the Render itself is a creature that could block).
  if (g.state.pending?.kind === 'declareBlockers') g.act(g.deciding).declareBlockers([]);
  g.advanceTo('combatDamage');
  g.passAll();
}

const hand = (g: ScenarioGame, seat: number) => g.state.seats[seat]?.hand.length ?? -1;
const life = (g: ScenarioGame, seat: number) => g.state.seats[seat]?.life ?? -1;

describe('Mindblade Render: one trigger for the whole combat damage event', () => {
  test('2 seats: a Warrior hits the only opponent: one card, 1 life', () => {
    const g = game(2, 0, [['w', 0, 'warrior']]);
    attack(g, 0, [['w', 1]]);
    expect([hand(g, 0), life(g, 0)]).toEqual([1, 39]);
  });

  test('3 seats: two Warriors hit two different opponents: still one card and 1 life', () => {
    const g = game(3, 0, [
      ['w1', 0, 'warrior'],
      ['w2', 0, 'warrior'],
    ]);
    attack(g, 0, [
      ['w1', 1],
      ['w2', 2],
    ]);
    expect([hand(g, 0), life(g, 0)]).toEqual([1, 39]);
  });

  test('4 seats: three Warriors hit three opponents: still one card and 1 life', () => {
    const g = game(4, 0, [
      ['w1', 0, 'warrior'],
      ['w2', 0, 'warrior'],
      ['w3', 0, 'warrior'],
    ]);
    attack(g, 0, [
      ['w1', 1],
      ['w2', 2],
      ['w3', 3],
    ]);
    expect([hand(g, 0), life(g, 0)]).toEqual([1, 39]);
  });

  test('3 seats: a Warrior and a creature that is not one hit two opponents: one trigger', () => {
    const g = game(3, 0, [
      ['w', 0, 'warrior'],
      ['b', 0, 'bears'],
    ]);
    attack(g, 0, [
      ['w', 1],
      ['b', 2],
    ]);
    expect([hand(g, 0), life(g, 0)]).toEqual([1, 39]);
  });

  test('3 seats: only creatures that are not Warriors deal the damage: no trigger', () => {
    const g = game(3, 0, [
      ['b1', 0, 'bears'],
      ['b2', 0, 'bears'],
    ]);
    attack(g, 0, [
      ['b1', 1],
      ['b2', 2],
    ]);
    expect([hand(g, 0), life(g, 0)]).toEqual([0, 40]);
  });

  test("3 seats: a Warrior of one opponent hits the other opponent: it triggers, once (the controller's own seat is not dealt damage)", () => {
    const g = game(3, 1, [['w', 1, 'warrior']]);
    attack(g, 1, [['w', 2]]);
    expect([hand(g, 0), life(g, 0)]).toEqual([1, 39]);
  });

  test('3 seats: a Warrior hits the controller of the Render: no trigger (its controller is not its opponent)', () => {
    const g = game(3, 1, [['w', 1, 'warrior']]);
    attack(g, 1, [['w', 0]]);
    expect([hand(g, 0), life(g, 0)]).toEqual([0, 38]);
  });
});
