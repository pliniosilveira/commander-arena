/**
 * Lowering of Strago and Relm (deck support issue 97): "Target opponent exiles cards from the top of their library until they exile an instant, sorcery, or creature card. You may cast
 * that card without paying its mana cost. If you cast a creature spell this way, it gains haste and "At the beginning of the end step, sacrifice this creature."" (CR 701.13, 608.2g,
 * 118.9, 613.1f).
 */
import type { Ability, Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { withoutZone } from '../rules/noun/phrases';
import { arg, type Effects, failure, operand } from './clauses';
import { missingFeatures } from './features';
import { lowerFilter, playerSelectorOf } from './nouns';
import { lowerTokenAbility } from './tokens';
import type { Lowering } from './types';

/**
 * The engine's `exileUntilFound` of the library of the one player the ability targets, then the `castFree` of the card it exiled (`moved`) that the same filter describes (the cards
 * exiled before it stay in exile and are not offered), asked of the controller. With the rider, `creatureGains` gives the permanent a creature spell cast this way becomes haste and
 * the quoted ability, which must be one the engine runs on a creature.
 */
const EXILE_UNTIL_CAST_FREE: Lowering<IrClause, Effects> = {
  head: 'exileUntilCastFree',
  id: 'lower.exile-until-cast-free',
  needs: ['effect:exileUntilFound', 'effect:castFree', 'selector:moved', 'selector:target'],
  lower(clause, ctx) {
    const player = operand(clause, 'player');
    const card = arg(clause, 'card');
    if (player?.kind !== 'noun' || card?.kind !== 'noun') return failure(clause);
    // One player, chosen as the ability is put on the stack.
    if (player.det !== 'target' || player.anyNumber === true) return failure(clause);
    const from = playerSelectorOf(player, ctx);
    if (!from.ok) return from;
    const filter = lowerFilter({ ...card, filter: withoutZone(card.filter) });
    if (!filter.ok) return filter;
    const quoted = arg(clause, 'quoted');
    let creatureGains: readonly Ability[] | undefined;
    if (quoted !== undefined) {
      if (quoted.kind !== 'quoted') return failure(clause);
      const blocked = missingFeatures(['ability:castFreeCreatureGains']);
      if (blocked.length > 0) return failure(clause, blocked);
      const ability = lowerTokenAbility(quoted, ['creature'], [], ctx);
      if (!ability.ok) return ability;
      creatureGains = [{ kind: 'keyword', keyword: { kind: 'haste' } }, ability.value];
    }
    const effects: Effect[] = [
      { kind: 'exileUntilFound', players: from.value, filter: filter.value },
      {
        kind: 'castFree',
        objects: { kind: 'moved' },
        filter: filter.value,
        ...(creatureGains === undefined ? {} : { creatureGains }),
      },
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

export const EXILE_UNTIL_CAST_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EXILE_UNTIL_CAST_FREE,
];
