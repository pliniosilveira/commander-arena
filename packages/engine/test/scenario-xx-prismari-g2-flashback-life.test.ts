// The Prismari deck (issue 87), group 2: Deep Analysis, "Flashback—{1}{U}, Pay 3 life." (SYNTHETIC Deep Study, src/cards/fixtures/synthetic-prismari-g2.ts). Pins: CR 702.34a
// (Flashback: the flashback cost is an alternative cost, and a cost may be more than mana), CR 118.9 (an alternative cost replaces the mana cost), CR 119.4 (a player can pay life only
// if their life total is at least that much, and paying life is losing it), CR 601.2f and 601.2h (the total cost is determined, then paid, as the spell is cast), CR 702.34a (the card
// is exiled instead of anywhere else it would go from the stack), CR 118.3 (a cost that cannot be paid cannot be paid).
import { describe, expect, test } from 'vitest';
import {
  applyAction,
  checkInvariants,
  getLegalActions,
  syntheticCard,
  validateCard,
} from '../src/index';
import { scenario } from '../src/testing/index';

const STUDY = 'SYNTHETIC Deep Study'; // {3}{U} sorcery, target player draws two cards; flashback {1}{U} and 3 life
const LIBRARY = Array.from({ length: 10 }, () => 'Island');

const flashbackOptions = (g: ReturnType<ReturnType<typeof build>['build']>) =>
  getLegalActions(g.state, 0).filter(
    (a) => a.kind === 'castSpell' && a.alternative === 'flashback',
  );

function build(life = 20, lands = 2) {
  return scenario()
    .seat(0)
    .life(life)
    .library(...LIBRARY)
    .graveyard(STUDY)
    .battlefield('Island', { count: lands })
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0 });
}

describe('the card is valid', () => {
  test('flashback with mana and life', () => {
    expect(validateCard(syntheticCard(STUDY))).toEqual([]);
  });
});

describe('Flashback with life (CR 702.34a, 119.4)', () => {
  test('cast from the graveyard: {1}{U} and 3 life, two cards drawn, then exiled', () => {
    const g = build(20).build();
    g.act(0).cast(
      { name: STUDY, zone: 'graveyard', seat: 0 },
      { alternative: 'flashback', pay: true, targets: [{ player: 0 }] },
    );
    expect(g.state.seats[0]?.life).toBe(17);
    expect(g.find({ name: 'Island', zone: 'battlefield', seat: 0 }).every((o) => o.tapped)).toBe(
      true,
    );
    g.passAll();
    expect(g.state.seats[0]?.hand).toHaveLength(2);
    expect(g.find({ name: STUDY, zone: 'exile', seat: 0 })).toHaveLength(1);
    expect(g.find({ name: STUDY, zone: 'graveyard', seat: 0 })).toHaveLength(0);
    g.expect.eventLog([{ kind: 'lifeChanged', seat: 0, from: 20, to: 17 }]);
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('exactly 3 life is enough (CR 119.4: a player can pay life equal to their life total)', () => {
    const g = build(3).build();
    expect(flashbackOptions(g)).toHaveLength(1);
    g.act(0).cast(
      { name: STUDY, zone: 'graveyard', seat: 0 },
      { alternative: 'flashback', pay: true, targets: [{ player: 0 }] },
    );
    expect(g.state.seats[0]?.life).toBe(0);
  });

  test('2 life is not enough: the flashback is not offered and the engine refuses it, whatever the mana', () => {
    const g = build(2, 6).build();
    expect(flashbackOptions(g)).toEqual([]);
    const id = g.id({ name: STUDY, zone: 'graveyard' });
    const r = applyAction(g.state, 0, { kind: 'castSpell', object: id, alternative: 'flashback' });
    expect(r.ok).toBe(false);
  });

  test('the life is not enough but the mana is: refused; the mana is not enough but the life is: refused', () => {
    const noMana = build(20, 1).build();
    expect(flashbackOptions(noMana)).toEqual([]);
    const noLife = build(1, 3).build();
    expect(flashbackOptions(noLife)).toEqual([]);
  });

  test('cast from the hand it costs the mana cost and no life', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(STUDY)
      .battlefield('Island', { count: 4 })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(STUDY, { pay: true, targets: [{ player: 0 }] });
    expect(g.state.seats[0]?.life).toBe(20);
    g.passAll();
    // Resolved from the hand: it goes to the graveyard, where the flashback can be used later.
    expect(g.find({ name: STUDY, zone: 'graveyard', seat: 0 })).toHaveLength(1);
  });

  test('cancelling the cast gives the life back (CR 733: the exact pre-cast state)', () => {
    const g = build(20).build();
    const before = g.positionHash();
    g.act(0)
      .cast({ name: STUDY, zone: 'graveyard', seat: 0 }, { alternative: 'flashback' })
      .cancel();
    expect(g.positionHash()).toBe(before);
    expect(g.state.seats[0]?.life).toBe(20);
  });

  test('a flashback cost with a life payment is paid once for the spell, and a countered spell is still exiled (CR 702.34a)', () => {
    const g = build(20).seat(1).hand('Counterspell').battlefield('Island', { count: 2 }).build();
    g.act(0).cast(
      { name: STUDY, zone: 'graveyard', seat: 0 },
      { alternative: 'flashback', pay: true, targets: [{ player: 0 }] },
    );
    g.act(0).pass();
    g.act(1).cast('Counterspell', {
      pay: true,
      targets: [{ name: STUDY, zone: 'stack', seat: 0 }],
    });
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(17);
    expect(g.find({ name: STUDY, zone: 'exile', seat: 0 })).toHaveLength(1);
    expect(g.state.seats[0]?.hand).toHaveLength(0);
  });
});
