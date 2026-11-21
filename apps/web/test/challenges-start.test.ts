// The Challenges flow: the player's deck comes from the precons, the opponent from the challenge
// list; a refused challenge says why. The decks are SYNTHETIC (invented "Synthetic ..." cards).
import { expect, test } from 'vitest';
import { CHALLENGES, startChallengeOptions } from '../src/precons';
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

test('every shipped challenge is a valid, fully supported deck', async () => {
  const challenges = preconsOf(CHALLENGES.snapshots);
  expect(CHALLENGES.problems).toEqual([]);
  for (const info of challenges.list) {
    const result = await challenges.prepare(info.id);
    expect(result.ok, result.ok ? '' : result.reason).toBe(true);
  }
});

test('Hard gives the opponent its emblems; Easy gives none', async () => {
  const precons = preconsOf([await playableSnapshot('synthetic-mine')]);
  const challenges = preconsOf(CHALLENGES.snapshots);
  const base = { seed: 1, humanDeck: 'synthetic-mine', challenge: 'witch-king-of-angmar' };
  const hard = await startChallengeOptions(precons, challenges, { ...base, level: 'hard' });
  expect(hard.ok).toBe(true);
  if (hard.ok) expect(hard.options.aiEmblems?.length).toBe(2);
  const easy = await startChallengeOptions(precons, challenges, base);
  expect(easy.ok && easy.options.aiEmblems === undefined).toBe(true);
});

test('Hard refuses a challenge that has no emblems', async () => {
  const precons = preconsOf([await playableSnapshot('synthetic-mine')]);
  const challenges = preconsOf([await playableSnapshot('synthetic-challenge')]);
  const result = await startChallengeOptions(precons, challenges, {
    seed: 1,
    humanDeck: 'synthetic-mine',
    challenge: 'synthetic-challenge',
    level: 'hard',
  });
  expect(result.ok).toBe(false);
});

test('a Hard game against the real Witch-king deck starts with its emblems in the AI command zone', async () => {
  const { GameHost } = await import('../src/game/host');
  const precons = preconsOf([await playableSnapshot('synthetic-mine')]);
  const challenges = preconsOf(CHALLENGES.snapshots);
  const result = await startChallengeOptions(precons, challenges, {
    seed: 1,
    humanDeck: 'synthetic-mine',
    challenge: 'witch-king-of-angmar',
    level: 'hard',
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const host = new GameHost({ clock: () => 0 });
  const { snapshot } = await host.newGame(result.options);
  const aiCommand = snapshot.view.seats[1]?.command.filter((o) => o.name === 'Emblem') ?? [];
  expect(aiCommand.map((o) => o.oracleText)).toEqual([
    expect.stringContaining('first upkeep'),
    expect.stringContaining('named Nazgûl'),
  ]);
});
