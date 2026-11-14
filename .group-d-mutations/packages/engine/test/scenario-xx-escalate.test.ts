// Escalate (CR 702.120, D-145): "For each mode you choose beyond the first as you cast this spell, you pay an additional [cost]."
// Pins: CR 702.120a (an additional cost for each mode beyond the first, paid by the rules for additional costs 601.2f-h), CR 700.2 and
// 700.2a (the modes are chosen as the spell is cast), CR 601.2f (the total cost is determined with the additional costs and the reductions),
// CR 118.3 (a player can't pay a cost they have not the resources for: a set of modes they could not afford is not offered).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-escalate.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';
import { chooseModesDecision } from './pending-helpers';

const CHARM = 'SYNTHETIC Escalating Charm'; // {1}{R}, Escalate {1}, choose one or more of three
const BOTH = 'SYNTHETIC Costly Both'; // {R}, Escalate {2}{R}, choose one or both
const PAIR = 'SYNTHETIC Fixed Pair'; // {1}{R}, Escalate {1}, choose two
const BEARS = 'Grizzly Bears';

/** Seat 0 holds `card` with `lands` Mountains; seat 1 has a Bears to aim at and a library to draw from. */
const game = (card: string, lands: number) =>
  scenario()
    .seat(0)
    .hand(card)
    .battlefield('Mountain', { count: lands })
    .library('Plains', 'Plains', 'Plains', 'Plains')
    .seat(1)
    .battlefield(BEARS, { label: 'bears' })
    .library('Plains', 'Plains', 'Plains', 'Plains')
    .build();

const tapped = (g: ScenarioGame): number =>
  g.find({ name: 'Mountain', zone: 'battlefield' }).filter((o) => o.tapped).length;

