/**
 * Evaluating a `Condition` (see ast/types.ts) against the game as it is now. A condition is read
 * by the player who controls the thing that asks, so "you control" means that player's permanents.
 */
import type { Condition } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import { getObject, getSeat, objectsInZone, opponentsOf } from '../state/ops';
import type { ChosenTarget, GameState, ThisWayCounts } from '../state/types';
import { amountOf, playerStatOf, statOf } from './amounts';
import { chosenOf } from './chosen';
import {
  cardsInGraveyardHolds,
  controlsCommander,
  enteredThisTurnHolds,
  lifeGainedThisTurnHolds,
  lifeTotalHolds,
  playerDealtDamageHolds,
} from './condition-reads';
import { controlledSince, controllerOf } from './control';
import { derive } from './derive';
import { manaSpentOf } from './mana-spent';
import { ringBearerOf } from './ring-bearer';
import { matchesFilter, resolveObjects, resolvePlayers } from './select';
import { objectOrLki } from './source-info';

/** CR 702.105a (D-151): `source` is attacking a player with the most life or tied for the most among the players still in the game. */
function attackingMostLife(state: GameState, source: ObjectId | null): boolean {
  if (source === null) return false;
  const entry = state.combat?.attackers.find((a) => a.object === source);
  if (entry === undefined || entry.target.kind !== 'player') return false;
  const target = getSeat(state, entry.target.seat);
  if (target.hasLost) return false;
  return state.seats.every((s) => s.hasLost || s.life <= target.life);
}

/** D-151 (Pack tactics): the total power of the creatures `seat` has attacking, as the layers make it (CR 613). */
function attackersTotalPower(state: GameState, seat: SeatId): number {
  let total = 0;
  for (const a of state.combat?.attackers ?? []) {
    const obj = state.objects[a.object];
    if (obj === undefined || obj.zone !== 'battlefield' || controllerOf(state, obj) !== seat)
      continue;
    total += derive(state, obj).power ?? 0;
  }
  return total;
}

export interface ConditionContext {
  /** Whose "you": the controller of the permanent that is entering (CR 614.12). */
  readonly controller: SeatId;
  /**
   * The permanent the condition belongs to, which "other" leaves out and `kicked` reads; for a
   * spell's own effect, the spell on the stack. Null when there is none.
   */
  readonly source: ObjectId | null;
  /**
   * The object whose event caused the triggered ability this condition belongs to (`subjectGreaterPt`,
   * D-120): the creature that entered. Absent where there is none, which fails that condition closed.
   */
  readonly triggerSubject?: ObjectId;
  /** The player the event of the trigger is about (`triggerPlayerHasMore`): the active player of a step trigger, the player who drew, who cast, ... */
  readonly triggerPlayer?: SeatId;
  /**
   * What the resolving effect knows (D-135), for `objectMatches` and `didPrevious`: the targets still legal, what the earlier
   * move effect produced (`moved`) and how much the instructions since the last `may` effect did (`performed`). Absent
   * outside a resolving `conditional` effect, where those conditions are refused by `validateCard`.
   */
  readonly targets?: readonly ChosenTarget[];
  readonly moved?: readonly ObjectId[];
  readonly performed?: number;
  /** What the earlier instructions of this resolution did, for `thisWayAtLeast` (D-210). */
  readonly thisWay?: ThisWayCounts;
  /** For `attackersAttackedYou` (D-149): the players the creatures of the trigger's attack event were declared as attacking. */
  readonly triggerAttacked?: readonly SeatId[];
  /**
   * Whether to assume a target the spell has not chosen yet could satisfy `spellTargets` (D-207): the question "may this spell be cast at all?" asks it before any
   * target is chosen, so a reduction that depends on the target is counted; the cost as it is paid is determined after the targets, without this.
   */
  readonly spellTargetsMayHold?: boolean;
}

