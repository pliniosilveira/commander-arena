// Which combat steps happen.
// Pins: CR 508.8 (Declare Attackers Step): if no creatures are declared as attackers, skip the declare
// blockers and combat damage steps. CR 508.2 and 511.1: players still receive priority in the declare
// attackers and end of combat steps (and the beginning of combat step, CR 507.2), as the engine's
// flow does. CR 509.1: with attackers declared the declare blockers step happens even if no creature
// can block, and the active player gets priority in it (CR 509.2). CR 510.4: the first-strike step
// exists only when needed. CR 511.3: combat ends at the end of combat step.
import { describe, expect, test } from 'vitest';
import type { StepId } from '../src/index';
import { scenario } from '../src/testing/index';

/** The steps that began since `mark`, in order. */
function stepsSince(g: ReturnType<ReturnType<typeof scenario>['build']>, mark: number): StepId[] {
  return g
    .eventsSince(mark)
    .flatMap((e) => (e.kind === 'stepBegan' && e.seat === 0 ? [e.step] : []));
}

function game(seat0: (b: ReturnType<typeof scenario>) => void) {
  const b = scenario().seat(0).library('Island', { count: 3 });
  seat0(b);
  return b.seat(1).library('Island', { count: 3 }).at('precombatMain', { active: 0 }).build();
}

describe('CR 508.8: nobody attacks', () => {
  test('declaring no attackers skips the declare blockers and combat damage steps', () => {
    const g = game((b) => b.battlefield('Grizzly Bears'));
    const mark = g.mark();
    g.advanceTo('declareAttackers');
    g.expect.pending('declareAttackers', 0);
    g.act(0).noAttackers();
    g.advanceTo('postcombatMain');
    expect(stepsSince(g, mark)).toEqual([
      'beginningOfCombat',
      'declareAttackers',
      'endOfCombat',
      'postcombatMain',
    ]);
  });

  test('the declare attackers step still gives priority after an empty declaration', () => {
    const g = game((b) => b.battlefield('Grizzly Bears'));
    g.advanceTo('declareAttackers');
    g.act(0).noAttackers();
    g.expect.step('declareAttackers');
    g.expect.pending('priority', 0);
    g.expect.combat(null);
    // The opponent gets priority too, then the end of combat step begins.
    g.act(0).pass();
    g.expect.pending('priority', 1);
    g.act(1).pass();
    g.expect.step('endOfCombat');
    g.expect.pending('priority', 0);
  });

  test('when no creature can attack there is no decision, but priority is given in the step', () => {
    const g = game((b) => b.battlefield('Grizzly Bears', { tapped: true }));
    const mark = g.mark();
    g.advanceTo('declareAttackers');
    g.expect.step('declareAttackers');
    g.expect.pending('priority', 0);
    g.advanceTo('postcombatMain');
    expect(stepsSince(g, mark)).toEqual([
      'beginningOfCombat',
      'declareAttackers',
      'endOfCombat',
      'postcombatMain',
    ]);
    expect(g.log.some((l) => l.action.kind === 'declareAttackers')).toBe(false);
  });

  test('a player with no creatures at all: the same four steps', () => {
    const g = game(() => {});
    const mark = g.mark();
    g.advanceTo('postcombatMain');
    expect(stepsSince(g, mark)).toEqual([
      'beginningOfCombat',
      'declareAttackers',
      'endOfCombat',
      'postcombatMain',
    ]);
  });

  test('a first striker that does not attack adds no first-strike step', () => {
    const g = game((b) => b.battlefield('Youthful Knight'));
    const mark = g.mark();
    g.advanceTo('declareAttackers');
    g.act(0).noAttackers();
    g.advanceTo('postcombatMain');
    expect(stepsSince(g, mark)).not.toContain('firstStrikeDamage');
    expect(stepsSince(g, mark)).not.toContain('combatDamage');
  });

  test('spells can still be cast in the declare attackers step (it gives priority)', () => {
    const g = game((b) => b.battlefield('Mountain').hand('Lightning Bolt'));
    g.advanceTo('declareAttackers');
    g.expect.step('declareAttackers');
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.step('declareAttackers');
  });
});

describe('CR 509.1: attackers declared', () => {
  test('the declare blockers step happens even if nobody can block, with priority, then damage', () => {
    const g = game((b) => b.battlefield('SYNTHETIC Vanilla 3/3'));
    const mark = g.mark();
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Vanilla 3/3');
    g.advanceTo('endOfCombat');
    expect(stepsSince(g, mark)).toEqual([
      'beginningOfCombat',
      'declareAttackers',
      'declareBlockers',
      'combatDamage',
      'endOfCombat',
    ]);
    g.expect.life(1, 37);
    // No declareBlockers decision was asked: nobody could block.
    expect(g.log.some((l) => l.action.kind === 'declareBlockers')).toBe(false);
  });

  test('the declare blockers step gives priority to the active player first (CR 509.2)', () => {
    const g = game((b) => b.battlefield('SYNTHETIC Vanilla 3/3'));
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Vanilla 3/3');
    g.advanceTo('declareBlockers');
    g.expect.step('declareBlockers');
    g.expect.pending('priority', 0);
  });

  test('with a blocker the defending seat decides first, then the active seat gets priority', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 3/3')
      .seat(1)
      .battlefield('SYNTHETIC Vanilla 2/2')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Vanilla 3/3');
    g.advanceTo('declareBlockers');
    g.expect.pending('declareBlockers', 1);
    g.act(1).noBlocks();
    g.expect.pending('priority', 0);
  });

  test('without first or double strike the first-strike step is not part of the steps', () => {
    const g = game((b) => b.battlefield('SYNTHETIC Vanilla 3/3'));
    const mark = g.mark();
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Vanilla 3/3');
    g.advanceTo('endOfCombat');
    expect(stepsSince(g, mark)).not.toContain('firstStrikeDamage');
  });

  test('with a first striker attacking, the first-strike step comes between blockers and damage', () => {
    const g = game((b) => b.battlefield('Youthful Knight'));
    const mark = g.mark();
    g.advanceTo('declareAttackers');
    g.act(0).attack('Youthful Knight');
    g.advanceTo('endOfCombat');
    expect(stepsSince(g, mark)).toEqual([
      'beginningOfCombat',
      'declareAttackers',
      'declareBlockers',
      'firstStrikeDamage',
      'combatDamage',
      'endOfCombat',
    ]);
    g.expect.life(1, 38);
  });

  test('all steps give priority and mana empties between them (CR 500.5)', () => {
    const g = game((b) => b.battlefield('SYNTHETIC Vanilla 3/3').battlefield('Forest'));
    g.act(0).tapForMana('Forest');
    g.expect.pool(0, 'G');
    g.advanceTo('declareAttackers');
    g.expect.pool(0, '');
  });
});

describe('CR 511.3: the end of combat step', () => {
  test('the combat state is cleared as the end of combat step ends, and damage stays', () => {
    const g = game((b) => b.battlefield('SYNTHETIC Vanilla 3/3'));
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Vanilla 3/3');
    g.advanceTo('endOfCombat');
    g.expect.combat({ attackers: ['SYNTHETIC Vanilla 3/3'] });
    g.advanceTo('postcombatMain');
    g.expect.combat(null);
    expect(g.state.combat).toBeNull();
    g.expect.tapped('SYNTHETIC Vanilla 3/3');
    g.expect.life(1, 37);
  });
});
