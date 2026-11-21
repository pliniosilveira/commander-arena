// "If a permanent entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." (Yarok, the Desecrated):
// the static `doubleTriggers` with the cause `permanentEnters`.
// Pins: CR 603.2d (an additional time; two such effects make three), CR 603.6a (an enters-the-battlefield event is the cause, whoever controls the permanent),
// CR 603.4 (an intervening "if" is checked as the ability triggers and again as it resolves). Cards are SYNTHETIC (src/cards/fixtures/synthetic-yarok.ts).
import { describe, expect, test } from 'vitest';
import { checkInvariants, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { settle } from './meld-helpers';

const DOUBLER = 'SYNTHETIC Entry Doubler'; // {1} 1/1: the doubler
const WATCHER = 'SYNTHETIC Entry Watcher'; // artifact: whenever a creature enters, gain 1 life
const LAND_WATCHER = 'SYNTHETIC Land Watcher'; // artifact: landfall, gain 1 life
const ENTERER = 'SYNTHETIC Plain Enterer'; // {1} 1/1: when it enters, gain 1 life
const NEEDY = 'SYNTHETIC Needy Enterer'; // {1} 1/1: when it enters, if you have 20 or less life, gain 15 life
const BEAR = 'SYNTHETIC Quiet Bear'; // {1} 1/1, no abilities
const CAST_WATCHER = 'SYNTHETIC Cast Watcher'; // artifact: whenever you cast a spell, gain 1 life
const FILLER = Array.from({ length: 12 }, () => 'Plains');

type Builder = ReturnType<typeof scenario>;

function game(configure: (b: Builder) => Builder): ScenarioGame {
  return configure(
    scenario()
      .seat(0)
      .life(20)
      .battlefield('Island', { count: 4 })
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
}

const life = (g: ScenarioGame, seat = 0): number | undefined => g.state.seats[seat]?.life;

describe('the cards are valid', () => {
  test.each([DOUBLER, WATCHER, LAND_WATCHER, NEEDY])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('a permanent entering causes the trigger (CR 603.2d, 603.6a)', () => {
  test("the entering permanent's own enters trigger happens twice", () => {
    const g = game((b) => b.seat(0).hand(ENTERER).battlefield(DOUBLER));
    g.act(0).cast(ENTERER, { pay: true });
    settle(g);
    expect(life(g)).toBe(22);
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test("another permanent's trigger caused by a creature entering happens twice", () => {
    const g = game((b) => b.seat(0).hand(BEAR).battlefield(DOUBLER).battlefield(WATCHER));
    g.act(0).cast(BEAR, { pay: true });
    settle(g);
    expect(life(g)).toBe(22);
  });

  test("a creature entering under an opponent's control is a cause too", () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(DOUBLER)
      .battlefield(WATCHER)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .hand(BEAR)
      .battlefield('Island')
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).cast(BEAR, { pay: true });
    settle(g);
    expect(life(g)).toBe(22);
  });

  test('a landfall trigger happens twice', () => {
    const g = game((b) => b.seat(0).hand('Plains').battlefield(DOUBLER).battlefield(LAND_WATCHER));
    g.act(0).playLand('Plains');
    settle(g);
    expect(life(g)).toBe(22);
  });

  test('two such permanents make three triggers (CR 603.2d)', () => {
    const g = game((b) => b.seat(0).hand(BEAR).battlefield(DOUBLER, DOUBLER).battlefield(WATCHER));
    g.act(0).cast(BEAR, { pay: true });
    settle(g);
    expect(life(g)).toBe(23);
  });
});

describe('what a permanent entering does not cause', () => {
  test('a trigger that is not caused by entering (a cast) happens once', () => {
    const g = game((b) => b.seat(0).hand(BEAR).battlefield(DOUBLER).battlefield(CAST_WATCHER));
    g.act(0).cast(BEAR, { pay: true });
    settle(g);
    expect(life(g)).toBe(21);
  });

  test("the doubler does not double the triggers of an opponent's permanents", () => {
    const g = game((b) => b.seat(0).hand(BEAR).battlefield(DOUBLER).seat(1).battlefield(WATCHER));
    g.act(0).cast(BEAR, { pay: true });
    settle(g);
    expect(life(g, 1)).toBe(21);
  });

  test('without the doubler the trigger happens once', () => {
    const g = game((b) => b.seat(0).hand(BEAR).battlefield(WATCHER));
    g.act(0).cast(BEAR, { pay: true });
    settle(g);
    expect(life(g)).toBe(21);
  });
});

describe('an intervening "if" (CR 603.4)', () => {
  test('is checked again for each copy as it resolves: the first one gains life, so the second does nothing', () => {
    const g = game((b) => b.seat(0).life(20).hand(NEEDY).battlefield(DOUBLER));
    g.act(0).cast(NEEDY, { pay: true });
    settle(g);
    expect(life(g)).toBe(35);
  });
});
