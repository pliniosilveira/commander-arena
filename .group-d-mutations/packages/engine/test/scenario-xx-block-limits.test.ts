// "Each creature you control with power 4 or greater can't be blocked by more than one creature" (D-133): a restriction on
// how many creatures may block an attacker, given by a static ability to the creatures of a filter that compares power.
// Pins: CR 509.1b (the defending player can't declare blockers that violate a restriction: here, more than one blocker for the
// attacker), CR 509.1a, CR 702.111b (menace: no fewer than two blockers, so with this restriction nothing can block it), CR
// 613.8 (an effect whose subject compares power applies after the effects that change power), CR 611.3a (it follows the board).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-subjects.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { type ScenarioGame, scenario } from '../src/testing/index';

const BANNER = 'SYNTHETIC Banner of the Lone Duel'; // my creatures with power 4 or greater can't be blocked by more than one creature
const BRUTE = 'SYNTHETIC Firebreathing Brute'; // 3/3, {R}: +2/+0 until end of turn
const V22 = 'SYNTHETIC Vanilla 2/2';
const V33 = 'SYNTHETIC Vanilla 3/3';
const V55 = 'SYNTHETIC Vanilla 5/5';
const SERRA = 'Serra Angel'; // 4/4 flying, vigilance
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

/** Seat 0 attacks with `attackers`; seat 1 holds `blockers`; stops at the declare blockers decision. */
function attack(
  mine: (b: Builder) => Builder,
  attackers: readonly string[],
  blockers: (b: Builder) => Builder,
): ScenarioGame {
  const a = mine(
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER),
  );
  const g = blockers(
    a
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain')
    .build();
  g.advanceTo('declareAttackers');
  g.act(0).attack(attackers.map((name) => ({ name, seat: 0 as const })));
  g.advanceTo('declareBlockers');
  return g;
}

