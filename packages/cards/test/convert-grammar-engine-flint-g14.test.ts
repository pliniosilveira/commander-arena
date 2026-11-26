// Flint deck (issue 685), group 14: Cruelclaw's Heist, read from its REAL Oracle text (fixtures/corpus/golden.jsonl) with no override and played through applyAction on three seats.
// "Gift a card. Target opponent reveals their hand. You choose a nonland card from it. Exile that card. If the gift was promised, you may cast that card for as long as it remains exiled, and
// mana of any type can be spent to cast it." (CR 702.174, 701.20a, 402.3, 608.2d, 701.13, 609.4b): the hand is revealed to all, the caster (not the owner) chooses, a land cannot be chosen, and
// the permission exists only when the gift was promised.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
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

const HEIST = real("Cruelclaw's Heist");
const ELVES = 'Llanowar Elves'; // {G}
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains'] as const;

describe("Cruelclaw's Heist (CR 702.174, 701.20a, 402.3, 608.2d, 609.4b)", () => {
  test('is valid', () => {
    expect(validateCard(HEIST)).toEqual([]);
  });

  const table = () =>
    scenario({ seats: 3 })
      .define(HEIST)
      .seat(0)
      .library(...FILLER)
      .hand(HEIST.name)
      .pool('BBR')
      .seat(1)
      .library(...FILLER)
      .hand(ELVES, 'Forest')
      .seat(2)
      .library(...FILLER)
      .hand('Island')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  const cast = (g: ScenarioGame, promise: boolean) => {
    const handle = g.act(0).cast(HEIST.name);
    // The gift is offered to one opponent after another: a refusal moves on to the next, and promising it ends the question.
    for (let i = 0; i < 6 && g.state.pending?.kind === 'confirmOptional'; i += 1) {
      handle.gift(promise);
    }
    handle.targets([{ player: 1 }]).pay();
    g.passAll();
  };

  test('the nonland card is exiled, a land stays in the hand, and the hand was revealed to everyone', () => {
    const g = table();
    cast(g, false);
    g.expect.zone(ELVES, 'exile', { seat: 1 });
    g.expect.zone('Forest', 'hand', { seat: 1 });
    // The hand of the target was shown to everyone (CR 701.20a).
    g.expect.eventLog([{ kind: 'cardsRevealed', seat: 1, from: 'hand' }]);
  });

  test('with no gift the card cannot be cast', () => {
    const g = table();
    cast(g, false);
    g.expect.illegal(0, { cast: { name: ELVES, seat: 1, zone: 'exile' } });
  });

  test('with the gift promised (the opponent draws first) the card can be cast with mana of any type', () => {
    const g = table();
    cast(g, true);
    g.expect.zone(ELVES, 'exile', { seat: 1 });
    g.act(0).cast({ name: ELVES, seat: 1, zone: 'exile' }, { pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
    // The gift: the opponent drew a card before the other effects (Forest, the card drawn).
    expect(g.state.seats[1]?.hand.length).toBe(2);
  });
});
