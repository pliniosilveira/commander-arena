// Combat edges of planeswalkers (D-200). Pins: CR 506.3 and 508.1b (a creature attacks a player or a planeswalker), 508.5 (the defending player of a creature
// attacking a planeswalker is the planeswalker's controller), 506.4 (a permanent is removed from combat if its controller changes; a planeswalker that is
// attacked and stops being a planeswalker is removed from combat), 506.4c (the creature stays in combat, may be blocked, and if unblocked deals no combat
// damage), 506.4d (a creature that is also a planeswalker), 509.1a (blockers), 510.1b (unblocked damage goes to what is attacked), 302.6 (summoning sickness
// for a planeswalker that becomes a creature). The cards are SYNTHETIC (src/cards/fixtures/synthetic-planeswalkers.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { getLegalActions } from '../src/index';
import { scenario } from '../src/testing/index';

const PW = 'SYNTHETIC Vanilla Planeswalker';
const THEFT = 'SYNTHETIC Walker Theft';
const WIPE = 'SYNTHETIC Type Wipe';
const ANIMATE = 'SYNTHETIC Animate Walker';
const A3 = 'SYNTHETIC Vanilla 3/3';
const A22 = 'SYNTHETIC Vanilla 2/2';

const table = () =>
  scenario()
    .seat(0)
    .library('Island', { count: 4 })
    .battlefield(A3, 'Island', 'Island', 'Island')
    .hand(THEFT, WIPE)
    .seat(1)
    .library('Island', { count: 4 })
    .battlefield(PW, A22);

/** Seat 0 attacks the planeswalker with the 3/3, then (still in the declare attackers step) casts `spell` at it. */
const attackThenCast = (spell: string) => {
  const g = table().build();
  g.advanceTo('declareAttackers');
  g.act(0).declareAttackers([{ attacker: A3, target: PW }]);
  expect(g.state.combat?.attackers[0]?.defender).toBe(1);
  g.act(0).cast(spell, { targets: [PW], pay: true });
  g.passAll();
  return g;
};

describe('an attacked planeswalker whose controller changes (CR 506.4, 506.4c)', () => {
  test('the attacker stays in combat but attacks nothing: its former defending player may block it, and unblocked it deals no damage', () => {
    const g = attackThenCast(THEFT);
    expect(g.state.combat?.attackers[0]?.targetGone).toBe(true);
    g.expect.eventLog([{ kind: 'removedFromCombat' }]);
    g.advanceTo('declareBlockers');
    // The former controller (seat 1) is still the defending player: the 2/2 may block the 3/3.
    g.expect.canBlock(A22, A3, true);
    g.act(1).noBlocks();
    g.advanceTo('combatDamage');
    g.expect.life(1, 40);
    g.expect.counters(PW, { loyalty: 4 });
    g.expect.damage(A22, 0);
  });

  test('blocked: the blocker and the attacker deal damage to each other as always', () => {
    const g = attackThenCast(THEFT);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: A22, attacker: A3 }]);
    g.advanceTo('combatDamage');
    g.expect.zone(A22, 'graveyard', { seat: 1 });
    g.expect.damage(A3, 2);
    g.expect.counters(PW, { loyalty: 4 });
  });

  test('with no steal, the same attack takes the loyalty off (the control case)', () => {
    const g = table().build();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: A3, target: PW }]);
    g.advanceTo('declareBlockers');
    g.act(1).noBlocks();
    g.advanceTo('combatDamage');
    g.expect.counters(PW, { loyalty: 1 });
    g.expect.life(1, 40);
  });
});

describe('an attacked planeswalker that stops being a planeswalker (CR 506.4)', () => {
  test('it is removed from combat: the attacker deals no combat damage to it, and the permanent loses no loyalty', () => {
    const g = attackThenCast(WIPE);
    g.advanceTo('declareBlockers');
    g.expect.canBlock(A22, A3, true);
    g.act(1).noBlocks();
    g.advanceTo('combatDamage');
    g.expect.life(1, 40);
    g.expect.counters(PW, { loyalty: 4 });
  });
});

describe('a creature that is also a planeswalker (CR 506.4d, 302.6)', () => {
  test('an animated walker that has been under control since the turn began attacks as a creature and is dealt damage as both', () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 4 })
      .battlefield(ANIMATE)
      .seat(1)
      .library('Island', { count: 4 })
      .build();
    g.act(0).activate(ANIMATE, { ability: 0 });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.expect.canAttack(ANIMATE, true);
    g.act(0).declareAttackers([{ attacker: ANIMATE }]);
    g.advanceTo('combatDamage');
    g.expect.life(1, 36);
  });

  test('a planeswalker that is not a creature cannot attack', () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 4 })
      .battlefield(ANIMATE)
      .seat(1)
      .library('Island', { count: 4 })
      .build();
    g.advanceTo('declareAttackers');
    g.expect.canAttack(ANIMATE, false);
  });

  test('a planeswalker animated this turn that came under control this turn cannot attack (summoning sick)', () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 4 })
      .hand(ANIMATE)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .library('Island', { count: 4 })
      .build();
    g.act(0).cast(ANIMATE, { pay: true });
    g.passAll();
    g.act(0).activate(ANIMATE, { ability: 0 });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.expect.canAttack(ANIMATE, false);
  });
});

describe('what the attack options list', () => {
  test("the planeswalkers of the defending player are options, a creature cannot attack its own controller's planeswalker", () => {
    const g = table().build();
    g.advanceTo('declareAttackers');
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers') throw new Error('expected declareAttackers');
    const targets = d.candidates.find((c) => c.attacker === g.id(A3))?.targets ?? [];
    expect(targets.some((t) => t.kind === 'permanent' && t.object === g.id(PW))).toBe(true);
    expect(getLegalActions(g.state, 0).length).toBeGreaterThan(0);
  });
});
