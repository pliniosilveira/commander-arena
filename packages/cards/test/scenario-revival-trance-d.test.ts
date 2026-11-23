// Revival Trance deck (issue 97), group D: the REAL Oracle text of Shadow, Mysterious Assassin, Archfiend of Depravity and Snort (the corpus's golden.jsonl) goes through the grammar
// with no override and is played through applyAction with two and three opponents. Pins: CR 701.21a (sacrifice), CR 608.2c (if you do), CR 202.3 (mana value), CR 113.7a (last-known information),
// CR 119.3 (life loss).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const FILLER = Array.from({ length: 12 }, () => 'Island');
const BEARS = 'Grizzly Bears'; // 2/2, mana value 2

describe('Shadow, Mysterious Assassin: "you may sacrifice another nonland permanent. If you do, draw two cards and each opponent loses life equal to the mana value of the sacrificed permanent"', () => {
  const SHADOW = real('Shadow, Mysterious Assassin');

  const start = (seats: 2 | 3 | 4) => {
    const b = scenario({ seats }).define(SHADOW);
    b.seat(0)
      .life(20)
      .library(...FILLER)
      .battlefield(SHADOW.name, { label: 'shadow' })
      .battlefield(BEARS, { label: 'bears' })
      .battlefield('Sol Ring', { label: 'ring' })
      .battlefield('Forest', { label: 'forest' });
    for (let seat = 1; seat < seats; seat += 1) b.seat(seat).life(20).library(...FILLER);
    return b.at('precombatMain', { active: 0, turn: 3 }).build();
  };
  const hit = (g: ReturnType<typeof start>) => {
    g.advanceTo('declareAttackers');
    g.act(0).attack('shadow', { player: 1 });
    g.advanceTo('combatDamage');
    g.passAll();
  };

  test('sacrificing Grizzly Bears draws two and every opponent loses 2 life (three opponents)', () => {
    const g = start(4);
    const before = g.state.seats[0]?.hand.length ?? 0;
    hit(g);
    g.act(0).accept();
    g.act(0).choosePermanents('bears');
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.hand.length).toBe(before + 2);
    // The attacked player also took Shadow's 3 combat damage.
    expect(g.state.seats.map((s) => s.life)).toEqual([20, 15, 18, 18]);
  });

  test('declining the sacrifice does nothing more', () => {
    const g = start(3);
    const before = g.state.seats[0]?.hand.length ?? 0;
    hit(g);
    g.act(0).decline();
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    expect(g.state.seats[0]?.hand.length).toBe(before);
    expect(g.state.seats[2]?.life).toBe(20);
  });
});
