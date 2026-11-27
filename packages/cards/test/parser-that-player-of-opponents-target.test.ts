// "Destroy target creature an opponent controls. That player loses 3 life." (Suspended Sentence; CR 109.4, 608.2h): the text names no player but "an opponent" who controls the target, so
// "that player" is the controller of that target, as "its controller" is. The engine reads the controller of the destroyed creature as it last was. The lines are the real card's.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const TARGET = { kind: 'target', id: 't1' };

describe('"that player" after a target an opponent controls', () => {
  test('it is the controller of the target', () => {
    const parsed = readAll(
      'Destroy target creature an opponent controls. That player loses 3 life.',
      'instant',
    );
    expect(parsed.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'destroy', objects: TARGET },
        { kind: 'loseLife', player: { kind: 'controllerOf', of: TARGET }, amount: 3 },
      ],
    });
  });

  test('with no opponent in the target, "that player" is still unbound (it names no one)', () => {
    expect(dropped('Destroy target creature. That player loses 3 life.', 'instant')).toMatchObject({
      reason: 'unboundReference',
    });
  });
});
