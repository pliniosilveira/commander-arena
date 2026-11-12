import type {
  AlternativeCost,
  Amount,
  Cost,
  Effect,
  ModeChoice,
  ObjectFilter,
  PlayerSelector,
  SpellMode,
  TargetSpec,
} from '@commander-arena/engine';
import type { IrAmount, Span } from '../ir/types';
import type { FeatureRef } from './features';

/** What lowering knows about the face an ability is on, and what it collects while reading. */
export interface LowerContext {
  /** 'spell' for the text of an instant or sorcery (`thisSpell`), 'ability' otherwise (`this`). */
  readonly owner: 'ability' | 'spell';
  readonly faceTypes: readonly string[];
  /** The face's subtypes ("Aura", "Equipment", "Elf"): what an attached static ability needs. */
  readonly faceSubtypes: readonly string[];
  /** The target declarations met so far, in order of appearance (t1, t2, ...). */
  readonly targets: TargetSpec[];
  /** True when an amount was X (the spell then needs {X} in its cost, CR 107.3). */
  usesX: boolean;
  /**
   * True when the permanent the ability is on is gone by the time the effect runs: a "dies"
   * trigger of `~` itself, or an ability whose cost sacrifices `~` (CR 400.7: it is a new object
   * in the graveyard). An effect that acts on `~` as a permanent (tap, untap, exile, return it to
   * its owner's hand) would find nothing, so it is not lowered.
   */
  selfGone: boolean;
  /**
   * True when "it" in the text of this ability is the object the ability belongs to: a triggered
   * ability whose every event is about `~` itself (stage P17: "for each time it was kicked" reads the
   * source's kicks). A spell sets nothing: in spell text "it" may be a target.
   */
  itIsSelf: boolean;
  /**
   * True in the body of "When you cast this spell" (stage P39, D-184): the ability of the spell itself, whose source is the spell on the stack. The
   * amount "the amount of mana spent to cast it" is read there only.
   */
  selfCast: boolean;
  /**
   * The ids of targets an earlier instruction of this text sent away from the battlefield (destroy,
   * exile, return, sacrifice): "it" after them is the card in its new zone, which a tap or an untap
   * cannot reach. Filled by `lowerSentences` as each clause is lowered.
   */
  readonly removed: Set<string>;
  /**
   * What "that player" means in the body of a triggered ability (stage P18, D-111), with the engine
   * features that reading needs: the controller of the spell that was cast (`controllerOf` the
   * triggering spell, CR 608.2h) for a cast trigger, "you" when the trigger is about you. Null when the
   * trigger names no player the engine can point at (an opponent who drew a card, the player whose turn
   * it is): "that player" is then not lowered.
   */
  thatPlayer: { readonly selector: PlayerSelector; readonly needs: readonly FeatureRef[] } | null;
  /**
   * "..., where X is the number of Zombies you control." (stage P28, CR 107.3c): while the clauses of that
   * sentence are lowered, an X in them is this amount, written into each slot that says X. `used` is set when a slot
   * read it, so a definition no slot reads is refused. Null where X is the announced X (D-103).
   */
  xIs: {
    readonly amount: IrAmount;
    used: boolean;
    /** The engine amount the definition stands for (stage P68, D-230): read by a target slot (`mana value X or less`), which cannot import the amounts. */
    readonly lower?: () => LowerResult<Amount>;
  } | null;
  /**
   * The id of the target that the last `exile`, `destroy` or `moveToZone` instruction of this text put onto the battlefield
   * (stage P30, D-135): after it "it" is a new object (CR 400.7), which the engine names as `moved`. Null otherwise.
   */
  movedOnto: string | null;
  /**
   * Whether an ability of the card itself may work from the graveyard (stage P30, D-135, CR 113.6b): only the lowering of an
   * ordinary activated ability sets it, and "Return this card from your graveyard to the battlefield" is lowered only then.
   */
  graveyardSource: boolean;
  /** Set when a lowering used `graveyardSource`: the ability functions from the graveyard. */
  usedGraveyardSource: boolean;
  /**
   * True when "it" in the body of a triggered ability is the card the permanent became (stage P30, D-135): every event of the
   * trigger is `~` dying or leaving the battlefield, so "exile it" and "put it into its owner's library" name `thisCard`.
   */
  itIsCard: boolean;
  /**
   * True while the total of a divided damage is lowered (stage P32, D-147, CR 601.2d): "..., where X is the greatest power among
   * creatures you control as you cast this spell" is read once, as the spell is cast, and only there.
   */
  readAsCast: boolean;
  /**
   * The filter of the creatures the last instruction made a token for ("For each creature your opponents control, create a 4/4 ... token",
   * stage P32, D-147): "those creatures" of the sentence after it. Null once any other instruction has been lowered.
   */
  createdPer: ObjectFilter | null;
  /** True once a sentence's definition of X was read by a slot: this text defines its own X (stage P28). */
  xDefined: boolean;
  /**
   * What an earlier instruction of this text exiled (stage P34, D-152): `top` the cards of the top of the library ("exile the top card of
   * your library", the cards "that card" and "those cards" name), `cast` the card found by exiling until a card is found (Discover, "the
   * discovered card"). Null before any. The engine's `moved` names them.
   */
  exiled: 'top' | 'cast' | null;
  /** True when the cards the last "exile the top ... cards" exiled were exiled face down (stage P41, D-188, CR 406.3): "you may look at and play those cards". */
  exiledFaceDown: boolean;
  /**
   * What "that many" counts (stage P34, D-152): the permanents the last instruction that sacrificed some sacrificed, or the cards the last
   * "discard any number of cards" discarded. The engine's `thisWay` names which.
   */
  thisWay: 'sacrificed' | 'discarded';
  /** True in the body of a triggered ability whose every event is life being gained (D-256, CR 119.9): `triggerDamage` is the life gained. */
  lifeGainTrigger: boolean;
  /**
   * What "it" and "that land" mean after a search (stage P36, D-178, CR 400.7j, 701.23): the reference of the noun the last search looked for, which
   * the engine's `moved` names (the cards that search put somewhere). Null before a search and after any other move, destroy or exile.
   */
  searched: string | null;
  /**
   * What "that token" and "it" mean after "create a 2/2 red Dwarf creature token" (stage P48, D-205, CR 111.2, 400.7j): the reference the binding pass gave the token
   * (`tk1`), which the engine's `moved` names for the instructions that follow, until another instruction moves or makes objects. Null before one token and after.
   */
  madeToken: string | null;
  /**
   * What "it" means in "If you do, return it to the battlefield ... at the beginning of the next end step" (stage P48, D-205, CR 603.7c, 400.7j): the reference of the
   * target the last instruction exiled, which the engine's `moved` names. Null before an exile of a target and after any other move, destroy or sacrifice.
   */
  exiledRef: string | null;
  /**
   * What "that creature" means after a sacrifice (stage P36, D-178, CR 603.12, 608.2h): the reference of the noun the last sacrifice of one chosen
   * permanent named, which the engine's `sacrificed` names. Null before a sacrifice of one.
   */
  sacrificedRef: string | null;
  /**
   * True when the text of the card puts its own name inside a quotation (stage P36, D-178): there `~` may be the card and not the permanent that
   * has the quoted ability, so an ability granted to a group is not read from it.
   */
  namedInQuotes: boolean;
  /**
   * The card's own name, or '' when it is not known: the text of a mode of a modal spell is shown to
   * the player with `~` replaced by it (stage P19).
   */
  readonly cardName: string;
  /**
   * The name the card gives itself in its text (D-911): the shortest of the names that normalization writes as `~` ("Ajani" for "Ajani, Strength of the Pride"),
   * or '' when it is not known (a context made for a quoted ability or a mode, where `~` is not the card). The name of a token that begins with the card's own
   * ("named Ajani's Pridemate") is written back from it.
   */
  selfName: string;
}

