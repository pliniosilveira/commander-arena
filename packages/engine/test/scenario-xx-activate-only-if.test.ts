// "Activate only if you control five or more lands." and "Activate only if you control a Swamp."
// (D-099): a restriction on activating a mana ability or any other activated ability.
// Pins: CR 602.5 (a player can't begin to activate an ability that's prohibited), CR 602.5b (a
// restriction on an ability's use), CR 602.5c (a restriction of a granted ability applies only to the
// ability as granted), CR 605.3 (a mana ability follows the rules for activating an ability), CR
// 106.7 (a restriction is not looked at when another ability asks what this land could produce).
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-mana-plus.ts) or the real fixtures named.
import { describe, expect, test } from 'vitest';
import type { Ability, PayManaDecision } from '../src/index';
import { isFeatureSupported, validateAbility, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const TEMPLE = 'SYNTHETIC Temple';
const TAINTED = 'SYNTHETIC Tainted Land';
const FOUNTAIN = 'SYNTHETIC Gated Fountain';

type Game = ReturnType<ReturnType<typeof scenario>['build']>;

const taps = (g: Game, card: Parameters<Game['id']>[0], ability: number): string[] => {
  const id = g.id(card);
  return g
    .legalActions(0)
    .flatMap((a) =>
      a.kind === 'activateAbility' && a.source === id && a.abilityIndex === ability
        ? [a.color ?? '-']
        : [],
    );
};

describe('"Activate only if you control five or more lands" (a mana ability)', () => {
  test('with four lands, itself included, it cannot be activated and is not offered', () => {
    const g = scenario().seat(0).battlefield(TEMPLE, 'Forest', 'Forest', 'Forest').build();
    expect(taps(g, TEMPLE, 0)).toEqual([]);
    g.expect.illegal(0, { tap: TEMPLE });
    const r = g.act(0).try.tapForMana(TEMPLE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('only if its condition holds');
    g.expect.tapped(TEMPLE, false);
    g.expect.pool(0, '');
  });

  test('with five lands it makes {C}{C}', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TEMPLE, 'Forest', 'Forest', 'Forest', 'Forest')
      .build();
    expect(taps(g, TEMPLE, 0)).toEqual(['-']);
    g.act(0).tapForMana(TEMPLE);
    g.expect.pool(0, 'CC');
    g.expect.tapped(TEMPLE);
  });

  test('the opponent lands are not counted: "you control"', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TEMPLE, 'Forest', 'Forest', 'Forest')
      .seat(1)
      .battlefield('Island', 'Island', 'Island')
      .build();
    expect(taps(g, TEMPLE, 0)).toEqual([]);
  });

  test('it is read when it is activated: playing the fifth land turns it on', () => {
    const g = scenario()
      .seat(0)
      .hand('Forest')
      .battlefield(TEMPLE, 'Forest', 'Forest', 'Forest')
      .build();
    expect(taps(g, TEMPLE, 0)).toEqual([]);
    g.act(0).playLand('Forest');
    expect(taps(g, TEMPLE, 0)).toEqual(['-']);
  });

  test('and it turns off again when a land leaves', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Land Edict')
      .battlefield(TEMPLE, 'Swamp', 'Forest', 'Forest', 'Forest')
      .build();
    expect(taps(g, TEMPLE, 0)).toEqual(['-']);
    g.act(0).cast('SYNTHETIC Land Edict', { pay: true });
    g.passAll();
    g.act(0).choosePermanents({ name: 'Forest', nth: 0 }, { name: 'Forest', nth: 1 });
    expect(taps(g, TEMPLE, 0)).toEqual([]);
  });
});

describe('the payment planner skips an ability whose condition is false (CR 602.5)', () => {
  test('{C}{C} pays for two generic mana with five lands; with four it is not a source', () => {
    const five = scenario()
      .seat(0)
      .hand('Giant Spider')
      .battlefield(TEMPLE, 'Forest', 'Forest', 'Forest', 'Forest')
      .build();
    five.act(0).cast('Giant Spider', { pay: true });
    five.expect.stack(['Giant Spider']);

    // {3}{G} needs four mana: three lands that make one each fall short without the Temple's two.
    const four = scenario()
      .seat(0)
      .hand('Giant Spider')
      .battlefield(TEMPLE, 'Forest', 'Forest')
      .build();
    four.expect.illegal(0, { cast: 'Giant Spider' });
  });

  test('the payMana decision does not list it, and a manual tap of it is refused', () => {
    const g = scenario()
      .seat(0)
      .hand('Unsummon')
      .battlefield(TEMPLE, 'Island', 'Island')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('Unsummon', { targets: ['Grizzly Bears'] });
    const d = g.state.pending as PayManaDecision;
    expect(d.kind).toBe('payMana');
    expect(d.manaSources.some((s) => s.object === g.id(TEMPLE))).toBe(false);
    const bad = g.act(0).try.action({
      kind: 'payManual',
      taps: [{ object: g.id(TEMPLE), abilityIndex: 0 }],
    });
    expect(bad.ok).toBe(false);
    g.expect.tapped(TEMPLE, false);
    g.expect.pending('payMana', 0);
  });
});

