// Every agent answers the "you may" of the dies-and-return ability (D-982, D-984) from the ability on the stack, not from the Oracle text of the creature that died: the
// Seraph's pair has the ability granted, so the text of the dying partner is some other text, and a costly "you may" in it ("you may sacrifice a land") must not make the
// agent decline the free return. On real engine states built with the scenario DSL and SYNTHETIC cards.
import type { Action, CardDefinition, ConfirmOptionalDecision } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { type Agent, CasualAgent, GreedyAgent, HeuristicAgent } from '../src/index';
import { CTX } from './helpers';

const SERAPH = 'SYNTHETIC Soulbound Seraph';
const PARTNER = 'SYNTHETIC Costly Partner';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 6 }, () => 'Plains');

/** SYNTHETIC: a creature whose own text has a costly "you may", which the dies ability it is given must not be confused with (defined here: the fixtures module is not API). */
const costly: CardDefinition = {
  oracleId: null,
  name: PARTNER,
  layout: 'normal',
  faces: [
    {
      name: PARTNER,
      manaCost: ['1'],
      supertypes: [],
      types: ['creature'],
      subtypes: [],
      colors: [],
      power: 2,
      toughness: 2,
      loyalty: null,
      defense: null,
      oracleText: 'Whenever this creature attacks, you may sacrifice a land.',
      abilities: [],
      spell: null,
    },
  ],
  colorIdentity: [],
  support: 'supported',
};

/** The Seraph paired with `partner`; the partner is killed with a Bolt; the question of the granted ability is pending for seat 0. */
function dying(partner: string): ScenarioGame {
  const g = scenario()
    .define(costly)
    .seat(0)
    .library(...LIBRARY)
    .hand('Lightning Bolt')
    .battlefield('Mountain')
    .battlefield(SERAPH, { label: 'seraph', pairedWith: 'partner' })
    .battlefield(partner, { label: 'partner' })
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  g.act(0).cast('Lightning Bolt', { targets: ['partner'], pay: true });
  g.passAll(); // the Bolt resolves, the partner dies: the dies ability goes on the stack
  if (g.state.pending?.kind === 'orderTriggers') g.act(0).orderTriggers(0);
  g.passAll(); // the ability resolves: the question
  g.expect.pending('confirmOptional', 0);
  return g;
}

async function decide(g: ScenarioGame, agent: Agent): Promise<Action> {
  const view = g.view(0);
  if (view.pending === null) throw new Error('no decision');
  return agent.decide(view, view.pending, CTX);
}

const agents: readonly [string, () => Agent][] = [
  ['casual', () => new CasualAgent({ seed: 3 })],
  ['greedy', () => new GreedyAgent({ seed: 3 })],
  ['heuristic', () => new HeuristicAgent({ seed: 3 })],
];

describe('the granted dies-and-return ability is accepted whatever the dying creature says', () => {
  test('the question quotes the dying creature (the engine says what is asked in the ability on the stack)', () => {
    const g = dying(PARTNER);
    const d = g.state.pending as ConfirmOptionalDecision;
    expect(d.sourceOracleText).toContain('you may sacrifice a land');
    expect(g.view(0).stack.some((o) => o.id === d.source && o.ability !== undefined)).toBe(true);
  });

  test.each(agents)('%s: a partner whose own text has a costly "you may"', async (_name, make) => {
    const g = dying(PARTNER);
    expect(await decide(g, make())).toEqual({ kind: 'acceptOptional' });
  });

  test.each(agents)('%s: a vanilla partner', async (_name, make) => {
    const g = dying(BEARS);
    expect(await decide(g, make())).toEqual({ kind: 'acceptOptional' });
  });
});
