/**
 * Selectors, filters and target legality (CR 115, 608.2b).
 *
 * Object identity does the heavy lifting for CR 608.2b: a target that changed zones is a new
 * object (CR 400.7), so its old ObjectId no longer exists in the zone it was chosen in and is
 * simply illegal.
 */
import type {
  ObjectFilter,
  ObjectRef,
  ObjectSelector,
  PlayerSelector,
  TargetSpec,
} from '../ast/types';
import type { Subtype } from '../characteristics';
import type { ObjectId, SeatId } from '../ids';
import { getObject, getSeat, objectsInZone, opponentsOf, seatsInOrder } from '../state/ops';
import type { ChosenTarget, GameObject, GameState, ThisWayCounts } from '../state/types';
import { chosenOf } from './chosen';
import { controllerOf } from './control';
import { defendingPlayerOf } from './defending';
import { derive } from './derive';
import { keywordKindsOf } from './derive-keywords';
import { type FilterSubject, matchesFilterWith } from './filter-match';
import { abilitiesHaveKeyword } from './keywords';
import { manaValueOfCost } from './mana-value';
import { commanderCardOf, successorsOf } from './melded';
import { playerCanBeTargetedBy } from './player-protection';
import { hasProtectionFrom } from './protection';
import { objectOrLki } from './source-info';

export interface SelectContext {
  readonly controller: SeatId;
  /** The spell or ability being cast or resolving, or the source of a static check. */
  readonly source: ObjectId | null;
  /**
   * While an ability is being activated: the ability's own object on the stack, which never
   * targets itself. `source` is then the permanent the ability belongs to, so "another" and
   * "this" mean that permanent (a creature may target itself with its own ability).
   */
  readonly stackObject?: ObjectId;
  /** What the previous move effect of this resolution produced: the `moved` reference (CR 400.7j). */
  readonly moved?: readonly ObjectId[];
  /** What the `triggerSubject` reference means: the object whose event caused this trigger. */
  readonly triggerSubject?: ObjectId;
  /** What `sacrificedCost` means (D-133): the permanents sacrificed to pay the cost of the ability that is resolving. */
  readonly costSacrificed?: readonly ObjectId[];
  /** What `sacrificed` means (D-177): the permanents the earlier `sacrifice` instructions of this resolution sacrificed. */
  readonly sacrificed?: readonly ObjectId[];
  /** What `triggerPlayer` ("that player") and `triggerDamage` ("that much") mean in this resolution (D-133). */
  readonly triggerPlayer?: SeatId;
  readonly triggerDamage?: number;
  /** The players the attack event of this trigger was declared at (`attackersAttackedYou`, D-149). */
  readonly triggerAttacked?: readonly SeatId[];
  /** The seats an `owner` selector of the filter names (see `FilterContext.owners`). */
  readonly owners?: readonly SeatId[];
  /** The seats a `controlledBy` selector of the filter names (D-179, see `FilterContext.controllers`). */
  readonly controllers?: readonly SeatId[];
  /**
   * An object a `countOf` does not count: the card of a spell that is not on the stack yet while its
   * cost is looked at beforehand (`canCast`), which the real cast has already moved there (CR 601.2a).
   */
  readonly excluded?: ObjectId;
  /**
   * The X of the spell or ability being resolved (`StackData.x`, CR 107.3a): what an `Amount` `x`
   * means. Absent when no spell or ability resolves; the source's own stack data is read then.
   */
  readonly x?: number;
  /** The total life lost by the earlier instructions of this resolution (`lifeLostThisWay`, D-120). */
  readonly lifeLost?: number;
  /** What the earlier instructions of this resolution did, for `thisWay` amounts (D-131). */
  readonly thisWay?: ThisWayCounts;
  /** The tally of the latest vote of this resolution, for `votesFor` amounts (D-194). */
  readonly votes?: Readonly<Record<string, number>>;
}

/** CR 903.3 (D-145): the object is a card its owner designated as a commander; a token or a copy of one is not. */
function isCommanderObject(state: GameState, obj: GameObject): boolean {
  // CR 903.3b (D-277): a melded permanent one of whose two cards is a commander is a commander.
  return commanderCardOf(state, obj) !== null;
}

/**
 * What a filter reads of an object (D-111): the characteristics `derive` gives it now, and its mana
 * value; or, for an object that has left (a look-back trigger reads the permanent that left, CR 603.10a),
 * the last-known information the engine kept as it left (CR 113.7a), power and toughness included.
 */
