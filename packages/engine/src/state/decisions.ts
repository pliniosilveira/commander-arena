/**
 * Pending decisions (SPEC 4.2, 17.1 A2, D-002). The engine is always waiting on exactly one
 * decision for exactly one seat. Having priority is a decision kind. Each kind names the seat that
 * decides and the legal options (or a validator for choices too large to list).
 *
 * UI and AI each implement a Record<DecisionKind, Handler>; the mapped type fails to compile when
 * a kind has no handler.
 */
import type { CastAlternativeKind } from '../ast/features';
import type { Cost, Trigger } from '../ast/types';
import type { CardType, Color } from '../characteristics';
import type { CardId, DecisionId, ObjectId, SeatId } from '../ids';
import type { ManaColor } from '../mana/types';
import type { ChosenTarget } from './chosen';
import type { AttackTarget, DamageAssignment, DamageChoice, DamageRecipient } from './combat-types';

interface DecisionBase {
  readonly id: DecisionId;
  readonly seat: SeatId;
}

/** What a seat holding priority may do (CR 117.1). */
export type PriorityOption =
  | { readonly kind: 'pass' }
  /**
   * Play a land card (CR 305.1). `face` is present exactly when the card has more than one face
   * that can be cast or played (split, adventure, modal double-faced: CR 709.3, 715.3, 712.12):
   * the index into the card definition's faces, one option per land face.
   */
  | { readonly kind: 'playLand'; readonly object: ObjectId; readonly face?: number }
  /**
   * Cast a spell. `alternative: 'flashback'` casts the card from its owner's graveyard by paying
   * its flashback cost instead of its mana cost (CR 702.34a, 118.9); `alternative: 'free'` casts it
   * without paying its mana cost (CR 118.9, D-095), offered only while the condition of the card's
   * `alternativeCosts` holds, as a separate option beside the ordinary cast; `alternative: 'overload'` and
   * the other named alternatives (D-121) are one option each, listed only when their cost can be paid
   * (CR 118.9a: one alternative cost per spell). Without it the card is cast
   * from the hand or the command zone, or from exile when it is on an Adventure (CR 715.3d; face 0
   * only). `face` is present exactly when the card has more than one face that can be cast (split,
   * adventure, modal double-faced: CR 709.3, 715.3, 712.11b): the index into the card definition's
   * faces, one option per castable face. Absent for every other card, whose face 0 is cast.
   */
  | {
      readonly kind: 'castSpell';
      readonly object: ObjectId;
      readonly alternative?: CastAlternativeKind;
      readonly face?: number;
    }
  /**
   * Activate an activated ability (CR 602) that is not a mana ability: of a permanent on the
   * battlefield, or of a card in hand that has one (Cycling, CR 702.29a). `abilityIndex` is the
   * index among the object's derived abilities. Mana abilities keep `activateAbility`.
   */
  | { readonly kind: 'activate'; readonly object: ObjectId; readonly abilityIndex: number }
  | {
      readonly kind: 'activateAbility';
      readonly source: ObjectId;
      readonly abilityIndex: number;
      /** For mana abilities with a choice of color (any color, commander identity, "could produce"). */
      readonly color: ManaColor | null;
      /**
       * For a mana ability that makes one of several combinations ("Add {R}{R}, {R}{W}, or {W}{W}",
       * D-099): the combination, in the order W, U, B, R, G, C. `color` is null then. Absent otherwise.
       */
      readonly combination?: readonly ManaColor[];
      /**
       * For a mana ability whose cost sacrifices a kind of permanent ("Sacrifice a Spirit: Add {R}.", D-222, CR 601.2b) when the player has more than one to give
       * up: one option for each permanent they may give up, this one. Absent when the cost sacrifices nothing, only the source, or when there is one candidate.
       */
      readonly sacrifice?: ObjectId;
    }
  /** Suspend a card from the hand (CR 702.62a, D-128): a special action, see the `suspend` action. */
  | { readonly kind: 'suspend'; readonly object: ObjectId }
  /** Foretell a card from the hand (CR 702.143a, D-128): a special action, see the `foretell` action. */
  | { readonly kind: 'foretell'; readonly object: ObjectId }
  /** Turn a face-down permanent face up (CR 116.2b, 701.40b, D-310): a special action, see the `turnFaceUp` action. */
  | { readonly kind: 'turnFaceUp'; readonly object: ObjectId }
  | { readonly kind: 'concede' };

export interface PriorityDecision extends DecisionBase {
  readonly kind: 'priority';
  readonly options: readonly PriorityOption[];
}

/** CR 103.5 (London mulligan): keep this hand or take a mulligan. */
export interface MulliganDecision extends DecisionBase {
  readonly kind: 'mulligan';
  readonly hand: readonly ObjectId[];
  /** Number of cards that would go to the bottom if the seat keeps now. */
  readonly bottomCount: number;
  /** False once taking another mulligan is no longer possible (seven already taken). */
  readonly canMulligan: boolean;
}

/** After keeping, put this many cards from hand on the bottom of the library (CR 103.5). */
export interface MulliganBottomDecision extends DecisionBase {
  readonly kind: 'mulliganBottom';
  readonly count: number;
  readonly hand: readonly ObjectId[];
}

/** CR 601.2c: choose targets for the spell or ability being put on the stack. */
export interface TargetsDecision extends DecisionBase {
  readonly kind: 'targets';
  readonly source: ObjectId;
  readonly specs: readonly TargetChoiceSpec[];
  /**
   * True when `source` is a triggered ability being put on the stack (CR 603.3d). Putting it on the
   * stack is not optional, so this decision has no `cancel`; absent for a spell or an activation.
   */
  readonly forTrigger?: true;
  /**
   * True when `source` is a copy of a spell that was just put on the stack and its controller may choose new targets
   * for it (CR 707.10c, D-129). The copy has `current` targets; the answer is any set within the slots' bounds in which
   * each target is a legal one or is the target the copy has in that slot (the player may leave any number of targets
   * unchanged, even if illegal). `legal` lists both, so every answer the engine accepts is in it. There is no cancel:
   * the copy is already on the stack. Absent otherwise.
   */
  readonly forCopy?: true;
  /** With `forCopy` or `forChange`: the targets the copy or the spell or ability has now (those of the original). */
  readonly current?: readonly ChosenTarget[];
  /**
   * True when a resolving "change the target of target spell or ability" effect asks its controller for the new target (CR 115.7a, 115.7b, D-181).
   * `source` is the spell or ability that changes it, `subject` the spell or ability on the stack whose target is changed, and `current` its target.
   * There is one slot, of the `subject`'s own target (`specId`), with exactly one target to choose among `legal`, which lists the legal targets
   * other than the current one (it is changed only to another legal target; nothing is asked when there is none, and the one possible is taken
   * without asking). There is no cancel: the effect is resolving. Absent otherwise.
   */
  readonly forChange?: true;
  /** With `forChange`: the spell or ability on the stack whose target is changed. */
  readonly subject?: ObjectId;
}

