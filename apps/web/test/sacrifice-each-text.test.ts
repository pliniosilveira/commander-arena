/**
 * The words of "Sacrifice a Swamp and a Forest" (CR 701.21a): a sacrifice cost of several different permanents, as pure models. No DOM.
 */
import type { Cost } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { activationCostText, sacrificeParts } from '../src/game/cost-text';

const BOTH: Extract<Cost, { kind: 'sacrifice' }> = {
  kind: 'sacrifice',
  what: { subtypes: ['Swamp'] },
  alongside: [{ subtypes: ['Forest'] }],
};

describe('a cost that sacrifices a different permanent for each part', () => {
  test('is worded part by part (the filter names no card type, so the words say permanent)', () => {
    expect(sacrificeParts(BOTH)).toBe('a Swamp permanent and a Forest permanent');
    expect(activationCostText([BOTH])).toBe('Sacrifice a Swamp permanent and a Forest permanent');
  });

  test('three parts, with an article that agrees', () => {
    expect(
      sacrificeParts({
        kind: 'sacrifice',
        what: { types: ['creature'] },
        alongside: [{ types: ['artifact'] }, { types: ['land'] }],
      }),
    ).toBe('a creature and an artifact and a land');
  });
});
