// Damage redirection and damage that stays (D-192): the SYNTHETIC Ancient Adamantoise plays the real wording of the card (the owner's request file of
// 2026-10-29; its power and toughness, 6/8, are invented). Pins: CR 614.9 (a redirection replaces damage dealt to a player or permanent with the same damage
// dealt to another; it does nothing when the creature has left the battlefield or is no longer a creature), CR 614.5 (one opportunity for each effect on
// an event: two such creatures do not redirect for ever), CR 616.1, 616.1e, 616.1f and 616.2 (the affected player chooses the order; an effect can become
// applicable after another one modified the event), CR 120.3 (what damage does depends on its source and its final recipient: marked damage, infect,
// deathtouch, lifelink, no life loss and no commander damage for a creature), CR 510.2 (combat damage is dealt together, questions first), CR 514.2 and
// CR 704.5g (damage marked on a creature that keeps it through cleanup steps adds up and is lethal when it reaches toughness), CR 613.1f (loses all
// abilities). The rulings of the card could not be read (Scryfall is not reachable from the sandbox): nothing below rests on one.
import { describe, expect, test } from 'vitest';
import { applyAction, type GameEvent, stateHash } from '../src/index';
import { scenario, type TargetRef } from '../src/testing/index';
import { chooseOptionDecision } from './pending-helpers';

const TOISE = 'SYNTHETIC Ancient Adamantoise';
const BOLT = 'Lightning Bolt';
const LIFEBOLT = 'SYNTHETIC Lifelink Bolt';
const BLAST = 'SYNTHETIC Order Blast';
const SHIELD2 = 'SYNTHETIC Shield Two';
const SHIELD3 = 'SYNTHETIC Shield Three';
const SHIELD5 = 'SYNTHETIC Shield Five';
const SELF_WARD = 'SYNTHETIC Self Ward';
const BEARS = 'Grizzly Bears';
const V33 = 'SYNTHETIC Vanilla 3/3';
const V22 = 'SYNTHETIC Vanilla 2/2';
const INFECT = 'SYNTHETIC Infect Bear';
const WITHER = 'SYNTHETIC Wither Imp';
const DEATHTOUCH = 'SYNTHETIC Deathtouch Trampler 4/4';
const ISAMARU = 'Isamaru, Hound of Konda';
const DUEL = 'SYNTHETIC Duel';
const HEX = 'SYNTHETIC Frog Hex';
const MURDER = 'Murder';
const PAIN_LAND = 'SYNTHETIC Pain Land';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';

type G = ReturnType<ReturnType<typeof scenario>['build']>;

const ofKind = <K extends GameEvent['kind']>(events: readonly GameEvent[], kind: K) =>
  events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);
const shields = (g: G) =>
  g.state.continuousEffects.filter((e) => e.change.kind === 'preventDamage');
const amounts = (g: G) =>
  shields(g).map((e) => (e.change.kind === 'preventDamage' ? e.change.amount : null));
const mine = (g: G, name: string, seat: 0 | 1) =>
  g.view(seat).battlefield.filter((o) => o.name === name);
const player = (seat: 0 | 1) => ({ kind: 'player', seat }) as const;

function cast(g: G, seat: 0 | 1, card: string, targets?: readonly TargetRef[]): void {
  if (g.state.pending?.kind === 'priority' && g.deciding !== seat && g.state.stack.length === 0) {
    g.pass();
  }
  g.act(seat).cast(`${card}[0]`, { pay: true, ...(targets === undefined ? {} : { targets }) });
}

/** Seat 0 holds `hand` and three Mountains; seat 1 controls the Adamantoise and `extra`, with Plains for shields. */
function table(
  hand: readonly string[],
  extra: readonly string[] = [],
  shieldCards: readonly string[] = [],
) {
  return scenario()
    .seat(0)
    .battlefield('Mountain', 'Mountain', 'Mountain')
    .hand(...hand)
    .seat(1)
    .battlefield(TOISE, ...extra, ...shieldCards.flatMap(() => ['Plains', 'Plains']))
    .hand(...shieldCards)
    .at('precombatMain', { active: 0, priority: 1 })
    .build();
}

