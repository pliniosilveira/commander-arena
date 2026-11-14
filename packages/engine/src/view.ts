/**
 * Hidden information (SPEC 4.2): `getView(state, seat)` returns only what that seat may know.
 * No opponent hand contents, no library order. The AI only ever receives views.
 */
import type {
  Cost,
  NamedAlternativeKind,
  ObjectFilter,
  PermanentAlternativeKind,
  Restriction,
  TokenDefinition,
} from './ast/types';
import type { CardLayout } from './cards/definition';
import type { CardType, Characteristics, Color, Subtype, Supertype } from './characteristics';
import type { ObjectId, SeatId } from './ids';
import type { ManaObject } from './mana/types';
import { activatedAbilitiesOf } from './rules/activate-legality';
import { alternativeCostsOf, castCostOf } from './rules/cast-cost';
import { type ControlEnd, controlEndOf, controllerOf } from './rules/control';
import { copiableValues } from './rules/copiable';
import { derive, oracleTextOf } from './rules/derive';
import { faceDownBy, faceDownLabel, withoutFaceDown } from './rules/face-down';
import { turnUpSymbols } from './rules/face-down-legality';
import { INHERENT_TEXT, inherentName } from './rules/inherent';
import { keywordsOf } from './rules/keywords';
import { loyaltyActivatedThisTurn } from './rules/loyalty';
import { isSummoningSick, wouldBeSummoningSick } from './rules/mana-engine';
import { manaValueOfCost } from './rules/mana-value';
import { cardsOf, commanderCardOf } from './rules/melded';
import { modalOfObject } from './rules/modes';
import { isPaired, partnerOf } from './rules/pairing';
import { regenerationShieldsOn } from './rules/regenerate';
import { ringBearerSeat } from './rules/ring-bearer';
import { finalChapterOf, isSaga } from './rules/saga';
import { objectOrLki, sourceInfo } from './rules/source-info';
import { foretellCostOf, isForetold, suspendOf } from './rules/special-legality';
import { landPlaysAllowed, topCardVisibleTo } from './rules/statics';
import type { ChosenTarget } from './state/chosen';
import type { AttackTarget } from './state/combat-types';
import type { PendingDecision } from './state/decisions';
import { definitionOf, getObject, printedCard } from './state/ops';
import type {
  ActivatedAbility,
  ChosenValues,
  FaceDownBy,
  GameObject,
  GameResult,
  GameState,
  PhaseId,
  StackAbility,
  StepId,
} from './state/types';