function describeObject(state: GameState, obj: GameObject): FilterSubject {
  if (state.objects[obj.id] === undefined) {
    const lki = state.lki[obj.id];
    if (lki !== undefined) {
      const c = lki.characteristics;
      return {
        types: c.types,
        supertypes: c.supertypes,
        subtypes: c.subtypes,
        colors: c.colors,
        power: lki.power,
        toughness: lki.toughness,
        // Only a filter that names a keyword reads them.
        get keywords() {
          return keywordKindsOf(lki.abilities);
        },
        get commander() {
          return isCommanderObject(state, lki.object);
        },
        get manaValue() {
          return manaValueOfCost(c.manaCost, lki.object);
        },
      };
    }
  }
  const d = derive(state, obj);
  return {
    types: d.types,
    supertypes: d.supertypes,
    subtypes: d.subtypes,
    colors: d.colors,
    power: d.power,
    toughness: d.toughness,
    get keywords() {
      return keywordKindsOf(d.abilities);
    },
    get commander() {
      return isCommanderObject(state, obj);
    },
    // Only a filter that compares mana value reads it.
    get manaValue() {
      return manaValueOfCost(d.manaCost, obj);
    },
  };
}

export function matchesFilter(
  state: GameState,
  obj: GameObject,
  filter: ObjectFilter,
  ctx: SelectContext,
): boolean {
  // CR 115.1, 601.2c (D-206): "that targets a creature": one of the spell's chosen targets is an object the inner filter matches.
  if (filter.targetsObject !== undefined) {
    const { targetsObject, ...rest } = filter;
    const aimed = (obj.stack?.chosenTargets ?? []).some((t) => {
      if (t.kind !== 'object') return false;
      const target = objectOrLki(state, t.id);
      return target !== null && matchesFilter(state, target, targetsObject, ctx);
    });
    return aimed && matchesFilter(state, obj, rest, ctx);
  }
  // D-100: "of the chosen type" reads what the source chose as it entered, which only the state knows.
  const chosen = chosenOf(state, ctx.source);
  const withChoice = chosen === undefined ? ctx : { ...ctx, sourceChosen: chosen };
  if (!readsGame(filter))
    return matchesFilterWith(state, obj, () => describeObject(state, obj), filter, withChoice);
  // D-120: "attacking" reads the combat, and "power less than this creature's power" the source's power.
  const reading = {
    ...withChoice,
    attackers: attackingCreatures(state),
    ...(filter.attackingOrBlocking === true ||
    (filter.anyOf?.some((m) => m.attackingOrBlocking === true) ?? false)
      ? { inCombat: creaturesInCombat(state) }
      : {}),
    ...(filter.manaValueAtMost !== undefined
      ? { manaValueLimit: manaValueLimitOf(state, filter.manaValueAtMost, ctx) }
      : {}),
    attackersOfYou: attackersOfPlayer(state, ctx.controller),
    ...(filter.attackingOpponents === true ||
    (filter.anyOf?.some((m) => m.attackingOpponents === true) ?? false)
      ? { attackersOfOpponents: attackersOfOpponents(state, ctx.controller) }
      : {}),
    ...(filter.powerLessThanSource === true && ctx.source !== null
      ? { sourcePower: powerOfObject(state, ctx.source) }
      : {}),
    ...(filter.manaValueX === true ? xFilterContext(state, ctx) : {}),
    ...(filter.controller === 'defendingPlayer'
      ? (() => {
          const seat = defendingPlayerOf(state, ctx.source);
          return seat === null ? {} : { defendingPlayer: seat };
        })()
      : {}),
    ...(filter.controllerDealtDamageBySource === true
      ? { damagedPlayers: damagedBy(state, ctx.source) }
      : {}),
    ...(filter.putFromBattlefieldThisTurn === true
      ? { graveyarded: state.turnLog.graveyarded }
      : {}),
    ...(filter.enteredThisTurn === true
      ? { entered: state.turnLog.entered.map((e) => e.object) }
      : {}),
    // D-261: the creature the trigger is about, as it last was (a dies trigger reads the permanent that left, CR 603.10a, 113.7a).
    ...(readsSharedType(filter) ? subjectSubtypesOf(state, ctx.triggerSubject) : {}),
  };
  return matchesFilterWith(state, obj, () => describeObject(state, obj), filter, reading);
}

