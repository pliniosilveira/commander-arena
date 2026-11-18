// The Prismari deck (issue 87), group 2: Rousing Refrain, "Add {R} for each card in target opponent's hand. Until end of turn, you don't lose this mana as steps and phases end.
// Exile ~ with three time counters on it." with Suspend 3 (SYNTHETIC Rushing Refrain, src/cards/fixtures/synthetic-prismari-g2.ts). Pins: CR 106.4 and 500.5 (mana empties as each step
// and phase ends, unless an effect says otherwise), CR 514.2 (an "until end of turn" effect ends in the cleanup step), CR 108.3 (a card in a hand is its owner's), CR 608.2c and 608.2n
// (the instructions run in order; the spell is put into the graveyard as the last step, unless an instruction put it elsewhere), CR 122.1 (counters), CR 702.62a and 702.62b (a card in
// exile with suspend and a time counter is suspended; its upkeep trigger removes a counter; the last one removed casts it without paying its mana cost), CR 707.10a (a copy of a spell
// is not a card: it ceases to exist rather than being exiled), CR 701.6 (a countered spell goes to the graveyard).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const REFRAIN = 'SYNTHETIC Rushing Refrain';
const LIBRARY = Array.from({ length: 12 }, () => 'Island');

type Game = ReturnType<ReturnType<typeof build>['build']>;

/** Seat 0 with the Refrain in hand and five Mountains; seat 1 with `hand` cards in its hand. */
function build(hand = 3, extra: (b: ReturnType<typeof scenario>) => void = () => {}) {
  const b = scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand(REFRAIN)
    .battlefield('Mountain', { count: 5 });
  extra(b);
  b.seat(1).library(...LIBRARY);
  for (let i = 0; i < hand; i += 1) b.hand('Island');
  return b.at('precombatMain', { active: 0 });
}

const pool = (g: Game, seat = 0) => g.state.seats[seat]?.manaPool.length ?? 0;
const castRefrain = (g: Game) => {
  g.act(0).cast(REFRAIN, { pay: true, targets: [{ player: 1 }] });
  g.passAll();
};
const exiled = (g: Game) => g.find({ name: REFRAIN, zone: 'exile', seat: 0 });

describe('the card is valid', () => {
  test(REFRAIN, () => {
    expect(validateCard(syntheticCard(REFRAIN))).toEqual([]);
  });
});

describe('the mana: one {R} for each card in target opponent’s hand, kept until end of turn (CR 500.5)', () => {
  test('three cards in the hand: three red mana in the pool', () => {
    const g = build(3).build();
    castRefrain(g);
    expect(pool(g)).toBe(3);
    expect(g.state.seats[0]?.manaPool.every((m) => m.color === 'R')).toBe(true);
    g.expect.invariants();
  });

  test('the count is read as the spell resolves, from that player’s hand (the owner’s), not the caster’s', () => {
    const g = build(5, (b) => b.seat(0).hand('Island', 'Island')).build();
    castRefrain(g);
    expect(pool(g)).toBe(5);
  });

  test('an empty hand adds nothing', () => {
    const g = build(0).build();
    castRefrain(g);
    expect(pool(g)).toBe(0);
    // And the card is still exiled with its counters.
    expect(exiled(g)).toHaveLength(1);
  });

  test('the mana stays as the main phase ends and through combat and the end step', () => {
    const g = build(3).build();
    castRefrain(g);
    g.advanceTo('beginningOfCombat');
    expect(pool(g)).toBe(3);
    g.advanceTo('postcombatMain');
    expect(pool(g)).toBe(3);
    g.advanceTo('end');
    expect(pool(g)).toBe(3);
    g.expect.noEvent({ kind: 'manaEmptied' });
  });

  test('it can be spent later in the turn, on a spell of the second main phase', () => {
    const g = build(3, (b) => b.seat(0).hand('Lightning Bolt', 'Lightning Bolt')).build();
    castRefrain(g);
    g.advanceTo('postcombatMain');
    // No land is untapped but the mana is in the pool: the Bolt is paid from it.
    g.act(0).cast(
      { name: 'Lightning Bolt', zone: 'hand', seat: 0, nth: 0 },
      {
        pay: true,
        targets: [{ player: 1 }],
      },
    );
    expect(pool(g)).toBe(2);
    g.passAll();
    expect(g.state.seats[1]?.life).toBe(37);
  });

  test('it is lost at the end of the turn (the cleanup step), and not kept into the next one', () => {
    const g = build(3).build();
    castRefrain(g);
    g.advanceTo('upkeep', { turn: 'next' });
    expect(pool(g)).toBe(0);
    g.expect.eventLog([{ kind: 'manaEmptied', seat: 0, count: 3 }]);
  });

  test('other mana does not stay: a Mountain tapped in the first main phase empties as the phase ends, the kept mana stays', () => {
    const g = build(3, (b) => b.seat(0).battlefield('Mountain')).build();
    castRefrain(g);
    g.act(0).tapForMana({ name: 'Mountain', zone: 'battlefield', seat: 0, nth: 5 });
    expect(pool(g)).toBe(4);
    g.advanceTo('beginningOfCombat');
    expect(pool(g)).toBe(3);
  });
});

