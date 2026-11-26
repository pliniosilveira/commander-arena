// Most Wanted deck, group 2: Academy Manufactor, "If you would create a Clue, Food, or Treasure token, instead create one of each." (golden.jsonl, real Oracle text, issue 120), read
// by the grammar with no override and run by the engine. Pins (numbers looked up with `pnpm rule` in this session): CR 614.1a (replacement effects), CR 614.5 (a replacement
// applies once to an event), CR 616.1 (several replacement effects), CR 111.2 (the controller of a token). Rulings of 2021-06-18: two Manufactors make three times as many of each,
// and creating a Clue this way is not investigating.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

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

const FILLER = Array.from({ length: 8 }, () => 'Island');
const MANUFACTOR = real('Academy Manufactor');
const TREASURE_MAKER = parsed(
  'SYNTHETIC Treasure Maker',
  'Sorcery',
  'Create two Treasure tokens.',
  {
    manaCost: '{R}',
  },
);
const SOLDIER_MAKER = parsed(
  'SYNTHETIC Soldier Maker',
  'Sorcery',
  'Create two 1/1 white Soldier creature tokens.',
  { manaCost: '{W}' },
);
const INVESTIGATOR = parsed('SYNTHETIC Investigator', 'Sorcery', 'Investigate.', {
  manaCost: '{U}',
});

describe('Academy Manufactor: a Clue, Food or Treasure becomes one of each (CR 614.1a, 614.5)', () => {
  test('is valid and is a replacement of the tokens it names', () => {
    expect(validateCard(MANUFACTOR)).toEqual([]);
    expect(MANUFACTOR.faces[0]?.abilities[0]).toMatchObject({
      kind: 'replacement',
      replacement: { kind: 'tokensInstead', mode: 'eachOf', tokens: ['Clue', 'Food', 'Treasure'] },
    });
  });

  const tokens = (g: ScenarioGame, seat: 0 | 1 | 2) =>
    ['Clue', 'Food', 'Treasure', 'Soldier'].map(
      (name) => g.find({ name, zone: 'battlefield', seat }).length,
    );

  const start = (manufactors: number, active: 0 | 1 = 0, seats = 2) => {
    let b = scenario({ seats })
      .define(TREASURE_MAKER)
      .define(SOLDIER_MAKER)
      .define(INVESTIGATOR)
      .define(MANUFACTOR)
      .seat(0)
      .library(...FILLER)
      .hand(TREASURE_MAKER.name, SOLDIER_MAKER.name, INVESTIGATOR.name)
      .battlefield('Mountain', { count: 2 })
      .battlefield('Plains')
      .battlefield('Island');
    for (let i = 0; i < manufactors; i += 1) b = b.battlefield(MANUFACTOR.name);
    b = b
      .seat(1)
      .library(...FILLER)
      .hand(TREASURE_MAKER.name)
      .battlefield('Mountain');
    if (seats > 2) b = b.seat(2).library(...FILLER);
    return b.at('precombatMain', { active, turn: 3 }).build();
  };

  test('two Treasures are two of each of the three', () => {
    const g = start(1);
    g.act(0).cast(TREASURE_MAKER.name, { pay: true });
    g.passAll();
    expect(tokens(g, 0)).toEqual([2, 2, 2, 0]);
    g.expect.invariants();
  });

  test('without it the Treasures are made as usual', () => {
    const g = start(0);
    g.act(0).cast(TREASURE_MAKER.name, { pay: true });
    g.passAll();
    expect(tokens(g, 0)).toEqual([0, 0, 2, 0]);
  });

  test('investigating makes a Clue, a Food and a Treasure', () => {
    const g = start(1);
    g.act(0).cast(INVESTIGATOR.name, { pay: true });
    g.passAll();
    expect(tokens(g, 0)).toEqual([1, 1, 1, 0]);
  });

  test('two of them make three times as many of each (ruling 2021-06-18; CR 614.5: each applies once)', () => {
    const g = start(2);
    g.act(0).cast(TREASURE_MAKER.name, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    expect(tokens(g, 0)).toEqual([6, 6, 6, 0]);
  });

  test('a token of another kind is not replaced', () => {
    const g = start(1);
    g.act(0).cast(SOLDIER_MAKER.name, { pay: true });
    g.passAll();
    expect(tokens(g, 0)).toEqual([0, 0, 0, 2]);
  });

  test('only the tokens its controller would create: an opponent makes Treasures as usual (CR 614.1a)', () => {
    const g = start(1, 1, 3);
    g.act(1).cast(TREASURE_MAKER.name, { pay: true });
    g.passAll();
    expect(tokens(g, 1)).toEqual([0, 0, 2, 0]);
    expect(tokens(g, 0)).toEqual([0, 0, 0, 0]);
    expect(tokens(g, 2)).toEqual([0, 0, 0, 0]);
  });
});