export function newContext(
  owner: 'ability' | 'spell',
  faceTypes: readonly string[],
  faceSubtypes: readonly string[] = [],
  cardName = '',
): LowerContext {
  return {
    owner,
    faceTypes,
    faceSubtypes,
    targets: [],
    usesX: false,
    selfGone: false,
    itIsSelf: false,
    selfCast: false,
    removed: new Set(),
    thatPlayer: null,
    xIs: null,
    xDefined: false,
    exiled: null,
    exiledFaceDown: false,
    thisWay: 'sacrificed',
    lifeGainTrigger: false,
    searched: null,
    sacrificedRef: null,
    madeToken: null,
    exiledRef: null,
    namedInQuotes: false,
    readAsCast: false,
    createdPer: null,
    movedOnto: null,
    graveyardSource: false,
    usedGraveyardSource: false,
    itIsCard: false,
    cardName,
    selfName: '',
  };
}

export interface LowerFailure {
  readonly ok: false;
  /**
   * The engine features that are missing. Empty only when the IR is valid and the engine could
   * run it but no lowering is written for it yet.
   */
  readonly needs: readonly FeatureRef[];
  /** The IR node the lowering stopped at. */
  readonly at: Span;
  /** The id of the rule that produced that node. */
  readonly rule: string;
}

