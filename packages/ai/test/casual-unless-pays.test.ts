// CasualAgent and RandomLegalAgent answer "[do something] unless [that player] pays [cost]" (D-111,
// CR 118.12a), asked of the player who cast the spell, on real engine states built with the scenario DSL.
// The casual heuristic is Ward's: pay when asked (mana: the engine asks only when it can be paid; life
// only while life is above PAY_LIFE_ABOVE; a card to discard only when the hand has cards it is glad
// to lose), then pay the mana with the planner. The agent that controls the watcher answers the
// "you may draw" that follows. Every answer is one the engine lists as legal.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { PAY_LIFE_ABOVE } from '../src/casual-permanents';
import { RandomLegalAgent } from '../src/index';
import { answer, expectLegal } from './casual-helpers';

/** Seat 1 casts a Bolt at seat 0, which controls `watcher`; the trigger has resolved and asks seat 1. */
function atQuestion(
  watcher: string,
  options: { lands?: number; life?: number; hand?: string[] } = {},
) {
  const g = scenario()
    .seat(0)
    .life(40)
    .battlefield(watcher)
    .library('Plains', 'Plains', 'Plains')
    .seat(1)
    .life(options.life ?? 40)
    .hand('Lightning Bolt', ...(options.hand ?? []))
    .battlefield(...Array.from({ length: options.lands ?? 2 }, () => 'Mountain'))
    .library('Plains', 'Plains', 'Plains')
    .at('precombatMain', { active: 1 })
    .build();
  g.act(1).cast('Lightning Bolt', { targets: [{ player: 0 }], pay: true });
  g.pass();
  g.pass();
  g.expect.pending('confirmOptional', 1);
  return g;
}

describe('the payer of an "unless" cost', () => {
  test('CasualAgent pays {1} and then pays it with the planner', async () => {
    const g = atQuestion('SYNTHETIC Strict Tax Collector');
    const accept = await answer(g);
    expect(accept).toEqual({ kind: 'acceptOptional' });
    expectLegal(g, accept);
    g.act(1).accept();
    g.expect.pending('payMana', 1);
    const pay = await answer(g);
    expect(pay).toEqual({ kind: 'payAuto' });
    expectLegal(g, pay);
    g.act(1).payAuto();
    g.expect.handSize(0, 0);
  });

  test('a life cost is paid while life is high and declined when it is not', async () => {
    expect(
      await answer(atQuestion('SYNTHETIC Blood Tax Collector', { life: PAY_LIFE_ABOVE + 1 })),
    ).toEqual({ kind: 'acceptOptional' });
    expect(
      await answer(atQuestion('SYNTHETIC Blood Tax Collector', { life: PAY_LIFE_ABOVE })),
    ).toEqual({ kind: 'declineOptional' });
  });

  test('a card to discard is paid only with a card it is glad to lose', async () => {
    // A spare land is expendable; a hand of one good spell is not.
    const lands = atQuestion('SYNTHETIC Tithe Collector', { lands: 8, hand: ['Plains', 'Plains'] });
    expect(await answer(lands)).toEqual({ kind: 'acceptOptional' });
    const spell = atQuestion('SYNTHETIC Tithe Collector', { lands: 6, hand: ['Serra Angel'] });
    expect(await answer(spell)).toEqual({ kind: 'declineOptional' });
  });

  test('RandomLegalAgent gives a legal answer to the question and to the payment', async () => {
    const g = atQuestion('SYNTHETIC Strict Tax Collector');
    const random = new RandomLegalAgent({ seed: 5 });
    const first = await answer(g, random);
    expectLegal(g, first);
    g.act(1).accept();
    const second = await answer(g, random);
    expectLegal(g, second);
  });
});

describe('the controller of the watcher answers "you may draw"', () => {
  test('CasualAgent accepts the free draw', async () => {
    const g = atQuestion('SYNTHETIC Tax Collector');
    g.act(1).decline();
    g.expect.pending('confirmOptional', 0);
    const draw = await answer(g);
    expect(draw).toEqual({ kind: 'acceptOptional' });
    expectLegal(g, draw);
  });
});
