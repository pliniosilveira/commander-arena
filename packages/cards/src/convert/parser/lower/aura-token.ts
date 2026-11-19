/**
 * The clause lowering of an Aura token an effect creates attached to a target (issue 89, CR 303.4f, 111.4).
 */
import type {
  Ability,
  Amount,
  CardType,
  Color,
  PlayerSelector,
  TokenDefinition,
} from '@commander-arena/engine';
import type { IrClause, IrToken } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { missingFeatures } from './features';
import { objectRefOf } from './nouns';
import { lowerTokenAbility, tokenRulesText } from './tokens';
import type { LowerContext, LowerResult } from './types';

/**
 * "Create a white Aura enchantment token named Contract attached to target creature an opponent controls. The token has enchant creature and \"...\"" (issue 89, CR 303.4f, 303.4g,
 * 111.2, 111.4, 702.5a): the engine's `createToken` of a custom Aura token with `attachTo` the target of the text. One token of one color that enchants a creature; its abilities
 * in quotes are read as the face of an Aura (the "enchanted creature" they say is the permanent it is attached to). Anything else is refused: the engine creates an Aura token only
 * attached to a target.
 */
export function lowerAuraToken(
  clause: IrClause,
  token: IrToken,
  count: Amount,
  entersTapped: { tapped?: true },
  by: { controller?: PlayerSelector },
  colors: readonly Color[],
  types: readonly CardType[],
  ctx: LowerContext,
): LowerResult<Effects> {
  const at = { at: token.span, rule: token.rule };
  const host = arg(clause, 'attachTo');
  const subtypes = [...(token.subtypes ?? [])];
  if (
    host?.kind !== 'noun' ||
    token.enchantsCreature !== true ||
    types.length !== 1 ||
    types[0] !== 'enchantment' ||
    subtypes.length !== 1 ||
    subtypes[0] !== 'Aura' ||
    token.power !== undefined ||
    token.toughness !== undefined ||
    token.ptAmount === true ||
    token.legendary === true ||
    (token.keywords ?? []).length > 0 ||
    entersTapped.tapped === true ||
    by.controller !== undefined ||
    count !== 1 ||
    host.det !== 'target' ||
    host.plural ||
    host.upTo
  ) {
    return { ok: false, needs: [], ...at };
  }
  const blocked = missingFeatures([
    'token:custom',
    'token:attached',
    'ability:keyword',
    'keyword:enchant',
    'selector:target',
  ]);
  if (blocked.length > 0) return { ok: false, needs: blocked, ...at };
  const abilities: Ability[] = [
    { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
  ];
  for (const quoted of token.abilities ?? []) {
    const own = lowerTokenAbility(quoted, types, subtypes, ctx);
    if (!own.ok) return own;
    abilities.push(own.value);
  }
  const named = token.named;
  const onto = objectRefOf(host, ctx);
  if (!onto.ok) return onto;
  if (onto.value.kind !== 'target') return failure(clause);
  const own = tokenRulesText([], token.abilities ?? [], named);
  const definition: TokenDefinition = {
    // CR 111.4: the name the effect gives the token, or else its subtypes.
    name: named ?? 'Aura',
    manaCost: null,
    supertypes: [],
    types: [...types],
    subtypes,
    colors: [...colors],
    power: null,
    toughness: null,
    loyalty: null,
    defense: null,
    oracleText: own === '' ? 'Enchant creature' : `Enchant creature\n${own}`,
    abilities,
  };
  return {
    ok: true,
    value: [
      {
        kind: 'createToken',
        token: { kind: 'custom', definition },
        count,
        attachTo: { kind: 'target', id: onto.value.id },
      },
    ],
    rule: clause.rule,
  };
}
