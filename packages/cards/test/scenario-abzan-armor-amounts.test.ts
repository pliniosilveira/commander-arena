// Abzan Armor precon (issue 99), group B: amounts, life and stats. Each real card of the golden corpus is read through the grammar with no override and played with the scenario DSL
// (three seats where an opponent or a player is chosen). Pins: CR 107.1 / 608.2c (an amount is worked out as the instruction runs; "difference" is the positive gap), CR 119.3 (life gained
// and lost this turn), CR 701.12c and 119.7-119.8 (exchange life total with toughness), CR 614.12 (enters with counters counts the battlefield without the permanent), CR 122.6 (counters).
import { getView } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const FILLER = Array.from({ length: 12 }, () => 'Island');
const fill = (g: ReturnType<typeof scenario>, seats: number) => {
  for (let seat = 0; seat < seats; seat += 1) g.seat(seat).library(...FILLER);
  return g.seat(0);
};
const body = (name: string, power: string, toughness: string, text = '') =>
  parsed(name, 'Creature — Bear', text, { manaCost: '{1}', power, toughness });

describe('Jaws of Defeat: "target opponent loses life equal to the difference between that creature\'s power and its toughness"', () => {
  const JAWS = real('Jaws of Defeat');
  const wide = body('SYNTHETIC Wide Bear', '5', '2');
  const tall = body('SYNTHETIC Tall Bear', '1', '4');
  const even = body('SYNTHETIC Even Bear', '3', '3');
  const enter = (bear: typeof wide, seats: 2 | 3, target: number) => {
    const b = scenario({ seats })
      .define(JAWS)
      .define(wide)
      .define(tall)
      .define(even)
      .seat(0)
      .battlefield(JAWS.name)
      .hand(bear.name)
      .pool('GGGGGG');
    const g = fill(b, seats).at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(bear.name, { pay: true });
    g.passAll();
    // With one opponent the only legal target is chosen by the engine.
    if (seats === 3) g.act(0).chooseTargets({ player: target });
    g.passAll();
    return g;
  };
  test('power greater than toughness: the opponent loses the gap', () => {
    const g = enter(wide, 2, 1);
    g.expect.life(1, 37);
  });
  test('toughness greater than power: the same positive gap', () => {
    const g = enter(tall, 2, 1);
    g.expect.life(1, 37);
  });
  test('equal power and toughness: nothing is lost', () => {
    const g = enter(even, 2, 1);
    g.expect.life(1, 40);
  });
  test('three seats: only the chosen opponent loses life', () => {
    const g = enter(wide, 3, 2);
    g.expect.life(1, 40);
    g.expect.life(2, 37);
    g.expect.life(0, 40);
  });
});

describe('Tree of Redemption: "{T}: Exchange your life total with this creature\'s toughness"', () => {
  const TREE = real('Tree of Redemption');
  const build = (life: number, extra: (b: ReturnType<typeof scenario>) => void = () => {}) => {
    const b = scenario({ seats: 3 }).define(TREE).seat(0).life(life).battlefield(TREE.name);
    extra(b);
    return fill(b, 3).at('precombatMain', { active: 0, turn: 3 }).build();
  };
  test('life 7: the Tree becomes 0/7 and its controller has 13 life', () => {
    const g = build(7);
    g.act(0).activate(TREE.name);
    g.passAll();
    g.expect.life(0, 13);
    g.expect.pt(TREE.name, 0, 7);
  });
  test('the toughness is set before counters apply: a +1/+1 counter makes 1/8, and the life is the former 14', () => {
    const g = scenario({ seats: 3 })
      .define(TREE)
      .seat(0)
      .life(7)
      .battlefield(TREE.name, { counters: { '+1/+1': 1 } });
    const game = fill(g, 3).at('precombatMain', { active: 0, turn: 3 }).build();
    game.act(0).activate(TREE.name);
    game.passAll();
    game.expect.life(0, 14);
    game.expect.pt(TREE.name, 1, 8);
  });
  test('the other players are untouched', () => {
    const g = build(30);
    g.act(0).activate(TREE.name);
    g.passAll();
    g.expect.life(0, 13);
    g.expect.life(1, 40);
    g.expect.life(2, 40);
    g.expect.pt(TREE.name, 0, 30);
  });
});

describe('Canopy Gargantuan: "put a number of +1/+1 counters on each other creature you control equal to that creature\'s toughness"', () => {
  const GARG = real('Canopy Gargantuan');
  const build = (seats: 2 | 3 | 4) => {
    const a = body('SYNTHETIC Small Bear', '1', '2');
    const b = body('SYNTHETIC Large Bear', '2', '5');
    const other = body('SYNTHETIC Their Bear', '1', '3');
    const mine = scenario({ seats })
      .define(GARG)
      .define(a)
      .define(b)
      .define(other)
      .seat(0)
      .battlefield(GARG.name, a.name, b.name);
    for (let seat = 1; seat < seats; seat += 1) {
      mine.seat(seat).battlefield(other.name, { label: `Theirs${seat}` });
    }
    const g = fill(mine, seats)
      .at('end', { active: seats === 2 ? 1 : 3, turn: 2 })
      .build();
    g.advanceTo('upkeep');
    return { g, a, b };
  };
  test('each other creature of the controller gets as many counters as its own toughness', () => {
    const { g, a, b } = build(2);
    g.passAll();
    g.expect.counters(a.name, { '+1/+1': 2 });
    g.expect.counters(b.name, { '+1/+1': 5 });
    g.expect.counters(GARG.name, {});
    g.expect.pt(a.name, 3, 4);
    g.expect.pt(b.name, 7, 10);
  });
  test('creatures of the opponents get none, with four seats too', () => {
    const { g } = build(4);
    g.passAll();
    g.expect.counters('Theirs1', {});
    g.expect.counters('Theirs2', {});
    g.expect.counters('Theirs3', {});
  });
});

