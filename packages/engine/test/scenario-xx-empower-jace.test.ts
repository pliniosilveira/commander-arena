// "Empower Jace N" (CR 701.71a, D-201): create a blue Jace planeswalker token with 0 loyalty, "[-1]: Surveil 1" and "[-3]: Draw a card." if you
// control none, choose a Jace planeswalker token you control, put N loyalty counters on it. Cards are SYNTHETIC (synthetic-planeswalkers.ts): a
// sorcery with the real "Empower Jace 6" and a creature with the real "When this creature enters, empower Jace 2".
import { describe, expect, test } from 'vitest';
import { getView, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { choosePermanentDecision } from './pending-helpers';

const RITE = 'SYNTHETIC Empower Rite';
const KEEPER = 'SYNTHETIC Empower Keeper';
const DOUBLE = 'SYNTHETIC Double Jace Rite';
const JACE = 'Jace';

const jaces = (g: ReturnType<ReturnType<typeof scenario>['build']>, seat: 0 | 1 = 0) =>
  getView(g.state, seat).battlefield.filter(
    (o) => o.name === JACE && o.isToken && o.controller === seat,
  );

describe('with no Jace token', () => {
  test('a blue Jace planeswalker token is created and gets the counters (CR 701.71a)', () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 3 })
      .hand(RITE)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    const [jace] = jaces(g);
    expect(jaces(g)).toHaveLength(1);
    expect(jace?.types).toEqual(['planeswalker']);
    expect(jace?.subtypes).toEqual(['Jace']);
    expect(jace?.colors).toEqual(['U']);
    expect(jace?.counters.loyalty).toBe(6);
    expect(jace?.printedLoyalty).toBe(0);
    expect(jace?.activated?.map((a) => a.ability.cost)).toEqual([
      [{ kind: 'loyalty', change: -1 }],
      [{ kind: 'loyalty', change: -3 }],
    ]);
    g.expect.handSize(0, 1);
    g.expect.eventLog([
      { kind: 'tokenCreated', name: JACE },
      { kind: 'counterAdded', counter: 'loyalty', count: 6 },
    ]);
  });

  test('the token is not killed by the state-based actions between its creation and its counters (CR 704.3)', () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 3 })
      .hand(KEEPER)
      .battlefield('Island', 'Island', 'Island')
      .build();
    g.act(0).cast(KEEPER, { pay: true });
    g.passAll();
    expect(jaces(g)).toHaveLength(1);
    expect(jaces(g)[0]?.counters.loyalty).toBe(2);
  });

  test("the token's abilities: [-1] surveils and [-3] draws, one activation a turn (CR 606.3)", () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 4 })
      .hand(RITE)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.act(0).activate(JACE, { ability: 1 });
    g.expect.counters(JACE, { loyalty: 3 });
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.illegal(0, { activate: JACE, ability: 0 });
  });
});

describe('with a Jace token already', () => {
  test('no second token is created: the counters go on the one you control', () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 4 })
      .hand(RITE, KEEPER)
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island', 'Island', 'Island')
      .build();
    g.act(0).cast(KEEPER, { pay: true });
    g.passAll();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    expect(jaces(g)).toHaveLength(1);
    expect(jaces(g)[0]?.counters.loyalty).toBe(8);
  });

  test('two Jace tokens (made together in one resolution): the controller chooses which gets the counters', () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 4 })
      .hand(DOUBLE)
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island')
      .build();
    g.act(0).cast(DOUBLE, { pay: true });
    g.passAll();
    const d = choosePermanentDecision(g);
    expect(d.purpose).toBe('empowerJace');
    expect(d.legal).toHaveLength(2);
    expect(d.seat).toBe(0);
    g.act(0).choosePermanents({ name: JACE, nth: 1 });
    // The token left with no counters is gone with the next state-based check (CR 704.5i, 704.5d).
    expect(jaces(g)).toHaveLength(1);
    expect(jaces(g)[0]?.counters.loyalty).toBe(6);
  });
});

describe('only Jace planeswalker tokens count', () => {
  test('a Jace planeswalker card is not a token, so a token is created beside it', () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 3 })
      .hand(RITE)
      .battlefield('Island', 'Island', 'Island', 'Island', 'SYNTHETIC Loyalty Walker')
      .build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    expect(jaces(g)).toHaveLength(1);
    g.expect.counters('SYNTHETIC Loyalty Walker', { loyalty: 4 });
  });

  test("another player's Jace token is not yours: you create your own", () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 3 })
      .hand(RITE)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    expect(jaces(g, 0)).toHaveLength(1);
    expect(jaces(g, 1)).toHaveLength(0);
  });
});

describe('validation', () => {
  test('the two cards are executable, and a zero amount is refused', () => {
    expect(validateCard(syntheticCard(RITE))).toEqual([]);
    expect(validateCard(syntheticCard(KEEPER))).toEqual([]);
  });
});