export interface ObjectView {
  readonly id: ObjectId;
  readonly owner: SeatId;
  readonly controller: SeatId;
  readonly zone: string;
  readonly name: string;
  readonly manaCost: readonly string[] | null;
  readonly supertypes: readonly Supertype[];
  readonly types: readonly CardType[];
  readonly subtypes: readonly Subtype[];
  readonly colors: readonly Color[];
  readonly power: number | null;
  readonly toughness: number | null;
  /** Printed rules text of the face that is up, for the preview panel (A19). Empty for vanilla cards. */
  readonly oracleText: string;
  readonly tapped: boolean;
  readonly damage: number;
  readonly counters: Readonly<Record<string, number>>;
  /** The level of a Class on the battlefield (CR 716.2, D-235): shown for a permanent that has a Class subtype or a level; 1 until a level is gained. Absent otherwise. */
  readonly level?: number;
  /** The monstrous designation of a permanent on the battlefield (CR 701.37b, D-445). Absent otherwise. */
  readonly monstrous?: true;
  readonly isCommander: boolean;
  readonly summoningSick: boolean;
  /**
   * For a permanent controlled by a player other than the one it entered under, because of a control-changing effect (D-189, CR 613.1b): when that
   * effect ends. `endOfTurn`, `endOfTurnOf` (the end of the next turn of that seat), `whileControlling` (for as long as that permanent is controlled by
   * the new controller) or `never` (no duration was stated). Public. Absent otherwise.
   */
  readonly controlEnds?: ControlEnd;
  /**
   * The player this creature is the Ring-bearer of (CR 701.54a, 701.54e, D-196): present while it is on the battlefield under that player's control
   * with the designation. Public. Absent otherwise.
   */
  readonly ringBearer?: SeatId;
  /**
   * The creature this one is paired with (CR 702.95b, D-286): the object it is linked to while the pair stands and both are on the battlefield
   * (`partnerOf`: never a stale link, never a creature that is phased out). A melded permanent is one object, so its id is the one of the permanent. Public.
   * Absent otherwise.
   */
  readonly pairedWith?: ObjectId;
  /**
   * True for a creature of a pair that stands while one of the two is phased out (CR 702.26b, 702.26d, D-286): it is still paired (phasing is not leaving the
   * battlefield, so CR 702.95e does not end the pair) but gives and gets nothing from the pair meanwhile, so `pairedWith` is absent. For both creatures, the phased-out
   * one included. Public. Absent otherwise.
   */
  readonly pairedPhasedOut?: true;
  /**
   * For a noncreature permanent on the battlefield that its controller has not controlled since
   * their most recent turn began (and that has no haste): it would be summoning sick if it became a
   * creature (CR 302.6), so a Vehicle that arrived this turn cannot attack even when crewed. Absent
   * otherwise, and for creatures, which have `summoningSick`.
   */
  readonly wouldBeSummoningSick?: true;
  /**
   * For a noncreature permanent on the battlefield with a printed power and toughness, a Vehicle
   * (CR 301.7a): what it has as soon as it becomes a creature (CR 301.7b), which `power` and
   * `toughness` (null while it is not a creature, CR 208.3) do not show. Absent otherwise.
   */
  readonly printedPt?: { readonly power: number; readonly toughness: number };
  readonly isToken: boolean;
  /** The token's original definition, also for its abilities on the stack. Absent face down. */
  readonly tokenDefinition?: TokenDefinition;
  /**
   * The printed loyalty of a planeswalker (CR 306.5a, D-200), wherever it is: a card in a hand or a graveyard has no counters, so `counters`
   * shows no number for it. On the battlefield the loyalty is the number of loyalty counters in `counters` (CR 306.5c). Absent when the object
   * is not a planeswalker.
   */
  readonly printedLoyalty?: number;
  /**
   * True for a permanent of which a loyalty ability was activated this turn (CR 606.3, D-200): no loyalty ability of it can be activated until the next
   * turn. Public, like the activation. Absent otherwise.
   */
  readonly loyaltyUsed?: true;
  /**
   * True for an emblem (CR 114, D-201): an object in a command zone with no characteristics but its abilities. `name` is "Emblem" and `oracleText` the text
   * of its abilities; it is not a token (`isToken` is false) and not a permanent. Absent for everything else.
   */
  readonly emblem?: true;
  /**
   * True for a copy of a spell on the stack (CR 707.10, D-129): a spell with no card of its own, which ceases to
   * exist when it leaves the stack (CR 707.10a) and becomes a token if it is a permanent spell and resolves (CR
   * 707.10f). `name`, `types`, `oracleText`, `targets`, `x`, `modes` and `kicked` are those it copied. Absent
   * otherwise.
   */
  readonly copy?: true;
  /** Keyword abilities the object currently has (CR 702). */
  readonly keywords: readonly string[];
  /**
   * What the object can't do or must do as the rules read it now (D-094): `cantBlock`,
   * `cantBeBlocked`, `attacksEachCombat`, `doesntUntap`, and `cantBeCountered` for a spell on the
   * stack. Public, since it is rules text and its effects. Absent when there are none.
   */
  readonly restrictions?: readonly Restriction[];
  /**
   * The land types of the object's landwalk abilities (CR 702.14): "Island" for islandwalk, or
   * "nonbasic" for nonbasic landwalk. Absent when it has none; `keywords` lists `landwalk` once.
   */
  readonly landwalks?: readonly string[];
  /** Loyalty or defense counters are in `counters`; a battle's protector is shown here (CR 310.11). */
  readonly protector: SeatId | null;
  /** SPEC 7.1: the support status, so the UI can badge unsupported cards. */
  readonly support: 'supported' | 'unsupported';
  readonly targets: readonly ChosenTarget[];
  /**
   * For a modal spell or ability on the stack whose modes were chosen (CR 700.2, D-114): the indices of the
   * modes, in printed order (the order they run in), into the `modes` of the spell's face or of `ability`.
   * Public. Absent for everything else.
   */
  readonly modes?: readonly number[];
  /** With `modes`: the text of every mode of the spell or ability in printed order, so `modes` can be worded. */
  readonly modeTexts?: readonly string[];
  /**
   * For a triggered ability on the stack: the object it belongs to (CR 603.3), which may have left
   * the battlefield. `name` and `oracleText` are then the source's, as it was (CR 113.7a). Absent
   * for every other object.
   */
  readonly abilitySource?: ObjectId;
  /**
   * For a triggered ability on the stack that reads the object whose event caused it ("that card":
   * `triggerSubject`, #44): that object, so a question about the ability can say which card it is
   * for when several of the same trigger are on the stack. Absent for every other object.
   */
  readonly triggerSubject?: ObjectId;
  /**
   * For a triggered or activated ability on the stack: the ability's own text in AST form (CR 113.7a,
   * 603.3: it exists on the stack independently of its source), so a player or the AI can read what
   * it does and what it targets even when the source's `oracleText` lists several abilities. Public,
   * since it is rules text. Absent for every other object.
   */
  readonly ability?: StackAbility;
  /**
   * The activated abilities that are not mana abilities (CR 602), with their index among the
   * object's derived abilities: the `abilityIndex` of an `activate` option. Public, since it is
   * rules text. Includes Cycling's expansion for a card with the keyword. Absent when there are none.
   */
  readonly activated?: readonly {
    readonly abilityIndex: number;
    readonly ability: ActivatedAbility;
  }[];
  /**
   * For an Aura or Equipment on the battlefield: the permanent it is attached to (CR 301.5a,
   * 303.4b). The UI draws it on or under that permanent. Absent when it is attached to nothing.
   */
  readonly attachedTo?: ObjectId;
  /**
   * For a permanent: the Auras and Equipment on the battlefield attached to it, oldest first. Absent
   * when there are none.
   */
  readonly attachments?: readonly ObjectId[];
  /**
   * For a permanent on the battlefield with regeneration shields (CR 701.19a, D-120): how many, each replacing
   * one destruction this turn. Public, like any continuous effect. Absent when it has none.
   */
  readonly regenerationShields?: number;
  /**
   * True for a spell on the stack that was kicked (CR 702.33d), and for a permanent that entered
   * from a kicked spell (it remembers, "if it was kicked"). Absent otherwise.
   */
  readonly kicked?: true;
  /**
   * How many times a spell with Multikicker was kicked (CR 702.33c), for a spell on the stack and for the
   * permanent that entered from it. Absent when it was not kicked, and for plain Kicker.
   */
  readonly kicks?: number;
  /**
   * How many times the replicate cost of a spell on the stack was paid (CR 702.56a, D-129); at least 1 when present.
   * Public, since it is a cost paid. Absent otherwise.
   */
  readonly replicated?: number;
  /**
   * True for a spell on the stack that was cast from the graveyard for its flashback cost (CR
   * 702.34a): it will be exiled when it leaves the stack. Absent otherwise.
   */
  readonly flashback?: true;
  /**
   * True for a spell on the stack that was cast without paying its mana cost (CR 118.9, D-095).
   * Absent otherwise.
   */
  readonly free?: true;
  /**
   * The named alternative cost a spell on the stack was cast for (D-121): 'overload' (its text says "each"
   * where it said "target"), 'evoke', 'dash' or 'spectacle'; and for a permanent that entered from an evoked
   * or dashed spell, that kind (it will be sacrificed, or returned). Absent otherwise.
   */
  readonly alternative?: NamedAlternativeKind | PermanentAlternativeKind;
  /**
   * For a card in a hand or a command zone whose front face lists named alternative costs (D-121:
   * overload, evoke, dash, D-124: spectacle): each one's kind and what it would cost now in mana symbols, after
   * commander tax and cost reductions, like `castCost`; for a card in its owner's graveyard, its escape cost
   * (with the number of other cards it exiles, `exile`). Whether it can be paid is the priority decision's: it
   * lists one cast option (`alternative` set) for each that can. Absent when the card has none.
   */
  readonly alternativeCosts?: readonly AlternativeCostView[];
  /**
   * For a card in a hand with Suspend or Foretell (D-128): the special actions it offers and what they cost now in
   * mana symbols: `suspend` pays its suspend cost to exile the card with `counters` time counters (CR 702.62a),
   * `foretell` pays {2} to exile it face down (CR 702.143a), and `cost` is the foretell cost to cast it from exile
   * later. Whether the action can be taken now is the priority decision's: it lists a `suspend` or `foretell` option
   * for each that can. Absent when the card has neither.
   */
  readonly specialActions?: readonly SpecialActionView[];
  /**
   * True for a spell on the stack cast as the effect of its suspend ability (CR 702.62a, D-128); the permanent a
   * creature spell becomes has `alternative: 'suspend'` (haste). Absent otherwise.
   */
  readonly suspended?: true;
  /**
   * For a card in exile that is suspended (CR 702.62b): the time counters are in `counters.time`. For a card in exile
   * that was foretold (CR 702.143a): `foretold` and `faceDown` are set, to its owner's view with the full card
   * (`name`, `oracleText`, ...) and `alternativeCosts` holding its foretell cost; to every other viewer the card is
   * only `faceDown`, `name` is "Face-down card" and nothing else is shown (the view has no characteristics for it).
   * `foretoldTurn` (the owner's view only) is the turn it was foretold in: it may be cast in a later turn.
   */
  readonly faceDown?: true;
  /**
   * For a face-down permanent on the battlefield or phased out (CR 708.2, 701.40a, D-308, D-312): `faceDown` is true and `name` is its label, "Face-down creature 2" (CR 708.6),
   * for every viewer; the characteristics are the ones it has face down (a 2/2 creature with no mana cost and no text, plus what later layers did to it). `faceDownBy` is
   * what made it face down (public: the effect that did it is). `isCommander` is false and `support` 'supported' for every viewer but its controller, `faces`, `layout` and
   * `meld` are absent: nothing of the card shows. Absent for a face-up object.
   */
  readonly faceDownBy?: FaceDownBy;
  /**
   * Only in the view of the player who controls a face-down permanent (CR 708.5: nobody else may look at it, even when it is phased out): the printed front face of the card it
   * represents, for the preview panel and for the decision whether to turn it face up. Absent for every other viewer and for a face-up object.
   */
  readonly hiddenFace?: FaceView;
  /**
   * Only in the view of the player who controls a face-down permanent that can be turned face up (CR 701.40b): the mana symbols turning it face up costs, which are the
   * mana cost of its card. Absent when the card is not a creature card or has no mana cost (it can never be turned face up), and for every other viewer. Whether the player can
   * pay it now is the priority decision's: it lists a `turnFaceUp` option when they can.
   */
  readonly turnFaceUpCost?: readonly string[];
  /**
   * Only in the view of the player who controls a face-down permanent that can be turned face up: what it would be the moment it was turned face up now, with everything that
   * applies to it as it is (counters, effects, other permanents' abilities): its power and toughness and its keyword abilities. For deciding whether to turn it up (the AI reads
   * it); absent for every other viewer and when the card can't be turned face up.
   */
  readonly ifFaceUp?: {
    readonly power: number | null;
    readonly toughness: number | null;
    readonly keywords: readonly string[];
  };
  readonly foretold?: true;
  readonly foretoldTurn?: number;
  /**
   * For a card in exile that an effect exiled face down (CR 406.3, D-187: "exile the top two cards of target opponent's library face down"), set both on
   * the view of the players who may look at it (with the whole card) and on the placeholder the others get. A card Hideaway exiled or a foretold card
   * has `faceDown` only.
   */
  readonly exiledFaceDown?: true;
  /**
   * The X announced for a spell or activated ability on the stack that has one (CR 107.3a, D-103):
   * "X is 3". Absent for everything else, and for a spell cast without paying its mana cost.
   */
  readonly x?: number;
  /**
   * What the permanent chose as it entered the battlefield (D-100): "As this enters, choose a creature type
   * / a color". Public, to both players. Absent when nothing was chosen, and for everything but a permanent.
   */
  readonly chosen?: ChosenValues;
  /**
   * For a card in a hand or a command zone with a mana cost: what casting its front face would cost
   * now in mana symbols, after commander tax and cost reductions (CR 601.2f, D-095): the cost the
   * engine would ask, not the printed one. Kicker, additional costs and alternative costs are not in
   * it. Absent for a land and outside those zones.
   */
  readonly castCost?: readonly string[];
  /**
   * The additional costs to cast the card's face that is up (CR 118.8, D-095), as its rules text
   * says: what the caster sacrifices or discards besides the mana. Public, like `oracleText`. Absent
   * when there are none, and for a permanent.
   */
  readonly additionalCosts?: readonly Cost[];
  /**
   * "Sacrifice an artifact or creature or pay {4}" (CR 118.8, D-181): the two ways the caster may pay an additional cost, as the card says them
   * (`CardFace.additionalCostChoice`); the caster is asked as the card is cast. Public, like `additionalCosts`. Absent when there is no such choice.
   */
  readonly additionalCostChoice?: readonly [readonly Cost[], readonly Cost[]];
  /**
   * For a card with more than one face (split, Adventure, double-faced: CR 709, 715, 712): the index
   * of the face that is up, which is 0 except for a spell on the stack cast as its second half, its
   * Adventure or its back face, and a double-faced permanent that is transformed or was played as
   * its back face. `name`, `types`, `manaCost`, `oracleText`, `keywords` and `activated` are those
   * of the characteristics the object has now: both halves combined for a split card outside the
   * stack (CR 709.4). Absent for a single-faced card and for a token.
   */
  readonly face?: number;
  /**
   * Every face of such a card, in definition order, for the preview panel and a face chooser: each
   * face's printed characteristics (name, mana cost, colors, type line, power, toughness, rules
   * text), whichever face is up. Absent when `face` is.
   */
  readonly faces?: readonly FaceView[];
  /**
   * The card's layout, for a card with more than one face: 'split', 'adventure', 'modal_dfc' or
   * 'transform'. Tells the UI how to word the faces ("Adventure", "back face") and what the
   * options `face` means. Absent when `face` is.
   */
  readonly layout?: CardLayout;
  /** D-277 (CR 701.42a, 712.4a): present on a melded permanent only: the two front faces it is made of and its mana value. See `MeldView`. */
  readonly meld?: MeldView;
  /**
   * True for a card in exile that resolved as an Adventure (CR 715.3d): its owner may cast it from
   * there. Absent otherwise.
   */
  readonly onAdventure?: true;
  /** CR 722.3a (D-214): the permanent has the designation "prepared" (its prepare spell waits in exile to be cast). Absent otherwise. */
  readonly prepared?: true;
  /** CR 722.3c (D-214): the copy of a prepare spell in exile, which the controller of the prepared permanent may cast. Absent otherwise. */
  readonly preparedSpell?: true;
  /**
   * For a Saga on the battlefield with chapter abilities: its final chapter number (CR 714.2d), so
   * the UI can show lore counters against it ("2 / 3"); the counters are `counters.lore`. Absent
   * otherwise.
   */
  readonly finalChapter?: number;
  /**
   * For a chapter ability of a Saga on the stack: the chapter number that was reached (CR 714.2b),
   * so the UI can name it "Chapter II" even when the ability covers several (CR 714.2c). Absent for
   * every other object.
   */
  readonly chapter?: number;
}