describe('the only effect: nothing is asked and the same source deals the damage to the Adamantoise (CR 614.9, 120.3)', () => {
  test('3 damage to its controller: no life is lost, the Adamantoise has 3 damage marked, and no question is asked', () => {
    const g = table([BOLT]);
    const mark = g.mark();
    cast(g, 0, BOLT, [{ player: 1 }]);
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 40);
    g.expect.damage(TOISE, 3);
    const events = g.eventsSince(mark);
    const [redirected] = ofKind(events, 'damageRedirected');
    expect(redirected).toMatchObject({
      from: player(1),
      to: { kind: 'object', id: g.id(TOISE) },
      amount: 3,
      combat: false,
    });
    const [dealt] = ofKind(events, 'damageDealt');
    // The damage is dealt by the same source: the spell.
    expect(dealt).toMatchObject({ to: { kind: 'object', id: g.id(TOISE) }, amount: 3 });
    expect(dealt?.source).toBe(redirected?.source);
    expect(ofKind(events, 'lifeChanged').filter((e) => e.seat === 1)).toEqual([]);
    expect(ofKind(events, 'damagePrevented')).toEqual([]);
  });

  test('3 damage to another permanent its controller has: the creature is not damaged and lives, the Adamantoise takes it', () => {
    const g = table([BOLT], [BEARS]);
    cast(g, 0, BOLT, [{ name: BEARS, seat: 1 }]);
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.damage(BEARS, 0);
    g.expect.damage(TOISE, 3);
    g.expect.life(1, 40);
  });

  test('3 damage to the Adamantoise itself is not redirected ("other permanents": it is dealt to it as it would be)', () => {
    // Its controller casts the spell: ward {3} would counter the spell of an opponent that cannot pay.
    const g = scenario()
      .seat(0)
      .battlefield(TOISE, 'Mountain')
      .hand(BOLT)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    const mark = g.mark();
    cast(g, 0, BOLT, [{ name: TOISE, seat: 0 }]);
    g.passAll();
    g.expect.damage(TOISE, 3);
    expect(ofKind(g.eventsSince(mark), 'damageRedirected')).toEqual([]);
  });

  test('damage to the opponent of its controller, and to the creatures of that opponent, is not redirected', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS)
      .seat(1)
      .battlefield(TOISE, 'Mountain', 'Mountain', 'Mountain')
      .hand(BOLT, BOLT)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 1, BOLT, [{ player: 0 }]);
    g.passAll();
    g.expect.life(0, 37);
    cast(g, 1, BOLT, [{ name: BEARS, seat: 0 }]);
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.damage(TOISE, 0);
  });

  test('damage to a planeswalker its controller has is redirected too, and the loyalty stays', () => {
    const g = table([BOLT], [WALKER]);
    cast(g, 0, BOLT, [{ name: WALKER, seat: 1 }]);
    g.passAll();
    g.expect.counters(WALKER, { loyalty: 4 });
    g.expect.damage(TOISE, 3);
  });

  test('with no Adamantoise on the battlefield damage is dealt as always (CR 614.9: the effect does nothing)', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Mountain')
      .hand(BOLT)
      .seat(1)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 0, BOLT, [{ player: 1 }]);
    g.passAll();
    g.expect.life(1, 37);
  });

  test('the damage a pain land deals to its controller is redirected too: the rider of a mana ability asks nothing', () => {
    const g = scenario()
      .seat(0)
      .battlefield(PAIN_LAND, TOISE)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).tapForMana(PAIN_LAND, { color: 'U', ability: 1 });
    g.expect.life(0, 40);
    g.expect.damage(TOISE, 1);
  });
});

