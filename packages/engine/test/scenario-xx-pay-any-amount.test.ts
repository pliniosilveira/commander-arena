// "You may pay any amount of {R}. When you do, it deals that much damage to any target" and a Lieutenant's "As long as you control your commander, this
// creature gets +2/+2 and has 'Whenever this creature attacks, it deals 7 damage to target creature defending player controls'" (D-151).
// Pins: CR 118.1 (a cost is paid in full, no part of it), CR 603.12 (a reflexive triggered ability), CR 603.7c (an ability of a creature that has died), CR 508.5
// (the defending player), CR 903.3 (a commander). Cards are SYNTHETIC (src/cards/fixtures/synthetic-dragons-damage.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const TYRANT = 'SYNTHETIC Ember Tyrant';
const WYRM = 'SYNTHETIC Lieutenant Wyrm';
const BOLT = 'Lightning Bolt';
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const LIBRARY = Array.from({ length: 8 }, () => 'Mountain');

describe('the cards are valid', () => {
  test.each([TYRANT, WYRM])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('the shapes that are refused', () => {
    const card = syntheticCard(TYRANT);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const dies = face.abilities.find((a) => a.kind === 'triggered');
    if (dies === undefined || dies.kind !== 'triggered') throw new Error('no trigger');
    const pay = dies.effect as Record<string, unknown>;
    const withEffect = (patch: Record<string, unknown>) =>
      ({
        ...card,
        faces: [{ ...face, abilities: [{ ...dies, effect: { ...pay, ...patch } }] }],
      }) as never;
    expect(validateCard(withEffect({}))).toEqual([]);
    expect(validateCard(withEffect({ symbol: 'X' })).length).toBeGreaterThan(0);
    expect(validateCard(withEffect({ paid: 2 })).length).toBeGreaterThan(0);
    // "that much" is for the reflexive ability only
    expect(
      validateCard({
        ...card,
        faces: [
          {
            ...face,
            abilities: [
              {
                ...dies,
                effect: {
                  kind: 'dealDamage',
                  amount: { kind: 'triggerDamage' },
                  to: { kind: 'eachOpponent' },
                },
              },
            ],
          },
        ],
      } as never).length,
    ).toBeGreaterThan(0);
    // "defending player controls" belongs to an ability of an attacking creature
    const wyrm = syntheticCard(WYRM);
    const wface = wyrm.faces[0];
    if (wface === undefined) throw new Error('no face');
    const hit = {
      kind: 'triggered',
      trigger: { kind: 'upkeep', whose: 'you' },
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { types: ['creature'], controller: 'defendingPlayer' } },
        },
      ],
      effect: { kind: 'dealDamage', amount: 7, to: { kind: 'target', id: 't1' } },
    };
    expect(
      validateCard({ ...wyrm, faces: [{ ...wface, abilities: [hit] }] } as never).length,
    ).toBeGreaterThan(0);
  });
});

describe('"you may pay any amount of {R}. When you do, it deals that much damage to any target"', () => {
  /** My Tyrant dies to two Bolts of mine; `extra` Mountains are left to pay with. */
  function dying(extra: number) {
    let b = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TYRANT)
      .hand(BOLT, BOLT);
    for (let i = 0; i < 2 + extra; i += 1) b = b.battlefield('Mountain');
    const g = b
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .build();
    g.act(0).cast(`${BOLT}[0]`, { targets: [TYRANT], pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: [TYRANT], pay: true });
    g.passAll();
    return g;
  }

  test('I am asked how many, from 0 to the {R} I could pay', () => {
    const g = dying(3);
    g.expect.zone(TYRANT, 'graveyard', { seat: 0 });
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseX');
    if (d?.kind !== 'chooseX') return;
    expect(d.purpose).toBe('payAnyAmount');
    expect(d.min).toBe(0);
    expect(d.max).toBe(3);
  });

  test('2: I pay {R}{R}, and the reflexive ability deals 2 damage to a target I choose', () => {
    const g = dying(3);
    g.act(0).chooseX(2);
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    // the reflexive ability goes on the stack and I choose its target
    g.passAll();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ name: BEARS, seat: 1 });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('the damage is as much as I paid: 3 to a player', () => {
    const g = dying(3);
    g.act(0).chooseX(3);
    g.act(0).payAuto();
    g.passAll();
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 37);
  });

  test('0: nothing is paid and nothing happens', () => {
    const g = dying(3);
    g.act(0).chooseX(0);
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.life(1, 40);
    expect(g.state.stack).toHaveLength(0);
  });

  test('more than I can pay is refused', () => {
    const g = dying(1);
    expect(() => g.act(0).chooseX(2)).toThrow();
    g.expect.pending('chooseX', 0);
  });

  test('cancelling the payment: nothing is paid and no ability is made', () => {
    const g = dying(2);
    g.act(0).chooseX(2);
    g.act(0).cancel();
    g.passAll();
    g.expect.life(1, 40);
    expect(g.state.stack).toHaveLength(0);
  });

  test('with no {R} to pay I am not asked', () => {
    const g = dying(0);
    g.expect.pending('priority', 0);
    expect(g.state.stack).toHaveLength(0);
  });
});

describe('Lieutenant: "as long as you control your commander"', () => {
  function attackGame(commander: boolean) {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WYRM, commander ? { commander: true } : {})
      .seat(1)
      .library(...LIBRARY)
      .battlefield(ANGEL)
      .battlefield(BEARS)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  }

  test('I control my commander: +2/+2 and the attack trigger', () => {
    const g = attackGame(true);
    g.expect.pt(WYRM, 7, 7);
    g.act(0).attack([WYRM]);
    g.expect.pending('targets', 0);
    const d = g.state.pending;
    // only creatures the defending player controls: the Angel and the Bears
    expect(d?.kind === 'targets' ? d.specs[0]?.legal : []).toHaveLength(2);
    g.act(0).chooseTargets({ name: ANGEL, seat: 1 });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('without my commander: 5/5 and no trigger', () => {
    const g = attackGame(false);
    g.expect.pt(WYRM, 5, 5);
    g.act(0).attack([WYRM]);
    g.expect.pending('priority', 0);
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
  });
});
