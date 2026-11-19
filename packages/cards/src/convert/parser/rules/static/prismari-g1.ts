/**
 * Static statements of group 1 of the Prismari deck (issue 87, D-641): "Strive — ~ costs {2}{R} more to cast for each target beyond the first." (CR 601.2f, 601.2c, 207.2c: Strive is an
 * ability word; the cost is an increase of the total cost, worked out after the targets are chosen).
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `static.cost-per-extra-target`: "~ costs {2}{R} more to cast for each target beyond the first." A static ability of the spell itself: the engine's `costPerExtraTarget`. Mana
 * symbols of one to four, none of them {X}. Not read: "less", another count than "each target beyond the first", "to activate", no period, a condition after it.
 */
export const STATIC_COST_PER_EXTRA_TARGET = defineRule<IrStatic>({
  id: 'static.cost-per-extra-target',
  family: 'static',
  leading: ['~'],
  cites: [
    'CR 601.2f (Casting Spells)',
    'CR 601.2c (Casting Spells)',
    'CR 207.2c (Ability Words)',
    'CR 118.8 (Costs)',
  ],
  examples: [
    '~ costs {2}{R} more to cast for each target beyond the first.',
    '~ costs {1}{B} more to cast for each target beyond the first.',
    '~ costs {3} more to cast for each target beyond the first.',
  ],
  rejects: [
    '~ costs {2}{R} more to cast for each target beyond the first',
    '~ costs {2}{R} less to cast for each target beyond the first.',
    '~ costs {2}{R} more to cast for each target.',
    '~ costs {2}{R} more to cast for each target beyond the second.',
    '~ costs {2}{R} more to activate for each target beyond the first.',
    '~ costs {X} more to cast for each target beyond the first.',
    '~ costs more to cast for each target beyond the first.',
    '~ costs {2}{R} more to cast for each target beyond the first if you control a creature.',
    '~ costs {2}{R} more to cast.',
  ],
  parse: (ctx, pos) => {
    const id = 'static.cost-per-extra-target';
    const r = sequence(
      literal('~ costs '),
      pattern(/(?:\{[0-9WUBRGC]\}){1,4}/u),
      literal(' more to cast for each target beyond the first.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const symbols = [...r.value[1][0].matchAll(/\{([0-9WUBRGC])\}/gu)].map((m) => m[1] ?? '');
    const subject: IrNoun = {
      kind: 'noun',
      det: 'self',
      filter: { raw: '~' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos + 1 },
      rule: id,
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [{ kind: 'costPerExtraTarget', cost: symbols }],
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const PRISMARI_G1_STATIC_RULES = [STATIC_COST_PER_EXTRA_TARGET];
