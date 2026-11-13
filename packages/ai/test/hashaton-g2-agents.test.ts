// The agents and group 2 of the Hashaton deck (D-363 to D-365, provisional; SYNTHETIC cards of the engine fixtures `synthetic-hashaton-g2.ts`): "Whenever you gain
// life, you may pay that much life. If you do, draw that many cards" asks the question that "you may pay" already asks (a `confirmOptional` of purpose `mayPay`, CR
// 119.4: asked only when the life can be paid), and "your opponents can't gain life", "each opponent loses life equal to the life that player lost this turn" and the end
// step token ask nothing. Each agent is checked on real engine states: every answer is one the engine lists and accepts; the casual agent pays when it stays well above
// the danger line and declines when the payment would leave it low; nobody is asked when the life cannot be paid.
import { getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { answer, expectLegal } from './casual-helpers';
import { askHeuristic } from './heuristic-helpers';

const LIBRARY = Array.from({ length: 10 }, () => 'Island');
const DRAGON = 'SYNTHETIC Ghostly Dragon';
const MEND = 'SYNTHETIC Mend'; // gain 3 life
const BOLT = 'Lightning Bolt';

const agents: readonly [string, () => { decide: CasualAgent['decide'] }][] = [
  ['random', () => new RandomLegalAgent({ seed: 3 })],
  ['casual', () => new CasualAgent({ seed: 3 })],
];

/** The Dragon is out, Mend gained 3 life and its trigger resolves: the question "pay 3 life?" is asked. */
function atQuestion(life: number): ScenarioGame {
  const g = scenario()
    .seat(0)
    .life(life)
    .hand(MEND)
    .battlefield(DRAGON, 'Plains')
    .library(...LIBRARY)
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();
  g.act(0).cast(MEND, { pay: true });
  g.passAll();
  g.expect.pending('confirmOptional', 0);
  return g;
}

describe('the question: pay that much life?', () => {
  test.each(agents)('the %s agent answers with an action the engine lists', async (_n, make) => {
    const g = atQuestion(20);
    const a = await answer(g, make());
    expectLegal(g, a);
  });

  test('the heuristic agent answers with an action the engine lists', async () => {
    const g = atQuestion(20);
    const a = await askHeuristic(g, new HeuristicAgent({ seed: 1 }));
    expectLegal(g, a);
  });

  test('the question is the "may pay" of the engine, with the life worked out', () => {
    const g = atQuestion(20);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error('not asked');
    expect(d.purpose).toBe('mayPay');
    expect(d.cost).toEqual([{ kind: 'payLife', amount: 3 }]);
    // the two answers the engine lists
    const kinds = getLegalActions(g.state, 0).map((a) => a.kind);
    expect(kinds).toContain('acceptOptional');
    expect(kinds).toContain('declineOptional');
  });

  test('the casual agent pays 3 life with plenty of it and draws the cards', async () => {
    const g = atQuestion(20);
    const a = await answer(g, new CasualAgent({ seed: 3 }));
    expect(a).toEqual({ kind: 'acceptOptional' });
  });

  test('the casual agent declines when the payment would leave it at 10 life or less', async () => {
    // 8 life, Mend makes it 11: paying 3 leaves 8.
    const g = atQuestion(8);
    const a = await answer(g, new CasualAgent({ seed: 3 }));
    expect(a).toEqual({ kind: 'declineOptional' });
  });

  test('nobody is asked when the life cannot be paid (CR 119.4): the trigger does nothing', () => {
    // 1 life, Mend makes it 4, and a Bolt in answer leaves 1, which cannot pay 3.
    const g = scenario()
      .seat(0)
      .life(1)
      .hand(MEND)
      .battlefield(DRAGON, 'Plains')
      .library(...LIBRARY)
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    g.act(0).cast(MEND, { pay: true });
    g.act(0).pass();
    g.act(1).pass();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
    g.expect.life(0, 1);
    g.expect.handSize(0, 0);
  });
});

describe('the other cards of the group ask nothing', () => {
  test.each(agents)(
    'a whole end step with the demon and the angel: the %s agent',
    async (_n, make) => {
      const g = scenario()
        .seat(0)
        .life(20)
        .battlefield('SYNTHETIC Hollow Demon', 'SYNTHETIC Dusk Seraph', 'SYNTHETIC Joyless Idol')
        .library(...LIBRARY)
        .seat(1)
        .life(20)
        .hand(BOLT, MEND)
        .battlefield('Mountain', 'Plains')
        .library(...LIBRARY)
        .at('precombatMain', { active: 1 })
        .build();
      g.act(1).cast(BOLT, { targets: [{ player: 1 }], pay: true });
      g.passAll();
      g.advanceTo('end');
      g.passAll();
      g.expect.life(1, 14);
      const a = await answer(g, make());
      expectLegal(g, a);
    },
  );
});
