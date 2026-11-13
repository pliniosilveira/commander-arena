/**
 * The clause IR (D-063, `docs/proposals/parser-architecture.md` section 3.3): what an ability's
 * text says, between the words and the engine AST. It says what the text says, never how the
 * engine runs it (no `TargetSpec`, no `ObjectRef`); every node has a span and the id of the phrase
 * rule that produced it. `raw` variants exist only so a piece that was recognised but not
 * understood can be reported precisely, and lowering always rejects them.
 *
 * Differences from the proposal's sketch, all additive:
 * - D-063 amendments: `IrCondition.test` has `and`/`or`/`not`, `IrFilter` has `anyOf`.
 * - the types the sketch names but does not define (`IrCounterSpec`, `IrManaSpec`, `IrZoneSpec`,
 *   `IrDestinationList`) are defined here, and `IrNounList` is added for "A, B and C" operands;
 * - `IrFilter.player` and `IrFilter.anyTarget` say that a target noun is a player or "any target"
 *   (CR 115.4), which the sketch's filter fields cannot;
 * - `IrAbility` `replacement` has an optional `instead`: "~ enters tapped" has no second part;
 * - stage P1: `IrManaSpec` has `oneOf`, `IrCondition` has `opponentsAtLeast`. A replacement's
 *   event clause carries its "unless X" as `condition: not(X)`: the replacement applies when X is
 *   false, so one polarity serves "if" and "unless" and lowering strips the `not`.
 * - stage P2: `IrPtChange` ("+1/+1") and `IrFlag` ("reveal", "then shuffle") are clause arguments,
 *   `IrZoneSpec` has a `count` (the cards a search puts there) and `IrKeyword` a `cost`
 *   (Cycling {2}).
 * - stage P3: `IrStaticEffect` has `grantQuoted` (a granted ability in quotes, recognised and
 *   not read); `IrNoun` has the `enchanted` and `equipped` determiners, read since then.
 * - stage P4: `IrCondition` has `kicked` ("~ was kicked", "it was kicked", CR 702.33d);
 *   `IrSentence` has `condition` ("If ~ was kicked, draw a card.") and `instead` (a sentence that
 *   ends "... instead"), both set only where a lowering handles them; an `IrNoun` for an attached
 *   permanent carries its type and supertype words in its filter ("enchanted legendary creature").
 * - stage P5: clause arguments for the continuous effects of a resolving spell or ability:
 *   `IrKeywordArg` ("gains flying"), `IrColorSpec` and `IrTypeList` ("becomes a blue Frog") and
 *   `IrBasePt` ("with base power and toughness 1/1"). The pronoun "it" is a noun (`det` `anaphor`,
 *   read by `noun.it`); the one place a pronoun is read inside a rule instead of being left to the
 *   binding pass is the flicker sentence (`effect.flicker`), as for the search rule.
 * - stage P6: `IrToken.copyOf` ("a token that's a copy of target creature", the noun bound like any
 *   other, CR 707.2), `IrTypeList.cardTypes` and `additive` ("becomes an artifact creature",
 *   CR 205.1b), `IrKeyword` params for the number of Crew, and a `zoneSpec` that names the control
 *   of a return to the battlefield (`whose`, CR 110.2a).
 * - stage P7a: `IrDamageScope`, the damage a prevention covers ("all combat damage", "the next 3
 *   damage", CR 615), as the clause argument `scope`; the duration "this turn" is the existing
 *   `thisTurn` scope.
 * - stage P11: `IrAmount` `manaValueOf` ("equal to that card's mana value"), `IrCostList` (the cost
 *   of "unless its controller pays {3}") and `IrNoun.of` on a graveyard ("target player's
 *   graveyard": det `each`, `of` the player, whose cards are selected by owner).
 * - stage P13: `IrCost` `discard` is "Discard a card" (a count), `IrCondition` has `controlCommander`
 *   and `IrStaticEffect` has `costReduction`, `additionalCost` and `freeCast`: the three statements
 *   about what a spell costs, which lower to the face's `additionalCosts` and `alternativeCosts` and
 *   to a `costReduction` static ability. `IrAmount` `countOf` is read ("for each creature you
 *   control", "equal to the number of lands you control") since then.
 * - stage P14: `IrManaSpec` has `combination` and `couldProduce`, `IrRestriction` has a `condition`
 *   ("Activate only if you control a Swamp."), and a granted ability in quotes that is a mana ability
 *   is read as `grantAbility` (an `IrQuotedAbility`), not kept as text; the hybrid mana cost is the
 *   rule `cost.mana-hybrid`, whose `IrCost` is a `mana` cost with symbols such as `R/W`.
 * - stage P15: `IrToken.keywords` ("a 1/1 white Spirit creature token with flying"), and an `IrNoun` may
 *   be "another target ..." (`other` on a target) and carry subtypes in its filter ("Plant creature",
 *   "Equipment"); a trigger's `sacrifice` actor may be `eachPlayer` ("a player sacrifices"); the choice
 *   of D-100 is `IrChoiceArg` (the replacement "As ~ enters, choose a creature type"), `IrFilter.chosen`
 *   ("of the chosen type") and the static effect `chosenType`.
 * - stage P16: X (D-103, D-107): `IrCost` `payXLife` ("Pay X life") and a `mana` cost whose symbols
 *   include `X` (the rule `cost.mana-x`); `IrAmount` `x` is read as the count of counters, tokens,
 *   scry and surveil, and in "enters with X +1/+1 counters on it".
 * - stage P17: `IrKeyword` carries the keywords of the engine's keyword batch 1: the ones without a
 *   parameter by name, "Toxic N" and "Annihilator N" with the number in `params`, and the typecycling
 *   words ("basic landcycling", "islandcycling") with the cost; `IrAmount` `timesKicked` is "for each
 *   time it was kicked".
 * - stage P18 (D-108, D-111): `IrFilter` `power`, `toughness` and `manaValue` (`IrComparison`, in place
 *   of the unread `powerAtLeast`); `IrTrigger` has `step` (the beginning of a step or phase other than
 *   upkeep and end step), `nth` (the nth card drawn each turn), `damaged` and `recipient` (what a
 *   creature dealt combat damage to); the determiners `enchanted` and `equipped` are subjects of a
 *   trigger; a clause's `condition` of kind `unlessPays` is "unless that player pays {1}" (the player
 *   a noun, the cost the mana the text names).
 * - stage P19 (D-105, D-114): modal spells and abilities. `IrModeHeader` and `IrModeChoice` are the lead
 *   line ("Choose one —", the commander widening), `IrModes` the choice and one body per bullet, a
 *   `modal` ability is a spell, and a triggered or activated ability may carry `modal` in place of a body.
 * - stage P20 (D-109, D-115): `IrPtChange` terms may be X ("+X/+0", "-X/-X": `IrPtTerm`), and
 *   `IrStaticEffect` has `ptCount` ("gets +1/+1 for each artifact you control") and `definesPt` ("~'s power
 *   and toughness are each equal to the number of cards in your hand").
 * - stage P21 (D-116, D-120): keyword batch 2. `IrKeyword` carries the new keywords by name, "Bushido N"
 *   with the number and "Affinity for artifacts" with the noun it counts; the clause verbs `regenerate`,
 *   `cantBeRegenerated` (a sentence the lowering attaches to the destroy before it) and `pay` (the offer of
 *   "You may pay {4}. If you do, ..."; its `cost` is a `costList`), the condition `didPrevious` is read
 *   ("If you do,", `condition.if-you-do`) at the start of a sentence of a triggered ability, `IrAmount`
 *   `lifeLostThisWay`, and the trigger events `blocks` and `becomesBlocked`.
 * - stage P23 (D-117, D-124): `IrKeyword` carries Spectacle, Unearth and Escape by name (Escape with the number of
 *   cards exiled in `params` and its mana cost in `cost`); `IrCondition` has `escaped` ("unless it escaped",
 *   `condition.unless-escaped`: the clause's `condition` is `not escaped`, which the lowering of a triggered
 *   ability moves to its intervening "if", CR 603.4).
 * - stage P24 (D-125): `IrStaticEffect` has `additionalLandDrops`, `lookAtTopOfLibrary`, `attackTax` and `optionalUntap`:
 *   the four static abilities that change what a player may do in a turn (rules `static.additional-land`,
 *   `static.look-at-top`, `static.attack-tax`, `static.optional-untap`).
 * - stage P28 (D-131): `IrAmount` has the amounts that read the game (`toughnessOf`, `countersOn`, `aggregate`,
 *   `devotion`, `commanderColors`, `half`, `multiple`, `sum`, `opponentsWithMore`, `thisWay`); `IrSentence.where` is
 *   "..., where X is <amount>" (CR 107.3c: X is the amount wherever the sentence reads it); `IrFilter.attackingYou`;
 *   `IrToken.tapped`; `IrNoun` `det` `players` ("you and target opponent each", with `members`) and
 *   `defendingPlayer`; `IrCondition` `amountIs` and `designation`.
 * - stage P29 (D-133, D-134): `IrFilter` has `notSubtypes`, `colorless`, `keywords`, `notKeywords` and the member `other`
 *   (`token` is "nontoken"); `IrTrigger` has `at` ("attacks you or a planeswalker you control") and the `dealtDamage`
 *   event; `IrAmount` `triggerDamage` ("that much"); `IrNoun` det `sacrificed`; `IrCondition` `lifeTotal`, `thisMatches`
 *   and `controlCommander` "yours"; `IrCost` `tapPermanents` and `sacrifice.count`; `IrStaticEffect` `castFromGraveyard`
 *   and the restriction `cantBeBlockedByMoreThanOne`; `IrStatic.also` (several subjects in one statement) and the
 *   `condition` of a static.
 * - stage P30 (D-135, D-136): `IrFilter.notSupertypes` ("nonbasic"); `IrNoun.anyNumber` ("any number of other permanents");
 *   `IrAmount` `thisWay.thatMany` ("that many"); `IrZoneSpec` `position` a number ("third from the top"), `counters`
 *   ("with a +1/+1 counter on it") and `from` ("from your graveyard", the zone an ability of the card itself works from);
 *   `IrTrigger.entersTapped` ("enters untapped") and `to` ("dies or is put into exile from the battlefield");
 *   `IrCondition` `objectMatches` ("if it's a Zombie card"), `giftPromised` and `opponentControls`; `IrRestriction.costReduction`
 *   ("This ability costs {4} less to activate if ..."); `IrSentence.reflexive` ("When you do, ..."); the keyword Gift.
 * - stage P33 (D-149, D-150): `IrFilter.commander` may be `'yours'` ("your commander"); `IrNoun.perOpponent` ("for each opponent, exile up
 *   to one target ... that player controls") and the determiner `thisCard`; `IrCondition` `hadCounters`, `attackersAttackedYou` and
 *   `sameName`; `IrManaSpec` `chosenColor`; `IrTrigger` `firstEachTurn`, `counter` and `by` (the events `lifeGained`, `countersAdded` and
 *   `attackBatch`); `IrStaticEffect` `playerHexproof`, `cantLoseGame`, `opponentsCantWin`, `preventDamageToThis`, `cantCastThis`,
 *   `blockTax`, `othersEnterWithCounters` and `tapAlternative`.
 */
