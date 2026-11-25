// Planeswalker Party deck (issue 132), group 16: Narset, Enlightened Master, read from the golden corpus through the grammar with no override and played with the scenario DSL.
// Pins: CR 508.2a (the attack trigger), CR 701.13 (exile the top four), CR 601.2 and 118.9 (cast noncreature spells from among them without paying), CR 611.2a (until end of turn),
// CR 205.2a (a noncreature spell). A creature card among them has no permission.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const NARSET = real('Narset, Enlightened Master');
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';

describe('Narset, Enlightened Master', () => {
  test('after it attacks, the exiled noncreature spell may be cast for free and the creature card may not', () => {
    const g = scenario({ seats: 3 })
      .define(NARSET)
      .seat(0)
      .library(BEARS, BOLT, 'Plains', 'Island', ...Array.from({ length: 6 }, () => 'Plains'))
      .battlefield(NARSET.name)
      .seat(1)
      .library(...Array.from({ length: 6 }, () => 'Plains'))
      .seat(2)
      .library(...Array.from({ length: 6 }, () => 'Plains'))
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: NARSET.name, target: { player: 1 } }]);
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    const casts = g.legalActions(0).flatMap((a) => (a.kind === 'castSpell' ? [a.object] : []));
    expect(casts).toContain(g.id(BOLT));
    expect(casts).not.toContain(g.id(BEARS));
  });
});