export interface TargetChoiceSpec {
  readonly specId: string;
  readonly min: number;
  readonly max: number;
  /**
   * What the caster divides among the targets of this slot, read as the spell is cast (CR 601.2d, D-145): each target chosen carries a
   * `share` of at least 1 and the shares add up to this number. Absent for a slot that divides nothing. `max` is never more than it.
   */
  readonly divide?: number;
  /**
   * For a slot of a copy of a spell that divides something (`forCopy`, D-149, CR 707.10, 115.7f): the original division cannot be changed, so the
   * answer holds as many targets as the copy has now (`min` = `max`) and names no share (`divide` is absent). A target left as it is keeps its
   * own share; the new targets, in the order they are named, take the shares of the targets they replace, in the order of `current`.
   */
  readonly keepsDivision?: true;
  /**
   * For a slot that takes at most one target for each opponent (`TargetSpec.onePerOpponent`, D-149, "for each opponent, exile up to one
   * target nonland permanent that player controls"): no two targets chosen may have the same `group` (the player who controls them).
   * Absent for every other slot.
   */
  readonly onePerGroup?: true;
  /** "Each of up to two other targets" (`TargetSpec.differentFrom`, D-151): no target of this slot is a target chosen for the slot with this id. */
  readonly differentFrom?: string;
  /** Every legal target for this slot, computed by the engine (CR 115, 608.2b). */
  readonly legal: readonly ChosenTarget[];
  /**
   * For a modal spell or ability (D-114): the index of the mode this slot belongs to. The slots of the
   * chosen modes come in printed order of the modes, each mode's slots in order (CR 601.2c, 700.2c).
   * Absent for everything that is not modal.
   */
  readonly mode?: number;
  /**
   * For a slot of a mode chosen more than once (CR 700.2d, D-344): which instance of the mode it is, 1 for the second, 2 for the third; the slot of the first
   * instance has no `instance`. Every instance has its own slot and the same target may be chosen for each.
   */
  readonly instance?: number;
}

/** CR 601.2g-h: pay the total cost. `auto` lets the payment planner choose the sources. */
export interface PayManaDecision extends DecisionBase {
  readonly kind: 'payMana';
  readonly source: ObjectId;
  readonly totalCost: readonly string[];
  /**
   * Mana abilities of permanents the seat may tap now, as object and ability index. `colors` is
   * set when the player picks the color the source makes (any color, "{U} or {B}", the commander's
   * identity) and lists the colors on offer in the order to show them; a one-entry list needs no
   * question. A manual tap of such a source must name one of them. A source whose ability costs
   * mana is listed too: by hand its cost is paid from the pool, so tap the sources that pay first.
   */
  readonly manaSources: readonly {
    readonly object: ObjectId;
    readonly abilityIndex: number;
    readonly colors?: readonly ManaColor[];
    /**
     * Set instead of `colors` when the source makes one of several combinations of mana (D-099): the
     * combinations on offer, each in the order W, U, B, R, G, C. A manual tap must name one of them
     * as `combination` (a one-entry list needs no question).
     */
    readonly combinations?: readonly (readonly ManaColor[])[];
    /**
     * Set when the ability's cost sacrifices a kind of permanent ("Sacrifice a Spirit: Add {R}.", D-222, CR 601.2b) and the player has more than one to give up:
     * the permanents they may choose. A manual tap of the source must name one of them as `sacrifice`; `payAuto` gives up the one the planner prefers (a token
     * before a card, then the lowest mana value).
     */
    readonly sacrifices?: readonly ObjectId[];
  }[];
  /**
   * `'ward'`, `'counterUnlessPays'`: the cost is not a spell's or an ability's but the one a
   * resolving "counter it unless its controller pays" ability asks (Ward, CR 702.21a, or "Counter
   * target spell unless its controller pays {3}"), after the controller accepted (`confirmOptional`
   * with the same purpose). `source` is that spell or ability on the stack and `subject` the spell
   * or ability that is countered if the cost is not paid. `cancel` is a legal answer and means "do
   * not pay": the spell or ability is countered. `'unlessPays'` (D-111): the cost of "[do something] unless
   * [that player] pays [cost]": `source` is the ability on the stack, `seat` the payer, `cancel` means
   * "do not pay" (the effect happens), `subject` is absent. Absent for the cost of a cast or an activation.
   */
  readonly purpose?:
    | 'ward'
    | 'counterUnlessPays'
    | 'unlessPays'
    | 'mayPay'
    | 'attackTax'
    | 'blockTax'
    | 'suspend'
    | 'foretell'
    | 'turnFaceUp';
  readonly subject?: ObjectId;
  /**
   * For purpose `'unlessPays'` when the payment is the one of an upkeep keyword (D-127): `'echo'` (CR 702.30a:
   * "sacrifice it unless you pay [cost]") or `'cumulativeUpkeep'` (CR 702.24a: `cost` is already the cost for each
   * age counter, so `totalCost` is the whole payment). Declining or not paying sacrifices the source. Absent
   * for every other payment.
   */
  readonly upkeep?: 'echo' | 'cumulativeUpkeep';
  /**
   * For `'attackTax'` (CR 508.1h, D-125): the cost of attacking with the creatures in `attacks` ("Creatures can't
   * attack you unless their controller pays ..."). `seat` is the attacking player, `source` the first
   * permanent that taxes the attack, `totalCost` the whole of it, and `manaSources` is read with the
   * attackers already tapped (CR 508.1f). Nothing is declared yet: `payAuto` or `payManual` pays and then
   * declares exactly these attackers; `cancel` takes the declaration back and asks the `declareAttackers`
   * question again. Absent for every other payment.
   */
  readonly attacks?: readonly { readonly attacker: ObjectId; readonly target: AttackTarget }[];
  /**
   * For `'blockTax'` (CR 509.1d, D-149): the cost of blocking with the creatures in `blocks` ("Creatures can't block unless their controller
   * pays {1} for each of those creatures"). `seat` is the defending player, `source` the first permanent that taxes blocking, `totalCost` the whole
   * of it. Nothing is declared yet: `payAuto` or `payManual` pays and then declares exactly these blocks; `cancel` takes the declaration back and
   * asks the `declareBlockers` question again. Absent for every other payment.
   */
  readonly blocks?: readonly { readonly blocker: ObjectId; readonly attacker: ObjectId }[];
}
/*
 * For `'suspend'` and `'foretell'` (D-128, CR 116.2f, 116.2h, 702.62a, 702.143a): the cost of a special action, paid
 * before the card is exiled. `source` is the card in the hand, `seat` its owner, `totalCost` the cost ({M} of the
 * suspend cost, or {2} for foretell). `payAuto` or `payManual` pays it and takes the action; `cancel` takes
 * nothing and gives priority back (nothing has happened).
 *
 * For `'turnFaceUp'` (CR 701.40b, 708.8, D-310): the cost of turning a face-down permanent face up, paid before it is turned. `source` is the permanent, `seat` its
 * controller (the only seat that gets the decision), `totalCost` the mana cost of its card. Answered like the cost of a special action.
 */

/** Cleanup: discard down to maximum hand size (CR 514.1). */
export interface DiscardDecision extends DecisionBase {
  readonly kind: 'discard';
  readonly count: number;
  readonly hand: readonly ObjectId[];
}

/** CR 903.9a (state-based action) and 903.9b (replacement): may the commander go to the command zone? */
export interface CommanderZoneDecision extends DecisionBase {
  readonly kind: 'commanderZone';
  readonly card: CardId;
  readonly object: ObjectId;
  readonly from: 'graveyard' | 'exile' | 'hand' | 'library';
}

/** CR 508.1: choose which creatures attack, and what each attacks. */
export interface DeclareAttackersDecision extends DecisionBase {
  readonly kind: 'declareAttackers';
  readonly candidates: readonly {
    readonly attacker: ObjectId;
    readonly targets: readonly AttackTarget[];
  }[];
  /**
   * The candidates that must be declared (CR 508.1d: "attacks each combat if able"): a declaration
   * that leaves one out is illegal. Always present, empty when nothing is required.
   */
  readonly mustAttack: readonly ObjectId[];
  /**
   * What attacking costs (D-125, CR 508.1h), present only when some target is taxed ("Creatures can't attack you
   * unless their controller pays {2} for each creature they control that's attacking you"): for each taxed
   * target the mana each attacker costs to attack it (`cost`, the symbols of every tax on it, in the order the
   * planner pays them) and `affordable`, the most creatures that can attack that target and be paid for with
   * the mana available now (counted with every attacker without vigilance already tapped, so the number is a
   * floor: a declaration that fits it is always accepted). A declaration whose cost cannot be paid is refused,
   * and the legal-action list holds only declarations within `affordable`. A creature that is not required
   * to attack when every target of it is taxed (CR 508.1d): `mustAttack` leaves it out.
   */
  readonly attackCosts?: readonly {
    readonly target: AttackTarget;
    readonly cost: readonly string[];
    readonly affordable: number;
  }[];
}