/** A special action of a card in a hand (`ObjectView.specialActions`, D-128). */
export interface SpecialActionView {
  readonly kind: 'suspend' | 'foretell';
  /** The mana the action costs now: the suspend cost, or {2} for foretell. */
  readonly cost: readonly string[];
  /** For suspend: how many time counters the card gets (N). */
  readonly counters?: number;
  /** For foretell: the foretell cost the card is cast for from exile later. */
  readonly castCost?: readonly string[];
}

/** A named alternative cost of a card in hand, or of a card with escape in a graveyard, and what it costs now (`ObjectView.alternativeCosts`, D-121, D-124). */
export interface AlternativeCostView {
  readonly kind: NamedAlternativeKind;
  readonly cost: readonly string[];
  /** For escape (D-124): how many other cards of the graveyard are exiled as part of the cost. */
  readonly exile?: number;
  /** For `tapPermanents` (D-149): how many untapped permanents of this filter are tapped as part of the cost. */
  readonly tap?: { readonly filter: ObjectFilter; readonly count: number };
}

/** One face of a multi-faced card, as printed: its name, cost, type line, rules text and values. */
export type FaceView = Characteristics;

/**
 * D-277 (CR 701.42a, 712.4a, 202.3c): what a melded permanent is made of. `components` are the printed front faces of the two cards that represent it, in
 * order (the commander's card first when one is), and `manaValue` its mana value, the sum of the mana values of those front faces. The characteristics of
 * the object itself (name, types, power, abilities, text) are those of the combined back face, as for any object (CR 712.8g).
 */
