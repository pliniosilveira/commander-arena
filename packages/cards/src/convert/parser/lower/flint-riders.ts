/**
 * Lowering of the riders of a permission to play exiled cards (Flint deck, issue 685): "mana of any type can be spent to cast it" (`anyManaType`) and "pay life equal to its mana value rather
 * than pay its mana cost" (`lifeForMana`), CR 609.4b, 118.9. The sentence is not an instruction of its own: it completes the `mayPlay` right before it and is refused anywhere else.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrSentence } from '../ir/types';
import type { Effects } from './clauses';
import type { LowerResult } from './types';

interface Step {
  readonly effects: Effects;
}

type MayPlay = Extract<Effect, { kind: 'mayPlay' }>;

/** The effect `lowerMayPlayRider` makes of the rider in `sentence`, or null when the sentence is no such rider. */
export function lowerMayPlayRider(
  sentence: IrSentence,
  previous: Step | undefined,
  refuse: (sentence: IrSentence) => LowerResult<Effects>,
): LowerResult<Effects> | null {
  const [clause, ...more] = sentence.clauses;
  const verb = clause?.verb;
  if (verb !== 'anyTypeRider' && verb !== 'lifeRider') return null;
  if (more.length > 0 || clause?.optional || sentence.condition !== undefined) {
    return refuse(sentence);
  }
  if (clause?.condition !== undefined || clause?.duration !== undefined) return refuse(sentence);
  const [effect, ...rest] = previous?.effects ?? [];
  if (effect?.kind !== 'mayPlay' || rest.length > 0) return refuse(sentence);
  // Either way of paying is the one way; another rider, or a free or reduced cost, has no mana cost left to change (`validateCard`).
  if (
    effect.anyManaType !== undefined ||
    effect.anyManaColor !== undefined ||
    effect.lifeForMana !== undefined ||
    effect.free !== undefined
  ) {
    return refuse(sentence);
  }
  const done: MayPlay =
    verb === 'anyTypeRider' ? { ...effect, anyManaType: true } : { ...effect, lifeForMana: true };
  return { ok: true, value: [done], rule: clause?.rule ?? '' };
}
