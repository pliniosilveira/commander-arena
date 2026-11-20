// "If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead."
// (Torbran, Thane of Red Fell) and "...a red or artifact source ... plus 1" (Mechanized Warfare): the replacement `damageBonus`. The cards below are
// SYNTHETIC (src/cards/fixtures/synthetic-damage-bonus.ts). Pins: CR 614.1a (an effect that says "instead" is a replacement effect), CR 120.3 (the extra
// damage is dealt by the original source, with its results: combat damage, commander damage, lifelink), CR 614.5 (each effect applies once to an event, so
// two add up), CR 616.1 and 616.1f (the damaged player orders the effects; damage that is all prevented is no longer replaced), CR 609.7 (a spell is a
// source), CR 510.1 (combat damage is assigned before it is replaced: the division of a spell and of an attacker is modified per recipient).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const LORD = 'SYNTHETIC Red Sovereign'; // red creature: red sources +2
const BANNER = 'SYNTHETIC Forge Banner'; // enchantment: red or artifact sources +1
const RAIDER = 'SYNTHETIC Red Raider'; // red 2/2
const GOLEM = 'SYNTHETIC Artifact Golem'; // colorless artifact creature 2/2
const ZAP = 'SYNTHETIC Green Zap'; // green instant, 2 damage to any target
const BOLT = 'Lightning Bolt'; // red instant, 3 damage to any target
const V55 = 'SYNTHETIC Vanilla 5/5';
const VOLLEY = 'SYNTHETIC Arc Volley'; // red instant, 3 damage divided among one to three targets
const SHIELD2 = 'SYNTHETIC Shield Two';
const SHIELD5 = 'SYNTHETIC Shield Five';
const TOISE = 'SYNTHETIC Ancient Adamantoise'; // redirects the damage of its controller to itself

type G = ReturnType<ReturnType<typeof scenario>['build']>;
const BLAST = 'SYNTHETIC Order Blast'; // red instant, 6 damage to any target

function cast(g: G, seat: 0 | 1, card: string, targets?: readonly { player: 0 | 1 }[]): void {
  if (g.state.pending?.kind === 'priority' && g.deciding !== seat && g.state.stack.length === 0) {
    g.pass();
  }
  g.act(seat).cast(`${card}[0]`, { pay: true, ...(targets === undefined ? {} : { targets }) });
}

/** Seat 0 has the Sovereign and the spells, seat 1 has cast `shield` on itself. */
function shielded(shield: string): G {
  const g = scenario()
    .seat(0)
    .battlefield(LORD, 'Mountain', 'Mountain', 'Mountain')
    .hand(BOLT, BLAST)
    .seat(1)
    .battlefield('Plains')
    .hand(shield)
    .at('precombatMain', { active: 0, priority: 1 })
    .build();
  cast(g, 1, shield, [{ player: 1 }]);
  g.passAll();
  return g;
}

describe('the cards are valid', () => {
  test.each([LORD, BANNER])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('damage from a spell', () => {
  test('a red spell deals 2 more damage to an opponent (the spell is the source, CR 609.7)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LORD, 'Mountain')
      .hand(BOLT)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BOLT, { pay: true, targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 35);
  });

  test('the same spell without the effect deals its 3', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Mountain')
      .hand(BOLT)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BOLT, { pay: true, targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 37);
  });

  test('a permanent an opponent controls is dealt the extra damage: a 5/5 that survives 3 dies to 5', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LORD, 'Mountain')
      .hand(BOLT)
      .seat(1)
      .battlefield(V55)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BOLT, { pay: true, targets: [{ name: V55, seat: 1 }] });
    g.passAll();
    g.expect.zone(V55, 'graveyard', { seat: 1 });
  });

  test('a source that is not red is not increased', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LORD, 'Forest')
      .hand(ZAP)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(ZAP, { pay: true, targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 38);
  });

  test('damage to the controller of the effect, or to their permanents, is not increased', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LORD, V55, 'Mountain', 'Mountain')
      .hand(BOLT, BOLT)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast('Lightning Bolt[0]', { pay: true, targets: [{ player: 0 }] });
    g.passAll();
    g.expect.life(0, 37);
    g.act(0).cast('Lightning Bolt[0]', { pay: true, targets: [{ name: V55, seat: 0 }] });
    g.passAll();
    g.expect.damage(V55, 3);
  });

  test('a red source of an opponent is not increased: the source must be controlled by the controller of the effect', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LORD)
      .seat(1)
      .battlefield('Mountain')
      .hand(BOLT)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BOLT, { pay: true, targets: [{ player: 0 }] });
    g.passAll();
    g.expect.life(0, 37);
  });

  test("an opponent's Sovereign works for its own controller only: seat 1 with one deals 5 to seat 0", () => {
    const g = scenario()
      .seat(0)
      .seat(1)
      .battlefield(LORD, 'Mountain')
      .hand(BOLT)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BOLT, { pay: true, targets: [{ player: 0 }] });
    g.passAll();
    g.expect.life(0, 35);
  });
});

