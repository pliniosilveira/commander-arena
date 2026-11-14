// X in mana costs (D-103): "deals X damage", "draw X cards", "put X +1/+1 counters", "enters with X
// +1/+1 counters on it", "pay X life" as an additional cost, an activated ability with {X} or "pay X
// life" in its cost.
// Pins: CR 107.3a (the controller announces X as the spell is cast or the ability activated; every X
// in its costs equals it), CR 601.2b (X is announced after the kicker and before the targets),
// CR 601.2f (the total cost has X generic mana for each {X}: two {X} are 2X; reductions and commander
// tax are part of it), CR 602.2b (an activation follows the same steps), CR 107.3b (a spell cast
// without paying its mana cost has X = 0), CR 107.3g and 107.3m ("enters with X counters" reads the X of
// the spell; a permanent that was not cast has X = 0), CR 119.4 (life is paid only if the life total
// is at least the amount), CR 202.3e (a spell's mana value on the stack counts X), CR 733 (cancel).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-x.ts, synthetic.ts).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { applyAction, getLegalActions, getView } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { chooseXDecision } from './pending-helpers';

const BURN = 'SYNTHETIC X Burn'; // {X}{R}: X damage to any target
const DRAW = 'SYNTHETIC X Draw'; // {X}{U}: draw X
const DOUBLE = 'SYNTHETIC Double X Draw'; // {X}{X}{U}: draw X
const PUMP = 'SYNTHETIC X Pump'; // {X}{G}: X +1/+1 counters on target creature
const HYDRA = 'SYNTHETIC Hydra Cub'; // {X}{G} 1/1: enters with X +1/+1 counters
const BLOOD = 'SYNTHETIC Blood Burn'; // {R}, pay X life: X damage to any target
const KICKED = 'SYNTHETIC Kicked X Burn'; // {X}{R}, kicker {2}: X damage to any target
const FREE = 'SYNTHETIC Free X Burn'; // {X}{R}, may be cast without paying its mana cost
const CANNON = 'SYNTHETIC X Cannon'; // {X}, {T}: X damage to target creature
const LANCE = 'SYNTHETIC Blood Lance'; // pay X life: X damage to target creature
const WELL = 'SYNTHETIC Double Well'; // {X}{X}, {T}: draw X
const DISCOUNT = 'SYNTHETIC Spell Discount'; // spells you cast cost {1} less
const SIGNET = 'SYNTHETIC Signet'; // {1}, {T}: add {U}{B}
const FLICKER = 'SYNTHETIC Flicker Spell';
const COUNTER = 'SYNTHETIC Costly Counter'; // counter target spell; its controller loses life equal to its mana value

const xs = (g: ScenarioGame, seat = 0): number[] =>
  g
    .legalActions(seat)
    .flatMap((a) => (a.kind === 'chooseX' ? [a.value] : []))
    .sort((a, b) => a - b);

/** A burn spell in hand, `mountains` Mountains, and a target creature for the other seat. */
const burnGame = (mountains: number) =>
  scenario()
    .seat(0)
    .hand(BURN)
    .battlefield('Mountain', { count: mountains })
    .seat(1)
    .battlefield('Giant Spider')
    .build();

