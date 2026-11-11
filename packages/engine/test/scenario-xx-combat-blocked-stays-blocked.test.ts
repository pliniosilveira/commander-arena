// A creature stays blocked when its blockers leave, and creatures that leave combat stop dealing damage.
// Pins: CR 509.1h (Declare Blockers Step): a creature remains blocked even if all the creatures
// blocking it are removed from combat. CR 510.1c: a blocked creature with no creatures blocking it
// assigns no combat damage. CR 702.19d: a blocked trampler with no blockers left assigns all its
// damage to the player, planeswalker or battle it attacks. CR 506.4: a creature that leaves the
// battlefield is removed from combat, so it deals no combat damage; CR 510.1d: a blocker whose
// attacker is gone assigns no damage. CR 510.4 and 702.4b: a double striker blocked by nothing in the
// regular step deals nothing, it is still a blocked creature.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

const A3 = 'SYNTHETIC Vanilla 3/3';
const TR = 'SYNTHETIC Trampler 4/4';
const B2 = 'SYNTHETIC Vanilla 2/2';

type B = ReturnType<typeof scenario>;

/** Seat 0 attacks with `attacker`, seat 1 blocks with `blockers`; seat 0 holds a Bolt, seat 1 Unsummon. */
function blocked(attacker: string, blockers: string[], seat1?: (b: B) => void) {
  const b = scenario()
    .seat(0)
    .battlefield(attacker)
    .battlefield('Mountain')
    .hand('Lightning Bolt')
    .library('Island', { count: 3 })
    .seat(1);
  for (const name of blockers) b.battlefield(name);
  b.battlefield('Island').hand('Unsummon').library('Island', { count: 3 });
  seat1?.(b);
  const g = b.at('precombatMain', { active: 0 }).build();
  g.advanceTo('declareAttackers');
  g.act(0).attack(attacker);
  g.advanceTo('declareBlockers');
  g.act(1).declareBlockers(blockers.map((blocker) => ({ blocker, attacker })));
  return g;
}

describe('CR 509.1h: the blocker is removed before damage', () => {
  test('killed by an instant: a non-trampler stays blocked and deals no damage', () => {
    const g = blocked(A3, [B2]);
    g.act(0).cast('Lightning Bolt', { targets: [B2], pay: true });
    g.passAll();
    g.expect.zone(B2, 'graveyard', { seat: 1 });
    g.expect.combat({ attackers: [A3], blocked: [A3], unblocked: [] });
    const mark = g.mark();
    g.advanceTo('endOfCombat');
    g.expect.life(1, 40);
    g.expect.damage(A3, 0);
    g.expect.noEvent({ kind: 'damageDealt' }, { since: mark });
    g.expect.step('endOfCombat');
  });

  test('bounced by its controller (it left the battlefield): the same', () => {
    const g = blocked(A3, [B2]);
    g.act(0).pass();
    g.act(1).cast('Unsummon', { targets: [B2], pay: true });
    g.passAll();
    g.expect.zone(B2, 'hand', { seat: 1 });
    g.expect.combat({ blocked: [A3] });
    g.advanceTo('endOfCombat');
    g.expect.life(1, 40);
    g.expect.damage(A3, 0);
  });

  test('the re-entered card is a new object and is not blocking (CR 400.7)', () => {
    const g = blocked(A3, [B2]);
    g.act(0).pass();
    g.act(1).cast('Unsummon', { targets: [B2], pay: true });
    g.passAll();
    const d = g.state.combat;
    expect(d?.blocks).toHaveLength(1);
    // The recorded block names an object that no longer exists; nothing else blocks.
    expect(g.state.objects[d?.blocks[0]?.blocker ?? ('o0' as never)]).toBeUndefined();
  });

  test('a trampler with no blockers left assigns all 4 damage to the player (CR 702.19d)', () => {
    const g = blocked(TR, [B2]);
    g.act(0).cast('Lightning Bolt', { targets: [B2], pay: true });
    g.passAll();
    g.expect.combat({ blocked: [TR] });
    g.advanceTo('endOfCombat');
    g.expect.life(1, 36);
  });

  test('a creature blocked by two, one of which is removed: all its damage goes to the other', () => {
    const g = blocked(A3, [B2, 'SYNTHETIC Vanilla 5/5']);
    g.act(0).cast('Lightning Bolt', { targets: [B2], pay: true });
    g.passAll();
    g.expect.combat({ blocked: [A3] });
    // One blocker is left, so there is nothing to divide (CR 510.1c): no decision.
    g.advanceTo('endOfCombat');
    g.expect.damage('SYNTHETIC Vanilla 5/5', 3);
    g.expect.life(1, 40);
    // The remaining blocker still hit back: 5 damage kills the 3/3.
    g.expect.zone(A3, 'graveyard', { seat: 0 });
  });

  test('a double striker whose blocker died in the first step deals nothing in the regular step', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Fencing Ace')
      .seat(1)
      .battlefield('SYNTHETIC Vanilla 1/1')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('Fencing Ace');
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: 'SYNTHETIC Vanilla 1/1', attacker: 'Fencing Ace' }]);
    g.advanceTo('firstStrikeDamage');
    g.expect.zone('SYNTHETIC Vanilla 1/1', 'graveyard', { seat: 1 });
    g.expect.combat({ blocked: ['Fencing Ace'] });
    const mark = g.mark();
    g.advanceTo('endOfCombat');
    g.expect.life(1, 40);
    g.expect.noEvent({ kind: 'damageDealt' }, { since: mark });
  });
});

describe('CR 506.4, 510.1d: an attacker that leaves combat stops fighting', () => {
  test('an attacker killed before damage deals no damage and its blocker takes none', () => {
    const g = blocked(A3, [B2], (b) => b.battlefield('Mountain').hand('Lightning Bolt'));
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [A3], pay: true });
    g.passAll();
    g.expect.zone(A3, 'graveyard', { seat: 0 });
    const mark = g.mark();
    g.advanceTo('endOfCombat');
    g.expect.damage(B2, 0);
    g.expect.noEvent({ kind: 'damageDealt' }, { since: mark });
  });

  test('the combat has no attackers left, and the damage step is still passed through', () => {
    const g = blocked(A3, [B2], (b) => b.battlefield('Mountain').hand('Lightning Bolt'));
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [A3], pay: true });
    g.passAll();
    g.advanceTo('combatDamage');
    g.expect.step('combatDamage');
    g.expect.life(0, 40);
    g.expect.life(1, 40);
  });
});