export interface MeldView {
  readonly components: readonly FaceView[];
  readonly manaValue: number;
}

export interface SeatView {
  readonly id: SeatId;
  readonly life: number;
  readonly poison: number;
  readonly handCount: number;
  readonly libraryCount: number;
  /** Only the viewing seat's own hand is listed. */
  readonly hand: readonly ObjectView[] | null;
  /**
   * The top card of this player's library, only in this player's own view and only while a permanent they
   * control says they may look at it (CR 401.5, D-125). Never in another viewer's view; absent otherwise,
   * and for an empty library.
   */
  readonly libraryTop?: ObjectView;
  readonly graveyard: readonly ObjectView[];
  readonly command: readonly ObjectView[];
  readonly manaPool: readonly ManaObject[];
  readonly hasLost: boolean;
  readonly mulligans: number;
  readonly landsPlayedThisTurn: number;
  /** How many lands this player can play in a turn now: 1 and what effects and permanents add (CR 305.2, D-125). */
  readonly landPlaysAllowed: number;
  /** The life this player has lost this turn (CR 119.3): what "if an opponent lost life this turn" reads (D-124). */
  readonly lifeLostThisTurn: number;
  /** How many spells this player has cast this turn (CR 601.2i; copies are not cast): what Storm counts (D-129). */
  readonly spellsCastThisTurn: number;
  readonly commanderTax: Readonly<Record<string, number>>;
  /**
   * How many times the Ring has tempted this player (CR 701.54c, D-196), which turns on the abilities of their emblem named The Ring (1: the legendary
   * Ring-bearer that evades greater power; 2: the loot; 3: the sacrifice of a blocker; 4: the life loss). Public. Absent until the first time.
   */
  readonly ringTempted?: number;
  /** This player has the city's blessing (CR 702.131c, D-264): public, kept for the rest of the game. Absent until they get it. */
  readonly citysBlessing?: true;
  /** The energy counters this player has (CR 107.14, D-209). Public. Absent until the first time. */
  readonly energy?: number;
}

