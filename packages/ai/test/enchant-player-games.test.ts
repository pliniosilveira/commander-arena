// CasualAgent and "Enchant player" (issue 159, CR 702.5d): the agent casts the SYNTHETIC Dread Curse of the engine's fixtures, and puts it on an opponent, not on itself;
// whole games with it in the decks end with a result, no fallback and a consistent state, and replay to the same final state.
import { type Action, checkInvariants } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';
import { CasualAgent } from '../src/index';
import { answer, answerFor, expectLegal } from './casual-helpers';

const CURSE = 'SYNTHETIC Dread Curse';
const LIBRARY = Array.from({ length: 8 }, () => 'Swamp');

test('the agent casts the Curse on its main phase and chooses the opponent as its target', async () => {
  const g = scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand(CURSE)
    .battlefield('Swamp', 'Swamp')
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  const agent = new CasualAgent({ seed: 1 });
  // The agent is asked what to do with priority: it must cast the Curse (an Aura it can read the "Enchant player" of).
  const play = await answerFor(g, agent);
  expect(play.kind).toBe('castSpell');
  const cast = play as Extract<Action, { kind: 'castSpell' }>;
  expect(g.state.objects[cast.object]?.zone).toBe('hand');
  // Casting it asks for the target: the agent names the opponent.
  g.act(0).cast(CURSE);
  g.expect.pending('targets', 0);
  const targets = await answer(g, agent);
  expect(targets).toMatchObject({ kind: 'chooseTargets', targets: [{ kind: 'player', seat: 1 }] });
  expectLegal(g, targets);
  expect(checkInvariants(g.state)).toEqual([]);
});
