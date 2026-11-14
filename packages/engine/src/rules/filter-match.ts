/**
 * Whether an object matches an `ObjectFilter` (CR 115.1, 205), given its characteristics. This is
 * the one filter test: `select.ts` uses it with the object's derived characteristics, and `derive`
 * uses it with the characteristics before static abilities apply, to find the permanents a
 * "creatures you control get +1/+1" ability affects (layers 4 to 6 come first, CR 613.1, so the types,
 * colors and subtypes it reads are the final ones). It must not
 * import `derive`: `derive` depends on it.
 */
import type { AttachedTo, Keyword, NumberComparison, ObjectFilter } from '../ast/types';
import type { CardType, Color, Subtype, Supertype } from '../characteristics';
import { CREATURE_TYPES } from '../data/creature-types';
import type { ObjectId, SeatId } from '../ids';
import type { ChosenValues, GameObject, GameState } from '../state/types';
import { sameCreatureType } from './chosen';
import { controllerOf } from './control';

/** The characteristics a filter looks at. `Derived` has all of them. */
export interface FilterSubject {
  readonly types: readonly CardType[];
  readonly supertypes: readonly Supertype[];
  readonly subtypes: readonly Subtype[];
  readonly colors: readonly Color[];
  /**
   * What the power, toughness and mana value comparisons (D-111) read; left out where the caller does not
   * know them, which fails those comparisons closed. A null power or toughness is an object that has none.
   */
  readonly power?: number | null;
  readonly toughness?: number | null;
  /** The base power (CR 208.4b), read by `powerAboveBase` (D-431); left out where the caller does not know it, which fails that test closed. */
  readonly basePower?: number | null;
  readonly manaValue?: number;
  /**
   * The keywords without parameters the object has (`keywords`, `notKeywords`, D-133); left out where the caller does
   * not know them, which fails a `keywords` test closed and passes a `notKeywords` one (`validateCard` refuses both
   * in the places that read filters without abilities: static abilities).
   */
  readonly keywords?: readonly Keyword['kind'][];
  /** Whether the object is a commander card (`commander`, D-145); left out where the caller does not know, which fails the test closed. */
  readonly commander?: boolean;
  /** Whether the permanent is modified (`modified`, D-416, CR 700.9); left out where the caller does not know, which fails the test closed. */
  readonly modified?: boolean;
}

/** D-111: whether `value` satisfies the comparison; an object with no such value satisfies none. */
function compares(cmp: NumberComparison | undefined, value: number | null | undefined): boolean {
  if (cmp === undefined) return true;
  if (value === null || value === undefined) return false;
  if (cmp.cmp === 'atLeast') return value >= cmp.value;
  if (cmp.cmp === 'atMost') return value <= cmp.value;
  return value === cmp.value;
}

