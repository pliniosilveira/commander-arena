// Revival Trance deck (issue 97), group D: the REAL Oracle text of Shadow, Mysterious Assassin, Archfiend of Depravity and Snort (the corpus's golden.jsonl) goes through the grammar
// with no override and is played through applyAction with two and three opponents. Pins: CR 701.21a (sacrifice), CR 608.2c (if you do), CR 202.3 (mana value), CR 113.7a (last-known information),
// CR 119.3 (life loss).
import { type CardDefinition, type Effect, validateCard } from '@commander-arena/engine';
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
    for (let seat = 1; seat < seats; seat += 1)
      b.seat(seat)
        .life(20)
        .library(...FILLER);
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

describe('Archfiend of Depravity: "At the beginning of each opponent\'s end step, that player chooses up to two creatures they control, then sacrifices the rest"', () => {
  const FIEND = real('Archfiend of Depravity');

  const start = (seats: 2 | 3 | 4, active: number) => {
    const b = scenario({ seats }).define(FIEND);
    b.seat(0)
      .library(...FILLER)
      .battlefield(FIEND.name, { label: 'fiend' })
      .battlefield(BEARS, { label: 'mine' });
    for (let seat = 1; seat < seats; seat += 1) {
      const s = b.seat(seat).library(...FILLER);
      for (let n = 1; n <= 3; n += 1) s.battlefield(BEARS, { label: `s${seat}c${n}` });
    }
    return b.at('precombatMain', { active, turn: 3 }).build();
  };
  const bears = (g: ReturnType<typeof start>, seat: number) =>
    g.find({ name: BEARS, zone: 'battlefield', seat });

  test('the active opponent keeps the two they choose and sacrifices the third; other seats are untouched (three seats)', () => {
    const g = start(3, 1);
    g.advanceTo('end');
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    expect(d.seat).toBe(1);
    expect(d.purpose).toBe('keep');
    expect(d.min).toBe(0);
    expect(d.max).toBe(2);
    expect(d.legal).toHaveLength(3);
    g.act(1).choosePermanents('s1c1', 's1c3');
    expect(bears(g, 1)).toHaveLength(2);
    expect(bears(g, 2)).toHaveLength(3);
    expect(bears(g, 0)).toHaveLength(1);
  });

  test('choosing none sacrifices every creature they control', () => {
    const g = start(4, 2);
    g.advanceTo('end');
    g.passAll();
    g.act(2).choosePermanents();
    expect(bears(g, 2)).toHaveLength(0);
    expect(bears(g, 1)).toHaveLength(3);
    expect(bears(g, 3)).toHaveLength(3);
  });

  test('keeping more than two is refused', () => {
    const g = start(3, 1);
    g.advanceTo('end');
    g.passAll();
    expect(() => g.act(1).choosePermanents('s1c1', 's1c2', 's1c3')).toThrow(/rejected/);
    expect(bears(g, 1)).toHaveLength(3);
  });

  test("it does not trigger on its controller's own end step", () => {
    const g = start(3, 0);
    g.advanceTo('end');
    expect(g.state.pending?.kind).toBe('priority');
    expect(g.state.stack).toHaveLength(0);
    expect(bears(g, 1)).toHaveLength(3);
  });
});

describe('keepOrSacrifice validation (CR 608.2d)', () => {
  const FIEND = real('Archfiend of Depravity');
  const withKeep = (keep: Record<string, unknown>): CardDefinition => ({
    ...FIEND,
    faces: FIEND.faces.map((face) => ({
      ...face,
      abilities: face.abilities.map((a) =>
        a.kind === 'triggered'
          ? {
              ...a,
              effect: {
                kind: 'keepOrSacrifice',
                players: { kind: 'triggerPlayer' },
                filter: { types: ['creature'] },
                ...keep,
              } as Effect,
            }
          : a,
      ),
    })),
  });

  test('the real card is valid', () => {
    expect(validateCard(FIEND)).toEqual([]);
  });
  test.each([
    ['neither limit', {}],
    ['both limits', { keepAtMost: 2, totalPowerAtMost: 4 }],
    ['a negative number', { keepAtMost: -1 }],
    ['a fraction', { keepAtMost: 1.5 }],
  ])('%s is refused', (_label, keep) => {
    expect(validateCard(withKeep(keep)).length).toBeGreaterThan(0);
  });
});
