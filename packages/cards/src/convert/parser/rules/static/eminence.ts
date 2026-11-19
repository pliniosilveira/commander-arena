/**
 * Static rule of the Multiverse Reforged deck (issue 81, The Ur-Sphinx): the cost reduction of an Eminence ability (CR 113.6, 903.3).
 */
import { fail, literal } from '../../combinators';
import type { IrStatic } from '../../ir/types';
import { defineRule } from '../registry';
import { STATIC_SPELLS_COST_REDUCTION } from './cost';

const PREFIX = 'as long as ~ is in the command zone or on the battlefield, ';

/**
 * `static.eminence-cost-reduction`: "As long as ~ is in the command zone or on the battlefield, other Sphinx spells you cast cost {1} less to cast." (CR 113.6, 604.2, 601.2f, 903.3: an
 * ability that works from the command zone as well as on the battlefield, read when the cost of a spell is determined). The reduction `static.spells-cost-reduction` reads, for the
 * spells of a kind other than the card itself ("other" is optional), marked as working in the command zone. Not read: another zone, only the command zone, only the battlefield.
 */
export const STATIC_EMINENCE_COST_REDUCTION = defineRule<IrStatic>({
  id: 'static.eminence-cost-reduction',
  family: 'static',
  leading: ['as'],
  cites: [
    'CR 113.6 (Abilities)',
    'CR 601.2f (Casting Spells)',
    'CR 604.2 (Handling Static Abilities)',
    'CR 903.3 (Commander)',
  ],
  examples: [
    'As long as ~ is in the command zone or on the battlefield, other Sphinx spells you cast cost {1} less to cast.',
    'As long as ~ is in the command zone or on the battlefield, Dragon spells you cast cost {2} less to cast.',
  ],
  rejects: [
    'As long as ~ is in the command zone, other Sphinx spells you cast cost {1} less to cast.',
    'As long as ~ is on the battlefield, other Sphinx spells you cast cost {1} less to cast.',
    'As long as ~ is in the command zone or in your graveyard, other Sphinx spells you cast cost {1} less to cast.',
    'As long as ~ is in the command zone or on the battlefield, other Sphinx spells you cast cost {1} less to cast',
    'As long as ~ is in the command zone or on the battlefield, other Sphinx spells your opponents cast cost {1} less to cast.',
    'As long as ~ is in the command zone or on the battlefield, other Sphinx spells you cast cost {W} less to cast.',
    'As long as ~ is in the command zone or on the battlefield, other Sphinx spells you cast cost {1} more to cast.',
    'As long as ~ is in the command zone or on the battlefield, ~ costs {1} less to cast.',
  ],
  parse: (ctx, pos) => {
    const head = literal(PREFIX)(ctx, pos);
    if (!head.ok) return head;
    const other = literal('other ')(ctx, head.pos);
    const at = other.ok ? other.pos : head.pos;
    const inner = STATIC_SPELLS_COST_REDUCTION.parse(ctx, at);
    if (!inner.ok) return inner;
    const [effect] = inner.value.effects;
    if (effect?.kind !== 'costReduction' || inner.value.subject.det !== 'each') {
      return fail(ctx, pos);
    }
    return {
      ok: true,
      value: {
        ...inner.value,
        subject: { ...inner.value.subject, other: other.ok },
        effects: [{ ...effect, inCommandZone: true }],
        span: { start: pos, end: inner.pos },
        rule: 'static.eminence-cost-reduction',
      },
      pos: inner.pos,
    };
  },
});

export const EMINENCE_STATIC_RULES = [STATIC_EMINENCE_COST_REDUCTION];
