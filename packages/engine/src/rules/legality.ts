/**
 * What a seat may do with priority (CR 117.1, 601.3, 305, 307.1). Used both to list legal actions
 * and to validate the action a seat chooses, so the UI and the AI cannot diverge from the rules.
 */

import { overloadedText } from '../ast/overload';
import type { AlternativeCost, Cost, ObjectFilter, TargetSpec } from '../ast/types';
import type { CardFace } from '../cards/definition';
import type { CardType } from '../characteristics';
import type { ObjectId, SeatId } from '../ids';
import { definitionOf, getObject, getSeat, opponentsOf, printedCard, zoneList } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { grantedEnergyOf, grantedEvokeOf } from './alt-cost-grant';
import {
  alternativeOf,
  flashbackCostOf,
  hasAftermath,
  hasGift,
  hasModeCosts,
  manaCostAsFlashbackCost,
  mayCastBlitzFromGraveyard,
} from './alt-costs';
import { auraTargetSpec, BESTOW_TARGET_SPEC } from './attach';
import {
  type CastAlternative,
  type CastFrom,
  canPayRequest,
  castAs,
  isNamedAlternative,
} from './cast-cost';
import { castInOwnMainPhase } from './cast-phase';
import {
  castForbiddenByOpponentsPermanent,
  castForbiddenByOwnAbility,
  leastAllowedX,
} from './cast-restrictions';
import { evaluateCondition } from './conditions';
import { controllerOf } from './control';
import { derive } from './derive';
import { flashPermissionSources, libraryCastSources } from './derive-statics';
import { escapeOf, grantedEscapeOf } from './escape-grant';
import { hasGrantedFlashback } from './flashback-grant';
import { freeCastCards, freeCastSlots } from './free-cast';
import { graveyardCastTypes, graveyardPlayPermission } from './graveyard-play';
import { harmonizeWays } from './harmonize';
import { hasKeyword } from './keywords';
import { asFace, castableFaces, choosesFace, isOmenFace } from './layouts';
import { libraryLandPermission } from './library-play';
import { linkedExilePlayPermitted } from './linked-exile-play';
import { isCommanderCardId, isCommanderObject } from './melded';
import { chosenModeSpecs, legalModeSets, modalOfAbility, modalOfSpellText } from './modes';
import { mayPayLifeForMana } from './next-spell-life';
import { hasGrantedFlashCasting } from './player-flash';
import { preparedPermanentOf } from './prepare';
import { matchesFilter } from './select';
import { splitSecondOnStack } from './split-second';
import { landPlaysAllowed } from './statics';
import { flashSlotOf, sameControllerFillable, slotCanBeFilled } from './target-choice';
import { hasX, spellXCost } from './x-value';

export type { CastAlternative, CastFrom };

export function faceOf(state: GameState, obj: GameObject): CardFace | null {
  // A copy of a spell has the face it copies (CR 707.10, D-129).
  const card = printedCard(obj);
  if (card === null) return null;
  return definitionOf(state, card).faces[obj.face] ?? null;
}

/** CR 117.1a / 307.1: sorcery timing is the active player's main phase with an empty stack. */
export function hasSorceryTiming(state: GameState, seat: SeatId): boolean {
  const { turn } = state;
  return (
    turn.activeSeat === seat &&
    (turn.step === 'precombatMain' || turn.step === 'postcombatMain') &&
    state.stack.length === 0
  );
}

/**
 * Instants may be cast any time the seat has priority (CR 304.5); everything else needs sorcery
 * timing. CR 702.8a (Flash): "You may play this card any time you could cast an instant", so a
 * card with flash has the timing of an instant, in the same windows and no others. Flash is read
 * from the card's derived abilities in the zone it is cast from (hand or command zone).
 */
export function timingAllows(state: GameState, seat: SeatId, obj: GameObject): boolean {
  return castTiming(state, seat, obj).allowed;
}

/**
 * When the spell `obj` may be cast (`allowed`), and what that costs the choice of targets: with `onlyTargets` the spell may be cast now only because of its own
 * conditional flash ("You may cast this spell as though it had flash if it targets a commander", D-408, CR 601.3b, 601.3d), so its targets must be objects that
 * filter matches (the first slot that needs a target offers only those, `flashSlotOf`). Null when the timing needs nothing of the targets.
 */
export function castTiming(
  state: GameState,
  seat: SeatId,
  obj: GameObject,
): { readonly allowed: boolean; readonly onlyTargets: ObjectFilter | null } {
  const types = derive(state, obj).types;
  const free = { allowed: true, onlyTargets: null } as const;
  if (types.includes('instant') || hasKeyword(state, obj, 'flash')) return free;
  // CR 601.3b (D-139): "You may cast artifact spells as though they had flash": a permanent of the caster's gives the permission.
  if (flashPermitted(state, seat, obj)) return free;
  // CR 601.3b (Alchemist's Refuge): "You may cast spells this turn as though they had flash": an effect of this turn gives the permission.
  if (hasGrantedFlashCasting(state, seat)) return free;
  if (hasSorceryTiming(state, seat)) return free;
  return ownFlashPermission(state, seat, obj) ?? { allowed: false, onlyTargets: null };
}

/**
 * CR 601.3b, 601.3d, 113.6d (D-408): the spell's own permission to be cast as though it had flash (`castAsThoughFlash` with `spells: this`, on the face being
 * cast). With no condition, or one that holds as the spell is cast, it is plain permission. A `spellTargets` condition is read as CR 601.3b and 601.3d say: the
 * caster may begin to cast the spell as though it had flash when the targets they choose could meet it, so the permission is there and the targets are
 * restricted to what the condition's filter matches. Null when the face has no such ability that applies.
 */
function ownFlashPermission(
  state: GameState,
  seat: SeatId,
  spell: GameObject,
): { readonly allowed: true; readonly onlyTargets: ObjectFilter | null } | null {
  let restricted: ObjectFilter | null = null;
  for (const a of faceOf(state, spell)?.abilities ?? []) {
    if (
      a.kind !== 'static' ||
      a.static.kind !== 'castAsThoughFlash' ||
      !('kind' in a.static.spells)
    ) {
      continue;
    }
    if (a.condition === undefined) return { allowed: true, onlyTargets: null };
    if (a.condition.kind === 'spellTargets') {
      restricted ??= a.condition.filter;
    } else if (evaluateCondition(state, a.condition, { controller: seat, source: spell.id })) {
      return { allowed: true, onlyTargets: null };
    }
  }
  return restricted === null ? null : { allowed: true, onlyTargets: restricted };
}

/**
 * CR 601.3b, 702.8a (D-139): whether a static ability of a permanent `seat` controls lets them cast the spell `obj` at the timing of
 * an instant: the filter of a `castAsThoughFlash` ability describes the spell as it is cast (on the stack, CR 601.2a), whose controller
 * is the caster. The permission is the controller's alone (every player's with `anyPlayer`); it does not give the spell the flash keyword.
 */
function flashPermitted(state: GameState, seat: SeatId, spell: GameObject): boolean {
  return flashPermissionSources(state).some(
    (source) =>
      (source.anyPlayer || controllerOf(state, source.object) === seat) &&
      // Kianne, Corrupted Memory: the permission of a permanent applies "as long as" its condition holds, for the controller of the permanent.
      (source.condition === undefined ||
        evaluateCondition(state, source.condition, {
          controller: controllerOf(state, source.object),
          source: source.object.id,
        })) &&
      matchesFilter(
        state,
        spell,
        { ...source.spells, zone: 'stack' },
        { controller: seat, source: source.object.id },
      ),
  );
}

/**
 * CR 305.2: whether the seat may play this card as a land now, as `face` (the face of a modal
 * double-faced card the player chooses, CR 712.12; 0 for every other card). Only the face played is
 * looked at (CR 712.11c): it must be a land.
 */
