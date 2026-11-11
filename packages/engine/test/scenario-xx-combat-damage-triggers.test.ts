// "Whenever [a creature] deals combat damage to [a player | a creature]" (D-111): `dealsCombatDamage`.
// Pins: CR 120.2a (each attacking and blocking creature deals combat damage equal to its power),
// CR 510.2 (all combat damage is dealt simultaneously), CR 510.4 (a first-strike or double-strike
// creature deals damage in the first-strike step too), CR 603.2 and 603.2c (one trigger for each
// event), CR 603.2g (damage that is entirely prevented triggers nothing), CR 120.3b (infect damage
// to a player is still damage). One trigger for each source and each object or player it damages.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-triggers-more.ts) or fixtures.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

const V22 = 'SYNTHETIC Vanilla 2/2';
const V33 = 'SYNTHETIC Vanilla 3/3';
const V55 = 'SYNTHETIC Vanilla 5/5';
const PLAYER_HIT = 'SYNTHETIC Player Hit Watcher';
const OPPONENT_HIT = 'SYNTHETIC Opponent Hit Watcher';
const CREATURE_HIT = 'SYNTHETIC Creature Hit Watcher';
const BIG_CREATURE_HIT = 'SYNTHETIC Big Creature Hit Watcher';
const ANY_DAMAGE = 'SYNTHETIC Any Damage Watcher';
const EVERY_HIT = 'SYNTHETIC Every Hit Watcher';
const BITING = 'SYNTHETIC Biting Bear';
const SCRAPPING = 'SYNTHETIC Scrapping Bear';
const STRIKING = 'SYNTHETIC Striking Bear';

/** Seat 0 attacks with `attackers` and `watchers` are its enchantments; the blocks are as told. */
function combat(
  watchers: readonly string[],
  attackers: readonly string[],
  defenders: readonly string[] = [],
  blocks: readonly { blocker: string; attacker: string }[] = [],
  rivalWatchers: readonly string[] = [],
) {
  const g = scenario()
    .seat(0)
    .life(20)
    .battlefield(...watchers, ...attackers)
    .seat(1)
    .life(20)
    .battlefield(...rivalWatchers, ...defenders)
    .at('precombatMain', { active: 0 })
    .build();
  g.advanceTo('declareAttackers');
  g.act(0).attack(attackers.map((name) => ({ name, seat: 0 as const })));
  g.advanceTo('declareBlockers');
  if (g.state.pending?.kind === 'declareBlockers') {
    g.act(1).declareBlockers(
      blocks.map((b) => ({
        blocker: { name: b.blocker, seat: 1 as const },
        attacker: { name: b.attacker, seat: 0 as const },
      })),
    );
  }
  g.advanceTo('combatDamage');
  answerOrder(g);
  return g;
}

/** Several different triggers of one player: they choose the order (CR 603.3b); here, as listed. */
function answerOrder(
  g: ReturnType<typeof scenario>['build'] extends () => infer R ? R : never,
): void {
  const d = g.state.pending;
  if (d?.kind === 'orderTriggers') {
    g.act(d.seat).orderTriggers(...d.triggers.map((_, i) => i));
  }
}

/** What the damage step put on the stack, then everything resolved: seat 0's life gained. */
function gained(g: ReturnType<typeof combat>, seat: 0 | 1 = 0): number {
  const before = g.state.seats[seat]?.life ?? 0;
  g.passAll();
  return (g.state.seats[seat]?.life ?? 0) - before;
}

describe('combat damage to a player (CR 120.2a, 510.2)', () => {
  test('an unblocked attacker triggers "to a player", "to an opponent", "any" and the open watcher', () => {
    const g = combat([PLAYER_HIT, OPPONENT_HIT, ANY_DAMAGE, CREATURE_HIT], [V22]);
    // 4 watchers, 3 trigger (not "to a creature"); the damage is dealt, so the triggers are on the stack.
    expect(g.state.stack).toHaveLength(3);
    g.expect.life(1, 18);
    expect(gained(g)).toBe(3);
  });

  test('it triggers once for each creature that deals damage', () => {
    const g = combat([PLAYER_HIT], [V22, V33]);
    expect(g.state.stack).toHaveLength(2);
    expect(gained(g)).toBe(2);
  });

  test('the creature itself: "whenever this deals combat damage to a player"', () => {
    const g = combat([], [BITING, V33]);
    expect(g.state.stack).toHaveLength(1);
    g.expect.stack([`${BITING} (ability)`]);
    expect(gained(g)).toBe(1);
  });

  test('a watcher of the defending player can see any creature hit its owner', () => {
    const g = combat([], [V22], [], [], [EVERY_HIT]);
    g.expect.stack([`${EVERY_HIT} (ability)`]);
    expect(gained(g, 1)).toBe(1);
  });

  test('"a creature you control" does not see the opponent creature deal damage', () => {
    const g = combat([], [V22], [V33], [{ blocker: V33, attacker: V22 }], [PLAYER_HIT]);
    g.expect.stack([]);
  });

  test('infect damage to a player is combat damage dealt (CR 120.3b)', () => {
    const g = combat([PLAYER_HIT], ['SYNTHETIC Infect Bear']);
    g.expect.stack([`${PLAYER_HIT} (ability)`]);
    expect(g.state.seats[1]?.poison).toBe(2);
  });
});

