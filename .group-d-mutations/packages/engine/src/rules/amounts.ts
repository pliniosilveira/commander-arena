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
import type { Color } from '../characteristics';
import type { ObjectId, SeatId } from '../ids';
import { getSeat, objectsInZone, opponentsOf } from '../state/ops';
import type { ChosenTarget, GameObject, GameState } from '../state/types';
import { commanderIdentity } from './commander-identity';
import { controllerOf } from './control';
import { copiableValues } from './copiable';
import { derive } from './derive';
import { commandersCastCount, commandersManaValue } from './derive-count';
import { timesKickedOf } from './kicks';
import { manaSpentOf } from './mana-spent';
import { manaValueOfCost } from './mana-value';
import { countMatching, matchesFilter, resolveObjects, type SelectContext } from './select';
import { objectOrLki } from './source-info';

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
      | 'cardsStillExiled'
      | 'cardsDrawnThisTurn'
      | 'sacrificedAsCost';
  }
>;

/** History uses the event's controller and types, never the object's current zone or characteristics. */
export function historyCount(
  state: GameState,
  amount: Extract<Amount, { kind: 'enteredThisTurn' | 'diedThisTurn' }>,
  controller: SeatId,
): number {
  const entries = amount.kind === 'enteredThisTurn' ? state.turnLog.entered : state.turnLog.died;
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
    amount.kind === 'cardsStillExiled' ||
    amount.kind === 'cardsDrawnThisTurn' ||
    amount.kind === 'sacrificedAsCost'
  );
}

/**
 * CR 700.5: the mana symbols among `cost` that are one of `colors`. A hybrid symbol ({W/U}, {2/W}, {C/W}) or a
 * Phyrexian one ({W/P}) counts once for the colors it has among the set; a generic, colorless, snow or {X} symbol
 * counts for none (CR 700.5: "mana symbols of that color").
 */
export function devotionSymbols(cost: readonly string[] | null, colors: readonly Color[]): number {
  if (cost === null) return 0;
  let count = 0;
  for (const symbol of cost) {
    if (symbol.split('/').some((part) => (colors as readonly string[]).includes(part))) count += 1;
  }
  return count;
}

/**
 * CR 700.5, 700.5a: a player's devotion to the colors: the mana symbols in the mana costs of their permanents, after copy effects (the copiable values, CR 707.2)
 * and before any other effect. The mana cost a permanent has printed is not the one its mana value is calculated from when that is only "as though" (CR 202.3b:
 * the back face of a transformed permanent, CR 202.3c: a melded permanent, D-281): the combined face of a meld pair has no mana cost, so a melded permanent adds nothing.
 */
export function devotionOf(state: GameState, seat: SeatId, colors: readonly Color[]): number {
  let total = 0;
  for (const id of objectsInZone(state, 'battlefield')) {
    const obj = state.objects[id];
    if (obj === undefined || controllerOf(state, obj) !== seat) continue;
    total += devotionSymbols(devotionCostOf(state, obj), colors);
  }
  return total;
}

