/**
 * Lowerings of the Sliver Swarm deck, group D (issue 133). Same contract as effects.ts: each declares the engine features it needs and is checked before it runs.
 */
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
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

export const SLIVER_D_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EACH_PLAYER_CHOOSES_CREATURE_TYPE,
];

/**
 * Whether the written ability (IR) has a count of "creatures that share a creature type with it" (Titan of Littjara, CR 205.3m): "it" is the source of the ability only in a triggered
 * ability about the card itself, so any other ability is refused.
 */
export function usesSharesWithSource(written: unknown): boolean {
  if (written === null || typeof written !== 'object') return false;
  if (Array.isArray(written)) return written.some(usesSharesWithSource);
  const record = written as Record<string, unknown>;
  if (record.sharesCreatureTypeWithSource === true) return true;
  return Object.values(record).some(usesSharesWithSource);
}
