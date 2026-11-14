// Damage prevention shields (CR 615) through the one damage routine (CR 120.3).
// Pins: CR 615.1 (prevention effects are shields that apply as damage would be dealt), CR 615.4 (a
// shield must exist before the damage; it never goes back in time), CR 615.6 (prevented damage is
// never dealt: no life loss, no marked damage, no lifelink gain, no deathtouch, no commander
// damage; the spell or ability still resolves), CR 615.7 (a numeric shield is reduced by what it
// prevents and is gone at 0), CR 615.11 (one shield per permanent for "each creature you control"),
// CR 611.2c (a prevention effect changes the rules of the game, so "creatures you control" is read as
// damage would be dealt), CR 616.1 (the affected player chooses among shields when the order can change the
// result, D-191, `scenario-xx-damage-order.test.ts`; when it cannot, the shields that prevent all damage are
// applied first and then the numeric ones, oldest first), CR 514.2 (the shield ends at cleanup). Cards are SYNTHETIC (src/cards/fixtures/synthetic-prevention.ts) or fixtures.
import { describe, expect, test } from 'vitest';
import type { GameEvent } from '../src/index';
import { scenario, type TargetRef } from '../src/testing/index';

const FOG = 'SYNTHETIC Fog Spell';
const SELF_WARD = 'SYNTHETIC Self Ward';
const QUIET_FOG = 'SYNTHETIC Quiet Fog';
const STANDOFF = 'SYNTHETIC Standoff';
const SHIELD3 = 'SYNTHETIC Shield Three';
const SHELTER = 'SYNTHETIC Herd Shelter';
const CIRCLE = 'SYNTHETIC Ward Circle';
const SOFTEN = 'SYNTHETIC Soften Blow';
const BOLT2 = 'SYNTHETIC Bolt Two';
const V33 = 'SYNTHETIC Vanilla 3/3';
const V22 = 'SYNTHETIC Vanilla 2/2';
const V55 = 'SYNTHETIC Vanilla 5/5';
const LIFELINK = 'SYNTHETIC Double Strike Lifelink 3/3';
const DEATHTOUCH = 'SYNTHETIC Deathtouch Trampler 4/4';
const BEARS = 'Grizzly Bears';
const FLASH_BEAR = 'SYNTHETIC Flash Bear';

type G = ReturnType<ReturnType<typeof scenario>['build']>;

const shields = (g: G) =>
  g.state.continuousEffects.filter((e) => e.change.kind === 'preventDamage');
const amounts = (g: G) =>
  shields(g).map((e) => (e.change.kind === 'preventDamage' ? e.change.amount : null));
const dealt = (events: readonly GameEvent[]) => events.filter((e) => e.kind === 'damageDealt');
const prevented = (events: readonly GameEvent[]) =>
  events.filter((e) => e.kind === 'damagePrevented');

/** Seat 0 attacks with `attackers`, seat 1 blocks as told and then holds priority (Fog window). */
function toFogWindow(
  g: G,
  attackers: readonly string[],
  blocks: readonly { blocker: string; attacker: string }[] = [],
): void {
  g.advanceTo('declareAttackers');
  g.act(0).attack(attackers);
  g.advanceTo('declareBlockers');
  // A defender with no creature that can block is not asked (CR 509.1).
  if (g.state.pending?.kind === 'declareBlockers') g.act(1).declareBlockers(blocks);
  g.act(0).pass();
}

/** Casts a card from the hand of `seat` (the first copy if there are several), paying with the planner. */
function cast(g: G, seat: 0 | 1, card: string, targets?: readonly TargetRef[]): void {
  // The other seat holds priority in an empty-stack window: it passes, so `seat` may act.
  if (g.state.pending?.kind === 'priority' && g.deciding !== seat && g.state.stack.length === 0) {
    g.pass();
  }
  g.act(seat).cast(`${card}[0]`, { pay: true, ...(targets === undefined ? {} : { targets }) });
}

