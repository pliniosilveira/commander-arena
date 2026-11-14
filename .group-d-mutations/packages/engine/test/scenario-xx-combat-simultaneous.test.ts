// Combat damage is dealt simultaneously and state-based actions then handle everything at once.
// Pins: CR 510.2 (Combat Damage Step): all assigned combat damage is dealt simultaneously; no player
// has the chance to act between assignment and dealing. CR 704.3 (State-Based Actions): they are all
// performed at once, checked when a player would receive priority, so creatures that die in the same
// step die together. CR 510.1d: a blocker assigns damage even if it will die from the attacker's.
import { describe, expect, test } from 'vitest';
import type { GameEvent } from '../src/index';
import { scenario } from '../src/testing/index';

function indexOf(events: readonly GameEvent[], pred: (e: GameEvent) => boolean): number {
  return events.findIndex(pred);
}

describe('CR 510.2: damage is dealt at once', () => {
  test('two 2/2s trade: both deal damage, then both die', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 2/2')
      .seat(1)
      .battlefield('Grizzly Bears')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Vanilla 2/2');
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: 'Grizzly Bears', attacker: 'SYNTHETIC Vanilla 2/2' }]);
    const mark = g.mark();
    g.advanceTo('combatDamage');
    const events = g.eventsSince(mark);
    const damage = events.flatMap((e, i) => (e.kind === 'damageDealt' ? [i] : []));
    const deaths = events.flatMap((e, i) => (e.kind === 'died' ? [i] : []));
    expect(damage).toHaveLength(2);
    expect(deaths).toHaveLength(2);
    // Both damage events come before either death: nothing died between the two hits.
    expect(Math.max(...damage)).toBeLessThan(Math.min(...deaths));
    g.expect.zone('SYNTHETIC Vanilla 2/2', 'graveyard', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
  });

  test('a blocker that dies still deals its damage: a 5/5 blocker killed by a 5/5 attacker kills it too', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 5/5')
      .seat(1)
      .battlefield('SYNTHETIC Vanilla 5/5')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack({ name: 'SYNTHETIC Vanilla 5/5', seat: 0 });
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([
      {
        blocker: { name: 'SYNTHETIC Vanilla 5/5', seat: 1 },
        attacker: { name: 'SYNTHETIC Vanilla 5/5', seat: 0 },
      },
    ]);
    g.advanceTo('combatDamage');
    g.expect.zone('SYNTHETIC Vanilla 5/5', 'graveyard', { seat: 0 });
    g.expect.zone('SYNTHETIC Vanilla 5/5', 'graveyard', { seat: 1 });
  });

  test('four creatures die in one state-based action pass: two attackers, each blocked', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 2/2', 'SYNTHETIC Vanilla 3/3')
      .seat(1)
      .battlefield('Grizzly Bears')
      .battlefield('SYNTHETIC Vanilla 3/3')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([
      { name: 'SYNTHETIC Vanilla 2/2', seat: 0 },
      { name: 'SYNTHETIC Vanilla 3/3', seat: 0 },
    ]);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([
      { blocker: 'Grizzly Bears', attacker: { name: 'SYNTHETIC Vanilla 2/2', seat: 0 } },
      {
        blocker: { name: 'SYNTHETIC Vanilla 3/3', seat: 1 },
        attacker: { name: 'SYNTHETIC Vanilla 3/3', seat: 0 },
      },
    ]);
    const mark = g.mark();
    g.advanceTo('combatDamage');
    const events = g.eventsSince(mark);
    const lastDamage = events.reduce((acc, e, i) => (e.kind === 'damageDealt' ? i : acc), -1);
    const firstDeath = indexOf(events, (e) => e.kind === 'died');
    expect(lastDamage).toBeLessThan(firstDeath);
    expect(events.filter((e) => e.kind === 'died')).toHaveLength(4);
    g.expect.noObject('Grizzly Bears', { zone: 'battlefield' });
    g.expect.zone('SYNTHETIC Vanilla 3/3', 'graveyard', { count: 2 });
  });

  test('combat damage to a player and to creatures happens in the same step', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 3/3', 'SYNTHETIC Vanilla 2/2')
      .seat(1)
      .battlefield('Grizzly Bears')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(['SYNTHETIC Vanilla 3/3', 'SYNTHETIC Vanilla 2/2']);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: 'Grizzly Bears', attacker: 'SYNTHETIC Vanilla 2/2' }]);
    g.advanceTo('combatDamage');
    g.expect.life(1, 37);
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.zone('SYNTHETIC Vanilla 2/2', 'graveyard', { seat: 0 });
  });

  test('lethal combat damage to the player ends the game in the damage step', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 5/5')
      .seat(1)
      .life(5)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Vanilla 5/5');
    g.advanceTo('combatDamage');
    g.expect.life(1, 0);
    g.expect.gameOver({ win: 0 });
    g.expect.eventLog([
      { kind: 'damageDealt', amount: 5, combat: true },
      { kind: 'playerLost', seat: 1, reason: 'life' },
    ]);
  });

  test('combat damage events say they are combat damage; spell damage does not', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Vanilla 3/3', 'Mountain')
      .hand('Lightning Bolt')
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.eventLog([{ kind: 'damageDealt', amount: 3, combat: false }]);
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Vanilla 3/3');
    g.advanceTo('combatDamage');
    g.expect.eventLog([
      { kind: 'damageDealt', amount: 3, combat: false },
      { kind: 'damageDealt', amount: 3, combat: true },
    ]);
  });
});
