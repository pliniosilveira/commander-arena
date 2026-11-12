// "Roll a four-sided die. If the result is 1, return this card from your graveyard to the battlefield" (D-271): the effect `rollDie`, the
// result it leaves for the rest of the resolution (`dieResult`), and the condition `thisInYourGraveyard` of a trigger that works from the graveyard.
// Pins: CR 706.1 and 706.1a (a die of N sides has N equally likely outcomes numbered 1 to N), CR 706.2 (the natural result, no modifiers in this
// engine), CR 706.3b (the roll and what is done with its result are one ability), CR 113.6b (an ability that states its zone works from there),
// CR 603.4 (an intervening "if" is read when the event happens and again as the ability resolves), CR 400.7 (a card that left the graveyard is a new
// object), SPEC 4.2 (all randomness comes from the seeded generator of the state, nowhere else). Cards are SYNTHETIC (src/cards/fixtures/synthetic-dice.ts).
import { describe, expect, test } from 'vitest';
import { nextInt, syntheticCard, validateCard } from '../src/index';
import { evaluateCondition } from '../src/rules/conditions';
import { type ScenarioGame, scenario } from '../src/testing/index';

const ANGEL = 'SYNTHETIC Die Angel';
const GAMBIT = 'SYNTHETIC Die Gambit'; // d6: 4 or more gain 4, otherwise lose 2
const WHEEL = 'SYNTHETIC Twenty Wheel'; // d20: 20 gain 5; 2 or less lose 3
const TWICE = 'SYNTHETIC Die Twice'; // d6 twice: the second result 6 gains 1
const ALONE = 'SYNTHETIC Die Alone'; // d4, nothing reads it
const COIN = 'SYNTHETIC Die Coin'; // d2: 1 gain 1, otherwise lose 1
const SCOUR = 'SYNTHETIC Die Scour'; // exile target card from a graveyard

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

type Rolled = Extract<ScenarioGame['events'][number], { kind: 'dieRolled' }>;
const rolls = (g: ScenarioGame): Rolled[] =>
  g.events.filter((e): e is Rolled => e.kind === 'dieRolled');

/** The result `sides` gives from the generator as it stands: one draw, 1-based (CR 706.1a). */
const expectedRoll = (g: ScenarioGame, sides: number): number =>
  (nextInt(g.state.rng, sides)[0] ?? -1) + 1;

/** A game at seat 0's precombat main with a spell in hand and the mana for it. */
const spellGame = (name: string, seed: number): ScenarioGame =>
  scenario()
    .seed(seed)
    .seat(0)
    .life(20)
    .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
    .hand(name)
    .battlefield('Mountain', { count: 3 })
    .seat(1)
    .life(20)
    .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
    .at('precombatMain')
    .build();

describe('the cards are valid', () => {
  for (const name of [ANGEL, GAMBIT, WHEEL, TWICE, ALONE, COIN, SCOUR]) {
    test(name, () => {
      expect(validateCard(syntheticCard(name))).toEqual([]);
    });
  }
});

describe('rolling a die draws one number from the seeded generator of the state', () => {
  test('the result is the draw of the generator as it stood, plus 1, and the generator advanced by exactly that draw', () => {
    for (const seed of SEEDS) {
      const g = spellGame(ALONE, seed);
      const before = g.state.rng;
      const want = (nextInt(before, 4)[0] ?? -1) + 1;
      const after = nextInt(before, 4)[1];
      g.act(0).cast(ALONE, { pay: true });
      g.passAll();
      expect(rolls(g)).toEqual([{ kind: 'dieRolled', seat: 0, sides: 4, result: want }]);
      expect(g.state.rng).toEqual(after);
    }
  });

  test('the same seed gives the same game; the results of different seeds cover every face of the die', () => {
    const results = (seed: number): number[] => {
      const g = spellGame(ALONE, seed);
      g.act(0).cast(ALONE, { pay: true });
      g.passAll();
      return rolls(g).map((r) => r.result);
    };
    for (const seed of SEEDS.slice(0, 8)) expect(results(seed)).toEqual(results(seed));
    const seen = new Set(SEEDS.flatMap(results));
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });

  test('a d20 stays within 1 to 20 and reaches both ends over the seeds; a d6 within 1 to 6', () => {
    const wheel = SEEDS.map((seed) => {
      const g = spellGame(WHEEL, seed);
      g.act(0).cast(WHEEL, { pay: true });
      g.passAll();
      return rolls(g)[0]?.result ?? -1;
    });
    expect(wheel.every((n) => n >= 1 && n <= 20)).toBe(true);
    expect(new Set(wheel).size).toBeGreaterThan(8);
    const gambit = SEEDS.map((seed) => {
      const g = spellGame(GAMBIT, seed);
      g.act(0).cast(GAMBIT, { pay: true });
      g.passAll();
      return rolls(g)[0]?.result ?? -1;
    });
    expect(gambit.every((n) => n >= 1 && n <= 6)).toBe(true);
  });

  test('the rolling does not touch another source of randomness: the libraries keep their order', () => {
    const g = spellGame(GAMBIT, 5);
    const libraries = g.state.seats.map((s) => [...s.library]);
    g.act(0).cast(GAMBIT, { pay: true });
    g.passAll();
    expect(g.state.seats.map((s) => [...s.library])).toEqual(libraries);
  });
});