describe('Fog: prevent all combat damage that would be dealt this turn (CR 615.1, 615.6)', () => {
  function fogged() {
    const g = scenario()
      .seat(0)
      .battlefield(V33, V22)
      .seat(1)
      .life(10)
      .battlefield('Plains', BEARS)
      .hand(FOG)
      .at('precombatMain', { active: 0 })
      .build();
    toFogWindow(g, [V33, V22], [{ blocker: BEARS, attacker: V22 }]);
    cast(g, 1, FOG);
    g.passAll();
    const mark = g.mark();
    g.advanceTo('endOfCombat');
    return { g, events: g.eventsSince(mark) };
  }

  test('no combat damage is dealt either way: player, attacker and blocker are untouched', () => {
    const { g, events } = fogged();
    g.expect.life(1, 10);
    g.expect.damage(BEARS, 0);
    g.expect.damage(V22, 0);
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    expect(dealt(events)).toHaveLength(0);
  });

  test('each prevented assignment is reported: amount, source, recipient, combat flag', () => {
    const { g, events } = fogged();
    const p = prevented(events);
    expect(p).toHaveLength(3);
    expect(p).toContainEqual({
      kind: 'damagePrevented',
      source: g.id(V33),
      to: { kind: 'player', seat: 1 },
      amount: 3,
      combat: true,
    });
    expect(p).toContainEqual({
      kind: 'damagePrevented',
      source: g.id(BEARS),
      to: { kind: 'object', id: g.id(V22) },
      amount: 2,
      combat: true,
    });
  });

  test('the shield is not used up by the damage it prevents (it prevents all of it)', () => {
    const { g } = fogged();
    expect(amounts(g)).toEqual(['all']);
  });

  test('Fog resolves as a spell: it left the stack and went to the graveyard', () => {
    const { g } = fogged();
    g.expect.zone(FOG, 'graveyard', { seat: 1 });
    g.expect.stack([]);
  });

  test('lifelink gains nothing when the damage is prevented (CR 120.3f, 615.6)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(LIFELINK)
      .seat(1)
      .battlefield('Plains')
      .hand(FOG)
      .at('precombatMain', { active: 0 })
      .build();
    toFogWindow(g, [LIFELINK]);
    cast(g, 1, FOG);
    g.passAll();
    g.advanceTo('endOfCombat');
    g.expect.life(0, 20);
    g.expect.life(1, 40);
  });

  test('deathtouch does not kill a creature it did not damage (CR 702.2b, 615.6)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(DEATHTOUCH)
      .seat(1)
      .battlefield('Plains', V55)
      .hand(FOG)
      .at('precombatMain', { active: 0 })
      .build();
    toFogWindow(g, [DEATHTOUCH], [{ blocker: V55, attacker: DEATHTOUCH }]);
    cast(g, 1, FOG);
    g.passAll();
    g.passAll();
    g.act(0).defaultDamage();
    g.advanceTo('endOfCombat');
    g.expect.zone(V55, 'battlefield', { seat: 1 });
    g.expect.damage(V55, 0);
    g.expect.zone(DEATHTOUCH, 'battlefield', { seat: 0 });
  });

  test('commander damage is not recorded for prevented combat damage (CR 903.10a)', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Yargle, Glutton of Urborg', { commander: true })
      .seat(1)
      .battlefield('Plains')
      .hand(FOG)
      .at('precombatMain', { active: 0 })
      .build();
    toFogWindow(g, ['Yargle, Glutton of Urborg']);
    cast(g, 1, FOG);
    g.passAll();
    g.advanceTo('endOfCombat');
    g.expect.life(1, 40);
    g.expect.commanderDamage(1, 'Yargle, Glutton of Urborg', 0);
  });

  test('combat damage to a planeswalker is prevented too: no loyalty is removed', () => {
    const g = scenario()
      .seat(0)
      .battlefield(V33)
      .seat(1)
      .battlefield('Plains', 'SYNTHETIC Vanilla Planeswalker')
      .hand(FOG)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(V33, 'SYNTHETIC Vanilla Planeswalker');
    g.advanceTo('declareBlockers');
    g.act(0).pass();
    cast(g, 1, FOG);
    g.passAll();
    g.advanceTo('endOfCombat');
    g.expect.counters('SYNTHETIC Vanilla Planeswalker', { loyalty: 4 });
  });

  test('Fog covers combat damage only: a Lightning Bolt the same turn still hurts (scope combat)', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Mountain')
      .hand('Lightning Bolt')
      .seat(1)
      .battlefield('Plains')
      .hand(FOG)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 1, FOG);
    g.passAll();
    cast(g, 0, 'Lightning Bolt', [{ player: 1 }]);
    g.passAll();
    g.expect.life(1, 37);
  });

  test('a shield made after the damage prevents nothing: it never goes back in time (CR 615.4)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(V33)
      .seat(1)
      .battlefield('Plains')
      .hand(FOG)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(V33);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 37);
    cast(g, 1, FOG);
    g.passAll();
    g.expect.life(1, 37);
  });

  test('it ends at cleanup: the shield is gone next turn and damage is dealt again (CR 514.2)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(V33)
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .battlefield('Plains')
      .library('Plains', 'Plains', 'Plains')
      .hand(FOG)
      .at('precombatMain', { active: 0 })
      .build();
    toFogWindow(g, [V33]);
    cast(g, 1, FOG);
    g.passAll();
    for (const step of ['endOfCombat', 'postcombatMain', 'end'] as const) {
      g.advanceTo(step);
      expect(amounts(g), step).toEqual(['all']);
    }
    g.advanceTo('upkeep', { turn: 'next' });
    expect(shields(g)).toEqual([]);
  });
});