/** CR 509.1: choose which creatures block, and which attacker each blocks. */
export interface DeclareBlockersDecision extends DecisionBase {
  readonly kind: 'declareBlockers';
  readonly attackers: readonly {
    readonly attacker: ObjectId;
    readonly target: AttackTarget;
    /** How many creatures must block it if any do: 2 for menace (CR 702.111b), otherwise 1. */
    readonly minBlockers: number;
    /**
     * The most creatures that may block it (D-133, CR 509.1b: "can't be blocked by more than one creature"): 1 for an attacker
     * with that restriction. Absent when there is no limit.
     */
    readonly maxBlockers?: number;
    /** "Must be blocked if able" (D-206, CR 509.1c): a declaration that could block it and does not is refused. */
    readonly mustBeBlocked?: true;
  }[];
  readonly candidates: readonly {
    readonly blocker: ObjectId;
    readonly canBlock: readonly ObjectId[];
  }[];
  /**
   * What blocking costs (D-149, CR 509.1d), present only when some permanent taxes it ("As long as this creature is attacking, creatures can't block
   * unless their controller pays {1} for each of those creatures"): `cost` is the mana each blocking creature costs (the symbols of every tax, in
   * the order the planner pays them), `affordable` the most creatures that can block and be paid for with the mana available now, `source` the first
   * permanent that taxes. A declaration with more blockers than `affordable` is refused, and the legal-action list holds none. Blocking does not tap,
   * so the number is exact for mana from lands and is a floor for mana from creatures that block.
   */
  readonly blockCost?: {
    readonly cost: readonly string[];
    readonly affordable: number;
    readonly source: ObjectId;
  };
}

/**
 * CR 510.1: divide combat damage where the controller has a real choice. Only attackers blocked
 * by several creatures, or with trample, appear; every other assignment is forced and automatic.
 */
export interface AssignDamageDecision extends DecisionBase {
  readonly kind: 'assignDamage';
  readonly step: 'firstStrike' | 'regular';
  readonly choices: readonly DamageChoice[];
}

/**
 * CR 608.2d: an effect makes the controller choose permanents ("sacrifice a creature", "sacrifice
 * another permanent"). `legal` is computed by the engine; the answer is between `min` and `max` of
 * them. With no more candidates than `min` the engine chooses by itself and never asks.
 */
export interface ChoosePermanentDecision extends DecisionBase {
  readonly kind: 'choosePermanent';
  /** The spell or ability on the stack that is resolving. */
  readonly source: ObjectId;
  /**
   * `'sacrifice'`: an effect or cost makes the controller sacrifice (CR 608.2d). `'legendRule'`:
   * the legend rule (CR 704.5j): `seat` controls the permanents in `legal`, which are legendary and
   * share a name; they choose the one to keep (`min` = `max` = 1), the rest go to their owners'
   * graveyards. No spell or ability is involved, so `source` is the first of `legal`. `'crew'`: the
   * cost of a crew ability (CR 702.122a), always `forCost`: `legal` are the untapped creatures `seat`
   * controls other than the Vehicle, `min` is 1, `max` is `legal.length`, and the answer must have
   * total power of at least `minTotalPower` (`powers` gives each one's power). `'effect'`: an effect
   * other than a sacrifice makes the controller choose permanents they control to move ("return a
   * land you control to its owner's hand", CR 608.2d); `legal` are the matching permanents. `'untap'` (CR 502.3, D-125): the untap step
   * of `seat`: `legal` are its tapped permanents with "You may choose not to untap ~ during your untap step" that
   * would untap, `min` is 0 and `max` is `legal.length`; the answer names the permanents that untap, the rest stay
   * tapped. No spell or ability is involved, so `source` is the first of `legal`. `'tap'` (D-133): the cost of an activated
   * ability that taps untapped permanents ("Tap three untapped Zombies you control"), always `forCost`: `legal` are
   * the untapped permanents that match, `min` and `max` the number to tap. `'bounce'` (D-139): the cost of an activated ability that
   * returns permanents to their owners' hands ("Return an artifact you control to its owner's hand"), always `forCost`: `legal` are
   * the permanents the player controls that match, `min` and `max` the number to return. `'fight'` (D-145): see `subject`.
   * `'untapChoice'` (D-216, CR 701.26a: "Untap up to three lands"): an effect untaps permanents the controller chooses; `legal` are the tapped
   * permanents on the battlefield that match, of any player, `min` is 0 and `max` the most that may be untapped.
   */
  readonly purpose:
    | 'sacrifice'
    | 'legendRule'
    | 'crew'
    | 'effect'
    | 'untap'
    | 'tap'
    | 'bounce'
    | 'fight'
    | 'proliferate'
    | 'auraHost'
    | 'entersCopy'
    | 'devour'
    | 'ringBearer'
    | 'empowerJace'
    | 'amass'
    | 'untapChoice'
    | 'conniveOrder'
    | 'spare'
    | 'soulbond';
  /**
   * For `'fight'` (D-145, CR 701.14: "Each of those tokens fights a different one of those creatures"): `seat` (the controller of the effect)
   * chooses which creature of `legal` the creature `subject` fights; exactly one (`min` = `max` = 1). For `'auraHost'` (D-149, CR 303.4f):
   * `seat`, the player an Aura card enters the battlefield under, chooses which permanent of `legal` the Aura `subject` will enchant; exactly one.
   * For `'entersCopy'` (D-151, CR 707.9, 614.12: "As this artifact enters, you may have it become a copy of any creature on the battlefield"): `seat`, the
   * player the permanent `subject` enters under, chooses which permanent of `legal` it becomes a copy of; `min` is 0 when that is optional, `max` 1. The
   * permanent has not entered yet: `source` and `subject` are the object it is now.
   * For `'devour'` (D-185, CR 702.82a: "As this creature enters, you may sacrifice any number of creatures"): `seat`, the player the permanent
   * `subject` enters under, chooses which of the creatures in `legal` (all they control) to sacrifice; `min` is 0 and `max` is `legal.length`, and the
   * permanent enters with N +1/+1 counters for each one chosen. The permanent has not entered yet: `source` and `subject` are the object it is now,
   * or, for a token, the spell or ability creating it. The sacrifice is not a cost and cannot be taken back.
   * For `'empowerJace'` (D-201, CR 701.71a: "Choose a Jace planeswalker token you control"): `seat`, the player who empowers, chooses which Jace token of
   * `legal` (all they control) gets the loyalty counters; exactly one. Asked only with two or more.
   * For `'amass'` (D-1120, CR 701.47a: "Choose an Army creature you control"): `seat`, the player who amasses, chooses which Army creature of `legal` (all they
   * control, as `derive` types them now, a token the effect just made among them) gets the +1/+1 counters; exactly one. Asked only with two or more. `source` is the
   * spell or ability.
   * For `'ringBearer'` (D-196, CR 701.54a: "Each time the Ring tempts you, choose a creature you control"): `seat`, the player the Ring is tempting,
   * chooses which creature of `legal` (all the creatures they control, as `derive` types them now) becomes their Ring-bearer; exactly one
   * (`min` = `max` = 1), and only asked when there are two or more. `source` is the spell or ability that tempts.
   * For `'conniveOrder'` (D-223, CR 701.50c: "the first player in APNAP order who controls ... one or more of those permanents chooses one of them and it
   * connives"): `seat`, that player, chooses which permanent of `legal` (those of theirs still to connive, some perhaps gone from the battlefield) connives
   * next; exactly one. Asked only when the player has two or more. `source` is the spell or ability.
   * For `'soulbond'` (D-286, CR 702.95a, 603.5: "you may pair this creature with another unpaired creature you control"): `seat`, the controller of the
   * soulbond ability, chooses which creature of `legal` (the unpaired creatures they control, as `derive` types them now, other than `subject`; for the
   * ability of "whenever another creature you control enters", only the one that entered) the creature `subject` is paired with; `min` is 0 (choosing none
   * is the "may") and `max` is 1. Asked even when there is a single candidate. `source` is the ability on the stack.
   * Absent for every other purpose.
   */
  readonly subject?: ObjectId;
  /**
   * For `'spare'` (D-231, "For each player, you choose from among the permanents that player controls an artifact, a creature, ..."): `seat` (the controller of
   * the effect) chooses which of `legal` (the permanents of that card type `player` controls) is not sacrificed; exactly one (`min` = `max` = 1). Absent otherwise.
   */
  readonly spare?: { readonly player: SeatId; readonly type: CardType };
  /**
   * For `'proliferate'` (CR 701.34a, D-149): `seat` chooses any number of the permanents in `legal` (those with a counter) and of the
   * players listed here (those with poison counters); `min` is 0 and `max` is `legal.length`. The answer, a `choosePermanents` action,
   * names the players in its `players`. Absent for every other purpose.
   */
  readonly players?: readonly SeatId[];
  readonly min: number;
  readonly max: number;
  readonly legal: readonly ObjectId[];
  /**
   * True when the sacrifice is a cost of an ability being activated (CR 602.2b, 601.2h) rather than
   * an effect: `source` is then that ability on the stack, and `cancel` is a legal answer, which
   * rewinds the whole activation (CR 733).
   */
  readonly forCost?: boolean;
  /**
   * For `'crew'`: the total power the chosen creatures must have, N of "Crew N" (CR 702.122a). The
   * engine refuses a smaller total; any subset that reaches it is legal, and tapping more than
   * needed is allowed. Left out for every other purpose.
   */
  readonly minTotalPower?: number;
  /**
   * For `'crew'`: the power of each creature in `legal` as the engine derives it now (CR 613.4), so
   * a listing from the decision alone (`legalActionsForDecision`) can tell which subsets are enough.
   */
  readonly powers?: Readonly<Record<ObjectId, number>>;
}

