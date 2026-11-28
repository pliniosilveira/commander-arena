// The Peace Offering deck (issue 112), group F: the words of the look at the top card whose land may only be revealed (Fisher's Talent, CR 701.20a, 701.20b): the card stays
// on top of the library, so the buttons say "Reveal", never "Put into hand".
import type { ObjectId } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { confirmLabel, foundBadge } from '../src/ui/decisions/cards-picker';

const decision = { purpose: 'lookTake', max: 1, min: 0 } as const;
const card = 'o1' as ObjectId;

describe('a card that is only revealed', () => {
  test('the confirm button reveals it, or declines', () => {
    expect(confirmLabel(decision, [card], 'reveal')).toBe('Reveal');
    expect(confirmLabel(decision, [], 'reveal')).toBe("Don't reveal");
  });

  test('the card chosen carries a Reveal badge', () => {
    expect(foundBadge(decision, [card], card, 'reveal')).toBe('Reveal');
  });
});
