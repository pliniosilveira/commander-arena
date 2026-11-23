// "If an artifact or creature entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." (Panharmonicon, issue 105):
// the static `doubleTriggers` with the cause `permanentEnters` limited to card types (`entering`).
// Pins: CR 603.2d (an additional time), CR 603.6a (an enters-the-battlefield event is the cause, whoever controls the permanent), CR 205.2a (a permanent that is not an
// artifact or a creature does not cause it). Cards are SYNTHETIC (src/cards/fixtures/synthetic-yarok.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { settle } from './meld-helpers';

const ECHO = 'SYNTHETIC Artifact Echo';
const SHRINE = 'SYNTHETIC Plain Aura Shrine'; // enchantment: when it enters, gain 1 life
const ENTERER = 'SYNTHETIC Plain Enterer'; // {1} 1/1: when it enters, gain 1 life
const BEAR = 'SYNTHETIC Quiet Bear'; // {1} 1/1, no abilities
const WATCHER = 'SYNTHETIC Entry Watcher'; // artifact: whenever a creature enters, gain 1 life
const FILLER = Array.from({ length: 12 }, () => 'Plains');

function game(
  configure: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>,
): ScenarioGame {
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

const life = (g: ScenarioGame): number | undefined => g.state.seats[0]?.life;

describe('the card is valid', () => {
  test(ECHO, () => {
    expect(validateCard(syntheticCard(ECHO))).toEqual([]);
  });
});

describe('only an artifact or a creature entering causes the extra trigger', () => {
  test('a creature entering: its own enters trigger happens twice', () => {
    const g = game((b) => b.seat(0).hand(ENTERER).battlefield(ECHO));
    g.act(0).cast(ENTERER, { pay: true });
    settle(g);
    expect(life(g)).toBe(22);
  });

  test("another permanent's trigger caused by a creature entering happens twice", () => {
    const g = game((b) => b.seat(0).hand(BEAR).battlefield(ECHO, WATCHER));
    g.act(0).cast(BEAR, { pay: true });
    settle(g);
    expect(life(g)).toBe(22);
  });

  test('an enchantment entering does not: its trigger happens once', () => {
    const g = game((b) => b.seat(0).hand(SHRINE).battlefield(ECHO));
    g.act(0).cast(SHRINE, { pay: true });
    settle(g);
    expect(life(g)).toBe(21);
  });

  test('without the doubler the trigger happens once', () => {
    const g = game((b) => b.seat(0).hand(ENTERER));
    g.act(0).cast(ENTERER, { pay: true });
    settle(g);
    expect(life(g)).toBe(21);
  });
});
