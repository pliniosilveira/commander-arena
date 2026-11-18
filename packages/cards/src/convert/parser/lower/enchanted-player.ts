/**
 * Lowering of "Each opponent attacking that player untaps all nonland permanents they control." (issue 160, D-613, CR 701.26a): in the body of "Whenever enchanted player is
 * attacked" only. One trigger is for one declaration of attackers, and one player declares them: that player is the engine's `triggerPlayer`. The nonland permanents they
 * control untap; when the attacking player is the controller of the Aura, who is not their own opponent, it untaps the same permanents the sentence before it did.
 */
import type { IrClause } from '../ir/types';
import { type Effects, failure } from './clauses';
import { missingFeatures } from './features';
import type { Lowering } from './types';

export const UNTAP_ATTACKING_OPPONENTS: Lowering<IrClause, Effects> = {
  head: 'untapAttackingOpponents',
  id: 'lower.untap-attacking-opponents',
  needs: ['effect:untap', 'selector:each', 'selector:triggerPlayer'],
  lower(clause, ctx) {
    if (!ctx.enchantedPlayerTrigger) return failure(clause);
    const missing = missingFeatures(['effect:untap', 'selector:each', 'selector:triggerPlayer']);
    if (missing.length > 0) {
      return { ok: false, needs: missing, at: clause.span, rule: clause.rule };
    }
    return {
      ok: true,
      value: [
        {
          kind: 'untap',
          objects: {
            kind: 'each',
            filter: { zone: 'battlefield', notTypes: ['land'], controller: 'triggerPlayer' },
          },
        },
      ],
      rule: clause.rule,
    };
  },
};

export const ENCHANTED_PLAYER_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  UNTAP_ATTACKING_OPPONENTS,
];
