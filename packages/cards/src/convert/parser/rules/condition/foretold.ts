/**
 * The condition of a foretold spell (CR 702.143a): "~ was foretold", read after the "if" of a sentence of a spell ("If this spell was foretold, return all creature cards ... instead.").
 * The engine reads it from the spell, so only a spell's own sentence is lowered.
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `condition.foretold`: "~ was foretold" (the card's own name, or "this spell" before normalization). Not "it was foretold" (which object "it" is would be a guess), a negation or a
 * count of times.
 */
export const CONDITION_FORETOLD = defineRule<IrCondition>({
  id: 'condition.foretold',
  family: 'condition',
  leading: ['~'],
  cites: ['CR 702.143a (Foretell)'],
  examples: ['~ was foretold'],
  rejects: [
    '~ was foretold.',
    '~ was not foretold',
    'it was foretold',
    '~ was',
    '~',
    'that spell was foretold',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/~ was foretold(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: { kind: 'condition', test: { kind: 'foretold' }, span, rule: 'condition.foretold' },
      pos: r.pos,
    };
  },
});
