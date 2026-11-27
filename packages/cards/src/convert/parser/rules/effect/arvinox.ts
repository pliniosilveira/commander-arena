/**
 * Effect rules of Arvinox, the Mind Flail: the bottom card of each opponent's library exiled face down, and the sentence that lets the controller look at those cards, cast permanent
 * spells from among them and spend mana as though it were mana of any color for those spells. The lowerings are in `lower/dragons.ts` (`exileTop`, `mayPlay`).
 */
import { pattern } from '../../combinators';
import type { IrDuration, IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, makeClause } from './operands';

const EXILE_ID = 'effect.exile-bottom-of-each-opponent-face-down';

/**
 * `effect.exile-bottom-of-each-opponent-face-down`: "exile the bottom card of each opponent's library face down" (Arvinox, the Mind Flail; CR 401.1, 406.3, 701.13, 101.4): the controller
 * exiles, face down, the bottom card of the library of every opponent, one player after the other in the order of CR 101.4. The cards belong to those opponents and are what "those cards"
 * names afterwards. The engine's `exileTop` with `bottom`, `faceDown` and `from` `eachOpponent`. Not read: the top card, "each player's", "target", more than one card, the cards face up, a
 * second instruction in the same sentence.
 */
export const EFFECT_EXILE_BOTTOM_OF_EACH_OPPONENT_FACE_DOWN = defineRule<Clauses>({
  id: EXILE_ID,
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 701.13 (Exile)',
    'CR 401.1 (Library)',
    'CR 406.3 (Exile)',
    'CR 101.4 (Handling Simultaneous Choices)',
  ],
  examples: [
    "exile the bottom card of each opponent's library face down",
    'exile the bottom card of each opponent’s library face down',
  ],
  rejects: [
    "exile the bottom card of each opponent's library",
    "exile the top card of each opponent's library face down",
    "exile the bottom card of each player's library face down",
    "exile the bottom card of target opponent's library face down",
    "exile the bottom two cards of each opponent's library face down",
    "exile the bottom card of each opponent's graveyard face down",
    "exile the bottom card of each opponent's library face down and draw a card",
    "exile the bottom card of each opponent's library face down, then",
    "exile the bottom card of each opponent's library face up",
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `exile the bottom card of each opponent['’]s library face down${BOUNDARY}(?!,| and\\b| then\\b)`,
          'iu',
        ),
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
          {
            count: { kind: 'number', value: 1, span },
            from: owners,
            faceDown: flag(EXILE_ID, true, span),
            bottom: flag(EXILE_ID, true, span),
          },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

const PLAY_ID = 'effect.may-look-cast-permanent-spells-from-those-any-color';

/**
 * `effect.may-look-cast-permanent-spells-from-those-any-color`: "for as long as those cards remain exiled, you may look at them, you may cast permanent spells from among them, and you may
 * spend mana as though it were mana of any color to cast those spells" (Arvinox, the Mind Flail; CR 406.3, 601.2, 609.4b, 611.2b): the controller may look at the cards the instruction before it
 * exiled face down, and may cast those that are permanent cards (a land card is no spell), paying for the spell with mana of any color for any colored symbol, for as long as the cards stay
 * in exile. The engine's `mayPlay` of `moved` with `whileExiled`, `lookAt`, `castOnly`, `permanentSpellsOnly` and `anyManaColor`. Not read: another kind of spell, "play", another length, "mana of
 * any type", "that card", a missing part of the three, a trailing instruction.
 */
export const EFFECT_MAY_LOOK_CAST_PERMANENT_SPELLS_FROM_THOSE_ANY_COLOR = defineRule<Clauses>({
  id: PLAY_ID,
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 406.3 (Exile)',
    'CR 601.2 (Casting Spells)',
    'CR 609.4b (Effects)',
    'CR 611.2b (Continuous Effects)',
  ],
  examples: [
    'for as long as those cards remain exiled, you may look at them, you may cast permanent spells from among them, and you may spend mana as though it were mana of any color to cast those spells',
  ],
  rejects: [
    'for as long as those cards remain exiled, you may look at them, you may cast spells from among them, and you may spend mana as though it were mana of any color to cast those spells',
    'for as long as those cards remain exiled, you may look at them, you may cast creature spells from among them, and you may spend mana as though it were mana of any color to cast those spells',
    'for as long as those cards remain exiled, you may look at them, you may play permanent spells from among them, and you may spend mana as though it were mana of any color to cast those spells',
    'for as long as those cards remain exiled, you may look at them, you may cast permanent spells from among them, and you may spend mana as though it were mana of any type to cast those spells',
    'for as long as those cards remain exiled, you may cast permanent spells from among them, and you may spend mana as though it were mana of any color to cast those spells',
    'for as long as that card remains exiled, you may look at it, you may cast permanent spells from among them, and you may spend mana as though it were mana of any color to cast those spells',
    'until end of turn, you may look at them, you may cast permanent spells from among them, and you may spend mana as though it were mana of any color to cast those spells',
    'for as long as those cards remain exiled, you may look at them, you may cast permanent spells from among them, and you may spend mana as though it were mana of any color to cast those spells and draw a card',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `for as long as those cards remain exiled, you may look at them, you may cast permanent spells from among them, and you may spend mana as though it were mana of any color to cast those spells${BOUNDARY}(?!,| and\\b| then\\b)`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    const duration: IrDuration = { kind: 'duration', scope: 'whileExiled', span, rule: PLAY_ID };
    return {
      ok: true,
      value: [
        {
          ...makeClause(
            PLAY_ID,
            'mayPlay',
            {
              lookAt: flag(PLAY_ID, true, span),
              castOnly: flag(PLAY_ID, true, span),
              permanentSpellsOnly: flag(PLAY_ID, true, span),
              anyManaColor: flag(PLAY_ID, true, span),
            },
            span,
          ),
          duration,
        },
      ],
      pos: r.pos,
    };
  },
});

/** Tried first: "exile the bottom ..." and "for as long as ..." start like the plain exile and duration rules. */
export const ARVINOX_EFFECT_RULES = [
  EFFECT_EXILE_BOTTOM_OF_EACH_OPPONENT_FACE_DOWN,
  EFFECT_MAY_LOOK_CAST_PERMANENT_SPELLS_FROM_THOSE_ANY_COLOR,
].map(quietly);
