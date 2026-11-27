/**
 * Actions: the only way to change state is applyAction(state, seat, action) (SPEC 4.2).
 * An action answers the pending decision, or concedes. `getLegalActions` returns exactly the
 * actions the given seat may take now.
 */
import type { CastAlternativeKind } from '../ast/features';
import type { CardType, PartyType } from '../characteristics';
import type { ObjectId, SeatId } from '../ids';
import type { ManaColor } from '../mana/types';
import type { ChosenTarget } from './chosen';
import type { AttackTarget, DamageAssignment } from './combat-types';

export type Action =
  /** Answer a priority decision with one of its options. */
  | { readonly kind: 'pass' }
  /** Play a land; `face` picks the face of a modal double-faced card (see PriorityOption). */
  | {
      readonly kind: 'playLand';
      readonly object: ObjectId;
      readonly face?: number;
      /** `playFromGraveyardEachType`: "land", the only slot a land card is played in; left out, the engine takes it. */
      readonly permanentType?: CardType;
    }
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
      /** The permanent type a card cast from the graveyard is counted as by `playFromGraveyardEachType`, when it has more than one free; left out, the engine chooses. */
      readonly permanentType?: CardType;
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
      /**
       * The colors of the additional mana that triggered mana abilities of "adds an additional one mana of any color" make as this one is activated, in the order of those abilities
       * (CR 605.1b, 106.1b, 605.3b): named when there is a choice to make, left out when the additional mana is of fixed types or there is none.
       */
      readonly extraColors?: readonly ManaColor[];
      /** The permanent a cost "Sacrifice a Spirit" gives up (D-222, CR 601.2b): named when the player has more than one to give up. */
      readonly sacrifice?: ObjectId;
      /** The permanent a cost "Tap an untapped creature you control" taps (D-625, CR 601.2b): named when the player has more than one to tap. */
      readonly tapped?: ObjectId;
      /**
       * The permanents a cost "Tap X untapped tokens you control" taps (CR 118.3, 602.2b, 605.3b): X of them, distinct, untapped and of the kind the cost names, chosen by the player as
       * the ability is activated. `combination` names X mana, one color of the five for each (X may be 0: both empty). Not listed in full among the priority options (see
       * `PriorityOption`): any play that is valid when it is made is accepted.
       */
      readonly tappedMany?: readonly ObjectId[];
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
  /**
   * Bring your companion into your hand (CR 116.2g, 702.139a): once per game, with priority and an empty stack in a main phase of your own turn, pay {3} (the payment
   * planner chooses the sources). A special action: it does not use the stack and nothing can be done in response; you keep priority.
   */
  | { readonly kind: 'bringCompanion' }
  /**
   * Plot a card from the hand (CR 702.170a-b, 116.2k): during your main phase with the stack empty, pay its plot cost and exile it; it becomes plotted. A special action. Paid with a
   * `payMana` decision.
   */
  | { readonly kind: 'plot'; readonly object: ObjectId }
  /**
   * Turn a face-down permanent you control face up (CR 116.2b, 701.40b, 708.8, D-310): a special action, any time you have priority, that does not use the stack. For a
   * manifested permanent it pays the mana cost of its card, with a `payMana` decision (purpose `turnFaceUp`), and is legal only when the card is a creature card with a
   * mana cost.
   */
  | { readonly kind: 'turnFaceUp'; readonly object: ObjectId }
  /**
   * Unlock a half of a Room you control (CR 709.5e, 116): a special action, taken any time you have priority and the stack is empty during a main phase of your turn. You pay the
   * mana cost of the locked half `door` (0 the left half, 1 the right half), with a `payMana` decision (purpose `unlockDoor`), and the permanent is given that unlocked designation.
   */
  | { readonly kind: 'unlockDoor'; readonly object: ObjectId; readonly door: number }
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
        /** For a land with "adds an additional one mana of any color" on it (CR 605.1b, 106.1b): the colors of the additional mana, as `manaSources` offers them. */
        readonly extraColors?: readonly ManaColor[] | null;
        /** For a source whose cost sacrifices another permanent ("Sacrifice a Spirit: Add {R}.", D-216): the one given up; the engine chooses when left out. */
        readonly sacrifice?: ObjectId;
        /** For a source whose cost taps another permanent ("{T}, Tap an untapped creature you control: Add one mana of any color.", D-625): the one tapped; the engine chooses when left out. */
        readonly tapped?: ObjectId;
        /** For a source whose cost taps X untapped permanents ("{T}, Pay 2 life, Tap X untapped tokens you control: Add X mana in any combination of colors."): the ones tapped; `combination` has one color for each. */
        readonly tappedMany?: readonly ObjectId[];
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
  /**
   * Answer a chooseParty decision (CR 700.8d): the party, one entry for each type filled (up to one each of Cleric, Rogue, Warrior and Wizard), each a different creature the
   * decision lists for that type. An empty list chooses no one.
   */
  | {
      readonly kind: 'chooseParty';
      readonly party: readonly { readonly type: PartyType; readonly object: ObjectId }[];
    }
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