/**
 * CR 701.23 (Search), 701.9 (Discard): an effect makes a player choose cards from a zone. A search
 * looks through the player's own library; `legal` lists the cards that match the description, in a
 * fixed order that says nothing about the library's order (CR 401.2), and the player may find
 * between `min` and `max` of them (fewer than the maximum is always allowed when the description
 * has a stated quality, CR 701.23b, so a search has `min` 0). A discard chooses from the hand of
 * `seat`, which is not always the controller of the effect. The answer is a `chooseCards` action:
 * distinct cards from `legal`, in the order the player gives them (a search puts the first found
 * card at the first destination). `reveal` says the chosen cards will be shown to every player
 * (CR 701.20); a discard is public because the cards go to the graveyard. `prompt` is the plain
 * words for the dialog, including where the cards will go. `'putOnTop'` is "put N cards from your
 * hand on top of your library in any order": the player chooses exactly `min` = `max` cards of
 * `seat`'s hand and the order of the answer is the order from the top (the first card ends up on
 * top); the cards stay hidden (`reveal` false). `'exile'` (D-124, CR 702.138a) is the cost of Escape: exactly
 * `min` = `max` other cards from `seat`'s graveyard (`zone: 'graveyard'`) are exiled as the spell is cast; the
 * cards are public, `forCost` is always set, and `cancel` rewinds the cast. `'cast'` (D-145, CR 608.2g) is "You may cast a spell ... from
 * your hand without paying its mana cost" and "You may play the exiled card": none or one of the `legal` cards (`min` 0, `max` 1, in `zone`
 * 'hand' or 'exile'), which the controller then casts or plays without paying; a card exiled face down is shown to the player who may look at it.
 */
export interface ChooseCardsDecision extends DecisionBase {
  readonly kind: 'chooseCards';
  /** The spell or ability on the stack that is resolving. */
  readonly source: ObjectId;
  readonly purpose:
    | 'search'
    | 'discard'
    | 'putOnTop'
    | 'exile'
    | 'move'
    | 'lookTake'
    | 'cast'
    | 'behold'
    | 'lookSplit'
    | 'reveal'
    | 'split'
    | 'copy'
    | 'pair'
    | 'separate';
  readonly zone: 'library' | 'hand' | 'graveyard' | 'exile';
  readonly legal: readonly ObjectId[];
  readonly min: number;
  readonly max: number;
  readonly reveal: boolean;
  readonly prompt: string;
  /**
   * For a discard "unless you discard an artifact card" (D-139): the cards of `legal` that alone are a legal answer. The answer is either
   * exactly `max` cards, or one single card of this list (`min` is 1: the fewest cards an answer has). Absent for every other question.
   */
  readonly orSingle?: readonly ObjectId[];
  /**
   * For a search "for up to two basic land cards that share a land type" (D-262, CR 205.3i, 701.23): the land types of each card of `legal`. The cards chosen must
   * have one land type in common (one card, or none, always does). Absent for every other question.
   */
  readonly shareLandType?: Readonly<Record<ObjectId, readonly string[]>>;
  /**
   * For `'reveal'` (D-225, CR 614.12, 701.20a: "As this land enters, you may reveal a Mountain or Plains card from your hand"): the player who accepted chooses which
   * of the cards of `legal` (all in their hand, more than one) to reveal; exactly one (`min` = `max` = 1), and `source` is the land that is entering (or the spell
   * or ability that creates it, for a token). `face` is the face of a modal double-faced land being played. Absent for every other question.
   *
   * For `'lookTake'` (D-139, "Look at the top six cards of your library. You may reveal an artifact card from among them"): every card
   * looked at, top first, which only `seat` may see (`legal` are the ones that match and may be taken, `min` is 0). The others go where the
   * effect says once the answer is in. Absent for every other question.
   */
  readonly looked?: readonly ObjectId[];
  /**
   * For `'lookTake'` with a total ("Put any number of nonland permanent cards with total mana value 4 or less from among them onto the battlefield", D-230, CR 202.3): the
   * most the mana values of the cards chosen may add up to, and the mana value of each card of `legal` (the answer is checked against them). Absent otherwise.
   */
  readonly totalManaValue?: {
    readonly limit: number;
    readonly values: Readonly<Record<ObjectId, number>>;
  };
  /**
   * For `'lookSplit'` (D-216, "Put one of them into your hand, put one of them on the bottom of your library, and exile one of them"): every card looked
   * at is in `looked` (only `seat` sees them), `legal` are those still to place and exactly `min` = `max` of them are chosen for this pile, `to` says which:
   * the hand or the bottom of the library. Absent for every other question.
   *
   * For `'separate'` (D-303, CR 700.3, "An opponent separates those cards into two piles"): `seat` is the player who separates, `legal` the revealed cards, still in a library
   * (`zone`), and the cards chosen (`min` 0, `max` all of them) are pile 1; the cards not chosen are pile 2 (CR 700.3a, 700.3d: either may be empty). All are public (`reveal`).
   */
  readonly to?: 'hand' | 'bottom';
  /**
   * True when the discard is a cost being paid: of a spell being cast (an additional cost, CR 601.2h)
   * or of an ability being activated (CR 602.2b), with `source` the spell or ability on the stack and
   * `cancel` a legal answer that rewinds the cast or the activation (CR 733), as for a sacrifice cost.
   * Absent for a discard an effect makes and for Ward's cost (the payer already accepted it).
   */
  readonly forCost?: true;
  /** For `'reveal'` when a modal double-faced land is being played from the hand: the face (CR 712.12). Absent for face 0 and every other question. */
  readonly face?: number;
}

