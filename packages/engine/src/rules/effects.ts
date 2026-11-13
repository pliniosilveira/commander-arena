/**
 * The interpreter: executes the effects of a resolving spell or ability (CR 608.2). One
 * instruction at a time, so the engine can stop for a decision (CR 903.9b) and resume.
 *
 * It implements exactly the effect kinds in SUPPORTED_FEATURES. There is no "not implemented"
 * path: a card using any other kind is rejected by validateCard before it can be supported.
 */
import type { Effect, ObjectSelector } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import { shuffle } from '../rng';
import type { GameEvent } from '../state/events';
import { getSeat, patchObject, patchSeat, setSeat } from '../state/ops';
import type {
  ChosenTarget,
  GameState,
  Instruction,
  ResolutionContext,
  TriggeredAbility,
} from '../state/types';
import { runSplitExiled, startSplit } from './activation-exile';
import { runAmass } from './amass';
import { runArrange, runPutOnTop } from './arrange';
import { attachEntered, attachObject } from './attach';
import { runAuraEntry, withAuraEntries } from './aura-entry';
import { runBehold } from './behold';
import { changeTargetInstructions } from './change-source';
import { runChooseOne } from './choose-one';
import { evaluateCondition } from './conditions';
import { conniveInstruction, runConniveNext } from './connive';
import { runBecomeCopy, runContinuous, runRequireAttack } from './continuous';
import { controllerOf } from './control';
import { runGainControl } from './control-effects';
import { copiableValues } from './copiable';
import { runCopyFromCards, startCopyFromCards } from './copy-card';
import { copiedSpell, copyInstructions } from './copy-source';
import { blocks, counterBlocked, counterBlockers } from './counter-prevention';
import { asking, runDealDamage, runDealDividedDamage } from './damage-effects';
import { askingFlow, type OrderFlow, quietFlow } from './damage-order';
import { derive } from './derive';
import { UNEARTH_EXILE_ABILITY } from './derive-alt';
import { runDraw } from './draw';
import { runDrawUpTo } from './draw-up-to';
import {
  amountOf,
  gainLifeOf,
  loseLifeOf,
  moveInstructions,
  moving,
  shuffleLibrary,
  tokenDefinitionOf,
  withReplacers,
} from './effect-support';
import { createEmblem } from './emblem';
import { runEmpowerJace } from './empower';
import { runEnterAttacking } from './enter-attacking';
import { runEnterToken } from './enter-token';
import { runExileRandomFromHand } from './exile-random-hand';
import { fightOnce, isFightingCreature, runFightPairs } from './fight';
import { runGraveyardPair, startGraveyardPair } from './graveyard-pair';
import { bakeStillExiled, runExileTop, runMayPlay } from './impulse';
import { lifeAmountFor, resolveMayPayCost } from './life-amounts';
import { runLookSplit } from './look-split';
import { runLookTake } from './look-take';
import { loseTheGame } from './lose-game';
import { manaValueOfCost } from './mana-value';
import { runManifest } from './manifest';
import { runMayCast, runPaidReflexive, runReflexive } from './may-effects';
import { runMeld } from './meld';
import { successorsOf } from './melded';
import { millCards } from './mill';
import { runMiracleReveal } from './miracle';
import { becomeMonarch } from './monarch';
import { isCardZoneChoice, runChooseMove } from './move-choice';
import { nextMainStep } from './next-main';
import { phaseOut } from './phasing';
import { runPileSeparate, startPileSeparate } from './pile-separate';
import { prepareCardOf } from './prepare';
import { runPreventDamage } from './prevention';
import { runProliferate } from './proliferate';
import { regenerateInstead, runRegenerate } from './regenerate';
import { runReselectAttack } from './reselect-attack';
import { canBeCountered } from './restrictions';
import { runRevealTop } from './reveal-top';
import { runRevealUntil } from './reveal-until';
import { runRingTempts } from './ring';
import { rollDie } from './roll-die';
import { controlledCandidates, sacrificeCandidates, sacrificePermanent } from './sacrifice';
import { runChooseSacrifice, sacrificeInstructions } from './sacrifice-choice';
import { runDiscard, runSearch } from './search';
import { apnapOrder, resolveObjects, resolvePlayers, type SelectContext } from './select';
import { recordTogether } from './simultaneous';
import { runPair } from './soulbond';
import { objectOrLki, sourceInfo } from './source-info';
import { runSpare, startSpare } from './spare';
import { done, type StepOutcome } from './step-outcome';
import { runChooseTap } from './tap-choice';
import { TIME_COUNTER } from './time-counter';
import { makeSettled } from './token-batch';
import type { TokenBatch } from './token-replacement';
import { runTransform } from './transform';
import { untapPermanent } from './untap';
import { runVote } from './vote';
import { moveObject } from './zones';

/** The counter Cumulative upkeep puts on the permanent (CR 702.24a). */
export const AGE_COUNTER = 'age';

/** Every instruction but the "unless pays" ones, Cascade, castExiled, copySpell and changeTarget, which the stack runs (rules/stack.ts). */
export type EffectInstruction = Exclude<
  Instruction,
  | { kind: 'counterUnlessPays' }
  | { kind: 'unlessPays' }
  | { kind: 'cascade' }
  | { kind: 'payAmount' }
  | { kind: 'castExiled' }
  | { kind: 'copySpell' }
  | { kind: 'changeTarget' }
  | { kind: 'castFree' }
  | { kind: 'castCard' }
>;

