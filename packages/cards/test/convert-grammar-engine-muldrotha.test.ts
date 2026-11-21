// Muldrotha, the Gravetide: the REAL Oracle text (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is compared with the SYNTHETIC
// avatar of the engine fixtures the engine scenarios of `scenario-xx-graveyard-each-type.test.ts` run, and is played through applyAction, so the node the parser writes for the real text
// is what the engine runs. Pins: CR 601.2a (cast from the graveyard), CR 305.1 and 305.2 (a land play with the land drop of the turn), CR 205.2a (one type for a card of several types).
import { readFileSync } from 'node:fs';
import {
  type CardDefinition,
  getLegalActions,
  syntheticCard,
  validateCard,
} from '@commander-arena/engine';
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

const MULDROTHA = real('Muldrotha, the Gravetide');
const AVATAR = 'SYNTHETIC Gravetide Avatar';

const faceOf = (card: CardDefinition) => {
  const face = card.faces[0];
  if (face === undefined) throw new Error(`${card.name} has no face`);
  return face;
};

describe('Muldrotha, the Gravetide, read from the real text', () => {
  test('the card is valid and its static ability is the one of the SYNTHETIC avatar', () => {
    expect(validateCard(MULDROTHA)).toEqual([]);
    expect(faceOf(MULDROTHA).abilities).toEqual(faceOf(syntheticCard(AVATAR)).abilities);
  });

  test('it is a 6/6 legendary creature that costs {3}{B}{G}{U}', () => {
    const face = faceOf(MULDROTHA);
    expect(face.supertypes).toEqual(['legendary']);
    expect([face.power, face.toughness]).toEqual([6, 6]);
    expect(face.manaCost).toEqual(['3', 'B', 'G', 'U']);
  });

  test('on the battlefield it lets its controller play a land and cast a spell of each type from the graveyard, through applyAction', () => {
    const g = scenario()
      .define(MULDROTHA)
      .seat(0)
      .battlefield('Muldrotha, the Gravetide', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .graveyard('Grizzly Bears', 'Giant Spider', 'Mountain', 'Island')
      .library('Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    const fromYard = (kind: 'castSpell' | 'playLand') =>
      getLegalActions(g.state, 0).filter(
        (a) => a.kind === kind && g.state.objects[a.object]?.zone === 'graveyard',
      );
    expect(fromYard('castSpell')).toHaveLength(2);
    expect(fromYard('playLand')).toHaveLength(2);
    g.act(0).playLand('Mountain');
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    // The creature slot and the land slot (and the land drop) are used: the other creature and the other land are not offered.
    expect(fromYard('castSpell')).toHaveLength(0);
    expect(fromYard('playLand')).toHaveLength(0);
    g.expect.invariants();
  });
});