describe('exiled with three time counters (CR 608.2n, 122.1, 702.62b)', () => {
  test('the card is in exile with three time counters and not in the graveyard', () => {
    const g = build(3).build();
    castRefrain(g);
    const [card] = exiled(g);
    expect(card?.counters.time).toBe(3);
    expect(g.find({ name: REFRAIN, zone: 'graveyard', seat: 0 })).toHaveLength(0);
    g.expect.invariants();
  });

  test('with Suspend it is suspended: each of the owner’s upkeeps removes a counter, and the last casts it for free', () => {
    const g = build(3).build();
    castRefrain(g);
    // The next upkeep of seat 0 is two turns on (the opponent's turn comes between).
    g.advanceTo('upkeep', { turn: 'next' });
    expect(exiled(g)[0]?.counters.time).toBe(3);
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    expect(exiled(g)[0]?.counters.time).toBe(2);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    expect(exiled(g)[0]?.counters.time).toBe(1);
  });

  test('the last counter removed casts it without paying: it resolves, adds mana, and is exiled again with three counters', () => {
    const g = build(3).build();
    castRefrain(g);
    // Three of the owner's upkeeps (the opponent's turn comes between): the third removes the last counter.
    for (let i = 0; i < 3; i += 1) {
      g.advanceTo('upkeep', { turn: 'next' });
      g.advanceTo('upkeep', { turn: 'next' });
      g.passAll();
      if (i < 2) expect(exiled(g)[0]?.counters.time).toBe(2 - i);
    }
    // The ability that casts it asks, then the cast chooses the target of "target opponent" (CR 601.2c) and puts it on the stack with no payment.
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).chooseTargets({ player: 1 });
    g.expect.eventLog([{ kind: 'spellCast', seat: 0, fromZone: 'exile', alternative: 'free' }]);
    const handNow = g.state.seats[1]?.hand.length ?? 0;
    g.passAll();
    // The opponent drew in their turns: one mana for each card they hold now.
    expect(handNow).toBeGreaterThan(3);
    expect(pool(g)).toBe(handNow);
    expect(exiled(g)).toHaveLength(1);
    expect(exiled(g)[0]?.counters.time).toBe(3);
    g.expect.invariants();
  });

  test('a spell that is countered goes to the graveyard, not to exile (CR 701.6)', () => {
    const g = build(3, (b) =>
      b.seat(1).hand('Counterspell').battlefield('Island', { count: 2 }),
    ).build();
    g.act(0).cast(REFRAIN, { pay: true, targets: [{ player: 1 }] });
    g.act(0).pass();
    g.act(1).cast('Counterspell', {
      pay: true,
      targets: [{ name: REFRAIN, zone: 'stack', seat: 0 }],
    });
    g.passAll();
    expect(g.find({ name: REFRAIN, zone: 'graveyard', seat: 0 })).toHaveLength(1);
    expect(exiled(g)).toHaveLength(0);
    expect(pool(g)).toBe(0);
  });
});
