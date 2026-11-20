// Agatha deck (issue 345), group 4: Soulbright Flamekin, "{2}: Target creature gains trample until end of turn. If this is the third time this ability has resolved this turn,
// you may add {R}{R}{R}{R}{R}{R}{R}{R}."
// Pins: CR 608.2c (the instruction is read as it comes up, so the count includes the resolution that is happening), CR 602.2 (an activated ability goes on the stack),
// CR 106.4 (mana added goes to the pool), CR 603.5-style "may" asked as the effect resolves.
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { real } from './agatha-helpers';

const FLAMEKIN = real('Soulbright Flamekin');

const game = () =>
  scenario()
    .define(FLAMEKIN)
    .seat(0)
    .battlefield(FLAMEKIN.name)
    .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
    .seat(1)
    .library('Forest')
    .build();

function activate(g: ReturnType<typeof game>) {
  g.act(0).activate(FLAMEKIN.name).targets([FLAMEKIN.name]).pay();
  g.passAll();
}

describe('Soulbright Flamekin', () => {
  test('the first and second resolutions add no mana and ask nothing', () => {
    const g = game();
    activate(g);
    g.expect.derived(FLAMEKIN.name, { keywords: ['trample'] });
    activate(g);
    g.expect.pool(0, {});
    g.expect.invariants();
  });

  test('the third resolution in a turn offers eight red mana, which the player may take', () => {
    const g = game();
    activate(g);
    activate(g);
    g.act(0).activate(FLAMEKIN.name).targets([FLAMEKIN.name]).pay();
    g.passAll();
    g.act(0).accept();
    g.expect.pool(0, { R: 8 });
    g.expect.invariants();
  });

  test('declining the offer adds nothing', () => {
    const g = game();
    activate(g);
    activate(g);
    g.act(0).activate(FLAMEKIN.name).targets([FLAMEKIN.name]).pay();
    g.passAll();
    g.act(0).decline();
    g.expect.pool(0, {});
    g.expect.pending('priority', 0);
  });
});