describe('combat damage to a creature', () => {
  test('a blocked attacker deals damage to the blocker: "to a creature" triggers, "to a player" does not', () => {
    const g = combat(
      [PLAYER_HIT, CREATURE_HIT, ANY_DAMAGE],
      [V33],
      [V22],
      [{ blocker: V22, attacker: V33 }],
    );
    // CREATURE_HIT and ANY_DAMAGE trigger once each for the attacker's damage to the blocker.
    expect(g.state.stack).toHaveLength(2);
    expect(gained(g)).toBe(2);
  });

  test("the blocker is a creature of the other player: it triggers that player's watchers", () => {
    const g = combat([], [V22], [V22], [{ blocker: V22, attacker: V22 }], [CREATURE_HIT]);
    g.expect.stack([`${CREATURE_HIT} (ability)`]);
    expect(gained(g, 1)).toBe(1);
  });

  test('the creature itself: "whenever this deals combat damage to a creature"', () => {
    const g = combat([], [SCRAPPING], [V33], [{ blocker: V33, attacker: SCRAPPING }]);
    g.expect.stack([`${SCRAPPING} (ability)`]);
  });

  test('a creature blocked by two creatures damages both, one trigger for each', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(CREATURE_HIT, V55)
      .seat(1)
      .life(20)
      .battlefield(V22, V22)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(V55);
    g.advanceTo('declareBlockers');
    const [first, second] = g.find({ name: V22, seat: 1 });
    g.act(1).declareBlockers([
      { blocker: first?.id ?? '', attacker: V55 },
      { blocker: second?.id ?? '', attacker: V55 },
    ]);
    g.advanceTo('combatDamage');
    g.expect.pending('assignDamage', 0);
    g.act(0).defaultDamage();
    answerOrder(g);
    // The 5/5 divides its damage between the two blockers: two damage events, two triggers.
    expect(g.state.stack).toHaveLength(2);
  });

  test('the recipient filter: "to a creature with power 3 or greater"', () => {
    const big = combat([BIG_CREATURE_HIT], [V22], [V33], [{ blocker: V33, attacker: V22 }]);
    big.expect.stack([`${BIG_CREATURE_HIT} (ability)`]);
    const small = combat([BIG_CREATURE_HIT], [V33], [V22], [{ blocker: V22, attacker: V33 }]);
    small.expect.stack([]);
  });
});

describe('what is not combat damage dealt to a creature or player', () => {
  test('damage to a planeswalker is "any" damage only', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(PLAYER_HIT, CREATURE_HIT, ANY_DAMAGE, V33)
      .seat(1)
      .battlefield('SYNTHETIC Vanilla Planeswalker')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(V33, 'SYNTHETIC Vanilla Planeswalker');
    g.advanceTo('declareBlockers');
    g.advanceTo('combatDamage');
    g.expect.stack([`${ANY_DAMAGE} (ability)`]);
  });

  test('damage that is not combat damage triggers nothing', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(ANY_DAMAGE, PLAYER_HIT, 'SYNTHETIC Pinger')
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate('SYNTHETIC Pinger', { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 39);
    g.expect.noEvent({ kind: 'abilityTriggered' });
  });
});

describe('prevented damage (CR 603.2g)', () => {
  test('all of it prevented: no damage is dealt and nothing triggers', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(PLAYER_HIT, V22)
      .seat(1)
      .life(20)
      .hand('SYNTHETIC Fog Spell')
      .battlefield('Plains')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(V22);
    g.advanceTo('declareBlockers');
    g.pass(); // seat 0 passes with the attack declared and no blockers possible
    g.act(1).cast('SYNTHETIC Fog Spell', { pay: true });
    g.passAll();
    g.advanceTo('combatDamage');
    g.expect.life(1, 20);
    g.expect.stack([]);
  });

  test('only some of it prevented: the rest is still dealt, so it triggers', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(PLAYER_HIT, V33)
      .seat(1)
      .life(20)
      .hand('SYNTHETIC Soften Blow')
      .battlefield('Plains', 'Plains')
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(V33);
    g.advanceTo('declareBlockers');
    g.pass();
    g.act(1).cast('SYNTHETIC Soften Blow', { pay: true });
    g.passAll();
    g.advanceTo('combatDamage');
    // Prevent the next 2 damage: 3 damage is 1 dealt.
    g.expect.life(1, 19);
    g.expect.stack([`${PLAYER_HIT} (ability)`]);
  });
});

describe('first strike and double strike (CR 510.4, 702.4)', () => {
  test('a double striker deals damage in two steps: two triggers, one for each', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(STRIKING)
      .seat(1)
      .life(20)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(STRIKING);
    g.advanceTo('firstStrikeDamage');
    g.expect.life(1, 18);
    g.expect.stack([`${STRIKING} (ability)`]);
    g.passAll();
    g.expect.life(0, 21);
    g.advanceTo('combatDamage');
    g.expect.life(1, 16);
    g.expect.stack([`${STRIKING} (ability)`]);
    g.passAll();
    g.expect.life(0, 22);
  });
});

describe('determinism and legal actions', () => {
  test('the same combat twice gives the same hash', () => {
    const run = () => {
      const g = combat(
        [ANY_DAMAGE, PLAYER_HIT],
        [V22, V33],
        [V22],
        [{ blocker: V22, attacker: V22 }],
      );
      g.passAll();
      return g.hash();
    };
    expect(run()).toBe(run());
  });

  test('every legal action with the triggers on the stack is accepted', () => {
    const build = () => combat([ANY_DAMAGE, PLAYER_HIT], [V22]);
    for (const action of build().legalActions(0)) {
      const probe = build();
      expect(probe.act(0).try.action(action).ok, JSON.stringify(action)).toBe(true);
    }
  });
});