export function runInstruction(
  state: GameState,
  res: ResolutionContext,
  instruction: EffectInstruction,
  targets: readonly ChosenTarget[],
): StepOutcome {
  // D-191: the answers given so far to the replacement questions of the damage this instruction deals (rules/damage-effects.ts).
  const flow = askingFlow(res.damageAnswers);
  if (instruction.kind === 'sacrifice') {
    // CR 701.21a: only a permanent its controller still controls can be sacrificed. One that
    // already left (an earlier instruction moved it) is skipped (CR 608.2c).
    const r = sacrificePermanent(
      state,
      instruction.object,
      instruction.seat ?? res.controller,
      instruction.lkiRecorded === true,
    );
    // D-131: "for each creature sacrificed this way" counts the permanents that were sacrificed.
    return r === null
      ? done(state)
      : {
          ...done(r.state, r.events),
          thisWay: { sacrificed: 1 },
          performed: 1,
          sacrificed: [instruction.object],
        };
  }
  if (instruction.kind === 'fightPairs') return runFightPairs(state, res, instruction, flow);
  if (instruction.kind === 'chooseSacrifice') return runChooseSacrifice(state, res, instruction);
  if (instruction.kind === 'chooseMove') return runChooseMove(state, res, instruction);
  if (instruction.kind === 'chooseTap') return runChooseTap(state, res, instruction);
  if (instruction.kind === 'proliferate') return runProliferate(state, res, instruction);
  if (instruction.kind === 'auraEntry') return runAuraEntry(state, res, instruction);
  if (instruction.kind === 'reselectAttack') return runReselectAttack(state, res, instruction);
  if (instruction.kind === 'chooseOne') return runChooseOne(state, res, instruction);
  if (instruction.kind === 'vote') return runVote(state, res, instruction);
  if (instruction.kind === 'ringTempts') return runRingTempts(state, res, instruction);
  if (instruction.kind === 'pair') return runPair(state, res, instruction);
  if (instruction.kind === 'empowerJace') return runEmpowerJace(state, res, instruction);
  if (instruction.kind === 'amass') return runAmass(state, res, instruction, flow);
  if (instruction.kind === 'conniveNext') return runConniveNext(state, res, instruction);
  if (instruction.kind === 'spare') return runSpare(state, res, instruction);
  if (instruction.kind === 'splitExiled') return runSplitExiled(state, res, instruction);
  if (instruction.kind === 'graveyardPair') return runGraveyardPair(state, res, instruction);
  if (instruction.kind === 'copyFromCards') return runCopyFromCards(state, res, instruction);
  if (instruction.kind === 'search') return runSearch(state, res, instruction);
  if (instruction.kind === 'shuffle') {
    const r = shuffleLibrary(state, instruction.seat, instruction.keep);
    return done(r.state, r.events);
  }
  if (instruction.kind === 'discard') return runDiscard(state, res, instruction);
  if (instruction.kind === 'arrange') return runArrange(state, res, instruction);
  if (instruction.kind === 'drawUpTo') return runDrawUpTo(state, res, instruction);
  if (instruction.kind === 'lookTake') return runLookTake(state, res, instruction);
  if (instruction.kind === 'lookSplit') return runLookSplit(state, res, instruction);
  if (instruction.kind === 'pileSeparate') return runPileSeparate(state, res, instruction);
  if (instruction.kind === 'behold') return runBehold(state, res, instruction);
  if (instruction.kind === 'putOnTop') return runPutOnTop(state, res, instruction);
  if (instruction.kind === 'confirmOptional') {
    if (instruction.answer !== null) return done(state);
    const info = sourceInfo(state, res.source);
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'confirmOptional',
        seat: res.controller,
        source: res.object,
        sourceName: info?.name ?? '',
        sourceOracleText: info?.oracleText ?? '',
      },
    };
  }
  if (instruction.kind === 'playerMay') {
    // D-210 (CR 608.2d, 101.4): one player's "may" of a `playersMay` effect. The player asked answers; a player who has lost is never asked.
    if (getSeat(state, instruction.seat).hasLost) return done(state);
    if (instruction.answer === null) {
      const info = sourceInfo(state, res.source);
      return {
        state,
        events: [],
        front: [],
        needs: {
          kind: 'confirmOptional',
          seat: instruction.seat,
          source: res.object,
          sourceName: info?.name ?? '',
          sourceOracleText: info?.oracleText ?? '',
        },
      };
    }
    const chosen = instruction.answer ? instruction.effect : instruction.otherwise;
    if (chosen === undefined) return done(state);
    const as = instruction.answer ? instruction.as : undefined;
    return done(
      state,
      [],
      [{ kind: 'effect', effect: chosen, ...(as === undefined ? {} : { as }) }],
    );
  }
  if (instruction.kind === 'mayEffect') {
    // D-111: "you may [effect]" inside an effect: the controller answers, accepting runs the effect.
    if (instruction.answer !== null) {
      return done(
        state,
        [],
        instruction.answer ? [{ kind: 'effect', effect: instruction.effect }] : [],
      );
    }
    // D-187: "you may sacrifice one or more Treasures" with no Treasure to sacrifice: there is nothing to say yes to (CR 701.21), so nothing is asked.
    const offered = instruction.effect;
    if (
      offered.kind === 'sacrifice' &&
      offered.objects.kind === 'choose' &&
      offered.objects.atLeastOne === true &&
      offered.player === undefined &&
      sacrificeCandidates(state, res.controller, res.source, offered.objects.filter).length === 0
    ) {
      return done(state);
    }
    // D-258, CR 118.12a, 608.2d: "you may return an untapped Plains you control to its owner's hand" with no such permanent: the cost cannot be paid, so nothing is
    // asked and it was not paid (the "if you don't" that follows runs).
    if (
      offered.kind === 'moveToZone' &&
      offered.objects.kind === 'choose' &&
      offered.to !== 'battlefield' &&
      !isCardZoneChoice(offered.objects.filter) &&
      controlledCandidates(state, res.controller, res.source, offered.objects.filter).length === 0
    ) {
      return done(state);
    }
    const info = sourceInfo(state, res.source);
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'confirmOptional',
        seat: res.controller,
        source: res.object,
        sourceName: info?.name ?? '',
        sourceOracleText: info?.oracleText ?? '',
      },
    };
  }
  if (instruction.kind === 'enterToken') return runEnterToken(state, res, instruction, flow);
  if (instruction.kind === 'draw') return runDraw(state, instruction);
  if (instruction.kind === 'miracleReveal') return runMiracleReveal(state, res, instruction);
  if (instruction.kind === 'move') {
    // An object that already left (an earlier instruction moved it) is skipped: the spell does as
    // much as it can (CR 608.2c, 608.2b).
    const subject = state.objects[instruction.object];
    if (subject === undefined) return done(state);
    // CR 111.8: a token that has left the battlefield can't move to another zone or come back; it
    // stays where it is and ceases to exist the next time state-based actions are checked.
    if (subject.token !== null && subject.zone !== 'battlefield') return done(state);
    const result = moveObject(state, {
      object: instruction.object,
      to: instruction.to,
      position: instruction.position,
      tapped: instruction.tapped,
      commanderChoice: instruction.commanderChoice,
      ...(instruction.withCounters === undefined ? {} : { withCounters: instruction.withCounters }),
      // CR 712.21b (D-279): the controller of the effect is the player who exiles a melded permanent.
      by: res.controller,
      ...(instruction.alt === undefined ? {} : { alt: instruction.alt }),
      ...(instruction.replacers === undefined ? {} : { replacers: instruction.replacers }),
      // D-283 (CR 603.10a): the last-known information was recorded as the event of several leaving together began.
      ...(instruction.lkiRecorded === true ? { lkiRecorded: true as const } : {}),
      // CR 614.12, 614.12b (D-272): the cards of a `together` run enter in one event, so what the replacement effects of this one read is the battlefield without
      // the ones that entered before it in the run (`lastMoved` is the run: the pair starts it empty and every move adds the object it made).
      ...(instruction.together === true && instruction.to === 'battlefield'
        ? { alongside: res.lastMoved ?? [] }
        : {}),
      entersPaid: res.entersPaid ?? null,
      entersChosen: res.entersChosen ?? null,
      ...(res.entersCopy === undefined ? {} : { entersCopy: res.entersCopy }),
      ...(res.entersDevour === undefined ? {} : { entersDevour: res.entersDevour }),
      ...(res.entersRiot === undefined ? {} : { entersRiot: res.entersRiot }),
      ...(res.entersRevealed === undefined ? {} : { entersRevealed: res.entersRevealed }),
      // "Under its owner's control" or "under your control" (CR 110.2): that seat takes the permanent.
      ...(instruction.controller === undefined
        ? {}
        : { toSeat: instruction.controller === 'owner' ? subject.owner : res.controller }),
    });
    if (result.kind === 'needsDecision') {
      return { state, events: [], front: [], needs: result.decision };
    }
    // CR 400.7j: later parts of the effect can find the new object ("then return it").
    // CR 712.21c (D-277): a melded permanent that left became two cards, and "it" finds both: the same is done to each.
    const movedObjects =
      result.newObject === null
        ? []
        : result.alsoNewObject === undefined
          ? [result.newObject]
          : [result.newObject, result.alsoNewObject];
    const lastMoved = [...(res.lastMoved ?? []), ...movedObjects];
    // CR 702.84a, 603.7 (D-124): unearth also creates the delayed triggered ability that exiles the permanent it
    // returned at the beginning of the next end step; it belongs to the controller of the ability (CR 603.7d) and
    // names that permanent (CR 603.7c).
    // CR 303.4f (D-149): an Aura that entered by an effect enters attached to the object its controller chose.
    const attached =
      instruction.attachTo !== undefined && result.newObject !== null
        ? attachEntered(result.state, result.newObject, instruction.attachTo)
        : { state: result.state, events: [] as GameEvent[] };
    // CR 603.6a (D-272): the cards of a `together` run enter as one event, which `findTriggers` reads from this mark.
    const moveEvents = [
      ...(instruction.together === true
        ? result.events.map((e) =>
            e.kind === 'zoneChanged' && e.toZone === 'battlefield'
              ? { ...e, simultaneous: true as const }
              : e,
          )
        : result.events),
      ...attached.events,
    ];
    const created =
      instruction.alt === 'unearth' && result.newObject !== null
        ? {
            ...attached.state,
            delayedTriggers: [
              ...attached.state.delayedTriggers,
              {
                source: result.newObject,
                controller: res.controller,
                ability: UNEARTH_EXILE_ABILITY,
              },
            ],
          }
        : attached.state;
    // CR 610.3: "until this leaves the battlefield": the card is returned by a second one-shot effect created as the permanent leaves, which
    // `settle` runs (`rules/exile-return.ts`); it is not a delayed triggered ability.
    const untilled =
      (instruction.untilLeaves !== undefined || instruction.untilMonarch !== undefined) &&
      result.newObject !== null &&
      instruction.to === 'exile'
        ? {
            ...created,
            exileReturns: [
              ...created.exileReturns,
              ...movedObjects.map((card) => ({
                source: (instruction.untilLeaves ?? instruction.untilMonarch) as ObjectId,
                card,
                controller: res.controller,
                ...(instruction.untilMonarch !== undefined ? { untilMonarch: true as const } : {}),
              })),
            ],
          }
        : created;
    // CR 607.2a (D-139): a card exiled by a linked ability is remembered by the permanent that exiled it, if it still is that permanent.
    const owner =
      instruction.linkTo === undefined ? undefined : untilled.objects[instruction.linkTo];
    const linked =
      owner?.zone === 'battlefield' && result.newObject !== null && instruction.to === 'exile'
        ? patchObject(untilled, owner.id, {
            linkedExile: [...(owner.linkedExile ?? []), ...movedObjects],
          })
        : untilled;
    // CR 702.75a (D-145): a card exiled face down by Hideaway is visible to the controller of the permanent that exiled it.
    // CR 406.3 (D-187): a card an effect exiled face down, with no one to look at it, is only marked.
    const hidden =
      instruction.faceDown === true
        ? movedObjects.reduce(
            (acc, id) =>
              patchObject(
                acc,
                id,
                instruction.linkTo !== undefined
                  ? { hideaway: instruction.linkTo }
                  : { exiledFaceDown: true },
              ),
            linked,
          )
        : linked;
    // CR 305.1, 305.2a (D-145): a land played as an effect says counts as the player's land play for the turn.
    if (instruction.playAsLand === true && result.newObject !== null) {
      const played = patchSeat(hidden, res.controller, {
        landsPlayedThisTurn: getSeat(hidden, res.controller).landsPlayedThisTurn + 1,
      });
      return {
        ...done(played, [
          ...moveEvents,
          { kind: 'landPlayed', seat: res.controller, object: result.newObject },
        ]),
        lastMoved,
        performed: 1,
      };
    }
    // D-231 (CR 603.12): a nonland card that really went to exile is counted, for "When one or more nonland cards are exiled this way".
    const countedNonland =
      instruction.countsNonland === true &&
      result.newObject !== null &&
      hidden.objects[result.newObject]?.zone === 'exile' &&
      !derive(state, subject).types.includes('land');
    // D-135: an object that moved is something done, for "if you do".
    return {
      ...done(hidden, moveEvents),
      lastMoved,
      performed: 1,
      ...(countedNonland ? { thisWay: { exiledNonland: 1 } } : {}),
    };
  }
  // D-210: an effect run "as" another player (the one a `playersMay` asked): that player is "you" in it, and what it queues next is run as them too.
  if (instruction.as !== undefined) {
    const as = instruction.as;
    const out = runEffect(state, { ...res, controller: as }, instruction.effect, targets, flow);
    return {
      ...out,
      front: out.front.map((next) =>
        next.kind === 'effect' && next.as === undefined ? { ...next, as } : next,
      ),
    };
  }
  return runEffect(state, res, instruction.effect, targets, flow);
}

/**
 * Runs effects that need no decision and no target right now, outside any resolving spell or
 * ability: the extra effects of a mana ability, which resolve at once with it (CR 605.3b). `source`
 * is the permanent the ability belongs to ("~ deals 1 damage to you"). Validation only lets
 * through effects that finish without a decision, so one that does not is an engine bug.
 */
export function runImmediateEffects(
  state: GameState,
  controller: SeatId,
  source: ObjectId,
  effects: readonly Effect[],
): { state: GameState; events: GameEvent[] } {
  const res: ResolutionContext = {
    object: source,
    source,
    controller,
    queue: [],
    legalTargets: [],
  };
  let next = state;
  const events: GameEvent[] = [];
  for (const effect of effects) {
    const out = runEffect(next, res, effect, [], quietFlow());
    if (out.needs !== null || out.front.length > 0) {
      throw new Error(`The ${effect.kind} effect of a mana ability needed a decision`);
    }
    next = out.state;
    events.push(...out.events);
  }
  return { state: next, events };
}

