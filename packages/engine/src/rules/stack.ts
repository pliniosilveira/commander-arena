/**
 * Resolving the top object of the stack (CR 405.5, 608).
 *
 * - CR 608.2b: targets are checked again; if every target is illegal the spell does not resolve
 *   ("fizzles"); if only some are, it resolves and does as much as possible without them.
 * - CR 608.2c-d: effects run in written order, one instruction at a time, so the engine can stop for
 *   a decision (CR 903.9b) and continue from the same place.
 * - CR 608.2m: a resolved instant or sorcery goes to its owner's graveyard; a permanent spell
 *   becomes a permanent (CR 608.3). An Adventure that resolves is exiled instead (CR 715.3d).
 */

import { overloadedText } from '../ast/overload';
import { isPermanentType } from '../characteristics';
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { getObject, getSeat } from '../state/ops';
import type { ChosenValues, GameState, Instruction, ResolutionContext } from '../state/types';
import { recordActionTaken } from './action-taken';
import { attachEntered, auraTargetSpec, ENCHANT_TARGET_ID } from './attach';
import { runCascade } from './cascade';
import { runCastCard } from './cast-card';
import { runCastExiled } from './cast-exiled';
import { runCastFree } from './cast-free';
import { giftEffectOf } from './cast-gift';
import { runChangeTarget } from './change-target';
import { evaluateCondition } from './conditions';
import { controllerOf } from './control';
import { runCopySpell } from './copy-spell';
import { derive } from './derive';
import { DASH_RETURN_ABILITY } from './derive-alt';
import { runInstruction } from './effects';
import { isAdventureSpell } from './layouts';
import { faceOf, targetSpecsOf } from './legality';
import { chosenEffect, modalOfObject } from './modes';
import { runPayAmount } from './pay-amount';
import type { ManualTap } from './pay-manual';
import {
  acceptUnless,
  declineUnless,
  discardUnless,
  payUnlessMana,
  runCounterUnlessPays,
  type UnlessAnswer,
} from './pay-unless';
import { stillLegalTargets } from './select';
import { setPending } from './set-pending';
import { collectTriggers } from './triggers';
import { moveObject } from './zones';

export interface ResolveOutcome {
  readonly state: GameState;
  readonly events: GameEvent[];
  /** True when resolution stopped to ask a decision and must be continued afterwards. */
  readonly paused: boolean;
}

