/**
 * Amounts (D-095, D-103, D-131): `amountOf` reads any `Amount` as the instruction that has it runs, and the kinds that
 * read the game itself live here too: an object's toughness or counters, the greatest or the total of a stat over a set
 * of objects, devotion, the colors of a commander, opponents with more of something, and what an earlier instruction of
 * this resolution did. The file imports nothing that moves objects or runs effects, so conditions (`conditions.ts`) can
 * read amounts without a cycle.
 *
 * Every amount is a whole number that is never negative (CR 107.1b: a negative number counts as 0 where a number of
 * objects or an amount of life or cards is needed).
 */
import type { Amount, ObjectFilter, PlayerStat } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import { getSeat, objectsInZone, opponentsOf } from '../state/ops';
import type { ChosenTarget, GameState } from '../state/types';
import { commanderIdentity } from './commander-identity';
import { controllerOf } from './control';
import { derive } from './derive';
import { commandersCastCount, commandersManaValue } from './derive-count';
import { devotionOf } from './devotion';
import { timesKickedOf } from './kicks';
import { manaSpentOf } from './mana-spent';
import { manaValueOfCost } from './mana-value';
import {
  countMatching,
  matchesFilter,
  resolveObjects,
  resolvePlayers,
  type SelectContext,
} from './select';
import { objectOrLki } from './source-info';

export { devotionCostOf, devotionOf, devotionSymbols } from './devotion';

type StateAmount = Extract<
  Amount,
  {
    kind:
      | 'toughnessOf'
      | 'countersOn'
      | 'aggregate'
      | 'devotion'
      | 'commanderColors'
      | 'commanderManaValue'
      | 'commanderCasts'
      | 'thisWay'
      | 'opponentsWithMore'
      | 'opponentCount'
      | 'cardsStillExiled'
      | 'cardsDrawnThisTurn'
      | 'spellsCastThisTurn'
      | 'greatestManaValueCast'
      | 'sacrificedAsCost'
      | 'exiledAsCost'
      | 'cardTypesAmong';
  }
>;

/** History uses the event's controller and types, never the object's current zone or characteristics. */
export function historyCount(
  state: GameState,
  amount: Extract<Amount, { kind: 'enteredThisTurn' | 'diedThisTurn' }>,
  controller: SeatId,
): number {
  // CR 700.9, 603.10a: "a modified creature died": the deaths record whether the permanent was modified as it left.
  const onlyModified = amount.kind === 'diedThisTurn' && amount.modified === true;
  const entries =
    amount.kind === 'enteredThisTurn'
      ? state.turnLog.entered
      : state.turnLog.died.filter((e) => !onlyModified || e.modified);
  return entries.filter(
    (e) =>
      (amount.controller === 'any' || e.controller === controller) &&
      (amount.types === undefined || amount.types.every((t) => e.types.includes(t))) &&
      (amount.token === undefined || amount.token === e.token),
  ).length;
}

/** The amount kinds `stateAmountOf` reads. */
export function isStateAmount(amount: Exclude<Amount, number>): amount is StateAmount {
  return (
    amount.kind === 'toughnessOf' ||
    amount.kind === 'countersOn' ||
    amount.kind === 'aggregate' ||
    amount.kind === 'devotion' ||
    amount.kind === 'commanderColors' ||
    amount.kind === 'commanderManaValue' ||
    amount.kind === 'commanderCasts' ||
    amount.kind === 'thisWay' ||
    amount.kind === 'opponentsWithMore' ||
    amount.kind === 'opponentCount' ||
    amount.kind === 'cardsStillExiled' ||
    amount.kind === 'cardsDrawnThisTurn' ||
    amount.kind === 'spellsCastThisTurn' ||
    amount.kind === 'greatestManaValueCast' ||
    amount.kind === 'sacrificedAsCost' ||
    amount.kind === 'exiledAsCost' ||
    amount.kind === 'cardTypesAmong'
  );
}

/**
 * CR 700.5: the mana symbols among `cost` that are one of `colors`. A hybrid symbol ({W/U}, {2/W}, {C/W}) or a
 * Phyrexian one ({W/P}) counts once for the colors it has among the set; a generic, colorless, snow or {X} symbol
 * counts for none (CR 700.5: "mana symbols of that color").
 */
