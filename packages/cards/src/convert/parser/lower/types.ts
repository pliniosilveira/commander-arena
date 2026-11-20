import type {
  Ability,
  AlternativeCost,
  Amount,
  Cost,
  Effect,
  ModeChoice,
  ObjectFilter,
  ObjectSelector,
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
   * True in the body of "When ~ enters, ..." (every event of the trigger is the permanent itself entering, Hylda group 3, CR 107.3m): an X there is the X of the spell the
   * permanent came from (the engine's `enteredX`), which `validateCard` checks against the {X} of the card's mana cost; it does not make the ability read an announced X.
   */
  entersX: boolean;
  /**
   * True when the permanent the ability is on is gone by the time the effect runs: a "dies"
   * trigger of `~` itself, or an ability whose cost sacrifices `~` (CR 400.7: it is a new object
   * in the graveyard). An effect that acts on `~` as a permanent (tap, untap, exile, return it to
   * its owner's hand) would find nothing, so it is not lowered.
   */
  selfGone: boolean;
  /**
   * D-583 (CR 602.2b, 701.21a): the kind of permanent ("artifact", or "" for none that a word names) the cost of this activated ability sacrifices one or more of, or null when
   * its cost has no such sacrifice. "For each artifact sacrificed this way" in its text counts them (the engine's `sacrificedAsCost`), where no earlier instruction sacrificed.
   */
  costSacrifice: string | null;
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
   * True in the body of "Whenever you cast an instant or sorcery spell" (issue 25): every event of the trigger is a spell being cast (not a copy, not the
   * spell itself), so "that spell" is the spell that caused the trigger, which the engine reads as its `triggerSubject` (CR 601.2h).
   */
  castTrigger: boolean;
  /** The triggers are all "whenever you cast a spell with {X} in its mana cost": an X in the body is the X of that spell (Quandrix Unlimited group E, CR 107.3). */
  castTriggerX: boolean;
  /** The triggers are all "When you cycle this card": an X in the body is the X announced for the cycling cost (issue 81, Shark Typhoon, CR 702.29a, 107.3). */
  cycleTriggerX: boolean;
  /** The one intervening "if" of the triggered ability is "if you gained life this turn" (CR 603.4): "that many" in its body is the life gained this turn (Lathiel). */
  lifeGainedIf: boolean;
  /** One of the events of the trigger is an ability being activated (`activatesAbility`): "copy that spell or ability" has an ability to copy (Unbound Flourishing, CR 707.10). */
  activateTrigger: boolean;
  /**
   * What the events of the trigger are, when every one is a permanent becoming the target (`becomesTarget`): 'spell' for spells only, 'both' for spells and abilities. "Counter that
   * spell or ability unless its controller pays {2}" names the spell or ability that targeted, the engine's `triggerSubject` there (Diffusion Sliver, CR 702.21a, 603.2).
   */
  becomesTargetOf: 'spell' | 'both' | null;
  /**
   * The ids of targets an earlier instruction of this text sent away from the battlefield (destroy,
   * exile, return, sacrifice): "it" after them is the card in its new zone, which a tap or an untap
   * cannot reach. Filled by `lowerSentences` as each clause is lowered.
   */
  readonly removed: Set<string>;
  /**
   * True once an instruction of this text created a token (stage P69, D-276, CR 111.1): "it" and "that creature" after it name the new token (or
   * are ambiguous), not an earlier target, so a rule that reads "it" as the target refuses. Filled by `lowerSentences` as each clause is lowered.
   */
  madeAToken: boolean;
  /**
   * True right after an instruction that made the tokens the engine's `moved` names (D-643, Prismari group 1: `createToken`, `createCopies`, `populate`): "They gain haste.",
   * "The token created this way gains haste.", "Exile them at the beginning of the next end step." and "Sacrifice those tokens." are about exactly those tokens, and are lowered only
   * then. Any later instruction that moves, destroys, exiles or sacrifices something else makes it false again. Filled by `lowerSentences` as each clause is lowered.
   */
  tokensMade: boolean;
  /**
   * The last `createToken` effect of a token that is a copy this text lowered (D-643): "create five of those tokens instead" makes that many tokens of the same kind, which this
   * effect (with its target and its exceptions) says. Null before one. Filled by `lowerSentences` as each clause is lowered.
   */
  /** The `createToken` the instruction before made, of any kind of token (D-643, D-646): what "create five of those tokens instead" makes more of. */
  lastToken: Effect | null;
  /**
   * The number of instructions of this text lowered so far (D-287): "return it" after an earlier instruction may name what that one made or moved, so a rule that reads
   * "it" as the object of the trigger itself needs this to be 0. Filled by `lowerSentences` as each clause is lowered.
   */
  lowered: number;
  /**
   * What "that player" means in the body of a triggered ability (stage P18, D-111), with the engine
   * features that reading needs: the controller of the spell that was cast (`controllerOf` the
   * triggering spell, CR 608.2h) for a cast trigger, "you" when the trigger is about you. Null when the
   * trigger names no player the engine can point at (an opponent who drew a card, the player whose turn
   * it is): "that player" is then not lowered.
   */
  thatPlayer: { readonly selector: PlayerSelector; readonly needs: readonly FeatureRef[] } | null;
  /** The sentence of "If they don't" after a "may" sentence the asked player does themselves is being lowered: "they" and "that player" are the player who declined (`declinedPlayer`). */
  declinedPlayer: boolean;
  /** D-648: "that opponent" of a trigger about a player attacking one of your opponents (the player attacked), the engine's `triggerAttackedPlayer`; null for any other trigger. */
  attackedPlayer: {
    readonly selector: PlayerSelector;
    readonly needs: readonly FeatureRef[];
  } | null;
  /** "that's tapped and attacking" of a trigger about the creatures you control attacking (CR 508.4): the player the declaration attacked, the engine's `triggerAttackedPlayer`; null for any other trigger. */
  attackBatchPlayer: {
    readonly selector: PlayerSelector;
    readonly needs: readonly FeatureRef[];
  } | null;
  /** True in the body of "Whenever enchanted player is attacked" (issue 160, D-629): every event of the trigger is the Aura's player being attacked, so "each opponent attacking that player" is the attacking player. */
  enchantedPlayerTrigger: boolean;
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
   * The number of sides of the die the text rolled before this point (D-271, CR 706.2): the instruction "roll a four-sided die" sets it, and "the result is 1"
   * reads it. Null before any roll; a second roll in one text is refused.
   */
  dieSides: number | null;
  /** True once the text clashed (CR 701.30b): "If you win" reads who won it. A second clash in one text is refused. */
  clashed: boolean;
  /**
   * The groups of "each" a text named so far, by the reference the binding pass gave them (D-517, CR 608.2c): "Tap all creatures target player controls. Those creatures don't
   * untap during that player's next untap step." reads "those creatures" as the same group, which the engine names by the selector again (the group is the same one as the
   * effect runs). Only a clause that says it reads it (`RefOptions.eachMention`).
   */
  readonly eachMentions: Map<string, ObjectSelector>;
  /** References to resolving choices whose selected objects later text calls "it". */
  readonly chosenObjectRefs: Set<string>;
  /**
   * The normalized text of the ability the spans of the IR point into (D-287): the one place a lowering can tell the "you" the text says (the controller) from the "you"
   * the engine reads for a player asked who acts (`runsAs: 'chooser'`). Empty where the lowering has no text (a quotation lowered on its own): a rule that needs it refuses then.
   */
  text: string;
  /**
   * True only while the "as long as" condition of a static ability is lowered (D-287, CR 604.1, 611.3a): the one place `paired` is read, because `derive` evaluates it
   * while the permanent is on the battlefield. Anywhere else the permanent may be gone when the condition is read (CR 400.7, 603.4, 608.2h) and the engine keeps no
   * last-known information of a pair.
   */
  staticCondition: boolean;
  /**
   * True only while the "as long as" condition of a static ability is lowered and every subject of that ability is `~` itself (D-287): "it" in "as long as it's paired" is
   * the source then. With another subject ("Each creature you control has flying as long as it's paired") "it" has no antecedent the engine could read, so a rule refuses.
   */
  staticSubjectIsSelf: boolean;
  /** True only while the intervening "if" of a triggered ability is lowered (D-271): the one place "~ is in your graveyard" is read. */
  interveningCondition: boolean;
  /**
   * True while the body of a trigger about other permanents dying is lowered ("Whenever a creature you control with a counter on it dies", Puca's Covenant, CR 603.10a): "another target
   * ... card from your graveyard" is then besides the card the creature that died became (`ObjectFilter.notTriggerCard`).
   */
  deathOfOther: boolean;
  /**
   * The player the last instruction lowered was said of (a `player` of the effect): "each other player" is every player but that one ("its owner draws that many cards and each
   * other player loses that much life"). Null before the first instruction and after one that names no player.
   */
  lastPlayer: PlayerSelector | null;
  /**
   * The name of the creature the intervening "if" of the ability named ("if you both own and control ~ and a creature named X", D-278, CR 701.42a): "exile them,
   * then meld them into Y" reads it. Null where no such condition came before.
   */
  meldPartner: string | null;
  /**
   * True once the intervening "if" of the ability said "there are cards exiled with ~" (Valakut Exploration, CR 607.2a): "put them into their owner's graveyard" then names those
   * cards (the engine's `linkedExile`). False where no such condition came before.
   */
  exiledWithCondition: boolean;
  /**
   * True when "it" in the body of a triggered ability is the card the permanent became (stage P30, D-135): every event of the
   * trigger is `~` dying or leaving the battlefield, so "exile it" and "put it into its owner's library" name `thisCard`.
   */
  itIsCard: boolean;
  /**
   * True in the body of "When ~ is put into a graveyard from anywhere" (Troyan 2 deck, CR 603.6c, 400.7): "it" is the card of the ability itself, in the graveyard it is in as the
   * ability resolves, which the engine names `this` (the ability is found on that card).
   */
  selfGraveyardEntry: boolean;
  /**
   * True when "it" in the body of a triggered ability is the card of a creature that died (D-284, CR 603.10a): every event of the trigger is `~` dying (not leaving the
   * battlefield some other way, where the card may be anywhere). A subset of `itIsCard`.
   */
  itDied: boolean;
  /** True in any dies trigger body, including a trigger about another creature (D-599). */
  diesTrigger: boolean;
  /** True in the body of a trigger about a batch of combat damage (issue 81): "those creatures" are the creatures that dealt it (the engine's `triggerSources`). */
  damageBatchTrigger: boolean;
  /** True in the body of "Whenever this creature attacks" (issue 144, CR 508.4): the source is the attacker, so a token "tapped and attacking" attacks whom it attacks (`enterAttacking`). */
  selfAttackTrigger: boolean;
  /**
   * True in the body of a triggered ability whose every event is the card itself entering the battlefield or attacking (Titan of Littjara): "it" in "shares a creature type with it" is
   * the source of the ability, the one case the engine's `sharesCreatureTypeWith: 'source'` is read from the words.
   */
  selfEntersOrAttacksTrigger: boolean;
  /**
   * True when the source of the triggered ability is an Aura whose own trigger is "when enchanted creature dies" (D-657, CR 603.10a, 303.4f): every event is `dies` of the attached
   * permanent, so the Aura has gone to the graveyard with the creature by the time the effect runs, and "this card" is that card (the engine's `thisCard`).
   */
  auraDies: boolean;
  /**
   * True after the instruction "return that card to the battlefield" of the dies trigger of an Aura's enchanted creature has been lowered (issue 89, Gift of Immortality, CR 400.7, 603.10a):
   * the creature that returned is what "that creature" of the next instruction is (the engine's `moved`), not the one that died.
   */
  returnedDyingCard: boolean;
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
   * discovered card"), `milled` (D-327) the cards the controller milled ("Mill a card. You may play that card this turn."), `cards` (Lorehold group 1) the card an
   * `exile` of the text exiled from where it was ("you may exile that card from your graveyard. If you do, you may play that card this turn"). Null before any. The
   * engine's `moved` names them.
   */
  exiled: 'top' | 'cast' | 'milled' | 'cards' | null;
  /** True when the cards the last "exile the top ... cards" exiled were exiled face down (stage P41, D-188, CR 406.3): "you may look at and play those cards". */
  exiledFaceDown: boolean;
  /**
   * What "that many" counts (stage P34, D-152): the permanents the last instruction that sacrificed some sacrificed, or the cards the last
   * "discard any number of cards" discarded. The engine's `thisWay` names which.
   */
  thisWay: 'sacrificed' | 'discarded';
  /** True in the body of a triggered ability whose every event is life being gained (D-256, CR 119.9): `triggerDamage` is the life gained. */
  lifeGainTrigger: boolean;
  /** True in the body of a triggered ability whose every event is a player scrying (D-513, CR 701.22): the cards looked at are the number its event carries. */
  scryTrigger: boolean;
  /** True while the reflexive ability of a payment made any number of times is lowered (issue 121, CR 603.12): the number of times paid is the number its event carries. */
  payReflexive: boolean;
  /** True in the body of a triggered ability (CR 603.3d): the number of targets of a slot ("up to X target ...") may be read as it triggers. */
  triggeredBody: boolean;
  /** True once a `search` of the text was lowered (Lorehold group 1): "If you search your library this way" asks what a search before it did. */
  didSearch: boolean;
  /** True in the body of a triggered ability whose every event is a batch of cards discarded (Lorehold group 1, CR 603.2c): "one of them" names the cards that triggered it. */
  discardBatchTrigger: boolean;
  /** Issue 102: the trigger is about a batch of cards put into a graveyard, whose cards "one of them" names (`triggerCards`). */
  graveyardBatchTrigger: boolean;
  /** True in the body of a triggered ability whose every event is a batch of permanents entering (Twilight Diviner, CR 603.2c): "one of them" names the permanents that triggered it. */
  entersBatchTrigger: boolean;
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
   * True right after a clause that was the exile of a card the player chose from their graveyard (issue 104, "you may exile a creature card from your graveyard. If you do, create a token
   * that's a copy of that card"): "that card" names the card that exile put into exile, which the engine's `moved` holds until another instruction moves, destroys or exiles something.
   */
  chosenExiled: boolean;
  /**
   * True right after a clause that was one mill of the controller's own library (D-411, CR 701.17a): "them" and "the cards milled this way" of "you may put a land card from
   * among them into your hand" are the cards that mill put into the graveyard. Any other clause lowered after it makes it false again.
   */
  milled: boolean;
  /**
   * True right after a clause that was a `destroy` (issue 159, Necromantic Selection): "a creature card put into a graveyard this way" names the cards that destroy
   * put into graveyards, which the engine's `moved` holds until another instruction moves something.
   */
  destroyed: boolean;
  /**
   * The `createToken` the clause before it lowered to, when it was the only effect and made the tokens for the controller (issue 159, Curse of Disturbance): "Each opponent attacking
   * that player does the same" makes the same tokens for other players. Null after any other clause.
   */
  createdToken: Extract<Effect, { kind: 'createToken' }> | null;
  /**
   * True right after a clause that was one `moveToZone` to the hand (D-412, CR 400.7j): "If you put a Town card into your hand this way" asks about the card that move put there,
   * and "onto the battlefield this way" about a card put there; the condition is read only after the move it says (a card put into the hand is not "put onto the battlefield").
   */
  movedToHand: boolean;
  /**
   * True right after a clause that was the exile of "any number of cards from your graveyard with four or more card types among them" (Death Toll deck, Winter, Cynical Opportunist,
   * CR 608.2c): "them" of "put a permanent card from among them onto the battlefield" are the cards that exile moved. Any other clause lowered after it makes it false again.
   */
  exiledAnyCardTypes: boolean;
  /**
   * True after "each player exiles all creature cards from their graveyard" (Living Death, CR 608.2c): the cards that exile moved are what "all cards they exiled this way" names, kept
   * through a sacrifice and false after any other instruction that moves, destroys or exiles.
   */
  exiledOwnGraveyards: boolean;
  /**
   * What "it" means in "If you do, return it to the battlefield ... at the beginning of the next end step" (stage P48, D-205, CR 603.7c, 400.7j): the reference of the
   * target the last instruction exiled, which the engine's `moved` names. Null before an exile of a target and after any other move, destroy or sacrifice.
   */
  exiledRef: string | null;
  /**
   * The kind of the last instruction lowered (Prismari deck group 3, D-664): "the other cards exiled this way" is read only after the opponent's choice among the cards exiled, "them"
   * and "those cards" only after an instruction that exiled cards, and "the rest" only after the spells were cast from among them. Null before the first.
   */
  lastEffectKind: string | null;
  /**
   * True after an instruction that picked cards of the controller's graveyard at random (Death Toll deck group B, CR 608.2c): what the engine's `moved` names are cards of the graveyard of
   * the controller, which "put it into your hand" may move to their owner's hand, which is theirs. Set by the lowering of `chooseRandomGraveyardCard`, never cleared inside one ability.
   */
  randomYardCard: boolean;
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
   * The name the card gives itself in its text (D-266): the shortest of the names that normalization writes as `~` ("Ajani" for "Ajani, Strength of the Pride"),
   * or '' when it is not known (a context made for a quoted ability or a mode, where `~` is not the card). The name of a token that begins with the card's own
   * ("named Ajani's Pridemate") is written back from it.
   */
  selfName: string;
  /** True when the text of the face says "named" and then the card's whole name, so a "named ~" in it is the whole name (`cardName`), though `selfName` cannot say which name a token used. */
  namedWholeName: boolean;
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
    entersX: false,
    selfGone: false,
    costSacrifice: null,
    staticSubjectIsSelf: false,
    itIsSelf: false,
    selfCast: false,
    castTrigger: false,
    castTriggerX: false,
    cycleTriggerX: false,
    lifeGainedIf: false,
    activateTrigger: false,
    becomesTargetOf: null,
    removed: new Set(),
    madeAToken: false,
    tokensMade: false,
    lastToken: null,
    lowered: 0,
    thatPlayer: null,
    declinedPlayer: false,
    attackedPlayer: null,
    attackBatchPlayer: null,
    enchantedPlayerTrigger: false,
    xIs: null,
    xDefined: false,
    exiled: null,
    exiledFaceDown: false,
    thisWay: 'sacrificed',
    lifeGainTrigger: false,
    scryTrigger: false,
    payReflexive: false,
    triggeredBody: false,
    discardBatchTrigger: false,
    graveyardBatchTrigger: false,
    entersBatchTrigger: false,
    didSearch: false,
    searched: null,
    sacrificedRef: null,
    madeToken: null,
    chosenExiled: false,
    milled: false,
    destroyed: false,
    createdToken: null,
    movedToHand: false,
    exiledAnyCardTypes: false,
    exiledOwnGraveyards: false,
    exiledRef: null,
    lastEffectKind: null,
    randomYardCard: false,
    namedInQuotes: false,
    readAsCast: false,
    createdPer: null,
    movedOnto: null,
    graveyardSource: false,
    usedGraveyardSource: false,
    dieSides: null,
    clashed: false,
    eachMentions: new Map(),
    chosenObjectRefs: new Set(),
    staticCondition: false,
    text: '',
    interveningCondition: false,
    deathOfOther: false,
    lastPlayer: null,
    meldPartner: null,
    exiledWithCondition: false,
    itIsCard: false,
    selfGraveyardEntry: false,
    auraDies: false,
    returnedDyingCard: false,
    itDied: false,
    diesTrigger: false,
    damageBatchTrigger: false,
    selfAttackTrigger: false,
    selfEntersOrAttacksTrigger: false,
    cardName,
    selfName: '',
    namedWholeName: false,
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
  /** The abilities the line makes besides the cost (D-492): "When you do, copy ~ for each creature sacrificed this way" is a "When you cast this spell" ability of the card. */
  readonly abilities?: readonly Ability[];
}
