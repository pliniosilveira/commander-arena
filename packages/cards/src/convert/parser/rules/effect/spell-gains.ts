/**
 * "Whenever you cast an artifact creature spell, it gains sunburst." and "When you next cast an artifact spell this turn, that spell gains sunburst." (CR 702.44a, 702.44d): the spell
 * whose casting caused the trigger gains Sunburst, which the permanent it becomes reads as it enters.
 */
import { pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, node, quietly } from '../registry';
import { type Clauses, makeClause } from './operands';

/** "that spell" or "it": the spell of the cast trigger, bound by the binding pass (the lowering reads it only there). */
const THE_SPELL = node<RegExpExecArray, IrNoun>(
  'effect.spell-gains-sunburst',
  pattern(new RegExp(`(?:that spell|it)(?= gains sunburst${BOUNDARY})`, 'iu')),
  (m) => ({
    kind: 'noun',
    det: 'anaphor',
    filter: { raw: m[0] },
    upTo: false,
    plural: false,
    other: false,
  }),
);

/**
 * `effect.spell-gains-sunburst`: "it gains sunburst", "that spell gains sunburst" (CR 702.44a, 702.44d, 400.7): no duration, because the keyword matters only as the permanent enters
 * (a spell and the permanent it becomes are different objects). The engine's `spellGainsKeyword` of the spell of the trigger. Not read: another keyword, a duration, another
 * subject (a creature, "this spell"), "gain" in the plural, more in the same sentence.
 */
export const EFFECT_SPELL_GAINS_SUNBURST = defineRule<Clauses>({
  id: 'effect.spell-gains-sunburst',
  family: 'effect',
  leading: ['it', 'that'],
  cites: [
    'CR 702.44a (Sunburst)',
    'CR 702.44d (Sunburst)',
    'CR 400.7 (General)',
    'CR 601.2i (Casting Spells)',
  ],
  examples: ['it gains sunburst', 'that spell gains sunburst', 'It gains sunburst'],
  rejects: [
    'it gains sunburst until end of turn',
    'it gains flying',
    'that spell gains flying',
    'that spells gain sunburst',
    'they gain sunburst',
    'that creature gains sunburst',
    'it gain sunburst',
    'it gains sunburst and haste',
    'it gains',
    'item gains sunburst',
  ],
  parse: (ctx, pos) => {
    const spell = THE_SPELL(ctx, pos);
    if (!spell.ok) return spell;
    const after = pattern(/ gains sunburst(?![\p{L}\p{N}])(?=\.|$)/iu)(ctx, spell.pos);
    if (!after.ok) return after;
    return {
      ok: true,
      value: [
        makeClause(
          'effect.spell-gains-sunburst',
          'spellGainsKeyword',
          { spell: spell.value },
          { start: pos, end: after.pos },
        ),
      ],
      pos: after.pos,
    };
  },
});

// Read quietly: a line these rules do not read keeps the diagnostic of `effect.gain-keyword`.
export const SPELL_GAINS_EFFECT_RULES = [EFFECT_SPELL_GAINS_SUNBURST].map(quietly);
