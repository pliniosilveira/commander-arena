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
import type { CardType, Subtype } from '../characteristics';
import type { ObjectId, SeatId } from '../ids';
import {
  getObject,
  getSeat,
  objectsInZone,
  opponentsOf,
  playerToRightOf,
  seatsInOrder,
} from '../state/ops';
import type { ChosenTarget, GameObject, GameState, ThisWayCounts } from '../state/types';
import { chosenOf } from './chosen';
import { controllerOf } from './control';
import { countersOfKind } from './counters-of-kind';
import { defendingPlayerOf } from './defending';
import { derive } from './derive';
import { keywordKindsOf } from './derive-keywords';
import { type FilterSubject, matchesFilterWith } from './filter-match';
import { abilitiesHaveKeyword } from './keywords';
import { manaValueOfCost } from './mana-value';
import { commanderCardOf, successorsOf } from './melded';
import { isModified } from './modified';
import { playerCanBeTargetedBy } from './player-protection';
import { hasProtectionFrom } from './protection';
import { objectOrLki } from './source-info';

export interface SelectContext {
  readonly controller: SeatId;
  /** The spell or ability being cast or resolving, or the source of a static check. */
  readonly source: ObjectId | null;
  /** The objects selected by resolving choices earlier in this spell or ability. */
  readonly chosenObjects?: Readonly<Record<string, readonly ObjectId[]>>;
  /**
   * While an ability is being activated: the ability's own object on the stack, which never
   * targets itself. `source` is then the permanent the ability belongs to, so "another" and
   * "this" mean that permanent (a creature may target itself with its own ability).
   */
  readonly stackObject?: ObjectId;
  /** The X of the ability that would be activated is not announced yet (the legality check of an activation, CR 602.2b): `manaValueX` then matches any card with a mana value. */
  readonly xUnannounced?: true;
  /** What the previous move effect of this resolution produced: the `moved` reference (CR 400.7j). */
  readonly moved?: readonly ObjectId[];
  /** What the `triggerSubject` reference means: the object whose event caused this trigger. */
  readonly triggerSubject?: ObjectId;
  /** What `eachObject` means: the object an `addCounters` with `perObject` is working out its count for. */
  readonly eachObject?: ObjectId;
  /** What `sacrificedCost` means (D-133): the permanents sacrificed to pay the cost of the ability that is resolving. */
  readonly costSacrificed?: readonly ObjectId[];
  /** What `tappedAsCostPower` means (CR 702.184a): the power of the creatures tapped to pay the cost of the ability that is resolving. */
  readonly costTappedPower?: number;
  /** What `sacrificed` means (D-177): the permanents the earlier `sacrifice` instructions of this resolution sacrificed. */
  readonly sacrificed?: readonly ObjectId[];
  /** The number a `chooseNumber` effect of this resolution had its controller choose (`powerAtLeastChosenNumber`, see `FilterContext.chosenNumber`). */
  readonly chosenNumber?: number;
  /** What `chosenPlayer` ("that player" after "choose a player ...") means in this resolution (The Black Gate). */
  readonly chosenPlayer?: SeatId;
  /** What `triggerPlayer` ("that player") and `triggerDamage` ("that much") mean in this resolution (D-133). */
  readonly triggerPlayer?: SeatId;
  readonly declinedPlayer?: SeatId;
  readonly triggerDamage?: number;
  /** The opponents dealt damage by the batch of this trigger (`triggerDamagedPlayers`, CR 603.2c). */
  readonly triggerDamaged?: readonly SeatId[];
  readonly triggerTargetCount?: number;
  /** Targets already chosen for this spell or ability, including a candidate being checked. */
  readonly targets?: readonly ChosenTarget[];
  /** The players the attack event of this trigger was declared at (`attackersAttackedYou`, D-149). */
  readonly triggerAttacked?: readonly SeatId[];
  /** The creatures the attack event of this trigger declared (`attackersGreatestPower`). */
  readonly triggerAttackers?: readonly ObjectId[];
  /** The permanents that dealt the combat damage of a `combatDamageBatch` trigger (`triggerSources`), or the cards that triggered a batch of cards. */
  readonly triggerCards?: readonly ObjectId[];
  /** Who each creature of the attack event of this trigger was declared attacking (`attackersAtYouAtLeast`, D-643). */
  readonly triggerAttackedAt?: readonly SeatId[];
  /** The seats an `owner` selector of the filter names (see `FilterContext.owners`). */
  readonly owners?: readonly SeatId[];
  /** The seats a `controlledBy` selector of the filter names (D-179, see `FilterContext.controllers`). */
  readonly controllers?: readonly SeatId[];
  /** The power `powerGreaterThan` of an `each` filter compares with, read as the effect resolves (see `FilterContext.powerLimit`). */
  readonly powerLimit?: number | null;
  /** The name `sameNameAs` of an `each` filter compares with, read as the effect resolves (see `FilterContext.nameLimit`). */
  readonly nameLimit?: string | null;
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
  /** The natural result of the latest die the resolution rolled, for the amount `dieResult` (CR 706.2, Galadriel group 3). Absent where none was rolled: the amount is 0. */
  readonly dieResult?: number;
  /**
   * Whether `targetsObject` assumes a target the spell has not chosen yet could match (D-424): the question "may this spell be cast at all?" asks it before any target is chosen
   * (the cost reduction of a permanent that names the spells that target a kind of permanent).
   */
  readonly spellTargetsMayHold?: boolean;
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
        name: c.name,
        types: c.types,
        supertypes: c.supertypes,
        subtypes: c.subtypes,
        colors: c.colors,
        power: lki.power,
        toughness: lki.toughness,
        basePower: lki.basePower ?? null,
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
        get manaCost() {
          return c.manaCost;
        },
      };
    }
  }
  const d = derive(state, obj);
  return {
    name: d.name,
    types: d.types,
    supertypes: d.supertypes,
    subtypes: d.subtypes,
    colors: d.colors,
    power: d.power,
    toughness: d.toughness,
    basePower: d.basePower,
    // Quandrix Unlimited group E: only a filter that says "with {X} in its mana cost" reads it.
    get manaCost() {
      return d.manaCost;
    },
    get keywords() {
      return keywordKindsOf(d.abilities);
    },
    get commander() {
      return isCommanderObject(state, obj);
    },
    // D-416 (CR 700.9): only a filter that says "modified" reads it.
    get modified() {
      return isModified(state, obj);
    },
    // CR 701.15b: only a filter that says "goaded" reads it.
    get goaded() {
      // The effects of a `goad` (`rules/goad.ts` reads the same ones; select.ts cannot import it, it imports this file) and the static "is goaded" of an Aura (D-639, issue 201).
      return (
        state.continuousEffects.some(
          (e) => e.change.kind === 'goaded' && e.objects.includes(obj.id),
        ) || d.goadedBy.length > 0
      );
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
    // D-424: the question "may this spell be cast at all?" asks before any target is chosen, and assumes the most favourable one (as `spellTargets` does, D-207).
    const unchosen = (obj.stack?.chosenTargets.length ?? 0) === 0;
    const aimed =
      (ctx.spellTargetsMayHold === true && unchosen) ||
      (obj.stack?.chosenTargets ?? []).some((t) => {
        if (t.kind !== 'object') return false;
        const target = objectOrLki(state, t.id);
        return target !== null && matchesFilter(state, target, targetsObject, ctx);
      });
    return aimed && matchesFilter(state, obj, rest, ctx);
  }
  // CR 113.7a (Green Slime): "from an artifact or enchantment source": the ability's source, as it is or as it last was, is an object the inner filter matches.
  if (filter.abilitySource !== undefined) {
    const { abilitySource, ...rest } = filter;
    const source = obj.stack?.kind === 'ability' ? obj.stack.source : null;
    const from = source === null ? null : objectOrLki(state, source);
    return (
      from !== null &&
      matchesFilter(state, from, abilitySource, ctx) &&
      matchesFilter(state, obj, rest, ctx)
    );
  }
  // CR 115.1, 601.2c: "that targets a player": one of the spell's chosen targets is a player.
  if (filter.targetsPlayer !== undefined) {
    const { targetsPlayer: _aimedAtPlayer, ...rest } = filter;
    const unchosen = (obj.stack?.chosenTargets.length ?? 0) === 0;
    const aimed =
      (ctx.spellTargetsMayHold === true && unchosen) ||
      (obj.stack?.chosenTargets ?? []).some(
        (t) => t.kind === 'player' && (filter.targetsPlayer !== 'you' || t.seat === ctx.controller),
      );
    return aimed && matchesFilter(state, obj, rest, ctx);
  }
  // CR 115.9c (D-437): "that targets only this creature": the targets chosen are one object (chosen once or more), and the inner filter matches it.
  if (filter.targetsOnly !== undefined) {
    const { targetsOnly, ...rest } = filter;
    const unchosen = (obj.stack?.chosenTargets.length ?? 0) === 0;
    let aimed = ctx.spellTargetsMayHold === true && unchosen;
    if (!aimed) {
      const targets = obj.stack?.chosenTargets ?? [];
      const first = targets[0];
      const one =
        first !== undefined &&
        first.kind === 'object' &&
        targets.every((t) => t.kind === 'object' && t.id === first.id);
      const target = one ? objectOrLki(state, first.id) : null;
      aimed = target !== null && matchesFilter(state, target, targetsOnly, ctx);
    }
    return aimed && matchesFilter(state, obj, rest, ctx);
  }
  // D-437: a disjunction one of whose members reads what a spell targets ("an Equipment spell or a spell that targets a creature you control"): the outer filter
  // says where to look, each member is matched as a filter of its own with that.
  if (
    filter.anyOf?.some(
      (m) =>
        m.targetsObject !== undefined ||
        m.targetsOnly !== undefined ||
        m.targetsPlayer !== undefined,
    )
  ) {
    const { anyOf, ...outer } = filter;
    const scoped = {
      ...(filter.zone === undefined ? {} : { zone: filter.zone }),
      ...(filter.stackKind === undefined ? {} : { stackKind: filter.stackKind }),
    };
    return (
      matchesFilter(state, obj, outer, ctx) &&
      anyOf.some((member) => matchesFilter(state, obj, { ...member, ...scoped }, ctx))
    );
  }
  // D-100: "of the chosen type" reads what the source chose as it entered, which only the state knows.
  const chosen = chosenOf(state, ctx.source);
  const withChoice = {
    ...ctx,
    ...(chosen === undefined ? {} : { sourceChosen: chosen }),
    // D-422: what the objects attached to this one, or the one it is attached to, are.
    describeOther: (other: GameObject) => describeObject(state, other),
  };
  if (!readsGame(filter))
    return matchesFilterWith(state, obj, () => describeObject(state, obj), filter, withChoice);
  // D-120: "attacking" reads the combat, and "power less than this creature's power" the source's power.
  const reading = {
    ...withChoice,
    attackers: attackingCreatures(state),
    ...(filter.blocking === true || (filter.anyOf?.some((m) => m.blocking === true) ?? false)
      ? { blockers: (state.combat?.blocks ?? []).map((b) => b.blocker) }
      : {}),
    ...(filter.unblocked === true || (filter.anyOf?.some((m) => m.unblocked === true) ?? false)
      ? { unblockedAttackers: unblockedAttackers(state) }
      : {}),
    ...(filter.attackingOrBlocking === true ||
    (filter.anyOf?.some((m) => m.attackingOrBlocking === true) ?? false)
      ? { inCombat: creaturesInCombat(state) }
      : {}),
    ...(filter.manaValueAtMost !== undefined
      ? { manaValueLimit: manaValueLimitOf(state, filter.manaValueAtMost, ctx) }
      : {}),
    // CR 400.7, 603.10a: the card the permanent the trigger is about became, which "another target ... card" leaves out.
    ...(filter.notTriggerCard === true && ctx.triggerSubject !== undefined
      ? { excludedCards: successorsOf(state, ctx.triggerSubject, () => true) }
      : {}),
    // CR 508.1 (Shared Animosity): "each other attacking creature": the creature the trigger is about is left out (on the battlefield or as it last was).
    ...(filter.otherThanTriggerSubject === true && ctx.triggerSubject !== undefined
      ? {
          excludedCards: [
            ...(filter.notTriggerCard === true
              ? successorsOf(state, ctx.triggerSubject, () => true)
              : []),
            ctx.triggerSubject,
          ],
        }
      : {}),
    // CR 202.3: "with lesser mana value": at most one less than the amount.
    ...(filter.manaValueBelow !== undefined
      ? { manaValueLimit: manaValueLimitOf(state, filter.manaValueBelow, ctx) - 1 }
      : {}),
    attackersOfYou: attackersOfPlayer(state, ctx.controller),
    ...(filter.attackingYou === 'orPlaneswalkers' ||
    (filter.anyOf?.some((m) => m.attackingYou === 'orPlaneswalkers') ?? false)
      ? { attackersOfYouOrPlaneswalkers: attackersOfPlayerOrPlaneswalkers(state, ctx.controller) }
      : {}),
    ...(filter.attackingOpponents === true ||
    (filter.anyOf?.some((m) => m.attackingOpponents === true) ?? false)
      ? { attackersOfOpponents: attackersOfOpponents(state, ctx.controller) }
      : {}),
    ...(filter.attackingOpponents === 'players' ||
    (filter.anyOf?.some((m) => m.attackingOpponents === 'players') ?? false)
      ? { attackersOfOpponentPlayers: attackersOfOpponentPlayers(state, ctx.controller) }
      : {}),
    ...((filter.powerLessThanSource === true || filter.powerGreaterThanSource === true) &&
    ctx.source !== null
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
    ...(filter.controllerDealtCombatDamageByAtLeast !== undefined
      ? { combatDamaged: state.turnLog.combatDamaged }
      : {}),
    ...(filter.putFromBattlefieldThisTurn === true
      ? { graveyarded: state.turnLog.graveyarded }
      : {}),
    ...(filter.discardedOrFromLibraryThisTurn === true
      ? { discardedOrFromLibrary: state.turnLog.discardedOrFromLibrary ?? [] }
      : {}),
    ...(filter.enteredThisTurn === true
      ? { entered: state.turnLog.entered.map((e) => e.object) }
      : {}),
    // CR 607.2a, 400.7 (Lorehold group 2): the cards the source exiled with its linked ability; a source that left the battlefield is a new object with none.
    ...(filter.exiledWithSource === true
      ? { linkedExile: ctx.source === null ? [] : (state.objects[ctx.source]?.linkedExile ?? []) }
      : {}),
    // CR 603.12, 400.7j (Espers to Magicite): the cards the resolution that created the reflexive ability exiled.
    ...(filter.exiledThisWay === true ? { exiledThisWay: ctx.moved ?? [] } : {}),
    // D-261: the creature the trigger is about, as it last was (a dies trigger reads the permanent that left, CR 603.10a, 113.7a).
    // CR 205.2a, 701.21a (Braids): "shares a card type with it" after a sacrifice reads the permanent sacrificed first in this resolution, as it last was.
    // CR 205.3m, 113.7a (Titan of Littjara): "shares a creature type with it" of an ability about its own source reads the source, as it is or as it last was.
    ...(readsSharedType(filter)
      ? subjectSubtypesOf(
          state,
          readsSacrificedType(filter)
            ? ctx.sacrificed?.[0]
            : readsSourceType(filter)
              ? (ctx.source ?? undefined)
              : ctx.triggerSubject,
        )
      : {}),
  };
  return matchesFilterWith(state, obj, () => describeObject(state, obj), filter, reading);
}

/** Whether the filter, or one of its `anyOf` members, reads the combat or the source's power (D-120). */
function readsGame(f: ObjectFilter): boolean {
  return (
    f.attacking === true ||
    f.notAttacking === true ||
    f.blocking === true ||
    f.unblocked === true ||
    f.attackingYou !== undefined ||
    f.attackingOpponents !== undefined ||
    f.attackingOrBlocking === true ||
    f.manaValueAtMost !== undefined ||
    f.manaValueBelow !== undefined ||
    f.powerLessThanSource === true ||
    f.powerGreaterThanSource === true ||
    f.manaValueX === true ||
    f.controllerDealtDamageBySource === true ||
    f.controllerDealtCombatDamageByAtLeast !== undefined ||
    f.putFromBattlefieldThisTurn === true ||
    f.discardedOrFromLibraryThisTurn === true ||
    f.enteredThisTurn === true ||
    f.exiledWithSource === true ||
    f.exiledThisWay === true ||
    f.sharesCreatureTypeWith !== undefined ||
    f.sharesCardTypeWith !== undefined ||
    f.notTriggerCard === true ||
    f.otherThanTriggerSubject === true ||
    f.controller === 'defendingPlayer' ||
    (f.anyOf?.some(readsGame) ?? false)
  );
}

/** Whether the filter, or one of its `anyOf` members, asks for a creature type shared with the trigger's creature (D-261). */
function readsSharedType(f: ObjectFilter): boolean {
  return (
    f.sharesCreatureTypeWith !== undefined ||
    f.sharesCardTypeWith !== undefined ||
    (f.anyOf?.some(readsSharedType) ?? false)
  );
}

/** Whether the filter, or one of its `anyOf` members, asks for a type shared with the permanent an earlier sacrifice sacrificed (Braids, Descendants' Fury). */
function readsSacrificedType(f: ObjectFilter): boolean {
  return (
    f.sharesCardTypeWith === 'sacrificed' ||
    f.sharesCreatureTypeWith === 'sacrificed' ||
    (f.anyOf?.some(readsSacrificedType) ?? false)
  );
}

/** Whether the filter, or one of its `anyOf` members, asks for a creature type shared with the source of the ability (Titan of Littjara). */
function readsSourceType(f: ObjectFilter): boolean {
  return f.sharesCreatureTypeWith === 'source' || (f.anyOf?.some(readsSourceType) ?? false);
}

/** The subtypes of the object a trigger is about, as it is or as it last was; none known when there is no such object. */
function subjectSubtypesOf(
  state: GameState,
  subject: ObjectId | undefined,
): { subjectSubtypes?: readonly Subtype[]; subjectTypes?: readonly CardType[] } {
  const obj = subject === undefined ? null : objectOrLki(state, subject);
  if (obj === null) return {};
  const described = describeObject(state, obj);
  return { subjectSubtypes: described.subtypes, subjectTypes: described.types };
}

/** The X of the resolving spell or ability: `ctx.x`, else the source's own stack data (CR 107.3a); none if neither has one. */
function xFilterContext(state: GameState, ctx: SelectContext): { x?: number; xUnannounced?: true } {
  const source = ctx.source === null ? undefined : state.objects[ctx.source];
  // CR 602.2b: while an ability is activated its own object on the stack holds the X announced for it (`stackObject`); `source` is the permanent.
  const own = ctx.stackObject === undefined ? undefined : state.objects[ctx.stackObject];
  const x = ctx.x ?? own?.stack?.x ?? source?.stack?.x;
  if (x !== null && x !== undefined) return { x };
  // CR 107.3a, 602.2b: whether an ability could be activated is asked before its X is announced: any value of X may still be chosen.
  if (ctx.xUnannounced === true) return { xUnannounced: true };
  // CR 601.2b: a spell still in a zone it can be cast from (its card is checked before it is cast) has announced no X yet.
  return source !== undefined && source.zone !== 'stack' && source.zone !== 'battlefield'
    ? { xUnannounced: true }
    : {};
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
  // CR 119.3, 202.3: "mana value X or less, where X is the amount of life you gained this turn" (Moseo), read from the turn log of the ability's controller.
  if (amount.kind === 'lifeGainedThisTurn')
    return state.turnLog.lifeGainedTotal[ctx.controller] ?? 0;
  // CR 119.3, 202.3 (Betor): "mana value less than or equal to the amount of life you lost this turn", the ability's controller's own.
  if (amount.kind === 'controllerLifeLostThisTurn')
    return getSeat(state, ctx.controller).lifeLostThisTurn;
  // CR 107.3m: the X of the spell the permanent that has the ability came from, which the permanent remembers (`castX`), or its last-known information.
  if (amount.kind === 'enteredX') {
    const source =
      ctx.source === null
        ? undefined
        : (state.objects[ctx.source] ?? state.lki[ctx.source]?.object);
    return source?.castX ?? 0;
  }
  // CR 107.3a, 202.3: "a spell with mana value X or less", the X announced for the spell that is resolving.
  if (amount.kind === 'x') return xFilterContext(state, ctx).x ?? 0;
  if (amount.kind === 'countOf') {
    const owner = amount.filter.owner;
    const countedContext =
      owner === undefined
        ? ctx
        : { ...ctx, owners: resolvePlayers(state, owner, ctx, ctx.targets ?? []) };
    return countMatching(state, amount.filter, countedContext);
  }
  // CR 122.1, 603.10a: "with mana value less than or equal to the number of counters on that creature": the counters the permanent the trigger is about had, as it last was.
  if (amount.kind === 'countersOn' && amount.of.kind === 'triggerSubject') {
    const subject =
      ctx.triggerSubject === undefined ? null : objectOrLki(state, ctx.triggerSubject);
    return countersOfKind(subject?.counters, amount.counter);
  }
  if (amount.kind === 'powerOf' && ctx.source !== null) {
    return Math.max(0, powerOfObject(state, ctx.source) ?? 0);
  }
  // CR 603.3d, 202.3: the mana value of the spell that caused the trigger, as it is on the stack (or as it last was).
  if (amount.kind === 'manaValueOf' && ctx.triggerSubject !== undefined) {
    const live = state.objects[ctx.triggerSubject];
    const cost = live
      ? derive(state, live).manaCost
      : (state.lki[ctx.triggerSubject]?.characteristics.manaCost ?? null);
    return manaValueOfCost(cost, live ?? state.lki[ctx.triggerSubject]?.object);
  }
  return 0;
}

/**
 * The attackers no creature blocked (CR 509.1h, unverified number): still on the battlefield and in combat, `blocked` false, and only once the blockers were declared. Priority is
 * given in the declare blockers step only after every defending player declared, so the step and the later combat steps are the ones in which an attacker is unblocked.
 */
function unblockedAttackers(state: GameState): readonly ObjectId[] {
  const step = state.turn.step;
  if (step !== 'declareBlockers' && step !== 'firstStrikeDamage' && step !== 'combatDamage') {
    return [];
  }
  return (state.combat?.attackers ?? []).filter((a) => !a.blocked).map((a) => a.object);
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
 * The creatures attacking `seat` as a player or a planeswalker `seat` controls (CR 508.1b, 506.3): the attack target is that player, or a planeswalker permanent controlled
 * by them (a battle is not one). The planeswalker is read through layers (CR 613) and its controller through `controllerOf`.
 */
function attackersOfPlayerOrPlaneswalkers(state: GameState, seat: SeatId): readonly ObjectId[] {
  return (state.combat?.attackers ?? [])
    .filter((a) => {
      if (a.targetGone === true) return false;
      if (a.target.kind === 'player') return a.target.seat === seat;
      const attacked = state.objects[a.target.object];
      return (
        attacked !== undefined &&
        derive(state, attacked).types.includes('planeswalker') &&
        controllerOf(state, attacked) === seat
      );
    })
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

/** The creatures attacking an opponent of `seat` as a player (CR 508.1b, D-650): a creature at a planeswalker or battle is not. */
function attackersOfOpponentPlayers(state: GameState, seat: SeatId): readonly ObjectId[] {
  const opponents = opponentsOf(state, seat);
  return (state.combat?.attackers ?? [])
    .filter((a) => a.target.kind === 'player' && opponents.includes(a.target.seat))
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
  const targets = legalTargetsOf(state, spec, ctx);
  if (spec.totalPowerAtMost === undefined) return targets;
  // CR 208.1 (Reunion of the House): the power each object has now, for the total of the targets chosen.
  return targets.map((t) =>
    t.kind === 'object' ? { ...t, power: powerOfObject(state, t.id) ?? 0 } : t,
  );
}

function legalTargetsOf(state: GameState, spec: TargetSpec, ctx: SelectContext): ChosenTarget[] {
  const out: ChosenTarget[] = [];
  const specId = spec.id;
  const playersFor = (filter: 'any' | 'opponent' | 'opponentWhoseTurn'): ChosenTarget[] =>
    seatsInOrder(state, ctx.controller)
      .filter((s) => filter === 'any' || s !== ctx.controller)
      // CR 115.1, 500.1 (Cmdr. Troi): "target opponent whose turn it is": the opponent who is the active player, so no one on the controller's own turn.
      .filter((s) => filter !== 'opponentWhoseTurn' || s === state.turn.activeSeat)
      // CR 702.11b (D-149): "You have hexproof": the opponents of that player can't target them.
      // CR 702.16b (D-376): "You have protection from the chosen card type": a source of that type can't target them.
      .filter((s) => playerCanBeTargetedBy(state, s, ctx.controller, ctx.source))
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
  if (spec.what.kind === 'objectOrSpell') {
    // CR 115.1 (issue 81): "target spell or creature": the permanents the filter matches, then the spells on the stack the spell filter matches. A spell never targets itself
    // while it is being put on the stack.
    const { filter: permanents, spell: spells } = spec.what;
    for (const [filter, zone] of [
      [permanents, 'battlefield'],
      [spells, 'stack'],
    ] as const) {
      for (const id of objectsInZone(state, zone)) {
        const obj = getObject(state, id);
        if (obj.zone === 'stack' && (id === ctx.source || id === ctx.stackObject)) continue;
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
    const matchingContext =
      filter.manaValueAtMost === undefined && filter.manaValueBelow === undefined
        ? ctx
        : {
            ...ctx,
            targets: [...(ctx.targets ?? []), { kind: 'object' as const, id, specId }],
          };
    if (
      matchesFilter(state, obj, filter, matchingContext) &&
      canBeTargetedBy(state, obj, ctx.controller, ctx.source)
    ) {
      // D-149: a slot with one target for each opponent says whose each target is.
      // Hylda group 3: "with different controllers" says whose each target is as well.
      // CR 115.1, 608.2b: cards "from their graveyard": the graveyard of the player an earlier slot names. Once the targets are chosen (as the spell or ability
      // resolves, `stillLegalTargets`) only that player's cards stay legal; while they are being chosen the owner is the group `targetAnswerError` reads.
      if (spec.ownedByTarget !== undefined) {
        const named = (ctx.targets ?? []).find(
          (t) => t.kind === 'player' && t.specId === spec.ownedByTarget,
        );
        if (named?.kind === 'player' && named.seat !== obj.owner) continue;
        out.push({ kind: 'object', id, specId, group: obj.owner });
        continue;
      }
      out.push(
        spec.onePerOpponent === true || spec.differentControllers === true
          ? {
              kind: 'object',
              id,
              specId,
              // A card in a graveyard is its owner's (CR 404.1, 108.3): one target for each owner.
              group: obj.zone === 'graveyard' ? obj.owner : controllerOf(state, obj),
            }
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
  // D-386: "X target creature cards": as many as the announced X, which is 0 until it is (a spell is castable with X = 0, so the slot is no obstacle to
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
  for (const spec of specs) {
    legalBySpec.set(spec.id, legalTargets(state, spec, { ...ctx, targets: chosen }));
  }
  const legal = chosen.filter((t) =>
    (legalBySpec.get(t.specId) ?? []).some((l) => sameTarget(l, t)),
  );
  // CR 608.2b, 208.1 (Reunion of the House): the total power of the targets of a slot is read again now; if it is more than the limit the whole selection is illegal.
  return legal.filter((t) => {
    const limit = specs.find((s) => s.id === t.specId)?.totalPowerAtMost;
    if (limit === undefined) return true;
    const total = legal
      .filter((o) => o.specId === t.specId)
      .reduce((sum, o) => sum + (o.kind === 'object' ? (powerOfObject(state, o.id) ?? 0) : 0), 0);
    return total <= limit;
  });
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
    case 'chosen':
      return [...(ctx.chosenObjects?.[selector.id] ?? [])];
    case 'boundObjects':
      // D-639 (CR 603.7c, 400.7): the objects a delayed ability was created about that are still those objects on the battlefield.
      // D-662 (CR 400.7): a card the ability was made about in exile (`zone` 'exile'), found only while it is still that object there.
      return selector.ids.filter(
        (id) =>
          state.objects[id]?.zone === (selector.zone === undefined ? 'battlefield' : selector.zone),
      );
    case 'moved':
      // CR 400.7j: the new object, found through the effect that moved the old one (CR 400.7).
      return [...(ctx.moved ?? [])];
    case 'triggerSubject':
      return ctx.triggerSubject === undefined ? [] : [ctx.triggerSubject];
    case 'sacrificed':
      // D-177, CR 608.2h: the permanents sacrificed earlier in this resolution, gone now: read through their old ids.
      return [...(ctx.sacrificed ?? [])];
    case 'eachObject':
      return ctx.eachObject === undefined ? [] : [ctx.eachObject];
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
    case 'putWithThis': {
      // CR 400.7, 603.10a (Animate Dead): the permanents on the battlefield that were put there with the object the ability belongs to, which may have left already (its id is what they remember).
      const from = ctx.source;
      if (from === null) return [];
      return state.battlefield.filter((id) => state.objects[id]?.putWith === from);
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
      // D-460: "each creature card exiled with this artifact": the cards a filter of cards describes, among those.
      const filter = selector.filter;
      return (source?.linkedExile ?? []).filter((id) => {
        const card = state.objects[id];
        return (
          card?.zone === 'exile' &&
          (filter === undefined || matchesFilter(state, card, { ...filter, zone: 'exile' }, ctx))
        );
      });
    }
    case 'convokers': {
      // CR 702.51a, 400.7: the creatures tapped to cast the resolving spell, only while each is still the creature that was tapped.
      const spell = ctx.source === null ? undefined : state.objects[ctx.source];
      return (spell?.stack?.convokedBy ?? []).filter(
        (id) => state.objects[id]?.zone === 'battlefield',
      );
    }
    case 'triggerSources':
      // CR 400.7, 603.2c: the creatures that dealt the damage, only while each is still the permanent that did.
      return (ctx.triggerCards ?? []).filter((id) => state.objects[id]?.zone === 'battlefield');
    case 'triggerAttackers':
      // CR 508.1, 400.7: the creatures the attack event declared, only while each is still the permanent that was declared.
      return (ctx.triggerAttackers ?? []).filter((id) => state.objects[id]?.zone === 'battlefield');
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
      // CR 208.1, 608.2c: "with power greater than target creature's power", read now, with the targets and every effect on the creature.
      const powerRef = selector.filter.powerGreaterThan;
      const limited =
        powerRef === undefined
          ? filterCtx
          : {
              ...filterCtx,
              powerLimit:
                resolveObjects(state, powerRef, ctx, targets)
                  .map((id) => powerOfObject(state, id))
                  .find((p) => p !== null) ?? null,
            };
      // CR 201.2, 608.2c: "with the same name as that card", read now, with the targets: the name of the first object the reference names.
      const nameRef = selector.filter.sameNameAs;
      const named =
        nameRef === undefined
          ? limited
          : {
              ...limited,
              nameLimit:
                resolveObjects(state, nameRef, ctx, targets)
                  .map((id) => derive(state, getObject(state, id)).name)
                  .find((n) => n !== undefined) ?? null,
            };
      // D-151: "each other creature" besides the one the effect names (`except`), read now, with the targets.
      const left =
        selector.except === undefined ? [] : resolveObjects(state, selector.except, ctx, targets);
      const matched = objectsInZone(state, zone).filter(
        (id) =>
          !left.includes(id) && matchesFilter(state, getObject(state, id), selector.filter, named),
      );
      if (selector.plus === undefined) return matched;
      // CR 608.2c (Legions to Ashes): "the target and all tokens ... with the same name": the referenced object joins the set, once.
      const inZone = new Set(objectsInZone(state, zone));
      const extra = resolveObjects(state, selector.plus, ctx, targets).filter(
        (id) => inZone.has(id) && !matched.includes(id) && !left.includes(id),
      );
      return [...matched, ...extra];
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
    case 'eachPlayerExcept': {
      // CR 102.1 (Oft-Nabbed Goat): "each other player": every player still in the game but the ones `except` names.
      const left = resolvePlayers(state, selector.except, ctx, targets);
      return apnapOrder(
        state,
        seatsInOrder(state, ctx.controller).filter((seat) => !left.includes(seat)),
      );
    }
    case 'eachPlayerControlling': {
      // CR 102.1, 109.4, 101.4 (Shatter the Sky): the players who control a battlefield permanent matching the filter, each read as "you" in turn.
      const filter = {
        ...selector.filter,
        zone: 'battlefield' as const,
        controller: 'you' as const,
      };
      const battlefield = objectsInZone(state, 'battlefield');
      return apnapOrder(
        state,
        seatsInOrder(state, ctx.controller).filter((seat) =>
          battlefield.some((id) =>
            matchesFilter(state, getObject(state, id), filter, { ...ctx, controller: seat }),
          ),
        ),
      );
    }
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
    case 'chosenPlayer':
      // The Black Gate: the player the `choosePlayer` before it chose; nobody when it has left the game.
      return ctx.chosenPlayer === undefined || getSeat(state, ctx.chosenPlayer).hasLost
        ? []
        : [ctx.chosenPlayer];
    case 'playerToYourRight': {
      const seat = playerToRightOf(state, ctx.controller);
      return seat === null ? [] : [seat];
    }
    case 'triggerPlayer':
      // D-133: "that player": the player the event that caused this trigger is about.
      return ctx.triggerPlayer === undefined || getSeat(state, ctx.triggerPlayer).hasLost
        ? []
        : [ctx.triggerPlayer];
    case 'triggerAttackedPlayer': {
      // CR 508.6 (D-648): "that opponent": the player the declaration attacked that made the trigger, if still in the game.
      const attacked = ctx.triggerAttacked?.[0];
      return attacked === undefined || getSeat(state, attacked).hasLost ? [] : [attacked];
    }
    case 'opponentsAttackingTriggerPlayer': {
      // CR 508.6 (issue 159): the player who declared the attackers of the trigger's declaration (`triggerPlayer` of an `attackBatch` trigger), when they are an opponent of the
      // controller of the ability and still in the game: an opponent "attacking that player". The controller attacking the enchanted player is not an opponent.
      const attacker = ctx.triggerPlayer;
      return attacker !== undefined &&
        !getSeat(state, attacker).hasLost &&
        opponentsOf(state, ctx.controller).includes(attacker)
        ? [attacker]
        : [];
    }
    case 'triggerDamagedPlayers':
      // CR 603.2c, 120.2: "each of those opponents": the opponents the batch of sources damaged, those still in the game, in the order of CR 101.4.
      return apnapOrder(
        state,
        (ctx.triggerDamaged ?? []).filter((seat) => !getSeat(state, seat).hasLost),
      );
    case 'declinedPlayer':
      return ctx.declinedPlayer === undefined || getSeat(state, ctx.declinedPlayer).hasLost
        ? []
        : [ctx.declinedPlayer];
    case 'discardedThisWay': {
      // D-210: "each player who discarded a card this way": the players of the `discard` effects of this resolution that discarded, in the order of CR 101.4.
      // CR 701.9a (Snort): with `hand`, the players whose discard of their hand ran, an empty hand included; `of` narrows them to every player or every opponent.
      const named =
        selector.of === undefined ? undefined : resolvePlayers(state, selector.of, ctx, targets);
      return apnapOrder(
        state,
        (selector.hand === true
          ? (ctx.thisWay?.discardedHandBy ?? [])
          : (ctx.thisWay?.discardedBy ?? [])
        ).filter(
          (seat) => !getSeat(state, seat).hasLost && (named === undefined || named.includes(seat)),
        ),
      );
    }
    case 'couldntSacrificeThisWay':
      // CR 701.21a, 101.4 (Plaguecrafter): "each player who can't": the players the `sacrifice` effects of this resolution found nothing to sacrifice for, in the order of CR 101.4.
      return apnapOrder(
        state,
        (ctx.thisWay?.couldntSacrifice ?? []).filter((seat) => !getSeat(state, seat).hasLost),
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
    case 'combatDamagedByNamed':
      // CR 120.2a, 510.2: the opponents who have been dealt combat damage this game by a creature with the name, still in the game, in the order of CR 101.4.
      return apnapOrder(
        state,
        opponentsOf(state, ctx.controller).filter(
          (seat) =>
            !getSeat(state, seat).hasLost &&
            (state.combatDamagedByNames?.[seat] ?? []).includes(selector.name),
        ),
      );
    case 'lostLifeThisTurn':
      // CR 119.3, 101.4: the players of the group who have lost life this turn, still in the game, in the order of CR 101.4.
      return apnapOrder(
        state,
        resolvePlayers(state, selector.of, ctx, targets).filter(
          (seat) => !getSeat(state, seat).hasLost && getSeat(state, seat).lifeLostThisTurn > 0,
        ),
      );
    case 'combatDamagedThisTurn': {
      // CR 120.2a, 510.2: the players of the group dealt combat damage this turn by the permanent of the ability or by a source of the kind, as it was when it dealt it.
      const by = selector.by;
      const damaged = new Set(
        state.turnLog.combatDamaged
          .filter(
            (d) =>
              (selector.byThis === true && ctx.source !== null && d.source === ctx.source) ||
              (by !== undefined &&
                (by.types === undefined || by.types.every((t) => d.types.includes(t))) &&
                (by.subtypes === undefined || by.subtypes.every((t) => d.subtypes.includes(t))) &&
                (by.controller === undefined ||
                  by.controller === 'any' ||
                  (by.controller === 'you'
                    ? d.controller === ctx.controller
                    : d.controller !== ctx.controller))),
          )
          .map((d) => d.player),
      );
      return apnapOrder(
        state,
        resolvePlayers(state, selector.of, ctx, targets).filter(
          (seat) => !getSeat(state, seat).hasLost && damaged.has(seat),
        ),
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
    sel.kind === 'eachPlayerExcept' ||
    sel.kind === 'eachPlayerControlling' ||
    sel.kind === 'all' ||
    sel.kind === 'controllerOf' ||
    sel.kind === 'ownerOf' ||
    sel.kind === 'defendingPlayer' ||
    sel.kind === 'playerToYourRight' ||
    sel.kind === 'chosenPlayer' ||
    sel.kind === 'triggerPlayer' ||
    sel.kind === 'discardedThisWay' ||
    sel.kind === 'couldntSacrificeThisWay' ||
    sel.kind === 'attackedPlayers' ||
    sel.kind === 'combatDamagedByNamed' ||
    sel.kind === 'lostLifeThisTurn' ||
    sel.kind === 'combatDamagedThisTurn' ||
    sel.kind === 'giftRecipient'
  );
}