import type { RuleFamily } from '../../../types';

export type { RuleFamily };

/** Character offsets into the normalized ability text. Every node carries one for diagnostics. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

export interface IrNode {
  readonly span: Span;
  /** The stable id of the phrase rule that produced this node ('effect.draw'). */
  readonly rule: string;
}

/** A noun phrase, before engine resolution: who or what a clause acts on. */
export interface IrNoun extends IrNode {
  readonly kind: 'noun';
  readonly det:
    | 'self' // ~
    | 'target' // target creature, up to two target lands, target player
    | 'each' // each creature, all creatures
    | 'a' // a creature (the acting player chooses: "sacrifice a creature")
    | 'anaphor' // it, that creature, that player, those cards, them, the other
    | 'you'
    | 'eachPlayer'
    | 'eachOpponent'
    | 'controllerOf'
    | 'ownerOf' // its controller, that card's owner (with `of`)
    | 'enchanted'
    | 'equipped' // enchanted creature, equipped creature
    | 'triggerSubject'
    | 'triggerActor' // filled by bind for "it" inside a trigger
    | 'players' // "you and target opponent each": several player nouns acting at once (`members`)
    | 'defendingPlayer' // "defending player" (CR 508.5) body
    | 'sacrificed' // "the sacrificed creature": what the cost of the ability sacrificed (stage P29, D-133)
    | 'attackedBy' // "the player or planeswalker it's attacking" (stage P31, D-140): what the creature `of` attacks
    | 'linkedExile' // "the exiled card" (stage P32, D-147, CR 607.2a): what the linked ability of this permanent exiled
    | 'discardedThisWay' // "each player who discarded a card this way" (stage P52, D-210): the players of the discard before it
    | 'attackedPlayers' // "each player ~ attacked this turn" (D-269, CR 508.6): the players this permanent was declared attacking
    | 'pair' // "each of those creatures" (D-286, CR 702.95b): the permanent and the creature it is paired with
    | 'thisCard'; // "this card" (stage P33, D-150, CR 400.7): the card of the ability's source, wherever it is (an Aura in the graveyard)
  readonly filter: IrFilter;
  /** "up to two", "X", "one or more"; for `target`, how many targets the phrase takes. */
  readonly count?: IrAmount;
  readonly upTo: boolean;
  readonly plural: boolean;
  /** another, other than ~ */
  readonly other: boolean;
  /**
   * "each of up to two other targets" (stage P34, D-152, CR 115.3): the targets of this slot are none of the targets of the slot of the same
   * ability before it, which a target noun without it may share.
   */
  readonly otherTarget?: true;
  /**
   * "one or two target creatures", "each of one or two targets" (D-295, CR 115.1, 601.2c): at least this many targets, at most `count`. A target noun
   * without it takes none (`upTo`) or exactly `count`.
   */
  readonly minTargets?: number;
  /** "any number of other permanents" (stage P30, CR 701.21): the player chooses none, some or all of them. */
  readonly anyNumber?: true;
  /** "one or more Treasures" (stage P41, D-188, CR 701.21): with `anyNumber`, the player chooses at least one of them. */
  readonly atLeastOne?: true;
  /**
   * "up to that many target creatures" (stage P41, D-188, CR 603.12): a target noun of a reflexive ability with as many targets, at most, as the
   * resolution that created it sacrificed permanents (the engine's `upToThatMany`); it has no count of its own.
   */
  readonly upToThatMany?: true;
  /**
   * "a creature with the greatest power among creatures they control" (stage P30, D-135): the player chooses among the permanents
   * of the filter that have the greatest value of this stat among them.
   */
  readonly greatest?: 'power' | 'toughness' | 'manaValue';
  /** "target player's graveyard" has `of` = target player. */
  readonly of?: IrNoun;
  /**
   * "up to three other target creatures from the battlefield and/or creature cards from graveyards" (D-270, CR 115.1): a target noun whose targets are `filter`
   * (permanents on the battlefield) or this filter (cards of any graveyard). The engine's slot of two zones (`objectOrGraveyardCard`); only `exile` takes it.
   */
  readonly orCard?: IrFilter;
  /** `det` `players`: the player nouns that act together, in text order ("you", "target opponent"). */
  readonly members?: readonly IrNoun[];
  /**
   * "for each opponent, exile up to one target nonland permanent that player controls" (stage P33, D-150, CR 115.1, 601.2c): the target phrase takes at
   * most one target controlled by each opponent; the filter's controller is `opponent`.
   */
  readonly perOpponent?: true;
  /** Set by bind(): 't1' for targets, 'b1' for bound results, 'trig' for the trigger subject. */
  readonly ref?: string;
}

/** A comparison with a whole number (stage P18): "4 or greater" is `atLeast`, "2 or less" `atMost`, "3" `equal`. */
export interface IrComparison {
  readonly cmp: 'atLeast' | 'atMost' | 'equal';
  readonly value: number;
}

export interface IrFilter {
  readonly types?: readonly string[];
  readonly notTypes?: readonly string[];
  readonly supertypes?: readonly string[];
  /** "nonbasic" (stage P30, CR 205.4): none of these supertypes. */
  readonly notSupertypes?: readonly string[];
  readonly subtypes?: readonly string[];
  /** "non-Zombie" (stage P29, CR 205.3d): none of these subtypes. */
  readonly notSubtypes?: readonly string[];
  readonly colors?: readonly string[];
  /** "colorless" (stage P29, CR 105.2c). */
  readonly colorless?: true;
  /** "with flying" and "without flying" (stage P29): keywords without parameters, as the words spell them (lowercase). */
  readonly keywords?: readonly string[];
  readonly notKeywords?: readonly string[];
  /** For cards outside the battlefield this reads as the owner (CR 400.3, 404.1). */
  readonly controller?:
    | 'you'
    | 'opponent'
    | 'any'
    // "that opponent controls" (stage P34, D-152, CR 603.2): the player the event of the trigger is about
    | 'triggerPlayer'
    // "defending player controls" (stage P34, D-152, CR 508.5): the player the source attacks
    | 'defendingPlayer'
    // `orPlaneswalkerController`: "that player or that planeswalker's controller controls" (stage P47, D-200): the controller of the planeswalker the target is, too
    | { readonly noun: IrNoun; readonly orPlaneswalkerController?: true };
  readonly zone?: 'battlefield' | 'graveyard' | 'library' | 'hand' | 'exile' | 'stack';
  /** "land card" (in a non-battlefield zone) versus "land". */
  readonly card?: boolean;
  /** A member of `anyOf` that leaves the source out: "Skeletons you control and other Zombies you control" (stage P29). */
  readonly other?: true;
  /** "nontoken" is `false` (stage P29, CR 111.1); "token" is `true`. */
  readonly token?: boolean;
  readonly tapped?: boolean;
  /**
   * "with power 4 or greater", "with toughness 2 or less", "with mana value 3" (stage P18, D-111,
   * CR 202.3, 208.1): a comparison of the object's power, toughness or mana value with a number.
   */
  readonly power?: IrComparison;
  readonly toughness?: IrComparison;
  readonly manaValue?: IrComparison;
  /**
   * "of the chosen type" / "of the chosen color" (stage P15, D-100, CR 607.2d): the object has the
   * creature type or the color that the source of the ability chose as it entered.
   */
  readonly chosen?: 'type' | 'color';
  readonly stackKind?: 'spell' | 'ability' | 'triggeredAbility';
  /** "with a single target" (stage P38, D-182, CR 115.9a): a spell or ability that was put on the stack with exactly one target. */
  readonly singleTarget?: true;
  /** "that targets a creature" (stage P49, D-206, CR 115.1, 601.2c): a spell with a chosen target that is an object of this kind (a card type). */
  readonly targets?: IrFilter;
  /** "creatures attacking you" (stage P28, CR 508.1b): attackers whose attack target is the controller as a player. */
  readonly attackingYou?: true;
  /** "creatures attacking your opponents and/or planeswalkers they control" (stage P65, D-218, CR 508.1b, 506.3): attackers of an opponent or of a permanent of an opponent. */
  readonly attackingOpponents?: true;
  /** "attacking or blocking creatures" (stage P68, D-229, CR 506.4, 509.1g): creatures declared as attackers or as blockers that are still in combat. */
  readonly attackingOrBlocking?: true;
  /** "attacking creatures" (stage P31, CR 508.1k): creatures that are attacking, whoever they attack. */
  readonly attacking?: true;
  /**
   * "monocolored", "multicolored", "that are one or more colors" (stage P31, CR 105.2): the number of colors the object has, compared
   * with a whole number.
   */
  readonly colorCount?: IrComparison;
  /** "with mana value X" (stage P31, CR 107.3a, 202.3): the mana value is the X announced for the ability. */
  readonly manaValueX?: true;
  /** "with mana value X or less" (stage P68, D-230, CR 202.3): at most the X the sentence defines ("..., where X is this creature's power"). Only a target reads it. */
  readonly manaValueAtMostX?: true;
  /** "historic" (stage P68, D-230, CR 700.6): an artifact, a legendary permanent or a Saga. */
  readonly historic?: true;
  /**
   * "that shares a creature type with it" (D-261, CR 205.3m, 603.10a): the card has a creature type the creature of the trigger had (the one that died), as it last was
   * (CR 113.7a). Read in the filter of a library search `revealUntil` only; the engine's `sharesCreatureTypeWith`.
   */
  readonly sharesCreatureTypeWithIt?: true;
  /**
   * "up to two basic land cards that share a land type" (D-262, CR 205.3i, 701.23): the cards found share a land type among them, which is a condition on the whole
   * choice and not on a card. A filter that still has it is not lowered; the search lowering takes it off (the engine's `search.sharedLandType`).
   */
  readonly sharedLandType?: true;
  /**
   * "with a counter on it", "with a +1/+1 counter on it" (stage P32, D-147, CR 122.1): the object has a counter, of any kind (`true`) or
   * of the kind named ("+1/+1", "stun").
   */
  readonly hasCounter?: true | string;
  /**
   * "commander" (stage P32, D-147, CR 903.3): the object is a card a player designated as a commander, wherever it is; stage P33 (D-150):
   * `'yours'` is "your commander", a commander its owner designated and that owner is the player who controls the ability.
   */
  readonly commander?: true | 'yours';
  /**
   * "whose controller was dealt combat damage by ~ this turn" (stage P31, CR 510.2): the object's controller was dealt combat damage
   * this turn by the source of the ability.
   */
  readonly controllerDamagedBySource?: true;
  /**
   * A disjunction of filters (D-063): "artifact or enchantment", "creature or planeswalker". The
   * filter matches the fields above AND at least one member.
   */
  readonly anyOf?: readonly IrFilter[];
  /** The noun names a player, not an object: "target player", "target opponent". */
  readonly player?: 'any' | 'opponent';
  /**
   * "target player or planeswalker" (stage P37, D-180, CR 306.1; stage P47, D-200): the words "or planeswalker" of a player noun, which the engine's
   * target `playerOrObject` reads: a player, or a planeswalker (`noun.player-or-planeswalker`).
   */
  readonly orPlaneswalker?: true;
  /**
   * "that was put there from the battlefield this turn" (stage P37, D-180, CR 700.4): a card in a graveyard that went there from the battlefield
   * during this turn (the engine's `putFromBattlefieldThisTurn`).
   */
  readonly putFromBattlefieldThisTurn?: true;
  /** "from anywhere other than your hand" (stage P75, D-235, CR 601.2a): a spell that was cast from a zone other than the hand (the engine's `notCastFromHand`). */
  readonly notCastFromHand?: true;
  /** "that entered this turn" (group 4 of the Vraska deck, CR 400.7): a permanent that entered the battlefield during this turn (the engine's `enteredThisTurn`). */
  readonly enteredThisTurn?: true;
  /** "any target": a creature, player, planeswalker or battle (CR 115.4). */
  readonly anyTarget?: boolean;
  /** The words the filter was read from, for diagnostics and templateOf. */
  readonly raw: string;
}

