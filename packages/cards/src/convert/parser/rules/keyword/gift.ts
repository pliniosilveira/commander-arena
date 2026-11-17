/**
 * The keyword line Gift (stage P30; D-135, CR 702.174): "Gift a card". The line says only what is given; the question as the spell is
 * cast (promise an opponent a gift or not, CR 702.174a), the card the chosen opponent draws and the intervening "if" of the permanent
 * are the engine's. The reminder text in parentheses is dropped before the line is read. The card gift and tapped Fish gift are supported.
 */
import { map, pattern } from '../../combinators';
import type { IrKeyword } from '../../ir/types';
import { defineRule, node } from '../registry';

/**
 * `keyword.gift`: "Gift a card" and "Gift a tapped Fish". The reminder text supplies the Fish token's characteristics; the engine
 * handles the promise during casting and gives the named gift before an instant or sorcery's other effects.
 */
export const KEYWORD_GIFT = defineRule<readonly IrKeyword[]>({
  id: 'keyword.gift',
  family: 'keyword',
  leading: ['gift'],
  cites: ['CR 702.174a (Gift)', 'CR 702.174e (Gift)', 'CR 702.174j (Gift)'],
  examples: ['Gift a card', 'gift a card', 'Gift a tapped Fish'],
  rejects: [
    'Gift',
    'Gift a Food',
    'Gift a Treasure',
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
      pattern(/gift a (card|tapped fish)(?![\p{L}\p{N}])/iu),
      (match) => ({
        kind: 'keyword',
        name: 'gift',
        params: [],
        gift: match[1]?.toLowerCase() === 'tapped fish' ? 'tappedFish' : 'card',
      }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

export const GIFT_KEYWORD_RULES = [KEYWORD_GIFT];
