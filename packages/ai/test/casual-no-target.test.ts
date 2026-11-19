// A cast the engine offers and then cannot complete (a slot that needs a target lists none, a payment is
// refused; see docs/ROADMAP.md) must not loop: the targets decision is answered with a cancel, and the
// same object is not chosen to be cast again in that turn (a cast that goes through gives the card a new
// object on the stack, CR 400.7). A loop ended 2 of 12 precon games at the action cap, with thousands of
// refused answers.
import type { Action, TargetsDecision } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { createCasualHandlers } from '../src/casual-agent';
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
