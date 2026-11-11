// Stage P69: the Bruna deck program (issue 5), Nykthos, Shrine to Nyx: "{2}, {T}: Choose a color. Add an amount of mana of that color equal to your devotion to that color."
// The line is the real Oracle text of the acceptance card of the golden corpus, name replaced by ~, with the node the grammar produces; the other lines are SYNTHETIC
// near misses the grammar must not read. CR 605.3b (the color is chosen as the mana ability resolves), CR 700.5 (devotion).
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const NYKTHOS =
  '{T}: Add {C}.\n{2}, {T}: Choose a color. Add an amount of mana of that color equal to your devotion to that color.';
const MANA = {
  kind: 'mana',
  cost: [{ kind: 'mana', symbols: ['2'] }, { kind: 'tap' }],
  production: { kind: 'anyColorDevotion' },
};

describe('"Choose a color. Add an amount of mana of that color equal to your devotion to that color."', () => {
  test('Nykthos, Shrine to Nyx: a mana ability of the engine production', () => {
    const parsed = readAll(NYKTHOS, 'land');
    expect(parsed.abilities).toEqual([
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['C'] } },
      MANA,
    ]);
  });

  test('the reminder text is dropped as reminder text, not read as an ability', () => {
    const parsed = readAll(
      `${NYKTHOS} (Your devotion to a color is the number of mana symbols of that color in the mana costs of permanents you control.)`,
      'land',
    );
    expect(parsed.abilities).toHaveLength(2);
    expect(parsed.abilities[1]).toEqual(MANA);
  });

  test('with no mana cost it is the same production (SYNTHETIC)', () => {
    const parsed = readAll(
      '{T}: Choose a color. Add an amount of mana of that color equal to your devotion to that color.',
      'artifact',
    );
    expect(parsed.abilities).toEqual([
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'anyColorDevotion' } },
    ]);
  });
});

describe('near misses are dropped, never guessed (SYNTHETIC)', () => {
  test('"that color" with no color chosen before it', () => {
    expect(
      dropped(
        '{2}, {T}: Add an amount of mana of that color equal to your devotion to that color.',
        'land',
      ).reason,
    ).toBeDefined();
  });

  test('a choice of color with nothing that uses it', () => {
    expect(dropped('{2}, {T}: Choose a color.', 'land').reason).toBeDefined();
  });

  test('the sentences the other way round', () => {
    expect(
      dropped(
        '{2}, {T}: Add an amount of mana of that color equal to your devotion to that color. Choose a color.',
        'land',
      ).reason,
    ).toBeDefined();
  });

  test('a restricted choice, or a devotion to a named color, is not this ability', () => {
    expect(
      dropped(
        '{2}, {T}: Choose a color other than white. Add an amount of mana of that color equal to your devotion to that color.',
        'land',
      ).reason,
    ).toBeDefined();
    expect(
      dropped(
        '{2}, {T}: Choose a color. Add an amount of mana of that color equal to your devotion to white.',
        'land',
      ).reason,
    ).toBeDefined();
  });

  test('another sentence between or after is not dropped silently', () => {
    expect(
      dropped(
        '{2}, {T}: Choose a color. You gain 1 life. Add an amount of mana of that color equal to your devotion to that color.',
        'land',
      ).reason,
    ).toBeDefined();
    expect(
      dropped(
        '{2}, {T}: Choose a color. Add an amount of mana of that color equal to your devotion to that color. You gain 1 life.',
        'land',
      ).reason,
    ).toBeDefined();
  });

  test('as a spell it is not run: the engine asks the color only in a mana ability', () => {
    expect(
      dropped(
        'Choose a color. Add an amount of mana of that color equal to your devotion to that color.',
        'sorcery',
      ).reason,
    ).toBeDefined();
  });

  test('"Choose a color." alone is reported as a choice the engine cannot make', () => {
    expect(dropped('Choose a color. You gain 1 life.', 'sorcery').reason).toBeDefined();
  });
});
