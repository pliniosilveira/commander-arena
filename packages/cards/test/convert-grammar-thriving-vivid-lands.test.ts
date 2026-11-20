// The other Thriving and Vivid lands of the "deck support" issues (Thriving Heath, Moor, Bluff, Grove; Vivid Crag, Creek, Marsh, Meadow) are the same templates as Thriving Isle and
// Vivid Grove with another color, so the grammar already reads them. Each text is the wording of the real card, imported through the grammar under a SYNTHETIC name; the plays
// themselves are covered once per template in convert-grammar-engine-next7.test.ts.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

const THRIVING = [
  { color: 'W', word: 'white', others: ['U', 'B', 'R', 'G'] },
  { color: 'B', word: 'black', others: ['W', 'U', 'R', 'G'] },
  { color: 'R', word: 'red', others: ['W', 'U', 'B', 'G'] },
  { color: 'G', word: 'green', others: ['W', 'U', 'B', 'R'] },
] as const;

describe('Thriving lands: enters tapped, choose a color other than their own (CR 614.12)', () => {
  for (const { color, word, others } of THRIVING) {
    test(`the ${word} one offers the four other colors and enters tapped`, () => {
      const land = parsed(
        `SYNTHETIC Parsed Thriving ${word}`,
        'Land',
        `This land enters tapped. As it enters, choose a color other than ${word}.\n{T}: Add {${color}} or one mana of the chosen color.`,
      );
      const g = scenario()
        .seat(0)
        .life(20)
        .define(land)
        .hand(land.name)
        .library(...FILLER)
        .seat(1)
        .life(20)
        .library(...FILLER)
        .at('precombatMain', { active: 0 })
        .build();
      g.act(0).playLand(land.name);
      const d = g.state.pending;
      expect(d?.kind).toBe('chooseOption');
      if (d?.kind === 'chooseOption') expect(d.options).toEqual(others);
      g.act(0).chooseOption(others[0]);
      g.expect.tapped(land.name, true);
    });
  }
});

describe('Vivid lands: enters tapped with two charge counters (CR 122.1, 614.1c)', () => {
  for (const [color, word] of [
    ['R', 'Crag'],
    ['U', 'Creek'],
    ['B', 'Marsh'],
    ['W', 'Meadow'],
  ] as const) {
    test(`the ${word} one enters tapped with two charge counters`, () => {
      const land = parsed(
        `SYNTHETIC Parsed Vivid ${word}`,
        'Land',
        `This land enters tapped with two charge counters on it.\n{T}: Add {${color}}.\n{T}, Remove a charge counter from this land: Add one mana of any color.`,
      );
      const g = scenario()
        .seat(0)
        .life(20)
        .define(land)
        .hand(land.name)
        .library(...FILLER)
        .seat(1)
        .life(20)
        .library(...FILLER)
        .at('precombatMain', { active: 0 })
        .build();
      g.act(0).playLand(land.name);
      g.expect.tapped(land.name, true);
      expect(g.state.objects[g.id(land.name)]?.counters.charge).toBe(2);
    });
  }
});
