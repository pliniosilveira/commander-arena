// "Flip a coin" and "whenever you win a coin flip" (Setzer, Wandering Gambler; CR 705.2) through the whole pipeline, the near misses the grammar must not read, and the features the
// lowering needs. The engine runs the same nodes in packages/engine/test/scenario-coin-flip.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { read, readAll, withoutFeature } from './parser-p5-helpers';

const FLIP = 'Whenever ~ deals combat damage to a player, flip a coin.';
const WIN = 'Whenever you win a coin flip, you gain 3 life.';

describe('flip a coin', () => {
  test('the controller calls heads or tails: a choice of one flip for each call', () => {
    const [ability] = readAll(FLIP, 'creature', ['Human']).abilities;
    expect(ability?.kind).toBe('triggered');
    if (ability?.kind !== 'triggered') return;
    expect(ability.effect).toEqual({
      kind: 'chooseOne',
      options: [
        { label: 'Heads', effect: { kind: 'coinFlip', call: 'heads' } },
        { label: 'Tails', effect: { kind: 'coinFlip', call: 'tails' } },
      ],
    });
  });

  test.each([
    FLIP.replace('flip a coin', 'flip two coins'),
    FLIP.replace('flip a coin', 'flip a coin until you lose a flip'),
    FLIP.replace('flip a coin', 'flip a coin and draw a card'),
    FLIP.replace('flip a coin', 'target opponent flips a coin'),
    FLIP.replace('flip a coin', 'each player flips a coin'),
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(read(text, 'creature').unparsed.length).toBeGreaterThan(0);
  });

  test.each(['effect:coinFlip', 'effect:chooseOne'] as const)(
    'without %s in the engine the ability is not read',
    (feature) => {
      expect(withoutFeature(feature, FLIP, 'creature', ['Human']).reason).toBeDefined();
    },
  );
});

describe('whenever you win a coin flip', () => {
  test('a trigger of the player who wins, relative to the controller', () => {
    const [mine] = readAll(WIN, 'creature', ['Human']).abilities;
    expect(mine?.kind === 'triggered' && mine.trigger).toEqual({
      kind: 'winsCoinFlip',
      who: 'you',
    });
    const [theirs] = readAll(
      'Whenever an opponent wins a coin flip, you gain 3 life.',
      'creature',
      ['Human'],
    ).abilities;
    expect(theirs?.kind === 'triggered' && theirs.trigger).toEqual({
      kind: 'winsCoinFlip',
      who: 'opponent',
    });
  });

  test.each([
    WIN.replace('win a coin flip', 'lose a coin flip'),
    WIN.replace('win a coin flip', 'won a coin flip'),
    WIN.replace('win a coin flip', 'win the coin flip'),
    WIN.replace('win a coin flip', 'win two coin flips'),
    WIN.replace('you win', 'each opponent wins'),
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(read(text, 'creature').unparsed.length).toBeGreaterThan(0);
  });

  test('without trigger:winsCoinFlip in the engine the ability is not read', () => {
    expect(withoutFeature('trigger:winsCoinFlip', WIN, 'creature', ['Human']).reason).toBeDefined();
  });
});
