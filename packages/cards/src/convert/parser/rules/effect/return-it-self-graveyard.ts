/**
 * Effect rule of the Revenant Recon deck (Master of Death): "it" of an ability that works from the graveyard is the card itself.
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrNoun, IrZoneSpec } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import type { Clauses } from './operands';

const ID = 'effect.return-it-self-graveyard';

/** The words before it: the card says "if this card is in your graveyard" and nothing before the pronoun chose another object. */
const SELF_IN_GRAVEYARD_BEFORE = /(?:~|this card) is in your graveyard, [^.]*\. if you do, $/iu;

/**
 * `effect.return-it-self-graveyard`: "If you do, return it to your hand" after "if this card is in your graveyard, you may pay 1 life." (CR 113.6b: an ability that works
 * from the graveyard; CR 400.7: the card is a new object in the hand; CR 608.2c). "It" is the card the ability belongs to, the only object the text before it names. The same
 * clause as `effect.return-self` ("return this card from your graveyard to your hand"), which the lowering allows only in an ability of the card that works from the graveyard.
 * Not read: "it" with no "if this card is in your graveyard" sentence before it, another destination, "its owner's hand", more words after it.
 */
export const EFFECT_RETURN_IT_SELF_GRAVEYARD = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['return'],
  cites: [
    'CR 113.6b (Abilities)',
    'CR 400.7 (General)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: ['return it to your hand'],
  rejects: [
    "return it to its owner's hand",
    'return it to your hand tapped',
    'return that card to your hand',
    'return this card to your hand',
    'return it to the battlefield',
    'return it to your hand tapped',
  ],
  parse: (ctx, pos) => {
    // At the start of the text nothing came before the pronoun: the lowering then has no ability of the card to read it in and refuses it.
    if (pos > 0 && !SELF_IN_GRAVEYARD_BEFORE.test(ctx.text.slice(0, pos))) return fail(ctx, pos);
    const r = sequence(
      literal('return '),
      spanned(literal('it')),
      pattern(/ to your hand(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, it] = r.value;
    const span = { start: pos, end: r.pos };
    const objects: IrNoun = {
      kind: 'noun',
      det: 'self',
      filter: { raw: it.value },
      upTo: false,
      plural: false,
      other: false,
      span: it.span,
      rule: ID,
    };
    const spec: IrZoneSpec = {
      kind: 'zoneSpec',
      zone: 'hand',
      from: 'graveyard',
      whose: 'you',
      span,
      rule: ID,
    };
    return {
      ok: true,
      value: [
        {
          kind: 'clause',
          verb: 'return',
          args: { objects, to: spec },
          optional: false,
          span,
          rule: ID,
        },
      ],
      pos: r.pos,
    };
  },
});

export const RETURN_IT_SELF_GRAVEYARD_EFFECT_RULES = [EFFECT_RETURN_IT_SELF_GRAVEYARD];