export function resolveTop(input: GameState): ResolveOutcome {
  const id = input.stack[input.stack.length - 1];
  if (id === undefined) return { state: input, events: [], paused: false };
  const obj = getObject(input, id);
  const events: GameEvent[] = [];

  // CR 603.4: a triggered ability with an intervening "if" checks the condition again as it
  // resolves; if it is false then, the ability is removed from the stack and does nothing.
  const ability0 = obj.stack?.ability ?? null;
  if (
    ability0?.kind === 'triggered' &&
    ability0.interveningIf !== undefined &&
    !evaluateCondition(input, ability0.interveningIf, {
      controller: controllerOf(input, obj),
      source: obj.stack?.source ?? id,
      ...(obj.stack?.triggerSubject === undefined
        ? {}
        : { triggerSubject: obj.stack.triggerSubject }),
      ...(obj.stack?.triggerPlayer === undefined ? {} : { triggerPlayer: obj.stack.triggerPlayer }),
    })
  ) {
    events.push({ kind: 'fizzled', object: id, reason: 'interveningIf' });
    const removed = moveObject(input, { object: id, to: 'graveyard' });
    if (removed.kind === 'done') {
      return { state: removed.state, events: [...events, ...removed.events], paused: false };
    }
    return { state: input, events, paused: false };
  }

  const specs = targetSpecsOf(input, obj);
  const chosen = obj.stack?.chosenTargets ?? [];
  // For an ability, "this" is the permanent it belongs to, which may be gone (CR 113.7a, 608.2b).
  const ctx = {
    controller: controllerOf(input, obj),
    source: obj.stack?.source ?? id,
    // D-151: "target artifact that opponent controls" is read against the player of the event.
    ...(obj.stack?.triggerPlayer === undefined ? {} : { triggerPlayer: obj.stack.triggerPlayer }),
    // D-230: "mana value X or less, where X is the damage dealt" is read again as the ability resolves.
    ...(obj.stack?.triggerDamage === undefined ? {} : { triggerDamage: obj.stack.triggerDamage }),
  };
  const legal = stillLegalTargets(input, specs, chosen, ctx);

  if (specs.length > 0 && chosen.length > 0 && legal.length === 0) {
    // CR 608.2b: all targets are illegal, so the spell doesn't resolve.
    events.push({ kind: 'fizzled', object: id });
    const moved = moveObject(input, { object: id, to: 'graveyard' });
    if (moved.kind === 'done') {
      return { state: moved.state, events: [...events, ...moved.events], paused: false };
    }
    return { state: input, events, paused: false };
  }

  // CR 113.7a, 602.2a, 603.3: an ability on the stack has its own text, whatever became of its source.
  const ability = obj.stack?.ability ?? null;
  // A modal spell or ability runs the effects of the modes chosen for it, in printed order (CR 700.2, 608.2c).
  // CR 702.96a: a spell cast for its overload cost has the text with "each" for "target" (D-121).
  const printedText = faceOf(input, obj)?.spell;
  const spellText =
    obj.stack?.alt === 'overload' && ability === null ? overloadedText(printedText) : printedText;
  const modal = modalOfObject(obj, spellText);
  const effect =
    modal !== null
      ? chosenEffect(modal, obj.stack?.chosenModes ?? [])
      : ability
        ? ability.effect
        : spellText?.effect;
  // CR 702.174b, 702.174j (D-135): "If this spell's gift cost was paid, the chosen player draws a card", before every other
  // effect of an instant or sorcery. A permanent has the same effect as an enters trigger instead (`derive-keywords.ts`).
  const giftFirst = ability === null ? giftEffectOf(input, obj) : null;
  const withGift: typeof effect =
    giftFirst === null
      ? effect
      : { kind: 'sequence', effects: [giftFirst, ...(effect === undefined ? [] : [effect])] };
  const queue: Instruction[] = withGift ? [{ kind: 'effect', effect: withGift }] : [];
  // CR 603.5: "you may": the controller answers when the ability resolves, before anything else.
  if (ability?.kind === 'triggered' && ability.optional)
    queue.unshift({ kind: 'confirmOptional', answer: null });
  // CR 603.2h (D-256): "Do this only once each turn": the action is taken as the ability begins, or, with "you may", when it is accepted.
  const begun: GameState =
    ability?.kind === 'triggered' && ability.optional ? input : recordActionTaken(input, id);
  const state: GameState = {
    ...begun,
    resolution: {
      object: id,
      source: obj.stack?.source ?? id,
      controller: controllerOf(input, obj),
      queue,
      legalTargets: legal,
      ...(obj.stack?.triggerSubject === undefined
        ? {}
        : { triggerSubject: obj.stack.triggerSubject }),
      ...(obj.stack?.sacrificedAsCost === undefined
        ? {}
        : { costSacrificed: obj.stack.sacrificedAsCost }),
      ...(obj.stack?.sacrificedBefore === undefined
        ? {}
        : { sacrificed: obj.stack.sacrificedBefore }),
      ...(obj.stack?.exiledAsCost === undefined ? {} : { costExiled: obj.stack.exiledAsCost }),
      ...(obj.stack?.triggerCards === undefined ? {} : { triggerCards: obj.stack.triggerCards }),
      ...(obj.stack?.thisWayBefore === undefined ? {} : { thisWay: obj.stack.thisWayBefore }),
      ...(obj.stack?.triggerPlayer === undefined ? {} : { triggerPlayer: obj.stack.triggerPlayer }),
      ...(obj.stack?.triggerDamage === undefined ? {} : { triggerDamage: obj.stack.triggerDamage }),
      ...(obj.stack?.triggerAttacked === undefined
        ? {}
        : { triggerAttacked: obj.stack.triggerAttacked }),
    },
  };
  return continueResolution(state, events);
}

