// Desert Bloom deck, group G6b: Spree (CR 702.172a, 700.2h: Requisition Raid) and Retrace (CR 702.81a: Embrace the Unknown). The REAL Oracle text (the corpus's golden.jsonl) goes
// through the grammar as a card with no override, is defined in an engine scenario with three seats and is played through applyAction, so the nodes the parser writes for the real text
// are what the engine runs.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
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
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const raid = real('Requisition Raid');
const embrace = real('Embrace the Unknown');
const FILLER = ['Island', 'Forest', 'Plains', 'Swamp', 'Island', 'Forest'] as const;

describe('the cards are valid and supported', () => {
  for (const def of [raid, embrace]) {
    test(def.name, () => expect(validateCard(def)).toEqual([]));
  }
  test('the real text reads as the nodes the engine runs', () => {
    expect(JSON.stringify(raid.faces)).toContain('"chooseModes"');
    expect(JSON.stringify(embrace.faces)).toContain('retrace');
  });
});

describe('Requisition Raid: Spree (CR 702.172a, 700.2h)', () => {
  const board = () =>
    scenario({ seats: 3 })
      .define(raid)
      .seat(0)
      .library(...FILLER)
      .hand(raid.name)
      .battlefield('Plains', { count: 4 })
      .battlefield('Grizzly Bears')
      .seat(1)
      .library(...FILLER)
      .battlefield('Sol Ring')
      .battlefield('Giant Spider')
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the artifact mode: {W} plus its {1}, and the artifact is destroyed', () => {
    const g = board();
    g.act(0).cast(raid.name).modes(0).targets(['Sol Ring']).pay();
    g.passAll();
    g.expect.zone('Sol Ring', 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('two modes pay both additional costs and the counter mode puts one on each creature of the target player', () => {
    const g = board();
    g.act(0)
      .cast(raid.name)
      .modes(0, 2)
      .targets(['Sol Ring', { player: 1 }])
      .pay();
    g.passAll();
    g.expect.zone('Sol Ring', 'graveyard', { seat: 1 });
    expect(g.find({ name: 'Giant Spider', zone: 'battlefield' })[0]?.counters).toMatchObject({
      '+1/+1': 1,
    });
    g.expect.invariants();
  });
});

describe('Embrace the Unknown: Retrace (CR 702.81a)', () => {
  test('cast from the graveyard by discarding a land: the top two cards are exiled and it returns to the graveyard', () => {
    const g = scenario({ seats: 3 })
      .define(embrace)
      .seat(0)
      .library('Island', 'Forest', 'Plains', 'Swamp')
      .graveyard(embrace.name)
      .hand('Mountain')
      .battlefield('Mountain', { count: 3 })
      .seat(1)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(embrace.name, { alternative: 'retrace', pay: true });
    // The only land card in hand is the discard (CR 702.81a): no choice is asked.
    g.expect.zone('Mountain', 'graveyard', { seat: 0 });
    g.passAll();
    expect(g.state.seats[0]?.library).toHaveLength(2);
    g.expect.zone(embrace.name, 'graveyard', { seat: 0 });
    g.expect.zone('Island', 'exile', { seat: 0 });
    g.expect.invariants();
  });
});
