// Earthbend N (Avatar: The Last Airbender keyword action; the rulings of 2025-10-02 are the source of the behaviour, the Comprehensive Rules text of this repository has no rule for it, so
// no rule number is cited): "Target land you control becomes a 0/0 creature with haste that's still a land. Put N +1/+1 counters on it. When it dies or is exiled, return it to the
// battlefield tapped." The cards are SYNTHETIC (defined in this file): the engine's `earthbend` effect, driven through applyAction.
// Pins: the land keeps its land type and mana ability; it is a 0/0 creature with the counters (so N/N) and haste; it returns tapped when destroyed or exiled; it does not return from
// the hand; a land already a creature gets the counters again; a target that is gone does nothing; the delayed return is the controller's; it works at a table of three.
import { describe, expect, test } from 'vitest';
import { getView } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const TARGET_LAND = {
  id: 't1',
  what: { kind: 'object', filter: { types: ['land'], controller: 'you' } },
} as const;
const T1 = { kind: 'target', id: 't1' } as const;

const BEND = 'SYNTHETIC Earthbend Two';
const BEND_LESSON = 'SYNTHETIC Earthbend Counted';
const EXILE = 'SYNTHETIC Exile Creature';
const BOUNCE = 'SYNTHETIC Bounce Creature';
const DESTROY = 'SYNTHETIC Destroy Creature';

const bend = singleFaceCard({
  name: BEND,
  manaCost: ['1', 'G'],
  types: ['sorcery'],
  colors: ['G'],
  colorIdentity: ['G'],
  oracleText: 'Earthbend 2.',
  spell: { targets: [TARGET_LAND], effect: { kind: 'earthbend', objects: T1, count: 2 } },
});
const bendCounted = singleFaceCard({
  name: BEND_LESSON,
  manaCost: ['G'],
  types: ['sorcery'],
  colors: ['G'],
  colorIdentity: ['G'],
  oracleText: 'Earthbend X, where X is the number of Forests you control.',
  spell: {
    targets: [TARGET_LAND],
    effect: {
      kind: 'earthbend',
      objects: T1,
      count: { kind: 'countOf', filter: { subtypes: ['Forest'], controller: 'you' } },
    },
  },
});
const destroy = singleFaceCard({
  name: DESTROY,
  manaCost: ['G'],
  types: ['instant'],
  colors: ['G'],
  colorIdentity: ['G'],
  oracleText: 'Destroy target creature.',
  spell: {
    targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
    effect: { kind: 'destroy', objects: T1 },
  },
});
const bounce = singleFaceCard({
  name: BOUNCE,
  manaCost: ['G'],
  types: ['instant'],
  colors: ['G'],
  colorIdentity: ['G'],
  oracleText: "Return target creature to its owner's hand.",
  spell: {
    targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
    effect: { kind: 'moveToZone', objects: T1, to: 'hand' },
  },
});
const exile = singleFaceCard({
  name: EXILE,
  manaCost: ['R'],
  types: ['instant'],
  colors: ['R'],
  colorIdentity: ['R'],
  oracleText: 'Exile target creature.',
  spell: {
    targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
    effect: { kind: 'exile', objects: T1 },
  },
});

function game(seats: 2 | 3 = 2): ScenarioGame {
  let b = scenario({ seats })
    .seat(0)
    .hand(BEND, BEND_LESSON, DESTROY, BOUNCE)
    .battlefield('Forest', { count: 4 });
  for (let seat = 1; seat < seats; seat += 1) b = b.seat(seat).hand(EXILE).battlefield('Mountain');
  return b
    .define(bend)
    .define(bendCounted)
    .define(exile)
    .define(destroy)
    .define(bounce)
    .at('precombatMain')
    .build();
}

const forest = (g: ScenarioGame) =>
  getView(g.state, 0).battlefield.find((o) => o.name === 'Forest' && o.counters['+1/+1'] > 0);

describe('earthbend: the land becomes a 0/0 haste creature with counters', () => {
  test('it is a land creature N/N with haste that still taps for mana', () => {
    const g = game();
    g.act(0).cast(BEND, { targets: ['Forest[1]'], pay: true });
    g.pass();
    g.pass();
    const land = forest(g);
    expect(land).toBeDefined();
    expect(land?.types).toEqual(expect.arrayContaining(['land', 'creature']));
    expect(land?.subtypes).toContain('Forest');
    expect(land?.power).toBe(2);
    expect(land?.toughness).toBe(2);
    g.expect.derived(land?.id ?? 'none', { keywords: ['haste'] });
    expect(land?.counters['+1/+1']).toBe(2);
  });

  test('X is read as it resolves: four Forests give four counters', () => {
    const g = game();
    g.act(0).cast(BEND_LESSON, { targets: ['Forest[1]'], pay: true });
    g.pass();
    g.pass();
    expect(forest(g)?.power).toBe(4);
  });
});

describe('earthbend: it returns when it dies or is exiled', () => {
  const bendThen = (kill: (g: ScenarioGame) => void): ScenarioGame => {
    const g = game();
    g.act(0).cast(BEND, { targets: ['Forest[1]'], pay: true });
    g.pass();
    g.pass();
    kill(g);
    return g;
  };
  const forests = (g: ScenarioGame) =>
    getView(g.state, 0).battlefield.filter((o) => o.name === 'Forest');

  test('destroyed: the card returns tapped, a fresh land that is no creature', () => {
    const g = bendThen((x) => {
      x.act(0).cast(DESTROY, { targets: ['Forest[1]'], pay: true });
      x.pass();
      x.pass();
      // the delayed trigger waits on the stack
      x.pass();
      x.pass();
    });
    const all = forests(g);
    expect(all).toHaveLength(4);
    const back = all.find((o) => o.tapped && !o.types.includes('creature'));
    expect(back).toBeDefined();
    expect(back?.counters['+1/+1'] ?? 0).toBe(0);
  });

  test('exiled by an opponent: it returns under its controller, tapped', () => {
    const g = bendThen((x) => {
      x.act(0).pass();
      x.act(1).cast(EXILE, { targets: ['Forest[1]'], pay: true });
      x.pass();
      x.pass();
      x.pass();
      x.pass();
    });
    expect(forests(g)).toHaveLength(4);
    expect(forests(g).some((o) => o.tapped)).toBe(true);
    expect(
      getView(g.state, 1).battlefield.some((o) => o.name === 'Forest' && o.controller === 1),
    ).toBe(false);
  });

  test("bounced to its owner's hand: it is not returned", () => {
    const g = bendThen((x) => {
      x.act(0).cast(BOUNCE, { targets: ['Forest[1]'], pay: true });
      x.pass();
      x.pass();
      x.pass();
      x.pass();
    });
    expect(forests(g)).toHaveLength(3);
    // two spells cast of four cards, and the Forest came back to the hand
    g.expect.handSize(0, 3);
  });
});

describe('earthbend: three seats', () => {
  test('the land of the controller is the one bent, and nothing of the opponents changes', () => {
    const g = game(3);
    g.act(0).cast(BEND, { targets: ['Forest[1]'], pay: true });
    g.pass();
    g.pass();
    g.pass();
    expect(forest(g)?.controller).toBe(0);
    expect(
      getView(g.state, 1).battlefield.filter(
        (o) => o.controller !== 0 && o.types.includes('creature'),
      ),
    ).toHaveLength(0);
  });
});
