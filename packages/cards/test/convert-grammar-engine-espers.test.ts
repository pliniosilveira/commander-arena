// Espers to Magicite (deck-support issue 97): the REAL Oracle text of the acceptance card of the golden corpus (taken from the issue) goes through the grammar as a card with no override,
// is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Pins: CR 603.12 (a reflexive ability: its
// target is chosen as it goes on the stack, among the cards this resolution exiled), CR 707.9b (the copy is an artifact and no creature, and has the enters abilities of the card),
// CR 101.4 (each opponent: with three seats both graveyards), CR 603.3d (no legal target: nothing).
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

const FILLER = Array.from({ length: 12 }, () => 'Plains');
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const BOLT = 'Lightning Bolt';

describe("Espers to Magicite: \"Exile each opponent's graveyard. When you do, choose up to one target creature card exiled this way. Create a token that's a copy of that card, except it's an artifact and it loses all other card types.\"", () => {
  const espers = real('Espers to Magicite');
  const ESPERS = espers.name;

  const start = (graveyards: readonly (readonly string[])[], mine: readonly string[] = []) => {
    const b = scenario({ seats: graveyards.length + 1 })
      .define(espers)
      .seat(0)
      .hand(ESPERS)
      .battlefield('Swamp', { count: 4 })
      .graveyard(...mine)
      .library(...FILLER);
    graveyards.forEach((graveyard, i) => {
      b.seat((i + 1) as 1 | 2 | 3)
        .graveyard(...graveyard)
        .library(...FILLER);
    });
    return b.at('precombatMain', { active: 0, turn: 3 }).build();
  };

  const tokens = (g: ReturnType<typeof start>) =>
    Object.values(g.state.objects).filter((o) => o.zone === 'battlefield' && o.token !== null);

  test('the card is valid', () => {
    expect(validateCard(espers)).toEqual([]);
  });

  test('every opponent graveyard is exiled, and the chosen creature card is copied as an artifact', () => {
    const g = start([[BEARS, BOLT]]);
    g.act(0).cast(ESPERS, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.zone(BOLT, 'exile', { seat: 1 });
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    expect(tokens(g)).toHaveLength(1);
    expect(tokens(g)[0]?.token?.characteristics.name).toBe(BEARS);
    expect(tokens(g)[0]?.token?.characteristics.types).toEqual(['artifact']);
    g.expect.zone(ESPERS, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('with three seats both opponent graveyards are exiled, your own is not, and one card is copied', () => {
    const g = start([[BEARS], [ELVES]], [BOLT]);
    g.act(0).cast(ESPERS, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.zone(ELVES, 'exile', { seat: 2 });
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.act(0).chooseTargets(ELVES);
    g.passAll();
    expect(tokens(g)).toHaveLength(1);
    expect(tokens(g)[0]?.token?.characteristics.name).toBe(ELVES);
    g.expect.invariants();
  });

  test('up to one: the target may be left out', () => {
    const g = start([[BEARS]]);
    g.act(0).cast(ESPERS, { pay: true });
    g.passAll();
    g.act(0).chooseTargets();
    g.passAll();
    expect(tokens(g)).toHaveLength(0);
    g.expect.zone(BEARS, 'exile', { seat: 1 });
  });

  test('a graveyard of no creature card leaves nothing to copy', () => {
    const g = start([[BOLT]]);
    g.act(0).cast(ESPERS, { pay: true });
    g.passAll();
    g.expect.zone(BOLT, 'exile', { seat: 1 });
    g.passAll();
    expect(tokens(g)).toHaveLength(0);
    g.expect.stack([]);
  });

  test('empty graveyards: the ability that follows is never created', () => {
    const g = start([[]]);
    g.act(0).cast(ESPERS, { pay: true });
    g.passAll();
    g.expect.stack([]);
    expect(tokens(g)).toHaveLength(0);
  });
});
