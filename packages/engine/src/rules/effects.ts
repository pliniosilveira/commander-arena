/**
 * The interpreter: executes the effects of a resolving spell or ability (CR 608.2). One
 * instruction at a time, so the engine can stop for a decision (CR 903.9b) and resume.
 *
 * It implements exactly the effect kinds in SUPPORTED_FEATURES. There is no "not implemented"
 * path: a card using any other kind is rejected by validateCard before it can be supported.
 */
import type { Effect, ObjectFilter, ObjectRef, ObjectSelector } from '../ast/types';
import { CREATURE_TYPES } from '../data/creature-types';
import type { ObjectId, SeatId } from '../ids';
import { shuffle } from '../rng';
import type { GameEvent } from '../state/events';
import {
  getObject,
  getSeat,
  objectsInZone,
  opponentsOf,
  patchObject,
  patchSeat,
  seatsInOrder,
  setSeat,
} from '../state/ops';
import type {
  ChosenTarget,
  GameState,
  Instruction,
  ResolutionContext,
  ThisWayCounts,
  TriggeredAbility,
} from '../state/types';
import { runSplitExiled, startSplit } from './activation-exile';
import { runAmass } from './amass';
import { runArrange, runPutOnTop } from './arrange';
import { runAssignControl } from './assign-control';
import { attachEntered, attachObject, unattach } from './attach';
import { pickRandom, runAttackRandomOpponent } from './attack-random-opponent';
import { entryAttachment, runAuraEntry, withAuraEntries } from './aura-entry';
import { runBehold } from './behold';
import { runBlight } from './blight-effect';
import { makeCardCopy } from './card-copy';
import { changeTargetInstructions } from './change-source';
import { runOpponentChoosesCard, startOpponentChoosesCard } from './choose-aside';
import { runChooseEach } from './choose-each';
import { runChooseNumber } from './choose-number';
import { runChooseOne } from './choose-one';
import { askBeforeEffect, opponentOf, runChooseOpponent } from './choose-opponent';
import { newClash, runClash } from './clash';
import { flipCoin } from './coin-flip';
import { enterCombatAttacking } from './combat-enter';
import { evaluateCondition } from './conditions';
import { conniveInstruction, runConniveNext } from './connive';
import {
  runBecomeCopy,
  runCantAttackPlaneswalkers,
  runCantBeBlockedByPlayer,
  runContinuous,
  runCreaturesCantAttackYou,
  runDoubleTokens,
  runEntersTappedGroup,
  runRequireAttack,
  runRequireAttackSource,
  runRestrictGroup,
} from './continuous';
import { controllerOf } from './control';
import { runExchangeControl, runGainControl, runReturnControl } from './control-effects';
import { copiableValues } from './copiable';
import { runCopyFromCards, startCopyFromCards } from './copy-card';
import { copiedSpell, copyInstructions } from './copy-source';
import { bonusCounters, counterBonuses, counterCountOn } from './counter-bonus';
import { runCounterPick } from './counter-pick';
import { blocks, counterBlocked, counterBlockers } from './counter-prevention';
import {
  asking,
  runDealDamage,
  runDealDamageToController,
  runDealDamageToSelf,
  runDealDividedDamage,
} from './damage-effects';
import { askingFlow, type OrderFlow, quietFlow } from './damage-order';
import { derive } from './derive';
import { UNEARTH_EXILE_ABILITY } from './derive-alt';
import { settleDestruction } from './destroy-replacement';
import { runDraw } from './draw';
import { runDrawUpTo } from './draw-up-to';
import { runVenture } from './dungeon';
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
import { requireAttackingPlayer } from './encore';
import { runEnterAttacking } from './enter-attacking';
import { auraTokenCanEnterAttached, runEnterToken } from './enter-token';
import { runGainEscape } from './escape-grant';
import { runExchangeLifeWithPt } from './exchange-life';
import { runExileAnyNumber } from './exile-any-number';
import { markExileOnResolve } from './exile-on-resolve';
import { runExilePiles, startExilePiles } from './exile-piles';
import { runExileRandomFromHand } from './exile-random-hand';
import { runExileUntilFound } from './exile-until-found';
import { runExplore } from './explore';
import { fightOnce, isFightingCreature, runFightPairs } from './fight';
import { runGainFlashbackFromManaCost } from './flashback-grant';
import { runMayCastEachType } from './free-cast-effect';
import { runGoad } from './goad';
import { runGraveyardPair, startGraveyardPair } from './graveyard-pair';
import { bakeStillExiled, runExileTop, runMayPlay } from './impulse';
import { takeInitiative } from './initiative';
import { lifeAmountFor, resolveMayPayCost } from './life-amounts';
import { runLookSplit } from './look-split';
import { runLookTake } from './look-take';
import { loseTheGame } from './lose-game';
import { runLoseLifeManaValue } from './lose-life-mana-value';
import { manaValueOfCost } from './mana-value';
import { runManifest } from './manifest';
import {
  runGainActivatedAbilitiesOf,
  runMayCast,
  runMayCastOneMilled,
  runMayCastSpells,
  runPaidReflexive,
  runReflexive,
} from './may-effects';
import { runMeld } from './meld';
import { successorsOf } from './melded';
import { millCards } from './mill';
import { runMiracleReveal } from './miracle';
import { becomeMonarch } from './monarch';
import { isCardZoneChoice, runChooseMove } from './move-choice';
import { runMoveCounters } from './move-counters';
import { runMyriad } from './myriad';
import { nextMainStep } from './next-main';
import { runNextSpellModifier } from './next-spell';
import { runNextSpellPayLife } from './next-spell-life';
import { runOwnerLibraryChoice } from './owner-library-choice';
import { phaseOut } from './phasing';
import { runPileSeparate, startPileSeparate } from './pile-separate';
import { runGrantCastAsThoughFlash } from './player-flash';
import { runGrantPlayerHexproof } from './player-hexproof';
import { runPlayerCantCast, runPlayerLock } from './player-lock';
import { runGrantPlayerManaAbility } from './player-mana';
import { runPopulate } from './populate';
import { becomePrepared, prepareCardOf } from './prepare';
import { runPreventDamage } from './prevention';
import { runProliferate } from './proliferate';
import {
  givesProtectionOfCardTypeChoice,
  givesProtectionOfChoice,
  runProtectionCardType,
  runProtectionColor,
} from './protection-choice';
import { runRegenerate } from './regenerate';
import { runRemoveFromCombat } from './remove-from-combat';
import { runReplaceEnchant } from './replace-enchant';
import { runReselectAttack } from './reselect-attack';
import { canBeCountered } from './restrictions';
import { runRevealTop } from './reveal-top';
import { runRevealTopBranches } from './reveal-top-branches';
import { runRevealTopCard } from './reveal-top-card';
import { runRevealTopDuel } from './reveal-top-duel';
import { runRevealUntil } from './reveal-until';
import { runRingTempts } from './ring';
import { rollDie } from './roll-die';
import { controlledCandidates, sacrificeCandidates, sacrificePermanent } from './sacrifice';
import { runChooseSacrifice, sacrificeInstructions } from './sacrifice-choice';
import { runDiscard, runSearch } from './search';
import {
  apnapOrder,
  matchesFilter,
  resolveObjects,
  resolvePlayers,
  type SelectContext,
} from './select';
import { recordTogether } from './simultaneous';
import { runPair } from './soulbond';
import { objectOrLki, sourceInfo } from './source-info';
import { runSpare, startSpare } from './spare';
import { increaseSpeed } from './speed';
import { done, type StepOutcome } from './step-outcome';
import { runChooseTap } from './tap-choice';
import { TIME_COUNTER } from './time-counter';
import { makeSettled } from './token-batch';
import type { TokenBatch } from './token-replacement';
import { runTransform } from './transform';
import { untapPermanent } from './untap';
import { runVote } from './vote';
import { winTheGame } from './win-game';
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
  // CR 608.2d, 801.5b: "an opponent separates ...": with more than one opponent left, the controller is asked which one before the effect starts.
  if (instruction.kind === 'chooseOpponent') return runChooseOpponent(state, res, instruction);
  if (instruction.kind === 'effect') {
    const asked = askBeforeEffect(state, res, instruction);
    if (asked !== null) return asked;
  }
  if (instruction.kind === 'choosePlayer') {
    // CR 608.2d, 119.1 (The Black Gate): the controller of the effect chooses among the players with the most life; with one candidate nothing is asked.
    if (instruction.chosen !== null) return done(state);
    const alive = Object.keys(state.seats)
      .map(Number)
      .filter((seat) => !getSeat(state, seat).hasLost);
    // CR 102.2 (Slithermuse): "choose an opponent" is any opponent of the controller still in the game; "the most life" (The Black Gate) the players with the greatest life total.
    const top = Math.max(...alive.map((seat) => getSeat(state, seat).life));
    const candidates =
      instruction.among === 'opponent'
        ? opponentsOf(state, res.controller).filter((seat) => !getSeat(state, seat).hasLost)
        : alive.filter((seat) => getSeat(state, seat).life === top);
    const [only] = candidates;
    if (only !== undefined && candidates.length === 1) {
      return { ...done(state), front: [{ ...instruction, chosen: only }] };
    }
    const info = sourceInfo(state, res.source);
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'chooseOption',
        seat: res.controller,
        purpose: 'playerChoice',
        options: candidates.map((seat) => `seat:${seat}`),
        source: res.object,
        sourceName: info?.name ?? '',
        sourceOracleText: info?.oracleText ?? '',
      },
    };
  }
  if (instruction.kind === 'chooseCreatureType') {
    if (instruction.chosen !== null) return done(state);
    const info = sourceInfo(state, res.source);
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'chooseOption',
        seat: instruction.seat ?? res.controller,
        purpose: 'creatureType',
        options: CREATURE_TYPES,
        source: res.object,
        sourceName: info?.name ?? '',
        sourceOracleText: info?.oracleText ?? '',
      },
    };
  }
  if (instruction.kind === 'chooseObjects') {
    if (instruction.chosen !== null) return done(state);
    const candidates = objectsInZone(state, instruction.filter.zone ?? 'battlefield').filter((id) =>
      matchesFilter(state, getObject(state, id), instruction.filter, contextOf(state, res)),
    );
    if (candidates.length === 0) return { ...done(state), front: [{ ...instruction, chosen: [] }] };
    const max = Math.min(instruction.count, candidates.length);
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'choosePermanent',
        seat: res.controller,
        source: res.object,
        purpose: 'effect',
        min: instruction.exactly === true ? max : 0,
        max,
        legal: candidates,
      },
    };
  }
  if (instruction.kind === 'sacrifice') {
    // CR 701.21a: only a permanent its controller still controls can be sacrificed. One that
    // already left (an earlier instruction moved it) is skipped (CR 608.2c).
    const r = sacrificePermanent(
      state,
      instruction.object,
      instruction.seat ?? res.controller,
      instruction.lkiRecorded === true,
    );
    // CR 702.110b (Exploit): the creature exploits a creature as its controller sacrifices one; the event comes before the move, so a creature that sacrificed itself is still on the
    // battlefield when the triggers of these events are read.
    const exploited: GameEvent[] =
      r === null || instruction.exploiter === undefined
        ? []
        : [
            {
              kind: 'exploited',
              seat: instruction.seat ?? res.controller,
              creature: instruction.exploiter,
              sacrificed: instruction.object,
            },
          ];
    // D-131: "for each creature sacrificed this way" counts the permanents that were sacrificed.
    return r === null
      ? done(state)
      : {
          ...done(r.state, [...exploited, ...r.events]),
          thisWay: {
            sacrificed: 1,
            sacrificedOwn: (instruction.seat ?? res.controller) === res.controller ? 1 : 0,
          },
          performed: 1,
          sacrificed: [instruction.object],
        };
  }
  if (instruction.kind === 'fightPairs') return runFightPairs(state, res, instruction, flow);
  if (instruction.kind === 'chooseSacrifice') return runChooseSacrifice(state, res, instruction);
  if (instruction.kind === 'chooseMove') return runChooseMove(state, res, instruction);
  if (instruction.kind === 'chooseTap') return runChooseTap(state, res, instruction);
  if (instruction.kind === 'chooseEach') return runChooseEach(state, res, instruction);
  if (instruction.kind === 'proliferate') return runProliferate(state, res, instruction);
  if (instruction.kind === 'auraEntry') return runAuraEntry(state, res, instruction);
  if (instruction.kind === 'reselectAttack') return runReselectAttack(state, res, instruction);
  if (instruction.kind === 'assignControl') return runAssignControl(state, res, instruction);
  if (instruction.kind === 'clash') return runClash(state, res, instruction);
  if (instruction.kind === 'chooseOne') return runChooseOne(state, res, instruction);
  if (instruction.kind === 'protectionColor') {
    return runProtectionColor(state, res, instruction, contextOf(state, res), targets);
  }
  if (instruction.kind === 'protectionCardType') {
    return runProtectionCardType(state, res, instruction, contextOf(state, res), targets);
  }
  if (instruction.kind === 'vote') return runVote(state, res, instruction);
  if (instruction.kind === 'ringTempts') return runRingTempts(state, res, instruction);
  if (instruction.kind === 'venture') return runVenture(state, res, instruction);
  if (instruction.kind === 'pair') return runPair(state, res, instruction);
  if (instruction.kind === 'empowerJace') return runEmpowerJace(state, res, instruction);
  if (instruction.kind === 'amass') return runAmass(state, res, instruction, flow);
  if (instruction.kind === 'populate') return runPopulate(state, res, instruction, flow);
  if (instruction.kind === 'blight') return runBlight(state, res, instruction);
  if (instruction.kind === 'moveCounters') return runMoveCounters(state, res, instruction);
  if (instruction.kind === 'counterPick') return runCounterPick(state, res, instruction);
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
  if (instruction.kind === 'chooseNumber') return runChooseNumber(state, res, instruction);
  if (instruction.kind === 'lookTake') return runLookTake(state, res, instruction);
  if (instruction.kind === 'lookSplit') return runLookSplit(state, res, instruction);
  if (instruction.kind === 'pileSeparate') return runPileSeparate(state, res, instruction);
  if (instruction.kind === 'exilePiles') return runExilePiles(state, res, instruction);
  if (instruction.kind === 'exileAnyNumber') return runExileAnyNumber(state, res, instruction);
  if (instruction.kind === 'opponentChoosesCard') {
    return runOpponentChoosesCard(state, res, instruction);
  }
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
    // CR 101.4 (`together`): the answer is held until the last player has answered; then each accepted effect, and each "otherwise", runs in the order the players answered.
    const { together: group, as: _own, ...rest } = instruction;
    const hold = (answer: boolean | null): StepOutcome => {
      const held =
        group === undefined || answer === null
          ? (group?.held ?? [])
          : [
              ...group.held,
              {
                seat: instruction.seat,
                ...(instruction.as === undefined ? {} : { as: instruction.as }),
                answer,
              },
            ];
      const next = group?.later[0];
      if (group !== undefined && next !== undefined) {
        return done(
          state,
          [],
          [
            {
              ...rest,
              seat: next.seat,
              ...(next.as === undefined ? {} : { as: next.as }),
              answer: null,
              together: { later: group.later.slice(1), held },
            },
          ],
        );
      }
      return done(
        state,
        [],
        held.map((h) => ({
          ...rest,
          seat: h.seat,
          ...(h.as === undefined ? {} : { as: h.as }),
          answer: h.answer,
        })),
      );
    };
    if (getSeat(state, instruction.seat).hasLost) {
      return group === undefined ? done(state) : hold(null);
    }
    if (group !== undefined && instruction.answer !== null) return hold(instruction.answer);
    if (instruction.answer === null) {
      const offered = instruction.effect;
      const player = instruction.as ?? res.controller;
      if (
        (offered.kind === 'sacrifice' &&
          offered.objects.kind === 'choose' &&
          offered.player === undefined &&
          sacrificeCandidates(state, player, res.source, offered.objects.filter, res.sacrificed)
            .length === 0) ||
        // CR 701.9 (Discard): a player with no card in hand cannot discard one, so they do not and the "if they don't" instruction is done for them (Professor Onyx's last
        // loyalty ability rules: an opponent with an empty hand loses the life). Nobody is asked about a discard of nothing when "if they don't" follows; without it the question is
        // asked as it always was (it is what the players who did the thing are counted from, Mog, Moogle Warrior).
        (offered.kind === 'discard' &&
          instruction.otherwise !== undefined &&
          offered.player.kind === 'you' &&
          offered.random !== true &&
          offered.hand !== true &&
          offered.anyNumber !== true &&
          getSeat(state, player).hand.length === 0)
      ) {
        // CR 101.4: with several players this player's "no" is held with the others' answers.
        if (group !== undefined) return hold(false);
        return instruction.otherwise === undefined
          ? done(state)
          : done(
              state,
              [],
              [{ kind: 'effect', effect: instruction.otherwise, declinedBy: instruction.seat }],
            );
      }
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
      [
        {
          kind: 'effect',
          effect: chosen,
          ...(as === undefined ? {} : { as }),
          ...(!instruction.answer ? { declinedBy: instruction.seat } : {}),
        },
      ],
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
      // CR 708.3: "return it to the battlefield face down": it is turned face down before it enters.
      ...(instruction.entersFaceDown === undefined
        ? {}
        : { entersFaceDown: instruction.entersFaceDown }),
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
      ...(res.entersProtector === undefined ? {} : { entersProtector: res.entersProtector }),
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
    // CR 400.7 (Animate Dead): the permanent it became remembers the permanent it was put onto the battlefield with.
    const remembered =
      instruction.putWith !== undefined && result.newObject !== null
        ? patchObject(result.state, result.newObject, { putWith: instruction.putWith })
        : result.state;
    const attached =
      instruction.attachTo !== undefined && result.newObject !== null
        ? attachEntered(remembered, result.newObject, instruction.attachTo)
        : { state: remembered, events: [] as GameEvent[] };
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
                instruction.lookBy !== undefined
                  ? { exiledFaceDown: true as const, lookers: [instruction.lookBy] }
                  : instruction.linkTo !== undefined
                    ? { hideaway: instruction.linkTo }
                    : { exiledFaceDown: true as const },
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
          {
            kind: 'landPlayed',
            seat: res.controller,
            object: result.newObject,
            ...(subject.zone === 'hand' ? {} : { fromZone: subject.zone }),
          },
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
    // CR 608.2c: a card that really went from a graveyard onto the battlefield is counted, for "for each card returned this way".
    const countedReturned =
      instruction.countsReturned === true &&
      result.newObject !== null &&
      hidden.objects[result.newObject]?.zone === 'battlefield';
    // Oversimplify (CR 608.2h): a creature that really went to exile adds its power, as it was before any of them left, to what its controller lost "this way".
    const exiledPower =
      instruction.exiledPower !== undefined &&
      result.newObject !== null &&
      hidden.objects[result.newObject]?.zone === 'exile'
        ? instruction.exiledPower
        : undefined;
    // CR 608.2c (Mass Polymorph: "that many creature cards"): every creature the `exile` effect really exiled counts, a token included (it is exiled, then ceases to exist, CR 111.7).
    const exiledCreature =
      instruction.exiledPower !== undefined &&
      (result.newObject === null
        ? movedObjects.length > 0
        : hidden.objects[result.newObject]?.zone === 'exile');
    // D-135: an object that moved is something done, for "if you do".
    return {
      ...done(hidden, moveEvents),
      lastMoved,
      performed: 1,
      ...(countedNonland || countedReturned || exiledPower !== undefined || exiledCreature
        ? {
            thisWay: {
              ...(countedNonland ? { exiledNonland: 1 } : {}),
              ...(countedReturned ? { returned: 1 } : {}),
              ...(exiledCreature ? { exiledCreatures: 1 } : {}),
              ...(exiledPower === undefined
                ? {}
                : { exiledPowerBy: { [exiledPower.seat]: exiledPower.power } }),
            },
          }
        : {}),
    };
  }
  // D-210: an effect run "as" another player (the one a `playersMay` asked): that player is "you" in it, and what it queues next is run as them too.
  if (instruction.as !== undefined || instruction.declinedBy !== undefined) {
    const as = instruction.as;
    const context = {
      ...res,
      ...(as === undefined ? {} : { controller: as }),
      ...(instruction.declinedBy === undefined ? {} : { declinedPlayer: instruction.declinedBy }),
    };
    const out = runEffect(state, context, instruction.effect, targets, flow);
    return {
      ...out,
      front: out.front.map((next) =>
        next.kind === 'effect'
          ? {
              ...next,
              ...(as === undefined || next.as !== undefined ? {} : { as }),
              ...(instruction.declinedBy === undefined || next.declinedBy !== undefined
                ? {}
                : { declinedBy: instruction.declinedBy }),
            }
          : next,
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

/** The X a resolving spell or ability reads: its own, or, for a triggered ability with none, the X of the spell that is its source (`validateCard` allows that only for "When you cast this spell"). */
/** CR 608.2h: the creatures each player controlled among `ids`, read before they moved: `{ destroyedCreaturesBy: { seat: count } }`, or nothing when there were none. */
function destroyedCreaturesByPlayer(
  state: GameState,
  ids: readonly ObjectId[],
): { readonly destroyedCreaturesBy?: Readonly<Record<number, number>> } {
  const by: Record<number, number> = {};
  for (const id of ids) {
    const obj = state.objects[id];
    if (obj === undefined || !derive(state, obj).types.includes('creature')) continue;
    const seat = controllerOf(state, obj);
    by[seat] = (by[seat] ?? 0) + 1;
  }
  return Object.keys(by).length === 0 ? {} : { destroyedCreaturesBy: by };
}

function abilityXOf(state: GameState, res: ResolutionContext): number {
  const own = state.objects[res.object]?.stack;
  if (own?.x !== undefined && own.x !== null) return own.x;
  if (own?.kind !== 'ability' || res.source === null) return 0;
  const source = state.objects[res.source] ?? state.lki[res.source]?.object;
  return source?.stack?.kind === 'spell' ? (source.stack.x ?? 0) : 0;
}

/** The context the selectors and amounts of a resolving spell or ability read: "this" is the spell, or for an ability the permanent it belongs to (which may be gone). */
function contextOf(state: GameState, res: ResolutionContext): SelectContext {
  return {
    controller: res.controller,
    source: res.source,
    ...(res.chosenCreatureType === undefined
      ? {}
      : {
          sourceChosen: {
            creatureType: res.chosenCreatureType,
            ...(res.chosenCreatureTypes === undefined
              ? {}
              : { creatureTypes: res.chosenCreatureTypes }),
          },
        }),
    ...(res.chosenObjects === undefined ? {} : { chosenObjects: res.chosenObjects }),
    ...(res.chosenNumber === undefined ? {} : { chosenNumber: res.chosenNumber }),
    ...(res.chosenPlayer === undefined ? {} : { chosenPlayer: res.chosenPlayer }),
    // CR 107.3a: the X announced for the spell or ability that is resolving.
    // CR 107.3a, 601.2b: an ability that has no X of its own ("When you cast this spell, you gain half X life") reads the X of the spell it belongs to, as it is on the stack or as it last was.
    x: abilityXOf(state, res),
    ...(res.lastMoved === undefined ? {} : { moved: res.lastMoved }),
    ...(res.triggerSubject === undefined ? {} : { triggerSubject: res.triggerSubject }),
    ...(res.costSacrificed === undefined ? {} : { costSacrificed: res.costSacrificed }),
    ...(res.costTappedPower === undefined ? {} : { costTappedPower: res.costTappedPower }),
    ...(res.sacrificed === undefined ? {} : { sacrificed: res.sacrificed }),
    ...(res.triggerPlayer === undefined ? {} : { triggerPlayer: res.triggerPlayer }),
    ...(res.declinedPlayer === undefined ? {} : { declinedPlayer: res.declinedPlayer }),
    ...(res.triggerDamage === undefined ? {} : { triggerDamage: res.triggerDamage }),
    ...(res.triggerDamaged === undefined ? {} : { triggerDamaged: res.triggerDamaged }),
    ...(res.triggerTargetCount === undefined ? {} : { triggerTargetCount: res.triggerTargetCount }),
    ...(res.triggerCards === undefined ? {} : { triggerCards: res.triggerCards }),
    ...(res.triggerAttacked === undefined ? {} : { triggerAttacked: res.triggerAttacked }),
    ...(res.triggerAttackers === undefined ? {} : { triggerAttackers: res.triggerAttackers }),
    ...(res.triggerCards === undefined ? {} : { triggerCards: res.triggerCards }),
    ...(res.triggerAttackedAt === undefined ? {} : { triggerAttackedAt: res.triggerAttackedAt }),
    ...(res.lifeLost === undefined ? {} : { lifeLost: res.lifeLost }),
    ...(res.thisWay === undefined ? {} : { thisWay: res.thisWay }),
    ...(res.votes === undefined ? {} : { votes: res.votes }),
    ...(res.dieResult === undefined ? {} : { dieResult: res.dieResult }),
  };
}

/**
 * The `search` instructions of an effect: one per player it names; with several, the first carries the others (CR 701.23i, 101.4: they decide in APNAP order, then the cards move
 * together).
 */
function searchInstructions(
  state: GameState,
  effect: Extract<Effect, { kind: 'search' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): Instruction[] {
  const seats = resolvePlayers(state, effect.player, ctx, targets);
  const search =
    // D-626 (CR 608.2c): "up to X" is read as the search begins.
    effect.maxAmount === undefined
      ? effect
      : { ...effect, max: Math.max(0, amountOf(state, effect.maxAmount, ctx, targets)) };
  const one = (seat: SeatId) => ({
    kind: 'search' as const,
    search,
    seat,
    accepted: effect.optional === true ? null : true,
    chosen: null,
  });
  const [first, ...later] = seats;
  if (first === undefined) return [];
  return [later.length === 0 ? one(first) : { ...one(first), together: { later, held: [] } }];
}

function runEffect(
  state: GameState,
  res: ResolutionContext,
  effect: Effect,
  targets: readonly ChosenTarget[],
  flow: OrderFlow,
): StepOutcome {
  const ctx = contextOf(state, res);
  const events: GameEvent[] = [];
  let next = state;

  switch (effect.kind) {
    case 'chooseObjects':
      return done(
        state,
        [],
        [
          {
            kind: 'chooseObjects',
            id: effect.id,
            filter: effect.filter,
            count: effect.count,
            ...(effect.exactly === true ? { exactly: true as const } : {}),
            chosen: null,
          },
        ],
      );
    case 'chooseCreatureType':
      // CR 101.4 (Harsh Mercy): each player the selector names chooses in turn, the active player first; one question each.
      return done(
        state,
        [],
        effect.players === undefined
          ? [{ kind: 'chooseCreatureType', chosen: null }]
          : resolvePlayers(state, effect.players, ctx, targets).map((seat) => ({
              kind: 'chooseCreatureType' as const,
              chosen: null,
              seat,
            })),
      );
    case 'chooseNumber':
      // CR 608.2d (Expel the Interlopers): the controller chooses a whole number from `min` to `max`.
      return done(
        state,
        [],
        [
          {
            kind: 'chooseNumber',
            seat: res.controller,
            min: effect.min,
            max: effect.max,
            amount: null,
          },
        ],
      );
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

    case 'dealDamageToSelf':
      // CR 120.3 (Lorehold group 1): "Each creature deals damage to itself equal to its power."
      return runDealDamageToSelf(state, effect, ctx, targets, flow);

    case 'dealDamageToController':
      // CR 120.3, 109.4 (issue 279): "Each creature deals 1 damage to its controller."
      return runDealDamageToController(state, effect, ctx, targets, flow);

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
      // (CR 701.19c); so does the Umbra armor of an Aura on it (CR 702.89a, D-417). The shields are used as the destruction
      // happens, before anything is moved. With two or more effects the controller of the permanent chooses (CR 616.1, D-418):
      // the instruction asks and runs again from this state with the answer.
      const destroyed = new Set<ObjectId>();
      for (const id of ids) {
        const replaced = settleDestruction(
          next,
          id,
          effect.cantBeRegenerated === true,
          flow,
          'resolution',
        );
        if (replaced.kind === 'asked') return asking(state, replaced);
        if (replaced.kind === 'destroyed') {
          destroyed.add(id);
          continue;
        }
        next = replaced.state;
        events.push(...replaced.events);
        for (const other of replaced.destroyed ?? []) destroyed.add(other);
      }
      // D-131: "for each creature destroyed this way" counts the permanents the effect destroyed.
      // D-283 (CR 603.10a): they die together, so what each was is recorded before the first moves.
      const together = recordTogether(
        next,
        withReplacers(
          moveInstructions(
            [...destroyed].filter((id) => next.objects[id]?.zone === 'battlefield'),
            'graveyard',
          ),
          next,
        ),
      );
      return {
        ...done(together.state, events, together.instructions),
        lastMoved: [],
        // CR 608.2c, 701.8: "you may destroy ...": doing it is destroying at least one permanent, which "if you do" reads.
        performed: destroyed.size > 0 ? 1 : 0,
        thisWay: {
          destroyed: destroyed.size,
          // CR 202.3, 608.2h: "the total mana value of permanents destroyed this way": each as it last existed on the battlefield (before it moved); a token has the value its copiable
          // mana cost gives it (a token that is no copy has none: 0).
          destroyedValue: [...destroyed].reduce((total, id) => {
            const obj = state.objects[id];
            return obj === undefined
              ? total
              : total + manaValueOfCost(derive(state, obj).manaCost, obj);
          }, 0),
          // CR 701.8, 608.2h: the creatures each player controlled that were destroyed, by player, as they were just before they died.
          ...destroyedCreaturesByPlayer(state, [...destroyed]),
          // CR 701.8, 608.2h (D-230): the nontoken creatures of the controller of the effect, as they were as they were destroyed (before they moved).
          // CR 701.8, 608.2h: the nontoken creatures destroyed, whoever controlled them, as they were as they were destroyed.
          destroyedNontokenCreatures: [...destroyed].filter((id) => {
            const obj = state.objects[id];
            return (
              obj !== undefined &&
              obj.token === null &&
              derive(state, obj).types.includes('creature')
            );
          }).length,
          destroyedOwnNontoken: [...destroyed].filter((id) => {
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

    case 'keepOrSacrifice': {
      // CR 101.4, 608.2d (Slaughter the Strong): every player the effect names chooses, the active player first, then nothing is sacrificed until the last has chosen.
      const seats = resolvePlayers(state, effect.players, ctx, targets);
      const [first, ...later] = seats;
      if (first === undefined) return done(state);
      return done(
        state,
        [],
        [
          {
            kind: 'chooseSacrifice' as const,
            filter: effect.filter,
            count: 0,
            ...(effect.totalPowerAtMost === undefined
              ? {}
              : { keepPowerAtMost: effect.totalPowerAtMost }),
            ...(effect.keepAtMost === undefined ? {} : { keepCountAtMost: effect.keepAtMost }),
            chosen: null,
            seat: first,
            ...(later.length === 0 ? {} : { together: { later, held: [] } }),
          },
        ],
      );
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
            ? [res.controller]
            : resolvePlayers(state, effect.player, ctx, targets);
        // D-485 (CR 608.2b, 701.21a): a player named by a selector that names nobody now ("any number of target players" with none chosen, a target that has left the game)
        // sacrifices nothing; the controller of the effect does not take their place.
        if (effect.player !== undefined && sacrificers.length === 0) return done(state);
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
              // CR 702.110b (Exploit): the creature whose ability this is exploits what is sacrificed.
              ...(effect.exploit === true ? { exploiter: res.source } : {}),
              ...(what.anyNumber === true ? { anyNumber: true as const } : {}),
              ...(what.atLeastOne === true ? { atLeastOne: true as const } : {}),
              ...(what.greatest === undefined ? {} : { greatest: what.greatest }),
              ...(what.least === undefined ? {} : { least: what.least }),
              ...(what.fromTriggerSources === true ? { fromTriggerSources: true as const } : {}),
              ...(what.dealtCombatDamageToYou === true
                ? { dealtCombatDamageToYou: true as const }
                : {}),
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
      const named = resolveObjects(state, effect.objects, ctx, targets)
        // CR 400.7, 603.10a (D-230): "exile it" in a trigger about a permanent that died: the permanent is gone, the card it became is the one in the graveyard.
        .flatMap((id) =>
          effect.objects.kind === 'triggerSubject' && state.objects[id] === undefined
            ? graveyardSuccessors(state, id)
            : [id],
        )
        .filter((id) => state.objects[id] !== undefined);
      // Issue 121 (Arcane Bombardment, CR 701.13, 701.9b analogue): "exile an instant or sorcery card at random from your graveyard": the one card is picked by the game's seeded generator.
      // Issue 97 (Kefka, CR 101.4): `perOwner`: one pick for each owner, the owners in APNAP order, each pick drawing from the generator in turn.
      let ids: readonly ObjectId[] = named;
      let drawn = state;
      if (effect.atRandom === true && effect.perOwner === true) {
        ids = [];
        for (const owner of apnapOrder(
          state,
          named.flatMap((id) => {
            const o = state.objects[id];
            return o === undefined ? [] : [o.owner];
          }),
        )) {
          const own = named.filter((id) => state.objects[id]?.owner === owner);
          if (own.length > 1) {
            const [one, rng] = pickRandom(own, drawn.rng);
            ids = [...ids, one];
            drawn = { ...drawn, rng };
          } else ids = [...ids, ...own];
        }
      } else if (effect.atRandom === true && named.length > 1) {
        const [one, rng] = pickRandom(named, state.rng);
        ids = [one];
        drawn = { ...state, rng };
      }
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
        drawn,
        moveInstructions(ids, 'exile').map((i) => {
          if (i.kind !== 'move') return i;
          // Oversimplify (CR 608.2h): the power and the controller of each creature as it is before any of them leaves, for "the total power of creatures they controlled that were exiled this way".
          const obj = state.objects[i.object];
          const lost =
            obj !== undefined &&
            obj.zone === 'battlefield' &&
            derive(state, obj).types.includes('creature')
              ? {
                  exiledPower: {
                    seat: controllerOf(state, obj),
                    power: Math.max(0, derive(state, obj).power ?? 0),
                  },
                }
              : {};
          return { ...i, ...link, ...lost };
        }),
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
        const sel = effect.objects;
        // King Narfi's Betrayal (CR 608.2d, 607.2a): "you may exile a creature or planeswalker card from each graveyard": one choice for each graveyard.
        const graveyards =
          sel.eachGraveyard === true ? seatsInOrder(state, res.controller) : [undefined];
        return {
          ...done(
            state,
            [],
            graveyards.map((graveyard) => ({
              kind: 'chooseMove' as const,
              ...(graveyard === undefined ? {} : { graveyardOf: graveyard }),
              ...(effect.linked === true && res.source !== null ? { linkTo: res.source } : {}),
              filter: sel.filter,
              // Issue 102, 509 (Tasigur): "of an opponent's choice": the opponent the controller chose (`chooseOpponent`, CR 801.5a), the only one when one is left.
              ...(sel.chosenBy === 'opponent' && opponentOf(state, res) !== undefined
                ? { decider: opponentOf(state, res) as SeatId }
                : {}),
              count: amountOf(state, sel.count ?? 1, ctx, targets),
              to: effect.to,
              position: effect.position ?? 'top',
              ...(sel.optional === true ? { optional: true as const } : {}),
              ...(sel.alsoGraveyard === true ? { alsoGraveyard: true as const } : {}),
              // "Put a creature card from defending player's hand": the hand of the one player the selector names (nothing to choose when it names none).
              ...(sel.fromHandOf === undefined
                ? {}
                : (() => {
                    const [owner] = resolvePlayers(state, sel.fromHandOf, ctx, targets);
                    return owner === undefined ? { among: [] } : { handOf: owner };
                  })()),
              // D-411: "from among them": only the cards the effect before it moved can be chosen (CR 608.2c).
              ...(sel.fromMoved === true ? { among: ctx.moved ?? [] } : {}),
              ...(sel.fromAnyGraveyard === true ? { anyOwner: true as const } : {}),
              ...(sel.anyGraveyard === true ? { anyGraveyard: true as const } : {}),
              // CR 205.2a: "any number of cards ... with four or more card types among them".
              ...(sel.minCardTypes === undefined
                ? {}
                : { anyNumber: true as const, minCardTypes: sel.minCardTypes }),
              ...(sel.exceptSacrificed === true
                ? {
                    among: Object.keys(state.objects).filter(
                      (id) =>
                        !(res.sacrificed ?? []).some((old) => {
                          const sacrificed = state.lki[old]?.object;
                          return (
                            sacrificed !== undefined &&
                            controllerOf(state, sacrificed) === res.controller &&
                            graveyardSuccessors(state, old).includes(id as ObjectId)
                          );
                        }),
                    ) as ObjectId[],
                  }
                : {}),
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
            })),
          ),
          lastMoved: [],
        };
      }
      let ids = resolveObjects(state, effect.objects as ObjectSelector, ctx, targets).filter(
        (id) => state.objects[id] !== undefined,
      );
      // D-655 (CR 401.4): "put the rest on the bottom of your library in a random order": the order is the seeded generator's, one after the other.
      let shuffledState = state;
      if (effect.random === true && ids.length > 1) {
        const [order, rng] = shuffle(ids, state.rng);
        ids = order;
        shuffledState = { ...state, rng };
      }
      // CR 110.2a: an object an effect puts onto the battlefield enters under the control of the
      // player performing the effect (the controller of the spell or ability) unless the effect
      // states otherwise, so an effect with no control named means 'you', not the owner. Every
      // other zone has no controller: the card goes to its owner's zone (CR 108.3, 400.3).
      const controller = effect.to === 'battlefield' ? (effect.controller ?? 'you') : undefined;
      const plainMoves = moveInstructions(
        ids,
        effect.to,
        effect.position ?? 'top',
        effect.tapped ?? false,
        controller,
        effect.withCounters,
      );
      // CR 400.7, 303.4 (Animate Dead): "Return enchanted creature card to the battlefield ... attach this Aura to it": the permanent remembers it was put there with this Aura.
      const placed =
        effect.putWithSource === true && effect.to === 'battlefield'
          ? plainMoves.map(
              (m): Instruction => (m.kind === 'move' ? { ...m, putWith: res.source } : m),
            )
          : plainMoves;
      // CR 708.3: "return it to the battlefield face down. It's a Forest land": each card is put onto the battlefield face down, with that status.
      const moves =
        effect.faceDownAs !== undefined && effect.to === 'battlefield'
          ? placed.map(
              (m): Instruction =>
                m.kind === 'move' ? { ...m, entersFaceDown: effect.faceDownAs ?? 'forestLand' } : m,
            )
          : placed;
      // CR 303.4f (D-149): an Aura card put onto the battlefield chooses what it enchants as it enters.
      // CR 303.4g, 303.4i (D-207): "attached to target creature ...": the effect names the object, so the Aura does not choose; it enters attached to the target
      // when that is still a legal object to enchant, and stays where it is when the target is gone.
      if (effect.attachTo !== undefined && effect.to === 'battlefield') {
        const [host] = resolveObjects(state, effect.attachTo, ctx, targets).filter(
          (id) => state.objects[id]?.zone === 'battlefield',
        );
        const hostObject = host === undefined ? undefined : state.objects[host];
        if (host === undefined || hostObject === undefined) {
          return { ...done(state), lastMoved: [] };
        }
        // Issue 89 (CR 303.4g, 303.4i): an Aura the object cannot be enchanted by stays where it is; an Equipment enters unattached when it is no creature (`rules/aura-entry.ts`).
        return moving(
          state,
          moves.flatMap((m): Instruction[] => {
            if (m.kind !== 'move') return [m];
            const card = state.objects[m.object];
            if (card === undefined) return [m];
            const how = entryAttachment(
              state,
              card,
              hostObject,
              m.controller === 'owner' ? card.owner : res.controller,
            );
            return how === 'stay' ? [] : how === 'attach' ? [{ ...m, attachTo: host }] : [m];
          }),
        );
      }
      if (effect.to === 'battlefield') return moving(state, withAuraEntries(state, moves));
      // D-283 (CR 603.10a): "return all creatures to their owners' hands" and the like: what each was is recorded before the first moves.
      const together = recordTogether(shuffledState, moves);
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
      // CR 701.6a, 614.1a: "exile it instead of putting it into its owner's graveyard": the card exiled is `moved` for the instructions after this one.
      if (effect.exileInstead === true) {
        return { ...done(state, events, moveInstructions(ids, 'exile')), lastMoved: [] };
      }
      return done(state, events, moveInstructions(ids, 'graveyard'));
    }

    case 'counterUnlessPays': {
      // CR 702.21a: the controller of each spell or ability may pay; otherwise it is countered.
      // One that already left the stack is skipped (CR 608.2b). One that can't be countered (CR
      // 101.2) is skipped too, and its controller is not asked: there is nothing to pay to avoid.
      const ids = resolveObjects(state, effect.objects, ctx, targets).filter((id) =>
        canBeCountered(state, id),
      );
      // CR 118.12a, 608.2c (Galadriel group 3): "... unless its controller pays mana equal to the greatest power among creatures you control": the generic mana is read now, as
      // this resolves. Paying {0} is paying nothing, so a spell whose controller owes none is not countered.
      const owed =
        effect.genericAmount === undefined
          ? null
          : amountOf(state, effect.genericAmount, ctx, targets);
      if (owed === 0) return done(state);
      const cost: typeof effect.cost =
        owed === null ? effect.cost : [{ kind: 'mana', symbols: [String(owed)] }];
      return done(
        state,
        [],
        ids.map((object) => ({
          kind: 'counterUnlessPays' as const,
          object,
          cost,
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
      // D-438 (CR 707.10, 707.10e): "copy that spell for each other creature you control that the spell could target": the stack finds the permanents and makes a copy for each
      // (`rules/copy-spell.ts`, which reads the legal targets of the spell); "that player copies" is the copy of the player the event is about.
      // Issue 144 (CR 707.10e): "The copy targets that token.": one copy per spell, aimed at the object the earlier instruction made (`rules/copy-spell.ts` checks that it is a legal target).
      if (effect.newTarget !== undefined) {
        const among = resolveObjects(state, effect.newTarget, ctx, targets);
        return {
          ...done(
            state,
            [],
            spells.map((id) => ({
              kind: 'copySpell' as const,
              spell: id,
              count: 0,
              newTargets: 'no' as const,
              stage: 'each' as const,
              copy: null,
              among,
            })),
          ),
          performed: spells.length,
        };
      }
      if (effect.forEach !== undefined) {
        const copier = effect.copier === 'triggerPlayer' ? ctx.triggerPlayer : undefined;
        if (effect.copier === 'triggerPlayer' && copier === undefined) return done(state);
        return {
          ...done(
            state,
            [],
            spells.map((id) => ({
              kind: 'copySpell' as const,
              spell: id,
              count: 0,
              newTargets: 'no' as const,
              stage: 'each' as const,
              copy: null,
              forEach: effect.forEach as ObjectFilter,
              ...(copier === undefined ? {} : { controller: copier }),
            })),
          ),
          performed: spells.length,
        };
      }
      // D-665 (CR 702.144a): "choose an opponent. That player copies the spell and may choose new targets": the opponent the controller chose, or the only one left; the copy is theirs.
      const opponent = effect.copier === 'opponent' ? opponentOf(state, res) : undefined;
      if (effect.copier === 'opponent' && opponent === undefined) return done(state);
      return {
        ...done(
          state,
          [],
          spells.flatMap((id) => copyInstructions(id, copies, effect.newTargets, opponent)),
        ),
        performed: copies > 0 ? spells.length : 0,
      };
    }

    case 'exileOnResolve': {
      // D-439 (CR 614.1a, 608.2n): the spell whose casting caused the trigger carries the replacement from now on (`rules/exile-on-resolve.ts`).
      const spells = resolveObjects(state, effect.spell, ctx, targets);
      return done(
        markExileOnResolve(state, spells, res.controller, res.source, effect.linked === true),
      );
    }

    case 'doubleSpellX': {
      // CR 107.3 (Unbound Flourishing): the X announced for each spell the effect names, still on the stack, becomes twice its value. A spell that left the stack, a copy
      // of an ability and a spell with no X announced are not changed. The cost paid stays what it was (CR 601.2f).
      let after = state;
      for (const id of resolveObjects(state, effect.spell, ctx, targets)) {
        const spell = after.objects[id];
        const x = spell?.stack?.x ?? null;
        if (spell?.zone !== 'stack' || spell.stack?.kind !== 'spell' || x === null) continue;
        after = patchObject(after, id, { stack: { ...spell.stack, x: x * 2 } });
      }
      return done(after);
    }

    case 'exileSpellWithTimeCounters': {
      // CR 608.2n, 122.1 (D-651): the resolving spell carries the exile until it finishes resolving (`rules/stack.ts`, `finish`).
      const spell = state.objects[res.object];
      if (spell?.zone !== 'stack' || spell.stack?.kind !== 'spell') return done(state);
      return done(
        patchObject(state, res.object, {
          stack: { ...spell.stack, exileWithTimeCounters: effect.count },
        }),
      );
    }

    case 'changeTarget': {
      // CR 115.7a (D-181): the target of each spell or ability the effect names changes, if it is still on the stack with a single target as this
      // resolves (CR 608.2b); the stack runs the instruction (it asks the controller, `rules/change-target.ts`).
      return done(
        state,
        [],
        changeTargetInstructions(
          state,
          resolveObjects(state, effect.object, ctx, targets),
          effect.to === undefined ? undefined : resolveObjects(state, effect.to, ctx, targets)[0],
        ),
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
        copyInstructions(
          res.source,
          effect.gravestorm === true
            ? state.turnLog.died.length
            : (spell?.stack?.spellsCastBefore ?? 0),
          'may',
        ),
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

    case 'forEachPlayer':
      return done(
        state,
        [],
        resolvePlayers(state, effect.players, ctx, targets).map(() => ({
          kind: 'effect' as const,
          effect: effect.effect,
        })),
      );
    case 'copyCardAndCast': {
      // CR 707.12 (D-654): the card the effect before this exiled is copied, in exile; its controller may cast the copy without paying its mana cost as the effect goes on
      // resolving (CR 608.2g). A copy that is not cast ceases to exist at the next state-based check (CR 704.5e).
      // Issue 121 (Mizzix's Mastery, overloaded: "For each card exiled this way, copy it, and you may cast the copy"): every card the effect before exiled is copied, and the controller
      // may cast any number of the copies (a question after each cast, as `castFree` with `max` any asks it); one card is the one question of a single copy.
      const exiled = resolveObjects(state, effect.objects, ctx, targets).flatMap((id) => {
        const card = state.objects[id];
        return card === undefined || card.zone !== 'exile' || card.card === null ? [] : [card];
      });
      if (exiled.length === 0) return done(state);
      let withCopies = state;
      const copies: ObjectId[] = [];
      for (const card of exiled) {
        if (card.card === null) continue;
        // CR 707.12: "Copy that card three times" makes each copy separately (`times`).
        for (let n = 0; n < (effect.times ?? 1); n += 1) {
          const made = makeCardCopy(withCopies, card.card, res.controller);
          withCopies = made.state;
          copies.push(made.copy);
        }
      }
      return {
        ...done(
          withCopies,
          [],
          [
            {
              kind: 'castFree',
              objects: { kind: 'moved' },
              play: false,
              chosen: null,
              ...(copies.length > 1 ? { remaining: 'any' as const } : {}),
              ...(effect.cost === undefined ? {} : { payInstead: effect.cost }),
            },
          ],
        ),
        lastMoved: copies,
      };
    }
    case 'prepare': {
      let next = state;
      const events: GameEvent[] = [];
      for (const id of resolveObjects(state, effect.objects, ctx, targets)) {
        const prepared = becomePrepared(next, id);
        next = prepared.state;
        events.push(...prepared.events);
      }
      return done(next, events);
    }
    case 'delayedCombatDamage':
      return done({
        ...state,
        delayedTriggers: [
          ...state.delayedTriggers,
          ...resolveObjects(state, effect.objects, ctx, targets).map((watched) => ({
            source: res.source,
            controller: res.controller,
            watched,
            repeat: true as const,
            untilEndOfCombat: true as const,
            ability: {
              kind: 'triggered' as const,
              trigger: { kind: 'dealsCombatDamage' as const, what: {}, to: 'player' as const },
              effect: effect.effect,
            },
          })),
        ],
      });
    case 'delayedCombatDamageTurn': {
      // CR 603.7, 603.7c, 603.7d, 510.3a, 514.2 (D-662): "Whenever a creature you control deals combat damage to a player this turn, copy the exiled card": a delayed ability of the
      // controller that triggers each time such a creature damages a player until the end of the turn. The card an earlier effect of this sequence exiled is written into it as
      // it is made (CR 603.7c: nothing of the spell is left to name later); a card that left exile since is a new object and is not found (CR 400.7).
      const exiled = (res.lastMoved ?? []).filter((id) => state.objects[id]?.zone === 'exile');
      // With no card to copy (the target was gone as the spell resolved) the ability would have nothing to do: none is made.
      if (exiled.length === 0) return done(state);
      const inner = effect.effect;
      const baked: Effect =
        inner.kind === 'copyCardAndCast' && inner.objects.kind === 'moved'
          ? {
              ...inner,
              objects: { kind: 'boundObjects', ids: exiled, zone: 'exile' },
            }
          : inner;
      return done({
        ...state,
        delayedTriggers: [
          ...state.delayedTriggers,
          {
            source: res.source,
            controller: res.controller,
            repeat: true as const,
            untilEndOfTurn: true as const,
            ability: {
              kind: 'triggered' as const,
              trigger: {
                kind: 'dealsCombatDamage' as const,
                what: effect.filter,
                to: 'player' as const,
              },
              effect: baked,
            },
          },
        ],
      });
    }
    case 'delayedCombatDamageToPlayer': {
      // CR 603.7, 603.7c, 510.3a, 514.2 (issue 144): "Whenever a creature you control deals combat damage to that player this turn, create a tapped Treasure token": a delayed
      // ability of the controller, for damage to the player the spell targeted, which is fixed as it is made. A player that is not there (not a legal target any more) gets none.
      const [damaged] = resolvePlayers(state, effect.player, ctx, targets);
      if (damaged === undefined) return done(state);
      return done({
        ...state,
        delayedTriggers: [
          ...state.delayedTriggers,
          {
            source: res.source,
            controller: res.controller,
            repeat: true as const,
            untilEndOfTurn: true as const,
            damagedPlayer: damaged,
            ability: {
              kind: 'triggered' as const,
              trigger: {
                kind: 'dealsCombatDamage' as const,
                what: effect.filter,
                to: 'player' as const,
              },
              effect: effect.effect,
            },
          },
        ],
      });
    }
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
      // D-459 (CR 603.7c, 400.7j): "Exile it at the beginning of the next end step", about the permanents the effect before it put onto the battlefield (`moved`): one
      // delayed ability for each, named by the permanent as it is now (the ability is about that object: once it has changed zones it is a new object and nothing happens,
      // CR 603.7c, 400.7), as Unearth's is.
      // D-643 (CR 603.7, 603.7c, 603.7e, 701.21a): "Sacrifice it / those tokens" or "Exile them at the beginning of the next end step", about the permanents the effects before it
      // made or put onto the battlefield (`moved`, only those): ONE delayed ability for the whole group, as the text says, so a player never has to order the permanents of one effect
      // (this replaces D-459's one ability for each: the ability is now the source's, CR 603.7e, not the permanent's). Its objects are bound as they are now (`boundObjects`); one that has
      // left since is a new object and nothing happens to it (CR 603.7c, 400.7). A permanent whose control changed is not sacrificed by the controller of the ability (CR 701.21a).
      // Sauron, the Necromancer (CR 701.54e, 603.7c): "At the beginning of the next end step, exile that token unless ~ is your Ring-bearer": the same bound exile, run only when the condition
      // holds as the ability resolves (the source is the permanent that made the token; `thisIsRingBearer` reads it then, as it last was when it has left).
      if (
        effect.effect.kind === 'conditional' &&
        effect.effect.else === undefined &&
        effect.effect.effect.kind === 'exile' &&
        effect.effect.effect.objects.kind === 'moved'
      ) {
        const ids = (res.lastMoved ?? []).filter((id) => state.objects[id]?.zone === 'battlefield');
        if (ids.length === 0) return done(state);
        const ability: TriggeredAbility = {
          kind: 'triggered',
          trigger,
          effect: {
            ...effect.effect,
            effect: { kind: 'exile', objects: { kind: 'boundObjects', ids } },
          },
        };
        return done({
          ...state,
          delayedTriggers: [
            ...state.delayedTriggers,
            { source: res.source, controller: res.controller, ability },
          ],
        });
      }
      // CR 603.7c, 118.12a, 701.21a (Ashling, the Limitless): "At the beginning of your next end step, sacrifice it unless you pay {W}{U}{B}{R}{G}": the same bound sacrifice of the
      // permanents the effects before it made, which the controller of the ability pays to keep (`unlessPays`, as the ability resolves).
      if (
        effect.effect.kind === 'unlessPays' &&
        effect.effect.effect.kind === 'sacrifice' &&
        effect.effect.effect.objects.kind === 'moved'
      ) {
        const ids = (res.lastMoved ?? []).filter((id) => state.objects[id]?.zone === 'battlefield');
        if (ids.length === 0) return done(state);
        const ability: TriggeredAbility = {
          kind: 'triggered',
          trigger,
          effect: {
            ...effect.effect,
            effect: { kind: 'sacrifice', objects: { kind: 'boundObjects', ids } },
          },
        };
        return done({
          ...state,
          delayedTriggers: [
            ...state.delayedTriggers,
            { source: res.source, controller: res.controller, ability },
          ],
        });
      }
      if (
        (effect.effect.kind === 'exile' ||
          effect.effect.kind === 'sacrifice' ||
          // Issue 103 (CR 903.9, 603.7c): "Return it to the command zone at the beginning of the next end step", bound to the permanent as it is now.
          (effect.effect.kind === 'moveToZone' && effect.effect.to === 'command') ||
          // CR 603.7c, 400.7j (Zara): "Return that creature to its owner's hand at the beginning of the next end step", bound to the permanent as it is now.
          (effect.effect.kind === 'moveToZone' && effect.effect.to === 'hand')) &&
        effect.effect.objects.kind === 'moved'
      ) {
        const ids = (res.lastMoved ?? []).filter((id) => state.objects[id]?.zone === 'battlefield');
        // One delayed ability for all of them, as the text says (CR 603.7, "Exile them ..."): a player never has to order the tokens of one effect. It is the ability of the
        // source of the ability that created it (CR 603.7e), about those objects only (CR 603.7c). With none there is nothing to wait for.
        if (ids.length === 0) return done(state);
        const ability: TriggeredAbility = {
          kind: 'triggered',
          trigger,
          effect:
            effect.effect.kind === 'moveToZone'
              ? { ...effect.effect, objects: { kind: 'boundObjects', ids } }
              : { kind: effect.effect.kind, objects: { kind: 'boundObjects', ids } },
        };
        return done({
          ...state,
          delayedTriggers: [
            ...state.delayedTriggers,
            { source: res.source, controller: res.controller, ability },
          ],
        });
      }
      // CR 603.7, 603.7c, 400.7j (Temporal Tribulation): "Exile two target permanents you control. Return those cards to the battlefield under their owner's control at the beginning of
      // the next end step": ONE delayed ability for the whole group, as the text says, so the cards enter together. It is about the cards the exile moved as they are now, in exile
      // (`boundObjects` with `zone` 'exile': a card that left since is a new object and is not found); a token that was exiled has ceased to exist (CR 111.8). With one card (or none)
      // the ability of each card below is made, as before.
      if (
        effect.effect.kind === 'moveToZone' &&
        effect.effect.to === 'battlefield' &&
        effect.effect.objects.kind === 'moved' &&
        effect.effect.attachTo === undefined
      ) {
        const cards = (res.lastMoved ?? []).filter(
          (id) => state.objects[id]?.zone === 'exile' && state.objects[id]?.token === null,
        );
        if (cards.length > 1) {
          const ability: TriggeredAbility = {
            kind: 'triggered',
            trigger,
            effect: {
              ...effect.effect,
              objects: { kind: 'boundObjects', ids: cards, zone: 'exile' },
            },
          };
          return done({
            ...state,
            delayedTriggers: [
              ...state.delayedTriggers,
              { source: res.source, controller: res.controller, ability },
            ],
          });
        }
      }
      if (effect.effect.kind === 'moveToZone') {
        // Issue 89 (CR 603.7c, 400.7): "Return this card to the battlefield attached to that creature at the beginning of the next end step": the creature is the object
        // the effect before it returned, bound as it is now (`boundObjects`: found later only if it is still that object on the battlefield, else the Aura stays, CR 303.4g).
        const back: Effect = {
          ...effect.effect,
          objects: { kind: 'triggerSubject' },
          ...(effect.effect.attachTo?.kind === 'moved'
            ? { attachTo: { kind: 'boundObjects' as const, ids: res.lastMoved ?? [] } }
            : {}),
        };
        const ability: TriggeredAbility = { kind: 'triggered', trigger, effect: back };
        const cards =
          effect.effect.objects.kind === 'triggerCard' || effect.effect.objects.kind === 'thisCard'
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
      } else if (inner.kind === 'sequence') {
        // CR 603.7c (issue 81, Synthetic Destiny): "reveal cards ... until you reveal that many creature cards" at the next end step: how many is what the effect before it did as it
        // resolved (`thisWay`), fixed now, when the delayed ability is created.
        baked = bindThisWay(inner, ctx.thisWay);
        // Issue 144 (Glimpse the Impossible, CR 603.7c, 400.7): "At the beginning of the next end step, if any of those cards remain exiled, put them into your graveyard, then create a
        // token for each card put into your graveyard this way": the cards are the ones the effect before it exiled, bound as they are now (`boundObjects` in exile: a card that left
        // exile since is a new object and is not found). With none in exile there is nothing to wait for.
        const [first, ...rest] = inner.effects;
        if (
          first?.kind === 'moveToZone' &&
          first.to === 'graveyard' &&
          first.objects.kind === 'moved'
        ) {
          const ids = (res.lastMoved ?? []).filter((id) => state.objects[id]?.zone === 'exile');
          if (ids.length === 0) return done(state);
          baked = {
            ...inner,
            effects: [{ ...first, objects: { kind: 'boundObjects', ids, zone: 'exile' } }, ...rest],
          };
        }
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
          {
            source: res.source,
            controller: res.controller,
            ability,
            untilEndOfTurn: true,
            // CR 603.7: "Whenever you cast ... this turn" triggers at each cast, "when you next cast" at the next one only.
            ...(effect.repeat === true ? { repeat: true as const } : {}),
          },
        ],
      });
    }

    case 'createEmblem': {
      // CR 114.1, 114.2 (D-201): the controller of the effect gets the emblem, or each player the effect names ("Target opponent gets an emblem with ...": they own and control it).
      let withEmblems = state;
      const emblemEvents: GameEvent[] = [];
      const getting =
        effect.player === undefined
          ? [res.controller]
          : resolvePlayers(state, effect.player, ctx, targets);
      for (const seat of getting) {
        const r = createEmblem(withEmblems, seat, effect.abilities, effect.text);
        withEmblems = r.state;
        emblemEvents.push(...r.events);
      }
      return done(withEmblems, emblemEvents);
    }

    case 'empowerJace':
      // CR 701.71a (D-201): the token, the choice and the counters come up as the instruction runs (rules/empower.ts).
      return done(state, [], [{ kind: 'empowerJace', amount: effect.amount, chosen: null }]);

    case 'additionalLandDropThisTurn':
      // CR 305.2, 305.3: only the active player plays lands, so the extra land plays count for the active player's turn only.
      return done(
        res.controller === state.turn.activeSeat
          ? {
              ...state,
              turn: {
                ...state.turn,
                // CR 107.3a: "play X additional lands": the X of the spell, read as the effect runs; none for 0 or less.
                extraLandDrops:
                  state.turn.extraLandDrops +
                  Math.max(0, amountOf(state, effect.count, ctx, targets)),
              },
            }
          : state,
      );

    case 'blight':
      // CR 701.68a (Blight): the controller chooses a creature they control and puts the counters on it as the instruction runs (rules/blight-effect.ts).
      return done(state, [], [{ kind: 'blight', count: effect.count, chosen: null }]);

    case 'moveCountersOnto':
      // CR 122.1 (issue 230): the counters move one at a time, each a choice of the controller, as the instruction runs (rules/move-counters.ts).
      return done(
        state,
        [],
        [{ kind: 'moveCounters', counter: effect.counter, to: effect.to, chosen: null }],
      );

    case 'copyOneOfTriggerCards':
      // CR 603.2c, 707.2 (Twilight Diviner): the permanents of the batch that are still on the battlefield, one of which the controller copies (rules/populate.ts).
      return done(
        state,
        [],
        [
          {
            kind: 'populate',
            among: (res.triggerCards ?? []).filter(
              (id) => state.objects[id]?.zone === 'battlefield',
            ),
            chosen: null,
          },
        ],
      );

    case 'populate':
      // CR 701.36 (D-627): the choice of the creature token and its copy come up as the instruction runs (rules/populate.ts).
      return done(state, [], [{ kind: 'populate', chosen: null }]);

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

    case 'myriad':
      return runMyriad(
        state,
        res,
        effect,
        resolvePlayers(state, { kind: 'eachOpponent' }, ctx, targets),
        flow,
      );

    case 'delayedSacrifice': {
      // CR 603.7, 701.54c (D-196): about the creature whose event triggered the ability (the blocker): at the end of combat its controller
      // sacrifices it. The delayed ability belongs to the controller of the Ring's ability and names that creature (CR 603.7c).
      // D-478 (CR 702.147a): `of: 'this'` is the creature with the ability (Decayed): the one that attacked.
      const blocker = effect.of === 'this' ? res.source : res.triggerSubject;
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

    case 'exileIfLeaves': {
      // CR 614.1a, 614.6 (D-459): "If it would leave the battlefield, exile it instead of putting it anywhere else": each permanent the effect before it put onto the
      // battlefield is marked; `moveObject` exiles it when it would go anywhere else. A token the effect named is marked too (it ceases to exist in exile, CR 111.8).
      let next = state;
      for (const id of resolveObjects(state, effect.objects, ctx, targets)) {
        if (next.objects[id]?.zone === 'battlefield') {
          next = patchObject(next, id, { exileIfLeaves: true });
        }
      }
      return done(next);
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

    case 'takeInitiative': {
      // CR 726.1, 726.3, 726.5: the designation moves to the one player the selector names; a player who has it takes it again, which is an event too.
      const [seat] = resolvePlayers(state, effect.player, ctx, targets);
      if (seat === undefined) return done(state);
      const r = takeInitiative(state, seat);
      return done(r.state, r.events);
    }

    case 'ventureIntoDungeon':
      // CR 701.49: the controller moves their venture marker as this comes up (rules/dungeon.ts).
      return done(
        state,
        [],
        [{ kind: 'venture', seat: res.controller, dungeon: effect.dungeon, chosen: null }],
      );

    case 'loseLifeManaValue':
      // Issue 97 (Kefka, CR 202.3, 119.3): the owner of each spell cast this way loses life equal to its mana value.
      return runLoseLifeManaValue(state, resolveObjects(state, effect.spells, ctx, targets));

    case 'extraTurn': {
      // CR 500.7: the turn is added directly after the current one; several players are given theirs one at a time in APNAP order, and the most recently created
      // one is taken first (`rules/flow.ts` takes the last of the list).
      const named = resolvePlayers(state, effect.player, ctx, targets);
      const seats = seatsInOrder(state, state.turn.activeSeat).filter((s) => named.includes(s));
      if (seats.length === 0) return done(state);
      return done(
        { ...state, extraTurns: [...(state.extraTurns ?? []), ...seats] },
        seats.map((seat) => ({ kind: 'extraTurnAdded' as const, seat })),
      );
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
        Array.from(
          { length: Math.max(0, amountOf(state, effect.times ?? 1, ctx, targets)) },
          () => ({
            kind: 'chooseOne',
            options: effect.options,
            ...(effect.optional === true ? { optional: true as const } : {}),
            chosen: null,
            // D-229: "Target player adds one mana of any color": the target player chooses.
            ...(effect.chooser === undefined
              ? {}
              : (() => {
                  const chooser = resolvePlayers(state, effect.chooser, ctx, targets)[0];
                  return chooser === undefined ? {} : { chooser };
                })()),
          }),
        ),
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
      return runMayPlay(state, res, effect, ctx);
    case 'nextSpellModifier':
      // Issue 121 (CR 601.2f, 702.40a): "the next instant or sorcery spell you cast this turn costs {X} less / has storm" (rules/next-spell.ts).
      return runNextSpellModifier(state, res, effect, ctx);
    case 'nextSpellPayLife':
      // CR 118.9, 601.2b: "Rather than pay the mana cost of the next spell you cast this turn, you may pay life equal to that spell's mana value" (rules/next-spell-life.ts).
      return runNextSpellPayLife(state, res);
    case 'mayCastEachType':
      // CR 601.2, 118.9, 611.2a: "for each nonland card type, you may cast a spell of that type from among the exiled cards without paying its mana cost" (rules/free-cast.ts).
      return runMayCastEachType(state, res, effect);
    case 'gainActivatedAbilitiesOf':
      // CR 613.1f (issue 159): "this creature gains all activated abilities of that card until end of turn" (rules/may-effects.ts).
      return runGainActivatedAbilitiesOf(state, effect, ctx, targets);
    case 'gainFlashbackFromManaCost':
      // CR 702.34a, 611.2c: "Each instant and sorcery card in your graveyard gains flashback until end of turn" (rules/flashback-grant.ts).
      return runGainFlashbackFromManaCost(state, res, effect);
    case 'gainEscape':
      // CR 702.138a, 611.2c: "Until end of turn, each creature card in your graveyard gains escape" (rules/escape-grant.ts).
      return runGainEscape(state, res, effect);
    case 'mayCastOneMilled':
      // CR 601.2, 611.2a (Locke, Treasure Hunter): "you may cast a spell from among those cards" (rules/may-effects.ts).
      return runMayCastOneMilled(state, res);
    case 'mayCastSpells':
      // CR 601.2, 611.2a (issue 159): "You may cast Zombie spells from your graveyard this turn" (rules/may-effects.ts).
      return runMayCastSpells(state, res, effect);
    case 'mayCast':
      // CR 601.2, 611.2a (D-135): "You may cast target [card] from your graveyard this turn" (rules/may-effects.ts).
      return runMayCast(state, res, effect, ctx, targets);

    case 'mayPay': {
      // CR 702.101a (D-120): the controller may pay; the effect runs only if they do (rules/pay-unless.ts).
      // D-364 (CR 119.4, 608.2c): a payment of life by an amount ("pay that much life") is worked out now; one of 0 life is no offer.
      const cost = resolveMayPayCost(state, effect.cost, ctx, targets);
      if (cost === null) return done(state);
      // Issue 101 (Gix): "its controller may pay 1 life": the player named is asked and pays, nobody when the selector names none.
      const payer =
        effect.by === undefined
          ? res.controller
          : resolvePlayers(state, effect.by, ctx, targets)[0];
      if (payer === undefined) return done(state);
      return done(
        state,
        [],
        [
          {
            kind: 'unlessPays' as const,
            seat: payer,
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
              ...(effect.reveal === true ? { reveal: true as const } : {}),
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
      // Dread Summons (CR 701.17a, 608.2c): "for each creature card put into a graveyard this way": the creature cards of the cards milled, as they are in the graveyard.
      const milledCreatures = cardsMilled.filter((id) => {
        const card = next.objects[id];
        return card !== undefined && derive(next, card).types.includes('creature');
      }).length;
      return {
        ...done(next, events),
        performed: milled,
        lastMoved: cardsMilled,
        milledCards: cardsMilled,
        ...(value > 0 || milledCreatures > 0
          ? {
              thisWay: {
                ...(value > 0 ? { milledValue: value } : {}),
                ...(milledCreatures > 0 ? { milledCreature: milledCreatures } : {}),
              },
            }
          : {}),
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
        const amount = lifeAmountFor(
          next,
          effect.amount,
          seat,
          () => everyone,
          ctx.thisWay,
          effect.player,
        );
        const r =
          effect.kind === 'gainLife'
            ? gainLifeOf(next, seat, amount, flow, res.source)
            : loseLifeOf(next, seat, amount);
        if ('kind' in r && r.kind === 'asked') {
          return { state, events: [], front: [], needs: r.decision };
        }
        if ('kind' in r && r.kind === 'gained') {
          next = r.state;
          events.push(...r.events);
          continue;
        }
        next = r.state;
        events.push(...r.events);
        // CR 702.101a (D-120): the life lost is remembered for "the total life lost this way".
        if (effect.kind === 'loseLife') lost += Math.max(0, amount);
      }
      // CR 608.2c: a "you may have target player lose 3 life. If you do, ..." counts as done when some life was lost (`may`, issue 102).
      return {
        ...done(next, events),
        ...(lost > 0 ? { lifeLost: lost } : {}),
        ...(effect.kind === 'loseLife' && lost > 0 ? { performed: 1 } : {}),
      };
    }

    case 'meld':
      // CR 701.42a (D-278): exile the permanent and its counterpart, then meld them.
      return runMeld(state, res, effect);

    case 'loseGame': {
      // CR 104.3e (D-269): "each player this creature attacked this turn loses the game": the players the selector names lose it together.
      const lost = loseTheGame(next, resolvePlayers(state, effect.player, ctx, targets));
      return done(lost.state, [...events, ...lost.events]);
    }

    case 'winGame': {
      // CR 104.2b: "You win the game": the player the selector names wins and the game ends (CR 104.1), unless an opponent's "your opponents can't win the game" stops it.
      const [winner] = resolvePlayers(state, effect.player, ctx, targets);
      if (winner === undefined) return done(next, events);
      const won = winTheGame(next, winner);
      return done(won.state, [...events, ...won.events]);
    }

    case 'exchangeLifeWithPt':
      // CR 701.12g: the life total of a player and the power or toughness of a permanent swap.
      return runExchangeLifeWithPt(state, effect, ctx, targets, flow, res.source);

    case 'setLifeTotal': {
      // CR 119.5 (D-201): the player gains or loses the life that takes their life total to the number; a player who has it already does neither.
      for (const seat of resolvePlayers(state, effect.player, ctx, targets)) {
        const amount = amountOf(next, effect.amount, ctx, targets);
        const delta = amount - getSeat(next, seat).life;
        if (delta === 0) continue;
        const r =
          delta > 0
            ? gainLifeOf(next, seat, delta, flow, res.source)
            : loseLifeOf(next, seat, -delta);
        if ('kind' in r && r.kind === 'asked') {
          return { state, events: [], front: [], needs: r.decision };
        }
        if ('kind' in r && r.kind === 'gained') {
          next = r.state;
          events.push(...r.events);
          continue;
        }
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
        events.push({ kind: 'tapped', object: id, by: res.controller });
        changed += 1;
      }
      // D-139: "the number tapped this way" and "if you do" read what a `tap` effect did.
      return tapped
        ? { ...done(next, events), thisWay: { tapped: changed }, performed: changed }
        : done(next, events);
    }

    case 'assignControlToOpponents': {
      // CR 613.1b, 611.2a (issue 81, Dack Fayden): the controller chooses a different opponent for each permanent moved, then each opponent gains control of theirs.
      const objects = resolveObjects(state, effect.objects, ctx, targets);
      const free = opponentsOf(state, res.controller);
      return done(state, [], [{ kind: 'assignControl', objects, free, pairs: [], chosen: null }]);
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
          // D-650 (CR 500.5): "you don't lose this mana as steps and phases end" until end of turn.
          ...(production.staysUntilEndOfTurn === true ? { stays: true as const } : {}),
          // CR 702.189a, 500.5a (Firebending): kept until the combat phase ends.
          ...(production.staysUntilEndOfCombat === true
            ? { staysThroughCombat: true as const }
            : {}),
        })),
      ).flat();
      if (added.length === 0) return done(state);
      next = setSeat(next, { ...seat, manaPool: [...seat.manaPool, ...added] });
      return {
        ...done(next, [{ kind: 'manaAdded', seat: adder, count: added.length }]),
        performed: 1,
      };
    }

    case 'addCounters': {
      const count = effect.perObject === true ? 0 : amountOf(state, effect.count, ctx, targets);
      if (count <= 0 && effect.perController !== true && effect.perObject !== true) {
        return done(state);
      }
      const blockers = counterBlockers(state);
      const bonuses = counterBonuses(state);
      for (const id of resolveObjects(state, effect.objects, ctx, targets)) {
        // Oversimplify (CR 608.2c, 608.2h): the count is read for the player who controls each object, "the total power of creatures they controlled that were exiled this way".
        const obj = state.objects[id];
        const own =
          effect.perController === true && obj !== undefined
            ? amountOf(
                state,
                effect.count,
                {
                  ...ctx,
                  thisWay: {
                    ...ctx.thisWay,
                    exiledPowerOwn: ctx.thisWay?.exiledPowerBy?.[controllerOf(state, obj)] ?? 0,
                  },
                },
                targets,
              )
            : effect.perObject === true
              ? // Canopy Gargantuan (CR 608.2c): the count is worked out for each object, with that object as "that creature".
                amountOf(state, effect.count, { ...ctx, eachObject: id }, targets)
              : count;
        if (own <= 0) continue;
        const put = putCountersOn(
          state,
          next,
          id,
          effect.counter,
          own,
          ctx.controller,
          blockers,
          bonuses,
        );
        next = put.state;
        events.push(...put.events);
      }
      // Federation Fleet group D (CR 122.6, 608.2c): "If you put two or more +1/+1 counters on creatures this way" counts the counters really put (a replacement or a prevention
      // may change or stop them), one `counterAdded` event for each placement.
      const putCount = events.reduce(
        (n, e) => (e.kind === 'counterAdded' && e.counter === effect.counter ? n + e.count : n),
        0,
      );
      return {
        ...done(next, events),
        ...(putCount > 0 ? { thisWay: { countersPut: putCount } } : {}),
      };
    }

    case 'distributeCounters': {
      // CR 601.2d, 608.2b, 122.6: the counters a spell divided as it was cast go on each target of the slot that is still legal, in the share the caster gave it. Each share is
      // its own placement, so a replacement of counters put on a permanent applies to each (CR 616.1).
      const blockers = counterBlockers(state);
      const bonuses = counterBonuses(state);
      for (const t of targets) {
        if (t.specId !== effect.to.id || t.share === undefined || t.kind !== 'object') continue;
        const put = putCountersOn(
          state,
          next,
          t.id,
          effect.counter,
          t.share,
          ctx.controller,
          blockers,
          bonuses,
        );
        next = put.state;
        events.push(...put.events);
      }
      return done(next, events);
    }

    case 'doubleCounters': {
      // CR 701.10 (Double): "double the number of +1/+1 counters on it" puts that many more counters on each object, read as the effect
      // resolves, each its own, through the same placement as `addCounters` (counters put by the controller, CR 122.6).
      const blockers = counterBlockers(state);
      const bonuses = counterBonuses(state);
      for (const id of resolveObjects(state, effect.objects, ctx, targets)) {
        // "each kind of counter on it": the kinds it has as the effect begins for it, each doubled by its own count (CR 701.10 Double).
        const kinds =
          effect.counter === undefined
            ? Object.entries(next.objects[id]?.counters ?? {})
            : [[effect.counter, next.objects[id]?.counters[effect.counter] ?? 0] as const];
        for (const [counter, count] of kinds) {
          if (count <= 0) continue;
          const put = putCountersOn(
            state,
            next,
            id,
            counter,
            count,
            ctx.controller,
            blockers,
            bonuses,
          );
          next = put.state;
          events.push(...put.events);
        }
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
            ...(values.doors === undefined ? {} : { doors: values.doors }),
          },
          count: 1,
          original: true,
        });
      }
      // D-639 (CR 110.5b): "create a tapped and attacking token that's a copy of that token": the tokens enter tapped.
      const made = makeSettled(state, res, res.controller, wanted, effect.tapped === true, flow);
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
      // CR 111.2, 508.1d, 101.4 (D-652): "For each opponent, create two 3/3 tokens that attack that opponent this turn if able": the controller makes them for each opponent, in
      // turn order, the replacement effects of each creation settled for that opponent's tokens, each of which is required to attack the player it was made for.
      if (effect.forEachOpponent !== undefined) {
        for (const opponent of resolvePlayers(state, { kind: 'eachOpponent' }, ctx, targets)) {
          const made = makeSettled(
            next,
            res,
            res.controller,
            [{ definition, count, original: true }],
            effect.tapped === true,
            flow,
          );
          if (made.kind === 'asked') return asking(state, made);
          // CR 508.4 (issue 101): "for each opponent, create a token that's tapped and attacking that player": the opponent's tokens join the combat attacking that opponent.
          next =
            'attacking' in effect.forEachOpponent
              ? enterCombatAttacking(made.state, made.created, opponent)
              : requireAttackingPlayer(made.state, made.created, opponent);
          events.push(...made.events);
          front.push(...made.front);
          created = [...created, ...made.created];
        }
        return { ...done(next, events, front), lastMoved: created, performed: created.length };
      }
      // CR 303.4f, 303.4g (issue 89): "create an Aura token attached to target creature": the Aura enters attached to the object the effect names, which is not a choice of its
      // controller; when that object is not one its enchant ability allows (or is gone) the Aura does not enter, and a token that never was in a zone is not created.
      let attachHost: ObjectId | undefined;
      if (effect.attachTo !== undefined) {
        attachHost = resolveObjects(state, effect.attachTo, ctx, targets)[0];
        if (
          attachHost === undefined ||
          !auraTokenCanEnterAttached(
            state,
            creators[0] ?? res.controller,
            described,
            res.object,
            attachHost,
          )
        ) {
          return done(state);
        }
      }
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
          effect.token.kind === 'copyOf' && effect.token.embalmed === true,
          attachHost,
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
      // CR 508.4 (D-648): "tapped and attacking that opponent": the creature tokens just created start attacking the player the selector names, while a combat is on. They were
      // never declared as attackers.
      if (effect.attacking !== undefined && next.combat !== null && created.length > 0) {
        const [defender] = resolvePlayers(next, effect.attacking.at, ctx, targets);
        if (defender !== undefined) {
          const before = next.combat.attackers.length;
          next = enterCombatAttacking(next, created, defender);
          // CR 508.4: "tapped and attacking" without a player named: the controller chooses what each token attacks (rules/reselect-attack.ts); with one target nothing is asked.
          if (effect.attacking.controllerChooses === true) {
            for (const entered of next.combat?.attackers.slice(before) ?? []) {
              front.push({ kind: 'reselectAttack', object: entered.object, chosen: null });
            }
          }
        }
      }
      // D-139: "create a token, then attach this to it": the tokens just created are what `moved` ("it") names (CR 400.7j
      // reads it for a new object; here the object is new from the start).
      // Issue 89 (CR 603.12): the tokens made are something done, for "create a token. When you do, ...".
      return { ...done(next, events, front), lastMoved: created, performed: created.length };
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

    case 'clash':
      // CR 701.30b: the controller clashes with an opponent, in stages (rules/clash.ts); who won is what `clashWon` reads.
      return done(state, [], [newClash()]);

    case 'coinFlip': {
      // CR 705.2: the controller flips a coin with the call the option made (the `chooseOne` the player answered); they win the flip when it matches the result.
      const flipped = flipCoin(next, res.controller, effect.call);
      return done(flipped.state, flipped.events);
    }

    case 'rollDie': {
      // CR 706.1, 706.2 (D-271): the controller rolls one die; the result stays for the rest of this resolution, which `dieResult` reads.
      const rolled = rollDie(next, res.controller, effect.sides);
      return { ...done(rolled.state, rolled.events), dieResult: rolled.result };
    }

    case 'repeatWhile': {
      // CR 608.2c (Grist, the Hunger Tide): the effects, then the test as an instruction of its own (read after them, so `moved` is what the last of them moved); when it holds
      // `then` is done and this effect comes up again. The test is a `conditional`, so it ends the repeat when nothing was milled (the library ran out) or no card matches.
      const again: Effect = {
        kind: 'conditional',
        condition: effect.condition,
        effect: { kind: 'sequence', effects: [...(effect.beforeAgain ?? []), effect] },
      };
      return done(
        state,
        [],
        [...effect.effects, again].map((e) => ({ kind: 'effect' as const, effect: e })),
      );
    }

    case 'playersMay': {
      // D-210 (CR 608.2d, 101.4): each player named, in order, is asked whether to do it.
      const asked: Extract<Instruction, { kind: 'playerMay' }>[] = resolvePlayers(
        state,
        effect.players,
        ctx,
        targets,
      ).map((seat) => ({
        kind: 'playerMay' as const,
        seat,
        effect: effect.effect,
        ...(effect.runsAs === 'chooser' ? { as: seat } : {}),
        ...(effect.otherwise === undefined ? {} : { otherwise: effect.otherwise }),
        answer: null,
      }));
      // CR 101.4, 608.2d: with several players, all answer (in APNAP order) before anything happens.
      const [first, ...rest] = asked;
      if (first === undefined || rest.length === 0) return done(state, [], asked);
      return done(
        state,
        [],
        [
          {
            ...first,
            together: {
              later: rest.map((r) => ({
                seat: r.seat,
                ...(r.as === undefined ? {} : { as: r.as }),
              })),
              held: [],
            },
          },
        ],
      );
    }

    case 'noMaxHandSizeForGame':
      // CR 402.2, 514.1: no maximum hand size for the rest of the game; the cleanup step reads it (`hasNoMaximumHandSize`).
      return done(patchSeat(state, res.controller, { noMaximumHandSize: true }));

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

    case 'givePoison': {
      // CR 122.1, 704.5c (Vraska, Betrayal's Sting): each player named puts that many poison counters on themselves.
      const amount = amountOf(state, effect.amount, ctx, targets);
      if (amount <= 0) return done(state);
      for (const seat of resolvePlayers(state, effect.player, ctx, targets)) {
        const had = getSeat(next, seat).poison;
        next = patchSeat(next, seat, { poison: had + amount });
        events.push({ kind: 'poisonChanged', seat, from: had, to: had + amount });
      }
      return done(next, events);
    }

    case 'gainExperience': {
      // CR 122.1 (Meren of Clan Nel Toth): "You get an experience counter": the player puts that many experience counters on themselves.
      const amount = amountOf(state, effect.amount, ctx, targets);
      if (amount <= 0) return done(state);
      for (const seat of resolvePlayers(state, effect.player, ctx, targets)) {
        const had = getSeat(next, seat).experience ?? 0;
        next = patchSeat(next, seat, { experience: had + amount });
        events.push({ kind: 'experienceChanged', seat, from: had, to: had + amount });
      }
      return done(next, events);
    }

    case 'doublePlayerCounters': {
      // CR 701.10, 122.1 (issue 105, Aetheric Amplifier): each player named puts as many counters of each kind as they have of it: poison, energy and experience.
      for (const seat of resolvePlayers(state, effect.player, ctx, targets)) {
        const have = getSeat(next, seat);
        const poison = have.poison;
        const energy = have.energy ?? 0;
        const experience = have.experience ?? 0;
        next = patchSeat(next, seat, {
          ...(poison > 0 ? { poison: poison * 2 } : {}),
          ...(energy > 0 ? { energy: energy * 2 } : {}),
          ...(experience > 0 ? { experience: experience * 2 } : {}),
        });
        if (poison > 0) events.push({ kind: 'poisonChanged', seat, from: poison, to: poison * 2 });
        if (energy > 0) events.push({ kind: 'energyChanged', seat, from: energy, to: energy * 2 });
        if (experience > 0) {
          events.push({ kind: 'experienceChanged', seat, from: experience, to: experience * 2 });
        }
      }
      return done(next, events);
    }

    case 'increaseSpeed': {
      // CR 702.179c: no speed becomes that value; otherwise it goes up by the amount (rules/speed.ts).
      const amount = amountOf(state, effect.amount, ctx, targets);
      if (amount <= 0) return done(state);
      for (const seat of resolvePlayers(state, effect.player, ctx, targets)) {
        const raised = increaseSpeed(next, seat, amount);
        next = raised.state;
        events.push(...raised.events);
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
      // CR 701.9a: "discards their hand" is read for each player as their instruction runs (`runDiscard`), so there is no count here.
      // "Discard your hand" written as the number of cards in the player's own hand is the same whole-hand discard (CR 701.9a), so an empty hand still discards its hand
      // (Snort: "each opponent who discarded their hand this way").
      const ownHandCount =
        effect.player.kind === 'you' &&
        typeof effect.count === 'object' &&
        effect.count.kind === 'countOf' &&
        Object.keys(effect.count.filter).length === 2 &&
        effect.count.filter.zone === 'hand' &&
        effect.count.filter.controller === 'you';
      const wholeHand = effect.hand === true || ownHandCount;
      const count = anyNumber || wholeHand ? 0 : amountOf(state, effect.count, ctx, targets);
      if (count <= 0 && !anyNumber && !wholeHand) return done(state);
      const seats = resolvePlayers(state, effect.player, ctx, targets);
      // CR 701.9, 101.4: with several players, they choose in APNAP order, one instruction for the first that keeps the others' turns to choose, and all the chosen cards go at once
      // (Plaguecrafter's `together` is the same for every discard by several players now).
      const group = seats.length > 1 ? { later: seats.slice(1), held: [] } : undefined;
      return done(
        state,
        [],
        (group === undefined ? seats : seats.slice(0, 1)).map((seat) => ({
          kind: 'discard' as const,
          seat,
          count,
          ...(anyNumber ? { anyNumber: true as const } : {}),
          ...(effect.upTo === true ? { upTo: true as const } : {}),
          ...(wholeHand ? { hand: true as const } : {}),
          ...(effect.random === true ? { random: true as const } : {}),
          ...(effect.unless === undefined ? {} : { unless: effect.unless }),
          ...(group === undefined ? {} : { together: group }),
          chosen: null,
        })),
      );
    }

    case 'gainLevel': {
      // CR 716.2a (D-235): "This Class's level becomes N": the permanent the ability belongs to, if it is still on the battlefield.
      const source = res.source === null ? undefined : state.objects[res.source];
      if (source?.zone !== 'battlefield') return done(state);
      const previous = source.level ?? 1;
      return {
        ...done(patchObject(state, source.id, { level: effect.level })),
        events:
          previous === effect.level
            ? []
            : [{ kind: 'classLevelReached', object: source.id, level: effect.level }],
        performed: 1,
      };
    }

    case 'monstrosity': {
      // CR 701.37a (D-445): "If this permanent isn't monstrous, put N +1/+1 counters on it and it becomes monstrous": the permanent the ability belongs to, if it is still on the
      // battlefield. A permanent that can't have the counters (D-380) still becomes monstrous.
      const source = res.source === null ? undefined : state.objects[res.source];
      if (source?.zone !== 'battlefield' || source.monstrous === true) return done(state);
      const count = amountOf(state, effect.count, ctx, targets);
      let afterCounters = state;
      const monstrousEvents: GameEvent[] = [];
      if (count > 0 && !blocks(state, counterBlockers(state), source, '+1/+1')) {
        const put = counterCountOn(state, source, '+1/+1', count);
        afterCounters = patchObject(afterCounters, source.id, {
          counters: { ...source.counters, '+1/+1': (source.counters['+1/+1'] ?? 0) + put },
        });
        monstrousEvents.push({
          kind: 'counterAdded',
          object: source.id,
          counter: '+1/+1',
          count: put,
          by: ctx.controller,
        });
      }
      monstrousEvents.push({ kind: 'becameMonstrous', object: source.id });
      return {
        ...done(patchObject(afterCounters, source.id, { monstrous: true }), monstrousEvents),
        performed: 1,
      };
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

    case 'chooseRandomFromGraveyard': {
      // CR 608.2c, 400.7 (Death Toll deck group B): `count` cards of the controller's graveyard that match, picked by the game's random number generator; they are what `moved` names.
      const candidates = getSeat(state, res.controller).graveyard.filter((id) => {
        const card = state.objects[id];
        return (
          card !== undefined &&
          (effect.filter === undefined ||
            matchesFilter(
              state,
              card,
              { ...effect.filter, zone: 'graveyard' },
              { controller: res.controller, source: res.source },
            ))
        );
      });
      const [shuffled, rng] = shuffle(candidates, state.rng);
      return { ...done({ ...state, rng }), lastMoved: shuffled.slice(0, effect.count) };
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
      // D-484: with `own` the players the selector names choose among their own permanents and sacrifice the rest, lands too.
      return done(
        state,
        [],
        [
          startSpare(
            state,
            effect.types,
            effect.own === undefined
              ? undefined
              : resolvePlayers(state, effect.own.players, ctx, targets),
            effect.own === undefined
              ? {}
              : {
                  ...(effect.own.typesOnly === true ? { typesOnly: true as const } : {}),
                  ...(effect.own.counter === undefined ? {} : { counter: effect.own.counter }),
                  ...(effect.own.cantAttackYou === true ? { cantAttackYou: true as const } : {}),
                },
          ),
        ],
      );

    case 'exileFromTriggerCards': {
      // CR 603.2c, 608.2d, 400.7 (Lorehold group 1): "you may exile one of them from your graveyard": the controller chooses none or one of the cards that triggered this ability
      // that are still in their graveyard, which the choice's own question offers; with none there nothing is asked and nothing is done.
      return done(
        state,
        [],
        [
          {
            kind: 'chooseMove' as const,
            filter: { zone: 'graveyard' as const },
            count: 1,
            to: 'exile' as const,
            position: 'top' as const,
            optional: true as const,
            among: res.triggerCards ?? [],
            chosen: null,
          },
        ],
      );
    }

    case 'mayPlayCounterCard': {
      // CR 608.2d, 122.1 (issue 102, Dauthi Voidwalker): the controller chooses an exiled card an opponent owns with the counter on it, and may play it this turn.
      const among = Object.values(state.objects)
        .filter(
          (o) =>
            o.zone === 'exile' &&
            o.card !== null &&
            o.owner !== res.controller &&
            (o.counters[effect.counter] ?? 0) > 0,
        )
        .map((o) => o.id);
      if (among.length === 0) return done(state);
      return done(
        state,
        [],
        [
          {
            kind: 'chooseMove' as const,
            filter: { zone: 'exile' as const },
            count: 1,
            to: 'exile' as const,
            position: 'top' as const,
            among,
            permit: effect.free === true ? { free: true as const } : {},
            chosen: null,
          },
        ],
      );
    }

    case 'putOneOfTriggerCards': {
      // CR 603.2c, 608.2d, 400.7, 110.2a (issue 102): the controller chooses one of the cards that triggered this ability that are still in a graveyard and puts it onto the battlefield
      // under their control; with one candidate nothing is asked, with none nothing is done.
      return done(
        state,
        [],
        [
          {
            kind: 'chooseMove' as const,
            filter: { zone: 'graveyard' as const },
            count: 1,
            to: 'battlefield' as const,
            position: 'top' as const,
            tapped: false,
            controller: 'you' as const,
            anyOwner: true as const,
            among: res.triggerCards ?? [],
            chosen: null,
          },
        ],
      );
    }

    case 'eachOpponentChoosesGraveyardCard': {
      // CR 101.4, 608.2d, 404.1, 110.2a (Rejoin the Fight): each opponent of the controller who is still in the game, starting with the next one in turn order, chooses a card of
      // the controller's graveyard that no one chose before; the cards chosen then enter together under the controller's control.
      const [first, ...later] = seatsInOrder(state, res.controller).filter(
        (seat) => seat !== res.controller,
      );
      if (first === undefined) return done(state);
      const { controller: _you, ...described } = effect.filter;
      return done(
        state,
        [],
        [
          {
            kind: 'chooseMove' as const,
            filter: described,
            count: 1,
            to: 'battlefield' as const,
            position: 'top' as const,
            tapped: false,
            controller: 'you' as const,
            seat: first,
            graveyardOf: res.controller,
            together: { distinct: true as const, later, held: [] },
            chosen: null,
          },
        ],
      );
    }

    case 'exileOwnGraveyardCard': {
      // CR 701.13, 101.4 (D-231): each player named chooses a card of their own graveyard, in turn order from the active player; it is exiled.
      const seats = resolvePlayers(state, effect.players, ctx, targets);
      // CR 101.4: with several players they choose in APNAP order and the cards go together once the last has chosen.
      const exile = (seat: SeatId) => ({
        kind: 'chooseMove' as const,
        filter: { zone: 'graveyard' as const },
        count: 1,
        to: 'exile' as const,
        position: 'top' as const,
        seat,
        countsNonland: true as const,
        chosen: null,
      });
      const [first, ...later] = seats;
      if (first === undefined) return done(state);
      return done(
        state,
        [],
        [later.length === 0 ? exile(first) : { ...exile(first), together: { later, held: [] } }],
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
            ...(effect.take.withCounters === undefined
              ? {}
              : { withCounters: effect.take.withCounters }),
            // CR 202.3 (D-145): "with mana value less than or equal to the number of lands you control", worked out as the effect runs.
            ...(effect.take.manaValueAtMost === undefined
              ? {}
              : { manaValueAtMost: amountOf(state, effect.take.manaValueAtMost, ctx, targets) }),
            ...(effect.take.totalManaValue === undefined
              ? {}
              : { totalManaValue: effect.take.totalManaValue }),
            // D-324 (CR 701.20a): "Put two of them into your hand" does not reveal them.
            ...(effect.take.hidden === true ? { hidden: true as const } : {}),
            // CR 608.2c: "If you don't, put a card from among them into your hand."
            ...(effect.take.elseAnyToHand === true ? { elseAnyToHand: true as const } : {}),
            // CR 701.20, 608.2c: "Put all land cards from among them onto the battlefield tapped": no choice.
            ...(effect.take.all === true ? { all: true as const } : {}),
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
      // A slot of several targets (one for each opponent) is asked about card by card, in the order the targets were chosen (CR 608.2g).
      const cards = resolveObjects(state, effect.object, ctx, targets);
      if (cards.length === 0) return done(state);
      return done(
        state,
        [],
        cards.map((card) => ({
          kind: 'castCard' as const,
          stage: 'start' as const,
          card,
          anyManaType: effect.anyManaType === true,
          exileInstead: effect.exileInstead === true,
          ...(effect.free === true ? { free: true } : {}),
          ...(effect.remember === true ? { remember: true } : {}),
        })),
      );
    }

    case 'castFree': {
      // CR 608.2g, 101.4 (issue 81, The Ur-Sphinx): "For each player, you may cast a card that player milled this way": one question for each owner of the cards just
      // moved, in turn order from the active player, over the cards that owner has among them (those in a graveyard now).
      if (effect.perOwner === true) {
        const moved = resolveObjects(state, effect.objects as ObjectRef, ctx, targets).filter(
          (id) => state.objects[id]?.zone === 'graveyard',
        );
        const asks = seatsInOrder(state, state.turn.activeSeat).flatMap((owner) => {
          const cards = moved.filter((id) => state.objects[id]?.owner === owner);
          return cards.length === 0
            ? []
            : [
                {
                  kind: 'castFree' as const,
                  objects: effect.objects,
                  play: false,
                  cards,
                  cardsZone: 'graveyard' as const,
                  chosen: null,
                },
              ];
        });
        return done(state, [], asks);
      }
      // CR 115.1, 608.2b, 608.2g (Horde of Notions): "You may play target Elemental card from your graveyard without paying its mana cost": the question is about the target
      // card, if it is still in a graveyard as the object it was targeted as (`cards`), and about nothing else.
      if (effect.objects.kind === 'target') {
        const named = resolveObjects(state, effect.objects, ctx, targets).filter(
          (id) => state.objects[id]?.zone === 'graveyard',
        );
        return done(
          state,
          [],
          [
            {
              kind: 'castFree',
              objects: effect.objects,
              play: effect.play === true,
              cards: named,
              cardsZone: 'graveyard',
              chosen: null,
            },
          ],
        );
      }
      // CR 608.2g (D-145): "You may cast a spell ... without paying its mana cost" (rules/cast-free.ts).
      // Issue 97 (Kefka): "any number of spells from among cards exiled this way", remembering each spell: the cards offered are fixed as the effect begins, because `moved` then grows with the spells cast.
      const fixed =
        effect.remember === true && effect.max !== undefined
          ? resolveObjects(state, effect.objects as ObjectRef, ctx, targets).filter(
              (id) => state.objects[id]?.zone === 'exile',
            )
          : undefined;
      if (fixed?.length === 0) return { ...done(state), resetPerformed: true };
      // "... then they may cast that card": the player the effect names, one only (worked out now: the target they are the controller of may be gone by the time they are asked).
      const [caster] =
        effect.player === undefined ? [] : resolvePlayers(state, effect.player, ctx, targets);
      if (effect.player !== undefined && caster === undefined) return done(state);
      return done(
        state,
        [],
        [
          {
            kind: 'castFree',
            objects: effect.objects,
            play: effect.play === true,
            ...(effect.exileInstead === true ? { exileInstead: true as const } : {}),
            ...(caster === undefined ? {} : { seat: caster }),
            ...(effect.filter === undefined ? {} : { filter: effect.filter }),
            ...(effect.max === undefined ? {} : { remaining: effect.max }),
            ...(effect.remember === true ? { remember: true as const } : {}),
            ...(effect.paying === true ? { paying: true as const } : {}),
            ...(effect.anyManaType === true ? { anyManaType: true as const } : {}),
            ...(fixed === undefined ? {} : { cards: fixed, cardsZone: 'exile' as const }),
            ...(effect.creatureGains === undefined ? {} : { creatureGains: effect.creatureGains }),
            chosen: null,
          },
        ],
      );
    }

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
      // Issue 81 (Jhoira, Proteus Staff): the library may be another player's (`from`); with none to name nothing is revealed.
      // Issue 102 (Consuming Aberration): "each opponent reveals ... until they reveal a land card, then puts those cards into their graveyard": every player named reveals from their own library.
      if (effect.from !== undefined && effect.perPlayer === true) {
        const outcomes = resolvePlayers(state, effect.from, ctx, targets).map((revealer) =>
          runRevealUntil(state, res, effect, 1, revealer),
        );
        return done(
          state,
          outcomes.flatMap((o) => o.events),
          outcomes.flatMap((o) => o.front),
        );
      }
      if (effect.from !== undefined) {
        const revealer = resolvePlayers(state, effect.from, ctx, targets)[0];
        if (revealer === undefined) return done(state);
        return runRevealUntil(
          state,
          res,
          effect,
          effect.count === undefined ? 1 : amountOf(state, effect.count, ctx, targets),
          revealer,
        );
      }
      return runRevealUntil(
        state,
        res,
        effect,
        effect.count === undefined ? 1 : amountOf(state, effect.count, ctx, targets),
      );

    case 'exileUntilFound':
      // CR 701.13, 101.4 (D-660): each player exiles from the top of their library until a card matches (rules/exile-until-found.ts).
      return runExileUntilFound(state, res, effect, ctx, targets);

    case 'opponentChoosesCard':
      // CR 608.2d (D-660): an opponent chooses one of the cards moved; the others are `moved` afterwards (rules/choose-aside.ts).
      return startOpponentChoosesCard(state, res, effect, ctx);

    case 'exilePiles':
      // CR 700.3, 406.3 (D-663): a face-down pile and a face-up pile of exiled cards; an opponent chooses one (rules/exile-piles.ts).
      return startExilePiles(state, res, effect, ctx);

    case 'exileTopAnyNumber':
      // CR 701.13, 608.2d (D-661): "As many times as you choose, you may exile the top card of your library" (rules/exile-any-number.ts).
      return moving(state, [{ kind: 'exileAnyNumber', answer: null }]);

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

    case 'putFromHandOnBottom':
      // CR 401.4 (issue 81): one card of the hand goes on the bottom of the library (rules/arrange.ts).
      return done(
        state,
        [],
        [{ kind: 'putOnTop', seat: res.controller, count: 1, chosen: null, toBottom: true }],
      );

    case 'search':
      // CR 701.23a: each player the effect names searches their own library, in turn; a "may"
      // search is asked first (accepted stays null until answered, rules/search.ts). D-177, CR 400.7j: what the search
      // finds is "it" for the instructions after it ("Then if you control four or more lands, untap that land"): `moved`
      // starts empty and each card the search puts somewhere is added as it moves.
      return {
        ...done(state, [], searchInstructions(state, effect, ctx, targets)),
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

    case 'unattach': {
      // CR 701.3d, 702.151a (Reconfigure): each permanent the reference names that is on the battlefield and attached to a permanent becomes unattached and stays.
      for (const id of resolveObjects(state, effect.object, ctx, targets)) {
        const obj = next.objects[id];
        if (obj?.zone !== 'battlefield' || obj.attachedTo === null) continue;
        const r = unattach(next, id, obj.attachedTo, 'effect');
        next = r.state;
        events.push(...r.events);
      }
      return done(next, events);
    }

    case 'moveAllCounters': {
      // CR 122.1, 122.6: each counter comes off the first permanent and goes onto the second, except a kind the second can't have.
      const fromId = resolveObjects(state, effect.from, ctx, targets)[0];
      const toId = resolveObjects(state, effect.to, ctx, targets)[0];
      const from = fromId === undefined ? undefined : next.objects[fromId];
      const to = toId === undefined ? undefined : next.objects[toId];
      if (from?.zone !== 'battlefield' || to?.zone !== 'battlefield' || from.id === to.id) {
        return done(next);
      }
      let moved: GameState = next;
      const events: GameEvent[] = [];
      const fromCounters = { ...from.counters };
      let toCounters = { ...to.counters };
      for (const [counter, count] of Object.entries(from.counters)) {
        if (count <= 0 || counterBlocked(state, to, counter)) continue;
        delete fromCounters[counter];
        toCounters = { ...toCounters, [counter]: (toCounters[counter] ?? 0) + count };
        events.push(
          { kind: 'counterRemoved', object: from.id, counter, count },
          { kind: 'counterAdded', object: to.id, counter, count, by: res.controller },
        );
      }
      if (events.length === 0) return done(next);
      moved = patchObject(moved, from.id, { counters: fromCounters });
      moved = patchObject(moved, to.id, { counters: toCounters });
      return done(moved, events);
    }

    case 'putCountersOf': {
      // CR 122.1, 122.6, 113.7a, 608.2h (Zack Fair): each counter the first permanent had, as it is or as it last was on the battlefield, is put onto the second, kind by kind,
      // as any counters put on a permanent are (replacements and prevention of counters apply). Nothing is taken off the first.
      const fromId = resolveObjects(state, effect.from, ctx, targets)[0];
      const toId = resolveObjects(state, effect.to, ctx, targets)[0];
      const from = fromId === undefined ? null : objectOrLki(state, fromId);
      if (from === null || toId === undefined) return done(next);
      const blockers = counterBlockers(state);
      const bonuses = counterBonuses(state);
      for (const [counter, count] of Object.entries(from.counters)) {
        if (count <= 0) continue;
        const put = putCountersOn(
          state,
          next,
          toId,
          counter,
          count,
          ctx.controller,
          blockers,
          bonuses,
        );
        next = put.state;
        events.push(...put.events);
      }
      return done(next, events);
    }

    case 'moveCounter': {
      // CR 122.5: one counter, of a kind the controller chooses, from the first permanent to the second (rules/counter-pick.ts).
      const fromId = resolveObjects(state, effect.from, ctx, targets)[0];
      const toId = resolveObjects(state, effect.to, ctx, targets)[0];
      if (fromId === undefined || toId === undefined || fromId === toId) return done(next);
      return done(
        next,
        [],
        [
          {
            kind: 'counterPick',
            mode: 'move',
            objects: [fromId],
            to: toId,
            left: 1,
            removed: 0,
            chosen: null,
          },
        ],
      );
    }

    case 'removeChosenCounters':
      // CR 122.1, 608.2d: the controller takes counters off the permanents the selector names, one at a time (rules/counter-pick.ts).
      return done(
        next,
        [],
        [
          {
            kind: 'counterPick',
            mode: 'remove',
            objects: resolveObjects(state, effect.objects, ctx, targets),
            to: null,
            left: effect.upTo ?? null,
            removed: 0,
            chosen: null,
          },
        ],
      );

    case 'removeAllPlayerCounters': {
      const removed: GameEvent[] = [];
      for (const id of resolvePlayers(state, effect.player, ctx, targets)) {
        const seat = getSeat(next, id);
        if (seat.poison > 0) {
          removed.push({ kind: 'poisonChanged', seat: id, from: seat.poison, to: 0 });
        }
        if ((seat.energy ?? 0) > 0) {
          removed.push({ kind: 'energyChanged', seat: id, from: seat.energy ?? 0, to: 0 });
        }
        if ((seat.experience ?? 0) > 0) {
          removed.push({
            kind: 'experienceChanged',
            seat: id,
            from: seat.experience ?? 0,
            to: 0,
          });
        }
        next = patchSeat(next, id, { poison: 0, energy: 0, experience: 0 });
      }
      return done(next, removed);
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
      // Nexus Mentality: "for each counter removed this way" counts every counter that came off.
      const total = removed.reduce((n, e) => (e.kind === 'counterRemoved' ? n + e.count : n), 0);
      return {
        ...done(cleared, removed),
        ...(total > 0 ? { thisWay: { countersRemoved: total } } : {}),
      };
    }

    case 'eachPlayerChoosesDestroy':
      // CR 101.4 (issue 105, Druid of Purification): the players choose in turn order starting with the controller (rules/choose-each.ts).
      return done(
        state,
        [],
        [
          {
            kind: 'chooseEach',
            filter: effect.filter,
            seats: seatsInOrder(state, res.controller),
            picked: [],
            chosen: null,
          },
        ],
      );

    case 'chooseOnePerOpponentDestroy':
      // CR 608.2d, 701.8 (Ultimate Magic: Meteor): the controller chooses one permanent for each opponent, in turn order (rules/choose-each.ts).
      return done(
        state,
        [],
        [
          {
            kind: 'chooseEach',
            filter: effect.filter,
            perOpponent: true,
            seats: opponentsOf(state, res.controller),
            picked: [],
            chosen: null,
          },
        ],
      );

    case 'proliferate':
      // CR 701.34a (D-149): the controller chooses the permanents and players to give counters to (rules/proliferate.ts).
      // "Proliferate X times": each time is its own choice, read once as the effect starts.
      return done(
        state,
        [],
        Array.from(
          { length: effect.times === undefined ? 1 : amountOf(state, effect.times, ctx, targets) },
          () => ({ kind: 'proliferate' as const, chosen: null, players: [] }),
        ),
      );

    case 'conditional': {
      // CR 608.2c: the condition is read now, as this instruction comes up, after everything
      // before it has happened. The chosen branch runs next, ahead of the rest of the queue.
      const holds = evaluateCondition(state, effect.condition, {
        ...ctx,
        targets,
        ...(res.performed === undefined ? {} : { performed: res.performed }),
        // D-271: "If the result is 1": the die the earlier instruction rolled.
        ...(res.dieResult === undefined ? {} : { dieResult: res.dieResult }),
        ...(res.clashWon === undefined ? {} : { clashWon: res.clashWon }),
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

    case 'ownerPutsOnLibrary':
      // CR 108.3, 401.4: the owner of each permanent chooses the top or the bottom of their library (rules/owner-library-choice.ts).
      return runOwnerLibraryChoice(state, resolveObjects(state, effect.objects, ctx, targets));

    case 'explore':
      // CR 701.44 (issue 81): the permanents explore one at a time (rules/explore.ts).
      return runExplore(state, resolveObjects(state, effect.objects, ctx, targets), effect);

    case 'revealTop':
      // CR 701.20 (D-151): reveal the top card, and put it onto the battlefield if it matches (rules/reveal-top.ts).
      return runRevealTop(state, res, effect, ctx, targets);

    case 'replaceEnchant':
      // CR 613.1f, 702.5a: "it loses \"enchant ...\" and gains \"enchant ...\"" (rules/replace-enchant.ts).
      return runReplaceEnchant(state, effect, ctx, targets);

    case 'revealTopBranches':
      // CR 701.20a, 608.2c: reveal the top card once and do each branch it matches (rules/reveal-top-branches.ts).
      return runRevealTopBranches(state, res, effect, ctx, targets);

    case 'revealTopCard':
      // CR 701.20a, 400.7j: reveal the top card; it is `moved` for the effects after it (rules/reveal-top-card.ts).
      return runRevealTopCard(state, effect, ctx, targets);

    case 'revealTopDuel':
      // CR 701.20a, 119.3: two players reveal, lose life equal to the other's card, and take their card (rules/reveal-top-duel.ts).
      return runRevealTopDuel(state, res, effect, ctx, targets);

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

    case 'revealTopCast':
      // CR 701.20a, 608.2g: reveal the top card, may cast it without paying its mana cost when its mana value is less than the limit, else put it into the hand.
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
              rest: 'stayExiled',
              revealTop: { below: amountOf(state, effect.manaValueBelow, ctx, targets) },
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
        ...(values.doors === undefined ? {} : { doors: values.doors }),
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

    case 'grantPlayerHexproof':
      // CR 702.11b, 611.2 (Hylda group 3): the players have hexproof until end of turn (`rules/player-hexproof.ts`).
      return runGrantPlayerHexproof(state, effect, ctx, targets);

    case 'grantCastAsThoughFlash':
      // CR 601.3b (Alchemist's Refuge): the players may cast spells as though they had flash until end of turn (`rules/player-flash.ts`).
      return runGrantCastAsThoughFlash(state, effect, ctx, targets);

    case 'grantPlayerManaAbility':
      // CR 605.1a, 118.3 (Channel): the players have a mana ability of their own until end of turn (`rules/player-mana.ts`).
      return runGrantPlayerManaAbility(state, effect, ctx, targets);

    case 'attackRandomOpponent':
      // CR 508.1d, 701.26a: an opponent at random that was not attacked in the last combat must be attacked this combat, or the creature is tapped (`rules/attack-random-opponent.ts`).
      return runAttackRandomOpponent(state, effect, ctx.source, res.controller);

    case 'goad':
      // CR 701.15a-d (D-639): the creatures are goaded until the controller's next turn (`rules/goad.ts`).
      return runGoad(state, effect, ctx, targets);

    case 'removeFromCombat':
      // CR 506.4: the creatures are taken out of the combat in progress (`rules/remove-from-combat.ts`).
      return runRemoveFromCombat(state, effect, ctx, targets);

    case 'grantPlayerProtectionEverything':
    case 'preventPlayerLifeTotalChange':
      return runPlayerLock(state, effect, ctx, targets);

    case 'playerCantCastSpells':
      // CR 101.2, 611.2a: the players can't cast spells until end of turn (`rules/player-lock.ts`).
      return runPlayerCantCast(state, effect, ctx, targets);

    case 'requireAttack':
      // CR 508.1d, 611.2c (D-179): a requirement on a group of creatures, read when attackers are declared.
      return runRequireAttack(state, effect, ctx);

    case 'creaturesCantAttackYou':
      // CR 508.1a, 611.2a, 611.2c: a restriction on a group of creatures, read when attackers are declared.
      return runCreaturesCantAttackYou(state, effect, ctx);

    case 'restrictGroup':
      // CR 609.4, 611.2c: a rule change on a group of creatures, read where the rule acts (attackers declared, combat damage assigned).
      return runRestrictGroup(state, effect, ctx);

    case 'choosePlayer':
      // CR 608.2d (The Black Gate): the controller chooses a player with the most life; the answer is what "that player" means for the rest of the resolution.
      return done(state, [], [{ kind: 'choosePlayer', among: effect.among, chosen: null }]);

    case 'cantBeBlockedByPlayer':
      // CR 509.1b, 611.2a (The Black Gate): the creatures named can't be blocked by creatures a player controls this turn.
      return runCantBeBlockedByPlayer(state, effect, ctx, targets);

    case 'cantAttackPlaneswalkers':
      // CR 508.1a, 611.2a (issue 81): the creatures named can't attack the controller's planeswalkers of a subtype this turn.
      return runCantAttackPlaneswalkers(state, effect, ctx, targets);

    case 'requireAttackSource':
      // CR 508.1d, 611.2c: creatures of the named player attack this permanent if able, during that player's next turn.
      return runRequireAttackSource(state, effect, ctx, targets);

    case 'doubleTokens':
      // CR 614.1a, 614.5 (issue 101): "until end of turn, if one or more tokens would be created under your control, twice that many are created instead".
      return runDoubleTokens(state, effect, ctx);

    case 'permanentsEnterTapped':
      // CR 614.1c, 614.12 (D-519): "creatures your opponents control enter tapped", read as a permanent enters.
      return runEntersTappedGroup(state, effect, ctx);

    case 'gainControl':
      // CR 613.1b, 611.2 (D-189): a layer 2 effect (`rules/control-effects.ts`).
      return runGainControl(state, effect, ctx, targets);

    case 'returnControlToOwners':
      // CR 613.1b, 611.2a (D-628): one layer 2 effect for each owner (`rules/control-effects.ts`).
      return runReturnControl(state, effect, ctx, targets);

    case 'exchangeControl':
      // CR 701.12a, 701.12b (Galadriel group 3): two layer 2 effects made together, or nothing (`rules/control-effects.ts`).
      return runExchangeControl(state, effect, ctx, targets);

    case 'removeCounters': {
      // CR 122.1 (Galadriel group 3): the permanent loses up to that many counters of the kind; one event for the number that came off.
      const wanted = amountOf(state, effect.count, ctx, targets);
      if (wanted <= 0) return done(state);
      let anyRemoved = false;
      for (const id of resolveObjects(state, effect.objects, ctx, targets)) {
        const obj = next.objects[id];
        // CR 122.1: counters stay on a permanent and on a card in exile (a suspended card's time counters, CR 702.62b).
        if (obj?.zone !== 'battlefield' && obj?.zone !== 'exile') continue;
        const had = obj.counters[effect.counter] ?? 0;
        const removed = Math.min(had, wanted);
        if (removed <= 0) continue;
        anyRemoved = true;
        const left = had - removed;
        const { [effect.counter]: _gone, ...rest } = obj.counters;
        next = patchObject(next, id, {
          counters: left > 0 ? { ...obj.counters, [effect.counter]: left } : rest,
        });
        events.push({
          kind: 'counterRemoved',
          object: id,
          counter: effect.counter,
          count: removed,
        });
      }
      // CR 608.2c: removing a counter is something done, which "if you do" reads.
      return { ...done(next, events), performed: anyRemoved ? 1 : 0 };
    }

    case 'modifyPt':
    case 'setPt':
    case 'loseAllAbilities':
    case 'loseHexproofShroud':
    case 'setTypes':
    case 'setColors':
    case 'grantAbility':
    case 'grantKeyword':
    case 'restrict':
      // D-451 (CR 702.16, 608.2d): "gains protection from the color of your choice": the controller chooses the color first (rules/protection-choice.ts).
      if (givesProtectionOfChoice(effect)) {
        return done(state, [], [{ kind: 'protectionColor', effect, chosen: null }]);
      }
      // D-514 (CR 702.16a, 608.2d): "gains protection from the card type of your choice": the same, with a card type.
      if (givesProtectionOfCardTypeChoice(effect)) {
        return done(state, [], [{ kind: 'protectionCardType', effect, chosen: null }]);
      }
      // CR 611.2, 613: "gets +N/+N until end of turn", "loses all abilities", "becomes a Frog" and
      // the rest are continuous effects in the game state, applied by `derive` in their layers.
      return runContinuous(state, effect, ctx, targets);

    default: {
      const unreachable: never = effect;
      return unreachable;
    }
  }
}

/**
 * Puts `count` counters of a kind on one object as the effect of a spell or ability (CR 122.6, 101.2, D-380): nothing if the object is gone
 * or can't have counters of the kind. `read` is the state the counter blockers were read from.
 */
function putCountersOn(
  read: GameState,
  state: GameState,
  id: ObjectId,
  counter: string,
  count: number,
  by: SeatId,
  blockers: ReturnType<typeof counterBlockers>,
  bonuses: ReturnType<typeof counterBonuses>,
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const obj = state.objects[id];
  if (!obj || blocks(read, blockers, obj, counter)) return { state, events: [] };
  // CR 614.1a, 122.6: "that many plus one counters are put on it instead" (`countersPlus`).
  const put = bonusCounters(read, bonuses, obj, counter, count);
  return {
    state: patchObject(state, id, {
      counters: { ...obj.counters, [counter]: (obj.counters[counter] ?? 0) + put },
    }),
    events: [{ kind: 'counterAdded', object: id, counter, count: put, by }],
  };
}

/** An effect with each `thisWay` amount in it replaced by the number the effects before it counted (CR 603.7c: a delayed ability is about what happened as it was created). */
function bindThisWay<T>(value: T, counts: ThisWayCounts | undefined): T {
  if (Array.isArray(value)) return value.map((item) => bindThisWay(item, counts)) as T;
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  if (record.kind === 'thisWay' && typeof record.what === 'string') {
    return (counts?.[record.what as keyof ThisWayCounts] ?? 0) as T;
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, bindThisWay(item, counts)]),
  ) as T;
}
