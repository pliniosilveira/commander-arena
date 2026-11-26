// World Shaper deck: the REAL Oracle text of Planetary Annihilation (the corpus's golden.jsonl) goes through the grammar with no override and is played through applyAction with three and
// four seats. Pins: CR 101.4 (APNAP choices), CR 608.2d (choices as the effect resolves), CR 701.21a (sacrifice), CR 120 (damage). No Scryfall rulings exist for it.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const FILLER = Array.from({ length: 12 }, () => 'Island');
const BEARS = 'Grizzly Bears'; // 2/2

describe('Planetary Annihilation: "Each player chooses six lands they control, then sacrifices the rest. ~ deals 6 damage to each creature."', () => {
  const PA = real('Planetary Annihilation');

  /** Seat 0 casts it. `lands[i]` lands for seat i, labelled `s<seat>l<n>`; every seat also has a Grizzly Bears. */
  const start = (lands: readonly number[], active = 0) => {
    const b = scenario({ seats: lands.length as 2 | 3 | 4 }).define(PA);
    lands.forEach((count, seat) => {
      const s = b.seat(seat).library(...FILLER);
      for (let n = 1; n <= count; n += 1) s.battlefield('Forest', { label: `s${seat}l${n}` });
      s.battlefield(BEARS, { label: `s${seat}bear` });
    });
    b.seat(0).hand(PA.name).pool('CCCRR');
    return b.at('precombatMain', { active, turn: 3 }).build();
  };
  const forests = (g: ReturnType<typeof start>, seat: number) =>
    g.find({ name: 'Forest', zone: 'battlefield', seat });

  test('players with more than six lands choose six in APNAP order, the others keep all; the rest are sacrificed and every creature takes 6 (three seats)', () => {
    const g = start([8, 7, 5]);
    g.act(0).cast(PA.name, { pay: true });
    g.passAll();
    let d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    expect(d).toMatchObject({ seat: 0, purpose: 'keep', min: 6, max: 6 });
    expect(d.legal).toHaveLength(8);
    // Choosing fewer or more than six is refused.
    expect(() => g.act(0).choosePermanents('s0l1', 's0l2')).toThrow(/rejected/);
    g.act(0).choosePermanents('s0l1', 's0l2', 's0l3', 's0l4', 's0l5', 's0l6');
    d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    // Nothing is sacrificed until the last player has chosen (CR 101.4); the seat with five lands is not asked.
    expect(d).toMatchObject({ seat: 1, min: 6, max: 6 });
    expect(forests(g, 0)).toHaveLength(8);
    g.act(1).choosePermanents('s1l2', 's1l3', 's1l4', 's1l5', 's1l6', 's1l7');
    expect(forests(g, 0)).toHaveLength(6);
    expect(forests(g, 1)).toHaveLength(6);
    expect(forests(g, 2)).toHaveLength(5);
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    expect(g.find({ name: BEARS, zone: 'battlefield' })).toHaveLength(0);
    expect(g.find({ name: BEARS, zone: 'graveyard' })).toHaveLength(3);
    g.expect.invariants();
  });

  test('a player with exactly six lands or fewer chooses nothing and sacrifices nothing', () => {
    const g = start([6, 3]);
    g.act(0).cast(PA.name, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('choosePermanent');
    expect(forests(g, 0)).toHaveLength(6);
    expect(forests(g, 1)).toHaveLength(3);
    expect(g.find({ name: BEARS, zone: 'battlefield' })).toHaveLength(0);
  });
});
