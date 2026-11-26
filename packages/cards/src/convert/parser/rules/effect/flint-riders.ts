/**
 * Effect rules of the Flint deck (issue 685): the sentences that follow a permission to play exiled cards and change how a spell cast with it is paid for (Black Cat, Cunning Thief;
 * Bloodsoaked Insight; Outrageous Robbery; Inside Information; CR 609.4b, 118.9, 601.2f). None is an instruction of its own: each is the rider of the `mayPlay` of the sentence before it,
 * which the lowering (`lower/flint-riders.ts`) completes and refuses everywhere else.
 */
import { fail, pattern } from '../../combinators';
import type { IrArg, IrDuration } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, makeClause } from './operands';

const NOT_MORE = `${BOUNDARY}(?!,| and\\b| then\\b| this\\b)`;

const ANY_TYPE_ID = 'effect.any-type-for-spell-cast-this-way';

/**
 * `effect.any-type-for-spell-cast-this-way`: "If you cast a spell this way, mana of any type can be spent to cast it." (Bloodsoaked Insight) and "If you cast a spell this way, you may spend
 * mana as though it were mana of any type to cast it." (Outrageous Robbery; CR 609.4b, 601.2f): the rider of the permission before it, which sets the engine's `anyManaType` on that
 * `mayPlay` (a land card played that way is played as usual). Not read: "any color" (`effect.any-color-for-spell-cast-this-way`), "cast" of one kind of spell, "that spell", another sentence,
 * a duration, a second instruction.
 */