/** The stat of one object as `derive` gives it, or null for an object that has none (CR 208.3: a noncreature). */
export function statOf(
  state: GameState,
  id: ObjectId,
  stat: 'power' | 'toughness' | 'manaValue',
): number | null {
  const obj = state.objects[id];
  if (obj === undefined) return null;
  const d = derive(state, obj);
  if (stat === 'power') return d.power;
  if (stat === 'toughness') return d.toughness;
  return manaValueOfCost(d.manaCost, obj);
}

function aggregateOf(
  state: GameState,
  amount: Extract<Amount, { kind: 'aggregate' }>,
  ctx: SelectContext,
): number {
  const filter: ObjectFilter = amount.filter;
  const zone = filter.zone ?? (filter.stackKind ? 'stack' : 'battlefield');
  let best = 0;
  let total = 0;
  for (const id of objectsInZone(state, zone)) {
    if (id === ctx.excluded) continue;
    const obj = state.objects[id];
    if (obj === undefined || !matchesFilter(state, obj, filter, ctx)) continue;
    const value = statOf(state, id, amount.stat);
    if (value === null) continue;
    best = Math.max(best, value);
    total += value;
  }
  // CR 107.1b: a negative total counts as 0.
  return amount.how === 'greatest' ? Math.max(0, best) : Math.max(0, total);
}

/**
 * CR 205.2a, (D-518): "the number of card types among cards in your graveyard": the card types the objects the filter matches have between them, each once.
 * The types are those of the cards where they are (`derive` of an object in a graveyard or exile is its printed types); a supertype or subtype is no card type.
 */
function cardTypesAmongOf(state: GameState, filter: ObjectFilter, ctx: SelectContext): number {
  const zone = filter.zone ?? 'graveyard';
  const seen = new Set<string>();
  for (const id of objectsInZone(state, zone)) {
    if (id === ctx.excluded) continue;
    const obj = state.objects[id];
    if (obj === undefined || !matchesFilter(state, obj, filter, ctx)) continue;
    for (const type of derive(state, obj).types) seen.add(type);
  }
  return seen.size;
}

/** The value a player has for "more life / cards in hand / creatures than you" (D-131). */
export function playerStatOf(state: GameState, seat: SeatId, stat: PlayerStat): number {
  const s = getSeat(state, seat);
  if (stat === 'life') return s.life;
  if (stat === 'cardsInHand') return s.hand.length;
  const wanted = stat === 'lands' ? 'land' : 'creature';
  let creatures = 0;
  for (const id of objectsInZone(state, 'battlefield')) {
    const obj = state.objects[id];
    if (
      obj !== undefined &&
      controllerOf(state, obj) === seat &&
      derive(state, obj).types.includes(wanted)
    )
      creatures += 1;
  }
  return creatures;
}

/** The opponents of `seat` still in the game whose stat is greater than `seat`'s (D-131). */
export function opponentsWithMore(
  state: GameState,
  seat: SeatId,
  stat: PlayerStat,
  /** D-626: count the opponents whose stat is less than `seat`'s instead. */
  fewer = false,
): number {
  const mine = playerStatOf(state, seat, stat);
  return opponentsOf(state, seat).filter((o) =>
    fewer ? playerStatOf(state, o, stat) < mine : playerStatOf(state, o, stat) > mine,
  ).length;
}

/**
 * The number an amount stands for. `targets` are the resolving object's targets that are still
 * legal, so `of: target` reads what the player chose. A value read from an object uses its current
 * information while it is where the effect expected it, and last-known information once it left
 * or the effect moved it (CR 608.2h, 113.7a): "Its controller gains life equal to its power" after
 * the creature was exiled gives the power it last had.
 */
