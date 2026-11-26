/**
 * Effect rules of group 2 of the Ahoy Mateys deck (Hostage Taker, Dire Fleet Daredevil, King Narfi's Betrayal): permission to cast the cards an earlier instruction exiled, with the riders that
 * belong to the spell that is cast, and the choice of one card from each graveyard.
 */
import { fail, pattern } from '../../combinators';
import type { IrDuration, IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, makeClause } from './operands';

const CAST_ID = 'effect.may-cast-any-type';

/**
 * `effect.may-cast-any-type`: "you may cast that card for as long as it remains exiled, and mana of any type can be spent to cast that spell" (Hostage Taker) and "you may cast it this turn, and
 * mana of any type can be spent to cast that spell. If that spell would be put into a graveyard, exile it instead" (Dire Fleet Daredevil; CR 601.2, 609.4b, 611.2a, 614.1a, 406.3): the controller
 * may cast the card the instruction before it exiled, for the length said, and any mana pays for the spell. The engine's `mayPlay` with `castOnly`, `anyManaType` and, with the last sentence,
 * `exileInstead`. The card is the one of the "exile" before it, which the lowering requires. Not read: "play", another length, "mana of any color", another pronoun, the rider of "your graveyard",
 * another thing said of the spell. The two sentences are one clause only inside the body of a triggered ability (`segment.ts` joins them there; read alone, "would ... instead" is a replacement effect).
 */
