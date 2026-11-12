/**
 * Lowerings of the Bruna deck program, Dawnbreak Reclaimer (stage P69, D-272): the instruction the grammar reads for this card that no other file lowers.
 */
import type { CardType } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import type { Lowering } from './types';

/**
 * "Choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard. You may return those cards to the battlefield under their
 * owners' control" (CR 608.2c, 608.2d, 110.2a): the engine's `returnGraveyardPair` with the one card type of both choices.
 */
const RETURN_GRAVEYARD_PAIR: Lowering<IrClause, Effects> = {
  head: 'returnGraveyardPair',
  id: 'lower.return-graveyard-pair',
  needs: ['effect:returnGraveyardPair'],
  lower: (clause) => {
    const types = arg(clause, 'types');
    const [cardType] = types?.kind === 'typeList' ? (types.cardTypes ?? []) : [];
    if (cardType === undefined || types?.kind !== 'typeList' || types.cardTypes?.length !== 1) {
      return failure(clause);
    }
    return {
      ok: true,
      value: [{ kind: 'returnGraveyardPair', cardType: cardType as CardType }],
      rule: clause.rule,
    };
  },
};

export const DAWNBREAK_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [RETURN_GRAVEYARD_PAIR];
