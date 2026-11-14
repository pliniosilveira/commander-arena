/**
 * Restriction rules of group 2 of the Feather deck (issue 27, D-444): "Activate only as a sorcery and only if you've cast an instant or sorcery spell this turn." (Hall of
 * Oracles). The other order, "Activate only if <condition> and only as a sorcery.", is `restriction.if`.
 */
import { literal, sequence } from '../../combinators';
import type { IrCondition, IrRestriction } from '../../ir/types';
import { defineRule, family } from '../registry';

/**
 * `restriction.sorcery-and-if`: "Activate only as a sorcery and only if you've cast an instant or sorcery spell this turn." (CR 602.5b, 602.5d: the two restrictions of one
 * ability, the timing of a sorcery and a condition read as the ability is activated). One node with both, as `restriction.if` makes for the other order. A third restriction
 * ("and only once each turn") is not read, and neither is a condition the engine does not count.
 */
export const RESTRICTION_SORCERY_AND_IF = defineRule<IrRestriction>({
  id: 'restriction.sorcery-and-if',
  family: 'restriction',
  leading: ['activate'],
  cites: [
    'CR 602.5b (Activating Activated Abilities)',
    'CR 602.5d (Activating Activated Abilities)',
    'CR 307.1 (Sorceries)',
  ],
  examples: [
    "Activate only as a sorcery and only if you've cast an instant or sorcery spell this turn.",
    'Activate only as a sorcery and only if you control five or more lands.',
    'activate only as a sorcery and only if you control a Swamp.',
  ],
  rejects: [
    "Activate only as a sorcery and only if you've cast an instant or sorcery spell this turn",
    'Activate only as a sorcery and only if',
    'Activate only as a sorcery and only if you control a Swamp and only once each turn.',
    'Activate only as a sorcery and only once each turn.',
    'Activate only as a sorcery.',
    'Activate only if you control a Swamp and only as a sorcery.',
    "Activate only as a sorcery and if you've cast an instant or sorcery spell this turn.",
    'Activate only as an instant and only if you control a Swamp.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('activate only as a sorcery and only if '),
      family<IrCondition>('condition'),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const restriction: IrRestriction = {
      kind: 'restriction',
      condition: r.value[1],
      timing: 'sorcery',
      span: { start: pos, end: r.pos },
      rule: 'restriction.sorcery-and-if',
    };
    return { ok: true, value: restriction, pos: r.pos };
  },
});

export const FEATHER_G2_RESTRICTION_RULES = [RESTRICTION_SORCERY_AND_IF];
