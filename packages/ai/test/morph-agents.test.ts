// The agents and Morph (CR 702.37): a card that cannot be cast for its mana cost is cast face down for {3} when that can be paid; with the ordinary cast on offer the
// card is cast as itself; every agent answers legally. Cards are SYNTHETIC (the engine's synthetic-morph.ts).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { GreedyAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { answer, expectLegal } from './casual-helpers';

const BEAR = 'SYNTHETIC Morph Bear'; // {2}{G}{G} 4/4, morph {1}{G}
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
type Builder = ReturnType<typeof scenario>;

function main(place: (b: Builder) => Builder) {
  return place(scenario().seat(0).life(20))
    .library(...FILLER)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
}

describe('casting a card face down', () => {
  test('the Casual agent casts it face down when it cannot pay the mana cost but can pay {3}', async () => {
    const g = main((b) => b.seat(0).hand(BEAR).battlefield('Forest', { count: 3 }).seat(0));
    const action = await answer(g);
    expect(action).toMatchObject({ kind: 'castSpell', alternative: 'morph' });
    expectLegal(g, action);
  });

  test('it casts the card as itself when it can pay the mana cost', async () => {
    const g = main((b) => b.seat(0).hand(BEAR).battlefield('Forest', { count: 4 }).seat(0));
    const action = await answer(g);
    expect(action.kind).toBe('castSpell');
    expect((action as { alternative?: string }).alternative).toBeUndefined();
  });

  test('every agent answers legally with the option on the table', async () => {
    const g = main((b) => b.seat(0).hand(BEAR).battlefield('Forest', { count: 3 }).seat(0));
    for (const agent of [
      new GreedyAgent({ seed: 3 }),
      new RandomLegalAgent({ seed: 4 }),
      new HeuristicAgent({ seed: 5 }),
    ]) {
      expectLegal(g, await answer(g, agent));
    }
  });
});
