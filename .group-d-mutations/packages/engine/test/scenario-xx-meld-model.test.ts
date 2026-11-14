// Meld (CR 701.42, 712.4, 712.8g, 712.21; D-277): one permanent on the battlefield that two cards represent, two ordinary cards in every other
// zone. Cards are SYNTHETIC (src/cards/fixtures/synthetic-meld.ts); the pair is placed melded with `meldedWith`.
// CR 712.8g: the melded permanent has only the characteristics of the combined back face, and its mana value is the sum of the mana values of the
// two front faces (CR 202.3c). CR 712.21: when it leaves the battlefield one permanent leaves and two cards are put into the zone: "dies" triggers
// once, a card-keyed reader sees two cards. CR 712.4b, 712.8a: a meld card anywhere else has only its front face.
import { describe, expect, test } from 'vitest';
import { checkInvariants } from '../src/index';
import { scenario } from '../src/testing/index';
import { viewOf } from './layout-helpers';

const DUSK = 'SYNTHETIC Dusk Squire'; // {2}{W} 2/2 vigilance, the meld ability
const DAWN = 'SYNTHETIC Dawn Squire'; // {1}{B} 1/3
const TITAN = 'SYNTHETIC Twilight Titan'; // 8/8 flying, legendary Giant; enters: gain 3; dies: draw
const ASH = 'SYNTHETIC Ash Squire';

const melded = () =>
  scenario()
    .seat(0)
    .battlefield(DUSK, { label: 'dusk', meldedWith: 'dawn' })
    .battlefield(DAWN, { label: 'dawn' })
    .battlefield('Plains', 'Plains', 'Plains')
    .library('Island', { count: 6 })
    .seat(1)
    .library('Island', { count: 6 });

describe('a melded permanent (CR 701.42a, 712.4a, 712.8g)', () => {
  test('it is one object that both cards represent, with the combined back face up', () => {
    const g = melded().build();
    expect(g.state.battlefield).toHaveLength(4); // the melded permanent and three Plains
    const obj = g.object('dusk');
    expect(g.object('dawn')).toBe(obj);
    expect(obj.face).toBe(1);
    expect(obj.card).not.toBeNull();
    expect(obj.meldedWith).toBeDefined();
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('it has only the characteristics of the combined back face (CR 712.8g)', () => {
    const g = melded().build();
    const v = viewOf(g, 'dusk');
    expect(v.name).toBe(TITAN);
    expect(v.types).toEqual(['creature']);
    expect(v.supertypes).toEqual(['legendary']);
    expect(v.subtypes).toEqual(['Giant']);
    expect(v.colors).toEqual(['W', 'B']);
    expect(v.keywords).toEqual(['flying']);
    g.expect.pt('dusk', 8, 8);
    // The front faces' vigilance and their own names are not there.
    expect(v.keywords).not.toContain('vigilance');
  });

  test('its mana value is the sum of the mana values of its front faces (CR 202.3c): {2}{W} and {1}{B} make 5', () => {
    const g = melded().build();
    expect(viewOf(g, 'dusk').manaCost).toEqual(['2', 'W', '1', 'B']);
    expect(viewOf(g, 'dusk').meld?.manaValue).toBe(5);
  });

  test('it is a commander when one of its cards is (CR 903.3b)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(DUSK, { label: 'dusk', meldedWith: 'dawn', commander: true })
      .battlefield(DAWN, { label: 'dawn' })
      .library('Island', { count: 6 })
      .seat(1)
      .library('Island', { count: 6 })
      .build();
    expect(viewOf(g, 'dusk').isCommander).toBe(true);
    expect(checkInvariants(g.state)).toEqual([]);
  });
});

describe('what the DSL refuses (CR 701.42b)', () => {
  test('two cards that are not a pair, and a card that is not a meld card', () => {
    expect(() =>
      scenario().seat(0).battlefield(DUSK, { meldedWith: ASH }).battlefield(ASH).seat(1).build(),
    ).toThrow(/not the two cards of one meld pair/);
    expect(() =>
      scenario()
        .seat(0)
        .battlefield('Grizzly Bears', { meldedWith: DAWN })
        .battlefield(DAWN)
        .seat(1)
        .build(),
    ).toThrow(/only a meld card/);
  });
});

describe('the other zones (CR 712.4b, 712.8a)', () => {
  test('a meld card in hand has its front face only', () => {
    const g = scenario()
      .seat(0)
      .hand(DUSK)
      .library('Island', { count: 6 })
      .seat(1)
      .library('Island', { count: 6 })
      .build();
    const v = viewOf(g, DUSK);
    expect(v.name).toBe(DUSK);
    expect(v.faces).toBeUndefined();
  });
});
