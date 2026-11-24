// Planeswalker Party deck (issue 132), group 6: Mobilized District, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 613.1d, 613.1f and 613.4b (a land that becomes a 3/3 creature with vigilance, still a land), CR 611.2a (until end of turn), CR 601.2f and 602.2b (a cost reduced for each
// legendary creature and planeswalker you control: a legendary planeswalker that is also a creature counts once, as the ruling says), CR 205.4 (legendary).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const DISTRICT = real('Mobilized District');
const KAZUUL = real('Kazuul, Tyrant of the Cliffs');
const NAHIRI = real('Nahiri, the Harbinger');
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('Mobilized District', () => {
  const build = (others: readonly string[], plains: number) => {
    const b = scenario()
      .define(DISTRICT)
      .define(KAZUUL)
      .define(NAHIRI)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(DISTRICT.name)
      .battlefield(...others);
    for (let i = 0; i < plains; i += 1) b.battlefield('Plains');
    b.seat(1)
      .library(...LIBRARY)
      .battlefield(KAZUUL.name);
    return b.at('precombatMain', { active: 0, turn: 3 }).build();
  };

  test('with four mana and nothing legendary it costs {4}: it becomes a 3/3 creature with vigilance, still a land', () => {
    const g = build([], 4);
    g.act(0).activate(DISTRICT.name, { ability: 1, pay: true });
    g.passAll();
    g.expect.pt(DISTRICT.name, 3, 3);
    g.expect.derived(DISTRICT.name, {
      types: ['land', 'creature'],
      subtypes: ['Citizen'],
      keywords: ['vigilance'],
    });
  });

  test('a legendary creature and a legendary planeswalker each take {1} off: {2}', () => {
    const g = build([KAZUUL.name, NAHIRI.name], 2);
    g.act(0).activate(DISTRICT.name, { ability: 1, pay: true });
    g.passAll();
    g.expect.pt(DISTRICT.name, 3, 3);
  });

  test("a nonlegendary creature and an opponent's legendary creature take nothing off", () => {
    const g = build([BEARS], 2);
    expect(g.act(0).try.activate(DISTRICT.name, { ability: 1, pay: true }).ok).toBe(false);
  });
});