describe('announcing X as a spell is cast (CR 107.3a, 601.2b)', () => {
  test('X is asked first, then the targets, then the payment; damage is X', () => {
    const g = burnGame(5);
    g.act(0).cast(BURN);
    const d = chooseXDecision(g);
    expect(d).toMatchObject({
      seat: 0,
      purpose: 'spell',
      min: 0,
      max: 4,
      perX: { mana: 1, life: 0 },
      sourceName: BURN,
    });
    expect(d.source).toBe(g.id({ name: BURN, zone: 'stack' }));
    expect(g.state.casting?.stage).toBe('x');
    g.act(0).chooseX(3);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.expect.pending('payMana', 0);
    expect(g.state.casting?.totalCost).toEqual(['3', 'R']);
    g.act(0).payAuto();
    for (let i = 0; i < 4; i += 1) g.expect.tapped(`Mountain[${i}]`);
    g.expect.tapped('Mountain[4]', false);
    g.expect.stack([BURN]);
    expect(g.object({ name: BURN, zone: 'stack' }).stack?.x).toBe(3);
    expect(getView(g.state, 1).stack.find((o) => o.name === BURN)?.x).toBe(3);
    g.expect.eventLog([{ kind: 'spellCast', x: 3 }]);
    g.passAll();
    g.expect.life(1, 37);
    g.expect.zone(BURN, 'graveyard', { seat: 0 });
  });

  test('X = 0 costs only {R} and deals no damage', () => {
    const g = burnGame(5);
    g.act(0).cast(BURN, { x: 0, targets: [{ player: 1 }], pay: true });
    g.expect.tapped('Mountain[0]');
    g.expect.tapped('Mountain[1]', false);
    g.expect.eventLog([{ kind: 'spellCast', x: 0 }]);
    g.passAll();
    g.expect.life(1, 40);
  });

  test('the largest X is damage to a creature too: X = 4 kills the Spider', () => {
    const g = burnGame(5);
    g.act(0).cast(BURN, { x: 4, targets: ['Giant Spider'], pay: true });
    g.passAll();
    g.expect.zone('Giant Spider', 'graveyard', { seat: 1 });
  });

  test('a spell that can pay no X at all is not asked: X is 0', () => {
    const g = burnGame(1);
    g.act(0).cast(BURN);
    g.expect.pending('targets', 0);
    expect(g.object({ name: BURN, zone: 'stack' }).stack?.x).toBe(0);
    g.act(0).chooseTargets({ player: 1 }).payAuto();
    g.expect.eventLog([{ kind: 'spellCast', x: 0 }]);
  });

  test('the spell is castable whenever X = 0 can be paid, and not before', () => {
    burnGame(1).expect.legal(0, { cast: BURN });
    const none = scenario().seat(0).hand(BURN).seat(1).build();
    none.expect.illegal(0, { cast: BURN });
  });

  test('the legal actions are the values from 0 to the maximum, cancel and concede', () => {
    const g = burnGame(4);
    g.act(0).cast(BURN);
    expect(g.legalActions(0)).toEqual([
      { kind: 'chooseX', value: 0 },
      { kind: 'chooseX', value: 1 },
      { kind: 'chooseX', value: 2 },
      { kind: 'chooseX', value: 3 },
      { kind: 'cancel' },
      { kind: 'concede' },
    ]);
    expect(g.legalActions(1)).toEqual([]);
  });

  test('every legal action is accepted and nothing else is', () => {
    const g = burnGame(4);
    g.act(0).cast(BURN);
    for (const action of getLegalActions(g.state, 0)) {
      if (action.kind === 'concede') continue;
      expect(applyAction(g.state, 0, action).ok, JSON.stringify(action)).toBe(true);
    }
    for (const value of [-1, 4, 5, 1.5, Number.NaN, 1000]) {
      const r = g.act(0).try.action({ kind: 'chooseX', value });
      expect(r.ok, String(value)).toBe(false);
    }
    // The other seat may not answer, and a pass is not an answer.
    expect(applyAction(g.state, 1, { kind: 'chooseX', value: 1 }).ok).toBe(false);
    expect(applyAction(g.state, 0, { kind: 'pass' }).ok).toBe(false);
    g.expect.pending('chooseX', 0);
  });

  test('chooseX with no X being announced is refused', () => {
    const g = burnGame(4);
    expect(g.act(0).try.action({ kind: 'chooseX', value: 1 }).ok).toBe(false);
  });

  test('cancel at the X stage rewinds the cast', () => {
    const g = burnGame(5);
    const before = g.positionHash();
    g.act(0).cast(BURN);
    g.act(0).cancel();
    expect(g.state.casting).toBeNull();
    g.expect.pending('priority', 0);
    g.expect.zone(BURN, 'hand', { seat: 0 });
    g.expect.tapped('Mountain[0]', false);
    expect(g.positionHash()).toBe(before);
    // Casting again asks again.
    g.act(0).cast(BURN);
    g.expect.pending('chooseX', 0);
  });
});

