// "You may activate the loyalty abilities of planeswalkers you control twice each turn rather than only once." (the `loyaltyActivationLimit`
// static ability). Pins: CR 606.3 (the limit of one activation a turn for each permanent, and sorcery timing), 606.4 (the cost of each
// activation is paid in full), 604.1 (a static ability works while the permanent has it), 102.2 (opponents). All cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import { validateAbility, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const WALKER = 'SYNTHETIC Loyalty Walker'; // +1, 0, -2 (target creature); 4 loyalty
const OATH = 'SYNTHETIC Twice Oath';
const BEARS = 'Grizzly Bears';

describe('twice each turn rather than only once (CR 606.3)', () => {
  test('without the static ability the second activation is refused', () => {
    const g = scenario().seat(0).battlefield(WALKER).build();
    g.act(0).activate(WALKER, { ability: 0 });
    g.passAll();
    g.expect.illegal(0, { activate: WALKER, ability: 1 });
  });

  test('with it a second activation is allowed, a third is not, and each pays its loyalty cost', () => {
    const g = scenario().seat(0).library('Island', { count: 3 }).battlefield(WALKER, OATH).build();
    g.act(0).activate(WALKER, { ability: 0 });
    g.passAll();
    g.expect.counters(WALKER, { loyalty: 5 });
    expect(g.view(0).battlefield.find((o) => o.name === WALKER)?.loyaltyUsed).toBeUndefined();
    g.act(0).activate(WALKER, { ability: 0 });
    g.passAll();
    g.expect.counters(WALKER, { loyalty: 6 });
    g.expect.life(0, 44);
    g.expect.illegal(0, { activate: WALKER, ability: 1 });
    expect(g.view(0).battlefield.find((o) => o.name === WALKER)?.loyaltyUsed).toBe(true);
  });

  test('the two activations may be different abilities, and a minus is paid both times (606.4, 606.6)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WALKER, OATH)
      .seat(1)
      .battlefield(BEARS, 'Giant Spider')
      .build();
    g.act(0).activate(WALKER, { ability: 2, targets: [BEARS] });
    g.passAll();
    g.act(0).activate(WALKER, { ability: 2, targets: ['Giant Spider'] });
    g.passAll();
    g.expect.counters(WALKER, { loyalty: 0 });
  });

  test('a loyalty ability is still sorcery speed', () => {
    const g = scenario().seat(0).battlefield(WALKER, OATH).build();
    g.act(0).activate(WALKER, { ability: 0 });
    // The first ability is on the stack: not the time to activate another.
    expect(g.act(0).try.activate(WALKER, { ability: 1 }).ok).toBe(false);
  });

  test("an opponent's Oath does nothing for my planeswalker", () => {
    const g = scenario().seat(0).battlefield(WALKER).seat(1).battlefield(OATH).build();
    g.act(0).activate(WALKER, { ability: 0 });
    g.passAll();
    g.expect.illegal(0, { activate: WALKER, ability: 1 });
  });

  test('with three players, each planeswalker of the Oath controller gets two, the others one', () => {
    const g = scenario({ seats: 3 })
      .seat(1)
      .battlefield(WALKER, OATH)
      .seat(2)
      .battlefield('SYNTHETIC Static Walker')
      .at('precombatMain', { active: 1 })
      .build();
    for (let i = 0; i < 2; i++) {
      g.act(1).activate(WALKER, { ability: 0 });
      g.passAll();
    }
    g.expect.illegal(1, { activate: WALKER, ability: 0 });
  });
});

describe('validation', () => {
  const ability = (extra: Record<string, unknown>) =>
    ({
      kind: 'static',
      static: {
        kind: 'loyaltyActivationLimit',
        planeswalkers: { types: ['planeswalker'], controller: 'you' },
        timesEachTurn: 2,
        ...extra,
      },
    }) as never;

  test('the fixture is a valid card', () => {
    const def = scenario()
      .seat(0)
      .battlefield(OATH)
      .build()
      .state.definitions.find((d) => d.name === OATH);
    expect(def && validateCard(def)).toEqual([]);
  });

  test('timesEachTurn is an integer of 2 or more', () => {
    expect(validateAbility(ability({}))).toEqual([]);
    for (const n of [1, 0, 2.5, -1]) {
      expect(validateAbility(ability({ timesEachTurn: n })).map((i) => i.path)).toEqual([
        'ability.static.timesEachTurn',
      ]);
    }
  });

  test('the planeswalkers are read from the battlefield', () => {
    expect(
      validateAbility(
        ability({ planeswalkers: { types: ['planeswalker'], zone: 'graveyard' } }),
      ).map((i) => i.path),
    ).toEqual(['ability.static.planeswalkers']);
  });
});