describe('the source keeps its properties: what the damage does is decided by the creature that receives it (CR 120.3)', () => {
  test('lifelink: the source controller gains life for damage dealt to the Adamantoise, and the player does not lose any', () => {
    const g = table([LIFEBOLT]);
    cast(g, 0, LIFEBOLT, [{ player: 1 }]);
    g.passAll();
    g.expect.life(1, 40);
    g.expect.life(0, 43);
    g.expect.damage(TOISE, 3);
  });

  test('infect: -1/-1 counters on the Adamantoise (CR 120.3d), no poison counters on the player (CR 120.3b)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(INFECT)
      .seat(1)
      .battlefield(TOISE)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([INFECT]);
    g.advanceTo('endOfCombat');
    g.expect.counters(TOISE, { '-1/-1': 2 });
    g.expect.damage(TOISE, 0);
    expect(g.state.seats[1]?.poison).toBe(0);
  });

  test('wither: -1/-1 counters on the Adamantoise for damage to its controller', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WITHER)
      .seat(1)
      .battlefield(TOISE)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([WITHER]);
    g.advanceTo('endOfCombat');
    g.expect.counters(TOISE, { '-1/-1': 2 });
    g.expect.life(1, 40);
  });

  test('deathtouch: a deathtouch attacker the player does not block kills the Adamantoise, which exiles itself and makes ten tapped Treasures', () => {
    const g = scenario()
      .seat(0)
      .battlefield(DEATHTOUCH)
      .seat(1)
      .battlefield(TOISE)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([DEATHTOUCH]);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 40);
    g.passAll(); // the dies trigger
    g.expect.zone(TOISE, 'exile', { seat: 1 });
    const treasures = mine(g, 'Treasure', 1);
    expect(treasures).toHaveLength(10);
    expect(treasures.every((t) => t.tapped)).toBe(true);
  });

  test('a commander that is redirected deals no commander damage (CR 903.10a: damage dealt to a player), and the player loses no life', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ISAMARU, { commander: true })
      .seat(1)
      .battlefield(TOISE)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([ISAMARU]);
    g.advanceTo('endOfCombat');
    g.expect.commanderDamage(1, ISAMARU, 0);
    g.expect.life(1, 40);
    g.expect.damage(TOISE, 2);
    expect(g.state.turnLog.combatDamaged).toEqual([]);
  });
});

describe('combat damage (CR 510.2)', () => {
  test('damage a blocker is dealt goes to the Adamantoise, so the blocker lives; the damage the blocker deals is not redirected', () => {
    const g = scenario()
      .seat(0)
      .battlefield(V33)
      .seat(1)
      .battlefield(TOISE, BEARS)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([V33]);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: BEARS, attacker: V33 }]);
    g.advanceTo('endOfCombat');
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.damage(BEARS, 0);
    g.expect.damage(TOISE, 3);
    g.expect.damage(V33, 2); // seat 0 has no such creature: the Bears' damage is dealt to it as always
  });

  test('two attackers hit the Adamantoise in the one damage step: both are redirected, the damage adds up, and it dies after the step', () => {
    const g = scenario()
      .seat(0)
      .battlefield(V33, V33, V22)
      .seat(1)
      .battlefield(TOISE)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.damage(TOISE, 0);
    g.advanceTo('declareAttackers');
    g.act(0).attack([`${V33}[0]`, `${V33}[1]`, V22]);
    g.advanceTo('endOfCombat');
    g.expect.life(1, 40);
    // 3 + 3 + 2 = 8, the toughness: lethal damage (CR 704.5g), so it dies and its trigger exiles it.
    g.passAll();
    g.expect.zone(TOISE, 'exile', { seat: 1 });
    expect(mine(g, 'Treasure', 1)).toHaveLength(10);
  });

  test('an attacker the Adamantoise blocks is dealt damage by it as always, and the Adamantoise takes the damage of the attacker once', () => {
    const g = scenario()
      .seat(0)
      .battlefield(V33)
      .seat(1)
      .battlefield(TOISE)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([V33]);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: TOISE, attacker: V33 }]);
    g.advanceTo('endOfCombat');
    g.expect.damage(TOISE, 3);
    g.expect.zone(V33, 'graveyard', { seat: 0 });
  });
});

