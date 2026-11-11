/**
 * Actions: the only way to change state is applyAction(state, seat, action) (SPEC 4.2).
 * An action answers the pending decision, or concedes. `getLegalActions` returns exactly the
 * actions the given seat may take now.
 */
import type { CastAlternativeKind } from '../ast/features';
import type { ObjectId, SeatId } from '../ids';
import type { ManaColor } from '../mana/types';
import type { ChosenTarget } from './chosen';
import type { AttackTarget, DamageAssignment } from './combat-types';

export type Action =
  /** Answer a priority decision with one of its options. */
  | { readonly kind: 'pass' }
  /** Play a land; `face` picks the face of a modal double-faced card (see PriorityOption). */
  | { readonly kind: 'playLand'; readonly object: ObjectId; readonly face?: number }
  /**
   * Cast a spell; `alternative: 'flashback'` casts it from the graveyard, `alternative: 'free'`
   * without paying its mana cost, `alternative: 'overload'` (and later 'evoke', 'dash': D-121) pays that
   * alternative cost instead of the mana cost, `face` picks the half, Adventure or modal face to cast (see
   * PriorityOption). A missing `face` is face 0.
   */
  | {
      readonly kind: 'castSpell';
      readonly object: ObjectId;
      readonly alternative?: CastAlternativeKind;
      readonly face?: number;
    }
  /** Activate an activated ability that is not a mana ability (CR 602.2): see PriorityOption. */
  | { readonly kind: 'activate'; readonly object: ObjectId; readonly abilityIndex: number }
  | {
      readonly kind: 'activateAbility';
      readonly source: ObjectId;
      readonly abilityIndex: number;
      readonly color: ManaColor | null;
      /** The combination chosen for a mana ability that makes one of several (D-099); `color` is null. */
      readonly combination?: readonly ManaColor[];
      /** The permanent a cost "Sacrifice a Spirit" gives up (D-222, CR 601.2b): named when the player has more than one to give up. */
      readonly sacrifice?: ObjectId;
    }
  /**
   * Suspend a card from the hand (CR 702.62a, 116.2f, D-128): pay its suspend cost and exile it with time counters.
   * A special action: it does not use the stack, and the player keeps priority. Paid with a `payMana` decision.
   */
  | { readonly kind: 'suspend'; readonly object: ObjectId }
  /**
   * Foretell a card from the hand (CR 702.143a, 116.2h, D-128): during your turn, pay {2} and exile it face down.
   * A special action. Paid with a `payMana` decision.
   */
  | { readonly kind: 'foretell'; readonly object: ObjectId }
  | { readonly kind: 'concede' }
  /** Answer a mulligan decision. */
  | { readonly kind: 'keepHand' }
  | { readonly kind: 'takeMulligan' }
  /** Answer mulliganBottom and discard decisions: the chosen cards. */
  | { readonly kind: 'chooseCards'; readonly objects: readonly ObjectId[] }
  /**
   * Answer an arrangeCards decision (CR 701.22, 701.25): every card looked at is placed exactly
   * once. `top` are the cards that go on top of the library, the first becoming the top card.
   * `other` are the rest: for a scry they go to the bottom in this order (the last becomes the
   * bottom card), for a surveil into the graveyard; a reorder has none.
   */
  | {
      readonly kind: 'arrangeCards';
      readonly top: readonly ObjectId[];
      readonly other: readonly ObjectId[];
    }
  /** Answer a targets decision: chosen targets per spec. */
  | { readonly kind: 'chooseTargets'; readonly targets: readonly ChosenTarget[] }
  /** Answer a payMana decision. `auto` uses the payment planner; `tap` lists the mana abilities to use. */
  | { readonly kind: 'payAuto' }
  | {
      readonly kind: 'payManual';
      readonly taps: readonly {
        readonly object: ObjectId;
        readonly abilityIndex: number;
        /** For a source that offers a choice of color (a Treasure, Command Tower). */
        readonly color?: ManaColor | null;
        /** For a source that makes one of several combinations of mana (a filter land, D-099). */
        readonly combination?: readonly ManaColor[] | null;
        /** For a source whose cost sacrifices another permanent ("Sacrifice a Spirit: Add {R}.", D-216): the one given up; the engine chooses when left out. */
        readonly sacrifice?: ObjectId;
      }[];
    }
  | { readonly kind: 'cancel' }
  /** Answer a commanderZone decision. */
  | { readonly kind: 'moveToCommandZone' }
  | { readonly kind: 'declineCommandZone' }
  /** Answer a choosePermanent decision: the chosen permanents (CR 608.2d). */
  | {
      readonly kind: 'choosePermanents';
      readonly objects: readonly ObjectId[];
      /** For a proliferate decision (CR 701.34a, D-149): the players chosen, besides the permanents in `objects`. */
      readonly players?: readonly SeatId[];
    }
  /**
   * Answer an orderTriggers decision (CR 603.3b): indices into `decision.triggers`, a permutation,
   * in the order they are put on the stack. The first is put on first, so it resolves last.
   */
  | { readonly kind: 'orderTriggers'; readonly order: readonly number[] }
  /** Answer a confirmOptional decision (CR 603.5). */
  | { readonly kind: 'acceptOptional' }
  | { readonly kind: 'declineOptional' }
  /**
   * Answer a chooseOption decision (CR 614.12a, D-100): one of its `options` (a creature type spelled
   * as in the decision, or a color letter W, U, B, R, G).
   */
  | { readonly kind: 'chooseOption'; readonly option: string }
  /**
   * Answer a chooseX decision (CR 107.3a, 601.2b, D-103): the value of X, from the decision's `min` to
   * its `max`.
   */
  | { readonly kind: 'chooseX'; readonly value: number }
  /**
   * Answer a chooseModes decision (CR 700.2, D-114): the indices of the modes chosen, one of the
   * decision's legal `sets` (in any order; they run in printed order).
   */
  | { readonly kind: 'chooseModes'; readonly modes: readonly number[] }
  /**
   * Answer a choosePayOptions decision (CR 601.2f-h, 702.51a, 702.126a, 702.66a, D-120): the creatures or
   * artifacts to tap, or the graveyard cards to exile, rather than pay mana. An empty list pays everything in
   * mana. Which mana each pays is worked out by the engine (colors first).
   */
  | { readonly kind: 'choosePayOptions'; readonly objects: readonly ObjectId[] }
  /** Answer declareAttackers: an empty list attacks with nothing. */
  | {
      readonly kind: 'declareAttackers';
      readonly attacks: readonly { readonly attacker: ObjectId; readonly target: AttackTarget }[];
    }
  /** Answer declareBlockers: an empty list blocks nothing. */
  | {
      readonly kind: 'declareBlockers';
      readonly blocks: readonly { readonly blocker: ObjectId; readonly attacker: ObjectId }[];
    }
  /** Answer assignDamage: how each listed creature divides its combat damage. */
  | { readonly kind: 'assignDamage'; readonly assignments: readonly DamageAssignment[] };
