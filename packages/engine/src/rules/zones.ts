/**
 * The zone-change pipeline (SPEC 17.1 A1, D-001). Every move between zones goes through
 * propose -> apply replacement effects (CR 614, 616) -> commit -> emit.
 *
 * Rules implemented here:
 * - CR 400.7 (General): the moved object is a new object with a new ObjectId; counters, damage,
 *   attachments and "until end of turn" effects do not carry over.
 * - CR 113.7a / 603.10: last-known information of the old object is recorded before it leaves.
 * - CR 702.34a (Flashback): a spell cast for its flashback cost is exiled instead of going to any
 *   other zone when it leaves the stack.
 * - CR 903.9b (Commander): a commander that would be put into its owner's hand or library may
 *   go to the command zone instead. This is the owner's choice, so the pipeline can answer
 *   `needsDecision`; the caller asks and calls again with `commanderChoice` set.
 * - CR 614.12 / 614.1c (replacement effects that modify how a permanent enters): "enters
 *   tapped" (possibly "unless ..."), "enters with counters" and "you may pay ... or it enters
 *   tapped" are applied as the object is created. The last asks its controller first, so the
 *   pipeline can answer `needsDecision`; the caller asks and calls again with `entersPaid` set.
 * - CR 614.12a (D-100): "As this enters, choose a creature type / a color" is asked before the permanent
 *   enters, whatever put it there (a resolving spell, an effect, a land played from the hand); the
 *   caller asks and calls again with `entersChosen` set, and the answer is stored on the new object.
 */
import type { Ability, Zone } from '../ast/types';
import { TOKEN_PRESETS } from '../cards/tokens';
import type { ObjectId, SeatId } from '../ids';
import type {
  ChooseCardsDecision,
  ChooseOptionDecision,
  ChoosePermanentDecision,
  CommanderZoneDecision,
  ConfirmOptionalDecision,
} from '../state/decisions';
import type { GameEvent } from '../state/events';
import {
  addToZone,
  allocateObjectId,
  allocateTimestamp,
  definitionOf,
  getObject,
  getSeat,
  isSeatZone,
  loseLifeBy,
  printedCard,
  removeFromZone,
  setObject,
} from '../state/ops';
import type {
  ChosenValues,
  FaceDownBy,
  GameObject,
  GameState,
  LastKnownInfo,
} from '../state/types';
import { optionsFor } from './chosen';
import { controllerOf } from './control';
import { copiableValues } from './copiable';
import { derive, oracleTextOf } from './derive';
import { permanentAlternative } from './derive-alt';
import { dieReplacementFor } from './die-replacement';
import {
  entersAsSaga,
  entersChoice,
  entersCopyOf,
  entersOptions,
  entersPayment,
  entersReveal,
  entersTapped,
  entersWithCounters,
  lifeOf,
} from './enters';
import { becomeCopyAsItEnters, copyCandidates } from './enters-copy';
import { addCounterMaps, groupEntersUntapped, groupEntryCounters } from './enters-group';
import {
  devourCandidates,
  devourDecision,
  devourOf,
  keywordEntryCounters,
  riotDecision,
  riotGivesHaste,
  riotInstances,
} from './enters-keywords';
import { canReveal, revealChoices, revealEvents } from './enters-reveal';
import { withoutRun } from './enters-run';
import { faceDownEntry } from './face-down';
import { applyGraveyardRider } from './graveyard-play';
import { timesKickedOf } from './kicks';
import { commanderCardOf, isCommanderCardId, meldPairIssue } from './melded';
import { becomePrepared, dropPrepareCopy } from './prepare';
import { countMatching } from './select';
import { sourceInfo } from './source-info';
import { createTokens } from './tokens';