describe('a shield on you (CR 615.1)', () => {
  test('all damage to you is prevented, spell damage and the rest of the spell still resolves', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield('Mountain')
      .hand(BOLT2)
      .seat(1)
      .life(20)
      .battlefield('Plains', 'Plains')
      .hand(SELF_WARD)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 1, SELF_WARD);
    g.passAll();
    const mark = g.mark();
    cast(g, 0, BOLT2);
    g.passAll();
    const events = g.eventsSince(mark);
    g.expect.life(1, 20);
    // "Then you gain 2 life": the spell resolved all the way, only the damage did not happen.
    g.expect.life(0, 22);
    g.expect.zone(BOLT2, 'graveyard', { seat: 0 });
    expect(dealt(events)).toHaveLength(0);
    expect(prevented(events)).toEqual([
      {
        kind: 'damagePrevented',
        // The source is the spell as an object on the stack (CR 400.7 gave it a new id).
        source: expect.any(String),
        to: { kind: 'player', seat: 1 },
        amount: 2,
        combat: false,
      },
    ]);
  });

  test('it protects the player and not their creatures', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Mountain', 'Mountain')
      .hand('Lightning Bolt', 'Lightning Bolt')
      .seat(1)
      .battlefield('Plains', 'Plains', BEARS)
      .hand(SELF_WARD)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 1, SELF_WARD);
    g.passAll();
    cast(g, 0, 'Lightning Bolt', [{ player: 1 }]);
    g.passAll();
    g.expect.life(1, 40);
    cast(g, 0, 'Lightning Bolt', [BEARS]);
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('a pain land rider is damage too: the 1 damage to you is prevented', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield('Plains', 'Plains', 'SYNTHETIC Pain Land')
      .hand(SELF_WARD)
      .seat(1)
      .build();
    cast(g, 0, SELF_WARD);
    g.passAll();
    const mark = g.mark();
    g.act(0).tapForMana('SYNTHETIC Pain Land', { color: 'U', ability: 1 });
    g.expect.life(0, 20);
    g.expect.pool(0, 'U');
    expect(prevented(g.eventsSince(mark))).toHaveLength(1);
  });

  test('a combat shield of 2 on you: 3 unblocked damage becomes 1, spell damage leaves it alone', () => {
    const g = scenario()
      .seat(0)
      .battlefield(V33, 'Mountain')
      .hand('Lightning Bolt')
      .seat(1)
      .battlefield('Plains')
      .hand(SOFTEN)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 1, SOFTEN);
    g.passAll();
    cast(g, 0, 'Lightning Bolt', [{ player: 1 }]);
    g.passAll();
    g.expect.life(1, 37);
    expect(amounts(g)).toEqual([2]);
    g.advanceTo('declareAttackers');
    g.act(0).attack(V33);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 36);
    expect(amounts(g)).toEqual([]);
  });
});

