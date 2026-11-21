// Dance of the Elements deck, misc group: the REAL Oracle text of Omnath, Locus of the Roil (golden.jsonl) goes through the grammar as a card with no override, is defined in an engine
// scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. CR 120.3 (Damage), CR 608.2c (counted as it resolves).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const LIBRARY = Array.from({ length: 8 }, () => 'Island');

const omnath = real('Omnath, Locus of the Roil');
// A second Elemental with no abilities of its own: Omnath's definition with the name changed and the abilities removed (SYNTHETIC test double).
const ELEMENTAL = 'SYNTHETIC Plain Elemental';
const plainElemental: CardDefinition = {
  ...omnath,
  name: ELEMENTAL,
  faces: omnath.faces.map((f) => ({ ...f, name: ELEMENTAL, supertypes: [], abilities: [] })),
};

test('Omnath is a valid card', () => {
  expect(validateCard(omnath)).toEqual([]);
});

describe('Omnath, Locus of the Roil: damage equal to the Elementals you control', () => {
  const play = (others: readonly string[], target: { player: 0 | 1 } | string) => {
    const g = scenario()
      .define(omnath)
      .define(plainElemental)
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(omnath.name)
      .battlefield('Forest', 'Island', 'Mountain', 'Forest', ...others)
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(omnath.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(target);
    g.passAll();
    return g;
  };

  test('alone, Omnath counts itself: 1 damage to the opponent', () => {
    const g = play([], { player: 1 });
    g.expect.life(1, 19);
  });

  test('with two other Elementals it is counted as the ability resolves: 3 damage', () => {
    const g = play([ELEMENTAL, ELEMENTAL], { player: 1 });
    g.expect.life(1, 17);
    g.expect.life(0, 20);
  });

  test('a creature that is not an Elemental is not counted', () => {
    const g = play(['Grizzly Bears', ELEMENTAL], { player: 1 });
    g.expect.life(1, 18);
  });
});