describe('"can\'t be blocked by more than one creature" (CR 509.1b)', () => {
  test('a creature with power 4 or greater can be blocked by one creature', () => {
    const g = attack(
      (b) => b.battlefield(BANNER).battlefield(V55),
      [V55],
      (b) => b.battlefield(V22).battlefield(V33),
    );
    g.act(1).declareBlockers([{ blocker: V22, attacker: V55 }]);
    g.expect.combat({ attackers: [V55], blocked: [V55] });
  });

  test('and not by two', () => {
    const g = attack(
      (b) => b.battlefield(BANNER).battlefield(V55),
      [V55],
      (b) => b.battlefield(V22).battlefield(V33),
    );
    expect(() =>
      g.act(1).declareBlockers([
        { blocker: V22, attacker: V55 },
        { blocker: V33, attacker: V55 },
      ]),
    ).toThrow(/more than one/);
  });

  test('the decision says how many may block it', () => {
    const g = attack(
      (b) => b.battlefield(BANNER).battlefield(V55).battlefield(V22),
      [V55, V22],
      (b) => b.battlefield(V22).battlefield(V33),
    );
    const d = g.state.pending;
    expect(d?.kind).toBe('declareBlockers');
    if (d?.kind !== 'declareBlockers') return;
    const limits = d.attackers.map((a) => [g.object(a.attacker).card, a.maxBlockers]);
    expect(d.attackers.find((a) => a.attacker === g.id(V55))?.maxBlockers).toBe(1);
    expect(d.attackers.find((a) => a.attacker === g.id({ name: V22, seat: 0 }))?.maxBlockers).toBe(
      undefined,
    );
    expect(limits).toHaveLength(2);
  });

  test('a creature with power 3 can be blocked by two', () => {
    const g = attack(
      (b) => b.battlefield(BANNER).battlefield(V33),
      [V33],
      (b) => b.battlefield(V22).battlefield(V22),
    );
    g.act(1).declareBlockers([
      { blocker: { name: V22, seat: 1, nth: 0 }, attacker: V33 },
      { blocker: { name: V22, seat: 1, nth: 1 }, attacker: V33 },
    ]);
    g.expect.combat({ attackers: [V33], blocked: [V33] });
  });

  test("the opponent's big creature is not 'you control'", () => {
    const g = attack(
      (b) => b.battlefield(V55),
      [V55],
      (b) => b.battlefield(BANNER).battlefield(V22).battlefield(V33),
    );
    g.act(1).declareBlockers([
      { blocker: V22, attacker: V55 },
      { blocker: V33, attacker: V55 },
    ]);
    g.expect.combat({ attackers: [V55], blocked: [V55] });
  });

  test('without the Banner there is no limit', () => {
    const g = attack(
      (b) => b.battlefield(V55),
      [V55],
      (b) => b.battlefield(V22).battlefield(V33),
    );
    g.act(1).declareBlockers([
      { blocker: V22, attacker: V55 },
      { blocker: V33, attacker: V55 },
    ]);
    g.expect.combat({ attackers: [V55], blocked: [V55] });
  });

  test('power is read with every effect that changes it: a creature pumped to 4 is limited (CR 613.8)', () => {
    const g = main2();
    function main2() {
      const gg = scenario()
        .seat(0)
        .life(20)
        .library(...FILLER)
        .battlefield(BANNER)
        .battlefield(BRUTE)
        .battlefield('Mountain', { count: 2 })
        .seat(1)
        .life(20)
        .library(...FILLER)
        .battlefield(V22)
        .battlefield(V33)
        .at('precombatMain')
        .build();
      return gg;
    }
    g.expect.pt(BRUTE, 3, 3);
    g.act(0).activate(BRUTE, { pay: true });
    g.passAll();
    g.expect.pt(BRUTE, 5, 3);
    g.advanceTo('declareAttackers');
    g.act(0).attack([{ name: BRUTE, seat: 0 }]);
    g.advanceTo('declareBlockers');
    expect(() =>
      g.act(1).declareBlockers([
        { blocker: V22, attacker: BRUTE },
        { blocker: V33, attacker: BRUTE },
      ]),
    ).toThrow(/more than one/);
  });

  test('+1/+1 counters count too, and the limit ends with the Banner', () => {
    const g = attack(
      (b) => b.battlefield(BANNER).battlefield(V33, { counters: { '+1/+1': 1 } }),
      [V33],
      (b) => b.battlefield(V22).battlefield(V22),
    );
    expect(() =>
      g.act(1).declareBlockers([
        { blocker: { name: V22, seat: 1, nth: 0 }, attacker: V33 },
        { blocker: { name: V22, seat: 1, nth: 1 }, attacker: V33 },
      ]),
    ).toThrow(/more than one/);
  });

  test('menace needs two blockers and the limit allows one: nothing can block it (CR 702.111b)', () => {
    const g = attack(
      (b) => b.battlefield(BANNER).battlefield('SYNTHETIC Menacing Titan'),
      ['SYNTHETIC Menacing Titan'],
      (b) => b.battlefield(V22).battlefield(V33),
    );
    expect(g.state.pending?.kind).not.toBe('declareBlockers');
  });

  test('menace alone can be blocked by two', () => {
    const g = attack(
      (b) => b.battlefield('SYNTHETIC Menacing Titan'),
      ['SYNTHETIC Menacing Titan'],
      (b) => b.battlefield(V22).battlefield(V33),
    );
    expect(g.state.pending?.kind).toBe('declareBlockers');
  });

  test('flying with a limit: the blockers must be able to block it at all', () => {
    const g = attack(
      (b) => b.battlefield(BANNER).battlefield(SERRA),
      [SERRA],
      (b) => b.battlefield(V22).battlefield(V33),
    );
    // Nothing on the ground can block a flier: no question is asked.
    expect(g.state.pending?.kind).not.toBe('declareBlockers');
  });
});
