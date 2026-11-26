// CasualAgent and the search that may put its card onto the battlefield (CR 608.2d, 701.23; Scholar of New Horizons): the card is free and a permanent in play beats a card in hand, so it
// puts it onto the battlefield.
import type { ConfirmOptionalDecision, GameView } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { confirmOptional } from '../src/casual-permanents';

describe('the agent and "you may put that card onto the battlefield"', () => {
  test('it puts the card found onto the battlefield', () => {
    const decision = {
      kind: 'confirmOptional',
      seat: 0,
      purpose: 'searchPut',
      sourceOracleText: '',
    } as unknown as ConfirmOptionalDecision;
    const view = { viewer: 0, seats: [{ id: 0 }] } as unknown as GameView;
    expect(confirmOptional(decision, view)).toEqual({ kind: 'acceptOptional' });
  });
});
