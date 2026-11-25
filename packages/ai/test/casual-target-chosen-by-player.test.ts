// The AI's answer when it is the player who chooses the target of another player's triggered ability ("destroy target nonland permanent of that player's choice that one of your
// opponents controls", Bladegriff Prototype, CR 603.3d, `TargetSpec.chosenBy`). The Griffin is SYNTHETIC; the permanents are real fixtures. The engine's own validation judges every answer.
import { applyAction } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import {
  type Agent,
  CasualAgent,
  GreedyAgent,
  HeuristicAgent,
  RandomLegalAgent,
} from '../src/index';
import { CTX } from './helpers';

const GRIFFIN = 'SYNTHETIC Choosing Griffin';

const agents: readonly (readonly [string, () => Agent])[] = [
  ['casual', () => new CasualAgent({ seed: 1 })],
  ['greedy', () => new GreedyAgent({ seed: 1 })],
  ['heuristic', () => new HeuristicAgent({ seed: 1 })],
  ['random', () => new RandomLegalAgent({ seed: 1 })],
];

/** Seat 0 hits seat 1 with the Griffin; seat 1 (the agent) has an Angel and Bears, seat 2 a Sol Ring: seat 1 is asked for the target. */
function hit(): ScenarioGame {
  const g = scenario({ seats: 3 })
    .seat(0)
    .battlefield(GRIFFIN)
    .seat(1)
    .battlefield('Serra Angel', 'Grizzly Bears')
    .seat(2)
    .battlefield('Sol Ring')
    .at('precombatMain', { active: 0 })
    .build();
  g.advanceTo('declareAttackers');
  g.act(0).declareAttackers([{ attacker: { name: GRIFFIN, seat: 0 }, target: { player: 1 } }]);
  g.advanceTo('combatDamage');
  g.expect.pending('targets', 1);
  return g;
}

describe('the damaged player is asked, and every agent answers a target the engine accepts', () => {
  test.each(agents)('%s', async (_name, make) => {
    const g = hit();
    const view = g.view(1);
    if (view.pending === null) throw new Error('the seat does not see its decision');
    const action = await make().decide(view, view.pending, CTX);
    expect(action).toMatchObject({ kind: 'chooseTargets' });
    expect(applyAction(g.state, 1, action).ok, JSON.stringify(action)).toBe(true);
  });

  test('the casual agent gives up what costs it least, not the Angel', async () => {
    const g = hit();
    const view = g.view(1);
    if (view.pending === null) throw new Error('the seat does not see its decision');
    const action = await new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX);
    g.choose(action);
    g.passAll();
    g.expect.zone('Serra Angel', 'battlefield', { seat: 1 });
    // The Sol Ring (mana value 1) and the Bears (mana value 2): the cheaper of the permanents it may lose.
    g.expect.zone('Sol Ring', 'graveyard', { seat: 2 });
  });
});
