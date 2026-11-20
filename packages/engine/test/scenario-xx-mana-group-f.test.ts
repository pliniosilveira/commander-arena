// Mana abilities with a restriction by mana value or {X}, a count of mana of one chosen color, a limit of once each turn, and the permission to cast spells as though they
// had flash (the Quandrix Unlimited deck, group F): `spendOnly.qualities`, the production `anyColorAmount`, `ManaAbility.oncePerTurn`, the effect `grantCastAsThoughFlash`.
// Pins: CR 106.6 (mana spend restrictions), CR 202.3 and 202.3e (mana value, an {X} on the stack), CR 107.3 ({X} in a cost), CR 605.1a and 605.3b (mana abilities: no stack,
// the color chosen as it is activated), CR 602.5b (activate only once each turn), CR 601.3b and 702.8a (cast as though it had flash), CR 514.2 (until end of turn ends in the
// cleanup step). Cards are SYNTHETIC (src/cards/fixtures/synthetic-mana-group-f.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const ROCK = 'SYNTHETIC Restricted Rock'; // {T}: {G}{U}, only for mana value 5 or greater or {X} spells
const BIG_ROCK = 'SYNTHETIC Big Spell Rock'; // {T}: {G}, only for mana value 4 or greater
const CHANNELER = 'SYNTHETIC Power Channeler'; // 2/2: {T}: X mana of one color, X its power
const HORN = 'SYNTHETIC Charge Horn'; // {T}: one mana of a chosen color for each charge counter
const BLOOM = 'SYNTHETIC Bloom Once'; // remove a charge counter: one mana of any color, once each turn
const HAVEN = 'SYNTHETIC Flash Haven'; // {G}{U}, {T}: cast spells this turn as though they had flash
const BIG = 'SYNTHETIC Big Sorcery'; // {3}{G}{G}: gain 5
const SMALL = 'SYNTHETIC Small Sorcery'; // {G}{G}: gain 2
const DUAL = 'SYNTHETIC Dual Sorcery'; // {G}{U}: gain 2 (exactly what the rock makes)
const X_SPELL = 'SYNTHETIC X Sorcery'; // {X}{G}{G}: gain X
const LIB = Array.from({ length: 12 }, () => 'Plains');

const base = () =>
  scenario()
    .seat(0)
    .library(...LIB)
    .seat(1)
    .library(...LIB)
    .seat(0);

describe('the cards are valid', () => {
  test.each([ROCK, BIG_ROCK, CHANNELER, HORN, BLOOM, HAVEN, BIG, SMALL, DUAL, X_SPELL])(
    '%s',
    (name) => {
      expect(validateCard(syntheticCard(name))).toEqual([]);
    },
  );

  test('the shapes that are refused', () => {
    const edit = (
      name: string,
      change: (ability: Record<string, unknown>) => unknown,
      kind = 'mana',
    ) => {
      const card = syntheticCard(name);
      const face = card.faces[0];
      if (face === undefined) throw new Error('no face');
      const abilities = face.abilities.map((a, i) =>
        i === face.abilities.findIndex((x) => x.kind === kind) ? change({ ...a }) : a,
      );
      return { ...card, faces: [{ ...face, abilities }] } as never;
    };
    // qualities: not empty, a known kind, a whole mana value from 1, never with the chosen type
    expect(validateCard(edit(ROCK, (a) => ({ ...a, spendOnly: { qualities: [] } })))).not.toEqual(
      [],
    );
    expect(
      validateCard(
        edit(ROCK, (a) => ({ ...a, spendOnly: { qualities: [{ kind: 'flying' }] } })),
      ),
    ).not.toEqual([]);
    expect(
      validateCard(
        edit(ROCK, (a) => ({
          ...a,
          spendOnly: { qualities: [{ kind: 'manaValueAtLeast', value: 0 }] },
        })),
      ),
    ).not.toEqual([]);
    // anyColorAmount: a state amount only; no cost that gives up a permanent or takes counters off (it is counted before costs are paid)
    expect(
      validateCard(
        edit(CHANNELER, (a) => ({
          ...a,
          cost: [{ kind: 'tap' }, { kind: 'removeCounters', counter: 'charge', count: 1 }],
        })),
      ),
    ).not.toEqual([]);
    expect(
      validateCard(
        edit(CHANNELER, (a) => ({
          ...a,
          production: { kind: 'anyColorAmount', amount: { kind: 'x' } },
        })),
      ),
    ).not.toEqual([]);
    expect(
      validateCard(
        edit(CHANNELER, (a) => ({
          ...a,
          production: {
            kind: 'anyColorAmount',
            amount: { kind: 'powerOf', of: { kind: 'target', id: 't1' } },
          },
        })),
      ),
    ).not.toEqual([]);
    // oncePerTurn is true or absent
    expect(validateCard(edit(BLOOM, (a) => ({ ...a, oncePerTurn: false })))).not.toEqual([]);
    // the permission lasts until end of turn
    expect(
      validateCard(
        edit(
          HAVEN,
          (a) => ({
            ...a,
            effect: { ...(a.effect as object), duration: 'untilNextTurn' },
          }),
          'activated',
        ),
      ),
    ).not.toEqual([]);
  });

  test('a spell cannot ask for the color of an amount of mana: only a mana ability can', () => {
    const card = syntheticCard(BIG);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const spell = {
      effect: {
        kind: 'addMana',
        mana: { kind: 'anyColorAmount', amount: 2 },
      },
    };
    expect(validateCard({ ...card, faces: [{ ...face, spell }] } as never)).not.toEqual([]);
  });
});

