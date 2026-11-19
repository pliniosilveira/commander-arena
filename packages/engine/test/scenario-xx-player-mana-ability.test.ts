// "Until end of turn, any time you could activate a mana ability, you may pay 1 life. If you do, add {C}." (Channel, the Quandrix Unlimited deck): `grantPlayerManaAbility`,
// a mana ability that belongs to the player and not to a permanent.
// Pins: CR 605.1a and 605.3a-b (a mana ability, no stack, activated while paying), CR 118.3 and 119.4 (paying life: a player can't pay more life than they have),
// CR 611.2 and 514.2 (a continuous effect until end of turn), CR 106.4 (mana goes to the pool). Cards are SYNTHETIC (src/cards/fixtures/synthetic-mana-group-f.ts).
import { describe, expect, test } from 'vitest';
import {
  type Action,
  applyAction,
  type GameState,
  getLegalActions,
  syntheticCard,
  validateCard,
} from '../src/index';
import { scenario } from '../src/testing/index';

const CHANNEL = 'SYNTHETIC Life Channel'; // {G}{G} sorcery: pay 1 life, add {C}
const DEAR = 'SYNTHETIC Dear Channel'; // {G} sorcery: pay 2 life, add {G}
const THREE = 'SYNTHETIC Three Sorcery'; // {3}: gain 3
const GREEN = 'SYNTHETIC Green Sorcery'; // {G}: gain 1
const LIB = Array.from({ length: 12 }, () => 'Plains');
const GRANT = -1000;

const base = () =>
  scenario()
    .seat(0)
    .library(...LIB)
    .seat(1)
    .library(...LIB)
    .seat(0);

/** Seat 0 casts the channel with two Forests and lets it resolve; the second spell waits in hand. */
const withChannel = (...hand: string[]) => {
  const g = base()
    .hand(CHANNEL, ...hand)
    .battlefield('Forest', { label: 'f1' })
    .battlefield('Forest', { label: 'f2' })
    .at('precombatMain')
    .build();
  g.act(0).cast(CHANNEL, { pay: true });
  g.passAll();
  return g;
};

const channelAction = (source: string): Action =>
  ({ kind: 'activateAbility', source, abilityIndex: GRANT, color: null }) as Action;

const grantOptions = (state: GameState, seat: 0 | 1) =>
  getLegalActions(state, seat).filter(
    (a) => a.kind === 'activateAbility' && a.abilityIndex <= GRANT,
  );

const lifeOf = (state: GameState, seat: 0 | 1) => state.seats[seat]?.life;

const withLife = (state: GameState, seat: 0 | 1, life: number): GameState => ({
  ...state,
  seats: state.seats.map((s) => (s.id === seat ? { ...s, life } : s)),
});

describe('the cards are valid', () => {
  test.each([CHANNEL, DEAR, THREE, GREEN])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('the shapes that are refused', () => {
    const edit = (change: Record<string, unknown>) => {
      const card = syntheticCard(CHANNEL);
      const face = card.faces[0];
      if (face === undefined || face.spell === undefined) throw new Error('no spell');
      const effect = { ...(face.spell.effect as object), ...change };
      return { ...card, faces: [{ ...face, spell: { ...face.spell, effect } }] } as never;
    };
    expect(validateCard(edit({ life: 0 }))).not.toEqual([]);
    expect(validateCard(edit({ life: -1 }))).not.toEqual([]);
    expect(validateCard(edit({ life: 1.5 }))).not.toEqual([]);
    expect(validateCard(edit({ mana: 'X' }))).not.toEqual([]);
    expect(validateCard(edit({ duration: 'untilNextTurn' }))).not.toEqual([]);
    expect(validateCard(edit({ player: { kind: 'nobody' } }))).not.toEqual([]);
  });
});

