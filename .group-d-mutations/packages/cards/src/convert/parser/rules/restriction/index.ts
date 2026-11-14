/**
 * Restriction rules: the "Activate only ..." sentences after an activated ability's effect (CR
 * 602.5). The timing restriction and, since stage P14, "Activate only if <condition>" are read;
 * "once each turn" and "only during your turn" are new rules plus the engine feature each needs.
 */
import { fail, literal, map, optional, pattern, sequence } from '../../combinators';
import type { IrAmount, IrCondition, IrRestriction } from '../../ir/types';
import { FOR_EACH_TAIL, scaled } from '../amount/scaled';
import { defineRule, family, node } from '../registry';
import { FEATHER_G2_RESTRICTION_RULES } from './feather-g2';
import { GISA_G4_RESTRICTION_RULES } from './gisa-g4';

/**
 * `restriction.sorcery`: "Activate only as a sorcery." means the player must follow the timing
 * rules for casting a sorcery (CR 602.5d): their main phase, with the stack empty (CR 307.1).
 */
export const RESTRICTION_SORCERY = defineRule<IrRestriction>({
  id: 'restriction.sorcery',
  family: 'restriction',
  leading: ['activate'],
  cites: ['CR 602.5d (Activating Activated Abilities)', 'CR 307.1 (Sorceries)'],
  examples: ['Activate only as a sorcery.', 'activate only as a sorcery.'],
  rejects: [
    'Activate only as a sorcery',
    'Activate only once each turn.',
    'Activate only during your turn.',
    'Activate only as an instant.',
    'Activate only as a sorcery and only once each turn.',
  ],
  parse: node<string, IrRestriction>(
    'restriction.sorcery',
    map(literal('activate only as a sorcery.'), (raw) => raw),
    () => ({ kind: 'restriction', timing: 'sorcery' }),
  ),
});

/**
 * `restriction.if`: "Activate only if you control five or more lands.", "Activate only if you
 * control a Swamp." (CR 602.5b: a restriction on the use of an activated ability; it is looked at
 * when the ability is activated, and a mana ability that asks what another could produce does not
 * look at it, CR 106.7). The test is a condition rule's, so only the conditions the engine counts
 * are read; a test about anything else stays unread.
 */
export const RESTRICTION_IF = defineRule<IrRestriction>({
  id: 'restriction.if',
  family: 'restriction',
  leading: ['activate'],
  cites: [
    'CR 602.5b (Activating Activated Abilities)',
    'CR 605.3 (Activating Mana Abilities)',
    'CR 106.7 (Mana)',
  ],
  examples: [
    'Activate only if you control five or more lands.',
    'Activate only if you control a Swamp.',
    'Activate only if you control an Island or a Swamp.',
    'Activate only if you control three or more artifacts.',
    'activate only if you control a commander.',
    'Activate only if you have at least 7 life more than your starting life total and only as a sorcery.',
    'Activate only if you control a Swamp and only as a sorcery.',
    'Activate only if you have 30 or more life.',
    // Stage P63 (D-216): a token that entered under your control this turn, read from the turn log.
    'Activate only if you created a token this turn.',
  ],
  rejects: [
    'Activate only if you control a Swamp',
    'Activate only if you control a Swamp and only as a sorcery',
    'Activate only if you control a Swamp and only as an instant.',
    'Activate only if you created a token this turn and only as an instant.',
    'Activate only if',
    'Activate only if you control a Swamp and only once each turn.',
    'Activate only as a sorcery.',
    'Activate only once each turn.',
    'Activate if you control a Swamp.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('activate only if '),
      family<IrCondition>('condition'),
      // "... and only as a sorcery" (stage P29, row of Speaker of the Heavens): the two restrictions of CR 602.5b and 602.5d
      // in one sentence, one node with both.
      optional(literal(' and only as a sorcery'), null),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const restriction: IrRestriction = {
      kind: 'restriction',
      condition: r.value[1],
      ...(r.value[2] === null ? {} : { timing: 'sorcery' as const }),
      span: { start: pos, end: r.pos },
      rule: 'restriction.if',
    };
    return { ok: true, value: restriction, pos: r.pos };
  },
});

/**
 * `restriction.cost-reduction`: "This ability costs {4} less to activate if an opponent controls four or more nonbasic lands." (stage
 * P30, D-135, CR 601.2f: the total cost is worked out as the ability is activated, reduced generic mana first; CR 602.2b: activating an
 * ability follows the steps of casting a spell). The reduction is generic mana, a plain number in braces, and happens only when the
 * condition holds as the ability is activated. The sentence follows the effect of the ability it is about, like "Activate only ...".
 */
