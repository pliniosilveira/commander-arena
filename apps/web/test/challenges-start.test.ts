// The Challenges flow: the player's deck comes from the precons, the opponent from the challenge
// list; a refused challenge says why. The decks are SYNTHETIC (invented "Synthetic ..." cards).
import { expect, test } from 'vitest';
import { startChallengeOptions } from '../src/precons';
import { playableSnapshot, preconsOf, unsupportedSnapshot } from './precons-helpers';

test("a challenge starts against the challenge deck with the player's precon", async () => {
  const precons = preconsOf([await playableSnapshot('synthetic-mine')]);
  const challenges = preconsOf([await playableSnapshot('synthetic-challenge')]);
  const result = await startChallengeOptions(precons, challenges, {
    seed: 7,
    humanDeck: 'synthetic-mine',
    challenge: 'synthetic-challenge',
  });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.options).toMatchObject({
      seed: 7,
      humanDeck: 'synthetic-mine',
      aiDeck: 'synthetic-challenge',
    });
    expect(result.options.humanCards).toBeDefined();
    expect(result.options.aiCards).toBeDefined();
  }
});

test('a challenge that is not playable, or unknown, is refused with a reason', async () => {
  const precons = preconsOf([await playableSnapshot('synthetic-mine')]);
  const challenges = preconsOf([await unsupportedSnapshot('synthetic-bad')]);
  for (const challenge of ['synthetic-bad', 'nope']) {
    const result = await startChallengeOptions(precons, challenges, {
      seed: 1,
      humanDeck: 'synthetic-mine',
      challenge,
    });
    expect(result.ok).toBe(false);
  }
});