export const EFFECT_MAY_CAST_ANY_TYPE = defineRule<Clauses>({
  id: CAST_ID,
  family: 'effect',
  leading: ['you', 'cast'],
  cites: [
    'CR 601.2 (Casting Spells)',
    'CR 609.4b (Effects)',
    'CR 611.2a (Continuous Effects)',
    'CR 614.1a (Replacement Effects)',
    'CR 701.13 (Exile)',
  ],
  examples: [
    'you may cast that card for as long as it remains exiled, and mana of any type can be spent to cast that spell',
    'you may cast it this turn, and mana of any type can be spent to cast that spell',
    'cast that card this turn, and mana of any type can be spent to cast that spell',
    'you may cast that card for as long as it remains exiled, and mana of any type can be spent to cast it',
  ],
  rejects: [
    'you may cast that card for as long as it remains exiled',
    'you may cast that card this turn',
    'you may play that card this turn, and mana of any type can be spent to cast that spell',
    'you may cast that card this turn, and mana of any color can be spent to cast that spell',
    'you may cast that card until end of turn, and mana of any type can be spent to cast that spell',
    'you may cast target card this turn, and mana of any type can be spent to cast that spell',
    'you may cast that card this turn, and mana of any type can be spent to cast that spell and draw a card',
    'you may cast that card this turn, and mana of any type can be spent to cast it',
    'you may cast it this turn, and mana of any type can be spent to cast that spell. if that spell would be put into your graveyard, exile it instead',
    'you may cast it this turn, and mana of any type can be spent to cast that spell. if that spell would be put into a graveyard, exile it instead, then draw a card',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `(?:you may )?cast (?:that card|it) (this turn|for as long as it remains exiled), and mana of any type can be spent to cast (that spell|it)(\\. if that spell would be put into a graveyard, exile it instead)?${BOUNDARY}(?!,| and\\b| then\\b)`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    const match = r.value.value;
    // Cruelclaw's Heist (issue 685): "for as long as it remains exiled, and mana of any type can be spent to cast it"; "this turn ... cast it" stays unread.
    if (match[2]?.toLowerCase() === 'it' && match[1]?.toLowerCase() === 'this turn') {
      return fail(ctx, pos);
    }
    const exileInstead = match[3] !== undefined;
    const duration: IrDuration = {
      kind: 'duration',
      scope: match[1]?.toLowerCase() === 'this turn' ? 'thisTurn' : 'whileExiled',
      span,
      rule: CAST_ID,
    };
    return {
      ok: true,
      value: [
        {
          ...makeClause(
            CAST_ID,
            'mayPlay',
            {
              castOnly: flag(CAST_ID, true, span),
              anyManaType: flag(CAST_ID, true, span),
              ...(exileInstead ? { exileInstead: flag(CAST_ID, true, span) } : {}),
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

const TYPE_WORDS = 'artifact|battle|creature|enchantment|land|planeswalker';
const EACH_ID = 'effect.may-exile-card-from-each-graveyard';

/**
 * `effect.may-exile-card-from-each-graveyard`: "(then) you may exile a creature or planeswalker card from each graveyard" (King Narfi's Betrayal; CR 608.2d, 404.1, 406.1, 607.2a): the
 * controller chooses, for each graveyard in turn, one card of the types named or none, and exiles it; the permanent the ability belongs to remembers the cards ("exiled with ~"). The engine's
 * `moveToZone` of a `choose` with `eachGraveyard`, linked; the lowering refuses it in a spell. Not read: "target", more than one card, a number, "all", "your graveyard", a trailing word.
 */
export const EFFECT_MAY_EXILE_CARD_FROM_EACH_GRAVEYARD = defineRule<Clauses>({
  id: EACH_ID,
  family: 'effect',
  leading: ['you', 'exile', 'then'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 404.1 (Graveyard)',
    'CR 406.1 (Exile)',
    'CR 607.2a (Linked Abilities)',
  ],
  examples: [
    'you may exile a creature or planeswalker card from each graveyard',
    'then you may exile a creature or planeswalker card from each graveyard',
    'you may exile an artifact card from each graveyard',
  ],
  rejects: [
    'you may exile a creature or planeswalker card from your graveyard',
    'you may exile target creature card from each graveyard',
    'you may exile two creature cards from each graveyard',
    'exile a creature card from each graveyard',
    'you may exile a creature card from each graveyard and draw a card',
    'you may exile a creature or planeswalker or land card from each graveyard',
    'you may exile a card from each graveyard',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `(?:then )?you may exile an? (${TYPE_WORDS})(?: or (${TYPE_WORDS}))? card from each graveyard${BOUNDARY}(?!,| and\\b| then\\b)`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    const types = [r.value.value[1], r.value.value[2]]
      .filter((t): t is string => t !== undefined)
      .map((t) => t.toLowerCase());
    const noun: IrNoun = {
      kind: 'noun',
      det: 'a',
      upTo: false,
      plural: false,
      other: false,
      filter: {
        zone: 'graveyard',
        controller: 'you',
        card: true,
        raw: '',
        ...(types.length === 1
          ? { types }
          : { anyOf: types.map((type) => ({ types: [type], raw: '' })) }),
      },
      span,
      rule: EACH_ID,
    };
    return {
      ok: true,
      value: [makeClause(EACH_ID, 'exileFromEachGraveyard', { objects: noun }, span)],
      pos: r.pos,
    };
  },
});

const WITH_ID = 'effect.may-cast-exiled-with-self-any-color';

/**
 * `effect.may-cast-exiled-with-self-any-color`: "until end of turn, you may cast spells from among cards exiled with ~, and you may spend mana as though it were mana of any color to cast those spells"
 * (King Narfi's Betrayal, chapters II and III; CR 601.2, 607.2a, 609.4b, 611.2a): until the end of the turn the controller may cast any card the permanent the ability belongs to exiled with its linked
 * ability and that is still in exile, paying for the spell with mana of any color for any colored symbol. The engine's `mayPlay` of the `linkedExile` cards with `castOnly` and `anyManaColor`.
 * Not read: another length, "play", "mana of any type", another noun for the cards, "that card", a trailing word.
 */
export const EFFECT_MAY_CAST_EXILED_WITH_SELF_ANY_COLOR = defineRule<Clauses>({
  id: WITH_ID,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 601.2 (Casting Spells)',
    'CR 607.2a (Linked Abilities)',
    'CR 609.4b (Effects)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    'until end of turn, you may cast spells from among cards exiled with ~, and you may spend mana as though it were mana of any color to cast those spells',
  ],
  rejects: [
    'until end of turn, you may cast spells from among cards exiled with ~',
    'until the end of your next turn, you may cast spells from among cards exiled with ~, and you may spend mana as though it were mana of any color to cast those spells',
    'until end of turn, you may play cards from among cards exiled with ~, and you may spend mana as though it were mana of any color to cast those spells',
    'until end of turn, you may cast spells from among cards exiled with ~, and you may spend mana as though it were mana of any type to cast those spells',
    'until end of turn, you may cast spells from among cards exiled with target creature, and you may spend mana as though it were mana of any color to cast those spells',
    'until end of turn, you may cast spells from among cards exiled with ~, and you may spend mana as though it were mana of any color to cast those spells and draw a card',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `until end of turn, you may cast spells from among cards exiled with ~, and you may spend mana as though it were mana of any color to cast those spells${BOUNDARY}(?!,| and\\b| then\\b)`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    return {
      ok: true,
      value: [
        makeClause(WITH_ID, 'mayCastExiledWith', { anyManaColor: flag(WITH_ID, true, span) }, span),
      ],
      pos: r.pos,
    };
  },
});

/** Tried first: "you may cast that card ..." and "you may exile ..." are the first words of the plain rules. */
export const AHOY_G2_EFFECT_RULES = [
  EFFECT_MAY_CAST_ANY_TYPE,
  EFFECT_MAY_EXILE_CARD_FROM_EACH_GRAVEYARD,
  EFFECT_MAY_CAST_EXILED_WITH_SELF_ANY_COLOR,
].map(quietly);