export type IrAmount =
  | { readonly kind: 'number'; readonly value: number; readonly span: Span }
  | { readonly kind: 'x'; readonly span: Span }
  // "for each creature you control"
  | { readonly kind: 'countOf'; readonly of: IrNoun; readonly span: Span }
  | { readonly kind: 'powerOf'; readonly of: IrNoun; readonly span: Span }
  // "equal to that card's mana value" (CR 202.3), stage P11
  | { readonly kind: 'manaValueOf'; readonly of: IrNoun; readonly span: Span }
  // "for each color among permanents you control" (stage P37, D-180, CR 105.2): the colors the permanents have between them, each once
  | { readonly kind: 'colorsAmong'; readonly of: IrNoun; readonly span: Span }
  // "for each time it was kicked" (CR 702.33c), stage P17; `who` is the word that says which object
  | { readonly kind: 'timesKicked'; readonly who: 'self' | 'it'; readonly span: Span }
  // "equal to the total life lost this way" (CR 702.101a), stage P21: what an earlier loss of life in the same text lost
  | { readonly kind: 'lifeLostThisWay'; readonly span: Span }
  // "equal to the life that player lost this turn" (Hashaton deck group 2, D-365, CR 119.3): the life the player the instruction affects lost this turn
  | { readonly kind: 'lifeLostThisTurn'; readonly span: Span }
  // Stage P28 (D-131): "equal to that creature's toughness", "for each +1/+1 counter on ~"
  | { readonly kind: 'toughnessOf'; readonly of: IrNoun; readonly span: Span }
  | {
      readonly kind: 'countersOn';
      readonly of: IrNoun;
      readonly counter: string;
      readonly span: Span;
    }
  // "the greatest power among creatures you control", "the total power of creatures you control"
  | {
      readonly kind: 'aggregate';
      readonly how: 'greatest' | 'total';
      readonly stat: 'power' | 'toughness' | 'manaValue';
      readonly of: IrNoun;
      /** "... as you cast this spell" (stage P32, D-147, CR 601.2d): read once, as the spell is cast, not as it resolves. */
      readonly asCast?: true;
      readonly span: Span;
    }
  // "the greatest mana value among your commanders" (stage P32, D-147, CR 903.3, 202.3)
  | { readonly kind: 'commanderManaValue'; readonly span: Span }
  // "for each time you've cast your commander from the command zone this game" (stage P68, D-229, CR 903.8)
  | { readonly kind: 'commanderCasts'; readonly span: Span }
  // "the number of profit votes" (stage P44, D-195, CR 701.38a): the votes for one option of a vote earlier in the text, the option as the card writes it
  | { readonly kind: 'votesFor'; readonly option: string; readonly span: Span }
  // "your devotion to black" (CR 700.5), "the number of colors in your commanders' color identity" (CR 903.4)
  | { readonly kind: 'devotion'; readonly colors: readonly string[]; readonly span: Span }
  | { readonly kind: 'commanderColors'; readonly span: Span }
  // "half the number of Zombies you control, rounded down" (CR 107.1a: the rounding is stated)
  | {
      readonly kind: 'half';
      readonly of: IrAmount;
      readonly round: 'down' | 'up';
      readonly span: Span;
    }
  // "twice the number of ...", "2 life for each ...": a whole number of 2 or more times an amount
  | {
      readonly kind: 'multiple';
      readonly factor: number;
      readonly of: IrAmount;
      readonly span: Span;
    }
  // "the number of cards in your hand minus 4" (D-321, CR 107.1b: a negative result counts as 0): a whole number of 1 or more taken away
  | { readonly kind: 'minus'; readonly of: IrAmount; readonly by: number; readonly span: Span }
  // "the number of Zombies on the battlefield plus the number of Zombie cards in all graveyards"
  | { readonly kind: 'sum'; readonly of: readonly IrAmount[]; readonly span: Span }
  // "for each opponent who has more cards in hand than you"
  | {
      readonly kind: 'opponentsWithMore';
      readonly stat: 'life' | 'cardsInHand' | 'creatures';
      readonly span: Span;
    }
  // "for each creature sacrificed this way", "for each opponent who drew a card this way": what an earlier
  // instruction of the same text did; `words` are the type words the text names (the lowering checks them
  // against that instruction), `who` which players the wording names ("opponent", "player" or none)
  | {
      readonly kind: 'thisWay';
      readonly what:
        | 'sacrificed'
        | 'destroyed'
        | 'destroyedOwnNontoken'
        | 'playersDrew'
        | 'tapped'
        | 'milledValue';
      readonly words: readonly string[];
      readonly who?: 'opponent' | 'player';
      /** "that many" (stage P30): the number of whatever the instruction before it did, whichever words the text uses. */
      readonly thatMany?: true;
      readonly span: Span;
    }
  // Stage P29 (D-133): "you gain that much life": the damage of the event that caused the trigger
  | { readonly kind: 'triggerDamage'; readonly span: Span }
  // Stage P34 (D-152, CR 701.57): "a number of tapped Treasure tokens equal to the difference" between 10 and the mana value of the card discovered
  | { readonly kind: 'shortfall'; readonly limit: number; readonly span: Span }
  // Stage P39 (D-184, CR 601.2h): "the amount of mana spent to cast it", "for each mana from an artifact source spent to cast it"; `fromType` is the
  // card type of the source ("artifact"), `who` the word for the spell
  | {
      readonly kind: 'manaSpent';
      readonly fromType?: string;
      /** "for each {S} spent to cast ~" (D-260, CR 107.4h): only the mana of snow sources. */
      readonly snow?: true;
      readonly who: 'self' | 'it';
      readonly span: Span;
    }
  // Stage P34 (D-152, CR 400.7): "for each of those cards that are still exiled", the cards an earlier instruction of the same text exiled
  | { readonly kind: 'exiledStillThere'; readonly span: Span };

export interface IrDuration extends IrNode {
  readonly kind: 'duration';
  readonly scope:
    | 'untilEndOfTurn'
    | 'untilYourNextTurn'
    | 'untilEndOfNextTurn'
    // "until your next end step" (stage P34, D-152, CR 611.2a): it ends as the next end step of the controller begins
    | 'untilYourNextEndStep'
    // "for as long as they remain exiled" (stage P41, D-188, CR 406.3): the permission of the cards an effect exiled, which ends only as they leave exile
    | 'whileExiled'
    // "for as long as you control ~" (stage P42, D-190, CR 611.2b): the control an effect gave ends as the permanent with the ability leaves or changes controller
    | 'whileYouControlSelf'
    // "for as long as ~ remains on the battlefield" (stage P50, D-207, CR 611.2b): the effect of an ability of a permanent ends as that permanent leaves
    | 'whileSelfRemains'
    | 'asLongAs'
    | 'thisTurn';
  /** "for as long as you control a Dragon" */
  readonly condition?: IrCondition;
}

