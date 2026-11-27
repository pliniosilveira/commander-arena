/**
 * Damage that is increased as it is dealt (CR 614.1a, 614.5, 616.1, 120.3): "If a red source you control would deal damage to an opponent or a
 * permanent an opponent controls, it deals that much damage plus 2 instead." is the replacement `damageBonus` of a permanent on the battlefield, read
 * from the abilities the permanent has now (so "loses all abilities" turns it off, CR 613.1f), for the event as it is at that point of the process
 * (CR 616.1f).
 *
 * `bonusesFor` lists the bonuses that apply to an event, each as a `Bonus` (the permanent and the index of the ability), oldest permanent first. One
 * applies when
 * - it has not been applied to this event already (CR 614.5: each effect gets one opportunity to affect an event), which is why `used` is passed;
 * - something is left of the event (damage of 0 is no event, and damage that is all prevented is no longer replaced);
 * - the recipient is an opponent of the controller of the permanent with the ability, or a creature, planeswalker or battle (CR 120.1) that such an
 *   opponent controls, read for the recipient as it is on the battlefield;
 * - the source matches the filter of the effect, read as the source is or as it last was (`damageSourceMatches`), for the controller of the permanent.
 * The source stays the source (CR 120.3): the extra damage is dealt by the creature or spell, not by the permanent with the ability.
 *
 * `damageDouble` ("it deals double that damage to that permanent or player instead", CR 614.1a) is the same replacement with a doubled amount and no limit on the
 * recipient: any player, creature, planeswalker or battle, the controller's own included. Two of them, or one with a `damageBonus`, are ordered by the player
 * dealt the damage (CR 616.1), and the order changes the result (plus 2 then double is not double then plus 2).
 */
import type { Replacement } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { DamageRecipient } from '../state/combat-types';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { copiableValues } from './copiable';
import { derive } from './derive';
import { damageSourceMatches } from './prevention';

type Bonus = Extract<Replacement, { kind: 'damageBonus' | 'damageDouble' }>;

const isBonus = (r: Replacement): r is Bonus =>
  r.kind === 'damageBonus' || r.kind === 'damageDouble';

/** An increase that can be applied to a damage event: the permanent that has it and the index of the ability among the abilities it has now. */
export interface DamageBonus {
  readonly object: ObjectId;
  readonly index: number;
}

/** The stable key of a bonus: the answer to the question asks for it, so it must not change between a question and its replay. */
export const bonusKey = (b: DamageBonus): string => `bonus:${b.object}:${b.index}`;

/** False only when the permanent certainly has no such effect in any layer (its copiable abilities hold none): the cheap test before deriving it. */
function mayAdd(state: GameState, obj: GameObject): boolean {
  if (obj.card === null && obj.token === null && obj.copyOf === undefined) return false;
  return copiableValues(state, obj).abilities.some(
    (a) => a.kind === 'replacement' && isBonus(a.replacement),
  );
}

/** "An opponent or a permanent an opponent controls": CR 120.1, damage is dealt to a creature, a planeswalker, a battle or a player. */
function isOpponentSide(state: GameState, owner: SeatId, to: DamageRecipient): boolean {
  if (to.kind === 'player') return to.seat !== owner;
  const recipient = state.objects[to.id];
  if (recipient === undefined || recipient.zone !== 'battlefield') return false;
  const types = derive(state, recipient).types;
  if (!types.includes('creature') && !types.includes('planeswalker') && !types.includes('battle')) {
    return false;
  }
  return controllerOf(state, recipient) !== owner;
}

/** The bonuses that apply to `event` as it is now, oldest permanent first (the file comment). */
export function bonusesFor(
  state: GameState,
  event: {
    readonly source: ObjectId;
    readonly to: DamageRecipient;
    readonly amount: number;
    readonly combat?: boolean;
  },
  used: readonly string[],
): readonly DamageBonus[] {
  if (event.amount <= 0) return [];
  const found: { bonus: DamageBonus; timestamp: number }[] = [];
  for (const id of state.battlefield) {
    const owner = state.objects[id];
    if (owner === undefined || !mayAdd(state, owner)) continue;
    const abilities = derive(state, owner).abilities;
    const controller = controllerOf(state, owner);
    abilities.forEach((a, index) => {
      if (a.kind !== 'replacement' || !isBonus(a.replacement)) return;
      const bonus = { object: id, index };
      if (used.includes(bonusKey(bonus))) return;
      const effect: Bonus = a.replacement;
      // CR 120.2b: "noncombat damage" leaves out combat damage; "to an opponent" leaves out the permanents an opponent controls.
      if (effect.kind === 'damageBonus') {
        if (effect.noncombatOnly === true && event.combat === true) return;
        if (effect.opponentPlayersOnly === true && event.to.kind !== 'player') return;
      }
      if (
        (effect.kind === 'damageDouble' || isOpponentSide(state, controller, event.to)) &&
        damageSourceMatches(state, event.source, effect.sources, controller)
      ) {
        found.push({ bonus, timestamp: owner.timestamp });
      }
    });
  }
  // CR 613.7: oldest first; the same permanent's abilities in the order it has them.
  return found
    .sort(
      (a, b) =>
        a.timestamp - b.timestamp ||
        (a.bonus.object < b.bonus.object ? -1 : a.bonus.object > b.bonus.object ? 1 : 0) ||
        a.bonus.index - b.bonus.index,
    )
    .map((f) => f.bonus);
}

/** The damage after the bonus, for an event of `amount` (a bonus adds to it, a doubling doubles it); `amount` itself when the permanent no longer has the ability. */
export function bonusApplied(state: GameState, bonus: DamageBonus, amount: number): number {
  const owner = state.objects[bonus.object];
  if (owner === undefined) return amount;
  const a = derive(state, owner).abilities[bonus.index];
  if (a?.kind !== 'replacement') return amount;
  if (a.replacement.kind === 'damageDouble') return amount * 2;
  return a.replacement.kind === 'damageBonus' ? amount + a.replacement.amount : amount;
}

/** The words of a card for the bonus, as the player ordering the effects reads them (CR 616.1): how much more damage, or "double". */
export function bonusWords(state: GameState, bonus: DamageBonus): string {
  const owner = state.objects[bonus.object];
  const a = owner === undefined ? undefined : derive(state, owner).abilities[bonus.index];
  if (a?.kind === 'replacement' && a.replacement.kind === 'damageDouble')
    return 'Deal double damage';
  return `Deal ${a?.kind === 'replacement' && a.replacement.kind === 'damageBonus' ? a.replacement.amount : 0} more damage`;
}