/**
 * The power and toughness of an object as it is now, or as it last was if it has left (CR 113.7a); null
 * for an object that is not known or has none (a noncreature permanent, CR 208.3).
 */
function ptNow(
  state: GameState,
  id: ObjectId,
): { readonly power: number; readonly toughness: number } | null {
  const live = state.objects[id];
  const d = live === undefined ? undefined : derive(state, live);
  const power = d === undefined ? state.lki[id]?.power : d.power;
  const toughness = d === undefined ? state.lki[id]?.toughness : d.toughness;
  return power === null || power === undefined || toughness === null || toughness === undefined
    ? null
    : { power, toughness };
}

export function evaluateCondition(
  state: GameState,
  condition: Condition,
  ctx: ConditionContext,
): boolean {
  switch (condition.kind) {
    case 'controlsAtLeast': {
      // "You control" counts the controller's permanents on the battlefield; a permanent that is
      // still entering is not on the battlefield, so it never counts itself (CR 614.12).
      const filter = {
        ...condition.filter,
        zone: 'battlefield' as const,
        controller: 'you' as const,
      };
      let count = 0;
      for (const id of objectsInZone(state, 'battlefield')) {
        if (matchesFilter(state, getObject(state, id), filter, ctx)) count += 1;
      }
      return count >= condition.count;
    }
    case 'opponentsAtLeast':
      return opponentsOf(state, ctx.controller).length >= condition.count;
    case 'kicked': {
      // CR 702.33d: a spell that is resolving carries the fact on the stack; a permanent that
      // entered from a kicked spell keeps it (`GameObject.kicked`). Once either has left, its
      // last-known information says (CR 113.7a), which also covers a replacement as it enters.
      const source = ctx.source === null ? null : objectOrLki(state, ctx.source);
      return source !== null && (source.stack?.kicked === true || source.kicked === true);
    }
    case 'replicated': {
      // CR 702.56a (D-129): "if a replicate cost was paid for it": the spell carries the count on the stack, or its
      // last-known information does once it has left (CR 113.7a), as the trigger resolves after the spell was countered.
      const source = ctx.source === null ? null : objectOrLki(state, ctx.source);
      return source !== null && (source.stack?.replicated ?? 0) > 0;
    }
    case 'escaped': {
      // CR 702.138b: a spell that is resolving was cast from a graveyard with an escape ability (the fact is on
      // the stack), and a permanent that came from such a spell remembers it (`GameObject.alt`); last-known
      // information says once it has left (CR 113.7a), which also covers a replacement as it enters.
      const source = ctx.source === null ? null : objectOrLki(state, ctx.source);
      return source !== null && (source.stack?.alt === 'escape' || source.alt === 'escape');
    }
    case 'cameUnderControlSinceLastUpkeep': {
      // CR 702.30a (Echo, D-127): "if this permanent came under your control since the beginning of your last
      // upkeep". The permanent's timestamp is when it came under its current controller's control (CR 302.6, set as
      // a permanent enters), and the controller's previous turn began right before its upkeep (CR 502.4). One that
      // is not on the battlefield under that player's control any more (it left or was exchanged for another
      // object, CR 400.7) fails the check, so the ability is removed as it resolves (CR 603.4).
      const source = ctx.source === null ? undefined : state.objects[ctx.source];
      if (source?.zone !== 'battlefield' || controllerOf(state, source) !== ctx.controller)
        return false;
      return (
        controlledSince(state, source) > getSeat(state, ctx.controller).previousTurnStartTimestamp
      );
    }
    case 'sourceHasCounter': {
      // CR 603.10a, 113.7a: "if it had no -1/-1 counters on it" reads the permanent as it last existed
      // once it has left (Persist, Undying), as it is now while it is still on the battlefield.
      const source = ctx.source === null ? null : objectOrLki(state, ctx.source);
      return source !== null && (source.counters[condition.counter] ?? 0) > 0;
    }
    case 'subjectGreaterPt': {
      // CR 702.100a, 702.100c: that creature's power is greater and/or its toughness is greater than the
      // source's; a source with no power or toughness is not exceeded by anything.
      if (ctx.source === null || ctx.triggerSubject === undefined) return false;
      const subject = ptNow(state, ctx.triggerSubject);
      const source = ptNow(state, ctx.source);
      if (subject === null || source === null) return false;
      return subject.power > source.power || subject.toughness > source.toughness;
    }
    case 'controlCommander':
      // CR 903.3d: "controlling a commander" is a permanent on the battlefield that is a commander
      // (a card designated as one, CR 903.3: a token, or a permanent copying a commander, is not).
      return controlsCommander(state, ctx.controller, condition);
    case 'lifeTotal':
      // D-133, CR 119.1: the controller's life total, or its difference from the starting life total.
      return lifeTotalHolds(state, ctx.controller, condition);
    case 'thisMatches': {
      // D-133: the permanent the condition belongs to, as it is now or as it last was (CR 113.7a), against the filter.
      const source = ctx.source === null ? null : objectOrLki(state, ctx.source);
      return (
        source !== null &&
        matchesFilter(
          state,
          source,
          { ...condition.filter, zone: source.zone },
          {
            controller: ctx.controller,
            source: ctx.source,
          },
        )
      );
    }
    case 'thisWayAtLeast':
      // D-210 (CR 608.2c): "if a creature card was discarded this way": what the effects before this one did.
      return (ctx.thisWay?.[condition.what] ?? 0) >= condition.count;
    case 'didPrevious':
      // CR 603.12, 608.2c (D-135; Learn, CR 701.48a, reads the same way): "if you do": the nearest `may` effect before this was accepted and did something.
      return (ctx.performed ?? 0) > 0;
    case 'objectMatches': {
      // D-135, CR 113.7a, 608.2h: the object the reference names, as it is or as it last was (a card an earlier instruction
      // moved is read as it was when it left), against the filter in whatever zone it was in.
      const [id] = resolveObjects(
        state,
        condition.of,
        {
          controller: ctx.controller,
          source: ctx.source,
          ...(ctx.moved === undefined ? {} : { moved: ctx.moved }),
          ...(ctx.triggerSubject === undefined ? {} : { triggerSubject: ctx.triggerSubject }),
        },
        ctx.targets ?? [],
      );
      const named = id === undefined ? null : objectOrLki(state, id);
      return (
        named !== null &&
        matchesFilter(
          state,
          named,
          { ...condition.filter, zone: named.zone },
          { controller: ctx.controller, source: ctx.source },
        )
      );
    }
    case 'giftPromised': {
      // CR 702.174k (D-135): the spell carries the chosen player on the stack, the permanent that came from it remembers
      // it, and last-known information says once either has left (CR 113.7a), as `kicked` does.
      const source = ctx.source === null ? null : objectOrLki(state, ctx.source);
      return source !== null && (source.stack?.giftTo !== undefined || source.giftTo !== undefined);
    }
    case 'opponentControlsAtLeast': {
      // D-135: some one opponent controls at least `count` battlefield permanents that match, as "you" is that opponent.
      return opponentsOf(state, ctx.controller).some((opponent) => {
        const filter = {
          ...condition.filter,
          zone: 'battlefield' as const,
          controller: 'you' as const,
        };
        let count = 0;
        for (const id of objectsInZone(state, 'battlefield')) {
          if (
            matchesFilter(state, getObject(state, id), filter, {
              controller: opponent,
              source: ctx.source,
            })
          ) {
            count += 1;
          }
        }
        return count >= condition.count;
      });
    }
    case 'controlsGreatest': {
      // D-139: among the permanents that match, the largest value of the stat; the condition's controller controls one that
      // has it (a tie counts for each tied permanent). A permanent with no such stat is left out.
      const everyone = {
        ...condition.filter,
        zone: 'battlefield' as const,
        controller: 'any' as const,
      };
      const valued: { controller: SeatId; value: number }[] = [];
      for (const id of objectsInZone(state, 'battlefield')) {
        const obj = getObject(state, id);
        if (!matchesFilter(state, obj, everyone, ctx)) continue;
        const value = statOf(state, id, condition.stat);
        if (value !== null) valued.push({ controller: controllerOf(state, obj), value });
      }
      if (valued.length === 0) return false;
      const top = Math.max(...valued.map((v) => v.value));
      return valued.some((v) => v.value === top && v.controller === ctx.controller);
    }
    case 'amountIs': {
      // D-131: any state-reading amount against a number, as it is now (the validator allows only amounts that need
      // no target, X, trigger subject or earlier instruction).
      const n = amountOf(
        state,
        condition.amount,
        { controller: ctx.controller, source: ctx.source },
        [],
      );
      if (condition.compare.cmp === 'atLeast') return n >= condition.compare.value;
      if (condition.compare.cmp === 'atMost') return n <= condition.compare.value;
      return n === condition.compare.value;
    }
    case 'classLevelIs':
      // CR 716.2a, 716.2d (D-235): the level of the permanent the ability belongs to; none is level 1.
      return (
        (ctx.source === null ? 1 : (state.objects[ctx.source]?.level ?? 1)) === condition.level
      );
    case 'playerHasDesignation': {
      // D-131, CR 725: whether the holder of the designation is one of the players the selector names. Nobody has
      // it until an effect gives it (CR 725.1).
      const holder = state.monarch;
      if (holder === null) return false;
      // (The validator lets a condition name only players that need neither a target nor the trigger subject.)
      const named = resolvePlayers(
        state,
        condition.player,
        { controller: ctx.controller, source: ctx.source },
        [],
      );
      return named.includes(holder);
    }
    case 'ownTurnNumber': {
      // CR 500.1 (D-149): the controller's own turn, and how many turns they have had (this one included).
      if (state.turn.activeSeat !== ctx.controller) return false;
      const turns = getSeat(state, ctx.controller).turnsTaken;
      if (condition.compare.cmp === 'atLeast') return turns >= condition.compare.value;
      if (condition.compare.cmp === 'atMost') return turns <= condition.compare.value;
      return turns === condition.compare.value;
    }
    case 'sameNameAtLeast': {
      // D-149: some name shared by `count` permanents the controller controls that match the filter.
      const filter = {
        ...condition.filter,
        zone: 'battlefield' as const,
        controller: 'you' as const,
      };
      const byName = new Map<string, number>();
      for (const id of objectsInZone(state, 'battlefield')) {
        const obj = getObject(state, id);
        if (!matchesFilter(state, obj, filter, ctx)) continue;
        const name = derive(state, obj).name;
        byName.set(name, (byName.get(name) ?? 0) + 1);
      }
      return [...byName.values()].some((n) => n >= condition.count);
    }
    case 'attackersAttackedYou':
      // CR 508.1b (D-149): read from the declaration of the attack event this trigger came from.
      return (ctx.triggerAttacked ?? []).includes(ctx.controller);
    case 'duringStep':
      // CR 500.1, 506.1 (D-139): the game is in this step of a combat phase now.
      return state.turn.step === condition.step;
    case 'cardLeftYourGraveyard':
      // CR 400.7 (D-206): the turn log, read now.
      return state.turnLog.leftGraveyard.includes(ctx.controller);
    case 'manaSpentAtLeast': {
      // CR 601.2h (D-206): the spell that caused the cast trigger, as it is on the stack.
      const spell =
        ctx.triggerSubject === undefined ? null : objectOrLki(state, ctx.triggerSubject);
      return manaSpentOf(spell) >= condition.count;
    }
    case 'spellTargets': {
      if (ctx.spellTargetsMayHold === true) return true;
      // CR 601.2c, 601.2f (D-207): a target the source spell chose that the filter matches.
      const spell = ctx.source === null ? null : objectOrLki(state, ctx.source);
      return (spell?.stack?.chosenTargets ?? []).some((t) => {
        if (t.kind !== 'object') return false;
        const target = objectOrLki(state, t.id);
        return (
          target !== null &&
          matchesFilter(state, target, condition.filter, {
            controller: ctx.controller,
            source: ctx.source,
          })
        );
      });
    }
    case 'castFromZone': {
      // CR 601.2a (D-206): the zone the source spell was cast from, read from its last-known information when it has left the stack.
      const spell = ctx.source === null ? null : objectOrLki(state, ctx.source);
      return spell?.stack?.castFrom === condition.zone;
    }
    case 'yourTurn':
      // CR 611.3a, 613.8 (D-206): it is a turn of the controller.
      return state.turn.activeSeat === ctx.controller;
    case 'yourMainPhase':
      // CR 505.1 (D-187): the precombat main phase or the postcombat main phase, of a turn of the controller.
      return (
        state.turn.activeSeat === ctx.controller &&
        (state.turn.phase === 'precombatMain' || state.turn.phase === 'postcombatMain')
      );
    case 'chosenOption':
      // CR 607.2d, 614.12a (D-151): the option the source chose as it entered; read from last-known information once it has left (CR 113.7a).
      return chosenOf(state, ctx.source)?.option === condition.option;
    case 'attackingMostLife':
      // CR 702.105a (D-151): the source is attacking a player whose life total is not less than any other player's.
      return attackingMostLife(state, ctx.source);
    case 'attackersTotalPower':
      // D-151 (Pack tactics): the total power of the creatures the controller has attacking.
      return attackersTotalPower(state, ctx.controller) >= condition.atLeast;
    case 'enteredThisTurn':
      // D-151: permanents that entered under the controller's control this turn (Celebration).
      return enteredThisTurnHolds(state, ctx.controller, condition);
    case 'cardsInGraveyard':
      return cardsInGraveyardHolds(state, ctx.controller, condition.compare);
    case 'playerDealtDamage':
      // D-151, CR 120.3: the damage dealt to the controller, or to an opponent, this turn.
      return playerDealtDamageHolds(state, ctx.controller, condition);
    case 'lifeGainedThisTurn':
      // D-252, CR 119.3: the life the controller has gained this turn, from the turn log.
      return lifeGainedThisTurnHolds(state, ctx.controller, condition);
    case 'controlsRingBearer':
      // CR 701.54e (D-196): a creature on the battlefield under the controller's control with their Ring-bearer designation.
      return ringBearerOf(state, ctx.controller) !== null;
    case 'subjectControllerHasMore': {
      // CR 603.4, 109.4 (D-229): "that player", the controller of the land that entered, has more of the stat than the controller of the ability.
      if (ctx.triggerSubject === undefined) return false;
      const subject = objectOrLki(state, ctx.triggerSubject);
      if (subject === null) return false;
      const them = controllerOf(state, subject);
      return (
        playerStatOf(state, them, condition.stat) >
        playerStatOf(state, ctx.controller, condition.stat)
      );
    }
    case 'triggerPlayerHasMore':
      // CR 603.4, 110.2: "that player", the player the event is about, has more of the stat than the controller of the ability.
      return (
        ctx.triggerPlayer !== undefined &&
        playerStatOf(state, ctx.triggerPlayer, condition.stat) >
          playerStatOf(state, ctx.controller, condition.stat)
      );
    case 'and':
      return condition.terms.every((t) => evaluateCondition(state, t, ctx));
    case 'or':
      return condition.terms.some((t) => evaluateCondition(state, t, ctx));
    case 'not':
      return !evaluateCondition(state, condition.term, ctx);
    default: {
      const unreachable: never = condition;
      return unreachable;
    }
  }
}