describe('combat damage with a shield on the defending player: the question comes before any damage is dealt (CR 510.2, 616.1)', () => {
  const toDamage = () => {
    const g = scenario()
      .seat(0)
      .battlefield(V33)
      .seat(1)
      .battlefield(TOISE, 'Plains', 'Plains')
      .hand(SHIELD3)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 1, SHIELD3, [{ player: 1 }]);
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack([V33]);
    g.advanceTo('combatDamage');
    return g;
  };

  test('the defending player is asked, with the plan in the question, and nothing is dealt yet', () => {
    const g = toDamage();
    const d = chooseOptionDecision(g);
    expect(d.seat).toBe(1);
    expect(d.replacement?.event).toMatchObject({
      sourceName: V33,
      to: player(1),
      amount: 3,
      combat: true,
    });
    expect(d.replacement?.resume).toMatchObject({ step: 'regular', answers: [] });
    expect(d.replacement?.choices.map((c) => c.kind)).toEqual(['prevent', 'redirect']);
    g.expect.life(1, 40);
    g.expect.damage(TOISE, 0);
  });

  test('the redirection first: the Adamantoise takes the combat damage, the player is not dealt combat damage, the shield is kept', () => {
    const g = toDamage();
    g.act(1).chooseOption(chooseOptionDecision(g).options[1] ?? '');
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 40);
    g.expect.damage(TOISE, 3);
    expect(g.state.turnLog.combatDamaged).toEqual([]);
    expect(amounts(g)).toEqual([3]);
  });

  test('the shield first: the damage is prevented and the Adamantoise has none', () => {
    const g = toDamage();
    g.act(1).chooseOption(chooseOptionDecision(g).options[0] ?? '');
    g.expect.life(1, 40);
    g.expect.damage(TOISE, 0);
    expect(amounts(g)).toEqual([]);
  });
});

describe('a fight: the damage to a creature of the controller goes to the Adamantoise (CR 614.9)', () => {
  test('the other fighter deals its damage back as always', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Forest', 'Forest', V33)
      .hand(DUEL)
      .seat(1)
      .battlefield(TOISE, BEARS)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 0, DUEL, [V33, { name: BEARS, seat: 1 }]);
    g.passAll();
    g.expect.damage(BEARS, 0);
    g.expect.damage(TOISE, 3);
    g.expect.damage(V33, 2);
  });
});