/** Who "you" is and what "other" excludes (`SelectContext` has these two and more). */
export interface FilterContext {
  readonly controller: SeatId;
  readonly source: ObjectId | null;
  /**
   * The seats a filter's `owner` selector names, resolved by the caller (only an effect's `each`
   * selector can, it knows the targets). A filter with `owner` matches nothing without it, so a
   * filter read anywhere else fails closed (`validateCard` refuses `owner` there).
   */
  readonly owners?: readonly SeatId[];
  /** The seats a filter's `controlledBy` selector names, resolved by the caller as `owners` is (D-179). */
  readonly controllers?: readonly SeatId[];
  /** The player the event of the trigger is about, for `controller: 'triggerPlayer'` (D-151). */
  readonly triggerPlayer?: SeatId;
  /** The player the source creature is attacking, for `controller: 'defendingPlayer'` (D-151): read from the combat by the caller. */
  readonly defendingPlayer?: SeatId;
  /**
   * What the source chose as it entered (D-100), for `chosenType` and `chosenColor`: the caller reads it
   * from the source object. A filter that asks for a choice the source did not make matches nothing.
   */
  readonly sourceChosen?: ChosenValues;
  /**
   * The creatures that are attacking, for `attacking` (D-120): the caller reads them from the combat in
   * progress. A filter that asks for an attacking creature matches nothing without it, so `derive`, which
   * reads filters without the combat, fails closed (`validateCard` refuses `attacking` in a static ability).
   */
  readonly attackers?: readonly ObjectId[];
  /** The zone a spell that is being cast comes from, for `notCastFromHand` while the card has not moved to the stack yet (D-235): the cost code passes it. */
  readonly castFrom?: 'hand' | 'command' | 'graveyard' | 'exile' | 'library';
  /**
   * The creatures attacking the controller of the ability as a player, for `attackingYou` (D-131): read from the
   * combat in progress by the caller, like `attackers`; without it the flag matches nothing.
   */
  readonly attackersOfYou?: readonly ObjectId[];
  /** The number `manaValueAtMost` stands for (D-230), worked out by the caller that has the state. */
  readonly manaValueLimit?: number;
  /** The creatures that are attacking or blocking, for `attackingOrBlocking` (D-229): read from the combat in progress by the caller. */
  readonly inCombat?: readonly ObjectId[];
  /**
   * The creatures attacking an opponent of the controller of the ability, or a planeswalker or battle of an opponent, for `attackingOpponents` (D-218): read
   * from the combat in progress by the caller, like `attackers`; without it the flag matches nothing.
   */
  readonly attackersOfOpponents?: readonly ObjectId[];
  /**
   * The power of this ability's source (`powerLessThanSource`, CR 702.134a, D-120), null when the source
   * has none or is not known; absent fails the comparison closed.
   */
  readonly sourcePower?: number | null;
  /** The X of the spell or ability being resolved (CR 107.3a), for `manaValueX` (D-139); absent fails the filter closed. */
  readonly x?: number;
  /**
   * The players this ability's source dealt combat damage to this turn, for `controllerDealtDamageBySource` (D-139): read from the turn
   * log by the caller; without it the flag matches nothing.
   */
  readonly damagedPlayers?: readonly SeatId[];
  /** The cards put into a graveyard from the battlefield this turn (`putFromBattlefieldThisTurn`, D-179): the turn log, read by the caller; absent fails the flag closed. */
  readonly graveyarded?: readonly ObjectId[];
  /** The permanents that entered the battlefield this turn (`enteredThisTurn`, group 4 of the Vraska deck): the turn log, read by the caller; absent fails the flag closed. */
  readonly entered?: readonly ObjectId[];
  /**
   * The subtypes of the object the trigger is about, as it last was (`sharesCreatureTypeWith`, D-261, CR 603.10a, 113.7a): read by the caller; absent fails the flag closed.
   */
  readonly subjectSubtypes?: readonly Subtype[];
  /**
   * What another object is, for the filters that read objects attached to this one or the one this is attached to (`attachedTo`, `enchanted`, D-422): the caller says how
   * (`derive` for a rule that reads the game, the view after layers 1, 4 and 5 for `derive` itself). Absent fails those filters closed.
   */
  readonly describeOther?: (obj: GameObject) => FilterSubject;
}

/** Whether `obj` is attached to what `attached` names (CR 303.4, 301.5, 701.3, D-422). */
function attachedToHolds(
  state: GameState,
  obj: GameObject,
  attached: AttachedTo,
  ctx: FilterContext,
): boolean {
  const target = obj.attachedTo;
  if (target === null) return false;
  if (attached.kind === 'source') return ctx.source !== null && target === ctx.source;
  if (attached.kind === 'host') {
    const source = ctx.source === null ? undefined : state.objects[ctx.source];
    return source !== undefined && source.attachedTo !== null && target === source.attachedTo;
  }
  const host = state.objects[target];
  if (host === undefined || ctx.describeOther === undefined) return false;
  const describeOther = ctx.describeOther;
  return matchesFilterWith(
    state,
    host,
    () => describeOther(host),
    { ...attached.filter, zone: 'battlefield' },
    ctx,
  );
}

/** CR 303.4: "enchanted": at least one Aura is attached to the permanent (an Equipment or a Fortification is not an Aura). Fails closed without `describeOther`. */
function hasAuraAttached(state: GameState, obj: GameObject, ctx: FilterContext): boolean | null {
  const describeOther = ctx.describeOther;
  if (describeOther === undefined) return null;
  return state.battlefield.some((id) => {
    const other = state.objects[id];
    return (
      other !== undefined &&
      other.attachedTo === obj.id &&
      describeOther(other).subtypes.includes('Aura')
    );
  });
}

/**
 * `describe` is called at most once, after the cheap checks (zone, controller, tapped) pass, so a
 * caller that must derive characteristics does not do so for objects the filter rejects anyway.
 */
