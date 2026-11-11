/**
 * Blockers beside what they block (issue 19): once blocks are declared, a row puts the creatures that
 * take part in the combat first, in the order of the attackers' numbers (`resolve.ts` `combatRoles`),
 * so the blockers of attacker 1 stand together and under (or over) the attackers they stop, the way a
 * player would slide them at a table. In the attackers' row the blocked attackers come first, so they
 * line up with the blockers' row. Every other creature keeps its place after them. The order only
 * changes for declared blocks: while the player is still picking (`tentative`), tiles stay where they
 * are, so the one under the pointer does not move.
 */
import type { ObjectView } from '@commander-arena/engine';
import type { CombatRole } from './resolve';

/** The number a creature is ordered by: its own for an attacker, its first attacker's for a blocker. */
function rank(role: CombatRole | undefined): number | null {
  if (role === undefined) return null;
  if (role.kind === 'blocker') {
    return role.tentative ? null : Math.min(...role.pairs.map((p) => p.number));
  }
  return role.blocked && !role.tentative && role.number !== null ? role.number : null;
}

/** `objects` with the creatures in declared blocks first, ordered by attacker number; a stable sort. */
export function combatOrder(
  objects: readonly ObjectView[],
  roles: ReadonlyMap<string, CombatRole>,
): readonly ObjectView[] {
  const ranked = objects.map((object, place) => ({
    object,
    place,
    rank: rank(roles.get(object.id)),
  }));
  if (ranked.every((r) => r.rank === null)) return objects;
  return ranked
    .sort((a, b) => {
      if (a.rank === null || b.rank === null) {
        return a.rank === b.rank ? a.place - b.place : a.rank === null ? 1 : -1;
      }
      return a.rank - b.rank || a.place - b.place;
    })
    .map((r) => r.object);
}