/**
 * CR 701.22 (Scry), 701.25 (Surveil): the player looked at the top cards of their library and
 * arranges them. `cards` are the cards looked at, top first (fewer than the number asked when the
 * library holds fewer); only `seat` may see which they are (`view.ts` shows them to that seat alone,
 * the other seat sees how many went where in the `scried` and `surveiled` events). `piles` are where
 * a card may go: `'top'` (put back on top in the order given, the first becomes the top card) and,
 * for a scry, `'bottom'` (the cards in the order given, the last becomes the bottom card), for a
 * surveil `'graveyard'`. `purpose: 'reorder'` is "look at the top N cards, then put them back in any
 * order": every card goes back on top, so `piles` is only `['top']`. `purpose: 'bottom'` (D-324, CR 401.4, "Put two of them into your hand and the rest on the
 * bottom of your library in any order"): the cards the effect did not take, which are still in the library, go to the bottom in the order the owner chooses, so `piles` is
 * only `['bottom']`: the answer has `top` empty and every card in `other`, the last becoming the bottom card (as for a scry). The answer is an `arrangeCards`
 * action that places every card exactly once.
 */
export interface ArrangeCardsDecision extends DecisionBase {
  readonly kind: 'arrangeCards';
  /** The spell or ability on the stack that is resolving. */
  readonly source: ObjectId;
  readonly purpose: 'scry' | 'surveil' | 'reorder' | 'bottom';
  readonly cards: readonly ObjectId[];
  readonly piles: readonly ('top' | 'bottom' | 'graveyard')[];
}

/** One distinct waiting triggered ability in an orderTriggers decision. */
export interface TriggerChoice {
  /**
   * The object the ability belongs to; it may have left the battlefield (CR 603.10a). Null for an inherent ability that
   * has no source (the monarch's, CR 725.2, D-127), whose `sourceName` is "The monarch".
   */
  readonly source: ObjectId | null;
  readonly sourceName: string;
  readonly sourceOracleText: string;
  /** Index of the ability in the source's abilities. */
  readonly abilityIndex: number;
  /** How many identical copies of this trigger wait (A18: identical ones are ordered together). */
  readonly count: number;
  /** For a chapter ability of a Saga (CR 714.2): the chapter number that was reached. */
  readonly chapter?: number;
  /** The ability's trigger event, so the trigger-ordering panel can word it ("When this enters"). */
  readonly trigger?: Trigger;
}

/**
 * CR 603.3b: a player controls several triggered abilities that went off at the same time and are
 * not identical, so they choose the order in which they go on the stack.
 */
export interface OrderTriggersDecision extends DecisionBase {
  readonly kind: 'orderTriggers';
  /** The distinct triggers, in the engine's default order. */
  readonly triggers: readonly TriggerChoice[];
}

/**
 * CR 603.5: "you may": does the controller of the resolving ability do it? Also asked, with `cost`
 * set, for a permanent that enters the battlefield and may pay to enter untapped (CR 614.1c, 614.12,
 * a shock land: "As this enters, you may pay 2 life. If you don't, it enters tapped"). Accepting
 * pays; declining enters it tapped.
 */
export interface ConfirmOptionalDecision extends DecisionBase {
  readonly kind: 'confirmOptional';
  /**
   * The ability on the stack that is resolving; with `cost`, the object about to enter the
   * battlefield (in the hand, or the spell on the stack, as it is before it enters).
   */
  readonly source: ObjectId;
  /** The permanent that the ability belongs to, which may have left the battlefield. */
  readonly sourceName: string;
  readonly sourceOracleText: string;
  /** What accepting pays, for the dialog ("Pay 2 life?"). Absent for a plain "you may". */
  readonly cost?: readonly Cost[];
  /**
   * "As this land enters, you may reveal a Mountain or Plains card from your hand" (D-208, CR 701.20, 701.4): the question of a land that enters untapped
   * when its controller reveals (or beholds) a card; `words` is what the card is, for the dialog ("a Mountain or Plains card"), `behold` that a
   * permanent the player controls does too. No `cost`: accepting reveals a card, which pays nothing. Asked only when a card or permanent qualifies.
   */
  readonly reveal?: { readonly words: string; readonly behold?: true };
  /**
   * What is being asked when it is not one of the two older questions. `'kicker'`: the spell being
   * cast has kicker and the kicked total can be paid (CR 702.33a, 601.2b); `source` is the spell on
   * the stack, `cost` the kicker cost, accepting kicks it and declining casts it unkicked, and
   * `cancel` is a legal answer that rewinds the cast (CR 733). Absent for a "you may" ability and
   * for a permanent paying to enter untapped (`cost` set, no `purpose`). `'ward'`: a resolving
   * "counter it unless its controller pays" ability (Ward, CR 702.21a) asks the controller of the
   * spell or ability it targets, who is `seat`: `source` is the ability on the stack, `subject` the
   * spell or ability that is countered unless they accept and pay `cost`. Asked only when `seat`
   * can pay; declining counters the subject. `cancel` is not a legal answer. `'counterUnlessPays'`:
   * the same for "Counter target spell unless its controller pays {3}": `source` is the spell
   * resolving, `seat` the controller of the target spell (`subject`), who may pay. `'search'`: "may
   * search" (CR 608.2d, 701.23): `seat` is the player who would search, who is not always the
   * controller of the spell or ability (`source`, "Its controller may search their library ...");
   * declining skips the whole search, put and shuffle. `'unlessPays'` (D-111, CR 118.12a): a resolving
   * "[do something] unless [that player] pays [cost]" asks the payer, who is `seat` and is not always the
   * controller of the ability (`source`, on the stack); declining lets the effect happen. Asked only
   * when `seat` can pay the whole cost; `subject` is absent. `'mayPay'` (D-120, CR 702.101a Extort): "you
   * may pay [cost]. If you do, [effect]": asked of the controller (`source`, on the stack) when they can pay
   * the whole cost; declining does nothing. `'cascade'` (D-120, CR 702.85a): "you may cast it without paying
   * its mana cost": `subject` is the exiled card (public), `source` the cascade ability on the stack. `'suspend'` (D-128, CR 702.62a): "you may
   * play it without paying its mana cost": `subject` is the suspended card (public), `source` the ability on the
   * stack; declining leaves it in exile. `'madness'` (CR 702.35a): "you may cast it by paying [its madness cost]":
   * `subject` is the card exiled by madness (public), `cost` its madness cost, `source` the ability on the stack;
   * declining puts the card into its owner's graveyard. `'miracleReveal'` (CR 702.94a, D-274): "you may reveal this card from your hand as you
   * draw it": asked of the player who drew it, who is `seat`, right after a card with miracle is drawn as the first card of their turn;
   * `subject` is the card (in the hand, hidden until the answer), `cost` its miracle cost, `source` the same card. Accepting reveals it (public)
   * and its trigger goes on the stack; declining reveals nothing. `'miracle'`: "you may cast it by paying [its miracle cost]": `subject` is
   * the card in the hand, `cost` its miracle cost, `source` the trigger on the stack; declining leaves the card in the hand.
   * `'castCard'` (D-350, CR 608.2g): "you may cast target instant or sorcery card from a graveyard": `subject` is the card (in a graveyard, public), `source` the ability on
   * the stack; declining leaves the card in its graveyard.
   */
  readonly purpose?:
    | 'kicker'
    | 'ward'
    | 'counterUnlessPays'
    | 'unlessPays'
    | 'mayPay'
    | 'search'
    | 'cascade'
    | 'suspend'
    | 'madness'
    | 'miracleReveal'
    | 'miracle'
    | 'gift'
    | 'costChoice'
    | 'pairReturn'
    | 'castCard';
  /**
   * For purpose `'pairReturn'` (D-272, "You may return those cards to the battlefield under their owners' control", Dawnbreak Reclaimer): the cards that would return, which are in
   * graveyards and public: `theirs` the card chosen in an opponent's graveyard (it returns under its owner's control, the opponent's), `mine` the card chosen in the graveyard of
   * the player asked (it returns under their control). Either is absent when no such card could be chosen. Accepting returns both, declining neither.
   */
  readonly pair?: { readonly theirs?: ObjectId; readonly mine?: ObjectId };
  /**
   * For purpose `'gift'` (D-135, CR 702.174a): "promise a gift to this opponent?" asked of the caster of a spell with Gift a card as it is
   * cast, after the kicker and replicate questions and before X and the targets (CR 601.2b). `source` is the spell on the
   * stack and `giftTo` the opponent the gift would go to: with several opponents each is offered in turn order until one is
   * accepted. Declining every offer casts the spell with no gift. `cancel` is a legal answer and rewinds the cast (CR 733).
   */
  readonly giftTo?: SeatId;
  /**
   * For purpose `'costChoice'` (D-181, CR 118.8, 601.2b): "As an additional cost to cast this spell, sacrifice an artifact or creature or pay {4}"
   * asks the caster which way to pay, after the kicker and replicate questions and the gift, before X and the targets. `source` is the spell on
   * the stack, `cost` the first option's costs and `otherCost` the second's: accepting pays the first, declining the second. Asked only when both
   * could be paid. `cancel` is a legal answer and rewinds the cast (CR 733).
   */
  readonly otherCost?: readonly Cost[];
  /**
   * For purpose `'unlessPays'` when the question is the one of an upkeep keyword (D-127): `'echo'` (CR 702.30a) or
   * `'cumulativeUpkeep'` (CR 702.24a; `cost` is the whole payment, the cost of the keyword for each age counter
   * the source now has). Declining sacrifices the source. Absent for every other question.
   */
  readonly upkeep?: 'echo' | 'cumulativeUpkeep';
  /**
   * For purposes `'ward'` and `'counterUnlessPays'`: the spell or ability countered unless the cost is paid; for
   * `'cascade'`: the card exiled that may be cast.
   */
  readonly subject?: ObjectId;
  /**
   * For a land card played from the hand that asks to pay to enter untapped (`cost` set, no
   * `purpose`, `source` in the hand): the face of the card being played, which is not 0 for the
   * back face of a modal double-faced card (CR 712.12). Absent for face 0 and for every other
   * question.
   */
  readonly face?: number;
}

