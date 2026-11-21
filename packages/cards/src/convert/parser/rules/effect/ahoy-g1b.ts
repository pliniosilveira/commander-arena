/**
 * Effect rules of group 1b of the Ahoy Mateys deck (Breeches, Brazen Plunderer; Ramirez DePietro, Pillager): the exile of the top card of the library of each opponent a batch of Pirates damaged
 * and the permissions to play or cast the cards exiled, which the two cards say in their own words.
 */
import { pattern } from '../../combinators';
import type { IrDuration, IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, makeClause } from './operands';

const EXILE_ID = 'effect.exile-top-of-each-of-those-opponents';

/**
 * `effect.exile-top-of-each-of-those-opponents`: "exile the top card of each of those opponents' libraries" (Breeches, Brazen Plunderer; CR 701.13, 401.1, 603.2c): the controller exiles, face
 * up, the top card of the library of every opponent the group of sources of the trigger dealt damage to in the one event, one player after the other in the order of CR 101.4. The cards belong to
 * those opponents and are what "those cards" names afterwards. The engine's `exileTop` from `triggerDamagedPlayers`, valid only in a `damageBatch` trigger to "your opponents" (`validateCard`).
 * Not read: "that player's" (`effect.exile-top-of-that-player`), "each opponent's", "target", more than one card, a number, the cards face down, a second instruction in the same sentence.
 */
