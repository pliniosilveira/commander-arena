// An attacked planeswalker or battle leaves the battlefield during combat.
// Pins: CR 506.4c (Combat Phase): if a creature is attacking a planeswalker or battle and that
// permanent is removed from combat, the creature stays an attacking creature though it is not
// attacking any player, planeswalker or battle. It may be blocked. If it is unblocked, it deals no
// combat damage. CR 510.1b: an unblocked creature that isn't attacking anything assigns no damage.
// CR 508.5: the defending player of a creature that is no longer attacking is the controller of the
// planeswalker (or the protector of the battle) it was attacking, so that player may block it
// (CR 509.1a). CR 509.1h: a blocked creature stays blocked even if its blockers leave.
// CR 702.19f: a creature attacking a planeswalker that is not "trample over planeswalkers" cannot
// assign any of its combat damage to the defending player, even if the planeswalker was removed.
// CR 702.19d is about a trampler with no blockers left: its damage goes to the player "and/or
// planeswalker" it attacks; with nothing attacked (702.19e/f) there is no recipient.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

const PW = 'SYNTHETIC Vanilla Planeswalker';
const BATTLE = 'SYNTHETIC Vanilla Battle';
const ATTACKER = 'SYNTHETIC Vanilla 3/3';
const TRAMPLER = 'SYNTHETIC Trampler 4/4';
const BLOCKER = 'SYNTHETIC Vanilla 2/2';

type Kind = 'planeswalker' | 'battle';

/** Seat 0 attacks `attacker` at the permanent; two Bolts and two Mountains wait to remove things. */
function position(kind: Kind, attacker: string) {
  const b = scenario()
    .seat(0)
    .battlefield(attacker)
    .battlefield('Mountain', { count: 2 })
    .hand('Lightning Bolt', { count: 2 })
    .library('Island', { count: 3 });
  if (kind === 'battle') {
    // Controlled by seat 0, protected by seat 1 (CR 310.9); 3 defense so one Bolt removes it.
    b.battlefield(BATTLE, { counters: { defense: 3 } });
  }
  b.seat(1).battlefield(BLOCKER).library('Island', { count: 3 });
  if (kind === 'planeswalker') b.battlefield(PW, { counters: { loyalty: 3 } });
  const g = b.at('precombatMain', { active: 0 }).build();
  const target = kind === 'planeswalker' ? PW : BATTLE;
  g.advanceTo('declareAttackers');
  g.act(0).attack(attacker, target);
  return { g, target };
}

function bolt(g: ReturnType<typeof position>['g'], at: string) {
  g.act(0).cast('Lightning Bolt[0]', { targets: [at], pay: true });
  g.passAll();
}

