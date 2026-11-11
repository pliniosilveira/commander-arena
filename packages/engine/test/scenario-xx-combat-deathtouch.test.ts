// Deathtouch and indestructible in combat.
// Pins: CR 702.2b (Deathtouch) and CR 704.5h (State-Based Actions): a creature with toughness greater
// than 0 that was dealt damage by a deathtouch source is destroyed, whatever its toughness; CR 704.5g:
// lethal damage destroys a creature. CR 702.12b (Indestructible): an indestructible permanent can't
// be destroyed, so neither lethal damage nor deathtouch damage destroys it. CR 120.3e: damage stays
// marked on it until cleanup (CR 514.2), which removes damage and the deathtouch mark with it.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

const RATS = 'Typhoid Rats';
const BIG = 'SYNTHETIC Vanilla 5/5';
const WALL = 'Wall of Stone';
const IND = 'SYNTHETIC Indestructible 2/2';

function fight(attacker: string, blocker: string) {
  const g = scenario()
    .seat(0)
    .battlefield(attacker)
    .library('Island', { count: 4 })
    .seat(1)
    .battlefield(blocker)
    .library('Island', { count: 4 })
    .at('precombatMain', { active: 0 })
    .build();
  g.advanceTo('declareAttackers');
  g.act(0).attack(attacker);
  g.advanceTo('declareBlockers');
  g.act(1).declareBlockers([{ blocker, attacker }]);
  g.advanceTo('endOfCombat');
  return g;
}

describe('deathtouch destroys whatever its toughness (CR 702.2b, 704.5h)', () => {
  test('Typhoid Rats blocking a 5/5: both die, the 5/5 with a single damage on it', () => {
    const g = fight(BIG, RATS);
    g.expect.zone(BIG, 'graveyard', { seat: 0 });
    g.expect.zone(RATS, 'graveyard', { seat: 1 });
  });

  test('Typhoid Rats attacking into a 0/8 Wall: the Wall dies, the Rats take no damage', () => {
    const g = fight(RATS, WALL);
    g.expect.zone(WALL, 'graveyard', { seat: 1 });
    g.expect.zone(RATS, 'battlefield', { seat: 0 });
    g.expect.damage(RATS, 0);
  });

  test('without deathtouch the same 1 damage does nothing to the Wall', () => {
    const g = fight('SYNTHETIC Vanilla 1/1', WALL);
    g.expect.zone(WALL, 'battlefield', { seat: 1 });
    g.expect.damage(WALL, 1);
  });
});

describe('indestructible survives lethal damage and deathtouch (CR 702.12b)', () => {
  test('an indestructible 2/2 blocks a 5/5: it takes 5 damage and stays on the battlefield', () => {
    const g = fight(BIG, IND);
    g.expect.zone(IND, 'battlefield', { seat: 1 });
    g.expect.damage(IND, 5);
    // It dealt its 2 damage to the attacker, which survives.
    g.expect.damage(BIG, 2);
  });

  test('an indestructible attacker survives deathtouch damage and kills the Rats', () => {
    const g = fight(IND, RATS);
    g.expect.zone(IND, 'battlefield', { seat: 0 });
    g.expect.zone(RATS, 'graveyard', { seat: 1 });
    g.expect.damage(IND, 1);
  });

  test('indestructible takes deathtouch damage from Typhoid Rats and the 5/5 together: still alive', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RATS)
      .battlefield(BIG)
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield(IND)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([RATS, BIG]);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: IND, attacker: RATS }]);
    g.advanceTo('endOfCombat');
    g.expect.zone(IND, 'battlefield', { seat: 1 });
    g.expect.life(1, 35);
  });

  test('damage and the deathtouch mark are removed in cleanup, and the creature is still there', () => {
    const g = fight(RATS, IND);
    g.expect.damage(IND, 1);
    expect(g.object(IND).damagedByDeathtouch).toBe(true);
    g.advanceTo('upkeep', { turn: 5 });
    g.expect.zone(IND, 'battlefield', { seat: 1 });
    g.expect.damage(IND, 0);
    expect(g.object(IND).damagedByDeathtouch).toBe(false);
  });

  test('a non-indestructible creature is destroyed by the same damage', () => {
    const g = fight(BIG, 'SYNTHETIC Vanilla 2/2');
    g.expect.zone('SYNTHETIC Vanilla 2/2', 'graveyard', { seat: 1 });
  });
});

describe('damage is removed in cleanup (CR 514.2)', () => {
  test('a creature that survived combat with damage heals at the end of turn, not before', () => {
    const g = fight(BIG, 'SYNTHETIC Vanilla 5/5');
    g.expect.zone('SYNTHETIC Vanilla 5/5', 'graveyard', { count: 2 });
    const h = fight('SYNTHETIC Vanilla 3/3', 'SYNTHETIC Vanilla 5/5');
    h.advanceTo('postcombatMain');
    h.expect.damage({ name: 'SYNTHETIC Vanilla 5/5', zone: 'battlefield' }, 3);
    h.advanceTo('end');
    h.expect.damage({ name: 'SYNTHETIC Vanilla 5/5', zone: 'battlefield' }, 3);
    h.advanceTo('upkeep', { turn: 5 });
    h.expect.damage({ name: 'SYNTHETIC Vanilla 5/5', zone: 'battlefield' }, 0);
  });
});