export interface MoveRequest {
  readonly object: ObjectId;
  readonly to: Zone;
  /** Seat whose zone receives it. Defaults to the owner for seat zones. */
  readonly toSeat?: SeatId;
  readonly position?: 'top' | 'bottom' | number;
  readonly tapped?: boolean;
  /** The owner's answer to CR 903.9b, once asked. Null or absent means "not asked yet". */
  readonly commanderChoice?: boolean | null;
  /**
   * The controller's answer to "you may pay ... or it enters tapped" (CR 614.12), once asked:
   * true pays and it enters untapped. Null or absent means "not asked yet".
   */
  readonly entersPaid?: boolean | null;
  /**
   * The controller's answer to "As this enters, choose a creature type / a color" (CR 614.12a), once
   * asked. Null or absent means "not asked yet". Ignored for a permanent that asks nothing.
   */
  readonly entersChosen?: ChosenValues | null;
  /**
   * The controller's answer to "As this enters, you may have it become a copy of any creature" (CR 707.9, D-151), once asked: the permanent it
   * copies, or null for none. Absent means "not asked yet". Ignored for a permanent that asks nothing.
   */
  readonly entersCopy?: ObjectId | null;
  /**
   * The controller's answer to devour's "you may sacrifice any number of creatures" (CR 702.82a, D-185), once asked: the creatures sacrificed as
   * the permanent enters, possibly none. Absent means "not asked yet". Ignored for a permanent without devour.
   */
  readonly entersDevour?: readonly ObjectId[];
  /**
   * The controller's answers to riot (CR 702.136a, 702.136b, D-185) so far, one for each instance asked: `counter` or `haste`. The permanent is
   * asked again while there are fewer answers than instances. Ignored for a permanent without riot.
   */
  readonly entersRiot?: readonly string[];
  /**
   * The card the controller chose to reveal for "you may reveal a Mountain or Plains card from your hand" (CR 701.20a, D-225) once there was more than one,
   * after accepting. Absent means "not asked yet". Ignored for a permanent that asks nothing.
   */
  readonly entersRevealed?: ObjectId;
  /** Set by `moveObject` itself: how many creatures were sacrificed for devour, which the permanent's counters count (CR 702.82a). */
  readonly devoured?: number;
  /**
   * The permanent enters with counters on it (CR 122.6, 614.1c): "return it to the battlefield with a -1/-1
   * counter on it" (Persist). Only for a move to the battlefield; the counters are on it as it enters.
   */
  readonly withCounters?: { readonly counter: string; readonly count: number };
  /**
   * The face the new object has up, when it is not simply carried over: the face being cast when a
   * card moves to the stack (CR 709.3, 712.11b, 715.3), the face of a modal double-faced card played
   * as a land (CR 712.12). Without it a spell resolving onto the battlefield keeps the face it had
   * on the stack (CR 712.13) and an object going anywhere else has face 0 (CR 712.8a, 715.4).
   */
  readonly face?: number;
  /** The card is exiled as a resolved Adventure (CR 715.3d): its owner may cast it from exile. */
  readonly onAdventure?: true;
  /**
   * For a creature put into a graveyard together with others (D-133, CR 614.12): the permanents with a "would die"
   * replacement as the event began (`replacementSources`), which still replace the death of a creature that dies with
   * them even if they have been moved already. Left out, the battlefield as it is.
   */
  readonly replacers?: readonly ObjectId[];
  /**
   * D-283 (CR 603.10a, 113.7a): the last-known information of this object was recorded when the event of several permanents leaving together
   * began (`recordLastKnown`, `rules/simultaneous.ts`), so it is not derived again here, after the others of the event left. Used only when that
   * record exists, and only for the one move that follows it: a later departure of the same object (it was regenerated, say) records anew.
   */
  readonly lkiRecorded?: true;
  /**
   * The permanent enters unearthed (CR 702.84a, D-124): it remembers it (`GameObject.alt`), so it has haste and,
   * if it would leave the battlefield, is exiled instead. Only for a move to the battlefield.
   */
  readonly alt?: 'unearth';
  /**
   * The permanents that entered the battlefield in the same event before this one (D-272, CR 603.6a, 614.12b: "return those cards to the battlefield"): the replacement
   * effects of this card that read the battlefield read it without them (`rules/enters-run.ts`). Only for a move to the battlefield; absent for a card that enters alone.
   */
  readonly alongside?: readonly ObjectId[];
  /**
   * D-277 (CR 701.42a, 712.14c): the other card of a meld pair, in the same zone as `object`: the two cards enter the battlefield as one melded permanent, with
   * their back faces up and combined (`face` is 1). `object` is the card the permanent is represented by first (`GameObject.card`); this object ceases to exist
   * as the permanent is made. The caller (`rules/meld.ts`) has checked that they can be melded (CR 701.42b). Only for a move to the battlefield.
   */
  readonly meldWith?: ObjectId;
  /**
   * The permanent enters the battlefield face down (CR 701.40a, 708.3, D-309): the card is turned face down before it enters, so none of its own enters replacement
   * effects, counters, choices or triggers apply, and the new object is a face-down permanent (`GameObject.faceDown`, labelled). What made it face down. The event
   * of the move carries no card (the card is hidden information while the permanent is face down). Only for a move to the battlefield.
   */
  readonly entersFaceDown?: FaceDownBy;
  /**
   * D-279 (CR 712.21b): the player who performs the move, when it is an effect's: the controller of the spell or ability that exiles. A player who exiles a
   * melded permanent determines the order of the two cards, whoever owns it. Absent for a move made by a rule or paid as a cost, where it is the
   * permanent's controller. Read only for a melded permanent that goes to exile.
   */
  readonly by?: SeatId;
}

export type MoveResult =
  | {
      readonly kind: 'done';
      readonly state: GameState;
      readonly events: readonly GameEvent[];
      /** The new object, or null if the object ceased to exist (an ability leaving the stack). */
      readonly newObject: ObjectId | null;
      /**
       * D-277 (CR 712.21, 712.21c): a melded permanent that left the battlefield became two objects; `newObject` is the first card's and this the second's.
       * An effect that follows "the new object" does the same to both cards. Absent for everything else.
       */
      readonly alsoNewObject?: ObjectId;
    }
  | {
      readonly kind: 'needsDecision';
      readonly decision:
        | Omit<CommanderZoneDecision, 'id'>
        | Omit<ConfirmOptionalDecision, 'id'>
        | Omit<ChooseOptionDecision, 'id'>
        | Omit<ChooseCardsDecision, 'id'>
        | Omit<ChoosePermanentDecision, 'id'>;
    };

/**
 * Records what the object looks like now as its last-known information (CR 113.7a, 603.10a). `rules/simultaneous.ts` calls it for every permanent
 * of an event in which several leave together, against the state as the event began (D-283).
 */
export function recordLastKnown(state: GameState, obj: GameObject): GameState {
  return recordLki(state, obj);
}

/** Records what the object looked like just before it left (CR 113.7a, 603.10). */
function recordLki(state: GameState, obj: GameObject): GameState {
  const d = derive(state, obj);
  const info: LastKnownInfo = {
    // CR 113.7a: what it was just before it left, including who controlled it then (a control-changing effect, CR 613.1b, is not kept).
    object: { ...obj, controller: controllerOf(state, obj) },
    characteristics: {
      name: d.name,
      manaCost: d.manaCost,
      supertypes: d.supertypes,
      types: d.types,
      subtypes: d.subtypes,
      colors: d.colors,
      power: d.power,
      toughness: d.toughness,
      loyalty: d.loyalty,
      defense: null,
      oracleText: oracleTextOf(state, obj),
    },
    abilities: d.abilities,
    power: d.power,
    toughness: d.toughness,
  };
  return { ...state, lki: { ...state.lki, [obj.id]: info } };
}