export type LowerResult<T> =
  | { readonly ok: true; readonly value: T; readonly rule: string }
  | LowerFailure;

/** One lowering: the IR head it handles, what it needs from the engine, and how it builds. */
export interface Lowering<I, A> {
  /** A verb for clauses, a kind for abilities. */
  readonly head: string;
  /** The id reported when this lowering built the node (`mana.tap-add`). */
  readonly id: string;
  /** Every engine feature the produced node can use, checked before `lower` runs. */
  readonly needs: readonly FeatureRef[];
  /** True when `lower` reads `IrClause.duration`; a duration on any other verb is not lowered. */
  readonly takesDuration?: true;
  /**
   * True for an instruction that "you may" makes no choice of: a permission the player may use or not (stage P34, "You may play that card
   * this turn"). The clause is lowered as it is, whether or not its words were read as the optional "you may" of the sentence.
   */
  readonly acceptsOptional?: true;
  /**
   * True for an instruction that may carry its own test of an object ("put a +1/+1 counter on it if it's a creature", group 4 of the Vraska deck): the
   * clause is lowered without it and each effect is wrapped in the engine's `conditional` (CR 608.2c).
   */
  readonly takesObjectTest?: true;
  lower(node: I, ctx: LowerContext): LowerResult<A>;
}

/** The pieces of a spell's text one line yields; the lines of a face are joined by `finishSpell`. */
export interface SpellParts {
  readonly targets: readonly TargetSpec[];
  readonly effects: readonly Effect[];
  readonly x: boolean;
  /**
   * A modal spell (stage P19, CR 700.2): "Choose one —" and its modes. The spell has no effect or
   * targets of its own then (`targets` and `effects` are empty) and cannot share its text with another
   * line; `parseFaceText` refuses a face that does.
   */
  readonly modal?: { readonly modes: readonly SpellMode[]; readonly chooseModes: ModeChoice };
}

/**
 * What a line says about the cost of casting its card (stage P13): the face's `additionalCosts` and
 * `alternativeCosts`. They are fields of the face, not abilities, so a line that yields them is
 * neither an ability nor spell text; the lines of a face are joined by `parseFaceText`.
 */
export interface FaceCosts {
  readonly additionalCosts: readonly Cost[];
  readonly alternativeCosts: readonly AlternativeCost[];
  /** "Sacrifice an artifact or creature or pay {4}" (stage P38, D-182): the face's `additionalCostChoice`. */
  readonly additionalCostChoice?: readonly [readonly Cost[], readonly Cost[]];
}
