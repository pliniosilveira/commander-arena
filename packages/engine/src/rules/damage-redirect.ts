/**
 * Redirection effects on a damage event (CR 614.9, D-192): "All damage that would be dealt to you and other permanents you control is dealt
 * to this creature instead" is the replacement `redirectDamage` of a creature on the battlefield, read from the abilities the creature has
 * now (so "loses all abilities" turns it off, CR 613.1f), for the event as it is at that point of the process (CR 616.1f).
 *
 * `redirectsFor` lists the redirections that apply to damage that would be dealt to `to`, each as a `Redirect` (the creature and the index of
 * the ability), oldest creature first. One applies when
 * - it has not been applied to this event already (CR 614.5: it gets one opportunity to affect an event or the modified events that replace
 *   it), which is why `used` is passed;
 * - the creature that would get the damage is on the battlefield and is a creature (CR 614.9), and is not the recipient itself (the text says
 *   "other");
 * - the recipient matches: the controller of the creature for `you`, a permanent the filter describes (read for the controller of the creature,
 *   as the permanent is on the battlefield) for `permanents`; a recipient that is a permanent must still be a creature, a planeswalker or a
 *   battle (CR 614.9: damage is only dealt to those and to players).
 * The damage is then dealt by the same source to the creature (CR 120.3), which `damage.ts` does with the recipient that settling returns.
 */
import type { Replacement } from '../ast/types';
import type { ObjectId } from '../ids';
import type { DamageRecipient } from '../state/combat-types';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { copiableValues } from './copiable';
import { derive } from './derive';
import { matchesFilter } from './select';

type Redirection = Extract<Replacement, { kind: 'redirectDamage' }>;

/** A redirection effect that can be applied to a damage event: the creature that has it and the index of the ability among the abilities it has now. */
export interface Redirect {
  readonly object: ObjectId;
  readonly index: number;
}

/** The stable key of a redirection: the answer to the question asks for it, so it must not change between a question and its replay. */
export const redirectKey = (r: Redirect): string => `redirect:${r.object}:${r.index}`;

/** False only when the permanent certainly has no redirection in any layer (its copiable abilities hold none): the cheap test before deriving it. */
function mayRedirect(state: GameState, obj: GameObject): boolean {
  if (obj.card === null && obj.token === null && obj.copyOf === undefined) return false;
  return copiableValues(state, obj).abilities.some(
    (a) => a.kind === 'replacement' && a.replacement.kind === 'redirectDamage',
  );
}

/** CR 614.9: damage is dealt to a creature, a planeswalker, a battle or a player; a permanent that is none of them cannot be the recipient of a redirection. */
function canBeDealtDamage(state: GameState, obj: GameObject): boolean {
  const types = derive(state, obj).types;
  return types.includes('creature') || types.includes('planeswalker') || types.includes('battle');
}

function covers(
  state: GameState,
  r: Redirection,
  owner: GameObject,
  to: DamageRecipient,
  recipient: GameObject | undefined,
): boolean {
  if (to.kind === 'player') return r.you && to.seat === controllerOf(state, owner);
  if (recipient === undefined || r.permanents === undefined) return false;
  return matchesFilter(
    state,
    recipient,
    { ...r.permanents, zone: 'battlefield' },
    { controller: controllerOf(state, owner), source: owner.id },
  );
}

/** The redirections that apply to damage that would be dealt to `to`, oldest first (the file comment). */
export function redirectsFor(
  state: GameState,
  to: DamageRecipient,
  used: readonly string[],
): readonly Redirect[] {
  const recipient = to.kind === 'object' ? state.objects[to.id] : undefined;
  if (to.kind === 'object') {
    if (recipient === undefined || recipient.zone !== 'battlefield') return [];
    if (!canBeDealtDamage(state, recipient)) return [];
  }
  const found: { redirect: Redirect; timestamp: number }[] = [];
  for (const id of state.battlefield) {
    if (to.kind === 'object' && to.id === id) continue;
    const owner = state.objects[id];
    if (owner === undefined || !mayRedirect(state, owner)) continue;
    const derived = derive(state, owner);
    // CR 614.9: it does nothing when the creature that would get the damage is no longer a creature.
    if (!derived.types.includes('creature')) continue;
    derived.abilities.forEach((a, index) => {
      if (a.kind !== 'replacement' || a.replacement.kind !== 'redirectDamage') return;
      const redirect = { object: id, index };
      if (used.includes(redirectKey(redirect))) return;
      if (covers(state, a.replacement, owner, to, recipient)) {
        found.push({ redirect, timestamp: owner.timestamp });
      }
    });
  }
  // CR 613.7: oldest first; the same creature's abilities in the order it has them.
  return found
    .sort(
      (a, b) =>
        a.timestamp - b.timestamp ||
        (a.redirect.object < b.redirect.object
          ? -1
          : a.redirect.object > b.redirect.object
            ? 1
            : 0) ||
        a.redirect.index - b.redirect.index,
    )
    .map((f) => f.redirect);
}
