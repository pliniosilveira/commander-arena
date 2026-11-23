// CasualAgent and Dredge (CR 702.52a, issue 102): "mill N cards instead of drawing and return this card" is taken only while the library is deep enough that milling it is no danger.
import type { ConfirmOptionalDecision, GameView } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { confirmOptional } from '../src/casual-permanents';

const viewWith = (libraryCount: number): GameView =>
  ({ viewer: 0, seats: [{ id: 0, libraryCount }] }) as unknown as GameView;
const dredge = (text: string): ConfirmOptionalDecision =>
  ({
    kind: 'confirmOptional',
    seat: 0,
    purpose: 'dredge',
    sourceOracleText: text,
  }) as unknown as ConfirmOptionalDecision;

describe('the agent and Dredge', () => {
  test('a deep library: it dredges', () => {
    expect(confirmOptional(dredge('Dredge 3'), viewWith(40))).toEqual({ kind: 'acceptOptional' });
  });

  test('a library that the mill would leave with 12 cards or fewer: it draws instead', () => {
    expect(confirmOptional(dredge('Dredge 3'), viewWith(15))).toEqual({ kind: 'declineOptional' });
    expect(confirmOptional(dredge('Dredge 6'), viewWith(18))).toEqual({ kind: 'declineOptional' });
  });
});