export interface CombatView {
  readonly attackers: readonly {
    readonly object: ObjectId;
    readonly target: AttackTarget;
    /** Stays true even if every blocker left (CR 509.1h). */
    readonly blocked: boolean;
    readonly blockedBy: readonly ObjectId[];
  }[];
}

export interface GameView {
  readonly viewer: SeatId;
  readonly turn: number;
  readonly activeSeat: SeatId;
  readonly phase: PhaseId;
  readonly step: StepId;
  /**
   * Present (true) while a phase an effect added to the turn is going on (CR 500.8, D-356): `phase` says which kind it is, so the screen can tell an
   * additional beginning phase from the turn's own one. Absent in the turn's own phases.
   */
  readonly addedPhase?: true;
  /** The kind of the next phase an effect added to the turn that has not begun yet, when one waits (CR 500.8, D-356): what a pass at the end of this phase leads to. */
  readonly nextAddedPhase?: 'beginning' | 'combat';
  readonly prioritySeat: SeatId | null;
  readonly seats: readonly SeatView[];
  /** The monarch (CR 725.1, D-127): public. Null while nobody has the designation. */
  readonly monarch: SeatId | null;
  readonly battlefield: readonly ObjectView[];
  readonly exile: readonly ObjectView[];
  /** The permanents that are phased out (CR 702.26, D-234): treated as though they do not exist, but shown to the players. Absent when there are none. */
  readonly phasedOut?: readonly ObjectView[];
  readonly stack: readonly ObjectView[];
  /** Attackers and blockers are public information (CR 506). Null outside combat. */
  readonly combat: CombatView | null;
  /** The pending decision, only when it is the viewer's. */
  readonly pending: PendingDecision | null;
  readonly decidingSeat: SeatId | null;
  /**
   * The cards a pending `chooseCards` or `arrangeCards` decision of the viewer offers, in the
   * decision's order (the cards looked at, top first, for an arrangement). A search shows its
   * matching library cards to its searcher alone (CR 701.23a) and a scry or surveil the top of the
   * library to the one who looks (CR 701.22a, 701.25a); the library is no part of the view, so the
   * chooser reads them here. Absent for any other decision and for every other viewer.
   */
  readonly pendingCards?: readonly ObjectView[];
  /**
   * What the seat everyone else is waiting on is doing, when it is choosing or arranging cards: only
   * that a search, a discard, a put on top, a scry, a surveil or a reordering is in progress, and the
   * spell or ability behind it (public on the stack). Set for a viewer who is not the deciding seat.
   * It names no card and no zone.
   */
  readonly waitingOn?: {
    readonly seat: SeatId;
    readonly purpose:
      | 'search'
      | 'discard'
      | 'putOnTop'
      | 'exile'
      | 'move'
      | 'lookTake'
      | 'lookSplit'
      | 'separate'
      | 'pile'
      | 'behold'
      | 'reveal'
      | 'split'
      | 'copy'
      | 'pair'
      | 'cast'
      | 'scry'
      | 'surveil'
      | 'reorder'
      | 'bottom';
    readonly sourceName: string;
  };
  readonly commanderDamage: Readonly<Record<string, number>>;
  readonly result: GameResult | null;
}

/** `castCost` and `additionalCosts` of a card that is not a permanent (see `ObjectView`). */
function castCostFields(
  state: GameState,
  obj: GameObject,
): {
  castCost?: readonly string[];
  additionalCosts?: readonly Cost[];
  additionalCostChoice?: readonly [readonly Cost[], readonly Cost[]];
  alternativeCosts?: readonly AlternativeCostView[];
} {
  if (obj.card === null || obj.zone === 'battlefield') return {};
  const castCost = castCostOf(state, obj);
  const face = definitionOf(state, obj.card).faces[obj.face];
  const additional = face?.additionalCosts;
  const choice = face?.additionalCostChoice;
  const alternatives = alternativeCostsOf(state, obj);
  return {
    ...(castCost === null ? {} : { castCost }),
    ...(alternatives.length === 0 ? {} : { alternativeCosts: alternatives }),
    ...(additional === undefined ? {} : { additionalCosts: additional }),
    ...(choice === undefined ? {} : { additionalCostChoice: choice }),
  };
}

/**
 * What a viewer who may not look at a face-down foretold card (CR 702.143a: only its owner may) is shown of it:
 * that a card is in exile and whose it is, and nothing else.
 */
function controlEndsOf(state: GameState, obj: GameObject): { controlEnds?: ControlEnd } {
  const ends = controlEndOf(state, obj);
  return ends === undefined ? {} : { controlEnds: ends };
}

function faceDownView(state: GameState, obj: GameObject): ObjectView {
  return {
    id: obj.id,
    owner: obj.owner,
    controller: controllerOf(state, obj),
    zone: obj.zone,
    name: 'Face-down card',
    manaCost: null,
    supertypes: [],
    types: [],
    subtypes: [],
    colors: [],
    power: null,
    toughness: null,
    oracleText: '',
    tapped: false,
    damage: 0,
    counters: {},
    isCommander: false,
    summoningSick: false,
    isToken: false,
    keywords: [],
    protector: null,
    support: 'supported',
    targets: [],
    faceDown: true,
    ...(obj.exiledFaceDown === true ? { exiledFaceDown: true as const } : {}),
  };
}

