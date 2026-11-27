// "Creatures can't attack you or planeswalkers you control unless their controller pays {X} for each of those
// creatures, where X is the number of enchantments you control." (the X attack tax; SYNTHETIC card).
// Pins: CR 508.1h (the total cost of the attackers, X read as they are declared), CR 508.1d (a player is
// never required to pay), CR 506.3 (planeswalkers), CR 101.4 / 800.4 (several opponents: each taxes only the
// attacks on its own controller).
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

const TAX = 'SYNTHETIC Tax Enchantments';
const BEARS = 'Grizzly Bears';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const OTHER_ENCHANTMENT = 'SYNTHETIC Wandering Path';

function setup(mountains: number, seat1: readonly string[]) {
  const b = scenario({ seats: 3 }).seat(0).library('Island', { count: 4 });
  b.battlefield(BEARS, BEARS);
  b.battlefield(...Array.from({ length: mountains }, () => 'Mountain'));
  b.seat(1)
    .library('Island', { count: 4 })
    .battlefield(...seat1);
  b.seat(2).library('Island', { count: 4 }).battlefield(TAX);
  const g = b.at('precombatMain', { active: 0 }).build();
  g.advanceTo('declareAttackers', { attack: false });
  return g;
}

function payment(g: ReturnType<typeof setup>) {
  const d = g.state.pending;
  if (d?.kind !== 'payMana') throw new Error(`expected payMana, got ${d?.kind}`);
  return d;
}

describe('the X attack tax', () => {
  test('X is the number of enchantments its controller controls: {1} for each, for each attacker', () => {
    const g = setup(4, [TAX, OTHER_ENCHANTMENT]);
    g.act(0).attack(['Grizzly Bears[0]', 'Grizzly Bears[1]'], { player: 1 });
    const d = payment(g);
    expect(d.purpose).toBe('attackTax');
    // Two enchantments, two attackers.
    expect(d.totalCost).toEqual(['1', '1', '1', '1']);
    g.act(0).payAuto();
    g.expect.combat({ attackers: ['Grizzly Bears[0]', 'Grizzly Bears[1]'] });
  });

  test('X counts only the enchantments of the controller of the tax', () => {
    const g = setup(1, [TAX]);
    g.act(0).attack('Grizzly Bears[0]', { player: 1 });
    expect(payment(g).totalCost).toEqual(['1']);
  });

  test('the tax of seat 2 does not touch an attack on seat 1 (3 seats)', () => {
    const g = setup(0, [OTHER_ENCHANTMENT]);
    g.act(0).attack('Grizzly Bears[0]', { player: 1 });
    g.expect.combat({ attackers: ['Grizzly Bears[0]'] });
  });

  test('an attack on seat 2 that cannot be paid for is not allowed (CR 508.1d)', () => {
    const g = setup(0, [OTHER_ENCHANTMENT]);
    const r = g
      .act(0)
      .try.declareAttackers([{ attacker: g.id('Grizzly Bears[0]'), target: { player: 2 } }]);
    expect(r.ok).toBe(false);
  });

  test('with no enchantments the tax is nothing', () => {
    const b = scenario({ seats: 3 }).seat(0).library('Island', { count: 4 });
    b.battlefield(BEARS);
    b.seat(1).library('Island', { count: 4 });
    b.seat(2).library('Island', { count: 4 }).battlefield(TAX);
    const g = b.at('precombatMain', { active: 0 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(BEARS, { player: 1 });
    g.expect.combat({ attackers: [BEARS] });
  });

  test('planeswalkers of the controller are taxed the same way', () => {
    const b = scenario({ seats: 3 }).seat(0).library('Island', { count: 4 });
    b.battlefield(BEARS, 'Mountain');
    b.seat(1).library('Island', { count: 4 }).battlefield(TAX, WALKER);
    b.seat(2).library('Island', { count: 4 });
    const g = b.at('precombatMain', { active: 0 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(BEARS, WALKER);
    expect(payment(g).totalCost).toEqual(['1']);
  });
});