/** The protector of a battle entering the battlefield, or null for any other object (CR 310.11). */
function protectorFor(
  state: GameState,
  old: GameObject,
  controller: SeatId,
  faceIndex: number,
): SeatId | null {
  const card = printedCard(old);
  if (card === null) return null;
  const face = definitionOf(state, card).faces[faceIndex];
  if (!face?.types.includes('battle')) return null;
  // In a two-player game the opponent of the battle's controller protects it.
  return state.seats.find((s) => s.id !== controller && !s.hasLost)?.id ?? null;
}

/** The abilities of the face that enters. */
function enteringFace(
  state: GameState,
  old: GameObject,
  faceIndex: number,
): { readonly abilities: readonly Ability[] } | null {
  const card = printedCard(old);
  if (card === null) return null;
  const face = definitionOf(state, card).faces[faceIndex];
  return face === undefined ? null : { abilities: face.abilities };
}

/**
 * The face the object has after the move: the one asked for; else a spell that becomes a permanent
 * keeps the face it had on the stack (CR 712.13); else the front face (CR 712.8a, 712.14, 715.4).
 */
function faceAfter(old: GameObject, request: MoveRequest): number {
  if (request.face !== undefined) return request.face;
  return old.zone === 'stack' && request.to === 'battlefield' ? old.face : 0;
}

/** CR 903.3, 903.3b: the object is a commander card, or a melded permanent one of whose two cards is a commander card. */
export function isCommanderCard(state: GameState, obj: GameObject): boolean {
  return commanderCardOf(state, obj) !== null;
}

/**
 * Moves one object (see the file comment). CR 702.82a (Devour, D-185): the creatures its controller chose to sacrifice as the permanent enters
 * are sacrificed first, before it is on the battlefield; the move itself then counts them. The devour question is the last one a permanent asks,
 * so by the time it is answered nothing else can need a decision and the sacrifices are never done twice.
 */
export function moveObject(state: GameState, request: MoveRequest): MoveResult {
  const chosen = request.entersDevour ?? [];
  if (request.to !== 'battlefield' || chosen.length === 0 || request.devoured !== undefined) {
    return moveOne(state, request);
  }
  const owner = request.toSeat ?? controllerOf(state, getObject(state, request.object));
  const sacrificed = sacrificeForDevour(state, chosen, owner);
  const moved = moveOne(sacrificed.state, { ...request, devoured: sacrificed.count });
  if (moved.kind !== 'done') return moved;
  return { ...moved, events: [...sacrificed.events, ...moved.events] };
}

/** Sacrifices the creatures `ids` that `seat` still controls (CR 701.21a), as devour does (CR 702.82a): each goes to its owner's graveyard. */
export function sacrificeForDevour(
  input: GameState,
  ids: readonly ObjectId[],
  seat: SeatId,
): { state: GameState; events: GameEvent[]; count: number } {
  let state = input;
  const events: GameEvent[] = [];
  let count = 0;
  // D-283 (CR 603.10a): the creatures sacrificed together keep the last-known information recorded before the first leaves.
  const going = ids.filter((id) => {
    const obj = input.objects[id];
    return obj?.zone === 'battlefield' && controllerOf(input, obj) === seat;
  });
  if (going.length > 1) {
    for (const id of going) {
      const obj = input.objects[id];
      if (obj !== undefined) state = recordLastKnown(state, obj);
    }
  }
  for (const id of ids) {
    const obj = state.objects[id];
    if (obj?.zone !== 'battlefield' || controllerOf(state, obj) !== seat) continue;
    const moved = moveOne(state, {
      object: id,
      to: 'graveyard',
      ...(going.length > 1 ? { lkiRecorded: true as const } : {}),
    });
    if (moved.kind !== 'done') continue;
    state = moved.state;
    events.push(...moved.events, { kind: 'sacrificed', permanent: id, controller: seat });
    count += 1;
  }
  return { state, events, count };
}

