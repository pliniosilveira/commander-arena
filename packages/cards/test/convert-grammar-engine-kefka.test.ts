// Kefka, Dancing Mad (deck support issue 97): the REAL Oracle text (the corpus's golden.jsonl) goes through the grammar as a card with no override, reads as supported, and is played through
// the engine: at the beginning of its controller's end step one card at random leaves each opponent's graveyard, any number of them are cast free, and each owner of a spell cast loses
// life equal to its mana value.
import { readFileSync } from 'node:fs';
import { scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const load = (name: string) => {
  const found = cards.find((c) => c.name === name);
  if (found === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(found), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, JSON.stringify(imported.support)).toBe('supported');
  return imported.definition;
};

test('Kefka reads as supported: the exile at random per opponent, the free casts and the life loss', () => {
  const kefka = load('Kefka, Dancing Mad');
  const json = JSON.stringify(kefka.faces);
  expect(json).toContain('"perOwner":true');
  expect(json).toContain('"remember":true');
  expect(json).toContain('"loseLifeManaValue"');
});

test('a free cast that does not follow an exile, or a life loss that does not follow a remembered cast, is not read', () => {
  const kefka = cards.find((c) => c.name === 'Kefka, Dancing Mad');
  if (kefka === undefined) throw new Error('Kefka is not in the golden corpus');
  const withText = (oracleText: string) => {
    const face = kefka.faces[0];
    if (face === undefined) throw new Error('no face');
    return importCard(
      fromGoldenCard({ ...kefka, faces: [{ ...face, oracleText }] }),
      undefined,
      NO_OVERRIDES,
    );
  };
  const noCast = withText(
    "At the beginning of your end step, exile a card at random from each opponent's graveyard. Then each player who owns a spell you cast this way loses life equal to its mana value.",
  );
  expect(noCast.support.status).not.toBe('supported');
  const noExile = withText(
    'At the beginning of your end step, you may cast any number of spells from among cards exiled this way without paying their mana costs.',
  );
  expect(noExile.support.status).not.toBe('supported');
});

test('Kefka at the end step: each opponent loses a graveyard card at random, the spells cast free cost their owners life', () => {
  const kefka = load('Kefka, Dancing Mad');
  const g = scenario({ seats: 3 })
    .define(kefka)
    .seat(0)
    .battlefield(kefka.name)
    .seat(1)
    .graveyard('Grizzly Bears')
    .seat(2)
    .graveyard('Giant Spider')
    .at('postcombatMain', { active: 0, turn: 3 })
    .build();
  g.passAll();
  g.passAll();
  g.expect.pending('chooseCards', 0);
  g.act(0).chooseCards({ name: 'Grizzly Bears', zone: 'exile', seat: 1 });
  g.expect.pending('chooseCards', 0);
  g.act(0).chooseCards({ name: 'Giant Spider', zone: 'exile', seat: 2 });
  g.expect.life(0, 40);
  g.expect.life(1, 38);
  g.expect.life(2, 36);
  g.expect.invariants();
});
