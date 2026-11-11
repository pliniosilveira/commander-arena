/**
 * `effect.sacrifice`: "Sacrifice ~", "sacrifice another permanent", "sacrifice a creature" (CR
 * 701.21). You can only sacrifice permanents you control (CR 701.21a), so the object is "~" or a
 * noun the acting player picks (`noun.a-permanent`), never a target and never someone else's. "Sacrifice it"
 * (stage P23: "sacrifice it unless it escaped") is read too; the binding pass says what "it" is, and the
 * lowering sacrifices only the permanent the ability belongs to. Since stage P30 (D-135) "any number of other permanents" is read too
 * (CR 701.21a: the player chooses none, some or all), and since stage P41 (D-188) "one or more Treasures" (some or all, not none).
 */
import { literal, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import { type Clauses, single } from './operands';

export const EFFECT_SACRIFICE = defineRule<Clauses>({
  id: 'effect.sacrifice',
  family: 'effect',
  leading: ['sacrifice'],
  cites: [
    'CR 701.21 (Sacrifice)',
    'CR 701.21a (Sacrifice)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    'sacrifice another permanent',
    'sacrifice a creature',
    'sacrifice ~',
    'sacrifice two lands',
    'sacrifice an artifact',
    'sacrifice a Dragon',
    'sacrifice it',
    'sacrifice any number of other permanents',
    'sacrifice any number of creatures',
    'sacrifice one or more Treasures',
    'sacrifice one or more other creatures',
  ],
  rejects: [
    'sacrifice target creature',
    'sacrifice a creature an opponent controls',
    'sacrifice',
    'sacrifice them',
    'sacrifice all creatures',
    'sacrifice any number of creatures an opponent controls',
    'sacrifice any number of target creatures',
    'sacrifice one or more target creatures',
    'sacrifice one or more creatures an opponent controls',
  ],
  parse: single(
    'effect.sacrifice',
    sequence(
      literal('sacrifice '),
      family<IrNoun>('noun', {
        only: [
          'noun.self',
          'noun.a-permanent',
          'noun.any-number-permanents',
          'noun.one-or-more-permanents',
          'noun.it',
        ],
      }),
    ),
    ([, objects]) => ({ verb: 'sacrifice', args: { objects } }),
  ),
});

export const SACRIFICE_RULES = [EFFECT_SACRIFICE];
