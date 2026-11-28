/**
 * The keyword line Gift (stage P30; D-135, CR 702.174): "Gift a card". The line says only what is given; the question as the spell is
 * cast (promise an opponent a gift or not, CR 702.174a), the card the chosen opponent draws and the intervening "if" of the permanent
 * are the engine's. The reminder text in parentheses is dropped before the line is read. The card, tapped Fish, extra turn and Octopus gifts are
 * supported (CR 702.174e, 702.174f, 702.174g, 702.174i); a Food or a Treasure is not read yet.
 */
import { map, pattern } from '../../combinators';
import type { IrKeyword } from '../../ir/types';
import { defineRule, node } from '../registry';

/** The gift the words after "Gift" name; the pattern admits only these four. */
function giftOf(words: string): NonNullable<IrKeyword['gift']> {
  const lower = words.toLowerCase();
  if (lower === 'a card') return 'card';
  if (lower === 'a tapped fish') return 'tappedFish';
  return lower === 'an extra turn' ? 'extraTurn' : 'octopus';
}

/**
 * `keyword.gift`: "Gift a card", "Gift a tapped Fish", "Gift an extra turn" and "Gift an Octopus". Each gift's effect is defined by the
 * rules (CR 702.174e to 702.174i), not by the reminder text; the engine handles the promise during casting and gives the named gift before an
 * instant or sorcery's other effects.
 */
export const KEYWORD_GIFT = defineRule<readonly IrKeyword[]>({
  id: 'keyword.gift',
  family: 'keyword',
  leading: ['gift'],
  cites: [
    'CR 702.174a (Gift)',
    'CR 702.174e (Gift)',
    'CR 702.174g (Gift)',
    'CR 702.174i (Gift)',
    'CR 702.174j (Gift)',
  ],
  examples: [
    'Gift a card',
    'gift a card',
    'Gift a tapped Fish',
    // Perch Protection (CR 702.174g).
    'Gift an extra turn',
    // Octomancer (CR 702.174i).
    'Gift an Octopus',
  ],
  rejects: [
    'Gift',
    'Gift a Food',
    'Gift a Treasure',
    'Gift an extra turns',
    'Gift a Octopus',
    'Gift an Octopuses',
    'Gift two extra turns',
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
      pattern(/gift (a card|a tapped fish|an extra turn|an octopus)(?![\p{L}\p{N}])/iu),
      (match) => ({
        kind: 'keyword',
        name: 'gift',
        params: [],
        gift: giftOf(match[1] ?? ''),
      }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

export const GIFT_KEYWORD_RULES = [KEYWORD_GIFT];