/** The player who may look at a card Hideaway exiled (CR 702.75a, D-145): the controller of the permanent that exiled it, while it is still there. */
function hideawayLooker(state: GameState, obj: GameObject): SeatId | null {
  const source = obj.hideaway === undefined ? undefined : state.objects[obj.hideaway];
  return source?.zone === 'battlefield' ? controllerOf(state, source) : null;
}

/**
 * True when `viewer` may not look at the card `obj` in exile (it is shown as "Face-down card"): a foretold card is known to its owner alone
 * (CR 702.143a, D-128), and a card Hideaway exiled face down may be looked at only by the player who controls the permanent that exiled it, for
 * as long as that permanent is on the battlefield; nobody else, and nobody once it left (CR 702.75a, D-145). `determinize` reads it too.
 */
export function isFaceDownTo(state: GameState, obj: GameObject, viewer: SeatId): boolean {
  if (isForetold(obj) && obj.owner !== viewer) return true;
  // CR 406.3 (D-187): a card an effect exiled face down can be examined only by the players that effect allowed to look at it.
  if (obj.exiledFaceDown === true && obj.lookers?.includes(viewer) !== true) return true;
  return obj.hideaway !== undefined && hideawayLooker(state, obj) !== viewer;
}

/** The special actions of a card in a hand (`ObjectView.specialActions`). */
function specialActionFields(
  state: GameState,
  obj: GameObject,
): { specialActions?: readonly SpecialActionView[] } {
  if (obj.zone !== 'hand' || obj.card === null) return {};
  const face = definitionOf(state, obj.card).faces[0] ?? null;
  const suspend = suspendOf(face);
  const foretell = foretellCostOf(face);
  const actions: SpecialActionView[] = [];
  if (suspend !== null) {
    actions.push({
      kind: 'suspend',
      cost: suspend.cost.flatMap((c) => (c.kind === 'mana' ? [...c.symbols] : [])),
      counters: suspend.count,
    });
  }
  if (foretell !== null) {
    actions.push({
      kind: 'foretell',
      cost: ['2'],
      castCost: foretell.flatMap((c) => (c.kind === 'mana' ? [...c.symbols] : [])),
    });
  }
  return actions.length === 0 ? {} : { specialActions: actions };
}

