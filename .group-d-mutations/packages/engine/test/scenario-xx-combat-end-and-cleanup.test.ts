// The end of combat and the cleanup step.
// Pins: CR 511.3 (End of Combat Step): as the end of combat step ends, all creatures, battles and
// planeswalkers are removed from combat; the combat phase is over. CR 514.2 (Cleanup Step): damage
// marked on permanents is removed (and "until end of turn" effects end) at the same time, so damage
// from combat is still on the creature in the second main phase and end step. CR 502.3: attackers
// untap with their controller's next untap step.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

function afterCombat() {
  const g = scenario()
    .seat(0)
    .battlefield('SYNTHETIC Vanilla 3/3')
    .library('Island', { count: 4 })
    .seat(1)
    .battlefield('SYNTHETIC Vanilla 5/5')
    .library('Island', { count: 4 })
    .at('precombatMain', { active: 0 })
    .build();
  g.advanceTo('declareAttackers');
  g.act(0).attack('SYNTHETIC Vanilla 3/3');
  g.advanceTo('declareBlockers');
  g.act(1).declareBlockers([
    { blocker: 'SYNTHETIC Vanilla 5/5', attacker: 'SYNTHETIC Vanilla 3/3' },
  ]);
  return g;
}

describe('CR 511.3: the combat phase ends and combat state is cleared', () => {
  test('combat is still in progress in the end of combat step and gone after it', () => {
    const g = afterCombat();
    g.advanceTo('endOfCombat');
    expect(g.state.combat).not.toBeNull();
    // The attacker died, but the combat (its record of attackers and blocks) lasts until the step ends.
    expect(g.state.combat?.attackers).toHaveLength(1);
    expect(g.state.combat?.attackers[0]?.blocked).toBe(true);
    g.advanceTo('postcombatMain');
    expect(g.state.combat).toBeNull();
    g.expect.combat(null);
  });

  test('the attacker stays tapped and the blocker untapped after combat', () => {
    const g = afterCombat();
    g.advanceTo('postcombatMain');
    g.expect.zone('SYNTHETIC Vanilla 3/3', 'graveyard', { seat: 0 });
    g.expect.tapped('SYNTHETIC Vanilla 5/5', false);
  });

  test('no combat remains in the next turn, and the other seat starts a fresh one', () => {
    const g = afterCombat();
    g.advanceTo('declareAttackers', { turn: 4 });
    expect(g.state.combat).toBeNull();
    g.expect.pending('declareAttackers', 1);
    g.act(1).attack('SYNTHETIC Vanilla 5/5');
    g.expect.combat({ attackers: ['SYNTHETIC Vanilla 5/5'], unblocked: ['SYNTHETIC Vanilla 5/5'] });
  });

  test('an unblocked-then-removed creature leaves nothing behind in combat', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 3/3')
      .battlefield('Mountain')
      .hand('Lightning Bolt')
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Vanilla 3/3');
    g.act(0).cast('Lightning Bolt', { targets: ['SYNTHETIC Vanilla 3/3'], pay: true });
    g.passAll();
    g.expect.zone('SYNTHETIC Vanilla 3/3', 'graveyard', { seat: 0 });
    g.advanceTo('postcombatMain');
    g.expect.combat(null);
    g.expect.life(1, 40);
  });
});

describe('CR 514.2: cleanup removes damage', () => {
  test('damage from combat survives the second main phase and the end step, and is gone next turn', () => {
    const g = afterCombat();
    g.advanceTo('postcombatMain');
    g.expect.damage('SYNTHETIC Vanilla 5/5', 3);
    g.advanceTo('end');
    g.expect.damage('SYNTHETIC Vanilla 5/5', 3);
    g.advanceTo('upkeep', { turn: 4 });
    g.expect.damage('SYNTHETIC Vanilla 5/5', 0);
  });

  test('damage does not accumulate across turns: two hits of 3 on different turns do not kill a 5/5', () => {
    const g = afterCombat();
    g.advanceTo('declareAttackers', { turn: 5 });
    // The 3/3 died in turn 3; a fresh 3/3 attacks in turn 5 and meets the 5/5 again.
    g.expect.damage('SYNTHETIC Vanilla 5/5', 0);
    g.expect.zone('SYNTHETIC Vanilla 5/5', 'battlefield', { seat: 1 });
  });

  test('attackers untap in their controller untap step', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Grizzly Bears')
      .library('Island', { count: 4 })
      .seat(1)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('Grizzly Bears');
    g.advanceTo('upkeep', { turn: 4 });
    g.expect.tapped('Grizzly Bears');
    g.advanceTo('upkeep', { turn: 5 });
    g.expect.tapped('Grizzly Bears', false);
  });
});
