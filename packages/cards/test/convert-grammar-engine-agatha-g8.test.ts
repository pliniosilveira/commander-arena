// Agatha deck (issue 345), group 8: Drillworks Mole, "{2}, {T}: Put a +1/+1 counter on ~ and a +1/+1 counter on up to one target commander creature you control."
// Pins: CR 122.6 (putting counters), CR 903.3 (commander), CR 601.2c / 115.4 ("up to one" target may be none), CR 608.2c (instructions in order), CR 115.1 (the target is chosen
// as the ability goes on the stack).
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { real } from './agatha-helpers';

const MOLE = real('Drillworks Mole');
const BEARS = 'Grizzly Bears';

const game = (commander: boolean) =>
  scenario()
    .define(MOLE)
    .seat(0)
    .battlefield(MOLE.name)
    .battlefield('Forest', 'Forest')
    .battlefield(BEARS, commander ? { commander: true } : {})
    .seat(1)
    .library('Forest')
    .build();

describe('Drillworks Mole', () => {
  test('puts a counter on itself and one on the targeted commander creature', () => {
    const g = game(true);
    g.act(0).activate(MOLE.name).targets([BEARS]).pay();
    g.passAll();
    g.expect.counters(MOLE.name, { '+1/+1': 1 });
    g.expect.counters(BEARS, { '+1/+1': 1 });
    g.expect.tapped(MOLE.name);
    g.expect.invariants();
  });

  test('with no target the Mole still gets its counter', () => {
    const g = game(false);
    g.act(0).activate(MOLE.name).targets([]).pay();
    g.passAll();
    g.expect.counters(MOLE.name, { '+1/+1': 1 });
    g.expect.counters(BEARS, {});
    g.expect.invariants();
  });

  test('a creature that is not a commander is not a legal target', () => {
    const g = game(false);
    g.act(0).activate(MOLE.name);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected a target decision');
    if ((d.specs[0]?.legal ?? []).length !== 0) throw new Error('the Bears are not a commander');
  });
});
