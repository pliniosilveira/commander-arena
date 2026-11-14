// "{T}, Pay 1 life: Add one mana of any color." (D-099): a mana ability with a life cost.
// Pins: CR 119.4 (a player may pay life only if their life total is at least the payment; paying is
// losing that much life), CR 605.3 (a mana ability follows the rules for activating an ability, so
// its costs are paid as it is activated), CR 605.3b (the mana is added at once, no stack), CR 704.5a
// (a player with 0 or less life loses: paying to 0 is legal and ends the game at the next check), CR
// 107.4f (the life of Phyrexian mana is the other thing a payment may pay).
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-mana-plus.ts) or the real fixtures named.
import { describe, expect, test } from 'vitest';
import type { Ability } from '../src/index';
import {
  isFeatureSupported,
  parseManaCost,
  planPayment,
  validateAbility,
  validateCard,
} from '../src/index';
import { scenario } from '../src/testing/index';
import { oid, source } from './mana-fixtures';

const CONFLUENCE = 'SYNTHETIC Confluence';
const ROCK = 'SYNTHETIC Blood Rock';

describe('activating it by hand', () => {
  test('it taps, pays 1 life and adds the chosen color, in one activation with no stack', () => {
    const g = scenario().seat(0).battlefield(CONFLUENCE).build();
    const before = g.mark();
    g.act(0).tapForMana(CONFLUENCE, { color: 'R' });
    g.expect.pool(0, 'R');
    g.expect.life(0, 39);
    g.expect.tapped(CONFLUENCE);
    g.expect.stack([]);
    g.expect.eventLog(
      [
        { kind: 'tapped' },
        { kind: 'lifeChanged', seat: 0, from: 40, to: 39 },
        { kind: 'manaAdded', seat: 0, count: 1 },
      ],
      { since: before },
    );
    g.expect.noEvent({ kind: 'priorityPassed' }, { since: before });
  });

  test('all five colors are on offer', () => {
    const g = scenario().seat(0).battlefield(CONFLUENCE).build();
    const colors = g
      .legalActions(0)
      .flatMap((a) => (a.kind === 'activateAbility' ? [a.color] : []));
    expect(colors).toEqual(['W', 'U', 'B', 'R', 'G']);
  });

  test('a life total equal to the payment is enough (CR 119.4): it goes to 0 and the player loses', () => {
    const g = scenario().seat(0).life(1).battlefield(CONFLUENCE).seat(1).build();
    g.expect.legal(0, { tap: CONFLUENCE, color: 'W' });
    g.act(0).tapForMana(CONFLUENCE, { color: 'W' });
    g.expect.life(0, 0);
    g.expect.hasLost(0);
    g.expect.gameOver({ win: 1 });
  });

  test('a life total below the payment is not enough: not offered, refused with a reason', () => {
    const g = scenario().seat(0).life(1).battlefield(ROCK).build();
    g.expect.illegal(0, { tap: ROCK });
    const r = g.act(0).try.tapForMana(ROCK);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('less than 2 life');
    g.expect.life(0, 1);
    g.expect.tapped(ROCK, false);
  });

  test('a payment of 2 makes both mana: {B}{B} for 2 life', () => {
    const g = scenario().seat(0).life(2).battlefield(ROCK).seat(1).build();
    g.act(0).tapForMana(ROCK);
    g.expect.pool(0, 'BB');
    g.expect.life(0, 0);
    g.expect.hasLost(0);
  });

  test('life gain or loss before tapping changes whether it is offered', () => {
    const g = scenario().seat(0).life(2).battlefield(ROCK).build();
    g.expect.legal(0, { tap: ROCK });
    const less = scenario().seat(0).life(1).battlefield(ROCK).build();
    less.expect.illegal(0, { tap: ROCK });
  });
});