/** Runs the queue until it is empty or an instruction needs a decision. */
export function continueResolution(input: GameState, events: GameEvent[] = []): ResolveOutcome {
  let state = input;
  for (let guard = 0; guard < 100_000; guard += 1) {
    const res = state.resolution;
    if (!res) return { state, events, paused: false };
    const head = res.queue[0];
    if (head === undefined) return finish(state, events);
    // "Counter it unless its controller pays" needs the mana engine, which effects.ts cannot import
    // (the mana engine runs effects), so the stack runs that instruction itself. So does Cascade, which
    // asks whether the card found can be cast (`rules/legality.ts`, which reaches the mana engine too). Copying a spell
    // reads the target slots of the spell it copies (`rules/legality.ts` too).
    const out =
      head.kind === 'counterUnlessPays' || head.kind === 'unlessPays'
        ? runCounterUnlessPays(state, res, head)
        : head.kind === 'payAmount'
          ? runPayAmount(state, res, head) // D-151: "pay any amount of {R}" asks the mana engine, which this module may import
          : head.kind === 'cascade'
            ? runCascade(state, res, head)
            : head.kind === 'castExiled'
              ? runCastExiled(state, res, head)
              : head.kind === 'copySpell'
                ? runCopySpell(state, res, head)
                : head.kind === 'changeTarget'
                  ? runChangeTarget(state, res, head)
                  : head.kind === 'castFree'
                    ? runCastFree(state, res, head)
                    : head.kind === 'castCard'
                      ? runCastCard(state, res, head)
                      : runInstruction(state, res, head, res.legalTargets);
    if (out.needs) {
      // A player must answer (CR 903.9b, 608.2d, 603.5); the instruction stays at the head of the
      // queue. What triggered so far is noted now, because these events are not scanned again.
      return {
        state: setPending(collectTriggers(state, events), out.needs),
        events,
        paused: true,
      };
    }
    state = {
      ...out.state,
      resolution: {
        ...res,
        queue: [...out.front, ...res.queue.slice(1)],
        ...(out.lastMoved === undefined ? {} : { lastMoved: out.lastMoved }),
        // D-177: the permanents sacrificed, for "that creature's power" in the same resolution and in a reflexive ability.
        ...(out.sacrificed === undefined
          ? {}
          : { sacrificed: [...(res.sacrificed ?? []), ...out.sacrificed] }),
        ...(out.lifeLost === undefined ? {} : { lifeLost: (res.lifeLost ?? 0) + out.lifeLost }),
        // D-194: the tally of a vote that is finished, for "twice the number of profit votes" (a later vote of the resolution replaces it).
        ...(out.votes === undefined ? {} : { votes: out.votes }),
        // D-131: what this instruction did, for "for each creature sacrificed this way" and the like.
        ...(out.thisWay === undefined
          ? {}
          : {
              thisWay: {
                sacrificed: (res.thisWay?.sacrificed ?? 0) + (out.thisWay.sacrificed ?? 0),
                destroyed: (res.thisWay?.destroyed ?? 0) + (out.thisWay.destroyed ?? 0),
                exiledNonland: (res.thisWay?.exiledNonland ?? 0) + (out.thisWay.exiledNonland ?? 0),
                destroyedOwnNontoken:
                  (res.thisWay?.destroyedOwnNontoken ?? 0) +
                  (out.thisWay.destroyedOwnNontoken ?? 0),
                playersDrew: (res.thisWay?.playersDrew ?? 0) + (out.thisWay.playersDrew ?? 0),
                tapped: (res.thisWay?.tapped ?? 0) + (out.thisWay.tapped ?? 0),
                discarded: (res.thisWay?.discarded ?? 0) + (out.thisWay.discarded ?? 0),
                milledValue: (res.thisWay?.milledValue ?? 0) + (out.thisWay.milledValue ?? 0),
                discardedCreature:
                  (res.thisWay?.discardedCreature ?? 0) + (out.thisWay.discardedCreature ?? 0),
                discardedNoncreature:
                  (res.thisWay?.discardedNoncreature ?? 0) +
                  (out.thisWay.discardedNoncreature ?? 0),
                discardedInstantOrSorcery:
                  (res.thisWay?.discardedInstantOrSorcery ?? 0) +
                  (out.thisWay.discardedInstantOrSorcery ?? 0),
                discardedBy: [
                  ...new Set([
                    ...(res.thisWay?.discardedBy ?? []),
                    ...(out.thisWay.discardedBy ?? []),
                  ]),
                ],
              },
            }),
        // D-271: the die the instruction rolled, which "if the result is 1" of a later instruction reads (a later roll replaces it).
        ...(out.dieResult === undefined ? {} : { dieResult: out.dieResult }),
        // D-135: what the instruction did, for "if you do" and "when you do"; a `may` effect starts it again.
        ...(out.resetPerformed === true
          ? { performed: 0 }
          : out.performed === undefined
            ? {}
            : { performed: (res.performed ?? 0) + out.performed }),
        // An answer to "pay to enter untapped" or "choose a creature type" belongs to the one move that
        // asked for it.
        ...((head.kind === 'move' || head.kind === 'enterToken') && res.entersPaid != null
          ? { entersPaid: null }
          : {}),
        ...(head.kind === 'move' && res.entersChosen != null ? { entersChosen: null } : {}),
      },
    };
    // D-191: the answers to the replacement questions of the damage belong to the one instruction that asked them.
    if (state.resolution?.damageAnswers !== undefined) {
      const { damageAnswers: _answered, ...rest } = state.resolution;
      state = { ...state, resolution: rest };
    }
    if (
      (head.kind === 'move' || head.kind === 'enterToken') &&
      state.resolution?.entersCopy !== undefined
    ) {
      const { entersCopy: _answered, ...rest } = state.resolution;
      state = { ...state, resolution: rest };
    }
    // D-225: so does the card revealed for a land's "you may reveal a card".
    if (
      (head.kind === 'move' || head.kind === 'enterToken') &&
      state.resolution?.entersRevealed !== undefined
    ) {
      const { entersRevealed: _revealed, ...rest } = state.resolution;
      state = { ...state, resolution: rest };
    }
    // D-185: the answers of devour and riot belong to the one move that asked for them, too.
    if (
      head.kind === 'move' &&
      (state.resolution?.entersDevour !== undefined || state.resolution?.entersRiot !== undefined)
    ) {
      const { entersDevour: _devoured, entersRiot: _riot, ...rest } = state.resolution;
      state = { ...state, resolution: rest };
    }
    events.push(...out.events);
  }
  throw new Error('Resolution did not finish');
}

