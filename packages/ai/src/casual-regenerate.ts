/**
 * CasualAgent and regeneration (CR 701.19, D-116, D-120): "{1}{B}: Regenerate this creature." is activated when
 * the creature would otherwise die, never before. The engine lists the activation only when the cost can be
 * paid. The agent regenerates a creature of its own that has no shield yet when:
 *  - the top object of the stack is the opponent's and names the creature, and its text destroys ("Destroy
 *    target creature") without saying "can't be regenerated", or deals damage that is lethal to it (a number
 *    the text states, against its toughness less the damage on it);
 *  - the declare blockers step has come and the creature is in a fight it would lose: it is blocked by
 *    creatures that together deal lethal damage (or one with deathtouch), or it blocks an attacker that
 *    does (the same plain damage comparison as a pump, `casual-activations.ts`; first strike and tricks
 *    are not weighed).
 * It stays tapped afterwards, as the rules say, which the agent accepts: the creature lives.
 */
import type { ActivatedAbility, GameView, ObjectView } from '@commander-arena/engine';
import { hasKeyword, powerOf, toughnessOf } from './casual-view';

/** Whether the ability is "Regenerate this creature" for mana: the one the agent knows how to use. */
export function isRegenerateAbility(ability: ActivatedAbility): boolean {
  const e = ability.effect;
  return (
    e.kind === 'regenerate' &&
    e.objects.kind === 'this' &&
    (ability.targets?.length ?? 0) === 0 &&
    ability.cost.every((c) => c.kind === 'mana')
  );
}

const DESTROYS = /\bdestroy\b/i;
const CANT_REGENERATE = /can't be regenerated/i;
const DAMAGE = /deals (\d+) damage/i;

const remaining = (o: ObjectView): number => toughnessOf(o) - o.damage;

/** Whether the top of the stack is the opponent's and would kill `me` through a destruction or damage. */
function stackThreatens(view: GameView, me: ObjectView): boolean {
  const top = view.stack[view.stack.length - 1];
  if (top === undefined || top.controller === view.viewer) return false;
  if (!top.targets.some((t) => t.kind === 'object' && t.id === me.id)) return false;
  if (DESTROYS.test(top.oracleText) && !CANT_REGENERATE.test(top.oracleText)) return true;
  const damage = DAMAGE.exec(top.oracleText);
  return damage !== null && Number(damage[1]) >= remaining(me);
}

/** Whether `me` is in a fight in this combat that kills it (plain damage; deathtouch counts). */
function losesCombat(view: GameView, me: ObjectView): boolean {
  const combat = view.combat;
  if (combat === null || view.step !== 'declareBlockers') return false;
  const byId = (id: string): ObjectView | undefined => view.battlefield.find((o) => o.id === id);
  const kills = (foes: readonly ObjectView[]): boolean =>
    foes.some((f) => hasKeyword(f, 'deathtouch') && powerOf(f) > 0) ||
    foes.reduce((sum, f) => sum + powerOf(f), 0) >= remaining(me);
  const attacking = combat.attackers.find((a) => a.object === me.id);
  if (attacking !== undefined) {
    return kills(attacking.blockedBy.flatMap((id) => byId(id) ?? []));
  }
  const blocked = combat.attackers.find((a) => a.blockedBy.includes(me.id));
  return blocked !== undefined && kills([byId(blocked.object)].flatMap((o) => o ?? []));
}

/** Whether to regenerate `me` now. */
export function wantsRegenerate(view: GameView, me: ObjectView): boolean {
  if ((me.regenerationShields ?? 0) > 0) return false;
  return stackThreatens(view, me) || losesCombat(view, me);
}