describe('the payment planner', () => {
  test('a source that costs nothing is used before the life-costing one', () => {
    const g = scenario().seat(0).hand('Typhoid Rats').battlefield(CONFLUENCE, 'Swamp').build();
    g.act(0).cast('Typhoid Rats', { pay: true });
    g.expect.tapped('Swamp');
    g.expect.tapped(CONFLUENCE, false);
    g.expect.life(0, 40);
  });

  test('when it is needed it is used and its life is paid', () => {
    const g = scenario().seat(0).hand('Lightning Bolt').battlefield(CONFLUENCE).build();
    g.expect.legal(0, { cast: 'Lightning Bolt' });
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.expect.tapped(CONFLUENCE);
    g.expect.life(0, 39);
  });

  test('automatic payment never takes its own player to 0: the spell is not offered', () => {
    const dying = scenario().seat(0).life(1).hand('Lightning Bolt').battlefield(CONFLUENCE).build();
    dying.expect.illegal(0, { cast: 'Lightning Bolt' });
    const safe = scenario().seat(0).life(2).hand('Lightning Bolt').battlefield(CONFLUENCE).build();
    safe.expect.legal(0, { cast: 'Lightning Bolt' });
    safe.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    safe.expect.life(0, 1);
  });

  test('two life payments in one plan count together', () => {
    // Murder costs {1}{B}{B}: three Confluences pay 3 life.
    const make = (life: number) =>
      scenario()
        .seat(0)
        .life(life)
        .hand('Murder')
        .battlefield(CONFLUENCE, CONFLUENCE, CONFLUENCE)
        .seat(1)
        .battlefield('Grizzly Bears')
        .build();
    make(3).expect.illegal(0, { cast: 'Murder' });
    const g = make(4);
    g.expect.legal(0, { cast: 'Murder' });
    g.act(0).cast('Murder', { targets: ['Grizzly Bears'], pay: true });
    g.expect.life(0, 1);
  });

  test('a larger payment source is only used when the budget allows, and a cheaper plan is found instead', () => {
    // {B}{B} from a Swamp pair would cost nothing; the Rock is not touched.
    const g = scenario()
      .seat(0)
      .hand('Murder')
      .life(2)
      .battlefield(ROCK, 'Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('Murder', { targets: ['Grizzly Bears'], pay: true });
    g.expect.tapped(ROCK, false);
    g.expect.life(0, 2);
  });

  test('the Rock pays {B}{B} for 2 life when it must', () => {
    const g = scenario()
      .seat(0)
      .hand('Murder')
      .battlefield(ROCK, 'Island')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('Murder', { targets: ['Grizzly Bears'], pay: true });
    g.expect.tapped(ROCK);
    g.expect.life(0, 38);
  });

  test('by hand a player may pay to 0, and loses', () => {
    const g = scenario()
      .seat(0)
      .life(1)
      .hand('Typhoid Rats')
      .battlefield('Swamp', CONFLUENCE)
      .seat(1)
      .build();
    g.expect.legal(0, { cast: 'Typhoid Rats' });
    g.act(0)
      .cast('Typhoid Rats')
      .payManual([{ source: CONFLUENCE, color: 'B' }]);
    g.expect.life(0, 0);
    g.expect.hasLost(0);
  });

  test('a manual payment with a source that costs more life than the player has is refused', () => {
    const g = scenario().seat(0).life(1).hand('Typhoid Rats').battlefield(ROCK, 'Swamp').build();
    g.act(0).cast('Typhoid Rats');
    const bad = g.act(0).try.action({
      kind: 'payManual',
      taps: [{ object: g.id(ROCK), abilityIndex: 0 }],
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('less than 2 life');
    g.expect.tapped(ROCK, false);
    g.expect.life(0, 1);
    g.expect.pending('payMana', 0);
  });
});

describe('legal actions agree with applyAction', () => {
  test.each([1, 2, 3])('with %i life, the Rock is offered exactly when it can be paid', (life) => {
    const make = () => scenario().seat(0).life(life).battlefield(ROCK, CONFLUENCE).seat(1).build();
    const probe = make();
    const offered = probe
      .legalActions(0)
      .filter((a) => a.kind === 'activateAbility')
      .map((a) => JSON.stringify(a));
    for (const name of [ROCK, CONFLUENCE]) {
      for (const color of [null, 'W', 'U', 'B', 'R', 'G'] as const) {
        const action = {
          kind: 'activateAbility' as const,
          source: probe.id(name),
          abilityIndex: 0,
          color,
        };
        const listed = offered.includes(JSON.stringify(action));
        expect(make().act(0).try.action(action).ok, `${name} ${color}`).toBe(listed);
      }
    }
    expect(
      offered.includes(
        JSON.stringify({
          kind: 'activateAbility',
          source: probe.id(ROCK),
          abilityIndex: 0,
          color: null,
        }),
      ),
    ).toBe(life >= 2);
  });
});

describe('the planner itself: life lost by sources and Phyrexian mana share one budget', () => {
  const request = (
    cost: string[],
    sources: ReturnType<typeof source>[],
    lifeAvailable: number,
  ) => ({
    cost: parseManaCost(cost),
    x: 0,
    pool: [],
    sources,
    lifeAvailable,
    spell: { types: ['creature'] },
  });

  test('a source with a life loss is used only within the budget', () => {
    const costly = source(1, [['R']], { lifeLoss: 1 });
    expect(planPayment(request(['R'], [costly], 0))).toBeNull();
    expect(planPayment(request(['R'], [costly], 1))?.taps).toEqual([
      { object: oid(1), abilityIndex: 0, outcome: 0 },
    ]);
  });

  test('a free source is preferred to the same mana from a costly one', () => {
    const costly = source(1, [['R']], { lifeLoss: 1 });
    const free = source(2, [['R']]);
    expect(planPayment(request(['R'], [costly, free], 5))?.taps.map((t) => t.object)).toEqual([
      oid(2),
    ]);
  });

  test('Phyrexian life and a source life loss are added: they do not both fit in a budget of 2', () => {
    const costly = source(1, [['R']], { lifeLoss: 1 });
    // {R/P}{R}: the source pays {R}, and {R/P} costs 2 life, so 3 in all.
    expect(planPayment(request(['R/P', 'R'], [costly], 2))).toBeNull();
    expect(planPayment(request(['R/P', 'R'], [costly], 3))?.lifePaid).toBe(2);
  });

  test('a budget that cannot pay for the costly source falls back to a plan without it', () => {
    const costly = source(1, [['R']], { lifeLoss: 2 });
    const second = source(2, [['R']]);
    const plan = planPayment(request(['R', 'R'], [costly, second], 1));
    expect(plan).toBeNull();
    const ok = planPayment(request(['R', 'R'], [costly, second], 2));
    expect(ok?.taps).toHaveLength(2);
  });
});

describe('validation and support', () => {
  const lifeCost = (amount: number): Ability => ({
    kind: 'mana',
    cost: [{ kind: 'tap' }, { kind: 'payLife', amount }],
    production: { kind: 'anyColor' },
  });

  test('a life cost of at least 1 is valid; none or a fraction is not', () => {
    expect(validateAbility(lifeCost(1))).toEqual([]);
    expect(validateAbility(lifeCost(3))).toEqual([]);
    expect(
      validateAbility(lifeCost(0))
        .map((i) => i.message)
        .join(),
    ).toContain('at least 1');
    expect(validateAbility(lifeCost(1.5)).length).toBeGreaterThan(0);
  });

  test('the fixtures are valid, supported cards and the cost kind is declared', () => {
    const g = scenario().seat(0).battlefield(CONFLUENCE, ROCK).build();
    for (const name of [CONFLUENCE, ROCK]) {
      const def = g.state.definitions.find((d) => d.name === name);
      expect(def && validateCard(def), name).toEqual([]);
    }
    expect(isFeatureSupported('manaCost:payLife')).toBe(true);
  });
});
