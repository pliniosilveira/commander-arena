/**
 * Effect rules of the Revival Trance deck (issue 97), group D: "that player chooses up to two creatures they control, then sacrifices the rest" (Archfiend of Depravity, CR 608.2d,
 * 701.21a, 101.4). The lowering is in `lower/keeps-up-to.ts`.
 */
import { fail, pattern, sequence } from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const COUNT_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};

/**
 * `effect.player-keeps-up-to-and-sacrifices-the-rest`: "that player chooses up to two creatures they control, then sacrifices the rest" (CR 608.2d: the player chooses as the effect
 * resolves, the choice does not target; CR 701.21a: the rest are sacrificed by their controller; CR 101.4). The engine's `keepOrSacrifice` with `keepAtMost` for the player the subject
 * names, which the lowering reads as the player the trigger is about. Not read: another subject ("each player", "you"), "any number", a number above five, a kind of permanent other than
 * creatures, "the others", more words after it.
 */
export const EFFECT_PLAYER_KEEPS_UP_TO_AND_SACRIFICES_THE_REST = defineRule<Clauses>({
  id: 'effect.player-keeps-up-to-and-sacrifices-the-rest',
  family: 'effect',
  leading: ['that'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 701.21a (Sacrifice)',
    'CR 101.4 (Strict Timing Order)',
  ],
  examples: [
    'that player chooses up to two creatures they control, then sacrifices the rest',
    'that player chooses up to one creature they control, then sacrifices the rest',
    'that player chooses up to three creatures they control, then sacrifices the rest',
  ],
  rejects: [
    'that player chooses any number of creatures they control, then sacrifices the rest',
    'that player chooses two creatures they control, then sacrifices the rest',
    'that player chooses up to two artifacts they control, then sacrifices the rest',
    'that player chooses up to two creatures they control, then sacrifices the others',
    'that player chooses up to two creatures you control, then sacrifices the rest',
    'that player chooses up to nine creatures they control, then sacrifices the rest',
    'that player chooses up to two creatures they control, then sacrifices the rest and draws a card',
    'each opponent chooses up to two creatures they control, then sacrifices the rest',
    'that player chooses up to two creatures they control, then discards the rest',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        family<IrNoun>('noun', { only: ['noun.that-player'] }),
        pattern(
          / chooses up to (one|two|three|four|five) creatures? they control, then sacrifices the rest(?![\p{L}\p{N}]| and )/iu,
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [player, m] = r.value.value;
    const word = m[1]?.toLowerCase();
    const limit = word === undefined ? undefined : COUNT_WORDS[word];
    if (limit === undefined) return fail(ctx, pos);
    const count: IrAmount = { kind: 'number', value: limit, span: r.value.span };
    return {
      ok: true,
      value: [
        makeClause(
          'effect.player-keeps-up-to-and-sacrifices-the-rest',
          'keepUpToAndSacrifice',
          { player, limit: count },
          r.value.span,
        ),
      ],
      pos: r.pos,
    };
  },
});

export const KEEPS_UP_TO_EFFECT_RULES = [EFFECT_PLAYER_KEEPS_UP_TO_AND_SACRIFICES_THE_REST];