export interface IrCondition extends IrNode {
  readonly kind: 'condition';
  readonly test: // if you control six or more lands
    | { readonly kind: 'control'; readonly noun: IrNoun; readonly atLeast?: IrAmount }
    // if you do
    | { readonly kind: 'didPrevious' }
    // "If the player doesn't" (stage P52, D-210): the player an earlier "may have you" sentence asked said no
    | { readonly kind: 'declined' }
    // "If a creature card was discarded this way", "if a noncreature card was discarded this way" (stage P52, D-210, CR 608.2c)
    | { readonly kind: 'discardedThisWay'; readonly creature: boolean }
    // "If you discarded an instant or sorcery card this way" (D-358, CR 608.2c, 701.9): what a discard before it in the same text did
    | { readonly kind: 'discardedSpellThisWay' }
    | { readonly kind: 'unlessPays'; readonly who: IrNoun; readonly cost: readonly IrCost[] }
    // D-258 (the Bruna deck, CR 118.12a): "unless you return an untapped Plains you control to its owner's hand": the `return` clause of one permanent the controller chooses
    | { readonly kind: 'unlessReturn'; readonly clause: IrClause }
    // "you have two or more opponents" (CR 102.1: the players you play against)
    | { readonly kind: 'opponentsAtLeast'; readonly atLeast: IrAmount }
    // "~ was kicked", "it was kicked" (CR 702.33d); `who` is the word the text used for the object
    | { readonly kind: 'kicked'; readonly who: 'self' | 'it' }
    // "you control a commander" (CR 903.3d), stage P13; stage P29: "you control your commander" (`yours`, CR 903.3)
    | { readonly kind: 'controlCommander'; readonly yours?: true }
    // Stage P29 (D-133): "you have 30 or more life", "you have at least 7 life more than your starting life total"
    // (`aboveStarting`, CR 119.1, 903.7)
    | { readonly kind: 'lifeTotal'; readonly compare: IrComparison; readonly aboveStarting?: true }
    // D-252 (the Bruna deck): "you gained 3 or more life this turn" (CR 119.3)
    | { readonly kind: 'lifeGainedThisTurn'; readonly atLeast: number }
    // D-318 (the Niv-Mizzet deck): "you've cast three or more spells this turn" (CR 601.2i)
    | { readonly kind: 'spellsCastThisTurn'; readonly atLeast: number }
    // D-271 (CR 706.2, 706.3a): "the result is 1", "the result is 4 or more": the die the roll before it in the same text rolled
    | { readonly kind: 'dieResult'; readonly compare: IrComparison }
    // D-271 (CR 113.6b, 603.4): "~ is in your graveyard": the card itself, in its owner's graveyard
    | { readonly kind: 'thisInYourGraveyard' }
    // D-278 (CR 701.42a, 712.4a): "you both own and control ~ and a creature named Bruna, the Fading Light": the card itself and a permanent of the type with that name
    | { readonly kind: 'ownsAndControlsNamed'; readonly name: string; readonly type: string }
    // "there are fewer than eight cards in your graveyard" (stage P68, D-229, CR 404.1): the cards in the graveyard of the controller
    | { readonly kind: 'cardsInGraveyard'; readonly compare: IrComparison }
    // "there are no cards in your library", "your library has no cards in it" (issue 25, D-331, CR 401.1): the cards in the library of the controller
    | { readonly kind: 'cardsInLibrary'; readonly compare: IrComparison }
    // "that player controls more lands than you" (stage P68, D-229, CR 603.4): the controller of the permanent the event is about has more of the stat; with a
    // trigger about a player (a step of an opponent's turn) the lowering reads it of that player instead (`triggerPlayerHasMore`)
    | { readonly kind: 'subjectControllerHasMore'; readonly stat: 'lands' | 'creatures' }
    // "~ is paired with another creature" (D-286, CR 702.95b): the permanent the ability is on is paired
    // (`who` is the word the text used for the permanent: `~`, or "it", which is the source only in an ability about it)
    | { readonly kind: 'paired'; readonly who: 'self' | 'it' }
    // "~ is attached to a creature" (stage P37, D-180, CR 301.5, 303.4): the permanent this one is attached to, against a filter (`creature`)
    | { readonly kind: 'attachedTo'; readonly filter: IrFilter }
    // "it's untapped", "~ is untapped": this permanent against a filter (stage P29, D-133)
    // (`who` is the word the text used for the permanent: `~`, or "it", which is the source only in an ability about it)
    | { readonly kind: 'thisMatches'; readonly filter: IrFilter; readonly who?: 'self' | 'it' }
    // Stage P30 (D-135): "if it's a Zombie card", "if it's an Angel" (CR 608.2c): an object an earlier instruction of the
    // text moved or named, against a filter that says what it is (never where it is: no zone, controller or owner)
    | { readonly kind: 'objectMatches'; readonly who: IrNoun; readonly filter: IrFilter }
    // "you put a Cave onto the battlefield this way" (stage P37, D-180, CR 608.2c): what the instruction before it put onto the battlefield is, against
    // a filter that says what it is (no zone, controller or owner)
    | { readonly kind: 'putThisWay'; readonly filter: IrFilter }
    // "if the gift was promised" (CR 702.174k, stage P30)
    | { readonly kind: 'giftPromised' }
    // "an opponent controls four or more nonbasic lands" (stage P30): some one opponent controls that many
    | { readonly kind: 'opponentControls'; readonly noun: IrNoun; readonly atLeast: IrAmount }
    // "it escaped" (CR 702.138b), stage P23: the permanent was cast with its escape cost; the rule that reads
    // it is the "unless" of a sacrifice (`condition.unless-escaped`), which wraps it in `not`
    | { readonly kind: 'escaped' }
    // Stage P28 (D-131): "if creatures you control have total power 8 or greater", "if you have seven or more
    // creature cards in your graveyard", "if an opponent controls more creatures than you": any amount of the
    // game compared with a number
    | { readonly kind: 'amountIs'; readonly amount: IrAmount; readonly compare: IrComparison }
    // "if you're the monarch", "if an opponent is the monarch" (CR 725.1: a designation); `not` for the negative
    | {
        readonly kind: 'designation';
        readonly who: IrNoun;
        readonly designation: 'monarch' | 'citysBlessing';
      }
    // Stage P31 (D-140): "you control the artifact with the greatest mana value or tied for the greatest mana value" (CR 603.4): one of
    // the permanents of the kind, whoever controls them, with the greatest value of the stat, a tie counting for each tied one
    | {
        readonly kind: 'controlsGreatest';
        readonly noun: IrNoun;
        readonly stat: 'power' | 'toughness' | 'manaValue';
      }
    // Stage P33 (D-150): "if it had counters on it" (CR 603.10a): the permanent that left the battlefield had a counter (of the kind named,
    // when the text names one), as it last was; the lowering folds it into the filter of the trigger about the permanent
    | { readonly kind: 'hadCounters'; readonly counter?: string }
    // Stage P33 (D-150): "none of those creatures attacked you" is `not` of this (CR 508.1b): at least one creature of the attackers that
    // triggered the ability was declared as attacking its controller as a player
    | { readonly kind: 'attackersAttackedYou' }
    // Stage P33 (D-150): "you control three or more lands with the same name": some name is shared by at least that many of the permanents
    // that match (CR 201.2: two objects have the same name when their names are identical)
    | { readonly kind: 'sameName'; readonly noun: IrNoun; readonly atLeast: number }
    // Stage P34 (D-152): "it's attacking the player with the most life or tied for most life" (CR 702.105a), "you attacked with creatures with
    // total power 6 or greater this combat" (CR 508.1), "an opponent was dealt 7 or more damage this turn" (CR 120.3) and "two or more
    // nonland permanents entered the battlefield under your control this turn" (CR 400.7: the turn log)
    | { readonly kind: 'attackingMostLife' }
    | { readonly kind: 'attackersTotalPower'; readonly atLeast: number }
    // Stage P41 (D-188): "it's your main phase" (CR 505.1): the precombat or the postcombat main phase of a turn of the controller
    | { readonly kind: 'yourMainPhase' }
    // Stage P49 (D-206): "during your turn" (CR 611.3a)
    | { readonly kind: 'yourTurn' }
    // Stage P49 (D-206): "at least four mana was spent to cast it" (CR 601.2h), "a card left your graveyard this turn" (CR 400.7), "~ was cast from a graveyard" (CR 601.2a)
    // `ofTriggerSpell` (issue 25): said as "that spell" ("five or more mana was spent to cast that spell"); lowered in a trigger about a spell that was cast only.
    | { readonly kind: 'manaSpentAtLeast'; readonly count: number; readonly ofTriggerSpell?: true }
    | { readonly kind: 'cardLeftYourGraveyard' }
    // Stage P50 (D-207): "it targets a tapped creature" (CR 601.2c, 601.2f)
    | { readonly kind: 'spellTargets'; readonly noun: IrNoun }
    | { readonly kind: 'castFromZone'; readonly zone: 'graveyard' }
    // Stage P45 (D-197): "you control your Ring-bearer" (CR 701.54e)
    | { readonly kind: 'controlsRingBearer' }
    | {
        readonly kind: 'playerDealtDamage';
        readonly who: 'you' | 'opponent';
        readonly atLeast: number;
      }
    | {
        readonly kind: 'enteredThisTurn';
        readonly count: number;
        readonly types?: readonly string[];
        readonly notTypes?: readonly string[];
        readonly token?: boolean;
      }
    // D-063: "if A and B", "if A or B", "if not A"
    | { readonly kind: 'and' | 'or'; readonly terms: readonly IrCondition[] }
    | { readonly kind: 'not'; readonly term: IrCondition }
    // recognised as a condition, not understood
    | { readonly kind: 'raw'; readonly text: string };
}

export type IrCost = IrNode &
  (
    | { readonly kind: 'mana'; readonly symbols: readonly string[] }
    | { readonly kind: 'tap' }
    | { readonly kind: 'untap' }
    // `count` is "Sacrifice two artifacts" (stage P29, D-133): 2 or more, a plural noun
    | { readonly kind: 'sacrifice'; readonly what: IrNoun; readonly count?: number }
    // "Tap three untapped Zombies you control" (stage P29, D-133, CR 118.3): `filter` of the permanents, `count` how many
    | {
        readonly kind: 'tapPermanents';
        readonly what: IrNoun;
        readonly count: number;
      }
    | { readonly kind: 'payLife'; readonly amount: IrAmount }
    // Blight 1 (Danitha deck, D-1252, CR 701.68a): `count` -1/-1 counters on a creature the player controls
    | { readonly kind: 'blight'; readonly count: number }
    // "Pay X life" (stage P16): the amount is announced as X (CR 107.3a), not a number
    | { readonly kind: 'payXLife' }
    // "Discard X cards" (Hashaton group 10, D-386, CR 107.3a, 701.9): as many cards as the X announced; an additional cost of a spell
    | { readonly kind: 'discardX' }
    // "Discard a card", "Discard two cards" (stage P13): the player chooses, so only a count
    // `filter` and `named` (stage P50, D-207): "Discard a legendary card", "Discard another card named ~": the cards the cost may discard, by a supertype or a card
    // type, or by the name of the permanent with the ability
    | {
        readonly kind: 'discard';
        readonly amount: IrAmount;
        readonly filter?: IrFilter;
        readonly named?: true;
      }
    | { readonly kind: 'exile'; readonly what: IrNoun }
    // "Discard this card" (stage P68, D-229, CR 701.9, 113.6b): the card itself, from the hand; "Exile ~" (CR 118.1): the permanent itself
    | { readonly kind: 'discardThis' }
    | { readonly kind: 'exileThis' }
    // "Mill a card" (stage P51, D-208, CR 701.17): the cost of a mana ability
    | { readonly kind: 'mill'; readonly amount: IrAmount }
    // "{E}{E}" (stage P51, D-209, CR 107.14): energy counters paid by the player that an "unless you pay" asks
    | { readonly kind: 'energy'; readonly count: number }
    | { readonly kind: 'removeCounters'; readonly counter: string; readonly amount: IrAmount }
    // "Put a page counter on ~" (stage P31, CR 118.3, 122.1): counters put on the permanent itself as a cost
    | { readonly kind: 'putCounters'; readonly counter: string; readonly count: number }
    // "Return an artifact you control to its owner's hand", "Return ~ to its owner's hand" (stage P31, CR 118.3): `count` of them
    | { readonly kind: 'returnToHand'; readonly what: IrNoun; readonly count: number }
    // The loyalty symbol of a loyalty ability, "+1", "−2", "0", "−X" (stage P47, D-202, CR 606.4, 606.5): a change, or 'x' for "−X"
    | { readonly kind: 'loyalty'; readonly change: number | 'x' }
  );

/** "A, B and C" as the operands of one verb: lowered to one effect per item, in order. */
export interface IrNounList extends IrNode {
  readonly kind: 'nounList';
  readonly items: readonly IrNoun[];
}

/** A counter by name: "+1/+1", "-1/-1", "charge". */
export interface IrCounterSpec extends IrNode {
  readonly kind: 'counterSpec';
  readonly name: string;
}

