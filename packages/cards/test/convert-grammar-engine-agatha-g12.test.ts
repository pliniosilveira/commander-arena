// Agatha deck (issue 345), group 12: Magus of the Candelabra, "{X}, {T}: Untap X target lands."
// Pins: CR 107.3a (X is announced as the ability is activated), CR 602.2b / 601.2b-c (X before targets, exactly X targets), CR 701.26 (untap), CR 302.6 (the {T} cost).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const MAGUS = real('Magus of the Candelabra');

const game = () =>
  scenario()
    .define(MAGUS)
    .seat(0)
    .battlefield(MAGUS.name)
    .battlefield('Forest', 'Forest')
    .battlefield('Mountain', { tapped: true })
    .battlefield('Mountain', { tapped: true })
    .battlefield('Mountain', { tapped: true })
    .seat(1)
    .library('Forest')
    .build();

describe('Magus of the Candelabra', () => {
  test('X = 2 untaps exactly two target lands', () => {
    const g = game();
    g.act(0).activate(MAGUS.name).x(2).targets(['Mountain[0]', 'Mountain[1]']).pay();
    g.passAll();
    g.expect.tapped('Mountain[0]', false);
    g.expect.tapped('Mountain[1]', false);
    g.expect.tapped('Mountain[2]', true);
    g.expect.tapped(MAGUS.name);
    g.expect.invariants();
  });

  test('X = 0 has no target and untaps nothing', () => {
    const g = game();
    g.act(0).activate(MAGUS.name).x(0);
    g.passAll();
    g.expect.tapped('Mountain[0]', true);
    g.expect.tapped(MAGUS.name);
  });

  test('X cannot be larger than the lands that could be targeted', () => {
    const g = game();
    g.act(0).activate(MAGUS.name);
    const d = g.state.pending;
    if (d?.kind !== 'chooseX') throw new Error('expected an X decision');
    expect(d.max).toBeLessThanOrEqual(2);
  });
});
