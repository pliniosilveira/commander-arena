// The Bruna deck program (issue 5), the search templates group (D-256 and following): Search for Glory, Heirloom Blade, Myriad Landscape. The lines are the real Oracle
// text of the acceptance cards of the golden corpus (names replaced by ~) with the nodes the grammar produces, played through applyAction where the engine reads them; the other
// lines are SYNTHETIC siblings and the near misses the grammar must not read.
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const PERMANENTS = ['artifact', 'creature', 'enchantment', 'land', 'planeswalker', 'battle'];

describe('Search for Glory: a search for one of several kinds of card, and {S} spent (D-256)', () => {
  const TEXT =
    'Search your library for a snow permanent card, a legendary card, or a Saga card, reveal it, put it into your hand, then shuffle. You gain 1 life for each {S} spent to cast ~.';

  test('reads as a search for the union of the three kinds, then life for the snow mana spent', () => {
    const parsedFace = readAll(TEXT, 'sorcery');
    expect(parsedFace.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        {
          kind: 'search',
          player: { kind: 'you' },
          filter: {
            anyOf: [
              { supertypes: ['snow'], anyOf: PERMANENTS.map((t) => ({ types: [t] })) },
              { supertypes: ['legendary'] },
              { subtypes: ['Saga'] },
            ],
          },
          max: 1,
          destinations: [{ zone: 'hand', count: 1 }],
          reveal: true,
          shuffle: true,
        },
        {
          kind: 'gainLife',
          player: { kind: 'you' },
          amount: { kind: 'manaSpent', snow: true },
        },
      ],
    });
  });

  test('the real card is supported and the golden text is the one tested here', () => {
    const card = cards.find((c) => c.name === 'Search for Glory');
    expect(card?.faces[0]?.oracleText).toContain(TEXT.replace('~', 'this spell'));
    expect(real('Search for Glory').name).toBe('Search for Glory');
  });

  test('two kinds with "or", and a kind that is a plain subtype or type (SYNTHETIC)', () => {
    const face = readAll(
      'Search your library for a creature card or a land card, put it into your hand, then shuffle.',
      'sorcery',
    );
    expect(face.spell?.effect).toMatchObject({
      kind: 'search',
      filter: { anyOf: [{ types: ['creature'] }, { types: ['land'] }] },
    });
  });

  test('"a nonland permanent card" is the permanent types but the land (SYNTHETIC)', () => {
    const face = readAll(
      'Search your library for a nonland permanent card, put it into your hand, then shuffle.',
      'sorcery',
    );
    expect(face.spell?.effect).toMatchObject({
      kind: 'search',
      filter: {
        anyOf: [
          { types: ['artifact'] },
          { types: ['creature'] },
          { types: ['enchantment'] },
          { types: ['planeswalker'] },
          { types: ['battle'] },
        ],
      },
    });
  });

  test('a list without "or" before the last kind, or a kind without its "card", is not read (SYNTHETIC)', () => {
    for (const text of [
      'Search your library for a snow permanent card, a legendary card, a Saga card, put it into your hand, then shuffle.',
      'Search your library for a snow permanent card, legendary card, or a Saga card, put it into your hand, then shuffle.',
      'Search your library for a legendary card and a Saga card, put it into your hand, then shuffle.',
    ]) {
      expect(dropped(text, 'sorcery').reason, text).toBeDefined();
    }
  });

  test('"for each {S}" is read in a spell only of the spell itself (SYNTHETIC)', () => {
    // "it" in a spell may be a target, "{W}" is a color of mana, not the snow symbol.
    expect(
      dropped('You gain 1 life for each {S} spent to cast it.', 'sorcery').reason,
    ).toBeDefined();
    expect(
      dropped('You gain 1 life for each {W} spent to cast ~.', 'sorcery').reason,
    ).toBeDefined();
  });

  test('the amount of any mana spent is read the same way in a spell (SYNTHETIC)', () => {
    const face = readAll('You gain 1 life for each mana spent to cast ~.', 'sorcery');
    expect(face.spell?.effect).toEqual({
      kind: 'gainLife',
      player: { kind: 'you' },
      amount: { kind: 'manaSpent' },
    });
  });

  describe('played with the real card', () => {
    const GLORY = real('Search for Glory');
    // A snow basic land, read from its type line and rules text (CR 205.4g, 305.6).
    const SNOW = parsed('SYNTHETIC Snow Land', 'Basic Snow Land — Plains', '({T}: Add {W}.)');
    const SPRITE = parsed('SYNTHETIC Snow Faerie', 'Snow Creature — Faerie', '', {
      manaCost: '{W}',
      power: '1',
      toughness: '1',
    });
    const FLURRY = parsed('SYNTHETIC Snow Charm', 'Snow Instant', 'You gain 1 life.', {
      manaCost: '{U}',
    });
    const LEGEND = parsed('SYNTHETIC Frost Legend', 'Legendary Creature — Human', '', {
      manaCost: '{1}{W}',
      power: '2',
      toughness: '2',
    });
    const FILLER = Array.from({ length: 10 }, () => 'Island');

    const game = (lands: readonly string[]) =>
      scenario()
        .define(GLORY)
        .define(SNOW)
        .define(SPRITE)
        .define(FLURRY)
        .define(LEGEND)
        .seat(0)
        .hand(GLORY.name)
        .battlefield(...lands)
        .library(SPRITE.name, FLURRY.name, LEGEND.name, ...FILLER)
        .seat(1)
        .library(...FILLER)
        .at('precombatMain', { active: 0, turn: 1 })
        .build();

    test('the snow land is a snow land, and the snow instant is not a snow permanent', () => {
      expect(SNOW.faces[0]?.supertypes).toEqual(['basic', 'snow']);
      expect(FLURRY.faces[0]?.supertypes).toEqual(['snow']);
    });

    test('three snow lands: the search finds a snow creature and three life are gained', () => {
      const g = game([SNOW.name, SNOW.name, SNOW.name]);
      g.act(0).cast(GLORY.name, { pay: true });
      g.passAll();
      g.expect.pending('chooseCards', 0);
      g.act(0).chooseCards(SPRITE.name);
      g.expect.zone(SPRITE.name, 'hand', { seat: 0 });
      g.expect.life(0, 43);
      g.expect.invariants();
    });

    test('Plains pay for it: no life, and the snow instant is never offered', () => {
      const g = game(['Plains', 'Plains', 'Plains']);
      g.act(0).cast(GLORY.name, { pay: true });
      g.passAll();
      g.expect.pending('chooseCards', 0);
      g.act(0).chooseCards(LEGEND.name);
      g.expect.zone(LEGEND.name, 'hand', { seat: 0 });
      g.expect.zone(FLURRY.name, 'library', { seat: 0 });
      g.expect.life(0, 40);
    });
  });
});
