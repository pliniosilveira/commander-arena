// The Plunder the Graves deck, group A: the REAL Oracle text (the corpus's golden.jsonl) goes through the grammar with no override, is defined in an engine scenario and is played through
// applyAction, so the nodes the parser writes for the real text are what the engine runs. Primal Growth: "Kicker—Sacrifice a creature." (CR 702.33a, 118.8, 601.2b, 601.2f-h, 701.21a).
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
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

describe('Primal Growth', () => {
  const growth = real('Primal Growth');
  const board = (seats: 2 | 3 = 2) => {
    const b = scenario({ seats })
      .define(growth)
      .seat(0)
      .hand(growth.name)
      .battlefield('Forest', { count: 3 })
      .battlefield('Grizzly Bears')
      .library('Forest', 'Island', 'Plains', 'Forest', 'Swamp')
      .seat(1)
      .battlefield('Llanowar Elves');
    return (seats === 3 ? b.seat(2).battlefield('Llanowar Elves') : b).at('precombatMain').build();
  };

  test('is valid, with a kicker that sacrifices a creature', () => {
    expect(validateCard(growth)).toEqual([]);
    expect(growth.faces[0]?.abilities[0]).toEqual({
      kind: 'keyword',
      keyword: {
        kind: 'kicker',
        cost: [{ kind: 'sacrifice', what: { types: ['creature'] } }],
      },
    });
  });

  test('unkicked it puts one basic land onto the battlefield and sacrifices nothing', () => {
    const g = board();
    g.act(0).cast(growth.name, { kicked: false, pay: true });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.passAll();
    g.act(0).chooseCards('Island');
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('kicked it sacrifices a creature as a cost and puts up to two basic lands onto the battlefield instead', () => {
    const g = board();
    g.act(0).cast(growth.name, { kicked: true, pay: true });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.passAll();
    g.act(0).chooseCards('Island', 'Swamp');
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    g.expect.zone('Swamp', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('with three seats only its own creature can be sacrificed', () => {
    const g = board(3);
    g.act(0).cast(growth.name, { kicked: true, pay: true });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    expect(g.find({ name: 'Llanowar Elves', zone: 'battlefield' })).toHaveLength(2);
  });
});
