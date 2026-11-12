// What the caches of `derive` are keyed by (M45, D-173). The differential test shows that real games get
// the same answers; this one pins the keys with states built to differ in exactly one thing: the same
// object table with another list of continuous effects or another battlefield, the same state with
// another object, the same object in another state. A cache keyed by less than it depends on (the
// object table alone, the object alone) answers from the first state here and fails.
// Cards are SYNTHETIC (src/cards/fixtures) except Grizzly Bears and the basic lands.
import { describe, expect, test } from 'vitest';
import type { ContinuousEffect, GameState } from '../src/index';
import { derive } from '../src/rules/derive';
import { countForSource } from '../src/rules/derive-count';
import { typeViewOf } from '../src/rules/derive-view';
import { paymentSources } from '../src/rules/mana-sources';
import { scenario } from '../src/testing/index';

const ANTHEM = 'SYNTHETIC Anthem';
const BEARS = 'Grizzly Bears';

const pump = (
  state: GameState,
  objects: ContinuousEffect['objects'],
  power: number,
): ContinuousEffect => ({
  id: 'test:pump',
  timestamp: state.nextTimestamp,
  objects,
  until: 'permanent',
  change: { kind: 'modifyPt', power, toughness: power },
});

describe('the caches of derive never answer from another state', () => {
  const g = scenario().seat(0).battlefield(ANTHEM, BEARS, 'Forest').seat(1).build();
  const base = g.state;
  const bears = g.object(BEARS);
  const anthem = g.object(ANTHEM);

  test('the same object table with another list of continuous effects', () => {
    expect(derive(base, bears).power).toBe(3);
    const effect = pump(base, [bears.id], 2);
    const pumped: GameState = { ...base, continuousEffects: [effect] };
    expect(pumped.objects).toBe(base.objects);
    expect(derive(pumped, bears).power).toBe(5);
    // Asking in the other order, and the old state again, gives the same answers.
    expect(derive(base, bears).power).toBe(3);
    const unpumped: GameState = { ...pumped, continuousEffects: [] };
    expect(derive(unpumped, bears).power).toBe(3);
  });

  test('the same object table with another battlefield', () => {
    expect(derive(base, bears).power).toBe(3);
    const without: GameState = {
      ...base,
      battlefield: base.battlefield.filter((id) => id !== anthem.id),
    };
    expect(without.objects).toBe(base.objects);
    expect(derive(without, bears).power).toBe(2);
    expect(derive(base, bears).power).toBe(3);
  });

  test('the same state with another object of the same id', () => {
    const grown = { ...bears, counters: { '+1/+1': 2 } };
    expect(derive(base, bears).power).toBe(3);
    expect(derive(base, grown).power).toBe(5);
    expect(derive(base, bears).power).toBe(3);
  });

  test('the same object in a state where the anthem belongs to the other player', () => {
    const stolen = { ...anthem, controller: 1 as const };
    const state: GameState = { ...base, objects: { ...base.objects, [anthem.id]: stolen } };
    expect(derive(state, bears).power).toBe(2);
    expect(derive(base, bears).power).toBe(3);
  });

  test('type views and counts follow the state', () => {
    const forest = g.object('Forest');
    expect(typeViewOf(base, forest).types).toEqual(['land']);
    const becomes: ContinuousEffect = {
      id: 'test:types',
      timestamp: base.nextTimestamp,
      objects: [forest.id],
      until: 'permanent',
      change: { kind: 'setTypes', types: ['creature'], additive: true },
    };
    const animated: GameState = { ...base, continuousEffects: [becomes] };
    expect(typeViewOf(animated, forest).types).toEqual(['land', 'creature']);
    expect(typeViewOf(base, forest).types).toEqual(['land']);
    const filter = { types: ['creature' as const] };
    expect(countForSource(base, filter, anthem)).toBe(1);
    expect(countForSource(animated, filter, anthem)).toBe(2);
    expect(countForSource(base, filter, anthem)).toBe(1);
  });

  test('payment sources follow the battlefield and the seat', () => {
    expect(paymentSources(base, 0)).toHaveLength(1);
    expect(paymentSources(base, 1)).toHaveLength(0);
    const without: GameState = {
      ...base,
      battlefield: base.battlefield.filter((id) => id !== g.object('Forest').id),
    };
    expect(without.objects).toBe(base.objects);
    expect(paymentSources(without, 0)).toHaveLength(0);
    expect(paymentSources(base, 0)).toHaveLength(1);
  });
});

// D-984 (CR 702.95b): the pair is a field of the object table, so a state with the link and one without are different object tables and nothing may answer for
// the other: the pair subject and the "paired" condition of a layer 7 effect, a layer 6 grant and a keyword are all read through caches keyed by that table.
describe('the caches of derive follow the pair', () => {
  const GIANT = 'SYNTHETIC Soulbound Giant'; // as long as paired, each of those creatures gets +2/+2
  const GLIDER = 'SYNTHETIC Soulbound Glider'; // as long as paired, each of those creatures has flying
  const lone = scenario()
    .seat(0)
    .battlefield(GIANT, { label: 'giant' })
    .battlefield(GLIDER, { label: 'glider' })
    .battlefield(BEARS, { label: 'bears' })
    .seat(1)
    .build();
  const withLink = (a: string, b: string): GameState => {
    const first = lone.object(a);
    const second = lone.object(b);
    return {
      ...lone.state,
      objects: {
        ...lone.state.objects,
        [first.id]: { ...first, paired: { with: second.id, by: 0 } },
        [second.id]: { ...second, paired: { with: first.id, by: 0 } },
      },
    };
  };
  const of = (s: GameState, name: string) => s.objects[lone.id(name)] ?? lone.object(name);
  const flies = (s: GameState, name: string) =>
    derive(s, of(s, name)).abilities.some(
      (x) => x.kind === 'keyword' && x.keyword.kind === 'flying',
    );

  test('power, read for the same battlefield with and without the link, in both orders', () => {
    const linked = withLink('giant', 'bears');
    expect(linked.battlefield).toBe(lone.state.battlefield);
    expect(derive(lone.state, of(lone.state, 'bears')).power).toBe(2);
    expect(derive(linked, of(linked, 'bears')).power).toBe(4);
    expect(derive(lone.state, of(lone.state, 'bears')).power).toBe(2);
    expect(derive(linked, of(linked, 'giant')).power).toBe(5);
    expect(derive(lone.state, of(lone.state, 'giant')).power).toBe(3);
  });

  test('a granted keyword, and a link that moves to another creature', () => {
    const toBears = withLink('glider', 'bears');
    const toGiant = withLink('glider', 'giant');
    expect(flies(lone.state, 'bears')).toBe(false);
    expect(flies(toBears, 'bears')).toBe(true);
    expect(flies(toGiant, 'bears')).toBe(false);
    expect(flies(toGiant, 'giant')).toBe(true);
    expect(flies(lone.state, 'bears')).toBe(false);
  });

  test('a link whose partner is gone from the object table gives nothing (a stale link)', () => {
    const linked = withLink('giant', 'bears');
    const { [lone.id('bears')]: _gone, ...rest } = linked.objects;
    const stale: GameState = {
      ...linked,
      objects: rest,
      battlefield: linked.battlefield.filter((id) => id !== lone.id('bears')),
    };
    expect(derive(stale, of(stale, 'giant')).power).toBe(3);
  });
});
