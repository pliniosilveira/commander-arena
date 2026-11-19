// "Whenever another creature you control dies, you get an experience counter. At the beginning of your end step, choose target creature card in your graveyard. If that card's
// mana value is less than or equal to the number of experience counters you have, return it to the battlefield. Otherwise, put it into your hand." (`gainExperience`,
// `experienceCounters`, `manaValueAtMostAmount`). Pins: CR 122.1 (counters on a player, kept for the rest of the game), CR 603.10a (a creature that dies at the same time as
// another is seen by the ability), CR 202.3 and 202.3e (mana value, an {X} counts 0 in a graveyard), CR 608.2c (the condition is read as the instruction runs), CR 701.34a (proliferate
// gives a player another counter of each kind they have). Cards are SYNTHETIC (src/cards/fixtures/synthetic-experience.ts, synthetic-gisa-g2.ts) or Lightning Bolt.
import { describe, expect, test } from 'vitest';
import { getView, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const SHAMAN = 'SYNTHETIC Experienced Shaman';
const FREE = 'SYNTHETIC Free Beast'; // mana value 0
const TWO = 'SYNTHETIC Two Beast';
const THREE = 'SYNTHETIC Three Beast';
const X1 = 'SYNTHETIC X Beast'; // {X}{1}
const SWEEP = 'SYNTHETIC Grim Sweep'; // destroy all creatures

const experience = (g: ScenarioGame, seat: 0 | 1): number | undefined =>
  getView(g.state, seat).seats[seat]?.experience;

describe('the cards are valid', () => {
  test.each([SHAMAN, FREE, TWO, THREE, X1])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('the mana value condition reads a target, the moved object or the trigger subject, not any object', () => {
    const card = syntheticCard(SHAMAN);
    const face = card.faces[0];
    const ability = face?.abilities[1];
    if (face === undefined || ability?.kind !== 'triggered') throw new Error('no trigger');
    if (ability.effect.kind !== 'conditional') throw new Error('no conditional');
    const withCondition = (condition: unknown) =>
      ({
        ...card,
        faces: [
          {
            ...face,
            abilities: [
              face.abilities[0],
              { ...ability, effect: { ...ability.effect, condition } },
            ],
          },
        ],
      }) as never;
    const amount = { kind: 'experienceCounters' };
    expect(
      validateCard(withCondition({ kind: 'manaValueAtMostAmount', of: { kind: 'this' }, amount }))
        .length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(
        withCondition({
          kind: 'manaValueAtMostAmount',
          of: { kind: 'target', id: 't1' },
          amount,
        }),
      ),
    ).toEqual([]);
  });
});

/** Seat 0 holds the Shaman, two other creatures and the sweeper; Mountains pay for it. */
const sweepGame = () =>
  scenario()
    .seat(0)
    .battlefield(SHAMAN, TWO, THREE, 'Swamp', 'Swamp', 'Swamp', 'Swamp')
    .hand(SWEEP)
    .seat(1)
    .library('Island')
    .at('precombatMain')
    .build();

describe('"you get an experience counter"', () => {
  test('a player has none until they get one', () => {
    const g = sweepGame();
    expect(experience(g, 0)).toBeUndefined();
  });

  test('one counter for each other creature that dies, even at the same time as the Shaman', () => {
    const g = sweepGame();
    g.act(0).cast(SWEEP, { pay: true });
    g.passAll();
    g.expect.zone(SHAMAN, 'graveyard', { seat: 0 });
    g.expect.zone(TWO, 'graveyard', { seat: 0 });
    g.expect.zone(THREE, 'graveyard', { seat: 0 });
    // Two other creatures died with it (CR 603.10a): the ability triggers for each of them, and the Shaman itself is not "another".
    g.passAll();
    expect(experience(g, 0)).toBe(2);
    const changes = g.eventsSince(0).flatMap((e) => (e.kind === 'experienceChanged' ? [e] : []));
    expect(changes).toEqual([
      { kind: 'experienceChanged', seat: 0, from: 0, to: 1 },
      { kind: 'experienceChanged', seat: 0, from: 1, to: 2 },
    ]);
  });

  test("an opponent's creature dying gives nothing", () => {
    const g = scenario()
      .seat(0)
      .battlefield(SHAMAN, 'Mountain')
      .hand('Lightning Bolt')
      .seat(1)
      .battlefield(TWO)
      .library('Island')
      .at('precombatMain')
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [TWO], pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(TWO, 'graveyard', { seat: 1 });
    expect(experience(g, 0)).toBeUndefined();
  });
});

/** The end step of seat 0's turn with no experience counters. */
const endStepGame = (graveyardCard: string) => {
  const b = scenario().seat(0).battlefield(SHAMAN, 'Mountain').graveyard(graveyardCard);
  return b
    .seat(1)
    .library('Island', { count: 4 })
    .at('postcombatMain', { active: 0, turn: 3 })
    .build();
};

describe('the end step ability', () => {
  test('a mana value above the counters puts the card into the hand', () => {
    const g = endStepGame(THREE);
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(THREE, 'hand', { seat: 0 });
    g.expect.zone(THREE, 'graveyard', { seat: 0, count: 0 });
  });

  test('an {X} in the mana cost of a card in a graveyard is 0: {X}{1} is 1, above 0 counters', () => {
    const g = endStepGame(X1);
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(X1, 'hand', { seat: 0 });
  });

  test('a mana value of 0 is at most 0 counters: the card returns to the battlefield', () => {
    const g = endStepGame(FREE);
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(FREE, 'battlefield', { seat: 0 });
  });
});

describe('with counters', () => {
  /** Two creatures die to the sweeper on turn 1, then the end step: the Shaman is back first, so the counters are in place. */
  const withCounters = (graveyardCard: string, counters: number) => {
    const b = scenario()
      .seat(0)
      .battlefield(SHAMAN, 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .graveyard(graveyardCard, { label: 'gy' });
    // The Shaman stays; the creatures to die are Free Beasts, killed by Bolts one at a time.
    for (let i = 0; i < counters; i++)
      b.battlefield(FREE, { label: `free${i}` }).hand('Lightning Bolt');
    const g = b.seat(1).library('Island', { count: 4 }).at('precombatMain').build();
    for (let i = 0; i < counters; i++) {
      g.act(0).cast('Lightning Bolt[0]', { targets: [`free${i}`], pay: true });
      g.passAll();
    }
    return g;
  };

  test('a mana value equal to the counters returns the card to the battlefield', () => {
    const g = withCounters(TWO, 2);
    expect(experience(g, 0)).toBe(2);
    g.advanceTo('end');
    g.act(0).chooseTargets('gy');
    g.passAll();
    g.expect.zone(TWO, 'battlefield', { seat: 0 });
  });

  test('a mana value above the counters puts the card into the hand', () => {
    const g = withCounters(THREE, 2);
    expect(experience(g, 0)).toBe(2);
    g.advanceTo('end');
    g.act(0).chooseTargets('gy');
    g.passAll();
    g.expect.zone(THREE, 'hand', { seat: 0 });
  });

  test('an {X} in the mana cost of a card in a graveyard is 0 (CR 202.3e): {X}{1} is 1', () => {
    const g = withCounters(X1, 1);
    expect(experience(g, 0)).toBe(1);
    g.advanceTo('end');
    g.act(0).chooseTargets('gy');
    g.passAll();
    g.expect.zone(X1, 'battlefield', { seat: 0 });
  });
});

describe('proliferate (CR 701.34a)', () => {
  test('a player with an experience counter is offered, and gets one more of that kind only', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SHAMAN, 'Mountain', 'Forest')
      .battlefield(FREE, { label: 'free' })
      .hand('Lightning Bolt', 'SYNTHETIC Spreading Growth')
      .seat(1)
      .library('Island')
      .at('precombatMain')
      .build();
    g.act(0).cast('Lightning Bolt', { targets: ['free'], pay: true });
    g.passAll();
    expect(experience(g, 0)).toBe(1);
    g.act(0).cast('SYNTHETIC Spreading Growth', { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    expect(d.purpose).toBe('proliferate');
    expect(d.players).toEqual([0]);
    g.choose({ kind: 'choosePermanents', objects: [], players: [0] });
    expect(experience(g, 0)).toBe(2);
    expect(g.state.seats[0]?.poison).toBe(0);
    expect(g.state.seats[0]?.energy).toBeUndefined();
  });
});
