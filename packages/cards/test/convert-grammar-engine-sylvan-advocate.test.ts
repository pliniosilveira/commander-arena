// Sylvan Advocate: the REAL Oracle text of the golden corpus goes through the grammar as a card with no override, is defined in an engine scenario and is played through
// applyAction. "As long as you control six or more lands, this creature and land creatures you control get +2/+2." is one conditional static ability whose subject is the permanent
// itself and a group (`StaticSubject` `filter` with `andThis`).
// Pins: CR 611.3a (a static ability's set follows the board), CR 613.4c (power and toughness changes apply in layer 7c), CR 604.2 (a static ability that works while a condition holds).
// With three seats only the controller's own lands count and only the controller's own land creatures are boosted ("you control").
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const ADVOCATE = real('Sylvan Advocate');
const NAME = ADVOCATE.name;
// A land that is a creature too (a 1/1 SYNTHETIC fixture of the engine).
const DRYAD = 'SYNTHETIC Riot Grove';

test('the card is valid and lowers to a conditional boost of itself and the land creatures you control', () => {
  expect(validateCard(ADVOCATE)).toEqual([]);
  const statics = ADVOCATE.faces[0]?.abilities.filter((a) => a.kind === 'static') ?? [];
  expect(statics).toHaveLength(1);
  expect(statics[0]).toMatchObject({
    kind: 'static',
    condition: { kind: 'controlsAtLeast', filter: { types: ['land'] }, count: 6 },
    static: {
      kind: 'modifyPt',
      subject: {
        kind: 'filter',
        andThis: true,
        filter: { types: ['land', 'creature'], controller: 'you' },
      },
      power: 2,
      toughness: 2,
    },
  });
});

describe('with six or more lands', () => {
  test('it is a 4/5 and a land creature you control gets +2/+2 too', () => {
    const g = scenario()
      .define(ADVOCATE)
      .seat(0)
      .battlefield(NAME, 'Forest', 'Forest', 'Forest', 'Forest', 'Forest', DRYAD)
      .seat(1)
      .build();
    g.expect.pt(NAME, 4, 5);
    g.expect.pt(DRYAD, 3, 3);
  });

  test('a creature that is not a land is not boosted, and nor is a land that is no creature', () => {
    const g = scenario()
      .define(ADVOCATE)
      .seat(0)
      .battlefield(
        NAME,
        'Grizzly Bears',
        'Forest',
        'Forest',
        'Forest',
        'Forest',
        'Forest',
        'Forest',
      )
      .seat(1)
      .build();
    g.expect.pt('Grizzly Bears', 2, 2);
  });
});

describe('with fewer than six lands', () => {
  test('nothing is boosted', () => {
    const g = scenario()
      .define(ADVOCATE)
      .seat(0)
      .battlefield(NAME, 'Forest', 'Forest', 'Forest', 'Forest', DRYAD)
      .seat(1)
      .build();
    g.expect.pt(NAME, 2, 3);
    g.expect.pt(DRYAD, 1, 1);
  });
});

describe('with three seats (CR 109.4: "you" is the controller)', () => {
  test("an opponent's land creature is not boosted and their lands do not count", () => {
    const g = scenario({ seats: 3 })
      .define(ADVOCATE)
      .seat(0)
      .battlefield(NAME, 'Forest', 'Forest', 'Forest', 'Forest', 'Forest', DRYAD)
      .seat(1)
      .battlefield(DRYAD, { label: 'theirs' })
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .seat(2)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .build();
    g.expect.pt(NAME, 4, 5);
    g.expect.pt('theirs', 1, 1);
  });
});
