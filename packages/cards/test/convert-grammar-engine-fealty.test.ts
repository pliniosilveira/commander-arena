// Riders of Rohan deck, group E (Fealty to the Realm): the real Oracle text read through the grammar only (the card name is SYNTHETIC) and played in a game of three players: the Aura
// enters, its controller becomes the monarch (CR 725.1), the monarch controls the enchanted creature (CR 613.1b), and the creature must attack each combat if able and cannot attack the
// Aura's controller (CR 508.1d, 508.1a). The engine rules are pinned in packages/engine/test/scenario-xx-monarch-controls.test.ts; the rulings of the card (2023-06-16, wotc) are
// pinned there as far as they are about control and its timestamp.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const fealty = parsed(
  'SYNTHETIC Parsed Fealty',
  'Enchantment — Aura',
  "Enchant creature\nWhen this Aura enters, you become the monarch.\nThe monarch controls enchanted creature.\nEnchanted creature attacks each combat if able and can't attack you.",
  { manaCost: '{4}{U}', colors: ['U'] },
);

const BEARS = 'Grizzly Bears';

const board = (monarch?: 1 | 2) =>
  scenario({ seats: 3 })
    .define(fealty)
    .seat(0)
    .hand(fealty.name)
    .battlefield('Island', 'Island', 'Island', 'Island', 'Island')
    .library('Island', 'Island', 'Island')
    .seat(1)
    .battlefield(BEARS)
    .library('Island', 'Island', 'Island')
    .seat(2)
    .library('Island', 'Island', 'Island')
    .at('precombatMain', monarch === undefined ? { active: 0 } : { active: 0, monarch })
    .build();

describe('Fealty to the Realm played from the real text', () => {
  test('it enters, its controller becomes the monarch and so controls the creature; the owner stays', () => {
    const g = board();
    g.act(0).cast(fealty.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.passAll();
    g.expect.monarch(0);
    g.expect.attached(fealty.name, BEARS);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    expect(g.object(g.id(BEARS)).owner).toBe(1);
    g.expect.invariants();
  });

  test('another monarch before it enters: the creature goes to them as the Aura enters, then to its controller as the trigger resolves', () => {
    const g = board(2);
    const mark = g.mark();
    g.act(0).cast(fealty.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.monarch(0);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    const changes = g
      .eventsSince(mark)
      .filter((e) => e.kind === 'controlChanged')
      .map((e) => (e.kind === 'controlChanged' ? [e.from, e.to] : []));
    expect(changes).toEqual([
      [1, 2],
      [2, 0],
    ]);
  });
});