/** Whether the filter, or one of its `anyOf` members, reads the combat or the source's power (D-120). */
function readsGame(f: ObjectFilter): boolean {
  return (
    f.attacking === true ||
    f.attackingYou === true ||
    f.attackingOpponents === true ||
    f.attackingOrBlocking === true ||
    f.manaValueAtMost !== undefined ||
    f.powerLessThanSource === true ||
    f.manaValueX === true ||
    f.controllerDealtDamageBySource === true ||
    f.putFromBattlefieldThisTurn === true ||
    f.enteredThisTurn === true ||
    f.sharesCreatureTypeWith !== undefined ||
    f.controller === 'defendingPlayer' ||
    (f.anyOf?.some(readsGame) ?? false)
  );
}

/** Whether the filter, or one of its `anyOf` members, asks for a creature type shared with the trigger's creature (D-261). */
function readsSharedType(f: ObjectFilter): boolean {
  return f.sharesCreatureTypeWith !== undefined || (f.anyOf?.some(readsSharedType) ?? false);
}

/** The subtypes of the object a trigger is about, as it is or as it last was; none known when there is no such object. */
function subjectSubtypesOf(
  state: GameState,
  subject: ObjectId | undefined,
): { subjectSubtypes?: readonly Subtype[] } {
  const obj = subject === undefined ? null : objectOrLki(state, subject);
  return obj === null ? {} : { subjectSubtypes: describeObject(state, obj).subtypes };
}

/** The X of the resolving spell or ability: `ctx.x`, else the source's own stack data (CR 107.3a); none if neither has one. */
function xFilterContext(state: GameState, ctx: SelectContext): { x?: number } {
  const x = ctx.x ?? (ctx.source === null ? null : state.objects[ctx.source]?.stack?.x);
  return x === null || x === undefined ? {} : { x };
}

/** The players the source dealt combat damage to this turn (D-139, CR 510.2). */
function damagedBy(state: GameState, source: ObjectId | null): readonly SeatId[] {
  if (source === null) return [];
  return state.turnLog.combatDamaged.filter((d) => d.source === source).map((d) => d.player);
}

/**
 * The creatures declared as attackers that are in combat (CR 506.4). One that has left the battlefield since is still listed (a creature that dies
 * is not taken out of the combat record), which is how a trigger that looks back in time (CR 603.10a, D-179: "Whenever an attacking creature dies")
 * reads that the creature was attacking as it died; a filter is matched against the object on the battlefield or its last-known information, never
 * against an object in another zone, so a listed creature that is gone matches only as that last-known object.
 */
/** The attackers and the blockers of the combat in progress (CR 506.4, 509.1g, D-229). */
function creaturesInCombat(state: GameState): readonly ObjectId[] {
  return [
    ...(state.combat?.attackers ?? []).map((a) => a.object),
    ...(state.combat?.blocks ?? []).map((b) => b.blocker),
  ];
}

/**
 * The number "mana value X or less, where X is ..." stands for (CR 202.3, D-230): a number, the power of this ability's source (as it is, or as it last was) or the damage
 * that triggered the ability. Anything else is 0 (`validateCard` allows only these).
 */
function manaValueLimitOf(
  state: GameState,
  amount: NonNullable<ObjectFilter['manaValueAtMost']>,
  ctx: SelectContext,
): number {
  if (typeof amount === 'number') return amount;
  if (amount.kind === 'triggerDamage') return ctx.triggerDamage ?? 0;
  if (amount.kind === 'powerOf' && ctx.source !== null) {
    return Math.max(0, powerOfObject(state, ctx.source) ?? 0);
  }
  return 0;
}

function attackingCreatures(state: GameState): readonly ObjectId[] {
  return (state.combat?.attackers ?? []).map((a) => a.object);
}

/**
 * The creatures attacking `seat` as a player (CR 508.1b, D-131): declared as attackers with that player as their
 * attack target, still on the battlefield and in combat. One attacking a planeswalker or battle they protect is not.
 */
function attackersOfPlayer(state: GameState, seat: SeatId): readonly ObjectId[] {
  return (state.combat?.attackers ?? [])
    .filter((a) => a.target.kind === 'player' && a.target.seat === seat)
    .map((a) => a.object);
}

