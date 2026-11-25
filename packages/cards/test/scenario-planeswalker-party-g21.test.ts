// Planeswalker Party deck (issue 132), group 21: The Chain Veil, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 603.4 (the intervening "if" at the beginning of the end step), CR 606.2 and 606.3 (loyalty abilities: once a turn for each planeswalker), the "as though none have been activated"
// reset (a second activation of the same planeswalker is legal after it), CR 119.3 (2 life lost). Three seats.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const VEIL = real('The Chain Veil');
const NAHIRI = real('Nahiri, the Harbinger');
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('The Chain Veil', () => {
  const build = () =>
    scenario({ seats: 3 })
      .define(VEIL)
      .define(NAHIRI)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(VEIL.name)
      .battlefield(NAHIRI.name, { counters: { loyalty: 4 } })
      .battlefield('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('no loyalty ability this turn: you lose 2 life at your end step', () => {
    const g = build();
    g.advanceTo('end');
    g.passAll();
    g.expect.life(0, 38);
  });

  test('a loyalty ability was activated: no life is lost', () => {
    const g = build();
    g.act(0).activate(NAHIRI.name, { ability: 0 });
    g.passAll();
    g.act(0).decline();
    g.advanceTo('end');
    g.passAll();
    g.expect.life(0, 40);
  });

  test('after the Veil, the same planeswalker may be activated a second time', () => {
    const g = build();
    g.act(0).activate(NAHIRI.name, { ability: 0 });
    g.passAll();
    g.act(0).decline();
    const id = g.id(NAHIRI.name);
    const again = () =>
      g
        .legalActions(0)
        .some((a) => a.kind === 'activate' && a.object === id && a.abilityIndex === 0);
    expect(again()).toBe(false);
    g.act(0).activate(VEIL.name, { ability: 1, pay: true });
    g.passAll();
    expect(again()).toBe(true);
  });
});
