// "Whenever you put one or more +1/+1 counters on a creature, you may gain that much life. Do this only once each turn." (CR 122.6, 603.2h):
// "that much" is the counters this instance of putting put on, the engine's `triggerDamage`. The card is SYNTHETIC (named so).
import { validateCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const TEXT =
  'Whenever you put one or more +1/+1 counters on a creature, you may gain that much life. Do this only once each turn.';

describe('counters put on a creature, "gain that much life"', () => {
  const card = parsed('SYNTHETIC Counter Healer', 'Creature — Human', TEXT, {
    manaCost: '{2}{W}',
    power: '1',
    toughness: '1',
  });

  test('reads as an optional once-each-turn trigger gaining the counters put on', () => {
    expect(card.faces[0]?.abilities.find((a) => a.kind === 'triggered')).toMatchObject({
      trigger: { kind: 'countersAdded', counter: '+1/+1', by: 'you' },
      optional: true,
      doOnlyOnceEachTurn: true,
      effect: { kind: 'gainLife', amount: { kind: 'triggerDamage' } },
    });
    expect(validateCard(card)).toEqual([]);
  });
});
