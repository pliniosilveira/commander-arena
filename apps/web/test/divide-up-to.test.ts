/** An "up to" division (CR 601.2d: "distribute up to that many ... among any number of other target creatures") as pure models: fewer than the total is complete. */
import type { ChosenTarget, TargetChoiceSpec } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { divisionComplete, divisionHint, divisionLine } from '../src/ui/decisions/divide';

const spec = (upTo: boolean): TargetChoiceSpec =>
  ({
    specId: 't1',
    min: 0,
    max: 3,
    divide: 3,
    ...(upTo ? { divideUpTo: true } : {}),
    legal: [],
  }) as unknown as TargetChoiceSpec;
const pick = (id: number, share: number): ChosenTarget => ({
  kind: 'object',
  id: `o${id}`,
  specId: 't1',
  share,
});

describe('an up to division', () => {
  test('giving out less than the total is complete, with no hint', () => {
    expect(divisionComplete([spec(true)], [pick(1, 1)])).toBe(true);
    expect(divisionHint([spec(true)], [pick(1, 1)])).toBeNull();
    expect(divisionComplete([spec(true)], [])).toBe(true);
  });

  test('more than the total is not complete', () => {
    expect(divisionComplete([spec(true)], [pick(1, 2), pick(2, 2)])).toBe(false);
  });

  test('an exact division still needs all of it', () => {
    expect(divisionComplete([spec(false)], [pick(1, 1)])).toBe(false);
    expect(divisionHint([spec(false)], [pick(1, 1)])).toBe('2 damage left to assign');
  });

  test('the line says how much is not yet given', () => {
    expect(divisionLine(3, 2, true)).toBe('Up to 3 to divide: 2 not yet given.');
  });
});
