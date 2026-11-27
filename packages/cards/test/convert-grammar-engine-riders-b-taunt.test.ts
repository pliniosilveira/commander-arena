// The Riders of Rohan deck, group B: the REAL Oracle text of Taunt from the Rampart (the corpus's golden.jsonl) goes through the grammar as a card with no override, is defined in an engine
// scenario and is played through applyAction. Every test runs with three or four seats: the creatures of every opponent are goaded, not those of the only one.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 14 }, () => 'Island');
const TAUNT = real('Taunt from the Rampart');
// SYNTHETIC: vigilance keeps a creature that must attack (goaded) untapped, so it is still there to block when the restriction is over.
const VIGILANT = parsed('SYNTHETIC Vigilant Guard', 'Creature — Human Soldier', 'Vigilance', {
  manaCost: '{1}',
  power: '2',
  toughness: '2',
});

function board(seats: 3 | 4) {
  const b = scenario({ seats });
  b.define(TAUNT).define(VIGILANT);
  for (let seat = 0; seat < seats; seat += 1) b.seat(seat).library(...FILLER);
  b.seat(0)
    .hand(TAUNT.name)
    .battlefield('Mountain', 'Plains', 'Island', 'Island', 'Island')
    .battlefield(BEARS, { label: 'mine' });
  for (let seat = 1; seat < seats; seat += 1) {
    b.seat(seat).battlefield(VIGILANT.name, { label: `v${seat}` });
  }
  return b.at('precombatMain', { active: 0, turn: seats + 1 }).build();
}

describe('Taunt from the Rampart: "Goad all creatures your opponents control. Until your next turn, those creatures can\'t block." (CR 701.15a, 509.1b, 611.2a)', () => {
  test('4 seats: every creature of every opponent cannot block, your own can', () => {
    const g = board(4);
    g.act(0).cast(TAUNT.name, { pay: true });
    g.passAll();
    for (const label of ['v1', 'v2', 'v3']) {
      const view = g.view(0).battlefield.find((o) => o.id === g.id(label));
      expect(view?.restrictions, label).toContain('cantBlock');
    }
    const mine = g.view(0).battlefield.find((o) => o.id === g.id('mine'));
    expect(mine?.restrictions ?? []).not.toContain('cantBlock');
  });

  test('3 seats: on the turns of the other players a goaded creature cannot block, and when your next turn begins it can again', () => {
    const g = board(3);
    g.act(0).cast(TAUNT.name, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([]);
    // Seat 0 declares no attack this turn; then seat 1's turn: its goaded creature must attack a player other than seat 0, so it attacks seat 2, whose creature cannot block it.
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    g.act(1).declareAttackers([{ attacker: 'v1', target: { player: 2 } }]);
    g.advanceTo('declareBlockers', { block: false });
    expect(g.state.pending?.kind).not.toBe('declareBlockers');
    g.advanceTo('endOfCombat', { block: false });
    g.expect.life(2, 38);
    // Seat 2's turn: its goaded creature must attack too (vigilance: it stays untapped), and seat 1 cannot block it either.
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    g.act(2).declareAttackers([{ attacker: 'v2', target: { player: 1 } }]);
    g.advanceTo('endOfCombat', { block: false });
    g.expect.life(1, 38);
    // Seat 0's turn begins: the restriction is over (CR 611.2a, 500.1), so the creature can block the attack of seat 0.
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    g.act(0).declareAttackers([{ attacker: 'mine', target: { player: 2 } }]);
    g.advanceTo('declareBlockers', { block: false });
    g.expect.pending('declareBlockers', 2);
    expect(g.act(2).try.declareBlockers([{ blocker: 'v2', attacker: 'mine' }]).ok).toBe(true);
  });
});
