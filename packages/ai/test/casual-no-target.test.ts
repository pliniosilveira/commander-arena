// A cast the engine offers and then cannot complete (a slot that needs a target lists none, a payment is
// refused; see docs/ROADMAP.md) must not loop: the targets decision is answered with a cancel, and the
// same object is not chosen to be cast again in that turn (a cast that goes through gives the card a new
// object on the stack, CR 400.7). A loop ended 2 of 12 precon games at the action cap, with thousands of
// refused answers. An activation whose targets decision is cancelled that way is left out for the rest of the turn (issue 638).
import type { Action, CardDefinition, TargetsDecision } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { createCasualHandlers } from '../src/casual-agent';
import {
  hasNoTargetToChoose,
  noteChoice,
  noteNoTarget,
  withoutTried,
} from '../src/casual-no-target';
import { CasualAgent, GreedyAgent, HeuristicAgent } from '../src/index';
import { CTX } from './helpers';

function murderGame() {
  return scenario()
    .seat(0)
    .hand('Murder')
    .battlefield('Swamp', 'Swamp', 'Swamp')
    .library('Swamp', { count: 4 })
    .seat(1)
    .battlefield('Grizzly Bears')
    .library('Swamp', { count: 4 })
    .at('precombatMain', { active: 0 })
    .build();
}

describe('a targets decision with no legal target for a slot that needs one', () => {
  test('is answered with a cancel', () => {
    const g = murderGame();
    g.act(0).cast('Murder');
    const pending = g.state.pending;
    if (pending?.kind !== 'targets') throw new Error('targets expected');
    // The decision as the engine asks it, with nothing legal in the slot.
    const stuck: TargetsDecision = {
      ...pending,
      specs: pending.specs.map((s) => ({ ...s, legal: [] })),
    };
    const handlers = createCasualHandlers(g.view(0), () => 0);
    expect(handlers.targets(stuck)).toEqual({ kind: 'cancel' });
  });

  test('a decision with a legal target is answered as before', () => {
    const g = murderGame();
    g.act(0).cast('Murder');
    const pending = g.state.pending;
    if (pending?.kind !== 'targets') throw new Error('targets expected');
    expect(createCasualHandlers(g.view(0), () => 0).targets(pending).kind).toBe('chooseTargets');
  });
});

describe.each([
  ['CasualAgent', () => new CasualAgent({ seed: 1 })],
  ['GreedyAgent', () => new GreedyAgent({ seed: 1 })],
  ['HeuristicAgent', () => new HeuristicAgent({ seed: 1 })],
])('%s does not choose the same cast again in the same turn', (_name, make) => {
  test('the first time it casts, and after a cancel it does not cast that object again', async () => {
    const g = murderGame();
    const agent = make();
    const view = g.view(0);
    if (view.pending === null) throw new Error('no decision');
    const first: Action = await agent.decide(view, view.pending, CTX);
    expect(first).toMatchObject({ kind: 'castSpell', object: g.id('Murder') });
    // The cast begins and is cancelled: the card is the same object in the hand again.
    g.choose(first);
    g.choose({ kind: 'cancel' });
    const again = g.view(0);
    if (again.pending === null) throw new Error('no decision');
    const second = await agent.decide(again, again.pending, CTX);
    expect(second.kind).not.toBe('castSpell');
  });
});

// Issue 638: an activation the engine offers whose targets cannot be chosen. The engine no longer offers the case that was
// seen (Saheeli, Sublime Artificer's "another target" with one artifact), so the stuck decision is made here, as above: the
// loyalty ability of a SYNTHETIC planeswalker (the shape of the loop: every agent uses a planeswalker's ability) is activated and
// its targets decision is given with nothing legal.
const WALKER_NAME = 'SYNTHETIC Target Walker';
const WALKER: CardDefinition = {
  oracleId: null,
  name: WALKER_NAME,
  layout: 'normal',
  faces: [
    {
      name: WALKER_NAME,
      manaCost: ['1', 'W', 'W'],
      supertypes: ['legendary'],
      types: ['planeswalker'],
      subtypes: ['Dack'],
      colors: ['W'],
      power: null,
      toughness: null,
      loyalty: 4,
      defense: null,
      oracleText: '+1: Put a +1/+1 counter on target creature.',
      spell: null,
      abilities: [
        {
          kind: 'activated',
          cost: [{ kind: 'loyalty', change: 1 }],
          effect: {
            kind: 'addCounters',
            objects: { kind: 'target', id: 't1' },
            counter: '+1/+1',
            count: 1,
          },
          targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
        },
      ],
    },
  ],
  colorIdentity: ['W'],
  support: 'supported',
};

