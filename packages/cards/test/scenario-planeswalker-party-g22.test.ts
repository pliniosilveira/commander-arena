// Planeswalker Party deck (issue 132), group 22: Narset of the Ancient Way, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 119.1 (+1 gains 2 life), CR 106.1b and 608.2d (one mana of a color chosen as the ability resolves), CR 106.6 and 205.2a (the mana can be spent only on a noncreature spell: a
// creature spell is not payable with it), CR 701.9 and 603.12 (the discard is offered; a nonland discard makes the damage of the card's mana value), CR 114 (-6 emblem). Three seats.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const NARSET = real('Narset of the Ancient Way');
const BOLT = 'Lightning Bolt';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('Narset of the Ancient Way', () => {
  const build = (hand: readonly string[]) =>
    scenario({ seats: 3 })
      .define(NARSET)
      .seat(0)
      .library(...LIBRARY)
      .hand(...hand)
      .battlefield(NARSET.name, { counters: { loyalty: 5 } })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'their bear' })
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('+1: gain 2 life and add one mana of a listed color', () => {
    const g = build([BOLT, BEARS]);
    g.act(0).activate(NARSET.name, { ability: 0 });
    g.passAll();
    g.act(0).chooseOption('{R}');
    g.expect.life(0, 42);
    g.expect.pool(0, { R: 1 });
  });

  test('the mana pays for Lightning Bolt (a noncreature spell) but not for Grizzly Bears', () => {
    const g = build([BOLT, BEARS]);
    g.act(0).activate(NARSET.name, { ability: 0 });
    g.passAll();
    g.act(0).chooseOption('{R}');
    const bolt = g.id(BOLT);
    const bears = g.id({ name: BEARS, seat: 0, zone: 'hand' });
    const casts = g.legalActions(0).flatMap((a) => (a.kind === 'castSpell' ? [a.object] : []));
    expect(casts).toContain(bolt);
    expect(casts).not.toContain(bears);
  });

  test('-2: discarding a nonland card deals its mana value to a creature', () => {
    const g = build([BOLT, BEARS]);
    g.act(0).activate(NARSET.name, { ability: 1 });
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseCards(BOLT);
    g.passAll();
    g.act(0).chooseTargets('their bear');
    g.passAll();
    g.expect.damage('their bear', 1);
  });
});
