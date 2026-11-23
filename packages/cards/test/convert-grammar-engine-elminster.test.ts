// Elminster (issue 576, SPEC 8.3): the REAL Oracle text of the golden corpus goes through the grammar as a card with no override, reads as supported and is played through the engine.
// "Whenever you scry, the next instant or sorcery spell you cast this turn costs {X} less to cast, where X is the number of cards looked at while scrying this way." Pins: CR 701.22
// (scry: the cards looked at are those put back on top and on the bottom, so a library with fewer cards than the scry has looked at fewer), CR 603.2 (triggers), CR 601.2f and 118.7a
// (the cost of a spell, reduced in generic mana only), CR 611.2a (an effect until end of turn). Unchecked against the CR text file (absent in this session).
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';
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

const SIGHT = 'SYNTHETIC Clear Sight'; // instant, {U}: scry 2
const elminster = real('Elminster');

const board = (library: readonly string[], pool: string) =>
  scenario()
    .define(elminster)
    .define(syntheticCard(SIGHT))
    .seat(0)
    .library(...library)
    .battlefield(elminster.name)
    .hand(SIGHT, 'Divination')
    .pool(pool)
    .seat(1)
    .library('Island', 'Island', 'Island')
    .at('precombatMain', { active: 0 })
    .build();

test('the card is valid', () => {
  expect(validateCard(elminster)).toEqual([]);
});

test('scry 2: the next instant or sorcery costs {2} less', () => {
  const g = board(['Island', 'Island', 'Island', 'Island'], 'UUU');
  g.act(0).cast(SIGHT, { pay: true });
  g.passAll();
  g.act(0).arrange({ top: ['Island[0]', 'Island[1]'] });
  g.passAll(); // the trigger resolves
  // Divination costs {2}{U}; with {2} less only {U} is paid.
  g.act(0).cast('Divination', { pay: true });
  g.expect.pool(0, { U: 1 });
});

test('a library of one card: the scry looked at one card, so only {1} less', () => {
  const g = board(['Island'], 'UUU');
  g.act(0).cast(SIGHT, { pay: true });
  g.passAll();
  g.act(0).arrange({ top: ['Island'] });
  g.passAll();
  g.act(0).cast('Divination', { pay: true });
  g.expect.pool(0, {});
});
