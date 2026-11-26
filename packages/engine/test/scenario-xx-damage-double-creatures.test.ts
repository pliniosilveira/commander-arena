// "If a creature you control would deal damage to a permanent or player, it deals double that damage instead." (Gratuitous Violence): the replacement
// `damageDouble` whose sources are the creatures on the battlefield. The cards below are SYNTHETIC (src/cards/fixtures/synthetic-damage-bonus.ts). Pins:
// CR 614.1a (an effect that says "instead" is a replacement effect), CR 109.2 (a creature is a permanent: a spell is not doubled), CR 120.3 (the creature
// deals the doubled damage, combat or not, to a player, a creature, a planeswalker or a battle), CR 510.1 and 702.19b (combat damage is assigned before it is
// doubled: lethal damage is judged on the assignment), CR 614.5 (one opportunity each: two effects quadruple), CR 616.1 (the affected player orders the
// doubling and a prevention effect), CR 113.7a (a creature that has left deals damage as it last was).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const RITE = 'SYNTHETIC Brutal Rite';
const PINGER = 'SYNTHETIC Spark Pinger'; // {T}: 2 damage to any target
const SPITE = 'SYNTHETIC Spite Imp'; // 2/1: when it dies, 2 damage to any target
const BOLT = 'Lightning Bolt';
const BEARS = 'Grizzly Bears';
const V55 = 'SYNTHETIC Vanilla 5/5';
const V22 = 'SYNTHETIC Vanilla 2/2';
const TRAMPLER = 'SYNTHETIC Trampler 4/4';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const BATTLE = 'SYNTHETIC Vanilla Battle';
const SHIELD2 = 'SYNTHETIC Shield Two';

test('the card is valid', () => {
  expect(validateCard(syntheticCard(RITE))).toEqual([]);
});

describe('noncombat damage of a creature', () => {
  const table = (...mine: readonly string[]) =>
    scenario()
      .seat(0)
      .battlefield(...mine, PINGER, 'Mountain')
      .hand(BOLT)
      .seat(1)
      .battlefield(V55, { label: 'theirs' })
      .at('precombatMain', { active: 0 })
      .build();

  test('to a player: 2 becomes 4', () => {
    const g = table(RITE);
    g.act(0).activate(PINGER, { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 36);
  });

  test('without the effect it deals 2', () => {
    const g = table();
    g.act(0).activate(PINGER, { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 38);
  });

  test('to a creature of another player: 4 damage is marked', () => {
    const g = table(RITE);
    g.act(0).activate(PINGER, { targets: ['theirs'] });
    g.passAll();
    g.expect.damage('theirs', 4);
  });

  test('"a permanent or player" is any of them: the controller is dealt double by their own creature', () => {
    const g = table(RITE);
    g.act(0).activate(PINGER, { targets: [{ player: 0 }] });
    g.passAll();
    g.expect.life(0, 36);
  });

  test('a spell of the controller is not a creature they control (CR 109.2): it deals its 3', () => {
    const g = table(RITE);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
  });

  test('two of them quadruple (CR 614.5: each applies once): 2 becomes 8', () => {
    const g = table(RITE, RITE);
    g.act(0).activate(PINGER, { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 32);
  });

  test("a creature of another player is not doubled by a player's effect", () => {
    const g = scenario()
      .seat(0)
      .battlefield(PINGER)
      .seat(1)
      .battlefield(RITE)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(PINGER, { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 38);
  });

  test('a creature that died deals double damage as the creature it last was (CR 113.7a)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RITE, SPITE, 'Mountain')
      .hand(BOLT)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BOLT, { targets: [SPITE], pay: true });
    g.passAll();
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.zone(SPITE, 'graveyard', { seat: 0 });
    g.expect.life(1, 36);
  });
});

describe('combat damage', () => {
  test('to the defending player: a 2/2 deals 4', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RITE, BEARS)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([BEARS]);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 36);
  });

  test('the blocker of another player is dealt double, and deals its own damage undoubled', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RITE, BEARS)
      .seat(1)
      .battlefield(V55)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([BEARS]);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: V55, attacker: BEARS }]);
    g.advanceTo('endOfCombat');
    g.expect.damage(V55, 4);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('a blocking creature of the controller deals double too', () => {
    const g = scenario()
      .seat(0)
      .battlefield(V55)
      .seat(1)
      .battlefield(RITE, BEARS)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([V55]);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: BEARS, attacker: V55 }]);
    g.advanceTo('endOfCombat');
    g.expect.damage(V55, 4);
  });

  test('to a planeswalker: a 2/2 takes 4 loyalty off', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RITE, BEARS)
      .seat(1)
      .battlefield(WALKER, { counters: { loyalty: 6 } })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: BEARS, target: WALKER }]);
    g.advanceTo('endOfCombat');
    g.expect.counters(WALKER, { loyalty: 2 });
    g.expect.life(1, 40);
  });

  test('to a battle: a 2/2 takes 4 defense off', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RITE, BEARS, BATTLE)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: BEARS, target: BATTLE }]);
    g.advanceTo('endOfCombat');
    g.expect.counters(BATTLE, { defense: 1 });
  });

  describe('trample: the damage is assigned first, then each assigned amount is doubled (CR 510.1, 702.19b)', () => {
    const blocked = () => {
      const g = scenario()
        .seat(0)
        .battlefield(RITE, TRAMPLER)
        .seat(1)
        .battlefield(V22)
        .at('precombatMain', { active: 0 })
        .build();
      g.advanceTo('declareAttackers');
      g.act(0).attack([TRAMPLER]);
      g.advanceTo('declareBlockers');
      g.act(1).declareBlockers([{ blocker: V22, attacker: TRAMPLER }]);
      g.passAll();
      g.expect.pending('assignDamage', 0);
      return g;
    };

    test('2 to the 2/2 blocker and 2 to the player become 4 and 4', () => {
      const g = blocked();
      g.act(0).assignDamage([
        { from: TRAMPLER, to: V22, amount: 2 },
        { from: TRAMPLER, to: { player: 1 }, amount: 2 },
      ]);
      g.expect.zone(V22, 'graveyard', { seat: 1 });
      g.expect.life(1, 36);
    });

    test('1 to the blocker is not lethal for the assignment although it would be dealt 2', () => {
      const g = blocked();
      g.expect.illegal(0, {
        assignDamage: [
          { from: TRAMPLER, to: V22, amount: 1 },
          { from: TRAMPLER, to: { player: 1 }, amount: 3 },
        ],
      });
    });
  });
});

describe('with a prevention effect (CR 616.1): preventing first is never worse for the player dealt the damage, so nothing is asked', () => {
  const shielded = () => {
    const g = scenario()
      .seat(0)
      .battlefield(RITE, PINGER, V55)
      .seat(1)
      .battlefield('Plains')
      .hand(SHIELD2)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    g.act(1).cast(SHIELD2, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    return g;
  };

  test('damage that is all prevented is not doubled: a shield for 2 against 2', () => {
    const g = shielded();
    g.act(0).activate(PINGER, { targets: [{ player: 1 }] });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 40);
  });

  test('what is left is doubled: a shield for 2 against combat damage of 5 leaves 3, dealt as 6', () => {
    const g = shielded();
    g.advanceTo('declareAttackers');
    g.act(0).attack([V55]);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 34);
  });
});
