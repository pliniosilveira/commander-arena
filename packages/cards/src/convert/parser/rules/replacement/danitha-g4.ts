/**
 * Replacement rules of the Danitha deck (issue 26), group 4 (D-1241): Umbra armor (CR 702.89a), the keyword of Boar Umbra, Hyena Umbra, Lion Umbra and
 * Spider Umbra. Its reminder text ("If enchanted creature would be destroyed, instead remove all damage from it and destroy this Aura.") is cut off before
 * the grammar reads the line, as the reminder of every keyword is, so the line is the two words.
 */
import { pattern } from '../../combinators';
import type { IrAbility, IrClause } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { replacement } from './shared';

/**
 * `replacement.umbra-armor`: "Umbra armor" (CR 702.89a, 614.1a: a static ability of an Aura that replaces the destruction of the permanent it is attached to
 * with removing all damage from it and destroying the Aura). The engine's `umbraArmor`, valid on an Aura face only (`validateCard`). Not read: a cost or a
 * parameter ("Umbra armor {1}"), another keyword on the same line ("Umbra armor, flying"), the words with a period, a different spelling ("Umbra Armor
 * {1}", "Umbral armor"), a preceding word.
 */
export const REPLACEMENT_UMBRA_ARMOR = defineRule<IrAbility>({
  id: 'replacement.umbra-armor',
  family: 'replacement',
  leading: ['umbra'],
  cites: [
    'CR 702.89a (Umbra Armor)',
    'CR 614.1a (Replacement Effects)',
    'CR 616.1 (Replacement Effects)',
  ],
  examples: ['Umbra armor', 'umbra armor', 'Umbra Armor'],
  rejects: [
    'Umbra armor {1}',
    'Umbra armor.',
    'Umbra armor, flying',
    'Umbral armor',
    'Umbra',
    'Umbra armor and reach',
    'Enchanted creature has umbra armor',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/umbra armor(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    const id = 'replacement.umbra-armor';
    const span = { start: pos, end: r.pos };
    const event: IrClause = {
      kind: 'clause',
      verb: 'umbraArmor',
      args: {},
      optional: false,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: r.pos };
  },
});

export const DANITHA_G4_REPLACEMENT_RULES = [REPLACEMENT_UMBRA_ARMOR].map(quietly);
