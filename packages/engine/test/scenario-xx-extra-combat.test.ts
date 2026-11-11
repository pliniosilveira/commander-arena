// "After this phase, there is an additional combat phase", "untap all attacking creatures", Dethrone, "attacks for the first time each turn",
// "put a creature card from your hand onto the battlefield tapped and attacking" and Pack tactics' total power (D-151).
// Pins: CR 500.8 and 500.10 (an additional phase follows the one that ends, the turn goes on after it), CR 506.4 (a creature is removed from combat
// when the phase ends; it can attack again in the additional one), CR 702.105a (Dethrone: the player attacked has the most life or is tied for it),
// CR 508.4 (a creature put onto the battlefield attacking was never declared as an attacker: no attack triggers), CR 603.4 (intervening "if"),
// CR 702.116a (Myriad: no other opponent with two players). Cards are SYNTHETIC (src/cards/fixtures/synthetic-dragons-combat.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const CHARGE = 'SYNTHETIC Charge Wyrm';
const USURPER = 'SYNTHETIC Usurper Wyrm';
const KOBOLD = 'SYNTHETIC Pack Kobold';
const ECHO = 'SYNTHETIC Echo Drake';
const BEARS = 'Grizzly Bears';
const YARGLE = 'Yargle, Glutton of Urborg';
const LIBRARY = Array.from({ length: 12 }, () => 'Mountain');

describe('the cards are valid', () => {
  test.each([CHARGE, USURPER, KOBOLD, ECHO])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('the shapes that are refused', () => {
    const card = syntheticCard(ECHO);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const withAbility = (ability: unknown) =>
      ({ ...card, faces: [{ ...face, abilities: [ability] }] }) as never;
    const on = (trigger: unknown, effect: unknown, extra: Record<string, unknown> = {}) =>
      withAbility({ kind: 'triggered', trigger, effect, ...extra });
    const attacks = { kind: 'attacks', what: { kind: 'this' } };
    // an additional combat phase and a creature that enters attacking belong to an attack trigger
    expect(validateCard(on(attacks, { kind: 'extraCombat' }))).toEqual([]);
    expect(
      validateCard(on({ kind: 'upkeep', whose: 'you' }, { kind: 'extraCombat' })).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(
        on(
          { kind: 'upkeep', whose: 'you' },
          { kind: 'enterAttacking', objects: { kind: 'moved' } },
        ),
      ).length,
    ).toBeGreaterThan(0);
    // enterAttacking names the creatures an earlier effect moved
    expect(
      validateCard(on(attacks, { kind: 'enterAttacking', objects: { kind: 'this' } })).length,
    ).toBeGreaterThan(0);
    // firstTimeEachTurn is true, and does not go with alone
    expect(
      validateCard(on({ ...attacks, firstTimeEachTurn: true }, { kind: 'extraCombat' })),
    ).toEqual([]);
    expect(
      validateCard(on({ ...attacks, firstTimeEachTurn: false }, { kind: 'extraCombat' })).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(
        on({ ...attacks, firstTimeEachTurn: true, alone: true }, { kind: 'extraCombat' }),
      ).length,
    ).toBeGreaterThan(0);
    // total power is a positive whole number
    expect(
      validateCard(
        on(
          attacks,
          { kind: 'extraCombat' },
          { interveningIf: { kind: 'attackersTotalPower', atLeast: 0 } },
        ),
      ).length,
    ).toBeGreaterThan(0);
  });
});

const COMBAT_STEPS = [
  'beginningOfCombat',
  'declareAttackers',
  'declareBlockers',
  'firstStrikeDamage',
  'combatDamage',
  'endOfCombat',
];

/** Passes priority until the combat is over: the damage is dealt, and an additional phase (or the next phase) is reached. */
function finishCombat(g: ReturnType<typeof attackGame>): void {
  for (let i = 0; i < 8 && g.state.pending?.kind === 'priority'; i += 1) {
    if (!COMBAT_STEPS.includes(g.state.turn.step)) return;
    g.passAll();
  }
}

/** Seat 0 with these creatures and lands attacks; the opponent has `life` and `theirs`. */
function attackGame(opts: {
  readonly mine: readonly string[];
  readonly lands?: number;
  readonly hand?: readonly string[];
  readonly theirs?: readonly string[];
  readonly life?: number;
}) {
  let b = scenario()
    .seat(0)
    .library(...LIBRARY);
  for (const name of opts.mine) b = b.battlefield(name);
  for (let i = 0; i < (opts.lands ?? 0); i += 1) b = b.battlefield('Mountain');
  if (opts.hand !== undefined) b = b.hand(...opts.hand);
  b = b.seat(1).library(...LIBRARY);
  for (const name of opts.theirs ?? []) b = b.battlefield(name);
  if (opts.life !== undefined) b = b.life(opts.life);
  const g = b.build();
  g.advanceTo('declareAttackers', { attack: false });
  return g;
}