/**
 * CR 305.1, 305.2a, 305.3 (D-145): whether `seat` may play the land card `obj` as the effect of a resolving spell or ability allows ("You may play
 * the exiled card without paying its mana cost"): it is the seat's own turn and they have a land play left. The card is in their hand, in exile or (a target of the effect) in their graveyard.
 * The timing of a land play (a main phase, an empty stack) is not asked: the effect is what lets them play it now.
 */
export function canPlayLandByEffect(state: GameState, seat: SeatId, obj: GameObject): boolean {
  if (
    obj.card === null ||
    (obj.zone !== 'hand' && obj.zone !== 'exile' && obj.zone !== 'graveyard')
  ) {
    return false;
  }
  // D-149 (CR 702.75a, 608.2g): a card in exile is the effect's to name, whoever owns it (a Hideaway permanent that changed controller lets its
  // new controller play the card its old one exiled); a card in a hand is the player's own.
  // CR 404.1 (Horde of Notions: "play target Elemental card from your graveyard"): a card of a graveyard is the player's own to play.
  if ((obj.zone === 'hand' || obj.zone === 'graveyard') && obj.owner !== seat) return false;
  if (state.turn.activeSeat !== seat) return false;
  return getSeat(state, seat).landsPlayedThisTurn < landPlaysAllowed(state, seat);
}

/**
 * CR 702.170d: whether `obj` is a plotted card its owner `seat` may cast from exile without paying its mana cost: it became plotted in an earlier turn. The timing (a main phase with an
 * empty stack) is checked where the cast is decided (`canCast`).
 */
export function mayCastPlotted(state: GameState, seat: SeatId, obj: GameObject): boolean {
  return (
    obj.zone === 'exile' &&
    obj.owner === seat &&
    obj.plottedTurn !== undefined &&
    state.turn.number > obj.plottedTurn
  );
}

/**
 * CR 601.2, 305.1, 611.2a (D-151): whether an effect ("You may play that card this turn") lets `seat` cast or play the card `obj` in exile: a
 * `playPermission` of the seat that names this very object (a card that left exile is a new one, CR 400.7) and has not ended.
 */
/** CR 903.3, 508.1 (issue 101): whether `seat` declared a commander of theirs as an attacker this turn (any combat phase; a commander that has died since still counts). */
function attackedWithCommanderThisTurn(state: GameState, seat: SeatId): boolean {
  return state.turnLog.attackedWith.some((a) => {
    if (a.seat !== seat) return false;
    const obj = state.objects[a.object];
    return obj !== undefined && isCommanderCardId(state, obj.card);
  });
}

export function mayPlayFromExile(
  state: GameState,
  seat: SeatId,
  obj: GameObject,
  asLand = false,
  /**
   * Lorehold group 2 (CR 118.9): `true` asks for a permission to cast the card without paying its mana cost, which is the alternative cost `free` and no other way; `false` (the
   * default) for one that lets it be cast paying its cost. A card with both is cast either way.
   */
  free = false,
  /**
   * Nashi (CR 118.9): `true` asks for a permission whose spell is cast by paying life equal to its mana value (`mayPlay.lifeForMana`), the alternative cost `lifeForMana` and no other way;
   * `false` (the default) for one that lets it be cast another way.
   */
  life = false,
): boolean {
  return (
    obj.zone === 'exile' &&
    // CR 607.2a, 601.2a (Evendo Brushrazer): "you may play cards exiled with this creature", a permission of a static ability that pays the ordinary cost: no free or life alternative.
    ((!free && !life && linkedExilePlayPermitted(state, seat, obj)) ||
      state.continuousEffects.some(
        (e) =>
          e.change.kind === 'playPermission' &&
          e.change.seat === seat &&
          e.objects.includes(obj.id) &&
          // Lobelia (CR 118.9, 305.1): a land is played whatever the permission says about the mana cost of a spell: "without paying its mana cost" is no cost to a land.
          (asLand || (e.change.free === true) === free) &&
          (asLand || (e.change.lifeForMana === true) === life) &&
          // "You may cast it this turn" (Lorehold group 1): a permission to cast is none to play a land.
          !(asLand && e.change.castOnly === true) &&
          // Vivien, Champion of the Wilds (CR 601.2): "you may cast it if it's a creature spell": the permission is for a creature card only.
          (e.change.creatureSpellsOnly !== true || derive(state, obj).types.includes('creature')) &&
          // Issue 101 (Neriv, CR 903.3): "during any turn you attacked with a commander".
          (e.change.whenAttackedWithCommander !== true ||
            attackedWithCommanderThisTurn(state, seat)),
      ))
  );
}

/**
 * "If that spell would be put into a graveyard, put it on the bottom of its owner's library instead" (Lorehold group 2, CR 614.1a): whether the spell cast from exile with the
 * permission of `free` kind that names `obj` carries the rider. It does when every permission of that kind that names the card carries it: a player who has another permission to
 * cast the card without the rider uses that one, as they may choose, so the rider is not forced on them.
 */
export function playPermissionBottoms(
  state: GameState,
  seat: SeatId,
  obj: GameObject,
  free: boolean,
): boolean {
  const grants = state.continuousEffects.filter(
    (e) =>
      e.change.kind === 'playPermission' &&
      e.change.seat === seat &&
      e.objects.includes(obj.id) &&
      (e.change.free === true) === free,
  );
  return (
    obj.zone === 'exile' &&
    grants.length > 0 &&
    grants.every((e) => e.change.kind === 'playPermission' && e.change.bottomInstead === true)
  );
}

/**
 * CR 601.2, 305.1, 611.2a (D-327): whether an effect ("Mill a card. You may play that card this turn.") lets `seat` cast or play the card `obj` in a
 * graveyard: a `playPermission` of the seat that names this very object (a card that left the graveyard is a new one, CR 400.7) and has not ended.
 * The effect names only cards the seat owns (`runMayPlay`).
 */
export function mayPlayFromGraveyard(
  state: GameState,
  seat: SeatId,
  obj: GameObject,
  asLand = false,
): boolean {
  return (
    obj.zone === 'graveyard' &&
    obj.owner === seat &&
    state.continuousEffects.some(
      (e) =>
        e.change.kind === 'playPermission' &&
        e.change.seat === seat &&
        e.objects.includes(obj.id) &&
        !(asLand && e.change.castOnly === true),
    )
  );
}

export function canPlayLand(state: GameState, seat: SeatId, obj: GameObject, face = 0): boolean {
  if (obj.card === null) return false;
  // D-151: a land card in exile an effect lets the player play ("You may play that card this turn").
  const fromExile = obj.zone === 'exile' && mayPlayFromExile(state, seat, obj, true);
  // D-232: a land card in the graveyard a permanent lets its controller play once each turn; D-327: or an effect let them play this turn.
  const fromGraveyard =
    obj.zone === 'graveyard' &&
    (mayPlayFromGraveyard(state, seat, obj, true) ||
      graveyardPlayPermission(state, seat, obj, true) !== null);
  // CR 305.1, 401.5: the top card of the library, when a permanent lets its controller play lands from there ("You may play lands from the top of your library").
  const fromLibrary = libraryLandPermission(state, seat, obj);
  if (!fromExile && !fromGraveyard && !fromLibrary && (obj.zone !== 'hand' || obj.owner !== seat)) {
    return false;
  }
  if (!castableFaces(definitionOf(state, obj.card)).includes(face)) return false;
  if (!derive(state, asFace(obj, face)).types.includes('land')) return false;
  if (!hasSorceryTiming(state, seat)) return false; // CR 305.1, 305.3
  // CR 305.2a, 305.2b: the lands already played this turn against the number the seat can play (D-125).
  return getSeat(state, seat).landsPlayedThisTurn < landPlaysAllowed(state, seat);
}

/**
 * "If that spell would be put into your graveyard, exile it instead" (D-359, CR 614.1a): whether the card in `obj`'s graveyard is cast with the rider of the cast
 * permission an effect gave it. It is so when every `castPermission` that names the card carries the rider and the card has no other way to be cast from the graveyard
 * (its own "you may cast this card from your graveyard", a permission to play it): a player who has both uses the one with no rider, as they may choose, so the rider
 * is not forced on them.
 */