export const EFFECT_EXILE_TOP_OF_EACH_OF_THOSE_OPPONENTS = defineRule<Clauses>({
  id: EXILE_ID,
  family: 'effect',
  leading: ['exile'],
  cites: ['CR 701.13 (Exile)', 'CR 401.1 (Library)', 'CR 603.2c (Handling Triggered Abilities)'],
  examples: [
    "exile the top card of each of those opponents' libraries",
    'exile the top card of each of those opponents’ libraries',
  ],
  rejects: [
    "exile the top card of each opponent's library",
    "exile the top card of that player's library",
    "exile the top card of each of those opponents' libraries face down",
    "exile the top two cards of each of those opponents' libraries",
    "exile the top card of each of those opponents' graveyards",
    "exile the top card of each of those opponents' libraries and draw a card",
    "exile the top card of each of those players' libraries",
    "exile top card of each of those opponents' libraries",
    "exile the top card of each of those opponents' library",
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /exile the top card of each of those opponents['’] libraries(?![\p{L}\p{N}])(?! face down)(?!,| and\b| then\b)/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    const owners: IrNoun = {
      kind: 'noun',
      det: 'triggerDamagedPlayers',
      filter: { raw: 'each of those opponents' },
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

const PLAY_ID = 'effect.may-play-any-color';

/**
 * `effect.may-play-any-color`: "you may play those cards this turn, and you may spend mana as though it were mana of any color to cast those spells" (Breeches, Brazen Plunderer; CR 601.2, 305.1,
 * 609.4b, 611.2a): until the end of the turn the controller may play the cards the instruction before it exiled, a land as a land drop and a spell by casting it, and pays for such a spell with mana
 * of any color for any colored symbol. The engine's `mayPlay` (no `castOnly`) with `anyManaColor`. The cards are those of the "exile" before it, which the lowering requires. Not read: "cast", another
 * length, "mana of any type", "that card" with "those spells" (the number must agree), another thing said of the spells.
 */
export const EFFECT_MAY_PLAY_ANY_COLOR = defineRule<Clauses>({
  id: PLAY_ID,
  family: 'effect',
  leading: ['you', 'play'],
  cites: [
    'CR 601.2 (Casting Spells)',
    'CR 305.1 (Lands)',
    'CR 609.4b (Effects)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    'you may play those cards this turn, and you may spend mana as though it were mana of any color to cast those spells',
    'you may play that card this turn, and you may spend mana as though it were mana of any color to cast that spell',
    'play those cards this turn, and you may spend mana as though it were mana of any color to cast those spells',
  ],
  rejects: [
    'you may play those cards this turn',
    'you may cast those cards this turn, and you may spend mana as though it were mana of any color to cast those spells',
    'you may play those cards until end of turn, and you may spend mana as though it were mana of any color to cast those spells',
    'you may play those cards this turn, and you may spend mana as though it were mana of any type to cast those spells',
    'you may play those cards this turn, and you may spend mana as though it were mana of any color to cast that spell',
    'you may play that card this turn, and you may spend mana as though it were mana of any color to cast those spells',
    'you may play target card this turn, and you may spend mana as though it were mana of any color to cast those spells',
    'you may play those cards this turn, and you may spend mana as though it were mana of any color to cast those spells and draw a card',
    'you may play those cards this turn, and you may spend mana as though it were mana of any color to cast them',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `(?:you may )?play (?:(those cards) this turn, and you may spend mana as though it were mana of any color to cast those spells|(that card) this turn, and you may spend mana as though it were mana of any color to cast that spell)${BOUNDARY}(?!,| and\\b| then\\b)`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    const duration: IrDuration = { kind: 'duration', scope: 'thisTurn', span, rule: PLAY_ID };
    return {
      ok: true,
      value: [
        {
          ...makeClause(PLAY_ID, 'mayPlay', { anyManaColor: flag(PLAY_ID, true, span) }, span),
          duration,
        },
      ],
      pos: r.pos,
    };
  },
});

const CAST_ID = 'effect.may-cast-while-exiled';

/**
 * `effect.may-cast-while-exiled`: "you may cast that card for as long as it remains exiled", "you may cast those cards for as long as they remain exiled" (Ramirez DePietro, Pillager; CR 406.3,
 * 601.2, 305.1, 611.2b): the controller may cast the cards the instruction before it exiled for as long as they stay in exile (a card that leaves exile is a new object, CR 400.7). A land card is no
 * spell, so it is not cast and stays where it is. The engine's `mayPlay` with `castOnly` and `whileExiled`; the cards were exiled face up, which the lowering requires. Not read: "play", "look at",
 * another length, an extra rider ("and mana of any type can be spent", `effect.may-cast-any-type`), a pronoun that does not agree with its verb, a trailing word.
 */
export const EFFECT_MAY_CAST_WHILE_EXILED = defineRule<Clauses>({
  id: CAST_ID,
  family: 'effect',
  leading: ['you', 'cast'],
  cites: [
    'CR 406.3 (Exile)',
    'CR 601.2 (Casting Spells)',
    'CR 305.1 (Lands)',
    'CR 611.2b (Continuous Effects)',
  ],
  examples: [
    'you may cast that card for as long as it remains exiled',
    'you may cast those cards for as long as they remain exiled',
    'cast that card for as long as it remains exiled',
  ],
  rejects: [
    'you may cast that card',
    'you may cast that card this turn',
    'you may play that card for as long as it remains exiled',
    'you may cast those cards for as long as they remains exiled',
    'you may cast that card for as long as they remain exiled',
    'you may cast target card for as long as it remains exiled',
    'you may cast that card for as long as it remains exiled, and mana of any type can be spent to cast that spell',
    'you may cast that card for as long as it remains exiled and draw a card',
    'you may cast that card for as long as it remains exiled, then',
    'you may look at and cast that card for as long as it remains exiled',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `(?:you may )?cast (?:that card for as long as it remains|those cards for as long as they remain) exiled${BOUNDARY}(?!,| and\\b| then\\b)`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    const duration: IrDuration = { kind: 'duration', scope: 'whileExiled', span, rule: CAST_ID };
    return {
      ok: true,
      value: [
        {
          ...makeClause(CAST_ID, 'mayPlay', { castOnly: flag(CAST_ID, true, span) }, span),
          duration,
        },
      ],
      pos: r.pos,
    };
  },
});

/** Tried first: "exile the top card of ..." and "you may play/cast ..." are the first words of the plain rules. */
export const AHOY_G1B_EFFECT_RULES = [
  EFFECT_EXILE_TOP_OF_EACH_OF_THOSE_OPPONENTS,
  EFFECT_MAY_PLAY_ANY_COLOR,
  EFFECT_MAY_CAST_WHILE_EXILED,
].map(quietly);
