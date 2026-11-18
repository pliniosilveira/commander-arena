// Coiling Oracle (issue 310): "When this creature enters, reveal the top card of your library. If it's a land card, put it onto
// the battlefield. Otherwise, put that card into your hand." The real card comes from the golden corpus through the Oracle text
// parser, then runs in the engine.
// Pins: CR 701.20a (reveal), CR 608.2c (the second and third sentences are read as the effect resolves), CR 110.2a (a card put onto
// the battlefield by its controller enters under their control), CR 401.5 (the top card of the library).
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((candidate) => candidate.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const ORACLE = real('Coiling Oracle');
const NAME = ORACLE.name;
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';

const game = (...library: string[]) =>
  scenario()
    .define(ORACLE)
    .seat(0)
    .hand(NAME)
    .battlefield('Forest')
    .battlefield('Island')
    .library(...library)
    .seat(1)
    .library(BOLT)
    .build();

/** Cast the creature and let it and its enters trigger resolve. */
function castAndResolve(g: ReturnType<typeof game>) {
  g.act(0).cast(NAME, { pay: true });
  g.passAll();
}

describe('Coiling Oracle', () => {
  test('a land card on top goes onto the battlefield', () => {
    const g = game('Mountain', BOLT);
    castAndResolve(g);
    g.expect.zone(NAME, 'battlefield', { seat: 0 });
    g.expect.zone('Mountain', 'battlefield', { seat: 0 });
    g.expect.librarySize(0, 1);
    g.expect.handSize(0, 0);
    g.expect.invariants();
  });

  test('a card that is not a land goes into the hand', () => {
    const g = game(BEARS, BOLT);
    castAndResolve(g);
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.librarySize(0, 1);
    g.expect.noObject(BEARS, { zone: 'battlefield' });
    g.expect.invariants();
  });

  test('an empty library: nothing is revealed and nothing moves', () => {
    const g = game();
    castAndResolve(g);
    g.expect.zone(NAME, 'battlefield', { seat: 0 });
    g.expect.handSize(0, 0);
    g.expect.invariants();
  });
});