/** Whether an effect that names `obj` lets `seat` cast it from the graveyard of any player (`mayCast.anyGraveyard`, issue 159). */
function grantedFromAnyGraveyard(state: GameState, seat: SeatId, obj: GameObject): boolean {
  return state.continuousEffects.some(
    (e) =>
      e.change.kind === 'castPermission' &&
      e.change.seat === seat &&
      e.change.anyGraveyard === true &&
      e.objects.includes(obj.id),
  );
}

/** The cards in any graveyard that an effect lets `seat` cast now (issue 159): the ones the cast permissions name. */
function anyGraveyardCastable(state: GameState, seat: SeatId): ObjectId[] {
  return state.continuousEffects
    .filter(
      (e) =>
        e.change.kind === 'castPermission' &&
        e.change.seat === seat &&
        e.change.anyGraveyard === true,
    )
    .flatMap((e) => e.objects)
    .filter((id) => state.objects[id]?.zone === 'graveyard' && state.objects[id]?.owner !== seat);
}

/** Whether the continuous effect is a cast permission for `seat` that covers the card `obj` of their graveyard: a named card, or (issue 159) a filter every matching card meets. */
function grantsCast(
  state: GameState,
  e: GameState['continuousEffects'][number],
  seat: SeatId,
  obj: GameObject,
): boolean {
  if (e.change.kind !== 'castPermission' || e.change.seat !== seat) return false;
  // CR 715.3 (Hildibrand Manderville): a permission to cast "as an Adventure" is the Adventure half's alone (`mayCastAdventureFromGraveyard`), never the card's normal cast.
  if (e.change.adventureOnly === true) return false;
  if (e.change.spells === undefined) return e.objects.includes(obj.id);
  return matchesFilter(
    state,
    obj,
    { ...e.change.spells, zone: 'graveyard' },
    { controller: seat, source: obj.id },
  );
}

export function castPermissionExiles(state: GameState, seat: SeatId, obj: GameObject): boolean {
  if (obj.zone !== 'graveyard' || obj.owner !== seat) return false;
  const grants = state.continuousEffects.filter((e) => grantsCast(state, e, seat, obj));
  if (grants.length === 0) return false;
  if (!grants.every((e) => e.change.kind === 'castPermission' && e.change.exileInstead === true))
    return false;
  if (mayPlayFromGraveyard(state, seat, obj)) return false;
  const face = faceOf(state, obj);
  return !(
    face?.abilities.some(
      (a) =>
        a.kind === 'static' &&
        a.static.kind === 'castFromGraveyard' &&
        a.static.using === undefined &&
        (a.condition === undefined ||
          evaluateCondition(state, a.condition, { controller: seat, source: obj.id })),
    ) ?? false
  );
}

/**
 * CR 715.3, 601.2 (Hildibrand Manderville): whether an effect ("you may cast it from your graveyard as an Adventure until the end of your next turn") lets `seat` cast the Adventure half
 * of `obj`, a card in their own graveyard: a `castPermission` of the seat that names this very object (a card that left the graveyard is a new one, CR 400.7) and has not ended.
 */
export function mayCastAdventureFromGraveyard(
  state: GameState,
  seat: SeatId,
  obj: GameObject,
): boolean {
  if (obj.zone !== 'graveyard' || obj.owner !== seat || obj.card === null) return false;
  const def = definitionOf(state, obj.card);
  if (def.layout !== 'adventure' || isOmenFace(def)) return false;
  return state.continuousEffects.some(
    (e) =>
      e.change.kind === 'castPermission' &&
      e.change.seat === seat &&
      e.change.adventureOnly === true &&
      e.objects.includes(obj.id),
  );
}

/**
 * CR 113.6b, 604.2 (D-133): whether the card has the permission "You may cast this card from your graveyard [as long as
 * ...]" and its condition holds now, for its owner `seat` as "you" and the card as "this". The ability is read from the card's
 * front face, which is what it is in the graveyard (CR 712.8a). Or (D-135) an effect gave it a permission for this turn.
 */
export function mayCastFromGraveyard(state: GameState, seat: SeatId, obj: GameObject): boolean {
  if (obj.zone !== 'graveyard') return false;
  // Issue 159, CR 601.2: "You may cast target creature card in a graveyard this turn" names a card of any player's graveyard.
  if (obj.owner !== seat) return grantedFromAnyGraveyard(state, seat, obj);
  // D-135, CR 611.2a: "You may cast target Zombie creature card from your graveyard this turn" gave this card, as it is now
  // (a card that moved is a new object, CR 400.7), the permission until the end of the turn.
  if (state.continuousEffects.some((e) => grantsCast(state, e, seat, obj))) {
    return true;
  }
  // D-327, CR 601.2: "Mill a card. You may play that card this turn." lets the owner cast the card they milled.
  if (mayPlayFromGraveyard(state, seat, obj)) return true;
  const face = faceOf(state, obj);
  if (face === null) return false;
  return face.abilities.some(
    (a) =>
      a.kind === 'static' &&
      a.static.kind === 'castFromGraveyard' &&
      // CR 702.152a: "using its blitz ability" is a permission for the blitz cost only (`castZone`), not to cast the card for its mana cost.
      a.static.using === undefined &&
      (a.condition === undefined ||
        evaluateCondition(state, a.condition, { controller: seat, source: obj.id })),
  );
}

/**
 * CR 601.3 (D-151): the permission a static ability of a permanent `seat` controls gives to cast `obj` from the top of its owner's library ("creature spells
 * with power 4 or greater"), or null when none does: `obj` is the top card of the seat's own library and is a spell the ability's filter matches, as the
 * card it is. `gainsHaste` is whether the spell then becomes a permanent with haste until end of turn.
 */
export function libraryCastPermission(
  state: GameState,
  seat: SeatId,
  obj: GameObject,
): { readonly gainsHaste: boolean } | null {
  if (obj.zone !== 'library' || obj.owner !== seat || obj.card === null) return null;
  if (getSeat(state, seat).library[0] !== obj.id) return null;
  let gainsHaste = false;
  let allowed = false;
  for (const source of libraryCastSources(state)) {
    if (controllerOf(state, source.object) !== seat) continue;
    if (
      source.condition !== undefined &&
      !evaluateCondition(state, source.condition, { controller: seat, source: source.object.id })
    ) {
      continue;
    }
    if (
      !matchesFilter(
        state,
        obj,
        { ...source.spells, zone: 'library' },
        { controller: seat, source: source.object.id },
      )
    ) {
      continue;
    }
    allowed = true;
    if (source.gainsHaste) gainsHaste = true;
  }
  return allowed ? { gainsHaste } : null;
}

/**
 * Where the seat could cast this object from, or null (CR 601.2a, 903.8). Without an alternative
 * that is the hand, or the command zone for the seat's commander, or exile for a card its owner
 * exiled on an Adventure, which is cast as its normal face, not as the Adventure again (CR 715.3d).
 * With `flashback` it is the owner's graveyard, for a card with the keyword that is an instant or
 * sorcery (CR 702.34a); a card in the graveyard without it, or a flashback cast from anywhere
 * else, is not castable. Flashback is read from the front face only (`validateCard` refuses it
 * elsewhere). The `free` alternative cost is cast from the same zones as no alternative at all. With `escape`
 * (CR 702.138a, D-124) it is the owner's graveyard too, for a card whose front face lists an escape cost, of any
 * card type but a land; the other named alternatives are cast from the hand and the command zone only.
 */
