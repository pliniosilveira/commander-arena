/** The web wording of Hithlain Rope's two new primitives (pure models, no DOM): "the player to your right" and "can't be sacrificed". */
import { expect, test } from 'vitest';
import { playerSubject, subjectVerb } from '../src/game/player-text';
import { lordWording } from '../src/game/static-text';

test('the player to your right is a third-person subject', () => {
  expect(playerSubject({ kind: 'playerToYourRight' })).toEqual({
    text: 'the player to your right',
    base: false,
  });
  expect(subjectVerb({ kind: 'playerToYourRight' }, 'gain')).toBe('The player to your right gains');
});

test('a permanent that can not be sacrificed says so', () => {
  expect(lordWording({ kind: 'cantBeSacrificed' }, { noun: 'artifact' })).toBe(
    "This artifact can't be sacrificed",
  );
});
