/**
 * Lowering of "Until end of turn, any time you could activate a mana ability, you may pay 1 life. If you do, add {C}." (Quandrix Unlimited deck; Channel).
 */
import type { ManaColor } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import type { Lowering } from './types';

/**
 * The engine's `grantPlayerManaAbility` of "you" until end of turn (CR 605.1a, 118.3, 611.2): the "you may" and "if you do" of the sentences are what the ability is (a cost the player
 * pays when they choose to activate it), so the clause asks nothing more of the player and is accepted.
 */
const PLAYER_MANA_ABILITY: Lowering<IrClause, Effects> = {
  head: 'playerManaAbility',
  id: 'lower.player-mana-ability',
  needs: ['effect:grantPlayerManaAbility'],
  acceptsOptional: true,
  lower(clause) {
    const life = clause.args.life;
    const mana = clause.args.mana;
    if (
      life?.kind !== 'number' ||
      mana?.kind !== 'manaSpec' ||
      mana.what.kind !== 'symbols' ||
      mana.what.symbols.length !== 1
    ) {
      return { ok: false, needs: [], at: clause.span, rule: clause.rule };
    }
    const symbol = mana.what.symbols[0] as ManaColor;
    return {
      ok: true,
      value: [
        {
          kind: 'grantPlayerManaAbility',
          player: { kind: 'you' },
          life: life.value,
          mana: symbol,
          duration: 'untilEndOfTurn',
        },
      ],
      rule: clause.rule,
    };
  },
};

export const PLAYER_MANA_ABILITY_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  PLAYER_MANA_ABILITY,
];