describe('"Activate only if you control a Swamp" (one of two abilities of a land)', () => {
  test('without a Swamp only the colorless ability is offered', () => {
    const g = scenario().seat(0).battlefield(TAINTED, 'Forest').build();
    expect(taps(g, TAINTED, 0)).toEqual(['-']);
    expect(taps(g, TAINTED, 1)).toEqual([]);
    g.expect.illegal(0, { tap: TAINTED, color: 'B' });
  });

  test('with a Swamp it makes {B} or {G}', () => {
    const g = scenario().seat(0).battlefield(TAINTED, 'Swamp').build();
    expect(taps(g, TAINTED, 1)).toEqual(['B', 'G']);
    g.act(0).tapForMana(TAINTED, { ability: 1, color: 'G' });
    g.expect.pool(0, 'G');
  });

  test('a Swamp the opponent controls does not count', () => {
    const g = scenario().seat(0).battlefield(TAINTED).seat(1).battlefield('Swamp').build();
    expect(taps(g, TAINTED, 1)).toEqual([]);
  });

  test('the Tainted Land is not a Swamp itself: two of them do not enable each other', () => {
    const g = scenario().seat(0).battlefield(TAINTED, TAINTED).build();
    expect(taps(g, { name: TAINTED, nth: 0 }, 1)).toEqual([]);
    expect(taps(g, { name: TAINTED, nth: 1 }, 1)).toEqual([]);
  });

  test('the planner uses the green of the land only while a Swamp is there', () => {
    const with_ = scenario().seat(0).hand('Grizzly Bears').battlefield(TAINTED, 'Swamp').build();
    with_.expect.legal(0, { cast: 'Grizzly Bears' });
    with_.act(0).cast('Grizzly Bears', { pay: true });
    with_.expect.stack(['Grizzly Bears']);
    const without = scenario().seat(0).hand('Grizzly Bears').battlefield(TAINTED, 'Island').build();
    without.expect.illegal(0, { cast: 'Grizzly Bears' });
  });
});

describe('an activated ability that is not a mana ability', () => {
  test('it is offered only while the condition holds, and refused with a reason otherwise', () => {
    const no = scenario().seat(0).battlefield(FOUNTAIN, 'Forest').build();
    no.expect.illegal(0, { activate: FOUNTAIN });
    const r = no.act(0).try.activate(FOUNTAIN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('only if its condition holds');
    no.expect.tapped(FOUNTAIN, false);

    const yes = scenario().seat(0).battlefield(FOUNTAIN, 'Swamp').build();
    yes.expect.legal(0, { activate: FOUNTAIN });
    yes.act(0).activate(FOUNTAIN);
    yes.passAll();
    yes.expect.life(0, 41);
  });
});

describe('what another ability could produce ignores the restriction (CR 106.7)', () => {
  test('an Orchard sees the colors of a land whose condition is false', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Orchard')
      .seat(1)
      .battlefield(TAINTED)
      .build();
    const colors = g
      .legalActions(0)
      .flatMap((a) => (a.kind === 'activateAbility' && a.color !== null ? [a.color] : []));
    expect(colors).toEqual(['B', 'G']);
  });
});

describe('legal actions agree with applyAction', () => {
  test('whatever is offered is accepted and the gated ability is refused when absent', () => {
    for (const board of [
      ['Forest'],
      ['Swamp'],
      ['Forest', 'Forest', 'Forest', 'Forest'],
      ['Swamp', 'Forest', 'Forest', 'Forest'],
    ]) {
      const make = () =>
        scenario()
          .seat(0)
          .battlefield(TAINTED, TEMPLE, ...board)
          .build();
      const probe = make();
      const offered = probe.legalActions(0).filter((a) => a.kind === 'activateAbility');
      for (const action of offered) {
        expect(make().act(0).try.action(action).ok, JSON.stringify(action)).toBe(true);
      }
      for (const name of [TAINTED, TEMPLE]) {
        for (const abilityIndex of [0, 1]) {
          const action = {
            kind: 'activateAbility' as const,
            source: probe.id(name),
            abilityIndex,
            color: null,
          };
          const listed = offered.some((o) => JSON.stringify(o) === JSON.stringify(action));
          if (!listed) expect(make().act(0).try.action(action).ok).toBe(false);
        }
      }
    }
  });
});

describe('validation and support', () => {
  const gated = (activateOnlyIf: unknown): Ability =>
    ({
      kind: 'mana',
      cost: [{ kind: 'tap' }],
      production: { kind: 'fixed', mana: ['C'] },
      activateOnlyIf,
    }) as Ability;

  test('a well-formed condition is valid; a malformed one is rejected', () => {
    expect(
      validateAbility(gated({ kind: 'controlsAtLeast', filter: { types: ['land'] }, count: 5 })),
    ).toEqual([]);
    expect(validateAbility(gated({ kind: 'controlsAtLeast', filter: {}, count: 0 })).length).toBe(
      1,
    );
    expect(validateAbility(gated({ kind: 'nonsense' })).length).toBe(1);
  });

  test('an activated ability may carry it too', () => {
    const ability = {
      kind: 'activated',
      cost: [{ kind: 'tap' }],
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
      activateOnlyIf: { kind: 'bogus' },
    } as unknown as Ability;
    expect(validateAbility(ability).length).toBe(1);
  });

  test('the fixture cards are valid, supported cards, and the feature is declared', () => {
    const g = scenario().seat(0).battlefield(TEMPLE, TAINTED, FOUNTAIN).build();
    for (const name of [TEMPLE, TAINTED, FOUNTAIN]) {
      const def = g.state.definitions.find((d) => d.name === name);
      expect(def && validateCard(def), name).toEqual([]);
    }
    expect(isFeatureSupported('ability:activateOnlyIf')).toBe(true);
  });
});