describe('combat damage', () => {
  test('a red attacker deals 2 more combat damage to the defending player', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LORD, RAIDER)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([RAIDER]);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 36);
  });

  test('a non-red attacker is not increased by the Sovereign', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LORD, GOLEM)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([GOLEM]);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 38);
  });

  test('the creature with the effect is a red source itself: it deals 2 + 2 when it attacks', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LORD)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([LORD]);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 36);
  });

  test('a blocker is dealt the extra damage too: a red 2/2 deals 4 to a 2/2 blocker (which dies) and the damage the blocker deals is not increased', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LORD, RAIDER)
      .seat(1)
      .battlefield(V55)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([RAIDER]);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: V55, attacker: RAIDER }]);
    g.advanceTo('endOfCombat');
    g.expect.damage(V55, 4);
    g.expect.zone(RAIDER, 'graveyard', { seat: 0 });
  });

  test('the red or artifact effect: an artifact attacker deals 1 more, a red one too, a green one does not', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BANNER, GOLEM, RAIDER, 'Grizzly Bears')
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([GOLEM, RAIDER, 'Grizzly Bears']);
    g.advanceTo('endOfCombat');
    // Golem 2 + 1, Raider 2 + 1, Bears 2: 8 damage in all.
    g.expect.life(1, 32);
  });
});

describe('divided damage: the division is announced first, then each amount is increased (CR 120.3)', () => {
  test('3 damage divided as 1 to a player and 2 to a creature becomes 3 and 4', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LORD, 'Mountain', 'Mountain')
      .hand(VOLLEY)
      .seat(1)
      .battlefield(V55)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(VOLLEY, {
      pay: true,
      targets: [{ player: 1 }, { name: V55, seat: 1 }],
      divide: [1, 2],
    });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.damage(V55, 4);
  });
});

describe('two effects on one event', () => {
  test('the Sovereign and the Banner add up on a red source (+2 and +1) and no question is asked', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LORD, BANNER, 'Mountain')
      .hand(BOLT)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BOLT, { pay: true, targets: [{ player: 1 }] });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 34);
  });

  test('two Banners are two effects (CR 614.5: one opportunity each): +2 in all', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BANNER, BANNER, 'Mountain')
      .hand(BOLT)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BOLT, { pay: true, targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 35);
  });

  test('the Banner alone does nothing for a non-red, non-artifact source', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BANNER, 'Forest')
      .hand(ZAP)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(ZAP, { pay: true, targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 38);
  });

  test('a numeric shield and the increase give the same damage in either order (6 - 2 + 2): the shield is used up and nothing is asked', () => {
    const g = shielded(SHIELD2);
    cast(g, 0, BLAST, [{ player: 1 }]);
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 34);
    expect(g.state.continuousEffects.filter((e) => e.change.kind === 'preventDamage')).toEqual([]);
  });

  test('damage that is all prevented is no longer increased (the ruling of both cards): a shield for 5 against 3 + 2 prevents the 3 and keeps 2', () => {
    const g = shielded(SHIELD5);
    cast(g, 0, BOLT, [{ player: 1 }]);
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 40);
    const left = g.state.continuousEffects.flatMap((e) =>
      e.change.kind === 'preventDamage' ? [e.change.amount] : [],
    );
    expect(left).toEqual([2]);
  });

  test('combat: a shield for 2 against a red 2/2 prevents all of its damage first, so the increase does not apply', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LORD, RAIDER)
      .seat(1)
      .battlefield('Plains')
      .hand(SHIELD2)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 1, SHIELD2, [{ player: 1 }]);
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack([RAIDER]);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 40);
  });

  test('an increase and a redirection: the damage dealt to the player is redirected and the Adamantoise is dealt the increased damage', () => {
    const g = scenario()
      .seat(0)
      .battlefield(LORD, 'Mountain')
      .hand(BOLT)
      .seat(1)
      .battlefield(TOISE)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BOLT, { pay: true, targets: [{ player: 1 }] });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 40);
    g.expect.damage(TOISE, 5);
  });
});

describe('the effect is an ability of the permanent', () => {
  test('without the permanent on the battlefield there is no increase', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Mountain')
      .hand(LORD, BOLT)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BOLT, { pay: true, targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 37);
  });
});
