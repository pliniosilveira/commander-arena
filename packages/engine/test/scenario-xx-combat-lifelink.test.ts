// Lifelink on combat damage and on spell damage.
// Pins: CR 702.15b (Lifelink) and CR 120.3f (Damage): damage dealt by a source with lifelink causes
// that source's controller to gain that much life, in addition to the damage's other results. It is
// the amount of damage dealt, whatever it is dealt to: a player, a creature (even beyond its
// toughness), a planeswalker, and whether it is combat damage or spell damage. A creature that dies
// from the damage it is dealt at the same moment still gains its controller the life (CR 510.2).
import { describe, test } from 'vitest';
import { scenario } from '../src/testing/index';

const HAWK = "Healer's Hawk";

describe('lifelink on combat damage (CR 702.15b, 120.3f)', () => {
  test('to a player: the attacker deals 1, its controller gains 1', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(HAWK)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(HAWK);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 39);
    g.expect.life(0, 21);
  });

  test('to a creature: blocked by a Giant Spider, the Hawk dies and still gains 1 life', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(HAWK)
      .seat(1)
      .battlefield('Giant Spider')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(HAWK);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: 'Giant Spider', attacker: HAWK }]);
    g.advanceTo('endOfCombat');
    g.expect.zone(HAWK, 'graveyard', { seat: 0 });
    g.expect.damage('Giant Spider', 1);
    g.expect.life(0, 21);
    g.expect.life(1, 40);
  });

  test('a lifelink blocker gains life for its own controller', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield('SYNTHETIC Flier 1/1')
      .seat(1)
      .life(10)
      .battlefield(HAWK)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Flier 1/1');
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: HAWK, attacker: 'SYNTHETIC Flier 1/1' }]);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 11);
    g.expect.life(0, 20);
  });

  test('the life gained is the damage dealt, not the creature toughness: 3 damage onto a 1/1 gains 3', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield('SYNTHETIC Double Strike Lifelink 3/3')
      .seat(1)
      .battlefield('SYNTHETIC Vanilla 1/1')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('SYNTHETIC Double Strike Lifelink 3/3');
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([
      { blocker: 'SYNTHETIC Vanilla 1/1', attacker: 'SYNTHETIC Double Strike Lifelink 3/3' },
    ]);
    g.advanceTo('endOfCombat');
    // 3 damage in the first-strike step to the 1/1 (it dies), nothing more: 3 life gained.
    g.expect.life(0, 23);
  });

  test('damage to a planeswalker gains life too', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(HAWK)
      .seat(1)
      .battlefield('SYNTHETIC Vanilla Planeswalker')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(HAWK, 'SYNTHETIC Vanilla Planeswalker');
    g.advanceTo('endOfCombat');
    g.expect.counters('SYNTHETIC Vanilla Planeswalker', { loyalty: 3 });
    g.expect.life(0, 21);
    g.expect.life(1, 40);
  });

  test('a creature without lifelink gains nothing', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield('Serra Angel')
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('Serra Angel');
    g.advanceTo('endOfCombat');
    g.expect.life(0, 20);
  });
});

describe('lifelink on spell damage (CR 120.3f)', () => {
  function bolt(target: 'player' | 'creature') {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield('Mountain')
      .hand('SYNTHETIC Lifelink Bolt')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('SYNTHETIC Lifelink Bolt', {
      targets: [target === 'player' ? { player: 1 } : 'Grizzly Bears'],
      pay: true,
    });
    g.passAll();
    return g;
  }

  test('to a player: 3 damage, 3 life', () => {
    const g = bolt('player');
    g.expect.life(1, 37);
    g.expect.life(0, 23);
  });

  test('to a creature: the full 3 is gained even though the creature has toughness 2', () => {
    const g = bolt('creature');
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.life(0, 23);
    g.expect.life(1, 40);
  });

  test('the same damage from a spell without lifelink gains nothing', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield('Mountain')
      .hand('Lightning Bolt')
      .seat(1)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(0, 20);
  });
});
