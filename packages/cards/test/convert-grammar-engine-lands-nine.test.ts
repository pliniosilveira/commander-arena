// Nine requested lands of the "deck support" issues, run as written. Each group imports a SYNTHETIC card through the grammar, defines it in an engine scenario and plays it through
// applyAction. The wording of each text is that of the real card, taken from the card data the deck support workflow fetched from Scryfall for the issue.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

// ---- Raging Ravine: "{2}{R}{G}: Until end of turn, this land becomes a 3/3 red and green Elemental creature with \"Whenever this creature attacks, put a +1/+1 counter on it.\" It's still
// a land." (CR 205.1b, 611.2a, 613.1d, 613.1f, 613.4b, 603.1).

const RAVINE = parsed(
  'SYNTHETIC Parsed Ravine',
  'Land',
  'This land enters tapped.\n{T}: Add {R} or {G}.\n{2}{R}{G}: Until end of turn, this land becomes a 3/3 red and green Elemental creature with "Whenever this creature attacks, put a +1/+1 counter on it." It\'s still a land.',
);

describe('Raging Ravine: a land that becomes a 3/3 Elemental and grows when it attacks', () => {
  const start = () =>
    scenario()
      .seat(0)
      .life(20)
      .define(RAVINE)
      .battlefield(RAVINE.name, { tapped: false })
      .battlefield('Mountain', 'Forest', 'Mountain', 'Forest')
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('it becomes a 3/3 red and green Elemental creature and is still a land', () => {
    const g = start();
    g.act(0).activate(RAVINE.name, { index: 1, pay: true });
    g.passAll();
    g.expect.derived(RAVINE.name, {
      types: ['land', 'creature'],
      subtypes: ['Elemental'],
      colors: ['R', 'G'],
    });
    g.expect.pt(RAVINE.name, 3, 3);
    g.expect.invariants();
  });

  test('attacking puts a +1/+1 counter on it (CR 603.1)', () => {
    const g = start();
    g.act(0).activate(RAVINE.name, { index: 1, pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack([RAVINE.name]);
    g.passAll();
    expect(g.state.objects[g.id(RAVINE.name)]?.counters['+1/+1']).toBe(1);
    g.expect.pt(RAVINE.name, 4, 4);
  });
});