/**
 * CR 614.12a, 614.1c (D-100): "As this enters, choose a creature type / a color": the controller of the
 * permanent that is about to enter chooses one of `options` before it enters. `purpose` says what is
 * chosen. `options` is the full list, in a fixed order that the legal actions follow: for
 * `'creatureType'` every creature type of CR 205.3m (spelled as `CREATURE_TYPES` lists them, "Time
 * Lord" included), for `'color'` the five colors as `W`, `U`, `B`, `R`, `G`. `source` is the object
 * about to enter: the card in a hand, in a zone an effect moves it from, or the spell on the stack that
 * is resolving; for a token (nothing exists yet) it is the spell or ability that creates it. `sourceName`
 * and `sourceOracleText` name what is entering. The answer is a `chooseOption` action; the question
 * cannot be taken back.
 */
export interface ChooseOptionDecision extends DecisionBase {
  readonly kind: 'chooseOption';
  readonly purpose:
    | 'creatureType'
    | 'color'
    | 'option'
    | 'attackTarget'
    | 'effect'
    | 'riot'
    | 'replacement'
    | 'vote'
    | 'meldOrder'
    | 'pile';
  readonly options: readonly string[];
  /**
   * For purpose `'replacement'` (D-191, CR 616.1): several prevention effects apply to one damage event and the order can change the
   * result, so the affected player (`seat`: the damaged player, or the controller of the damaged permanent) chooses which to apply
   * first; the question comes again while two or more still apply and the order still matters (CR 616.1f). `options` are the keys of the
   * effects, in the default order (so the first is the answer a fixed policy gives), `source` is the source of the damage and the answer
   * is a `chooseOption` action, which cannot be taken back: damage is not undone. Also (D-221, CR 616.1) two or more replacement effects of the
   * creation of tokens apply to the tokens a player would create and the order can change which tokens are made: `seat` is the player who would
   * create them, `source` the spell or ability that creates them, and `replacement.tokens` is set instead of `replacement.event`. Absent for the other
   * purposes.
   */
  readonly replacement?: ReplacementQuestion;
  /**
   * For purpose `'vote'` (D-194, CR 701.38a, "starting with you, each player votes for profit or security"): `seat` is the player who votes now,
   * `options` are the words of the card, in the order it gives them, and `source` is the spell or ability that resolves. `controller` is the
   * player who controls it (the vote started with them, and the effect is theirs), and `cast` the votes already made in this vote, in order: a vote
   * is public as it is cast, so a later voter sees the earlier ones. The answer is a `chooseOption` action and cannot be taken back. Absent for the
   * other purposes.
   */
  readonly vote?: VoteQuestion;
  /**
   * For purpose `'riot'` (D-185, CR 702.136a: "You may have this permanent enter with an additional +1/+1 counter on it. If you don't, it gains
   * haste"): `options` are `counter` (the additional +1/+1 counter) and `haste`, in that order, and `source` is the permanent about to enter (or,
   * for a token, the spell or ability that creates it). A permanent with several instances of riot (CR 702.136b) is asked once for each, and
   * `riotSoFar` holds the answers already given, so the question for the second instance carries the answer to the first. Absent for the other purposes.
   */
  readonly riotSoFar?: readonly string[];
  /**
   * For purpose `'effect'` (D-175, CR 608.2d, "create a Food token or a Treasure token"): `options` are the words of the instructions the
   * effect offers, in the order the text gives them, and `source` is the spell or ability that resolves. Nothing is entering.
   */
  /**
   * For purpose `'attackTarget'` (D-139, CR 508.7, "reselect which player or permanent a creature is attacking"): the attacking
   * creature, and the targets it could be made to attack, one for each of `options` in the same order (the option is
   * `player:<seat>` or `permanent:<object id>`). The creature's current target is one of them. Absent for the other purposes.
   */
  readonly attacker?: ObjectId;
  readonly attackTargets?: readonly AttackTarget[];
  /**
   * For purpose `'meldOrder'` (D-279, CR 712.21a, 712.21b): a melded permanent left the battlefield for a graveyard, a library or exile, and `seat`
   * arranges its two cards: their owner for a graveyard or a library (CR 712.21a), the player who exiled the permanent for exile (CR 712.21b). `options` are the names of the two cards (the cards of `first` and `second`, in that order, which are
   * the two new objects in `zone`) and the answer is a `chooseOption` of the one that goes on top of the graveyard or library, or, in exile, the one
   * that is exiled last (the later timestamp). Asked as state-based actions are next checked; the order is not revealed (CR 712.21a). `source` is `first`.
   */
  readonly meldOrder?: {
    readonly first: ObjectId;
    readonly second: ObjectId;
    readonly zone: 'graveyard' | 'library' | 'exile';
  };
  /**
   * For purpose `'pile'` (D-303, CR 700.3, "Put one pile into your hand and the other into your graveyard"): the two piles the separator made, and the player asked (`seat`)
   * chooses one. `options` are `pile1` and `pile2`, in that order; the pile chosen goes to `chosenTo` and the other to `otherTo`, both of `receiver` (the controller of the
   * effect, whose library the cards are in). The cards are public and still in the library. `separator` is who made the piles. Absent for the other purposes.
   */
  readonly piles?: {
    readonly first: readonly ObjectId[];
    readonly second: readonly ObjectId[];
    readonly chosenTo: 'hand' | 'graveyard';
    readonly otherTo: 'hand' | 'graveyard';
    readonly separator: SeatId;
    readonly receiver: SeatId;
  };
  readonly source: ObjectId;
  readonly sourceName: string;
  readonly sourceOracleText: string;
  /**
   * For a land card played from the hand (`source` in the hand): the face of the card being played, which
   * is not 0 for the back face of a modal double-faced card (CR 712.12). Absent for face 0 and for every
   * other question.
   */
  readonly face?: number;
}

