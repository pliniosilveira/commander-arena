// CasualAgent answers "As this enchantment enters, choose a planeswalker type" (CR 614.12a, 205.3j): the type of the planeswalkers it controls (then those in its
// hand or command zone), the first option when it has none. Every answer is one the engine lists and accepts.
import { applyAction, type ChooseOptionDecision } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent } from '../src/index';
import { CTX } from './helpers';

const WARD = 'SYNTHETIC Walker Ward';
const DACK = 'SYNTHETIC Dack Walker';
const AJANI = 'SYNTHETIC Ajani Walker';

function atQuestion(
  setup: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>,
): ScenarioGame {
  const base = scenario().seat(0).hand(WARD).battlefield('Plains', 'Plains', 'Plains', 'Plains');
  const g = setup(base).seat(1).build();
  g.act(0).cast(WARD, { pay: true });
  g.passAll();
  g.expect.pending('chooseOption', 0);
  return g;
}

async function answer(g: ScenarioGame): Promise<string> {
  const view = g.view(0);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  const action = await new CasualAgent({ seed: 1 }).decide(view, view.pending, CTX);
  if (action.kind !== 'chooseOption') throw new Error(`expected chooseOption, got ${action.kind}`);
  const d = g.state.pending as ChooseOptionDecision;
  expect(d.options).toContain(action.option);
  expect(applyAction(g.state, 0, action).ok).toBe(true);
  return action.option;
}

describe('the planeswalker type CasualAgent chooses', () => {
  test('the type of the planeswalker it controls', async () => {
    expect(await answer(atQuestion((b) => b.battlefield(DACK)))).toBe('Dack');
    expect(await answer(atQuestion((b) => b.battlefield(AJANI)))).toBe('Ajani');
  });

  test('the type it controls more of', async () => {
    const g = atQuestion((b) => b.battlefield(DACK, DACK, AJANI));
    expect(await answer(g)).toBe('Dack');
  });

  test('the type of a planeswalker in its hand when it controls none', async () => {
    expect(await answer(atQuestion((b) => b.hand(DACK)))).toBe('Dack');
  });

  test('the first option with nothing to count', async () => {
    const g = atQuestion((b) => b);
    const d = g.state.pending as ChooseOptionDecision;
    expect(await answer(g)).toBe(d.options[0]);
  });
});