/**
 * The creatures attacking an opponent of `seat` as a player, or a planeswalker or battle controlled or protected by one (CR 508.1b, 506.3, D-218): in combat,
 * whose target is still there.
 */
function attackersOfOpponents(state: GameState, seat: SeatId): readonly ObjectId[] {
  const opponents = opponentsOf(state, seat);
  return (state.combat?.attackers ?? [])
    .filter((a) => {
      if (a.targetGone === true) return false;
      if (a.target.kind === 'player') return opponents.includes(a.target.seat);
      const attacked = state.objects[a.target.object];
      return attacked !== undefined && a.defender !== undefined && opponents.includes(a.defender);
    })
    .map((a) => a.object);
}

/** The power an object has now, or had when it last existed; null for an object with none. */
function powerOfObject(state: GameState, id: ObjectId): number | null {
  const live = state.objects[id];
  return live === undefined ? (state.lki[id]?.power ?? null) : derive(state, live).power;
}

/**
 * The `countOf` amount (D-095): how many objects in the filter's zone match it, now. The zone is the
 * battlefield unless the filter says otherwise (or names a stack kind), as everywhere.
 */
export function countMatching(state: GameState, filter: ObjectFilter, ctx: SelectContext): number {
  const zone = filter.zone ?? (filter.stackKind ? 'stack' : 'battlefield');
  let count = 0;
  for (const id of objectsInZone(state, zone)) {
    if (id === ctx.excluded) continue;
    if (matchesFilter(state, getObject(state, id), filter, ctx)) count += 1;
  }
  return count;
}

/**
 * Whether protection from being targeted lets a spell or ability controlled by `controller` target
 * `obj`. CR 702.18a (Shroud): a permanent with shroud can't be the target of any spell or ability.
 * CR 702.11b (Hexproof): a permanent with hexproof can't be the target of spells or abilities its
 * controller's opponents control. Both are static abilities of permanents (CR 113.6), so a card on
 * the stack or in any other zone is unaffected. Read through `derive`, so granted keywords count.
 * Target legality is the one place this is checked: choosing targets (CR 601.2c, 603.3d) and
 * checking them again on resolution (CR 608.2b) both go through `legalTargets`.
 */
export function canBeTargetedBy(
  state: GameState,
  obj: GameObject,
  controller: SeatId,
  source: ObjectId | null = null,
): boolean {
  if (obj.zone !== 'battlefield') return true;
  // CR 702.16b (D-229): protection from a color: the spells and abilities of a source of that color can't target it.
  if (hasProtectionFrom(state, obj, source)) return false;
  const abilities = derive(state, obj).abilities;
  if (abilitiesHaveKeyword(abilities, 'shroud')) return false;
  return controllerOf(state, obj) === controller || !abilitiesHaveKeyword(abilities, 'hexproof');
}