describe('which values are offered (CR 601.2f, 601.2g)', () => {
  test('the lands, minus the colored part', () => {
    for (const lands of [2, 3, 6]) {
      const g = burnGame(lands);
      g.act(0).cast(BURN);
      expect(xs(g)).toEqual(Array.from({ length: lands }, (_, i) => i));
    }
  });

  test('the mana pool counts, whatever its color', () => {
    const g = scenario().seat(0).hand(BURN).battlefield('Mountain').pool('GGU').seat(1).build();
    g.act(0).cast(BURN);
    expect(chooseXDecision(g).max).toBe(3);
    g.act(0).chooseX(3).chooseTargets({ player: 1 }).payAuto();
    g.expect.pool(0, '');
    g.expect.tapped('Mountain[0]');
  });

  test('a Signet makes its mana worth more than its cost', () => {
    const plain = scenario()
      .seat(0)
      .hand(BURN)
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .build();
    plain.act(0).cast(BURN);
    expect(chooseXDecision(plain).max).toBe(1);
    // {1}, {T}: Add {U}{B}: one Mountain pays the Signet's {1}, the other the {R}, and X is 2.
    const signet = scenario()
      .seat(0)
      .hand(BURN)
      .battlefield('Mountain', { count: 2 })
      .battlefield(SIGNET)
      .seat(1)
      .build();
    signet.act(0).cast(BURN);
    expect(chooseXDecision(signet).max).toBe(2);
    signet.act(0).chooseX(2).chooseTargets({ player: 1 }).payAuto();
    signet.expect.tapped(SIGNET);
    signet.expect.stack([BURN]);
    signet.passAll();
    signet.expect.life(1, 38);
  });

  test('commander tax is part of the total (CR 903.8, 118.9d)', () => {
    const cast = (casts: number) => {
      const g = scenario()
        .seat(0)
        .commander(HYDRA, { casts, label: 'cmd' })
        .battlefield('Forest', { count: 5 })
        .seat(1)
        .build();
      g.act(0).cast('cmd');
      return g;
    };
    expect(chooseXDecision(cast(0)).max).toBe(4);
    expect(chooseXDecision(cast(1)).max).toBe(2);
    const g = cast(1);
    g.act(0).chooseX(2).payAuto();
    g.expect.stack([HYDRA]);
    g.expect.eventLog([{ kind: 'spellCast', fromZone: 'command', commanderTax: 2, x: 2 }]);
  });

  test('a cost reduction takes generic mana off the total with X in it (CR 601.2f)', () => {
    const without = burnGame(4);
    without.act(0).cast(BURN);
    expect(chooseXDecision(without).max).toBe(3);
    const g = scenario()
      .seat(0)
      .hand(BURN)
      .battlefield('Mountain', { count: 4 })
      .battlefield(DISCOUNT)
      .seat(1)
      .build();
    g.act(0).cast(BURN);
    expect(chooseXDecision(g).max).toBe(4);
    g.act(0).chooseX(4).chooseTargets({ player: 1 });
    // {X}{R} with X = 4 is {4}{R}; one generic mana less leaves {3}{R}.
    expect(g.state.casting?.totalCost).toEqual(['3', 'R']);
    g.act(0).payAuto();
    g.passAll();
    g.expect.life(1, 36);
  });

  test('a cost reduction of more than the generic mana never goes below {0}', () => {
    const g = scenario()
      .seat(0)
      .hand(BURN)
      .battlefield('Mountain')
      .battlefield(DISCOUNT, { count: 3 })
      .seat(1)
      .build();
    g.act(0).cast(BURN);
    // Three reductions off X generic: X = 3 costs {R} alone, and so does every X up to 3.
    expect(chooseXDecision(g).max).toBe(3);
    g.act(0).chooseX(3).chooseTargets({ player: 1 });
    expect(g.state.casting?.totalCost).toEqual(['R']);
  });

  test('kicker is asked before X, and the kicked total limits X (CR 601.2b)', () => {
    const start = () =>
      scenario().seat(0).hand(KICKED).battlefield('Mountain', { count: 6 }).seat(1).build();
    const unkicked = start();
    unkicked.act(0).cast(KICKED);
    unkicked.expect.pending('confirmOptional', 0);
    unkicked.act(0).decline();
    expect(chooseXDecision(unkicked).max).toBe(5);
    const kicked = start();
    kicked.act(0).cast(KICKED, { kicked: true });
    expect(chooseXDecision(kicked).max).toBe(3);
    kicked.act(0).chooseX(3).chooseTargets({ player: 1 });
    // {X}{R} with X = 3 and the kicker's {2}: {3}{R}{2}.
    expect(kicked.state.casting?.totalCost).toEqual(['3', 'R', '2']);
    kicked.act(0).payAuto();
    kicked.expect.eventLog([{ kind: 'spellCast', kicked: true, x: 3 }]);
  });

  test('two {X} cost 2X (CR 107.3a)', () => {
    const g = scenario()
      .seat(0)
      .hand(DOUBLE)
      .battlefield('Island')
      .battlefield('Mountain', { count: 6 })
      .library('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(DOUBLE);
    // Seven lands: {U} and six more, which pay X twice: X is at most 3.
    expect(chooseXDecision(g).max).toBe(3);
    expect(chooseXDecision(g).perX).toEqual({ mana: 2, life: 0 });
    g.act(0).chooseX(2);
    expect(g.state.casting?.totalCost).toEqual(['4', 'U']);
    g.act(0).payAuto();
    g.expect.stack([DOUBLE]);
    g.passAll();
    g.expect.handSize(0, 2);
    // Five lands tapped, two Mountains left.
    expect(g.find({ name: 'Mountain', zone: 'battlefield' }).filter((o) => !o.tapped)).toHaveLength(
      2,
    );
  });
});

describe('what X does when the spell resolves', () => {
  test('"draw X cards"', () => {
    const g = scenario()
      .seat(0)
      .hand(DRAW)
      .battlefield('Island', { count: 4 })
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(DRAW, { x: 3, pay: true });
    g.passAll();
    g.expect.handSize(0, 3);
    g.expect.librarySize(0, 1);
  });

  test('"put X +1/+1 counters on target creature"', () => {
    const g = scenario()
      .seat(0)
      .hand(PUMP)
      .battlefield('Forest', { count: 4 })
      .battlefield('Grizzly Bears')
      .seat(1)
      .build();
    g.act(0).cast(PUMP, { x: 3, targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.counters('Grizzly Bears', { '+1/+1': 3 });
    g.expect.pt('Grizzly Bears', 5, 5);
  });

  test('a spell with X is a different size each time it is cast', () => {
    const g = scenario()
      .seat(0)
      .hand(PUMP, PUMP)
      .battlefield('Forest', { count: 6 })
      .battlefield('Grizzly Bears')
      .seat(1)
      .build();
    g.act(0).cast({ name: PUMP, nth: 0 }, { x: 1, targets: ['Grizzly Bears'], pay: true });
    g.act(0).cast({ name: PUMP, nth: 0 }, { x: 3, targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.counters('Grizzly Bears', { '+1/+1': 4 });
  });

  test('the mana value of a spell on the stack counts X (CR 202.3e)', () => {
    const g = scenario()
      .seat(0)
      .hand(BURN)
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .hand(COUNTER)
      .battlefield('Island', { count: 2 })
      .build();
    g.act(0).cast(BURN, { x: 3, targets: [{ player: 1 }], pay: true });
    g.pass(0);
    g.act(1).cast(COUNTER, { targets: [BURN], pay: true });
    g.passAll();
    // {X}{R} with X = 3 has mana value 4: its controller loses 4 life, and the spell does no damage.
    g.expect.life(0, 36);
    g.expect.life(1, 40);
    g.expect.zone(BURN, 'graveyard', { seat: 0 });
  });
});

describe('"enters with X +1/+1 counters on it" (CR 107.3m)', () => {
  const hydra = (forests: number) =>
    scenario().seat(0).hand(HYDRA).battlefield('Forest', { count: forests }).seat(1).build();

  test('a permanent spell enters with X counters', () => {
    const g = hydra(6);
    g.act(0).cast(HYDRA, { x: 3, pay: true });
    g.passAll();
    g.expect.zone(HYDRA, 'battlefield', { seat: 0 });
    g.expect.counters(HYDRA, { '+1/+1': 3 });
    g.expect.pt(HYDRA, 4, 4);
    // The permanent's own X is 0 (CR 107.3m): nothing on the battlefield remembers the value.
    expect(g.object({ name: HYDRA, zone: 'battlefield' }).stack).toBeNull();
    expect(getView(g.state, 0).battlefield.find((o) => o.name === HYDRA)?.x).toBeUndefined();
  });

  test('X = 0 enters with no counters', () => {
    const g = hydra(6);
    g.act(0).cast(HYDRA, { x: 0, pay: true });
    g.passAll();
    g.expect.counters(HYDRA, {});
    g.expect.pt(HYDRA, 1, 1);
  });

  test('a flickered permanent comes back with no counters: it was not cast (CR 107.3g)', () => {
    const g = scenario()
      .seat(0)
      .hand(HYDRA, FLICKER)
      .battlefield('Forest', { count: 5 })
      .battlefield('Island', { count: 2 })
      .seat(1)
      .build();
    g.act(0).cast(HYDRA, { x: 3, pay: true });
    g.passAll();
    g.expect.counters(HYDRA, { '+1/+1': 3 });
    g.act(0).cast(FLICKER, { targets: [HYDRA], pay: true });
    g.passAll();
    g.expect.zone(HYDRA, 'battlefield', { seat: 0 });
    g.expect.counters(HYDRA, {});
    g.expect.pt(HYDRA, 1, 1);
  });

  test('a Hydra the engine asks X of is a spell like any other: cancel rewinds', () => {
    const g = hydra(4);
    g.act(0).cast(HYDRA);
    expect(chooseXDecision(g).max).toBe(3);
    g.act(0).cancel();
    g.expect.zone(HYDRA, 'hand', { seat: 0 });
  });
});

describe('a spell cast without paying its mana cost has X = 0 (CR 107.3b)', () => {
  test('no question, no payment, no damage; the ordinary cast still asks', () => {
    const g = scenario().seat(0).hand(FREE).battlefield('Mountain', { count: 4 }).seat(1).build();
    g.expect.legal(0, { cast: FREE });
    g.expect.legal(0, { cast: FREE, alternative: 'free' });
    g.act(0).cast(FREE, { alternative: 'free' });
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.expect.stack([FREE]);
    g.expect.tapped('Mountain[0]', false);
    g.expect.eventLog([{ kind: 'spellCast', alternative: 'free' }]);
    expect(g.eventsSince(0).find((e) => e.kind === 'spellCast')).not.toHaveProperty('x');
    g.passAll();
    g.expect.life(1, 40);
    // The same card cast by paying its cost asks for X.
    const h = scenario().seat(0).hand(FREE).battlefield('Mountain', { count: 4 }).seat(1).build();
    h.act(0).cast(FREE);
    expect(chooseXDecision(h).max).toBe(3);
  });
});

describe('a spell with an {X} and "pay X life" (CR 107.3b)', () => {
  // SYNTHETIC: {X}{R}, "As an additional cost, pay X life", may be cast without paying its mana cost.
  const BOTH = singleFace({
    name: 'SYNTHETIC Both Costs Burn',
    manaCost: ['X', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Pay X life. You may cast this spell without paying its mana cost. X damage.',
    additionalCosts: [{ kind: 'payXLife' }],
    alternativeCosts: [{ kind: 'free' }],
    spell: {
      x: true,
      targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
      effect: { kind: 'dealDamage', amount: { kind: 'x' }, to: { kind: 'target', id: 't1' } },
    },
  });
  const game = () =>
    scenario()
      .define(BOTH)
      .seat(0)
      .life(20)
      .hand(BOTH.name)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .build();

  test('paid with its mana cost, one X is paid in mana and in life', () => {
    const g = game();
    g.act(0).cast(BOTH.name);
    expect(chooseXDecision(g)).toMatchObject({ max: 3, perX: { mana: 1, life: 1 } });
    g.act(0).chooseX(3).chooseTargets({ player: 1 });
    expect(g.state.casting?.totalCost).toEqual(['3', 'R']);
    g.expect.life(0, 17);
  });

  test('cast without paying its mana cost, X is 0 and nothing is asked, life included', () => {
    const g = game();
    g.act(0).cast(BOTH.name, { alternative: 'free' });
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.expect.life(0, 20);
    g.expect.stack([BOTH.name]);
  });
});

describe('"pay X life" as an additional cost (CR 118.8, 119.4)', () => {
  const blood = (life: number, mountains = 1) =>
    scenario()
      .seat(0)
      .life(life)
      .hand(BLOOD)
      .battlefield('Mountain', { count: mountains })
      .seat(1)
      .build();

  test('X is announced, the life is paid with the cost, the damage is X', () => {
    const g = blood(20);
    g.act(0).cast(BLOOD);
    // CR 119.4: the whole life total may be paid, so X goes up to 20.
    expect(chooseXDecision(g)).toMatchObject({ min: 0, max: 20, perX: { mana: 0, life: 1 } });
    g.act(0).chooseX(6).chooseTargets({ player: 1 });
    g.expect.life(0, 14);
    g.act(0).payAuto();
    g.expect.life(0, 14);
    g.expect.tapped('Mountain[0]');
    g.expect.eventLog([
      { kind: 'lifeChanged', seat: 0, from: 20, to: 14 },
      { kind: 'spellCast', x: 6 },
    ]);
    g.passAll();
    g.expect.life(1, 34);
  });

  test('cancel after the life was paid gives it back (CR 733)', () => {
    const g = blood(20);
    const before = g.positionHash();
    g.act(0).cast(BLOOD, { x: 6 });
    g.act(0).chooseTargets({ player: 1 });
    g.expect.life(0, 14);
    g.act(0).cancel();
    g.expect.life(0, 20);
    expect(g.positionHash()).toBe(before);
  });

  test('at 1 life X is 0 or 1 (CR 119.4: the whole total may be paid)', () => {
    const g = blood(1);
    g.expect.legal(0, { cast: BLOOD });
    g.act(0).cast(BLOOD);
    expect(chooseXDecision(g)).toMatchObject({ min: 0, max: 1 });
  });

  test('X equal to the whole life total is paid: the caster is at 0 life and loses', () => {
    const g = blood(4);
    g.act(0).cast(BLOOD);
    g.act(0).chooseX(4).chooseTargets({ player: 1 });
    g.expect.life(0, 0);
    g.act(0).payAuto();
    expect(g.state.seats[0]?.hasLost).toBe(true);
  });

  test('the life limit and the mana limit apply together', () => {
    // "{X}" would take mana as well: here only life, so the mana the caster has is no limit.
    const g = blood(8, 3);
    g.act(0).cast(BLOOD);
    expect(chooseXDecision(g).max).toBe(8);
  });
});

describe('X in the cost of an activated ability (CR 602.2b)', () => {
  const cannon = (mountains: number) => {
    const b = scenario().seat(0).battlefield(CANNON);
    if (mountains > 0) b.battlefield('Mountain', { count: mountains });
    return b.seat(1).battlefield('Giant Spider').build();
  };

  test('X is announced after the ability goes on the stack, before the targets', () => {
    const g = cannon(5);
    g.act(0).activate(CANNON);
    const d = chooseXDecision(g);
    expect(d).toMatchObject({ purpose: 'ability', min: 0, max: 5, perX: { mana: 1, life: 0 } });
    expect(d.sourceName).toBe(CANNON);
    expect(g.state.casting?.stage).toBe('x');
    g.expect.stack([`${CANNON} (ability)`]);
    g.act(0).chooseX(4);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets('Giant Spider');
    g.expect.pending('payMana', 0);
    expect(g.state.casting?.totalCost).toEqual(['4']);
    g.act(0).payAuto();
    g.expect.tapped(CANNON);
    expect(g.object({ name: `${CANNON} (ability)`, zone: 'stack' }).stack?.x).toBe(4);
    g.expect.eventLog([{ kind: 'abilityActivated', x: 4 }]);
    g.passAll();
    g.expect.zone('Giant Spider', 'graveyard', { seat: 1 });
  });

  test('the value is the same for every X of the ability and independent of other activations', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CANNON, WELL)
      .battlefield('Mountain', { count: 6 })
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .battlefield('Giant Spider')
      .build();
    g.act(0).activate(CANNON, { x: 1, targets: ['Giant Spider'], pay: true });
    g.act(0).activate(WELL, { ability: 0, x: 2, pay: true });
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.damage('Giant Spider', 1);
  });

  test('two {X} in an ability cost are 2X', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WELL)
      .battlefield('Mountain', { count: 5 })
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).activate(WELL);
    expect(chooseXDecision(g)).toMatchObject({ max: 2, perX: { mana: 2, life: 0 } });
    g.act(0).chooseX(2).payAuto();
    g.passAll();
    g.expect.handSize(0, 2);
  });

  test('an ability that can pay no X is activated with X = 0, not asked', () => {
    const g = cannon(0);
    // With no mana, {X} = 0 is payable: the ability is offered and goes straight to its targets.
    g.expect.legal(0, { activate: CANNON });
    g.act(0).activate(CANNON);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets('Giant Spider');
    g.expect.stack([`${CANNON} (ability)`]);
    g.passAll();
    g.expect.damage('Giant Spider', 0);
  });

  test('cancel at the X stage rewinds the activation', () => {
    const g = cannon(5);
    const before = g.positionHash();
    g.act(0).activate(CANNON);
    g.act(0).cancel();
    expect(g.positionHash()).toBe(before);
    g.expect.stack([]);
    g.expect.tapped(CANNON, false);
  });

  test('the legal actions of the activation agree with the engine', () => {
    const g = cannon(3);
    g.act(0).activate(CANNON);
    expect(xs(g)).toEqual([0, 1, 2, 3]);
    for (const action of getLegalActions(g.state, 0)) {
      if (action.kind === 'concede') continue;
      expect(applyAction(g.state, 0, action).ok, JSON.stringify(action)).toBe(true);
    }
    expect(g.act(0).try.action({ kind: 'chooseX', value: 4 }).ok).toBe(false);
  });

  test('"Pay X life": up to the life total (CR 119.4), paid before the targets are chosen', () => {
    const g = scenario()
      .seat(0)
      .life(10)
      .battlefield(LANCE)
      .seat(1)
      .battlefield('Giant Spider')
      .build();
    g.act(0).activate(LANCE);
    expect(chooseXDecision(g)).toMatchObject({ min: 0, max: 10, perX: { mana: 0, life: 1 } });
    g.act(0).chooseX(4);
    g.expect.life(0, 10);
    g.act(0).chooseTargets('Giant Spider');
    g.expect.life(0, 6);
    g.expect.stack([`${LANCE} (ability)`]);
    g.passAll();
    g.expect.zone('Giant Spider', 'graveyard', { seat: 1 });
  });

  test('cancel at the X stage costs nothing', () => {
    const g = scenario()
      .seat(0)
      .life(10)
      .battlefield(LANCE)
      .seat(1)
      .battlefield('Giant Spider')
      .build();
    const before = g.positionHash();
    g.act(0).activate(LANCE);
    g.act(0).cancel();
    g.expect.life(0, 10);
    expect(g.positionHash()).toBe(before);
  });
});

describe('X is deterministic', () => {
  const play = () => {
    const g = scenario()
      .seed(11)
      .seat(0)
      .hand(BURN, DRAW)
      .battlefield('Mountain', { count: 4 })
      .battlefield('Island', { count: 3 })
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(BURN, { x: 2, targets: [{ player: 1 }], pay: true });
    g.act(0).cast(DRAW, { x: 2, pay: true });
    g.passAll();
    return g;
  };

  test('the same actions give the same state, hash and log', () => {
    const a = play();
    const b = play();
    expect(a.hash()).toBe(b.hash());
    expect(a.log).toEqual(b.log);
    expect(a.log.filter((e) => e.action.kind === 'chooseX')).toHaveLength(2);
  });
});
