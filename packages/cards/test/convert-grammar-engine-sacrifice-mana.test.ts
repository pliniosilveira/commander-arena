// Issue 258 (D-581 to D-585): the REAL Oracle text of Radiant Lotus (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is compared
// with the SYNTHETIC Lotus Engine of the engine fixtures the engine scenarios of `scenario-xx-sacrifice-mana.test.ts` run, and is played through applyAction, so the nodes the parser
// writes for the real text are what the engine runs. Pins: CR 602.2b and 701.21a (one or more artifacts, chosen as the cost is paid), CR 605.1a (a targeted ability is not a mana
// ability: it uses the stack), CR 608.2d (the color is chosen as the ability resolves), CR 106.4 (the mana goes to the pool of the target player), CR 602.5e (any time the player has
// priority).
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
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

const LOTUS = real('Radiant Lotus');
const faceOf = (card: CardDefinition) => {
  const face = card.faces[0];
  if (face === undefined) throw new Error(`${card.name} has no face`);
  return face;
};

const TRINKET = 'SYNTHETIC Trinket';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the real card is the nodes the engine fixture holds', () => {
  test('Radiant Lotus is valid and costs {6}', () => {
    expect(validateCard(LOTUS)).toEqual([]);
    expect(faceOf(LOTUS).manaCost).toEqual(['6']);
    expect(faceOf(LOTUS).types).toEqual(['artifact']);
  });

  test('its ability is the ability of the SYNTHETIC Lotus Engine', () => {
    expect(faceOf(LOTUS).abilities).toEqual(
      faceOf(syntheticCard('SYNTHETIC Lotus Engine')).abilities,
    );
  });
});

describe('Radiant Lotus is played', () => {
  const game = () =>
    scenario()
      .define(LOTUS)
      .seat(0)
      .battlefield(LOTUS.name)
      .battlefield(TRINKET, { label: 'a1' })
      .battlefield('Sol Ring', { label: 'a2' })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('two artifacts are sacrificed, and the target player adds six mana of the color the controller chose', () => {
    const g = game();
    g.act(0).activate(LOTUS.name, { targets: [{ player: 1 }] });
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    expect(d.min).toBe(1);
    expect(d.max).toBe(3);
    g.act(0).choosePermanents('a1', 'a2');
    // A targeted ability uses the stack: nothing is in a pool until it resolves.
    expect(g.state.stack).toHaveLength(1);
    g.expect.pool(1, {});
    g.passAll();
    g.act(0).chooseOption('green');
    g.expect.pool(1, { G: 6 });
    g.expect.pool(0, {});
    g.expect.zone(TRINKET, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('the Lotus may sacrifice itself and the mana is still added', () => {
    const g = scenario()
      .define(LOTUS)
      .seat(0)
      .battlefield(LOTUS.name)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(LOTUS.name, { targets: [{ player: 0 }] });
    g.passAll();
    g.act(0).chooseOption('black');
    g.expect.pool(0, { B: 3 });
  });
});
