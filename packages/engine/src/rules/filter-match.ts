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
import { isOutlaw } from '../data/outlaw';
import type { ObjectId, SeatId } from '../ids';
import { definitionOf } from '../state/ops';
import type { ChosenValues, GameObject, GameState } from '../state/types';
import { sameCreatureType } from './chosen';
import { controllerOf } from './control';
import { isCommanderObject } from './melded';
import { xSymbolCount } from './x-value';

/** The characteristics a filter looks at. `Derived` has all of them. */
export interface FilterSubject {
  /** The object's name, read by `named` (D-489, CR 201.2); left out where the caller does not know it, which fails that test closed. */
  readonly name?: string;
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
  /** The base toughness (CR 208.4b), read by `basePowerOrToughnessIs`; left out where the caller does not know it, which fails that test closed. */
  readonly baseToughness?: number | null;
  readonly manaValue?: number;
  /** The mana cost symbols, read by `xInManaCost`; left out where the caller does not know it, which fails that test closed. */
  readonly manaCost?: readonly string[] | null;
  /**
   * The keywords without parameters the object has (`keywords`, `notKeywords`, D-133); left out where the caller does
   * not know them, which fails a `keywords` test closed and passes a `notKeywords` one (`validateCard` refuses both
   * in the places that read filters without abilities: static abilities).
   */
  readonly keywords?: readonly Keyword['kind'][];
  /**
   * Whether the object is a commander card (`commander`, D-145). Left out where the caller does not know it: the test then reads it from the object (CR 903.3: a card its owner
   * designated, which no layer changes, D-443), so a static ability's subject ("commander creatures you control") finds it without the view a caller built for the layers.
   */
  readonly commander?: boolean;
  /** Whether the permanent is modified (`modified`, D-416, CR 700.9); left out where the caller does not know, which fails the test closed. */
  readonly modified?: boolean;
  /** Whether the permanent is goaded (`goaded`, CR 701.15b); left out where the caller does not know, which fails the test closed. */
  readonly goaded?: boolean;
  /** Whether the permanent is face down (`facing`, CR 708.2); left out where the caller does not know, which fails the test closed (a face-up test as well). */
  readonly isFaceDown?: boolean;
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
   * progress. A filter that asks for an attacking creature matches nothing without it. Static subjects read
   * the current combat through `subjectAffects`, independently of the cached static-ability index.
   */
  readonly attackers?: readonly ObjectId[];
  /** The zone a spell that is being cast comes from, for `notCastFromHand` and `castFromHand` while the card has not moved to the stack yet (D-235): the cost code passes it. */
  readonly castFrom?: 'hand' | 'command' | 'graveyard' | 'exile' | 'library';
  /**
   * The creatures attacking the controller of the ability as a player, for `attackingYou` (D-131): read from the
   * combat in progress by the caller, like `attackers`; without it the flag matches nothing.
   */
  readonly attackersOfYou?: readonly ObjectId[];
  /** The creatures attacking the controller as a player or a planeswalker the controller controls, for `attackingYou: 'orPlaneswalkers'` (CR 508.1b, 506.3). */
  readonly attackersOfYouOrPlaneswalkers?: readonly ObjectId[];
  /** The number `manaValueAtMost` stands for (D-230), worked out by the caller that has the state. */
  readonly manaValueLimit?: number;
  /** The permanents sacrificed to pay the cost of the ability that is resolving, for `attachedTo` `sacrificedCost` (CR 113.7a): read from the resolution by the caller; absent matches nothing. */
  readonly costSacrificed?: readonly ObjectId[];
  /** The cards `notTriggerCard` leaves out (CR 400.7, 603.10a): the card the permanent the trigger is about became, read by the caller; absent leaves nothing out. */
  readonly excludedCards?: readonly ObjectId[];
  /** The creatures declared as blockers that are still in combat, for `blocking` (CR 509.1g): read from the combat in progress by the caller. */
  readonly blockers?: readonly ObjectId[];
  /** The attackers no creature blocked once the blockers were declared, for `unblocked` (CR 509.1h, unverified number): read from the combat in progress by the caller; without it the flag matches nothing. */
  readonly unblockedAttackers?: readonly ObjectId[];
  /** The creatures that are attacking or blocking, for `attackingOrBlocking` (D-229): read from the combat in progress by the caller. */
  readonly inCombat?: readonly ObjectId[];
  /**
   * The creatures attacking an opponent of the controller of the ability, or a planeswalker or battle of an opponent, for `attackingOpponents` (D-218): read
   * from the combat in progress by the caller, like `attackers`; without it the flag matches nothing.
   */
  readonly attackersOfOpponents?: readonly ObjectId[];
  /** The creatures attacking an opponent of the controller as a player, for `attackingOpponents: 'players'` (D-650). */
  readonly attackersOfOpponentPlayers?: readonly ObjectId[];
  /**
   * The power of this ability's source (`powerLessThanSource`, CR 702.134a, D-120), null when the source
   * has none or is not known; absent fails the comparison closed.
   */
  readonly sourcePower?: number | null;
  /**
   * The power of the object `powerGreaterThan` names, read by the caller as the effect resolves (CR 208.1, 608.2c); null when it names nothing or has no power.
   * Absent fails the comparison closed.
   */
  readonly powerLimit?: number | null;
  /** The number a `chooseNumber` effect of the resolving spell or ability had its controller choose (CR 608.2d), for `powerAtLeastChosenNumber`; absent fails the comparison closed. */
  readonly chosenNumber?: number;
  /** The name of the object `sameNameAs` names, read by the caller as the effect resolves (CR 201.2); null when it names nothing. Absent fails the filter closed. */
  readonly nameLimit?: string | null;
  /** The name of the permanent whose static ability the filter is the subject of, for `sameNameAsSource` (CR 201.2); absent fails the filter closed. */
  readonly sourceName?: string;
  /** The X of the spell or ability being resolved (CR 107.3a), for `manaValueX` (D-139); absent fails the filter closed. */
  readonly x?: number;
  /**
   * The spell is looked at before its X is announced (CR 601.2b: X comes before the targets), so "with mana value X" may hold for any mana value: the question "can it be cast
   * at all?" asks it, and the X offered is limited to those that leave a legal target (`rules/cast.ts`).
   */
  readonly xUnannounced?: true;
  /**
   * The players this ability's source dealt combat damage to this turn, for `controllerDealtDamageBySource` (D-139): read from the turn
   * log by the caller; without it the flag matches nothing.
   */
  readonly damagedPlayers?: readonly SeatId[];
  /** The combat damage events of this turn (`controllerDealtCombatDamageByAtLeast`, group 7 of the Ahoy Mateys deck): the turn log, read by the caller; absent fails the flag closed. */
  readonly combatDamaged?: readonly {
    readonly source: ObjectId;
    readonly player: SeatId;
    readonly subtypes: readonly Subtype[];
  }[];
  /** The cards put into a graveyard from the battlefield this turn (`putFromBattlefieldThisTurn`, D-179): the turn log, read by the caller; absent fails the flag closed. */
  readonly graveyarded?: readonly ObjectId[];
  /** The cards put into a graveyard this turn by being discarded or from a library (`discardedOrFromLibraryThisTurn`): the turn log, read by the caller; absent fails the flag closed. */
  readonly discardedOrFromLibrary?: readonly ObjectId[];
  /** The cards put into a graveyard this turn from a library (`putFromLibraryThisTurn`): the turn log, read by the caller; absent fails the flag closed. */
  readonly fromLibrary?: readonly ObjectId[];
  /** The permanents that entered the battlefield this turn (`enteredThisTurn`, group 4 of the Vraska deck): the turn log, read by the caller; absent fails the flag closed. */
  readonly entered?: readonly ObjectId[];
  /** The permanents dealt damage this turn (`dealtDamageThisTurn`, CR 120.3): the turn log, read by the caller; absent fails the flag closed. */
  readonly damagedObjects?: readonly ObjectId[];
  /** The cards the source exiled with its linked ability (`exiledWithSource`, Lorehold group 2, CR 607.2a): read from the source by the caller; absent fails the flag closed. */
  readonly linkedExile?: readonly ObjectId[];
  /** The cards the resolution that created the reflexive ability moved (`exiledThisWay`, Espers to Magicite, CR 603.12, 400.7j): read by the caller; absent fails the flag closed. */
  readonly exiledThisWay?: readonly ObjectId[];
  /** The power of the first object the resolution that created the reflexive ability moved (`powerAtMostMoved`, Grishnákh, CR 603.12, 701.47a): read by the caller; absent fails the flag closed. */
  readonly movedPower?: number;
  /**
   * The subtypes of the object the trigger is about, as it last was (`sharesCreatureTypeWith`, D-261, CR 603.10a, 113.7a): read by the caller; absent fails the flag closed.
   */
  readonly subjectSubtypes?: readonly Subtype[];
  /** The colors of the permanents `sharesColorWith` names (CR 105.1), read from the battlefield by the caller; absent fails the flag closed. */
  readonly sharedColors?: readonly Color[];
  /** The card types of the spell the trigger is about (`sharesCardTypeWith`, CR 205.2a): read by the caller; absent fails the flag closed. */
  readonly subjectTypes?: readonly CardType[];
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
  // CR 113.7a, 301.5 (Zack Fair): "an Equipment that was attached to ~", ~ sacrificed to pay the cost: read from its last-known information, as the Equipment is attached to nothing now.
  if (attached.kind === 'sacrificedCost') {
    return (ctx.costSacrificed ?? []).some((id) =>
      (state.lki[id]?.attachments ?? []).some((a) => a.id === obj.id),
    );
  }
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

/**
 * CR 303.4: "enchanted": at least one Aura is attached to the permanent (an Equipment or a Fortification is not an Aura). With `by`, an Aura that player controls (CR 303.4e, D-647).
 * Fails closed without `describeOther`.
 */
function hasAuraAttached(
  state: GameState,
  obj: GameObject,
  ctx: FilterContext,
  by?: SeatId,
  subtype: 'Aura' | 'Equipment' = 'Aura',
): boolean | null {
  const describeOther = ctx.describeOther;
  if (describeOther === undefined) return null;
  return state.battlefield.some((id) => {
    const other = state.objects[id];
    return (
      other !== undefined &&
      other.attachedTo === obj.id &&
      describeOther(other).subtypes.includes(subtype) &&
      (by === undefined || controllerOf(state, other) === by)
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
  // CR 400.7, 603.10a (Puca's Covenant): "another target permanent card": not the card the permanent the trigger is about became.
  if (filter.notTriggerCard === true && (ctx.excludedCards ?? []).includes(obj.id)) return false;
  // CR 508.1 (Shared Animosity): "each other attacking creature": not the creature the trigger is about, which the caller lists in `excludedCards`.
  if (filter.otherThanTriggerSubject === true && (ctx.excludedCards ?? []).includes(obj.id))
    return false;
  // D-437: "a spell that targets this creature": the object is the permanent that has the ability.
  if (filter.isSource === true && (ctx.source === null || obj.id !== ctx.source)) return false;
  if (filter.controller === 'you' && controllerOf(state, obj) !== ctx.controller) return false;
  if (filter.controller === 'opponent' && controllerOf(state, obj) === ctx.controller) return false;
  // D-151: "that opponent": the player the event that triggered the ability is about; no such player, nothing matches.
  if (filter.controller === 'triggerPlayer' && controllerOf(state, obj) !== ctx.triggerPlayer)
    return false;
  // CR 508.5 (D-151): "creature defending player controls": the player the source is attacking; nothing matches when it is not attacking.
  if (filter.controller === 'defendingPlayer' && controllerOf(state, obj) !== ctx.defendingPlayer)
    return false;
  // CR 607.2d (Sewer Nemesis): "cards in the chosen player's graveyard": the controller (the owner of a card in a graveyard) is the player the source chose as it entered; nothing when none was chosen.
  if (
    filter.controller === 'chosenPlayer' &&
    (ctx.sourceChosen?.player === undefined || controllerOf(state, obj) !== ctx.sourceChosen.player)
  ) {
    return false;
  }
  // CR 725.1 (monarch): "creatures the monarch controls": the controller is the monarch now; with no monarch nothing matches.
  if (filter.controller === 'monarch' && controllerOf(state, obj) !== state.monarch) return false;
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
  // CR 301.5 (Equipment): "equipped creature", "creatures that are equipped": an Equipment is attached to it.
  if (
    filter.equipped !== undefined &&
    hasAuraAttached(state, obj, ctx, undefined, 'Equipment') !== filter.equipped
  ) {
    return false;
  }
  // CR 303.4e (D-647): "enchanted by an Aura you control".
  if (filter.enchantedByYou === true && hasAuraAttached(state, obj, ctx, ctx.controller) !== true) {
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
  if (filter.notAttacking === true && (ctx.attackers ?? []).includes(obj.id)) return false;
  // CR 509.1g: a blocking creature is one declared as a blocker that is still in combat.
  if (filter.blocking === true && !(ctx.blockers ?? []).includes(obj.id)) return false;
  // CR 509.1h (Ninjutsu): an unblocked creature is an attacker still in combat that no creature blocked, after the blockers were declared.
  if (filter.unblocked === true && !(ctx.unblockedAttackers ?? []).includes(obj.id)) return false;
  // CR 506.4, 509.1g (D-229): "attacking or blocking" is a creature declared as an attacker or a blocker that is still in combat.
  if (filter.attackingOrBlocking === true && !(ctx.inCombat ?? []).includes(obj.id)) return false;
  // D-131: "attacking you" is an attacker whose attack target is the controller as a player.
  if (filter.attackingYou === true && !(ctx.attackersOfYou ?? []).includes(obj.id)) return false;
  if (
    filter.attackingYou === 'orPlaneswalkers' &&
    !(ctx.attackersOfYouOrPlaneswalkers ?? []).includes(obj.id)
  ) {
    return false;
  }
  // D-218: "attacking your opponents and/or planeswalkers they control".
  if (filter.attackingOpponents === true && !(ctx.attackersOfOpponents ?? []).includes(obj.id)) {
    return false;
  }
  // D-650 (CR 508.1b): "attacking one of your opponents" is an attacker whose target is an opponent as a player.
  if (
    filter.attackingOpponents === 'players' &&
    !(ctx.attackersOfOpponentPlayers ?? []).includes(obj.id)
  ) {
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
  if (
    filter.targetCountAtLeast !== undefined &&
    (obj.stack?.chosenTargets.length ?? 0) < filter.targetCountAtLeast
  ) {
    return false;
  }
  const d = describe();
  // CR 201.2 (D-489): "a card named X": the name is exactly the text.
  if (filter.named !== undefined && d.name !== filter.named) return false;
  if (filter.types && !filter.types.every((t) => d.types.includes(t))) return false;
  if (filter.notTypes?.some((t) => d.types.includes(t))) return false;
  if (filter.supertypes && !filter.supertypes.every((t) => d.supertypes.includes(t))) return false;
  if (filter.notSupertypes?.some((t) => d.supertypes.includes(t))) return false;
  if (filter.subtypes && !filter.subtypes.every((t) => d.subtypes.includes(t))) return false;
  if (filter.notSubtypes?.some((t) => d.subtypes.includes(t))) return false;
  // CR 700.12 (outlaw): at least one of the Assassin, Mercenary, Pirate, Rogue and Warlock creature types; `false` is "non-outlaw".
  if (filter.outlaw !== undefined && isOutlaw(d.subtypes) !== filter.outlaw) return false;
  if (filter.colorless === true && d.colors.length > 0) return false;
  // CR 105.2c: a colorless object has no color, so it is "nonblack" like any object that lacks black.
  if (filter.notColors?.some((c) => d.colors.includes(c))) return false;
  // CR 105.2 (D-139): "two or more colors", "monocolored": how many colors the object has now.
  if (!compares(filter.colorCount, d.colors.length)) return false;
  // CR 111.1 (D-133): a token is a permanent that is not represented by a card.
  if (filter.token !== undefined && (obj.token !== null) !== filter.token) return false;
  // CR 708.2, 701.40a: "face-down creature": the object is a face-down permanent (read through `rules/face-down.ts`).
  // CR 903.3 (D-145): "commander" is a card designated as a player's commander.
  if (filter.commander !== undefined && (d.commander ?? isCommanderObject(state, obj)) !== true)
    return false;
  // CR 903.3 (Subjugate the Hobbits): "noncommander" is any object that is not a card designated as a player's commander.
  if (filter.notCommander === true && (d.commander ?? isCommanderObject(state, obj)) === true)
    return false;
  // D-149: "your commander" is one its owner designated, and that owner is the player reading the filter.
  if (filter.commander === 'yours' && obj.owner !== ctx.controller) return false;
  // CR 108.3 ("you don't own"): the owner of the object is not the player reading the filter.
  if (filter.notOwnedByYou === true && obj.owner === ctx.controller) return false;
  // CR 108.3 ("you own"): the owner of the object is the player reading the filter, whoever controls it.
  if (filter.ownedByYou === true && obj.owner !== ctx.controller) return false;
  // CR 700.9 (D-416): "modified": a counter, an Equipment, or an Aura its controller controls.
  if (filter.modified === true && d.modified !== true) return false;
  // CR 701.15b: "goaded": a creature some player's goad effect still holds.
  if (filter.goaded === true && d.goaded !== true) return false;
  // CR 708.2, 701.40: "face-down" (true) or "face-up" (false) is the status the permanent has now.
  if (filter.facing !== undefined && d.isFaceDown !== (filter.facing === 'down')) return false;
  if (filter.keywords && !filter.keywords.every((k) => d.keywords?.includes(k) === true)) {
    return false;
  }
  // CR 702.35a (Anje Falkenrath: "if it has madness"): madness is a cost the card lists (`alternativeCosts`), not a keyword ability of the permanent; read from either face of the card.
  if (
    filter.hasMadness === true &&
    !(
      obj.card !== null &&
      definitionOf(state, obj.card).faces.some((f) =>
        f.alternativeCosts?.some((a) => a.kind === 'madness'),
      )
    )
  ) {
    return false;
  }
  if (filter.notKeywords?.some((k) => d.keywords?.includes(k) === true)) return false;
  if (filter.colors && !filter.colors.every((c) => d.colors.includes(c))) return false;
  if (!compares(filter.power, d.power)) return false;
  // "Each creature with power of the chosen quality" (Zimone's Hypothesis): the power now is odd or even; 0 is even and so is any multiple of 2, negative or not.
  if (filter.powerParity !== undefined) {
    if (d.power === null || d.power === undefined) return false;
    const odd = Math.abs(d.power) % 2 === 1;
    if (odd !== (filter.powerParity === 'odd')) return false;
  }
  if (!compares(filter.toughness, d.toughness)) return false;
  if (!compares(filter.manaValue, d.manaValue)) return false;
  // CR 202.3 (D-230): "mana value X or less, where X is ...": the limit is worked out by the caller (`select.ts`); without it the filter fails closed.
  if (filter.manaValueAtMost !== undefined || filter.manaValueBelow !== undefined) {
    if (ctx.manaValueLimit === undefined || d.manaValue === null || d.manaValue === undefined) {
      return false;
    }
    if (d.manaValue > ctx.manaValueLimit) return false;
    // CR 202.3: "with mana value equal to that spell's mana value": the limit is the exact value (`manaValueExact`).
    if (filter.manaValueExact === true && d.manaValue !== ctx.manaValueLimit) return false;
  }
  // CR 107.3a, 202.3 (D-139): "with mana value X", the X of the ability that is resolving.
  if (filter.manaValueX === true) {
    if (ctx.x !== undefined) {
      if (d.manaValue !== ctx.x) return false;
    } else if (ctx.xUnannounced !== true || d.manaValue === null || d.manaValue === undefined) {
      return false;
    }
  }
  // CR 510.2 (D-139): "whose controller was dealt combat damage by this creature this turn".
  if (
    filter.controllerDealtDamageBySource === true &&
    !(ctx.damagedPlayers ?? []).includes(controllerOf(state, obj))
  ) {
    return false;
  }
  // CR 510.2, 120.2a (Ahoy Mateys group 7): "controlled by a player who was dealt combat damage by three or more Pirates this turn": different sources, as each was.
  if (filter.controllerDealtCombatDamageByAtLeast !== undefined) {
    const { atLeast, subtypes } = filter.controllerDealtCombatDamageByAtLeast;
    const who = controllerOf(state, obj);
    const sources = new Set<ObjectId>();
    for (const d of ctx.combatDamaged ?? []) {
      if (d.player === who && subtypes.every((t) => d.subtypes.includes(t))) sources.add(d.source);
    }
    if (sources.size < atLeast) return false;
  }
  // CR 700.4 (D-179): "that was put there from the battlefield this turn".
  if (filter.putFromBattlefieldThisTurn === true && !(ctx.graveyarded ?? []).includes(obj.id)) {
    return false;
  }
  // "That was discarded or put there from a library this turn" (Ghost of Ramirez DePietro).
  if (
    filter.discardedOrFromLibraryThisTurn === true &&
    !(ctx.discardedOrFromLibrary ?? []).includes(obj.id)
  ) {
    return false;
  }
  // CR 404.1, 701.17 (Captain N'ghathrod): "that was put there from their library this turn".
  if (filter.putFromLibraryThisTurn === true && !(ctx.fromLibrary ?? []).includes(obj.id)) {
    return false;
  }
  // CR 601.2a (D-235): "Spells you cast from anywhere other than your hand": a spell on the stack that was cast from another zone.
  if (filter.notCastFromHand === true) {
    const from =
      ctx.castFrom ??
      (obj.zone === 'stack' && obj.stack?.kind === 'spell' ? obj.stack.castFrom : undefined);
    if (from === undefined || from === 'hand') return false;
  }
  // CR 601.2a (D-638): "Spells you cast from your hand": a spell on the stack that was cast from the hand.
  if (filter.castFromHand === true) {
    const from =
      ctx.castFrom ??
      (obj.zone === 'stack' && obj.stack?.kind === 'spell' ? obj.stack.castFrom : undefined);
    if (from !== 'hand') return false;
  }
  // CR 601.2a (issue 102, River Kelpie): "a spell cast from a graveyard": a spell on the stack that was cast from a graveyard.
  if (filter.castFromGraveyard === true) {
    const from =
      ctx.castFrom ??
      (obj.zone === 'stack' && obj.stack?.kind === 'spell' ? obj.stack.castFrom : undefined);
    if (from !== 'graveyard') return false;
  }
  // CR 601.2a, 406.1 (Exit from Exile deck): "a spell cast from exile": a spell on the stack that was cast from exile.
  if (filter.castFromExile === true) {
    const from =
      ctx.castFrom ??
      (obj.zone === 'stack' && obj.stack?.kind === 'spell' ? obj.stack.castFrom : undefined);
    if (from !== 'exile') return false;
  }
  // CR 601.2a, 404.1 (Emet-Selch of the Third Seat): "spells you cast from your graveyard": cast from a graveyard, the card owned by the caster (a graveyard is its owner's, CR 404.1).
  if (filter.castFromOwnGraveyard === true) {
    const from =
      ctx.castFrom ??
      (obj.zone === 'stack' && obj.stack?.kind === 'spell' ? obj.stack.castFrom : undefined);
    if (from !== 'graveyard' || obj.owner !== controllerOf(state, obj)) return false;
  }
  // CR 601.2a, 404.1, 406.1 (Doc Aurlock, Grizzled Genius): "spells you cast from your graveyard or from exile": cast from exile, or from a graveyard of the caster's own.
  if (filter.castFromOwnGraveyardOrExile === true) {
    const from =
      ctx.castFrom ??
      (obj.zone === 'stack' && obj.stack?.kind === 'spell' ? obj.stack.castFrom : undefined);
    const ownGraveyard = from === 'graveyard' && obj.owner === controllerOf(state, obj);
    if (from !== 'exile' && !ownGraveyard) return false;
  }
  // CR 107.3, 202.1 (Quandrix Unlimited group E): "a spell with {X} in its mana cost".
  if (
    filter.xInManaCost === true &&
    (d.manaCost === undefined || xSymbolCount(d.manaCost ?? []) === 0)
  )
    return false;
  // CR 601.2i (Quandrix Unlimited group E): "your first spell with {X} in its mana cost each turn": no earlier one cast this turn by the caster.
  if (
    filter.firstXSpellThisTurn === true &&
    state.turnLog.castSpells.some(
      (e) => e.hasX === true && e.seat === controllerOf(state, obj) && e.object !== obj.id,
    )
  ) {
    return false;
  }
  // CR 601.2i (Wild-Magic Sorcerer): "the first spell you cast from exile each turn": no other spell the caster cast from exile this turn so far.
  if (
    filter.firstCastFromExileThisTurn === true &&
    state.turnLog.castSpells.some(
      (e) => e.fromExile === true && e.seat === controllerOf(state, obj) && e.object !== obj.id,
    )
  ) {
    return false;
  }
  // CR 601.2h (Rain of Riches): "a spell that mana from a Treasure was spent to cast": a spell on the stack that was paid, in part, with mana a source of the subtype made.
  if (
    filter.manaSpentFromSubtype !== undefined &&
    !(
      obj.zone === 'stack' &&
      obj.stack?.kind === 'spell' &&
      (obj.stack.manaSpent?.fromSubtypes?.[filter.manaSpentFromSubtype] ?? 0) > 0
    )
  ) {
    return false;
  }
  // CR 601.2i (Rain of Riches): "the first spell you cast each turn that mana from a Treasure was spent to cast": no other spell the caster cast this turn so far was paid so.
  if (
    filter.firstManaSpentFromSubtypeThisTurn === true &&
    filter.manaSpentFromSubtype !== undefined &&
    state.turnLog.castSpells.some(
      (e) =>
        e.manaSubtypes?.includes(filter.manaSpentFromSubtype ?? '') === true &&
        e.seat === controllerOf(state, obj) &&
        e.object !== obj.id,
    )
  ) {
    return false;
  }
  // CR 601.2i (Alisaie Leveilleur): "the second spell you cast each turn": exactly one other spell cast by the caster this turn so far (a copy is not cast, CR 707.10).
  if (
    filter.nthSpellThisTurn !== undefined &&
    state.turnLog.castSpells.filter(
      (e) => e.seat === controllerOf(state, obj) && e.object !== obj.id,
    ).length !==
      filter.nthSpellThisTurn - 1
  ) {
    return false;
  }
  // CR 601.2i (Artifact Class): "the first artifact spell you cast each turn": no other spell cast by the caster this turn so far has one of the card types (a copy is not cast, CR 707.10).
  if (
    filter.firstOfTypeThisTurn === true &&
    state.turnLog.castSpells.some(
      (e) =>
        e.seat === controllerOf(state, obj) &&
        e.object !== obj.id &&
        e.types.some((t) => filter.types?.includes(t) === true),
    )
  ) {
    return false;
  }
  // CR 400.7: "that entered this turn" is the same object that entered the battlefield during this turn.
  if (filter.enteredThisTurn === true && !(ctx.entered ?? []).includes(obj.id)) return false;
  if (filter.dealtDamageThisTurn === true && !(ctx.damagedObjects ?? []).includes(obj.id)) {
    return false;
  }
  // CR 607.2a (Lorehold group 2): "card exiled with this creature": one of the cards the source exiled with its linked ability.
  if (filter.exiledWithSource === true && !(ctx.linkedExile ?? []).includes(obj.id)) return false;
  if (filter.exiledThisWay === true && !(ctx.exiledThisWay ?? []).includes(obj.id)) return false;
  // CR 208.1, 603.12 (Grishnákh): "power less than or equal to the amassed Army's power".
  if (filter.powerAtMostMoved === true) {
    if (ctx.movedPower === undefined || d.power === null || d.power === undefined) return false;
    if (d.power > ctx.movedPower) return false;
  }
  // CR 400.7 (Animate Dead): "put onto the battlefield with this Aura": the object remembers the source, as the same object.
  if (filter.putWithSource === true && (ctx.source === null || obj.putWith !== ctx.source)) {
    return false;
  }
  // CR 601.2a, 603.4 (Rapid Augmenter): "if it wasn't cast": the permanent remembers no cast spell it came from (read from last-known information once it has left).
  if (
    filter.notCast === true &&
    (obj.castFrom !== undefined || obj.stack?.castFrom !== undefined)
  ) {
    return false;
  }
  // CR 702.134a (D-120): "with power less than this creature's power".
  if (filter.powerLessThanSource === true) {
    const power = ctx.sourcePower;
    if (power === null || power === undefined || d.power === null || d.power === undefined) {
      return false;
    }
    if (!(d.power < power)) return false;
  }
  // CR 208.1, 608.2c (Conformer Shuriken): "has greater power than this creature": more than the power of this ability's source.
  if (filter.powerGreaterThanSource === true) {
    const power = ctx.sourcePower;
    if (power === null || power === undefined || d.power === null || d.power === undefined) {
      return false;
    }
    if (!(d.power > power)) return false;
  }
  // CR 208.1, 608.2c: "with power greater than target creature's power": more than the power of the object the effect names.
  if (filter.powerGreaterThan !== undefined) {
    const limit = ctx.powerLimit;
    if (limit === null || limit === undefined || d.power === null || d.power === undefined) {
      return false;
    }
    if (!(d.power > limit)) return false;
  }
  // CR 208.1, 608.2c (Expel the Interlopers): "with power greater than or equal to the chosen number".
  if (filter.powerAtLeastChosenNumber === true) {
    const chosen = ctx.chosenNumber;
    if (chosen === undefined || d.power === null || d.power === undefined) return false;
    if (!(d.power >= chosen)) return false;
  }
  // CR 201.2, 608.2c (Echoing Return): "with the same name as that card": the name of the object the effect names.
  if (filter.sameNameAs !== undefined) {
    const name = ctx.nameLimit;
    // CR 201.2a: an object with no name (a face-down permanent, CR 708.2a) has the same name as nothing, not even another object with no name.
    if (name === null || name === undefined || name === '' || d.name !== name) return false;
  }
  // CR 201.2 (Mocking Doppelganger): "with the same name as this creature": the name of the permanent with the static ability.
  if (filter.sameNameAsSource === true) {
    const name = ctx.sourceName;
    if (name === undefined || name === '' || d.name === undefined || d.name !== name) return false;
  }
  // CR 208.4b (D-431): "with power greater than its base power": the power the object has now is more than its base power.
  if (filter.powerAboveBase === true) {
    const base = d.basePower;
    if (base === null || base === undefined || d.power === null || d.power === undefined) {
      return false;
    }
    if (!(d.power > base)) return false;
  }
  // CR 208.4b: "with base power 0": the base power the object has before counters and effects that only modify it.
  if (filter.basePowerIs !== undefined) {
    const base = d.basePower;
    if (base === null || base === undefined || base !== filter.basePowerIs) return false;
  }
  // CR 208.4b: "with base power or toughness 1": either base value is the number.
  if (filter.basePowerOrToughnessIs !== undefined) {
    if (
      d.basePower !== filter.basePowerOrToughnessIs &&
      d.baseToughness !== filter.basePowerOrToughnessIs
    ) {
      return false;
    }
  }
  // D-100, CR 607.2d: "of the chosen type" / "of the chosen color" is what the source chose as it entered.
  // CR 101.4 (Harsh Mercy): "each player chooses a creature type" chose several; "of a type chosen this way" is any of them, "aren't of a type chosen this way" none.
  if (filter.chosenType === true) {
    const types = chosenCreatureTypes(ctx.sourceChosen);
    if (types === undefined || !d.subtypes.some((s) => types.some((t) => sameCreatureType(s, t))))
      return false;
  }
  if (filter.notChosenType === true) {
    const types = chosenCreatureTypes(ctx.sourceChosen);
    if (types === undefined || d.subtypes.some((s) => types.some((t) => sameCreatureType(s, t))))
      return false;
  }
  if (filter.chosenColor === true) {
    const color = ctx.sourceChosen?.color;
    if (color === undefined || !d.colors.includes(color)) return false;
  }
  // CR 205.3j, 607.2d: "planeswalkers ... of the chosen type" is the planeswalker type the source chose as it entered.
  if (filter.chosenPlaneswalkerType === true) {
    const type = ctx.sourceChosen?.planeswalkerType;
    if (type === undefined || !d.subtypes.includes(type)) return false;
  }
  // CR 205.2a, 607.2d (Cloud Key): "spells ... of the chosen type" is the card type the source chose as it entered.
  if (filter.chosenCardType === true) {
    const type = ctx.sourceChosen?.cardType;
    if (type === undefined || !d.types.includes(type)) return false;
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
  // CR 205.2a, 603.3d: "that shares a card type with it": a card type that both have.
  if (filter.sharesCardTypeWith !== undefined) {
    const theirs = ctx.subjectTypes;
    if (theirs === undefined || !d.types.some((t) => theirs.includes(t))) return false;
  }
  // CR 105.1, 105.2c (Ringsight): "shares a color with a legendary creature you control": a color that both have; a colorless object has none to share.
  if (filter.sharesColorWith !== undefined) {
    const theirs = ctx.sharedColors;
    if (theirs === undefined || !d.colors.some((c) => theirs.includes(c))) return false;
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

/** The creature types a choice made: those of an "each player chooses" (CR 101.4), else the one type of a single choice; undefined when no type was chosen. */
function chosenCreatureTypes(chosen: ChosenValues | undefined): readonly string[] | undefined {
  if (chosen?.creatureTypes !== undefined) return chosen.creatureTypes;
  return chosen?.creatureType === undefined ? undefined : [chosen.creatureType];
}