function walkerGame() {
  return scenario()
    .define(WALKER)
    .seat(0)
    .battlefield(WALKER_NAME, 'Grizzly Bears')
    .library('Plains', { count: 4 })
    .seat(1)
    .library('Plains', { count: 4 })
    .at('precombatMain', { active: 0 })
    .build();
}

/** The priority decision of seat 0 and its loyalty activation. */
function walkerOption(g: ReturnType<typeof walkerGame>) {
  const view = g.view(0);
  if (view.pending?.kind !== 'priority') throw new Error('priority expected');
  const activation = view.pending.options.find(
    (o) => o.kind === 'activate' && o.object === g.id(WALKER_NAME),
  );
  if (activation === undefined) throw new Error('the loyalty ability is not offered');
  // Only the activation and a pass are left, so the agent has an activation to choose.
  return {
    view,
    activation,
    narrow: { ...view.pending, options: [activation, { kind: 'pass' as const }] },
  };
}

describe.each([
  ['CasualAgent', () => new CasualAgent({ seed: 1 })],
  ['GreedyAgent', () => new GreedyAgent({ seed: 1 })],
  ['HeuristicAgent', () => new HeuristicAgent({ seed: 1 })],
])(
  '%s does not choose again in the turn an activation whose targets could not be chosen',
  (_name, make) => {
    test('it activates, cancels at the targets decision with nothing to choose, then moves on', async () => {
      const g = walkerGame();
      const agent = make();
      const { view, activation, narrow } = walkerOption(g);
      const first = await agent.decide(view, narrow, CTX);
      expect(first).toEqual(activation);
      g.choose(first);
      const pending = g.state.pending;
      if (pending?.kind !== 'targets') throw new Error('targets expected');
      const stuck: TargetsDecision = {
        ...pending,
        specs: pending.specs.map((s) => ({ ...s, legal: [] })),
      };
      expect(await agent.decide(g.view(0), stuck, CTX)).toEqual({ kind: 'cancel' });
      g.choose({ kind: 'cancel' });
      // The engine offers the activation again (no loyalty ability was activated); the agent leaves it out for the rest of the turn.
      const again = walkerOption(g);
      expect(await agent.decide(again.view, again.narrow, CTX)).toEqual({ kind: 'pass' });
    });
  },
);

describe('the activation guard records the failure, not the choice', () => {
  test('a chosen activation stays a choice; after a cancel with nothing to choose it is left out until the turn ends', () => {
    const g = walkerGame();
    const { view, activation, narrow } = walkerOption(g);
    const tried = new Set<string>();
    noteChoice(view, activation, tried);
    // Chosen, not failed: a repeat of an activation that went through is legitimate.
    expect(withoutTried(view, narrow, tried).options).toContainEqual(activation);
    noteNoTarget(tried);
    expect(withoutTried(view, narrow, tried).options).not.toContainEqual(activation);
    // Another turn: offered again.
    expect(withoutTried({ ...view, turn: view.turn + 1 }, narrow, tried).options).toContainEqual(
      activation,
    );
  });

  test('a cancel after another answer (a pass) records nothing', () => {
    const g = walkerGame();
    const { view, activation, narrow } = walkerOption(g);
    const tried = new Set<string>();
    noteChoice(view, activation, tried);
    noteChoice(view, { kind: 'pass' }, tried);
    noteNoTarget(tried);
    expect(withoutTried(view, narrow, tried).options).toContainEqual(activation);
  });
});

test('"another target" with one object for both slots: each slot has a legal target, but no answer fills both (CR 115.3), so it is cancelled', () => {
  const g = walkerGame();
  g.choose(walkerOption(g).activation);
  const pending = g.state.pending;
  if (pending?.kind !== 'targets') throw new Error('targets expected');
  const [only] = pending.specs;
  if (only === undefined) throw new Error('a slot expected');
  const pair: TargetsDecision = {
    ...pending,
    specs: [only, { ...only, specId: 't2', differentFrom: only.specId }],
  };
  expect(pair.specs.every((s) => s.legal.length === 1)).toBe(true);
  expect(hasNoTargetToChoose(pair)).toBe(true);
  expect(hasNoTargetToChoose(pending)).toBe(false);
  expect(createCasualHandlers(g.view(0), () => 0).targets(pair)).toEqual({ kind: 'cancel' });
});
