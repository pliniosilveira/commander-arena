/**
 * Effect rule of the Sauron deck (Mount Doom): "Choose up to two creatures, then destroy the rest." (CR 608.2d: the controller chooses as the effect resolves, the choice does not target;
 * CR 701.8a: destroy; CR 702.12b: an indestructible creature is not destroyed). The lowering is in `lower/keep-destroy-rest.ts`.
 */
import { fail, pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const COUNT_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};

/**
 * `effect.choose-up-to-creatures-destroy-the-rest`: "choose up to two creatures, then destroy the rest" (CR 608.2d, 701.8a). The controller chooses among all the creatures, whoever
 * controls them (a creature with shroud may be chosen: nothing targets), and every other creature is destroyed. The engine's `chooseObjects` and a `destroy` of each creature but the
 * chosen. Not read: any number, a number above five, a kind of permanent other than creatures, "the others", another verb, more words after it.
 */
export const EFFECT_CHOOSE_UP_TO_CREATURES_DESTROY_THE_REST = defineRule<Clauses>({
  id: 'effect.choose-up-to-creatures-destroy-the-rest',
  family: 'effect',
  leading: ['choose'],
  cites: ['CR 608.2d (Resolving Spells and Abilities)', 'CR 701.8a (Destroy)'],
  examples: [
    'choose up to two creatures, then destroy the rest',
    'choose up to one creature, then destroy the rest',
    'choose up to three creatures, then destroy the rest',
  ],
  rejects: [
    'choose any number of creatures, then destroy the rest',
    'choose two creatures, then destroy the rest',
    'choose up to two artifacts, then destroy the rest',
    'choose up to two creatures, then destroy the others',
    'choose up to two creatures, then exile the rest',
    'choose up to nine creatures, then destroy the rest',
    'choose up to two creatures, then destroy the rest and draw a card',
    'choose up to two target creatures, then destroy the rest',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /choose up to (one|two|three|four|five) creatures?, then destroy the rest(?![\p{L}\p{N}]| and )/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const word = r.value.value[1]?.toLowerCase();
    const limit = word === undefined ? undefined : COUNT_WORDS[word];
    if (limit === undefined) return fail(ctx, pos);
    const count: IrAmount = { kind: 'number', value: limit, span: r.value.span };
    return {
      ok: true,
      value: [
        makeClause(
          'effect.choose-up-to-creatures-destroy-the-rest',
          'keepUpToAndDestroy',
          { limit: count },
          r.value.span,
        ),
      ],
      pos: r.pos,
    };
  },
});

export const KEEP_DESTROY_REST_EFFECT_RULES = [EFFECT_CHOOSE_UP_TO_CREATURES_DESTROY_THE_REST];