export function castZone(
  state: GameState,
  seat: SeatId,
  obj: GameObject,
  alternative?: CastAlternative,
  faceIndex = 0,
): CastFrom | null {
  // CR 722.3c (D-214): the copy of a prepare spell is cast from exile by the controller of the prepared permanent it was made for, for as long as that
  // permanent is on the battlefield and prepared; there are no alternative costs for it.
  if (obj.prepareOf !== undefined) {
    return alternative === undefined &&
      obj.zone === 'exile' &&
      preparedPermanentOf(state, obj, seat) !== null
      ? 'exile'
      : null;
  }
  // CR 601.2, 305.1 (D-187): a card in exile that another player owns may be cast by a player an effect let ("You may look at and play those cards"),
  // and an Adventure the player cast from a card they do not own is theirs to cast from exile (CR 715.3d: its controller exiles it, and that player may
  // play it).
  const theirs =
    obj.zone === 'exile' &&
    (obj.adventureBy === seat ||
      mayPlayFromExile(state, seat, obj) ||
      // Lorehold group 2 (CR 118.9): "You may cast that card this turn without paying its mana cost".
      mayPlayFromExile(state, seat, obj, false, true) ||
      // Nashi (CR 118.9): "pay life equal to its mana value rather than paying its mana cost".
      mayPlayFromExile(state, seat, obj, false, false, true) ||
      freeCastSlots(state, seat, obj, faceIndex).length > 0);
  // Issue 159: or a card of another player's graveyard that an effect named ("You may cast target creature card in a graveyard this turn").
  const fromTheirGraveyard = obj.zone === 'graveyard' && grantedFromAnyGraveyard(state, seat, obj);
  if (obj.owner !== seat && !theirs && !fromTheirGraveyard) return null;
  // CR 715.3d (D-187): an Adventure its caster did not own is on an adventure for that caster only, not for its owner.
  if (obj.zone === 'exile' && obj.adventureBy !== undefined && obj.adventureBy !== seat)
    return null;
  // CR 702.127a (Aftermath): a half with Aftermath is cast from a graveyard and from no other zone, paying its own mana cost (it takes no alternative cost); the other half of the
  // card is cast as any split half is.
  if (obj.card !== null && hasAftermath(definitionOf(state, obj.card).faces[faceIndex] ?? null)) {
    return alternative === undefined && obj.zone === 'graveyard' && obj.owner === seat
      ? 'graveyard'
      : null;
  }
  // CR 702.81a (Retrace, D-667): a card with retrace in its owner's graveyard is cast from there, paying its mana cost and discarding a land card.
  if (alternative === 'retrace') {
    if (obj.zone !== 'graveyard' || obj.card === null || faceIndex !== 0) return null;
    const retrace = faceOf(state, obj)?.abilities.some(
      (a) => a.kind === 'keyword' && a.keyword.kind === 'retrace',
    );
    return retrace === true ? 'graveyard' : null;
  }
  // CR 702.133a (Jump-start): a card with jump-start in its owner's graveyard is cast from there, paying its mana cost and discarding a card.
  if (alternative === 'jumpStart') {
    if (obj.zone !== 'graveyard' || obj.card === null || faceIndex !== 0) return null;
    const jumpStart = faceOf(state, obj)?.abilities.some(
      (a) => a.kind === 'keyword' && a.keyword.kind === 'jumpStart',
    );
    return jumpStart === true ? 'graveyard' : null;
  }
  if (alternative === 'flashback') {
    if (obj.zone !== 'graveyard' || obj.card === null || faceIndex !== 0) return null;
    const face = faceOf(state, obj);
    const spell = face?.types.includes('instant') || face?.types.includes('sorcery');
    if (spell !== true) return null;
    // CR 702.34a: printed flashback, or flashback with the cost equal to the mana cost that an effect or a permanent gave the card (rules/flashback-grant.ts).
    if (flashbackCostOf(face) !== null) return 'graveyard';
    return manaCostAsFlashbackCost(face) !== null && hasGrantedFlashback(state, seat, obj)
      ? 'graveyard'
      : null;
  }
  if (alternative === 'escape') {
    if (obj.zone !== 'graveyard' || obj.card === null || faceIndex !== 0) return null;
    // CR 702.138a: a printed escape cost, or the one an effect gave the card until end of turn (rules/escape-grant.ts).
    return escapeOf(state, obj, faceOf(state, obj)) === null ? null : 'graveyard';
  }
  // CR 702.152a, 601.2a: "You may cast this card from your graveyard using its blitz ability": a blitz cast from a graveyard, when the card says so and its condition holds (it is cast
  // from the hand otherwise, below).
  if (alternative === 'blitz' && obj.zone === 'graveyard') {
    if (obj.card === null || faceIndex !== 0 || obj.owner !== seat) return null;
    const face = faceOf(state, obj);
    return mayCastBlitzFromGraveyard(face) &&
      face?.abilities.some(
        (a) =>
          a.kind === 'static' &&
          a.static.kind === 'castFromGraveyard' &&
          a.static.using === 'blitz' &&
          (a.condition === undefined ||
            evaluateCondition(state, a.condition, { controller: seat, source: obj.id })),
      ) === true
      ? 'graveyard'
      : null;
  }
  // Issue 159: a card with a `sacrificeFromGraveyard` cost is cast from its owner's graveyard only.
  if (alternative === 'sacrificeFromGraveyard') {
    if (obj.zone !== 'graveyard' || obj.card === null || faceIndex !== 0) return null;
    return alternativeOf(faceOf(state, obj), 'sacrificeFromGraveyard') === null
      ? null
      : 'graveyard';
  }
  // CR 702.180a (Harmonize): cast from the owner's graveyard, an instant or a sorcery card whose front face lists the harmonize cost.
  if (alternative === 'harmonize') {
    if (obj.zone !== 'graveyard' || obj.card === null || faceIndex !== 0) return null;
    const face = faceOf(state, obj);
    const spell = face?.types.includes('instant') || face?.types.includes('sorcery');
    return spell === true && alternativeOf(face, 'harmonize') !== null ? 'graveyard' : null;
  }
  // CR 702.35a, 702.94a (D-128, D-274): a card is cast for its madness or miracle cost only as that ability resolves
  // (`castExiled`); it is never cast that way from a hand, so `canCast` and the option lists never offer it.
  if (alternative === 'madness' || alternative === 'miracle') return null;
  // CR 702.143a (D-128): a foretold card is cast from exile, after the turn it was foretold has ended, for its
  // foretell cost.
  if (alternative === 'foretell') {
    if (obj.zone !== 'exile' || obj.foretoldTurn === undefined || faceIndex !== 0) return null;
    if (state.turn.number <= obj.foretoldTurn) return null;
    return alternativeOf(faceOf(state, obj), 'foretell') === null ? null : 'exile';
  }
  // The other alternatives are never cast from a graveyard (D-121); an Adventure card is cast from exile.
  if (obj.zone === 'exile' && obj.onAdventure === true) return faceIndex === 0 ? 'exile' : null;
  // CR 113.6b (D-133): "You may cast this card from your graveyard [as long as ...]": the card's own static ability.
  if (obj.zone === 'graveyard') {
    // CR 715.3 (Hildibrand Manderville): "cast it from your graveyard as an Adventure": the Adventure half (face 1) only, paying its mana cost.
    if (
      faceIndex === 1 &&
      alternative === undefined &&
      mayCastAdventureFromGraveyard(state, seat, obj)
    ) {
      return 'graveyard';
    }
    // D-232: or a permanent's "Once during each of your turns, you may cast an artifact spell from your graveyard".
    return alternative === undefined &&
      faceIndex === 0 &&
      (mayCastFromGraveyard(state, seat, obj) ||
        graveyardPlayPermission(state, seat, obj, false) !== null)
      ? 'graveyard'
      : null;
  }
  // CR 601.3 (D-151): "You may cast creature spells with power 4 or greater from the top of your library".
  if (obj.zone === 'library') {
    return alternative === undefined &&
      faceIndex === 0 &&
      libraryCastPermission(state, seat, obj) !== null
      ? 'library'
      : null;
  }
  // D-151: "You may play that card this turn": a card in exile with such a permission is cast as though it were in the hand.
  if (obj.zone === 'exile') {
    // Lorehold group 2 (CR 118.9): a permission to cast without paying the mana cost is the alternative cost `free`, and only that.
    // CR 601.2, 118.9 (`mayCastEachType`): "you may cast a spell of that type from among the exiled cards without paying its mana cost", at the timing of its type.
    if (alternative === 'free') {
      return mayPlayFromExile(state, seat, obj, false, true) ||
        freeCastSlots(state, seat, obj, faceIndex).length > 0 ||
        // CR 702.170d: a plotted card is cast from exile without paying its mana cost.
        mayCastPlotted(state, seat, obj)
        ? 'exile'
        : null;
    }
    // Nashi (CR 118.9): the alternative cost `lifeForMana` of a permission to cast the card by paying life equal to its mana value.
    if (alternative === 'lifeForMana') {
      return mayPlayFromExile(state, seat, obj, false, false, true) ? 'exile' : null;
    }
    // Tlincalli Hunter: the alternative cost a permanent gives for spells cast from exile is paid instead of the mana cost of a card the player may cast from exile.
    return (alternative === undefined || alternative === 'energyGrant') &&
      mayPlayFromExile(state, seat, obj)
      ? 'exile'
      : null;
  }
  if (obj.zone === 'hand') return 'hand';
  // A card in the command zone is one card, never a melded permanent (D-277).
  if (obj.zone === 'command' && isCommanderCardId(state, obj.card)) {
    return 'command';
  }
  return null;
}