/** Every legal target for one target slot, in a deterministic order (CR 115.4 for "any target"). */
export function legalTargets(
  state: GameState,
  spec: TargetSpec,
  ctx: SelectContext,
): ChosenTarget[] {
  const out: ChosenTarget[] = [];
  const specId = spec.id;
  const playersFor = (filter: 'any' | 'opponent'): ChosenTarget[] =>
    seatsInOrder(state, ctx.controller)
      .filter((s) => filter === 'any' || s !== ctx.controller)
      // CR 702.11b (D-149): "You have hexproof": the opponents of that player can't target them.
      .filter((s) => playerCanBeTargetedBy(state, s, ctx.controller))
      .map((seat) => ({ kind: 'player' as const, seat, specId }));

  if (spec.what.kind === 'player') return playersFor(spec.what.filter);
  if (spec.what.kind === 'playerOrObject') {
    // CR 115.1 (D-200): "target player or planeswalker": the permanents the filter matches, then the players.
    for (const id of objectsInZone(state, 'battlefield')) {
      const obj = getObject(state, id);
      if (
        matchesFilter(state, obj, spec.what.filter, ctx) &&
        canBeTargetedBy(state, obj, ctx.controller, ctx.source)
      ) {
        out.push({ kind: 'object', id, specId });
      }
    }
    return [...out, ...playersFor(spec.what.player)];
  }
  if (spec.what.kind === 'objectOrGraveyardCard') {
    // CR 115.1 (D-270): "other target creatures from the battlefield and/or creature cards from graveyards": the permanents the filter matches, then the cards
    // of any graveyard the card filter matches. Protection from being targeted is a permanent's alone (`canBeTargetedBy`).
    const { filter: permanents, card: cards } = spec.what;
    for (const [filter, zone] of [
      [permanents, 'battlefield'],
      [cards, 'graveyard'],
    ] as const) {
      for (const id of objectsInZone(state, zone)) {
        const obj = getObject(state, id);
        if (
          matchesFilter(state, obj, { ...filter, zone }, ctx) &&
          canBeTargetedBy(state, obj, ctx.controller, ctx.source)
        ) {
          out.push({ kind: 'object', id, specId });
        }
      }
    }
    return out;
  }
  if (spec.what.kind === 'anyTarget') {
    // CR 115.4: any target is a creature, player, planeswalker or battle.
    for (const id of state.battlefield) {
      const obj = getObject(state, id);
      const types = derive(state, obj).types;
      if (
        (types.includes('creature') ||
          types.includes('planeswalker') ||
          types.includes('battle')) &&
        canBeTargetedBy(state, obj, ctx.controller, ctx.source)
      ) {
        out.push({ kind: 'object', id, specId });
      }
    }
    return [...out, ...playersFor('any')];
  }
  const filter = spec.what.filter;
  const zone = filter.zone ?? (filter.stackKind ? 'stack' : 'battlefield');
  for (const id of objectsInZone(state, zone)) {
    const obj = getObject(state, id);
    // A spell or ability on the stack never targets itself while it is being put there.
    if (obj.zone === 'stack' && (id === ctx.source || id === ctx.stackObject)) continue;
    if (
      matchesFilter(state, obj, filter, ctx) &&
      canBeTargetedBy(state, obj, ctx.controller, ctx.source)
    ) {
      // D-149: a slot with one target for each opponent says whose each target is.
      out.push(
        spec.onePerOpponent === true
          ? { kind: 'object', id, specId, group: controllerOf(state, obj) }
          : { kind: 'object', id, specId },
      );
    }
  }
  return out;
}

export function targetBounds(spec: TargetSpec): { min: number; max: number } {
  // D-149: "for each opponent, up to one target ... that player controls": none at least, one for each opponent at most (the decision
  // narrows `max` to the opponents in the game, `targetChoiceSpecs`).
  if (spec.onePerOpponent === true) {
    return { min: spec.min ?? 0, max: spec.max ?? Number.MAX_SAFE_INTEGER };
  }
  // D-1190: "X target creature cards": as many as the announced X, which is 0 until it is (a spell is castable with X = 0, so the slot is no obstacle to
  // casting it); `targetChoiceSpecs` fixes the number once X is known.
  if (spec.countX === true) return { min: 0, max: Number.MAX_SAFE_INTEGER };
  // D-234: "any number of target creatures": none at least; as many as there are legal targets at most (the decision narrows `max`, `targetChoiceSpecs`).
  if (spec.anyNumber === true) return { min: 0, max: Number.MAX_SAFE_INTEGER };
  // D-145: "any number of target creatures" with a division: none at least, and as many as the total allows (CR 601.2d).
  if (spec.divide !== undefined) {
    return { min: spec.min ?? 0, max: spec.max ?? Number.MAX_SAFE_INTEGER };
  }
  const min = spec.min ?? 1;
  return { min, max: spec.max ?? min };
}

export function sameTarget(a: ChosenTarget, b: ChosenTarget): boolean {
  if (a.specId !== b.specId || a.kind !== b.kind) return false;
  return a.kind === 'object' ? a.id === (b as typeof a).id : a.seat === (b as typeof a).seat;
}

/** CR 608.2b: which of the chosen targets are still legal as the spell or ability resolves. */
export function stillLegalTargets(
  state: GameState,
  specs: readonly TargetSpec[],
  chosen: readonly ChosenTarget[],
  ctx: SelectContext,
): ChosenTarget[] {
  const legalBySpec = new Map<string, ChosenTarget[]>();
  for (const spec of specs) legalBySpec.set(spec.id, legalTargets(state, spec, ctx));
  return chosen.filter((t) => (legalBySpec.get(t.specId) ?? []).some((l) => sameTarget(l, t)));
}

function targetObjects(refId: string, targets: readonly ChosenTarget[]): ObjectId[] {
  return targets.flatMap((t) => (t.kind === 'object' && t.specId === refId ? [t.id] : []));
}