export function matchesFilterWith(
  state: GameState,
  obj: GameObject,
  describe: () => FilterSubject,
  filter: ObjectFilter,
  ctx: FilterContext,
): boolean {
  const zone = filter.zone ?? (filter.stackKind ? 'stack' : 'battlefield');
  if (obj.zone !== zone) return false;
  if (filter.other && ctx.source !== null && obj.id === ctx.source) return false;
  // D-1320: "a spell that targets this creature": the object is the permanent that has the ability.
  if (filter.isSource === true && (ctx.source === null || obj.id !== ctx.source)) return false;
  if (filter.controller === 'you' && controllerOf(state, obj) !== ctx.controller) return false;
  if (filter.controller === 'opponent' && controllerOf(state, obj) === ctx.controller) return false;
  // D-151: "that opponent": the player the event that triggered the ability is about; no such player, nothing matches.
  if (filter.controller === 'triggerPlayer' && controllerOf(state, obj) !== ctx.triggerPlayer)
    return false;
  // CR 508.5 (D-151): "creature defending player controls": the player the source is attacking; nothing matches when it is not attacking.
  if (filter.controller === 'defendingPlayer' && controllerOf(state, obj) !== ctx.defendingPlayer)
    return false;
  // CR 108.3: the owner of a card is the player who started the game with it in their deck.
  if (filter.owner !== undefined && !(ctx.owners ?? []).includes(obj.owner)) return false;
  // CR 109.4 (D-179): "each creature that player controls": the permanent's controller is one of the players the selector names.
  if (
    filter.controlledBy !== undefined &&
    !(ctx.controllers ?? []).includes(controllerOf(state, obj))
  ) {
    return false;
  }
  if (filter.tapped !== undefined && obj.tapped !== filter.tapped) return false;
  // CR 303.4, 301.5, 701.3 (D-422): "Aura attached to it", "attached to a creature", "creatures that aren't enchanted", "enchanted creature".
  if (filter.attachedTo !== undefined && !attachedToHolds(state, obj, filter.attachedTo, ctx)) {
    return false;
  }
  if (filter.hostOfSource === true) {
    const source = ctx.source === null ? undefined : state.objects[ctx.source];
    if (source === undefined || source.attachedTo !== obj.id) return false;
  }
  if (filter.enchanted !== undefined && hasAuraAttached(state, obj, ctx) !== filter.enchanted) {
    return false;
  }
  // CR 122.1 (D-145): "with a counter on it": a counter of any kind, or of the named kind.
  if (filter.hasCounter !== undefined) {
    const has =
      filter.hasCounter === true
        ? Object.values(obj.counters).some((n) => n > 0)
        : (obj.counters[filter.hasCounter] ?? 0) > 0;
    if (!has) return false;
  }
  // CR 506.4 (D-120): an attacking creature is one declared as an attacker that is still in combat.
  if (filter.attacking === true && !(ctx.attackers ?? []).includes(obj.id)) return false;
  // CR 506.4, 509.1g (D-229): "attacking or blocking" is a creature declared as an attacker or a blocker that is still in combat.
  if (filter.attackingOrBlocking === true && !(ctx.inCombat ?? []).includes(obj.id)) return false;
  // D-131: "attacking you" is an attacker whose attack target is the controller as a player.
  if (filter.attackingYou === true && !(ctx.attackersOfYou ?? []).includes(obj.id)) return false;
  // D-218: "attacking your opponents and/or planeswalkers they control".
  if (filter.attackingOpponents === true && !(ctx.attackersOfOpponents ?? []).includes(obj.id)) {
    return false;
  }
  if (filter.stackKind) {
    // D-207: "triggered ability" is an ability on the stack that a trigger put there (CR 603.3); the other two kinds are the stack object's own.
    if (filter.stackKind === 'triggeredAbility') {
      if (obj.stack?.kind !== 'ability' || obj.stack.ability?.kind !== 'triggered') return false;
    } else if (!obj.stack || obj.stack.kind !== filter.stackKind) return false;
  }
  // CR 115.9a (D-181): "with a single target": the spell or ability was put on the stack with exactly one target (one chosen twice counts twice).
  if (filter.singleTarget === true && obj.stack?.chosenTargets.length !== 1) return false;
  const d = describe();
  if (filter.types && !filter.types.every((t) => d.types.includes(t))) return false;
  if (filter.notTypes?.some((t) => d.types.includes(t))) return false;
  if (filter.supertypes && !filter.supertypes.every((t) => d.supertypes.includes(t))) return false;
  if (filter.notSupertypes?.some((t) => d.supertypes.includes(t))) return false;
  if (filter.subtypes && !filter.subtypes.every((t) => d.subtypes.includes(t))) return false;
  if (filter.notSubtypes?.some((t) => d.subtypes.includes(t))) return false;
  if (filter.colorless === true && d.colors.length > 0) return false;
  // CR 105.2 (D-139): "two or more colors", "monocolored": how many colors the object has now.
  if (!compares(filter.colorCount, d.colors.length)) return false;
  // CR 111.1 (D-133): a token is a permanent that is not represented by a card.
  if (filter.token !== undefined && (obj.token !== null) !== filter.token) return false;
  // CR 903.3 (D-145): "commander" is a card designated as a player's commander.
  if (filter.commander !== undefined && d.commander !== true) return false;
  // D-149: "your commander" is one its owner designated, and that owner is the player reading the filter.
  if (filter.commander === 'yours' && obj.owner !== ctx.controller) return false;
  // CR 700.9 (D-416): "modified": a counter, an Equipment, or an Aura its controller controls.
  if (filter.modified === true && d.modified !== true) return false;
  if (filter.keywords && !filter.keywords.every((k) => d.keywords?.includes(k) === true)) {
    return false;
  }
  if (filter.notKeywords?.some((k) => d.keywords?.includes(k) === true)) return false;
  if (filter.colors && !filter.colors.every((c) => d.colors.includes(c))) return false;
  if (!compares(filter.power, d.power)) return false;
  if (!compares(filter.toughness, d.toughness)) return false;
  if (!compares(filter.manaValue, d.manaValue)) return false;
  // CR 202.3 (D-230): "mana value X or less, where X is ...": the limit is worked out by the caller (`select.ts`); without it the filter fails closed.
  if (filter.manaValueAtMost !== undefined) {
    if (ctx.manaValueLimit === undefined || d.manaValue === null || d.manaValue === undefined) {
      return false;
    }
    if (d.manaValue > ctx.manaValueLimit) return false;
  }
  // CR 107.3a, 202.3 (D-139): "with mana value X", the X of the ability that is resolving.
  if (filter.manaValueX === true && (ctx.x === undefined || d.manaValue !== ctx.x)) return false;
  // CR 510.2 (D-139): "whose controller was dealt combat damage by this creature this turn".
  if (
    filter.controllerDealtDamageBySource === true &&
    !(ctx.damagedPlayers ?? []).includes(controllerOf(state, obj))
  ) {
    return false;
  }
  // CR 700.4 (D-179): "that was put there from the battlefield this turn".
  if (filter.putFromBattlefieldThisTurn === true && !(ctx.graveyarded ?? []).includes(obj.id)) {
    return false;
  }
  // CR 601.2a (D-235): "Spells you cast from anywhere other than your hand": a spell on the stack that was cast from another zone.
  if (filter.notCastFromHand === true) {
    const from =
      ctx.castFrom ??
      (obj.zone === 'stack' && obj.stack?.kind === 'spell' ? obj.stack.castFrom : undefined);
    if (from === undefined || from === 'hand') return false;
  }
  // CR 400.7: "that entered this turn" is the same object that entered the battlefield during this turn.
  if (filter.enteredThisTurn === true && !(ctx.entered ?? []).includes(obj.id)) return false;
  // CR 702.134a (D-120): "with power less than this creature's power".
  if (filter.powerLessThanSource === true) {
    const power = ctx.sourcePower;
    if (power === null || power === undefined || d.power === null || d.power === undefined) {
      return false;
    }
    if (!(d.power < power)) return false;
  }
  // CR 208.4b (D-431): "with power greater than its base power": the power the object has now is more than its base power.
  if (filter.powerAboveBase === true) {
    const base = d.basePower;
    if (base === null || base === undefined || d.power === null || d.power === undefined) {
      return false;
    }
    if (!(d.power > base)) return false;
  }
  // D-100, CR 607.2d: "of the chosen type" / "of the chosen color" is what the source chose as it entered.
  if (filter.chosenType === true) {
    const type = ctx.sourceChosen?.creatureType;
    if (type === undefined || !d.subtypes.some((s) => sameCreatureType(s, type))) return false;
  }
  if (filter.chosenColor === true) {
    const color = ctx.sourceChosen?.color;
    if (color === undefined || !d.colors.includes(color)) return false;
  }
  // D-261, CR 205.3m: "shares a creature type with it": a creature type (CR 205.3m: the subtypes of creatures and kindreds) that both have.
  if (filter.sharesCreatureTypeWith !== undefined) {
    const theirs = ctx.subjectSubtypes;
    const shared =
      theirs !== undefined &&
      d.subtypes.some(
        (s) =>
          CREATURE_TYPES.some((c) => sameCreatureType(c, s)) &&
          theirs.some((t) => sameCreatureType(t, s)),
      );
    if (!shared) return false;
  }
  if (filter.anyOf !== undefined) {
    // A disjunction (CR 115.1: "artifact or enchantment" names one set of legal targets). The
    // members describe the object only; where to look (zone, stack kind) is the outer filter's.
    const scoped = { zone, ...(filter.stackKind ? { stackKind: filter.stackKind } : {}) };
    return filter.anyOf.some((member) =>
      matchesFilterWith(state, obj, () => d, { ...member, ...scoped }, ctx),
    );
  }
  return true;
}
