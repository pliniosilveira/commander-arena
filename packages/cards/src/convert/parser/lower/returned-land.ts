/**
 * Lowerings of the Elminster deck (issue 590, Princess Yue): what the card a dies trigger returned to the battlefield is now. "She's a land named Moon." is the engine's
 * `setTypes` (the card type land, the name) and 'She gains "{T}: Add {C}."' its `grantAbility` of a mana ability, both of `moved` (the new object the move made, CR 400.7,
 * 400.7j) and with no end (CR 611.2a). `ctx.lastEffectKind` says the instruction before: a move of a card, then the naming.
 */
import type { IrClause, IrQuotedAbility } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { lowerQuotedGrantedManaAbility } from './quoted-ability';
import type { Lowering } from './types';

const RETURNED_IS_NAMED_LAND: Lowering<IrClause, Effects> = {
  head: 'returnedIsNamedLand',
  id: 'lower.returned-is-named-land',
  needs: ['effect:setTypes', 'selector:moved'],
  lower(clause, ctx) {
    const named = arg(clause, 'name');
    if (named?.kind !== 'name' || ctx.lastEffectKind !== 'moveToZone') return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'setTypes',
          objects: { kind: 'moved' },
          types: ['land'],
          name: named.name,
          duration: 'permanent',
        },
      ],
      rule: clause.rule,
    };
  },
};

const RETURNED_GAINS_MANA_ABILITY: Lowering<IrClause, Effects> = {
  head: 'returnedGainsManaAbility',
  id: 'lower.returned-gains-mana-ability',
  needs: ['effect:grantAbility', 'selector:moved'],
  lower(clause, ctx) {
    const quoted = arg(clause, 'ability');
    if (quoted?.kind !== 'quoted' || ctx.lastEffectKind !== 'setTypes') return failure(clause);
    const mana = lowerQuotedGrantedManaAbility(quoted as IrQuotedAbility, clause, ['land'], ctx);
    if (!mana.ok) return mana;
    return {
      ok: true,
      value: [
        {
          kind: 'grantAbility',
          objects: { kind: 'moved' },
          abilities: [mana.value],
          duration: 'permanent',
        },
      ],
      rule: clause.rule,
    };
  },
};

export const RETURNED_LAND_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  RETURNED_IS_NAMED_LAND,
  RETURNED_GAINS_MANA_ABILITY,
];
