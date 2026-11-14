/**
 * The keyword line Gift (stage P30; D-135, CR 702.174): "Gift a card". The line says only what is given; the question as the spell is
 * cast (promise an opponent a gift or not, CR 702.174a), the card the chosen opponent draws and the intervening "if" of the permanent
 * are the engine's. The reminder text in parentheses is dropped before the line is read. "Gift a card" is the one gift the engine
 * runs; "Gift a Food", "Gift a tapped Fish" and "Gift an extra turn" are other gifts (CR 702.174d, 702.174f to 702.174i) and are not read.
 */
import { map, pattern } from '../../combinators';
import type { IrKeyword } from '../../ir/types';
import { defineRule, node } from '../registry';

/**
 * `keyword.gift`: "Gift a card" (CR 702.174a: "As you cast this spell, you may promise an opponent a gift. If you do, ..."; CR 702.174e:
 * for a gift of a card, the chosen player draws a card, as the permanent enters or, for an instant or a sorcery, before its other
 * effects as it resolves, CR 702.174b and 702.174j). No parameter in the grammar: the gift is a card.
 */
export const KEYWORD_GIFT = defineRule<readonly IrKeyword[]>({
  id: 'keyword.gift',
  family: 'keyword',
  leading: ['gift'],
  cites: ['CR 702.174a (Gift)', 'CR 702.174e (Gift)', 'CR 702.174j (Gift)'],
  examples: ['Gift a card', 'gift a card'],
  rejects: [
    'Gift',
    'Gift a Food',
    'Gift a Treasure',
    'Gift a tapped Fish',
    'Gift an extra turn',
    'Gift a card.',
    'Gift two cards',
    'Gift a card, flying',
    'Flying, gift a card',
    'Gifted a card',
    'Gift a cards',
  ],
  parse: map(
    node<RegExpExecArray, IrKeyword>(
      'keyword.gift',
      pattern(/gift a card(?![\p{L}\p{N}])/iu),
      () => ({ kind: 'keyword', name: 'gift', params: [] }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

export const GIFT_KEYWORD_RULES = [KEYWORD_GIFT];