/** `viewer` is the seat looking; a card face down in exile is shown in full only to its owner (D-128). */
function objectView(state: GameState, id: ObjectId, viewer: SeatId): ObjectView {
  const obj = getObject(state, id);
  if (isFaceDownTo(state, obj, viewer)) return faceDownView(state, obj);
  const d = derive(state, obj);
  const shown = printedCard(obj);
  const def = shown === null ? null : definitionOf(state, shown);
  // An ability on the stack is shown under its source's name and text (CR 113.7a).
  const abilitySource = obj.stack?.kind === 'ability' ? obj.stack.source : null;
  const origin = abilitySource === null ? null : sourceInfo(state, abilitySource);
  // CR 725.2, 701.54c (D-127, D-196): the abilities of the monarch and of the Ring have no source; they are shown as "The monarch" or
  // "The Ring" with the rule's text.
  const inherentShown = obj.stack?.inherent === undefined ? null : inherentName(obj.stack.inherent);
  const inherentText = obj.stack?.inherent === undefined ? null : INHERENT_TEXT[obj.stack.inherent];
  const bearerSeat = ringBearerSeat(state, obj);
  const partner = partnerOf(state, obj);
  const activated = activatedAbilitiesOf(state, obj);
  const landwalks = d.abilities.flatMap((a) =>
    a.kind === 'keyword' && a.keyword.kind === 'landwalk' ? [a.keyword.landType] : [],
  );
  // CR 708.2, 708.5 (D-312): a face-down permanent is shown to every viewer as what it is face down; only the player who controls it (also while it is phased out) sees the
  // card behind it. Everything that comes from the card instead of the characteristics (the commander status, the support badge, the faces) is left out for the others.
  const down = faceDownBy(obj);
  const tokenSource = abilitySource === null ? obj : objectOrLki(state, abilitySource);
  const token =
    down === null &&
    tokenSource !== null &&
    tokenSource.emblem !== true &&
    faceDownBy(tokenSource) === null
      ? tokenSource.token
      : null;
  const controls =
    down !== null &&
    (obj.zone === 'phased'
      ? controllerOf(state, { ...obj, zone: 'battlefield' })
      : controllerOf(state, obj)) === viewer;
  const hiddenFront =
    controls && obj.card !== null ? definitionOf(state, obj.card).faces[0] : undefined;
  const turnUp = controls ? turnUpSymbols(state, obj) : null;
  const upNow = turnUp === null ? null : withoutFaceDown(obj);
  const upDerived = upNow === null ? null : derive(state, upNow);
  // CR 301.7a, 302.6: what a permanent that is not a creature (yet) would have as one.
  const asCreature = obj.zone === 'battlefield' && !d.types.includes('creature');
  const printed = asCreature ? copiableValues(state, obj).characteristics : null;
  return {
    id,
    owner: obj.owner,
    controller: controllerOf(state, obj),
    zone: obj.zone,
    name: inherentShown ?? origin?.name ?? faceDownLabel(obj) ?? d.name,
    manaCost: d.manaCost,
    supertypes: d.supertypes,
    types: d.types,
    subtypes: d.subtypes,
    colors: d.colors,
    power: d.power,
    toughness: d.toughness,
    oracleText: inherentText ?? origin?.oracleText ?? oracleTextOf(state, obj),
    tapped: obj.tapped,
    damage: obj.damage,
    counters: obj.counters,
    ...(obj.zone === 'battlefield' && (obj.level !== undefined || d.subtypes.includes('Class'))
      ? { level: obj.level ?? 1 }
      : {}),
    ...(obj.zone === 'battlefield' && obj.monstrous === true ? { monstrous: true as const } : {}),
    isCommander: (down === null || controls) && commanderCardOf(state, obj) !== null,
    summoningSick: obj.zone === 'battlefield' && isSummoningSick(state, obj),
    ...controlEndsOf(state, obj),
    ...(bearerSeat === null ? {} : { ringBearer: bearerSeat }),
    ...(partner === null ? {} : { pairedWith: partner.id }),
    ...(partner === null && isPaired(state, obj) ? { pairedPhasedOut: true as const } : {}),
    ...(asCreature && wouldBeSummoningSick(state, obj)
      ? { wouldBeSummoningSick: true as const }
      : {}),
    ...(typeof printed?.power === 'number' && typeof printed.toughness === 'number'
      ? { printedPt: { power: printed.power, toughness: printed.toughness } }
      : {}),
    isToken: obj.token !== null && obj.emblem !== true,
    ...(token === null
      ? {}
      : { tokenDefinition: { ...token.characteristics, abilities: token.abilities } }),
    ...(obj.emblem === true ? { emblem: true as const } : {}),
    ...(d.loyalty !== null && d.types.includes('planeswalker')
      ? { printedLoyalty: d.loyalty }
      : {}),
    ...(obj.zone === 'battlefield' && loyaltyActivatedThisTurn(state, obj.id)
      ? { loyaltyUsed: true as const }
      : {}),
    ...(obj.copyOf === undefined ? {} : { copy: true as const }),
    keywords: keywordsOf(state, obj),
    ...(d.restrictions.length === 0 ? {} : { restrictions: d.restrictions }),
    ...(landwalks.length === 0 ? {} : { landwalks }),
    protector: obj.protector,
    // D-277: a melded permanent is unsupported when either of its two cards is.
    support:
      (down === null || controls) &&
      cardsOf(obj).some((c) => definitionOf(state, c).support === 'unsupported')
        ? 'unsupported'
        : down === null || controls
          ? (def?.support ?? 'supported')
          : 'supported',
    ...(down === null ? {} : { faceDown: true as const, faceDownBy: down }),
    ...(hiddenFront === undefined
      ? {}
      : (({ abilities: _abilities, spell: _spell, ...printed }) => ({ hiddenFace: printed }))(
          hiddenFront,
        )),
    ...(turnUp === null ? {} : { turnFaceUpCost: turnUp }),
    ...(upNow === null || upDerived === null
      ? {}
      : {
          ifFaceUp: {
            power: upDerived.power,
            toughness: upDerived.toughness,
            keywords: keywordsOf(state, upNow),
          },
        }),
    targets: obj.stack?.chosenTargets ?? [],
    ...(abilitySource === null ? {} : { abilitySource }),
    ...(obj.stack?.kind === 'ability' && obj.stack.triggerSubject !== undefined
      ? { triggerSubject: obj.stack.triggerSubject }
      : {}),
    ...(obj.stack?.kind === 'ability' && obj.stack.ability !== null
      ? { ability: obj.stack.ability }
      : {}),
    ...(activated.length === 0 ? {} : { activated }),
    ...(d.attachedTo === null ? {} : { attachedTo: d.attachedTo }),
    ...(d.attachments.length === 0 ? {} : { attachments: d.attachments }),
    ...(obj.zone === 'battlefield' && regenerationShieldsOn(state, id) > 0
      ? { regenerationShields: regenerationShieldsOn(state, id) }
      : {}),
    ...(obj.stack?.kicked === true || obj.kicked === true ? { kicked: true as const } : {}),
    ...((obj.stack?.kicks ?? obj.kicks) === undefined
      ? {}
      : { kicks: obj.stack?.kicks ?? obj.kicks }),
    ...(obj.stack?.replicated === undefined ? {} : { replicated: obj.stack.replicated }),
    ...(obj.stack?.flashback === true ? { flashback: true as const } : {}),
    ...(obj.stack?.free === true ? { free: true as const } : {}),
    ...((obj.stack?.alt ?? obj.alt) === undefined
      ? {}
      : { alternative: obj.stack?.alt ?? obj.alt }),
    ...(obj.stack?.suspended === true ? { suspended: true as const } : {}),
    ...(isForetold(obj)
      ? { faceDown: true as const, foretold: true as const, foretoldTurn: obj.foretoldTurn }
      : {}),
    ...(obj.hideaway === undefined && obj.exiledFaceDown !== true
      ? {}
      : { faceDown: true as const }),
    ...(obj.exiledFaceDown === true ? { exiledFaceDown: true as const } : {}),
    ...specialActionFields(state, obj),
    ...(obj.stack?.x == null ? {} : { x: obj.stack.x }),
    ...(obj.stack == null || obj.stack.chosenModes.length === 0
      ? {}
      : {
          modes: obj.stack.chosenModes,
          modeTexts: (modalOfObject(obj, def?.faces[obj.face]?.spell)?.modes ?? []).map(
            (m) => m.text,
          ),
        }),
    ...(obj.chosen === undefined ? {} : { chosen: obj.chosen }),
    ...castCostFields(state, obj),
    // CR 712.4b, 712.8a (D-277): the combined back face of a meld card is only the characteristics of a melded permanent, so a meld card is not shown
    // as a card with two faces; the melded permanent says what it is made of (`meld`).
    ...(down === null && def !== null && def.faces.length > 1 && def.layout !== 'meld'
      ? {
          face: obj.face,
          layout: def.layout,
          faces: def.faces.map(({ abilities: _abilities, spell: _spell, ...printed }) => printed),
        }
      : {}),
    ...(obj.meldedWith === undefined || obj.card === null
      ? {}
      : {
          meld: {
            components: cardsOf(obj).flatMap((card) => {
              const front = definitionOf(state, card).faces[0];
              if (front === undefined) return [];
              const { abilities: _abilities, spell: _spell, ...printed } = front;
              return [printed];
            }),
            manaValue: manaValueOfCost(d.manaCost, obj),
          },
        }),
    ...(obj.onAdventure === true ? { onAdventure: true as const } : {}),
    ...(obj.prepared === true ? { prepared: true as const } : {}),
    ...(obj.prepareOf !== undefined ? { preparedSpell: true as const } : {}),
    ...(obj.zone === 'battlefield' && isSaga(d.subtypes) && finalChapterOf(d.abilities) > 0
      ? { finalChapter: finalChapterOf(d.abilities) }
      : {}),
    ...(obj.stack?.chapter === undefined ? {} : { chapter: obj.stack.chapter }),
  };
}

