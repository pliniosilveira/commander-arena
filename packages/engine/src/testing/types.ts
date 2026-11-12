/**
 * Public types of the scenario DSL (SPEC 17.3 A12, D-012). The DSL builds a precise GameState
 * directly and then drives it only through applyAction.
 */
import type { CastAlternativeKind } from '../ast/features';
import type { Zone } from '../ast/types';
import type { CardDefinition } from '../cards/definition';
import type { ObjectId, SeatId } from '../ids';
import type { ManaColor } from '../mana/types';
import type { Action } from '../state/actions';
import type { PendingDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import type { ChosenValues, GameObject, GameState, StepId } from '../state/types';
import type { GameView } from '../view';

/** Thrown for a bad scenario setup, a rejected verb or a failed assertion. */
export class ScenarioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScenarioError';
  }
}

/**
 * A way to name one card or object in a scenario. A plain string is, in order: an ObjectId
 * ("o12"), a label given at build time, or a card name. "Name[2]" picks the third match.
 */
export type CardRef = string | CardQuery;

export interface CardQuery {
  readonly name: string;
  /** Zone to look in; defaults to the zones the verb implies, or anywhere. */
  readonly zone?: Zone;
  /**
   * Whose zone: the zone owner for hand, library, graveyard and command zone; the controller on
   * the battlefield and the stack; the owner in exile.
   */
  readonly seat?: SeatId;
  /** Index among the matches, in zone order (library: top first). Default: must be unique. */
  readonly nth?: number;
}

/** A target for a verb: a player or a card. */
export type TargetRef = { readonly player: SeatId } | CardRef;

/** What an attacker attacks: a player, or a planeswalker or battle by card reference (CR 506.3). */
export type AttackTargetRef = { readonly player: SeatId } | CardRef;

/** One attacking creature. `target` defaults to the opponent player (two seats). */
export interface AttackSpec {
  readonly attacker: CardRef;
  readonly target?: AttackTargetRef;
}

/** One blocking creature and the attacker it blocks (CR 509.1). */
export interface BlockSpec {
  readonly blocker: CardRef;
  readonly attacker: CardRef;
}

/** Combat damage `from` a creature `to` a creature, planeswalker, battle or player (CR 510.1). */
export interface DamageSpec {
  readonly from: CardRef;
  readonly to: TargetRef;
  readonly amount: number;
}

/** A whole combat for `playCombat`, played from the verbs. */
export interface CombatPlan {
  /** Attackers: a card reference attacks the opponent player; an AttackSpec names its target. */
  readonly attack: readonly (CardRef | AttackSpec)[];
  /** Blocks; left out means no blocks. Refused if no declareBlockers decision ever comes. */
  readonly block?: readonly BlockSpec[];
  /**
   * Damage divisions for the decisions that come up. An array answers the regular step. A step
   * left out uses the engine's default division. Refused if the engine never asks for it.
   */
  readonly damage?:
    | readonly DamageSpec[]
    | {
        readonly firstStrike?: readonly DamageSpec[];
        readonly regular?: readonly DamageSpec[];
      };
  /**
   * Where to stop, with priority: default the end of combat step (combat is still in progress).
   * `declareBlockers` stops after the blocks are declared and before damage, the window for tricks.
   */
  readonly until?: 'declareBlockers' | 'combatDamage' | 'endOfCombat' | 'postcombatMain';
}

/** Options for any card placed in any zone at build time. */
export interface PlaceOptions {
  /** A name for this exact card, valid for the whole game, whatever zone it moves to. */
  readonly label?: string;
  /**
   * For a card of layout adventure placed in exile: it is there on an Adventure (CR 715.3d), so its
   * owner may cast it from exile. Only for exile.
   */
  readonly onAdventure?: true;
  /** Put this many copies in the zone (each its own card). Default 1. */
  readonly count?: number;
  /** Flag the card as one of its owner's commanders (CR 903.3). */
  readonly commander?: boolean;
  /** For a commander: how many times it was already cast from the command zone (CR 903.8). */
  readonly casts?: number;
}