describe('a prevention shield on the original recipient: the affected player chooses (CR 616.1, 616.1e)', () => {
  const withShieldOnPlayer = (shield: string, burn = BOLT) => {
    const g = table([burn], [], [shield]);
    cast(g, 1, shield, shield === SELF_WARD ? undefined : [{ player: 1 }]);
    g.passAll();
    cast(g, 0, burn, [{ player: 1 }]);
    g.passAll();
    return g;
  };

  test('a shield for 3 and 3 damage: the affected player is asked, with prevention first and the redirection second', () => {
    const g = withShieldOnPlayer(SHIELD3);
    const d = chooseOptionDecision(g);
    expect(d.purpose).toBe('replacement');
    expect(d.seat).toBe(1);
    expect(d.options).toHaveLength(2);
    expect(d.options[0]).toMatch(/^shield:/);
    expect(d.options[1]).toBe(`redirect:${g.id(TOISE)}:3`);
    expect(d.replacement?.event).toMatchObject({
      sourceName: BOLT,
      to: player(1),
      amount: 3,
      combat: false,
    });
    expect(d.replacement?.choices.map((c) => c.kind)).toEqual(['prevent', 'redirect']);
    expect(d.replacement?.choices.map((c) => c.text)).toEqual([
      'Prevent the next 3 damage that would be dealt to you this turn',
      `Deal it to ${TOISE} instead`,
    ]);
    expect(d.replacement?.choices[1]).toMatchObject({ object: g.id(TOISE), objectName: TOISE });
    expect(d.replacement?.choices.map((c) => c.outcome)).toEqual([
      { to: player(1), amount: 0, prevented: 3 },
      { to: { kind: 'object', id: g.id(TOISE) }, toName: TOISE, amount: 3, prevented: 0 },
    ]);
    g.expect.life(1, 40);
    g.expect.damage(TOISE, 0); // nothing is dealt before the answer
  });

  test('prevention first: the damage is never dealt (CR 615.6), the shield is used up and the Adamantoise has no damage', () => {
    const g = withShieldOnPlayer(SHIELD3);
    const mark = g.mark();
    g.act(1).chooseOption(chooseOptionDecision(g).options[0] ?? '');
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 40);
    g.expect.damage(TOISE, 0);
    expect(amounts(g)).toEqual([]);
    const events = g.eventsSince(mark);
    expect(ofKind(events, 'damageRedirected')).toEqual([]);
    expect(ofKind(events, 'replacementChosen')).toHaveLength(1);
  });

  test('the redirection first: the Adamantoise takes the damage and the shield on the player is kept whole', () => {
    const g = withShieldOnPlayer(SHIELD3);
    const mark = g.mark();
    g.act(1).chooseOption(chooseOptionDecision(g).options[1] ?? '');
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 40);
    g.expect.damage(TOISE, 3);
    expect(amounts(g)).toEqual([3]);
    const events = g.eventsSince(mark);
    expect(ofKind(events, 'replacementChosen')[0]).toMatchObject({
      seat: 1,
      text: `Deal it to ${TOISE} instead`,
    });
    expect(ofKind(events, 'damageRedirected')).toHaveLength(1);
  });

  test('a shield for 2 and 3 damage: prevention first leaves 1, which only the redirection applies to (no second question)', () => {
    const g = withShieldOnPlayer(SHIELD2);
    const d = chooseOptionDecision(g);
    expect(d.replacement?.choices.map((c) => c.outcome)).toEqual([
      { to: { kind: 'object', id: g.id(TOISE) }, toName: TOISE, amount: 1, prevented: 2 },
      { to: { kind: 'object', id: g.id(TOISE) }, toName: TOISE, amount: 3, prevented: 0 },
    ]);
    g.act(1).chooseOption(d.options[0] ?? '');
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 40);
    g.expect.damage(TOISE, 1);
    expect(amounts(g)).toEqual([]);
  });

  test('a shield for 5: either order ends with no damage to deal on the player, but the shield left differs, so it is asked; redirect first keeps 5', () => {
    const g = withShieldOnPlayer(SHIELD5);
    g.act(1).chooseOption(chooseOptionDecision(g).options[1] ?? '');
    g.expect.damage(TOISE, 3);
    expect(amounts(g)).toEqual([5]);
  });

  test('a shield that prevents all damage to the player is the best order by itself: nothing is asked, the damage is prevented, the shield stays', () => {
    const g = withShieldOnPlayer(SELF_WARD);
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 40);
    g.expect.damage(TOISE, 0);
    expect(amounts(g)).toEqual(['all']);
  });

  test('the answer is refused unless it is one of the options, or from the player who is not asked, and nothing changes', () => {
    const g = withShieldOnPlayer(SHIELD3);
    const before = stateHash(g.state);
    for (const bad of ['', 'shield:ce999', `redirect:${g.id(TOISE)}:0`]) {
      expect(applyAction(g.state, 1, { kind: 'chooseOption', option: bad }).ok).toBe(false);
    }
    const valid = chooseOptionDecision(g).options[1] ?? '';
    expect(applyAction(g.state, 0, { kind: 'chooseOption', option: valid }).ok).toBe(false);
    expect(stateHash(g.state)).toBe(before);
  });

  test('a shield on another creature of the controller: damage to that creature asks the same way', () => {
    const g = table([BOLT], [BEARS], [SHIELD3]);
    cast(g, 1, SHIELD3, [{ name: BEARS, seat: 1 }]);
    g.passAll();
    cast(g, 0, BOLT, [{ name: BEARS, seat: 1 }]);
    g.passAll();
    const d = chooseOptionDecision(g);
    expect(d.seat).toBe(1);
    expect(d.replacement?.event?.to).toEqual({ kind: 'object', id: g.id(BEARS) });
    expect(d.replacement?.choices[0]?.text).toBe(
      `Prevent the next 3 damage that would be dealt to ${BEARS} this turn`,
    );
    g.act(1).chooseOption(d.options[1] ?? '');
    g.expect.damage(BEARS, 0);
    g.expect.damage(TOISE, 3);
  });
});

