// A planeswalker of the pride (D-266 to D-268): "+1: You gain life equal to the number of creatures you control plus the number of planeswalkers you control.",
// "-2: Create a 2/2 white Cat Soldier creature token named Pridemate with 'Whenever you gain life, put a +1/+1 counter on this token.'" and "0: If you have at
// least 15 life more than your starting life total, exile this planeswalker and each artifact and creature your opponents control."
// Pins: CR 606 (loyalty abilities), 111.3 and 111.4 (what the effect defines of a token, its name), 603 (the token's trigger), 119.1 and 903.7 (the life total against the starting life
// total), 608.2c (the "if" of an instruction is tested as it resolves), 400.7 (a planeswalker that left is a new object), 406 (exile). The card is SYNTHETIC
// (src/cards/fixtures/synthetic-pride-walker.ts).
import { describe, expect, test } from 'vitest';
import { getView, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const WALKER = 'SYNTHETIC Pride Walker';
const PRIDEMATE = 'Pridemate';
const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk";
const BOLT = 'Lightning Bolt';
const MEND = 'SYNTHETIC Mend'; // gain 3 life
const MEND_THEM = 'SYNTHETIC Mend Them'; // target player gains 3 life
const HAND_MEND = { name: MEND, zone: 'hand' as const, nth: 0 };
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the card is valid', () => {
  test('validateCard finds nothing', () => {
    expect(validateCard(syntheticCard(WALKER))).toEqual([]);
  });
});

describe('+1: life equal to the creatures and the planeswalkers you control', () => {
  test('counts your creatures and your planeswalkers, the walker itself included, and nothing of the opponent', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WALKER, BEARS, BEARS)
      .seat(1)
      .battlefield(HAWK, HAWK, 'SYNTHETIC Loyalty Walker')
      .build();
    g.act(0).activate(WALKER, { ability: 0 });
    g.passAll();
    // two Bears and the walker itself: 3
    g.expect.life(0, 43);
    g.expect.life(1, 40);
  });
});

describe('-2: the named token with a trigger of its own (CR 111.3, 111.4)', () => {
  const withToken = () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(MEND, MEND)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', WALKER)
      .build();
    g.act(0).activate(WALKER, { ability: 1 });
    g.passAll();
    return g;
  };

  test('a 2/2 white Cat Soldier creature named Pridemate, and the walker lost two loyalty', () => {
    const g = withToken();
    g.expect.counters(WALKER, { loyalty: 3 });
    g.expect.pt(PRIDEMATE, 2, 2);
    g.expect.derived(PRIDEMATE, {
      types: ['creature'],
      subtypes: ['Cat', 'Soldier'],
      colors: ['W'],
    });
    const token = getView(g.state, 0).battlefield.find((o) => o.name === PRIDEMATE);
    expect(token?.isToken).toBe(true);
  });

  test('each time you gain life it gets one +1/+1 counter, whatever the amount (CR 603.2)', () => {
    const g = withToken();
    g.act(0).cast(HAND_MEND, { pay: true });
    g.passAll();
    g.expect.counters(PRIDEMATE, { '+1/+1': 1 });
    g.expect.pt(PRIDEMATE, 3, 3);
    g.act(0).cast(HAND_MEND, { pay: true });
    g.passAll();
    g.expect.counters(PRIDEMATE, { '+1/+1': 2 });
    g.expect.pt(PRIDEMATE, 4, 4);
  });

  test('an opponent gaining life is not you gaining life', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(MEND_THEM)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', WALKER)
      .build();
    g.act(0).activate(WALKER, { ability: 1 });
    g.passAll();
    g.act(0).cast(MEND_THEM, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 42);
    g.expect.counters(PRIDEMATE, {});
  });

  test("the counters are the token's own: another creature of yours gets none", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(MEND)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', WALKER, BEARS)
      .build();
    g.act(0).activate(WALKER, { ability: 1 });
    g.passAll();
    g.act(0).cast(HAND_MEND, { pay: true });
    g.passAll();
    g.expect.counters(PRIDEMATE, { '+1/+1': 1 });
    g.expect.counters(BEARS, {});
  });
});