function moveOne(state: GameState, request: MoveRequest): MoveResult {
  const old = getObject(state, request.object);
  // D-277 (CR 701.42a, 712.14c): the other card of a meld pair that enters the battlefield with this one as one melded permanent.
  const partner =
    request.meldWith !== undefined && request.to === 'battlefield'
      ? getObject(state, request.meldWith)
      : undefined;
  if (partner !== undefined) {
    const issue = meldPairIssue(state, old, partner);
    if (issue !== null) throw new Error(`moveObject: can not meld: ${issue}`);
  }
  let to = request.to;
  let toSeat: SeatId | null = isSeatZone(to) ? (request.toSeat ?? old.owner) : null;

  // --- Replacement effects (CR 614, 616).
  // CR 702.34a (Flashback): a spell cast for its flashback cost is exiled instead of going anywhere
  // else when it leaves the stack (resolving, being countered, fizzling). It applies before the
  // commander replacement below, whose zones it removes (hand and library).
  if (old.zone === 'stack' && old.stack?.flashback === true && to !== 'exile') {
    to = 'exile';
    toSeat = null;
  }
  // CR 702.84a (Unearth, D-124): "If it would leave the battlefield, exile it instead of putting it anywhere
  // else." It belongs to the unearthed object, not to its abilities, so it holds when it lost them (CR 614.6).
  // It comes before the commander replacement below, whose zones (hand, library) it removes.
  if (old.zone === 'battlefield' && old.alt === 'unearth' && to !== 'exile') {
    to = 'exile';
    toSeat = null;
  }
  // CR 122.1h (D-230): "If this permanent would be put into a graveyard from the battlefield, exile it instead": the replacement effect that one or more
  // finality counters create (Excava, the Risen Past). It belongs to the object, not to an ability, so it holds when the permanent lost its abilities.
  if (old.zone === 'battlefield' && to === 'graveyard' && (old.counters.finality ?? 0) > 0) {
    to = 'exile';
    toSeat = null;
  }
  // CR 614.1a, 700.4 (D-133): "If a creature would die, instead exile it (and create a token)": a creature that would be
  // put into a graveyard from the battlefield is exiled, so it never dies. It comes after Unearth's exile (it no longer
  // would die) and before the commander replacement below, whose zones (hand, library) it removes.
  const dying =
    old.zone === 'battlefield' &&
    to === 'graveyard' &&
    derive(state, old).types.includes('creature');
  const dieInstead = dying ? dieReplacementFor(state, old, request.replacers) : null;
  if (dieInstead !== null) {
    to = 'exile';
    toSeat = null;
  }
  // CR 712.21d, 903.9c (D-277): what the second card of a melded permanent does when the permanent leaves. A replacement effect applied to one of the two
  // cards affects both, so it goes where the permanent goes; only a commander can be exempt (CR 903.9b-c), going to the command zone while the other card
  // goes on to the zone the permanent would have been put into, which is the zone as it is here, after the replacements above.
  const companion = old.meldedWith;
  const companionTo = to;
  const companionToSeat = toSeat;
  // CR 903.9b (Commander): hand or library, from anywhere, becomes command zone at the owner's choice.
  if (isCommanderCard(state, old) && (to === 'hand' || to === 'library')) {
    if (request.commanderChoice === undefined || request.commanderChoice === null) {
      const from = old.zone;
      return {
        kind: 'needsDecision',
        decision: {
          kind: 'commanderZone',
          seat: old.owner,
          card: (commanderCardOf(state, old) ?? old.card) as NonNullable<typeof old.card>,
          object: old.id,
          from: from === 'graveyard' || from === 'exile' || from === 'library' ? from : 'hand',
        },
      };
    }
    if (request.commanderChoice) {
      to = 'command';
      toSeat = old.owner;
    }
  }

  // CR 614.1c, 614.12: "As this enters, you may pay 2 life. If you don't, it enters tapped."
  // The question comes before anything moves. Nothing is asked when it would enter tapped anyway
  // or when the controller has too little life to pay (CR 119.4).
  const enterController = request.toSeat ?? controllerOf(state, old);
  // CR 614.12, 614.12b (D-272): what the replacement effects of the entering card read is the battlefield without the cards that enter with it (`rules/enters-run.ts`).
  const before = withoutRun(state, request.alongside);
  const faceIndex = faceAfter(old, request);
  // CR 708.3 (D-309): a permanent that enters face down is turned face down before it enters, so the face of the card is not looked at: no enters replacement effect, counter
  // or choice of the card applies. What it is as it enters is the face-down status (`downEntry`), which the readers below see on the object they ask about.
  const downEntry = to === 'battlefield' ? faceDownEntry(state, request.entersFaceDown) : {};
  const entersDown = to === 'battlefield' && request.entersFaceDown !== undefined;
  const entering =
    to === 'battlefield' && printedCard(old) !== null && !entersDown
      ? enteringFace(state, old, faceIndex)
      : null;
  const payment = entering === null ? null : entersPayment(entering.abilities);
  const enterCtx = { controller: enterController, source: old.id };
  // CR 614.1c, 614.12, 616.1 (D-179): "Lands you control enter untapped": the permanent enters untapped whatever else would have it enter tapped
  // (the controller would choose that order), so a question about paying life to avoid entering tapped is moot and is not asked.
  const untappedByEffect =
    entering !== null &&
    groupEntersUntapped(before, {
      ...old,
      ...downEntry,
      zone: 'battlefield',
      controller: enterController,
      face: faceIndex,
    });
  const mayPay =
    payment !== null &&
    entering !== null &&
    !untappedByEffect &&
    request.tapped !== true &&
    !entersTapped(before, entering.abilities, enterCtx) &&
    getSeat(state, enterController).life >= lifeOf(payment);
  // D-208 (CR 614.12, 701.20, 701.4): "you may reveal a Mountain or Plains card from your hand. If you don't, it enters tapped": the same question as a shock
  // land's, with nothing to pay. Nothing is asked when it enters tapped anyway or when no card (or permanent) qualifies.
  const revealRule = entering === null ? null : entersReveal(entering.abilities);
  const mayReveal =
    revealRule !== null &&
    entering !== null &&
    !untappedByEffect &&
    request.tapped !== true &&
    !entersTapped(before, entering.abilities, enterCtx) &&
    canReveal(before, enterController, revealRule, old.id);
  if (mayReveal && revealRule !== null && (request.entersPaid ?? null) === null) {
    const info = sourceInfo(state, old.id);
    return {
      kind: 'needsDecision',
      decision: {
        kind: 'confirmOptional',
        seat: enterController,
        source: old.id,
        sourceName: info?.name ?? '',
        sourceOracleText: info?.oracleText ?? '',
        reveal: {
          words: revealRule.words,
          ...(revealRule.fromBattlefield === true ? { behold: true as const } : {}),
        },
      },
    };
  }
  // D-225 (CR 701.20a): the player who revealed chooses which card, when there is more than one.
  if (mayReveal && revealRule !== null && request.entersPaid === true) {
    const choices = revealChoices(before, enterController, revealRule, old.id);
    if (choices.length > 1 && request.entersRevealed === undefined) {
      const info = sourceInfo(state, old.id);
      return {
        kind: 'needsDecision',
        decision: {
          kind: 'chooseCards',
          seat: enterController,
          source: old.id,
          purpose: 'reveal',
          zone: 'hand',
          legal: [...choices],
          min: 1,
          max: 1,
          reveal: true,
          prompt: `Reveal ${revealRule.words} from your hand${info === null ? '' : ` for ${info.name}`}.`,
        },
      };
    }
  }
  if (mayPay && payment !== null && (request.entersPaid ?? null) === null) {
    const info = sourceInfo(state, old.id);
    return {
      kind: 'needsDecision',
      decision: {
        kind: 'confirmOptional',
        seat: enterController,
        source: old.id,
        sourceName: info?.name ?? '',
        sourceOracleText: info?.oracleText ?? '',
        cost: payment,
      },
    };
  }

  // CR 614.12a: a choice that a replacement effect of the entering permanent needs is made before it
  // enters. Nothing has moved yet, so the object the question is about is still where it was.
  const choice = entering === null ? null : entersChoice(entering.abilities);
  if (choice !== null && (request.entersChosen ?? null) === null) {
    const info = sourceInfo(state, old.id);
    return {
      kind: 'needsDecision',
      decision: {
        kind: 'chooseOption',
        seat: enterController,
        purpose: choice,
        options: optionsFor(choice, entering === null ? [] : entersOptions(entering.abilities)),
        source: old.id,
        sourceName: info?.name ?? '',
        sourceOracleText: info?.oracleText ?? '',
      },
    };
  }

  // CR 707.9, 614.12 (D-151): "As this enters, you may have it become a copy of any creature on the battlefield". Nothing has moved yet.
  const copyRule = entering === null ? null : entersCopyOf(entering.abilities);
  if (copyRule !== null && request.entersCopy === undefined) {
    const legal = copyCandidates(before, enterController, copyRule, old.id);
    if (legal.length > 0) {
      return {
        kind: 'needsDecision',
        decision: {
          kind: 'choosePermanent',
          seat: enterController,
          source: old.id,
          subject: old.id,
          purpose: 'entersCopy',
          min: copyRule.optional === true ? 0 : 1,
          max: 1,
          legal,
        },
      };
    }
  }

  // CR 702.136a, 702.136b (D-185): riot asks once for each instance, whether the permanent has the counter or haste.
  const faceAbilities = entering === null ? [] : entering.abilities;
  const riotCount =
    entering === null
      ? 0
      : riotInstances(before, faceAbilities, {
          ...old,
          zone: 'battlefield',
          controller: enterController,
          face: faceIndex,
        });
  const riotAnswers = request.entersRiot ?? [];
  if (riotAnswers.length < riotCount) {
    const info = sourceInfo(state, old.id);
    return {
      kind: 'needsDecision',
      decision: riotDecision(
        enterController,
        old.id,
        info?.name ?? '',
        info?.oracleText ?? '',
        riotAnswers,
      ),
    };
  }
  // CR 702.82a (D-185): "As this object enters, you may sacrifice any number of creatures": the last question, asked only when there is a creature to
  // sacrifice (the permanent is not on the battlefield, so it is not one).
  if (devourOf(faceAbilities) > 0 && request.entersDevour === undefined) {
    const legal = devourCandidates(before, enterController);
    if (legal.length > 0) {
      return { kind: 'needsDecision', decision: devourDecision(enterController, old.id, legal) };
    }
  }

  // --- Commit.
  // The old object ceases to exist (CR 400.7). Its last-known information is kept in `lki`.
  // D-283: a permanent of an event of several leaving together has its record from before the first of them moved (CR 603.10a).
  let next =
    request.lkiRecorded === true && state.lki[old.id] !== undefined ? state : recordLki(state, old);
  next = removeFromZone(next, old);
  {
    const { [old.id]: _gone, ...rest } = next.objects;
    next = { ...next, objects: rest };
  }
  // CR 701.42a, 712.14c (D-277): the second card of the pair is one object with the first from now on, so its own object ceases to exist.
  if (partner !== undefined) {
    next = recordLki(next, partner);
    next = removeFromZone(next, partner);
    const { [partner.id]: _partnerGone, ...rest } = next.objects;
    next = { ...next, objects: rest };
  }
  // CR 722.3c (D-214): the copy of a prepare spell stays in exile only while its permanent stays on the battlefield and prepared.
  if (old.prepareCopy !== undefined) next = dropPrepareCopy(next, old.prepareCopy);

  const events: GameEvent[] = [];
  // CR 707.10f, 608.3f (D-129): a copy of a permanent spell that resolves becomes a token permanent, with the
  // copiable values of the spell. A copy of a spell anywhere else (countered, resolved as an instant or sorcery)
  // ceases to exist (CR 707.10a, 704.5e), and so does an ability leaving the stack (CR 608.2n).
  const becomesToken = old.copyOf !== undefined && to === 'battlefield';
  // CR 722.3c (D-214): the copy of a prepare spell in exile is cast: it goes to the stack, still a copy of a spell.
  const castPrepareCopy = old.prepareOf !== undefined && to === 'stack';
  if (old.card === null && old.token === null && !becomesToken && !castPrepareCopy) {
    return { kind: 'done', state: next, events, newObject: null };
  }

  const [newId, s1] = allocateObjectId(next);
  const [timestamp, s2] = allocateTimestamp(s1);
  next = s2;

  // CR 614.12 (D-272): the same battlefield, once the old object has left its zone: without the permanents that enter in the same event.
  const nextBefore = withoutRun(next, request.alongside);
  let tapped = request.tapped ?? false;
  let counters: Record<string, number> = {};
  const printed = printedCard(old);
  if (to === 'battlefield' && printed !== null && !entersDown) {
    // CR 614.1c / 614.12: replacement effects of the entering object itself.
    const face = definitionOf(next, printed).faces[faceIndex];
    // CR 306.5b: a planeswalker enters with loyalty counters equal to its printed loyalty.
    if (face?.types.includes('planeswalker') && face.loyalty !== null) {
      counters = { ...counters, loyalty: face.loyalty };
    }
    // CR 310.4b: a battle enters with defense counters equal to its printed defense.
    if (face?.types.includes('battle') && face.defense !== null) {
      counters = { ...counters, defense: face.defense };
    }
    const abilities = face?.abilities ?? [];
    // CR 614.12: its conditions look at the battlefield without it, which is what `next` is.
    if (entersTapped(nextBefore, abilities, enterCtx)) tapped = true;
    // CR 107.3m: "enters with X counters" reads the X of the spell it resolved from, which only a
    // spell on the stack has (D-103); a card put onto the battlefield from another zone has X = 0.
    const castX = old.zone === 'stack' && old.stack?.kind === 'spell' ? (old.stack.x ?? 0) : 0;
    // CR 702.138b, 702.138c (D-124): "escapes with" counters only for a spell cast for its escape cost.
    const escaped = old.zone === 'stack' && old.stack?.alt === 'escape';
    // D-131: "a +1/+1 counter on it for each Zombie card in your graveyard" counts as it enters, for the player who
    // controls it, looking at the game without it (the card has already left its old zone).
    // D-254, CR 702.33c: "for each time it was kicked" reads the kicks of the spell it resolved from (0 for a card put onto the battlefield by an effect).
    const kicks = old.zone === 'stack' && old.stack?.kind === 'spell' ? timesKickedOf(old) : 0;
    counters = entersWithCounters(
      abilities,
      counters,
      castX,
      escaped,
      (a) => countMatching(nextBefore, a.filter, { controller: enterController, source: newId }),
      kicks,
    );
    // CR 714.3a: a Saga enters with a lore counter.
    counters = entersAsSaga(
      face?.subtypes ?? [],
      counters,
      abilities,
      request.entersChosen ?? null,
    );
    if (request.withCounters !== undefined) {
      const { counter, count } = request.withCounters;
      counters = { ...counters, [counter]: (counters[counter] ?? 0) + count };
    }
    // CR 702.82a, 702.136a (D-185): the counters of devour and of the riot instances that chose the counter.
    counters = addCounterMaps(
      counters,
      keywordEntryCounters(abilities, riotAnswers, request.devoured ?? 0),
    );
    if (revealRule !== null && !tapped && !untappedByEffect) {
      if (mayReveal && request.entersPaid === true) {
        // CR 701.20a, 701.4a: the card of the hand is revealed (a permanent is only chosen).
        events.push(
          ...revealEvents(before, enterController, revealRule, old.id, request.entersRevealed),
        );
      } else {
        tapped = true; // "If you don't, it enters tapped."
      }
    }
    if (payment !== null && !tapped && !untappedByEffect) {
      if (mayPay && request.entersPaid === true) {
        // CR 119.4: paying life is losing that much life.
        const seat = getSeat(next, enterController);
        const paid = lifeOf(payment);
        next = loseLifeBy(next, enterController, paid);
        events.push({
          kind: 'lifeChanged',
          seat: enterController,
          from: seat.life,
          to: seat.life - paid,
        });
      } else {
        tapped = true; // "If you don't, it enters tapped."
      }
    }
  }

  // CR 614.12, 616.1 (D-179): "Lands you control enter untapped" beats an "enters tapped" and a "put onto the battlefield tapped".
  if (untappedByEffect) tapped = false;
  const controller =
    to === 'battlefield' ? (request.toSeat ?? controllerOf(state, old)) : old.owner;
  if (to === 'battlefield' && becomesToken) {
    // CR 306.5b, 310.4b, 707.10f (D-200): a copy of a planeswalker or battle spell that resolves is a token that enters with loyalty or
    // defense counters equal to the loyalty or defense it copied.
    const copied = copiableValues(state, old).characteristics;
    if (copied.types.includes('planeswalker') && copied.loyalty !== null) {
      counters = { ...counters, loyalty: copied.loyalty };
    }
    if (copied.types.includes('battle') && copied.defense !== null) {
      counters = { ...counters, defense: copied.defense };
    }
  }
  if (to === 'battlefield') {
    // CR 614.1c, 614.12, 122.6 (D-149): "each other Angel you control enters with an additional +1/+1 counter": the replacement
    // effects of the permanents already on the battlefield, read against the permanent as it would be there.
    counters = addCounterMaps(
      counters,
      groupEntryCounters(nextBefore, {
        ...old,
        ...downEntry,
        zone: 'battlefield',
        controller,
        token: becomesToken ? copiableValues(state, old) : old.token,
      }),
    );
  }
  // CR 702.62a (D-128): "If you cast a creature spell this way, it gains haste until you lose control of the spell
  // or the permanent it becomes": the permanent remembers it came from a suspended creature spell.
  const enteredAlt =
    permanentAlternative(old.stack?.alt) ??
    (to === 'battlefield' &&
    old.zone === 'stack' &&
    old.stack?.suspended === true &&
    derive(state, old).types.includes('creature')
      ? ('suspend' as const)
      : undefined);
  const created: GameObject = {
    id: newId,
    card: becomesToken ? null : old.card,
    ...(castPrepareCopy ? { copyOf: old.copyOf } : {}),
    zone: to,
    zoneOwner: toSeat,
    owner: old.owner,
    controller,
    // Only a spell on the stack and a permanent have a face other than the front one.
    face: !becomesToken && (to === 'stack' || to === 'battlefield') ? faceIndex : 0,
    // CR 701.42a, 712.4a (D-277): the second card of the melded permanent.
    ...(partner?.card != null ? { meldedWith: partner.card } : {}),
    tapped,
    counters,
    damage: 0,
    damagedByDeathtouch: false,
    timestamp,
    // CR 707.10f: the token has the copiable values of the spell it was a copy of; it is no longer a copy of a spell.
    token: becomesToken ? copiableValues(state, old) : old.token,
    attachedTo: null,
    protector:
      to === 'battlefield' && !entersDown ? protectorFor(next, old, controller, faceIndex) : null,
    // CR 708.2a, 708.6 (D-308): a permanent that enters face down.
    ...downEntry,
    stack: null,
    // CR 702.33d: a permanent that came from a kicked spell remembers it ("if it was kicked").
    ...(to === 'battlefield' && old.stack?.kicked === true ? { kicked: true as const } : {}),
    ...(to === 'battlefield' && old.stack?.kicks !== undefined ? { kicks: old.stack.kicks } : {}),
    // CR 702.174 (D-135): a permanent remembers the opponent its spell's gift was promised to.
    ...(to === 'battlefield' && old.stack?.giftTo !== undefined
      ? { giftTo: old.stack.giftTo }
      : {}),
    // CR 702.74a, 702.109a (D-121): a permanent remembers that its evoke or dash cost was paid.
    ...(to === 'battlefield' && enteredAlt !== undefined ? { alt: enteredAlt } : {}),
    // CR 702.84a (D-124): a permanent returned by unearth remembers it.
    ...(to === 'battlefield' && request.alt !== undefined ? { alt: request.alt } : {}),
    // CR 702.136a (D-185): an instance of riot that chose haste ("If you don't, it gains haste").
    ...(to === 'battlefield' && riotGivesHaste(riotAnswers) ? { riotHaste: true as const } : {}),
    // CR 715.3d: an Adventure that resolved is exiled, and its owner may cast the card from there.
    ...(to === 'exile' && request.onAdventure === true ? { onAdventure: true as const } : {}),
    // CR 715.3d (D-187): the Adventure's controller may play the card, which is not their own when they took it from another player's library.
    ...(to === 'exile' &&
    request.onAdventure === true &&
    request.toSeat !== undefined &&
    request.toSeat !== old.owner
      ? { adventureBy: request.toSeat }
      : {}),
    // CR 614.12a, 607.2d: what the controller chose as it entered (D-100), the new object's own.
    ...(to === 'battlefield' && choice !== null && request.entersChosen != null
      ? { chosen: request.entersChosen }
      : {}),
  };
  next = setObject(next, created);
  next = addToZone(next, to, toSeat, newId, request.position ?? 'top');
  // CR 712.21 (D-277): a melded permanent that leaves the battlefield is one permanent that leaves and two cards that are put into the zone: the second
  // card becomes an object of its own, with its own new id and timestamp, in the zone its owner's card goes to (the command zone is the first card's alone,
  // CR 903.9c). The first card's object is made above, so what is shared (the replacement effects, the moment) is decided once for both (CR 712.21d).
  let also: GameObject | null = null;
  if (companion !== undefined && to !== 'battlefield' && to !== 'stack') {
    const [alsoId, s3] = allocateObjectId(next);
    const [alsoStamp, s4] = allocateTimestamp(s3);
    next = s4;
    const goesOn = to === 'command' && old.zone !== 'command' ? companionTo : to;
    const goesOnSeat = to === 'command' && old.zone !== 'command' ? companionToSeat : toSeat;
    also = {
      id: alsoId,
      card: companion,
      zone: goesOn,
      zoneOwner: goesOnSeat,
      owner: old.owner,
      controller: old.owner,
      face: 0,
      tapped: false,
      counters: {},
      damage: 0,
      damagedByDeathtouch: false,
      timestamp: alsoStamp,
      token: null,
      attachedTo: null,
      protector: null,
      stack: null,
    };
    next = setObject(next, also);
    next = addToZone(next, goesOn, goesOnSeat, alsoId, request.position ?? 'top');
  }
  const copyEvents: GameEvent[] = [];
  // CR 722.3a, 722.3c (D-214): "This creature enters prepared."
  if (
    to === 'battlefield' &&
    printed !== null &&
    !entersDown &&
    (definitionOf(next, printed).faces[faceIndex]?.abilities ?? []).some(
      (a) => a.kind === 'replacement' && a.replacement.kind === 'entersPrepared',
    )
  ) {
    const prepared = becomePrepared(next, newId);
    next = prepared.state;
    copyEvents.push(...prepared.events);
  }
  // CR 707.9, 614.12 (D-151): "As this enters, you may have it become a copy of any creature ... except it has haste": it enters as a copy, so the
  // abilities that trigger as it enters see the copy. The values are the original's as they are now (CR 707.2), with what the exception adds.
  const copiedObject =
    copyRule === null || request.entersCopy == null ? undefined : next.objects[request.entersCopy];
  if (to === 'battlefield' && copyRule !== null && copiedObject?.zone === 'battlefield') {
    const became = becomeCopyAsItEnters(next, newId, copyRule, copiedObject.id, controller);
    next = became.state;
    events.push(...became.events);
    copyEvents.push(...became.counterEvents);
  }
  // D-151 (CR 702.10): "If that mana is spent on a Dragon creature spell, it gains haste until end of turn": the permanent a spell with that mark becomes
  // has haste until the end of the turn.
  if (
    to === 'battlefield' &&
    old.zone === 'stack' &&
    old.stack?.hasteUntilEnd === true &&
    derive(state, old).types.includes('creature')
  ) {
    const [stamp, stamped] = allocateTimestamp(next);
    next = {
      ...stamped,
      continuousEffects: [
        ...stamped.continuousEffects,
        {
          id: `ce${stamp}`,
          timestamp: stamp,
          objects: [newId],
          until: 'endOfTurn',
          change: { kind: 'grantKeyword', keyword: { kind: 'haste' } },
        },
      ],
    };
  }
  // D-232: "If you cast a spell this way, that artifact enters tapped" / "If you do, it gains ...": what the permission of a permanent gives the permanent.
  if (to === 'battlefield' && old.zone === 'stack' && old.stack?.graveyardPlay !== undefined) {
    next = applyGraveyardRider(next, newId, old.stack.graveyardPlay);
  }
  // D-151: a permanent that entered this turn (Celebration), under whose control and as which types.
  if (to === 'battlefield') {
    next = {
      ...next,
      turnLog: {
        ...next.turnLog,
        entered: [
          ...next.turnLog.entered,
          {
            object: newId,
            controller,
            types: derive(next, created).types,
            token: created.token !== null,
          },
        ],
      },
    };
  }
  // CR 700.4 (D-179): a card put into a graveyard from the battlefield this turn ("that was put there from the battlefield this turn").
  if (old.zone === 'battlefield' && to === 'graveyard' && created.card !== null) {
    next = {
      ...next,
      turnLog: { ...next.turnLog, graveyarded: [...next.turnLog.graveyarded, newId] },
    };
  }
  // CR 712.21 (D-277): the second card of a melded permanent is a card put into a graveyard from the battlefield too.
  if (old.zone === 'battlefield' && also?.zone === 'graveyard') {
    next = {
      ...next,
      turnLog: { ...next.turnLog, graveyarded: [...next.turnLog.graveyarded, also.id] },
    };
  }
  // CR 400.7 (D-206): a card that left a graveyard ("if a card left your graveyard this turn").
  if (old.zone === 'graveyard' && to !== 'graveyard' && old.card !== null) {
    next = {
      ...next,
      turnLog: { ...next.turnLog, leftGraveyard: [...next.turnLog.leftGraveyard, old.owner] },
    };
  }
  // CR 400.7: what the old object became, for "return it" of an ability whose source left (`thisCard`).
  const left = next.lki[old.id];
  if (left !== undefined)
    next = {
      ...next,
      lki: {
        ...next.lki,
        [old.id]: {
          ...left,
          successor: newId,
          // CR 712.21c (D-277): an effect that finds the new object of a melded permanent finds both cards.
          ...(also === null ? {} : { companionSuccessor: also.id }),
        },
      },
    };
  // CR 701.42a (D-277): the exile object of the other card became the melded permanent, as the first card's did.
  const partnerLeft = partner === undefined ? undefined : next.lki[partner.id];
  if (partner !== undefined && partnerLeft !== undefined)
    next = { ...next, lki: { ...next.lki, [partner.id]: { ...partnerLeft, successor: newId } } };

  events.push({
    kind: 'zoneChanged',
    // CR 708.9 (D-312): the card of a permanent that enters face down is hidden information, so the event does not name it.
    card: entersDown ? null : old.card,
    from: old.id,
    to: newId,
    fromZone: old.zone,
    toZone: to,
  });
  // CR 701.42a, 712.21 (D-277): the second card moves too; its event is flagged so the permanent is not counted twice.
  if (partner !== undefined && partner.card !== null) {
    events.push({
      kind: 'zoneChanged',
      card: partner.card,
      from: partner.id,
      to: newId,
      fromZone: partner.zone,
      toZone: 'battlefield',
      component: true,
    });
    events.push({
      kind: 'melded',
      permanent: newId,
      cards: [old.card as NonNullable<typeof old.card>, partner.card],
      from: [old.id, partner.id],
    });
  }
  if (also !== null && companion !== undefined) {
    events.push({
      kind: 'zoneChanged',
      card: companion,
      from: old.id,
      to: also.id,
      fromZone: old.zone,
      toZone: also.zone,
      component: true,
    });
  }
  events.push(...copyEvents);
  for (const [counter, count] of Object.entries(counters)) {
    // CR 122.6a (D-149): the player who controls the object puts the counters it enters with.
    events.push({
      kind: 'counterAdded',
      object: newId,
      counter,
      count,
      by: controllerOf(state, created),
    });
  }
  // CR 700.4: "dies" means "is put into a graveyard from the battlefield": any permanent, not only a creature (an Aura or an artifact "dies"
  // too). A trigger for "a creature" asks the last-known information of the permanent for its types (D-175).
  if (old.zone === 'battlefield' && to === 'graveyard') {
    events.push({ kind: 'died', object: old.id, card: old.card });
  }
  // D-133: the tokens the replacement creates, for the controller of the permanent with it, as the creature is exiled.
  if (dieInstead?.alsoCreate !== undefined) {
    const { token, count } = dieInstead.alsoCreate;
    const definition = token.kind === 'preset' ? TOKEN_PRESETS[token.preset] : token.definition;
    const made = createTokens(next, dieInstead.controller, definition, count);
    next = made.state;
    events.push(...made.events);
  }
  if ((to === 'graveyard' || to === 'exile') && isCommanderCardId(state, old.card)) {
    // CR 903.9a: the owner may move it to the command zone the next time state-based actions run.
    next = { ...next, commanderWatch: [...next.commanderWatch, newId] };
  }
  // CR 712.21a, 712.21b (D-279): the owner arranges the two cards of a melded permanent that went to a graveyard or a library, and the player who exiled it chooses which was exiled last; asked
  // as state-based actions are next checked, which is when the two objects are in their zone.
  if (
    also !== null &&
    also.zone === to &&
    (to === 'graveyard' || to === 'library' || to === 'exile')
  ) {
    next = {
      ...next,
      meldOrders: [
        ...(next.meldOrders ?? []),
        {
          // CR 712.21a: the owner arranges a graveyard or a library; CR 712.21b: the player who exiles the permanent orders the cards in exile.
          seat: to === 'exile' ? (request.by ?? controllerOf(state, old)) : old.owner,
          first: newId,
          second: also.id,
          zone: to,
        },
      ],
    };
  }
  // CR 903.9a, 712.21 (D-277): the second card of a melded permanent is a commander object of its own in a graveyard or exile, if it is a commander card.
  if (
    also !== null &&
    (also.zone === 'graveyard' || also.zone === 'exile') &&
    isCommanderCardId(state, also.card)
  ) {
    next = { ...next, commanderWatch: [...next.commanderWatch, also.id] };
  }
  if (to === 'command' && old.zone !== 'command') {
    if (old.card !== null)
      events.push({ kind: 'commanderMovedToCommandZone', card: old.card, from: old.zone });
  }
  return {
    kind: 'done',
    state: next,
    events,
    newObject: newId,
    ...(also === null ? {} : { alsoNewObject: also.id }),
  };
}
