// The `thisWay` count `milledCreature` ("for each creature card put into a graveyard this way", CR 701.17a, 608.2c) and a count read after an offer
// ("you may discard ... If you do, draw that many cards", CR 608.2d): what `validateCard` accepts and refuses. The engine runs both in
// packages/cards/test/convert-grammar-engine-zombie-trio.test.ts with the real cards.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';

const NAME = 'SYNTHETIC Necrotic Sweep';
const you = { kind: 'you' } as const;
const zombie = (what: 'milledCreature' | 'milledLand' | 'sacrificed') => ({
  kind: 'createToken',
  token: {
    kind: 'custom',
    definition: {
      name: 'Zombie',
      manaCost: null,
      colors: ['B'],
      types: ['creature'],
      supertypes: [],
      subtypes: ['Zombie'],
      power: 2,
      toughness: 2,
      loyalty: null,
      defense: null,
      oracleText: '',
      abilities: [],
    },
  },
  count: { kind: 'thisWay', what },
  tapped: true,
});

function withEffects(effects: readonly unknown[]) {
  const card = syntheticCard(NAME);
  const face = card.faces[0];
  if (face === undefined) throw new Error('no face');
  return {
    ...card,
    faces: [{ ...face, spell: { ...face.spell, effect: { kind: 'sequence', effects } } }],
  } as never;
}

describe('milledCreature', () => {
  const mill = { kind: 'mill', player: { kind: 'eachPlayer' }, count: 2 };

  test('is valid after a mill of the same sequence', () => {
    expect(validateCard(withEffects([mill, zombie('milledCreature')]))).toEqual([]);
  });

  test('needs a mill before it', () => {
    expect(JSON.stringify(validateCard(withEffects([zombie('milledCreature')])))).toContain(
      'a mill effect',
    );
    expect(
      validateCard(withEffects([{ kind: 'draw', player: you, count: 1 }, zombie('milledCreature')]))
        .length,
    ).toBeGreaterThan(0);
  });
});

describe('milledLand (Dune Chanter, "for each land card milled this way")', () => {
  const mill = { kind: 'mill', player: you, count: 2 };

  test('is valid after a mill, refused without one', () => {
    expect(validateCard(withEffects([mill, zombie('milledLand')]))).toEqual([]);
    expect(JSON.stringify(validateCard(withEffects([zombie('milledLand')])))).toContain(
      'a mill effect',
    );
  });
});

describe('a count after "you may ... If you do"', () => {
  const offer = { kind: 'may', effect: { kind: 'discard', player: you, count: 0, hand: true } };
  const draw = (condition?: unknown) => {
    const d = { kind: 'draw', player: you, count: { kind: 'thisWay', what: 'discarded' } };
    return condition === undefined ? d : { kind: 'conditional', condition, effect: d };
  };

  test('"that many" reads what the offered discard did', () => {
    expect(validateCard(withEffects([offer, draw({ kind: 'didPrevious' })]))).toEqual([]);
  });

  test('nothing to read without the discard', () => {
    expect(validateCard(withEffects([draw({ kind: 'didPrevious' })])).length).toBeGreaterThan(0);
  });
});
