// Morph (CR 702.37): "Morph {B}" lowers to the `morph` entry of the face's `alternativeCosts`, whose cost is the MORPH cost (what turns the permanent face up); the {3}
// of the face-down cast and everything else is the engine's. The real lines are those of Grim Haruspex ("Morph {B}"), Aphetto Alchemist ("Morph {U}") and Akroma,
// Angel of Fury ("Morph {3}{R}{R}{R}"), each followed by the reminder text of the card; the rest is SYNTHETIC. That the engine runs it is in
// packages/engine/test/scenario-xx-morph.test.ts.
import type { AlternativeCost } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { read, readAll } from './parser-p5-helpers';

const morph = (...symbols: string[]): AlternativeCost => ({
  kind: 'morph',
  cost: [{ kind: 'mana', symbols }],
});

describe('keyword.morph (CR 702.37a)', () => {
  test.each([
    ['Morph {B}', ['B']],
    ['Morph {U}', ['U']],
    ['Morph {3}{R}{R}{R}', ['3', 'R', 'R', 'R']],
  ])('the real line "%s" is the morph cost of the face', (text, symbols) => {
    expect(readAll(text, 'creature').alternativeCosts).toEqual([morph(...symbols)]);
  });

  test('the reminder text of the card is dropped by the normalizer', () => {
    const parsed = readAll(
      'Morph {B} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)',
      'creature',
    );
    expect(parsed.alternativeCosts).toEqual([morph('B')]);
    expect(parsed.abilities).toEqual([]);
  });

  test('it is read next to the other abilities of the card (Aphetto Alchemist, Akroma)', () => {
    const parsed = readAll(
      '{T}: Untap target artifact or creature.\nMorph {U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)',
      'creature',
    );
    expect(parsed.alternativeCosts).toEqual([morph('U')]);
    expect(parsed.abilities).toHaveLength(1);
  });

  test('a morph cost that is not plain mana is not read, and neither is Disguise', () => {
    for (const text of [
      'Morph—Reveal a blue card in your hand.',
      'Morph {X}{R}',
      'Megamorph—Pay 3 life.',
      'Disguise {3}{W}',
    ]) {
      expect(read(text, 'creature').alternativeCosts).toEqual([]);
    }
  });
});

describe('keyword.megamorph (CR 702.37b)', () => {
  test('"Megamorph {4}{G}" is a morph cost with the megamorph flag, reminder text dropped (Deathmist Raptor)', () => {
    const parsed = readAll(
      'Megamorph {4}{G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its megamorph cost and put a +1/+1 counter on it.)',
      'creature',
    );
    expect(parsed.alternativeCosts).toEqual([{ ...morph('4', 'G'), megamorph: true }]);
    expect(parsed.abilities).toEqual([]);
  });
});