describe('the cards are valid', () => {
  test.each([CHARM, BOTH, PAIR, 'SYNTHETIC Escalating Kicker Charm'])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('the cost: the mana cost plus the escalate cost for each mode beyond the first (CR 702.120a)', () => {
  test('one mode costs only the mana cost: {1}{R} is two Mountains', () => {
    const g = game(CHARM, 5);
    g.act(0).cast(CHARM).modes(2).pay();
    g.passAll();
    expect(tapped(g)).toBe(2);
    g.expect.life(0, 43);
  });

  test('two modes: one more {1}', () => {
    const g = game(CHARM, 5);
    g.act(0)
      .cast(CHARM)
      .modes(1, 2)
      .targets([{ player: 1 }])
      .pay();
    expect(tapped(g)).toBe(3);
    g.passAll();
    g.expect.life(0, 43);
    g.expect.handSize(1, 1);
  });

  test('three modes: {1}{R}{1}{1}, two more than the base', () => {
    const g = game(CHARM, 5);
    g.act(0)
      .cast(CHARM)
      .modes(0, 1, 2)
      .targets(['bears', { player: 0 }])
      .pay();
    expect(tapped(g)).toBe(4);
    g.passAll();
    g.expect.life(0, 43);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('a colored escalate cost is added as written: {R} {2}{R} for two modes is {R}{2}{R}', () => {
    const g = game(BOTH, 4);
    g.act(0)
      .cast(BOTH)
      .modes(0, 1)
      .targets([{ player: 0 }])
      .pay();
    expect(tapped(g)).toBe(4);
    g.passAll();
    g.expect.life(0, 43);
    g.expect.handSize(0, 1);
  });

  test('a fixed number of modes pays the escalate cost once for the second mode: {1}{R}{1}', () => {
    const g = game(PAIR, 4);
    g.act(0)
      .cast(PAIR)
      .modes(1, 2)
      .targets([{ player: 0 }])
      .pay();
    expect(tapped(g)).toBe(3);
  });
});

describe('only the sets of modes the caster can afford are offered (CR 118.3)', () => {
  test('with exactly the mana cost, only the single modes', () => {
    const g = game(CHARM, 2);
    g.act(0).cast(CHARM);
    expect(chooseModesDecision(g).sets).toEqual([[0], [1], [2]]);
  });

  test('with one more mana the pairs too, never all three', () => {
    const g = game(CHARM, 3);
    g.act(0).cast(CHARM);
    expect(chooseModesDecision(g).sets).toEqual([[0], [1], [2], [0, 1], [0, 2], [1, 2]]);
  });

  test('with enough for everything all seven sets', () => {
    const g = game(CHARM, 4);
    g.act(0).cast(CHARM);
    expect(chooseModesDecision(g).sets).toHaveLength(7);
  });

  test('a set that was not offered is refused when it is answered anyway', () => {
    const g = game(CHARM, 2);
    g.act(0).cast(CHARM);
    const r = g.act(0).try.action({ kind: 'chooseModes', modes: [0, 1] });
    expect(r.ok).toBe(false);
  });

  test('a colored escalate cost the lands cannot make: no second mode with only {R}{R}{R} and the {2}{R} unaffordable', () => {
    const g = game(BOTH, 3);
    g.act(0).cast(BOTH);
    // {R} and {2}{R} more is four mana in all; three Mountains pay one mode only. One legal set per mode: the engine asks.
    expect(chooseModesDecision(g).sets).toEqual([[0], [1]]);
  });

  test('a "choose two" spell whose pair is unaffordable cannot be cast at all', () => {
    const g = game(PAIR, 2);
    g.expect.illegal(0, { cast: PAIR });
  });
});

describe('with a kicker: the kicker is asked only when the escalated total can be paid', () => {
  const KICKED = 'SYNTHETIC Escalating Kicker Charm'; // {1}{R}, Kicker {1}, Escalate {1}, choose one or both

  test('two modes and the kicker need {1}{R} + {1} + {1}: with four Mountains the kicker is asked', () => {
    const g = game(KICKED, 4);
    g.act(0).cast(KICKED).modes(0, 1);
    expect(g.state.pending?.kind).toBe('confirmOptional');
  });

  test('with three Mountains the kicker for two modes is not affordable, so it is not asked', () => {
    const g = game(KICKED, 3);
    g.act(0).cast(KICKED).modes(0, 1);
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
  });
});

describe('a spell without escalate is unchanged', () => {
  test('a modal spell with no escalate keeps all its sets whatever the mana', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Both Charm')
      .battlefield('Island', 'Island', 'Island')
      .build();
    g.act(0).cast('SYNTHETIC Both Charm');
    expect(chooseModesDecision(g).sets).toEqual([[0], [1], [0, 1]]);
  });
});

describe('validation', () => {
  const withKeyword = (keyword: object, spell?: object) =>
    ({
      ...syntheticCard(CHARM),
      faces: [
        {
          ...syntheticCard(CHARM).faces[0],
          abilities: [{ kind: 'keyword', keyword }],
          ...(spell === undefined ? {} : { spell }),
        },
      ],
    }) as unknown as Parameters<typeof validateCard>[0];
  const ok = { kind: 'escalate', cost: [{ kind: 'mana', symbols: ['1'] }] };

  test('the good shape validates', () => {
    expect(validateCard(withKeyword(ok))).toEqual([]);
  });

  test.each([
    ['no cost', { kind: 'escalate', cost: [] }],
    ['a cost that is not mana', { kind: 'escalate', cost: [{ kind: 'payLife', amount: 2 }] }],
    ['an X in the cost', { kind: 'escalate', cost: [{ kind: 'mana', symbols: ['X'] }] }],
  ])('%s is refused', (_name, keyword) => {
    expect(validateCard(withKeyword(keyword)).length).toBeGreaterThan(0);
  });

  test('a spell that is not modal, or lets only one mode be chosen, is refused', () => {
    const one = { ...syntheticCard(CHARM).faces[0]?.spell, chooseModes: { min: 1, max: 1 } };
    expect(validateCard(withKeyword(ok, one)).length).toBeGreaterThan(0);
    const plain = { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } };
    expect(validateCard(withKeyword(ok, plain)).length).toBeGreaterThan(0);
  });
});