/** The object an Aura spell targeted, as it was still legal when the spell resolved (CR 608.2b). */
function enchantedHost(res: ResolutionContext): ObjectId | null {
  for (const t of res.legalTargets) {
    if (t.kind === 'object' && t.specId === ENCHANT_TARGET_ID) return t.id;
  }
  return null;
}

function finish(state: GameState, events: GameEvent[]): ResolveOutcome {
  const res = state.resolution;
  if (!res) return { state, events, paused: false };
  let next: GameState = { ...state, resolution: null };
  const obj = next.objects[res.object];
  // The spell may already have left the stack (for example it countered itself away).
  if (obj && obj.zone === 'stack') {
    const types = derive(next, obj).types;
    const permanent = types.some((t) => isPermanentType(t));
    // CR 608.3c: an Aura spell enters attached to the object it targeted (it fizzled before this
    // if that target was illegal, CR 608.3b). The spell's own text says what it targeted.
    const auraHost = auraTargetSpec(faceOf(next, obj)) === null ? null : enchantedHost(res);
    // CR 715.3d: a spell cast as an Adventure that resolves is exiled instead of going to the
    // graveyard; a countered or fizzled one never gets here (CR 715.4) and goes to the graveyard.
    const adventure = isAdventureSpell(next, obj);
    const moved = moveObject(next, {
      object: res.object,
      to: permanent ? 'battlefield' : adventure ? 'exile' : 'graveyard',
      // CR 400.3 (D-353): an instant or sorcery that resolves goes to its OWNER's graveyard, whoever cast it (a card cast from another player's graveyard); a
      // permanent enters under its controller's control (CR 110.2), and an Adventure is exiled for its caster (CR 715.3d).
      toSeat: permanent || adventure ? controllerOf(state, obj) : obj.owner,
      entersPaid: res.entersPaid ?? null,
      entersChosen: res.entersChosen ?? null,
      ...(res.entersCopy === undefined ? {} : { entersCopy: res.entersCopy }),
      ...(res.entersDevour === undefined ? {} : { entersDevour: res.entersDevour }),
      ...(res.entersRiot === undefined ? {} : { entersRiot: res.entersRiot }),
      ...(res.entersRevealed === undefined ? {} : { entersRevealed: res.entersRevealed }),
      ...(adventure ? { onAdventure: true as const } : {}),
    });
    if (moved.kind === 'done') {
      next = moved.state;
      events.push(...moved.events);
      if (auraHost !== null && moved.newObject !== null) {
        const attached = attachEntered(next, moved.newObject, auraHost);
        next = attached.state;
        events.push(...attached.events);
      }
      // CR 702.109a, 603.7 (D-121): a dash spell creates, as it resolves, the delayed triggered ability that
      // returns the permanent it became at the beginning of the next end step. It belongs to the spell's
      // controller (CR 603.7d) and names that permanent (CR 603.7c).
      if (obj.stack?.alt === 'dash' && moved.newObject !== null) {
        next = {
          ...next,
          delayedTriggers: [
            ...next.delayedTriggers,
            {
              source: moved.newObject,
              controller: controllerOf(state, obj),
              ability: DASH_RETURN_ABILITY,
            },
          ],
        };
      }
      events.push({ kind: 'resolved', object: res.object });
    } else if (
      moved.decision.kind === 'confirmOptional' ||
      moved.decision.kind === 'chooseOption' ||
      moved.decision.kind === 'choosePermanent'
    ) {
      // CR 614.12, 614.12a: the permanent asks as it enters; the resolution waits (still in `state`)
      // and finishes the move when the answer arrives.
      return {
        state: setPending(collectTriggers(state, events), moved.decision),
        events,
        paused: true,
      };
    }
  }
  return { state: next, events, paused: false };
}

/**
 * Records the answer to a choosePermanent decision on the instruction that asked (CR 608.2d), then
 * continues. The caller has checked the answer against the decision.
 */
export function answerResolutionChoice(
  state: GameState,
  chosen: readonly ObjectId[],
  players: readonly SeatId[] = [],
): ResolveOutcome | null {
  const res = state.resolution;
  const head = res?.queue[0];
  if (!res || head === undefined) return null;
  if (
    head.kind !== 'chooseSacrifice' &&
    head.kind !== 'chooseMove' &&
    head.kind !== 'chooseTap' &&
    head.kind !== 'fightPairs' &&
    head.kind !== 'proliferate' &&
    head.kind !== 'auraEntry' &&
    head.kind !== 'ringTempts' &&
    head.kind !== 'pair' &&
    head.kind !== 'empowerJace' &&
    head.kind !== 'amass' &&
    head.kind !== 'conniveNext' &&
    head.kind !== 'spare'
  ) {
    return null;
  }
  // CR 701.34a (D-149): a proliferate also names the players chosen.
  const updated: Instruction =
    head.kind === 'proliferate' ? { ...head, chosen, players } : { ...head, chosen };
  return continueResolution(
    { ...state, pending: null, resolution: { ...res, queue: [updated, ...res.queue.slice(1)] } },
    [],
  );
}