export const EFFECT_ANY_TYPE_FOR_SPELL_CAST_THIS_WAY = defineRule<Clauses>({
  id: ANY_TYPE_ID,
  family: 'effect',
  leading: ['if'],
  cites: ['CR 609.4b (Effects)', 'CR 601.2f (Casting Spells)'],
  examples: [
    'if you cast a spell this way, mana of any type can be spent to cast it',
    'if you cast a spell this way, you may spend mana as though it were mana of any type to cast it',
  ],
  rejects: [
    'if you cast a spell this way, mana of any color can be spent to cast it',
    'if you cast a spell this way, you may spend mana as though it were mana of any color to cast it',
    'if you cast a spell this way, mana of any type can be spent to cast that spell',
    'if you cast a spell this way',
    'if you cast a spell this way, mana of any type can be spent to cast it this turn',
    'if you cast a spell this way, mana of any type can be spent to cast it and draw a card',
    'if you cast a creature spell this way, mana of any type can be spent to cast it',
    'mana of any type can be spent to cast it',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `if you cast a spell this way, (?:mana of any type can be spent|you may spend mana as though it were mana of any type) to cast it${NOT_MORE}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause(ANY_TYPE_ID, 'anyTypeRider', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

const ANY_TYPE_SPELLS_ID = 'effect.any-type-for-spells-cast-this-way';

/**
 * `effect.any-type-for-spells-cast-this-way`: "Mana of any type can be spent to cast spells this way." (Black Cat, Cunning Thief; CR 609.4b, 601.2f): the same rider with no "if", said of the
 * permission to play the cards the sentence before it exiled. Not read: "any color", "cast that spell", "if", another sentence, a duration, a second instruction.
 */
export const EFFECT_ANY_TYPE_FOR_SPELLS_CAST_THIS_WAY = defineRule<Clauses>({
  id: ANY_TYPE_SPELLS_ID,
  family: 'effect',
  leading: ['mana'],
  cites: ['CR 609.4b (Effects)', 'CR 601.2f (Casting Spells)'],
  examples: ['mana of any type can be spent to cast spells this way'],
  rejects: [
    'mana of any color can be spent to cast spells this way',
    'mana of any type can be spent to cast that spell',
    'mana of any type can be spent to cast spells',
    'mana of any type can be spent to cast spells this way this turn',
    'mana of any type can be spent to cast spells this way and draw a card',
    'if you cast a spell this way, mana of any type can be spent to cast it',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(new RegExp(`mana of any type can be spent to cast spells this way${NOT_MORE}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause(ANY_TYPE_SPELLS_ID, 'anyTypeRider', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

const LIFE_ID = 'effect.life-for-spell-cast-this-way';

/**
 * `effect.life-for-spell-cast-this-way`: "If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost." (Inside Information; CR 118.9, 119.4, 601.2f): the
 * rider of the permission before it, which sets the engine's `lifeForMana` on that `mayPlay` (a land card played that way is played as usual). Not read: "paying", another cost, "if you
 * cast a creature spell", "that spell", another sentence, a duration, a second instruction.
 */
export const EFFECT_LIFE_FOR_SPELL_CAST_THIS_WAY = defineRule<Clauses>({
  id: LIFE_ID,
  family: 'effect',
  leading: ['if'],
  cites: ['CR 118.9 (Alternative Costs)', 'CR 119.4 (Life)', 'CR 601.2f (Casting Spells)'],
  examples: [
    'if you cast a spell this way, pay life equal to its mana value rather than pay its mana cost',
    'if you cast a spell this way, pay life equal to its mana value rather than paying its mana cost',
  ],
  rejects: [
    'if you cast a spell this way, pay life equal to its mana value',
    'if you cast a spell this way, pay twice its mana value in life rather than pay its mana cost',
    'if you cast a spell this way, pay life equal to that spell’s mana value rather than pay its mana cost',
    'if you cast a creature spell this way, pay life equal to its mana value rather than pay its mana cost',
    'if you cast a spell this way, pay life equal to its mana value rather than pay its mana cost and draw a card',
    'pay life equal to its mana value rather than pay its mana cost',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `if you cast a spell this way, pay life equal to its mana value rather than pay(?:ing)? its mana cost${NOT_MORE}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause(LIFE_ID, 'lifeRider', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

const PLAY_SPEND_ID = 'effect.may-play-exiled-and-spend';

const SCOPES: Readonly<Record<string, IrDuration['scope']>> = {
  'until end of turn': 'untilEndOfTurn',
  'until the end of your next turn': 'untilEndOfNextTurn',
  'until your next end step': 'untilYourNextEndStep',
};

/**
 * `effect.may-play-exiled-and-spend`: "Until end of turn, you may cast spells from among those cards, and mana of any type can be spent to cast those spells." (Laughing Jasper Flint),
 * "Until your next end step, you may play those cards, and mana of any type can be spent to cast those spells." (Rakdos, the Muscle), "Until the end of your next turn, you may play that
 * card, and you may spend mana as though it were mana of any color to cast it." (You Find Some Prisoners) and "Until end of turn, you may play that card and you may spend mana as though it were
 * mana of any color to cast it." (The Ruinous Powers; CR 601.2, 305.1, 609.4b, 611.2a): the controller may play (or only cast) the cards the instruction before it exiled for the length said,
 * and pays for the spells with mana of any type or of any color. The engine's `mayPlay` with `anyManaType` or `anyManaColor` (`castOnly` for "cast spells from among"). Not read: "for as long as
 * they remain exiled" (`effect.may-play-while-exiled-spend`), another length, "cast that card", "any type" for a single "play those cards" for the end of your next turn (the rule of Lidless
 * Gaze), a second instruction.
 */
export const EFFECT_MAY_PLAY_EXILED_AND_SPEND = defineRule<Clauses>({
  id: PLAY_SPEND_ID,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 601.2 (Casting Spells)',
    'CR 305.1 (Lands)',
    'CR 609.4b (Effects)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    'until end of turn, you may cast spells from among those cards, and mana of any type can be spent to cast those spells',
    'until your next end step, you may play those cards, and mana of any type can be spent to cast those spells',
    'until the end of your next turn, you may play that card, and you may spend mana as though it were mana of any color to cast it',
    'until end of turn, you may play that card and you may spend mana as though it were mana of any color to cast it',
  ],
  rejects: [
    'until the end of your next turn, you may play those cards, and mana of any type can be spent to cast those spells',
    'until end of turn, you may cast spells from among those cards',
    'until end of turn, you may play those cards, and mana of any color can be spent to cast those spells',
    'this turn, you may play that card, and you may spend mana as though it were mana of any color to cast it',
    'until end of turn, you may cast that card, and you may spend mana as though it were mana of any color to cast it',
    'until end of turn, you may play that card and you may spend mana as though it were mana of any color to cast it and draw a card',
    'until end of turn, you may play that card, and mana of any type can be spent to cast that spells',
    'for as long as they remain exiled, you may play those cards, and mana of any type can be spent to cast those spells',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `(until end of turn|until the end of your next turn|until your next end step), you may (play|cast spells from among) (those cards|that card),? (?:and )?(mana of any type can be spent to cast (?:those spells|that spell)|you may spend mana as though it were mana of any (type|color) to cast (?:those spells|that spell|it))${NOT_MORE}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    const m = r.value.value;
    const length = (m[1] ?? '').toLowerCase();
    const cast = (m[2] ?? '').toLowerCase().startsWith('cast');
    const plural = (m[3] ?? '').toLowerCase() === 'those cards';
    const rider = (m[4] ?? '').toLowerCase();
    // "cast spells from among those cards" says "those spells" or "that spell" in step with the cards; "play those cards ... mana of any type" is Lidless Gaze's, for the next turn only.
    const anyType = rider.startsWith('mana of any type') || rider.endsWith('any type to cast it');
    if (plural !== /those spells/u.test(rider) && !rider.endsWith('to cast it'))
      return fail(ctx, pos);
    if (!cast && anyType && plural && length === 'until the end of your next turn') {
      return fail(ctx, pos);
    }
    const scope = SCOPES[length];
    if (scope === undefined) return fail(ctx, pos);
    const duration: IrDuration = { kind: 'duration', scope, span, rule: PLAY_SPEND_ID };
    const args: Record<string, IrArg> = {
      ...(anyType
        ? { anyManaType: flag(PLAY_SPEND_ID, true, span) }
        : { anyManaColor: flag(PLAY_SPEND_ID, true, span) }),
      ...(cast ? { castOnly: flag(PLAY_SPEND_ID, true, span) } : {}),
    };
    return {
      ok: true,
      value: [{ ...makeClause(PLAY_SPEND_ID, 'mayPlay', args, span), duration }],
      pos: r.pos,
    };
  },
});

/** Tried first: "if ..." and "mana ..." are the first words of the plain rules. */
export const FLINT_RIDER_EFFECT_RULES = [
  EFFECT_MAY_PLAY_EXILED_AND_SPEND,
  EFFECT_ANY_TYPE_FOR_SPELL_CAST_THIS_WAY,
  EFFECT_ANY_TYPE_FOR_SPELLS_CAST_THIS_WAY,
  EFFECT_LIFE_FOR_SPELL_CAST_THIS_WAY,
].map(quietly);
