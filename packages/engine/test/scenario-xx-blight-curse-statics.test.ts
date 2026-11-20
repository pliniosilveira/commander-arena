// "Players can't gain life." (CR 119.7), "Damage can't be prevented." (CR 615.12) and "All damage is dealt as though its source had wither." (CR 702.80a,
// 120.3d), as static abilities of a permanent (CR 604.1), through `applyAction`. Cards are SYNTHETIC (src/cards/fixtures/synthetic-blight-curse.ts) or fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const SOUR = 'SYNTHETIC Sour Idol'; // players can't gain life
const STUBBORN = 'SYNTHETIC Stubborn Idol'; // damage can't be prevented
const BLIGHT = 'SYNTHETIC Blight Idol'; // all damage is dealt as though its source had wither
const MEND = 'SYNTHETIC Mend'; // gain 3 life
const BOLT2 = 'SYNTHETIC Bolt Two'; // 2 damage to any target, then you gain 2 life
const SELF_WARD = 'SYNTHETIC Self Ward'; // prevent all damage that would be dealt to you this turn
const HAWK = "Healer's Hawk"; // flying, lifelink 1/1
const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const damageEvents = (g: ScenarioGame, kind: 'damageDealt' | 'damagePrevented') =>
  g.events.filter((e) => e.kind === kind);

describe('the cards are valid', () => {
  for (const name of [SOUR, STUBBORN, BLIGHT]) {
    test(name, () => {
      expect(validateCard(syntheticCard(name))).toEqual([]);
    });
  }
});

describe('"Players can\'t gain life" (CR 119.7)', () => {
  test.each([0, 1] as const)('seat %i, the controller or the opponent, gains no life', (seat) => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .life(20)
      .hand(MEND)
      .battlefield(SOUR, 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .life(20)
      .hand(MEND)
      .battlefield('Plains')
      .at('precombatMain', { active: seat })
      .build();
    g.act(seat).cast(MEND, { pay: true });
    g.passAll();
    g.expect.life(seat, 20);
    expect(g.events.filter((e) => e.kind === 'lifeGained')).toEqual([]);
  });

  test("the rest of a spell still happens: Bolt Two's damage is dealt and its gain is not", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .life(20)
      .battlefield('Mountain')
      .hand(BOLT2)
      .seat(1)
      .library(...LIBRARY)
      .life(20)
      .battlefield(SOUR)
      .build();
    g.act(0).cast(BOLT2, { pay: true });
    g.passAll();
    g.expect.life(1, 18);
    g.expect.life(0, 20);
  });

  test('lifelink damage gains nothing for anyone', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .life(20)
      .battlefield(HAWK, SOUR)
      .seat(1)
      .library(...LIBRARY)
      .life(20)
      .build();
    g.playCombat({ attack: [HAWK], until: 'postcombatMain' });
    g.expect.life(1, 19);
    g.expect.life(0, 20);
  });
});

describe('"Damage can\'t be prevented" (CR 615.12)', () => {
  const wardedBolt = (withIdol: boolean) =>
    scenario()
      .seat(0)
      .life(20)
      .battlefield('Mountain', ...(withIdol ? [STUBBORN] : []))
      .hand(BOLT2)
      .seat(1)
      .life(20)
      .battlefield('Plains', 'Plains')
      .hand(SELF_WARD)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();

  test('without the permanent a shield on you prevents the damage', () => {
    const g = wardedBolt(false);
    g.act(1).cast(SELF_WARD, { pay: true });
    g.passAll();
    g.act(0).cast(BOLT2, { pay: true });
    g.passAll();
    g.expect.life(1, 20);
    expect(damageEvents(g, 'damagePrevented')).toHaveLength(1);
  });

  test('with it the damage is dealt, the shield stays and nothing is reported prevented', () => {
    const g = wardedBolt(true);
    g.act(1).cast(SELF_WARD, { pay: true });
    g.passAll();
    g.act(0).cast(BOLT2, { pay: true });
    g.passAll();
    g.expect.life(1, 18);
    expect(damageEvents(g, 'damagePrevented')).toEqual([]);
    expect(damageEvents(g, 'damageDealt')).toHaveLength(1);
    // CR 615.12: the existing shield is not reduced (it prevents all, and is still there for the rest of the turn).
    expect(g.state.continuousEffects.some((e) => e.change.kind === 'preventDamage')).toBe(true);
  });
});

describe('"All damage is dealt as though its source had wither" (CR 702.80a, 120.3d)', () => {
  test('without the permanent a Bear marks damage on a Spider', () => {
    const g = scenario().seat(0).battlefield(BEARS).seat(1).battlefield(SPIDER).build();
    g.playCombat({
      attack: [BEARS],
      block: [{ blocker: SPIDER, attacker: BEARS }],
      until: 'postcombatMain',
    });
    g.expect.damage(SPIDER, 2);
    g.expect.counters(SPIDER, {});
  });

  test('with it, the Spider gets -1/-1 counters, not marked damage', () => {
    const g = scenario().seat(0).battlefield(BEARS, BLIGHT).seat(1).battlefield(SPIDER).build();
    g.playCombat({
      attack: [BEARS],
      block: [{ blocker: SPIDER, attacker: BEARS }],
      until: 'postcombatMain',
    });
    g.expect.counters(SPIDER, { '-1/-1': 2 });
    g.expect.damage(SPIDER, 0);
  });

  test('damage to a player is life loss as usual', () => {
    const g = scenario().seat(0).battlefield(BEARS, BLIGHT).seat(1).life(20).build();
    g.playCombat({ attack: [BEARS], until: 'postcombatMain' });
    g.expect.life(1, 18);
    expect(g.state.seats[1]?.poison).toBe(0);
  });

  test("a permanent of the opponent's has the same effect (it is a rule of the game, CR 604.1)", () => {
    const g = scenario().seat(0).battlefield(BEARS).seat(1).battlefield(SPIDER, BLIGHT).build();
    g.playCombat({
      attack: [BEARS],
      block: [{ blocker: SPIDER, attacker: BEARS }],
      until: 'postcombatMain',
    });
    g.expect.counters(SPIDER, { '-1/-1': 2 });
  });
});
