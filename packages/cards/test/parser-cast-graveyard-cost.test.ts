// Issue 89 (Silverquill Influence), "You may cast this card from your graveyard by paying {2}{W} rather than paying its mana cost." (D-606; Raffine's Guidance) read through the
// whole pipeline: the real lines, the node they lower to and the near misses the grammar must not read.
// The engine runs the node in packages/engine/test/scenario-xx-cast-graveyard-cost.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const aura = (text: string) =>
  readAll(`Enchant creature\n${text}`, 'enchantment', ['Aura']).abilities;

describe('"You may cast this card from your graveyard by paying {2}{W} rather than paying its mana cost." (CR 118.9, 113.6b)', () => {
  test("the real third line of Raffine's Guidance", () => {
    expect(
      aura(
        'Enchanted creature gets +1/+1.\nYou may cast this card from your graveyard by paying {2}{W} rather than paying its mana cost.',
      )[2],
    ).toEqual({
      kind: 'static',
      static: { kind: 'castFromGraveyard', cost: [{ kind: 'mana', symbols: ['2', 'W'] }] },
    });
  });

  test('the permission without a cost is still the plain one', () => {
    expect(aura('You may cast this card from your graveyard.')[1]).toEqual({
      kind: 'static',
      static: { kind: 'castFromGraveyard' },
    });
  });

  test.each([
    ['You may cast this card from your graveyard by paying {2}{W}.'],
    ['You may cast this card from your graveyard by paying 2W rather than paying its mana cost.'],
    [
      'You may cast this card from your graveyard by paying {2}{W} rather than paying its mana cost this turn.',
    ],
    [
      'You may cast this card from your graveyard by paying {2}{W} and 2 life rather than paying its mana cost.',
    ],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(`Enchant creature\n${text}`, 'enchantment', ['Aura']).stoppedAt).toBeDefined();
  });
});
