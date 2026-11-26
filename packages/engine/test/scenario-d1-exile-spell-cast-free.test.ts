// "When this creature enters, exile target spell an opponent controls. Whenever this creature attacks, if a card is exiled with it, you may cast the exiled card without paying its mana
// cost." (Smirking Spelljacker): an `exile` with `linked` of a spell on the stack, and a `castFree` of the `linkedExile` behind an intervening "if" of the cards exiled with the source.
// Pins: CR 406.1 and 608.2b (a spell that is exiled does not resolve), CR 607.2a (linked abilities: the card exiled with this creature), CR 603.4 (intervening "if": read as it triggers and as
// it resolves), CR 608.2g and 118.9 (cast without paying its mana cost), CR 400.7 (a card in a new zone is a new object). Played with three seats.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-d1.ts) or fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const HIJACKER = 'SYNTHETIC Spell Hijacker';
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const BOLT = 'Lightning Bolt';

test('the card is valid', () => {
  expect(validateCard(syntheticCard(HIJACKER))).toEqual([]);
});

/** Seat 1 has the turn (turn 2) and casts the Bears; seat 0 flashes in the Hijacker in response; seat 2 does nothing. */
function board(second = false) {
  const g = scenario({ seats: 3 })
    .seat(0)
    .life(20)
    .hand(HIJACKER)
    .battlefield('Island', { count: 3 })
    .library('Island', { count: 6 })
    .seat(1)
    .life(20)
    .hand(BEARS, ANGEL)
    .battlefield('Forest', { count: 2 })
    .library('Forest', { count: 6 })
    .seat(2)
    .life(20)
    .hand(BOLT)
    .battlefield('Mountain')
    .library('Forest', { count: 6 })
    .at('precombatMain', { active: 1, turn: 2 })
    .build();
  g.act(1).cast(BEARS, { pay: true });
  g.act(1).pass();
  if (second) {
    g.act(2).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.act(2).pass();
  } else g.act(2).pass();
  g.act(0).cast(HIJACKER, { pay: true });
  return g;
}

describe('exile target spell an opponent controls (CR 406.1, 608.2b)', () => {
  test('the spell is exiled, does not resolve, and is exiled with the creature', () => {
    const g = board();
    // The Hijacker resolves; its enters trigger has one legal target, which is chosen for it, and resolves too.
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.noObject(BEARS, { zone: 'battlefield' });
    g.expect.zone(HIJACKER, 'battlefield', { seat: 0 });
    // The card is the one exiled with the creature.
    const hijacker = g.object({ name: HIJACKER, zone: 'battlefield' });
    expect(hijacker.linkedExile).toEqual([g.id({ name: BEARS, zone: 'exile' })]);
  });

  test('with two spells of two opponents the controller chooses, and the other resolves', () => {
    const g = board(true);
    g.passAll();
    g.expect.pending('targets', 0);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('no targets');
    expect(d.specs[0]?.legal).toHaveLength(2);
    g.act(0).chooseTargets({ name: BOLT, zone: 'stack' });
    g.passAll();
    g.expect.zone(BOLT, 'exile', { seat: 2 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.life(0, 20);
  });
});

describe('whenever it attacks, if a card is exiled with it, cast the exiled card for free (CR 608.2g)', () => {
  /** The Bears are exiled with the Hijacker; it is seat 0's turn 4 and the Hijacker is ready to attack. */
  function attacking() {
    const g = board();
    g.passAll();
    g.advanceTo('declareAttackers', { turn: 4, attack: false });
    return g;
  }

  test('it triggers and the card is cast without paying, then resolves', () => {
    const g = attacking();
    g.act(0).declareAttackers([{ attacker: { name: HIJACKER, seat: 0 }, target: { player: 1 } }]);
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseCards');
    g.act(0).chooseCards({ name: BEARS, zone: 'exile', seat: 1 });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('the player may decline, and the card stays exiled with the creature', () => {
    const g = attacking();
    g.act(0).declareAttackers([{ attacker: { name: HIJACKER, seat: 0 }, target: { player: 1 } }]);
    g.passAll();
    g.act(0).chooseCards();
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
  });

  test('without a card exiled with it there is no trigger', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .life(20)
      .battlefield(HIJACKER)
      .seat(1)
      .life(20)
      .seat(2)
      .life(20)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: { name: HIJACKER, seat: 0 }, target: { player: 1 } }]);
    expect(g.state.stack).toHaveLength(0);
  });
});
