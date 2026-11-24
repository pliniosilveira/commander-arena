/**
 * Lowerings of the Sliver Swarm deck, group D (issue 133). Same contract as effects.ts: each declares the engine features it needs and is checked before it runs.
 */
import type { IrClause } from '../ir/types';
import { type Effects, failure } from './clauses';
import type { Lowering } from './types';

/** "Each player chooses a creature type." (CR 101.4, 205.3m): the engine's `chooseCreatureType` of every player, in turn order. */
const EACH_PLAYER_CHOOSES_CREATURE_TYPE: Lowering<IrClause, Effects> = {
  head: 'eachPlayerChoosesCreatureType',
  id: 'lower.each-player-chooses-creature-type',
  needs: ['effect:chooseCreatureType', 'selector:chooseCreatureTypePlayers'],
  lower: (clause) => ({
    ok: true,
    value: [{ kind: 'chooseCreatureType', players: { kind: 'eachPlayer' } }],
    rule: clause.rule,
  }),
};

/**
 * "Sacrifice one of them." (CR 603.2c, 701.21a): the engine's `sacrifice` of a `choose` among the creatures that dealt the combat damage of the batch trigger (`fromTriggerSources`). Refused in
 * any other ability: "them" has nothing to read.
 */
const SACRIFICE_ONE_OF_THEM: Lowering<IrClause, Effects> = {
  head: 'sacrificeOneOfThem',
  id: 'lower.sacrifice-one-of-them',
  needs: ['effect:sacrifice', 'selector:choose', 'selector:chooseFromTriggerSources'],
  lower(clause, ctx) {
    if (!ctx.damageBatchTrigger) return failure(clause);
    ctx.thisWay = 'sacrificed';
    return {
      ok: true,
      value: [
        {
          kind: 'sacrifice',
          objects: { kind: 'choose', filter: {}, fromTriggerSources: true },
        },
      ],
      rule: clause.rule,
    };
  },
};

export const SLIVER_D_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EACH_PLAYER_CHOOSES_CREATURE_TYPE,
  SACRIFICE_ONE_OF_THEM,
];

/**
 * Whether the written ability (IR) has a count of "creatures that share a creature type with it" (Titan of Littjara, CR 205.3m): "it" is the source of the ability only in a triggered
 * ability about the card itself, so any other ability is refused.
 */
export function usesSharesWithSource(written: unknown): boolean {
  if (written === null || typeof written !== 'object') return false;
  if (Array.isArray(written)) return written.some(usesSharesWithSource);
  const record = written as Record<string, unknown>;
  // Haunted One (CR 603.2e, 613.1f): a triggered ability a static ability grants is lowered, and its own check made, as an ability about the creature that has it ("it" is
  // that creature), so what its words say is not the granting ability's.
  if (record.kind === 'grantAbility') {
    const quoted = record.ability as { readonly ability?: { readonly kind?: unknown } } | undefined;
    if (quoted?.ability?.kind === 'triggered') return false;
  }
  if (record.sharesCreatureTypeWithSource === true) return true;
  return Object.values(record).some(usesSharesWithSource);
}
