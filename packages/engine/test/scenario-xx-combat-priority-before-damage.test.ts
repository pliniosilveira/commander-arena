// Priority between declaring blockers and combat damage (playtest issue 35).
// Pins: CR 509.2 (Declare Blockers Step): the active player gets priority after blockers are
// declared; CR 117.3d: then the next player in turn order; CR 117.4: the step ends only when all
// players pass in succession with an empty stack, so combat damage (CR 510.1) cannot happen before
// the defending player has had priority, and an ability activated in that window resolves first.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

function game() {
  return scenario()
    .seat(0)
    .battlefield('Grizzly Bears')
    .seat(1)
    .battlefield('Grizzly Bears')
    .at('precombatMain', { active: 0 })
    .build();
}

describe('priority after blockers are declared', () => {
  test('both players get priority in the step before any combat damage is dealt', () => {
    const g = game();
    g.advanceTo('declareAttackers');
    g.act(0).attack('Grizzly Bears');
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: 'Grizzly Bears', attacker: 'Grizzly Bears' }]);
    const mark = g.mark();
    g.expect.step('declareBlockers');
    g.expect.pending('priority', 0);
    g.act(0).pass();
    // The defender, who just blocked, is asked before the damage step begins.
    g.expect.step('declareBlockers');
    g.expect.pending('priority', 1);
    expect(g.eventsSince(mark).some((e) => e.kind === 'damageDealt')).toBe(false);
    g.act(1).pass();
    g.expect.step('combatDamage');
    expect(g.eventsSince(mark).some((e) => e.kind === 'damageDealt')).toBe(true);
  });

  test('the same holds in the declare attackers step: the defender has priority before blocks', () => {
    const g = game();
    g.advanceTo('declareAttackers');
    g.act(0).attack('Grizzly Bears');
    g.expect.step('declareAttackers');
    g.expect.pending('priority', 0);
    g.act(0).pass();
    g.expect.step('declareAttackers');
    g.expect.pending('priority', 1);
    g.act(1).pass();
    g.expect.step('declareBlockers');
    g.expect.pending('declareBlockers', 1);
  });
});
