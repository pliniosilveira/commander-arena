// CasualAgent and RandomLegalAgent answer the ward question, its payment and the legend-rule choice,
// on real engine states built with the scenario DSL. The casual heuristics: pay ward when asked (a
// life part only while life is above PAY_LIFE_ABOVE, like a kicker); keep the legendary permanent
// with the most counters and attachments (then one that is not summoning sick, untapped, a card
// rather than a token, the oldest). Every answer is one the engine lists as legal.
import type { Action, ObjectId } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { PAY_LIFE_ABOVE } from '../src/casual-permanents';
import { RandomLegalAgent } from '../src/index';
import { answer, expectLegal } from './casual-helpers';

const WARD = 'SYNTHETIC Warded Guard'; // Ward {1}
const BLOOD = 'SYNTHETIC Blood Warded Guard'; // Ward: pay 2 life
const KNIGHT = 'SYNTHETIC Ancient Knight';

/** Seat 0 targets seat 1's warded creature with a Bolt and has `mountains` Mountains. */
function atWardQuestion(target: string, mountains: number, life = 40): ScenarioGame {
  const g = scenario()
    .seat(0)
    .life(life)
    .hand('Lightning Bolt')
    .battlefield(...Array.from({ length: mountains }, () => 'Mountain'))
    .seat(1)
    .battlefield(target)
    .build();
  g.act(0).cast('Lightning Bolt', { targets: [target], pay: true });
  g.passAll();
  g.expect.pending('confirmOptional', 0);
  return g;
}

describe('the ward question', () => {
  test('CasualAgent pays a mana ward, then pays it with the planner', async () => {
    const g = atWardQuestion(WARD, 3);
    const accept = await answer(g);
    expect(accept).toEqual({ kind: 'acceptOptional' });
    expectLegal(g, accept);
    g.act(0).accept();
    g.expect.pending('payMana', 0);
    const pay = await answer(g);
    expect(pay).toEqual({ kind: 'payAuto' });
    expectLegal(g, pay);
  });

  test('a life ward is paid while life is high and declined when it is not', async () => {
    expect(await answer(atWardQuestion(BLOOD, 1, PAY_LIFE_ABOVE + 1))).toEqual({
      kind: 'acceptOptional',
    });
    expect(await answer(atWardQuestion(BLOOD, 1, PAY_LIFE_ABOVE))).toEqual({
      kind: 'declineOptional',
    });
  });

  test('RandomLegalAgent answers both questions with legal actions, for any seed', async () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const g = atWardQuestion(WARD, 3);
      const agent = new RandomLegalAgent({ seed });
      const first = await answer(g, agent);
      expectLegal(g, first);
      if (first.kind === 'acceptOptional') {
        g.act(0).accept();
        const second = await answer(g, agent);
        expect(second.kind).toBe('payAuto');
        expectLegal(g, second);
      }
    }
  });
});

/** Seat 0 controls the Knight twice (a card and a second card) and must keep one. */
function atLegendChoice(
  setup: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>,
): ScenarioGame {
  const g = setup(scenario().seat(0)).seat(1).build({ settle: true });
  g.expect.pending('choosePermanent', 0);
  return g;
}

function kept(action: Action): ObjectId {
  if (action.kind !== 'choosePermanents' || action.objects.length !== 1) {
    throw new Error(`expected one kept permanent: ${JSON.stringify(action)}`);
  }
  return action.objects[0] as ObjectId;
}

describe('the legend rule choice', () => {
  test('CasualAgent keeps the one with counters', async () => {
    const g = atLegendChoice((b) =>
      b
        .battlefield(KNIGHT, { label: 'plain' })
        .battlefield(KNIGHT, { label: 'grown', counters: { '+1/+1': 2 } }),
    );
    const action = await answer(g);
    expect(kept(action)).toBe(g.id('grown'));
    expectLegal(g, action);
  });

  test('...or the one with an Aura or Equipment on it', async () => {
    const g = atLegendChoice((b) =>
      b
        .battlefield(KNIGHT, { label: 'plain' })
        .battlefield(KNIGHT, { label: 'equipped' })
        .battlefield('SYNTHETIC Blade', { attachedTo: 'equipped' }),
    );
    expect(kept(await answer(g))).toBe(g.id('equipped'));
  });

  test('with nothing to tell them apart it keeps the one that is not summoning sick', async () => {
    const g = atLegendChoice((b) =>
      b
        .battlefield(KNIGHT, { label: 'fresh', fresh: true })
        .battlefield(KNIGHT, { label: 'ready' }),
    );
    expect(kept(await answer(g))).toBe(g.id('ready'));
  });

  test('and with all else equal, the oldest, which is first in the decision', async () => {
    const g = atLegendChoice((b) =>
      b.battlefield(KNIGHT, { label: 'first' }).battlefield(KNIGHT, { label: 'second' }),
    );
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected choosePermanent');
    expect(kept(await answer(g))).toBe(d.legal[0]);
    expect(d.legal[0]).toBe(g.id('first'));
  });

  test('RandomLegalAgent keeps exactly one, whichever it picks', async () => {
    const seen = new Set<ObjectId>();
    for (let seed = 1; seed <= 30; seed += 1) {
      const g = atLegendChoice((b) =>
        b.battlefield(KNIGHT, { label: 'a' }).battlefield(KNIGHT, { label: 'b' }),
      );
      const action = await answer(g, new RandomLegalAgent({ seed }));
      seen.add(kept(action));
      expectLegal(g, action);
    }
    expect(seen.size).toBe(2);
  });
});