describe('spendOnly.qualities (CR 106.6, 202.3, 107.3)', () => {
  test('the mana waits in the pool, restricted, after the rock is tapped', () => {
    const g = base().battlefield(ROCK).at('precombatMain').build();
    g.act(0).tapForMana(ROCK);
    g.expect.pool(0, 'GU');
    expect(g.state.seats[0]?.manaPool.every((m) => m.restriction !== null)).toBe(true);
  });

  test('a spell with mana value 5 can be paid with it', () => {
    const g = base()
      .hand(BIG)
      .battlefield(ROCK, 'Forest', 'Forest', 'Forest')
      .at('precombatMain')
      .build();
    g.expect.legal(0, { cast: BIG });
    g.act(0).cast(BIG, { pay: true });
    g.passAll();
    g.expect.life(0, 45);
    g.expect.tapped(ROCK);
  });

  test('without the rock the same lands cannot pay mana value 5', () => {
    const g = base()
      .hand(BIG)
      .battlefield('Forest', 'Forest', 'Forest')
      .at('precombatMain')
      .build();
    g.expect.illegal(0, { cast: BIG });
  });

  test('a spell with mana value 2 cannot use it, so the rock alone does not make it castable', () => {
    const g = base().hand(DUAL).battlefield(ROCK).at('precombatMain').build();
    // The rock makes exactly {G}{U}, which would pay the whole cost, but only for the spells it names.
    g.expect.illegal(0, { cast: DUAL });
  });

  test('a spell with mana value 2 is paid with the other lands and the rock stays untapped', () => {
    const g = base().hand(SMALL).battlefield(ROCK, 'Forest', 'Forest').at('precombatMain').build();
    g.act(0).cast(SMALL, { pay: true });
    g.passAll();
    g.expect.life(0, 42);
    g.expect.tapped(ROCK, false);
  });

  test('a spell with {X} in its cost can use it, whatever X is (X = 0 gives mana value 2)', () => {
    const g = base().hand(X_SPELL).battlefield(ROCK, 'Forest').at('precombatMain').build();
    g.act(0).cast(X_SPELL).x(0).payManual([ROCK, 'Forest']);
    g.passAll();
    g.expect.life(0, 40);
    g.expect.tapped(ROCK);
  });

  test('the mana value of a spell is read as it is cast: 4 or greater, not 3', () => {
    const g = base()
      .hand(BIG, SMALL)
      .battlefield(BIG_ROCK, 'Forest', 'Forest', 'Forest', 'Forest')
      .at('precombatMain')
      .build();
    // {G} from the rock can pay for the mana value 5 spell; four Forests make the other four.
    g.act(0).cast(BIG, { pay: true });
    g.passAll();
    g.expect.life(0, 45);
    g.expect.tapped(BIG_ROCK);
  });

  test('restricted mana cannot pay for the cost of an ability', () => {
    const g = base().battlefield(ROCK, HAVEN).at('precombatMain').build();
    g.act(0).tapForMana(ROCK);
    // The Haven needs {G}{U}: the pool holds exactly that, but it may not be spent on an ability.
    g.expect.illegal(0, { activate: HAVEN, ability: 1 });
  });
});

