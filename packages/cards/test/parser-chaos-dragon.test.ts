// Chaos Dragon: "At the beginning of combat on your turn, each player rolls a d20. If one or more opponents had the highest result, this creature can't attack those players or
// planeswalkers they control this combat." read through the whole pipeline (CR 706.2, 508.1a, 511.3). The engine runs the node in
// packages/engine/test/scenario-xx-roll-off-bar.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const line =
  "At the beginning of combat on your turn, each player rolls a d20. If one or more opponents had the highest result, ~ can't attack those players or planeswalkers they control this combat.";

describe('Chaos Dragon (CR 706.2, 508.1a)', () => {
  test('the real third line lowers to eachPlayerRollsBarHighest at the beginning of combat on your turn', () => {
    const abilities = readAll(
      `Flying, haste\n~ attacks each combat if able.\n${line}`,
      'creature',
    ).abilities;
    expect(abilities).toContainEqual({
      kind: 'triggered',
      trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
      effect: { kind: 'eachPlayerRollsBarHighest', sides: 20, creature: { kind: 'this' } },
    });
  });

  test.each([
    [line.replace('this combat', 'this turn')],
    [line.replace(' If one or more opponents had the highest result, ~ can', ' ~ can')],
    [line.replace('a d20', 'a die')],
    [line.replace('each player rolls', 'each opponent rolls')],
    [line.replace('~ can', 'target creature can')],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature').stoppedAt).toBeDefined();
  });
});
