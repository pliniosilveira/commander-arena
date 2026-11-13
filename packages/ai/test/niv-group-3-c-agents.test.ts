// The agents and group 3-c of the Niv-Mizzet deck (D-350 to D-354, SYNTHETIC cards of the engine fixtures `synthetic-niv-group-3-c.ts`): "you may cast target instant or
// sorcery card from a graveyard, and mana of any type can be spent to cast that spell. If that spell would be put into a graveyard, exile it instead" asks no new kind of
// question: a target for the trigger (`targets`), a yes or no (`confirmOptional`, purpose `castCard`), the target of the spell cast and its payment. Each agent is checked on
// real engine states: every answer is one the engine lists and accepts, and whole turns with the cards finish without a rejected action.
import { getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { answer, expectLegal, sameAction } from './casual-helpers';
import { askHeuristic } from './heuristic-helpers';

const LIBRARY = Array.from({ length: 8 }, () => 'Island');
const CASTER = 'SYNTHETIC Graveyard Caster';
const BOLT = 'Lightning Bolt';
const DIVINATION = 'Divination';
const COUNTERSPELL = 'Counterspell';

const agents: readonly [string, () => { decide: CasualAgent['decide'] }][] = [
  ['random', () => new RandomLegalAgent({ seed: 3 })],
  ['casual', () => new CasualAgent({ seed: 3 })],
];

/** The caster is on the battlefield and its trigger is on the stack, with `mine` and `theirs` in the graveyards: the trigger asks for its target. */
function atTarget(mine: readonly string[], theirs: readonly string[], lands = 4): ScenarioGame {
  const g = scenario()
    .seat(0)
    .hand(CASTER)
    .battlefield('Island', { count: 3 })
    .battlefield('Mountain', { count: lands })
    .graveyard(...mine)
    .library(...LIBRARY)
    .seat(1)
    .graveyard(...theirs)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();
  g.act(0).cast(CASTER, { pay: true });
  g.passAll();
  return g;
}

/** The trigger has resolved with `mine` the target: the question "cast it?" is asked. */
function atQuestion(target: string): ScenarioGame {
  const g = atTarget([DIVINATION], [BOLT]);
  g.act(0).chooseTargets(target);
  g.passAll();
  g.expect.pending('confirmOptional', 0);
  return g;
}

describe('the target of the trigger', () => {
  test.each(agents)('the %s agent chooses a target that the engine lists', async (_n, make) => {
    const g = atTarget([DIVINATION], [BOLT]);
    g.expect.pending('targets', 0);
    const a = await answer(g, make());
    expectLegal(g, a);
  });

  test('the casual agent takes the most expensive card it can pay for, whoever owns it', async () => {
    const g = atTarget([BOLT], [DIVINATION]);
    const a = await answer(g, new CasualAgent({ seed: 3 }));
    expect(a).toEqual({
      kind: 'chooseTargets',
      targets: [expect.objectContaining({ kind: 'object', id: g.id(DIVINATION) })],
    });
  });

  test('a card that does not fit the mana is the last choice: with only the Mountains left Divination is out of reach, the Bolt is not', async () => {
    // Three Islands tapped for the caster leave one Mountain and nothing else: {2}{U} cannot be paid, {R} can (the plain cost, no any-type mana in the count).
    const g = atTarget([DIVINATION], [BOLT], 1);
    const a = await answer(g, new CasualAgent({ seed: 3 }));
    expect(a).toEqual({
      kind: 'chooseTargets',
      targets: [expect.objectContaining({ kind: 'object', id: g.id(BOLT) })],
    });
  });

  test('the heuristic agent chooses a target that the engine lists', async () => {
    const g = atTarget([DIVINATION], [BOLT]);
    const a = await askHeuristic(g, new HeuristicAgent({ seed: 1 }));
    expectLegal(g, a);
  });
});

describe('the question: cast it?', () => {
  test.each(agents)('the %s agent answers with an action the engine lists', async (_n, make) => {
    const g = atQuestion(DIVINATION);
    const a = await answer(g, make());
    expectLegal(g, a);
  });

  test('the casual agent casts Divination (a card worth casting) and Lightning Bolt', async () => {
    for (const card of [DIVINATION, BOLT]) {
      const g = atQuestion(card);
      expect(await answer(g, new CasualAgent({ seed: 3 }))).toEqual({ kind: 'acceptOptional' });
    }
  });

  test('the casual agent does not cast a board wipe that would only hurt its own board', async () => {
    const g = scenario()
      .seat(0)
      .hand(CASTER)
      .battlefield('Island', { count: 7 })
      .graveyard('SYNTHETIC Wrath')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    g.act(0).cast(CASTER, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    expect(await answer(g, new CasualAgent({ seed: 3 }))).toEqual({ kind: 'declineOptional' });
  });

  test('the heuristic agent answers with an action the engine lists', async () => {
    const g = atQuestion(DIVINATION);
    const a = await askHeuristic(g, new HeuristicAgent({ seed: 1 }));
    expectLegal(g, a);
  });
});

describe('whole turns by the agents', () => {
  const play = async (g: ScenarioGame, agent: { decide: CasualAgent['decide'] }) => {
    for (let i = 0; i < 80 && g.state.pending !== null && g.state.result === null; i += 1) {
      const decision = g.state.pending;
      const view = g.view(decision.seat);
      if (view.pending === null) break;
      const a = await agent.decide(view, view.pending, { budgetMs: 1000, now: () => 0 });
      expect(getLegalActions(g.state, decision.seat).some((x) => sameAction(x, a))).toBe(true);
      g.choose(decision.seat, a);
    }
  };

  test.each(agents)(
    'the %s agent plays a hand with the caster and spells in the graveyards without a rejected action',
    async (_name, make) => {
      for (let seed = 0; seed < 5; seed += 1) {
        const g = scenario()
          .seat(0)
          .hand(CASTER)
          .battlefield('Island', { count: 4 })
          .battlefield('Mountain', { count: 4 })
          .graveyard(BOLT, DIVINATION)
          .library(BOLT, ...LIBRARY)
          .seat(1)
          .graveyard(COUNTERSPELL)
          .library(...LIBRARY)
          .at('precombatMain')
          .build();
        await play(g, make());
        g.expect.invariants();
      }
    },
  );
});