/**
 * The target slots of a spell, or of an ability on the stack (which keeps its own text, CR 113.7a).
 * An Aura spell has one more, first: the object its enchant ability names (CR 303.4a).
 */
export function targetSpecsOf(
  state: GameState,
  obj: GameObject,
  /** The spell is cast for its overload cost (D-121): it has no targets, whatever its text said. */
  overloaded = obj.stack?.alt === 'overload',
  /** D-181: whether the spell is kicked, for the slots that exist only if it was (or was not): the spell on the stack says so; a card not cast yet is asked both ways. */
  kicked = obj.stack?.kicked === true,
  /** Whether Gift was promised. Before casting, callers can ask either branch. */
  giftPromised = obj.stack?.giftTo !== undefined,
  /** CR 702.103b: the spell is cast for its bestow cost: an Aura spell with "enchant creature", whatever its card is. */
  bestowed = obj.stack?.alt === 'bestow',
): readonly TargetSpec[] {
  // CR 702.96b: a spell cast for its overload cost won't require any targets.
  if (overloaded && obj.stack?.ability == null) return [];
  const ability = obj.stack?.ability;
  const chosenModes = obj.stack?.chosenModes ?? [];
  if (ability) {
    // A modal ability has the targets of the modes chosen for it, and no others (CR 700.2c, D-114).
    const modal = modalOfAbility(ability);
    return modal ? chosenModeSpecs(modal, chosenModes).map((e) => e.spec) : (ability.targets ?? []);
  }
  const face = faceOf(state, obj);
  const modal = modalOfSpellText(face?.spell);
  // D-135: a slot with a gift condition is chosen only in the matching promised or unpromised branch.
  const promised = giftPromised;
  const declared = (
    modal ? chosenModeSpecs(modal, chosenModes).map((e) => e.spec) : (face?.spell?.targets ?? [])
  )
    .filter((spec) => spec.ifGiftPromised === undefined || spec.ifGiftPromised === promised)
    // CR 702.33g, 601.2c (D-181): a slot of the kicked spell's text, or of the unkicked spell's, is chosen only in that case.
    .filter((spec) => (spec.ifKicked !== true || kicked) && (spec.unlessKicked !== true || !kicked))
    // Issue 244, CR 601.2c: a slot of the text that applies only to a spell cast during its controller's main phase.
    .filter((spec) => spec.ifCastInOwnMain !== true || castInOwnMainPhase(state, obj));
  // Only a card that is not on the battlefield is being cast (an Aura permanent has no spell text).
  const aura =
    obj.zone === 'battlefield'
      ? null
      : bestowed && obj.stack?.ability == null
        ? BESTOW_TARGET_SPEC
        : auraTargetSpec(face);
  return aura === null ? declared : [aura, ...declared];
}

/**
 * Every slot can be filled with at least its minimum number of legal targets (CR 601.2c); a modal spell
 * needs one legal choice of modes (CR 700.2a), its modes' targets being looked at as the modes are chosen.
 */
export function targetsPossible(
  state: GameState,
  seat: SeatId,
  obj: GameObject,
  overloaded = false,
  /** D-181: the spell would be cast kicked (the slots that depend on the kicker). */
  kicked = obj.stack?.kicked === true,
  /** D-408: the spell is cast only by its own conditional flash ("if it targets a commander"): its targets must be objects this filter matches. */
  only: ObjectFilter | null = null,
  /** CR 702.103b: the spell would be cast for its bestow cost (it needs a creature to target). */
  bestowed = obj.stack?.alt === 'bestow',
): boolean {
  // CR 702.96b: an overloaded spell needs no target (the "each" of its text affects what matches).
  if (overloaded) return true;
  const ctx = { controller: seat, source: obj.id };
  const face = faceOf(state, obj);
  const modal = modalOfSpellText(face?.spell);
  if (modal !== null && legalModeSets(state, modal, ctx).length === 0) return false;
  const giftBranches =
    obj.stack == null &&
    hasGift(face) &&
    (face?.spell?.targets ?? []).some((spec) => spec.ifGiftPromised !== undefined)
      ? [false, true]
      : [obj.stack?.giftTo !== undefined];
  return giftBranches.some((giftPromised) => {
    const specs = targetSpecsOf(state, obj, false, kicked, giftPromised, bestowed);
    // D-408: a spell with nothing it must target cannot meet "if it targets a commander".
    const restricted = only === null ? -1 : flashSlotOf(specs);
    if (only !== null && restricted < 0) return false;
    return (
      specs.every((spec, i) => slotCanBeFilled(state, spec, ctx, i === restricted ? only : null)) &&
      sameControllerFillable(state, specs, ctx)
    );
  });
}

/**
 * Whether the face has a target slot that depends on the kicker (`TargetSpec.ifKicked`, `unlessKicked`, D-181): then the spell can be cast
 * kicked or not, and what it needs (a target, mana) is looked at for each way.
 */
export function hasKickedTargets(face: CardFace | null): boolean {
  return (face?.spell?.targets ?? []).some((t) => t.ifKicked === true || t.unlessKicked === true);
}

/**
 * CR 702.137a, 119.3: whether a player that is still in the game and is an opponent of `seat` lost life this
 * turn (damage, a life-loss effect or life paid, all counted by `loseLifeBy`). The life lost by `seat` and by
 * players who left the game does not count (D-124).
 */
/**
 * CR 702.173a (Freerunning, Petty Larceny): whether `seat` dealt combat damage to a player this turn with an Assassin or a commander: a creature `seat` controlled as it dealt the damage
 * (`TurnLog.combatDamaged`, kept as the damage is dealt, so every damage step counts and a creature that has left still does) that had the Assassin creature type or was one of its owner's
 * commanders (read from the object as it last was when it has left the battlefield).
 */
export function dealtCombatDamageWithAssassinOrCommander(state: GameState, seat: SeatId): boolean {
  return state.turnLog.combatDamaged.some((hit) => {
    if (hit.controller !== seat) return false;
    if (hit.subtypes.includes('Assassin')) return true;
    const source = state.objects[hit.source] ?? state.lki[hit.source]?.object;
    return source !== undefined && isCommanderObject(state, source);
  });
}

export function opponentLostLifeThisTurn(state: GameState, seat: SeatId): boolean {
  return opponentsOf(state, seat).some((id) => getSeat(state, id).lifeLostThisTurn > 0);
}

