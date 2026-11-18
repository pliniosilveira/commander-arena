// The Lorehold Spirit deck (issue 86), group 3 (D-620 and later, provisional): the REAL Oracle text of Naktamun Lorespinner // Wheel of Fortune (the corpus's golden.jsonl, taken from the issue)
// goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine
// runs. Its faces are also the ones of its SYNTHETIC sibling of the engine fixtures (`synthetic-lorehold-g3.ts`), which the engine tests and the AI soak play.
// Pins: CR 603.4 (the intervening "if", at trigger and at resolution), 722.3a and 722.3c (the designation and the copy of the prepare spell), 601.2i (casting it unprepares the permanent),
// 701.9a (discard a hand), 121.1 (draw), 704.5b (a draw from an empty library loses).
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView, syntheticCard, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
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

const NAKTAMUN = real('Naktamun Lorespinner // Wheel of Fortune');
const CARD = NAKTAMUN.name;
const FRONT = 'Naktamun Lorespinner';
const WHEEL = 'Wheel of Fortune';
const BOLT = 'Lightning Bolt';
const FILLER = (n: number) => Array.from({ length: n }, () => 'Plains');
const HAND = (n: number) => Array.from({ length: n }, () => 'Forest');

const copyOf = (g: ScenarioGame) =>
  Object.values(g.state.objects).find((o) => o.prepareOf !== undefined);
const creature = (g: ScenarioGame) => getView(g.state, 0).battlefield.find((o) => o.name === FRONT);
const handOf = (g: ScenarioGame, seat: number) => g.state.seats[seat]?.hand.length ?? -1;

/** Seat 0 controls the creature and four Mountains; the game is advanced from seat 1's main phase to seat 0's upkeep. */
function toUpkeep(mine: string[], theirs: string[], library1 = 12) {
  const g = scenario()
    .define(NAKTAMUN)
    .seat(0)
    .hand(...mine)
    .library(...FILLER(12))
    .battlefield(CARD, 'Mountain', 'Mountain', 'Mountain', 'Mountain')
    .seat(1)
    .hand(...theirs)
    .library(...FILLER(library1))
    .at('precombatMain', { active: 1, turn: 2 })
    .build();
  g.advanceTo('upkeep', { turn: 'next' });
  return g;
}

describe('the real card is valid and has the faces of its SYNTHETIC sibling', () => {
  test('Naktamun Lorespinner // Wheel of Fortune', () => {
    expect(validateCard(NAKTAMUN)).toEqual([]);
    expect(NAKTAMUN.layout).toBe('prepare');
    const sibling = syntheticCard('SYNTHETIC Lore Jackal // Spin of Fate');
    expect(NAKTAMUN.faces[0]?.abilities).toEqual(sibling.faces[0]?.abilities);
    expect(NAKTAMUN.faces[1]?.spell).toEqual(sibling.faces[1]?.spell);
    expect(NAKTAMUN.faces[0]).toMatchObject({ power: 3, toughness: 3 });
  });
});

describe('Naktamun Lorespinner', () => {
  test('no player has one or fewer cards in hand: nothing triggers', () => {
    const g = toUpkeep(HAND(3), HAND(4));
    expect(g.state.stack).toHaveLength(0);
    g.passAll();
    expect(creature(g)?.prepared).toBeUndefined();
  });

  test('an opponent with one card in hand: the creature becomes prepared at your upkeep', () => {
    const g = toUpkeep(HAND(4), HAND(1));
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    expect(creature(g)?.prepared).toBe(true);
    const copy = copyOf(g);
    expect(getView(g.state, 0).exile.find((o) => o.id === copy?.id)).toMatchObject({
      name: WHEEL,
      preparedSpell: true,
    });
  });

  test('you with one card in hand: the same', () => {
    const g = toUpkeep(HAND(1), HAND(4));
    g.passAll();
    expect(creature(g)?.prepared).toBe(true);
  });

  test('the hand is refilled in response: it is read again on resolution and the creature stays unprepared (CR 603.4)', () => {
    // The trigger waits with one card in each hand; an instant draws three cards for seat 0, and the opponent already has more than one.
    const g = scenario()
      .define(NAKTAMUN)
      .define(syntheticCard('SYNTHETIC Rush of Cards'))
      .seat(0)
      .hand('SYNTHETIC Rush of Cards')
      .library(...FILLER(12))
      .battlefield(CARD, 'Mountain')
      .seat(1)
      .hand(...HAND(5))
      .library(...FILLER(12))
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.stack).toHaveLength(1);
    g.act(0).cast('SYNTHETIC Rush of Cards', { pay: true });
    g.passAll();
    expect(creature(g)?.prepared).toBeUndefined();
    expect(copyOf(g)).toBeUndefined();
  });

  test('the creature dies with the trigger on the stack: nothing is prepared', () => {
    const g = toUpkeep([BOLT], HAND(5));
    g.act(0).cast(BOLT, { targets: [CARD], pay: true });
    g.passAll();
    expect(creature(g)).toBeUndefined();
    expect(copyOf(g)).toBeUndefined();
    g.expect.invariants();
  });
});

describe('Wheel of Fortune, cast as the prepare spell', () => {
  /** The creature has become prepared at the upkeep; it is seat 0's precombat main phase and seat 0 has drawn for the turn. */
  function ready(mine: string[], theirs: string[], library1 = 12) {
    const g = toUpkeep(mine, theirs, library1);
    g.passAll();
    expect(creature(g)?.prepared).toBe(true);
    g.advanceTo('precombatMain');
    return g;
  }

  test('each player discards their hand and draws seven cards; the creature is unprepared and the copy is gone', () => {
    const g = ready(['Forest'], HAND(4));
    expect(handOf(g, 0)).toBe(2);
    g.act(0).cast(copyOf(g)?.id as string, { pay: true });
    expect(creature(g)?.prepared).toBeUndefined();
    expect(getView(g.state, 0).stack[0]?.name).toBe(WHEEL);
    g.passAll();
    expect(handOf(g, 0)).toBe(7);
    expect(handOf(g, 1)).toBe(7);
    expect(g.state.seats[0]?.graveyard).toHaveLength(2);
    expect(g.state.seats[1]?.graveyard).toHaveLength(4);
    expect(copyOf(g)).toBeUndefined();
    expect(getView(g.state, 0).exile).toHaveLength(0);
    g.expect.invariants();
  });

  test('a player with an empty hand still draws seven', () => {
    const g = ready([], []);
    g.act(0).cast(copyOf(g)?.id as string, { pay: true });
    g.passAll();
    expect(handOf(g, 0)).toBe(7);
    expect(handOf(g, 1)).toBe(7);
  });

  test('a player whose library holds fewer than seven cards loses (CR 704.5b)', () => {
    const g = ready(['Forest'], HAND(2), 3);
    g.act(0).cast(copyOf(g)?.id as string, { pay: true });
    g.passAll();
    expect(g.state.seats[1]?.hasLost).toBe(true);
    expect(g.state.seats[0]?.hasLost).toBe(false);
  });
});