/** CR 700.5a: the mana cost a permanent counts for devotion, from its copiable values (after copy effects). Null for what has none. */
export function devotionCostOf(state: GameState, obj: GameObject): readonly string[] | null {
  if (obj.card === null && obj.token === null && obj.copyOf === undefined) return null;
  return copiableValues(state, obj).characteristics.manaCost;
}

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
export function opponentsWithMore(state: GameState, seat: SeatId, stat: PlayerStat): number {
  const mine = playerStatOf(state, seat, stat);
  return opponentsOf(state, seat).filter((o) => playerStatOf(state, o, stat) > mine).length;
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
  if (amount.kind === 'x') {
    // CR 107.3a: the X announced for the spell or ability on the stack; 0 anywhere else (CR 107.3g).
    if (ctx.x !== undefined) return ctx.x;
    const x = ctx.source === null ? null : (state.objects[ctx.source]?.stack?.x ?? null);
    return x ?? 0;
  }

  // D-095: "for each creature on the battlefield": counted now, as the instruction runs.
  if (amount.kind === 'countOf') return countMatching(state, amount.filter, ctx);
  // D-120: "the total life lost this way": what the earlier `loseLife` of this resolution made players lose.
  if (amount.kind === 'lifeLostThisWay') return ctx.lifeLost ?? 0;
  // D-365: "the life that player lost this turn" is read for each player the `loseLife` effect affects (`lifeAmountFor`), never here: `validateCard` allows it
  // only as the whole amount of that effect, so this is not reached for a card.
  if (amount.kind === 'lifeLostThisTurn') return 0;
  // D-194: "the number of profit votes": the players who voted for that option in the vote of this resolution (CR 701.38a).
  if (amount.kind === 'votesFor') return ctx.votes?.[amount.option] ?? 0;
  // D-133: "that much" for the damage that caused the trigger (CR 120.3).
  if (amount.kind === 'triggerDamage') return ctx.triggerDamage ?? 0;
  // D-110: "for each time it was kicked": the source's own count, or what its last-known information says.
  if (amount.kind === 'timesKicked') {
    return ctx.source === null ? 0 : timesKickedOf(objectOrLki(state, ctx.source));
  }
  // D-183: "the amount of mana spent to cast it": the spell that is the source (a `castSpell` trigger with `self`), as it is or as it last was.
  if (amount.kind === 'manaSpent') {
    // D-217 (CR 113.7a): "the amount of mana spent to cast that spell": the spell the ability targeted, as it last was once countered.
    if (amount.of !== undefined) {
      const slot = amount.of.id;
      const chosen = targets.find((t) => t.specId === slot);
      const spell = chosen?.kind === 'object' ? objectOrLki(state, chosen.id) : null;
      return manaSpentOf(spell, amount.fromType, amount.snow === true);
    }
    return ctx.source === null
      ? 0
      : manaSpentOf(objectOrLki(state, ctx.source), amount.fromType, amount.snow === true);
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
    case 'devotion':
      return devotionOf(state, ctx.controller, amount.colors);
    case 'commanderColors':
      return commanderIdentity(state, ctx.controller).length;
    case 'commanderManaValue':
      return commandersManaValue(state, ctx.controller);
    case 'commanderCasts': {
      if (amount.of !== 'triggerSubject') return commandersCastCount(state, ctx.controller);
      // D-229: the commander the event is about: the times this card was cast from the command zone.
      const subject =
        ctx.triggerSubject === undefined ? null : objectOrLki(state, ctx.triggerSubject);
      return subject?.card == null ? 0 : (state.commanderCasts[subject.card] ?? 0);
    }
    case 'thisWay':
      return ctx.thisWay?.[amount.what] ?? 0;
    case 'opponentsWithMore':
      return opponentsWithMore(state, ctx.controller, amount.stat);
    case 'cardsStillExiled':
      // CR 400.7: a card that left exile is a new object, so only the very objects still there count.
      return amount.objects.filter((id) => state.objects[id]?.zone === 'exile').length;
    case 'cardsDrawnThisTurn':
      // CR 121.1 (D-450): "for each card you've drawn this turn": the cards the controller of the effect has drawn so far this turn (`SeatState.cardsDrawnThisTurn`).
      return getSeat(state, ctx.controller).cardsDrawnThisTurn;
    case 'sacrificedAsCost': {
      // CR 118.8, 701.21a (D-491): "for each creature sacrificed this way": the permanents sacrificed to pay the additional cost of the spell that is the source, read from the spell
      // or, once it has left the stack, from its last-known information (CR 113.7a).
      const source = ctx.source === null ? null : objectOrLki(state, ctx.source);
      return source?.stack?.sacrificedAsCost?.length ?? 0;
    }
    default: {
      const unreachable: never = amount;
      return unreachable;
    }
  }
}
