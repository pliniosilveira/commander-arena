// "Each creature with one or more counters on it can't attack you or planeswalkers you control unless its
// controller pays {X}, where X is the number of counters on that creature." (the per-counter attack tax).
// Pins: CR 508.1h (the total cost to attack is the sum over the chosen attackers), CR 508.1d (a player is
// never required to pay), CR 122.1 (counters of any kind), CR 506.3 (planeswalkers). SYNTHETIC card.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

const TAX = 'SYNTHETIC Tax Counter';
const BEARS = 'Grizzly Bears';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';

function atAttackers(mountains: number, bears: readonly Record<string, number>[]) {
  const b = scenario().seat(0).library('Island', { count: 4 });
  for (const counters of bears) b.battlefield(BEARS, { counters });
  b.battlefield(...Array.from({ length: mountains }, () => 'Mountain'));
  b.seat(1).library('Island', { count: 4 }).battlefield(TAX);
  const g = b.at('precombatMain', { active: 0 }).build();
  g.advanceTo('declareAttackers', { attack: false });
  return g;
}

describe('per-counter attack tax', () => {
  test('a creature with no counters attacks for free', () => {
    const g = atAttackers(0, [{}]);
    g.act(0).attack(BEARS);
    g.expect.combat({ attackers: [BEARS] });
    g.expect.pending('priority', 0);
  });

  test('a creature with two counters pays {1}{1}', () => {
    const g = atAttackers(3, [{ '+1/+1': 2 }]);
    g.act(0).attack(BEARS);
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error(`expected payMana, got ${d?.kind}`);
    expect(d.purpose).toBe('attackTax');
    expect(d.totalCost).toEqual(['1', '1']);
    expect(d.source).toBe(g.id(TAX));
    g.act(0).payAuto();
    g.expect.combat({ attackers: [BEARS] });
  });

  test('counters of every kind count, and the costs of the attackers add up', () => {
    const g = atAttackers(4, [{ '+1/+1': 1 }, { shield: 1, '-1/-1': 1 }, {}]);
    g.act(0).attack(['Grizzly Bears[0]', 'Grizzly Bears[1]', 'Grizzly Bears[2]']);
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error(`expected payMana, got ${d?.kind}`);
    expect(d.totalCost).toEqual(['1', '1', '1']);
  });

  test('an attack that cannot be paid for is not allowed', () => {
    const g = atAttackers(1, [{ '+1/+1': 2 }]);
    const r = g.act(0).try.declareAttackers([{ attacker: g.id(BEARS) }]);
    expect(r.ok).toBe(false);
  });

  test('the decision names the dearest cost and how many attackers the mana covers', () => {
    const g = atAttackers(2, [{ '+1/+1': 1 }, { '+1/+1': 1 }, { '+1/+1': 1 }]);
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers')
      throw new Error(`expected declareAttackers, got ${d?.kind}`);
    expect(d.attackCosts).toEqual([
      { target: { kind: 'player', seat: 1 }, cost: ['1'], affordable: 2 },
    ]);
  });

  test('planeswalkers of the controller are covered too', () => {
    const b = scenario().seat(0).library('Island', { count: 4 });
    b.battlefield(BEARS, { counters: { '+1/+1': 1 } });
    b.seat(1).library('Island', { count: 4 }).battlefield(TAX, WALKER);
    const g = b.at('precombatMain', { active: 0 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers')
      throw new Error(`expected declareAttackers, got ${d?.kind}`);
    expect(d.attackCosts?.map((c) => c.target.kind).sort()).toEqual(['permanent', 'player']);
  });
});
