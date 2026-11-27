/**
 * The permanent that grants an ability (CR 113.6, 613.1f; `ObjectRef` `granter`): "Other creatures have \"Whenever this creature attacks, you may have it fight Grothama,
 * All-Devouring.\"" gives every other creature an ability that names the permanent giving it. As a static `grantAbility` gives its ability to a permanent, the references `granter`
 * in it are written with the id of the permanent that has the static ability, so each instance (two such permanents give two, CR 613.1f) names its own, and an ability on the stack
 * keeps naming it after the creature has lost the ability.
 *
 * The rewritten ability is kept per ability and permanent: `derive` asks for it every time it reads the permanents, and an ability without the reference (nearly all) is returned as
 * it is after one walk.
 */
import type { Ability } from '../ast/types';
import type { ObjectId } from '../ids';

const cache = new WeakMap<Ability, Map<ObjectId, Ability>>();

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** `node` with every unbound `granter` naming `granter`; the same object when it holds none. */
function bound(node: unknown, granter: ObjectId): unknown {
  if (Array.isArray(node)) {
    let changed = false;
    const out = node.map((child) => {
      const next = bound(child, granter);
      if (next !== child) changed = true;
      return next;
    });
    return changed ? out : node;
  }
  if (!isRecord(node)) return node;
  if (node.kind === 'granter') {
    return node.object === undefined ? { kind: 'granter', object: granter } : node;
  }
  let out: Record<string, unknown> | null = null;
  for (const [key, child] of Object.entries(node)) {
    const next = bound(child, granter);
    if (next !== child) {
      out ??= { ...node };
      out[key] = next;
    }
  }
  return out ?? node;
}

/** The ability a static ability of `granter` gives, with its `granter` references naming that permanent. */
export function boundToGranter<A extends Ability>(ability: A, granter: ObjectId): A {
  let byGranter = cache.get(ability);
  if (byGranter === undefined) {
    byGranter = new Map();
    cache.set(ability, byGranter);
  }
  const known = byGranter.get(granter);
  if (known !== undefined) return known as A;
  const made = bound(ability, granter) as A;
  byGranter.set(granter, made);
  return made;
}
