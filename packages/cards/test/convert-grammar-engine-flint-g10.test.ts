// Flint deck (issue 685), group 10: You Find Some Prisoners, read from its REAL Oracle text (fixtures/corpus/golden.jsonl) with no override and played through applyAction on three seats.
// "Choose one — • Break Their Chains — Destroy target artifact. • Interrogate Them — Exile the top three cards of target opponent's library. Choose one of them. Until the end of your next
// turn, you may play that card, and you may spend mana as though it were mana of any color to cast it." (CR 700.2, 701.13, 601.2, 609.4b, 611.2a): only the card chosen may be played; the
// two others stay in exile with no permission.
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

const PRISONERS = real('You Find Some Prisoners');
const ELVES = 'Llanowar Elves'; // {G}
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains'] as const;

describe('You Find Some Prisoners (CR 700.2, 701.13, 609.4b)', () => {
  test('is valid', () => {
    expect(validateCard(PRISONERS)).toEqual([]);
  });

  const table = () =>
    scenario({ seats: 3 })
      .define(PRISONERS)
      .seat(0)
      .library(...FILLER)
      .hand(PRISONERS.name)
      .pool('RRR')
      .seat(1)
      .library(ELVES, 'Forest', 'Island', ...FILLER)
      .battlefield('Sol Ring', { label: 'ring' })
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('Break Their Chains destroys the target artifact', () => {
    const g = table();
    g.act(0).cast(PRISONERS.name).modes(0).targets(['ring']).pay();
    g.passAll();
    g.expect.zone('Sol Ring', 'graveyard', { seat: 1 });
  });

  test('Interrogate Them exiles three cards, and only the one chosen can be played, with mana of any color', () => {
    const g = table();
    g.act(0).cast(PRISONERS.name).modes(1).targets([{ player: 1 }]).pay();
    g.passAll();
    g.expect.zone(ELVES, 'exile', { seat: 1 });
    g.expect.zone('Forest', 'exile', { seat: 1 });
    g.expect.zone('Island', 'exile', { seat: 1 });
    expect(g.state.pending?.kind).toBe('chooseCards');
    g.act(0).chooseCards({ name: ELVES, seat: 1, zone: 'exile' });
    // {G} paid with the red mana left: any color can be spent.
    g.act(0).cast({ name: ELVES, seat: 1, zone: 'exile' }, { pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
    // The two cards not chosen have no permission.
    g.expect.illegal(0, { playLand: { name: 'Forest', seat: 1, zone: 'exile' } });
  });
});
