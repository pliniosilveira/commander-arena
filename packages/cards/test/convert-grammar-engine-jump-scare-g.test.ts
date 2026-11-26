// Jump Scare! deck (issue 108), group G: the REAL Oracle text of Zimone, Mystery Unraveler (the corpus's golden.jsonl) goes through the grammar as a card with no override, equals its
// SYNTHETIC sibling of the engine fixtures (`synthetic-manifest-b.ts`) and is played through applyAction on a table of three seats. Pins: CR 608.2c (the first resolution of the ability
// this turn manifests dread, a later one takes the "otherwise"), CR 608.2d (the controller chooses the permanent), CR 701.40g and 708.8 (an effect turns a permanent face up and pays
// nothing), CR 603.5 ("you may": none is a legal choice), CR 701.62 (manifest dread).
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { syntheticCard as stored } from './convert-helpers';

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

const zimone = real('Zimone, Mystery Unraveler');
const BRUTE = 'SYNTHETIC Manifest Brute'; // {3}{G} 4/4, a creature card
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

describe('Zimone, Mystery Unraveler', () => {
  test('is valid and has the abilities of its SYNTHETIC sibling', () => {
    expect(validateCard(zimone)).toEqual([]);
    expect(zimone.faces[0]?.abilities).toEqual(
      syntheticCard('SYNTHETIC Dread Unraveler').faces[0]?.abilities,
    );
  });

  test('a land you control manifests dread the first time; the second land turns a face-down permanent of its controller face up for free', () => {
    const g = scenario({ seats: 3 })
      .define(zimone)
      .seat(0)
      .battlefield('Zimone, Mystery Unraveler')
      .battlefield(BRUTE, { faceDown: true, label: 'old' })
      .hand('Forest')
      .hand('Island')
      .library('Island', { label: 'a' })
      .library('Forest', { label: 'b' })
      .library(...FILLER)
      .seat(1)
      .battlefield(BRUTE, { faceDown: true, label: 'theirs' })
      .library('Plains')
      .seat(2)
      .library('Plains')
      .at('precombatMain', { active: 0, extraLandDrops: 1 })
      .build();
    g.act(0).playLand('Forest');
    g.passAll();
    g.act(0).chooseCards('b');
    g.act(0).playLand('Island');
    g.passAll();
    g.act(0).choosePermanents('old');
    g.expect.pt('old', 4, 4);
    g.expect.invariants();
  });
});

// A card the parser must not half read: the otherwise of a condition that is not a count of resolutions keeps the other rules' behavior.
describe('the neighbours of the new readings stay unread', () => {
  test.each([
    'Whenever a land you control enters, you may turn a permanent you control face up. Otherwise, you gain 2 life.',
    'Whenever a land you control enters, turn target permanent you control face up.',
    'Whenever a land you control enters, you may turn a permanent an opponent controls face up.',
  ])('%s', (text) => {
    const imported = importCard(
      stored({
        name: 'SYNTHETIC Probe',
        manaCost: '{2}{G}',
        typeLine: 'Enchantment',
        oracleText: text,
      }),
      undefined,
      NO_OVERRIDES,
    );
    expect(imported.support.status).toBe('unsupported');
  });
});