/** Extra options for permanents. */
export interface PermanentOptions extends PlaceOptions {
  /**
   * The face that is up, an index into the card's faces: 1 puts a double-faced permanent on the
   * battlefield transformed, or a modal double-faced card played as its back face (CR 712.12,
   * 712.14a). Default 0.
   */
  readonly face?: number;
  readonly tapped?: boolean;
  /** Damage marked on it (CR 120.3). */
  readonly damage?: number;
  /** Counters, for example { '+1/+1': 2 }. */
  readonly counters?: Readonly<Record<string, number>>;
  /**
   * It entered the battlefield this turn: summoning sick (CR 302.6) until its controller's next
   * turn begins. Default false: it has been under its controller's control since their turn began.
   */
  readonly fresh?: boolean;
  /** Controlled by this seat while owned by the seat in scope (a stolen permanent). */
  readonly controller?: SeatId;
  /**
   * For an Aura or Equipment: it is attached to this permanent (CR 301.5a, 303.4b). The reference
   * is the label or the card name of one other permanent on the battlefield; it must match exactly
   * one. The pair is not checked against the enchant or equip rules, so a scenario can set up an
   * illegal attachment and watch the state-based actions undo it (CR 704.5m, 704.5n).
   */
  readonly attachedTo?: string;
  /**
   * D-277 (CR 701.42a, 712.4a): the card is a meld card that is melded with the other card of its pair, which is placed on the battlefield too, named by label
   * or card name (it must match exactly one other permanent). The two become one melded permanent with the combined back face up (`face` 1), represented by
   * both cards; the other placement is not an object of its own. Put it on the commander's placement when one of the two is the commander (a melded
   * permanent's commander card is its first card). The pair is checked as `701.42b` says: two meld cards that form a pair, owned by the same player.
   */
  readonly meldedWith?: string;
  /**
   * For a battle: the player who protects it (CR 310.9). Default: the opponent of its controller,
   * as when it enters in a two-player game. A planeswalker's loyalty and a battle's defense
   * counters come from the card as when it enters (CR 306.5b, 310.4b) unless `counters` says
   * otherwise, for example `{ counters: { loyalty: 2 } }`.
   */
  readonly protector?: SeatId;
  /**
   * What the permanent chose as it entered (D-100): the creature type or the color its "As this enters,
   * choose ..." ability asked for, as if it had been answered. The card must ask that question.
   */
  readonly chosen?: ChosenValues;
  /**
   * The permanent is the Ring-bearer of the seat that controls it (CR 701.54a, D-196). The seat must have been tempted by the Ring (`ring(n)` with
   * n of 1 or more), and has one Ring-bearer at most.
   */
  readonly ringBearer?: true;
  /** The level of a Class on the battlefield (CR 716.2, D-235). */
  readonly level?: number;
}

export interface AtOptions {
  /** Active player. Default 0. */
  readonly active?: SeatId;
  /** Turn number of the game, 1-based. Default 3, so nothing is a "first turn". */
  readonly turn?: number;
  /** Seat that has priority. Default: the active seat. */
  readonly priority?: SeatId;
  /** Additional land plays granted this turn (CR 305.2). */
  readonly extraLandDrops?: number;
  /** The player who is the monarch at the start (CR 725.1, D-127). Default: nobody. */
  readonly monarch?: SeatId;
}

export interface BuildOptions {
  /**
   * Run state-based actions before the first decision, as the engine does before any player
   * receives priority (CR 117.5). Default false: the state is exactly what the scenario wrote.
   */
  readonly settle?: boolean;
  /** Check structural invariants after every verb. Default true. */
  readonly checkInvariants?: boolean;
}

/** Mana as a string of symbols ("GGC") or a count per color ({ G: 2, C: 1 }). */
export type ManaSpec = string | Readonly<Partial<Record<ManaColor, number>>>;

/** An engine reply, as returned by the `try` verbs. */
export type TryResult =
  | { readonly ok: true; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly error: string };

