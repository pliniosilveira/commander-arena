// The Hashaton deck program (issue 31), group 2 (D-363 to D-365, provisional): "Your opponents can't gain life." and "each opponent loses life equal to the life
// that player lost this turn" (Archfiend of Despair), "if you gained life this turn" at each end step (Ob Nixilis, the Ascended) and "Whenever you gain life, you
// may pay that much life. If you do, draw that many cards." (Niv-Mizzet, Ghost Counsel). The lines are the real Oracle text of the acceptance cards of the
// golden corpus, read through the whole pipeline; the other lines are SYNTHETIC siblings and the near misses the grammar must not read. The engine runs what is
// lowered in convert-grammar-engine-hashaton-g2.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const YOU = { kind: 'you' } as const;
const THAT_MUCH = { kind: 'triggerDamage' } as const;

describe('"Your opponents can\'t gain life." (CR 119.7)', () => {
  test('the real line: a static ability of the controller about their opponents', () => {
    for (const text of ["Your opponents can't gain life.", 'Your opponents can’t gain life.']) {
      const parsed = readAll(text, 'creature');
      expect(parsed.abilities).toEqual([
        { kind: 'static', static: { kind: 'cantGainLife', who: 'opponents' } },
      ]);
    }
  });

  test('it sits beside keywords and the end step ability of the real card', () => {
    const parsed = readAll(
      'Flying\nYour opponents can’t gain life.\nAt the beginning of each end step, each opponent loses life equal to the life that player lost this turn. (Damage causes loss of life.)',
      'creature',
    );
    expect(parsed.abilities).toHaveLength(3);
    expect(parsed.abilities[1]).toEqual({
      kind: 'static',
      static: { kind: 'cantGainLife', who: 'opponents' },
    });
  });

  test.each([
    "Your opponents can't gain life",
    "Each opponent can't gain life.",
    "Players can't gain life.",
    "You can't gain life.",
    "Your opponents can't gain life until end of turn.",
    "Your opponents can't gain life as long as you control a Dragon.",
    "Your opponents can't gain life and you draw a card.",
  ])('is not read: %s', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('"each opponent loses life equal to the life that player lost this turn" (CR 119.3)', () => {
  test('the real line: at each end step, each opponent, their own number', () => {
    const parsed = readAll(
      'At the beginning of each end step, each opponent loses life equal to the life that player lost this turn.',
      'creature',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'each' },
        effect: {
          kind: 'loseLife',
          player: { kind: 'eachOpponent' },
          amount: { kind: 'lifeLostThisTurn' },
        },
      },
    ]);
  });

  test('another trigger and a targeted opponent are the same shape (SYNTHETIC)', () => {
    const upkeep = readAll(
      'At the beginning of your upkeep, each opponent loses life equal to the life that player lost this turn.',
      'creature',
    );
    expect(upkeep.abilities[0]).toMatchObject({
      kind: 'triggered',
      effect: { kind: 'loseLife', amount: { kind: 'lifeLostThisTurn' } },
    });
  });

  test.each([
    // a gain of life with it is not what the engine runs
    'At the beginning of each end step, each opponent gains life equal to the life that player lost this turn.',
    'At the beginning of each end step, each opponent loses life equal to the life you lost this turn.',
    'At the beginning of each end step, each opponent loses life equal to the life that player lost last turn.',
    'At the beginning of each end step, each opponent loses life equal to the life lost this turn.',
    // a part of another amount
    'At the beginning of each end step, each opponent loses life equal to twice the life that player lost this turn.',
    'At the beginning of each end step, each opponent loses life equal to the life that player lost this turn plus 1.',
  ])('is not read: %s', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('"that player" says another player', () => {
  test('"you lose life equal to the life that player lost this turn" is read and not run: "you" has no other player', () => {
    const missing = dropped(
      'At the beginning of each end step, you lose life equal to the life that player lost this turn.',
      'creature',
    );
    expect(missing).toMatchObject({ reason: 'notRunnable' });
  });
});

describe('"if you gained life this turn" (CR 119.3, 603.4)', () => {
  test('the real line: an intervening "if" of the end step trigger', () => {
    const parsed = readAll(
      'At the beginning of each end step, if you gained life this turn, create a 4/4 white Angel creature token with flying.',
      'creature',
    );
    expect(parsed.abilities).toHaveLength(1);
    expect(parsed.abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'endStep', whose: 'each' },
      interveningIf: { kind: 'lifeGainedThisTurn', atLeast: 1 },
      effect: { kind: 'createToken', count: 1 },
    });
  });

  test('your own end step, and "N or more" as before (SYNTHETIC)', () => {
    const mine = readAll(
      'At the beginning of your end step, if you gained life this turn, draw a card.',
      'creature',
    );
    expect(mine.abilities[0]).toMatchObject({
      interveningIf: { kind: 'lifeGainedThisTurn', atLeast: 1 },
    });
    const three = readAll(
      'At the beginning of your end step, if you gained 3 or more life this turn, draw a card.',
      'creature',
    );
    expect(three.abilities[0]).toMatchObject({
      interveningIf: { kind: 'lifeGainedThisTurn', atLeast: 3 },
    });
  });

  test.each([
    'At the beginning of each end step, if you gained life, draw a card.',
    'At the beginning of each end step, if an opponent gained life this turn, draw a card.',
    'At the beginning of each end step, if you gain life this turn, draw a card.',
    'At the beginning of each end step, if you lost life this turn, draw a card.',
  ])('is not read: %s', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('"you may pay that much life. If you do, draw that many cards" (CR 119.4, 119.9, 608.2c)', () => {
  test('the real line: a payment of the life gained, and that many cards', () => {
    const parsed = readAll(
      'Whenever you gain life, you may pay that much life. If you do, draw that many cards.',
      'creature',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'lifeGained', who: 'you' },
        effect: {
          kind: 'mayPay',
          cost: [{ kind: 'payLife', amount: THAT_MUCH }],
          effect: { kind: 'draw', player: YOU, count: THAT_MUCH },
        },
      },
    ]);
  });

  test('the effect it buys may be another instruction that reads that many (SYNTHETIC)', () => {
    const parsed = readAll(
      'Whenever you gain life, you may pay that much life. If you do, put that many +1/+1 counters on ~.',
      'creature',
    );
    expect(parsed.abilities[0]).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'mayPay',
        cost: [{ kind: 'payLife', amount: THAT_MUCH }],
        effect: { kind: 'addCounters', count: THAT_MUCH },
      },
    });
  });

  test.each([
    // not a life gain trigger: nothing says what "that much" is
    'When ~ enters, you may pay that much life. If you do, draw that many cards.',
    'Whenever ~ attacks, you may pay that much life. If you do, draw that many cards.',
    // any other payment leaves "that many" unclear
    'Whenever you gain life, you may pay 2 life. If you do, draw that many cards.',
    'Whenever you gain life, you may pay {2}. If you do, draw that many cards.',
    // more than the one payment, other words
    'Whenever you gain life, you may pay that much life and discard a card. If you do, draw that many cards.',
    'Whenever you gain life, you may pay that many life. If you do, draw that many cards.',
    'Whenever you gain life, you may pay half that much life. If you do, draw that many cards.',
    // the payment with nothing it buys
    'Whenever you gain life, you may pay that much life.',
    // "that many" after another instruction counts what that instruction did
    'Whenever you gain life, mill a card. You may pay that much life. If you do, draw that many cards.',
    // a cost of an activated ability reads no "that much"
    'Pay that much life: Draw a card.',
  ])('is not read: %s', (text) => {
    expect(dropped(text, 'creature')).toBeDefined();
  });
});