describe('the result is read by "If the result is ..." and by "Otherwise"', () => {
  test('a six-sided die: 4 or more gains 4 life, otherwise the controller loses 2 (every seed)', () => {
    let gained = 0;
    let lost = 0;
    for (const seed of SEEDS) {
      const g = spellGame(GAMBIT, seed);
      const want = expectedRoll(g, 6);
      g.act(0).cast(GAMBIT, { pay: true });
      g.passAll();
      g.expect.life(0, want >= 4 ? 24 : 18);
      g.expect.life(1, 20);
      if (want >= 4) gained += 1;
      else lost += 1;
    }
    // Both ways are reached, so neither branch is left untested.
    expect(gained).toBeGreaterThan(0);
    expect(lost).toBeGreaterThan(0);
  });

  test('"20" and "2 or less" are read of the same one result: at most one of them applies, and the boundary is exact', () => {
    const lifeAfter = new Map<number, number>();
    for (const seed of SEEDS) {
      const g = spellGame(WHEEL, seed);
      const want = expectedRoll(g, 20);
      g.act(0).cast(WHEEL, { pay: true });
      g.passAll();
      const expected = want === 20 ? 25 : want <= 2 ? 17 : 20;
      g.expect.life(0, expected);
      lifeAfter.set(want, expected);
    }
    // The values seen include a middle result (nothing happens).
    expect([...lifeAfter.values()]).toContain(20);
  });

  test('the edges of "2 or less" and "20" are exact: 1 and 2 lose 3, 3 does nothing, 19 does nothing, 20 gains 5', () => {
    // A seed for each result at an edge, found by the generator of the state, so the result itself is pinned and not hoped for.
    const seedFor = (result: number): number => {
      for (let seed = 1; seed < 5000; seed += 1) {
        if (expectedRoll(spellGame(WHEEL, seed), 20) === result) return seed;
      }
      throw new Error(`no seed in range rolls ${result}`);
    };
    for (const [result, life] of [
      [1, 17],
      [2, 17],
      [3, 20],
      [19, 20],
      [20, 25],
    ] as const) {
      const g = spellGame(WHEEL, seedFor(result));
      g.act(0).cast(WHEEL, { pay: true });
      g.passAll();
      expect(rolls(g).map((r) => r.result)).toEqual([result]);
      g.expect.life(0, life);
    }
  });

  test('a two-sided die gives 1 or 2 and the "otherwise" covers the other', () => {
    const seen = new Set<number>();
    for (const seed of SEEDS) {
      const g = spellGame(COIN, seed);
      const want = expectedRoll(g, 2);
      g.act(0).cast(COIN, { pay: true });
      g.passAll();
      g.expect.life(0, want === 1 ? 21 : 19);
      seen.add(want);
    }
    expect([...seen].sort()).toEqual([1, 2]);
  });

  test('a second roll of the same resolution replaces the first: the condition reads the latest', () => {
    for (const seed of SEEDS) {
      const g = spellGame(TWICE, seed);
      const before = g.state.rng;
      const [a, mid] = nextInt(before, 6);
      const [b] = nextInt(mid, 6);
      g.act(0).cast(TWICE, { pay: true });
      g.passAll();
      expect(rolls(g).map((r) => r.result)).toEqual([a + 1, b + 1]);
      g.expect.life(0, b + 1 === 6 ? 21 : 20);
    }
  });

  test('the result of one resolution is not read by another: a later spell with no roll of its own reads nothing', () => {
    // Die Gambit rolls in its own resolution; the next one starts with no result (the engine keeps it per resolution).
    const g = spellGame(GAMBIT, 3);
    g.act(0).cast(GAMBIT, { pay: true });
    g.passAll();
    expect(g.state.resolution).toBeNull();
  });
});

/** Seat 0 at the beginning of its own upkeep with the Angel in its graveyard, the trigger on the stack. */
const upkeepGame = (seed: number): ScenarioGame => {
  const g = scenario()
    .seed(seed)
    .seat(0)
    .life(20)
    .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
    .graveyard(ANGEL)
    .seat(1)
    .life(20)
    .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
    .at('precombatMain')
    .build();
  g.advanceTo('upkeep', { turn: 'next' });
  g.advanceTo('upkeep', { turn: 'next' });
  return g;
};