/** Mana a clause adds: the symbols as written ({G}{G}), or a choice. */
export interface IrManaSpec extends IrNode {
  readonly kind: 'manaSpec';
  readonly what:
    | { readonly kind: 'symbols'; readonly symbols: readonly string[] }
    // "{U} or {B}", "{R}, {G}, or {W}": one mana of a color chosen from at least two (CR 106.1b)
    | { readonly kind: 'oneOf'; readonly colors: readonly string[] }
    // "one mana of any color"; stage P32 (D-147): "two mana of any one color" has `count` 2 (CR 106.1b: every mana the same color)
    | { readonly kind: 'anyColor'; readonly count?: number }
    // one mana of any color in your commander's color identity (CR 903.4)
    | { readonly kind: 'commanderIdentity' }
    // "one mana of the chosen color" (stage P33, D-150, CR 106.1b, 607.2d): the color the permanent chose as it entered
    | { readonly kind: 'chosenColor' }
    // "two mana in any combination of colors" (stage P34, D-152, CR 106.1b, 605.3b): `count` mana, each of a color chosen on its own
    // stage P34; issue 25 (D-319): "two mana of different colors" is `distinct` (no color twice)
    | { readonly kind: 'anyCombination'; readonly count: number; readonly distinct?: true }
    // "an amount of mana of that color equal to your devotion to that color" (CR 605.3b, 700.5): the color of the sentence "Choose a color." before it
    | { readonly kind: 'devotionToChosenColor' }
    // "{R}{R}, {R}{W}, or {W}{W}" (stage P14): exactly one of the listed combinations, each a run of
    // symbols as written
    | { readonly kind: 'combination'; readonly options: readonly (readonly string[])[] }
    /**
     * "one mana of any color that a land an opponent controls could produce" (stage P14, CR 106.7):
     * one mana of a type that a land `whose` could produce; `anyType` says "any type", which keeps
     * colorless, instead of "any color".
     */
    | {
        readonly kind: 'couldProduce';
        readonly whose: 'you' | 'opponent';
        readonly anyType: boolean;
      };
}

/**
 * One half of a power and toughness change: a number ("+1", "-2", "+0") or X with its sign (stage P20,
 * D-115: "+X" is `{ kind: 'x', sign: 1 }`, "-X" `{ kind: 'x', sign: -1 }`).
 */
export type IrPtTerm = number | { readonly kind: 'x'; readonly sign: 1 | -1 };

/** A power and toughness change as written: "+1/+1", "-2/-2", "+3/-1", "+X/+0", "-X/-X" (CR 613.4c). */
export interface IrPtChange extends IrNode {
  readonly kind: 'ptChange';
  readonly power: IrPtTerm;
  readonly toughness: IrPtTerm;
}

/** A name the text gives (D-278, CR 201.2): "meld them into Brisela, Voice of Nightmares". */
export interface IrNameArg extends IrNode {
  readonly kind: 'name';
  readonly name: string;
}

/** A yes or no a phrase says by being there or not: "reveal it", ", then shuffle". */
export interface IrFlag extends IrNode {
  readonly kind: 'flag';
  readonly value: boolean;
}

/** Where something goes: "to its owner's hand", "to the battlefield tapped". */
export interface IrZoneSpec extends IrNode {
  readonly kind: 'zoneSpec';
  readonly zone: 'hand' | 'battlefield' | 'graveyard' | 'library' | 'exile';
  /**
   * The zone the card comes from when the text says it, for an ability of the card itself: "Return this card from your
   * graveyard to the battlefield" (stage P30, CR 113.6b).
   */
  readonly from?: 'graveyard';
  /** "with a +1/+1 counter on it" (stage P30, CR 122.6): the card enters the battlefield with these counters. */
  readonly counters?: { readonly counter: string; readonly count: number };
  /**
   * Whose zone, when the text says: "your hand", "its owner's hand". For the battlefield, who
   * controls what enters: "under your control", "under its owner's control" (CR 110.2a); absent when
   * the text says nothing, which means the player performing the effect.
   */
  readonly whose?: 'you' | 'owner';
  readonly tapped?: boolean;
  /** "onto the battlefield tapped and attacking" (stage P34, D-152, CR 508.4): the permanent enters attacking, never declared as an attacker. */
  readonly attacking?: true;
  /** `top`, `bottom`, or "third from the top" as 3 (stage P30, CR 401.7): a number of 2 or more. */
  readonly position?: 'top' | 'bottom' | number;
  /** How many of the cards a search found go here: "put one onto ... and the other into ...". */
  readonly count?: number;
}

/** A keyword the clause grants, as the words spell it: "flying", "first strike" (CR 613.1f). */
export interface IrKeywordArg extends IrNode {
  readonly kind: 'keywordName';
  readonly name: string;
}

/** Keywords as the words spell them ("haste", "first strike"), the grant of "except it has haste" (stage P34, D-152, CR 707.9b). */
export interface IrKeywordList extends IrNode {
  readonly kind: 'keywordList';
  readonly names: readonly string[];
}

/** The colors an object becomes, as color words ("blue"); empty for "colorless" (CR 105.3). */
export interface IrColorSpec extends IrNode {
  readonly kind: 'colorSpec';
  readonly colors: readonly string[];
}

/**
 * The types an object becomes: creature types ("Frog", "Elk Wizard", CR 205.3m) and, since stage P6,
 * card types ("artifact creature", CR 205.1b). `additive` says that the object keeps every type it
 * had: the text says "in addition to its other types", or says "artifact creature" (CR 205.1b).
 */
export interface IrTypeList extends IrNode {
  readonly kind: 'typeList';
  readonly subtypes: readonly string[];
  readonly cardTypes?: readonly string[];
  readonly additive?: boolean;
}

/** "base power and toughness 1/1": the numbers as written, not a change (CR 613.4b). */
export interface IrBasePt extends IrNode {
  readonly kind: 'basePt';
  readonly power: number;
  readonly toughness: number;
}

/**
 * The damage a prevention effect covers (CR 615): "all damage", "all combat damage", "all noncombat
 * damage" (`amount` `'all'`), or "the next 3 damage" and "the next 2 combat damage" (a number,
 * CR 615.7). `scope` is the kind of damage named, `'all'` when the text names none.
 */
export interface IrDamageScope extends IrNode {
  readonly kind: 'damageScope';
  readonly scope: 'all' | 'combat' | 'noncombat';
  readonly amount: 'all' | number;
}

export interface IrDestinationList extends IrNode {
  readonly kind: 'destinations';
  readonly items: readonly IrZoneSpec[];
}

/** A nested ability in quotes, parsed by the same pipeline (Goldspan's grant, token abilities). */
export interface IrQuotedAbility extends IrNode {
  readonly kind: 'quoted';
  readonly ability: IrAbility;
  /** The text inside the quotes as written, for what shows it (an emblem's rules text, stage P47). */
  readonly text?: string;
}

export interface IrToken extends IrNode {
  readonly kind: 'token';
  // CR 111.10
  readonly predefined?: 'Treasure' | 'Food' | 'Clue' | 'Map' | 'Blood';
  readonly power?: number;
  readonly toughness?: number;
  readonly colors?: readonly string[];
  readonly types?: readonly string[];
  readonly subtypes?: readonly string[];
  // 'with "..."'
  readonly abilities?: readonly IrQuotedAbility[];
  /** "with flying", "with flying and vigilance" (stage P15): the keywords as written, lowercase. */
  readonly keywords?: readonly string[];
  /** "named Kobolds of Kher Keep" (stage P39, D-184, CR 111.4): the name the token is given, as written; left out the name is its creature types. */
  readonly named?: string;
  /** "Smaug, a legendary 6/6 red Dragon creature token" (stage P45, D-197, CR 205.4): the token has the supertype legendary. */
  readonly legendary?: true;
  /** "a token that's a copy of target creature" (CR 707.2): the permanent copied. */
  readonly copyOf?: IrNoun;
  /**
   * "..., except it's a 4/4 black Zombie" (Hashaton deck group 5, D-382, CR 707.9b): what the copy is instead of what it copies, with `copyOf`: its power and toughness, its colors
   * (as color words; empty for colorless) and its creature types (instead of its own, CR 205.3d).
   */
  readonly copyExcept?: {
    readonly power: number;
    readonly toughness: number;
    readonly colors: readonly string[];
    readonly subtypes: readonly string[];
  };
  /** "create two tapped Treasure tokens" (stage P28, CR 110.5b): the tokens enter tapped. */
  readonly tapped?: true;
  readonly count: IrAmount;
  /**
   * Set by bind() on a token made one at a time ("create a 2/2 red Dwarf creature token"; stage P48, D-205): the name later words use for it ("that token",
   * "attach ~ to it"), which the lowering reads as the engine's `moved` after the instruction.
   */
  readonly ref?: string;
}

/** The costs a clause names: "unless its controller pays {3}" (CR 118.12), stage P11. */
export interface IrCostList extends IrNode {
  readonly kind: 'costList';
  readonly costs: readonly IrCost[];
}

/** The restriction a `restrict` clause gives its object (stage P12), as the clause argument. */
export interface IrRestrictionArg extends IrNode {
  readonly kind: 'restrictionKind';
  readonly restriction: IrRestrictionKind;
}

/** What an "As ~ enters, choose ..." replacement asks (stage P15, D-100): a creature type or a color. */
export interface IrChoiceArg extends IrNode {
  readonly kind: 'choiceKind';
  /** `cardType` (Hashaton deck group 6, D-376, CR 205.2a): "As this creature enters, choose a card type." */
  readonly what: 'creatureType' | 'color' | 'option' | 'cardType';
  /** `option` (stage P34, D-152, CR 614.12, 607.2d): "As ~ enters, choose Khans or Dragons", the names the card gives, as it writes them. */
  readonly options?: readonly string[];
}

/**
 * What "As ~ enters, you may reveal a Mountain or Plains card from your hand" or "you may behold a Jace" asks (stage P51, D-208, CR 701.20, 701.4): the words
 * for the dialog, the subtypes of the cards (one or two) and whether it is a behold.
 */
export interface IrRevealSpec extends IrNode {
  readonly kind: 'revealSpec';
  readonly words: string;
  readonly types: readonly string[];
  readonly behold: boolean;
}

export type IrArg =
  | IrNoun
  | IrRevealSpec
  | IrNounList
  | IrAmount
  | IrToken
  | IrCounterSpec
  | IrManaSpec
  | IrZoneSpec
  | IrPtChange
  | IrKeywordArg
  | IrKeywordList
  | IrColorSpec
  | IrTypeList
  | IrBasePt
  | IrDamageScope
  | IrFlag
  | IrNameArg
  | IrQuotedAbility
  | IrDestinationList
  | IrCostList
  | IrRestrictionArg
  | IrChoiceArg;

/** One instruction: a verb with named arguments, plus the modifiers that apply to any verb. */
export interface IrClause extends IrNode {
  readonly kind: 'clause';
  /** 'draw' | 'destroy' | 'exile' | 'createToken' | 'search' | 'dealDamage' | 'addCounters' | ... */
  readonly verb: string;
  readonly args: Readonly<Record<string, IrArg>>;
  /** "you may" */
  readonly optional: boolean;
  /** "if you control ...", "if you do", "unless ..." */
  readonly condition?: IrCondition;
  /** "until end of turn" */
  readonly duration?: IrDuration;
  /** How it joins the next clause. */
  readonly connector?: 'and' | 'then';
}

