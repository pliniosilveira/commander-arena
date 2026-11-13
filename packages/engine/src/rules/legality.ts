/**
 * What a seat may do with priority (CR 117.1, 601.3, 305, 307.1). Used both to list legal actions
 * and to validate the action a seat chooses, so the UI and the AI cannot diverge from the rules.
 */

import { overloadedText } from '../ast/overload';
import type { AlternativeCost, TargetSpec } from '../ast/types';
import type { CardFace } from '../cards/definition';
import type { ObjectId, SeatId } from '../ids';
import { definitionOf, getObject, getSeat, opponentsOf, printedCard, zoneList } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { alternativeOf, flashbackCostOf } from './alt-costs';
import { auraTargetSpec } from './attach';
import {
  type CastAlternative,
  type CastFrom,
  canPayRequest,
  castAs,
  isNamedAlternative,
} from './cast-cost';
import {
  castForbiddenByOpponentsPermanent,
  castForbiddenByOwnAbility,
  leastAllowedX,
} from './cast-restrictions';
import { evaluateCondition } from './conditions';
import { controllerOf } from './control';
import { derive } from './derive';
import { flashPermissionSources, libraryCastSources } from './derive-statics';
import { graveyardPlayPermission } from './graveyard-play';
import { hasKeyword } from './keywords';
import { asFace, castableFaces, choosesFace } from './layouts';
import { isCommanderCardId } from './melded';
import { chosenModeSpecs, legalModeSets, modalOfAbility, modalOfSpellText } from './modes';
import { preparedPermanentOf } from './prepare';
import { matchesFilter } from './select';
import { splitSecondOnStack } from './split-second';
import { landPlaysAllowed } from './statics';
import { slotCanBeFilled } from './target-choice';
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
  const types = derive(state, obj).types;
  if (types.includes('instant') || hasKeyword(state, obj, 'flash')) return true;
  // CR 601.3b (D-139): "You may cast artifact spells as though they had flash": a permanent of the caster's gives the permission.
  if (flashPermitted(state, seat, obj)) return true;
  return hasSorceryTiming(state, seat);
}

/**
 * CR 601.3b, 702.8a (D-139): whether a static ability of a permanent `seat` controls lets them cast the spell `obj` at the timing of
 * an instant: the filter of a `castAsThoughFlash` ability describes the spell as it is cast (on the stack, CR 601.2a), whose controller
 * is the caster. The permission is the controller's alone; it does not give the spell the flash keyword.
 */