describe('a shield on the Adamantoise applies once the damage is redirected to it (CR 616.2)', () => {
  test('the shield does not apply to the damage to the player, applies to the redirected damage, and only one effect applies at each step: no question', () => {
    const g = table([BOLT], [], [SHIELD3]);
    cast(g, 1, SHIELD3, [{ name: TOISE, seat: 1 }]);
    g.passAll();
    const mark = g.mark();
    cast(g, 0, BOLT, [{ player: 1 }]);
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.life(1, 40);
    g.expect.damage(TOISE, 0);
    expect(amounts(g)).toEqual([]);
    const events = g.eventsSince(mark);
    expect(ofKind(events, 'damageRedirected')).toHaveLength(1);
    expect(ofKind(events, 'damagePrevented')).toEqual([
      expect.objectContaining({ to: { kind: 'object', id: g.id(TOISE) }, amount: 3 }),
    ]);
  });

  test('a shield on the player and a shield on the Adamantoise: asked, and each order uses the other shield', () => {
    const g = table([BOLT], [], [SHIELD3, SHIELD5]);
    cast(g, 1, SHIELD3, [{ player: 1 }]);
    g.passAll();
    cast(g, 1, SHIELD5, [{ name: TOISE, seat: 1 }]);
    g.passAll();
    cast(g, 0, BOLT, [{ player: 1 }]);
    g.passAll();
    const d = chooseOptionDecision(g);
    expect(d.replacement?.choices.map((c) => c.outcome)).toEqual([
      { to: player(1), amount: 0, prevented: 3 },
      { to: { kind: 'object', id: g.id(TOISE) }, toName: TOISE, amount: 0, prevented: 3 },
    ]);
    // The redirection first: the shield of the player is kept (3), the shield of the Adamantoise prevents the 3 and keeps 2.
    g.act(1).chooseOption(d.options[1] ?? '');
    g.expect.life(1, 40);
    g.expect.damage(TOISE, 0);
    expect(amounts(g).sort()).toEqual([2, 3]);
  });

  test('prevention on the player first: the shield on the Adamantoise is not used', () => {
    const g = table([BOLT], [], [SHIELD3, SHIELD5]);
    cast(g, 1, SHIELD3, [{ player: 1 }]);
    g.passAll();
    cast(g, 1, SHIELD5, [{ name: TOISE, seat: 1 }]);
    g.passAll();
    cast(g, 0, BOLT, [{ player: 1 }]);
    g.passAll();
    g.act(1).chooseOption(chooseOptionDecision(g).options[0] ?? '');
    expect(amounts(g)).toEqual([5]);
  });
});

