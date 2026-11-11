/**
 * Reading restrictions and requirements (D-094): what an object can't do or must do as the rules
 * read it. `derive` lists them (`Derived.restrictions`: static abilities and `restrict` effects);
 * this module answers the questions the rules ask where they act: may it block, can it be blocked,
 * must it attack, does it untap, can it be countered.
 */
import type { Restriction } from '../ast/types';
import type { ObjectId } from '../ids';
import type { GameObject, GameState } from '../state/types';
import { evaluateCondition } from './conditions';
import { controllerOf } from './control';
import { derive } from './derive';
import { mayHaveStatic } from './printed-statics';
import { matchesFilter } from './select';
import { staticConditionHolds } from './static-conditions';

/**
 * "Can't attack or block unless [condition]" (`restrictionUnless`, D-145): the permanent's own static ability restricts it while its
 * condition is false. Read here, where the rule acts, with the game as it is (the condition may compare power), not in a layer.
 */
function restrictedUnless(state: GameState, obj: GameObject, restriction: Restriction): boolean {
  if (restriction !== 'cantAttack' && restriction !== 'cantBlock') return false;
  if (obj.zone !== 'battlefield') return false;
  for (const a of derive(state, obj).abilities) {
    if (a.kind !== 'static' || a.static.kind !== 'restrictionUnless') continue;
    if (!a.static.restrictions.includes(restriction)) continue;
    if (
      !evaluateCondition(state, a.static.unless, {
        controller: controllerOf(state, obj),
        source: obj.id,
      })
    ) {
      return true;
    }
  }
  return false;
}

export function hasRestriction(
  state: GameState,
  obj: GameObject,
  restriction: Restriction,
): boolean {
  return (
    derive(state, obj).restrictions.includes(restriction) ||
    restrictedUnless(state, obj, restriction)
  );
}

/**
 * CR 101.2, 701.6, 113.6g: a spell with "can't be countered" is not countered, and stays on the
 * stack. An object that is not on the stack, or that is gone, is not a spell to counter at all.
 */
export function canBeCountered(state: GameState, id: ObjectId): boolean {
  const obj = state.objects[id];
  if (obj === undefined || obj.zone !== 'stack') return false;
  return (
    !hasRestriction(state, obj, 'cantBeCountered') && !spellsCantBeCounteredByPermanent(state, obj)
  );
}

/**
 * CR 101.2, 604.1 (D-185): "Creature spells you control can't be countered": whether a permanent on the battlefield has that ability now (and its "as
 * long as" condition holds for it) for the spell `spell`, which its filter names as the spell is on the stack, for the controller of the permanent.
 * A permanent that lost its abilities has none (`derive`).
 */
function spellsCantBeCounteredByPermanent(state: GameState, spell: GameObject): boolean {
  for (const id of state.battlefield) {
    const permanent = state.objects[id];
    if (permanent === undefined || !mayHaveStatic(state, permanent, 'spellsCantBeCountered'))
      continue;
    const ctx = { controller: controllerOf(state, permanent), source: id };
    const holds = derive(state, permanent).abilities.some(
      (a) =>
        a.kind === 'static' &&
        a.static.kind === 'spellsCantBeCountered' &&
        (a.condition === undefined || staticConditionHolds(state, a.condition, permanent)) &&
        matchesFilter(state, spell, { ...a.static.spells, zone: 'stack' }, ctx),
    );
    if (holds) return true;
  }
  return false;
}

/**
 * CR 502.3 (D-125): whether the permanent has "You may choose not to untap ~ during your untap step": the
 * derived abilities hold the static `optionalUntap` (so a permanent that lost its abilities has none).
 */
export function hasOptionalUntap(state: GameState, obj: GameObject): boolean {
  return derive(state, obj).abilities.some(
    (a) => a.kind === 'static' && a.static.kind === 'optionalUntap',
  );
}