/** A pending cast: what is left to do after castSpell (CR 601.2). */
export interface CastHandle {
  /**
   * Which stage the cast or activation is at now, or 'cast' once the spell is on the stack as a
   * cast spell (an activation ends the same way: 'cast' means it is on the stack, paid for).
   */
  readonly stage:
    | 'modes'
    | 'kicker'
    | 'x'
    | 'targets'
    | 'payOptions'
    | 'payment'
    | 'sacrifice'
    | 'discard'
    | 'exile'
    | 'crew'
    | 'tap'
    | 'bounce'
    | 'cast';
  /**
   * Answer the modes question of a modal spell or ability (CR 601.2b, 700.2a, D-114) when the engine asks it:
   * the indices of the modes, in printed order or not.
   */
  modes(...modes: number[]): CastHandle;
  /**
   * Answer the kicker question (CR 702.33a, 601.2b): `true` pays the kicker cost, `false` casts the
   * spell unkicked.
   */
  kicker(pay: boolean): CastHandle;
  /**
   * Answer the gift question (CR 702.174a, 601.2b, D-135): `true` promises the gift to the opponent the engine offers, `false`
   * casts the spell with no gift.
   */
  gift(promise: boolean): CastHandle;
  /**
   * Answer the additional cost choice (CR 118.8, 601.2b, D-181), "sacrifice an artifact or creature or pay {4}": `true` pays the first way (the
   * sacrifice), `false` the second.
   */
  additionalCost(first: boolean): CastHandle;
  /**
   * Answer how many times to pay the multikicker cost (CR 702.33c, 601.2b, D-110) when the engine asks it:
   * 0 casts the spell unkicked.
   */
  kicks(count: number): CastHandle;
  /**
   * Answer how many times to pay the replicate cost (CR 702.56a, 601.2b, D-129) when the engine asks it: 0 casts the
   * spell without copies.
   */
  replicas(count: number): CastHandle;
  /** Announce the value of X (CR 107.3a, 601.2b, 602.2b, D-103) when the engine asks for it. */
  x(value: number): CastHandle;
  /**
   * Answer the targets decision. `divide` is the share of each target, in the order of `targets`, for a spell that divides something among
   * them as it is cast (CR 601.2d, D-145).
   */
  targets(targets: readonly TargetRef[], divide?: readonly number[]): CastHandle;
  /**
   * Answer the cost-payment question (CR 601.2f-h, D-120) when the engine asks it: tap these creatures
   * (Convoke) or artifacts (Improvise), or exile these cards of the graveyard (Delve), rather than pay that
   * mana. No card pays everything in mana.
   */
  payOptions(...cards: CardRef[]): CastHandle;
  /** Pay with the engine's payment planner. Returns the actor. */
  pay(): Actor;
  /**
   * Pay by tapping exactly these mana sources (mana abilities, CR 605.3b), in this order (a mana
   * cost of one of them is paid from what the earlier ones made). A source that offers a choice of
   * color (a Treasure) is given as `{ source, color }`; `ability` picks one of several mana
   * abilities of a card (default the first).
   */
  payManual(
    sources: readonly (
      | CardRef
      | {
          readonly source: CardRef;
          readonly color?: ManaColor;
          readonly combination?: ManaSpec;
          readonly ability?: number;
          /** The permanent a cost "Sacrifice a Spirit" gives up (D-222): needed when the player has more than one. */
          readonly sacrifice?: CardRef;
        }
    )[],
  ): Actor;
  /** Cancel the cast; the engine restores the exact pre-cast state (CR 733). */
  cancel(): Actor;
}

/** Options of the special actions `suspend` and `foretell` (D-128). */
export interface SpecialOptions {
  /** Pay the cost with the planner straight away. */
  readonly pay?: boolean;
}

export interface TryVerbs {
  suspend(card: CardRef): TryResult;
  foretell(card: CardRef): TryResult;
  playLand(card: CardRef, options?: PlayLandOptions): TryResult;
  cast(card: CardRef, options?: Pick<CastOptions, 'alternative' | 'face'>): TryResult;
  tapForMana(card: CardRef, options?: TapOptions): TryResult;
  /** Activate an ability of a card on the battlefield or in hand (CR 602.2); no further steps. */
  activate(card: CardRef, options?: Pick<ActivateOptions, 'ability'>): TryResult;
  pass(): TryResult;
  declareAttackers(attacks: readonly AttackSpec[]): TryResult;
  declareBlockers(blocks: readonly BlockSpec[]): TryResult;
  assignDamage(assignments: readonly DamageSpec[]): TryResult;
  /** Any action, unresolved. */
  action(action: Action): TryResult;
}

export interface ActivateOptions {
  /** Answers the modes question of a modal ability when the engine asks it (D-114). */
  readonly modes?: readonly number[];
  /**
   * Index of the ability among the card's derived abilities (the `abilityIndex` of the `activate`
   * option). Default: the first activated ability that is not a mana ability.
   */
  readonly ability?: number;
  /** Announces X when the engine asks for it (an {X} or "pay X life" in the cost, D-103). */
  readonly x?: number;
  /** Targets in slot order, as for `cast`. */
  readonly targets?: readonly TargetRef[];
  /** Pay the mana cost with the planner straight away, when the engine asks for a payment. */
  readonly pay?: boolean;
}

