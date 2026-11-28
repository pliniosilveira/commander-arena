// The Peace Offering deck, group H: the words the board shows for the triggers of Tenuous Truce (CR 303.4m, 508.1b, 508.6, 603.2b).
import { describe, expect, test } from 'vitest';
import { triggerWording } from '../src/game/trigger-text';

describe('Tenuous Truce words', () => {
  const ctx = { self: 'this Aura' };

  test("the enchanted player's end step", () => {
    expect(triggerWording({ kind: 'step', step: 'endStep', whose: 'enchantedPlayer' }, ctx)).toBe(
      "At the beginning of enchanted player's end step",
    );
  });

  test('you attacking the enchanted player or their planeswalker', () => {
    expect(
      triggerWording(
        {
          kind: 'attackBatch',
          who: 'you',
          atLeast: 1,
          attackedEnchantedPlayerOrPlaneswalkers: true,
        },
        ctx,
      ),
    ).toBe('Whenever you attack enchanted player or a planeswalker they control');
  });

  test('the enchanted player attacking you or your planeswalker', () => {
    expect(
      triggerWording(
        {
          kind: 'attackBatch',
          who: 'any',
          atLeast: 1,
          byEnchantedPlayer: true,
          attackedYouOrPlaneswalkers: true,
        },
        ctx,
      ),
    ).toBe('Whenever enchanted player attacks you or a planeswalker you control');
  });
});
