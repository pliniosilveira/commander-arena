// "Doesn't untap during its controller's next untap step" (Hylda deck, group 2, D-1510): the `restrict` effect of `doesntUntap` with the duration `untilNextUntapStep`, and the
// cards that use it (SYNTHETIC `synthetic-hylda-g2.ts`: Lullaby Wave, Drowse Pair, Cold Table).
// Pins: CR 502.3 (the active player untaps all their permanents, except the ones an effect keeps from untapping), CR 611.2a (a continuous effect of a resolving spell lasts as long
// as it says), CR 701.43b (an effect that stops a permanent from untapping in the next untap step ends in that step, however many there are), CR 109.4 (the controller of a
// permanent at the time), CR 706.3a, 706.3b (a results table is part of the ability that rolls), CR 614.1c, 614.12 (creatures that enter tapped), CR 500.1 (until your next turn).
import { describe, expect, test } from 'vitest';
import { nextInt, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const LULLABY = 'SYNTHETIC Lullaby Wave';
const DROWSE = 'SYNTHETIC Drowse Pair';
const TABLE = 'SYNTHETIC Cold Table';
const GEIST = 'SYNTHETIC Slumber Geist';
const FLASH = 'SYNTHETIC Flash Dinosaur';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const BOLT = 'Lightning Bolt';

describe('the cards are valid', () => {
  test.each([LULLABY, DROWSE, TABLE, GEIST])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

const keptTapped = (g: ScenarioGame) =>
  g.state.continuousEffects.filter((e) => e.until === 'nextUntapStep');

/** Seat 0's precombat main phase of turn 1: Lullaby Wave in hand with the mana for two of them, seat 1 has two creatures. */
function lullabyGame(): ScenarioGame {
  return scenario()
    .seat(0)
    .library('Island', 'Island', 'Island', 'Island', 'Island', 'Island')
    .hand(LULLABY, LULLABY)
    .battlefield('Island', { count: 8 })
    .battlefield(BEARS, { label: 'mine' })
    .seat(1)
    .library('Island', 'Island', 'Island', 'Island', 'Island', 'Island')
    .battlefield(BEARS, { label: 'bears' })
    .battlefield(SPIDER, { label: 'spider' })
    .at('precombatMain', { active: 0 })
    .build();
}

describe('Lullaby Wave: tap all creatures a player controls and keep them tapped', () => {
  test('they are tapped, stay tapped through the next untap step of their controller and untap in the one after', () => {
    const g = lullabyGame();
    g.act(0).cast(`${LULLABY}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.tapped('bears', true);
    g.expect.tapped('spider', true);
    // The creatures of the caster are not touched.
    g.expect.tapped('mine', false);
    expect(keptTapped(g)).toHaveLength(1);
    // Seat 1's next untap step (turn 2): they stay tapped, and that is the end of the effect.
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('bears', true);
    g.expect.tapped('spider', true);
    expect(keptTapped(g)).toHaveLength(0);
    // The turn after theirs (turn 4): they untap as usual.
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('bears', false);
    g.expect.tapped('spider', false);
    g.expect.invariants();
  });

  test('the untap step of the caster (the turn between) is not the one the creatures wait for', () => {
    const g = lullabyGame();
    g.act(0).cast(`${LULLABY}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.advanceTo('upkeep', { turn: 'next' }); // seat 1, turn 2
    expect(keptTapped(g)).toHaveLength(0);
    g.advanceTo('upkeep', { turn: 'next' }); // seat 0, turn 3
    g.expect.tapped('bears', true);
    g.expect.tapped('spider', true);
  });

  test('two of them end in the same untap step (CR 701.43b)', () => {
    const g = lullabyGame();
    g.act(0).cast(`${LULLABY}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).cast(`${LULLABY}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(keptTapped(g)).toHaveLength(2);
    g.advanceTo('upkeep', { turn: 'next' });
    expect(keptTapped(g)).toHaveLength(0);
    g.expect.tapped('bears', true);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('bears', false);
  });
});

describe('Drowse Pair: the creatures wait for the untap step of their own controller', () => {
  const pairGame = (graveyard: readonly string[]): ScenarioGame =>
    scenario()
      .seat(0)
      .library('Island', 'Island', 'Island', 'Island', 'Island', 'Island')
      .hand(DROWSE)
      .graveyard(...graveyard)
      .battlefield('Island', { count: 2 })
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library('Island', 'Island', 'Island', 'Island', 'Island', 'Island')
      .battlefield(SPIDER, { label: 'theirs' })
      .at('precombatMain', { active: 0 })
      .build();

  test('with two instant and/or sorcery cards in the graveyard: each creature misses the next untap step of its controller', () => {
    const g = pairGame([BOLT, BOLT]);
    g.act(0).cast(DROWSE, { targets: ['mine', 'theirs'], pay: true });
    g.passAll();
    g.expect.tapped('mine', true);
    g.expect.tapped('theirs', true);
    expect(keptTapped(g)).toHaveLength(1);
    // Turn 2: seat 1's untap step. Their creature stays tapped, and its effect is over; mine is not let go yet.
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('theirs', true);
    expect(keptTapped(g)).toHaveLength(1);
    // Turn 3: my untap step: mine stays tapped, the effect is over.
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('mine', true);
    expect(keptTapped(g)).toHaveLength(0);
    // Turn 4 their creature untaps, turn 5 mine does.
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('theirs', false);
    g.expect.tapped('mine', true);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('mine', false);
  });

  test('with one such card (the spell itself is on the stack, not in the graveyard) the creatures only tap', () => {
    const g = pairGame([BOLT]);
    g.act(0).cast(DROWSE, { targets: ['mine', 'theirs'], pay: true });
    g.passAll();
    g.expect.tapped('theirs', true);
    expect(keptTapped(g)).toHaveLength(0);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('theirs', false);
  });

  test('up to two: it can be cast with one target, or none', () => {
    const g = pairGame([BOLT, BOLT]);
    g.act(0).cast(DROWSE, { targets: ['theirs'], pay: true });
    g.passAll();
    g.expect.tapped('theirs', true);
    g.expect.tapped('mine', false);
  });
});

describe('a creature that was not tapped still uses up the untap step it waited for', () => {
  test('Slumber Geist: the second mode on an untapped creature; the step passes and the effect is gone', () => {
    const g = scenario()
      .seat(0)
      .library('Island', 'Island', 'Island', 'Island', 'Island', 'Island')
      .battlefield(GEIST, { label: 'geist' })
      .seat(1)
      .library('Island', 'Island', 'Island', 'Island', 'Island', 'Island')
      .battlefield(BEARS, { label: 'bears' })
      .at('upkeep', { active: 0 })
      .build();
    g.advanceTo('beginningOfCombat');
    g.expect.pending('chooseModes', 0);
    g.act(0).chooseModes(1);
    g.act(0).chooseTargets('bears');
    g.passAll();
    g.expect.tapped('bears', false);
    expect(keptTapped(g)).toHaveLength(1);
    g.advanceTo('upkeep', { turn: 'next' });
    expect(keptTapped(g)).toHaveLength(0);
    // Tapped after that step, it untaps normally the turn after.
    g.expect.tapped('bears', false);
  });
});

describe('Cold Table: a d20 results table (CR 706.3)', () => {
  /** The result the die gives for each seed, the same way the engine draws it. */
  const resultOf = (seed: number): number => {
    const g = tableGame(seed);
    return (nextInt(g.state.rng, 20)[0] ?? -1) + 1;
  };
  const tableGame = (seed: number): ScenarioGame =>
    scenario()
      .seed(seed)
      .seat(0)
      .library('Island', 'Island', 'Island', 'Island', 'Island', 'Island')
      .hand(TABLE)
      .battlefield('Island', { count: 4 })
      .seat(1)
      .library('Island', 'Island', 'Island', 'Island', 'Island', 'Island')
      .hand(FLASH, FLASH)
      .battlefield('Mountain', { count: 2 })
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(SPIDER, { label: 'spider' })
      .at('precombatMain', { active: 0 })
      .build();
  const SEEDS = Array.from({ length: 400 }, (_, i) => i + 1);
  const seedWhere = (ok: (result: number) => boolean): number => {
    const seed = SEEDS.find((s) => ok(resultOf(s)));
    if (seed === undefined) throw new Error('no seed gives that result');
    return seed;
  };

  test('1 to 9: all creatures your opponents control are tapped and untap normally', () => {
    const seed = seedWhere((r) => r <= 9);
    const g = tableGame(seed);
    g.act(0).cast(TABLE, { pay: true });
    g.passAll();
    g.expect.tapped('bears', true);
    g.expect.tapped('spider', true);
    expect(keptTapped(g)).toHaveLength(0);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('bears', false);
  });

  test('10 to 19: they are tapped and keep tapped through their next untap step', () => {
    const seed = seedWhere((r) => r >= 10 && r <= 19);
    const g = tableGame(seed);
    g.act(0).cast(TABLE, { pay: true });
    g.passAll();
    g.expect.tapped('bears', true);
    expect(keptTapped(g)).toHaveLength(1);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('bears', true);
    g.expect.tapped('spider', true);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('bears', false);
  });

  test('every edge of the table reads its own row: 9 and 10, 19 and 20 (the rows cover 1 to 20 once)', () => {
    const edge = (n: number): ScenarioGame => {
      const g = tableGame(seedWhere((r) => r === n));
      g.act(0).cast(TABLE, { pay: true });
      g.passAll();
      return g;
    };
    expect(keptTapped(edge(9))).toHaveLength(0);
    expect(keptTapped(edge(10))).toHaveLength(1);
    expect(keptTapped(edge(19))).toHaveLength(1);
    expect(keptTapped(edge(1))).toHaveLength(0);
    const twenty = edge(20);
    expect(keptTapped(twenty)).toHaveLength(1);
    expect(twenty.state.continuousEffects.some((e) => e.change.kind === 'entersTapped')).toBe(true);
    const nineteen = edge(19);
    expect(nineteen.state.continuousEffects.some((e) => e.change.kind === 'entersTapped')).toBe(
      false,
    );
  });

  test('20: they also keep entering tapped until your next turn, and not after', () => {
    const seed = seedWhere((r) => r === 20);
    const g = tableGame(seed);
    g.act(0).cast(TABLE, { pay: true });
    g.passAll();
    g.expect.tapped('bears', true);
    // A creature of the opponent that enters now enters tapped (it has flash).
    g.act(0).pass();
    g.expect.step('precombatMain', { active: 0 });
    g.act(1).cast(`${FLASH}[0]`, { pay: true });
    g.passAll();
    g.expect.tapped({ name: FLASH, zone: 'battlefield' }, true);
    // Until my next turn: at its beginning the effect is gone.
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.continuousEffects.some((e) => e.change.kind === 'entersTapped')).toBe(false);
  });

  test('a creature of the caster is not one of the creatures that enter tapped', () => {
    const seed = seedWhere((r) => r === 20);
    const g = scenario()
      .seed(seed)
      .seat(0)
      .library('Island', 'Island', 'Island', 'Island', 'Island', 'Island')
      .hand(TABLE, FLASH)
      .battlefield('Island', { count: 4 })
      .battlefield('Mountain', { count: 1 })
      .seat(1)
      .library('Island', 'Island', 'Island', 'Island', 'Island', 'Island')
      .battlefield(BEARS, { label: 'bears' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(TABLE, { pay: true });
    g.passAll();
    g.act(0).cast(FLASH, { pay: true });
    g.passAll();
    g.expect.tapped(FLASH, false);
  });
});