describe('two Adamantoises: each redirection is applied once (CR 614.5) and the affected player chooses which first (CR 616.1)', () => {
  const two = (hand: readonly string[], extra: readonly string[] = []) =>
    scenario()
      .seat(0)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .hand(...hand)
      .seat(1)
      .battlefield(TOISE, TOISE, ...extra)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
  const toises = (g: G) => g.find({ name: TOISE, zone: 'battlefield' }).map((o) => o.id);

  test('damage to the player: asked which redirection is applied first; the other then applies to the result, and the last one decides', () => {
    const g = two([BOLT]);
    const [a, b] = toises(g);
    if (a === undefined || b === undefined) throw new Error('two Adamantoises');
    cast(g, 0, BOLT, [{ player: 1 }]);
    g.passAll();
    const d = chooseOptionDecision(g);
    expect(d.seat).toBe(1);
    expect(d.options).toEqual([`redirect:${a}:3`, `redirect:${b}:3`]);
    // The first redirection to one, then the other redirects the damage dealt to "other permanents you control" to itself.
    expect(d.replacement?.choices.map((c) => (c.outcome as { to: unknown }).to)).toEqual([
      { kind: 'object', id: b },
      { kind: 'object', id: a },
    ]);
    const mark = g.mark();
    g.act(1).chooseOption(d.options[0] ?? '');
    expect(g.state.pending?.kind).toBe('priority'); // only one effect applies at the second step: no second question
    g.expect.life(1, 40);
    expect(g.object(a).damage).toBe(0);
    expect(g.object(b).damage).toBe(3);
    expect(ofKind(g.eventsSince(mark), 'damageRedirected')).toHaveLength(2);
  });

  test('the other answer gives the other Adamantoise the damage', () => {
    const g = two([BOLT]);
    const [a, b] = toises(g);
    if (a === undefined || b === undefined) throw new Error('two Adamantoises');
    cast(g, 0, BOLT, [{ player: 1 }]);
    g.passAll();
    g.act(1).chooseOption(chooseOptionDecision(g).options[1] ?? '');
    expect(g.object(a).damage).toBe(3);
    expect(g.object(b).damage).toBe(0);
  });

  test('damage to one of them: the other redirects it to itself, then the first redirects it back; it ends where it began, with no question', () => {
    // Its controller casts the spell: ward {3} would counter the spell of an opponent that cannot pay.
    const g = scenario()
      .seat(0)
      .seat(1)
      .battlefield(TOISE, TOISE, 'Mountain')
      .hand(BOLT)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    const [a, b] = toises(g);
    if (a === undefined || b === undefined) throw new Error('two Adamantoises');
    const mark = g.mark();
    cast(g, 1, BOLT, [a]);
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    expect(g.object(a).damage).toBe(3);
    expect(g.object(b).damage).toBe(0);
    const redirects = ofKind(g.eventsSince(mark), 'damageRedirected');
    expect(redirects.map((e) => [e.from, e.to])).toEqual([
      [
        { kind: 'object', id: a },
        { kind: 'object', id: b },
      ],
      [
        { kind: 'object', id: b },
        { kind: 'object', id: a },
      ],
    ]);
  });

  test('damage to another creature of the controller is asked about as damage to the player is', () => {
    const g = two([BOLT], [BEARS]);
    cast(g, 0, BOLT, [{ name: BEARS, seat: 1 }]);
    g.passAll();
    const d = chooseOptionDecision(g);
    expect(d.replacement?.event?.to).toEqual({ kind: 'object', id: g.id(BEARS) });
    expect(d.options).toHaveLength(2);
    g.act(1).chooseOption(d.options[0] ?? '');
    g.expect.damage(BEARS, 0);
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });
});