/** The name of a spell on the stack, or of the permanent a triggered ability on it belongs to. */
function stackObjectName(state: GameState, id: ObjectId): string {
  const obj = state.objects[id];
  const origin = obj?.stack?.kind === 'ability' ? obj.stack.source : id;
  if (obj?.stack?.inherent !== undefined) return inherentName(obj.stack.inherent);
  return origin === null ? '' : (sourceInfo(state, origin)?.name ?? '');
}

function combatView(state: GameState): CombatView | null {
  const combat = state.combat;
  if (!combat) return null;
  return {
    attackers: combat.attackers
      .filter((a) => state.objects[a.object]?.zone === 'battlefield')
      .map((a) => ({
        object: a.object,
        target: a.target,
        blocked: a.blocked,
        blockedBy: combat.blocks
          .filter(
            (b) => b.attacker === a.object && state.objects[b.blocker]?.zone === 'battlefield',
          )
          .map((b) => b.blocker),
      })),
  };
}

export function getView(state: GameState, viewer: SeatId): GameView {
  const seats: SeatView[] = state.seats.map((s) => {
    // CR 401.5: only the player who may look sees it.
    const top = s.id === viewer ? topCardVisibleTo(state, s.id) : null;
    return {
      id: s.id,
      life: s.life,
      poison: s.poison,
      handCount: s.hand.length,
      libraryCount: s.library.length,
      hand: s.id === viewer ? s.hand.map((id) => objectView(state, id, viewer)) : null,
      ...(top === null ? {} : { libraryTop: objectView(state, top, viewer) }),
      graveyard: s.graveyard.map((id) => objectView(state, id, viewer)),
      command: s.command.map((id) => objectView(state, id, viewer)),
      manaPool: s.manaPool,
      hasLost: s.hasLost,
      mulligans: s.mulligans,
      landsPlayedThisTurn: s.landsPlayedThisTurn,
      landPlaysAllowed: landPlaysAllowed(state, s.id),
      lifeLostThisTurn: s.lifeLostThisTurn,
      spellsCastThisTurn: s.spellsCastThisTurn,
      commanderTax: Object.fromEntries(
        s.commanders.map((c) => [c, 2 * (state.commanderCasts[c] ?? 0)]),
      ),
      ...(s.ring === undefined ? {} : { ringTempted: s.ring.tempted }),
      ...(s.citysBlessing === true ? { citysBlessing: true as const } : {}),
      ...(s.energy === undefined ? {} : { energy: s.energy }),
    };
  });
  const pending = state.pending;
  // A decision that shows its cards to its seat alone: a choice of cards, or an arrangement.
  const choosing =
    pending?.kind === 'chooseCards'
      ? {
          seat: pending.seat,
          source: pending.source,
          purpose: pending.purpose,
          cards: pending.legal,
        }
      : pending?.kind === 'arrangeCards'
        ? {
            seat: pending.seat,
            source: pending.source,
            purpose: pending.purpose,
            cards: pending.cards,
          }
        : // CR 700.3 (D-303): both piles of the cards revealed, which are still in a library, to the player who chooses between them.
          pending?.kind === 'chooseOption' &&
            pending.purpose === 'pile' &&
            pending.piles !== undefined
          ? {
              seat: pending.seat,
              source: pending.source,
              purpose: 'pile' as const,
              cards: [...pending.piles.first, ...pending.piles.second],
            }
          : null;
  return {
    viewer,
    turn: state.turn.number,
    activeSeat: state.turn.activeSeat,
    phase: state.turn.phase,
    step: state.turn.step,
    ...(state.turn.addedAfter === undefined ? {} : { addedPhase: true as const }),
    ...(state.turn.addedPhases?.[0] === undefined
      ? {}
      : { nextAddedPhase: state.turn.addedPhases[0].phase }),
    prioritySeat: state.turn.prioritySeat,
    seats,
    monarch: state.monarch,
    battlefield: state.battlefield.map((id) => objectView(state, id, viewer)),
    exile: state.exile.map((id) => objectView(state, id, viewer)),
    ...((state.phased ?? []).length === 0
      ? {}
      : { phasedOut: (state.phased ?? []).map((id) => objectView(state, id, viewer)) }),
    stack: state.stack.map((id) => objectView(state, id, viewer)),
    combat: combatView(state),
    pending: pending !== null && pending.seat === viewer ? pending : null,
    decidingSeat: pending?.seat ?? null,
    ...(choosing !== null && choosing.seat === viewer
      ? { pendingCards: choosing.cards.map((id) => objectView(state, id, viewer)) }
      : {}),
    ...(choosing !== null && choosing.seat !== viewer
      ? {
          waitingOn: {
            seat: choosing.seat,
            purpose: choosing.purpose,
            sourceName: stackObjectName(state, choosing.source),
          },
        }
      : {}),
    commanderDamage: state.commanderDamage,
    result: state.result,
  };
}