/** What every choice of a replacement question has: the key of the effect and what it does. */
interface ReplacementChoiceBase {
  /** The key of the effect: one of the `options` of the decision, and what the answer is. */
  readonly option: string;
  /** What the effect does, in words ("Prevent the next 3 damage that would be dealt to you this turn"). */
  readonly text: string;
  /** The permanent whose ability it is, when it is one (a static ability); a shield made by a spell or ability names none. */
  readonly object?: ObjectId;
  readonly objectName?: string;
}

/** One effect the affected player may choose to apply first to a damage event (CR 616.1, D-191). */
export interface DamageReplacementChoice extends ReplacementChoiceBase {
  /** `prevent`: a shield or a static prevention; `redirect` (D-192, CR 614.9): the damage would be dealt to the permanent `object` instead. */
  readonly kind: 'prevent' | 'redirect';
  /** What happens to the damage if this effect is applied first and the rest follow the default order. */
  readonly outcome: {
    readonly to: DamageRecipient;
    /** The name of the permanent when `to` is one. */
    readonly toName?: string;
    /** What reaches the recipient from this point (0 when all of it is prevented). `to` is the recipient it ends with: not the one asked about when a redirection goes first. */
    readonly amount: number;
    /** What is prevented from this point. */
    readonly prevented: number;
  };
}

/**
 * One effect the player who would create tokens may choose to apply first (CR 616.1, D-221): "that many Dragons are created instead" or "those
 * tokens plus an additional Thopter are created instead" (`kind` is `'tokens'`).
 */
export interface TokenReplacementChoice extends ReplacementChoiceBase {
  readonly kind: 'tokens';
  /** The tokens that are created if this effect is applied first and the rest follow the default order. */
  readonly outcome: {
    /** One entry for each kind of token, "2 Dragon" (a count and the token's name). */
    readonly tokens: readonly string[];
    /** How many tokens that is in all. */
    readonly total: number;
  };
}

export type ReplacementChoice = DamageReplacementChoice | TokenReplacementChoice;

/**
 * Combat damage waiting for the answers of a replacement question (CR 510.2, D-191): all the damage of the step is simulated before
 * any is dealt, so the decision carries the plan. `assignments` is the whole batch, assigned (CR 510.1), and `answers` the keys
 * answered so far, in the order the questions came; the answer to this one is added and the batch is dealt again.
 */
export interface DamageResume {
  readonly step: 'firstStrike' | 'regular';
  readonly assignments: readonly DamageAssignment[];
  readonly answers: readonly string[];
}

/** One vote (CR 701.38a, D-194): the player who voted and the option they chose. */
export interface VoteCast {
  readonly seat: SeatId;
  readonly option: string;
}

/** The question of a `'vote'` choice (CR 701.38a, D-194): who controls the effect, and the votes already cast in it. */
export interface VoteQuestion {
  readonly controller: SeatId;
  readonly cast: readonly VoteCast[];
}

/** The question of a `'replacement'` choice: the damage event as it is now and the effects that can be applied first (CR 616.1, D-191). */
export interface DamageReplacementQuestion {
  readonly event: {
    readonly source: ObjectId;
    readonly sourceName: string;
    readonly to: DamageRecipient;
    /** The name of the permanent when the recipient is one (a player is "you" to the affected player). */
    readonly toName?: string;
    /** What is left of the damage at this point of the process. */
    readonly amount: number;
    readonly combat: boolean;
  };
  readonly choices: readonly DamageReplacementChoice[];
  readonly tokens?: undefined;
  /** Set when the damage is combat damage: the batch to deal again once the question is answered. Absent for damage from a spell or ability. */
  readonly resume?: DamageResume;
}

/**
 * The question of a `'replacement'` choice about the creation of tokens (CR 616.1, D-221): the tokens `creator` would create (the affected player:
 * who is asked) as they are now, and the effects that can be applied first.
 */
export interface TokenReplacementQuestion {
  readonly tokens: {
    readonly creator: SeatId;
    /** The tokens as they would be created now, "2 Treasure" (a count and the token's name), one entry for each kind. */
    readonly would: readonly string[];
  };
  readonly choices: readonly TokenReplacementChoice[];
  readonly event?: undefined;
  readonly resume?: undefined;
}

export type ReplacementQuestion = DamageReplacementQuestion | TokenReplacementQuestion;

/**
 * CR 107.3a, 601.2b, 602.2b (D-103): the controller of a spell or activated ability with an {X} in its
 * cost, or "pay X life", announces X as it is cast or activated, after the kicker question and before
 * the targets. `source` is the spell or ability on the stack, `sourceName` and `sourceOracleText` name
 * what it is. Every value from `min` (0) to `max` is legal: `max` is the largest X the controller could
 * pay for the whole cost, from every mana source and the pool, with commander tax, the kicker if paid,
 * additional costs and cost reductions counted. `perX` is what each point of X costs: `mana` generic mana
 * (one for each {X} of the mana cost, so {X}{X} is 2) and `life` ("pay X life"). Asked only when `max`
 * is at least 1; a spell that can pay no X at all, or has none to announce (cast without paying its mana
 * cost, CR 107.3b), has X = 0 and is not asked. The answer is a `chooseX` action; `cancel` is a legal
 * answer and rewinds the cast or activation (CR 733).
 */
export interface ChooseXDecision extends DecisionBase {
  readonly kind: 'chooseX';
  readonly source: ObjectId;
  readonly sourceName: string;
  readonly sourceOracleText: string;
  /**
   * 'spell' for a spell being cast, 'ability' for an activated ability being activated, 'multikicker' for
   * the number of times a spell's multikicker cost is paid (CR 702.33c, 601.2b, D-110: the same question
   * with a count for an answer, asked before X and the targets; `source` is the spell, `cost` the cost of
   * each time and `perX` is {mana: 0, life: 0}; `max` is the most times the whole cost could be paid), and
   * 'replicate' for the number of times its replicate cost is paid (CR 702.56a, D-129: the same, asked after the kicker
   * and before X and the targets).
   */
  readonly purpose: 'spell' | 'ability' | 'multikicker' | 'replicate' | 'payAnyAmount' | 'drawUpTo';
  readonly min: number;
  readonly max: number;
  readonly perX: { readonly mana: number; readonly life: number; readonly loyalty?: number };
  /** For `multikicker` and `replicate`: the cost paid each time. Absent for X. */
  readonly cost?: readonly Cost[];
}

