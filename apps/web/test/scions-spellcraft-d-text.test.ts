// The words of the Scions of Spellcraft deck, group D, as pure models: the conditions "an opponent has seven or more cards in their graveyard" and "you've cast two or more
// noncreature spells this turn", and the cast button of the alternative cost that pays life (Snuff Out). No DOM.
import type { ObjectView } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { gameConditionWords } from '../src/game/condition-text';
import { alternativeLabel } from '../src/ui/decisions/alt-cost';

describe('the conditions', () => {
  test("an opponent's graveyard", () => {
    expect(
      gameConditionWords({
        kind: 'cardsInGraveyard',
        compare: { cmp: 'atLeast', value: 7 },
        player: 'anOpponent',
      }),
    ).toBe('an opponent has 7 or more cards in their graveyard');
  });

  test('noncreature spells cast this turn', () => {
    expect(
      gameConditionWords({
        kind: 'spellsCastThisTurn',
        atLeast: 2,
        notOfTypes: ['creature'],
      }),
    ).toBe('you have cast 2 or more noncreature spells this turn');
  });
});

describe('the cast button of the life cost', () => {
  const card = (cost: readonly string[]): ObjectView =>
    ({ alternativeCosts: [{ kind: 'payLife', cost, life: 4 }] }) as unknown as ObjectView;

  test('no mana: "Cast by paying 4 life instead of mana"', () => {
    expect(alternativeLabel('payLife', card(['0']))).toBe('Cast by paying 4 life instead of mana');
  });

  test('with mana besides the life it names both', () => {
    expect(alternativeLabel('payLife', card(['B']))).toBe('Cast for {B} and 4 life');
  });
});