/**
 * CR 118.9, 903.3d: whether the card's alternative cost of `kind` (`free`: "You may cast this spell
 * without paying its mana cost", usually "If you control a commander, ..."; a named one, D-121) can be
 * used for `face` now: the face lists it and its condition holds for the player casting it.
 */
export function alternativeCostAllowed(
  state: GameState,
  seat: SeatId,
  obj: GameObject,
  face: number,
  kind: AlternativeCost['kind'],
): boolean {
  if (obj.card === null) return false;
  // Lorehold group 2 (CR 118.9): a card in exile the effect lets its controller cast without paying its mana cost: the card lists no alternative cost for it.
  if (kind === 'free' && obj.zone === 'exile' && mayPlayFromExile(state, seat, obj, false, true)) {
    return true;
  }
  // CR 702.170d: a plotted card in exile is cast without paying its mana cost, though its face lists no alternative cost.
  if (kind === 'free' && mayCastPlotted(state, seat, obj)) return true;
  const alt = definitionOf(state, obj.card).faces[face]?.alternativeCosts?.find(
    (a) => a.kind === kind,
  );
  // CR 702.138a: an escape cost the face lists, or the one an effect gave the card until end of turn (`gainEscape`, rules/escape-grant.ts).
  if (alt === undefined) {
    // CR 702.74a, 118.9: an evoke cost a static ability gives a spell as it is cast from the hand (`grantAlternativeCostToSpells`, rules/alt-cost-grant.ts).
    if (kind === 'evoke')
      return grantedEvokeOf(state, seat, castAs(obj, seat, face), obj.zone) !== null;
    return kind === 'escape' && grantedEscapeOf(state, obj) !== null;
  }
  // CR 702.96a: the text change of an overload cost is one the engine must be able to make.
  if (
    kind === 'overload' &&
    overloadedText(definitionOf(state, obj.card).faces[face]?.spell) === null
  ) {
    return false;
  }
  // CR 702.137a: "if an opponent lost life this turn", read as the spell is cast (601.2b), for the one casting it.
  if (kind === 'spectacle' && !opponentLostLifeThisTurn(state, seat)) return false;
  // CR 702.173a (Freerunning): "if you dealt combat damage to a player this turn with an Assassin or commander", read as the spell is cast, for the one casting it.
  if (kind === 'freerunning' && !dealtCombatDamageWithAssassinOrCommander(state, seat))
    return false;
  return (
    alt.condition === undefined ||
    evaluateCondition(state, alt.condition, { controller: seat, source: obj.id })
  );
}

/**
 * Whether the seat may cast the card `obj` as `face` now (CR 601.2). Only that face is evaluated
 * (CR 709.3a, 712.11c, 715.3a), so it is looked at as the spell it would be on the stack: its own
 * types for the timing, its own targets and its total cost (rules/cast-cost.ts): the mana cost or
 * the alternative cost, plus commander tax and additional costs, minus reductions, all of which the
 * seat must be able to pay (CR 118.3, 601.2h). Kicker is not part of this: the kicked total is
 * asked about only when it can be paid (`beginCast`).
 */
export function canCast(
  state: GameState,
  seat: SeatId,
  obj: GameObject,
  alternative?: CastAlternative,
  face = 0,
): boolean {
  // CR 722.3c (D-214): the copy of a prepare spell in exile is cast as the spell it is (its own face), not as a card.
  const castCard = obj.prepareOf === undefined ? obj.card : (obj.copyOf ?? null);
  if (
    castCard === null ||
    (obj.prepareOf === undefined && !castableFaces(definitionOf(state, castCard)).includes(face))
  ) {
    return false;
  }
  // CR 702.61a: no spell is cast while a spell with split second is on the stack.
  if (splitSecondOnStack(state)) return false;
  const zone = castZone(state, seat, obj, alternative, face);
  if (zone === null) return false;
  // Free and the named alternatives (overload, ...) are listed on the face, with a condition (D-121).
  // `mayCastEachType`: a card in exile is cast for free by the permission of an effect, not because its face lists the alternative cost.
  const byPermission =
    alternative === 'free' &&
    obj.zone === 'exile' &&
    obj.onAdventure !== true &&
    obj.prepareOf === undefined &&
    (freeCastSlots(state, seat, obj, face).length > 0 || mayCastPlotted(state, seat, obj));
  if (
    (alternative === 'free' || isNamedAlternative(alternative)) &&
    !byPermission &&
    !alternativeCostAllowed(state, seat, obj, face, alternative)
  ) {
    return false;
  }
  // CR 118.9: "Rather than pay the mana cost of the next spell you cast this turn, you may pay life": only while an effect grants it.
  if (
    alternative === 'lifeForMana' &&
    !mayPayLifeForMana(state, seat) &&
    // Nashi: a card in exile a permission lets the seat cast by paying life.
    !(obj.zone === 'exile' && mayPlayFromExile(state, seat, obj, false, false, true))
  ) {
    return false;
  }
  // CR 118.9, 107.14 (issue 105, Nissa): only while a permanent of the caster gives it for this spell.
  if (
    alternative === 'energyGrant' &&
    grantedEnergyOf(state, seat, castAs(obj, seat, face, alternative), obj.zone) === null
  ) {
    return false;
  }
  const spell = castAs(obj, seat, face, alternative);
  const types = derive(state, spell).types;
  if (types.includes('land')) return false;
  // CR 101.2 (D-149): "You can't cast ~ during your first, second, or third turns of the game".
  if (castForbiddenByOwnAbility(state, seat, spell)) return false;
  // CR 101.2 (D-179): "Your opponents can't cast spells during your turn"; (D-282) "... with mana value 3 or less", read with the least X the spell can be cast with.
  const least = leastAllowedX(
    state,
    seat,
    spell,
    hasX(spellXCost(faceOf(state, spell), alternative)),
  );
  if (least === null) return false;
  const timing = castTiming(state, seat, spell);
  if (!timing.allowed) return false;
  // CR 702.170d: a plotted card is cast during its owner's main phase while the stack is empty, whatever its types (flash does not change that), unless another permission lets it
  // be cast now.
  if (
    alternative === 'free' &&
    mayCastPlotted(state, seat, obj) &&
    !mayPlayFromExile(state, seat, obj, false, true) &&
    freeCastSlots(state, seat, obj, face).length === 0 &&
    !hasSorceryTiming(state, seat)
  ) {
    return false;
  }
  // CR 702.33g, 601.2c (D-181): a spell whose targets depend on the kicker can be cast either way; it is castable if one way has its targets and its cost.
  const kickedWays = hasKickedTargets(faceOf(state, spell)) ? [false, true] : [false];
  const payments = modePayments(state, seat, spell);
  return kickedWays.some(
    (kicked) =>
      // The cost is asked first: it is the cheaper check when the seat has no mana, and both are pure.
      payments.some((modes) => {
        const request = {
          seat,
          spell,
          zone,
          alternative,
          kicked,
          excluded: obj.id,
          x: least,
          // CR 702.120a (D-145): a modal spell with escalate needs at least the mana for the fewest modes it must choose; with modes that have a cost (D-433) the set chosen.
          ...modes,
        } as const;
        // CR 702.180a (Harmonize): paid with no creature tapped, or with one tapped (which then pays no mana).
        return alternative === 'harmonize'
          ? harmonizeWays(state, seat).some((way) =>
              canPayRequest(way.state, seat, spell, { ...request, harmonizeTap: way.tap }),
            )
          : canPayRequest(state, seat, spell, request);
      }) &&
      targetsPossible(
        state,
        seat,
        spell,
        alternative === 'overload',
        kicked,
        timing.onlyTargets,
        alternative === 'bestow',
      ),
  );
}

/**
 * What a spell's modes add to its cost, for the check that it can be cast at all (CR 601.2f, 700.2h): one request for each way of choosing the modes. A spell that is not modal
 * has none to add; one whose modes have no cost of their own needs the mana of the fewest modes it must choose (escalate, CR 702.120a, D-145); one with modes that cost something
 * (Tiered, D-433) can be cast if some legal choice of modes can be paid, whatever it costs.
 */
