// Multikicker (CR 702.33c): "You may pay an additional [cost] any number of times as you cast this spell",
// and "for each time it was kicked" (D-104, D-110).
// Pins: CR 702.33c and 702.33d (a kicker cost paid any number of times; the spell is kicked if the cost is
// paid at least once), CR 601.2b (the number of times is announced as the spell is cast, before X and the
// targets), CR 601.2f (the total cost includes the cost once for each time), CR 119.4 (life can be paid only
// if the life total is at least the amount), CR 733 (cancelling rewinds
// the cast), CR 113.7a and 702.33d (a permanent that entered from a kicked spell remembers it), CR 608.2c (the
// count is read as the instruction runs). Cards are SYNTHETIC (src/cards/fixtures/synthetic-keywords.ts).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { applyAction, checkInvariants, getLegalActions, getView } from '../src/index';
import { scenario } from '../src/testing/index';
import { chooseXDecision } from './pending-helpers';

const CUB = 'SYNTHETIC Strider Cub'; // {G} 1/1, Multikicker {1}; enters with a +1/+1 counter for each kick
const BARRAGE = 'SYNTHETIC Volley Barrage'; // {R} sorcery, Multikicker {1}: 1 damage to any target per kick
const TITHE = 'SYNTHETIC Blood Tithe'; // {B} instant, Multikicker pay 2 life: draw a card per kick, kicked: gain 1

const cub = (lands: number) =>
  scenario().seat(0).hand(CUB).battlefield('Forest', { count: lands }).seat(1).build();

describe('the multikicker question (CR 702.33c, 601.2b)', () => {
  test('is asked first, with the cost of one time and every count up to what can be paid', () => {
    const g = cub(4);
    g.act(0).cast(CUB);
    const d = chooseXDecision(g);
    expect(d.purpose).toBe('multikicker');
    expect(d.seat).toBe(0);
    expect(d.min).toBe(0);
    expect(d.max).toBe(3); // {G} and three times {1} with four lands
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['1'] }]);
    expect(d.source).toBe(g.id({ name: CUB, zone: 'stack' }));
    expect(g.state.casting?.stage).toBe('kicker');
    expect(getLegalActions(g.state, 0)).toEqual([
      { kind: 'chooseX', value: 0 },
      { kind: 'chooseX', value: 1 },
      { kind: 'chooseX', value: 2 },
      { kind: 'chooseX', value: 3 },
      { kind: 'cancel' },
      { kind: 'concede' },
    ]);
    g.expect.invariants();
  });

  test('the most is accepted and one more is refused (CR 601.2f: the cost must be payable)', () => {
    const g = cub(4);
    g.act(0).cast(CUB);
    expect(applyAction(g.state, 0, { kind: 'chooseX', value: 4 }).ok).toBe(false);
    expect(applyAction(g.state, 0, { kind: 'chooseX', value: -1 }).ok).toBe(false);
    expect(applyAction(g.state, 0, { kind: 'chooseX', value: 1.5 }).ok).toBe(false);
    expect(applyAction(g.state, 0, { kind: 'chooseX', value: 3 }).ok).toBe(true);
    expect(applyAction(g.state, 1, { kind: 'chooseX', value: 0 }).ok).toBe(false);
  });

  test('is not asked when not even one kick can be paid', () => {
    const g = cub(1);
    g.act(0).cast(CUB);
    // No targets, so the cast goes on to the payment at once.
    expect(g.state.pending?.kind).toBe('payMana');
  });

  test('is asked with exactly one kick payable', () => {
    const g = cub(2);
    g.act(0).cast(CUB);
    expect(chooseXDecision(g).max).toBe(1);
  });

  test('cancelling rewinds the cast (CR 733)', () => {
    const g = cub(3);
    const before = g.positionHash();
    g.act(0).cast(CUB);
    g.act(0).cancel();
    g.expect.position(before);
  });
});