export interface TapOptions {
  /** Color to produce, for sources that offer a choice. */
  readonly color?: ManaColor;
  /** The combination to produce, for a source that makes one of several (a filter land): "RW" or { R: 1, W: 1 }. */
  readonly combination?: ManaSpec;
  /** Index of the mana ability on the card. Default: the first one. */
  readonly ability?: number;
  /** The permanent a cost "Sacrifice a Spirit" gives up (D-222): needed when the player has more than one. */
  readonly sacrifice?: CardRef;
}

export interface PlayLandOptions {
  /** The face of a modal double-faced card to play (CR 712.12): an index into its faces. Default 0. */
  readonly face?: number;
}

export interface CastOptions {
  /**
   * Answers the modes question of a modal spell when the engine asks it (CR 601.2b, 700.2a, D-114): the
   * indices of the modes to choose. Left out, the question stays pending for the test to answer
   * (`chooseModes(...)`).
   */
  readonly modes?: readonly number[];
  /**
   * The face to cast: the half of a split card (CR 709.3), the Adventure of an Adventure card (CR
   * 715.3), or a modal double-faced card's face (CR 712.11b), as an index into the card's faces.
   * Default 0. A card in exile on an Adventure is cast as face 0 (CR 715.3d).
   */
  readonly face?: number;
  /**
   * Cast with an alternative cost (CR 118.9): `'flashback'` casts the card from the graveyard
   * (CR 702.34a), looked up in the graveyard, not the hand; `'free'` casts it without paying its mana
   * cost (D-095), from the hand or the command zone.
   */
  readonly alternative?: CastAlternativeKind;
  /**
   * Answers the kicker question when the engine asks it: true pays the kicker cost, false does
   * not. Left out, the question stays pending for the test to answer (`accept()` or `decline()`).
   */
  readonly kicked?: boolean;
  /**
   * Answers the gift question when the engine asks it (CR 702.174a, D-135): true promises the gift to the opponent offered,
   * false casts the spell with no gift. Left out, the question stays pending for the test to answer (`accept()` or `decline()`).
   */
  readonly gift?: boolean;
  /**
   * Answers the additional cost choice when the engine asks it (D-181): true pays the first way, false the second. Left out, the question stays
   * pending for the test to answer (`accept()` or `decline()`).
   */
  readonly additionalCost?: boolean;
  /**
   * Answers the multikicker question when the engine asks it: how many times to pay the multikicker cost
   * (CR 702.33c, D-110). Left out, the question stays pending for the test to answer (`chooseX(count)`).
   */
  readonly kicks?: number;
  /**
   * Answers the replicate question when the engine asks it: how many times to pay the replicate cost (CR 702.56a,
   * D-129). Left out, the question stays pending for the test to answer (`chooseX(count)`).
   */
  readonly replicas?: number;
  /**
   * Announces X when the engine asks for it (an {X} in the mana cost or "pay X life", D-103). Left
   * out, the question stays pending for the test to answer (`chooseX(value)`).
   */
  readonly x?: number;
  /** Targets in slot order; each slot takes as many as its maximum allows. */
  readonly targets?: readonly TargetRef[];
  /** The share of each target, in the order of `targets`, when the spell divides something among them (CR 601.2d, D-145). */
  readonly divide?: readonly number[];
  /**
   * Answers the cost-payment question of Convoke, Improvise or Delve when the engine asks it (D-120): the
   * creatures or artifacts to tap, or the graveyard cards to exile. Left out, the question stays pending for
   * the test to answer (`payOptions(...)`), except with `pay: true`, which pays everything in mana.
   */
  readonly payOptions?: readonly CardRef[];
  /** Pay with the planner straight away. */
  readonly pay?: boolean;
}

