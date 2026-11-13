/**
 * Effect rules of group 7 of the Hashaton deck (issue 31, D-1130 to D-1139): "there is an additional beginning phase after this phase" (Sphinx of the Second Sun).
 */
import { pattern } from '../../combinators';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.extra-beginning-phase`: "there is an additional beginning phase after this phase" (CR 500.8, 500.10, 500.1, 502-504; D-1130): when the phase that is going on
 * is over, a whole beginning phase follows it, with its untap, upkeep and draw steps (the parenthesis of the card, "The beginning phase includes the untap, upkeep, and
 * draw steps", is reminder text). The same words as `effect.extra-combat-after` for another kind of phase. The engine only runs it where it knows which phase that is
 * (`validateCard`: an ability of the beginning of the postcombat main phase). Only one phase, after "this phase", with nothing joined to it.
 */
export const EFFECT_EXTRA_BEGINNING_PHASE = defineRule<Clauses>({
  id: 'effect.extra-beginning-phase',
  family: 'effect',
  leading: ["there's", 'there’s', 'there'],
  cites: [
    'CR 500.8 (General)',
    'CR 500.10 (General)',
    'CR 500.1 (General)',
    'CR 502.1 (Untap Step)',
  ],
  examples: [
    'there is an additional beginning phase after this phase',
    "there's an additional beginning phase after this phase",
    'there’s an additional beginning phase after this phase',
  ],
  rejects: [
    'there is an additional beginning phase',
    'there is an additional beginning phase after this turn',
    'there is an additional beginning phase after that phase',
    'there is an additional beginning phase after this phase and draw a card',
    'there is an additional beginning phase after this phase, then draw a card',
    'there are two additional beginning phases after this phase',
    'there is an additional upkeep step after this phase',
    'there is an additional ending phase after this phase',
    'there is another beginning phase after this phase',
    'there is an additional beginning phase after this phase.',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /there(?:['’]s| is) an additional beginning phase after this phase(?![\p{L}\p{N}])(?!,| and\b| then\b)/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause('effect.extra-beginning-phase', 'extraBeginningPhase', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

export const HASHATON_G7_EFFECT_RULES = [EFFECT_EXTRA_BEGINNING_PHASE].map(quietly);
