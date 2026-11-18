// Gate to the Afterlife (issue 104): the REAL Oracle text (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an engine
// scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Its activated ability is the one of its SYNTHETIC sibling
// (`synthetic-search-zones.ts`, which names another card). Pins: CR 701.23a-c (search a zone, find nothing, a stated quality), 602.5b (an activation restriction), 603.2 (the trigger
// "Whenever a nontoken creature you control dies"), 608.2c and 608.2d (the "then you may draw, if you do, discard"), 701.24a (shuffle).
import { readFileSync } from 'node:fs';
import {
  type CardDefinition,
  getLegalActions,
  syntheticCard,
  validateCard,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string, supported = true): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  if (supported) {
    expect(imported.support.unparsed, name).toEqual([]);
    expect(imported.support.status, name).toBe('supported');
  }
  return imported.definition;
}

const GATE = 'Gate to the Afterlife';
const GIFT = "God-Pharaoh's Gift"; // the card the Gate finds: its definition is imported only so the scenario can hold it
const ELVES = 'Llanowar Elves';
const BEARS = 'Grizzly Bears';
const gate = real(GATE);
const gift = real(GIFT, false);

describe('Gate to the Afterlife', () => {
  test('valid, and its search is the one of its SYNTHETIC sibling with another name', () => {
    expect(validateCard(gate)).toEqual([]);
    const sibling = syntheticCard('SYNTHETIC Zone Seeker').faces[0]?.abilities[0];
    const ability = gate.faces[0]?.abilities[1];
    expect(ability).toEqual(
      JSON.parse(JSON.stringify(sibling).replace('Grizzly Bears', "God-Pharaoh's Gift")),
    );
  });

  const board = (graveyardCreatures: number, where: 'graveyard' | 'hand' | 'library') => {
    const b = scenario()
      .define(gate)
      .define(gift)
      .seat(0)
      .library('Swamp', 'Swamp', ...(where === 'library' ? [GIFT] : []))
      .battlefield('Swamp', 'Swamp', GATE)
      .graveyard(...Array.from({ length: graveyardCreatures }, () => ELVES));
    if (where === 'graveyard') b.graveyard(GIFT);
    if (where === 'hand') b.hand(GIFT);
    return b.seat(1).library('Swamp', 'Swamp').at('precombatMain', { active: 0 }).build();
  };

  test("with six creature cards in the graveyard it finds God-Pharaoh's Gift in the library and shuffles", () => {
    const g = board(6, 'library');
    g.act(0).activate(GATE, { ability: 1, pay: true });
    g.passAll();
    g.act(0).chooseCards(g.id(GIFT));
    g.expect.zone(GIFT, 'battlefield', { seat: 0 });
    g.expect.zone(GATE, 'graveyard', { seat: 0 });
    g.expect.eventLog(
      [
        { kind: 'librarySearched', seat: 0, found: 1 },
        { kind: 'libraryShuffled', seat: 0 },
      ],
      { since: 0 },
    );
    g.expect.invariants();
  });

  test('from the graveyard or the hand the library is not searched', () => {
    for (const where of ['graveyard', 'hand'] as const) {
      const g = board(6, where);
      g.act(0).activate(GATE, { ability: 1, pay: true });
      g.passAll();
      g.act(0).chooseCards(g.id(GIFT));
      g.expect.zone(GIFT, 'battlefield', { seat: 0 });
      g.expect.noEvent({ kind: 'libraryShuffled' }, { since: 0 });
    }
  });

  test('with five creature cards in the graveyard the ability cannot be activated', () => {
    const g = board(5, 'hand');
    const abilities = getLegalActions(g.state, 0).filter((a) => a.kind === 'activate');
    expect(abilities).toEqual([]);
  });

  test('a nontoken creature that dies: gain 1 life, then you may draw a card, and if you do discard a card', () => {
    const g = scenario()
      .define(gate)
      .seat(0)
      .library('Swamp', 'Island', 'Forest')
      .hand('Plains')
      .battlefield(GATE, BEARS)
      .seat(1)
      .library('Swamp', 'Swamp')
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast('Lightning Bolt', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.life(0, 41);
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.pending('chooseCards', 0);
    g.expect.invariants();
  });
});