/**
 * CR 601.2b, 602.2b, 603.3c, 700.2 (D-114): the controller of a modal spell, activated ability or
 * triggered ability chooses its modes as it is cast, activated or put on the stack, before the kicker,
 * X and the targets. `source` is the spell or ability on the stack, `sourceName` and `sourceOracleText`
 * name it (an ability's are its source's). `modes` lists every mode in printed order; `legal` is false
 * for one that is in no legal set (its targets cannot all be chosen, CR 700.2a, or the number to choose
 * cannot be reached without it). `min` and `max` are how many to choose (`max` already counts "if you
 * control a commander, choose both instead"); `sets` is every legal choice, each in printed order, fewest
 * modes first: the answer is a `chooseModes` action naming one of them (any order; a repeated mode is listed once for each time it is chosen). Asked only when more
 * than one set is legal; with exactly one the engine chooses it (the `modesChosen` event says so), and
 * with none the spell cannot be cast, the ability cannot be activated, and a triggered ability is
 * removed (CR 603.3c). `purpose` is 'spell', 'ability' (activated) or 'trigger'; `cancel` is legal for
 * the first two (it rewinds the cast or activation, CR 733) and not for a trigger (`forTrigger`).
 */
export interface ChooseModesDecision extends DecisionBase {
  readonly kind: 'chooseModes';
  readonly source: ObjectId;
  readonly sourceName: string;
  readonly sourceOracleText: string;
  readonly purpose: 'spell' | 'ability' | 'trigger';
  readonly modes: readonly {
    readonly index: number;
    readonly text: string;
    readonly legal: boolean;
  }[];
  readonly min: number;
  readonly max: number;
  /**
   * True when the text lets the same mode be chosen more than once (CR 700.2d, D-344): `sets` then holds multisets, a mode index repeated for each
   * instance, and `max` may be more than the number of modes. Absent otherwise.
   */
  readonly repeatable?: true;
  readonly sets: readonly (readonly number[])[];
  /** True for a triggered ability being put on the stack: it is not optional, so there is no `cancel`. */
  readonly forTrigger?: true;
}

/**
 * The cost-payment options of a spell being cast (CR 601.2f-h, D-116, D-120): "you may tap an untapped creature
 * you control rather than pay that mana" (Convoke, CR 702.51a), "an untapped artifact" (Improvise, CR 702.126a),
 * "exile a card from your graveyard" (Delve, CR 702.66a). Asked while the spell is being cast, after its targets
 * and before the mana is paid, for each of those keywords the spell has, in the order convoke, improvise,
 * delve, and only when at least one of the `candidates` could pay part of what is left of the cost. Answered
 * with `choosePayOptions`: the objects tapped (or exiled), none to pay everything in mana, at most `maxUsable`
 * of them, and every one must pay for a mana of `cost` (a creature of a color the cost has, or any creature
 * for generic mana). `cancel` takes the whole cast back (CR 733). Public: the objects are on the battlefield or
 * in the graveyard.
 */
export interface ChoosePayOptionsDecision extends DecisionBase {
  readonly kind: 'choosePayOptions';
  /** The spell being cast, on the stack. */
  readonly source: ObjectId;
  readonly mechanism: 'convoke' | 'improvise' | 'delve';
  /** The mana still to pay (CR 601.2f), as mana symbols, which these resources reduce. */
  readonly cost: readonly string[];
  /** The untapped creatures or artifacts, or the graveyard cards, that may be used, in object order. */
  readonly candidates: readonly ObjectId[];
  /**
   * Convoke only: the colors of each candidate (a colorless creature has none and pays generic mana only).
   * The other mechanisms pay generic mana only and leave it out.
   */
  readonly colors?: Readonly<Record<ObjectId, readonly Color[]>>;
  /** The most that can be used: no more than there are mana they could pay for. */
  readonly maxUsable: number;
  /**
   * A set of the candidates that, with the mana of the other sources, pays all that is left of the cost: the
   * fewest the payment planner needs (lands before creatures before artifacts), so an agent that wants to
   * keep some candidates can swap equivalent ones (same colors) into it and be sure to pay.
   */
  readonly suggested: readonly ObjectId[];
  /**
   * Answers that can be listed: `suggested`, and sets near it, each one leaving a cost the mana of the other
   * sources can pay. Any other set of candidates that pays for a different mana each and leaves a payable cost is
   * accepted too; one that leaves a cost that cannot be paid is refused.
   */
  readonly choices: readonly (readonly ObjectId[])[];
}

export type PendingDecision =
  | PriorityDecision
  | MulliganDecision
  | MulliganBottomDecision
  | TargetsDecision
  | PayManaDecision
  | DiscardDecision
  | CommanderZoneDecision
  | DeclareAttackersDecision
  | DeclareBlockersDecision
  | AssignDamageDecision
  | ChoosePermanentDecision
  | ChooseCardsDecision
  | ArrangeCardsDecision
  | OrderTriggersDecision
  | ConfirmOptionalDecision
  | ChooseOptionDecision
  | ChooseXDecision
  | ChooseModesDecision
  | ChoosePayOptionsDecision;

export type DecisionKind = PendingDecision['kind'];

/** A decision before the engine assigns its id. Omit distributes over the union. */
export type NewDecision = PendingDecision extends infer D
  ? D extends PendingDecision
    ? Omit<D, 'id'>
    : never
  : never;

export const DECISION_KINDS = [
  'priority',
  'mulligan',
  'mulliganBottom',
  'targets',
  'payMana',
  'discard',
  'commanderZone',
  'declareAttackers',
  'declareBlockers',
  'assignDamage',
  'choosePermanent',
  'chooseCards',
  'arrangeCards',
  'orderTriggers',
  'confirmOptional',
  'chooseOption',
  'chooseX',
  'chooseModes',
  'choosePayOptions',
] as const satisfies readonly DecisionKind[];

/** A UI or AI handler per kind. Exhaustive by construction (SPEC 4.2). */
export type DecisionHandlers<R> = {
  readonly [K in DecisionKind]: (d: Extract<PendingDecision, { kind: K }>) => R;
};

/** Apply the matching handler. A new kind without a handler fails to compile here. */
export function handleDecision<R>(d: PendingDecision, handlers: DecisionHandlers<R>): R {
  switch (d.kind) {
    case 'priority':
      return handlers.priority(d);
    case 'mulligan':
      return handlers.mulligan(d);
    case 'mulliganBottom':
      return handlers.mulliganBottom(d);
    case 'targets':
      return handlers.targets(d);
    case 'payMana':
      return handlers.payMana(d);
    case 'discard':
      return handlers.discard(d);
    case 'commanderZone':
      return handlers.commanderZone(d);
    case 'declareAttackers':
      return handlers.declareAttackers(d);
    case 'declareBlockers':
      return handlers.declareBlockers(d);
    case 'assignDamage':
      return handlers.assignDamage(d);
    case 'choosePermanent':
      return handlers.choosePermanent(d);
    case 'chooseCards':
      return handlers.chooseCards(d);
    case 'arrangeCards':
      return handlers.arrangeCards(d);
    case 'orderTriggers':
      return handlers.orderTriggers(d);
    case 'confirmOptional':
      return handlers.confirmOptional(d);
    case 'chooseOption':
      return handlers.chooseOption(d);
    case 'chooseX':
      return handlers.chooseX(d);
    case 'chooseModes':
      return handlers.chooseModes(d);
    case 'choosePayOptions':
      return handlers.choosePayOptions(d);
    default: {
      const unreachable: never = d;
      return unreachable;
    }
  }
}
