// The agents and group 6 of the Hashaton deck (D-1170, D-1171, provisional; SYNTHETIC cards of the engine fixtures `synthetic-hashaton-g6.ts`): "As this creature
// enters, choose a card type" is a `chooseOption` decision of purpose `cardType` (CR 614.12a, 205.2a). Each agent is checked on real engine states: every answer is one
// the engine lists and accepts; the casual agent (which the heuristic agent defers to for this question) picks the card type most of the opponents' permanents have, a
// land not counted, and the creature type when there is nothing to count; it reads only what the view shows, so a card in the opponent's hand changes nothing.
import { CARD_TYPES } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { answer, expectLegal } from './casual-helpers';
import { askHeuristic } from './heuristic-helpers';

const LIBRARY = Array.from({ length: 10 }, () => 'Island');
const SERAPH = 'SYNTHETIC Warding Seraph';
const GOLEM = 'SYNTHETIC Brass Golem'; // artifact creature
const PINGER = 'SYNTHETIC Brass Pinger'; // artifact
const VANILLA = 'SYNTHETIC Vanilla 3/3'; // creature
const AURA = 'SYNTHETIC Might Aura'; // enchantment
const BLADE = 'SYNTHETIC Blade'; // artifact

const agents: readonly [string, () => { decide: CasualAgent['decide'] }][] = [
  ['random', () => new RandomLegalAgent({ seed: 3 })],
  ['casual', () => new CasualAgent({ seed: 3 })],
];

/** Seat 0 has cast the Seraph and it resolves: the question "choose a card type" is open. The opponent's side is `theirs`. */
function atQuestion(theirs: readonly string[], inHand: readonly string[] = []): ScenarioGame {
  const b = scenario()
    .seat(0)
    .hand(SERAPH)
    .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
    .library(...LIBRARY)
    .seat(1)
    .library(...LIBRARY);
  if (theirs.length > 0) b.battlefield(...theirs);
  if (inHand.length > 0) b.hand(...inHand);
  const g = b.at('precombatMain').build();
  g.act(0).cast(SERAPH, { pay: true });
  g.passAll();
  g.expect.pending('chooseOption', 0);
  return g;
}

describe('the question: choose a card type', () => {
  test.each(agents)('the %s agent answers with an action the engine lists', async (_n, make) => {
    const g = atQuestion([VANILLA]);
    const a = await answer(g, make());
    expectLegal(g, a);
    expect(a.kind === 'chooseOption' && CARD_TYPES.includes(a.option as never)).toBe(true);
  });

  test('the heuristic agent answers with an action the engine lists', async () => {
    const g = atQuestion([VANILLA]);
    const a = await askHeuristic(g, new HeuristicAgent({ seed: 1 }));
    expectLegal(g, a);
  });

  test('the casual agent picks the type most of the opponents permanents have', async () => {
    const creatures = atQuestion([VANILLA, VANILLA, PINGER]);
    expect(await answer(creatures)).toEqual({ kind: 'chooseOption', option: 'creature' });
    const artifacts = atQuestion([PINGER, BLADE, VANILLA]);
    expect(await answer(artifacts)).toEqual({ kind: 'chooseOption', option: 'artifact' });
  });

  test('an artifact creature counts for both of its types', async () => {
    // artifact 2, creature 3
    const g = atQuestion([GOLEM, GOLEM, VANILLA]);
    expect(await answer(g)).toEqual({ kind: 'chooseOption', option: 'creature' });
    // artifact 3, creature 2
    const h = atQuestion([GOLEM, GOLEM, PINGER]);
    expect(await answer(h)).toEqual({ kind: 'chooseOption', option: 'artifact' });
  });

  test('lands are not counted, and ties go to the type listed first', async () => {
    const lands = atQuestion(['Forest', 'Forest', 'Forest', 'Forest', VANILLA]);
    expect(await answer(lands)).toEqual({ kind: 'chooseOption', option: 'creature' });
    const tie = atQuestion([PINGER, VANILLA]);
    expect(await answer(tie)).toEqual({ kind: 'chooseOption', option: 'artifact' });
  });

  test('with nothing to count it chooses creature, and a hidden hand changes nothing', async () => {
    const empty = atQuestion([]);
    expect(await answer(empty)).toEqual({ kind: 'chooseOption', option: 'creature' });
    const hand = atQuestion([], [AURA, AURA, AURA]);
    expect(await answer(hand)).toEqual({ kind: 'chooseOption', option: 'creature' });
  });

  test('it only counts the opponents: my own permanents do not count', async () => {
    const g = scenario()
      .seat(0)
      .hand(SERAPH)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', PINGER, PINGER, PINGER)
      .library(...LIBRARY)
      .seat(1)
      .battlefield(VANILLA)
      .library(...LIBRARY)
      .at('precombatMain')
      .build();
    g.act(0).cast(SERAPH, { pay: true });
    g.passAll();
    expect(await answer(g)).toEqual({ kind: 'chooseOption', option: 'creature' });
  });
});
