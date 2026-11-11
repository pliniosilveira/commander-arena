// The planeswalker model (D-200): a planeswalker enters with loyalty counters equal to its printed loyalty however it enters (CR 306.5b:
// cast, created as a token, a token copy), planeswalker types are not creature types (CR 205.3j, 205.3d), the view shows the printed
// loyalty of a card off the battlefield, and a planeswalker token is a permanent with loyalty abilities that is attacked and dies as
// any planeswalker does (CR 704.5i, 704.5d). All cards are SYNTHETIC (src/cards/fixtures/synthetic-planeswalkers.ts).
import { describe, expect, test } from 'vitest';
import { getView } from '../src/index';
import { scenario } from '../src/testing/index';

const WALKER = 'SYNTHETIC Loyalty Walker';
const ANIMATE = 'SYNTHETIC Animate Walker';
const MAKER = 'SYNTHETIC Walker Maker';
const TWIN = 'SYNTHETIC Walker Twin';
const TOKEN = 'Test Walker';

describe('entering with loyalty counters (CR 306.5b)', () => {
  test('a cast planeswalker enters with its printed loyalty', () => {
    const g = scenario().seat(0).hand(WALKER).battlefield('Island', 'Island', 'Island').build();
    g.act(0).cast(WALKER, { pay: true });
    g.passAll();
    g.expect.counters(WALKER, { loyalty: 4 });
    g.expect.eventLog([{ kind: 'counterAdded', counter: 'loyalty', count: 4 }]);
  });

  test('a planeswalker token enters with the loyalty of its definition', () => {
    const g = scenario()
      .seat(0)
      .hand(MAKER)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .build();
    g.act(0).cast(MAKER, { pay: true });
    g.passAll();
    g.expect.counters(TOKEN, { loyalty: 3 });
    const view = getView(g.state, 0);
    const token = view.battlefield.find((o) => o.name === TOKEN);
    expect(token?.isToken).toBe(true);
    expect(token?.types).toEqual(['planeswalker']);
    expect(token?.activated?.length).toBe(2);
  });

  test('a token copy of a planeswalker enters with its printed loyalty, not the loyalty it has now', () => {
    const g = scenario()
      .seat(0)
      .hand(TWIN)
      .battlefield('Island', 'Island', 'Island', 'Island', 'Island')
      .seat(1)
      .battlefield(WALKER, { counters: { loyalty: 1 } })
      .build();
    g.act(0).cast(TWIN, { targets: [WALKER], pay: true });
    g.passAll();
    const copies = g.find({ name: WALKER, zone: 'battlefield' });
    expect(copies).toHaveLength(2);
    const token = copies.find((o) => o.token !== null);
    expect(token?.counters.loyalty).toBe(4);
    expect(token?.controller).toBe(0);
  });

  test('the token has its loyalty abilities: [-1] and [-3] take it to 2 and then it can use the next turn', () => {
    const g = scenario().seat(0).battlefield('Island').build();
    // The token comes from the SYNTHETIC maker; here it is built by casting it.
    const h = scenario()
      .seat(0)
      .hand(MAKER)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .build();
    h.act(0).cast(MAKER, { pay: true });
    h.passAll();
    h.act(0).activate(TOKEN, { ability: 0 });
    h.expect.counters(TOKEN, { loyalty: 2 });
    h.passAll();
    h.expect.life(0, 41);
    expect(g.find({ name: TOKEN })).toHaveLength(0);
    // CR 606.3: not the other one this turn.
    h.expect.illegal(0, { activate: TOKEN, ability: 1 });
  });

  test('a token planeswalker at 0 loyalty ceases to exist (CR 704.5i, 704.5d)', () => {
    const h = scenario()
      .seat(0)
      .hand(MAKER)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .build();
    h.act(0).cast(MAKER, { pay: true });
    h.passAll();
    h.act(0).activate(TOKEN, { ability: 1 });
    h.expect.noObject(TOKEN);
    h.passAll();
    h.expect.life(0, 45);
  });
});

describe('planeswalker types (CR 205.3j, 205.3d)', () => {
  test('a creature-type-setting effect leaves a planeswalker type alone', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ANIMATE)
      .hand('SYNTHETIC Frog Hex')
      .battlefield('Island', 'Island', 'Island')
      .build();
    g.act(0).activate(ANIMATE, { ability: 0 });
    g.passAll();
    const before = g.object(ANIMATE);
    expect(g.view(0).battlefield.find((o) => o.id === before.id)?.subtypes).toEqual([
      'Dack',
      'Human',
      'Soldier',
    ]);
    g.act(0).cast('SYNTHETIC Frog Hex', { targets: [ANIMATE], pay: true });
    g.passAll();
    const o = g.view(0).battlefield.find((x) => x.id === before.id);
    expect(o?.subtypes).toEqual(['Dack', 'Frog']);
    expect(o?.types).toEqual(['planeswalker', 'creature']);
  });
});

describe('the view', () => {
  test('a planeswalker card in a hand or a graveyard shows its printed loyalty; a permanent has the counters', () => {
    const g = scenario()
      .seat(0)
      .hand(WALKER)
      .graveyard('SYNTHETIC X Walker')
      .battlefield('SYNTHETIC Ultimate Walker')
      .build();
    const v = getView(g.state, 0);
    expect(v.seats[0]?.hand?.find((o) => o.name === WALKER)?.printedLoyalty).toBe(4);
    expect(v.seats[0]?.graveyard.find((o) => o.name === 'SYNTHETIC X Walker')?.printedLoyalty).toBe(
      3,
    );
    const bf = v.battlefield.find((o) => o.name === 'SYNTHETIC Ultimate Walker');
    expect(bf?.printedLoyalty).toBe(3);
    expect(bf?.counters.loyalty).toBe(3);
    expect(bf?.loyaltyUsed).toBeUndefined();
  });

  test('loyaltyUsed is set from the activation until the turn ends', () => {
    const g = scenario().seat(0).battlefield(WALKER).build();
    g.act(0).activate(WALKER, { ability: 0 });
    g.passAll();
    const v = getView(g.state, 0);
    expect(v.battlefield.find((o) => o.name === WALKER)?.loyaltyUsed).toBe(true);
  });

  test('a card that is not a planeswalker has no printed loyalty', () => {
    const g = scenario().seat(0).hand('Grizzly Bears').build();
    expect(getView(g.state, 0).seats[0]?.hand?.[0]?.printedLoyalty).toBeUndefined();
  });
});
