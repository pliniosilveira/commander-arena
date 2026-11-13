// "As an additional cost to cast this spell, discard X cards" (Hashaton group 10, D-386, provisional; CR 107.3a, 701.9): the announce-X question says it discards X cards and
// how many X can be, what a chosen X discards, and the additional cost reads as the card prints it. The page only draws what these return; the engine's `max` already holds
// the cards in hand and the legal targets.
import { expect, test } from 'vitest';
import { activationCostPart, additionalCostsText } from '../src/game/cost-text';
import { discardXText, perXText, xCostAt, xPrompt } from '../src/ui/decisions/x-picker';

const discard = (n = 1, mana = 0, life = 0) => ({ perX: { mana, life, discard: n } });
const spell = {
  sourceName: 'Restless Dreams',
  purpose: 'spell',
} as const;

test('a spell that only discards says "Discard X cards" with the most X the hand and the graveyard allow', () => {
  expect(discardXText(discard())).toBe('Discard X cards');
  expect(perXText(discard())).toBe('Discard X cards');
  expect(xPrompt({ ...spell, ...discard(), max: 3 })).toBe(
    'Choose X for Restless Dreams. Discard X cards; you can choose up to X = 3.',
  );
  expect(xPrompt({ ...spell, ...discard(), max: 0 })).toBe(
    'Choose X for Restless Dreams. Discard X cards; you can choose up to X = 0.',
  );
});

test('two cards for each X, and the cost of X in mana or life beside the discard', () => {
  expect(discardXText(discard(2))).toBe('Discard 2X cards');
  expect(perXText(discard(1, 1))).toBe('Each X costs {1}, and you discard X cards');
  expect(xPrompt({ ...spell, ...discard(1, 1), max: 2 })).toBe(
    'Choose X for Restless Dreams. Each X costs {1}, and you discard X cards; you can afford up to X = 2.',
  );
  expect(perXText(discard(1, 0, 1))).toBe('Each X costs 1 life, and you discard X cards');
});

test('what a chosen X pays: the cards it discards, with the mana and life', () => {
  expect(xCostAt(discard(), 3)).toBe('discard 3 cards');
  expect(xCostAt(discard(), 1)).toBe('discard 1 card');
  expect(xCostAt(discard(2), 2)).toBe('discard 4 cards');
  expect(xCostAt(discard(1, 1), 2)).toBe('{2} and discard 2 cards');
  expect(xCostAt(discard(), 0)).toBe('');
});

test('the additional cost reads as printed', () => {
  expect(activationCostPart({ kind: 'discardX' })).toBe('Discard X cards');
  expect(additionalCostsText([{ kind: 'discardX' }])).toBe('Discard X cards');
  expect(additionalCostsText([{ kind: 'payXLife' }, { kind: 'discardX' }])).toBe(
    'Pay X life, discard X cards',
  );
});
