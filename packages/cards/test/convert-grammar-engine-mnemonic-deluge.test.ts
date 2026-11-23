// Mnemonic Deluge (issue 576): the REAL Oracle text of the golden corpus goes through the grammar as a card with no override, reads as supported, and is played through the engine.
// Pins: CR 707.12 (a copy of a card, cast), CR 707.2 (copiable values), CR 608.2g (cast during resolution, no priority), CR 118.9 (without paying the mana cost), CR 704.5e (a copy
// that is not cast ceases to exist), CR 608.2n (the spell is exiled as the last instruction says). Rule text unchecked against docs/rules/comprehensive-rules.txt (absent in this session).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const real = (name: string): CardDefinition => {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
};
const deluge = real('Mnemonic Deluge');
const FILLER = Array.from({ length: 20 }, () => 'Island');

function game(graveyards: readonly [readonly string[], readonly string[]]) {
  const b = scenario()
    .define(deluge)
    .seat(0)
    .library(...FILLER)
    .hand(deluge.name)
    .pool('UUUUUUUUU');
  for (const card of graveyards[0]) b.graveyard(card);
  const c = b.seat(1).library(...FILLER);
  for (const card of graveyards[1]) c.graveyard(card);
  return c.at('precombatMain', { active: 0 }).build();
}

const copies = (g: ReturnType<typeof game>) =>
  Object.values(g.state.objects).filter((o) => o.cardCopy === true);

test('the card is valid', () => expect(validateCard(deluge)).toEqual([]));

test('exile a card from an opponent’s graveyard, copy it three times, cast all three free; Deluge is exiled', () => {
  const g = game([[], ['Divination']]);
  g.act(0).cast(deluge.name, {
    pay: true,
    targets: [{ name: 'Divination', zone: 'graveyard', seat: 1 }],
  });
  g.passAll();
  g.expect.zone('Divination', 'exile', { seat: 1 });
  // Three copies are offered one after the other; each is cast and resolves (draw two).
  let casts = 0;
  for (let guard = 0; guard < 8 && g.state.pending?.kind === 'chooseCards'; guard += 1) {
    const d = g.state.pending;
    expect(d).toMatchObject({ seat: 0, purpose: 'cast', zone: 'exile' });
    g.act(0).chooseCards(d.legal[0] as string);
    g.passAll();
    casts += 1;
  }
  expect(casts).toBe(3);
  expect(g.state.seats[0]?.hand).toHaveLength(6);
  expect(copies(g)).toHaveLength(0);
  g.expect.zone(deluge.name, 'exile', { seat: 0 });
  g.expect.invariants();
});

test('the copies may be left uncast: they cease to exist', () => {
  const g = game([['Divination'], []]);
  g.act(0).cast(deluge.name, {
    pay: true,
    targets: [{ name: 'Divination', zone: 'graveyard', seat: 0 }],
  });
  g.passAll();
  g.act(0).chooseCards();
  expect(g.state.seats[0]?.hand).toHaveLength(0);
  expect(copies(g)).toHaveLength(0);
  g.expect.zone(deluge.name, 'exile', { seat: 0 });
  g.expect.invariants();
});
