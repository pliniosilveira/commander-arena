// Territorial Hellkite: "At the beginning of combat on your turn, choose an opponent at random that this creature didn't attack during your last combat. This creature attacks that player this
// combat if able. If you can't choose an opponent this way, tap this creature." read through the whole pipeline (CR 508.1d, 506.1, 701.26a). The engine runs the node in
// packages/engine/test/scenario-xx-attack-random-opponent.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const line =
  "At the beginning of combat on your turn, choose an opponent at random that ~ didn't attack during your last combat. ~ attacks that player this combat if able. If you can't choose an opponent this way, tap ~.";

describe('Territorial Hellkite (CR 508.1d, 701.26a)', () => {
  test('the real second line lowers to attackRandomOpponent at the beginning of combat on your turn', () => {
    const abilities = readAll(`Flying, haste\n${line}`, 'creature').abilities;
    expect(abilities[2]).toEqual({
      kind: 'triggered',
      trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
      effect: { kind: 'attackRandomOpponent', creature: { kind: 'this' } },
    });
  });

  test.each([
    [line.replace('this combat', 'this turn')],
    [line.replace('tap ~', 'sacrifice ~')],
    [line.replace(" If you can't choose an opponent this way, tap ~.", '')],
    [line.replace('opponent at random', 'player at random')],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature').stoppedAt).toBeDefined();
  });
});