export interface IrSentence extends IrNode {
  readonly kind: 'sentence';
  readonly clauses: readonly IrClause[];
  /**
   * "If ~ was kicked, ...": the whole sentence is followed only when the condition holds, as its
   * instruction comes up (CR 608.2c). Read only in the body of a spell or a triggered ability.
   */
  readonly condition?: IrCondition;
  /**
   * The sentence ends "... instead": when its condition holds it replaces the sentence before it
   * (CR 614.1a). Only with `condition`.
   */
  readonly instead?: boolean;
  /**
   * The sentence starts "Otherwise, " (D-253, CR 608.2c): what the sentence before it, a conditional instruction, does when its condition does not hold. It has no
   * condition of its own.
   */
  readonly otherwise?: true;
  /**
   * "..., where X is the number of Zombies you control." (stage P28, CR 107.3c): what X is wherever the clauses of this
   * sentence read it. The lowering writes the amount into each slot that says X; nothing is stored.
   */
  readonly where?: IrAmount;
  /**
   * "At the beginning of your next end step, ~ deals 2 damage to each opponent ..." (stage P34, D-152, CR 603.7): the sentence is what a delayed
   * triggered ability does, created as the sentence is read, at the next time the step begins (`whose` the player whose step it is).
   */
  readonly delayed?: {
    /**
     * `thatCombat` (stage P41, D-188, CR 603.7, 500.8): "At the beginning of that combat, untap all creatures you control": the combat phase the
     * sentence before it added, which the lowering folds into the engine's `extraCombat` as what happens at its beginning.
     */
    readonly step: 'endStep' | 'thatCombat' | 'nextCast';
    readonly whose: 'you' | 'each';
    /**
     * `nextCast` (D-336, CR 603.7, 603.7a): "When you next cast an instant or sorcery spell this turn, copy that spell": the spell the delayed trigger waits for,
     * described by a filter of spells, and the subject (`triggerSubject`) of what the sentence does (the binding pass seeds it as the first antecedent).
     */
    readonly spell?: IrNoun;
  };
  /**
   * "When you do, ..." (stage P30, CR 603.12): a reflexive triggered ability, created by the "you may" sentence before it
   * when the player did what it offered. Read only in the body of a triggered ability.
   */
  readonly reflexive?: true;
  /**
   * "Each player may discard a card." and "Target opponent may have you draw three cards." (stage P52, D-210, CR 608.2d, 101.4): the players the sentence asks
   * whether to do its clauses. `haveYou` says that the clauses are done by the controller ("may have you draw"), otherwise by the player asked. The clauses are
   * not `optional`: the question is this node's. Only in the body of a triggered ability.
   */
  readonly mayBy?: { readonly who: IrNoun; readonly haveYou: boolean };
}
export interface IrBody extends IrNode {
  readonly kind: 'body';
  readonly sentences: readonly IrSentence[];
}

export interface IrTrigger extends IrNode {
  readonly kind: 'trigger';
  /** 'enters' | 'dies' | 'attacks' | 'sacrifice' | 'landfall' | 'upkeep' | 'cast' | 'becomesTarget' | 'chapter' */
  readonly event: string;
  /** What enters, dies, attacks ("~", "another creature you control"). */
  readonly subject?: IrNoun;
  /** Who does it ("you sacrifice", "a player sacrifices"). */
  readonly actor?: IrNoun;
  readonly args: Readonly<Record<string, IrArg>>;
  /** "enters or attacks": one ability, two events (CR 603.2c). */
  readonly alternatives?: readonly IrTrigger[];
  /** 'step': which step or phase the trigger is at the beginning of (stage P18, CR 500.2). */
  readonly step?: 'draw' | 'main1' | 'beginCombat' | 'combatEnd' | 'main2' | 'upkeep' | 'endStep';
  /** 'drawn': the nth card the player draws each turn ("your second card each turn", CR 121.1). */
  readonly nth?: number;
  /** 'attacks' alone (stage P21, CR 506.5): it triggers only when the creature is the only one declared as an attacker. */
  readonly alone?: true;
  /** 'becomesTarget' (stage P36, D-178, CR 603.2): "becomes the target of a spell", only a spell triggers it, not an ability. */
  readonly spellOnly?: true;
  /**
   * 'dealsCombatDamage': what the damage went to (stage P18, CR 120.2a); none is "any". 'noncombatDamageDealt' (issue 25, D-333, CR 120.2b): the player
   * damaged, `player` or `opponent` (never a creature). `playerOrPlaneswalker` (D-373): "to a player or planeswalker".
   */
  readonly damaged?: 'player' | 'opponent' | 'creature' | 'playerOrPlaneswalker';
  /** 'discarded': "another card" (D-374), a card other than the one with the ability. */
  readonly another?: true;
  /** 'dealsCombatDamage' to a player: the player, so that "that player" has an antecedent. */
  readonly recipient?: IrNoun;
  /**
   * 'attacks' at someone (stage P29, D-133, CR 508.1b): "attacks you" (`you`) or "attacks you or a planeswalker you control"
   * (`youOrPlaneswalkers`); left out, an attack at anyone.
   */
  readonly at?: 'you' | 'youOrPlaneswalkers';
  /** 'dealtDamage': "is dealt combat damage" rather than "is dealt damage" (stage P29, D-133). */
  readonly combat?: true;
  /** 'enters': "enters untapped" (`false`) or "enters tapped" (`true`), how the permanent entered (stage P30, CR 603.6a). */
  readonly entersTapped?: boolean;
  /**
   * 'leavesBattlefield': the zones it went to when the text says them: "dies or is put into exile from the battlefield" is
   * graveyard and exile, "is put into exile from the battlefield" exile alone (stage P30, CR 700.4).
   */
  readonly to?: readonly ('graveyard' | 'exile')[];
  /** 'chapter': the chapter numbers of the symbol, as written ("I, II" is [1, 2]; CR 714.2a, 714.2c). */
  readonly chapters?: readonly number[];
  /** 'state': "there are four or more page counters on ~" (stage P31, CR 603.8), the game state that triggers it. */
  readonly condition?: IrCondition;
  /** 'enters': "enters during the declare attackers step" (stage P31, CR 506.1): the combat step it must enter in. */
  readonly during?:
    | 'beginningOfCombat'
    | 'declareAttackers'
    | 'declareBlockers'
    | 'combatDamage'
    | 'endOfCombat';
  /** 'tappedForMana': "for {C}" (stage P31, CR 106.12): the type of mana the tapped permanent made; left out for "for mana". */
  readonly mana?: string;
  /**
   * 'combatDamageBatch': "two or more ..." (stage P31, CR 603.2c): the fewest sources; left out for "one or more". 'attackBatch' (stage
   * P33, D-150, CR 508.1): the fewest attackers declared that match `subject` (all of them when it is left out).
   */
  readonly atLeast?: number;
  /**
   * 'lifeGained': "for the first time each turn" (stage P33, D-150, CR 119.9): only the first gain of the player in the turn. Stage P34 (D-152,
   * CR 508.1, 500.8): 'attacks' "for the first time each turn", only the first time the creature was declared as an attacker this turn.
   */
  readonly firstEachTurn?: true;
  /**
   * 'countersAdded': the kind of counter ("+1/+1", "page"), none for "counters" of any kind (stage P33, D-150, CR 122.6); `by` is who put
   * them: `you` ("Whenever you put one or more +1/+1 counters on ~") or `any` ("Whenever one or more +1/+1 counters are put on ~").
   * 'noncombatDamageDealt' (issue 25, D-333): whose source dealt the damage, `you` ("a source you control") or `any` ("a source").
   */
  readonly counter?: string;
  readonly by?: 'you' | 'any';
  /**
   * 'attacks' "while you don't control another Dinosaur" (stage P32, D-147, CR 603.2): a condition that is part of the event itself,
   * read once as it happens (not an intervening "if", CR 603.4, which is read again as the ability resolves).
   */
  readonly whileCondition?: IrCondition;
}

export interface IrRestriction extends IrNode {
  readonly kind: 'restriction';
  /** Activate only as a sorcery. */
  readonly timing?: 'sorcery';
  /** Activate only once each turn. */
  readonly perTurn?: number;
  /** "Activate only if you control a Swamp." (stage P14, CR 602.5b): the test, read like any other. */
  readonly condition?: IrCondition;
  /**
   * "This ability costs {4} less to activate if an opponent controls four or more nonbasic lands." (stage P30, CR 601.2f,
   * 602.2b): `amount` generic mana less when the condition holds as the ability is activated.
   */
  readonly costReduction?: { readonly amount: IrAmount; readonly condition: IrCondition };
  /**
   * "This ability costs {1} less to activate for each other artifact you control." (stage P31, CR 601.2f, 602.2b): generic mana less by
   * an amount that reads the game as the ability is activated (a count, or a multiple of one for "{2} less for each").
   */
  readonly costReducedBy?: IrAmount;
}

/** What a static ability or a `restrict` clause says its subject can't or must do (D-094). */
export type IrRestrictionKind =
  | 'cantBlock'
  // "Enchanted creature can't attack or block" (Danitha deck, D-1252, CR 508.1a): only of the permanent an Aura or Equipment is attached to.
  | 'cantAttack'
  | 'cantBeBlocked'
  | 'attacksEachCombat'
  | 'doesntUntap'
  | 'cantBeCountered'
  // "can't be blocked by more than one creature" (stage P29, D-133, CR 509.1b)
  | 'cantBeBlockedByMoreThanOne'
  | 'mustBeBlocked';