describe('Towering Titan: "enters with X +1/+1 counters on it, where X is the total toughness of other creatures you control"', () => {
  const TITAN = real('Towering Titan');
  const a = body('SYNTHETIC Small Bear', '1', '2');
  const b = body('SYNTHETIC Large Bear', '2', '5');
  const mk = (seats: 2 | 3) => {
    const s = scenario({ seats })
      .define(TITAN)
      .define(a)
      .define(b)
      .seat(0)
      .battlefield(a.name, b.name)
      .hand(TITAN.name)
      .pool('GGGGGGGG');
    if (seats === 3) s.seat(2).battlefield(a.name, { label: 'Theirs' });
    return fill(s, seats).at('precombatMain', { active: 0, turn: 3 }).build();
  };
  test("counts the toughness of its controller's creatures only, 7 counters make a 7/7", () => {
    const g = mk(3);
    g.act(0).cast(TITAN.name, { pay: true });
    g.passAll();
    g.expect.counters(TITAN.name, { '+1/+1': 7 });
    g.expect.pt(TITAN.name, 7, 7);
  });
  test('with no other creature it enters with no counters (its own toughness is not counted)', () => {
    const s = scenario({ seats: 2 }).define(TITAN).seat(0).hand(TITAN.name).pool('GGGGGGGG');
    const g = fill(s, 2).at('precombatMain', { active: 0, turn: 3 }).build();
    g.act(0).cast(TITAN.name, { pay: true });
    g.passAll();
    g.expect.counters(TITAN.name, {});
  });
});

describe('Towering Titan: "Sacrifice a creature with defender: All creatures gain trample until end of turn"', () => {
  const TITAN = real('Towering Titan');
  const wall = body('SYNTHETIC Wall', '0', '4', 'Defender');
  test('sacrificing a creature with defender gives every creature trample', () => {
    const bear = body('SYNTHETIC Plain Bear', '2', '2');
    const g = scenario({ seats: 3 })
      .define(TITAN)
      .define(wall)
      .define(bear)
      .seat(0)
      .battlefield(TITAN.name, wall.name, bear.name)
      .seat(2)
      .battlefield(bear.name, { label: 'Theirs' })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .seat(0)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(TITAN.name);
    g.passAll();
    g.expect.zone(wall.name, 'graveyard');
    for (const seat of [0, 2] as const) {
      const mine = getView(g.state, seat).battlefield.filter((o) => o.types.includes('creature'));
      expect(mine.length).toBeGreaterThan(0);
      for (const o of mine) expect(o.keywords, o.name).toContain('trample');
    }
  });
});

describe("Betor, Ancestor's Voice: life gained and lost this turn", () => {
  const BETOR = real("Betor, Ancestor's Voice");
  const swing = parsed('SYNTHETIC Swing', 'Sorcery', 'You gain 4 life. You lose 2 life.', {
    manaCost: '{1}',
  });
  const ally = body('SYNTHETIC Ally Bear', '2', '2');
  const small = body('SYNTHETIC Dead Two', '2', '2');
  const big = body('SYNTHETIC Dead Five', '5', '5');
  const build = (seats: 2 | 3) => {
    const s = scenario({ seats })
      .define(BETOR)
      .define(swing)
      .define(ally)
      .define(small)
      .define(big)
      .seat(0)
      .battlefield(BETOR.name, ally.name)
      .graveyard(small.name, big.name)
      .hand(swing.name)
      .pool('GG');
    return fill(s, seats).at('precombatMain', { active: 0, turn: 3 }).build();
  };
  test('+1/+1 counters equal to the life gained go on another creature, and a card with mana value up to the life lost returns', () => {
    const g = build(3);
    g.act(0).cast(swing.name, { pay: true });
    g.passAll();
    g.expect.life(0, 42);
    g.advanceTo('end');
    g.act(0).chooseTargets(ally.name, small.name);
    g.passAll();
    g.expect.counters(ally.name, { '+1/+1': 4 });
    g.expect.zone(small.name, 'battlefield');
    g.expect.zone(big.name, 'graveyard');
  });
  test('no life gained or lost: nothing happens', () => {
    const g = build(2);
    g.advanceTo('end');
    g.passAll();
    g.expect.counters(ally.name, {});
    g.expect.zone(small.name, 'graveyard');
  });
});

describe('the new amounts as engine data', () => {
  test('a game with two opponents still reads the life lost of its own controller only', () => {
    const g: ScenarioGame = scenario({ seats: 3 })
      .seat(0)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    expect(g.state.seats[1]?.lifeLostThisTurn).toBe(0);
  });
});