/**
 * CR 400.7 (D-230): the card an object that left became in a graveyard, if it is still there; the old id when it is not (nothing is exiled then). CR 712.21c
 * (D-277): a melded permanent that died became two cards, and an effect that finds the new object finds both.
 */
function graveyardSuccessors(state: GameState, id: ObjectId): readonly ObjectId[] {
  const found = successorsOf(state, id, (o) => o.zone === 'graveyard');
  return found.length > 0 ? found : [id];
}

function runEffect(
  state: GameState,
  res: ResolutionContext,
  effect: Effect,
  targets: readonly ChosenTarget[],
  flow: OrderFlow,
): StepOutcome {
  // "This" is the spell, or for an ability the permanent it belongs to (which may be gone).
  const ctx: SelectContext = {
    controller: res.controller,
    source: res.source,
    // CR 107.3a: the X announced for the spell or ability that is resolving.
    x: state.objects[res.object]?.stack?.x ?? 0,
    ...(res.lastMoved === undefined ? {} : { moved: res.lastMoved }),
    ...(res.triggerSubject === undefined ? {} : { triggerSubject: res.triggerSubject }),
    ...(res.costSacrificed === undefined ? {} : { costSacrificed: res.costSacrificed }),
    ...(res.sacrificed === undefined ? {} : { sacrificed: res.sacrificed }),
    ...(res.triggerPlayer === undefined ? {} : { triggerPlayer: res.triggerPlayer }),
    ...(res.triggerDamage === undefined ? {} : { triggerDamage: res.triggerDamage }),
    ...(res.triggerAttacked === undefined ? {} : { triggerAttacked: res.triggerAttacked }),
    ...(res.lifeLost === undefined ? {} : { lifeLost: res.lifeLost }),
    ...(res.thisWay === undefined ? {} : { thisWay: res.thisWay }),
    ...(res.votes === undefined ? {} : { votes: res.votes }),
  };
  const events: GameEvent[] = [];
  let next = state;

  switch (effect.kind) {
    case 'sequence':
      return done(
        state,
        [],
        effect.effects.map((e) => ({ kind: 'effect' as const, effect: e })),
      );

    case 'dealDamage':
      return runDealDamage(state, res, effect, ctx, targets, flow);

    case 'dealDividedDamage':
      return runDealDividedDamage(state, res, effect, targets, flow);

    case 'destroy': {
      // CR 701.8 (Destroy): indestructible permanents are not destroyed (CR 702.12b).
      const ids = resolveObjects(state, effect.objects, ctx, targets).filter((id) => {
        const obj = state.objects[id];
        if (obj?.zone !== 'battlefield') return false;
        return !derive(state, obj).abilities.some(
          (a) => a.kind === 'keyword' && a.keyword.kind === 'indestructible',
        );
      });
      // CR 701.19a (D-120): a regeneration shield replaces the destruction, unless it "can't be regenerated"
      // (CR 701.19c). The shields are used as the destruction happens, before anything is moved.
      const destroyed: ObjectId[] = [];
      for (const id of ids) {
        const replaced = effect.cantBeRegenerated === true ? null : regenerateInstead(next, id);
        if (replaced === null) {
          destroyed.push(id);
          continue;
        }
        next = replaced.state;
        events.push(...replaced.events);
      }
      // D-131: "for each creature destroyed this way" counts the permanents the effect destroyed.
      // D-283 (CR 603.10a): they die together, so what each was is recorded before the first moves.
      const together = recordTogether(
        next,
        withReplacers(moveInstructions(destroyed, 'graveyard'), next),
      );
      return {
        ...done(together.state, events, together.instructions),
        lastMoved: [],
        thisWay: {
          destroyed: destroyed.length,
          // CR 701.8, 608.2h (D-230): the nontoken creatures of the controller of the effect, as they were as they were destroyed (before they moved).
          destroyedOwnNontoken: destroyed.filter((id) => {
            const obj = state.objects[id];
            return (
              obj !== undefined &&
              obj.token === null &&
              controllerOf(state, obj) === res.controller &&
              derive(state, obj).types.includes('creature')
            );
          }).length,
        },
      };
    }

    case 'sacrifice': {
      // CR 701.21: "sacrifice a creature" is the controller's choice (CR 608.2d); "sacrifice this"
      // and "sacrifice all ..." name the permanents. Only permanents the controller controls can be
      // sacrificed (CR 701.21a), which the instruction checks as it runs.
      const what = effect.objects;
      if (what.kind === 'choose') {
        // D-110: "Defending player sacrifices two permanents": each player the effect names chooses among
        // their own permanents (CR 701.21a); without `player` the controller of the effect does.
        const sacrificers: (SeatId | undefined)[] =
          effect.player === undefined
            ? [undefined]
            : resolvePlayers(state, effect.player, ctx, targets);
        // D-131: the number may be an amount ("each player sacrifices X creatures"), read as the effect runs.
        // D-135: "any number" is no number at all: the player chooses none to all of the candidates.
        const count = what.anyNumber === true ? 0 : amountOf(state, what.count ?? 1, ctx, targets);
        if (count <= 0 && what.anyNumber !== true) return done(state);
        const first = sacrificers[0];
        const later = sacrificers.flatMap((seat) => (seat === undefined ? [] : [seat])).slice(1);
        return done(
          state,
          [],
          [
            {
              kind: 'chooseSacrifice' as const,
              filter: what.filter,
              count,
              chosen: null,
              ...(what.anyNumber === true ? { anyNumber: true as const } : {}),
              ...(what.atLeastOne === true ? { atLeastOne: true as const } : {}),
              ...(what.greatest === undefined ? {} : { greatest: what.greatest }),
              ...(first === undefined ? {} : { seat: first }),
              // CR 101.4: with several players, they all choose (active player first) before any sacrifice happens.
              ...(later.length === 0 ? {} : { together: { later, held: [] } }),
            },
          ],
        );
      }
      const ids = resolveObjects(state, what, ctx, targets);
      if (effect.byController === true) {
        // D-196: "the blocking creature's controller sacrifices it": each permanent is sacrificed by the player who controls it as this
        // resolves (CR 701.21a), the players in the order CR 101.4 gives; one that has left the battlefield is skipped.
        const seats = ids.flatMap((id) => {
          const o = state.objects[id];
          return o?.zone === 'battlefield' ? [controllerOf(state, o)] : [];
        });
        const together = recordTogether(
          state,
          apnapOrder(state, seats).flatMap((seat) =>
            sacrificeInstructions(
              ids.filter((id) => {
                const o = state.objects[id];
                return o?.zone === 'battlefield' && controllerOf(state, o) === seat;
              }),
              seat,
            ),
          ),
        );
        return done(together.state, [], together.instructions);
      }
      if (what.kind === 'each') {
        // CR 701.21a (D-139): "each player sacrifices all permanents they control that ...": every permanent the filter
        // names is sacrificed by its own controller, the players in the order CR 101.4 gives.
        const order = apnapOrder(
          state,
          ids.flatMap((id) => {
            const o = state.objects[id];
            return o === undefined ? [] : [controllerOf(state, o)];
          }),
        );
        // D-283 (CR 603.10a): sacrificed together, so what each was is recorded before the first moves.
        const together = recordTogether(
          state,
          order.flatMap((seat) =>
            sacrificeInstructions(
              ids.filter((id) => {
                const o = state.objects[id];
                return o !== undefined && controllerOf(state, o) === seat;
              }),
              seat,
            ),
          ),
        );
        return done(together.state, [], together.instructions);
      }
      // D-283 (CR 603.10a): sacrificed together, so what each was is recorded before the first moves.
      const together = recordTogether(state, sacrificeInstructions(ids));
      return done(together.state, [], together.instructions);
    }

    case 'exile': {
      const ids = resolveObjects(state, effect.objects, ctx, targets)
        // CR 400.7, 603.10a (D-230): "exile it" in a trigger about a permanent that died: the permanent is gone, the card it became is the one in the graveyard.
        .flatMap((id) =>
          effect.objects.kind === 'triggerSubject' && state.objects[id] === undefined
            ? graveyardSuccessors(state, id)
            : [id],
        )
        .filter((id) => state.objects[id] !== undefined);
      // CR 610.3a, 610.3b (D-149): "until this leaves the battlefield": if it already has, as the exile would happen, nothing moves.
      if (
        effect.until === 'sourceLeaves' &&
        (res.source === null || state.objects[res.source]?.zone !== 'battlefield')
      ) {
        return done(state);
      }
      // CR 610.3b (D-231): "until an opponent becomes the monarch": if an opponent did after the ability triggered (it went on the stack then), nothing is exiled.
      if (effect.until === 'opponentBecomesMonarch') {
        const since = state.objects[res.object]?.timestamp ?? 0;
        const early = Object.entries(state.monarchBecameAt ?? {}).some(
          ([seat, stamp]) => Number(seat) !== res.controller && stamp > since,
        );
        if (early) return done(state);
      }
      // CR 607.2a (D-139): "exiled with this creature": the permanent the ability belongs to remembers the cards it exiles.
      const link = {
        ...(effect.linked === true ? { linkTo: res.source } : {}),
        // CR 610.3 (D-149): the card is returned when the permanent leaves the battlefield.
        ...(effect.until === 'sourceLeaves' ? { untilLeaves: res.source } : {}),
        ...(effect.until === 'opponentBecomesMonarch' && res.source !== null
          ? { untilMonarch: res.source }
          : {}),
      };
      // D-283 (CR 603.10a): exiled together, so what each was is recorded before the first moves.
      const together = recordTogether(
        state,
        moveInstructions(ids, 'exile').map((i) => (i.kind === 'move' ? { ...i, ...link } : i)),
      );
      return moving(together.state, together.instructions);
    }

    case 'moveToZone': {
      // CR 608.2d: "return a land you control to its owner's hand": the controller chooses.
      // D-139: a card chosen from the hand or the graveyard may also be put onto the battlefield.
      if (
        effect.objects.kind === 'choose' &&
        (effect.to !== 'battlefield' || isCardZoneChoice(effect.objects.filter))
      ) {
        // D-131: the number may be an amount; none to move does nothing.
        if (amountOf(state, effect.objects.count ?? 1, ctx, targets) <= 0) {
          return { ...done(state), lastMoved: [] };
        }
        return {
          ...done(
            state,
            [],
            [
              {
                kind: 'chooseMove',
                filter: effect.objects.filter,
                count: amountOf(state, effect.objects.count ?? 1, ctx, targets),
                to: effect.to,
                position: effect.position ?? 'top',
                ...(effect.objects.optional === true ? { optional: true as const } : {}),
                // D-411: "from among them": only the cards the effect before it moved can be chosen (CR 608.2c).
                ...(effect.objects.fromMoved === true ? { among: ctx.moved ?? [] } : {}),
                ...(effect.to === 'battlefield'
                  ? {
                      tapped: effect.tapped ?? false,
                      controller: effect.controller ?? ('you' as const),
                      ...(effect.withCounters === undefined
                        ? {}
                        : { withCounters: effect.withCounters }),
                    }
                  : {}),
                chosen: null,
              },
            ],
          ),
          lastMoved: [],
        };
      }
      const ids = resolveObjects(state, effect.objects as ObjectSelector, ctx, targets).filter(
        (id) => state.objects[id] !== undefined,
      );
      // CR 110.2a: an object an effect puts onto the battlefield enters under the control of the
      // player performing the effect (the controller of the spell or ability) unless the effect
      // states otherwise, so an effect with no control named means 'you', not the owner. Every
      // other zone has no controller: the card goes to its owner's zone (CR 108.3, 400.3).
      const controller = effect.to === 'battlefield' ? (effect.controller ?? 'you') : undefined;
      const moves = moveInstructions(
        ids,
        effect.to,
        effect.position ?? 'top',
        effect.tapped ?? false,
        controller,
        effect.withCounters,
      );
      // CR 303.4f (D-149): an Aura card put onto the battlefield chooses what it enchants as it enters.
      // CR 303.4g, 303.4i (D-207): "attached to target creature ...": the effect names the object, so the Aura does not choose; it enters attached to the target
      // when that is still a legal object to enchant, and stays where it is when the target is gone.
      if (effect.attachTo !== undefined && effect.to === 'battlefield') {
        const [host] = resolveObjects(state, effect.attachTo, ctx, targets).filter(
          (id) => state.objects[id]?.zone === 'battlefield',
        );
        if (host === undefined) return { ...done(state), lastMoved: [] };
        return moving(
          state,
          moves.map((m) => (m.kind === 'move' ? { ...m, attachTo: host } : m)),
        );
      }
      if (effect.to === 'battlefield') return moving(state, withAuraEntries(state, moves));
      // D-283 (CR 603.10a): "return all creatures to their owners' hands" and the like: what each was is recorded before the first moves.
      const together = recordTogether(state, moves);
      return moving(together.state, together.instructions);
    }

    case 'counter': {
      // CR 701.6 (Counter): a countered spell is put into its owner's graveyard; a countered
      // ability ceases to exist (moveObject removes non-card objects). CR 101.2: a spell that can't
      // be countered is not, and stays on the stack.
      const ids = resolveObjects(state, effect.objects, ctx, targets).filter((id) =>
        canBeCountered(state, id),
      );
      for (const id of ids) events.push({ kind: 'countered', object: id });
      return done(state, events, moveInstructions(ids, 'graveyard'));
    }

    case 'counterUnlessPays': {
      // CR 702.21a: the controller of each spell or ability may pay; otherwise it is countered.
      // One that already left the stack is skipped (CR 608.2b). One that can't be countered (CR
      // 101.2) is skipped too, and its controller is not asked: there is nothing to pay to avoid.
      const ids = resolveObjects(state, effect.objects, ctx, targets).filter((id) =>
        canBeCountered(state, id),
      );
      return done(
        state,
        [],
        ids.map((object) => ({
          kind: 'counterUnlessPays' as const,
          object,
          cost: effect.cost,
          stage: 'ask' as const,
          // Ward's trigger asks as 'ward'; a target spell ("Counter target spell unless ...") as
          // 'counterUnlessPays' (rules/pay-unless.ts).
          purpose:
            effect.objects.kind === 'target' ? ('counterUnlessPays' as const) : ('ward' as const),
        })),
      );
    }

    case 'unlessPays': {
      // CR 118.12a: each player the selector names may pay; the effect happens for each who does not.
      // Run as instructions (rules/pay-unless.ts) because the payer is asked in the middle of this.
      return done(
        state,
        [],
        resolvePlayers(state, effect.player, ctx, targets).map((seat) => ({
          kind: 'unlessPays' as const,
          seat,
          cost: effect.cost,
          stage: 'ask' as const,
          effect: effect.effect,
          optional: effect.optional === true,
          ...(effect.upkeep === undefined ? {} : { upkeep: effect.upkeep }),
        })),
      );
    }

    case 'cumulativeUpkeep': {
      // CR 702.24a (D-127): "if this permanent is on the battlefield" (and its controller's, as the ability is), put an
      // age counter on it; then its controller may pay the cost for each age counter on it, and if they don't,
      // sacrifice it. The whole cost is the cost repeated once for each age counter, paid or not at all (CR 702.24a:
      // partial payments aren't allowed), asked as `unlessPays` asks it (rules/pay-unless.ts).
      const source = state.objects[res.source];
      if (source?.zone !== 'battlefield' || controllerOf(state, source) !== res.controller)
        return done(state);
      // CR 122.6, 101.2 (D-380): a permanent that can't have age counters gets none; the cost is then for the age counters it already has (none: nothing to pay).
      const noAge = counterBlocked(state, source, AGE_COUNTER);
      const age = (source.counters[AGE_COUNTER] ?? 0) + (noAge ? 0 : 1);
      if (!noAge) {
        next = patchObject(next, source.id, {
          counters: { ...source.counters, [AGE_COUNTER]: age },
        });
        events.push({ kind: 'counterAdded', object: source.id, counter: AGE_COUNTER, count: 1 });
      }
      if (age === 0) return done(next, events);
      return done(next, events, [
        {
          kind: 'unlessPays' as const,
          seat: res.controller,
          cost: Array.from({ length: age }, () => effect.cost).flat(),
          stage: 'ask' as const,
          effect: { kind: 'sacrifice', objects: { kind: 'this' } },
          optional: false,
          upkeep: 'cumulativeUpkeep' as const,
        },
      ]);
    }

    case 'removeTimeCounter': {
      // CR 702.62a (D-128): "remove a time counter from it", where the source is the suspended card in exile. The
      // intervening "if this card is suspended" is read again as the ability resolves (CR 603.4): a card that left
      // exile (a new object, CR 400.7) or has no counter any more is not touched.
      const card = state.objects[res.source];
      const time = card?.counters[TIME_COUNTER] ?? 0;
      if (card?.zone !== 'exile' || time < 1) return done(state);
      const { [TIME_COUNTER]: _removed, ...others } = card.counters;
      const counters = time > 1 ? { ...others, [TIME_COUNTER]: time - 1 } : others;
      next = patchObject(next, card.id, { counters });
      events.push({ kind: 'counterRemoved', object: card.id, counter: TIME_COUNTER, count: 1 });
      return done(next, events);
    }

    case 'copySpell': {
      // CR 707.10 (D-129): a copy of each spell the effect names. A target is still a spell on the stack when it is legal
      // (CR 608.2b); the spell whose casting caused the trigger is read from last-known information once it has left.
      const spells = resolveObjects(state, effect.spell, ctx, targets).filter(
        (id) => copiedSpell(state, id) !== null,
      );
      // D-337 (CR 707.10, 903.8): "copy it for each time you've cast your commander from the command zone this game": the count is read as this resolves; none
      // when it is zero (copyInstructions makes nothing for it).
      const copies = effect.count === undefined ? 1 : amountOf(state, effect.count, ctx, targets);
      return {
        ...done(
          state,
          [],
          spells.flatMap((id) => copyInstructions(id, copies, effect.newTargets)),
        ),
        performed: copies > 0 ? spells.length : 0,
      };
    }

    case 'changeTarget': {
      // CR 115.7a (D-181): the target of each spell or ability the effect names changes, if it is still on the stack with a single target as this
      // resolves (CR 608.2b); the stack runs the instruction (it asks the controller, `rules/change-target.ts`).
      return done(
        state,
        [],
        changeTargetInstructions(state, resolveObjects(state, effect.object, ctx, targets)),
      );
    }

    case 'storm': {
      // CR 702.40a (D-129): a copy for each other spell that was cast before the spell this turn, as the spell was cast
      // (`spellsCastBefore`), from its last-known information if it has left the stack; the controller may choose new
      // targets for any of them.
      const spell = copiedSpell(state, res.source);
      return done(
        state,
        [],
        copyInstructions(res.source, spell?.stack?.spellsCastBefore ?? 0, 'may'),
      );
    }

    case 'replicate': {
      // CR 702.56a (D-129): a copy for each time the replicate cost was paid, as the spell was cast, from its
      // last-known information if it has left the stack; the controller may choose new targets for any of them.
      const spell = copiedSpell(state, res.source);
      return done(state, [], copyInstructions(res.source, spell?.stack?.replicated ?? 0, 'may'));
    }

    case 'castExiled':
      // CR 702.62a, 702.35a: cast the exiled card the ability belongs to (rules/cast-exiled.ts).
      return done(
        state,
        [],
        [{ kind: 'castExiled', mode: effect.mode, stage: 'start', card: null }],
      );

    case 'delayedTrigger': {
      // CR 603.7, 603.7d, 603.7e (D-128): a delayed triggered ability, created as the spell or ability resolves. It
      // belongs to its controller and refers to the source only as the thing that created it (CR 603.7c: the source
      // may be gone by then); it triggers once, at the beginning of the next step it names, and goes on the stack
      // like any triggered ability (rules/triggers.ts, `findDelayedTriggers`).
      // D-217 (CR 603.7a, 500.1): "at the beginning of your next main phase" is the first main phase of the controller's that begins after this.
      const step =
        effect.at.step === 'nextMain' ? nextMainStep(state, res.controller) : effect.at.step;
      const trigger = { kind: 'step', step, whose: effect.at.whose } as const;
      // D-205 (CR 603.7c, 400.7j): "Exile up to one target creature or land you control. If you do, return it to the battlefield under its owner's
      // control at the beginning of the next end step." The ability names the card the exile moved as it was made: one delayed ability for each card
      // (nothing, when nothing was exiled), whose effect moves its subject. The card is expected in exile; one that left since is a new object and is
      // not found (CR 603.7c, 400.7), and a token that was exiled has ceased to exist (CR 111.8) and was never a card to return.
      // D-284 (CR 603.7c, 400.7, 603.10a): "When this creature dies, you may return it to the battlefield under its owner's control at the beginning of your
      // next upkeep": the card is the one the dying creature became, found now (in the graveyard, where it is expected, as `triggerCard` reads it); one that
      // is gone from there when the ability triggers is a new object and is not found. A commander that went to the command zone (CR 903.9a) is not in the
      // graveyard, and a token that died has ceased to exist (CR 111.8): nothing is created for them.
      if (effect.effect.kind === 'moveToZone') {
        const back: Effect = { ...effect.effect, objects: { kind: 'triggerSubject' } };
        const ability: TriggeredAbility = { kind: 'triggered', trigger, effect: back };
        const cards =
          effect.effect.objects.kind === 'triggerCard'
            ? resolveObjects(state, effect.effect.objects, ctx, targets)
            : (res.lastMoved ?? []);
        return done({
          ...state,
          delayedTriggers: [
            ...state.delayedTriggers,
            ...cards
              .filter((card) => state.objects[card]?.token === null)
              .map((card) => ({
                source: res.source,
                controller: res.controller,
                ability,
                subject: card,
              })),
          ],
        });
      }
      // D-217 (CR 603.7c): the amount of mana "spent to cast that spell" and the player "its controller" are what the spell was as this resolves.
      const inner = effect.effect;
      let player: SeatId | undefined;
      let baked: Effect = bakeStillExiled(inner, res.lastMoved ?? []);
      if (
        inner.kind === 'addMana' &&
        inner.mana.kind === 'fixed' &&
        inner.mana.times !== undefined
      ) {
        baked = {
          ...inner,
          mana: { ...inner.mana, times: amountOf(state, inner.mana.times, ctx, targets) },
        };
      } else if (inner.kind === 'draw' && inner.player.kind !== 'you') {
        player = resolvePlayers(state, inner.player, ctx, targets)[0];
        if (player === undefined) return done(state);
        baked = { ...inner, player: { kind: 'triggerPlayer' } };
      }
      const ability: TriggeredAbility = { kind: 'triggered', trigger, effect: baked };
      return done({
        ...state,
        delayedTriggers: [
          ...state.delayedTriggers,
          {
            source: res.source,
            controller: res.controller,
            ability,
            ...(player === undefined ? {} : { player }),
          },
        ],
      });
    }

    case 'delayedCast': {
      // CR 603.7, 603.7a, 603.7b, 603.7d, 514.2 (D-336): "When you next cast an instant or sorcery spell this turn, copy that spell": a delayed triggered
      // ability of the controller of the spell or ability as it resolved, on a cast by that player of a spell the filter names. It is found after events that
      // happen after this (`findDelayedTriggers`: the cast that made it is already past), triggers once and ends with the turn.
      const ability: TriggeredAbility = {
        kind: 'triggered',
        trigger: { kind: 'castSpell', filter: effect.filter, by: 'you' },
        effect: effect.effect,
      };
      return done({
        ...state,
        delayedTriggers: [
          ...state.delayedTriggers,
          { source: res.source, controller: res.controller, ability, untilEndOfTurn: true },
        ],
      });
    }

    case 'createEmblem': {
      // CR 114.1, 114.2 (D-201): the controller of the effect gets the emblem.
      const r = createEmblem(state, res.controller, effect.abilities, effect.text);
      return done(r.state, r.events);
    }

    case 'empowerJace':
      // CR 701.71a (D-201): the token, the choice and the counters come up as the instruction runs (rules/empower.ts).
      return done(state, [], [{ kind: 'empowerJace', amount: effect.amount, chosen: null }]);

    case 'amass':
      // CR 701.47a (D-367): N is read now (CR 608.2h); the token, the choice of the Army and the counters come up as the instruction runs (rules/amass.ts).
      return done(
        state,
        [],
        [
          {
            kind: 'amass',
            subtype: effect.subtype,
            amount: Math.max(0, amountOf(state, effect.count, ctx, targets)),
            chosen: null,
          },
        ],
      );

    case 'pair':
      // CR 702.95a, 702.95c (D-286): the creature to pair with is chosen as this comes up (rules/soulbond.ts).
      return done(state, [], [{ kind: 'pair', partner: effect.partner, chosen: null }]);

    case 'ringTempts':
      // CR 701.54a (D-196): the controller's Ring-bearer is chosen as this comes up (rules/ring.ts).
      return done(state, [], [{ kind: 'ringTempts', chosen: null }]);

    case 'delayedSacrifice': {
      // CR 603.7, 701.54c (D-196): about the creature whose event triggered the ability (the blocker): at the end of combat its controller
      // sacrifices it. The delayed ability belongs to the controller of the Ring's ability and names that creature (CR 603.7c).
      const blocker = res.triggerSubject;
      if (blocker === undefined) return done(state);
      const ability: TriggeredAbility = {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'combatEnd', whose: 'each' },
        effect: { kind: 'sacrifice', objects: { kind: 'this' }, byController: true },
      };
      return done({
        ...state,
        delayedTriggers: [
          ...state.delayedTriggers,
          { source: blocker, controller: res.controller, ability },
        ],
      });
    }

    case 'becomeMonarch': {
      // CR 725.1, 725.3 (D-127): the designation moves to the one player the selector names (nobody when that
      // player is gone, e.g. the controller of a creature that is no longer known); a player already the monarch
      // stays it and nothing is emitted.
      const [seat] = resolvePlayers(state, effect.player, ctx, targets);
      if (seat === undefined) return done(state);
      const r = becomeMonarch(state, seat);
      return done(r.state, r.events);
    }

    case 'may':
      // CR 608.2d (D-135): "you may [do something]": the controller is asked as this comes up, and what the doing of it counts
      // for "if you do" starts again at 0 (`resetPerformed`). Declining drops only this instruction.
      return {
        ...done(state, [], [{ kind: 'mayEffect', effect: effect.effect, answer: null }]),
        resetPerformed: true,
      };

    case 'chooseOne':
      // CR 608.2d (D-175): the controller chooses one of the offered instructions as this comes up (rules/choose-one.ts).
      return done(
        state,
        [],
        [
          {
            kind: 'chooseOne',
            options: effect.options,
            chosen: null,
            // D-229: "Target player adds one mana of any color": the target player chooses.
            ...(effect.chooser === undefined
              ? {}
              : (() => {
                  const chooser = resolvePlayers(state, effect.chooser, ctx, targets)[0];
                  return chooser === undefined ? {} : { chooser };
                })()),
          },
        ],
      );

    case 'vote':
      // CR 701.38a (D-194): each player votes in turn order from the controller (rules/vote.ts).
      return done(state, [], [{ kind: 'vote', options: effect.options, cast: [] }]);

    case 'reflexive':
      // CR 603.12 (D-135): "When you do, ...": a triggered ability, if the `may` before it was done (rules/may-effects.ts).
      return runReflexive(state, res, effect);

    case 'exileTop':
      // D-151: "Exile the top card of your library" (rules/impulse.ts).
      return runExileTop(state, res, effect, ctx, targets);
    case 'extraCombat':
      // CR 500.8 (D-151, D-187): one more combat phase directly after the phase that is going on (or after the one of the turn's own sequence an added
      // phase follows); the most recently created one occurs first.
      return done({
        ...state,
        turn: {
          ...state.turn,
          addedPhases: [
            {
              phase: 'combat',
              after: state.turn.addedAfter ?? state.turn.phase,
              ...(effect.atBeginning === undefined
                ? {}
                : {
                    atBeginning: {
                      source: res.source,
                      controller: res.controller,
                      effect: effect.atBeginning,
                    },
                  }),
            },
            ...(state.turn.addedPhases ?? []),
          ],
        },
      });
    case 'extraBeginningPhase':
      // CR 500.8 (D-356): a whole beginning phase directly after the phase that is going on; the most recently created one occurs first, so a second
      // one added in the same step goes before the first (both happen before the end step they were added in front of).
      return done({
        ...state,
        turn: {
          ...state.turn,
          addedPhases: [
            { phase: 'beginning', after: state.turn.addedAfter ?? state.turn.phase },
            ...(state.turn.addedPhases ?? []),
          ],
        },
      });
    case 'enterAttacking':
      // CR 508.4 (D-151): creatures put onto the battlefield attacking (rules/enter-attacking.ts).
      return runEnterAttacking(state, res, effect, ctx, targets);
    case 'mayPlay':
      // D-151: "You may play that card this turn" (rules/impulse.ts).
      return runMayPlay(state, res, effect);
    case 'mayCast':
      // CR 601.2, 611.2a (D-135): "You may cast target [card] from your graveyard this turn" (rules/may-effects.ts).
      return runMayCast(state, res, effect, ctx, targets);

    case 'mayPay': {
      // CR 702.101a (D-120): the controller may pay; the effect runs only if they do (rules/pay-unless.ts).
      // D-364 (CR 119.4, 608.2c): a payment of life by an amount ("pay that much life") is worked out now; one of 0 life is no offer.
      const cost = resolveMayPayCost(state, effect.cost, ctx);
      if (cost === null) return done(state);
      return done(
        state,
        [],
        [
          {
            kind: 'unlessPays' as const,
            seat: res.controller,
            cost,
            stage: 'ask' as const,
            effect: effect.effect,
            optional: false,
            ifPaid: true as const,
          },
        ],
      );
    }

    case 'draw': {
      const count = amountOf(state, effect.count, ctx, targets);
      // D-217 (CR 121.1, 608.2d): "may draw up to two cards": the player who draws chooses how many.
      if (effect.upTo === true) {
        return done(
          state,
          [],
          count <= 0
            ? []
            : resolvePlayers(state, effect.player, ctx, targets).map((seat) => ({
                kind: 'drawUpTo' as const,
                seat,
                max: count,
                amount: null,
              })),
        );
      }
      // CR 121.2: one card at a time, so a commander drawn (CR 903.9b) can ask its owner between two
      // draws of the same instruction; the draws run as instructions (rules/draw.ts).
      return done(
        state,
        [],
        count <= 0
          ? []
          : resolvePlayers(state, effect.player, ctx, targets).map((seat) => ({
              kind: 'draw' as const,
              seat,
              count,
              commanderChoice: null,
            })),
      );
    }

    case 'mill': {
      // CR 701.17a (D-131): each player the selector names mills the amount, in the order CR 101.4 gives.
      const count = amountOf(state, effect.count, ctx, targets);
      if (count <= 0) return done(state);
      for (const seat of resolvePlayers(state, effect.player, ctx, targets)) {
        const r = millCards(next, seat, count);
        next = r.state;
        events.push(...r.events);
      }
      // D-135: "if you do" counts the cards actually milled.
      const milled = events.reduce((n, e) => n + (e.kind === 'milled' ? e.objects.length : 0), 0);
      // D-210: "the total mana value of those cards": read from the cards as they are in the graveyard (a card's mana value does not change there).
      const value = events.reduce(
        (n, e) =>
          e.kind === 'milled'
            ? n +
              e.objects.reduce((m, id) => {
                const card = next.objects[id];
                return (
                  m + (card === undefined ? 0 : manaValueOfCost(derive(next, card).manaCost, card))
                );
              }, 0)
            : n,
        0,
      );
      // D-327 (CR 400.7j): the cards milled are what `moved` names afterwards ("Mill a card. You may play that card this turn."): new objects in the graveyard.
      const cardsMilled = events.flatMap((e) => (e.kind === 'milled' ? e.objects : []));
      return {
        ...done(next, events),
        performed: milled,
        lastMoved: cardsMilled,
        ...(value > 0 ? { thisWay: { milledValue: value } } : {}),
      };
    }

    case 'manifest':
      // CR 701.40a (D-309): the top card of a library goes onto the battlefield face down as a 2/2 creature.
      return runManifest(state, effect, ctx, targets);

    case 'gainLife':
    case 'loseLife': {
      const everyone = amountOf(state, effect.amount, ctx, targets);
      let lost = 0;
      for (const seat of resolvePlayers(state, effect.player, ctx, targets)) {
        // D-365: "the life that player lost this turn" is each player's own number, read before they lose any more.
        const amount = lifeAmountFor(next, effect.amount, seat, () => everyone);
        const r =
          effect.kind === 'gainLife'
            ? gainLifeOf(next, seat, amount)
            : loseLifeOf(next, seat, amount);
        next = r.state;
        events.push(...r.events);
        // CR 702.101a (D-120): the life lost is remembered for "the total life lost this way".
        if (effect.kind === 'loseLife') lost += Math.max(0, amount);
      }
      return { ...done(next, events), ...(lost > 0 ? { lifeLost: lost } : {}) };
    }

    case 'meld':
      // CR 701.42a (D-278): exile the permanent and its counterpart, then meld them.
      return runMeld(state, res, effect);

    case 'loseGame': {
      // CR 104.3e (D-269): "each player this creature attacked this turn loses the game": the players the selector names lose it together.
      const lost = loseTheGame(next, resolvePlayers(state, effect.player, ctx, targets));
      return done(lost.state, [...events, ...lost.events]);
    }

    case 'setLifeTotal': {
      // CR 119.5 (D-201): the player gains or loses the life that takes their life total to the number; a player who has it already does neither.
      for (const seat of resolvePlayers(state, effect.player, ctx, targets)) {
        const delta = effect.amount - getSeat(next, seat).life;
        if (delta === 0) continue;
        const r = delta > 0 ? gainLifeOf(next, seat, delta) : loseLifeOf(next, seat, -delta);
        next = r.state;
        events.push(...r.events);
      }
      return done(next, events);
    }

    case 'tap':
    case 'untap': {
      const tapped = effect.kind === 'tap';
      const what = effect.objects;
      if (what.kind === 'choose') {
        // CR 701.26a, 608.2d (D-216): "Untap up to three lands": the controller chooses what to untap, none up to `count`.
        if (!tapped) {
          const most = amountOf(state, what.count ?? 1, ctx, targets);
          if (most <= 0) return done(state);
          return done(
            state,
            [],
            [
              {
                kind: 'chooseTap' as const,
                filter: what.filter,
                count: most,
                chosen: null,
                anyNumber: true as const,
                untap: true as const,
              },
            ],
          );
        }
        // CR 701.26a, 608.2d (D-139): "tap X untapped Myr you control": the controller chooses what to tap.
        const count = what.anyNumber === true ? 0 : amountOf(state, what.count ?? 1, ctx, targets);
        if (count <= 0 && what.anyNumber !== true) return done(state);
        return done(
          state,
          [],
          [
            {
              kind: 'chooseTap' as const,
              filter: what.filter,
              count,
              chosen: null,
              ...(what.anyNumber === true ? { anyNumber: true as const } : {}),
            },
          ],
        );
      }
      let changed = 0;
      for (const id of resolveObjects(state, what, ctx, targets)) {
        const obj = next.objects[id];
        if (obj?.zone !== 'battlefield' || obj.tapped === tapped) continue;
        if (!tapped) {
          // CR 122.1d (D-145): a permanent with a stun counter loses a counter instead of untapping.
          const r = untapPermanent(next, id);
          next = r.state;
          events.push(...r.events);
          continue;
        }
        next = patchObject(next, id, { tapped });
        events.push({ kind: 'tapped', object: id });
        changed += 1;
      }
      // D-139: "the number tapped this way" and "if you do" read what a `tap` effect did.
      return tapped
        ? { ...done(next, events), thisWay: { tapped: changed }, performed: changed }
        : done(next, events);
    }

    case 'reselectAttack': {
      // CR 508.7 (D-139): the controller of the effect reselects what each named attacking creature attacks.
      return done(
        state,
        [],
        resolveObjects(state, effect.objects, ctx, targets).map((object) => ({
          kind: 'reselectAttack' as const,
          object,
          chosen: null,
        })),
      );
    }

    case 'addMana': {
      // Spells that add mana: choice of color is not offered here; supported only for fixed mana.
      const production = effect.mana;
      if (production.kind !== 'fixed') return done(state);
      // D-229: "Target player adds one mana of any color": the pool of the player the selector names.
      const adder =
        effect.player === undefined
          ? res.controller
          : resolvePlayers(state, effect.player, ctx, targets)[0];
      if (adder === undefined) return done(state);
      const seat = getSeat(state, adder);
      // D-151: "Add {R} for each tapped land your opponents control": the mana is added once for each of the amount.
      const times =
        production.times === undefined ? 1 : amountOf(state, production.times, ctx, targets);
      // D-183: the mana carries the card types of its source, as it is now or as it last was (CR 113.7a).
      const live = res.source === null ? undefined : state.objects[res.source];
      const sourceTypes =
        res.source === null
          ? []
          : live !== undefined
            ? derive(state, live).types
            : (state.lki[res.source]?.characteristics.types ?? []);
      const added = Array.from({ length: Math.max(0, times) }, () =>
        production.mana.map((color) => ({
          color,
          snow: false,
          source: res.source,
          restriction: null,
          ...(sourceTypes.length === 0 ? {} : { sourceTypes }),
        })),
      ).flat();
      if (added.length === 0) return done(state);
      next = setSeat(next, { ...seat, manaPool: [...seat.manaPool, ...added] });
      return done(next, [{ kind: 'manaAdded', seat: adder, count: added.length }]);
    }

    case 'addCounters': {
      const count = amountOf(state, effect.count, ctx, targets);
      if (count <= 0) return done(state);
      // CR 122.6, 101.2 (D-380): a permanent that can't have counters of the kind gets none, and nothing happens to it.
      const blockers = counterBlockers(state);
      for (const id of resolveObjects(state, effect.objects, ctx, targets)) {
        const obj = next.objects[id];
        if (!obj) continue;
        if (blocks(state, blockers, obj, effect.counter)) continue;
        next = patchObject(next, id, {
          counters: {
            ...obj.counters,
            [effect.counter]: (obj.counters[effect.counter] ?? 0) + count,
          },
        });
        events.push({
          kind: 'counterAdded',
          object: id,
          counter: effect.counter,
          count,
          by: ctx.controller,
        });
      }
      return done(next, events);
    }

    case 'createCopies': {
      // D-213 (CR 707.2, 707.9b): a token for each permanent the group names, with the copiable values of that permanent and the abilities the exceptions add.
      // They are created together, so the replacement effects of their creation are settled once for all of them (D-221, CR 616.1).
      const wanted: TokenBatch[] = [];
      for (const id of resolveObjects(state, effect.objects, ctx, targets)) {
        const original = state.objects[id] ?? state.lki[id]?.object;
        if (original === undefined) continue;
        const values = copiableValues(state, original);
        const prepareOf = prepareCardOf(state, original); // CR 722.2b (D-225)
        wanted.push({
          definition: {
            ...values.characteristics,
            abilities: [...values.abilities, ...(effect.abilities ?? [])],
            ...(prepareOf === null ? {} : { prepareOf }),
          },
          count: 1,
          original: true,
        });
      }
      const made = makeSettled(state, res, res.controller, wanted, false, flow);
      if (made.kind === 'asked') return asking(state, made);
      return { ...done(made.state, made.events, made.front), lastMoved: made.created };
    }

    case 'createToken': {
      // CR 111.2: the player who creates the tokens owns them and controls them: the controller of
      // the effect, or the player the effect names ("Its controller creates ...", from last-known
      // information if the target left, CR 608.2h).
      const count = amountOf(state, effect.count, ctx, targets);
      const described = tokenDefinitionOf(state, effect.token, ctx, targets);
      if (described === null) return done(state);
      // D-231 (CR 111.4): "an X/X token, where X is ...": the amount is read as the token is created.
      const definition =
        effect.token.kind === 'custom' && effect.token.ptAmount !== undefined
          ? {
              ...described,
              power: amountOf(state, effect.token.ptAmount, ctx, targets),
              toughness: amountOf(state, effect.token.ptAmount, ctx, targets),
            }
          : described;
      const creators =
        effect.controller === undefined
          ? [res.controller]
          : resolvePlayers(state, effect.controller, ctx, targets);
      // CR 614.12a (D-100): a token that asks "As this enters, choose ..." is created one at a time,
      // the resolution stopping for each answer.
      const front: Instruction[] = [];
      let created: ObjectId[] = [];
      for (const seat of creators) {
        // D-221 (CR 616.1): the replacement effects of the creation are settled with the creator's answers; then the tokens are made, those that ask (D-185:
        // a choice, riot, devour, a land copy's question) one instruction each.
        const made = makeSettled(
          next,
          res,
          seat,
          [{ definition, count, original: true }],
          effect.tapped === true,
          flow,
        );
        if (made.kind === 'asked') return asking(state, made);
        next = made.state;
        events.push(...made.events);
        front.push(...made.front);
        created = [...created, ...made.created];
      }
      // D-230 (CR 607.2a): a token that copies a creature and links the cards exiled by the effect before it remembers them.
      if (effect.token.kind === 'copyOf' && effect.token.linkExiled === true) {
        const exiled = (ctx.moved ?? []).filter((id) => next.objects[id]?.zone === 'exile');
        for (const id of created) next = patchObject(next, id, { linkedExile: exiled });
      }
      // D-139: "create a token, then attach this to it": the tokens just created are what `moved` ("it") names (CR 400.7j
      // reads it for a new object; here the object is new from the start).
      return { ...done(next, events, front), lastMoved: created };
    }

    case 'shuffle': {
      let shuffled = 0;
      for (const seat of resolvePlayers(state, effect.player, ctx, targets)) {
        const r = shuffleLibrary(next, seat);
        next = r.state;
        events.push(...r.events);
        shuffled += 1;
      }
      // D-216: a shuffle is something the controller did, for the `may` that offered it.
      return { ...done(next, events), performed: shuffled };
    }

    case 'rollDie': {
      // CR 706.1, 706.2 (D-271): the controller rolls one die; the result stays for the rest of this resolution, which `dieResult` reads.
      const rolled = rollDie(next, res.controller, effect.sides);
      return { ...done(rolled.state, rolled.events), dieResult: rolled.result };
    }

    case 'playersMay': {
      // D-210 (CR 608.2d, 101.4): each player named, in order, is asked whether to do it.
      const asked: Instruction[] = resolvePlayers(state, effect.players, ctx, targets).map(
        (seat) => ({
          kind: 'playerMay' as const,
          seat,
          effect: effect.effect,
          ...(effect.runsAs === 'chooser' ? { as: seat } : {}),
          ...(effect.otherwise === undefined ? {} : { otherwise: effect.otherwise }),
          answer: null,
        }),
      );
      return done(state, [], asked);
    }

    case 'gainEnergy': {
      // CR 107.14, 122.1 (D-209): "You get {E}{E}": the player puts that many energy counters on themselves.
      const amount = amountOf(state, effect.amount, ctx, targets);
      if (amount <= 0) return done(state);
      for (const seat of resolvePlayers(state, effect.player, ctx, targets)) {
        const had = getSeat(next, seat).energy ?? 0;
        next = patchSeat(next, seat, { energy: had + amount });
        events.push({ kind: 'energyChanged', seat, from: had, to: had + amount });
      }
      return done(next, events);
    }

    case 'connive': {
      // CR 701.50a, 701.50b, 701.50c (D-209, D-223): each permanent named connives, the players in APNAP order choosing among theirs (rules/connive.ts).
      return done(
        state,
        [],
        conniveInstruction(state, resolveObjects(state, effect.objects, ctx, targets)),
      );
    }

    case 'discard': {
      // CR 701.9: each player named discards that many cards, choosing which (CR 701.9b).
      const anyNumber = effect.anyNumber === true;
      const count = anyNumber ? 0 : amountOf(state, effect.count, ctx, targets);
      if (count <= 0 && !anyNumber) return done(state);
      const seats = resolvePlayers(state, effect.player, ctx, targets);
      return done(
        state,
        [],
        seats.map((seat) => ({
          kind: 'discard' as const,
          seat,
          count,
          ...(anyNumber ? { anyNumber: true as const } : {}),
          ...(effect.random === true ? { random: true as const } : {}),
          ...(effect.unless === undefined ? {} : { unless: effect.unless }),
          chosen: null,
        })),
      );
    }

    case 'gainLevel': {
      // CR 716.2a (D-235): "This Class's level becomes N": the permanent the ability belongs to, if it is still on the battlefield.
      const source = res.source === null ? undefined : state.objects[res.source];
      if (source?.zone !== 'battlefield') return done(state);
      return { ...done(patchObject(state, source.id, { level: effect.level })), performed: 1 };
    }

    case 'exileRandomFromGraveyard': {
      // CR 701.13 (D-235): one card of the controller's graveyard, chosen by the game's random number generator.
      const yard = getSeat(state, res.controller).graveyard;
      if (yard.length === 0) return done(state);
      const [shuffled, rng] = shuffle(yard, state.rng);
      const [picked] = shuffled;
      if (picked === undefined) return done(state);
      return moving({ ...state, rng }, moveInstructions([picked], 'exile'));
    }

    case 'exileRandomFromHand':
      // CR 701.13 (D-393): one card of the hand of the player named, chosen by the game's random number generator (rules/exile-random-hand.ts).
      return runExileRandomFromHand(state, effect, ctx, targets);

    case 'phaseOut': {
      // CR 702.26a-g (D-234): the permanents phase out, with what is attached to them (rules/phasing.ts).
      const ids = resolveObjects(state, effect.objects, ctx, targets);
      return { ...done(phaseOut(state, ids)), performed: ids.length > 0 ? 1 : 0 };
    }

    case 'becomeCopyOfCard':
      // D-232: "... become a copy of an artifact or creature card from among those cards" (rules/copy-card.ts).
      return startCopyFromCards(state, res, effect, ctx, targets);

    case 'splitCostExiled':
      // D-232: "An opponent chooses one of the exiled cards. You put that card on the bottom of your library and return the other ..." (rules/activation-exile.ts).
      return startSplit(state, res);

    case 'returnGraveyardPair':
      // D-272: "Choose a creature card in an opponent's graveyard, then that player chooses ... You may return those cards ..." (rules/graveyard-pair.ts).
      return done(state, [], [startGraveyardPair(effect.cardType)]);

    case 'sparePermanents':
      // D-231: "For each player, you choose ... Then each player sacrifices all other nonland permanents they control" (rules/spare.ts).
      return done(state, [], [startSpare(state, effect.types)]);

    case 'exileOwnGraveyardCard': {
      // CR 701.13, 101.4 (D-231): each player named chooses a card of their own graveyard, in turn order from the active player; it is exiled.
      const seats = resolvePlayers(state, effect.players, ctx, targets);
      return done(
        state,
        [],
        seats.map((seat) => ({
          kind: 'chooseMove' as const,
          filter: { zone: 'graveyard' as const },
          count: 1,
          to: 'exile' as const,
          position: 'top' as const,
          seat,
          countsNonland: true as const,
          chosen: null,
        })),
      );
    }

    case 'scry':
    case 'surveil': {
      // CR 701.22b, 701.25c: scry 0 and surveil 0 are no event, so nothing is queued.
      const count = amountOf(state, effect.count, ctx, targets);
      if (count <= 0) return done(state);
      const seats = resolvePlayers(state, effect.player ?? { kind: 'you' }, ctx, targets);
      return done(
        state,
        [],
        seats.map((seat) => ({
          kind: 'arrange' as const,
          purpose: effect.kind,
          seat,
          count,
          arranged: null,
        })),
      );
    }

    case 'lookAndSplit': {
      // D-216: "Look at the top three cards of your library. Put one of them into your hand, put one of them on the bottom of your library, and
      // exile one of them" (rules/look-split.ts).
      const count = amountOf(state, effect.count, ctx, targets);
      if (count <= 0) return done(state);
      return done(
        state,
        [],
        [
          {
            kind: 'lookSplit',
            seat: res.controller,
            count,
            hand: effect.hand,
            bottom: effect.bottom,
            exile: effect.exile,
            chosen: null,
          },
        ],
      );
    }

    case 'revealAndSeparate': {
      // D-303 (CR 700.3, 701.20): "Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your
      // graveyard" (rules/pile-separate.ts).
      return startPileSeparate(state, res, effect, amountOf(state, effect.count, ctx, targets));
    }

    case 'lookAtTop': {
      // D-139: "look at the top six cards ... You may reveal an artifact card from among them and put it into your hand ... the rest on the
      // bottom in a random order" (rules/look-take.ts).
      const count = amountOf(state, effect.count, ctx, targets);
      if (count <= 0) return done(state);
      return done(
        state,
        [],
        [
          {
            kind: 'lookTake',
            stage: 'take',
            seat: res.controller,
            count,
            filter: effect.take.filter,
            max: effect.take.max,
            ...(effect.take.to === undefined ? {} : { to: effect.take.to }),
            ...(effect.take.min === undefined ? {} : { min: effect.take.min }),
            ...(effect.take.tapped === true ? { tapped: true as const } : {}),
            // CR 202.3 (D-145): "with mana value less than or equal to the number of lands you control", worked out as the effect runs.
            ...(effect.take.manaValueAtMost === undefined
              ? {}
              : { manaValueAtMost: amountOf(state, effect.take.manaValueAtMost, ctx, targets) }),
            ...(effect.take.totalManaValue === undefined
              ? {}
              : { totalManaValue: effect.take.totalManaValue }),
            // D-324 (CR 701.20a): "Put two of them into your hand" does not reveal them.
            ...(effect.take.hidden === true ? { hidden: true as const } : {}),
            // CR 701.20a (D-396): "Reveal the top five cards of your library" shows every one of them.
            ...(effect.revealAll === true ? { revealAll: true as const } : {}),
            rest: effect.rest,
            chosen: null,
          },
        ],
      );
    }

    case 'castCard': {
      // CR 608.2g, 608.2b (D-350): "you may cast target [card] from a graveyard": the target, if it is still a legal one (rules/cast-card.ts).
      const [card] = resolveObjects(state, effect.object, ctx, targets);
      if (card === undefined) return done(state);
      return done(
        state,
        [],
        [
          {
            kind: 'castCard',
            stage: 'start',
            card,
            anyManaType: effect.anyManaType === true,
            exileInstead: effect.exileInstead === true,
          },
        ],
      );
    }

    case 'castFree':
      // CR 608.2g (D-145): "You may cast a spell ... without paying its mana cost" (rules/cast-free.ts).
      return done(
        state,
        [],
        [{ kind: 'castFree', objects: effect.objects, play: effect.play === true, chosen: null }],
      );

    case 'fight': {
      // CR 701.14 (D-145): creatures fight. The creatures are read as the effect begins.
      const fighters = resolveObjects(state, effect.fighters, ctx, targets).filter((id) =>
        isFightingCreature(state, id),
      );
      const against = resolveObjects(state, effect.against, ctx, targets).filter((id) =>
        isFightingCreature(state, id),
      );
      if (effect.pairing === 'differentChosen') {
        return done(
          state,
          [],
          [{ kind: 'fightPairs', fighters, pool: against, pairs: [], chosen: null }],
        );
      }
      const [a, b] = [fighters[0], against[0]];
      if (a === undefined || b === undefined) return done(state);
      const r = fightOnce(state, a, b, flow);
      if ('decision' in r) return { state, events: [], front: [], needs: r.decision };
      return { ...done(r.state, r.events), performed: r.fought ? 1 : 0 };
    }

    case 'revealUntil':
      // CR 701.20, 401.4 (D-145): reveal until a card matches, put it somewhere, the rest on the bottom in a random order.
      return runRevealUntil(state, res, effect);

    case 'lookAndReorder': {
      const count = amountOf(state, effect.count, ctx, targets);
      if (count <= 0) return done(state);
      return done(
        state,
        [],
        [{ kind: 'arrange', purpose: 'reorder', seat: res.controller, count, arranged: null }],
      );
    }

    case 'putFromHandOnTop': {
      const count = amountOf(state, effect.count, ctx, targets);
      if (count <= 0) return done(state);
      return done(state, [], [{ kind: 'putOnTop', seat: res.controller, count, chosen: null }]);
    }

    case 'search':
      // CR 701.23a: each player the effect names searches their own library, in turn; a "may"
      // search is asked first (accepted stays null until answered, rules/search.ts). D-177, CR 400.7j: what the search
      // finds is "it" for the instructions after it ("Then if you control four or more lands, untap that land"): `moved`
      // starts empty and each card the search puts somewhere is added as it moves.
      return {
        ...done(
          state,
          [],
          resolvePlayers(state, effect.player, ctx, targets).map((seat) => ({
            kind: 'search' as const,
            search: effect,
            seat,
            accepted: effect.optional === true ? null : true,
            chosen: null,
          })),
        ),
        lastMoved: [],
      };

    case 'attach': {
      // CR 701.3: each permanent the first reference names is attached to the first the second
      // names. One that is gone, or cannot be attached there, does not move (CR 701.3b).
      const hostId = resolveObjects(state, effect.to, ctx, targets)[0];
      if (hostId === undefined) return done(state);
      let attached = 0;
      for (const id of resolveObjects(state, effect.object, ctx, targets)) {
        const r = attachObject(next, id, hostId);
        next = r.state;
        events.push(...r.events);
        if (r.events.some((e) => e.kind === 'attached')) attached += 1;
      }
      // D-206 (CR 701.3b): "you may attach it to target creature you control. If you do, ...": it was done when something was attached.
      return { ...done(next, events), performed: attached };
    }

    case 'removeAllCounters': {
      // CR 122.1, 122.2 (D-207): each counter of each kind comes off, one event for each kind.
      let cleared: GameState = next;
      const removed: GameEvent[] = [];
      for (const id of resolveObjects(state, effect.objects, ctx, targets)) {
        const obj = cleared.objects[id];
        if (obj?.zone !== 'battlefield') continue;
        for (const [counter, count] of Object.entries(obj.counters)) {
          if (count > 0) removed.push({ kind: 'counterRemoved', object: id, counter, count });
        }
        if (Object.keys(obj.counters).length > 0)
          cleared = patchObject(cleared, id, { counters: {} });
      }
      return done(cleared, removed);
    }

    case 'proliferate':
      // CR 701.34a (D-149): the controller chooses the permanents and players to give counters to (rules/proliferate.ts).
      return done(state, [], [{ kind: 'proliferate', chosen: null, players: [] }]);

    case 'conditional': {
      // CR 608.2c: the condition is read now, as this instruction comes up, after everything
      // before it has happened. The chosen branch runs next, ahead of the rest of the queue.
      const holds = evaluateCondition(state, effect.condition, {
        ...ctx,
        targets,
        ...(res.performed === undefined ? {} : { performed: res.performed }),
        // D-271: "If the result is 1": the die the earlier instruction rolled.
        ...(res.dieResult === undefined ? {} : { dieResult: res.dieResult }),
      });
      const chosen = holds ? effect.effect : effect.else;
      return chosen === undefined
        ? done(state)
        : done(state, [], [{ kind: 'effect', effect: chosen }]);
    }

    case 'transform':
      // CR 701.27: the other face of a double-faced permanent comes up; it stays the same object.
      return runTransform(state, res, effect, ctx, targets);

    case 'becomeCopy':
      // CR 707.2, 613.2a: a layer 1 effect that gives the object the copiable values of another.
      return runBecomeCopy(state, effect, ctx, targets);

    case 'cascade':
      // CR 702.85a: exile until a cheaper nonland card, may cast it free, bottom the rest (rules/cascade.ts).
      return done(state, [], [{ kind: 'cascade', stage: 'start', exiled: [], found: null }]);

    case 'payAnyAmount':
      // D-151: asked how many times to pay, then paid, then the reflexive ability (rules/pay-amount.ts, rules/may-effects.ts).
      return effect.paid === undefined
        ? done(state, [], [{ kind: 'payAmount', seat: res.controller, effect, amount: null }])
        : runPaidReflexive(state, res, effect);

    case 'behold':
      // CR 701.4 (D-151): reveal a card from the hand or choose a permanent that matches (rules/behold.ts).
      return done(
        state,
        [],
        [{ kind: 'behold', seat: res.controller, filter: effect.filter, chosen: null }],
      );

    case 'revealTop':
      // CR 701.20 (D-151): reveal the top card, and put it onto the battlefield if it matches (rules/reveal-top.ts).
      return runRevealTop(state, res, effect, ctx, targets);

    case 'exileUntilCast':
      // CR 701.57 (D-151): Discover and "exile until you exile a nonland card; you may cast it, else put it into your hand".
      return done(
        state,
        [],
        [
          {
            kind: 'cascade',
            stage: 'start',
            exiled: [],
            found: null,
            variant: {
              ...(effect.foundAtMost === undefined ? {} : { foundAtMost: effect.foundAtMost }),
              ...(effect.castAtMost === undefined ? {} : { castAtMost: effect.castAtMost }),
              rest: effect.rest,
            },
          },
        ],
      );

    case 'unearth': {
      // CR 702.84a (D-124): "Return this card from your graveyard to the battlefield." The card is the source of
      // the ability; if it is no longer that object in a graveyard (it left: CR 400.7) there is nothing to
      // return, and the ability does nothing. It enters under its owner's control, which is the activator's.
      const card = state.objects[res.source];
      if (card === undefined || card.zone !== 'graveyard') return done(state);
      return moving(state, [
        {
          kind: 'move',
          object: card.id,
          to: 'battlefield',
          position: 'top',
          tapped: false,
          commanderChoice: null,
          controller: 'you',
          alt: 'unearth',
        },
      ]);
    }

    case 'encore': {
      // CR 702.141a (D-185): "For each opponent, create a token that's a copy of this card ...". The card was exiled as the cost, so it is read
      // from its last-known information in the graveyard (CR 113.7a); a card that is not known has nothing to copy.
      const original = objectOrLki(state, res.source);
      if (original === null) return done(state);
      const values = copiableValues(state, original);
      const prepareOf = prepareCardOf(state, original); // CR 722.2b (D-225)
      const definition = {
        ...values.characteristics,
        abilities: values.abilities,
        ...(prepareOf === null ? {} : { prepareOf }),
      };
      const opponents = resolvePlayers(state, { kind: 'eachOpponent' }, ctx, targets);
      return {
        ...done(
          state,
          [],
          opponents.map((opponent) => ({
            kind: 'enterToken' as const,
            seat: res.controller,
            definition,
            chosen: null,
            encoreFor: opponent,
          })),
        ),
        lastMoved: [],
      };
    }

    case 'regenerate':
      // CR 701.19a: a regeneration shield for each permanent named (`rules/regenerate.ts`).
      return runRegenerate(state, effect, ctx, targets);

    case 'preventDamage':
      // CR 615: a prevention shield, read where damage is dealt (`rules/prevention.ts`).
      return runPreventDamage(state, effect, ctx, targets);

    case 'requireAttack':
      // CR 508.1d, 611.2c (D-179): a requirement on a group of creatures, read when attackers are declared.
      return runRequireAttack(state, effect, ctx);

    case 'gainControl':
      // CR 613.1b, 611.2 (D-189): a layer 2 effect (`rules/control-effects.ts`).
      return runGainControl(state, effect, ctx, targets);

    case 'modifyPt':
    case 'setPt':
    case 'loseAllAbilities':
    case 'setTypes':
    case 'setColors':
    case 'grantAbility':
    case 'grantKeyword':
    case 'restrict':
      // CR 611.2, 613: "gets +N/+N until end of turn", "loses all abilities", "becomes a Frog" and
      // the rest are continuous effects in the game state, applied by `derive` in their layers.
      return runContinuous(state, effect, ctx, targets);

    default: {
      const unreachable: never = effect;
      return unreachable;
    }
  }
}
