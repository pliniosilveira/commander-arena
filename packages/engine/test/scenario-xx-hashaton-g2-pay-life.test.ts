// "Whenever you gain life, you may pay that much life. If you do, draw that many cards." (D-364, provisional; the Hashaton deck, Niv-Mizzet, Ghost Counsel):
// a `mayPay` whose life payment is an amount, the life that was gained (`triggerDamage`), worked out as the ability resolves, and "that many" in the effect it buys.
// Pins: CR 119.4 (a player may pay life only if their life total is at least that high; paying is losing that life), CR 119.9 (a gain of life triggers once per
// event, with its amount after replacement effects), CR 118.3 (a cost that can't be paid is not paid and nobody is asked), CR 608.2c ("If you do").
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-hashaton-g2.ts, synthetic-life-gain.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const DRAGON = 'SYNTHETIC Ghostly Dragon';
const WELL = 'SYNTHETIC Paid Well'; // pay {2}: draw that many
const IDOL = 'SYNTHETIC Joyless Idol';
const MEND = 'SYNTHETIC Mend'; // gain 3 life
const MEND_TWICE = 'SYNTHETIC Mend Twice'; // 2 life, then 2 more
const MEND_THEM = 'SYNTHETIC Mend Them';
const VITAL = 'SYNTHETIC Vital Angel'; // gains are 1 more
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const game = (...more: string[]) =>
  scenario()
    .seat(0)
    .library(...LIBRARY)
    .life(20)
    .hand(MEND, MEND_TWICE, MEND_THEM)
    .battlefield(DRAGON, 'Plains', 'Plains', 'Plains', ...more)
    .seat(1)
    .library(...LIBRARY);

describe('the card is valid', () => {
  for (const name of [DRAGON, WELL]) {
    test(name, () => {
      expect(validateCard(syntheticCard(name))).toEqual([]);
    });
  }

  const withCost = (cost: unknown, trigger: 'lifeGained' | 'entersBattlefield' = 'lifeGained') => {
    const card = syntheticCard(DRAGON);
    const face = card.faces[0];
    const ability = face?.abilities.find((a) => a.kind === 'triggered');
    if (face === undefined || ability?.kind !== 'triggered') throw new Error('no trigger');
    return {
      ...card,
      faces: [
        {
          ...face,
          abilities: [
            {
              ...ability,
              trigger:
                trigger === 'lifeGained'
                  ? ability.trigger
                  : { kind: 'entersBattlefield', what: { kind: 'this' } },
              effect: { ...ability.effect, cost },
            },
          ],
        },
      ],
    } as never;
  };

  test('the life paid is the life gained only where a trigger has an amount', () => {
    const that = [{ kind: 'payLife', amount: { kind: 'triggerDamage' } }];
    expect(validateCard(withCost(that))).toEqual([]);
    expect(validateCard(withCost(that, 'entersBattlefield')).length).toBeGreaterThan(0);
    // a plain number is still a number, and an amount of the state is still allowed
    expect(validateCard(withCost([{ kind: 'payLife', amount: 2 }]))).toEqual([]);
    expect(
      validateCard(withCost([{ kind: 'payLife', amount: { kind: 'x' } }])).length,
    ).toBeGreaterThan(0);
  });
});