function flashPermitted(state: GameState, seat: SeatId, spell: GameObject): boolean {
  return flashPermissionSources(state).some(
    (source) =>
      controllerOf(state, source.object) === seat &&
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
 * the exiled card without paying its mana cost"): it is the seat's own turn and they have a land play left. The card is in their hand or in exile.
 * The timing of a land play (a main phase, an empty stack) is not asked: the effect is what lets them play it now.
 */
export function canPlayLandByEffect(state: GameState, seat: SeatId, obj: GameObject): boolean {
  if (obj.card === null || (obj.zone !== 'hand' && obj.zone !== 'exile')) return false;
  // D-149 (CR 702.75a, 608.2g): a card in exile is the effect's to name, whoever owns it (a Hideaway permanent that changed controller lets its
  // new controller play the card its old one exiled); a card in a hand is the player's own.
  if (obj.zone === 'hand' && obj.owner !== seat) return false;
  if (state.turn.activeSeat !== seat) return false;
  return getSeat(state, seat).landsPlayedThisTurn < landPlaysAllowed(state, seat);
}

/**
 * CR 601.2, 305.1, 611.2a (D-151): whether an effect ("You may play that card this turn") lets `seat` cast or play the card `obj` in exile: a
 * `playPermission` of the seat that names this very object (a card that left exile is a new one, CR 400.7) and has not ended.
 */
export function mayPlayFromExile(state: GameState, seat: SeatId, obj: GameObject): boolean {
  return (
    obj.zone === 'exile' &&
    state.continuousEffects.some(
      (e) =>
        e.change.kind === 'playPermission' && e.change.seat === seat && e.objects.includes(obj.id),
    )
  );
}

/**
 * CR 601.2, 305.1, 611.2a (D-327): whether an effect ("Mill a card. You may play that card this turn.") lets `seat` cast or play the card `obj` in a
 * graveyard: a `playPermission` of the seat that names this very object (a card that left the graveyard is a new one, CR 400.7) and has not ended.
 * The effect names only cards the seat owns (`runMayPlay`).
 */
export function mayPlayFromGraveyard(state: GameState, seat: SeatId, obj: GameObject): boolean {
  return (
    obj.zone === 'graveyard' &&
    obj.owner === seat &&
    state.continuousEffects.some(
      (e) =>
        e.change.kind === 'playPermission' && e.change.seat === seat && e.objects.includes(obj.id),
    )
  );
}

export function canPlayLand(state: GameState, seat: SeatId, obj: GameObject, face = 0): boolean {
  if (obj.card === null) return false;
  // D-151: a land card in exile an effect lets the player play ("You may play that card this turn").
  const fromExile = obj.zone === 'exile' && mayPlayFromExile(state, seat, obj);
  // D-232: a land card in the graveyard a permanent lets its controller play once each turn; D-327: or an effect let them play this turn.
  const fromGraveyard =
    obj.zone === 'graveyard' &&
    (mayPlayFromGraveyard(state, seat, obj) ||
      graveyardPlayPermission(state, seat, obj, true) !== null);
  if (!fromExile && !fromGraveyard && (obj.zone !== 'hand' || obj.owner !== seat)) return false;
  if (!castableFaces(definitionOf(state, obj.card)).includes(face)) return false;
  if (!derive(state, asFace(obj, face)).types.includes('land')) return false;
  if (!hasSorceryTiming(state, seat)) return false; // CR 305.1, 305.3
  // CR 305.2a, 305.2b: the lands already played this turn against the number the seat can play (D-125).
  return getSeat(state, seat).landsPlayedThisTurn < landPlaysAllowed(state, seat);
}

/**
 * CR 113.6b, 604.2 (D-133): whether the card has the permission "You may cast this card from your graveyard [as long as
 * ...]" and its condition holds now, for its owner `seat` as "you" and the card as "this". The ability is read from the card's
 * front face, which is what it is in the graveyard (CR 712.8a). Or (D-135) an effect gave it a permission for this turn.
 */
export function mayCastFromGraveyard(state: GameState, seat: SeatId, obj: GameObject): boolean {
  if (obj.zone !== 'graveyard' || obj.owner !== seat) return false;
  // D-135, CR 611.2a: "You may cast target Zombie creature card from your graveyard this turn" gave this card, as it is now
  // (a card that moved is a new object, CR 400.7), the permission until the end of the turn.
  if (
    state.continuousEffects.some(
      (e) =>
        e.change.kind === 'castPermission' && e.change.seat === seat && e.objects.includes(obj.id),
    )
  ) {
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
    obj.zone === 'exile' && (obj.adventureBy === seat || mayPlayFromExile(state, seat, obj));
  if (obj.owner !== seat && !theirs) return null;
  // CR 715.3d (D-187): an Adventure its caster did not own is on an adventure for that caster only, not for its owner.
  if (obj.zone === 'exile' && obj.adventureBy !== undefined && obj.adventureBy !== seat)
    return null;
  if (alternative === 'flashback') {
    if (obj.zone !== 'graveyard' || obj.card === null || faceIndex !== 0) return null;
    const face = faceOf(state, obj);
    const spell = face?.types.includes('instant') || face?.types.includes('sorcery');
    return spell === true && flashbackCostOf(face) !== null ? 'graveyard' : null;
  }
  if (alternative === 'escape') {
    if (obj.zone !== 'graveyard' || obj.card === null || faceIndex !== 0) return null;
    return alternativeOf(faceOf(state, obj), 'escape') === null ? null : 'graveyard';
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
    return alternative === undefined && mayPlayFromExile(state, seat, obj) ? 'exile' : null;
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
  // CR 702.174m (D-135): a slot that exists only if the gift was promised is chosen only then.
  const promised = obj.stack?.giftTo !== undefined;
  const declared = (
    modal ? chosenModeSpecs(modal, chosenModes).map((e) => e.spec) : (face?.spell?.targets ?? [])
  )
    .filter((spec) => spec.ifGiftPromised !== true || promised)
    // CR 702.33g, 601.2c (D-181): a slot of the kicked spell's text, or of the unkicked spell's, is chosen only in that case.
    .filter(
      (spec) => (spec.ifKicked !== true || kicked) && (spec.unlessKicked !== true || !kicked),
    );
  // Only a card that is not on the battlefield is being cast (an Aura permanent has no spell text).
  const aura = obj.zone === 'battlefield' ? null : auraTargetSpec(face);
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
): boolean {
  // CR 702.96b: an overloaded spell needs no target (the "each" of its text affects what matches).
  if (overloaded) return true;
  const ctx = { controller: seat, source: obj.id };
  const modal = modalOfSpellText(faceOf(state, obj)?.spell);
  if (modal !== null && legalModeSets(state, modal, ctx).length === 0) return false;
  return targetSpecsOf(state, obj, false, kicked).every((spec) =>
    slotCanBeFilled(state, spec, ctx),
  );
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
  const alt = definitionOf(state, obj.card).faces[face]?.alternativeCosts?.find(
    (a) => a.kind === kind,
  );
  if (alt === undefined) return false;
  // CR 702.96a: the text change of an overload cost is one the engine must be able to make.
  if (
    kind === 'overload' &&
    overloadedText(definitionOf(state, obj.card).faces[face]?.spell) === null
  ) {
    return false;
  }
  // CR 702.137a: "if an opponent lost life this turn", read as the spell is cast (601.2b), for the one casting it.
  if (kind === 'spectacle' && !opponentLostLifeThisTurn(state, seat)) return false;
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
  if (
    (alternative === 'free' || isNamedAlternative(alternative)) &&
    !alternativeCostAllowed(state, seat, obj, face, alternative)
  ) {
    return false;
  }
  const spell = castAs(obj, seat, face);
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
  if (!timingAllows(state, seat, spell)) return false;
  // CR 702.33g, 601.2c (D-181): a spell whose targets depend on the kicker can be cast either way; it is castable if one way has its targets and its cost.
  const kickedWays = hasKickedTargets(faceOf(state, spell)) ? [false, true] : [false];
  return kickedWays.some(
    (kicked) =>
      targetsPossible(state, seat, spell, alternative === 'overload', kicked) &&
      canPayRequest(state, seat, spell, {
        seat,
        spell,
        zone,
        alternative,
        kicked,
        excluded: obj.id,
        x: least,
        // CR 702.120a (D-145): a modal spell with escalate needs at least the mana for the fewest modes it must choose.
        modes: modalOfSpellText(faceOf(state, spell)?.spell)?.choose.min ?? 0,
      }),
  );
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
  alternative: 'free' | 'normal' | 'madness' | 'miracle' = 'free',
  /** D-351 (CR 609.4b): mana of any type can be spent to cast the spell (`normal` only): the cost is read that way. */
  anyManaType = false,
): boolean {
  if (obj.card === null) return false;
  if (alternative === 'normal') {
    // D-350 (CR 608.2g, 601.2): "you may cast target instant or sorcery card from a graveyard", paying its mana cost: the card is in a graveyard, whoever's it is (the
    // effect names it); the spell is cast from there and its owner stays the card's owner.
    if (obj.zone !== 'graveyard') return false;
  } else if (obj.zone !== 'exile' && obj.zone !== 'hand') {
    // D-145: a card in the hand is cast this way as well ("You may cast a spell with mana value 5 or less from your hand without paying
    // its mana cost"); Cascade, Suspend and Madness cast cards from exile.
    return false;
  }
  // D-149 (CR 702.75a, 608.2g): a card in exile is cast by the player the effect names, whoever owns it (see `canPlayLandByEffect`); a card in a
  // hand is the player's own.
  if (obj.zone === 'hand' && obj.owner !== seat) return false;
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
  return kickedWays.some(
    (kicked) =>
      targetsPossible(state, seat, spell, false, kicked) &&
      canPayRequest(state, seat, spell, {
        seat,
        spell,
        zone: from,
        // D-350: a cast that pays the mana cost has no alternative cost.
        alternative: alternative === 'normal' ? undefined : alternative,
        kicked,
        excluded: obj.id,
        // CR 702.120a, 118.9 (D-145): a free cast still pays the escalate cost of the fewest modes it must choose.
        modes: modalOfSpellText(faceOf(state, spell)?.spell)?.choose.min ?? 0,
        ...(anyManaType ? { anyType: true as const } : {}),
      }),
  );
}

/** One way to cast or play a card: the object, and its face when the card has several. */
export interface FaceOption {
  readonly object: ObjectId;
  /** Present exactly when the card has more than one face to choose from. */
  readonly face?: number;
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

/**
 * Every spell the seat could cast now from the hand, the command zone, or exile for a card on an
 * Adventure, one entry per castable face (CR 709.3, 712.11b, 715.3).
 */
export function castableObjects(state: GameState, seat: SeatId): FaceOption[] {
  const onAdventure = state.exile.filter((id) => getObject(state, id).onAdventure === true);
  const prepared = state.exile.filter((id) => getObject(state, id).prepareOf !== undefined);
  const fromGraveyard = zoneList(state, 'graveyard', seat).filter(
    (id) =>
      mayCastFromGraveyard(state, seat, getObject(state, id)) ||
      graveyardPlayPermission(state, seat, getObject(state, id), false) !== null,
  );
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
  return faceOptions(state, candidates, (obj, face) => canCast(state, seat, obj, undefined, face));
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
  const candidates = [
    ...zoneList(state, 'hand', seat),
    ...zoneList(state, 'command', seat),
    ...onAdventure,
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

/** The cards in the seat's graveyard it could cast now with flashback (CR 702.34a). */
export function flashbackObjects(state: GameState, seat: SeatId): ObjectId[] {
  return zoneList(state, 'graveyard', seat).filter((id) =>
    canCast(state, seat, getObject(state, id), 'flashback'),
  );
}

/** Every land the seat could play now, one entry per land face of a card with several (CR 712.12). */
export function playableLands(state: GameState, seat: SeatId): FaceOption[] {
  const fromExile = state.exile.filter((id) => mayPlayFromExile(state, seat, getObject(state, id)));
  const fromGraveyard = zoneList(state, 'graveyard', seat).filter(
    (id) =>
      mayPlayFromGraveyard(state, seat, getObject(state, id)) ||
      graveyardPlayPermission(state, seat, getObject(state, id), true) !== null,
  );
  return faceOptions(
    state,
    [...zoneList(state, 'hand', seat), ...fromExile, ...fromGraveyard],
    (obj, face) => canPlayLand(state, seat, obj, face),
  );
}