/** Resolves an object selector to ids. `targets` are the targets that are still legal. */
export function resolveObjects(
  state: GameState,
  selector: ObjectSelector,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): ObjectId[] {
  switch (selector.kind) {
    case 'this':
    case 'thisSpell':
      return ctx.source === null ? [] : [ctx.source];
    case 'target':
      return targetObjects(selector.id, targets);
    case 'moved':
      // CR 400.7j: the new object, found through the effect that moved the old one (CR 400.7).
      return [...(ctx.moved ?? [])];
    case 'triggerSubject':
      return ctx.triggerSubject === undefined ? [] : [ctx.triggerSubject];
    case 'sacrificed':
      // D-177, CR 608.2h: the permanents sacrificed earlier in this resolution, gone now: read through their old ids.
      return [...(ctx.sacrificed ?? [])];
    case 'sacrificedCost':
      // D-133, CR 602.2c: the permanents sacrificed as the cost of the ability that is resolving (gone now: last-known
      // information is read through their old ids).
      return [...(ctx.costSacrificed ?? [])];
    case 'attached': {
      // D-139: "enchanted creature", "equipped creature": what the source is attached to, as it is or as it was (CR 113.7a).
      const source =
        ctx.source === null
          ? undefined
          : (state.objects[ctx.source] ?? state.lki[ctx.source]?.object);
      const host = source?.attachedTo ?? null;
      return host !== null && state.objects[host] !== undefined ? [host] : [];
    }
    case 'linkedExile': {
      // CR 607.2a, 702.75a (D-145): the cards the source exiled with its linked ability that are still in exile, in the order exiled.
      // The link is the permanent's own: a source that left (a new object) has none.
      // CR 607.2a, 603.10a (D-230): "When this leaves the battlefield, return the exiled card": the ability of a permanent that left reads the link the permanent had
      // (last-known information), which is how Fiend Hunter, Skyclave Apparition and the token Hofri makes find their cards.
      const source =
        ctx.source === null
          ? undefined
          : (state.objects[ctx.source] ?? state.lki[ctx.source]?.object);
      return (source?.linkedExile ?? []).filter((id) => state.objects[id]?.zone === 'exile');
    }
    case 'triggerCard': {
      // CR 400.7, 603.10a (D-230): the card the permanent the event is about became in the graveyard, if it is still there.
      // CR 712.21c (D-277): for a melded permanent that died, both cards.
      return ctx.triggerSubject === undefined
        ? []
        : successorsOf(state, ctx.triggerSubject, (o) => o.zone === 'graveyard');
    }
    case 'thisCard': {
      // CR 400.7, 603.10a: the card the source became when it left, if it is still in that zone. A
      // source that has not left has no such card.
      // CR 712.21c (D-277): for a melded permanent that left, both cards.
      return ctx.source === null ? [] : successorsOf(state, ctx.source, () => true);
    }
    case 'each': {
      const zone = selector.filter.zone ?? (selector.filter.stackKind ? 'stack' : 'battlefield');
      // "Target player's graveyard": the owner selector is read now, with the targets (CR 108.3).
      const withOwners =
        selector.filter.owner === undefined
          ? ctx
          : { ...ctx, owners: resolvePlayers(state, selector.filter.owner, ctx, targets) };
      // CR 109.4 (D-179): "each creature that player controls", read now, with the targets.
      const filterCtx =
        selector.filter.controlledBy === undefined
          ? withOwners
          : {
              ...withOwners,
              controllers: resolvePlayers(state, selector.filter.controlledBy, ctx, targets),
            };
      // D-151: "each other creature" besides the one the effect names (`except`), read now, with the targets.
      const left =
        selector.except === undefined ? [] : resolveObjects(state, selector.except, ctx, targets);
      return objectsInZone(state, zone).filter(
        (id) =>
          !left.includes(id) &&
          matchesFilter(state, getObject(state, id), selector.filter, filterCtx),
      );
    }
    default: {
      const unreachable: never = selector;
      return unreachable;
    }
  }
}

export function resolveRef(
  state: GameState,
  ref: ObjectRef,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): ObjectId[] {
  return resolveObjects(state, ref, ctx, targets);
}

/**
 * `seats` once each, in the order CR 101.4 gives for players who act or choose at the same time: the active player
 * first, then the others in turn order (APNAP).
 */