describe('"you may pay that much life. If you do, draw that many cards"', () => {
  test('I am asked as the ability resolves; paying loses that much life and draws that many cards', () => {
    const g = game().build();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.expect.life(0, 23);
    const d = g.state.pending;
    expect(d?.kind).toBe('confirmOptional');
    if (d?.kind !== 'confirmOptional') return;
    expect(d.purpose).toBe('mayPay');
    // the question shows the life worked out: the 3 gained
    expect(d.cost).toEqual([{ kind: 'payLife', amount: 3 }]);
    g.act(0).accept();
    g.expect.life(0, 20);
    g.expect.handSize(0, 2 + 3); // two spells left, three cards drawn
  });

  test('declining pays nothing and draws nothing', () => {
    const g = game().build();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.life(0, 23);
    g.expect.handSize(0, 2);
  });

  test('the life gained is the amount after replacement effects (CR 119.9): 3 and 1 more is 4', () => {
    const g = game(VITAL).build();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error('not asked');
    expect(d.cost).toEqual([{ kind: 'payLife', amount: 4 }]);
    g.act(0).accept();
    g.expect.life(0, 20);
    g.expect.handSize(0, 2 + 4);
  });

  test('the Dragon own tap ability: gain 1, pay 1, draw 1', () => {
    const g = game().build();
    g.act(0).activate(DRAGON);
    g.passAll();
    g.expect.life(1, 39);
    g.expect.life(0, 21);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error('not asked');
    expect(d.cost).toEqual([{ kind: 'payLife', amount: 1 }]);
    g.act(0).accept();
    g.expect.life(0, 20);
    g.expect.handSize(0, 3 + 1);
  });

  test('each gain triggers it with its own amount: 2 and 2', () => {
    const g = game().build();
    g.act(0).cast(MEND_TWICE, { pay: true });
    g.passAll();
    for (let i = 0; i < 2; i += 1) {
      const d = g.state.pending;
      if (d?.kind === 'orderTriggers') {
        g.act(0).orderTriggers(0, 1);
        g.passAll();
      }
      const asked = g.state.pending;
      if (asked?.kind !== 'confirmOptional') throw new Error(`not asked: ${asked?.kind}`);
      expect(asked.cost).toEqual([{ kind: 'payLife', amount: 2 }]);
      g.act(0).accept();
      g.passAll();
    }
    g.expect.life(0, 24 - 4);
    g.expect.handSize(0, 2 + 4);
  });

  test("an opponent's gain of life does not trigger it", () => {
    const g = game().build();
    g.act(0).cast(MEND_THEM, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
    g.expect.life(0, 20);
  });

  test('a life gain that did not happen (my opponent has Joyless Idol) asks nothing', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .life(20)
      .hand(MEND)
      .battlefield(DRAGON, 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(IDOL)
      .build();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
    g.expect.life(0, 20);
    g.expect.handSize(0, 0);
  });

  test('CR 119.4: with less life than was gained, I am not asked and nothing is drawn', () => {
    // 1 life, Mend makes it 4, and the opponent answers the trigger with a Bolt: 1 life is left, the payment is 3.
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .life(1)
      .hand(MEND)
      .battlefield(DRAGON, 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .build();
    g.act(0).cast(MEND, { pay: true });
    g.act(0).pass();
    g.act(1).pass();
    g.expect.life(0, 4);
    g.expect.stack(['SYNTHETIC Ghostly Dragon (ability)']);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 1);
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
    g.expect.life(0, 1);
    g.expect.handSize(0, 0);
  });

  test('CR 119.4: with exactly as much life as was gained I may pay it, and then I have 0', () => {
    // 1 life, Mend Twice: 3 then 5; two triggers of 2. The opponent Bolts me to 2 with both on the stack.
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .life(1)
      .hand(MEND_TWICE)
      .battlefield(DRAGON, 'Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .build();
    g.act(0).cast(MEND_TWICE, { pay: true });
    g.act(0).pass();
    g.act(1).pass();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 2);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error(`not asked: ${d?.kind}`);
    expect(d.cost).toEqual([{ kind: 'payLife', amount: 2 }]);
    g.act(0).accept();
    g.expect.life(0, 0);
    // the player is at 0 life: a state-based action (CR 704.5a) takes them out of the game
    g.expect.hasLost(0);
  });
});

describe('"you may pay {2}. If you do, draw that many cards" (the mana of the same shape)', () => {
  test('the cards drawn are the life gained, whatever was paid', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .life(20)
      .hand(MEND)
      .battlefield(WELL, 'Plains', 'Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.handSize(0, 3);
    g.expect.life(0, 23);
  });
});