describe('a numeric shield (CR 615.7)', () => {
  function shieldedOpponent() {
    const g = scenario()
      .seat(0)
      .battlefield('Plains', 'Mountain', 'Mountain', 'Mountain')
      .hand(SHIELD3)
      .hand(BOLT2, { count: 3 })
      .seat(1)
      .build();
    cast(g, 0, SHIELD3, [{ player: 1 }]);
    g.passAll();
    return g;
  }

  test('"prevent the next 3" absorbs 2, then 1, then nothing', () => {
    const g = shieldedOpponent();
    expect(amounts(g)).toEqual([3]);
    cast(g, 0, BOLT2);
    g.passAll();
    g.expect.life(1, 40);
    expect(amounts(g)).toEqual([1]);
    const mark = g.mark();
    cast(g, 0, BOLT2);
    g.passAll();
    // 2 damage against a shield of 1: 1 prevented, 1 dealt.
    g.expect.life(1, 39);
    expect(shields(g)).toEqual([]);
    const events = g.eventsSince(mark);
    expect(prevented(events).map((e) => e.amount)).toEqual([1]);
    expect(dealt(events).map((e) => e.amount)).toEqual([1]);
    cast(g, 0, BOLT2);
    g.passAll();
    g.expect.life(1, 37);
  });

  test('a shield on a creature protects the creature, not its controller', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Plains', 'Mountain', 'Mountain')
      .hand(SHIELD3)
      .hand('Lightning Bolt', { count: 2 })
      .seat(1)
      .battlefield(BEARS)
      .build();
    cast(g, 0, SHIELD3, [BEARS]);
    g.passAll();
    cast(g, 0, 'Lightning Bolt', [{ player: 1 }]);
    g.passAll();
    g.expect.life(1, 37);
    expect(amounts(g)).toEqual([3]);
    cast(g, 0, 'Lightning Bolt', [BEARS]);
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.damage(BEARS, 0);
    expect(shields(g)).toEqual([]);
  });

  test('damage to a creature that is only partly prevented marks the rest', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Plains', 'Mountain', 'Mountain')
      .hand(SHIELD3)
      .hand('Lightning Bolt', { count: 2 })
      .seat(1)
      .battlefield(V55)
      .build();
    cast(g, 0, SHIELD3, [V55]);
    g.passAll();
    cast(g, 0, 'Lightning Bolt', [V55]);
    g.passAll();
    cast(g, 0, 'Lightning Bolt', [V55]);
    g.passAll();
    g.expect.damage(V55, 3);
  });

  test('a shield that prevents nothing is not used up: combat scope ignores spell damage', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Mountain')
      .hand('Lightning Bolt')
      .seat(1)
      .battlefield('Plains')
      .hand(SOFTEN)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 1, SOFTEN);
    g.passAll();
    cast(g, 0, 'Lightning Bolt', [{ player: 1 }]);
    g.passAll();
    expect(amounts(g)).toEqual([2]);
  });

  // Two equal shields give the same result in either order (CR 616.1: nothing to choose), so nothing is asked and the default order,
  // the older first, is used (D-191). Shields of different sizes ask: `scenario-xx-damage-order.test.ts`.
  test('two equal shields on one player: the older is used first and nothing is asked (CR 616.1)', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Plains', 'Plains', 'Mountain')
      .hand(SHIELD3, SHIELD3, BOLT2)
      .seat(1)
      .build();
    cast(g, 0, SHIELD3, [{ player: 1 }]);
    g.passAll();
    cast(g, 0, SHIELD3, [{ player: 1 }]);
    g.passAll();
    cast(g, 0, BOLT2);
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    expect(amounts(g)).toEqual([1, 3]);
    g.expect.life(1, 40);
  });

  test('a shield that prevents everything is applied before a numeric one, which is kept', () => {
    const g = scenario()
      .seat(0)
      .battlefield(V33)
      .seat(1)
      .battlefield('Plains', 'Plains', 'Plains')
      .hand(SOFTEN, SELF_WARD)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 1, SOFTEN);
    g.passAll();
    cast(g, 1, SELF_WARD);
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack(V33);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 40);
    expect(amounts(g)).toEqual([2, 'all']);
  });
});

describe('scope: noncombat damage only', () => {
  test('Quiet Fog stops a Lightning Bolt but not combat damage', () => {
    const g = scenario()
      .seat(0)
      .battlefield(V33, 'Mountain')
      .hand('Lightning Bolt')
      .seat(1)
      .battlefield('Plains', 'Plains')
      .hand(QUIET_FOG)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 1, QUIET_FOG);
    g.passAll();
    cast(g, 0, 'Lightning Bolt', [{ player: 1 }]);
    g.passAll();
    g.expect.life(1, 40);
    g.advanceTo('declareAttackers');
    g.act(0).attack(V33);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 37);
  });
});

