/**
 * Noun rule of the control and evasion group of the Hosts of Mordor deck (issue 150): "target nonlegendary creature an opponent controls with power less than or equal to the
 * amassed Army's power" (Grishnákh, Brash Instigator, CR 603.12, 701.47a, 208.1).
 */
import { pattern, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { permanentPhrase } from './phrases';

/**
 * `noun.target-permanent-power-at-most-amassed`: "target nonlegendary creature an opponent controls with power less than or equal to the amassed Army's power": one target
 * creature whose power is at most that of the Army the `amass` before the reflexive ability chose (the engine's `powerAtMostMoved`, read in the reflexive ability that carries the
 * Army; the lowering refuses it anywhere else). The permanent is whatever phrase of the permanent family reads the words before "with power". Not read: another comparison ("less
 * than", "greater than"), a number, another Army word, "up to", a plural, a missing "power".
 */
export const NOUN_TARGET_PERMANENT_POWER_AT_MOST_AMASSED = defineRule<IrNoun>({
  id: 'noun.target-permanent-power-at-most-amassed',
  family: 'noun',
  leading: ['target'],
  cites: [
    'CR 603.12 (Reflexive Triggered Abilities)',
    'CR 701.47a (Amass)',
    'CR 208.1 (Power/Toughness)',
    'CR 115.1 (Targets)',
  ],
  examples: [
    "target nonlegendary creature an opponent controls with power less than or equal to the amassed Army's power",
    "target creature with power less than or equal to the amassed Army's power",
    'target creature an opponent controls with power less than or equal to the amassed Army’s power',
  ],
  rejects: [
    "target creature with power less than the amassed Army's power",
    "target creature with power greater than the amassed Army's power",
    "target creature with power less than or equal to the Army's power",
    "target creature with power less than or equal to the amassed Army's toughness",
    'target creature with power less than or equal to 3',
    "target creatures with power less than or equal to the amassed Army's power",
    "up to one target creature with power less than or equal to the amassed Army's power",
    'target creature',
    "creature with power less than or equal to the amassed Army's power",
  ],
  parse: node<IrFilter, IrNoun>(
    'noun.target-permanent-power-at-most-amassed',
    (ctx, pos) => {
      const r = sequence(
        pattern(/target /iu),
        permanentPhrase(false, 'all'),
        pattern(/ with power less than or equal to the amassed Army['’]s power(?![\p{L}\p{N}])/iu),
      )(ctx, pos);
      if (!r.ok) return r;
      const [, filter] = r.value;
      const raw = ctx.text.slice(pos, r.pos);
      return { ok: true, value: { ...filter, powerAtMostMoved: true as const, raw }, pos: r.pos };
    },
    (filter) => ({
      kind: 'noun',
      det: 'target',
      filter,
      upTo: false,
      plural: false,
      other: false,
    }),
  ),
});

export const HOSTS_CONTROL_NOUN_RULES = [NOUN_TARGET_PERMANENT_POWER_AT_MOST_AMASSED];
