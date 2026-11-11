// CasualAgent answers the payment of Echo (CR 702.30a) and Cumulative upkeep (CR 702.24a) (D-127), on real engine
// states built with the scenario DSL: it pays while the permanent is worth more than the payment and lets it go
// otherwise (a cumulative upkeep that has grown past what the permanent is worth, life near the danger line, cards it
// wants to keep). Every answer is one the engine lists as legal, and RandomLegalAgent answers legally too.
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { PAY_LIFE_ABOVE } from '../src/casual-permanents';
import { RandomLegalAgent } from '../src/index';
import { answer, expectLegal } from './casual-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
type Builder = ReturnType<typeof scenario>;

/** Seat 0's upkeep of turn 3 with the card's trigger resolved and the question pending. */
function atQuestion(place: (b: Builder) => Builder, life = 20): ScenarioGame {
  const g = place(
    scenario()
      .seat(0)
      .life(life)
      .library(...FILLER),
  )
    .seat(1)
    .library(...FILLER)
    .at('postcombatMain', { active: 1, turn: 2 })
    .build();
  g.advanceTo('upkeep', { turn: 'next' });
  g.pass();
  g.pass();
  g.expect.pending('confirmOptional', 0);
  return g;
}

describe('Echo', () => {
  test('pays an echo cost that is small next to the permanent, then pays the mana', async () => {
    const g = atQuestion((b) =>
      b.battlefield('SYNTHETIC Echo Giant', { fresh: true }).battlefield('Forest', { count: 2 }),
    );
    const accept = await answer(g);
    expect(accept).toEqual({ kind: 'acceptOptional' });
    expectLegal(g, accept);
    g.act(0).accept();
    g.expect.pending('payMana', 0);
    const pay = await answer(g);
    expect(pay).toEqual({ kind: 'payAuto' });
    g.act(0).payAuto();
    g.expect.zone('SYNTHETIC Echo Giant', 'battlefield');
  });

  test('pays for a relic as well: its worth is more than the {2}', async () => {
    const g = atQuestion((b) =>
      b.battlefield('SYNTHETIC Echo Relic', { fresh: true }).battlefield('Mountain', { count: 2 }),
    );
    const accept = await answer(g);
    expect(accept).toEqual({ kind: 'acceptOptional' });
    expectLegal(g, accept);
  });
});

describe('Cumulative upkeep', () => {
  test('pays the first upkeeps and lets the permanent go once the cost has grown past its worth', async () => {
    const g = atQuestion((b) =>
      b.battlefield('SYNTHETIC Aging Wall', { counters: { age: 5 } }).battlefield('Plains', {
        count: 7,
      }),
    );
    // Six age counters now: {1} six times for a Wall of worth about 5.
    expect(await answer(g)).toEqual({ kind: 'declineOptional' });
    const cheap = atQuestion((b) =>
      b.battlefield('SYNTHETIC Aging Wall').battlefield('Plains', { count: 2 }),
    );
    expect(await answer(cheap)).toEqual({ kind: 'acceptOptional' });
  });

  test('a life cost is paid while life is high and declined when it is not', async () => {
    const high = atQuestion((b) => b.battlefield('SYNTHETIC Aging Bloodline'), PAY_LIFE_ABOVE + 5);
    expect(await answer(high)).toEqual({ kind: 'acceptOptional' });
    const low = atQuestion((b) => b.battlefield('SYNTHETIC Aging Bloodline'), PAY_LIFE_ABOVE);
    expect(await answer(low)).toEqual({ kind: 'declineOptional' });
  });

  test('a card to discard is paid only when the hand has a card the agent is glad to lose', async () => {
    const glad = atQuestion((b) =>
      b
        .battlefield('SYNTHETIC Aging Scholar')
        .battlefield('Plains', { count: 8 })
        .hand('Plains', 'Plains', 'Plains', 'Plains'),
    );
    expect(await answer(glad)).toEqual({ kind: 'acceptOptional' });
    const keep = atQuestion((b) =>
      b
        .battlefield('SYNTHETIC Aging Scholar')
        .battlefield('Plains', { count: 8 })
        .hand('Serra Angel', 'Giant Spider'),
    );
    expect(await answer(keep)).toEqual({ kind: 'declineOptional' });
  });
});

describe('RandomLegalAgent', () => {
  test('answers the question and the payment with legal actions', async () => {
    const g = atQuestion((b) =>
      b.battlefield('SYNTHETIC Echo Hound', { fresh: true }).battlefield('Mountain', { count: 2 }),
    );
    const agent = new RandomLegalAgent({ seed: 3 });
    const first = await answer(g, agent);
    expectLegal(g, first);
  });
});
