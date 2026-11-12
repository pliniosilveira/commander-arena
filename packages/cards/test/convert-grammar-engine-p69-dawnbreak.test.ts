// Dawnbreak Reclaimer (the Bruna deck, issue 5): the REAL card of the owner's golden corpus, read through the grammar only and played through applyAction. CR 608.2c, 608.2d
// (who chooses, and an impossible choice is not made), CR 110.2a and 400.3 (the cards return under their owners' control), CR 603.2 (it triggers on your end step only).
// The creature cards in the graveyards are SYNTHETIC (named so), with invented power and toughness.
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

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

const RECLAIMER = real('Dawnbreak Reclaimer');
const creature = (name: string, cost: string, power: string) =>
  parsed(`SYNTHETIC ${name}`, 'Creature — Bear', '', {
    manaCost: cost,
    power,
    toughness: '2',
  });
const SMALL = creature('Small Bear', '{1}{G}', '1');
const LARGE = creature('Large Bear', '{4}{G}', '5');
const MIDDLE = creature('Middle Bear', '{2}{G}', '3');
const RING = parsed('SYNTHETIC Ring', 'Artifact', '', { manaCost: '{1}' });
const FILLER = Array.from({ length: 30 }, () => 'Island');

const game = (mine: readonly CardDefinition[], theirs: readonly CardDefinition[], active = 0) => {
  let b = scenario().define(RECLAIMER);
  for (const c of [...mine, ...theirs]) b = b.define(c);
  return b
    .seat(0)
    .battlefield(RECLAIMER.name)
    .graveyard(...mine.map((c) => c.name))
    .library(...FILLER)
    .seat(1)
    .graveyard(...theirs.map((c) => c.name))
    .library(...FILLER)
    .at('precombatMain', { active, turn: active === 0 ? 1 : 2 })
    .build();
};

describe('Dawnbreak Reclaimer', () => {
  test('reads as flying and the trigger, supported', () => {
    expect(RECLAIMER.faces[0]?.abilities.map((a) => a.kind)).toEqual(['keyword', 'triggered']);
  });

  test('at your end step: you choose theirs, the owner chooses yours, you may return both', () => {
    const g = game([SMALL, MIDDLE], [LARGE, SMALL]);
    g.advanceTo('end');
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards({ name: LARGE.name, seat: 1 });
    g.expect.pending('chooseCards', 1);
    g.act(1).chooseCards({ name: SMALL.name, seat: 0 });
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone(LARGE.name, 'battlefield', { seat: 1 });
    g.expect.zone(SMALL.name, 'battlefield', { seat: 0 });
    g.expect.zone(MIDDLE.name, 'graveyard', { seat: 0 });
    g.expect.zone(SMALL.name, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('declining leaves everything in the graveyards', () => {
    const g = game([SMALL, MIDDLE], [LARGE, SMALL]);
    g.advanceTo('end');
    g.passAll();
    g.act(0).chooseCards({ name: LARGE.name, seat: 1 });
    g.act(1).chooseCards({ name: MIDDLE.name, seat: 0 });
    g.act(0).decline();
    g.expect.zone(LARGE.name, 'graveyard', { seat: 1 });
    g.expect.zone(MIDDLE.name, 'graveyard', { seat: 0 });
  });

  test('only creature cards are offered: an artifact card in either graveyard is never chosen or returned', () => {
    const g = game([SMALL, RING], [LARGE, RING]);
    g.advanceTo('end');
    g.passAll();
    // One creature card on each side: both choices are automatic, only the "may" is asked.
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone(LARGE.name, 'battlefield', { seat: 1 });
    g.expect.zone(SMALL.name, 'battlefield', { seat: 0 });
    g.expect.zone(RING.name, 'graveyard', { seat: 0 });
    g.expect.zone(RING.name, 'graveyard', { seat: 1 });
  });

  test('no creature card in an opponent graveyard: nothing is chosen, nothing returns', () => {
    const g = game([SMALL, MIDDLE], [RING]);
    g.advanceTo('end');
    g.passAll();
    g.expect.stack([]);
    g.expect.zone(SMALL.name, 'graveyard', { seat: 0 });
    g.expect.zone(MIDDLE.name, 'graveyard', { seat: 0 });
  });

  test('it does nothing at the end step of the opponent', () => {
    const g = game([SMALL], [LARGE], 1);
    g.advanceTo('end');
    g.expect.stack([]);
    g.expect.zone(LARGE.name, 'graveyard', { seat: 1 });
    g.expect.zone(SMALL.name, 'graveyard', { seat: 0 });
  });
});
