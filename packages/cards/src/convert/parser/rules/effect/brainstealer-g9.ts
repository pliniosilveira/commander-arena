/**
 * Effect rules of Brainstealer Dragon: the top card of each opponent's library exiled face up, and the rider sentence that lets the controller spend mana as though it were mana of any
 * color for a spell cast "this way". CR rule numbers are cited as the code already cites them; the CR text was not available to check them.
 */
import { pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const EXILE_ID = 'effect.exile-top-of-each-opponent';

/**
 * `effect.exile-top-of-each-opponent`: "exile the top card of each opponent's library" (Brainstealer Dragon; CR 701.13, 401.1, 101.4): the controller exiles, face up, the top card of the
 * library of every opponent, one player after the other in the order of CR 101.4. The cards belong to those opponents and are what "those cards" names afterwards. The engine's `exileTop` from
 * `eachOpponent`. Not read: "each player's", "target", more than one card, a number, the cards face down (`effect.look-exile-top-each-opponent` looks at them), a graveyard, a second
 * instruction in the same sentence.
 */
export const EFFECT_EXILE_TOP_OF_EACH_OPPONENT = defineRule<Clauses>({
  id: EXILE_ID,
  family: 'effect',
  leading: ['exile'],
  cites: ['CR 701.13 (Exile)', 'CR 401.1 (Library)', 'CR 101.4 (Handling Simultaneous Choices)'],
  examples: [
    "exile the top card of each opponent's library",
    'exile the top card of each opponent’s library',
  ],
  rejects: [
    "exile the top card of each player's library",
    "exile the top card of target opponent's library",
    "exile the top card of each opponent's library face down",
    "exile the top two cards of each opponent's library",
    "exile the top card of each opponent's graveyard",
    "exile the top card of each opponent's library and draw a card",
    "exile the top card of each opponent's library, then",
    "exile top card of each opponent's library",
    "exile the top card of each opponent's libraries",
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /exile the top card of each opponent['’]s library(?![\p{L}\p{N}])(?! face down)(?!,| and\b| then\b)/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    const owners: IrNoun = {
      kind: 'noun',
      det: 'eachOpponent',
      filter: { raw: 'each opponent' },
      upTo: false,
      plural: true,
      other: false,
      span,
      rule: EXILE_ID,
    };
    return {
      ok: true,
      value: [
        makeClause(
          EXILE_ID,
          'exileTop',
          { count: { kind: 'number', value: 1, span }, from: owners },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

const RIDER_ID = 'effect.any-color-for-spell-cast-this-way';

/**
 * `effect.any-color-for-spell-cast-this-way`: "If you cast a spell this way, you may spend mana as though it were mana of any color to cast it." (Brainstealer Dragon; CR 609.4b, 601.2f): not an
 * instruction of its own, the rider of the permission to play the cards the sentence before it allowed. The lowering sets `anyManaColor` on that `mayPlay` (a land card played that way is
 * played as usual) and refuses the sentence anywhere else. Not read: "cast", another sentence, "mana of any type", "that spell", a duration, a second instruction.
 */
export const EFFECT_ANY_COLOR_FOR_SPELL_CAST_THIS_WAY = defineRule<Clauses>({
  id: RIDER_ID,
  family: 'effect',
  leading: ['if'],
  cites: ['CR 609.4b (Effects)', 'CR 601.2f (Casting Spells)'],
  examples: [
    'if you cast a spell this way, you may spend mana as though it were mana of any color to cast it',
  ],
  rejects: [
    'if you cast a spell this way, you may spend mana as though it were mana of any type to cast it',
    'if you cast a spell this way, you may spend mana as though it were mana of any color to cast that spell',
    'if you cast a spell this way',
    'if you cast a spell this way, you may spend mana as though it were mana of any color to cast it this turn',
    'if you cast a spell this way, you may spend mana as though it were mana of any color to cast it and draw a card',
    'if you cast a creature spell this way, you may spend mana as though it were mana of any color to cast it',
    'you may spend mana as though it were mana of any color to cast it',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `if you cast a spell this way, you may spend mana as though it were mana of any color to cast it${BOUNDARY}(?!,| and\\b| then\\b)`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    return { ok: true, value: [makeClause(RIDER_ID, 'anyColorRider', {}, span)], pos: r.pos };
  },
});

/** Tried first: "exile the top card of ..." and "if ..." are the first words of the plain rules. */
export const BRAINSTEALER_G9_EFFECT_RULES = [
  EFFECT_EXILE_TOP_OF_EACH_OPPONENT,
  EFFECT_ANY_COLOR_FOR_SPELL_CAST_THIS_WAY,
].map(quietly);