function modePayments(
  state: GameState,
  seat: SeatId,
  spell: GameObject,
): readonly { readonly modes: number; readonly modeSet?: readonly number[] }[] {
  const face = faceOf(state, spell);
  const modal = modalOfSpellText(face?.spell);
  if (modal === null) return [{ modes: 0 }];
  if (!hasModeCosts(face)) return [{ modes: modal.choose.min }];
  return legalModeSets(state, modal, { controller: seat, source: spell.id }).map((set) => ({
    modes: set.length,
    modeSet: set,
  }));
}

/**
 * CR 608.2g, 702.85a (D-120): whether `seat` may cast the card `obj`, in exile, as the effect of the ability it is
 * resolving allows, without paying its mana cost: its front face, which is not a land, has a legal target for each
 * of its targets, and has additional costs that can be paid. No timing restriction applies (CR 608.2g: the player
 * does not receive priority, and the spell is not cast at the time its type allows), and the card needs no
 * alternative cost of its own: the free cast is the effect's. With `madness` or `miracle` the cost is the card's own.
 */
export function canCastDuringResolution(
  state: GameState,
  seat: SeatId,
  obj: GameObject,
  /**
   * `madness` (CR 702.35a, D-128): the card is cast for its madness cost as its ability resolves, so that cost has to be
   * payable (the card lists one); otherwise it is the free cast of Cascade and Suspend. `miracle` (CR 702.94a, D-274): the same
   * with the miracle cost, for a card that is in the hand (its X, when it has one, is announced in the cast). `normal` (D-350): the card, in a graveyard, is cast
   * paying its mana cost (an effect named it).
   */
  alternative: 'free' | 'freeGraveyard' | 'normal' | 'madness' | 'miracle' = 'free',
  /** D-351 (CR 609.4b): mana of any type can be spent to cast the spell (`normal` only): the cost is read that way. */
  anyManaType = false,
  /** CR 118.9 (Blue Mage's Cane): the mana paid rather than the mana cost of a `free` cast, which has to be payable. */
  payInstead?: readonly Cost[],
  /** CR 608.2g, 402.3 (Silent-Blade Oni, Extract Brain): the card is in a hand, whoever's it is: an effect named it and the caster looked at it (`castFree.fromHand`). */
  fromAnyHand = false,
): boolean {
  // D-654 (CR 707.12): the copy of a card an effect made in exile is cast as the effect resolves, like the card itself.
  if (obj.card === null && obj.cardCopy !== true) return false;
  if (alternative === 'normal' || alternative === 'freeGraveyard') {
    // D-350 (CR 608.2g, 601.2): "you may cast target instant or sorcery card from a graveyard", paying its mana cost: the card is in a graveyard, whoever's it is (the
    // effect names it); the spell is cast from there and its owner stays the card's owner. Summon: Esper Valigarmanda (`castFree.paying`): or a card in exile, as the effect names it.
    if (obj.zone !== 'graveyard' && !(alternative === 'normal' && obj.zone === 'exile')) {
      return false;
    }
  } else if (obj.zone !== 'exile' && obj.zone !== 'hand' && obj.zone !== 'library') {
    // D-145: a card in the hand is cast this way as well ("You may cast a spell with mana value 5 or less from your hand without paying
    // its mana cost"); Cascade, Suspend and Madness cast cards from exile; "reveal the top card of your library. You may cast it" (`revealTopCast`)
    // casts the card from the library.
    return false;
  }
  // CR 608.2g: a card in a library is cast by the player whose library it is, as the effect that revealed it says (`revealTopCast`).
  if (obj.zone === 'library' && (obj.owner !== seat || alternative !== 'free')) return false;
  // D-149 (CR 702.75a, 608.2g): a card in exile is cast by the player the effect names, whoever owns it (see `canPlayLandByEffect`); a card in a
  // hand is the player's own.
  // CR 608.2g: a card of a library is cast from among the cards its owner looked at ("look at the top seven cards ... you may cast a spell from among them").
  if ((obj.zone === 'hand' || obj.zone === 'library') && obj.owner !== seat) {
    if (!(fromAnyHand && obj.zone === 'hand')) return false;
  }
  // CR 702.94a (D-274): a card is cast for its miracle cost from the hand it was revealed in.
  if (alternative === 'miracle' && obj.zone !== 'hand') return false;
  if (
    (alternative === 'madness' || alternative === 'miracle') &&
    alternativeOf(faceOf(state, obj), alternative) === null
  ) {
    return false;
  }
  const spell = castAs(obj, seat, 0);
  if (derive(state, spell).types.includes('land')) return false;
  if (castForbiddenByOwnAbility(state, seat, spell)) return false; // CR 101.2 (D-149)
  if (castForbiddenByOpponentsPermanent(state, seat, spell)) return false; // CR 101.2 (D-179, D-282: a free cast has X 0, CR 107.3b)
  const kickedWays = hasKickedTargets(faceOf(state, spell)) ? [false, true] : [false];
  const from = obj.zone;
  const payments = modePayments(state, seat, spell);
  return kickedWays.some(
    (kicked) =>
      targetsPossible(state, seat, spell, false, kicked) &&
      payments.some((modes) =>
        canPayRequest(state, seat, spell, {
          seat,
          spell,
          zone: from,
          // D-350: a cast that pays the mana cost has no alternative cost.
          alternative:
            alternative === 'normal'
              ? undefined
              : alternative === 'freeGraveyard'
                ? 'free'
                : alternative,
          kicked,
          excluded: obj.id,
          // CR 702.120a, 118.9 (D-145): a free cast still pays the escalate cost of the fewest modes it must choose, and the cost of the modes chosen (D-433).
          ...modes,
          ...(anyManaType ? { anyType: true as const } : {}),
          ...(payInstead === undefined ? {} : { payInstead }),
        }),
      ),
  );
}

/** One way to cast or play a card: the object, and its face when the card has several. */
export interface FaceOption {
  readonly object: ObjectId;
  /** Present exactly when the card has more than one face to choose from. */
  readonly face?: number;
  /** A card of the graveyard cast by `playFromGraveyardEachType` that can be cast as several permanent types: one option for each. */
  readonly permanentType?: CardType;
}

/** A cast of a card of the graveyard that can be counted as several permanent types is one option for each (`playFromGraveyardEachType`: the player chooses one as it is cast). */
function withTypeChoices(state: GameState, seat: SeatId, options: FaceOption[]): FaceOption[] {
  return options.flatMap((o) => {
    const obj = getObject(state, o.object);
    if (obj.zone !== 'graveyard' || mayCastFromGraveyard(state, seat, obj)) return [o];
    const types = graveyardCastTypes(state, seat, obj);
    return types.length < 2 ? [o] : types.map((permanentType) => ({ ...o, permanentType }));
  });
}

function faceOptions(
  state: GameState,
  ids: readonly ObjectId[],
  allowed: (obj: GameObject, face: number) => boolean,
): FaceOption[] {
  const out: FaceOption[] = [];
  for (const id of ids) {
    const obj = getObject(state, id);
    // CR 722.3c (D-214): the copy of a prepare spell has one face, its own, and is offered without a choice of face.
    if (obj.prepareOf !== undefined) {
      if (allowed(obj, obj.face)) out.push({ object: id });
      continue;
    }
    if (obj.card === null) continue;
    const def = definitionOf(state, obj.card);
    for (const face of castableFaces(def)) {
      if (allowed(obj, face)) out.push(choosesFace(def) ? { object: id, face } : { object: id });
    }
  }
  return out;
}

/** Whether the card has a half with Aftermath (CR 702.127a): in a graveyard it may be cast from there. */
function hasAftermathHalf(state: GameState, obj: GameObject): boolean {
  return obj.card !== null && definitionOf(state, obj.card).faces.some((f) => hasAftermath(f));
}