/**
 * Records the answer to a chooseCards decision (CR 701.23, 701.9) on the search, discard or put-on-top
 * instruction that asked, then continues. The caller has checked the answer against the decision.
 */
export function answerResolutionCards(
  state: GameState,
  chosen: readonly ObjectId[],
): ResolveOutcome | null {
  const res = state.resolution;
  const head = res?.queue[0];
  // Ward's discard (D-095): the payer chose the cards of the cost they accepted (rules/pay-unless.ts).
  if (
    res &&
    (head?.kind === 'counterUnlessPays' || head?.kind === 'unlessPays') &&
    head.stage === 'discard'
  ) {
    const d = state.pending;
    if (d?.kind !== 'chooseCards') return null;
    const answer = discardUnless(state, res, head, d.seat, chosen);
    return answer === null ? null : continueUnless(answer, res);
  }
  if (
    !res ||
    head === undefined ||
    (head.kind !== 'search' &&
      head.kind !== 'discard' &&
      head.kind !== 'putOnTop' &&
      head.kind !== 'lookTake' &&
      head.kind !== 'lookSplit' &&
      head.kind !== 'pileSeparate' &&
      head.kind !== 'castFree' &&
      head.kind !== 'behold' &&
      head.kind !== 'splitExiled' &&
      head.kind !== 'graveyardPair' &&
      head.kind !== 'copyFromCards' &&
      head.kind !== 'chooseMove')
  ) {
    return null;
  }
  const updated: Instruction = { ...head, chosen };
  return continueResolution(
    { ...state, pending: null, resolution: { ...res, queue: [updated, ...res.queue.slice(1)] } },
    [],
  );
}

/**
 * Records how many times the controller pays ("You may pay any amount of {R}", D-151) on the `payAmount` instruction that asked, then continues.
 * Null when no such question is pending.
 */
export function answerResolutionPayAmount(state: GameState, amount: number): ResolveOutcome | null {
  const res = state.resolution;
  const head = res?.queue[0];
  if (!res || (head?.kind !== 'payAmount' && head?.kind !== 'drawUpTo')) return null;
  const updated: Instruction = { ...head, amount };
  return continueResolution(
    { ...state, pending: null, resolution: { ...res, queue: [updated, ...res.queue.slice(1)] } },
    [],
  );
}

/**
 * Records the answer to an arrangeCards decision (CR 701.22, 701.25) on the arrange instruction that
 * asked, then continues. The caller has checked that every card looked at is placed exactly once.
 */
export function answerResolutionArrange(
  state: GameState,
  top: readonly ObjectId[],
  other: readonly ObjectId[],
): ResolveOutcome | null {
  const res = state.resolution;
  const head = res?.queue[0];
  if (!res || head === undefined || head.kind !== 'arrange') return null;
  const updated: Instruction = { ...head, arranged: { top, other } };
  return continueResolution(
    { ...state, pending: null, resolution: { ...res, queue: [updated, ...res.queue.slice(1)] } },
    [],
  );
}

/**
 * Records the answer to a "you may" (CR 603.5). Declining ends the ability: nothing else happens.
 */
export function answerResolutionOptional(state: GameState, accept: boolean): ResolveOutcome | null {
  const res = state.resolution;
  const head = res?.queue[0];
  if (!res || head === undefined) return null;
  if (head.kind === 'playerMay' || head.kind === 'miracleReveal') {
    // D-210: the player asked has answered; the instruction runs the effect (or what is done otherwise) next. D-274: so does the
    // player who drew a card with miracle, who is not always the controller of the resolving spell (CR 702.94a); declining the reveal
    // leaves no event, because the events are public and one would tell the opponent that the card drawn has miracle.
    const answered: Instruction = { ...head, answer: accept };
    return continueResolution(
      { ...state, pending: null, resolution: { ...res, queue: [answered, ...res.queue.slice(1)] } },
      head.kind === 'miracleReveal'
        ? []
        : [{ kind: 'optionalAnswered', seat: head.seat, source: res.source, accepted: accept }],
    );
  }
  if (
    head.kind !== 'confirmOptional' &&
    head.kind !== 'mayEffect' &&
    head.kind !== 'graveyardPair'
  ) {
    return null;
  }
  const events: GameEvent[] = [
    { kind: 'optionalAnswered', seat: res.controller, source: res.source, accepted: accept },
  ];
  // The ability's own "you may" ends the ability when declined (CR 603.5); one inside an effect
  // (`mayEffect`, D-111) only drops that effect.
  const queue: readonly Instruction[] = accept
    ? [{ ...head, answer: true }, ...res.queue.slice(1)]
    : head.kind === 'mayEffect' || head.kind === 'graveyardPair'
      ? res.queue.slice(1)
      : [];
  // CR 603.2h (D-256): accepting the ability's own "you may" takes the action of "Do this only once each turn".
  const answered =
    accept && head.kind === 'confirmOptional' ? recordActionTaken(state, res.object) : state;
  return continueResolution({ ...answered, pending: null, resolution: { ...res, queue } }, events);
}

