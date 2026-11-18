// Diluvian Primordial (First Flight starter Commander decks): the REAL Oracle text (the corpus's golden.jsonl) goes through the grammar as a card with no override, is defined in
// an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Its ability is the one of its SYNTHETIC sibling
// (`synthetic-primordial.ts`). Pins: CR 115.1 and 601.2c (up to one target for each opponent, in that opponent's graveyard), CR 608.2g and 118.9 (cast free as the ability
// resolves), CR 614.1a (exiled instead of going to a graveyard), CR 702.9a (flying).
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView, syntheticCard, validateCard } from '@commander-arena/engine';
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

const primordial = real('Diluvian Primordial');
const BOLT = 'Lightning Bolt';
const DIVINATION = 'Divination';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Island');

describe('Diluvian Primordial', () => {
  test('valid, flying, with the trigger of its SYNTHETIC sibling', () => {
    expect(validateCard(primordial)).toEqual([]);
    const sibling = syntheticCard('SYNTHETIC Tidal Caster').faces[0]?.abilities[0];
    expect(primordial.faces[0]?.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'flying' } },
      sibling,
    ]);
  });

  /** Seat 0 has the Primordial in hand and seven Islands; seat 1 has the given cards in its graveyard. */
  const board = (theirs: readonly string[], mine: readonly string[] = []) =>
    scenario()
      .define(primordial)
      .seat(0)
      .library(...LIBRARY)
      .hand(primordial.name)
      .battlefield('Island', { count: 7 })
      .graveyard(...mine)
      .seat(1)
      .library(...LIBRARY)
      .graveyard(...theirs)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the creature is a 5/5 flyer for {5}{U}{U}', () => {
    const g = board([]);
    g.act(0).cast(primordial.name, { pay: true });
    g.passAll();
    g.expect.zone(primordial.name, 'battlefield', { seat: 0 });
    const view = getView(g.state, 0).battlefield.find((o) => o.name === primordial.name);
    expect(view?.power).toBe(5);
    expect(view?.toughness).toBe(5);
    expect(view?.keywords).toContain('flying');
  });

  test('entering casts a sorcery of the opponent’s graveyard for free, and it is exiled instead of going to the graveyard', () => {
    const g = board([DIVINATION, BEARS]);
    g.act(0).cast(primordial.name, { pay: true });
    g.passAll(); // the creature resolves; the trigger asks for its target
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets(DIVINATION);
    g.passAll(); // the trigger resolves: "cast it?"
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.stack([DIVINATION]);
    const before = getView(g.state, 0).seats[0]?.handCount ?? 0;
    g.passAll();
    expect(getView(g.state, 0).seats[0]?.handCount).toBe(before + 2);
    g.expect.zone(DIVINATION, 'exile', { seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('an instant with a target of its own is aimed as it is cast, and still costs nothing', () => {
    const g = board([BOLT]);
    g.act(0).cast(primordial.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(BOLT);
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseTargets({ player: 1 });
    g.expect.stack([BOLT]);
    g.passAll();
    g.expect.life(1, 37);
    g.expect.zone(BOLT, 'exile', { seat: 1 });
  });

  test('with nothing legal to choose (my own instant, a creature card of the opponent) nothing is cast', () => {
    const g = board([BEARS], [BOLT]);
    g.act(0).cast(primordial.name, { pay: true });
    g.pass();
    g.pass();
    // Nothing legal: the opponent has only a creature card and the instant is mine; the ability goes on the stack with no target.
    g.expect.stack([`${primordial.name} (ability)`]);
    g.passAll();
    g.expect.stack([]);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('declining the question leaves the card where it is', () => {
    const g = board([DIVINATION]);
    g.act(0).cast(primordial.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(DIVINATION);
    g.passAll();
    g.act(0).decline();
    g.expect.zone(DIVINATION, 'graveyard', { seat: 1 });
    g.expect.stack([]);
  });
});