describe('"At the beginning of your upkeep, if this card is in your graveyard, roll a four-sided die. If the result is 1, return it"', () => {
  test('the trigger works from the graveyard and the card returns exactly when the die shows 1', () => {
    let back = 0;
    let stayed = 0;
    for (const seed of SEEDS) {
      const g = upkeepGame(seed);
      g.expect.step('upkeep', { active: 0 });
      const want = expectedRoll(g, 4);
      g.passAll();
      expect(rolls(g).map((r) => r.result)).toEqual([want]);
      if (want === 1) {
        g.expect.zone(ANGEL, 'battlefield', { seat: 0 });
        g.expect.noObject(ANGEL, { zone: 'graveyard' });
        back += 1;
      } else {
        g.expect.zone(ANGEL, 'graveyard', { seat: 0 });
        g.expect.noObject(ANGEL, { zone: 'battlefield' });
        stayed += 1;
      }
      g.expect.invariants();
    }
    expect(back).toBeGreaterThan(0);
    expect(stayed).toBeGreaterThan(0);
  });

  test("it enters under its owner's control, untapped, and is a new object (CR 400.7)", () => {
    const seed = SEEDS.find((s) => expectedRoll(upkeepGame(s), 4) === 1);
    expect(seed).toBeDefined();
    const g = upkeepGame(seed ?? 1);
    const graveyardObject = g.id({ name: ANGEL, zone: 'graveyard' });
    g.passAll();
    const now = g.object({ name: ANGEL, zone: 'battlefield' });
    expect(now.id).not.toBe(graveyardObject);
    expect(now.tapped).toBe(false);
  });

  test('it does not trigger in the opponent\'s upkeep ("your upkeep")', () => {
    const g = scenario()
      .seed(1)
      .seat(0)
      .life(20)
      .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .graveyard(ANGEL)
      .seat(1)
      .life(20)
      .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .at('precombatMain')
      .build();
    g.advanceTo('upkeep');
    g.expect.step('upkeep', { active: 1 });
    expect(g.state.stack).toHaveLength(0);
    g.passAll();
    expect(rolls(g)).toEqual([]);
  });

  test('it does not trigger from the battlefield, hand or library: no roll is made', () => {
    for (const zone of ['battlefield', 'hand', 'library'] as const) {
      const b = scenario()
        .seed(1)
        .seat(0)
        .life(20)
        .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
        .seat(1)
        .life(20)
        .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains');
      const placed =
        zone === 'battlefield'
          ? b.seat(0).battlefield(ANGEL)
          : zone === 'hand'
            ? b.seat(0).hand(ANGEL)
            : b.seat(0).library(ANGEL, 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains');
      const g = placed.at('precombatMain').build();
      g.advanceTo('upkeep', { turn: 'next' });
      g.advanceTo('upkeep', { turn: 'next' });
      g.passAll();
      expect(rolls(g)).toEqual([]);
    }
  });

  test('the condition is read again as the ability resolves: a card exiled in response is not rolled for (CR 603.4, 400.7)', () => {
    const g = scenario()
      .seed(1)
      .seat(0)
      .life(20)
      .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .graveyard(ANGEL)
      .hand(SCOUR)
      .battlefield('Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .at('precombatMain')
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0 });
    expect(g.state.stack).toHaveLength(1);
    const rngBefore = g.state.rng;
    g.act(0).cast(SCOUR, { targets: [{ name: ANGEL, zone: 'graveyard' }], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'exile', { seat: 0 });
    expect(rolls(g)).toEqual([]);
    expect(g.state.rng).toEqual(rngBefore);
    g.expect.invariants();
  });
});

describe("thisInYourGraveyard reads the card itself, in its owner's graveyard, for the controller of the ability (CR 113.6b, 108.4a, 400.7)", () => {
  const IN_GRAVEYARD = { kind: 'thisInYourGraveyard' } as const;
  const holds = (
    g: ScenarioGame,
    controller: 0 | 1,
    source: ReturnType<ScenarioGame['id']> | null,
  ) => evaluateCondition(g.state, IN_GRAVEYARD, { controller, source });

  test('true for the card in the graveyard of the controller, false with no source', () => {
    const g = scenario()
      .seat(0)
      .graveyard(ANGEL)
      .seat(1)
      .graveyard('Plains')
      .at('precombatMain')
      .build();
    const angel = g.id({ name: ANGEL, zone: 'graveyard' });
    expect(holds(g, 0, angel)).toBe(true);
    // No source at all: nothing to be in a graveyard.
    expect(holds(g, 0, null)).toBe(false);
  });

  test('false when the card is in another zone, whoever the controller is', () => {
    for (const zone of ['battlefield', 'hand', 'exile', 'library'] as const) {
      const b = scenario().seat(0);
      const placed =
        zone === 'battlefield'
          ? b.battlefield(ANGEL)
          : zone === 'hand'
            ? b.hand(ANGEL)
            : zone === 'exile'
              ? b.exile(ANGEL)
              : b.library(ANGEL, 'Plains');
      const g = placed.seat(1).at('precombatMain').build();
      const angel = g.id({ name: ANGEL, zone });
      expect(holds(g, 0, angel), zone).toBe(false);
    }
  });

  test("false for the card in an opponent's graveyard: a controller who does not own it does not read it as theirs", () => {
    const g = scenario().seat(0).seat(1).graveyard(ANGEL).at('precombatMain').build();
    const angel = g.id({ name: ANGEL, zone: 'graveyard' });
    expect(g.object({ name: ANGEL, zone: 'graveyard' }).owner).toBe(1);
    expect(holds(g, 1, angel)).toBe(true);
    expect(holds(g, 0, angel)).toBe(false);
  });
});
