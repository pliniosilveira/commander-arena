// CasualAgent and HeuristicAgent answer the two questions of "Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your
// hand and the other into your graveyard." (D-303, `revealAndSeparate`), on real engine states built with the scenario DSL: as the opponent they split the cards by worth into two
// piles of similar value, as the controller they take the better pile (and, when they separated and an opponent chooses, give it the worse one). Every answer is one the engine lists and
// accepts. The cards are SYNTHETIC (src/cards/fixtures/synthetic-piles.ts) or real fixtures.
import type { Action, GameView, ObjectId } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { pileCardWorth } from '../src/casual-piles';
import { CasualAgent, HeuristicAgent } from '../src/index';
import { answer, expectLegal } from './casual-helpers';
import { ctxFor } from './heuristic-helpers';

const READING = 'SYNTHETIC Pile Reading';
const OFFERING = 'SYNTHETIC Pile Offering';
const TOP = ['Serra Angel', 'Giant Spider', 'Grizzly Bears', 'Lightning Bolt', 'Plains'] as const;
const LABELS = ['a', 'b', 'c', 'd', 'e'] as const;

function opened(card: string, top: readonly string[] = TOP): ScenarioGame {
  const b = scenario().seat(0).hand(card).battlefield('Island', 'Island', 'Island', 'Island');
  for (const [i, name] of top.entries()) b.library(name, { label: LABELS[i] ?? `x${i}` });
  for (let i = 0; i < 3; i++) b.library('Plains');
  const g = b
    .seat(1)
    .library('Island', 'Island')
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
  g.act(0).cast(card, { pay: true });
  g.passAll();
  return g;
}

const agents: readonly [string, () => { decide: CasualAgent['decide'] }][] = [
  ['casual', () => new CasualAgent({ seed: 1 })],
  ['heuristic', () => new HeuristicAgent({ seed: 3 })],
];

async function ask(g: ScenarioGame, agent: { decide: CasualAgent['decide'] }): Promise<Action> {
  const seat = g.state.pending?.seat ?? 0;
  const view = g.view(seat);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  return agent.decide(view, view.pending, ctxFor(g, { withSample: false }));
}

const worthOf = (view: GameView, ids: readonly ObjectId[]): number =>
  ids.reduce((sum, id) => {
    const o = view.pendingCards?.find((c) => c.id === id);
    return sum + (o === undefined ? 0 : pileCardWorth(o));
  }, 0);

describe('as the opponent that separates', () => {
  test.each(agents)('%s deals the cards into two piles of similar worth', async (_name, make) => {
    const g = opened(READING);
    const action = await ask(g, make());
    expect(action.kind).toBe('chooseCards');
    if (action.kind !== 'chooseCards') return;
    expectLegal(g, action);
    const view = g.view(1);
    const all = LABELS.map((l) => g.id(l));
    const first = all.filter((id) => action.objects.includes(id));
    const second = all.filter((id) => !action.objects.includes(id));
    // Worths: Serra Angel 7, Giant Spider 5.5, Grizzly Bears 3, Plains 2, Lightning Bolt 1; dealt best first to the lighter pile.
    expect(Math.abs(worthOf(view, first) - worthOf(view, second))).toBeLessThanOrEqual(1);
    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
  });

  test('the same cards give the same answer every time', async () => {
    const one = await ask(opened(READING), new CasualAgent({ seed: 1 }));
    const two = await ask(opened(READING), new CasualAgent({ seed: 99 }));
    expect(one).toEqual(two);
  });
});

describe('as the controller that chooses', () => {
  test.each(agents)('%s takes the pile worth more into its hand', async (_name, make) => {
    const g = opened(READING);
    // Pile 1: Angel and Bears (7 + 3 = 10); pile 2: Spider, Bolt and Plains (5.5 + 1 + 2 = 8.5).
    g.act(1).chooseCards('a', 'c');
    const action = await ask(g, make());
    expectLegal(g, action);
    const piles = (g.state.pending as { piles?: { first: ObjectId[]; second: ObjectId[] } }).piles;
    const view = g.view(0);
    const better =
      worthOf(view, piles?.second ?? []) > worthOf(view, piles?.first ?? []) ? 'pile2' : 'pile1';
    expect(action).toEqual({ kind: 'chooseOption', option: better });
  });

  test('a clearly better pile wins: all five cards against none', async () => {
    const g = opened(READING);
    g.act(1).chooseCards();
    expect(await answer(g)).toEqual({ kind: 'chooseOption', option: 'pile2' });
  });

  test('a tie takes pile 1', async () => {
    const g = opened(READING, ['Grizzly Bears', 'Grizzly Bears', 'Plains', 'Plains', 'Plains']);
    // Two Bears (3 + 3) against three Plains (2 + 2 + 2).
    g.act(1).chooseCards('a', 'b');
    expect(await answer(g)).toEqual({ kind: 'chooseOption', option: 'pile1' });
  });
});

describe('when the agent separates and an opponent chooses (the controller receives the piles)', () => {
  test('the agent that chooses gives the controller the pile worth less', async () => {
    const g = scenario()
      .seat(0)
      .hand(OFFERING)
      .battlefield('Island', 'Island', 'Island')
      .library('Serra Angel', { label: 'a' })
      .library('Giant Spider', { label: 'b' })
      .library('Grizzly Bears', { label: 'c' })
      .library('Plains', { label: 'd' })
      .library('Plains')
      .seat(1)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(OFFERING, { pay: true });
    g.passAll();
    // The controller (seat 0) separates; the opponent (seat 1, the agent) chooses which pile the controller gets: the worse one.
    g.act(0).chooseCards('a');
    const action = await answer(g);
    expectLegal(g, action);
    expect(action).toEqual({ kind: 'chooseOption', option: 'pile1' });
  });
});