export function amountOf(
  state: GameState,
  amount: Amount,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): number {
  if (typeof amount === 'number') return amount;
  if (amount.kind === 'lifeGainedThisTurn')
    return state.turnLog.lifeGainedTotal[ctx.controller] ?? 0;
  if (amount.kind === 'enteredThisTurn' || amount.kind === 'diedThisTurn') {
    return historyCount(state, amount, ctx.controller);
  }
  // CR 603.10a, 113.7a (D-654): the Auras the controller controlled that were attached to the permanent the trigger is about, as it left.
  if (amount.kind === 'aurasAttachedToTriggerSubject') {
    const left = ctx.triggerSubject === undefined ? undefined : state.lki[ctx.triggerSubject];
    return (left?.auras ?? []).filter((a) => a.controller === ctx.controller).length;
  }
  if (amount.kind === 'lifeTotalOf') {
    const seat = resolvePlayers(state, amount.player, ctx, targets)[0];
    return seat === undefined ? 0 : getSeat(state, seat).life;
  }
  if (amount.kind === 'enteredX') {
    // CR 107.3m, 107.3g (Hylda group 3): the X of the spell the permanent resolved from, which the permanent remembers (`GameObject.castX`), or last-known information
    // when it has left; a permanent that was not cast has none.
    const source = ctx.source === null ? null : objectOrLki(state, ctx.source);
    return source?.castX ?? 0;
  }
  // CR 706.2 (Galadriel group 3): "where X is the result": the natural result of the die rolled earlier in this resolution (0 when none was: `validateCard` forbids that).
  if (amount.kind === 'dieResult') return ctx.dieResult ?? 0;
  if (amount.kind === 'x') {
    // CR 107.3a: the X announced for the spell or ability on the stack; 0 anywhere else (CR 107.3g).
    if (ctx.x !== undefined) return ctx.x;
    const x = ctx.source === null ? null : (state.objects[ctx.source]?.stack?.x ?? null);
    return x ?? 0;
  }

  // D-095: "for each creature on the battlefield": counted now, as the instruction runs.
  if (amount.kind === 'countOf') {
    // CR 109.4, 608.2c (Hylda group 3): "for each tapped creature target opponent controls": the player is a target, read now, with the targets.
    const controlled = amount.filter.controlledBy;
    const owner = amount.filter.owner;
    const filterContext = {
      ...ctx,
      ...(controlled === undefined
        ? {}
        : { controllers: resolvePlayers(state, controlled, ctx, targets) }),
      ...(owner === undefined ? {} : { owners: resolvePlayers(state, owner, ctx, targets) }),
    };
    return countMatching(state, amount.filter, filterContext);
  }
  // D-120: "the total life lost this way": what the earlier `loseLife` of this resolution made players lose.
  if (amount.kind === 'lifeLostThisWay') return ctx.lifeLost ?? 0;
  // D-365: "the life that player lost this turn" is read for each player the `loseLife` effect affects (`lifeAmountFor`), never here: `validateCard` allows it
  // only as the whole amount of that effect, so this is not reached for a card.
  if (amount.kind === 'lifeLostThisTurn') return 0;
  // CR 402.1: "the number of cards in that player's hand" is read for each player the `dealDamage` effect hurts (`runDealDamage`), never here: `validateCard` allows it only
  // as the whole amount of that effect.
  if (amount.kind === 'cardsInHandOfAffected') return 0;
  // D-194: "the number of profit votes": the players who voted for that option in the vote of this resolution (CR 701.38a).
  if (amount.kind === 'votesFor') return ctx.votes?.[amount.option] ?? 0;
  // D-133: "that much" for the damage that caused the trigger (CR 120.3).
  if (amount.kind === 'triggerDamage') return ctx.triggerDamage ?? 0;
  if (amount.kind === 'triggerTargetCount') return ctx.triggerTargetCount ?? 0;
  // D-110: "for each time it was kicked": the source's own count, or what its last-known information says.
  if (amount.kind === 'timesKicked') {
    return ctx.source === null ? 0 : timesKickedOf(objectOrLki(state, ctx.source));
  }
  // D-183: "the amount of mana spent to cast it": the spell that is the source (a `castSpell` trigger with `self`), as it is or as it last was.
  if (amount.kind === 'manaSpent') {
    // D-217 (CR 113.7a): "the amount of mana spent to cast that spell": the spell the ability targeted, as it last was once countered.
    if (amount.of !== undefined) {
      // D-646 (CR 601.2h, 113.7a): the spell that caused the trigger, as it is or as it last was.
      if (amount.of.kind === 'triggerSubject') {
        const id = ctx.triggerSubject;
        return manaSpentOf(
          id === undefined ? null : objectOrLki(state, id),
          amount.fromType,
          amount.snow === true,
          amount.colors === true,
        );
      }
      const slot = amount.of.id;
      const chosen = targets.find((t) => t.specId === slot);
      const spell = chosen?.kind === 'object' ? objectOrLki(state, chosen.id) : null;
      return manaSpentOf(spell, amount.fromType, amount.snow === true, amount.colors === true);
    }
    return ctx.source === null
      ? 0
      : manaSpentOf(
          objectOrLki(state, ctx.source),
          amount.fromType,
          amount.snow === true,
          amount.colors === true,
        );
  }
  // D-131: arithmetic on other amounts. Each is read as the instruction runs, like the amounts it is made of.
  if (amount.kind === 'half') {
    const n = amountOf(state, amount.of, ctx, targets);
    return amount.round === 'down' ? Math.floor(n / 2) : Math.ceil(n / 2);
  }
  // D-321, CR 107.1b: a negative result of a calculation counts as 0.
  if (amount.kind === 'minus') {
    return Math.max(0, amountOf(state, amount.of, ctx, targets) - amount.by);
  }
  if (amount.kind === 'multiple') return amount.factor * amountOf(state, amount.of, ctx, targets);
  if (amount.kind === 'sum') {
    return amount.of.reduce<number>((n, part) => n + amountOf(state, part, ctx, targets), 0);
  }
  if (amount.kind === 'extreme') {
    const values = amount.of.map((part) => amountOf(state, part, ctx, targets));
    return amount.pick === 'greater' ? Math.max(...values) : Math.min(...values);
  }
  // D-151: written into a delayed trigger as it is created; a card that still has it is read as nothing.
  if (amount.kind === 'exiledStillThere') return 0;
  // D-131: what the game says now (toughness, counters, greatest or total of a stat, devotion, ...).
  if (isStateAmount(amount)) return stateAmountOf(state, amount, ctx, targets);
  // D-151: "the difference": the limit less the mana value of the card, nothing when there is no card.
  if (amount.kind === 'shortfall') {
    if (resolveObjects(state, amount.of, ctx, targets)[0] === undefined) return 0;
    return Math.max(
      0,
      amount.limit - amountOf(state, { kind: 'manaValueOf', of: amount.of }, ctx, targets),
    );
  }
  const id = resolveObjects(state, amount.of, ctx, targets)[0];
  if (id === undefined) return 0;
  const live = state.objects[id];
  if (amount.kind === 'powerOf') {
    if (live) return derive(state, live).power ?? 0;
    return state.lki[id]?.power ?? 0;
  }
  // manaValueOf: CR 202.3. An {X} counts as the number announced while the object is a spell on the
  // stack and as 0 anywhere else (CR 202.3e); a spell that left the stack counts it from its
  // last-known information (CR 608.2h), which keeps the object as it was on the stack.
  const cost = live
    ? derive(state, live).manaCost
    : (state.lki[id]?.characteristics.manaCost ?? null);
  return manaValueOfCost(cost, live ?? state.lki[id]?.object);
}