/**
 * Records the answer to a "may search" (CR 608.2d, 701.23): the player who would search answered.
 * Accepting goes on to the search; declining ends it, with no put and no shuffle, and the rest of
 * the spell or ability goes on. Null when no such question is waiting.
 */
export function answerResolutionSearchMay(
  state: GameState,
  accept: boolean,
): ResolveOutcome | null {
  const res = state.resolution;
  const head = res?.queue[0];
  const d = state.pending;
  if (!res || head?.kind !== 'search' || head.accepted !== null || d?.kind !== 'confirmOptional') {
    return null;
  }
  const events: GameEvent[] = [
    { kind: 'optionalAnswered', seat: d.seat, source: res.source, accepted: accept },
  ];
  const queue: readonly Instruction[] = accept
    ? [{ ...head, accepted: true }, ...res.queue.slice(1)]
    : res.queue.slice(1);
  return continueResolution({ ...state, pending: null, resolution: { ...res, queue } }, events);
}

/**
 * Records the answer to "you may pay ... or it enters tapped" (CR 614.12) for the permanent that
 * asked, which is the head of the queue when it is a move, or the spell resolving when the queue is
 * empty, then continues. Null when no such question is waiting.
 */
export function answerResolutionEntersPaid(state: GameState, paid: boolean): ResolveOutcome | null {
  const res = state.resolution;
  const d = state.pending;
  // D-208, D-211: the question of a land that reveals a card has no cost, only the words of the reveal.
  if (!res || d?.kind !== 'confirmOptional' || (d.cost === undefined && d.reveal === undefined)) {
    return null;
  }
  const head = res.queue[0];
  // D-211: a token that is a copy of a land asks the same question; the object it names is the spell or ability that makes the token.
  const entering =
    head === undefined
      ? res.object
      : head.kind === 'move'
        ? head.object
        : head.kind === 'enterToken'
          ? res.object
          : null;
  if (entering !== d.source) return null;
  const events: GameEvent[] = [
    { kind: 'optionalAnswered', seat: d.seat, source: d.source, accepted: paid },
  ];
  return continueResolution(
    { ...state, pending: null, resolution: { ...res, entersPaid: paid } },
    events,
  );
}

/**
 * Records the answer to "As this enters, choose a creature type / a color" (CR 614.12a, D-100) for the
 * permanent that asked: the head of the queue when it is a move or the token about to be created, or
 * the spell resolving when the queue is empty, then continues. Null when no such question is waiting.
 */
export function answerResolutionEntersChosen(
  state: GameState,
  option: string,
  chosen: ChosenValues,
): ResolveOutcome | null {
  const res = state.resolution;
  const d = state.pending;
  if (
    !res ||
    d?.kind !== 'chooseOption' ||
    d.purpose === 'replacement' ||
    d.purpose === 'meldOrder' ||
    d.purpose === 'pile'
  )
    return null;
  const head = res.queue[0];
  const events: GameEvent[] = [
    {
      kind: 'optionChosen',
      seat: d.seat,
      source: d.source,
      purpose: d.purpose,
      option,
    },
  ];
  // A token that is about to be created (nothing exists to point at): the instruction keeps the answer.
  if (head?.kind === 'enterToken' && head.chosen === null && d.source === res.object) {
    const updated: Instruction = { ...head, chosen };
    return continueResolution(
      { ...state, pending: null, resolution: { ...res, queue: [updated, ...res.queue.slice(1)] } },
      events,
    );
  }
  // A token that is a copy of a permanent that may enter as a copy asks about the spell or ability that creates it (D-225).
  const entering =
    head === undefined
      ? res.object
      : head.kind === 'move'
        ? head.object
        : head.kind === 'enterToken'
          ? res.object
          : null;
  if (entering !== d.source) return null;
  return continueResolution(
    { ...state, pending: null, resolution: { ...res, entersChosen: chosen } },
    events,
  );
}