export const RESTRICTION_COST_REDUCTION = defineRule<IrRestriction>({
  id: 'restriction.cost-reduction',
  family: 'restriction',
  leading: ['this'],
  cites: [
    'CR 601.2f (Casting Spells)',
    'CR 602.2b (Activating Activated Abilities)',
    'CR 118.7 (Costs)',
  ],
  examples: [
    'This ability costs {4} less to activate if an opponent controls four or more nonbasic lands.',
    'this ability costs {2} less to activate if you control a commander.',
    'This ability costs {1} less to activate if you control two or more other lands.',
  ],
  rejects: [
    'This ability costs {4} less to activate if an opponent controls four or more nonbasic lands',
    'This ability costs {4} less to activate.',
    'This ability costs {G} less to activate if you control a commander.',
    'This ability costs {X} less to activate if you control a commander.',
    'This ability costs {0} less to activate if you control a commander.',
    'This ability costs {2}{B} less to activate if you control a commander.',
    'This ability costs {4} more to activate if you control a commander.',
    'This spell costs {4} less to cast if you control a commander.',
    'Activate only if you control a commander.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('this ability costs {'),
      pattern(/[1-9][0-9]*/u),
      literal('} less to activate if '),
      family<IrCondition>('condition'),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, digits, , condition] = r.value;
    const span = { start: pos, end: r.pos };
    const restriction: IrRestriction = {
      kind: 'restriction',
      costReduction: {
        amount: {
          kind: 'number',
          value: Number(digits[0]),
          span: {
            start: pos + 'this ability costs {'.length,
            end: pos + 'this ability costs {'.length + digits[0].length,
          },
        },
        condition,
      },
      span,
      rule: 'restriction.cost-reduction',
    };
    return { ok: true, value: restriction, pos: r.pos };
  },
});

/**
 * `restriction.once-each-turn`: "Activate only once each turn." (stage P31, D-140, CR 602.5b: a restriction on how often the ability of
 * this object may be activated; it counts again from the next turn).
 */
export const RESTRICTION_ONCE_EACH_TURN = defineRule<IrRestriction>({
  id: 'restriction.once-each-turn',
  family: 'restriction',
  leading: ['activate'],
  cites: ['CR 602.5b (Activating Activated Abilities)'],
  examples: ['Activate only once each turn.', 'activate only once each turn.'],
  rejects: [
    'Activate only once each turn',
    'Activate only twice each turn.',
    'Activate only once.',
    'Activate only once each turn and only as a sorcery.',
    'Activate only as a sorcery.',
  ],
  parse: node<string, IrRestriction>(
    'restriction.once-each-turn',
    map(literal('activate only once each turn.'), (raw) => raw),
    () => ({ kind: 'restriction', perTurn: 1 }),
  ),
});

/**
 * `restriction.cost-reduced-by`: "This ability costs {1} less to activate for each other artifact you control.", "This ability costs {2}
 * less to activate for each creature you control." (stage P31, D-140, CR 601.2f, 602.2b): generic mana less for each object counted as
 * the ability is activated. The reduction is a plain number in braces, multiplied by the count when it is more than one.
 */
export const RESTRICTION_COST_REDUCED_BY = defineRule<IrRestriction>({
  id: 'restriction.cost-reduced-by',
  family: 'restriction',
  leading: ['this'],
  cites: ['CR 601.2f (Casting Spells)', 'CR 602.2b (Activating Activated Abilities)'],
  examples: [
    'This ability costs {1} less to activate for each other artifact you control.',
    'This ability costs {2} less to activate for each creature you control.',
    'this ability costs {1} less to activate for each artifact and/or enchantment you control.',
  ],
  rejects: [
    'This ability costs {1} less to activate for each other artifact you control',
    'This ability costs {G} less to activate for each artifact you control.',
    'This ability costs {X} less to activate for each artifact you control.',
    'This ability costs {0} less to activate for each artifact you control.',
    'This ability costs {1} less to activate.',
    'This ability costs {1} more to activate for each artifact you control.',
    'This spell costs {1} less to cast for each artifact you control.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('this ability costs {'),
      pattern(/[1-9][0-9]*/u),
      literal('} less to activate'),
      FOR_EACH_TAIL,
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, digits, , each] = r.value;
    const start = pos + 'this ability costs {'.length;
    const quantity: IrAmount = {
      kind: 'number',
      value: Number(digits[0]),
      span: { start, end: start + digits[0].length },
    };
    const amount = scaled(quantity, each);
    if (amount === null) return fail(ctx, pos);
    const restriction: IrRestriction = {
      kind: 'restriction',
      costReducedBy: amount,
      span: { start: pos, end: r.pos },
      rule: 'restriction.cost-reduced-by',
    };
    return { ok: true, value: restriction, pos: r.pos };
  },
});

export const RESTRICTION_RULES = [
  RESTRICTION_SORCERY,
  RESTRICTION_IF,
  RESTRICTION_ONCE_EACH_TURN,
  RESTRICTION_COST_REDUCTION,
  RESTRICTION_COST_REDUCED_BY,
  ...FEATHER_G2_RESTRICTION_RULES,
  // Gisa deck, group 4 (D-462): "Activate only during your turn."
  ...GISA_G4_RESTRICTION_RULES,
];
