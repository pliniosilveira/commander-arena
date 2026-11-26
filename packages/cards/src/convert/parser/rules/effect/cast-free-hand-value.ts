/**
 * Effect rule of the Revenant Recon deck (Marvo, Deep Operative): "you may cast a spell from your hand with mana value 8 or less without paying its mana cost" (CR 608.2g, 118.9),
 * the same instruction as `effect.cast-free` with the limit said after "your hand". The engine's `castFree` of a `choose` over the hand (`lower/dinosaurs.ts`).
 */
import { pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, quietly, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, single } from './operands';

const ID = 'effect.cast-free-hand-value';

/**
 * `effect.cast-free-hand-value`: "you may cast a spell from your hand with mana value 8 or less without paying its mana cost" (CR 608.2g: the controller may cast the card as this
 * resolves without paying its mana cost; CR 202.3: the mana value; CR 305.1: a land is played, never cast, so "a spell" is a card that is not a land). In a triggered ability the "you may" is
 * the ability's own, so "cast a spell ..." is read as well. Not read: "or greater", a number of words, a number of spells, another zone, "target", a limit before "from your hand" (that is
 * `effect.cast-free`), "this turn", a tail after the cost.
 */
export const EFFECT_CAST_FREE_HAND_VALUE = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['you', 'cast'],
  cites: [
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
    'CR 202.3 (Mana Value)',
  ],
  examples: [
    'you may cast a spell from your hand with mana value 8 or less without paying its mana cost',
    'cast a spell from your hand with mana value 3 or less without paying its mana cost',
  ],
  rejects: [
    'you may cast a spell from your hand with mana value 8 or greater without paying its mana cost',
    'you may cast a spell from your hand with mana value 8 or less',
    'you may cast a spell from your graveyard with mana value 8 or less without paying its mana cost',
    'you may cast two spells from your hand with mana value 8 or less without paying their mana costs',
    'you may cast a spell from your hand with mana value X or less without paying its mana cost',
    'you may cast a spell from your hand with mana value 8 or less without paying its mana cost this turn',
    'you cast a spell from your hand with mana value 8 or less without paying its mana cost',
  ],
  parse: single(
    ID,
    spanned(
      pattern(
        /(you may )?cast a spell from your hand with mana value (\d+) or less without paying its mana cost(?![\p{L}\p{N}])(?! this turn)/iu,
      ),
    ),
    ({ span, value }) => {
      const objects: IrNoun = {
        kind: 'noun',
        det: 'a',
        filter: {
          zone: 'hand',
          // "A spell" is a card that is not a land: a land is played, never cast (CR 305.1, 601.1).
          notTypes: ['land'],
          manaValue: { cmp: 'atMost', value: Number(value[2]) },
          raw: 'spell from your hand',
        },
        upTo: false,
        plural: false,
        other: false,
        span,
        rule: ID,
      };
      return {
        verb: 'castFree',
        args: {
          objects,
          play: flag(ID, false, span),
          mayWritten: flag(ID, value[1] !== undefined, span),
        },
      };
    },
  ),
});

export const CAST_FREE_HAND_VALUE_EFFECT_RULES = [EFFECT_CAST_FREE_HAND_VALUE].map(quietly);