export type IrStaticEffect =
  | { readonly kind: 'pt'; readonly power: number; readonly toughness: number }
  /**
   * "gets +1/+1 for each artifact you control", "get -1/-1 for each ..." (stage P20, D-115, CR 611.3a):
   * the numbers are the change for each object counted (a step of 0 leaves that stat alone), `count`
   * what is counted (`amount.for-each`).
   */
  | {
      readonly kind: 'ptCount';
      readonly power: number;
      readonly toughness: number;
      readonly count: IrAmount;
    }
  /**
   * "Each creature you control gets +1/+0 for each time it has attacked this turn" (stage P41, D-188, CR 508.1, 611.3a): +1 to each stat whose flag is
   * set, for each time the creature the effect affects was declared as an attacker this turn (the engine's `timesAttacked`).
   */
  | { readonly kind: 'ptTimesAttacked'; readonly power: boolean; readonly toughness: boolean }
  /**
   * "~'s power and toughness are each equal to the number of cards in your hand", "~'s power is equal to
   * ..." (stage P20, CR 604.3, 208.2a): a characteristic-defining ability; `stats` is what the text
   * defines and `count` the number it is equal to (`amount.number-of`).
   */
  | {
      readonly kind: 'definesPt';
      readonly stats: 'both' | 'power' | 'toughness';
      readonly count: IrAmount;
    }
  | { readonly kind: 'grantKeyword'; readonly keyword: string; readonly params?: readonly IrArg[] }
  /**
   * `has protection from red and from blue` (stage P70, D-259, CR 702.16): protection from the colors the statement names (`colors`, color words as
   * written, lowercase) or, when `commanderIdentity` is set, "each color that's not in your commander's color identity" (CR 903.4, 903.4f). One of the two.
   */
  | {
      readonly kind: 'grantProtection';
      readonly colors?: readonly string[];
      readonly commanderIdentity?: true;
      /** "protection from the chosen card type" (Hashaton deck group 6, D-376, CR 702.16a): the card type the source of the ability chose as it entered. */
      readonly chosenCardType?: true;
    }
  /** `has "{T}: Add {G}."` (stage P14): a quoted mana ability, read as an activated ability. */
  | { readonly kind: 'grantAbility'; readonly ability: IrQuotedAbility }
  /**
   * `has "Sacrifice ~: Draw a card."`: a quoted ability that is not a mana ability is recognised as
   * granted but its text is not read (stage P3), and lowering never runs it.
   */
  | { readonly kind: 'grantQuoted'; readonly text: string }
  /**
   * "can't block", "can't be blocked", "attacks each combat if able", "doesn't untap during ...",
   * "can't be countered" (stage P12): the subject has the restriction while the ability applies.
   */
  | { readonly kind: 'restriction'; readonly restriction: IrRestrictionKind }
  | { readonly kind: 'noMaxHandSize' }
  /** "~ is the chosen type in addition to its other types." (stage P15, D-100, CR 205.1b, 613.1d). */
  | { readonly kind: 'chosenType' }
  /**
   * "~ costs {1} less to cast for each creature on the battlefield", "Artifact spells you cast cost
   * {1} less to cast" (stage P13, CR 118.7, 601.2f): `amount` generic mana less. The statement's
   * subject is `~` (the spell itself) or the spells described (`det` `each`, `controller` you).
   */
  | { readonly kind: 'costReduction'; readonly amount: IrAmount }
  /**
   * "As an additional cost to cast ~, sacrifice a creature." (stage P13, CR 118.8): costs paid with
   * the spell's total cost. The statement's subject is `~`.
   */
  | {
      readonly kind: 'additionalCost';
      readonly costs: readonly IrCost[];
      /**
       * "..., sacrifice an artifact or creature or pay {4}." (stage P38, D-182, CR 118.8, 601.2b): the second way the cost is paid, when the line
       * says two ("A or B"); `costs` is then the first way, of one cost.
       */
      readonly orCosts?: readonly IrCost[];
    }
  /**
   * "If you control a commander, you may cast ~ without paying its mana cost." (stage P13, CR
   * 118.9): an alternative cost of the card itself. The statement's subject is `~`.
   */
  | { readonly kind: 'freeCast'; readonly condition?: IrCondition }
  /**
   * "You may play an additional land on each of your turns." and the forms with a number ("two additional lands")
   * and with "Each player ... on each of their turns" (stage P24, D-125, CR 305.2). The statement's subject is the
   * player (`you` or `eachPlayer`); `count` is the number of extra land plays.
   */
  | {
      readonly kind: 'additionalLandDrops';
      readonly count: number;
      readonly eachPlayer?: true;
    }
  /** "You may look at the top card of your library any time." (stage P24, D-125, CR 401.5). The subject is `you`. */
  | { readonly kind: 'lookAtTopOfLibrary' }
  /**
   * "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking
   * you." and "Creatures can't attack you or planeswalkers you control unless their controller pays {W/P} for each of
   * those creatures." (stage P24, D-125, CR 508.1d, 508.1h): the `cost` one attacker pays, a mana cost whose symbols
   * are plain, hybrid or Phyrexian (never X), and whether the planeswalkers of the controller are covered too.
   */
  | { readonly kind: 'attackTax'; readonly cost: IrCost; readonly planeswalkers?: true }
  /** "You may choose not to untap ~ during your untap step." (stage P24, D-125, CR 502.3). The subject is `~`. */
  | { readonly kind: 'optionalUntap' }
  /**
   * "Untap all creatures you control during each other player's untap step." (stage P68, D-229, CR 502.3). The subject is `you`; with `self` (D-320,
   * "Untap ~ during each other player's untap step.") the permanent itself untaps and the subject is `~`.
   */
  | { readonly kind: 'untapInOthersStep'; readonly self?: true }
  /** "You may cast this card from your graveyard." (stage P29, D-133, CR 113.6b). The subject is `~`; a condition makes it "as long as ...". */
  | { readonly kind: 'castFromGraveyard' }
  /** "can't be blocked by Walls", "can't be blocked by creatures with power 2 or less" (stage P31, CR 509.1b): the blockers excluded. */
  | { readonly kind: 'cantBeBlockedBy'; readonly blockers: IrFilter }
  /** "have base power and toughness 5/3" (stage P31, CR 613.4b): the subject's power and toughness are set in layer 7b. */
  | { readonly kind: 'basePt'; readonly power: number; readonly toughness: number }
  /** "are Juggernauts in addition to their other creature types" (stage P31, CR 205.1b, 613.1d): creature types added in layer 4. */
  | { readonly kind: 'addTypes'; readonly subtypes: readonly string[] }
  /** "You may cast artifact spells as though they had flash." (stage P31, CR 601.3b, 702.8a). The subject is `you`. */
  | { readonly kind: 'castAsThoughFlash'; readonly spells: IrFilter }
  /** "Your opponents can't cast spells with mana value 3 or less." (stage P70, D-282, CR 101.2, 601.2). The subject is `you`. */
  | { readonly kind: 'opponentsCantCastSpells'; readonly spells: IrFilter }
  /**
   * "As long as a card exiled with ~ is a creature card, ~ has the power, toughness, and creature types of the last creature card
   * exiled with it. It's still a Shapeshifter." (stage P31, CR 607.2a, 613.4b, 205.1a): what the card the linked ability exiled gives.
   * The subject is `~`.
   */
  | {
      readonly kind: 'takeFromLinkedExile';
      readonly from: IrFilter;
      readonly alsoSubtypes: readonly string[];
    }
  /**
   * "~ can't attack or block unless you control another creature with power 4 or greater" (stage P32, D-147, CR 508.1a, 509.1a): the
   * restrictions (`cantAttack`, `cantBlock` or both) that hold unless the condition does. The subject is `~`.
   */
  | {
      readonly kind: 'restrictUnless';
      readonly restrictions: readonly ('cantAttack' | 'cantBlock')[];
      readonly unless: IrCondition;
    }
  /**
   * "Equipped creature gets +X/+X, where X is the greatest mana value among your commanders" (stage P32, D-147, CR 613.4c): the stats named
   * get the amount, the others nothing; the amount follows the board (CR 611.3a).
   */
  | {
      readonly kind: 'ptAmount';
      readonly power: boolean;
      readonly toughness: boolean;
      readonly amount: IrAmount;
    }
  /** "Enchanted creature loses all abilities" (stage P32, D-147, CR 613.1f). The subject is the attached permanent. */
  | { readonly kind: 'loseAllAbilities' }
  /** "... is a green Elk creature": the colors are replaced (CR 105.3, 613.1e); an empty list is colorless. */
  | { readonly kind: 'setColors'; readonly colors: readonly string[] }
  /** "... is a green Elk creature": the card types and the creature types are replaced (CR 205.1a, 205.3d, 613.1d). */
  | {
      readonly kind: 'replaceTypes';
      readonly cardTypes: readonly string[];
      readonly subtypes: readonly string[];
    }
  /** "~ isn't a creature" (stage P68, D-229, CR 613.1d, 205.1a): the card types the subject loses. */
  | { readonly kind: 'loseTypes'; readonly cardTypes: readonly string[] }
  /** "If a triggered ability of ... triggers, that ability triggers an additional time." (stage P67, D-220, CR 603.2d). The subject is the permanents named. `cause` (stage P71, D-339): "If you casting or copying an instant or sorcery spell causes a triggered ability of a permanent you control to trigger, ..." names the spell whose cast or copy must cause the trigger. */
  | { readonly kind: 'doubleTriggers'; readonly cause?: IrNoun }
  /** "You have hexproof." (stage P33, D-150, CR 702.11b): the controller can't be the target of spells or abilities their opponents control. */
  | { readonly kind: 'playerHexproof' }
  /** "You can't lose the game" (stage P33, D-150, CR 104.3b). The subject is `you`. */
  | { readonly kind: 'cantLoseGame' }
  /** "your opponents can't win the game" (stage P33, D-150, CR 104.2). The subject is `you`. */
  | { readonly kind: 'opponentsCantWin' }
  /**
   * "You have protection from the chosen card type." (Hashaton deck group 6, D-377, CR 702.16a, 702.16b, 702.16e): the controller of the permanent has
   * protection from the card type it chose as it entered. The subject is `you`; the statement's `also` gives the same to "creatures you control".
   */
  | { readonly kind: 'playerProtection'; readonly quality: 'chosenCardType' }
  /** "Your opponents can't gain life." (Hashaton deck group 2, D-363, CR 119.7). The subject is `you`, the controller of the permanent. */
  | { readonly kind: 'cantGainLife'; readonly who: 'opponents' }
  /**
   * "Creatures you control can't have -1/-1 counters put on them." (Hashaton deck group 3, D-380, CR 122.6, 101.2): no counter of the kind named (a power and
   * toughness counter, "+1/+1" or "-1/-1") is put on the permanents the subject names. The subject is a group, `~` or the attached permanent.
   */
  | { readonly kind: 'cantHaveCounters'; readonly counter: string }
  /**
   * "Prevent all combat damage that would be dealt to ~." (stage P33, D-150, CR 615.1): the damage of the kind named that would be dealt to
   * the permanent is prevented. The subject is `~`.
   */
  | { readonly kind: 'preventDamageToThis'; readonly scope: 'all' | 'combat' | 'noncombat' }
  /**
   * "You can't cast ~ during your first, second, or third turns of the game." (stage P33, D-150, CR 101.2): the card can't be cast during
   * the first `turns` turns the player takes. The subject is `~`.
   */
  | { readonly kind: 'cantCastThis'; readonly turns: number }
  /**
   * "Creatures can't block unless their controller pays {1} for each of those creatures." (stage P33, D-150, CR 509.1b, 509.1d): `cost` is
   * what each blocker costs its controller; `whileAttacking` is "As long as ~ is attacking," before it. The subject is `creatures`.
   */
  | { readonly kind: 'blockTax'; readonly cost: IrCost; readonly whileAttacking?: true }
  /**
   * "Each other Angel you control enters with an additional +1/+1 counter on it [for each Angel you already control]." (stage P33, D-150,
   * CR 614.1c, 614.12): the permanents that enter and that the subject describes (the subject's `other` leaves this permanent out) get
   * `count` counters of the kind named, `count` a number or counted for the controller of this permanent without the entering one.
   */
  | {
      readonly kind: 'othersEnterWithCounters';
      readonly counter: string;
      readonly count: IrAmount;
    }
  /**
   * "You may pay {W} and tap four untapped creatures you control with flying rather than pay ~'s mana cost." (stage P33, D-150, CR 118.9, 118.3):
   * an alternative cost of the face that pays `cost` (mana) and taps `count` untapped permanents `what` describes. The subject is `~`.
   */
  | {
      readonly kind: 'tapAlternative';
      readonly cost: IrCost;
      readonly what: IrNoun;
      readonly count: number;
    }
  /**
   * "You don't lose unspent red mana as steps and phases end." (stage P34, D-152, CR 500.5, 106.4): mana of these colors (letters, `C` colorless) in
   * the controller's pool does not empty as a step or a phase ends. The subject is `you`.
   */
  | { readonly kind: 'unspentManaStays'; readonly colors: readonly string[] }
  /**
   * "You may cast creature spells with power 4 or greater from the top of your library. If you cast a creature spell this way, it gains haste until end
   * of turn." (stage P34, D-152, CR 601.3, 401.5, 702.10): the controller may cast the top card of their library when it is a spell `spells`
   * describes (as the card it is); `gainsHaste` is the second sentence. The subject is `you`.
   */
  | { readonly kind: 'castFromTop'; readonly spells: IrFilter; readonly gainsHaste: boolean }
  /**
   * "Once during each of your turns, you may play a land from your graveyard or cast a permanent spell with mana value 3 or less from your graveyard. If you do, it
   * gains "When this permanent is put into a graveyard from the battlefield, exile it and you gain 2 life."" and "... you may cast an artifact spell from your graveyard.
   * If you cast a spell this way, that artifact enters tapped." (stage P70, D-232, CR 601.2a, 305.1): `cast` describes the spells, `land` says a land may be played,
   * `entersTapped` and `gains` are what the permanent becomes has because of it. The subject is `you`.
   */
  | {
      readonly kind: 'graveyardPlay';
      readonly cast?: IrFilter;
      readonly land: boolean;
      readonly entersTapped: boolean;
      readonly gains?: IrQuotedAbility;
    }
  /**
   * "Lands you control enter untapped." (stage P37, D-180, CR 614.1c, 614.12): the permanents that enter under the controller's control and that
   * the subject describes (a plural group of the controller's own) enter untapped. The subject is the group.
   */
  | { readonly kind: 'groupEntersUntapped' }
  /**
   * "Your opponents can't cast spells during your turn." (stage P37, D-180, CR 101.2, 604.1): no opponent of the controller of the permanent casts a
   * spell in a turn of that controller. The subject is `you`; a condition ("As long as ~ is attached to a creature") may go with it.
   */
  | { readonly kind: 'opponentsCantCast' }
  /**
   * "Creature spells you control can't be countered." (stage P40, D-186, CR 101.2, 604.1): the spells of the controller that the subject describes
   * ("Creature spells you control", "Spells you control") are not countered while the permanent has the ability. The subject is the group of spells.
   */
  | { readonly kind: 'spellsCantBeCountered' }
  /**
   * "Damage isn't removed from ~ during cleanup steps." (stage P43, D-193, CR 514.2): the damage marked on the permanent stays through cleanup. The
   * subject is `~`.
   */
  | { readonly kind: 'keepsDamage' }
  | { readonly kind: 'raw'; readonly text: string };

