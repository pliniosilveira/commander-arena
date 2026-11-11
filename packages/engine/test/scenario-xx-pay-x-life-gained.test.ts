// "Whenever you gain life, you may pay {X}, where X is less than or equal to the amount of life you gained. If you do, draw X cards." (D-257): the
// `payAnyAmount` effect with a generic symbol, a most (`atMost`, the life gained: CR 119.9) and an instruction of the same resolution that reads X (`ifPaid`,
// CR 608.2c "If you do"), not a reflexive ability (CR 603.12 is for "When you do"). Pins: CR 107.3f (X not defined by a cost is chosen as the ability
// resolves), CR 118.1 (a cost is paid in full). The card is SYNTHETIC (src/cards/fixtures/synthetic-life-gain.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const WELL = 'SYNTHETIC Deep Well';
const MEND = 'SYNTHETIC Mend'; // gain 3 life
const MEND_TWICE = 'SYNTHETIC Mend Twice'; // 2 life, then 2 more
const MEND_THEM = 'SYNTHETIC Mend Them';
const VITAL = 'SYNTHETIC Vital Angel'; // gains are 1 more
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

/** `lands` untapped lands besides the ones that pay for Mend (2 are left after a Mend that costs {W}). */
const game = (lands: number, ...more: string[]) => {
  let b = scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand(MEND, MEND_TWICE, MEND_THEM)
    .battlefield(WELL, ...more);
  for (let i = 0; i < lands + 1; i += 1) b = b.battlefield('Plains');
  return b.seat(1).library(...LIBRARY);
};

const cast = (g: ReturnType<ReturnType<typeof game>['build']>, name: string) => {
  g.act(0).cast(name, { pay: true });
  g.passAll();
};

describe('the card is valid', () => {
  test(WELL, () => {
    expect(validateCard(syntheticCard(WELL))).toEqual([]);
  });

  const withEffect = (patch: Record<string, unknown>, drop: readonly string[] = []) => {
    const card = syntheticCard(WELL);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const trigger = face.abilities[0];
    if (trigger === undefined || trigger.kind !== 'triggered') throw new Error('no trigger');
    return {
      ...card,
      faces: [
        {
          ...face,
          abilities: [
            {
              ...trigger,
              effect: Object.fromEntries(
                Object.entries({ ...trigger.effect, ...patch }).filter(([k]) => !drop.includes(k)),
              ),
            },
          ],
        },
      ],
    } as never;
  };

  test('the shapes that are refused', () => {
    expect(validateCard(withEffect({ symbol: 'X' })).length).toBeGreaterThan(0);
    expect(validateCard(withEffect({ paid: 2 })).length).toBeGreaterThan(0);
    // the follow-up and the reflexive ability are two different readings: one of them
    expect(
      validateCard(
        withEffect({ reflexive: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } } }),
      ).length,
    ).toBeGreaterThan(0);
    // X is the number paid, and only in the follow-up
    expect(
      validateCard(
        withEffect(
          {
            reflexive: { effect: { kind: 'draw', player: { kind: 'you' }, count: { kind: 'x' } } },
          },
          ['ifPaid'],
        ),
      ).length,
    ).toBeGreaterThan(0);
    // a most that reads X, which is not known yet
    expect(validateCard(withEffect({ atMost: { kind: 'x' } })).length).toBeGreaterThan(0);
  });
});

describe('"you may pay {X}, where X is less than or equal to the amount of life you gained"', () => {
  test('I am asked for X from 0 to the life gained, as ability resolves', () => {
    const g = game(4).build();
    cast(g, MEND);
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseX');
    if (d?.kind !== 'chooseX') return;
    expect(d.purpose).toBe('payAnyAmount');
    expect(d.min).toBe(0);
    expect(d.max).toBe(3);
  });

  test('X is the life gained after replacement (CR 119.9, 614.1): a gain of 3 and 1 more is 4', () => {
    const g = game(5, VITAL).build();
    cast(g, MEND);
    const d = g.state.pending;
    if (d?.kind !== 'chooseX') throw new Error('not asked');
    expect(d.max).toBe(4);
  });

  test('I cannot pay more than I have: with two lands left the most is 2', () => {
    const g = game(2).build();
    cast(g, MEND);
    const d = g.state.pending;
    if (d?.kind !== 'chooseX') throw new Error('not asked');
    expect(d.max).toBe(2);
  });

  test('2: I pay {2} and draw 2 cards, in the same resolution', () => {
    const g = game(4).build();
    cast(g, MEND);
    g.act(0).chooseX(2);
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    expect(g.state.stack).toHaveLength(0);
    g.expect.handSize(0, 2 + 2); // two spells left and two cards drawn
  });

  test('0: nothing is paid and nothing is drawn', () => {
    const g = game(4).build();
    cast(g, MEND);
    g.act(0).chooseX(0);
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.pending('priority', 0);
  });

  test('declining the payment draws nothing', () => {
    const g = game(4).build();
    cast(g, MEND);
    g.act(0).chooseX(3);
    g.act(0).cancel();
    g.passAll();
    g.expect.handSize(0, 2);
  });

  test('with no mana left to pay I am not asked', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(MEND)
      .battlefield(WELL, 'Plains')
      .seat(1)
      .build();
    cast(g, MEND);
    expect(g.state.pending?.kind).not.toBe('chooseX');
    g.expect.handSize(0, 0);
  });

  test('each gain of life triggers it with its own amount: 2 and 2', () => {
    const g = game(4).build();
    g.act(0).cast(MEND_TWICE, { pay: true });
    g.passAll();
    for (let i = 0; i < 6; i += 1) {
      const d = g.state.pending;
      if (d?.kind === 'orderTriggers')
        g.choose(d.seat, g.legalActions(d.seat)[0] ?? { kind: 'pass' });
      else if (d?.kind === 'chooseX') {
        expect(d.max).toBe(2);
        g.act(0).chooseX(1);
        g.act(0).payAuto();
      } else if (g.state.stack.length > 0) g.passAll();
      else break;
    }
    g.expect.handSize(0, 2 + 2); // Mend and Mend Them left, and a card for each gain
  });

  test("an opponent's life gain does not trigger it", () => {
    const g = game(4).build();
    g.act(0).cast(MEND_THEM, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('chooseX');
  });
});
