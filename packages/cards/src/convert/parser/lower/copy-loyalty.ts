/**
 * Lowerings of the Planeswalker Party deck (issue 132, Jaya's Phoenix, Leori, Repeated Reverberation).
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { amountArg, arg, type Effects, failure } from './clauses';
import type { Lowering } from './types';

const flagged = (clause: IrClause, name: string): boolean => {
  const a = arg(clause, name);
  return a?.kind === 'flag' && a.value;
};

/** "Copy the next loyalty ability ...", "... whenever you activate an ability of a planeswalker of that type, copy that ability", "... copy that spell or ability twice": the engine's `delayedCopy`. */
const DELAYED_COPY: Lowering<IrClause, Effects> = {
  head: 'delayedCopy',
  id: 'lower.delayed-copy',
  needs: ['effect:delayedCopy', 'effect:copySpell'],
  lower(clause) {
    const casts = [
      ...(flagged(clause, 'instant')
        ? [{ types: ['instant' as const], stackKind: 'spell' as const }]
        : []),
      ...(flagged(clause, 'sorcery')
        ? [{ types: ['sorcery' as const], stackKind: 'spell' as const }]
        : []),
    ];
    const ofChosenType = flagged(clause, 'ofChosenType');
    const loyalty = flagged(clause, 'loyalty');
    if (!ofChosenType && !loyalty && casts.length === 0) return failure(clause);
    const effect: Effect = {
      kind: 'delayedCopy',
      ...(casts.length === 0 ? {} : { casts }),
      ...(ofChosenType || loyalty
        ? {
            activation: {
              ...(loyalty ? { loyalty: true as const } : {}),
              ...(ofChosenType ? { ofChosenType: true as const } : {}),
            },
          }
        : {}),
      ...(flagged(clause, 'twice') ? { count: 2 } : {}),
      ...(flagged(clause, 'repeat') ? { repeat: true as const } : {}),
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/** "Choose a planeswalker type": the engine's `chooseCreatureType` over the planeswalker types. */
const CHOOSE_PLANESWALKER_TYPE: Lowering<IrClause, Effects> = {
  head: 'choosePlaneswalkerType',
  id: 'lower.choose-planeswalker-type',
  needs: ['effect:chooseCreatureType'],
  lower: (clause) => ({
    ok: true,
    value: [{ kind: 'chooseCreatureType', planeswalker: true }],
    rule: clause.rule,
  }),
};

/** "Until your next turn, whenever a creature an opponent controls attacks, it gets -N/-M until end of turn": the engine's `delayedAttackerPump` (the numbers are what the creature loses). */
const DELAYED_ATTACKER_PUMP: Lowering<IrClause, Effects> = {
  head: 'delayedAttackerPump',
  id: 'lower.delayed-attacker-pump',
  needs: ['effect:delayedAttackerPump'],
  lower(clause, ctx) {
    const power = amountArg(clause, 'power', ctx);
    const toughness = amountArg(clause, 'toughness', ctx);
    if (!power.ok) return power;
    if (!toughness.ok) return toughness;
    if (typeof power.value !== 'number' || typeof toughness.value !== 'number') {
      return failure(clause);
    }
    return {
      ok: true,
      value: [{ kind: 'delayedAttackerPump', power: -power.value, toughness: -toughness.value }],
      rule: clause.rule,
    };
  },
};

export const COPY_LOYALTY_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  DELAYED_ATTACKER_PUMP,
  DELAYED_COPY,
  CHOOSE_PLANESWALKER_TYPE,
];