describe.each<Kind>(['planeswalker', 'battle'])(
  'the attacked %s is removed before blockers',
  (kind) => {
    test('the attacker stays in combat and its defender is offered it to block (CR 506.4c, 508.5)', () => {
      const { g, target } = position(kind, ATTACKER);
      bolt(g, target);
      g.expect.noObject(target, { zone: 'battlefield' });
      g.expect.combat({ attackers: [ATTACKER] });
      g.passAll();
      g.expect.step('declareBlockers');
      g.expect.pending('declareBlockers', 1);
      const d = g.state.pending;
      if (d?.kind !== 'declareBlockers') throw new Error('expected declareBlockers');
      expect(d.attackers.map((a) => a.attacker)).toEqual([g.id(ATTACKER)]);
      expect(d.candidates).toEqual([{ blocker: g.id(BLOCKER), canBlock: [g.id(ATTACKER)] }]);
      g.expect.canBlock(BLOCKER, ATTACKER);
    });

    test('the defender may block it, and the blocker deals and takes damage normally', () => {
      const { g, target } = position(kind, ATTACKER);
      bolt(g, target);
      g.passAll();
      g.act(1).declareBlockers([{ blocker: BLOCKER, attacker: ATTACKER }]);
      g.expect.combat({ blocked: [ATTACKER] });
      g.advanceTo('endOfCombat');
      g.expect.zone(BLOCKER, 'graveyard', { seat: 1 });
      g.expect.damage(ATTACKER, 2);
      g.expect.life(1, 40);
    });

    test('unblocked, it deals no combat damage to anyone (CR 510.1b)', () => {
      const { g, target } = position(kind, ATTACKER);
      bolt(g, target);
      g.passAll();
      g.act(1).noBlocks();
      g.expect.combat({ unblocked: [ATTACKER] });
      const mark = g.mark();
      g.advanceTo('endOfCombat');
      g.expect.life(1, 40);
      g.expect.life(0, 40);
      g.expect.noEvent({ kind: 'damageDealt' }, { since: mark });
      g.expect.damage(BLOCKER, 0);
      g.expect.zone(ATTACKER, 'battlefield', { seat: 0 });
    });

    test('an unblocked trampler is attacking nothing, so it deals nothing to the player', () => {
      const { g, target } = position(kind, TRAMPLER);
      bolt(g, target);
      g.passAll();
      g.act(1).noBlocks();
      const mark = g.mark();
      g.advanceTo('endOfCombat');
      g.expect.life(1, 40);
      g.expect.noEvent({ kind: 'damageDealt' }, { since: mark });
    });

    test('a trampler blocked by a creature must put all its damage on the blocker: no excess to the player (CR 702.19f)', () => {
      const { g, target } = position(kind, TRAMPLER);
      bolt(g, target);
      g.passAll();
      g.act(1).declareBlockers([{ blocker: BLOCKER, attacker: TRAMPLER }]);
      g.passAll();
      g.expect.pending('assignDamage', 0);
      const before = g.hash();
      g.expect.illegal(0, {
        assignDamage: [
          { from: TRAMPLER, to: BLOCKER, amount: 2 },
          { from: TRAMPLER, to: { player: 1 }, amount: 2 },
        ],
      });
      g.expect.hash(before);
      g.act(0).assignDamage([{ from: TRAMPLER, to: BLOCKER, amount: 4 }]);
      g.expect.zone(BLOCKER, 'graveyard', { seat: 1 });
      g.expect.life(1, 40);
    });

    test('a trampler blocked by nothing (blocker gone too) assigns nothing: it attacks no player (CR 702.19d, 702.19f)', () => {
      const { g, target } = position(kind, TRAMPLER);
      g.passAll();
      g.act(1).declareBlockers([{ blocker: BLOCKER, attacker: TRAMPLER }]);
      // Seat 0 removes the attacked permanent and then the blocker, in the declare blockers step.
      bolt(g, target);
      bolt(g, BLOCKER);
      g.expect.zone(BLOCKER, 'graveyard', { seat: 1 });
      g.expect.noObject(target, { zone: 'battlefield' });
      g.expect.combat({ blocked: [TRAMPLER] });
      const mark = g.mark();
      g.advanceTo('endOfCombat');
      g.expect.noEvent({ kind: 'damageDealt' }, { since: mark });
      g.expect.life(1, 40);
    });
  },
);

describe.each<Kind>(['planeswalker', 'battle'])(
  'the attacked %s is removed after blockers are declared',
  (kind) => {
    test('the attacker stays blocked and its damage goes to its blocker (CR 509.1h)', () => {
      const { g, target } = position(kind, ATTACKER);
      g.passAll();
      g.act(1).declareBlockers([{ blocker: BLOCKER, attacker: ATTACKER }]);
      bolt(g, target);
      g.expect.noObject(target, { zone: 'battlefield' });
      g.expect.combat({ attackers: [ATTACKER], blocked: [ATTACKER], unblocked: [] });
      g.advanceTo('endOfCombat');
      g.expect.zone(BLOCKER, 'graveyard', { seat: 1 });
      g.expect.damage(ATTACKER, 2);
      g.expect.life(1, 40);
    });
  },
);

describe('what the engine does for a trampler whose attacked permanent left (reported to the lead)', () => {
  test('it never assigns to the player: CR 702.19f applies to every creature but one with trample over planeswalkers', () => {
    // The text of 702.19d says the damage goes to "the defending player and/or planeswalker", but
    // 702.19f says a creature attacking a planeswalker can't assign damage to the defending player
    // even once the planeswalker is removed; only trample over planeswalkers (702.19e) may. The
    // engine has no "trample over planeswalkers", so the player never receives that damage.
    const { g, target } = position('planeswalker', TRAMPLER);
    bolt(g, target);
    g.passAll();
    g.act(1).noBlocks();
    g.advanceTo('endOfCombat');
    g.expect.life(1, 40);
  });
});