/** The verbs of one seat. Every verb is an applyAction call and throws if the engine rejects it. */
export interface Actor {
  readonly seat: SeatId;
  playLand(card: CardRef, options?: PlayLandOptions): Actor;
  cast(card: CardRef, options?: CastOptions): CastHandle;
  tapForMana(card: CardRef, options?: TapOptions): Actor;
  /**
   * Activate an activated ability that is not a mana ability (CR 602.2) of a card on the
   * battlefield or in the player's hand (Cycling). The steps that follow (targets, payment, a
   * sacrifice to choose) are answered through the returned handle, like a cast.
   */
  activate(card: CardRef, options?: ActivateOptions): CastHandle;
  /**
   * Suspend a card in the player's hand (CR 702.62a, 116.2f, D-128): the special action. The cost is paid with
   * `pay: true` (or through the returned handle, `pay()`); without it the `payMana` decision stays pending.
   */
  suspend(card: CardRef, options?: SpecialOptions): CastHandle;
  /** Foretell a card in the player's hand (CR 702.143a, 116.2h, D-128): the special action, paid as `suspend`. */
  foretell(card: CardRef, options?: SpecialOptions): CastHandle;
  pass(): Actor;
  concede(): Actor;
  /** Mulligan decisions (CR 103.5). */
  keep(): Actor;
  mulligan(): Actor;
  /**
   * Answer mulliganBottom, discard or chooseCards: the chosen cards, in this order (a search puts
   * the first at its first destination, a put on top leaves the first on top). A search names cards
   * in the library, the rest in the hand.
   */
  chooseCards(...cards: CardRef[]): Actor;
  /**
   * Answer an arrangeCards decision (CR 701.22, 701.25): the cards looked at, which are in the
   * library, named by label, in the order they go. `top` goes back on top (the first becomes the top
   * card); `other` (default none) goes to the bottom in this order for a scry, into the graveyard
   * for a surveil.
   */
  arrange(arrangement: {
    readonly top: readonly CardRef[];
    readonly other?: readonly CardRef[];
  }): Actor;
  /** CR 903.9a, 903.9b: answer the commander zone decision. */
  sendToCommandZone(): Actor;
  declineCommandZone(): Actor;
  /** Answer a choosePermanent decision (CR 608.2d) with these permanents. */
  choosePermanents(...cards: CardRef[]): Actor;
  /**
   * Answer an orderTriggers decision (CR 603.3b). Each entry is the source name of a listed
   * trigger, or its index in the decision; the first entry is put on the stack first, so it
   * resolves last.
   */
  orderTriggers(...order: (string | number)[]): Actor;
  /** Answer a confirmOptional decision (CR 603.5). */
  accept(): Actor;
  decline(): Actor;
  /**
   * Answer a chooseOption decision (CR 614.12a, D-100): a creature type as the decision lists it
   * ("Elf", "Time Lord") or a color letter ("W", "U", "B", "R", "G").
   */
  chooseOption(option: string): Actor;
  /** Answer a chooseX decision (CR 107.3a, D-103): announce this value of X. */
  chooseX(value: number): Actor;
  /** Answer a chooseModes decision (CR 700.2, D-114): the indices of the modes chosen. */
  chooseModes(...modes: number[]): Actor;
  /** Answer declareAttackers (CR 508.1): these creatures attack; an empty list attacks with none. */
  declareAttackers(attacks: readonly AttackSpec[]): Actor;
  /** Shorthand: one or several creatures attack `target` (default: the opponent player). */
  attack(attackers: CardRef | readonly CardRef[], target?: AttackTargetRef): Actor;
  noAttackers(): Actor;
  /** Answer declareBlockers (CR 509.1). */
  declareBlockers(blocks: readonly BlockSpec[]): Actor;
  noBlocks(): Actor;
  /** Answer assignDamage (CR 510.1): the division for every creature that has a choice. */
  assignDamage(assignments: readonly DamageSpec[]): Actor;
  /** Answer assignDamage with the engine's default division (lethal to each blocker in order). */
  defaultDamage(): Actor;
  /**
   * Answer a pending `targets` decision directly, with the targets for its slots in order. This is
   * how the controller of a triggered ability answers (CR 603.3d); for a spell or an activation use
   * the `targets` option of `cast` and `activate`.
   */
  chooseTargets(...targets: TargetRef[]): Actor;
  /** Answer a pending payment decision directly (without `cast`). */
  payAuto(): Actor;
  cancel(): Actor;
  /** Any action, applied as is. */
  choose(action: Action): Actor;
  /** The same verbs, but an engine rejection is returned instead of thrown. */
  readonly try: TryVerbs;
}

export type EventMatcher = { readonly [K in string]?: unknown };