describe('0: exile this planeswalker and each artifact and creature your opponents control', () => {
  const setup = (life: number) =>
    scenario()
      .seat(0)
      .life(life)
      .battlefield(WALKER, BEARS, 'Sol Ring')
      .seat(1)
      .battlefield(HAWK, 'Sol Ring', 'Plains', 'SYNTHETIC Doomed Scout')
      .build();

  test('with exactly 15 life more than the starting life total, it exiles the walker and every artifact and creature of the opponent only', () => {
    const g = setup(55);
    g.act(0).activate(WALKER, { ability: 2 });
    g.passAll();
    g.expect.zone(WALKER, 'exile', { seat: 0 });
    g.expect.zone(HAWK, 'exile', { seat: 1 });
    g.expect.zone('Sol Ring', 'exile', { seat: 1 });
    g.expect.zone('SYNTHETIC Doomed Scout', 'exile', { seat: 1 });
    // not the opponent's land, and none of yours
    g.expect.zone('Plains', 'battlefield', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone('Sol Ring', 'battlefield', { seat: 0 });
    expect(g.state.exile).toHaveLength(4);
  });

  test("with 14 life more it does nothing, and it still used the walker's activation for the turn (CR 606.3)", () => {
    const g = setup(54);
    g.act(0).activate(WALKER, { ability: 2 });
    g.passAll();
    g.expect.zone(WALKER, 'battlefield', { seat: 0 });
    g.expect.zone(HAWK, 'battlefield', { seat: 1 });
    g.expect.zone('Sol Ring', 'battlefield', { seat: 1 });
    expect(g.act(0).try.activate(WALKER, { ability: 0 }).ok).toBe(false);
  });

  test('it is the difference from the starting life total of the game, not a life total of 55 (CR 903.7)', () => {
    // a game that starts at 20: 35 is 15 more; 55 would be far more, 34 is one short
    const ok = scenario()
      .settings({ startingLife: 20 })
      .seat(0)
      .life(35)
      .battlefield(WALKER)
      .seat(1)
      .battlefield(HAWK)
      .build();
    ok.act(0).activate(WALKER, { ability: 2 });
    ok.passAll();
    ok.expect.zone(HAWK, 'exile', { seat: 1 });
    const short = scenario()
      .settings({ startingLife: 20 })
      .seat(0)
      .life(34)
      .battlefield(WALKER)
      .seat(1)
      .battlefield(HAWK)
      .build();
    short.act(0).activate(WALKER, { ability: 2 });
    short.passAll();
    short.expect.zone(HAWK, 'battlefield', { seat: 1 });
  });

  test("the opponent's life total does not matter, only yours", () => {
    const g = scenario()
      .seat(0)
      .life(40)
      .battlefield(WALKER)
      .seat(1)
      .life(90)
      .battlefield(HAWK)
      .build();
    g.act(0).activate(WALKER, { ability: 2 });
    g.passAll();
    g.expect.zone(HAWK, 'battlefield', { seat: 1 });
    g.expect.zone(WALKER, 'battlefield', { seat: 0 });
  });

  test('an artifact creature of the opponent is exiled once, as one permanent', () => {
    const g = scenario()
      .seat(0)
      .life(55)
      .battlefield(WALKER)
      .seat(1)
      .battlefield('SYNTHETIC Ruin Angel')
      .build();
    g.act(0).activate(WALKER, { ability: 2 });
    g.passAll();
    g.expect.zone('SYNTHETIC Ruin Angel', 'exile', { seat: 1 });
    expect(g.state.exile).toHaveLength(2);
  });

  test('the life total is tested as the ability resolves: damage in response turns it off (CR 608.2c)', () => {
    const g = scenario()
      .seat(0)
      .life(56)
      .battlefield(WALKER)
      .seat(1)
      .battlefield(HAWK, 'Mountain')
      .hand(BOLT)
      .build();
    g.act(0).activate(WALKER, { ability: 2 });
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 53);
    g.expect.zone(WALKER, 'battlefield', { seat: 0 });
    g.expect.zone(HAWK, 'battlefield', { seat: 1 });
  });

  test('and the other way round: life gained in response turns it on', () => {
    const g = scenario()
      .seat(0)
      .life(53)
      .battlefield('Plains', 'Plains', WALKER)
      .hand(MEND)
      .seat(1)
      .battlefield(HAWK)
      .build();
    g.act(0).activate(WALKER, { ability: 2 });
    g.act(0).cast(HAND_MEND, { pay: true });
    g.passAll();
    g.expect.life(0, 56);
    g.expect.zone(HAWK, 'exile', { seat: 1 });
    g.expect.zone(WALKER, 'exile', { seat: 0 });
  });

  test('a walker that was destroyed in response is a new object in the graveyard: it is not exiled, the rest still is (CR 400.7)', () => {
    const g = scenario()
      .seat(0)
      .life(55)
      .battlefield(WALKER, { counters: { loyalty: 2 } })
      .seat(1)
      .battlefield(HAWK, 'Mountain')
      .hand(BOLT)
      .build();
    g.act(0).activate(WALKER, { ability: 2 });
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [WALKER], pay: true });
    g.passAll();
    g.expect.zone(WALKER, 'graveyard', { seat: 0 });
    g.expect.zone(HAWK, 'exile', { seat: 1 });
  });
});