describe('what the count does', () => {
  test('0 times: an unkicked cast for the plain cost, a 1/1', () => {
    const g = cub(4);
    g.act(0).cast(CUB);
    g.act(0).chooseX(0);
    const pay = g.state.pending;
    if (pay?.kind !== 'payMana') throw new Error(`expected payMana, got ${pay?.kind}`);
    expect(pay.totalCost).toEqual(['G']);
    const stack = g.state.objects[g.id({ name: CUB, zone: 'stack' })]?.stack;
    expect(stack?.kicked).toBe(false);
    expect(stack?.kicks).toBeUndefined();
    g.act(0).payAuto();
    g.passAll();
    g.expect.pt(CUB, 1, 1);
    g.expect.counters(CUB, {});
    expect(getView(g.state, 0).battlefield.find((o) => o.name === CUB)?.kicked).toBeUndefined();
  });

  test('1 time: the cost is {G}{1}, the spell is kicked once, a 2/2', () => {
    const g = cub(4);
    g.act(0).cast(CUB);
    g.act(0).chooseX(1);
    const pay = g.state.pending;
    if (pay?.kind !== 'payMana') throw new Error(`expected payMana, got ${pay?.kind}`);
    expect(pay.totalCost).toEqual(['G', '1']);
    g.act(0).payAuto();
    expect(getView(g.state, 0).stack[0]?.kicked).toBe(true);
    expect(getView(g.state, 0).stack[0]?.kicks).toBe(1);
    g.passAll();
    g.expect.pt(CUB, 2, 2);
  });

  test('the cast option answers the question for a test', () => {
    const g = cub(4);
    g.act(0).cast(CUB, { kicks: 2, pay: true });
    g.passAll();
    g.expect.pt(CUB, 3, 3);
  });

  test('3 times: the cost is {G}{1}{1}{1}, the permanent remembers 3, a 4/4', () => {
    const g = cub(4);
    const mark = g.mark();
    g.act(0).cast(CUB);
    g.act(0).chooseX(3);
    const pay = g.state.pending;
    if (pay?.kind !== 'payMana') throw new Error(`expected payMana, got ${pay?.kind}`);
    expect(pay.totalCost).toEqual(['G', '1', '1', '1']);
    g.act(0).payAuto();
    g.expect.eventLog([{ kind: 'spellCast', seat: 0, kicked: true, kicks: 3 }], { since: mark });
    g.passAll();
    g.expect.pt(CUB, 4, 4);
    g.expect.counters(CUB, { '+1/+1': 3 });
    expect(getView(g.state, 0).battlefield.find((o) => o.name === CUB)?.kicks).toBe(3);
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('"for each time it was kicked" on a spell: damage equals the count, and none when not kicked', () => {
    for (const kicks of [0, 1, 2, 3]) {
      const g = scenario()
        .seat(0)
        .hand(BARRAGE)
        .battlefield('Mountain', { count: 4 })
        .seat(1)
        .build();
      g.act(0).cast(BARRAGE);
      g.act(0).chooseX(kicks);
      g.act(0).choose({
        kind: 'chooseTargets',
        targets: [{ kind: 'player', specId: 't1', seat: 1 }],
      });
      g.act(0).payAuto();
      g.passAll();
      g.expect.life(1, 40 - kicks);
    }
  });

  test('the question comes before the targets, so a different count is a different cost', () => {
    const g = scenario()
      .seat(0)
      .hand(BARRAGE)
      .battlefield('Mountain', { count: 3 })
      .seat(1)
      .build();
    g.act(0).cast(BARRAGE);
    chooseXDecision(g);
    g.act(0).chooseX(2);
    g.expect.pending('targets', 0);
  });
});

describe('a cost of life (CR 119.4)', () => {
  const tithe = (life: number) =>
    scenario()
      .seat(0)
      .life(life)
      .hand(TITHE)
      .battlefield('Swamp')
      .library('Island', 'Island', 'Island', 'Island', 'Island')
      .seat(1)
      .build();

  test('the most is the life divided by the cost, rounded down (CR 119.4)', () => {
    expect(
      chooseXDecision(
        (() => {
          const g = tithe(5);
          g.act(0).cast(TITHE);
          return g;
        })(),
      ).max,
    ).toBe(2);
    expect(
      chooseXDecision(
        (() => {
          const g = tithe(6);
          g.act(0).cast(TITHE);
          return g;
        })(),
      ).max,
    ).toBe(3);
    expect(
      chooseXDecision(
        (() => {
          const g = tithe(7);
          g.act(0).cast(TITHE);
          return g;
        })(),
      ).max,
    ).toBe(3);
  });

  test('with 1 life left nothing is asked, with 2 one kick can be paid', () => {
    const one = tithe(1);
    one.act(0).cast(TITHE);
    expect(one.state.pending?.kind).toBe('payMana');
    const two = tithe(2);
    two.act(0).cast(TITHE);
    expect(chooseXDecision(two).max).toBe(1);
  });

  test('paying twice costs 4 life; the draw and the "if it was kicked" read the count', () => {
    const g = tithe(10);
    g.act(0).cast(TITHE);
    g.act(0).chooseX(2);
    g.act(0).payAuto();
    g.expect.life(0, 6);
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.life(0, 7); // "if it was kicked": gain 1
  });

  test('paid no times: it draws nothing and is not kicked', () => {
    const g = tithe(10);
    g.act(0).cast(TITHE);
    g.act(0).chooseX(0);
    g.act(0).payAuto();
    g.passAll();
    g.expect.handSize(0, 0);
    g.expect.life(0, 10);
  });
});

describe('plain Kicker counts once', () => {
  test('timesKicked is 1 for a kicked spell with Kicker and 0 for one that was not', () => {
    const card = singleFace({
      name: 'SYNTHETIC Test Kicker Count',
      manaCost: ['R'],
      types: ['instant'],
      colors: ['R'],
      colorIdentity: ['R'],
      oracleText: 'Kicker {1}. Deal damage to each opponent for each time it was kicked.',
      abilities: [
        { kind: 'keyword', keyword: { kind: 'kicker', cost: [{ kind: 'mana', symbols: ['1'] }] } },
      ],
      spell: {
        effect: {
          kind: 'dealDamage',
          amount: { kind: 'timesKicked' },
          to: { kind: 'eachOpponent' },
        },
      },
    });
    const kicked = scenario()
      .define(card)
      .seat(0)
      .hand(card.name)
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .build();
    kicked.act(0).cast(card.name, { kicked: true, pay: true });
    kicked.passAll();
    kicked.expect.life(1, 39);
    const plain = scenario()
      .define(card)
      .seat(0)
      .hand(card.name)
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .build();
    plain.act(0).cast(card.name, { kicked: false, pay: true });
    plain.passAll();
    plain.expect.life(1, 40);
  });
});

// D-254, CR 702.33c, 614.1c: "enters with a charge counter on it for each time it was kicked" (a replacement effect of the permanent, not a trigger).
describe('enters with a counter for each time it was kicked', () => {
  const CHALICE = 'SYNTHETIC Kicked Chalice';
  const chalice = (lands: number) =>
    scenario().seat(0).hand(CHALICE).battlefield('Forest', { count: lands }).seat(1).build();

  test('kicked 2 times: it enters with 2 charge counters, as it enters (no trigger)', () => {
    const g = chalice(3);
    g.act(0).cast(CHALICE);
    g.act(0).chooseX(2);
    g.act(0).payAuto();
    g.passAll();
    g.expect.counters(CHALICE, { charge: 2 });
  });

  test('not kicked: it enters with none', () => {
    const g = chalice(3);
    g.act(0).cast(CHALICE);
    g.act(0).chooseX(0);
    g.passAll();
    g.expect.counters(CHALICE, {});
  });

  test('put onto the battlefield without being cast: none', () => {
    const g = scenario().seat(0).battlefield(CHALICE).seat(1).build();
    g.expect.counters(CHALICE, {});
  });
});