describe('the ability is a continuous effect for the player (CR 611.2)', () => {
  test('a game without the effect has no such action', () => {
    const g = base().hand(CHANNEL).battlefield('Forest').at('precombatMain').build();
    expect(grantOptions(g.state, 0)).toEqual([]);
    expect(applyAction(g.state, 0, channelAction('o1')).ok).toBe(false);
  });

  test('resolving the spell gives it to the player that cast it, until end of turn', () => {
    const g = withChannel();
    const effect = g.state.continuousEffects.find((e) => e.change.kind === 'playerPayLifeForMana');
    expect(effect?.players).toEqual([0]);
    expect(effect?.until).toBe('endOfTurn');
    expect(grantOptions(g.state, 0)).toHaveLength(1);
  });

  test('a second player is unaffected', () => {
    const g = withChannel();
    expect(grantOptions(g.state, 1)).toEqual([]);
    const source = (grantOptions(g.state, 0)[0] as Extract<Action, { kind: 'activateAbility' }>)
      .source;
    // Seat 1 may not even try it: the engine refuses (it is not their decision, and they were not given it).
    expect(applyAction(g.state, 1, channelAction(source)).ok).toBe(false);
  });

  test('it is gone in the cleanup step: the next turn has no such action', () => {
    const g = withChannel();
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.continuousEffects.some((e) => e.change.kind === 'playerPayLifeForMana')).toBe(
      false,
    );
    expect(grantOptions(g.state, 0)).toEqual([]);
    expect(grantOptions(g.state, 1)).toEqual([]);
  });
});

describe('activated by hand (CR 605.3a, 605.3b, 118.3)', () => {
  test('pay 1 life: {C} goes to the pool, the stack stays empty, a life event is emitted', () => {
    const g = withChannel();
    const [option] = grantOptions(g.state, 0);
    if (option === undefined) throw new Error('no option');
    const mark = g.mark();
    g.choose(0, option);
    g.expect.pool(0, 'C');
    g.expect.life(0, 39);
    expect(g.state.stack).toHaveLength(0);
    const events = g.eventsSince(mark);
    expect(events).toContainEqual({ kind: 'lifeChanged', seat: 0, from: 40, to: 39 });
    expect(events.some((e) => e.kind === 'manaAdded')).toBe(true);
    // The mana carries the spell that gave the ability as its source; it is colorless.
    expect(g.state.seats[0]?.manaPool[0]?.color).toBe('C');
    expect(g.state.seats[0]?.manaPool[0]?.source).toBe(
      (option as Extract<Action, { kind: 'activateAbility' }>).source,
    );
  });

  test('any number of times', () => {
    const g = withChannel();
    for (let i = 0; i < 5; i += 1) {
      const [option] = grantOptions(g.state, 0);
      if (option === undefined) throw new Error('no option');
      g.choose(0, option);
    }
    g.expect.pool(0, 'CCCCC');
    g.expect.life(0, 35);
    expect(grantOptions(g.state, 0)).toHaveLength(1);
  });

  test('refused when the life cannot be paid: life 0 and life below the cost', () => {
    const g = withChannel();
    const [option] = grantOptions(g.state, 0);
    if (option === undefined) throw new Error('no option');
    // The state is changed under the listing, so only the refusal is asked of the engine (a player can't pay more life than they have).
    expect(applyAction(withLife(g.state, 0, 0), 0, option).ok).toBe(false);
    const dear = base()
      .hand(DEAR)
      .battlefield('Forest')
      .life(1)
      .at('precombatMain')
      .build();
    dear.act(0).cast(DEAR, { pay: true });
    dear.passAll();
    // 2 life to pay, 1 life: refused. At 2 life it is on offer, and it takes the player to 0.
    expect(grantOptions(dear.state, 0)).toEqual([]);
    const two = base().hand(DEAR).battlefield('Forest').life(2).at('precombatMain').build();
    two.act(0).cast(DEAR, { pay: true });
    two.passAll();
    expect(grantOptions(two.state, 0)).toHaveLength(1);
    expect(applyAction(two.state, 0, grantOptions(two.state, 0)[0] as Action).ok).toBe(true);
  });

  test('it is general over the life and the mana: pay 2 life, add {G}', () => {
    const g = base().hand(DEAR).battlefield('Forest').at('precombatMain').build();
    g.act(0).cast(DEAR, { pay: true });
    g.passAll();
    const [option] = grantOptions(g.state, 0);
    if (option === undefined) throw new Error('no option');
    g.choose(0, option);
    g.expect.pool(0, 'G');
    g.expect.life(0, 38);
  });
});

