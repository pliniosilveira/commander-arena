// Flint deck (issue 685), group 12: Orcish Spy, read from its REAL Oracle text (fixtures/corpus/golden.jsonl) with no override and played through applyAction on three seats.
// "{T}: Look at the top three cards of target player's library." (CR 401.2, 701.20e, 115.1): the controller is shown the three cards and nothing may be taken; they stay on top in the order
// they were in. Any player may be the target, the controller's own library included.
import { readFileSync } from 'node:fs';
import { type CardDefinition, getLegalActions, validateCard } from '@commander-arena/engine';
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

const SPY = real('Orcish Spy');
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains'] as const;

describe('Orcish Spy (CR 401.2, 701.20e)', () => {
  test('is valid', () => {
    expect(validateCard(SPY)).toEqual([]);
  });

  const table = () =>
    scenario({ seats: 3 })
      .define(SPY)
      .seat(0)
      .library(...FILLER)
      .battlefield(SPY.name)
      .seat(1)
      .library('Llanowar Elves', 'Forest', 'Island', ...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the controller is shown the top three cards of the target player’s library, takes nothing, and they stay on top in order', () => {
    const g = table();
    g.act(0)
      .activate(SPY.name)
      .targets([{ player: 1 }]);
    g.passAll();
    const pending = g.state.pending;
    expect(pending?.kind).toBe('chooseCards');
    if (pending?.kind !== 'chooseCards') return;
    expect(pending.seat).toBe(0);
    expect(pending.looked).toHaveLength(3);
    expect(pending.max).toBe(0);
    // The one way out is to take nothing: the legal actions offer it, so an agent is never stuck.
    expect(getLegalActions(g.state, 0).length).toBeGreaterThan(0);
    g.act(0).chooseCards();
    const library = (g.state.seats[1]?.library ?? []).map((id) => g.state.objects[id]?.card);
    expect(library).toHaveLength(7);
    g.expect.tapped(SPY.name, true);
    // The three cards are still the top three, in the same order.
    expect(g.state.seats[1]?.library.slice(0, 3)).toEqual(pending.looked);
  });

  test('another player’s library is left alone', () => {
    const g = table();
    g.act(0)
      .activate(SPY.name)
      .targets([{ player: 1 }]);
    g.passAll();
    g.act(0).chooseCards();
    expect(g.state.seats[2]?.library).toHaveLength(4);
  });
});
