// The question of a search that may put its card onto the battlefield (CR 608.2d, 701.23; Scholar of New Horizons): its words and buttons.
import type { ConfirmOptionalDecision } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { optionalAsk } from '../src/ui/decisions/optional';
import { lookupIndexFor } from './decisions-helpers';

describe('the searchPut question', () => {
  test('it says what happens either way, and has no cancel', () => {
    const decision: ConfirmOptionalDecision = {
      id: 'd1',
      seat: 0,
      kind: 'confirmOptional',
      source: 'o1',
      sourceName: 'Scholar of New Horizons',
      sourceOracleText: '',
      purpose: 'searchPut',
    };
    const ask = optionalAsk(decision, lookupIndexFor([]));
    expect(ask.prompt).toBe(
      "Scholar of New Horizons: put the card onto the battlefield? If you don't, it goes into your hand.",
    );
    expect([ask.yes, ask.no, ask.cancellable]).toEqual([
      'Put it onto the battlefield',
      'Put it into my hand',
      false,
    ]);
  });
});
