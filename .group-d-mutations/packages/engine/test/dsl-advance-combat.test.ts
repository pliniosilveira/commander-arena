// advanceTo and passAll meet the combat decisions (CR 508.1, 509.1). advanceTo is a "walk the turn"
// helper: it answers declareAttackers with no attackers and declareBlockers with no blocks, and
// stops with a clear error when told not to (attack: false, block: false) or at any other decision.
import { describe, expect, test } from 'vitest';
import { scenario } from './dsl-helpers';

/** Seat 0 has a Grizzly Bears that can attack; seat 1 has one that can block. */
function bearsGame() {
  return scenario()
    .seat(0)
    .battlefield('Grizzly Bears')
    .library('Island', { count: 5 })
    .seat(1)
    .battlefield('Grizzly Bears')
    .library('Island', { count: 5 })
    .at('precombatMain', { active: 0 })
    .build();
}

describe('advanceTo answers the combat decisions by default', () => {
  test('walks through a combat where a creature could attack: nobody attacks (CR 508.8)', () => {
    const g = bearsGame();
    g.advanceTo('postcombatMain');
    g.expect.step('postcombatMain', { active: 0, turn: 3 });
    g.expect.combat(null);
    g.expect.life(1, 40);
    g.expect.tapped('Grizzly Bears[0]', false);
    // The declare attackers decision was asked and answered with an empty declaration.
    expect(
      g.log.some((l) => l.action.kind === 'declareAttackers' && l.action.attacks.length === 0),
    ).toBe(true);
    expect(g.log.some((l) => l.action.kind === 'declareBlockers')).toBe(false);
  });

  test('walks into the next turn, where seat 1 has attackers of its own', () => {
    const g = bearsGame();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('postcombatMain');
    g.expect.step('postcombatMain', { active: 1, turn: 4 });
    expect(g.log.filter((l) => l.action.kind === 'declareAttackers').map((l) => l.seat)).toEqual([
      0, 1,
    ]);
  });

  test('after an explicit attack it answers the blockers decision with no blocks', () => {
    const g = bearsGame();
    g.advanceTo('declareAttackers');
    g.act(0).attack('Grizzly Bears');
    g.advanceTo('postcombatMain');
    g.expect.life(1, 38);
    expect(g.log.find((l) => l.action.kind === 'declareBlockers')?.seat).toBe(1);
  });

  test('advanceTo the declare attackers step stops at the decision without answering it', () => {
    const g = bearsGame();
    g.advanceTo('declareAttackers');
    g.expect.step('declareAttackers', { active: 0 });
    g.expect.pending('declareAttackers', 0);
    expect(g.log.some((l) => l.action.kind === 'declareAttackers')).toBe(false);
  });

  test('advanceTo the declare blockers step stops at the decision without answering it', () => {
    const g = bearsGame();
    g.advanceTo('declareAttackers');
    g.act(0).attack('Grizzly Bears');
    g.advanceTo('declareBlockers');
    g.expect.pending('declareBlockers', 1);
  });
});

describe('advanceTo stops, and says why, when told not to answer', () => {
  test('attack: false stops at the declareAttackers decision', () => {
    const g = bearsGame();
    expect(() => g.advanceTo('postcombatMain', { attack: false })).toThrow(
      /advanceTo\(postcombatMain\) stopped in the declareAttackers step: declareAttackers decision for seat 0 must be answered first/,
    );
    g.expect.pending('declareAttackers', 0);
  });

  test('block: false stops at the declareBlockers decision, after the attack was declared', () => {
    const g = bearsGame();
    g.advanceTo('declareAttackers');
    g.act(0).attack('Grizzly Bears');
    expect(() => g.advanceTo('postcombatMain', { block: false })).toThrow(
      /stopped in the declareBlockers step: declareBlockers decision for seat 1 must be answered first/,
    );
    g.expect.pending('declareBlockers', 1);
  });

  test('block: false does not turn off the attackers answer, and attack: false not the blockers one', () => {
    const g = bearsGame();
    g.advanceTo('declareAttackers');
    g.act(0).attack('Grizzly Bears');
    g.advanceTo('postcombatMain', { attack: false });
    g.expect.step('postcombatMain');
    const h = bearsGame();
    expect(() => h.advanceTo('postcombatMain', { block: false, attack: true })).not.toThrow();
  });

  test('a damage assignment is never answered for you: the walk stops there', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 3/3')
      .seat(1)
      .battlefield('SYNTHETIC Vanilla 2/2', { count: 2 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Vanilla 3/3');
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([
      { blocker: 'SYNTHETIC Vanilla 2/2[0]', attacker: 'SYNTHETIC Vanilla 3/3' },
      { blocker: 'SYNTHETIC Vanilla 2/2[1]', attacker: 'SYNTHETIC Vanilla 3/3' },
    ]);
    expect(() => g.advanceTo('postcombatMain')).toThrow(
      /assignDamage decision for seat 0 must be answered first/,
    );
  });
});

describe('passAll at the combat decisions', () => {
  test('passAll from the beginning of combat stops, without error, at the declareAttackers decision', () => {
    const g = bearsGame();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.step('declareAttackers');
    g.expect.pending('declareAttackers', 0);
    const before = g.hash();
    g.passAll(); // nothing to pass: the decision is not priority
    g.expect.hash(before);
  });
});
