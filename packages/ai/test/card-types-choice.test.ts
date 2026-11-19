// The AI's answers to "you may exile any number of cards from your graveyard with four or more card types among them. If you do, put a permanent card from among them onto the
// battlefield with a finality counter on it" (Death Toll deck, Winter, CR 205.2a): the decision carries the card types of the cards offered, and the engine's own validation is the
// judge of every answer. The creature that holds the ability is SYNTHETIC; the other cards are real fixtures.
import {
  applyAction,
  type CardDefinition,
  type ChooseCardsDecision,
  type Effect,
  type ObjectId,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, GreedyAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

const PERMANENT = ['artifact', 'creature', 'enchantment', 'land', 'planeswalker', 'battle'].map(
  (t) => ({ types: [t as 'artifact'] }),
);

const effect = (n: number): Effect => ({
  kind: 'sequence',
  effects: [
    {
      kind: 'moveToZone',
      objects: {
        kind: 'choose',
        filter: { zone: 'graveyard', controller: 'you' },
        anyNumber: true,
        optional: true,
        minCardTypes: n,
      },
      to: 'exile',
    },
    {
      kind: 'conditional',
      condition: { kind: 'didPrevious' },
      effect: {
        kind: 'moveToZone',
        objects: {
          kind: 'choose',
          filter: { anyOf: PERMANENT, zone: 'exile', controller: 'you' },
          fromMoved: true,
        },
        to: 'battlefield',
        controller: 'you',
        withCounters: { counter: 'finality', count: 1 },
      },
    },
  ],
});

/** A SYNTHETIC single-face card (the shape of the engine's fixture builder, which is not part of the public API). */
function card(
  name: string,
  types: CardDefinition['faces'][number]['types'],
  abilities: CardDefinition['faces'][number]['abilities'] = [],
  oracleText = 'SYNTHETIC card.',
): CardDefinition {
  return {
    oracleId: null,
    name,
    layout: 'normal',
    faces: [
      {
        name,
        manaCost: ['2'],
        supertypes: [],
        types,
        subtypes: [],
        colors: [],
        power: types.includes('creature') ? 2 : null,
        toughness: types.includes('creature') ? 2 : null,
        loyalty: null,
        defense: null,
        oracleText,
        abilities,
        spell: null,
      },
    ],
    colorIdentity: [],
    support: 'supported',
  };
}

const REAPER = card(
  'SYNTHETIC AI Delirium Reaper',
  ['creature'],
  [{ kind: 'triggered', trigger: { kind: 'endStep', whose: 'you' }, effect: effect(4) }],
  'At the beginning of your end step, you may exile any number of cards from your graveyard with four or more card types among them. If you do, put a permanent card from among them onto the battlefield with a finality counter on it.',
);
const CLOCKWORK = card('SYNTHETIC AI Clockwork', ['artifact', 'creature']);

// Land (Island), creature (Grizzly Bears), artifact (Sol Ring), instant (Lightning Bolt), sorcery (Divination).
const YARD = ['Island', 'Grizzly Bears', 'Sol Ring', 'Lightning Bolt', 'Divination', 'Forest'];

function endStep(yard: readonly string[]): ScenarioGame {
  let b = scenario().define(REAPER).define(CLOCKWORK).seat(0).battlefield(REAPER.name);
  for (const name of yard) b = b.graveyard(name);
  const g = b
    .library('Swamp', 'Swamp', 'Swamp')
    .seat(1)
    .library('Swamp')
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
  g.advanceTo('end');
  g.passAll();
  return g;
}

function decisionOf(g: ScenarioGame): ChooseCardsDecision {
  const d = g.state.pending;
  if (d?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${d?.kind}`);
  return d;
}

const nameOf = (g: ScenarioGame, id: ObjectId): string => {
  const card = g.state.objects[id]?.card;
  const def = card === undefined || card === null ? undefined : g.state.cards[card];
  return def === undefined ? id : (g.state.definitions[def.definition]?.name ?? id);
};

describe('RandomLegalAgent', () => {
  test('60 seeds: every answer to the card type minimum is accepted by the engine', async () => {
    const g = endStep(YARD);
    const d = decisionOf(g);
    const view = g.view(0);
    for (let seed = 1; seed <= 60; seed += 1) {
      const agent = new RandomLegalAgent({ seed });
      const action = await agent.decide(view, d, CTX);
      expect(action.kind, `seed ${seed}`).toBe('chooseCards');
      expect(applyAction(g.state, 0, action).ok, `seed ${seed}`).toBe(true);
      expect(agent.fallbacks, `seed ${seed}`).toHaveLength(0);
    }
  });
});

describe.each([
  ['CasualAgent', () => new CasualAgent({ seed: 1 })],
  ['GreedyAgent', () => new GreedyAgent({ seed: 1 })],
  ['HeuristicAgent', () => new HeuristicAgent({ seed: 1 })],
])('%s: the delirium exile', (_name, make) => {
  test('exiles the smallest set that reaches four card types, with the best permanent card, and puts it onto the battlefield', async () => {
    const g = endStep(YARD);
    const agent = make();
    const first = await agent.decide(g.view(0), decisionOf(g), CTX);
    expect(first.kind).toBe('chooseCards');
    if (first.kind !== 'chooseCards') return;
    // Four cards for four card types, none of them a card that a cheaper one would replace (the Divination costs the most and is not needed).
    expect(first.objects).toHaveLength(4);
    const names = first.objects.map((id) => nameOf(g, id));
    expect(names).toContain('Grizzly Bears');
    expect(names).not.toContain('Divination');
    g.choose(first);
    // The second question: the permanent card of the cards exiled to put onto the battlefield, the most expensive.
    const second = await agent.decide(g.view(0), decisionOf(g), CTX);
    expect(second.kind).toBe('chooseCards');
    g.choose(second);
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.counters('Grizzly Bears', { finality: 1 });
    expect(agent.fallbacks).toHaveLength(0);
    g.expect.invariants();
  });

  test('a card with two card types is used for both: fewer cards reach four types', async () => {
    const g = endStep(['SYNTHETIC AI Clockwork', 'Island', 'Lightning Bolt', 'Divination']);
    const agent = make();
    const first = await agent.decide(g.view(0), decisionOf(g), CTX);
    expect(first.kind).toBe('chooseCards');
    if (first.kind !== 'chooseCards') return;
    expect(applyAction(g.state, 0, first).ok).toBe(true);
    expect(first.objects.length).toBeLessThanOrEqual(3);
  });
});