describe('in the middle of paying for a spell (CR 605.3b, 601.2g)', () => {
  test('payManual: several uses in one payment pay a {3} cost', () => {
    const g = withChannel(THREE);
    const source = (grantOptions(g.state, 0)[0] as Extract<Action, { kind: 'activateAbility' }>)
      .source;
    g.act(0).cast(THREE);
    const tap = { object: source, abilityIndex: GRANT } as never;
    g.choose(0, { kind: 'payManual', taps: [tap, tap, tap] });
    g.passAll();
    // 40 - 3 for the mana, + 3 for the spell.
    g.expect.life(0, 40);
    g.expect.pool(0, '');
  });

  test('payManual: a plain tap and a use of the ability together, the pool keeps what is left', () => {
    const g = base()
      .hand(CHANNEL, THREE)
      .battlefield('Forest', { label: 'f1' })
      .battlefield('Forest', { label: 'f2' })
      .battlefield('Forest', { label: 'f3' })
      .at('precombatMain')
      .build();
    g.act(0).cast(CHANNEL, { pay: true });
    g.passAll();
    const source = (grantOptions(g.state, 0)[0] as Extract<Action, { kind: 'activateAbility' }>)
      .source;
    g.act(0).cast(THREE);
    g.choose(0, {
      kind: 'payManual',
      taps: [
        { object: g.id('f3'), abilityIndex: 0 },
        { object: source, abilityIndex: GRANT },
        { object: source, abilityIndex: GRANT },
      ],
    } as never);
    g.expect.life(0, 38);
  });

  test('payManual is refused when the life cannot be paid, and nothing changes', () => {
    const g = withChannel(THREE);
    const source = (grantOptions(g.state, 0)[0] as Extract<Action, { kind: 'activateAbility' }>)
      .source;
    g.act(0).cast(THREE);
    const poor = withLife(g.state, 0, 2);
    const tap = { object: source, abilityIndex: GRANT } as never;
    expect(applyAction(poor, 0, { kind: 'payManual', taps: [tap, tap, tap] }).ok).toBe(false);
  });

  test('payAuto uses the ability only for the mana the permanents cannot make', () => {
    const g = base()
      .hand(CHANNEL, THREE)
      .battlefield('Forest', { label: 'f1' })
      .battlefield('Forest', { label: 'f2' })
      .battlefield('Forest', { label: 'f3' })
      .at('precombatMain')
      .build();
    g.act(0).cast(CHANNEL, { pay: true });
    g.passAll();
    // One Forest is left for {3}: it pays one, the life pays two.
    g.act(0).cast(THREE, { pay: true });
    g.passAll();
    g.expect.life(0, 40 - 2 + 3);
  });

  test('payAuto spends no life when the permanents pay the whole cost', () => {
    const g = base()
      .hand(CHANNEL, THREE)
      .battlefield('Forest', { label: 'f1' })
      .battlefield('Forest', { label: 'f2' })
      .battlefield('Forest', { label: 'f3' })
      .battlefield('Forest', { label: 'f4' })
      .battlefield('Forest', { label: 'f5' })
      .at('precombatMain')
      .build();
    g.act(0).cast(CHANNEL, { pay: true });
    g.passAll();
    g.act(0).cast(THREE, { pay: true });
    g.passAll();
    g.expect.life(0, 43);
  });

  test('payAuto pays no life to keep a color for a spell in hand: the ability is the last resort', () => {
    const g = base()
      .hand(CHANNEL, THREE, GREEN)
      .battlefield('Forest')
      .battlefield('Forest')
      .battlefield('Forest')
      .battlefield('Forest')
      .battlefield('Forest')
      .at('precombatMain')
      .build();
    g.act(0).cast(CHANNEL, { pay: true });
    g.passAll();
    g.act(0).cast(THREE, { pay: true });
    g.passAll();
    g.expect.life(0, 43);
  });

  test('a cost of colored mana is not paid with the colorless mana of the ability', () => {
    const g = withChannel(GREEN);
    expect(
      getLegalActions(g.state, 0).some((a) => a.kind === 'castSpell'),
    ).toBe(false);
    g.expect.life(0, 40);
  });

  test('the planner never pays the player to 0: it keeps 1 life', () => {
    const at = (life: number) => {
      const g = base()
        .hand(CHANNEL, THREE)
        .battlefield('Forest')
        .battlefield('Forest')
        .life(life)
        .at('precombatMain')
        .build();
      g.act(0).cast(CHANNEL, { pay: true });
      g.passAll();
      return g;
    };
    // {3} with no permanent left: three uses of the ability, which needs 4 life to stay above 0.
    expect(getLegalActions(at(3).state, 0).some((a) => a.kind === 'castSpell')).toBe(false);
    expect(getLegalActions(at(4).state, 0).some((a) => a.kind === 'castSpell')).toBe(true);
  });
});
