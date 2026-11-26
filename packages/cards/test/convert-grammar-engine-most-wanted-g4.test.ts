// Most Wanted deck, group 4 (Mistmeadow Skulk, Rankle, Misfortune Teller, Massacre Girl): the Oracle text of each card read through the grammar only (SYNTHETIC names,
// the real text) and played through applyAction. Pins: CR 702.16a (protection from a quality: a mana value), 702.16b (targeting), 702.16e (damage), 702.16f (blocking),
// CR 202.3 and 202.3e (the mana value of a spell counts its X). Stand-ins are the engine's real fixtures.
import type { GameState } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const SKULK = parsed(
  'SYNTHETIC Mistmeadow Skulk',
  'Creature — Kithkin Rogue',
  'Lifelink, protection from mana value 3 or greater',
  { manaCost: '{2}{W}', power: '3', toughness: '1', colors: ['W'] },
);

const targetsOf = (state: GameState): number[] => {
  const d = state.pending;
  if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
  return (d.specs[0]?.legal ?? []).flatMap((t) => (t.kind === 'object' ? [t.id] : []));
};

describe('Mistmeadow Skulk: lifelink, protection from mana value 3 or greater', () => {
  test('reads as lifelink and a protection from a mana value', () => {
    const keywords = (SKULK.faces[0]?.abilities ?? []).flatMap((a) =>
      a.kind === 'keyword' ? [JSON.stringify(a.keyword)] : [],
    );
    expect(keywords).toEqual([
      '{"kind":"lifelink"}',
      '{"kind":"protection","from":"manaValue","cmp":"atLeast","value":3}',
    ]);
  });

  const board = () =>
    scenario()
      .define(SKULK)
      .seat(0)
      .hand('Murder', 'Lightning Bolt')
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Mountain')
      .battlefield('Grizzly Bears')
      .seat(1)
      .battlefield(SKULK.name)
      .at('precombatMain');

  test('a spell with mana value 3 (Murder) can not target it, one with mana value 1 (Lightning Bolt) can (CR 702.16b)', () => {
    const g = board().build();
    g.act(0).cast('Murder');
    expect(targetsOf(g.state)).not.toContain(g.id(SKULK.name));
    expect(targetsOf(g.state)).toContain(g.id('Grizzly Bears'));
    const h = board().build();
    h.act(0).cast('Lightning Bolt');
    expect(targetsOf(h.state)).toContain(h.id(SKULK.name));
  });

  test('damage from a source with mana value 1 is dealt', () => {
    const g = board().build();
    g.act(0).cast('Lightning Bolt', { targets: [SKULK.name], pay: true });
    g.passAll();
    g.expect.zone(SKULK.name, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('a creature with mana value 3 or more can not block it (CR 702.16f); a cheaper one can', () => {
    const g = scenario()
      .define(SKULK)
      .seat(0)
      .battlefield(SKULK.name)
      .seat(1)
      .battlefield('Serra Angel', 'Grizzly Bears')
      .at('precombatMain')
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(SKULK.name);
    g.advanceTo('declareBlockers');
    expect(
      g.act(1).try.action({
        kind: 'declareBlockers',
        blocks: [{ blocker: g.id('Serra Angel'), attacker: g.id(SKULK.name) }],
      }).ok,
    ).toBe(false);
    g.act(1).declareBlockers([{ blocker: 'Grizzly Bears', attacker: SKULK.name }]);
  });

  test('combat damage from a creature with mana value 3 or more is prevented (CR 702.16e)', () => {
    const g = scenario()
      .define(SKULK)
      .seat(0)
      .battlefield(SKULK.name)
      .seat(1)
      .battlefield('Giant Spider')
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack('Giant Spider');
    g.advanceTo('declareBlockers');
    g.act(0).declareBlockers([{ blocker: SKULK.name, attacker: 'Giant Spider' }]);
    g.passAll();
    g.expect.zone(SKULK.name, 'battlefield', { seat: 0 });
    expect(g.object(SKULK.name).damage).toBe(0);
    g.expect.invariants();
  });
});
