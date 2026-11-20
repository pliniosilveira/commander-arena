// CasualAgent answers "As this artifact enters, pay any amount of life" (`purpose` 'lifePaid', CR 119.4, 614.12) with an amount the engine lists and accepts: a quarter of
// its life total, never leaving it below 15 (and 0 when it is already there). RandomLegalAgent answers with some legal amount. The card is a SYNTHETIC probe built here.
import {
  type Action,
  applyAction,
  type CardDefinition,
  getLegalActions,
  syntheticCard,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

/** The engine's synthetic Siege (an enchantment that chooses as it enters) with its text replaced by "pay any amount of life". */
function press(): CardDefinition {
  const siege = syntheticCard('SYNTHETIC Siege of Choices');
  const face = siege.faces[0];
  if (face === undefined) throw new Error('no face');
  return {
    ...siege,
    name: 'SYNTHETIC Life Press',
    faces: [
      {
        ...face,
        name: 'SYNTHETIC Life Press',
        manaCost: ['1'],
        types: ['artifact'],
        colors: [],
        oracleText: 'As this artifact enters, pay any amount of life.',
        abilities: [
          { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'lifePaid' } },
        ],
      },
    ],
  } as CardDefinition;
}

const PRESS = press();

const LIBRARY = Array.from({ length: 8 }, () => 'Forest');

function asked(life: number): ScenarioGame {
  const g = scenario()
    .define(PRESS)
    .seat(0)
    .life(life)
    .library(...LIBRARY)
    .hand(PRESS.name)
    .battlefield('Forest')
    .seat(1)
    .library(...LIBRARY)
    .build();
  g.act(0).cast(PRESS.name, { pay: true });
  g.passAll();
  return g;
}

async function decide(g: ScenarioGame, agent: CasualAgent | RandomLegalAgent): Promise<Action> {
  const view = g.view(0);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  return agent.decide(view, view.pending, CTX);
}

function expectLegal(g: ScenarioGame, action: Action) {
  expect(
    getLegalActions(g.state, 0).some((a) => JSON.stringify(a) === JSON.stringify(action)),
  ).toBe(true);
  expect(applyAction(g.state, 0, action).ok).toBe(true);
}

describe('pay any amount of life', () => {
  test.each([
    [40, '10'],
    [20, '5'],
    [18, '3'],
    [16, '1'],
    [15, '0'],
    [8, '0'],
    [1, '0'],
  ])('the casual agent at %i life pays %s', async (life, paid) => {
    const g = asked(life);
    g.expect.pending('chooseOption', 0);
    const a = await decide(g, new CasualAgent({ seed: 1 }));
    expect(a).toEqual({ kind: 'chooseOption', option: paid });
    expectLegal(g, a);
  });

  test('the random agent answers with a legal amount', async () => {
    const g = asked(12);
    for (let seed = 1; seed <= 5; seed++) {
      expectLegal(g, await decide(g, new RandomLegalAgent({ seed })));
    }
  });
});
