import { expect, test } from 'vitest';
import { withAnnouncedX } from '../src/game/amount-text';

test('every X of an effect says its value; the text keeps its X so it still matches the card', () => {
  expect(withAnnouncedX('Deals X damage to any target.', 3)).toBe(
    'Deals X (3) damage to any target.',
  );
  expect(withAnnouncedX('You draw X cards', 0)).toBe('You draw X (0) cards');
  expect(withAnnouncedX('Draw X cards and lose X life.', 2)).toBe(
    'Draw X (2) cards and lose X (2) life.',
  );
});

test('a multiple of X is multiplied and a sign stays', () => {
  expect(withAnnouncedX('Create 2X Treasure tokens.', 3)).toBe('Create 2X (6) Treasure tokens.');
  expect(withAnnouncedX('Creatures get -X/-X until end of turn.', 2)).toBe(
    'Creatures get -X (2)/-X (2) until end of turn.',
  );
});

test('the {X} of a cost, a word with an X in it and a defined X are left alone', () => {
  expect(withAnnouncedX('{X}{X}, {T}: Draw X cards.', 2)).toBe('{X}{X}, {T}: Draw X (2) cards.');
  expect(withAnnouncedX('Exile the Xenagos token.', 2)).toBe('Exile the Xenagos token.');
  expect(withAnnouncedX('You draw X cards, where X is the number of Zombies you control', 4)).toBe(
    'You draw X cards, where X is the number of Zombies you control',
  );
});
