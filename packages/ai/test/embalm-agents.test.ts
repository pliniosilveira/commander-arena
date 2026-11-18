// The agents and Embalm (CR 702.128a, issue 104; SYNTHETIC cards of the engine fixtures `synthetic-embalm.ts`): Embalm is an `activate` option from the graveyard like Eternalize, and
// every answer an agent gives is one the engine lists; the casual agent embalms a creature card of its own in its main phase.
import { getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { answerFor, expectLegal } from './casual-helpers';
import { askHeuristic } from './heuristic-helpers';

const LIBRARY = Array.from({ length: 10 }, () => 'Plains');
const SCRIBE = 'SYNTHETIC Embalmed Scribe'; // {1}{U} 2/1, Embalm {1}{U}

const agents: readonly [string, () => { decide: CasualAgent['decide'] }][] = [
  ['random', () => new RandomLegalAgent({ seed: 3 })],
  ['casual', () => new CasualAgent({ seed: 3 })],
];

/** The creature card is in the graveyard with two Islands to pay for Embalm, in my first main phase. */
function atMain(graveyard: string, step: 'precombatMain' | 'beginningOfCombat' = 'precombatMain') {
  return scenario()
    .seat(0)
    .graveyard(graveyard)
    .battlefield('Island', 'Island')
    .library(...LIBRARY)
    .seat(1)
    .library(...LIBRARY)
    .at(step)
    .build();
}

describe('Embalm: an option from the graveyard', () => {
  test.each(agents)('the %s agent answers with an action the engine lists', async (_n, make) => {
    const g: ScenarioGame = atMain(SCRIBE);
    expectLegal(g, await answerFor(g, make() as CasualAgent));
  });

  test('the heuristic agent answers with an action the engine lists', async () => {
    const g = atMain(SCRIBE);
    expectLegal(g, await askHeuristic(g, new HeuristicAgent({ seed: 1 })));
  });

  test('the option is listed from the graveyard with the mana', () => {
    expect(getLegalActions(atMain(SCRIBE).state, 0).map((a) => a.kind)).toContain('activate');
  });

  test('the casual agent embalms a creature card of its own in its main phase', async () => {
    const g = atMain(SCRIBE);
    expect(await answerFor(g, new CasualAgent({ seed: 3 }))).toMatchObject({
      kind: 'activate',
      object: g.id({ name: SCRIBE, zone: 'graveyard' }),
    });
  });

  test('not in combat (the engine lists it only at sorcery speed)', () => {
    const kinds = getLegalActions(atMain(SCRIBE, 'beginningOfCombat').state, 0).map((a) => a.kind);
    expect(kinds).not.toContain('activate');
  });
});