export interface ZoneExpectation {
  /** Seat meant as in CardQuery.seat. */
  readonly seat?: SeatId;
  /** Exactly this many matches. Default: at least one. */
  readonly count?: number;
}

export type ActionSpec =
  | 'pass'
  | { readonly playLand: CardRef; readonly face?: number }
  | { readonly cast: CardRef; readonly alternative?: CastAlternativeKind; readonly face?: number }
  | { readonly activate: CardRef; readonly ability?: number }
  | { readonly suspend: CardRef }
  | { readonly foretell: CardRef }
  | {
      readonly tap: CardRef;
      readonly color?: ManaColor;
      readonly combination?: ManaSpec;
    }
  | { readonly declareAttackers: readonly AttackSpec[] }
  | { readonly declareBlockers: readonly BlockSpec[] }
  | { readonly assignDamage: readonly DamageSpec[] };

export interface CombatExpectation {
  /** Exactly these creatures are attacking. */
  readonly attackers?: readonly CardRef[];
  /** Each listed attacker attacks exactly this player, planeswalker or battle. */
  readonly targets?: readonly { readonly attacker: CardRef; readonly target: AttackTargetRef }[];
  /** Exactly these attackers are blocked (CR 509.1h: still blocked if every blocker left). */
  readonly blocked?: readonly CardRef[];
  /** Exactly these attackers are unblocked. */
  readonly unblocked?: readonly CardRef[];
  /** Exactly these (blocker, attacker) pairs were declared. */
  readonly blocks?: readonly BlockSpec[];
}

export interface Expectations {
  zone(card: string, zone: Zone, options?: ZoneExpectation): void;
  noObject(card: string, options?: { readonly zone?: Zone; readonly seat?: SeatId }): void;
  life(seat: SeatId, life: number): void;
  tapped(card: CardRef, tapped?: boolean): void;
  /** What the permanent chose as it entered (D-100): exactly this, or nothing when `chosen` is null. */
  chosen(card: CardRef, chosen: ChosenValues | null): void;
  /** The power and toughness the engine derives for the permanent now (CR 613.4c). */
  pt(card: CardRef, power: number, toughness: number): void;
  /**
   * The characteristics the engine derives for the permanent now, after every layer (CR 613): each
   * list given must equal the derived one as a set (order does not matter). `keywords` are the
   * keyword abilities it has, by kind ("flying", "firstStrike").
   */
  derived(
    card: CardRef,
    expected: {
      readonly types?: readonly string[];
      readonly subtypes?: readonly string[];
      readonly colors?: readonly string[];
      readonly keywords?: readonly string[];
    },
  ): void;
  /**
   * The Aura or Equipment is attached to the permanent `to` (CR 301.5a, 303.4b), or to nothing when
   * `to` is null. Both are read as they are now.
   */
  attached(card: CardRef, to: CardRef | null): void;
  counters(card: CardRef, counters: Readonly<Record<string, number>>): void;
  damage(card: CardRef, damage: number): void;
  pool(seat: SeatId, mana: ManaSpec): void;
  handSize(seat: SeatId, size: number): void;
  librarySize(seat: SeatId, size: number): void;
  /** The stack, top first (the object that resolves first comes first). */
  stack(names: readonly string[]): void;
  pending(kind: PendingDecision['kind'], seat?: SeatId): void;
  step(step: StepId, options?: { readonly active?: SeatId; readonly turn?: number }): void;
  /** The events (all since build, or since `since`) contain these matchers in this order. */
  eventLog(matchers: readonly EventMatcher[], options?: { readonly since?: number }): void;
  noEvent(matcher: EventMatcher, options?: { readonly since?: number }): void;
  gameOver(result: { readonly win: SeatId } | 'draw'): void;
  hasLost(seat: SeatId, lost?: boolean): void;
  /** `seat` is the monarch (CR 725), or nobody is when `seat` is null (D-127). */
  monarch(seat: SeatId | null): void;
  /** The Ring has tempted `seat` this many times (CR 701.54c, D-196); 0 means it has not, and the seat has no emblem. */
  ringLevel(seat: SeatId, tempted: number): void;
  /** `seat` has the city's blessing (CR 702.131c, D-264), or does not when `has` is false. */
  citysBlessing(seat: SeatId, has?: boolean): void;
  /** The Ring-bearer of `seat` is that permanent, or `seat` has none when `card` is null (CR 701.54e, D-196). */
  ringBearer(seat: SeatId, card: CardRef | null): void;
  /**
   * For the combat specs (declareAttackers, declareBlockers, assignDamage) it means the engine
   * accepts the action: the legal-action list cannot enumerate every subset, so it is not consulted.
   */
  legal(seat: SeatId, spec: ActionSpec): void;
  /**
   * The action is rejected by applyAction (state unchanged) and is not in getLegalActions. Both
   * halves are checked, so a rule enforced in only one place fails the test.
   */
  illegal(seat: SeatId, spec: ActionSpec): void;
  /** The combat in progress matches; `null` means no combat is in progress (CR 511.3). */
  combat(expected: CombatExpectation | null): void;
  /**
   * At the declareAttackers decision: the creature is, or is not, a candidate attacker, and the
   * engine accepts, or rejects, a declaration of it alone (CR 508.1a, 702.3b, 302.6).
   */
  canAttack(card: CardRef, can?: boolean): void;
  /** At the declareBlockers decision: the creature may, or may not, block that attacker (CR 509.1a). */
  canBlock(blocker: CardRef, attacker: CardRef, can?: boolean): void;
  /** `seat` has been dealt exactly `amount` combat damage by the named commander (CR 903.10a). */
  commanderDamage(seat: SeatId, commander: string, amount: number): void;
  /** The state hash equals `hash` (from g.hash() earlier). */
  hash(hash: string): void;
  /** The position hash equals `hash` (from g.positionHash() earlier). */
  position(hash: string): void;
  /** Structural invariants hold. */
  invariants(): void;
}

