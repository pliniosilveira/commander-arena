/**
 * "You can't cast ~ during your first, second, or third turns of the game" (CR 101.2, 601.2; D-149): the `cantCastThis` ability of a card
 * says when it can't be cast. It is checked wherever the engine decides whether a card can be cast, so a cast of any kind (from the hand,
 * the command zone, with an alternative cost, for free as an effect resolves) obeys it: "can't" beats "can" (CR 101.2).
 */
import type { SeatId } from '../ids';
import { definitionOf, printedCard } from '../state/ops';
import type { GameObject, GameState, StackData } from '../state/types';
import { evaluateCondition } from './conditions';
import { controllerOf } from './control';
import { derive } from './derive';
import { mayHaveStatic } from './printed-statics';
import { matchesFilter } from './select';
import { staticConditionHolds } from './static-conditions';

/**
 * `spell` as it would be on the stack with `x` announced (CR 202.3e: an {X} in the mana cost is the number announced while the object is a spell on the stack, so
 * the mana value of a spell about to be cast is read with the X it would be cast with). A spell that is on the stack already keeps what it has and gets the X.
 */
function withAnnouncedX(spell: GameObject, x: number): GameObject {
  if (x === 0 && spell.stack === null) return spell;
  const stack: StackData = spell.stack ?? {
    kind: 'spell',
    source: null,
    abilityIndex: null,
    ability: null,
    chosenTargets: [],
    x: null,
    chosenModes: [],
    castFromCommandZone: false,
    kicked: false,
    flashback: false,
  };
  return { ...spell, stack: { ...stack, x } };
}

/**
 * CR 101.2, 604.1, 601.2 (D-282): whether a static ability `opponentsCantCastSpells` of a permanent that `seat` does not control describes `spell`, as it would be on
 * the stack with `x` announced. A permanent that lost its abilities has none (`derive`); every way of casting asks (`canCast`, `canCastDuringResolution`, the announcement of X).
 */
function forbiddenBySpellFilter(
  state: GameState,
  seat: SeatId,
  spell: GameObject,
  x: number,
): boolean {
  let described: GameObject | undefined;
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined || controllerOf(state, obj) === seat) continue;
    if (!mayHaveStatic(state, obj, 'opponentsCantCastSpells')) continue;
    for (const a of derive(state, obj).abilities) {
      if (
        a.kind !== 'static' ||
        a.static.kind !== 'opponentsCantCastSpells' ||
        (a.condition !== undefined && !staticConditionHolds(state, a.condition, obj))
      ) {
        continue;
      }
      described ??= withAnnouncedX(spell, x);
      if (
        matchesFilter(
          state,
          described,
          { ...a.static.spells, zone: 'stack' },
          { controller: controllerOf(state, obj), source: obj.id },
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * The least X (CR 107.3a) with which `seat` may cast `spell` as far as the restrictions on who may cast what go (D-282: "Your opponents can't cast spells with mana
 * value 3 or less" is read with the mana value the announced X gives the spell, CR 202.3e), or null when no X does. 0 for a spell with no {X} in its mana cost
 * and no restriction, which is all of them but those a static ability describes. `hasX` says whether the cost has an {X}; only then is more than 0 tried.
 */
export function leastAllowedX(
  state: GameState,
  seat: SeatId,
  spell: GameObject,
  hasX: boolean,
): number | null {
  const top = hasX ? MOST_RESTRICTED_X : 0;
  for (let x = 0; x <= top; x += 1) {
    if (!castForbiddenByOpponentsPermanent(state, seat, spell, x)) return x;
  }
  return null;
}

/** The greatest X tried for a restriction: one that no X below it leaves untouched is not cast (the engine's own bound on X, `MAX_X`, is far above it). */
const MOST_RESTRICTED_X = 60;

/**
 * Whether a `cantCastThis` ability of the face `spell` is, stops `seat` from casting it now. `spell` is the card as it would be on the
 * stack (`castAs`); its own abilities are read, as the engine does for a card anywhere but on the battlefield.
 */
export function castForbiddenByOwnAbility(
  state: GameState,
  seat: SeatId,
  spell: GameObject,
): boolean {
  const card = printedCard(spell);
  const face = card === null ? undefined : definitionOf(state, card).faces[spell.face];
  if (face === undefined) return false;
  return face.abilities.some(
    (a) =>
      a.kind === 'static' &&
      a.static.kind === 'cantCastThis' &&
      (a.condition === undefined ||
        evaluateCondition(state, a.condition, { controller: seat, source: spell.id })),
  );
}

/**
 * CR 101.2, 604.1 (D-179): "Your opponents can't cast spells during your turn": whether a permanent on the battlefield, controlled by the active
 * player, has that ability now (and its "as long as" condition holds for it) while `seat`, who is not the active player, would cast a spell.
 * A permanent that lost its abilities has none (`derive`). Every way of casting asks (`canCast`, `canCastDuringResolution`).
 */
export function castForbiddenByOpponentsPermanent(
  state: GameState,
  seat: SeatId,
  spell?: GameObject,
  x = 0,
): boolean {
  // CR 101.2, 604.1 (D-282): "Your opponents can't cast spells with mana value 3 or less": a spell that a permanent of an opponent of the caster describes.
  if (spell !== undefined && forbiddenBySpellFilter(state, seat, spell, x)) return true;
  const active = state.turn.activeSeat;
  if (seat === active) return false;
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined || controllerOf(state, obj) !== active) continue;
    if (!mayHaveStatic(state, obj, 'opponentsCantCastOnYourTurn')) continue;
    const holds = derive(state, obj).abilities.some(
      (a) =>
        a.kind === 'static' &&
        a.static.kind === 'opponentsCantCastOnYourTurn' &&
        (a.condition === undefined || staticConditionHolds(state, a.condition, obj)),
    );
    if (holds) return true;
  }
  return false;
}
