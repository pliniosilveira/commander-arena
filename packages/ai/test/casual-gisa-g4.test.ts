// CasualAgent and the one-turn reanimation of the Gisa deck (D-459, Whip of Erebos), on real engine states built with the scenario DSL. The Whip returns a creature card from the
// graveyard with haste and exiles it at the end step, so it is activated as Unearth is (`wantsUnearth`): in the first main phase, when the creature would attack safely or for the win,
// and never otherwise. Every action the agent sends is one the engine lists.
import type { Action } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent } from '../src/index';
import { CTX } from './helpers';

const WHIP = 'SYNTHETIC Grave Whip';

async function answer(g: ScenarioGame): Promise<Action> {
  const decision = g.state.pending;
  if (decision === null) throw new Error('nothing is pending');
  const view = g.view(decision.seat);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  const action = await new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX);
  expect(JSON.stringify(g.legalActions(decision.seat))).toContain(JSON.stringify(action));
  return action;
}

const board = (
  opposing: readonly string[],
  step: 'precombatMain' | 'postcombatMain' = 'precombatMain',
) => {
  const b = scenario()
    .seat(0)
    .battlefield(WHIP)
    .battlefield('Swamp', { count: 4 })
    .graveyard('Serra Angel')
    .seat(1);
  for (const name of opposing) b.battlefield(name);
  return b.at(step, { active: 0 }).build();
};

describe('the reanimation of the Whip', () => {
  test('nothing can block the creature: the Whip is activated in the first main phase', async () => {
    const g = board([]);
    const action = await answer(g);
    expect(action).toMatchObject({ kind: 'activate', object: g.id(WHIP) });
  });

  test('a blocker that could not kill the creature leaves it worth the mana; one that could does not', async () => {
    // The Angel is 4/4: a 3/3 cannot kill it. A 2/4 blocks a 2/2 and survives (the Bears would not attack safely).
    const weak = board(['SYNTHETIC Vanilla 3/3']);
    expect(await answer(weak)).toMatchObject({ kind: 'activate' });
    const safe = scenario()
      .seat(0)
      .battlefield(WHIP)
      .battlefield('Swamp', { count: 4 })
      .graveyard('Grizzly Bears')
      .seat(1)
      .battlefield('Giant Spider')
      .at('precombatMain', { active: 0 })
      .build();
    expect(await answer(safe)).toEqual({ kind: 'pass' });
  });

  test('after combat it is never worth it: the creature would only be exiled at the end step', async () => {
    const g = board([], 'postcombatMain');
    expect(await answer(g)).toEqual({ kind: 'pass' });
  });

  test('no creature card in the graveyard: nothing to do', async () => {
    const g = scenario()
      .seat(0)
      .battlefield(WHIP)
      .battlefield('Swamp', { count: 4 })
      .graveyard('Lightning Bolt')
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    expect(await answer(g)).toEqual({ kind: 'pass' });
  });
});