export interface ScenarioGame {
  readonly state: GameState;
  /** Every event emitted by every verb since the game was built. */
  readonly events: readonly GameEvent[];
  /** Every applied action, in order: the action log. */
  readonly log: readonly { readonly seat: SeatId; readonly action: Action }[];
  readonly expect: Expectations;
  act(seat: SeatId): Actor;
  /** The seat holding the pending decision. Throws if the game is over. */
  readonly deciding: SeatId;
  /** Pass for the pending seat's priority once. */
  pass(seat?: SeatId): ScenarioGame;
  /**
   * Pass priority until the stack is empty; if it is already empty, until the step ends. Stops
   * early, without error, when a decision other than priority is pending (answer it with
   * `choose`), and when the game ends.
   */
  passAll(): ScenarioGame;
  /**
   * Pass priority until the game is in `step` (with the decision pending there). It is a "walk the
   * turn" helper: on the way it answers a declareAttackers decision with no attackers and a
   * declareBlockers decision with no blocks. `attack: false` or `block: false` turns that off, and
   * the walk then stops with a ScenarioError naming the decision. Any other decision stops it too.
   */
  advanceTo(
    step: StepId,
    options?: {
      readonly turn?: number | 'next';
      readonly attack?: boolean;
      readonly block?: boolean;
    },
  ): ScenarioGame;
  /**
   * Plays a whole combat from the verbs: attackers, blockers, damage divisions, and priority
   * passes through the combat steps (CR 506-511), up to `plan.until`. From the main phase or the
   * beginning of combat it first walks to the declare attackers decision.
   */
  playCombat(plan: CombatPlan): ScenarioGame;
  /** Apply an action for the seat, or for the deciding seat when `seat` is left out. */
  choose(action: Action): ScenarioGame;
  choose(seat: SeatId, action: Action): ScenarioGame;
  /** The current object for a card reference. Throws unless exactly one matches. */
  object(card: CardRef): GameObject;
  id(card: CardRef): ObjectId;
  /** Every object matching the query (possibly none). */
  find(query: CardQuery): GameObject[];
  legalActions(seat: SeatId): Action[];
  /** getView of the seat: what that seat is allowed to know. */
  view(seat: SeatId): GameView;
  /** A deterministic fingerprint of the whole state (stateHash). */
  hash(): string;
  /**
   * Like hash, but ignoring `actionCount`, the length of the action log. Two states with the same
   * position hash are the same game position, even when different numbers of actions led there
   * (for example before a cast and after cancelling it).
   */
  positionHash(): string;
  /** A marker for `eventsSince` and the `since` option of event assertions. */
  mark(): number;
  eventsSince(mark: number): readonly GameEvent[];
  /** A readable dump of the state, for debugging a failing test. */
  dump(): string;
}

export type { CardDefinition };