describe('creatures you control (CR 611.2c, 615.11)', () => {
  test('"all damage to creatures you control" also covers a creature that enters later', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .hand('Lightning Bolt', 'Lightning Bolt', 'Lightning Bolt')
      .seat(1)
      .battlefield('Plains', 'Plains', 'Forest', 'Forest', BEARS)
      .hand(SHELTER, FLASH_BEAR)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 1, SHELTER);
    g.passAll();
    // The shield is a game rule now: a creature that was not there still counts.
    cast(g, 1, FLASH_BEAR);
    g.passAll();
    cast(g, 0, 'Lightning Bolt', [BEARS]);
    g.passAll();
    cast(g, 0, 'Lightning Bolt', [FLASH_BEAR]);
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(FLASH_BEAR, 'battlefield', { seat: 1 });
    // The player is not a creature: damage to them is dealt.
    cast(g, 0, 'Lightning Bolt', [{ player: 1 }]);
    g.passAll();
    g.expect.life(1, 37);
    expect(amounts(g)).toEqual(['all']);
  });

  test('the shield does not protect the opponent creatures', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Mountain', BEARS)
      .hand('Lightning Bolt')
      .seat(1)
      .battlefield('Plains', 'Plains')
      .hand(SHELTER)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 1, SHELTER);
    g.passAll();
    cast(g, 0, 'Lightning Bolt', [BEARS]);
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('"the next 1 damage to each creature you control": one shield per creature, none for later ones', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .hand('Lightning Bolt', 'Lightning Bolt')
      .seat(1)
      .battlefield('Plains', 'Plains', 'Forest', 'Forest', BEARS, V55)
      .hand(CIRCLE, FLASH_BEAR)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 1, CIRCLE);
    g.passAll();
    expect(shields(g)).toHaveLength(2);
    expect(amounts(g)).toEqual([1, 1]);
    cast(g, 1, FLASH_BEAR);
    g.passAll();
    expect(shields(g)).toHaveLength(2);
    cast(g, 0, 'Lightning Bolt', [V55]);
    g.passAll();
    g.expect.damage(V55, 2);
    expect(shields(g)).toHaveLength(1);
    // The Bears that came later have no shield: 3 damage kills it.
    cast(g, 0, 'Lightning Bolt', [FLASH_BEAR]);
    g.passAll();
    g.expect.zone(FLASH_BEAR, 'graveyard', { seat: 1 });
  });
});

describe('to and by a creature (CR 609.7a)', () => {
  test('combat damage dealt to or by the chosen creature is prevented, other combat damage is not', () => {
    const g = scenario()
      .seat(0)
      .battlefield(V33, V22)
      .seat(1)
      .battlefield('Plains', 'Plains', V55, BEARS)
      .hand(STANDOFF)
      .at('precombatMain', { active: 0 })
      .build();
    toFogWindow(g, [V33, V22], [{ blocker: V55, attacker: V33 }]);
    cast(g, 1, STANDOFF, [V33]);
    g.passAll();
    g.advanceTo('endOfCombat');
    // V33 and its blocker V55 hit each other for nothing; the unblocked 2/2 hits the player.
    g.expect.damage(V55, 0);
    g.expect.damage(V33, 0);
    g.expect.life(1, 38);
    expect(shields(g)).toHaveLength(2);
  });

  test('the "by" half also covers a blocker that deals damage to the chosen attacker', () => {
    const g = scenario()
      .seat(0)
      .battlefield(V22)
      .seat(1)
      .battlefield('Plains', 'Plains', BEARS)
      .hand(STANDOFF)
      .at('precombatMain', { active: 0 })
      .build();
    toFogWindow(g, [V22], [{ blocker: BEARS, attacker: V22 }]);
    cast(g, 1, STANDOFF, [BEARS]);
    g.passAll();
    g.advanceTo('endOfCombat');
    g.expect.damage(BEARS, 0);
    g.expect.damage(V22, 0);
  });
});

describe('legal actions, determinism', () => {
  function window() {
    const g = scenario()
      .seat(0)
      .battlefield(V33)
      .seat(1)
      .battlefield('Plains')
      .hand(FOG)
      .at('precombatMain', { active: 0 })
      .build();
    toFogWindow(g, [V33]);
    return g;
  }

  test('Fog is a listed legal action at instant speed, and every listed action is accepted', () => {
    const legal = window().legalActions(1);
    expect(legal.some((a) => a.kind === 'castSpell')).toBe(true);
    for (const a of legal) {
      if (a.kind === 'concede') continue;
      expect(window().act(1).try.action(a).ok, JSON.stringify(a)).toBe(true);
    }
  });

  test('the same play gives the same state hash, shields included', () => {
    const run = () => {
      const g = window();
      cast(g, 1, FOG);
      g.passAll();
      g.advanceTo('endOfCombat');
      return g.hash();
    };
    expect(run()).toBe(run());
  });
});
