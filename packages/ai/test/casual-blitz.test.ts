// CasualAgent and Blitz (CR 702.152a, rules text unverified): a creature is blitzed from the hand or from the graveyard ("You may cast this card from your graveyard using its blitz ability")
// only to attack at once, in its first main phase with no untapped opposing creature to block it; the discard of the cost is answered as any discard cost is. The cards are SYNTHETIC
// (the engine's src/cards/fixtures/synthetic-alt-costs.ts).
import type { Action } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent } from '../src/index';
import { CTX } from './helpers';

const RUSHER = 'SYNTHETIC Blitz Rusher'; // {3}{R} 2/2, blitz {1}{R}
const MONK = 'SYNTHETIC Blitz Monk'; // {4}{R} 4/3, blitz {2}{R}{R} and a discard, may be blitzed from the graveyard

async function answer(g: ScenarioGame): Promise<Action> {
  const decision = g.state.pending;
  if (decision === null) throw new Error('nothing is pending');
  const view = g.view(decision.seat);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  const action = await new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX);
  expect(JSON.stringify(g.legalActions(decision.seat))).toContain(JSON.stringify(action));
  return action;
}

const board = (build: (b: ReturnType<typeof scenario>) => void, seats = 3) => {
  const b = scenario({ seats });
  build(b);
  return b.at('precombatMain', { active: 0 }).build();
};

describe('blitz from the hand', () => {
  test('no untapped opposing creature: the creature is blitzed to attack at once', async () => {
    const g = board((b) => {
      b.seat(0).hand(RUSHER).battlefield('Mountain', { count: 2 }).seat(1).seat(2);
    });
    expect(await answer(g)).toEqual({
      kind: 'castSpell',
      object: g.id(RUSHER),
      alternative: 'blitz',
    });
  });

  test('an untapped creature of any opponent could block: it is not blitzed', async () => {
    const g = board((b) => {
      b.seat(0)
        .hand(RUSHER)
        .battlefield('Mountain', { count: 2 })
        .seat(1)
        .seat(2)
        .battlefield('Grizzly Bears');
    });
    expect(await answer(g)).toEqual({ kind: 'pass' });
  });

  test('with the mana for the ordinary cast the creature is cast the ordinary way when blockers are there', async () => {
    const g = board((b) => {
      b.seat(0)
        .hand(RUSHER)
        .battlefield('Mountain', { count: 4 })
        .seat(1)
        .battlefield('Grizzly Bears')
        .seat(2);
    });
    expect(await answer(g)).toEqual({ kind: 'castSpell', object: g.id(RUSHER) });
  });
});

describe('blitz from the graveyard', () => {
  test('a card in the graveyard with a card to discard is blitzed when it can attack', async () => {
    const g = board((b) => {
      b.seat(0)
        .graveyard(MONK)
        .hand('Grizzly Bears')
        .battlefield('Mountain', { count: 4 })
        .seat(1)
        .seat(2);
    });
    expect(await answer(g)).toEqual({
      kind: 'castSpell',
      object: g.id(MONK),
      alternative: 'blitz',
    });
  });

  test('it is a play of its own: with blockers it is left in the graveyard', async () => {
    const g = board((b) => {
      b.seat(0).graveyard(MONK).hand('Grizzly Bears').battlefield('Mountain', { count: 4 }).seat(1);
      b.battlefield('Grizzly Bears').seat(2);
    });
    expect(await answer(g)).toEqual({ kind: 'pass' });
  });

  test('the discard cost is answered with a legal card', async () => {
    const g = board((b) => {
      b.seat(0).graveyard(MONK).hand('Island', 'Forest').battlefield('Mountain', { count: 4 });
      b.seat(1).seat(2);
    });
    g.act(0).cast(MONK, { alternative: 'blitz', pay: true });
    const decision = g.state.pending;
    expect(decision?.kind).toBe('chooseCards');
    const action = await answer(g);
    expect(action.kind).toBe('chooseCards');
  });
});