export function apnapOrder(state: GameState, seats: readonly SeatId[]): SeatId[] {
  const n = state.seats.length;
  const unique = [...new Set(seats)];
  return unique.sort(
    (a, b) => ((a - state.turn.activeSeat + n) % n) - ((b - state.turn.activeSeat + n) % n),
  );
}

/** Resolves a player selector to seats still in the game (CR 102.1, 102.2). */
export function resolvePlayers(
  state: GameState,
  selector: PlayerSelector,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): SeatId[] {
  switch (selector.kind) {
    case 'you':
      return [ctx.controller];
    case 'eachPlayer':
      return apnapOrder(state, seatsInOrder(state, ctx.controller));
    case 'eachOpponent':
      return apnapOrder(state, opponentsOf(state, ctx.controller));
    case 'eachOtherOpponent':
      // D-151: the opponents other than the player the event of the trigger is about.
      return apnapOrder(
        state,
        opponentsOf(state, ctx.controller).filter((seat) => seat !== ctx.triggerPlayer),
      );
    case 'all':
      // D-131: "you and target opponent": the players the members name, each once, in APNAP order (CR 101.4).
      return apnapOrder(
        state,
        selector.of.flatMap((member) => resolvePlayers(state, member, ctx, targets)),
      );
    case 'controllerOf':
    case 'ownerOf': {
      return resolveRef(state, selector.of, ctx, targets).flatMap((id) => {
        const o = state.objects[id];
        const lki = state.lki[id]?.object;
        const obj = o ?? lki;
        if (!obj) return [];
        return [selector.kind === 'controllerOf' ? controllerOf(state, obj) : obj.owner];
      });
    }
    case 'defendingPlayer': {
      // CR 508.5: the player the source creature attacks (or attacked), D-110.
      const seat = defendingPlayerOf(state, ctx.source);
      return seat === null ? [] : [seat];
    }
    case 'triggerPlayer':
      // D-133: "that player": the player the event that caused this trigger is about.
      return ctx.triggerPlayer === undefined || getSeat(state, ctx.triggerPlayer).hasLost
        ? []
        : [ctx.triggerPlayer];
    case 'discardedThisWay':
      // D-210: "each player who discarded a card this way": the players of the `discard` effects of this resolution that discarded, in the order of CR 101.4.
      return apnapOrder(
        state,
        (ctx.thisWay?.discardedBy ?? []).filter((seat) => !getSeat(state, seat).hasLost),
      );
    case 'attackedPlayers': {
      // CR 508.6 (D-269): the players the source was declared as an attacker attacking this turn, read under the id the source has (an ability
      // that outlives its source reads the log of the id it had, CR 608.2h), without the players who have left the game.
      const source = ctx.source;
      if (source === null) return [];
      return apnapOrder(
        state,
        [
          ...new Set(
            state.turnLog.attackedPlayers.flatMap((a) => (a.attacker === source ? [a.player] : [])),
          ),
        ].filter((seat) => !getSeat(state, seat).hasLost),
      );
    }
    case 'giftRecipient': {
      // CR 702.174a (D-135): "the chosen player": the opponent the gift was promised to, read from the spell, from the
      // permanent that came from it, or from last-known information once either has left (CR 113.7a).
      const source = ctx.source === null ? null : objectOrLki(state, ctx.source);
      const chosen = source?.stack?.giftTo ?? source?.giftTo;
      return chosen === undefined || getSeat(state, chosen).hasLost ? [] : [chosen];
    }
    case 'target':
      return targets.flatMap((t) =>
        t.kind === 'player' && t.specId === selector.id && !getSeat(state, t.seat).hasLost
          ? [t.seat]
          : [],
      );
    default: {
      const unreachable: never = selector;
      return unreachable;
    }
  }
}

/** A selector that may denote objects or players (damage can hit either). */
export function isPlayerSelector(sel: ObjectSelector | PlayerSelector): sel is PlayerSelector {
  return (
    sel.kind === 'you' ||
    sel.kind === 'eachPlayer' ||
    sel.kind === 'eachOpponent' ||
    sel.kind === 'eachOtherOpponent' ||
    sel.kind === 'all' ||
    sel.kind === 'controllerOf' ||
    sel.kind === 'ownerOf' ||
    sel.kind === 'defendingPlayer' ||
    sel.kind === 'triggerPlayer' ||
    sel.kind === 'discardedThisWay' ||
    sel.kind === 'attackedPlayers' ||
    sel.kind === 'giftRecipient'
  );
}
