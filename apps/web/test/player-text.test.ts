import { describe, expect, test } from 'vitest';
import { playerSubject, subjectVerb } from '../src/game/player-text';

describe('declined-player wording', () => {
  const declinedPlayer = { kind: 'declinedPlayer' } as const;

  test('names the player who declined in the otherwise effect', () => {
    expect(playerSubject(declinedPlayer)).toEqual({ text: 'the player who declined', base: false });
    expect(subjectVerb(declinedPlayer, 'lose')).toBe('The player who declined loses');
  });
});