/**
 * Records the answer to an instance of riot (CR 702.136a, 702.136b, D-185) for the permanent that asked: on the token instruction at the head of the
 * queue (nothing exists yet to point at), or for the move at the head of it, or the spell resolving when the queue is empty, then continues. The
 * answers so far travel with the question (`riotSoFar`), so this one is added to them. Null when no such question is waiting.
 */
export function answerResolutionRiot(state: GameState, option: string): ResolveOutcome | null {
  const res = state.resolution;
  const d = state.pending;
  if (!res || d?.kind !== 'chooseOption' || d.purpose !== 'riot') return null;
  const head = res.queue[0];
  const events: GameEvent[] = [
    { kind: 'optionChosen', seat: d.seat, source: d.source, purpose: d.purpose, option },
  ];
  const answers = [...(d.riotSoFar ?? []), option];
  if (head?.kind === 'enterToken' && d.source === res.object) {
    const updated: Instruction = { ...head, riot: answers };
    return continueResolution(
      { ...state, pending: null, resolution: { ...res, queue: [updated, ...res.queue.slice(1)] } },
      events,
    );
  }
  const entering = head === undefined ? res.object : head.kind === 'move' ? head.object : null;
  if (entering !== d.source) return null;
  return continueResolution(
    { ...state, pending: null, resolution: { ...res, entersRiot: answers } },
    events,
  );
}

/**
 * Records the answer to devour's "you may sacrifice any number of creatures" (CR 702.82a, D-185) for the permanent that asked, as
 * `answerResolutionRiot` does for riot, then continues. Null when no such question is waiting.
 */
export function answerResolutionDevour(
  state: GameState,
  chosen: readonly ObjectId[],
): ResolveOutcome | null {
  const res = state.resolution;
  const d = state.pending;
  if (!res || d?.kind !== 'choosePermanent' || d.purpose !== 'devour') return null;
  const head = res.queue[0];
  if (head?.kind === 'enterToken' && d.source === res.object) {
    const updated: Instruction = { ...head, devoured: chosen };
    return continueResolution(
      { ...state, pending: null, resolution: { ...res, queue: [updated, ...res.queue.slice(1)] } },
      [],
    );
  }
  const entering = head === undefined ? res.object : head.kind === 'move' ? head.object : null;
  if (entering !== d.source) return null;
  return continueResolution(
    { ...state, pending: null, resolution: { ...res, entersDevour: chosen } },
    [],
  );
}

/**
 * Records the answer to "As this enters, you may have it become a copy of any creature on the battlefield" (CR 707.9, D-151) for the permanent that
 * asked: the head of the queue when it is a move, or the spell resolving when the queue is empty, then continues. Null when no such question waits.
 */
export function answerResolutionEntersCopy(
  state: GameState,
  chosen: readonly ObjectId[],
): ResolveOutcome | null {
  const res = state.resolution;
  const d = state.pending;
  if (!res || d?.kind !== 'choosePermanent' || d.purpose !== 'entersCopy') return null;
  const head = res.queue[0];
  // A token that is a copy of a permanent that may enter as a copy asks about the spell or ability that creates it (D-225).
  const entering =
    head === undefined
      ? res.object
      : head.kind === 'move'
        ? head.object
        : head.kind === 'enterToken'
          ? res.object
          : null;
  if (entering !== d.source) return null;
  return continueResolution(
    { ...state, pending: null, resolution: { ...res, entersCopy: chosen[0] ?? null } },
    [],
  );
}

/**
 * Records the card the player chose to reveal (CR 701.20a, D-225) for the move or the token that asked: the head of the queue when it is an `enterToken` (which
 * keeps it) or a move (the resolution keeps it), or the spell resolving when the queue is empty, then continues. Null when no such question waits.
 */
export function answerResolutionReveal(
  state: GameState,
  chosen: readonly ObjectId[],
): ResolveOutcome | null {
  const res = state.resolution;
  const d = state.pending;
  const [card] = chosen;
  if (!res || d?.kind !== 'chooseCards' || d.purpose !== 'reveal' || card === undefined) {
    return null;
  }
  const head = res.queue[0];
  if (head?.kind === 'enterToken' && d.source === res.object) {
    const updated: Instruction = { ...head, revealed: card };
    return continueResolution(
      { ...state, pending: null, resolution: { ...res, queue: [updated, ...res.queue.slice(1)] } },
      [],
    );
  }
  const entering = head === undefined ? res.object : head.kind === 'move' ? head.object : null;
  if (entering !== d.source) return null;
  return continueResolution(
    { ...state, pending: null, resolution: { ...res, entersRevealed: card } },
    [],
  );
}

/**
 * Records the answer to "reselect which player or permanent a creature is attacking" (CR 508.7, D-139) on the instruction that asked,
 * then continues. Null when no such question is waiting.
 */