/** One more subject of a statement and what it gets or has: "~ gets +2/+2 and creatures you control have vigilance". */
export interface IrStaticPart {
  readonly subject: IrNoun;
  readonly effects: readonly IrStaticEffect[];
}

export interface IrStatic extends IrNode {
  readonly kind: 'static';
  /** enchanted creature, creatures you control, Treasures you control */
  readonly subject: IrNoun;
  readonly effects: readonly IrStaticEffect[];
  /**
   * as long as ... (stage P29, D-133, CR 611.3a): the condition applies to every effect of the statement, and of `also`.
   */
  readonly condition?: IrCondition;
  /**
   * "As long as this card is in your graveyard, ..." (stage P34, D-152, CR 113.6b, 604.2): the ability works while its card is in its owner's
   * graveyard, and not on the battlefield; the words are no condition of the engine, they say where the ability works.
   */
  readonly functionsIn?: 'graveyard';
  /** Stage P29: the other subjects the statement names after the first ("~ gets +2/+2 and creatures you control have vigilance"). */
  readonly also?: readonly IrStaticPart[];
}

/** One keyword: `name` is the words as written, lowercased ("first strike"). */
export interface IrKeyword extends IrNode {
  readonly kind: 'keyword';
  readonly name: string;
  readonly params: readonly IrArg[];
  /** The cost of a keyword that has one: "Cycling {2}" (CR 702.29a). */
  readonly cost?: readonly IrCost[];
  /** "Equip Wizard {1}" (stage P67, D-220, CR 702.6c): the creature type of the creature the equip ability attaches to. */
  readonly quality?: string;
  /** "Equip commander {3}" (stage P70, D-259, CR 702.6c, 903.3): the equip ability attaches only to a creature that is a commander. */
  readonly commanderOnly?: true;
  /** "Protection from red and from blue" (stage P68, D-229, CR 702.16): the color words, as written, lowercase. */
  readonly colors?: readonly string[];
}

/**
 * How many modes a modal spell or ability has its controller choose (stage P19, CR 700.2): "choose one" is
 * 1 to 1, "choose two" 2 to 2, "choose one or both" 1 to 2 of exactly two modes, "choose one or more" 1 to
 * all of them (`'all'`). `widen` is "If you control a commander as you cast ~, you may choose both
 * instead": with the condition true, both of the two modes may be chosen.
 */
export interface IrModeChoice {
  readonly min: number;
  readonly max: number | 'all';
  /** The wording only fits this many modes ("both"): any other number of bullets is not read. */
  readonly exactly?: number;
  readonly widen?: IrCondition;
  /** "you may choose two instead" (D-297, CR 700.2): the widened maximum, when the wording says a number; without it, every mode ("both"). */
  readonly widenTo?: number;
  /** "Choose one that hasn't been chosen this turn" (stage P34, D-152, CR 700.2): a mode this permanent chose earlier this turn is not offered. */
  readonly notRepeatedThisTurn?: true;
  /**
   * "Choose three. You may choose the same mode more than once." (D-344, CR 700.2d): the same mode may be chosen more than once; `max` may be more than the number
   * of bullets, and `min` is 0 for "Choose up to three. You may choose the same mode more than once.".
   */
  readonly repeatable?: true;
}

/** The header line of a modal spell or ability ("Choose one —"), read by the `modal` rules. */
export interface IrModeHeader extends IrNode {
  readonly kind: 'modeHeader';
  readonly choose: IrModeChoice;
}

/**
 * The modes of a modal spell or ability (stage P19, CR 700.2): the header's choice and one body per
 * bullet, in printed order, with the bullet's text as written (`~` for the card). The span is the
 * whole modal text (header and bullets) and the rule the header rule's id.
 */
export interface IrModes extends IrNode {
  readonly choose: IrModeChoice;
  readonly modes: readonly IrBody[];
  readonly texts: readonly string[];
}

export type IrAbility =
  | IrKeyword
  | (IrNode & {
      readonly kind: 'triggered';
      readonly trigger: IrTrigger;
      readonly interveningIf?: IrCondition;
      /** Empty (no sentences) when the ability is modal: its effects are in `modal`. */
      readonly body: IrBody;
      /** "When ~ enters, choose one —" and its bullets (stage P19, CR 700.2b). */
      readonly modal?: IrModes;
      /**
       * "• Khans — At the beginning of your upkeep, ..." (stage P34, D-152, CR 607.2d): the name of the option of the choice "As ~ enters,
       * choose Khans or Dragons" that the ability is linked to; it works only while the permanent has that option chosen.
       */
      readonly option?: string;
    })
  | (IrNode & {
      readonly kind: 'activated';
      readonly costs: readonly IrCost[];
      /** Empty (no sentences) when the ability is modal: its effects are in `modal`. */
      readonly body: IrBody;
      readonly restrictions: readonly IrRestriction[];
      /** "{2}, {T}: Choose one —" and its bullets (stage P19, CR 700.2a). */
      readonly modal?: IrModes;
    })
  | (IrNode & { readonly kind: 'static'; readonly statement: IrStatic })
  // "If ~ would ..., instead ..."; `instead` is absent for "~ enters tapped" (CR 614.1c, 614.1d)
  | (IrNode & {
      readonly kind: 'replacement';
      readonly event: IrClause;
      readonly instead?: IrBody;
    })
  | (IrNode & { readonly kind: 'spell'; readonly body: IrBody })
  // A modal spell: an instant or sorcery whose text is "Choose one —" and its bullets (stage P19).
  | (IrModes & { readonly kind: 'modal' });

/** Every `IrAmount` kind, as the words the `kind` field takes. */
const AMOUNT_KINDS: ReadonlySet<string> = new Set([
  'number',
  'x',
  'countOf',
  'powerOf',
  'manaValueOf',
  'timesKicked',
  'lifeLostThisWay',
  'lifeLostThisTurn',
  'toughnessOf',
  'countersOn',
  'aggregate',
  'devotion',
  'commanderColors',
  'commanderManaValue',
  'commanderCasts',
  'half',
  'multiple',
  'minus',
  'sum',
  'opponentsWithMore',
  'thisWay',
  'triggerDamage',
  'shortfall',
  'exiledStillThere',
  'manaSpent',
  'votesFor',
]);

/** Whether a clause argument is an amount (stage P28: every kind of `IrAmount`). */
export function isIrAmount(arg: IrArg): arg is IrAmount {
  return AMOUNT_KINDS.has(arg.kind);
}

/** The nouns an amount names, in text order: what it counts or reads, and what its parts name. */
export function nounsOfAmount(amount: IrAmount): IrNoun[] {
  switch (amount.kind) {
    case 'countOf':
    case 'powerOf':
    case 'manaValueOf':
    case 'toughnessOf':
    case 'countersOn':
    case 'aggregate':
    case 'colorsAmong':
      return [amount.of];
    case 'half':
    case 'multiple':
    case 'minus':
      return nounsOfAmount(amount.of);
    case 'sum':
      return amount.of.flatMap(nounsOfAmount);
    default:
      return [];
  }
}

/** Every noun of a clause, in text order: the arguments, lists and `of` links, not nested quotes. */
export function nounsOfClause(clause: IrClause): IrNoun[] {
  const out: IrNoun[] = [];
  const visit = (noun: IrNoun) => {
    out.push(noun);
    if (noun.of !== undefined) visit(noun.of);
    for (const member of noun.members ?? []) visit(member);
    const c = noun.filter.controller;
    if (typeof c === 'object') visit(c.noun);
  };
  for (const arg of Object.values(clause.args)) {
    if (arg.kind === 'noun') visit(arg);
    else if (arg.kind === 'nounList') for (const item of arg.items) visit(item);
    else if (isIrAmount(arg)) for (const noun of nounsOfAmount(arg)) visit(noun);
  }
  // "unless that player pays {1}": the player who pays.
  if (clause.condition?.test.kind === 'unlessPays') visit(clause.condition.test.who);
  return out.sort((a, b) => a.span.start - b.span.start);
}
