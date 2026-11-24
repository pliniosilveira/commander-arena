// The Hosts of Mordor deck (issue 150): seven cards, each with its own small primitive. The lines are the real Oracle text of the acceptance cards of the golden
// corpus (names replaced by ~) read through the whole pipeline; the other lines are SYNTHETIC siblings and near misses the grammar must not read.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

describe('"Add two mana in any combination of {U}, {B}, and/or {R}" (Relic of Sauron, CR 106.1b, 605.3b)', () => {
  test('the real line: a mana ability of two mana, each one of the three listed colors', () => {
    const parsed = readAll(
      '{T}: Add two mana in any combination of {U}, {B}, and/or {R}.',
      'artifact',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'anyCombination', count: 2, colors: ['U', 'B', 'R'] },
      },
    ]);
  });

  test('two colors joined by "or", and a count of three (SYNTHETIC)', () => {
    const parsed = readAll('{T}: Add three mana in any combination of {W} or {G}.', 'artifact');
    expect(parsed.abilities).toEqual([
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'anyCombination', count: 3, colors: ['W', 'G'] },
      },
    ]);
  });

  test('the instruction of a spell chooses each mana among the listed colors only (SYNTHETIC)', () => {
    const parsed = readAll('Add two mana in any combination of {U} and/or {B}.', 'instant');
    const text = JSON.stringify(parsed.spell);
    expect(text).toContain('"chooseOne"');
    expect(text).not.toContain('"W"');
    expect(text).not.toContain('"G"');
  });

  test.each([
    '{T}: Add two mana in any combination of {U}.',
    '{T}: Add two mana in any combination of {U}{B}.',
    '{T}: Add two mana in any combination of {U}, {U}, and/or {R}.',
    '{T}: Add two mana in any combination of {U}, {B}, and/or.',
    '{T}: Add two mana in any combination of {U}, {B}, and/or {R}, then draw a card.',
    '{T}: Add five mana in any combination of {U}, {B}, and/or {R}.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'artifact').reason).toBeDefined();
  });
});
