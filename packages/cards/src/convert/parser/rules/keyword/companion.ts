/**
 * "Companion — [condition]" (CR 702.139a, Jegantha, the Wellspring): a deck-construction ability that functions only outside the game. It is read as a keyword line so the card is
 * supported; `packages/cards` checks the condition against the starting deck when a companion is chosen (`validate/companion.ts`). The set of conditions is closed: each is the wording of a
 * real card, and a wording that is not in the set is not read.
 */
import { NO_REPEATED_MANA_SYMBOL_SENTENCE } from '../../../../validate/companion-conditions';
import { literal, map, pattern, sequence } from '../../combinators';
import type { IrKeyword } from '../../ir/types';
import { defineRule, spanned } from '../registry';

/** The condition of `CompanionCondition` this rule reads, by the name the keyword's argument carries. */
export const NO_REPEATED_MANA_SYMBOL = 'noRepeatedManaSymbol';

/**
 * `keyword.companion`: "Companion — No card in your starting deck has more than one of the same mana symbol in its mana cost." with or without the final period. Not read: another
 * condition, another subject than "your starting deck", a plural "symbols", a second sentence, "Companion" without a condition.
 */
export const KEYWORD_COMPANION = defineRule<readonly IrKeyword[]>({
  id: 'keyword.companion',
  family: 'keyword',
  leading: ['companion'],
  cites: ['CR 702.139a (Companion)', 'CR 702.139b (Companion)'],
  examples: [
    'Companion — No card in your starting deck has more than one of the same mana symbol in its mana cost.',
    'Companion — No card in your starting deck has more than one of the same mana symbol in its mana cost',
  ],
  rejects: [
    'Companion',
    'Companion —',
    'Companion - No card in your starting deck has more than one of the same mana symbol in its mana cost.',
    'Companion — No card in your starting deck has more than one of the same mana symbol in its mana cost. Draw a card.',
    'Companion — No card in your starting deck has more than two of the same mana symbol in its mana cost.',
    'Companion — No card in your deck has more than one of the same mana symbol in its mana cost.',
    'Companion — No card in your starting deck has more than one of the same mana symbols in its mana cost.',
    'Companion — Each creature card in your starting deck has a different name.',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      map(
        sequence(
          pattern(/[Cc]ompanion — /u),
          literal(NO_REPEATED_MANA_SYMBOL_SENTENCE),
          pattern(/\.?(?![\p{L}\p{N}])/u),
        ),
        () => NO_REPEATED_MANA_SYMBOL,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { value: condition, span } = r.value;
    const keyword: IrKeyword = {
      kind: 'keyword',
      name: 'companion',
      params: [{ kind: 'name', name: condition, span, rule: 'keyword.companion' }],
      span,
      rule: 'keyword.companion',
    };
    return { ok: true, value: [keyword], pos: r.pos };
  },
});

export const COMPANION_KEYWORD_RULES = [KEYWORD_COMPANION];
