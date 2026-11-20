/**
 * A cost that sacrifices several different permanents, each described by its own filter ("Sacrifice a Swamp and a Forest", CR 701.21a, 118.3, 602.2b). Each part needs a permanent
 * of its own: one that matches several parts pays only one of them (a land that is both a Swamp and a Forest is one land), so the cost can be paid when the parts can be given
 * different permanents, and an answer is legal when the permanents chosen can be matched to the parts that way. The searches are tiny (a cost has two or three parts), so they walk
 * the parts in turn.
 */
import type { ObjectId } from '../ids';

/** The most assignments listed for one decision. */
const MAX_ASSIGNMENTS = 200;

/** Whether each group can be given a different permanent of its own list. */
export function canAssignDistinct(groups: readonly (readonly ObjectId[])[]): boolean {
  const used = new Set<ObjectId>();
  const walk = (i: number): boolean => {
    const group = groups[i];
    if (group === undefined) return true;
    for (const id of group) {
      if (used.has(id)) continue;
      used.add(id);
      const done = walk(i + 1);
      used.delete(id);
      if (done) return true;
    }
    return false;
  };
  return walk(0);
}

/**
 * Every set of permanents that gives each group a different permanent of its own list, each set listed once (in the order of the first group's candidates), up to a limit.
 */
export function distinctAssignments(
  groups: readonly (readonly ObjectId[])[],
): readonly (readonly ObjectId[])[] {
  const seen = new Set<string>();
  const out: ObjectId[][] = [];
  const chosen: ObjectId[] = [];
  const walk = (i: number): void => {
    if (out.length >= MAX_ASSIGNMENTS) return;
    const group = groups[i];
    if (group === undefined) {
      const key = [...chosen].sort().join('|');
      if (!seen.has(key)) {
        seen.add(key);
        out.push([...chosen]);
      }
      return;
    }
    for (const id of group) {
      if (chosen.includes(id)) continue;
      chosen.push(id);
      walk(i + 1);
      chosen.pop();
    }
  };
  walk(0);
  return out;
}

/** Whether `chosen` is one permanent for each group, matched so that each is in the list of the group it pays. */
export function matchesGroups(
  chosen: readonly ObjectId[],
  groups: readonly (readonly ObjectId[])[],
): boolean {
  if (chosen.length !== groups.length || new Set(chosen).size !== chosen.length) return false;
  return canAssignDistinct(groups.map((group) => group.filter((id) => chosen.includes(id))));
}
