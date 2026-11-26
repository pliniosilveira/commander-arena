// "Whenever you cast your first spell each turn, choose an opponent at random. ~ deals damage equal to that spell's mana value to that player or a planeswalker that player controls"
// (Vial Smasher the Fierce; CR 701.13, 102.2, 120.2, 608.2d): `choosePlayer` with `random` and `dealDamageToChosenPlayerOrPlaneswalker`. The card is SYNTHETIC
// (src/cards/fixtures/synthetic-life-lost-group.ts). Pins: with one opponent that opponent takes the damage, with 3 seats the seeded generator picks one opponent (never the controller, and
// the other takes nothing), a player with a planeswalker is not dealt the damage until the controller chooses the player or the planeswalker, and only the first spell each turn triggers it.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SMASHER = 'SYNTHETIC Chaotic Smasher';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const BOLT = 'Lightning Bolt'; // mana value 1, red instant: damage 3 to any target
const LIBRARY = Array.from({ length: 12 }, () => 'Mountain');

test('the card is valid', () => {
  expect(validateCard(syntheticCard(SMASHER))).toEqual([]);
});

describe('"choose an opponent at random ... that player or a planeswalker that player controls"', () => {
  const build = (seats: 2 | 3 = 2, walker = false) => {
    let b = scenario({ seats })
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT, BOLT)
      .battlefield(SMASHER, 'Mountain', 'Mountain');
    b = b.seat(1).library(...LIBRARY);
    if (walker) b = b.battlefield(WALKER);
    if (seats === 3) b = b.seat(2).library(...LIBRARY);
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('one opponent: that opponent takes the mana value (the Bolt itself deals 3 to the same player)', () => {
    const g = build();
    g.act(0).cast(`${BOLT}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 36);
  });

  test('only the first spell each turn triggers it', () => {
    const g = build();
    g.act(0).cast(`${BOLT}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).cast(`${BOLT}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 33);
  });

  test('3 seats: one of the two opponents takes 1, the other none, the controller none', () => {
    const g = build(3);
    // The Bolt goes to the face of the controller's own... target seat 1 and 2 both get none from it: target the controller's opponent 1 with the Bolt.
    g.act(0).cast(`${BOLT}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    const life1 = g.state.seats[1]?.life;
    const life2 = g.state.seats[2]?.life;
    expect(g.state.seats[0]?.life).toBe(40);
    // The Bolt always dealt 3 to seat 1; the Smasher's 1 went to seat 1 (36) or seat 2 (39).
    expect([life1, life2]).toSatisfy(
      (l: (number | undefined)[]) => (l[0] === 36 && l[1] === 40) || (l[0] === 37 && l[1] === 39),
    );
  });

  test('a player with a planeswalker: the controller chooses the player or the planeswalker', () => {
    const g = build(2, true);
    g.act(0).cast(`${BOLT}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    const decision = g.state.pending;
    expect(decision?.kind).toBe('chooseOption');
    if (decision?.kind !== 'chooseOption') return;
    expect(decision.options).toHaveLength(2);
    // The first option is the player.
    g.act(0).chooseOption(decision.options[0] ?? '');
    g.passAll();
    g.expect.life(1, 36);
    g.expect.counters(WALKER, { loyalty: 4 });
  });

  test('choosing the planeswalker: it is dealt the damage and the player only the Bolt', () => {
    const g = build(2, true);
    g.act(0).cast(`${BOLT}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    const decision = g.state.pending;
    if (decision?.kind !== 'chooseOption') throw new Error('no choice');
    g.act(0).chooseOption(decision.options[1] ?? '');
    g.passAll();
    g.expect.life(1, 37);
    g.expect.counters(WALKER, { loyalty: 3 });
  });
});
