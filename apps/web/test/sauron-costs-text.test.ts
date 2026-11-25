/**
 * The words of the Sauron cost group as pure models, no DOM: "Sacrifice ~ and a legendary artifact" (Mount Doom, CR 701.21a, 602.2b) and "Ward—Sacrifice a legendary artifact or legendary
 * creature." (CR 702.21a) in the question the payer is asked.
 */
import type { Cost } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { activationCostText } from '../src/game/cost-text';
import { wardPrompt } from '../src/ui/decisions/optional';

const DOOM: Cost = {
  kind: 'sacrifice',
  what: { kind: 'this' },
  alongside: [{ types: ['artifact'], supertypes: ['legendary'] }],
};

const WARD: Cost = {
  kind: 'sacrifice',
  what: {
    anyOf: [
      { types: ['artifact'], supertypes: ['legendary'] },
      { types: ['creature'], supertypes: ['legendary'] },
    ],
  },
};

describe('a cost that sacrifices the permanent itself and another one', () => {
  test('names the source first and then the other part', () => {
    const text = activationCostText([DOOM]);
    expect(text).toMatch(/^Sacrifice this and an? .*artifact/i);
    expect(text).not.toMatch(/undefined/);
  });
});

describe('the question of Ward—Sacrifice', () => {
  test('names what is sacrificed and what is countered if the payer declines', () => {
    const prompt = wardPrompt([WARD], 'Lightning Bolt');
    expect(prompt).toBe(
      'Sacrifice a legendary artifact or legendary creature or Lightning Bolt is countered?',
    );
    expect(prompt).toMatch(/Lightning Bolt is countered/);
    expect(prompt).not.toMatch(/undefined/);
  });
});
