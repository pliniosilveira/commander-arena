/**
 * Lowering of the riders of a permission to play exiled cards (Flint deck, issue 685): "mana of any type can be spent to cast it" (`anyManaType`) and "pay life equal to its mana value rather
 * than pay its mana cost" (`lifeForMana`), CR 609.4b, 118.9. The sentence is not an instruction of its own: it completes the `mayPlay` right before it and is refused anywhere else.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrSentence } from '../ir/types';
import type { Effects } from './clauses';
import { missingFeatures } from './features';
import type { LowerFailure, LowerResult } from './types';

interface Step {
  readonly effects: Effects;
}

type MayPlay = Extract<Effect, { kind: 'mayPlay' }>;

/** The effect `lowerMayPlayRider` makes of the rider in `sentence`, or null when the sentence is no such rider. */
export function lowerMayPlayRider(
  sentence: IrSentence,
  previous: Step | undefined,
  refuse: (sentence: IrSentence) => LowerFailure,
): LowerResult<Effects> | null {
  const [clause, ...more] = sentence.clauses;
  const verb = clause?.verb;
  if (verb !== 'anyTypeRider' && verb !== 'lifeRider' && verb !== 'ownerLosesRider') return null;
  if (more.length > 0 || clause?.optional || sentence.condition !== undefined) {
    return refuse(sentence);
  }
  if (clause?.condition !== undefined || clause?.duration !== undefined) return refuse(sentence);
  const [effect, ...rest] = previous?.effects ?? [];
  if (effect?.kind !== 'mayPlay' || rest.length > 0) return refuse(sentence);
  // The Ruinous Powers (CR 603.7, 119.3): "When you cast a spell this way, its owner loses life equal to its mana value": a delayed trigger for the cast of the card this turn.
  if (verb === 'ownerLosesRider') {
    if (effect.whenCast !== undefined || effect.lasts !== 'endOfTurn') return refuse(sentence);
    const blocked = missingFeatures(['ability:mayPlayWhenCast']);
    if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
    return {
      ok: true,
      value: [
        {
          ...effect,
          whenCast: {
            kind: 'loseLife',
            player: { kind: 'ownerOf', of: { kind: 'triggerSubject' } },
            amount: { kind: 'manaValueOf', of: { kind: 'triggerSubject' } },
          },
        },
      ],
      rule: clause?.rule ?? '',
    };
  }
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