describe('an additional combat phase, with the attackers untapped', () => {
  test('I pay, the attackers untap and a second combat phase follows: they attack again', () => {
    const g = attackGame({ mine: [CHARGE, BEARS], lands: 3 });
    g.act(0).attack([CHARGE, BEARS]);
    g.passAll();
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    finishCombat(g);
    // the first combat: the opponent took 4 + 2, and the attackers are untapped
    g.expect.life(1, 34);
    g.expect.tapped(CHARGE, false);
    g.expect.tapped(BEARS, false);
    // the additional combat phase: the declaration of attackers comes again
    expect(g.state.turn.step).toBe('declareAttackers');
    g.expect.pending('declareAttackers', 0);
    g.act(0).attack([CHARGE, BEARS]);
    // the Wyrm triggers again, but my lands are tapped: nothing can be paid, so nothing is asked
    g.passAll();
    finishCombat(g);
    g.expect.life(1, 28);
    expect(g.state.turn.step).toBe('postcombatMain');
    g.expect.invariants();
  });

  test('declining the payment: no additional phase', () => {
    const g = attackGame({ mine: [CHARGE, BEARS], lands: 3 });
    g.act(0).attack([CHARGE, BEARS]);
    g.passAll();
    g.act(0).decline();
    g.passAll();
    finishCombat(g);
    g.expect.life(1, 34);
    g.expect.tapped(CHARGE, true);
    expect(g.state.turn.step).toBe('postcombatMain');
  });

  test('the turn goes on after the additional phase: no attack in it, the postcombat main phase comes next', () => {
    const g = attackGame({ mine: [CHARGE], lands: 3 });
    g.act(0).attack([CHARGE]);
    g.passAll();
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    finishCombat(g);
    g.act(0).noAttackers();
    finishCombat(g);
    expect(g.state.turn.step).toBe('postcombatMain');
    expect(g.state.turn.addedPhases ?? []).toEqual([]);
  });

  test('two additional phases add up', () => {
    const g = attackGame({ mine: [CHARGE], lands: 6 });
    g.act(0).attack([CHARGE]);
    g.passAll();
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    finishCombat(g);
    g.act(0).attack([CHARGE]);
    g.passAll();
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    finishCombat(g);
    g.act(0).attack([CHARGE]);
    g.passAll();
    finishCombat(g);
    g.expect.life(1, 28);
    expect(g.state.turn.step).toBe('postcombatMain');
  });
});

describe('Dethrone and "attacks for the first time each turn"', () => {
  test('the opponent has the most life (40 against 40, tied): +1/+1 counter, untap, additional combat', () => {
    const g = attackGame({ mine: [USURPER, BEARS] });
    g.act(0).attack([USURPER, BEARS]);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    finishCombat(g);
    g.expect.counters(USURPER, { '+1/+1': 1 });
    g.expect.life(1, 40 - 6 - 2);
    g.expect.pending('declareAttackers', 0);
  });

  test('the opponent has less life than I do: no counter, nothing untaps, no additional phase', () => {
    const g = attackGame({ mine: [USURPER, BEARS], life: 20 });
    g.act(0).attack([USURPER, BEARS]);
    g.passAll();
    finishCombat(g);
    g.expect.counters(USURPER, {});
    g.expect.life(1, 13);
    g.expect.tapped(BEARS, true);
    expect(g.state.turn.phase).not.toBe('combat');
  });

  test('the first-time ability does not trigger again in the additional combat phase, Dethrone does', () => {
    const g = attackGame({ mine: [USURPER] });
    g.act(0).attack([USURPER]);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    finishCombat(g);
    g.expect.counters(USURPER, { '+1/+1': 1 });
    // the additional combat phase: the opponent is at 34 and I am at 40, so the Wyrm no longer attacks the player with the most life
    g.act(0).attack([USURPER]);
    g.passAll();
    finishCombat(g);
    g.expect.counters(USURPER, { '+1/+1': 1 });
    expect(g.state.turn.step).not.toBe('declareAttackers');
    expect(g.state.turn.addedPhases ?? []).toEqual([]);
  });
});

describe('a creature put onto the battlefield tapped and attacking (Pack tactics)', () => {
  const TOTAL = [KOBOLD, BEARS, YARGLE];

  test('with total power 6 or more attacking: the Dragon from my hand enters attacking and deals damage', () => {
    const g = attackGame({ mine: [KOBOLD, BEARS, YARGLE], hand: [CHARGE] });
    g.act(0).attack(TOTAL);
    g.passAll();
    g.act(0).chooseCards(CHARGE);
    g.passAll();
    finishCombat(g);
    g.expect.zone(CHARGE, 'battlefield', { seat: 0 });
    g.expect.tapped(CHARGE, true);
    // the Wyrm attacked (4 flying) without being declared, so its own attack trigger did not run (no question)
    g.expect.life(1, 40 - 15);
    g.expect.invariants();
  });

  test('with less total power: no trigger', () => {
    const g = attackGame({ mine: [KOBOLD, BEARS], hand: [CHARGE] });
    g.act(0).attack([KOBOLD, BEARS]);
    g.passAll();
    finishCombat(g);
    g.expect.zone(CHARGE, 'hand', { seat: 0 });
    g.expect.pending('priority', 0);
  });

  test('I may decline: the Dragon stays in my hand', () => {
    const g = attackGame({ mine: [KOBOLD, BEARS, YARGLE], hand: [CHARGE] });
    g.act(0).attack(TOTAL);
    g.passAll();
    g.act(0).chooseCards();
    g.passAll();
    finishCombat(g);
    g.expect.zone(CHARGE, 'hand', { seat: 0 });
  });
});

describe('Myriad with two players', () => {
  test('there is no opponent other than the defending player: no token', () => {
    const g = attackGame({ mine: [ECHO] });
    g.act(0).attack([ECHO]);
    g.passAll();
    finishCombat(g);
    g.expect.pending('priority', 0);
    g.expect.life(1, 36);
  });
});
