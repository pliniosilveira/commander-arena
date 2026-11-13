// The Hashaton deck (issue 31), group 10 (D-1190 to D-1193, provisional): the REAL Oracle text of Restless Dreams (the corpus's golden.jsonl, taken from the issue) goes through
// the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine
// runs. The helper cards are real fixtures. Pins: CR 107.3a and 601.2b (X is announced before the targets), CR 601.2c (targets are chosen before the cost is paid, so a card discarded
// is no target), CR 601.2h and 701.9 (the discard is paid with the other costs), CR 118.3 (X is at most the cards in hand), CR 608.2b (a target that is gone is skipped).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

/** A card of the golden corpus with its text replaced, imported through the grammar. */
function withText(name: string, text: string) {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const [face] = card.faces;
  if (face === undefined) throw new Error(`${name} has no face`);
  return importCard(
    fromGoldenCard({ ...card, faces: [{ ...face, oracleText: text }] }),
    undefined,
    NO_OVERRIDES,
  );
}

const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const ELVES = 'Llanowar Elves';

describe('Restless Dreams: "As an additional cost to cast this spell, discard X cards. Return X target creature cards from your graveyard to your hand."', () => {
  const dreams = real('Restless Dreams');
  const DREAMS = dreams.name;

  const start = (hand: readonly string[], graveyard: readonly string[], swamps = 1) =>
    scenario()
      .define(dreams)
      .seat(0)
      .hand(DREAMS, ...hand)
      .battlefield('Swamp', { count: swamps })
      .graveyard(...graveyard)
      .seat(1)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid and its AST is the engine shape', () => {
    expect(validateCard(dreams)).toEqual([]);
    const face = dreams.faces[0];
    expect(face?.additionalCosts).toEqual([{ kind: 'discardX' }]);
    expect(face?.spell?.x).toBe(true);
    expect(face?.spell?.targets).toEqual([
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: { zone: 'graveyard', types: ['creature'], controller: 'you' },
        },
        countX: true,
      },
    ]);
  });

  test('X cards are discarded and X creature cards return to the hand', () => {
    const g = start(['Forest', 'Island', 'Plains'], [BEARS, SPIDER, ELVES]);
    g.act(0).cast(DREAMS);
    g.expect.pending('chooseX', 0);
    g.act(0).chooseX(2);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets(BEARS, ELVES);
    g.act(0).payAuto();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Forest', 'Island');
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.zone(ELVES, 'hand', { seat: 0 });
    g.expect.zone(SPIDER, 'graveyard', { seat: 0 });
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.expect.zone('Plains', 'hand', { seat: 0 });
    g.expect.zone(DREAMS, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('X is at most the cards in hand and the creature cards in the graveyard', () => {
    const byGraveyard = start(['Forest', 'Island', 'Plains'], [BEARS, 'Lightning Bolt']);
    byGraveyard.act(0).cast(DREAMS);
    expect(byGraveyard.state.pending).toMatchObject({ kind: 'chooseX', min: 0, max: 1 });
    const byHand = start(['Forest'], [BEARS, SPIDER, ELVES]);
    byHand.act(0).cast(DREAMS);
    expect(byHand.state.pending).toMatchObject({ kind: 'chooseX', min: 0, max: 1 });
  });

  test('X = 0 does nothing, and no creature card in the graveyard is asked nothing', () => {
    const g = start(['Forest'], [BEARS]);
    g.act(0).cast(DREAMS);
    g.act(0).chooseX(0);
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone('Forest', 'hand', { seat: 0 });
    g.expect.zone(DREAMS, 'graveyard', { seat: 0 });
    const empty = start(['Forest'], []);
    empty.act(0).cast(DREAMS);
    empty.expect.pending('payMana', 0);
  });

  test('a card discarded for the cost is not a target, and a target gone from the graveyard is skipped', () => {
    const g = start(['Forest', 'Island'], [BEARS, SPIDER], 2);
    g.act(0).cast(DREAMS);
    g.act(0).chooseX(2);
    g.act(0).chooseTargets(BEARS, SPIDER);
    g.act(0).payAuto();
    g.expect.stack([DREAMS]);
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.zone(SPIDER, 'hand', { seat: 0 });
  });
});

describe('texts that are not Restless Dreams are dropped, never half run (SYNTHETIC)', () => {
  test.each([
    // "X target" with no X announced: a fixed discard has no X for the targets to read
    'As an additional cost to cast this spell, discard a card.\nReturn X target creature cards from your graveyard to your hand.',
    // an X read by the effect with no cost that announces it
    'Return X target creature cards from your graveyard to your hand.',
    // "up to X"
    'As an additional cost to cast this spell, discard X cards.\nReturn up to X target creature cards from your graveyard to your hand.',
    // another graveyard
    'As an additional cost to cast this spell, discard X cards.\nReturn X target creature cards from a graveyard to your hand.',
  ])('%s', (text) => {
    const imported = withText('Restless Dreams', text);
    expect(imported.support.status).not.toBe('supported');
  });
});