/**
 * Every spell the seat could cast now from the hand, the command zone, or exile for a card on an
 * Adventure, one entry per castable face (CR 709.3, 712.11b, 715.3).
 */
export function castableObjects(state: GameState, seat: SeatId): FaceOption[] {
  const onAdventure = state.exile.filter((id) => getObject(state, id).onAdventure === true);
  const prepared = state.exile.filter((id) => getObject(state, id).prepareOf !== undefined);
  const fromGraveyard = [
    ...zoneList(state, 'graveyard', seat).filter(
      (id) =>
        mayCastFromGraveyard(state, seat, getObject(state, id)) ||
        graveyardPlayPermission(state, seat, getObject(state, id), false) !== null ||
        mayCastAdventureFromGraveyard(state, seat, getObject(state, id)) ||
        hasAftermathHalf(state, getObject(state, id)),
    ),
    // Issue 159: the cards of other players' graveyards that an effect lets the seat cast this turn.
    ...anyGraveyardCastable(state, seat),
  ];
  const playable = state.exile.filter(
    (id) => !onAdventure.includes(id) && mayPlayFromExile(state, seat, getObject(state, id)),
  );
  const top = getSeat(state, seat).library[0];
  const candidates = [
    ...zoneList(state, 'hand', seat),
    ...zoneList(state, 'command', seat),
    ...onAdventure,
    ...prepared,
    ...fromGraveyard,
    ...playable,
    ...(top === undefined ? [] : [top]),
  ];
  return withTypeChoices(
    state,
    seat,
    faceOptions(state, candidates, (obj, face) => canCast(state, seat, obj, undefined, face)),
  );
}

/**
 * The cards (one entry per castable face) the seat could cast now for the alternative cost of `kind`
 * (CR 118.9, D-095, D-121): from the hand, the command zone or exile for an Adventure, where the face
 * lists that alternative cost, its condition holds and its whole cost can be paid. They are offered
 * beside the ordinary casts, one option per affordable alternative.
 */
export function alternativeCastObjects(
  state: GameState,
  seat: SeatId,
  kind: Exclude<CastAlternative, 'flashback'>,
): FaceOption[] {
  const onAdventure = state.exile.filter((id) => getObject(state, id).onAdventure === true);
  // Lorehold group 2 (CR 118.9): the cards in exile an effect lets the seat cast without paying their mana cost.
  const freeFromExile =
    kind === 'free'
      ? state.exile.filter(
          (id) =>
            !onAdventure.includes(id) &&
            mayPlayFromExile(state, seat, getObject(state, id), false, true),
        )
      : [];
  const candidates = [
    ...zoneList(state, 'hand', seat),
    ...zoneList(state, 'command', seat),
    ...onAdventure,
    ...freeFromExile,
    // CR 702.170d: the plotted cards of the seat in exile.
    ...(kind === 'free'
      ? state.exile.filter(
          (id) =>
            !onAdventure.includes(id) &&
            !freeFromExile.includes(id) &&
            mayCastPlotted(state, seat, getObject(state, id)),
        )
      : []),
    // `mayCastEachType`: the exiled cards a permission lets the seat cast without paying their mana costs.
    ...(kind === 'free'
      ? freeCastCards(state, seat).filter((id) => !freeFromExile.includes(id))
      : []),
    // Nashi (CR 118.9): the cards in exile a permission lets the seat cast by paying life equal to their mana value.
    ...(kind === 'lifeForMana'
      ? state.exile.filter(
          (id) =>
            !onAdventure.includes(id) &&
            mayPlayFromExile(state, seat, getObject(state, id), false, false, true),
        )
      : []),
    // Tlincalli Hunter (CR 118.9): the cards in exile the seat may cast, for an alternative cost a permanent gives for spells cast from exile.
    ...(kind === 'energyGrant'
      ? state.exile.filter(
          (id) => !onAdventure.includes(id) && mayPlayFromExile(state, seat, getObject(state, id)),
        )
      : []),
  ];
  return faceOptions(state, candidates, (obj, face) => canCast(state, seat, obj, kind, face));
}

/** The foretold cards of `seat` in exile it could cast now for their foretell cost (CR 702.143a, D-128). */
export function foretellCastObjects(state: GameState, seat: SeatId): ObjectId[] {
  return state.exile.filter((id) => {
    const obj = getObject(state, id);
    return obj.owner === seat && canCast(state, seat, obj, 'foretell');
  });
}

/** The cards in the seat's graveyard it could cast now for their escape cost (CR 702.138a, D-124). */
export function escapeObjects(state: GameState, seat: SeatId): ObjectId[] {
  return zoneList(state, 'graveyard', seat).filter((id) =>
    canCast(state, seat, getObject(state, id), 'escape'),
  );
}

/** The cards in the seat's graveyard it could cast now with retrace (CR 702.81a, D-667): the card is castable and a land card can be discarded for it. */
export function retraceObjects(state: GameState, seat: SeatId): ObjectId[] {
  return zoneList(state, 'graveyard', seat).filter((id) =>
    canCast(state, seat, getObject(state, id), 'retrace'),
  );
}

/** The cards in the seat's graveyard it could cast now with jump-start (CR 702.133a): the card is castable and a card can be discarded for it. */
export function jumpStartObjects(state: GameState, seat: SeatId): ObjectId[] {
  return zoneList(state, 'graveyard', seat).filter((id) =>
    canCast(state, seat, getObject(state, id), 'jumpStart'),
  );
}

/** The cards in the seat's graveyard it could cast now for their `sacrificeFromGraveyard` cost (issue 159). */
export function sacrificeFromGraveyardObjects(state: GameState, seat: SeatId): ObjectId[] {
  return zoneList(state, 'graveyard', seat).filter((id) =>
    canCast(state, seat, getObject(state, id), 'sacrificeFromGraveyard'),
  );
}

/** The cards in the seat's graveyard it could cast now for their blitz cost (CR 702.152a): "You may cast this card from your graveyard using its blitz ability". */
export function blitzGraveyardObjects(state: GameState, seat: SeatId): ObjectId[] {
  return zoneList(state, 'graveyard', seat).filter((id) =>
    canCast(state, seat, getObject(state, id), 'blitz'),
  );
}

/** The cards in the seat's graveyard it could cast now for their harmonize cost (CR 702.180a). */
export function harmonizeObjects(state: GameState, seat: SeatId): ObjectId[] {
  return zoneList(state, 'graveyard', seat).filter((id) =>
    canCast(state, seat, getObject(state, id), 'harmonize'),
  );
}

/** The cards in the seat's graveyard it could cast now with flashback (CR 702.34a). */
export function flashbackObjects(state: GameState, seat: SeatId): ObjectId[] {
  return zoneList(state, 'graveyard', seat).filter((id) =>
    canCast(state, seat, getObject(state, id), 'flashback'),
  );
}

/** Every land the seat could play now, one entry per land face of a card with several (CR 712.12). */
export function playableLands(state: GameState, seat: SeatId): FaceOption[] {
  // Lobelia, Defender of Bag End (CR 305.1): a land card an effect lets the seat play without paying its mana cost is a land to play (`asLand`, as `canPlayLand` asks).
  const fromExile = state.exile.filter((id) =>
    mayPlayFromExile(state, seat, getObject(state, id), true),
  );
  const fromGraveyard = zoneList(state, 'graveyard', seat).filter(
    (id) =>
      mayPlayFromGraveyard(state, seat, getObject(state, id)) ||
      graveyardPlayPermission(state, seat, getObject(state, id), true) !== null,
  );
  // CR 305.1, 401.5: the top card of the library (`playLandsFromTopOfLibrary`).
  const top = getSeat(state, seat).library[0];
  const fromLibrary =
    top !== undefined && libraryLandPermission(state, seat, getObject(state, top)) ? [top] : [];
  return faceOptions(
    state,
    [...zoneList(state, 'hand', seat), ...fromExile, ...fromGraveyard, ...fromLibrary],
    (obj, face) => canPlayLand(state, seat, obj, face),
  );
}