describe('the Adamantoise leaves the battlefield or loses its abilities (CR 614.9, 613.1f)', () => {
  test('it dies in response: the damage that would have been redirected is dealt to the player', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Mountain')
      .hand(BOLT)
      .seat(1)
      .battlefield(TOISE, 'Swamp', 'Swamp', 'Swamp')
      .hand(MURDER)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 0, BOLT, [{ player: 1 }]);
    g.pass(0);
    cast(g, 1, MURDER, [{ name: TOISE, seat: 1 }]);
    g.passAll();
    g.expect.zone(TOISE, 'exile', { seat: 1 });
    g.passAll();
    g.expect.life(1, 37);
  });

  test('it loses all abilities in response: it does not redirect, and the damage is dealt to the player', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Mountain')
      .hand(BOLT)
      .seat(1)
      .battlefield(TOISE, 'Island', 'Island')
      .hand(HEX)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 0, BOLT, [{ player: 1 }]);
    g.pass(0);
    cast(g, 1, HEX, [{ name: TOISE, seat: 1 }]);
    g.passAll();
    g.passAll();
    g.expect.life(1, 37);
  });
});

describe('damage that stays through cleanup steps (CR 514.2)', () => {
  const FILLER = Array.from({ length: 12 }, () => 'Plains');

  test('the damage on the Adamantoise stays through the end of turn while the damage on another creature and a shield end; the next turn adds to it, and lethal damage kills it (CR 704.5g)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        BEARS,
      )
      .hand(BOLT, BLAST)
      .library(...FILLER)
      .seat(1)
      .battlefield(TOISE, 'Plains', 'Plains', V22)
      .hand(SHIELD5)
      .library(...FILLER)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 0, BOLT, [{ name: V22, seat: 1 }]); // redirected: the Adamantoise has 3, the 2/2 has none
    g.passAll();
    cast(g, 1, SHIELD5, [{ player: 0 }]);
    g.passAll();
    g.expect.damage(TOISE, 3);
    expect(amounts(g)).toEqual([5]);
    g.advanceTo('upkeep', { turn: 2 });
    expect(amounts(g)).toEqual([]); // "until end of turn" effects still end (CR 514.2)
    g.expect.damage(TOISE, 3); // damage is not removed from this creature
    g.advanceTo('precombatMain', { turn: 3 });
    g.expect.damage(TOISE, 3);
    cast(g, 0, BLAST, [{ player: 1 }]);
    g.passAll();
    // 3 + 6 = 9 damage against toughness 8.
    g.passAll();
    g.expect.zone(TOISE, 'exile', { seat: 1 });
    g.expect.life(1, 40);
  });

  test('the damage on a creature without the ability is removed at cleanup, as always', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TOISE, V33)
      .library(...FILLER)
      .seat(1)
      .battlefield('Mountain')
      .hand(BOLT)
      .library(...FILLER)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    cast(g, 1, BOLT, [{ name: V33, seat: 0 }]);
    g.passAll();
    g.expect.damage(TOISE, 3);
    g.expect.damage(V33, 0);
    g.advanceTo('upkeep', { turn: 2 });
    g.expect.damage(TOISE, 3);
  });
});

describe('the game with a question is deterministic and replays', () => {
  const build = () =>
    scenario()
      .seat(0)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .hand(BOLT)
      .seat(1)
      .battlefield(TOISE, 'Plains', 'Plains')
      .hand(SHIELD3)
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
  const play = (game: G): G => {
    cast(game, 1, SHIELD3, [{ player: 1 }]);
    game.passAll();
    cast(game, 0, BOLT, [{ player: 1 }]);
    game.passAll();
    game.act(1).chooseOption(chooseOptionDecision(game).options[1] ?? '');
    return game;
  };

  test('the same moves on two copies of the scenario give the same log and the same state', () => {
    const a = play(build());
    const b = play(build());
    expect(a.log).toEqual(b.log);
    expect(stateHash(a.state)).toBe(stateHash(b.state));
  });

  test('the action log replays on a fresh copy to the same state, the answer checked against the options the replay recomputes', () => {
    const played = play(build());
    let state = build().state;
    for (const { seat, action } of played.log) {
      const r = applyAction(state, seat, action);
      if (!r.ok) throw new Error(`replay rejected ${action.kind}: ${r.error}`);
      state = r.state;
    }
    expect(state).toEqual(played.state);
  });
});
