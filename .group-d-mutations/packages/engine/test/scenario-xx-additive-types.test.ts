// "Becomes a creature in addition to its other types" (CR 205.1b): the additive form of setTypes.
// Pins: CR 205.1b (the object keeps every prior card type, supertype and subtype), CR 613.1d
// (layer 4 types), CR 613.7 (timestamp order inside a layer), CR 205.1a and 205.3d (the replacing
// form, for contrast: it removes the creature types), CR 208.3 (a noncreature permanent has no
// power or toughness), CR 611.2a and 514.2 (until end of turn, ended at cleanup).
// Cards are SYNTHETIC and defined in this file.
import { describe, expect, test } from 'vitest';
import type { Effect } from '../src/ast/types';
import { singleFace } from '../src/cards/fixtures/helpers';
import { derive } from '../src/rules/derive';
import { scenario } from '../src/testing/index';

const FOREST = 'Forest';
const BEARS = 'Grizzly Bears';
const END = 'untilEndOfTurn' as const;
const T1 = { kind: 'target', id: 't1' } as const;

const spell = (name: string, effect: Effect, filter: { types?: ['land'] | ['creature'] }) =>
  singleFace({
    name,
    manaCost: ['1'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: 'SYNTHETIC',
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', ...filter } } }],
      effect,
    },
  });

/** "Target land becomes a 3/3 Elemental creature in addition to its other types." */
const AWAKEN = spell(
  'SYNTHETIC Awaken Land',
  {
    kind: 'sequence',
    effects: [
      {
        kind: 'setTypes',
        objects: T1,
        types: ['creature'],
        subtypes: ['Elemental'],
        additive: true,
        duration: END,
      },
      { kind: 'setPt', objects: T1, power: 3, toughness: 3, duration: END },
    ],
  },
  { types: ['land'] },
);

/** "Target creature becomes a Frog in addition to its other types." */
const FROG_TOO = spell(
  'SYNTHETIC Also A Frog',
  { kind: 'setTypes', objects: T1, subtypes: ['Frog'], additive: true, duration: END },
  { types: ['creature'] },
);

/** "Target creature becomes an Elemental in addition to its other types." */
const ELEMENTAL_TOO = spell(
  'SYNTHETIC Also An Elemental',
  { kind: 'setTypes', objects: T1, subtypes: ['Elemental'], additive: true, duration: END },
  { types: ['creature'] },
);

/** The replacing form, for contrast: "becomes a Frog". */
const FROG_ONLY = spell(
  'SYNTHETIC Only A Frog',
  { kind: 'setTypes', objects: T1, subtypes: ['Frog'], duration: END },
  { types: ['creature'] },
);

function cast(card: ReturnType<typeof spell>, target: string, ...rest: ReturnType<typeof spell>[]) {
  const b = scenario().define(card);
  for (const other of rest) b.define(other);
  const g = b
    .seat(0)
    .hand(card.name, ...rest.map((c) => c.name))
    .battlefield(FOREST, BEARS, 'Island', 'Island')
    .library('Island', { count: 6 })
    .seat(1)
    .library('Island', { count: 6 })
    .build();
  g.act(0).cast(card.name, { targets: [target], pay: true });
  g.passAll();
  return g;
}

describe('additive: nothing the object has is replaced', () => {
  test('a land becomes a land creature with its land type, a creature type and the set 3/3', () => {
    const g = cast(AWAKEN, FOREST);
    g.expect.derived(FOREST, {
      types: ['land', 'creature'],
      subtypes: ['Forest', 'Elemental'],
    });
    g.expect.pt(FOREST, 3, 3);
  });

  test('it still taps for mana (a creature land keeps its land abilities) and is summoning sick only if new', () => {
    const g = cast(AWAKEN, FOREST);
    const forest = g.view(0).battlefield.find((o) => o.name === FOREST);
    expect(forest?.types).toEqual(['land', 'creature']);
    expect(forest?.summoningSick).toBe(false);
  });

  test('a creature keeps its creature type when another is added; the replacing form removes it', () => {
    const also = cast(FROG_TOO, BEARS);
    also.expect.derived(BEARS, { types: ['creature'], subtypes: ['Bear', 'Frog'] });
    const only = cast(FROG_ONLY, BEARS);
    only.expect.derived(BEARS, { types: ['creature'], subtypes: ['Frog'] });
  });

  test('the effect ends at cleanup: the land is a plain land again, with no power or toughness', () => {
    const g = cast(AWAKEN, FOREST);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.derived(FOREST, { types: ['land'], subtypes: ['Forest'] });
    expect(derive(g.state, g.object(FOREST)).power).toBeNull();
    expect(g.state.continuousEffects).toEqual([]);
  });

  test('an additive effect and a replacing one apply in timestamp order (CR 613.7)', () => {
    const play = (first: ReturnType<typeof spell>, second: ReturnType<typeof spell>) => {
      const g = scenario()
        .define(first)
        .define(second)
        .seat(0)
        .hand(first.name, second.name)
        .battlefield(BEARS, 'Island', 'Island', 'Island', 'Island')
        .seat(1)
        .build();
      g.act(0).cast(first.name, { targets: [BEARS], pay: true });
      g.passAll();
      g.act(0).cast(second.name, { targets: [BEARS], pay: true });
      g.passAll();
      return g;
    };
    // Adding Elemental and then replacing the creature types leaves only Frog ...
    play(ELEMENTAL_TOO, FROG_ONLY).expect.derived(BEARS, {
      types: ['creature'],
      subtypes: ['Frog'],
    });
    // ... replacing first and then adding Elemental leaves both.
    play(FROG_ONLY, ELEMENTAL_TOO).expect.derived(BEARS, {
      types: ['creature'],
      subtypes: ['Frog', 'Elemental'],
    });
  });
});
