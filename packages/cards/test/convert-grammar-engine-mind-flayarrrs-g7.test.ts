// Mind Flayarrrs deck, group 7. Nighthowler: the REAL Oracle text of the golden corpus goes through the grammar with no override and is played through applyAction with the
// scenario DSL, with three seats (creature cards in ALL graveyards count, every player's). Pins: CR 702.103 (Bestow; the rules text was not available, so the subrule
// letters are unchecked), CR 613.4c (a "+X/+X" follows the board), CR 107.3c (X is what the text defines), CR 205.1a (an Aura that is not a creature).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { dropped } from './parser-p5-helpers';

const GOLDEN: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

const real = (name: string): CardDefinition => {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
};

const NIGHTHOWLER = real('Nighthowler');
const NAME = NIGHTHOWLER.name;
const BEARS = 'Grizzly Bears';

describe('Nighthowler: +X/+X for itself and the creature it enchants', () => {
  const build = () =>
    scenario({ seats: 3 })
      .define(NIGHTHOWLER)
      .seat(0)
      .hand(NAME)
      .battlefield('Swamp', { count: 4 })
      .battlefield(BEARS)
      .graveyard('Serra Angel')
      .seat(1)
      .graveyard('Serra Angel', 'Lightning Bolt')
      .seat(2)
      .graveyard('Serra Angel')
      .build();

  test('as a creature it counts the creature cards of every graveyard (three seats)', () => {
    const g = build();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.expect.zone(NAME, 'battlefield', { seat: 0 });
    // Three creature cards in graveyards (the Bolt is not one): 0/0 + 3.
    g.expect.pt(NAME, 3, 3);
    g.expect.invariants();
  });

  test('bestowed, both it and the host get the bonus (CR 702.103)', () => {
    const g = build();
    g.act(0).cast(NAME, { alternative: 'bestow', targets: [BEARS], pay: true });
    g.passAll();
    g.expect.attached(NAME, BEARS);
    g.expect.pt(BEARS, 5, 5);
    g.expect.invariants();
  });
});

describe('the grammar', () => {
  test.each([
    [
      'no period',
      '~ and enchanted creature each get +X/+X, where X is the number of creature cards in all graveyards',
    ],
    [
      'a fixed step',
      '~ and enchanted creature each get +1/+1, where X is the number of creature cards in all graveyards.',
    ],
    [
      'gets',
      '~ and enchanted creature each gets +X/+X, where X is the number of creature cards in all graveyards.',
    ],
  ])('%s is not read', (_what, text) => {
    expect(dropped(text, 'creature')).toBeDefined();
  });
});
