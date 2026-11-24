/**
 * Replacement rules of the Counter Intelligence deck, group 2 (moving, removing, counting and choosing counters): "If you would proliferate, proliferate twice instead." (Tekuthal,
 * Inquiry Dominus; CR 701.34a, 614.1a).
 */
import { literal } from '../../combinators';
import type { IrAbility, IrClause } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { replacement } from './shared';

const ID = 'replacement.proliferate-twice';

/**
 * `replacement.proliferate-twice`: "If you would proliferate, proliferate twice instead." (CR 701.34a: to proliferate is an action; CR 614.1a: a replacement effect of the permanent that
 * changes how many times its controller does it; CR 614.5: each such effect applies once). The player is the controller of the permanent. Not read: another player ("If an opponent
 * would proliferate"), another number of times, another replacement, a condition, a missing period.
 */
export const REPLACEMENT_PROLIFERATE_TWICE = defineRule<IrAbility>({
  id: ID,
  family: 'replacement',
  leading: ['if'],
  cites: [
    'CR 701.34a (Proliferate)',
    'CR 614.1a (Replacement Effects)',
    'CR 614.5 (Replacement Effects)',
  ],
  examples: ['If you would proliferate, proliferate twice instead.'],
  rejects: [
    'If you would proliferate, proliferate twice instead',
    'If you would proliferate, proliferate three times instead.',
    'If an opponent would proliferate, they proliferate twice instead.',
    'If you would proliferate, proliferate instead.',
    'If you would proliferate, you may proliferate twice instead.',
    'If you would proliferate, proliferate twice instead. Draw a card.',
  ],
  parse: (ctx, pos) => {
    const text = literal('if you would proliferate, proliferate twice instead.')(ctx, pos);
    if (!text.ok) return text;
    const span = { start: pos, end: text.pos };
    const event: IrClause = {
      kind: 'clause',
      verb: 'proliferateDouble',
      args: {},
      optional: false,
      span,
      rule: ID,
    };
    return { ok: true, value: replacement(ID, span, event), pos: text.pos };
  },
});

export const COUNTER_INTELLIGENCE_G2_REPLACEMENT_RULES = [REPLACEMENT_PROLIFERATE_TWICE].map(
  quietly,
);