export function stateAmountOf(
  state: GameState,
  amount: StateAmount,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): number {
  switch (amount.kind) {
    case 'toughnessOf': {
      const id = resolveObjects(state, amount.of, ctx, targets)[0];
      if (id === undefined) return 0;
      const live = state.objects[id];
      const toughness = live ? derive(state, live).toughness : state.lki[id]?.toughness;
      return Math.max(0, toughness ?? 0);
    }
    case 'countersOn': {
      const id = resolveObjects(state, amount.of, ctx, targets)[0];
      if (id === undefined) return 0;
      // CR 113.7a: an object that left the battlefield is read as it last existed.
      const obj = state.objects[id] ?? state.lki[id]?.object;
      return obj?.counters[amount.counter] ?? 0;
    }
    case 'aggregate':
      return aggregateOf(state, amount, ctx);
    case 'cardTypesAmong':
      return cardTypesAmongOf(state, amount.filter, ctx);
    case 'devotion':
      return devotionOf(state, ctx.controller, amount.colors);
    case 'commanderColors':
      return commanderIdentity(state, ctx.controller).length;
    case 'commanderManaValue':
      return commandersManaValue(state, ctx.controller);
    case 'commanderCasts': {
      if (amount.player !== undefined) {
        // CR 903.8: the player the selector names ("target player ... they've cast").
        const seat = resolvePlayers(state, amount.player, ctx, targets)[0];
        return seat === undefined ? 0 : commandersCastCount(state, seat);
      }
      if (amount.of !== 'triggerSubject') return commandersCastCount(state, ctx.controller);
      // D-229: the commander the event is about: the times this card was cast from the command zone.
      const subject =
        ctx.triggerSubject === undefined ? null : objectOrLki(state, ctx.triggerSubject);
      return subject?.card == null ? 0 : (state.commanderCasts[subject.card] ?? 0);
    }
    case 'thisWay':
      return ctx.thisWay?.[amount.what] ?? 0;
    case 'opponentsWithMore':
      return opponentsWithMore(state, ctx.controller, amount.stat, amount.fewer === true);
    case 'opponentCount':
      // CR 102.2, 102.3: the opponents of the controller still in the game.
      return opponentsOf(state, ctx.controller).length;
    case 'cardsStillExiled':
      // CR 400.7: a card that left exile is a new object, so only the very objects still there count.
      return amount.objects.filter((id) => state.objects[id]?.zone === 'exile').length;
    case 'cardsDrawnThisTurn':
      // CR 121.1 (D-450): "for each card you've drawn this turn": the cards the controller of the effect has drawn so far this turn (`SeatState.cardsDrawnThisTurn`).
      return getSeat(state, ctx.controller).cardsDrawnThisTurn;
    case 'spellsCastThisTurn': {
      // CR 601.2i (D-638): the spells the controller has cast this turn (a copy is not cast, CR 707.10); `ofTypes` keeps those with one of the card types they were cast with.
      const types = amount.ofTypes;
      if (types === undefined) return getSeat(state, ctx.controller).spellsCastThisTurn;
      return state.turnLog.castSpells.filter(
        (s) => s.seat === ctx.controller && s.types.some((t) => types.includes(t)),
      ).length;
    }
    case 'greatestManaValueCast': {
      // CR 202.3, 202.3e, 601.2i (D-646): the greatest mana value among the spells the controller has cast this turn (copies are not cast, CR 707.10), each as it was cast.
      const types = amount.ofTypes;
      let best = 0;
      for (const s of state.turnLog.castSpells) {
        if (s.seat !== ctx.controller) continue;
        if (types !== undefined && !s.types.some((t) => types.includes(t))) continue;
        best = Math.max(best, s.manaValue);
      }
      return best;
    }
    case 'sacrificedAsCost': {
      // CR 602.2b, 701.21a (D-584): "for each artifact sacrificed this way" in an activated ability whose cost sacrificed one or more permanents: the ability on the stack carries
      // them, and its resolution reads them (`ResolutionContext.costSacrificed`, which an ability without such a cost does not have).
      if (ctx.costSacrificed !== undefined) return ctx.costSacrificed.length;
      // CR 118.8, 701.21a (D-491): "for each creature sacrificed this way": the permanents sacrificed to pay the additional cost of the spell that is the source, read from the spell
      // or, once it has left the stack, from its last-known information (CR 113.7a).
      const source = ctx.source === null ? null : objectOrLki(state, ctx.source);
      return source?.stack?.sacrificedAsCost?.length ?? 0;
    }
    case 'exiledAsCost': {
      const source = ctx.source === null ? null : objectOrLki(state, ctx.source);
      return source?.stack?.exiledAsCost?.length ?? 0;
    }
    default: {
      const unreachable: never = amount;
      return unreachable;
    }
  }
}
