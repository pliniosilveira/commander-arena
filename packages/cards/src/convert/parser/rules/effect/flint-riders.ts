/**
 * Effect rules of the Flint deck (issue 685): the sentences that follow a permission to play exiled cards and change how a spell cast with it is paid for (Black Cat, Cunning Thief;
 * Bloodsoaked Insight; Outrageous Robbery; Inside Information; CR 609.4b, 118.9, 601.2f). None is an instruction of its own: each is the rider of the `mayPlay` of the sentence before it,
 * which the lowering (`lower/flint-riders.ts`) completes and refuses everywhere else.
 */
import { pattern } from '../../combinators';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
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

/** Tried first: "if ..." and "mana ..." are the first words of the plain rules. */
export const FLINT_RIDER_EFFECT_RULES = [
  EFFECT_ANY_TYPE_FOR_SPELL_CAST_THIS_WAY,
  EFFECT_ANY_TYPE_FOR_SPELLS_CAST_THIS_WAY,
  EFFECT_LIFE_FOR_SPELL_CAST_THIS_WAY,
].map(quietly);