export function answerResolutionReselect(state: GameState, option: string): ResolveOutcome | null {
  const res = state.resolution;
  const head = res?.queue[0];
  if (!res || head?.kind !== 'reselectAttack') return null;
  const updated: Instruction = { ...head, chosen: option };
  return continueResolution(
    { ...state, pending: null, resolution: { ...res, queue: [updated, ...res.queue.slice(1)] } },
    [],
  );
}

/**
 * Records the answer to "create a Food token or a Treasure token" (CR 608.2d, D-175) on the instruction that asked: the index of the
 * option whose words were chosen. Then continues. Null when no such question is waiting.
 */
export function answerResolutionChooseOne(state: GameState, option: string): ResolveOutcome | null {
  const res = state.resolution;
  const head = res?.queue[0];
  if (!res || head?.kind !== 'chooseOne') return null;
  const index = head.options.findIndex((o) => o.label === option);
  if (index < 0) return null;
  const updated: Instruction = { ...head, chosen: index };
  return continueResolution(
    { ...state, pending: null, resolution: { ...res, queue: [updated, ...res.queue.slice(1)] } },
    [],
  );
}

/**
 * Records the answer to a replacement question (CR 616.1, D-191) about the damage of the instruction at the head of the queue: the key is
 * added to the answers so far, and the instruction runs again from the state it began with, to its next question or to the end. Null when
 * no resolution is waiting.
 */
export function answerResolutionReplacement(
  state: GameState,
  option: string,
  chosen: GameEvent,
): ResolveOutcome | null {
  const res = state.resolution;
  if (!res || res.queue[0] === undefined) return null;
  const damageAnswers = [...(res.damageAnswers ?? []), option];
  return continueResolution({ ...state, pending: null, resolution: { ...res, damageAnswers } }, [
    chosen,
  ]);
}

/** Records the owner's answer to CR 903.9b on the instruction that asked, then continues. */
export function answerResolutionCommanderChoice(
  state: GameState,
  object: ObjectId,
  moveToCommandZone: boolean,
): ResolveOutcome | null {
  const res = state.resolution;
  const head = res?.queue[0];
  if (!res || head === undefined) return null;
  // The question is asked by a move of that object, or by a draw whose top card it is (CR 903.9b).
  const asked =
    head.kind === 'move'
      ? head.object === object
      : head.kind === 'draw' && getSeat(state, head.seat).library[0] === object;
  if (!asked || (head.kind !== 'move' && head.kind !== 'draw')) return null;
  const updated: Instruction = { ...head, commanderChoice: moveToCommandZone };
  return continueResolution(
    { ...state, pending: null, resolution: { ...res, queue: [updated, ...res.queue.slice(1)] } },
    [],
  );
}

/** The "counter it unless its controller pays" instruction at the head of the queue, if any. */
function unlessHead(state: GameState) {
  const res = state.resolution;
  const head = res?.queue[0];
  return res && (head?.kind === 'counterUnlessPays' || head?.kind === 'unlessPays')
    ? { res, head }
    : null;
}

function continueUnless(answer: UnlessAnswer, res: ResolutionContext) {
  return continueResolution(
    { ...answer.state, pending: null, resolution: { ...res, queue: answer.queue } },
    answer.events,
  );
}

/**
 * Records the answer to "pay [cost] or it is countered" (Ward, CR 702.21a): accepting pays the life
 * now and goes on to the mana, declining counters the spell or ability. Null when no such question
 * is waiting. The caller checked that the answer comes from the payer (the decision's seat).
 */
export function answerResolutionUnlessConfirm(
  state: GameState,
  accept: boolean,
): ResolveOutcome | null {
  const found = unlessHead(state);
  const d = state.pending;
  if (!found || d?.kind !== 'confirmOptional' || found.head.stage !== 'ask') return null;
  const { res, head } = found;
  const answer = accept
    ? acceptUnless(state, res, head, d.seat)
    : declineUnless(state, res, head, d.seat, true);
  return continueUnless(answer, res);
}

/**
 * Records the payment of the mana of such a cost: `payAuto` or `payManual`, or `cancel`, which means
 * the payer does not pay and it is countered. An error (the taps do not pay the cost) leaves the
 * question open. Null when no such payment is waiting.
 */
export function answerResolutionUnlessPayment(
  state: GameState,
  action:
    | { readonly kind: 'payAuto' }
    | { readonly kind: 'payManual'; readonly taps: readonly ManualTap[] }
    | { readonly kind: 'cancel' },
): ResolveOutcome | { readonly error: string } | null {
  const found = unlessHead(state);
  const d = state.pending;
  if (!found || d?.kind !== 'payMana' || found.head.stage !== 'pay') return null;
  const { res, head } = found;
  if (action.kind === 'cancel') {
    return continueUnless(declineUnless(state, res, head, d.seat, false), res);
  }
  const paid = payUnlessMana(state, res, head, d.seat, action);
  if ('error' in paid) return paid;
  return continueUnless(paid, res);
}