describe('anyColorAmount (CR 106.1b, 605.3b)', () => {
  test('X mana of the color chosen, X the power of the creature', () => {
    const g = base().battlefield(CHANNELER).at('precombatMain').build();
    g.act(0).tapForMana(CHANNELER, { color: 'R' });
    g.expect.pool(0, 'RR');
  });

  test('the power is read now: a +1/+1 counter makes three', () => {
    const g = base()
      .battlefield(CHANNELER, { counters: { '+1/+1': 1 } })
      .at('precombatMain')
      .build();
    g.act(0).tapForMana(CHANNELER, { color: 'U' });
    g.expect.pool(0, 'UUU');
  });

  test('the color must be named: the mana is of one color', () => {
    const g = base().battlefield(CHANNELER).at('precombatMain').build();
    expect(() => g.act(0).tapForMana(CHANNELER)).toThrow(/pass \{ color \}/);
    g.expect.pool(0, '');
    g.expect.tapped(CHANNELER, false);
  });

  test('one mana for each charge counter on the artifact, of the chosen color', () => {
    const g = base()
      .battlefield(HORN, { counters: { charge: 3 } })
      .at('precombatMain')
      .build();
    g.act(0).tapForMana(HORN, { color: 'B' });
    g.expect.pool(0, 'BBB');
  });

  test('with no counters it makes no mana and is not tapped', () => {
    const g = base().battlefield(HORN).at('precombatMain').build();
    const r = g.act(0).try.tapForMana(HORN, { color: 'B' });
    expect(r.ok).toBe(false);
    g.expect.tapped(HORN, false);
  });

  test('a spell is paid with it by the planner: three mana of one color for a {G}{G}{G} cost', () => {
    const g = base()
      .hand(BIG)
      .battlefield(HORN, { counters: { charge: 3 } })
      .battlefield('Forest', 'Forest')
      .at('precombatMain')
      .build();
    // {3}{G}{G}: the Horn makes GGG (the color is chosen for the planner as the cost needs it), the Forests two more.
    g.expect.legal(0, { cast: BIG });
    g.act(0).cast(BIG, { pay: true });
    g.passAll();
    g.expect.life(0, 45);
  });
});

describe('oncePerTurn on a mana ability (CR 602.5b)', () => {
  test('the first activation takes a counter and makes mana, the second is refused', () => {
    const g = base()
      .battlefield(BLOOM, { counters: { charge: 2 } })
      .at('precombatMain')
      .build();
    g.act(0).tapForMana(BLOOM, { color: 'R' });
    g.expect.pool(0, 'R');
    g.expect.counters(BLOOM, { charge: 1 });
    const again = g.act(0).try.tapForMana(BLOOM, { color: 'U' });
    expect(again.ok).toBe(false);
    g.expect.pool(0, 'R');
    g.expect.counters(BLOOM, { charge: 1 });
  });

  test('it counts again from the next turn of its controller', () => {
    const g = base()
      .battlefield(BLOOM, { counters: { charge: 2 } })
      .at('precombatMain')
      .build();
    g.act(0).tapForMana(BLOOM, { color: 'R' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).tapForMana(BLOOM, { color: 'G' });
    g.expect.counters(BLOOM, { charge: 0 });
    g.expect.pool(0, 'G');
  });

  test('a payment uses it once: two mana of its kind are not made in one turn', () => {
    const g = base()
      .hand(SMALL)
      .battlefield(BLOOM, { counters: { charge: 3 } })
      .at('precombatMain')
      .build();
    // {G}{G} would need two taps of the same ability.
    g.expect.illegal(0, { cast: SMALL });
  });

  test('a payment that taps it once is made, and uses up the turn', () => {
    const g = base()
      .hand(SMALL)
      .battlefield(BLOOM, { counters: { charge: 3 } })
      .battlefield('Forest')
      .at('precombatMain')
      .build();
    g.act(0).cast(SMALL, { pay: true });
    g.passAll();
    g.expect.life(0, 42);
    g.expect.counters(BLOOM, { charge: 2 });
    expect(g.act(0).try.tapForMana(BLOOM, { color: 'R' }).ok).toBe(false);
  });
});

describe('grantCastAsThoughFlash (CR 601.3b, 702.8a, 514.2)', () => {
  const board = () =>
    base()
      .hand(SMALL)
      .battlefield(HAVEN)
      .battlefield('Forest', { label: 'f1' })
      .battlefield('Island', { label: 'i1' })
      .battlefield('Forest', { label: 'f2' })
      .battlefield('Forest', { label: 'f3' })
      .at('precombatMain');

  test('before the ability a sorcery cannot be cast in the end step; after it, it can', () => {
    const g = board().build();
    g.advanceTo('end');
    g.expect.illegal(0, { cast: SMALL });

    const h = board().build();
    h.act(0).activate(HAVEN, { ability: 1 }).payManual(['f1', 'i1']);
    h.passAll();
    h.advanceTo('end');
    h.expect.legal(0, { cast: SMALL });
    h.act(0).cast(SMALL, { pay: true });
    h.passAll();
    h.expect.life(0, 42);
  });

  test('the permission is the activating player: nothing is granted to the opponent', () => {
    const g = board().build();
    g.act(0).activate(HAVEN, { ability: 1 }).payManual(['f1', 'i1']);
    g.passAll();
    const effect = g.state.continuousEffects.find(
      (e) => e.change.kind === 'playerCastAsThoughFlash',
    );
    expect(effect?.players).toEqual([0]);
  });

  test('it ends with the turn (the cleanup step)', () => {
    const g = board().build();
    g.act(0).activate(HAVEN, { ability: 1 }).payManual(['f1', 'i1']);
    g.passAll();
    expect(g.state.continuousEffects.some((e) => e.change.kind === 'playerCastAsThoughFlash')).toBe(
      true,
    );
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.continuousEffects.some((e) => e.change.kind === 'playerCastAsThoughFlash')).toBe(
      false,
    );
  });
});
