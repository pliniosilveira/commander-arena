// "{R/W}, {T}: Add {R}{R}, {R}{W}, or {W}{W}." (D-099): a mana ability that makes one of several
// combinations of mana, with a hybrid symbol in its cost.
// Pins: CR 605.3b (the combination is chosen as the ability resolves, with no stack), CR 107.4e
// (the hybrid symbol is paid with either half), CR 605.3a (a mana cost of a mana ability is paid with
// mana the player already has: tap other sources first), CR 601.2g (the payment planner must know
// what a source can make), CR 106.4 (mana in the pool has no order).
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-mana-plus.ts) or the real fixtures named.
import { describe, expect, test } from 'vitest';
import type { Ability, ManaColor, PayManaDecision } from '../src/index';
import { validateAbility, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const FILTER = 'SYNTHETIC Filter Land';
const BARE = 'SYNTHETIC Bare Filter Land';

type Game = ReturnType<ReturnType<typeof scenario>['build']>;

const combinationsOf = (g: Game, name: string, ability = 1): string[] =>
  g
    .legalActions(0)
    .flatMap((a) =>
      a.kind === 'activateAbility' &&
      a.source === g.id(name) &&
      a.abilityIndex === ability &&
      a.combination
        ? [a.combination.join('')]
        : [],
    );

describe('activating it by hand', () => {
  test('with {R} already in the pool: the three combinations are on offer', () => {
    const g = scenario().seat(0).battlefield(FILTER, 'Mountain').build();
    g.act(0).tapForMana('Mountain');
    // The combinations are written in the order W, U, B, R, G, C: {R}{W} is "WR".
    expect(combinationsOf(g, FILTER)).toEqual(['RR', 'WR', 'WW']);
  });

  test('the cost is paid from the pool, the chosen combination goes to the pool, no stack', () => {
    const g = scenario().seat(0).battlefield(FILTER, 'Mountain').build();
    g.act(0).tapForMana('Mountain');
    const before = g.mark();
    g.act(0).tapForMana(FILTER, { ability: 1, combination: 'RW' });
    g.expect.pool(0, 'RW');
    g.expect.tapped(FILTER);
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'priorityPassed' }, { since: before });
  });

  test('either half of the hybrid symbol pays: {W} does too (CR 107.4e)', () => {
    const g = scenario().seat(0).battlefield(FILTER, 'Plains').build();
    g.act(0).tapForMana('Plains');
    g.act(0).tapForMana(FILTER, { ability: 1, combination: 'WW' });
    g.expect.pool(0, 'WW');
  });

  test('{G} does not pay it, and it is not on offer without red or white mana', () => {
    const g = scenario().seat(0).battlefield(FILTER, 'Forest').build();
    expect(combinationsOf(g, FILTER)).toEqual([]);
    g.act(0).tapForMana('Forest');
    expect(combinationsOf(g, FILTER)).toEqual([]);
    const r = g.act(0).try.tapForMana(FILTER, { ability: 1, combination: 'RR' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('does not hold');
    g.expect.pool(0, 'G');
    g.expect.tapped(FILTER, false);
  });

  test('the order inside the combination does not matter', () => {
    const g = scenario().seat(0).battlefield(FILTER, 'Mountain').build();
    g.act(0).tapForMana('Mountain');
    g.act(0).tapForMana(FILTER, { ability: 1, combination: 'WR' });
    g.expect.pool(0, 'RW');
  });

  test('a combination outside the list is refused and names the ones on offer', () => {
    const g = scenario().seat(0).battlefield(FILTER, 'Mountain').build();
    g.act(0).tapForMana('Mountain');
    const r = g.act(0).try.tapForMana(FILTER, { ability: 1, combination: 'GG' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('cannot make {G}{G}');
      expect(r.error).toContain('{R}{R}, {W}{R}, {W}{W}');
    }
    g.expect.pool(0, 'R');
    g.expect.tapped(FILTER, false);
  });

  test('no combination, or a single color, is refused: one of several must be named', () => {
    const g = scenario().seat(0).battlefield(FILTER, 'Mountain').build();
    g.act(0).tapForMana('Mountain');
    const none = g.act(0).try.action({
      kind: 'activateAbility',
      source: g.id(FILTER),
      abilityIndex: 1,
      color: null,
    });
    expect(none.ok).toBe(false);
    const color = g.act(0).try.tapForMana(FILTER, { ability: 1, color: 'R' });
    expect(color.ok).toBe(false);
    g.expect.pool(0, 'R');
  });

  test('a combination named for an ability that has none is refused', () => {
    const g = scenario().seat(0).battlefield('Mountain').build();
    const r = g.act(0).try.tapForMana('Mountain', { combination: 'R' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('does not offer a choice of combinations');
  });

  test('the colorless tap of the same land is an ordinary ability', () => {
    const g = scenario().seat(0).battlefield(FILTER).build();
    g.act(0).tapForMana(FILTER, { ability: 0 });
    g.expect.pool(0, 'C');
  });
});

describe('the payment planner chooses the combination the cost needs', () => {
  test('{1}{R}{R} from a Mountain, a Forest and the filter: the filter makes {R}{R}', () => {
    const g = scenario()
      .seat(0)
      .hand('Wall of Stone')
      .battlefield(FILTER, 'Mountain', 'Forest')
      .build();
    g.expect.legal(0, { cast: 'Wall of Stone' });
    g.act(0).cast('Wall of Stone', { pay: true });
    for (const name of [FILTER, 'Mountain', 'Forest']) g.expect.tapped(name);
    g.expect.pool(0, '');
    g.passAll();
    g.expect.zone('Wall of Stone', 'battlefield');
  });

  test('{1}{B}{B} from an Island, a Forest and the {U/B} filter: it makes {B}{B}', () => {
    const g = scenario()
      .seat(0)
      .hand('Murder')
      .battlefield(BARE, 'Island', 'Forest')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('Murder', { targets: ['Grizzly Bears'], pay: true });
    for (const name of [BARE, 'Island', 'Forest']) g.expect.tapped(name);
    g.expect.pool(0, '');
  });

  test('a cost that needs one of the two colors takes the combination with it, the spare goes to the pool', () => {
    // {B} for Typhoid Rats: the Island pays the hybrid, the filter makes one of its combinations with
    // a {B} in it, and the other mana goes to the pool (the first such combination, {U}{B}).
    const g = scenario().seat(0).hand('Typhoid Rats').battlefield(BARE, 'Island').build();
    g.act(0).cast('Typhoid Rats', { pay: true });
    g.expect.tapped(BARE);
    g.expect.tapped('Island');
    g.expect.pool(0, 'U');
  });

  test('a cost it cannot help with does not offer the spell', () => {
    // Lightning Bolt needs red: a {U/B} filter and an Island make blue and black only.
    const g = scenario().seat(0).hand('Lightning Bolt').battlefield(BARE, 'Island').build();
    g.expect.illegal(0, { cast: 'Lightning Bolt' });
  });

  test('without other mana the filter alone is not a source: the spell is not offered', () => {
    const g = scenario().seat(0).hand('Typhoid Rats').battlefield(BARE).build();
    g.expect.illegal(0, { cast: 'Typhoid Rats' });
  });

  test('a plain land is used before the filter when it can pay alone', () => {
    const g = scenario().seat(0).hand('Raging Goblin').battlefield(FILTER, 'Mountain').build();
    g.act(0).cast('Raging Goblin', { pay: true });
    g.expect.tapped('Mountain');
    g.expect.tapped(FILTER, false);
  });
});

describe('the payMana decision and manual payment', () => {
  const pending = (g: Game): PayManaDecision => {
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error('expected a payMana decision');
    return d;
  };

  test('manaSources names the combinations of the source, and no colors', () => {
    const g = scenario()
      .seat(0)
      .hand('Wall of Stone')
      .battlefield(FILTER, 'Mountain', 'Forest')
      .build();
    g.act(0).cast('Wall of Stone');
    const entry = pending(g).manaSources.find(
      (s) => s.object === g.id(FILTER) && s.abilityIndex === 1,
    );
    expect(entry?.combinations).toEqual([
      ['R', 'R'],
      ['W', 'R'],
      ['W', 'W'],
    ]);
    expect(entry?.colors).toBeUndefined();
  });

  test('a manual payment taps the Mountain first, then the filter with its combination', () => {
    const g = scenario()
      .seat(0)
      .hand('Wall of Stone')
      .battlefield(FILTER, 'Mountain', 'Forest')
      .build();
    g.act(0)
      .cast('Wall of Stone')
      .payManual(['Mountain', { source: FILTER, ability: 1, combination: 'RR' }, 'Forest']);
    g.expect.stack(['Wall of Stone']);
    g.expect.pool(0, '');
  });

  test('a manual payment that names a combination the source cannot make is refused, nothing is tapped', () => {
    const g = scenario()
      .seat(0)
      .hand('Wall of Stone')
      .battlefield(FILTER, 'Mountain', 'Forest')
      .build();
    g.act(0).cast('Wall of Stone');
    const bad = g.act(0).try.action({
      kind: 'payManual',
      taps: [
        { object: g.id('Mountain'), abilityIndex: 0 },
        { object: g.id(FILTER), abilityIndex: 1, combination: ['G', 'G'] },
      ],
    });
    expect(bad.ok).toBe(false);
    g.expect.tapped('Mountain', false);
    g.expect.tapped(FILTER, false);
    g.expect.pending('payMana', 0);
  });

  test('a manual payment with the wrong combination for the cost does not pay it', () => {
    const g = scenario()
      .seat(0)
      .hand('Wall of Stone')
      .battlefield(FILTER, 'Mountain', 'Forest')
      .build();
    g.act(0).cast('Wall of Stone');
    const bad = g.act(0).try.action({
      kind: 'payManual',
      taps: [
        { object: g.id('Mountain'), abilityIndex: 0 },
        { object: g.id(FILTER), abilityIndex: 1, combination: ['W', 'W'] },
        { object: g.id('Forest'), abilityIndex: 0 },
      ],
    });
    expect(bad.ok).toBe(false);
    g.expect.tapped(FILTER, false);
  });

  test('payAuto from the same position pays and takes the same taps', () => {
    const make = () =>
      scenario().seat(0).hand('Wall of Stone').battlefield(FILTER, 'Mountain', 'Forest').build();
    const a = make();
    const b = make();
    a.act(0).cast('Wall of Stone', { pay: true });
    b.act(0)
      .cast('Wall of Stone')
      .payManual(['Mountain', { source: FILTER, ability: 1, combination: 'RR' }, 'Forest']);
    expect(a.hash()).toBe(b.hash());
  });
});

describe('legal actions agree with applyAction', () => {
  test('every combination on offer is accepted; a combination not on offer is refused', () => {
    const make = () => {
      const g = scenario().seat(0).battlefield(FILTER, 'Mountain').build();
      g.act(0).tapForMana('Mountain');
      return g;
    };
    const probe = make();
    const offered = probe
      .legalActions(0)
      .filter((a) => a.kind === 'activateAbility' && a.combination !== undefined);
    expect(offered).toHaveLength(3);
    for (const action of offered) {
      const g = make();
      expect(g.act(0).try.action(action).ok, JSON.stringify(action)).toBe(true);
    }
    const colors: ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C'];
    for (const a of colors) {
      for (const b of colors) {
        const g = make();
        const action = {
          kind: 'activateAbility' as const,
          source: g.id(FILTER),
          abilityIndex: 1,
          color: null,
          combination: [a, b],
        };
        const listed = g
          .legalActions(0)
          .some(
            (x) =>
              x.kind === 'activateAbility' &&
              x.source === action.source &&
              x.abilityIndex === 1 &&
              x.combination !== undefined &&
              [...x.combination].sort().join('') === [a, b].sort().join(''),
          );
        expect(g.act(0).try.action(action).ok, `${a}${b}`).toBe(listed);
      }
    }
  });
});

describe('validation of a combination production', () => {
  const filter = (production: unknown): Ability =>
    ({
      kind: 'mana',
      cost: [{ kind: 'mana', symbols: ['R/W'] }, { kind: 'tap' }],
      production,
    }) as Ability;

  test('two or more different combinations are valid, in any order inside one', () => {
    expect(
      validateAbility(
        filter({
          kind: 'combination',
          options: [
            ['R', 'R'],
            ['W', 'R'],
            ['W', 'W'],
          ],
        }),
      ),
    ).toEqual([]);
  });

  test('fewer than two, an empty one, an unknown color or the same mana twice is rejected', () => {
    const messages = (options: unknown) =>
      validateAbility(filter({ kind: 'combination', options })).map((i) => i.message);
    expect(messages([['R', 'R']]).join()).toContain('at least two');
    expect(messages(undefined).join()).toContain('at least two');
    expect(messages([['R'], []]).join()).toContain('at least one mana');
    expect(
      messages([
        ['R', 'X'],
        ['W', 'W'],
      ]).join(),
    ).toContain('unknown mana color');
    expect(
      messages([
        ['R', 'W'],
        ['W', 'R'],
      ]).join(),
    ).toContain('same mana');
  });

  test('the fixture filter lands are valid, supported cards', () => {
    const g = scenario().seat(0).battlefield(FILTER, BARE, 'SYNTHETIC Twist Filter Land').build();
    for (const name of [FILTER, BARE, 'SYNTHETIC Twist Filter Land']) {
      const def = g.state.definitions.find((d) => d.name === name);
      expect(def && validateCard(def), name).toEqual([]);
    }
  });
});
