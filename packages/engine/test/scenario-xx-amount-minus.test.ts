// "You gain X life, where X is the number of cards in your hand minus 4" (D-984): the amount `minus`, an amount less a whole number, a negative
// result counting as 0.
// Pins: CR 107.1b (a calculation that would be negative uses 0), CR 608.2c (an instruction is carried out as it comes up, so the count is read as the
// spell resolves, not as it is cast), CR 119.3 (life gain), CR 119.4 (a player cannot lose a negative amount: nothing happens), CR 119.9 (a gain of 0 is no
// event). Cards are SYNTHETIC (src/cards/fixtures/synthetic-niv-primitives.ts).
import { describe, expect, test } from 'vitest';
import { isFeatureSupported, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const TITHE = 'SYNTHETIC Hand Tithe'; // {W} instant: gain X life, X = cards in your hand minus 4
const DRAIN = 'SYNTHETIC Hand Drain'; // {B} instant: each opponent loses X life, same X
const MEND = 'SYNTHETIC Mend'; // {W} instant: gain 3 life
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

/** Seat 0 holds the spell and `others` Forests; two Plains and a Swamp are on the battlefield. */
const game = (spell: string, others: number) =>
  scenario()
    .seat(0)
    .life(20)
    .library(...LIBRARY)
    .hand(spell, ...Array.from({ length: others }, () => 'Forest'))
    .battlefield('Plains', 'Plains', 'Swamp')
    .seat(1)
    .life(20)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();

describe('the cards are valid and the amount is a supported feature', () => {
  test.each([TITHE, DRAIN])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
  test('amount:minus is listed', () => {
    expect(isFeatureSupported('amount:minus')).toBe(true);
  });
});

describe('the number of cards in your hand minus 4 (CR 107.1b)', () => {
  test('a hand of 7 once the spell is cast gains the difference, 3 life', () => {
    // 8 cards in hand with the spell; 7 once it is cast; 7 - 4 = 3.
    const g = game(TITHE, 7);
    g.act(0).cast(TITHE, { pay: true });
    g.passAll();
    g.expect.life(0, 23);
  });

  test('a hand of exactly 4 after casting gains nothing (not a loss either)', () => {
    const g = game(TITHE, 4);
    g.act(0).cast(TITHE, { pay: true });
    g.passAll();
    g.expect.life(0, 20);
  });

  test('a hand smaller than 4 counts as 0: no life is lost (CR 107.1b)', () => {
    const g = game(TITHE, 1);
    g.act(0).cast(TITHE, { pay: true });
    g.passAll();
    g.expect.life(0, 20);
    const none = game(TITHE, 0);
    none.act(0).cast(TITHE, { pay: true });
    none.passAll();
    none.expect.life(0, 20);
  });

  test('it floors at 0 for a loss of life too: nobody gains life from a negative amount', () => {
    const g = game(DRAIN, 2);
    g.act(0).cast(DRAIN, { pay: true });
    g.passAll();
    g.expect.life(1, 20);
    g.expect.life(0, 20);
    const big = game(DRAIN, 6);
    big.act(0).cast(DRAIN, { pay: true });
    big.passAll();
    big.expect.life(1, 18); // 6 left - 4 = 2
  });

  test('the count is read as the spell resolves, not as it is cast (CR 608.2c)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(TITHE, MEND, 'Forest', 'Forest', 'Forest', 'Forest')
      .battlefield('Plains', 'Plains')
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    g.act(0).cast(TITHE, { pay: true }); // 5 cards left: it would be 1 if read now
    g.act(0).cast(MEND, { pay: true }); // in response: 4 cards left
    g.passAll();
    g.expect.life(0, 23); // Mend's 3; the Tithe reads 4 - 4 = 0
  });
});

describe('validation', () => {
  const draws = (amount: unknown) => ({
    ...syntheticCard(TITHE),
    faces: [
      {
        ...syntheticCard(TITHE).faces[0],
        spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount } },
      },
    ],
  });

  test('a minus takes away a whole number of 1 or more', () => {
    const hand = { kind: 'countOf', filter: { zone: 'hand', controller: 'you' } };
    for (const by of [0, -1, 1.5]) {
      const problems = validateCard(draws({ kind: 'minus', of: hand, by }) as never);
      expect(
        problems.map((p) => p.path.endsWith('.by')),
        `by ${by}`,
      ).toContain(true);
    }
    expect(validateCard(draws({ kind: 'minus', of: hand, by: 1 }) as never)).toEqual([]);
  });

  test("a static ability's power does not take it (a count of permanents it follows is read by the layers)", () => {
    const card = {
      ...syntheticCard(TITHE),
      faces: [
        {
          ...syntheticCard(TITHE).faces[0],
          spell: null,
          abilities: [
            {
              kind: 'static',
              static: {
                kind: 'modifyPt',
                subject: { kind: 'this' },
                power: {
                  kind: 'minus',
                  of: { kind: 'countOf', filter: { types: ['creature'], controller: 'you' } },
                  by: 1,
                },
                toughness: 0,
              },
            },
          ],
        },
      ],
    };
    expect(JSON.stringify(validateCard(card as never))).toContain('not minus');
  });
});
