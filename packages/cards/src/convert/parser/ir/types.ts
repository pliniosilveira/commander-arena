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
    | 'playerToRight' // "the player to your right" (Hithlain Rope)
    | 'enteredChosenPlayer' // "the chosen player" of "As ~ enters, choose a player" (Stuffy Doll)
    | 'sacrificed' // "the sacrificed creature": what the cost of the ability sacrificed (stage P29, D-133)
    | 'attackedBy' // "the player or planeswalker it's attacking" (stage P31, D-140): what the creature `of` attacks
    | 'linkedExile' // "the exiled card" (stage P32, D-147, CR 607.2a): what the linked ability of this permanent exiled
    | 'discardedThisWay' // "each player who discarded a card this way" (stage P52, D-210): the players of the discard before it
    | 'couldntSacrificeThisWay' // "each player who can't" after a sacrifice (CR 701.21a): the players the sacrifice before it found nothing for
    | 'triggerDamagedPlayers' // "each of those opponents" (CR 603.2c): the opponents a damage batch trigger to your opponents hurt
    | 'attackedPlayers' // "each player ~ attacked this turn" (D-269, CR 508.6): the players this permanent was declared attacking
    | 'combatDamagedByNamed' // "each opponent dealt combat damage this game by a creature named ~" (CR 120.2a): the opponents a creature of the permanent's name hurt in combat
    | 'lostLifeThisTurn' // "each opponent who lost life this turn" (CR 119.3): the players of the group `whoGroup` who lost life this turn
    | 'combatDamagedThisTurn' // "your opponents who were dealt combat damage by ~ or a Dragon this turn" (CR 120.2a): the players of the group `whoGroup` that source hurt
    | 'eachPlayerControllingMore' // "the number of players who control more lands than you" (CR 102.1): the other players with more battlefield permanents like `of` than the controller
    | 'eachPlayerControlling' // "each player who controls a creature with power 4 or greater" (CR 102.1): the players with a battlefield permanent like `of`
    | 'selfAndEnchanted' // "~ and enchanted creature" (a bestow card, CR 702.103): the permanent and the creature it is attached to
    | 'selfAndGroup' // "~ and land creatures you control" (Sylvan Advocate, CR 611.3a): the permanent itself and the group the filter names
    | 'pair' // "each of those creatures" (D-286, CR 702.95b): the permanent and the creature it is paired with
    | 'graveyardedThisWay' // "each permanent put into a graveyard this way" (Terastodon, CR 608.2c): what the destroy effects before it put into graveyards
    | 'thisCard'; // "this card" (stage P33, D-150, CR 400.7): the card of the ability's source, wherever it is (an Aura in the graveyard)
  readonly filter: IrFilter;
  /** "up to two", "X", "one or more"; for `target`, how many targets the phrase takes. */
  readonly count?: IrAmount;
  readonly upTo: boolean;
  readonly plural: boolean;
  /** another, other than ~ */
  readonly other: boolean;
  /**
   * "lands you control and land cards you own that aren't on the battlefield" (Dune Chanter, CR 613.1d): the group is `filter` (the permanents of a type you control) and also the cards of that type you own outside the
   * battlefield. Only a static "are Deserts in addition to their other types" reads it; every other lowering refuses a noun that has it.
   */
  readonly alsoCardsYouOwnOffBattlefield?: true;
  /**
   * "each of up to two other targets" (stage P34, D-152, CR 115.3): the targets of this slot are none of the targets of the slot of the same
   * ability before it, which a target noun without it may share.
   */
  readonly otherTarget?: true;
  /**
   * "another target creature that player controls" after "target creature an opponent controls" (Breaking of the Fellowship, CR 115.1, 115.3): with `otherTarget`, the target is controlled by the
   * controller of the target of the slot just before it (the engine's `TargetSpec.sameControllerAs`).
   */
  readonly sameControllerAsPrevious?: true;
  /**
   * "target nonland permanent of that player's choice that one of your opponents controls" (Bladegriff Prototype, CR 603.3d): the player the event of the trigger is about chooses the target
   * (the engine's `TargetSpec.chosenBy` 'triggerPlayer').
   */
  readonly chosenByTriggerPlayer?: true;
  /**
   * "a third target creature" after "target creature" and "another target creature" (Incremental Blight, CR 115.3): with `otherTarget`, none of the targets of any slot before
   * this one, not only the slot just before it.
   */
  readonly otherTargetAll?: true;
  /**
   * "attach ~ to it" (CR 701.3, 603.2): the word was "it", which names the token the sentence made and, where it made none, the object the trigger is about (Hero's
   * Blade: "Whenever a legendary creature you control enters, you may attach ~ to it").
   */
  readonly itWord?: true;
  /**
   * "one or two target creatures", "each of one or two targets" (D-295, CR 115.1, 601.2c): at least this many targets, at most `count`. A target noun
   * without it takes none (`upTo`) or exactly `count`.
   */
  readonly minTargets?: number;
  /** "any number of other permanents" (stage P30, CR 701.21): the player chooses none, some or all of them. */
  readonly anyNumber?: true;
  /** "any number of target tapped creatures with different controllers" (Hylda group 3, CR 115.1, 601.2c): with `anyNumber` on a target, no two of them have the same controller. */
  readonly differentControllers?: true;
  /** "For each player, choose target nonland permanent that player controls" (Guff Rewrites History, CR 115.1, 601.2c): with `differentControllers`, a target for each player who has a legal one. */
  readonly everyController?: true;
  /** "one or more Treasures" (stage P41, D-188, CR 701.21): with `anyNumber`, the player chooses at least one of them. */
  readonly atLeastOne?: true;
  /**
   * "up to that many target creatures" (stage P41, D-188, CR 603.12): a target noun of a reflexive ability with as many targets, at most, as the
   * resolution that created it sacrificed permanents (the engine's `upToThatMany`); it has no count of its own.
   */
  readonly upToThatMany?: true;
  /**
   * "tap up to X target nonland permanents, where X is the number of cards looked at while scrying this way" (Hylda deck group 1, D-513, CR 603.3d): a target noun of a
   * triggered ability with as many targets, at most, as the number its event carries (the engine's `upToTriggerAmount`); it has no count of its own.
   */
  readonly upToTriggerAmount?: true;
  /**
   * "a creature with the greatest power among creatures they control" (stage P30, D-135): the player chooses among the permanents
   * of the filter that have the greatest value of this stat among them.
   */
  readonly greatest?: 'power' | 'toughness' | 'manaValue';
  /** "a creature with the least power among creatures they control" (CR 701.21a): as `greatest`, the permanents with the smallest value of the stat. */
  readonly least?: 'power' | 'toughness' | 'manaValue';
  /**
   * "a creature of their choice that dealt combat damage to you this turn" (Witch-king of Angmar, CR 510.2, 701.21a): the chosen permanent is among those that dealt combat damage this turn
   * to the controller of the ability (the engine's `ChooseSelector.dealtCombatDamageToYou`).
   */
  readonly dealtCombatDamageToYou?: true;
  /** "target player's graveyard" has `of` = target player. */
  readonly of?: IrNoun;
  /** `det` `lostLifeThisTurn` and `combatDamagedThisTurn`: the group the players are of, every player or every opponent (CR 102.1, 102.2). */
  readonly whoGroup?: 'eachPlayer' | 'eachOpponent';
  /** `det` `discardedThisWay`: "who discarded their hand this way" (CR 701.9a): the players whose discard of their hand ran, an empty hand included; `whoGroup` narrows them. */
  readonly discardedHand?: true;
  /** `det` `combatDamagedThisTurn`: the damage was dealt by the permanent of the ability ("by ~ or a Dragon"). */
  readonly damagedByThis?: true;
  /** `det` `combatDamagedThisTurn`: the damage was dealt by a source of this kind ("by ~ or a Dragon": a noun of subtype Dragon), read as the engine's turn log keeps it. */
  readonly damageSource?: IrNoun;
  /**
   * "up to three other target creatures from the battlefield and/or creature cards from graveyards" (D-270, CR 115.1): a target noun whose targets are `filter`
   * (permanents on the battlefield) or this filter (cards of any graveyard). The engine's slot of two zones (`objectOrGraveyardCard`); only `exile` takes it.
   */
  readonly orCard?: IrFilter;
  /**
   * "target spell or creature" (issue 81, Fatehold Charm, CR 115.1): a target noun whose targets are `filter` (permanents on the battlefield) or this filter (spells on the stack). The engine's
   * slot of a permanent or a spell (`objectOrSpell`).
   */
  readonly orSpell?: IrFilter;
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
  /** "nonblack" (CR 105.2, 205.4): none of these colors, as color words. */
  readonly notColors?: readonly string[];
  /** "outlaw" (true), "non-outlaw" (false) (CR 700.12): at least one of the Assassin, Mercenary, Pirate, Rogue and Warlock creature types, or none of them. */
  readonly outlaw?: boolean;
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
    // "creatures the monarch controls" (CR 725.1): only the blockers of "can't be blocked by creatures the monarch controls"
    | 'monarch'
    // "cards in the chosen player's graveyard" (Sewer Nemesis, CR 607.2d): the player the permanent chose as it entered, as owner of the cards
    | 'chosenPlayer'
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
  /** "aren't of the chosen type" after a resolving creature-type choice (D-566). */
  readonly notChosenType?: true;
  readonly stackKind?: 'spell' | 'ability' | 'triggeredAbility';
  /** A cast trigger that counts any chosen targets (D-574). */
  readonly targetCountAtLeast?: number;
  /** "with a single target" (stage P38, D-182, CR 115.9a): a spell or ability that was put on the stack with exactly one target. */
  readonly singleTarget?: true;
  /** "that targets a creature" (stage P49, D-206, CR 115.1, 601.2c): a spell with a chosen target that is an object of this kind (a card type). */
  readonly targets?: IrFilter;
  /** "from an artifact or enchantment source" (Green Slime, CR 113.7a): the source of the ability on the stack the filter names is an object this filter matches (the engine's `abilitySource`). */
  readonly abilitySource?: IrFilter;
  /** "that targets only a single creature you control" (issue 144, CR 115.9c): a spell whose chosen targets are one object of this kind, however many times it was chosen. */
  readonly targetsOnly?: IrFilter;
  /** "that targets you" (Siren Stormtamer, CR 115.1, 601.2c): a spell or ability with a chosen target that is the player the filter is read for ("you"). Only a member of a choice on the stack. */
  readonly targetsYou?: true;
  /** "that targets ~" (Feather group 3, D-437, CR 115.1): a spell with a chosen target that is the source of the ability. */
  readonly targetsSelf?: true;
  /** "that targets only ~" (Feather group 3, D-437, CR 115.9c): a spell whose chosen targets are all the source of the ability. */
  readonly targetsOnlySelf?: true;
  /** "creatures attacking you" (stage P28, CR 508.1b): attackers whose attack target is the controller as a player. */
  readonly attackingYou?: true | 'orPlaneswalkers';
  /** "creatures attacking your opponents and/or planeswalkers they control" (stage P65, D-218, CR 508.1b, 506.3): attackers of an opponent or of a permanent of an opponent. */
  readonly attackingOpponents?: true | 'players';
  /** "attacking or blocking creatures" (stage P68, D-229, CR 506.4, 509.1g): creatures declared as attackers or as blockers that are still in combat. */
  readonly attackingOrBlocking?: true;
  /** "attacking creatures" (stage P31, CR 508.1k): creatures that are attacking, whoever they attack. */
  readonly attacking?: true;
  /** "nonattacking creatures" (D-573): battlefield creatures not declared as attackers now. */
  readonly notAttacking?: true;
  /** "blocking creatures" (CR 509.1g): creatures declared as blockers that are still in combat. */
  readonly blocking?: true;
  /**
   * "monocolored", "multicolored", "that are one or more colors" (stage P31, CR 105.2): the number of colors the object has, compared
   * with a whole number.
   */
  readonly colorCount?: IrComparison;
  /** "with mana value X" (stage P31, CR 107.3a, 202.3): the mana value is the X announced for the ability. */
  readonly manaValueX?: true;
  /** "with mana value X or less" (stage P68, D-230, CR 202.3): at most the X the sentence defines ("..., where X is this creature's power"). Only a target reads it. */
  readonly manaValueAtMostX?: true;
  /**
   * "a spell with lesser mana value that shares a card type with it" (issue 100, Baral and Kari Zev, CR 202.3, 205.2a, 603.3d): the spell a cast trigger is about is "it": the card
   * has a mana value less than its and a card type it has. Read in the filter of a `castFree` from the hand in the effect of such a trigger only.
   */
  readonly lesserSharingTypeWithTriggerSpell?: true;
  /** A target's mana value is at most an amount read as the spell resolves (Drown in the Loch, CR 202.3). */
  readonly manaValueAtMostAmount?: IrAmount;
  /** "with mana value equal to that spell's mana value" (Krile Baldesion, CR 202.3): with `manaValueAtMostAmount`, the mana value is exactly the amount (the engine's `manaValueExact`). */
  readonly manaValueExact?: true;
  /** "historic" (stage P68, D-230, CR 700.6): an artifact, a legendary permanent or a Saga. */
  readonly historic?: true;
  /** "modified" (D-416, CR 700.9): a permanent with a counter, an Equipment or an Aura its controller controls (the engine's `modified`). */
  readonly modified?: true;
  /** "goaded" (CR 701.15b): a creature some player's goad effect still holds (the engine's `goaded`). */
  readonly goaded?: true;
  /** "face-down" or "face-up" (CR 708.2): the status the permanent has now (the engine's `facing`). */
  readonly facing?: 'down' | 'up';
  /** "with the same name as ~" (Mocking Doppelganger, CR 201.2): the creature has the name of the permanent with the static ability (the engine's `sameNameAsSource`), read in the subject of a static ability only. */
  readonly sameNameAsSource?: true;
  /**
   * "that shares a creature type with it" (D-261, CR 205.3m, 603.10a): the card has a creature type the creature of the trigger had (the one that died), as it last was
   * (CR 113.7a). Read in the filter of a library search `revealUntil` only; the engine's `sharesCreatureTypeWith`.
   */
  readonly sharesCreatureTypeWithIt?: true;
  /**
   * "that shares a color with a legendary creature you control" (Ringsight, CR 105.1, 109.4): the card has a color that a permanent this filter describes has (the engine's
   * `sharesColorWith`). The filter is a permanent phrase that says "you control".
   */
  readonly sharesColorWith?: IrFilter;
  /**
   * "each other attacking creature that shares a creature type with it" (Shared Animosity, CR 508.1, 205.3m): the count leaves out the creature the trigger is about, with
   * `sharesCreatureTypeWithIt`. The engine's `otherThanTriggerSubject`.
   */
  readonly otherThanIt?: true;
  /**
   * "a creature card that shares a creature type with the sacrificed creature" (Descendants' Fury, CR 205.3m, 701.21a, 113.7a): the card has a creature type the permanent an earlier
   * sacrifice of the same text sacrificed had, as it last was. Read in the filter of a library search `revealUntil`; the engine's `sharesCreatureTypeWith: 'sacrificed'`.
   */
  readonly sharesCreatureTypeWithSacrificed?: true;
  /**
   * "each other creature you control that shares a creature type with it" (Titan of Littjara, CR 205.3m, 702.73a): the permanent has a creature type the source of the ability has. "It" is the
   * source only in a trigger about the card itself entering or attacking, which the lowering of the ability checks (`usesSharesWithSource`); the engine's `sharesCreatureTypeWith: 'source'`.
   */
  readonly sharesCreatureTypeWithSource?: true;
  /**
   * "a permanent of their choice that shares a card type with it" (Braids, CR 205.2a, 701.21a, 113.7a): the permanent has a card type the permanent an earlier sacrifice of the same
   * text sacrificed had, as it last was. Read in the filter of a sacrifice only; the engine's `sharesCardTypeWith: 'sacrificed'`.
   */
  readonly sharesCardTypeWithSacrificed?: true;
  /**
   * "up to two basic land cards that share a land type" (D-262, CR 205.3i, 701.23): the cards found share a land type among them, which is a condition on the whole
   * choice and not on a card. A filter that still has it is not lowered; the search lowering takes it off (the engine's `search.sharedLandType`).
   */
  readonly sharedLandType?: true;
  /**
   * "any number of creature cards with total mana value 6 or less" (CR 701.23, 202.3): any number of the cards of a library search, with mana values that add up to at most this.
   * Like `sharedLandType` it is about the cards found together; the search lowering takes it off (the engine's `search.totalManaValue`), any other filter that has it is not lowered.
   */
  readonly anyNumberTotalManaValue?: number;
  /**
   * "any number of creature cards" (CR 701.23, 701.23b; Bilbo, Birthday Celebrant): any number of the cards of a library search, none included, with no limit but the library. Like
   * `anyNumberTotalManaValue` it is about the cards found together; the search lowering takes it off (the engine's `search.anyNumber`), any other filter that has it is not lowered.
   */
  readonly anyNumber?: true;
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
  /** "noncommander creature" (Subjugate the Hobbits, CR 903.3): the object is not a card a player designated as a commander. */
  readonly notCommander?: true;
  /** "~" as one member of a disjunction (issue 101, "attack with ~ and/or your commander", CR 508.1): the object is the source of the ability itself. */
  readonly isSelf?: true;
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
  readonly player?: 'any' | 'opponent' | 'opponentWhoseTurn';
  /** "the chosen player casts a spell" (Sewer Nemesis, CR 607.2d): the player noun of a cast trigger is the player the permanent chose as it entered (the engine's `by: 'chosenPlayer'`). */
  readonly chosenPlayer?: true;
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
  /** "that was discarded or put there from a library this turn" (Ahoy Mateys deck, CR 701.9, 701.17): the engine's `discardedOrFromLibraryThisTurn`. */
  readonly discardedOrFromLibraryThisTurn?: true;
  /** "that was put there from their library this turn" (Captain N'ghathrod, CR 404.1, 701.17): the engine's `putFromLibraryThisTurn`. */
  readonly putFromLibraryThisTurn?: true;
  /** "from anywhere other than your hand" (stage P75, D-235, CR 601.2a): a spell that was cast from a zone other than the hand (the engine's `notCastFromHand`). */
  readonly notCastFromHand?: true;
  /** "from your hand" (Prismari deck group 1, D-638, CR 601.2a): a spell that was cast from the hand (the engine's `castFromHand`). */
  readonly castFromHand?: true;
  /** "from a graveyard" (issue 102, River Kelpie, CR 601.2a): a spell that was cast from a graveyard (the engine's `castFromGraveyard`). */
  readonly castFromGraveyard?: true;
  /** "from exile" (Exit from Exile deck, CR 601.2a): a spell that was cast from exile (the engine's `castFromExile`). */
  readonly castFromExile?: true;
  /** "from your graveyard" (Emet-Selch of the Third Seat, CR 601.2a, 404.1): a spell its caster cast from their own graveyard (the engine's `castFromOwnGraveyard`). */
  readonly castFromOwnGraveyard?: true;
  /** "from your graveyard or from exile" (Doc Aurlock, Grizzled Genius, CR 601.2a, 404.1, 406.1): a spell cast from exile or from its caster's own graveyard (the engine's `castFromOwnGraveyardOrExile`). */
  readonly castFromOwnGraveyardOrExile?: true;
  /** "of an opponent's choice" (issue 102, Tasigur, CR 608.2d): an opponent chooses the card; the engine's `ChooseSelector.chosenBy`. */
  readonly chosenByOpponent?: true;
  /** "with {X} in its mana cost" (Quandrix Unlimited deck group E, CR 107.3, 202.1): a spell whose mana cost has an {X} (the engine's `xInManaCost`). */
  readonly xInManaCost?: true;
  /** "your first spell with {X} in its mana cost each turn" (Quandrix Unlimited deck group E, CR 601.2i): the first such spell the caster cast this turn (the engine's `firstXSpellThisTurn`). */
  readonly firstXSpellThisTurn?: true;
  /** "the first spell you cast from exile each turn" (Wild-Magic Sorcerer, CR 601.2i): the first spell the caster cast from exile this turn (the engine's `firstCastFromExileThisTurn`). */
  readonly firstCastFromExileThisTurn?: true;
  /** "that mana from a Treasure was spent to cast" (Rain of Riches, CR 601.2h): the spell was paid in part with mana made by a source of this subtype (the engine's `manaSpentFromSubtype`). */
  readonly manaSpentFromSubtype?: string;
  /** "the first spell you cast each turn that mana from a Treasure was spent to cast" (Rain of Riches, CR 601.2i): the first such spell the caster cast this turn (the engine's `firstManaSpentFromSubtypeThisTurn`). */
  readonly firstManaSpentFromSubtypeThisTurn?: true;
  /** "the second spell you cast each turn" (Alisaie Leveilleur, CR 601.2i): the spell is the nth (2 or more) its caster cast this turn (the engine's `nthSpellThisTurn`). */
  readonly nthSpellThisTurn?: number;
  /** "the first artifact spell you cast each turn" (Artifact Class, CR 601.2i): the spell is the first of its caster's this turn that has one of `types` (the engine's `firstOfTypeThisTurn`). */
  readonly firstOfTypeThisTurn?: true;
  /** "that entered this turn" (group 4 of the Vraska deck, CR 400.7): a permanent that entered the battlefield during this turn (the engine's `enteredThisTurn`). */
  readonly enteredThisTurn?: true;
  /** "that was dealt damage this turn" (Bitter Downfall, CR 120.3): the permanent has been dealt damage this turn (the engine's `dealtDamageThisTurn`). */
  readonly dealtDamageThisTurn?: true;
  /** "controlled by a player who was dealt combat damage by three or more Pirates this turn" (Ahoy Mateys deck group 7, CR 510.2): the engine's `controllerDealtCombatDamageByAtLeast`. */
  readonly controllerDealtCombatDamageBy?: { readonly atLeast: number; readonly subtype: string };
  /** "target card exiled with ~" (Lorehold group 2, CR 607.2a): a card in exile that the permanent exiled with its linked ability (the engine's `exiledWithSource`). */
  readonly exiledWithSelf?: true;
  /** "target creature card exiled this way" (Espers to Magicite, CR 603.12): a card in exile that the resolution before the reflexive ability exiled (the engine's `exiledThisWay`). */
  readonly exiledThisWay?: true;
  /** "with power less than or equal to the amassed Army's power" (Grishnákh, CR 603.12, 701.47a): the engine's `powerAtMostMoved`, read in the reflexive ability after an amass. */
  readonly powerAtMostMoved?: true;
  /** "creature put onto the battlefield with ~" (issue 89, Animate Dead, CR 400.7): a permanent that an effect of this permanent put onto the battlefield (the engine's `putWithSource`). */
  readonly putWithSelf?: true;
  /**
   * "attached to it", "attached to enchanted creature", "that's attached to a creature" (Danitha deck group 3, D-426, CR 303.4, 301.5, 701.3): the object is a permanent attached to
   * another one. `it` is the permanent the statement is about (the lowering of a static ability reads it as the source or, for "enchanted creature gets ...", the permanent the
   * source is attached to); `type` a permanent of these card types.
   */
  readonly attachedTo?:
    | { readonly kind: 'it' }
    // the two things the lowering of a static ability makes of `it` (the source, or the permanent the source is attached to)
    | { readonly kind: 'source' }
    | { readonly kind: 'host' }
    | { readonly kind: 'type'; readonly types: readonly string[] };
  /** "that aren't enchanted" (`false`), "that are enchanted" (`true`) (D-426, CR 303.4): the permanent has no Aura attached to it (or has one). */
  readonly enchanted?: boolean;
  /** "equipped creature", "equipped attacking creature you control" (Limit Break deck group 1, CR 301.5): the permanent has an Equipment attached to it (the engine's `equipped`). */
  readonly equipped?: true;
  /** "enchanted by an Aura you control" (D-647, CR 303.4e): the engine's `enchantedByYou`. */
  readonly enchantedByYou?: true;
  /** "but don't own", "you don't own" (CR 108.3): the engine's `notOwnedByYou`. */
  readonly notOwnedByYou?: true;
  /** "you own" (CR 108.3): the engine's `ownedByYou`. */
  readonly ownedByYou?: true;
  /** "that target enchanted creature" (D-426, CR 601.2c, 303.4): of a spell, that it targets the permanent the source is attached to. Read in the filter of a cost reduction only. */
  readonly targetsHost?: true;
  /** D-645 (Killian, Ink Duelist): "Spells you cast that target a creature cost {2} less": what the spell a cost reduction is about targets, read from the spell as it is cast (never a member of a choice). */
  readonly castTargets?: IrFilter;
  /** D-149 (First Flight, Jubilant Skybonder): "Spells your opponents cast that target ~ cost {2} more": the spell a cost increase is about targets the object that has the ability (CR 601.2c, 113.6), read from the spell as it is cast. */
  readonly castTargetsSelf?: true;
  /** "with power greater than its base power" (D-431, CR 208.4b): the engine's `powerAboveBase`. */
  readonly powerAboveBase?: true;
  /** "with base power 0" (CR 208.4b): the engine's `basePowerIs`. */
  readonly basePowerIs?: number;
  /**
   * "any number of target creature cards with total power 10 or less from your graveyard" (Reunion of the House, CR 115.1, 208.1): the powers of the targets of the slot add up to at
   * most this number; the engine's `TargetSpec.totalPowerAtMost`. Read only by the target slot of a noun of any number of targets (`declareTarget`).
   */
  readonly totalPowerAtMost?: number;
  /** "with power greater than or equal to the chosen number" (Expel the Interlopers, CR 208.1, 608.2c): the engine's `powerAtLeastChosenNumber`, read by the group of an effect. */
  readonly powerAtLeastChosenNumber?: true;
  /**
   * "with power greater than target creature's power" (CR 208.1, 608.2c): the engine's `powerGreaterThan` of the target this noun is. A target noun of its own, numbered with
   * the other targets of the text (the binding pass walks it, as it walks the controller of the filter); only the group of an effect reads it (`selectorOf`).
   */
  readonly powerGreaterThanNoun?: IrNoun;
  /**
   * "all other cards with the same name as that card" (Echoing Return, CR 201.2, 608.2c): the engine's `sameNameAs` of the target this noun is. A target noun of its own, numbered with the
   * other targets of the text; the binding pass walks it as it walks `powerGreaterThanNoun`.
   */
  readonly sameNameAsNoun?: IrNoun;
  /**
   * "target nonland permanent an opponent controls and all tokens that player controls with the same name as that permanent" (Legions to Ashes, CR 608.2c): with `sameNameAsNoun`, the
   * target it is is selected too (the engine's `each.plus`), and `controllerOfNamed`: the objects are controlled by the controller of that target (the engine's `controlledBy`).
   */
  readonly withNamedTarget?: true;
  readonly controllerOfNamed?: true;
  /** "with power less than ~'s power" (issue 160, D-628, CR 208.1): the engine's `powerLessThanSource`. */
  readonly powerLessThanSource?: true;
  /** "that creature has greater power than ~" (Conformer Shuriken, CR 208.1): the engine's `powerGreaterThanSource`. */
  readonly powerGreaterThanSource?: true;
  /** "any target": a creature, player, planeswalker or battle (CR 115.4). */
  readonly anyTarget?: boolean;
  /**
   * "creatures named ~" (Prismari deck group 2, D-656, CR 201.2): the objects have the name of the card the text is on (the tilde). Only the group noun of an effect (`selector:named`)
   * reads it, with the card's own name; any other noun that carries it is refused, so it is never dropped.
   */
  readonly namedSelf?: true;
  /** "a card named God-Pharaoh's Gift" (issue 104, CR 201.2): the object's name is exactly this text (the engine's `named`). Read only after a card of a library search. */
  readonly named?: string;
  /** The words the filter was read from, for diagnostics and templateOf. */
  readonly raw: string;
}

export type IrAmount =
  | { readonly kind: 'number'; readonly value: number; readonly span: Span }
  | {
      readonly kind: 'x';
      readonly span: Span /** "twice X": X multiplied by this (an integer of 2 or more). */;
      readonly times?: number;
    }
  // "for each creature you control"
  | { readonly kind: 'countOf'; readonly of: IrNoun; readonly span: Span }
  | { readonly kind: 'powerOf'; readonly of: IrNoun; readonly span: Span }
  // "equal to that card's mana value" (CR 202.3), stage P11
  | { readonly kind: 'manaValueOf'; readonly of: IrNoun; readonly span: Span }
  // "for each of that spell's colors" (issue 145, CR 105.2): how many colors the object has
  | { readonly kind: 'colorsOf'; readonly of: IrNoun; readonly span: Span }
  // "for each color among permanents you control" (stage P37, D-180, CR 105.2): the colors the permanents have between them, each once
  | { readonly kind: 'colorsAmong'; readonly of: IrNoun; readonly span: Span }
  // "the number of card types among cards in your graveyard" (Hylda deck group 2, D-518, CR 205.2a): the card types the cards of the group have between them, each once
  | { readonly kind: 'cardTypesAmong'; readonly of: IrNoun; readonly span: Span }
  // "for each creature type among creatures you control" (Valiant Changeling, CR 205.3m): the creature types the permanents of the group have between them, each once
  | { readonly kind: 'creatureTypesAmong'; readonly of: IrNoun; readonly span: Span }
  // "for each different mana value among instant and sorcery cards in your graveyard" (Eris, issue 121, CR 202.3): the distinct mana values the cards of the group have, each once
  | { readonly kind: 'differentManaValuesAmong'; readonly of: IrNoun; readonly span: Span }
  // "equal to the number of differently named tokens you control" (Neriv, issue 101, CR 201.2): the distinct names the permanents of the group have, each once
  | { readonly kind: 'differentNamesAmong'; readonly of: IrNoun; readonly span: Span }
  // "you control three or more creatures with different powers" (Augur of Autumn, CR 208.1): the distinct powers the permanents of the group have, each once
  | { readonly kind: 'differentPowersAmong'; readonly of: IrNoun; readonly span: Span }
  // "for each time it was kicked" (CR 702.33c), stage P17; `who` is the word that says which object
  | { readonly kind: 'timesKicked'; readonly who: 'self' | 'it'; readonly span: Span }
  // "equal to the total life lost this way" (CR 702.101a), stage P21: what an earlier loss of life in the same text lost
  | { readonly kind: 'lifeLostThisWay'; readonly span: Span }
  // "equal to the life that player lost this turn" (Hashaton deck group 2, D-365, CR 119.3): the life the player the instruction affects lost this turn
  | { readonly kind: 'lifeLostThisTurn'; readonly span: Span }
  // "equal to the number of creatures attacking them" (issue 101, CR 508.1b): each player the life loss affects loses their own number
  | { readonly kind: 'attackersOfAffected'; readonly span: Span }
  // "equal to the number of cards in that player's hand" (CR 402.1): each player the damage is dealt to is hurt for their own hand size
  | { readonly kind: 'cardsInHandOfAffected'; readonly span: Span }
  | { readonly kind: 'lifeGainedThisTurn'; readonly span: Span }
  // "the amount of life you lost this turn" (Betor, CR 119.3): the controller's own, valid anywhere an amount is
  | { readonly kind: 'controllerLifeLostThisTurn'; readonly span: Span }
  | { readonly kind: 'opponentsLifeLostThisTurn'; readonly span: Span }
  | { readonly kind: 'lifeGainedOrLostThisTurn'; readonly span: Span }
  | {
      readonly kind: 'enteredThisTurn';
      readonly types?: readonly string[];
      readonly token?: boolean;
      readonly controller: 'you' | 'any';
      readonly span: Span;
    }
  | {
      readonly kind: 'diedThisTurn';
      readonly types?: readonly string[];
      readonly token?: boolean;
      readonly controller: 'you' | 'any';
      /** "A modified creature died under your control this turn" (CR 700.9): only the permanents that were modified as they died. */
      readonly modified?: true;
      /** "A permanent left the battlefield under your control this turn" (Revolt, CR 207.2c): every permanent that left it, for any zone. */
      readonly leftBattlefield?: true;
      readonly span: Span;
    }
  // "for each card you've drawn this turn" (Feather deck group 1, D-450, CR 121.1): the cards the controller has drawn so far this turn
  | { readonly kind: 'cardsDrawnThisTurn'; readonly span: Span }
  // "the number of experience counters you have" (Meren of Clan Nel Toth, CR 122.1): the experience counters the controller has now
  | { readonly kind: 'experienceCounters'; readonly span: Span }
  // "the number of creatures in your party" (CR 700.8): the party of the controller, up to one each of Cleric, Rogue, Warrior and Wizard
  | { readonly kind: 'partySize'; readonly span: Span }
  // "the number of instant and sorcery spells you've cast this turn" (Prismari deck group 1, D-638, CR 601.2i): the spells the controller has cast so far this turn, of the card types named.
  | {
      readonly kind: 'spellsCastThisTurn';
      readonly ofTypes?: readonly string[];
      // "for each other instant and sorcery spell you've cast this turn" (Lock and Load, issue 121): the spell that is resolving is not counted.
      readonly otherThanThis?: true;
      readonly span: Span;
    }
  // "the greatest mana value among instant and sorcery spells you've cast this turn" (Prismari deck group 2, D-646, CR 202.3, 601.2i): the largest mana value of the spells the controller
  // has cast so far this turn, of the card types named.
  | {
      readonly kind: 'greatestManaValueCast';
      readonly ofTypes?: readonly string[];
      readonly span: Span;
    }
  // "the number of cards that were put into your graveyard from your hand or library this turn" (issue 102, Welcome the Dead, CR 404.1): the cards the controller owns that went to a graveyard
  // from the zones named this turn.
  | {
      readonly kind: 'cardsToGraveyardThisTurn';
      readonly from: readonly ('hand' | 'library')[];
      readonly span: Span;
    }
  // Stage P28 (D-131): "equal to that creature's toughness", "for each +1/+1 counter on ~"
  | { readonly kind: 'toughnessOf'; readonly of: IrNoun; readonly span: Span }
  | {
      readonly kind: 'countersOn';
      readonly of: IrNoun;
      /** The kind of counter; left out for "the number of counters on that creature" (every kind added together). */
      readonly counter?: string;
      /** "for each kind of counter on it" (Blitzball Stadium, CR 122.1): the number of different kinds of counter, not of counters. Never with `counter`. */
      readonly kinds?: true;
      readonly span: Span;
    }
  // "the number of +1/+1 counters on lands you control" (Toph, the Blind Bandit, CR 122.1): the counters of one kind on the permanents of a group, added together
  | {
      readonly kind: 'countersOnGroup';
      readonly of: IrNoun;
      readonly counter: string;
      readonly span: Span;
    }
  // "the greatest power among creatures you control", "the total power of creatures you control"
  | {
      readonly kind: 'aggregate';
      readonly how: 'greatest' | 'total';
      readonly stat: 'power' | 'toughness' | 'manaValue' | 'counters';
      readonly of: IrNoun;
      /** "... as you cast this spell" (stage P32, D-147, CR 601.2d): read once, as the spell is cast, not as it resolves. */
      readonly asCast?: true;
      readonly span: Span;
    }
  // "the greatest power among those creatures" of an attack batch trigger (CR 508.1): the creatures the declaration of the trigger held
  | { readonly kind: 'attackersGreatestPower'; readonly span: Span }
  // "the greatest mana value among your commanders" (stage P32, D-147, CR 903.3, 202.3)
  /** `zones`: "a commander you own on the battlefield or in the command zone" (Visions of Glory, CR 903.3, 108.3): only the commanders in these zones. */
  | {
      readonly kind: 'commanderManaValue';
      readonly zones?: readonly ('battlefield' | 'command')[];
      readonly span: Span;
    }
  // "for each time you've cast your commander from the command zone this game" (stage P68, D-229, CR 903.8)
  | { readonly kind: 'commanderCasts'; readonly player?: IrNoun; readonly span: Span }
  // "your life total" or the life total of the player this effect names (CR 119.1)
  | { readonly kind: 'lifeTotalOf'; readonly of: IrNoun; readonly span: Span }
  // "the damage dealt to target opponent this turn" (CR 120.3): all the damage dealt to the player so far this turn
  | { readonly kind: 'damageDealtToThisTurn'; readonly of: IrNoun; readonly span: Span }
  // "the greatest number of artifacts an opponent controls" (CR 109.4): the most of those objects any one opponent controls
  | { readonly kind: 'greatestCountOfAnOpponent'; readonly of: IrNoun; readonly span: Span }
  // "the number of profit votes" (stage P44, D-195, CR 701.38a): the votes for one option of a vote earlier in the text, the option as the card writes it
  | { readonly kind: 'votesFor'; readonly option: string; readonly span: Span }
  // "your devotion to black" (CR 700.5), "the number of colors in your commanders' color identity" (CR 903.4)
  | { readonly kind: 'devotion'; readonly colors: readonly string[]; readonly span: Span }
  | { readonly kind: 'commanderColors'; readonly span: Span }
  // "the number of opponents you have" (CR 102.2)
  | { readonly kind: 'opponentCount'; readonly span: Span }
  // "for each player who lost life this turn", "the number of your opponents who were dealt combat damage by ~ this turn" (CR 102.1): the players the noun names
  | { readonly kind: 'playerCount'; readonly of: IrNoun; readonly span: Span }
  // "half the number of Zombies you control, rounded down" (CR 107.1a: the rounding is stated)
  | {
      readonly kind: 'half';
      readonly of: IrAmount;
      readonly round: 'down' | 'up';
      /** "a third of their life, rounded up" (CR 107.1a): divided by 3 instead of 2. */
      readonly divisor?: 3;
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
  // "the number of Zombies you control or the number of Zombie cards in your graveyard, whichever is greater" (CR 608.2c)
  | {
      readonly kind: 'extreme';
      readonly pick: 'greater' | 'lesser';
      readonly of: readonly IrAmount[];
      readonly span: Span;
    }
  // "the difference between that creature's power and its toughness" (Jaws of Defeat, CR 608.2c): the positive gap between two amounts
  | { readonly kind: 'difference'; readonly of: readonly IrAmount[]; readonly span: Span }
  // "If that player has more cards in hand than you", "draw cards equal to the difference" (Slithermuse, CR 608.2c): how much more of `stat` the player chosen before has than you; the
  // words "the difference" name no stat, so it is absent there and the lowering takes the one the condition before it compared
  | {
      readonly kind: 'chosenPlayerLead';
      readonly stat?: 'life' | 'cardsInHand';
      readonly span: Span;
    }
  // "for each opponent who has more cards in hand than you"
  | {
      readonly kind: 'opponentsWithMore';
      readonly stat: 'life' | 'cardsInHand' | 'creatures' | 'lands';
      readonly fewer?: true;
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
        | 'destroyedNontokenCreatures'
        | 'destroyedCreaturesOfAffected'
        | 'destroyedValue'
        | 'playersDrew'
        | 'tapped'
        | 'discarded'
        | 'milledValue'
        | 'milledCreature'
        | 'milledLand'
        | 'landCardsToGraveyard'
        | 'discardedMost'
        | 'discardedTypeCount'
        | 'exiledCreatures'
        | 'exiledCreatureCards'
        | 'damageDealt'
        | 'excessDamageDealt'
        | 'countersRemoved'
        | 'returned';
      readonly words: readonly string[];
      readonly who?: 'opponent' | 'player';
      /** "that many" (stage P30): the number of whatever the instruction before it did, whichever words the text uses. */
      readonly thatMany?: true;
      readonly span: Span;
    }
  // Stage P29 (D-133): "you gain that much life": the damage of the event that caused the trigger
  // `life`: "where X is the amount of life you gained" (Field-Tested Frying Pan), read only where the trigger is life being gained.
  // `scry`: "where X is the number of cards looked at while scrying this way" (Elminster), read only where the trigger is a scry.
  | {
      readonly kind: 'triggerDamage';
      readonly life?: true;
      readonly scry?: true;
      /** "where X is that excess damage" (Fall of Cair Andros, CR 120.10): the excess of the damage of a "dealt excess damage" trigger, read only in the body of such a trigger. */
      readonly excess?: true;
      /** "create that many ... tokens": after an instruction that moved cards, the cards it moved (CR 608.2c); in a damage trigger, the event's amount. */
      readonly thatMany?: true;
      readonly span: Span;
    }
  // Galadriel deck, group 3 (CR 706.2): "Scry X, where X is the result": the natural result of the die rolled earlier in the text
  | { readonly kind: 'dieResult'; readonly span: Span }
  // Surrounded by Orcs (CR 701.47a, 701.47b, 208.1): "where X is the amassed Army's power": the power of the Army the amass before it chose, read as the effect runs
  | { readonly kind: 'amassedArmyPower'; readonly span: Span }
  // Phyrexian Processor (CR 119.4, 614.12): "where X is the life paid as ~ entered": what the permanent paid for "As ~ enters, pay any amount of life"
  | { readonly kind: 'lifePaidAsEntered'; readonly span: Span }
  | { readonly kind: 'triggerTargetCount'; readonly span: Span }
  // Issue 81 (The Ur-Sphinx): "that many" in a "whenever one or more Sphinxes attack" trigger: the creatures of the declaration the trigger counted
  | { readonly kind: 'triggerAttackerCount'; readonly span: Span }
  // Ahoy Mateys deck, Malcolm: "for each opponent dealt damage": the opponents the group of sources of a damage batch trigger damaged
  | { readonly kind: 'triggerDamagedPlayerCount'; readonly span: Span }
  // Death Toll deck, Polluted Cistern (CR 205.2a, 603.2c): "for each card type among those cards", the card types of the cards a batch trigger saw, each once
  | { readonly kind: 'cardTypesAmongThoseCards'; readonly span: Span }
  // Stage P34 (D-152, CR 701.57): "a number of tapped Treasure tokens equal to the difference" between 10 and the mana value of the card discovered
  | { readonly kind: 'shortfall'; readonly limit: number; readonly span: Span }
  // Stage P39 (D-184, CR 601.2h): "the amount of mana spent to cast it", "for each mana from an artifact source spent to cast it"; `fromType` is the
  // card type of the source ("artifact"), `who` the word for the spell
  | {
      readonly kind: 'manaSpent';
      readonly fromType?: string;
      /** "for each {S} spent to cast ~" (D-260, CR 107.4h): only the mana of snow sources. */
      readonly snow?: true;
      /** "the number of colors of mana spent to cast ~" (Converge, issue 310, CR 105.1): how many of the five colors the mana spent had. */
      readonly colors?: true;
      readonly who: 'self' | 'it' | 'thatSpell';
      readonly span: Span;
    }
  // Stage P34 (D-152, CR 400.7): "for each of those cards that are still exiled", the cards an earlier instruction of the same text exiled
  | { readonly kind: 'exiledStillThere'; readonly span: Span }
  // Issue 144 (CR 608.2c): "for each card put into your graveyard this way", the cards the instruction before it moved
  | { readonly kind: 'movedCount'; readonly span: Span }
  // D-654 (CR 603.10a, 113.7a): "for each Aura you controlled that was attached to it": the Auras of the controller that were attached to the permanent the trigger is about
  | { readonly kind: 'aurasAttachedToIt'; readonly span: Span }
  /** Number of cards selected for the spell's optional additional exile cost (D-575). */
  | { readonly kind: 'exiledAsCost'; readonly span: Span };

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
    // "until you exile another card with ~" (Furious Rise, CR 607.2a, 611.2a): the permission of the card a linked ability exiled ends as that permanent exiles another one
    | 'untilYouExileAnotherWithSelf'
    // "for as long as you control ~" (stage P42, D-190, CR 611.2b): the control an effect gave ends as the permanent with the ability leaves or changes controller
    | 'whileYouControlSelf'
    // "for as long as ~ remains on the battlefield" (stage P50, D-207, CR 611.2b): the effect of an ability of a permanent ends as that permanent leaves
    | 'whileSelfRemains'
    | 'asLongAs'
    | 'thisTurn'
    // "attacks this combat if able" (issue 144, CR 506.1, 508.1d, 611.2a): the requirement ends with the combat phase
    | 'thisCombat';
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
    // "If you don't put it onto the battlefield, ..." (Danitha deck group 1b, D-403, CR 608.2c): the card the sentence before it offered to put onto the battlefield did not enter it
    | { readonly kind: 'notPutOntoBattlefield' }
    // "If a creature card was discarded this way", "if a noncreature card was discarded this way" (stage P52, D-210, CR 608.2c)
    | { readonly kind: 'discardedThisWay'; readonly creature: boolean }
    // "If you discarded an instant or sorcery card this way" (D-358, CR 608.2c, 701.9): what a discard before it in the same text did
    | { readonly kind: 'discardedSpellThisWay' }
    // "If it has greater power than ~" (Federation Fleet deck, group D, CR 208.1, 603.4): the power of the creature the trigger is about against the power of the permanent with the ability
    | { readonly kind: 'subjectGreaterPower' }
    // "If you put two or more +1/+1 counters on creatures this way" (Federation Fleet deck, group D, CR 122.6, 608.2c): what the counters an instruction before it in the same text put on creatures were
    | {
        readonly kind: 'putCountersThisWay';
        readonly counter: string;
        readonly atLeast: number;
      }
    // "If you search your library this way" (Lorehold group 1, CR 608.2c, 701.23): what a search before it in the same text did
    | { readonly kind: 'searchedThisWay' }
    // "If time gets more votes", "if the vote is tied" (issue 17, CR 701.38a): the tally of the vote before it in the same text; the option as the card words it
    | { readonly kind: 'voteMost'; readonly option: string }
    | { readonly kind: 'voteTied' }
    // "If a creature is destroyed this way" (Death Toll deck, CR 608.2c, 701.8): what a destroy before it in the same text did
    | { readonly kind: 'destroyedThisWay' }
    // "If that creature dies this way" (Saw in Half, CR 700.4, 608.2c): the creature a destroy before it in the same text named went to a graveyard; `who` is that creature
    | { readonly kind: 'diesThisWay'; readonly who: IrNoun }
    | { readonly kind: 'unlessPays'; readonly who: IrNoun; readonly cost: readonly IrCost[] }
    // D-258 (the Bruna deck, CR 118.12a): "unless you return an untapped Plains you control to its owner's hand": the `return` clause of one permanent the controller chooses
    | { readonly kind: 'unlessReturn'; readonly clause: IrClause }
    // "you have two or more opponents" (CR 102.1: the players you play against)
    | { readonly kind: 'opponentsAtLeast'; readonly atLeast: IrAmount }
    | { readonly kind: 'opponentPoisonAtLeast'; readonly atLeast: IrAmount }
    // "~ was kicked", "it was kicked" (CR 702.33d); `who` is the word the text used for the object
    | { readonly kind: 'kicked'; readonly who: 'self' | 'it' }
    // "~ was foretold" (CR 702.143a): the spell was cast for its foretell cost
    | { readonly kind: 'foretold' }
    // "the {1}{B} cost was paid" (Baleful Mastery, CR 118.9): the spell was cast for its alternative cost of mana `cost`
    | { readonly kind: 'altCostPaid'; readonly cost: readonly string[] }
    // "you cast ~ during your main phase" (issue 244, CR 601.2, 505.1)
    | { readonly kind: 'castInOwnMainPhase' }
    | { readonly kind: 'additionalCostPaid' }
    // "X is 5 or more" (issue 233, CR 107.3a): the X announced for the spell
    | { readonly kind: 'xAtLeast'; readonly atLeast: number }
    // "this is the second time this ability has resolved this turn" (Galadriel deck group 1, CR 608.2c): the resolutions of the triggered ability, this one included
    | { readonly kind: 'abilityResolvedTimes'; readonly times: number }
    // "you chose a creature other than ~ as your Ring-bearer" (Galadriel deck group 1, CR 701.54a): the creature the Ring tempted the controller to choose, not the permanent itself
    | { readonly kind: 'ringBearerChosen' }
    // "it isn't being declared as an attacker" (Hylda deck group 1, D-510, CR 508.1f): part of the event of "becomes tapped", read by the trigger's lowering
    | { readonly kind: 'notDeclaredAttacker' }
    /** "you activated a loyalty ability of a planeswalker this turn" (The Chain Veil; CR 606.3): "you didn't" is `not` of this. */
    | { readonly kind: 'loyaltyActivatedThisTurn' }
    // "if any of that damage was dealt by a Warrior" (issue 101, Mindblade Render, CR 510.2, 603.4): a part of the filter of the sources of a combat damage batch trigger
    | { readonly kind: 'damageDealtByType'; readonly subtype: string }
    // "they entered or were cast from a graveyard" (Twilight Diviner, CR 603.4, 603.6a): part of the event of "one or more creatures enter", read by the trigger's lowering
    | { readonly kind: 'enteredFromGraveyard' }
    // "if that spell's mana cost or that ability's activation cost contains {X}" (Quandrix Unlimited deck group I, CR 107.3, 603.4): part of the events of the cast-or-activate trigger, read by its lowering
    | { readonly kind: 'costContainsX' }
    // "you control a commander" (CR 903.3d), stage P13; stage P29: "you control your commander" (`yours`, CR 903.3)
    | { readonly kind: 'controlCommander'; readonly yours?: true }
    // Stage P29 (D-133): "you have 30 or more life", "you have at least 7 life more than your starting life total"
    // (`aboveStarting`, CR 119.1, 903.7)
    | {
        readonly kind: 'lifeTotal';
        readonly compare: IrComparison;
        readonly aboveStarting?: true;
        readonly player?: 'opponent';
      }
    // D-252 (the Bruna deck): "you gained 3 or more life this turn" (CR 119.3)
    | { readonly kind: 'lifeGainedThisTurn'; readonly atLeast: number }
    // "you've cast a spell from a graveyard or activated an ability of a card in a graveyard this turn" (issue 159, CR 601.2a, 602.2): read from the turn log
    | { readonly kind: 'castFromGraveyardThisTurn' }
    | { readonly kind: 'lifeGainedAndLostThisTurn' }
    // "a player lost 4 or more life this turn" (CR 119.3, 603.4): some player, any player
    | {
        readonly kind: 'aPlayerLostLifeThisTurn';
        readonly atLeast: number;
        readonly opponent?: true;
      }
    // D-318 (the Niv-Mizzet deck): "you've cast three or more spells this turn" (CR 601.2i)
    // D-444 (Feather): "you've cast an instant or sorcery spell this turn": only the spells of these card types count.
    | {
        readonly kind: 'spellsCastThisTurn';
        readonly atLeast: number;
        readonly ofTypes?: readonly string[];
        // Lyse Hext: "two or more noncreature spells": only the spells with none of these card types count
        readonly notOfTypes?: readonly string[];
      }
    // Issue 345 (CR 601.2i): "no spells were cast last turn" (`none`), "a player cast two or more spells last turn" (`aPlayerAtLeast`)
    | {
        readonly kind: 'spellsCastLastTurn';
        readonly mode: 'none' | 'aPlayerAtLeast';
        readonly atLeast?: number;
      }
    // Issue 279 (CR 508.1): "you attacked with three or more creatures this turn"
    | { readonly kind: 'attackedWithCreaturesThisTurn'; readonly atLeast: number }
    // D-271 (CR 706.2, 706.3a): "the result is 1", "the result is 4 or more": the die the roll before it in the same text rolled
    | { readonly kind: 'dieResult'; readonly compare: IrComparison }
    // CR 701.30d: "you win", the controller won the clash the text made before it
    | { readonly kind: 'clashWon' }
    // "If X is 10 or more" (CR 107.3, 608.2c): the X announced for the spell, against a number
    // D-271 (CR 113.6b, 603.4): "~ is in your graveyard": the card itself, in its owner's graveyard
    | { readonly kind: 'thisInYourGraveyard' }
    // CR 702.62b, 603.4 (Nihilith): "this card is suspended": the card itself, in exile with Suspend and a time counter
    | { readonly kind: 'thisSuspended' }
    // Issue 89 (CR 603.4, Animate Dead): "it's on the battlefield": the permanent the trigger is about, which is the source, is still on the battlefield
    | { readonly kind: 'thisOnBattlefield' }
    // Valakut Exploration (CR 603.4, 607.2a): "there are cards exiled with ~": at least one card the permanent exiled with its linked ability is still in exile
    // `atLeast` (Colfenor's Urn, "if three or more cards have been exiled with ~"): at least that many of them; left out, one.
    | { readonly kind: 'cardsExiledWithSelf'; readonly atLeast?: number }
    // D-278 (CR 701.42a, 712.4a): "you both own and control ~ and a creature named Bruna, the Fading Light": the card itself and a permanent of the type with that name
    | { readonly kind: 'ownsAndControlsNamed'; readonly name: string; readonly type: string }
    // "there are fewer than eight cards in your graveyard" (stage P68, D-229, CR 404.1): the cards in the graveyard of the controller
    | {
        readonly kind: 'cardsInGraveyard';
        readonly compare: IrComparison;
        // "an opponent has seven or more cards in their graveyard" (Into the Story, CR 404.1, 102.2): some opponent's graveyard instead of the controller's
        readonly player?: 'anOpponent';
      }
    // "there are no cards in your library", "your library has no cards in it" (issue 25, D-331, CR 401.1): the cards in the library of the controller
    | { readonly kind: 'cardsInLibrary'; readonly compare: IrComparison }
    // "~'s power is even", "~'s power is odd" (Kianne, Corrupted Memory, CR 107.1): the power of the permanent itself
    | { readonly kind: 'thisPowerParity'; readonly parity: 'even' | 'odd' }
    // "a player has one or fewer cards in hand" (Lorehold group 3, CR 402.1, 603.4): some player in the game has a hand of that size
    | { readonly kind: 'aPlayerCardsInHand'; readonly compare: IrComparison }
    // "the player is your opponent and has four or more cards in hand" (Fevered Visions, CR 603.2b, 102.2, 402.1): the player the event of the trigger is about is an
    // opponent of the controller (`opponent`) and has a hand of that size (`cardsInHand`); at least one of the two
    | {
        readonly kind: 'thePlayerIs';
        readonly opponent?: true;
        readonly cardsInHand?: IrComparison;
      }
    // "that player controls more lands than you" (stage P68, D-229, CR 603.4): the controller of the permanent the event is about has more of the stat; with a
    // trigger about a player (a step of an opponent's turn) the lowering reads it of that player instead (`triggerPlayerHasMore`)
    | { readonly kind: 'subjectControllerHasMore'; readonly stat: 'lands' | 'creatures' }
    // "it isn't that player's turn" (Tataru Taru, CR 603.4, 500.1): the player the event of a trigger is about is (or, negated, is not) the active player
    | { readonly kind: 'thatPlayersTurn'; readonly negated: boolean }
    // "~ is paired with another creature" (D-286, CR 702.95b): the permanent the ability is on is paired
    // (`who` is the word the text used for the permanent: `~`, or "it", which is the source only in an ability about it)
    | { readonly kind: 'paired'; readonly who: 'self' | 'it' }
    // "~ is attached to a creature" (stage P37, D-180, CR 301.5, 303.4): the permanent this one is attached to, against a filter (`creature`); D-427 (Danitha group 3):
    // "enchanted creature is green" says the same of the permanent an Aura enchants (`via`: the word, "enchanted" for an Aura, "equipped" for an Equipment)
    | {
        readonly kind: 'attachedTo';
        readonly filter: IrFilter;
        readonly via?: 'enchanted' | 'equipped';
      }
    // "another Aura is attached to enchanted creature" (D-427, CR 303.4, 301.5): at least one other permanent of the kind is attached to the permanent the source is attached to
    | {
        readonly kind: 'otherAttachedToHost';
        readonly attachment: IrFilter;
        readonly via: 'enchanted' | 'equipped';
      }
    // "~ entered this turn" (D-427, CR 400.7): the permanent itself entered the battlefield this turn
    | { readonly kind: 'thisEnteredThisTurn' }
    // "it's untapped", "~ is untapped": this permanent against a filter (stage P29, D-133)
    // (`who` is the word the text used for the permanent: `~`, or "it", which is the source only in an ability about it)
    | { readonly kind: 'thisMatches'; readonly filter: IrFilter; readonly who?: 'self' | 'it' }
    // Stage P30 (D-135): "if it's a Zombie card", "if it's an Angel" (CR 608.2c): an object an earlier instruction of the
    // text moved or named, against a filter that says what it is (never where it is: no zone, controller or owner)
    | { readonly kind: 'objectMatches'; readonly who: IrNoun; readonly filter: IrFilter }
    // "the discarded card was a creature card" (Moria Scavenger, CR 602.2b, 701.9a): the card the cost of the activated ability discarded, against a filter that says what it is
    | { readonly kind: 'discardedAsCostMatches'; readonly filter: IrFilter }
    // "that card's mana value is less than or equal to the number of experience counters you have" (Meren of Clan Nel Toth, CR 202.3, 608.2c): the mana value of the object an earlier instruction named, against an amount
    | { readonly kind: 'manaValueAtMostAmount'; readonly who: IrNoun; readonly amount: IrAmount }
    // "the exiled card's mana value is 4 or greater" (Summoner's Sending, CR 202.3, 608.2c): the same object, against an amount it must reach
    | { readonly kind: 'manaValueAtLeastAmount'; readonly who: IrNoun; readonly amount: IrAmount }
    // "you put a Cave onto the battlefield this way" (stage P37, D-180, CR 608.2c): what the instruction before it put onto the battlefield is, against
    // a filter that says what it is (no zone, controller or owner)
    // `zone` 'hand' (Danitha deck group 2, D-412): "you put a Town card into your hand this way" says where the card went; absent for the battlefield.
    | { readonly kind: 'putThisWay'; readonly filter: IrFilter; readonly zone?: 'hand' }
    | { readonly kind: 'exiledThisWay'; readonly filter: IrFilter }
    // "at least one Zombie card is milled this way" (issue 159, CR 608.2c, 701.17a): any card the mill before it put into the graveyard is described by the filter.
    | { readonly kind: 'milledThisWay'; readonly filter: IrFilter }
    // "If you don't, put a +1/+1 counter on ~" (Danitha deck group 2, D-411, CR 608.2c): the player did not put a card from among the cards the sentence before it milled into their hand
    | { readonly kind: 'youDont' }
    // "If you can't, sacrifice ~" (Eldrazi Monument, CR 608.2c, 701.21a): the sacrifice the sentence before it asks for sacrificed nothing
    | { readonly kind: 'youCant' }
    // "if the gift was promised" (CR 702.174k, stage P30)
    | { readonly kind: 'giftPromised' }
    // "if you cast it" (CR 601.2a, 603.4): the permanent the trigger is about came from a spell that was cast
    | { readonly kind: 'wasCast' }
    // "an opponent controls four or more nonbasic lands" (stage P30): some one opponent controls that many
    | { readonly kind: 'opponentControls'; readonly noun: IrNoun; readonly atLeast: IrAmount }
    // "it escaped" (CR 702.138b), stage P23: the permanent was cast with its escape cost; the rule that reads
    // it is the "unless" of a sacrifice (`condition.unless-escaped`), which wraps it in `not`
    | { readonly kind: 'escaped' }
    // Stage P28 (D-131): "if creatures you control have total power 8 or greater", "if you have seven or more
    // creature cards in your graveyard", "if an opponent controls more creatures than you": any amount of the
    // game compared with a number
    | { readonly kind: 'amountIs'; readonly amount: IrAmount; readonly compare: IrComparison }
    /** "you control a prime number of lands" (Zimone, All-Questioning): the engine's `amountIsPrime`. */
    | { readonly kind: 'amountIsPrime'; readonly amount: IrAmount }
    // "if you're the monarch", "if an opponent is the monarch" (CR 725.1: a designation); `not` for the negative
    | {
        readonly kind: 'designation';
        readonly who: IrNoun;
        readonly designation: 'monarch' | 'citysBlessing' | 'initiative';
      }
    // Sarevok's Tome (CR 309.7, 701.49c): "you've completed a dungeon"
    | { readonly kind: 'completedDungeon'; readonly who: IrNoun }
    // Stage P31 (D-140): "you control the artifact with the greatest mana value or tied for the greatest mana value" (CR 603.4): one of
    // the permanents of the kind, whoever controls them, with the greatest value of the stat, a tie counting for each tied one
    | {
        readonly kind: 'controlsGreatest';
        readonly noun: IrNoun;
        readonly stat: 'power' | 'toughness' | 'manaValue';
      }
    // Stage P33 (D-150): "if it had counters on it" (CR 603.10a): the permanent that left the battlefield had a counter (of the kind named,
    // when the text names one), as it last was; the lowering folds it into the filter of the trigger about the permanent
    // `oneOrMore` (Oft-Nabbed Goat): "it had one or more -1/-1 counters on it", whose number "that many" and "that much" of the body then name
    | { readonly kind: 'hadCounters'; readonly counter?: string; readonly oneOrMore?: true }
    // Auntie Ool, Cursewretch (CR 603.10a, 608.2h): "you control that creature", "you don't control it" (`not` of this): the permanent the text means by `who`, which the binding pass names
    | { readonly kind: 'controlsThat'; readonly who: IrNoun; readonly negated?: true }
    // Massacre Girl, Known Killer (CR 603.10a, 113.7a, 208.1): "its toughness was less than 1": the power or toughness of the permanent the trigger is about, as it is or as it last was
    | {
        readonly kind: 'subjectStat';
        readonly stat: 'power' | 'toughness';
        readonly compare: IrComparison;
      }
    // Selvala, Heart of the Wilds (CR 603.10a, 208.1, 608.2c): "its power is greater than each other creature's power": the stat of the permanent the trigger is about against every other permanent of the types
    | {
        readonly kind: 'subjectGreaterThanEach';
        readonly stat: 'power' | 'toughness';
        readonly types: readonly string[];
      }
    // Wakka, Devoted Guardian (CR 122.6, 603.4): "a counter was put on ~ this turn": a counter (of the kind, when named) put on the permanent with the ability this turn by anyone
    | { readonly kind: 'counterPutOnSelf'; readonly counter?: string }
    // Shelinda, Yevon Acolyte (CR 208.1, 608.2c): "its power is less than ~'s power": the power of the permanent the trigger is about against the permanent with the ability
    | { readonly kind: 'subjectPowerLessThanSelf' }
    // Lasting Tarfire (CR 122.6, 603.4): "you put a counter on a creature this turn": a counter the controller put on a permanent (of the card type, when named) this turn
    | {
        readonly kind: 'putCountersThisTurn';
        readonly counter?: string;
        readonly onType?: string;
      }
    // Stage P33 (D-150): "none of those creatures attacked you" is `not` of this (CR 508.1b): at least one creature of the attackers that
    // triggered the ability was declared as attacking its controller as a player
    | { readonly kind: 'attackersAttackedYou' }
    // Firkraag (CR 508.1d, 701.15b): "that creature had to attack this combat", the intervening "if" of a trigger about a creature
    | { readonly kind: 'subjectHadToAttack' }
    // D-643 (CR 508.1b): "if two or more of those creatures are attacking you and/or planeswalkers you control": at least that many of the attackers that triggered the ability were
    // declared attacking its controller or a planeswalker its controller controlled
    | { readonly kind: 'attackersAtYou'; readonly atLeast: number }
    /** "you're the defending player" (Kazuul, CR 508.5): the intervening "if" of an `attacks` trigger, which the lowering folds into the event (`at: 'defendingYou'`). */
    | { readonly kind: 'youAreDefendingPlayer' }
    /** "that opponent has more life than another of your opponents" (D-653, CR 603.4): the player a `playerAttacksOpponent` trigger is about. */
    | { readonly kind: 'attackedHasMoreLife' }
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
    // Issue 144 (CR 506.1): "it's your combat phase"
    // `first` (Limit Break deck, Tifa, Martial Artist): "it's the first combat phase of your turn"
    | { readonly kind: 'yourCombatPhase'; readonly first?: true }
    // Stage P49 (D-206): "during your turn" (CR 611.3a)
    | { readonly kind: 'yourTurn' }
    // Evendo Brushrazer (CR 701.21a): "you've sacrificed a nontoken permanent this turn": `types` the card types the permanent had, `token` false for "nontoken"
    | {
        readonly kind: 'sacrificedThisTurn';
        readonly types?: readonly string[];
        readonly token?: boolean;
      }
    // Stage P49 (D-206): "at least four mana was spent to cast it" (CR 601.2h), "a card left your graveyard this turn" (CR 400.7), "~ was cast from a graveyard" (CR 601.2a)
    // `ofTriggerSpell` (issue 25): said as "that spell" ("five or more mana was spent to cast that spell"); lowered in a trigger about a spell that was cast only.
    | { readonly kind: 'manaSpentAtLeast'; readonly count: number; readonly ofTriggerSpell?: true }
    // Prismari deck, group 2 (D-646, CR 202.3, 608.2h): "that spell's mana value is 5 or greater": the mana value of the spell that caused a cast trigger; lowered in such a trigger only.
    | { readonly kind: 'triggerSpellManaValue'; readonly atLeast: number }
    // Flint deck (issue 685, CR 601.2h): "mana from a Treasure was spent to cast it": the spell of a cast trigger was paid in part with mana a source of this subtype made.
    | { readonly kind: 'manaSpentFromSubtype'; readonly subtype: string }
    // Flint deck (issue 685, Anje Falkenrath, CR 603.4, 702.35): "if it has madness": the card a discard trigger is about has the keyword; a part of the filter of that trigger.
    | { readonly kind: 'discardedCardHasKeyword'; readonly keyword: string }
    // Prismari deck, group 3 (D-661, CR 202.3, 608.2c): "the total mana value of the cards exiled this way is 13 or less": the cards the instructions before it exiled, added up; lowered
    // only after an instruction that exiled cards.
    | { readonly kind: 'movedTotalManaValue'; readonly atMost: number }
    // Death Toll deck, group B (CR 205.2a, 608.2c): "two cards that share all their card types were milled this way": the cards the instruction before it milled; lowered only after a mill.
    | { readonly kind: 'movedShareAllCardTypes' }
    | { readonly kind: 'cardLeftYourGraveyard' }
    // Ahoy Mateys deck, group 5: "you descended this turn".
    | { readonly kind: 'descendedThisTurn' }
    // Mind Flayarrrs deck (River of Tears): "you played a land this turn" (CR 305.1).
    | { readonly kind: 'playedLandThisTurn' }
    // Stage P50 (D-207): "it targets a tapped creature" (CR 601.2c, 601.2f)
    | { readonly kind: 'spellTargets'; readonly noun: IrNoun }
    | { readonly kind: 'castFromZone'; readonly zone: 'graveyard' | 'hand' | 'exile' }
    // Stage P45 (D-197): "you control your Ring-bearer" (CR 701.54e)
    | { readonly kind: 'controlsRingBearer' }
    // Frodo, Adventurous Hobbit (CR 701.54e, 701.54c): "~ is your Ring-bearer", "the Ring has tempted you two or more times this game"
    | { readonly kind: 'thisIsRingBearer' }
    | { readonly kind: 'ringTemptedAtLeast'; readonly times: number }
    | {
        readonly kind: 'playerDealtDamage';
        readonly who: 'you' | 'opponent';
        readonly atLeast: number;
      }
    // Issue 41 (D-475): "a player was dealt combat damage by a Zombie this turn" (CR 120.2a): the kind of source, as the turn log keeps it.
    | { readonly kind: 'combatDamagedBy'; readonly noun: IrNoun }
    | {
        readonly kind: 'enteredThisTurn';
        readonly count: number;
        readonly types?: readonly string[];
        readonly notTypes?: readonly string[];
        readonly subtypes?: readonly string[];
        readonly token?: boolean;
        /** "another Elf entered the battlefield under your control this turn" (issue 17, CR 400.7): the permanent with the condition does not count. */
        readonly other?: true;
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
    // `also` is "Sacrifice a Swamp and a Forest" (CR 701.21a): the other parts, each a noun of "a ..."
    | {
        readonly kind: 'sacrifice';
        readonly what: IrNoun;
        readonly count?: number;
        readonly also?: readonly IrNoun[];
      }
    // "Tap three untapped Zombies you control" (stage P29, D-133, CR 118.3): `filter` of the permanents, `count` how many
    | {
        readonly kind: 'tapPermanents';
        readonly what: IrNoun;
        readonly count: number;
      }
    // "Exile a face-down permanent you control face up" (Primordial Mist, CR 118.3, 406.3, 708.9): `what` the permanent
    | { readonly kind: 'exilePermanent'; readonly what: IrNoun }
    // "Untap two tapped creatures you control" (Hatsune Miku deck, CR 701.26b, 118.3): `what` the permanents, `count` how many
    | {
        readonly kind: 'untapPermanents';
        readonly what: IrNoun;
        readonly count: number;
      }
    // "Remove two +1/+1 counters from among creatures you control" (Federation Fleet deck, group D, CR 118.3, 122.1): `count` counters of the kind off the permanents `what` names
    | {
        readonly kind: 'removeCountersAmong';
        readonly counter: string;
        readonly count: number;
        readonly what: IrNoun;
        /** "Remove a counter from a nonland permanent you control" (CR 118.3, 122.1): a counter of any kind; `counter` is empty and `count` 1. */
        readonly anyKind?: true;
      }
    // "Remove a counter from ~", "Remove three counters from among other artifacts, creatures, and planeswalkers you control", "Remove X counters from an artifact or creature you control"
    // (Counter Intelligence deck, group 2, CR 118.3, 122.1, 602.2b): counters of any kind, the player choosing which. `count` how many (1 for `x`, the X announced); `what` the permanents
    // they come off (null: the permanent with the ability); `fromOne` all of them off one permanent ("from an artifact or creature", not "from among ...").
    | {
        readonly kind: 'removeAnyCounters';
        readonly count: number;
        readonly x: boolean;
        readonly what: IrNoun | null;
        readonly fromOne: boolean;
      }
    | { readonly kind: 'payLife'; readonly amount: IrAmount; readonly definesX?: true }
    // Blight 1 (Danitha deck, D-407, CR 701.68a): `count` -1/-1 counters on a creature the player controls
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
    // "Put a creature card exiled with ~ into its owner's graveyard" (Shelob, Dread Weaver, CR 607.2a, 118.3): one card of the kind `what` names that the permanent exiled with its linked ability
    | { readonly kind: 'putLinkedExile'; readonly what: IrNoun }
    // "Put a card an opponent owns from exile into that player's graveyard" (Void Attendant, CR 108.3, 118.3): one face-up card in exile of the kind `what` names that an opponent owns
    | { readonly kind: 'putOpponentExile'; readonly what: IrNoun }
    | { readonly kind: 'exileFromHand'; readonly what: IrNoun }
    // "Discard this card" (stage P68, D-229, CR 701.9, 113.6b): the card itself, from the hand; "Exile ~" (CR 118.1): the permanent itself
    | { readonly kind: 'discardThis' }
    // "Discard your hand" (issue 160, D-626, CR 701.9): every card of the hand, none chosen
    | { readonly kind: 'discardHand' }
    // "Reveal this card from your hand" (Gisa deck, group 4, D-462, CR 701.20a, 113.6b): the card itself is shown, from the hand
    | { readonly kind: 'revealThis' }
    | { readonly kind: 'exileThis' }
    // "Exile this card from your graveyard" marks the activated ability as functioning there.
    | { readonly kind: 'exileThisFromGraveyard' }
    // "Behold a Jace" (CR 701.4, D-151): as an additional cost of a spell, reveal a matching hand card or choose a matching permanent.
    | { readonly kind: 'behold'; readonly what: IrNoun }
    // "Mill a card" (stage P51, D-208, CR 701.17): the cost of a mana ability
    | { readonly kind: 'mill'; readonly amount: IrAmount }
    // "{E}{E}" (stage P51, D-209, CR 107.14): energy counters paid by the player that an "unless you pay" asks
    | { readonly kind: 'energy'; readonly count: number }
    // Issue 105 (Confiscation Coup): "an amount of {E} equal to that permanent's mana value".
    | { readonly kind: 'energyAmount'; readonly amount: IrAmount }
    | { readonly kind: 'removeCounters'; readonly counter: string; readonly amount: IrAmount }
    // "Exert ~" (issue 144, CR 701.43a): the permanent itself, as a cost
    | { readonly kind: 'exert' }
    // "Put a page counter on ~" (stage P31, CR 118.3, 122.1): counters put on the permanent itself as a cost
    | { readonly kind: 'putCounters'; readonly counter: string; readonly count: number }
    // "Return an artifact you control to its owner's hand", "Return ~ to its owner's hand" (stage P31, CR 118.3): `count` of them
    | { readonly kind: 'returnToHand'; readonly what: IrNoun; readonly count: number }
    // "Put ~ on the bottom of its owner's library" (CR 118.3, 401.4): the permanent itself
    | { readonly kind: 'putThisOnLibraryBottom' }
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
    // "one mana of any color among legendary creature cards in your graveyard" (CR 106.1b, 105.2): a color the cards `of` names have between them; the noun is a plural group of cards
    | { readonly kind: 'colorsAmongCards'; readonly of: IrNoun }
    // "one mana of the chosen color" (stage P33, D-150, CR 106.1b, 607.2d): the color the permanent chose as it entered
    // issue 144 (Throne of Eldraine): "four mana of the chosen color" has `count` 4
    | {
        readonly kind: 'chosenColor';
        readonly or?: 'W' | 'U' | 'B' | 'R' | 'G';
        readonly count?: number;
      }
    // "two mana in any combination of colors" (stage P34, D-152, CR 106.1b, 605.3b): `count` mana, each of a color chosen on its own
    // stage P34; issue 25 (D-319): "two mana of different colors" is `distinct` (no color twice)
    | {
        readonly kind: 'anyCombination';
        readonly count: number;
        readonly distinct?: true;
        // "two mana in any combination of {U}, {B}, and/or {R}" (CR 106.1b): each mana one of these colors
        readonly colors?: readonly ('W' | 'U' | 'B' | 'R' | 'G')[];
      }
    // "an amount of mana of that color equal to your devotion to that color" (CR 605.3b, 700.5): the color of the sentence "Choose a color." before it
    | { readonly kind: 'devotionToChosenColor' }
    // "one mana of that color for each charge counter on ~" (CR 605.3b, 106.1b): after "Choose a color.", as many mana of it as the `times` amount of the clause
    | { readonly kind: 'thatColor' }
    // "X mana of any one color, where X is ~'s power" (CR 106.1b, 107.3c): `count` mana of one color chosen as the ability resolves, X what the sentence defines
    | { readonly kind: 'anyOneColorX' }
    // "X mana in any combination of colors, where X is the greatest power among creatures you control" (Selvala, CR 106.1b, 107.3c): `count` mana, each of a color chosen on its own, X what the sentence defines
    | { readonly kind: 'anyCombinationX' }
    // "For each color among permanents you control, add one mana of that color" (Faeburrow Elder, CR 105.2, 605.3b): one mana of each color the permanents `of` names have between them
    | { readonly kind: 'eachColorAmong'; readonly of: IrNoun }
    // "{R}{R}, {R}{W}, or {W}{W}" (stage P14): exactly one of the listed combinations, each a run of
    // symbols as written
    | { readonly kind: 'combination'; readonly options: readonly (readonly string[])[] }
    // "one mana of any type that land produced" (CR 106.12a, 605.4a): a type the permanent tapped for mana produced; `noun` is the permanent word the text used
    | { readonly kind: 'producedType'; readonly noun: string }
    /**
     * "one mana of any color that a land an opponent controls could produce" (stage P14, CR 106.7):
     * one mana of a type that a land `whose` could produce; `anyType` says "any type", which keeps
     * colorless, instead of "any color".
     */
    | {
        readonly kind: 'couldProduce';
        readonly whose: 'you' | 'opponent';
        readonly anyType: boolean;
      }
    /**
     * "three mana of that type" (Incubation Druid, CR 106.7, 605.3b): `count` mana of the one type the sentence before chose ("one mana of any type that a land you control could
     * produce"); lowered only as the second sentence of a mana ability that says "instead", where it gives that ability's production a `count`.
     */
    | { readonly kind: 'couldProduceThatType'; readonly count: number };
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
  readonly counters?: {
    readonly counter: string;
    readonly count: number;
    /** "with a vigilance counter and a lifelink counter on it" (Gilraen, CR 122.6): the further kinds of counter it enters with. */
    readonly also?: readonly { readonly counter: string; readonly count: number }[];
  };
  /**
   * Whose zone, when the text says: "your hand", "its owner's hand". For the battlefield, who
   * controls what enters: "under your control", "under its owner's control" (CR 110.2a); absent when
   * the text says nothing, which means the player performing the effect.
   */
  readonly whose?: 'you' | 'owner';
  readonly tapped?: boolean;
  /** "to the battlefield face up or face down" (Deathmist Raptor, CR 708.2a, 708.3): the controller chooses as the effect resolves whether the card enters face up or face down. */
  readonly faceChoice?: true;
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
  /**
   * Feather deck group 1 (D-451, D-452, CR 702.16): the quality of a protection the clause grants ("gains protection from red", "gains protection from the color
   * of your choice"): the color words, lowercase, or `choice` for the color the controller chooses as the effect resolves, or (`cardTypes`) the card types named. `name` is then `protection`.
   */
  readonly protection?:
    | { readonly colors: readonly string[] }
    | { readonly choice: 'color' | 'cardType' }
    /** "gains protection from creatures until end of turn" (Seasoned Dungeoneer, CR 702.16a, 205.2a): the card types named, as the engine's card type words. */
    | { readonly cardTypes: readonly string[] };
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
  /** "becomes a 2/2 creature with all creature types" (CR 205.3m, 702.73a): every creature type is added (the engine's `setTypes` `allCreatureTypes`), besides the types listed. */
  readonly allCreatureTypes?: boolean;
  /** "It's a black Zombie in addition to its other colors and types" (issue 159, CR 105.3): the color letters the object also has, as names ("black"). */
  readonly colors?: readonly string[];
}

/** "base power and toughness 1/1": the numbers as written, not a change (CR 613.4b). */
export interface IrBasePt extends IrNode {
  readonly kind: 'basePt';
  readonly power: number;
  readonly toughness: number;
  /** "base power and toughness X/X" (CR 107.3, 613.4b): the X of the ability; `power` and `toughness` are 0 and are not read. */
  readonly x?: true;
  /** "becomes an X/X ... creature, where X is the greatest mana value among your commanders" (CR 107.3c, 613.4b): the amount the text defines X as, written inside the clause; `power` and `toughness` are 0 and are not read. */
  readonly amount?: IrAmount;
  /** "become equal to ~'s power and toughness" (CR 613.4b, 611.2c): the source's power and toughness as the effect resolves; `power` and `toughness` are 0 and are not read. */
  readonly fromSource?: true;
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
  readonly predefined?:
    | 'Treasure'
    | 'Food'
    | 'Clue'
    | 'Gold'
    | 'Map'
    | 'Gingerbrute'
    | 'Lander'
    | 'Wicked Role'
    | 'Junk'
    | 'Blood';
  readonly power?: number;
  readonly toughness?: number;
  /** "X/X creature token": use the X value bound by the enclosing ability's where-X clause. */
  readonly ptAmount?: true;
  readonly colors?: readonly string[];
  readonly types?: readonly string[];
  readonly subtypes?: readonly string[];
  // 'with "..."'
  readonly abilities?: readonly IrQuotedAbility[];
  /** "with flying", "with flying and vigilance" (stage P15): the keywords as written, lowercase. */
  readonly keywords?: readonly string[];
  /** "named Kobolds of Kher Keep" (stage P39, D-184, CR 111.4): the name the token is given, as written; left out the name is its creature types. */
  readonly named?: string;
  /** "... token with flying that's attacking that opponent" (D-648, CR 508.4): the token is created attacking the player a trigger about a player attacking one of your opponents attacked. */
  readonly attackingThatOpponent?: true;
  /** "a colorless snow artifact token named Icy Manalith" (issue 345, CR 205.4, 111.4): the token has the supertype snow. */
  readonly snow?: true;
  /**
   * "... token that's tapped and attacking" (CR 508.4, 110.5b): the token enters tapped and attacking a player the declaration of an attack batch trigger attacked, never declared as
   * an attacker. Only in the effect of "whenever one or more ... you control attack".
   */
  readonly tappedAndAttacking?: true;
  /** "Smaug, a legendary 6/6 red Dragon creature token" (stage P45, D-197, CR 205.4): the token has the supertype legendary. */
  readonly legendary?: true;
  /** "a token that's a copy of target creature" (CR 707.2): the permanent copied. */
  readonly copyOf?: IrNoun;
  /**
   * "..., except their power is half that creature's power and their toughness is half that creature's toughness. Round up each time." (Saw in Half, CR 707.9b, 107.1a): with `copyOf`, the
   * copy has half the power and toughness the original had, rounded up (the engine's `copyOf.halfPt`).
   */
  readonly copyHalfPt?: true;
  /**
   * "..., except it's a 4/4 black Zombie" (Hashaton deck group 5, D-382, CR 707.9b): what the copy is instead of what it copies, with `copyOf`: its power and toughness, its colors
   * (as color words; empty for colorless) and its creature types (instead of its own, CR 205.3d).
   */
  readonly copyExcept?: {
    readonly power: number;
    readonly toughness: number;
    readonly colors: readonly string[];
    readonly subtypes: readonly string[];
    /** "..., except it's a 3/3 black Wraith with menace" (Sauron, the Necromancer, CR 707.9b, 707.9a): the keywords (as written, lowercase) the copy has besides its abilities. */
    readonly keywords?: readonly string[];
  };
  /**
   * "..., except it's a 4/4 Dragon creature with flying in addition to its other types" (Will of the Temur, issue 103, CR 707.9b): with `copyOf`, the copy has this power and toughness,
   * these creature types and card types besides the ones it copies, and these keywords (as written, lowercase) besides its abilities.
   */
  readonly copyExceptAdditive?: {
    readonly power: number;
    readonly toughness: number;
    readonly subtypes: readonly string[];
    readonly cardTypes: readonly string[];
    readonly keywords: readonly string[];
  };
  /**
   * "..., except it's not legendary and its starting loyalty is 1" (Galadriel deck group 3, CR 707.9b, 205.4a, 306.5b): with `copyOf`, the copy has no legendary supertype
   * (`copyNotLegendary`) and the loyalty it enters with (`copyStartingLoyalty`, a copiable value of a planeswalker).
   */
  readonly copyNotLegendary?: true;
  /**
   * "..., except it isn't legendary, it's an Illusion artifact in addition to its other types, and it has haste" (Reg Barclay, Fidgety Fantasist, CR 707.9b, 205.4a): with `copyOf`
   * and `copyNotLegendary`, the copy has these creature types and card types besides the ones it copies, with no power and toughness of its own, and these keywords (as
   * written, lowercase) besides its abilities.
   */
  readonly copyAddsTypes?: {
    readonly subtypes: readonly string[];
    readonly cardTypes: readonly string[];
    readonly keywords: readonly string[];
  };
  readonly copyStartingLoyalty?: number;
  /**
   * "..., except it's an artifact and it loses all other card types" (Espers to Magicite, CR 707.9b): with `copyOf`, the copy has exactly these card types (as written, lowercase),
   * instead of the ones it copies (the engine's `copyOf.setTypes`).
   */
  readonly copySetTypes?: readonly string[];
  /** "..., except the token is 1/1" (Endless Evil, CR 707.9b): with `copyOf`, the copy has this power and toughness and keeps its colors, types and abilities (the engine's `copyOf.setPt`). */
  readonly copySetPt?: { readonly power: number; readonly toughness: number };
  /** "create two tapped Treasure tokens" (stage P28, CR 110.5b): the tokens enter tapped. */
  readonly tapped?: true;
  /** "create a tapped and attacking X/X ... creature token" (CR 508.4): the tokens enter tapped and attacking, never declared as attackers; with `tapped`. */
  readonly attacking?: true;
  /** "The token has enchant creature" (issue 89, CR 702.5a): an Aura token that enchants a creature. */
  readonly enchantsCreature?: true;
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
  /** "can't be blocked this turn except by Spirits" (CR 509.1b): the creatures that can't block, only with `cantBeBlocked`. */
  readonly blockers?: IrFilter;
}

/** What an "As ~ enters, choose ..." replacement asks (stage P15, D-100): a creature type or a color. */
export interface IrChoiceArg extends IrNode {
  readonly kind: 'choiceKind';
  /** `cardType` (Hashaton deck group 6, D-376, CR 205.2a): "As this creature enters, choose a card type." */
  readonly what:
    | 'creatureType'
    | 'color'
    | 'option'
    | 'cardType'
    | 'planeswalkerType'
    | 'lifePaid'
    // CR 614.12a, 607.2d (Sewer Nemesis, Phyrexian Revoker): "As this creature enters, choose a player" and "choose a nonland card name".
    | 'player'
    | 'cardName';
  /** `option` (stage P34, D-152, CR 614.12, 607.2d): "As ~ enters, choose Khans or Dragons", the names the card gives, as it writes them. */
  readonly options?: readonly string[];
  /** `color` (issue 184, Thriving Isle): "choose a color other than blue", the color that cannot be chosen, as its letter. */
  readonly except?: 'W' | 'U' | 'B' | 'R' | 'G';
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
    readonly step:
      | 'endStep'
      | 'thatCombat'
      | 'nextCast'
      | 'combatDamageToThatPlayer'
      | 'combatDamageBatch'
      | 'creatureDies';
    /**
     * `combatDamageToThatPlayer` (issue 144, CR 603.7, 603.7c, 510.3a): "Whenever a creature you control deals combat damage to that player this turn, create a tapped
     * Treasure token": a delayed ability for the turn, about the one player the spell's target named before it (the lowering finds that target).
     */
    readonly whose: 'you' | 'each';
    /**
     * `creatureDies` (Massacre Girl, CR 603.7, 603.10a, 700.4): "Whenever a creature dies this turn, each creature other than ~ gets -1/-1 until end of turn": a delayed ability for the
     * turn that triggers for each creature that dies.
     */
    /**
     * `combatDamageBatch` (Forth Eorlingas!, CR 603.7, 603.2c, 510.2): "Whenever one or more creatures you control deal combat damage to one or more players this turn, you become
     * the monarch": a delayed ability for the turn that triggers once for the creatures that dealt the damage of one combat damage event.
     */
    /**
     * `nextCast` (D-336, CR 603.7, 603.7a): "When you next cast an instant or sorcery spell this turn, copy that spell": the spell the delayed trigger waits for,
     * described by a filter of spells, and the subject (`triggerSubject`) of what the sentence does (the binding pass seeds it as the first antecedent).
     */
    readonly spell?: IrNoun;
    /**
     * `nextCast` with `repeat` (CR 603.7): "Whenever you cast a noncreature spell this turn, ..." triggers at every such cast until the end of the turn, where "When you next cast"
     * triggers once.
     */
    readonly repeat?: true;
  };
  /**
   * "When you do, ..." (stage P30, CR 603.12): a reflexive triggered ability, created by the "you may" sentence before it
   * when the player did what it offered. Read only in the body of a triggered ability.
   */
  readonly reflexive?: true;
  /**
   * "When you discard a nonland card this way, ..." (Federation Fleet deck, group D, CR 603.12, 608.2c): a reflexive triggered ability created when the discards of the instructions before it
   * in the same text discarded a card of the kind. Not `reflexive` ("When you do" asks whether a "you may" offer was taken): the lowering reads it alone, and refuses it where no discard came before.
   */
  readonly afterDiscard?: 'nonland' | 'any';
  /**
   * "When you exile a card this way, ..." (Cait Sith, Fortune Teller, CR 603.12, 701.13): a reflexive triggered ability created when the exile of the instructions before it in the same text
   * exiled a card. Not `reflexive` ("When you do" asks whether a "you may" offer was taken): the lowering reads it alone, and refuses it where no exile of the top card came before.
   */
  readonly afterExile?: true;
  /**
   * "When you reveal a creature card this way, ..." (Yuna's Whistle, CR 603.12, 701.20): a reflexive triggered ability created when the "reveal cards until" instruction before it found a card of
   * the card type the words name (kept here in lower case). Not `reflexive`: the lowering reads it alone, and refuses it where no such reveal came before.
   */
  readonly afterReveal?: string;
  /**
   * "Each player may discard a card." and "Target opponent may have you draw three cards." (stage P52, D-210, CR 608.2d, 101.4): the players the sentence asks
   * whether to do its clauses. `haveYou` says that the clauses are done by the controller ("may have you draw"), otherwise by the player asked. The clauses are
   * not `optional`: the question is this node's. Only in the body of a triggered ability.
   */
  readonly mayBy?: { readonly who: IrNoun; readonly haveYou: boolean };
  /**
   * "1—9 | Tap all creatures your opponents control." (D-525, CR 706.3a): the sentence starts a row of the results table of the die roll before it, for the results from `from` to
   * `to` (a single number has both the same). The sentences after it, up to the next sentence with a `dieRow`, belong to the row. Read only in the text of a spell.
   */
  readonly dieRow?: { readonly from: number; readonly to: number };
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
  /** "each of your main phases" (Frontier Siege): the postcombat main phase too, besides the step. */
  readonly alsoStep?: 'main2';
  readonly step?: 'draw' | 'main1' | 'beginCombat' | 'combatEnd' | 'main2' | 'upkeep' | 'endStep';
  /** 'drawn': the nth card the player draws each turn ("your second card each turn", CR 121.1). */
  readonly nth?: number;
  /** "... draws a card except the first one they draw in each of their draw steps" (CR 504.1): the engine's `drawn` trigger `exceptFirstInDrawStep`. */
  readonly exceptFirstInDrawStep?: true;
  /** 'cast': only the first spell of the kind the subject names that the actor casts each turn ("your first instant or sorcery spell each turn", CR 601.2i). */
  readonly firstOfKind?: true;
  /** 'classLevel': the level a Class became (CR 716.2). */
  readonly level?: number;
  /** 'cast' and 'sacrifice' (the latter only `you`): only while the active player is an opponent of this ability's controller (`opponent`) or is the controller (`you`, "during your turn"). */
  readonly duringTurn?: 'you' | 'opponent';
  /** 'enters' (issue 102, River Kelpie, CR 603.6a): "enters from a graveyard", the permanent came from a graveyard. */
  readonly fromGraveyard?: true;
  /** 'enters' with `fromGraveyard`: "enters from your graveyard", the graveyard is the controller's (CR 404.1). */
  readonly yourGraveyard?: true;
  /** 'attacks' alone (stage P21, CR 506.5): it triggers only when the creature is the only one declared as an attacker. */
  readonly alone?: true;
  /** 'becomesTarget' (stage P36, D-178, CR 603.2): "becomes the target of a spell", only a spell triggers it, not an ability. */
  readonly spellOnly?: true;
  /** 'becomesTarget' (Limit Break deck, Professor Hojo, CR 602.2): only an activated ability triggers it. */
  readonly activatedOnly?: true;
  /**
   * 'dealsCombatDamage': what the damage went to (stage P18, CR 120.2a); none is "any". 'noncombatDamageDealt' (issue 25, D-333, CR 120.2b): the player
   * damaged, `player` or `opponent` (never a creature). `playerOrPlaneswalker` (D-373): "to a player or planeswalker".
   */
  readonly damaged?:
    | 'player'
    | 'opponent'
    | 'opponents'
    | 'creature'
    | 'playerOrPlaneswalker'
    | 'you';
  /** 'endStep' "At the beginning of the monarch's end step" (CR 725.2, 603.2b): the turn of the player who is the monarch; `actor` is `eachPlayer`. */
  readonly monarchTurn?: true;
  /** 'combatDamageBatch' "... while you're the monarch" (issue 81, CR 725.2): the controller was the monarch as the damage was dealt. */
  readonly whileMonarch?: true;
  /** 'discarded': "another card" (D-374), a card other than the one with the ability. */
  readonly another?: true;
  /** 'dealsCombatDamage' to a player: the player, so that "that player" has an antecedent. */
  readonly recipient?: IrNoun;
  /**
   * 'attacks' at someone (stage P29, D-133, CR 508.1b): "attacks you" (`you`) or "attacks you or a planeswalker you control"
   * (`youOrPlaneswalkers`); left out, an attack at anyone. `defendingYou`: "..., if you're the defending player" (CR 508.5). `yourOpponents`: "attacks one of your opponents" (CR 508.5).
   */
  readonly at?: 'you' | 'youOrPlaneswalkers' | 'defendingYou' | 'opponent';
  /** 'dealtDamage': "is dealt combat damage" rather than "is dealt damage" (stage P29, D-133). */
  readonly combat?: true;
  /** 'dealtDamage': "is dealt noncombat damage" (CR 120.2b, 603.2). */
  readonly noncombat?: true;
  /** 'dealtDamage': "is dealt excess damage" (CR 120.10, 603.2): only damage that was more than lethal, its excess being the amount of the event. */
  readonly excess?: true;
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
   * P33, D-150, CR 508.1): the fewest attackers declared that match `subject` (all of them when it is left out). 'playsCard' (Death Toll deck, group D, CR 205.2a): the fewest card
   * types the card played has ("a card with two or more card types").
   */
  readonly atLeast?: number;
  /** 'enters' (Faldorn, CR 603.6a): "enters from exile", the permanent came from exile. 'playsCard' (Urianger Augurelt, CR 305.1, 601.2a): "you play a land from exile or cast a spell from exile", only a card played or cast from exile. */
  readonly fromExile?: true;
  /**
   * 'tappedForMana' "Whenever enchanted land is tapped for mana" (CR 106.12, 605.1b, 303.4): the permanent the Aura is attached to (the `subject` says its kind) is tapped for mana by whoever
   * controls it, and the mana is theirs: the engine's `tappedForMana` with `by: 'tapper'` and `hostOfSource`.
   */
  readonly enchantedTapped?: true;
  /** 'attackBatch' "Whenever enchanted player is attacked" (issue 160, D-629, CR 303.4m, 508.1b): the player the Aura enchants was declared as attacked. */
  readonly attackedEnchantedPlayer?: true;
  /** 'attackBatch' "Whenever an opponent attacks you" (CR 508.1b): the controller of the ability was declared as attacked as a player. */
  readonly attackedYou?: true;
  /** 'attackBatch' "Whenever an opponent attacks you and/or one or more planeswalkers you control" (Cunning Rhetoric, CR 508.1b, 508.6): the controller of the ability or a planeswalker they control was declared as attacked. */
  readonly attackedYouOrPlaneswalkers?: true;
  /** 'attackBatch' "Whenever you attack the player who has the initiative" (Loot Dispute, CR 726.1, 508.1b): the player who has the initiative was declared as attacked as a player. */
  readonly attackedInitiativeHolder?: true;
  /** 'exerted' "If ~ hasn't been exerted this turn, you may exert it as it attacks" (Combat Celebrant, CR 701.43b): the exert is offered only to a creature not yet exerted this turn. */
  readonly unlessExertedThisTurn?: true;
  /** 'attackBatch' "Whenever ~ and at least two other creatures attack" (Frontline Medic, CR 508.1): the permanent with the ability is one of the attackers counted. */
  readonly includesSource?: true;
  /** 'attackBatch' "Whenever one or more creatures attack one of your opponents or a planeswalker they control" (Frontier Warmonger, CR 508.1b, 506.3): only those creatures count. */
  readonly attackingYourOpponents?: true;
  /**
   * 'lifeGained' and 'lifeLost': "for the first time each turn" (stage P33, D-150, CR 119.9): only the first gain of the player in the turn. Stage P34 (D-152,
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
  /** 'countersAdded' "the twelfth hour counter is put on ~" (Midnight Clock, issue 121): the number of counters of the kind the putting reaches. */
  readonly reaches?: number;
  /** 'countersAdded' "a -1/-1 counter is put on a creature" (Flourishing Defenses, CR 122.6): the singular wording, once for each counter put on. */
  readonly perCounter?: true;
  /**
   * 'attacks' "while you don't control another Dinosaur" (stage P32, D-147, CR 603.2): a condition that is part of the event itself,
   * read once as it happens (not an intervening "if", CR 603.4, which is read again as the ability resolves).
   */
  readonly whileCondition?: IrCondition;
  /**
   * 'becomesTapped' (Hylda deck group 1, D-510, CR 603.2c): "Whenever you tap one or more untapped creatures your opponents control": one trigger for the permanents
   * tapped together, whatever their number. The player who taps is the `actor` ("you tap"). 'lifeLost' "Whenever one or more opponents lose life" (CR 603.2c, 119.3): one
   * trigger for the simultaneous losses of several players; the `actor` is "each opponent".
   */
  readonly batch?: true;
  /** 'putIntoGraveyard' (Death Toll deck group B, CR 603.2): "from your library" (the cards came from the library), not "from anywhere". */
  readonly fromLibrary?: true;
  /**
   * 'putIntoGraveyard' "a creature card is put into a graveyard from anywhere other than the battlefield" (CR 603.2, 700.4): the graveyard of any player, and any zone but the
   * battlefield.
   */
  readonly fromNotBattlefield?: true;
  /** 'putIntoGraveyard' "a card is put into an opponent's graveyard from anywhere" (CR 603.2, 404.1): the graveyard of a player other than the controller of the ability. */
  readonly opponentGraveyard?: true;
  /** 'putIntoGraveyard' "a land card is put into a graveyard from anywhere" (Centaur Vinecrasher, CR 603.2, 404.1): the graveyard of any player, from any zone (the battlefield too). */
  readonly anyGraveyard?: true;
  /** 'leftGraveyard' "a creature card leaves your graveyard" (CR 603.2, 400.7): once for each card, not one trigger for the cards that leave together. */
  readonly each?: true;
  /** 'attackBatch' "Whenever one or more Demons you control attack a player" (Death Toll deck group B, CR 508.1b, 508.6): once for each player attacked as a player, with the creatures that attack them. */
  readonly eachAttackedPlayer?: true;
  /** 'attackBatch' "Whenever one or more Dragons you control attack an opponent" (Firkraag, CR 508.1b, 508.6): once for each opponent attacked, "that player" being that opponent. */
  readonly eachAttackedOpponent?: true;
}

export interface IrRestriction extends IrNode {
  readonly kind: 'restriction';
  /** Activate only as a sorcery. */
  readonly timing?: 'sorcery';
  /** Activate only once each turn. */
  readonly perTurn?: number;
  /** "Only your opponents may activate this ability." (CR 602.2): who may activate it. */
  readonly activator?: 'opponents';
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
  // "Enchanted creature can't attack or block" (Danitha deck, D-407, CR 508.1a): only of the permanent an Aura or Equipment is attached to.
  | 'cantAttack'
  | 'cantBeBlocked'
  | 'attacksEachCombat'
  | 'doesntUntap'
  | 'cantBeCountered'
  // "can't be blocked by more than one creature" (stage P29, D-133, CR 509.1b)
  | 'cantBeBlockedByMoreThanOne'
  // "~ can't be blocked except by three or more creatures" (Hosts of Mordor deck, CR 509.1b): like menace, with three blockers.
  | 'cantBeBlockedExceptByThreeOrMore'
  | 'mustBeBlocked'
  | 'mustBlock'
  // "Enchanted creature ... is goaded" (issue 201, CR 701.15): only of the permanent an Aura or Equipment is attached to.
  | 'goaded'
  // "~ can block only creatures with flying" (Prismari deck group 2, D-648, CR 509.1b): only of `~` itself.
  | 'canBlockOnlyFlying'
  // "~ can't attack a player it has already attacked this turn" (Ahoy Mateys deck, group 6, CR 508.1a, 508.6): only of `~` itself.
  | 'cantAttackPlayersAlreadyAttacked'
  // "Creatures you control can attack as though they didn't have defender" (CR 609.4, 702.3b): a static ability of a group or of `~`, and "target creature can attack this turn as though it didn't have defender".
  | 'canAttackAsThoughNoDefender'
  // "~ can attack players who attacked you during their last turn as though it didn't have defender" (CR 609.4, 702.3b): only of `~` itself.
  | 'canAttackAsThoughNoDefenderVsLastTurnAttackers'
  // "Each creature you control assigns combat damage equal to its toughness rather than its power" (CR 510.1a, 609.4), and the same until end of turn for a target.
  | 'assignsDamageByToughness';

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
  // Colossus Hammer (CR 613.1f): "loses flying": a keyword without parameters the subject no longer has (the engine's `loseKeyword`).
  | { readonly kind: 'loseKeyword'; readonly keyword: string }
  // Puresteel Paladin (CR 702.6a): "have equip {0}": the Equip ability a group of Equipment is given, with a plain mana cost (the engine's `grantKeyword` of `equip`).
  | { readonly kind: 'grantEquip'; readonly cost: IrCost }
  /**
   * `has protection from red and from blue` (stage P70, D-259, CR 702.16): protection from the colors the statement names (`colors`, color words as
   * written, lowercase) or, when `commanderIdentity` is set, "each color that's not in your commander's color identity" (CR 903.4, 903.4f). One of the two.
   */
  | {
      readonly kind: 'grantProtection';
      readonly colors?: readonly string[];
      readonly commanderIdentity?: true;
      /** "protection from creatures" (Danitha deck group 1b, D-402, CR 702.16a, 205.2a): the card types named, as the engine's card type words (`creature`). */
      readonly cardTypes?: readonly string[];
      /** "protection from the chosen card type" (Hashaton deck group 6, D-376, CR 702.16a): the card type the source of the ability chose as it entered. */
      readonly chosenCardType?: true;
      /** "protection from the chosen color" (Flickering Ward, D-652, CR 702.16a): the color the source chose as it entered; `exceptSource`: "This effect doesn't remove ~." */
      readonly chosenColor?: true;
      readonly exceptSource?: true;
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
  // D-647 (CR 508.1a): "Inklings can't attack you or planeswalkers you control": the creatures the subject names cannot be declared attacking the controller or their planeswalkers
  // Riders of Rohan deck, group E (CR 508.1a): "Enchanted creature can't attack you.": the players only, no planeswalkers (`playersOnly`).
  | { readonly kind: 'cantAttackYou'; readonly playersOnly?: true }
  // Fealty to the Realm (CR 613.1b, 725.1): "The monarch controls enchanted creature.": the engine's `controlAttached` by the monarch.
  | { readonly kind: 'controlByMonarch' }
  | { readonly kind: 'noMaxHandSize' }
  /** "If this card is in your opening hand, you may begin the game with it on the battlefield." (CR 103.6): the engine's `beginGameOnBattlefield` of the card itself. */
  | { readonly kind: 'beginGameOnBattlefield' }
  /**
   * "As long as ~ isn't on the battlefield, it's a 1/1 Insect creature in addition to its other types." (Death Toll deck, group C, Grist, the Hunger Tide; CR 604.3): the engine's
   * `creatureOffBattlefield` of the card itself. `subtypes` are the creature types as written (capitalised).
   */
  | {
      readonly kind: 'creatureOffBattlefield';
      readonly power: number;
      readonly toughness: number;
      readonly subtypes: readonly string[];
    }
  /** "~ is the chosen type in addition to its other types." (stage P15, D-100, CR 205.1b, 613.1d). */
  | { readonly kind: 'chosenType' }
  /**
   * "~ costs {1} less to cast for each creature on the battlefield", "Artifact spells you cast cost
   * {1} less to cast" (stage P13, CR 118.7, 601.2f): `amount` generic mana less. The statement's
   * subject is `~` (the spell itself) or the spells described (`det` `each`, `controller` you).
   */
  | {
      readonly kind: 'costReduction';
      readonly amount: IrAmount;
      readonly inCommandZone?: true;
      /** "~ costs {X} less to cast this way" (Visions of Glory, CR 702.34a): the reduction is for the flashback cost only. */
      readonly thisWay?: 'flashback';
    }
  /** D-149 (CR 601.2f): "Spells your opponents cast that target ~ cost {2} more to cast.": the engine's `costIncrease`, generic mana only. */
  | { readonly kind: 'costIncrease'; readonly amount: number }
  // "Equip abilities you activate that target enchanted creature cost {3} less to activate." (D-428, CR 601.2f, 602.2b, 702.6a): the generic mana taken off
  // Helitrooper: "that target ~" (`targetsSelf`): the creature with the ability, not the permanent an Aura enchants.
  | { readonly kind: 'abilityCostReduction'; readonly amount: number; readonly targetsSelf?: true }
  // "The first activated ability you activate during your turn that targets a creature you control costs {2} less to activate." (Limit Break deck, Professor Hojo, CR 601.2f, 602.2b)
  | { readonly kind: 'firstTargetingAbilityCostReduction'; readonly amount: number }
  /** "Plotting cards from your hand costs {2} less." (Doc Aurlock, Grizzled Genius, CR 702.170a): the engine's `plotCostReduction`, generic mana only. */
  | { readonly kind: 'plotCostReduction'; readonly amount: number }
  // "Strive — ~ costs {2}{R} more to cast for each target beyond the first." (Prismari deck, group 1, D-641, CR 601.2f): the mana symbols added once for each target beyond the first.
  | { readonly kind: 'costPerExtraTarget'; readonly cost: readonly string[] }
  // "Activated abilities of creature cards in your graveyard cost {1} less to activate." (Gisa deck, group 4, D-461, CR 601.2f, 118.7, 113.6b): the generic mana taken off
  // the abilities of the cards of these card types in the graveyard of the controller
  | {
      readonly kind: 'graveyardAbilityCostReduction';
      readonly amount: number;
      readonly types: readonly string[];
    }
  // "Activated abilities of Foods you control cost {1} less to activate." (Food and Fellowship deck, group B, CR 601.2f, 602.2b, 118.7): the generic mana taken off the
  // abilities of the permanents `objects` names (a plural noun with no determiner), whoever activates them.
  | {
      readonly kind: 'permanentAbilityCostReduction';
      readonly amount: number;
      readonly objects: IrNoun;
    }
  // "Activated abilities of creatures you control cost {X} less to activate, where X is ~'s power. This effect can't reduce the mana in that cost to less than one mana." (Agatha of the
  // Vile Cauldron, issue 345, CR 601.2f, 118.7): the power of the permanent itself taken off the generic mana, leaving at least one mana.
  | { readonly kind: 'creatureAbilityCostReductionByPower' }
  /**
   * "As an additional cost to cast ~, sacrifice a creature." (stage P13, CR 118.8): costs paid with
   * the spell's total cost. The statement's subject is `~`.
   */
  | {
      readonly kind: 'additionalCost';
      readonly costs: readonly IrCost[];
      readonly optional?: true;
      /**
       * "..., sacrifice an artifact or creature or pay {4}." (stage P38, D-182, CR 118.8, 601.2b): the second way the cost is paid, when the line
       * says two ("A or B"); `costs` is then the first way, of one cost.
       */
      readonly orCosts?: readonly IrCost[];
    }
  /**
   * "As an additional cost to cast ~, you may sacrifice one or more creatures. When you do, copy ~ for each creature sacrificed this way." (D-492, CR 118.8, 601.2b,
   * 603.12, 707.10): the cost is any number of the permanents `what` names, and the spell is copied for each. The statement's subject is `~`.
   */
  | { readonly kind: 'optionalSacrificeCopies'; readonly what: IrNoun }
  /**
   * "If you control a commander, you may cast ~ without paying its mana cost." (stage P13, CR
   * 118.9): an alternative cost of the card itself. The statement's subject is `~`.
   */
  | { readonly kind: 'freeCast'; readonly condition?: IrCondition }
  /**
   * "If you control a Swamp, you may pay 4 life rather than pay ~'s mana cost." (Snuff Out, CR 118.9, 118.4, 601.2b): an alternative cost of the face that pays no mana and `life` life,
   * when the `condition` (read for the caster as the spell is cast) holds. The subject is `~`.
   */
  | { readonly kind: 'lifeAlternative'; readonly life: number; readonly condition?: IrCondition }
  /**
   * "You may pay {1}{B} rather than pay ~'s mana cost." (Baleful Mastery, CR 118.9, 601.2b): an alternative cost of the face that pays the mana `cost` (symbols without braces) instead of the
   * mana cost. The subject is `~`.
   */
  | { readonly kind: 'manaAlternative'; readonly cost: readonly string[] }
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
  /** "Play with the top card of your library revealed." (CR 401.5, Oracle of Mul Daya). The subject is `you`. */
  | { readonly kind: 'revealTopOfLibrary' }
  /**
   * "You may play lands from the top of your library." (CR 305.1, 401.5, Oracle of Mul Daya). The subject is `you`. `alsoLook` is the sentence "You may look at the top card of
   * your library any time, and you may play lands from the top of your library.", which is both abilities (issue 345).
   */
  | { readonly kind: 'playLandsFromTopOfLibrary'; readonly alsoLook?: true }
  /** "You may play Forests from your graveyard.", "You may play lands from your graveyard." (Death Toll deck, group D, CR 305.1): `landType` is the basic land type named, none for any land. The subject is `you`. */
  | { readonly kind: 'playLandsFromGraveyard'; readonly landType?: string }
  /** "During each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard." (CR 601.2a, 305.1): the subject is `you`. */
  | { readonly kind: 'graveyardPlayEachType' }
  /** "You may activate abilities of creatures you control as though those creatures had haste." (issue 345, CR 702.10b, 302.6): the subject is `you`. */
  | { readonly kind: 'activateAsThoughHaste' }
  /** "You may activate the loyalty abilities of planeswalkers you control twice each turn rather than only once." (CR 606.3). The subject is `you`. */
  | { readonly kind: 'loyaltyActivationLimit'; readonly timesEachTurn: number }
  /**
   * "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking
   * you." and "Creatures can't attack you or planeswalkers you control unless their controller pays {W/P} for each of
   * those creatures." (stage P24, D-125, CR 508.1d, 508.1h): the `cost` one attacker pays, a mana cost whose symbols
   * are plain, hybrid or Phyrexian (never X), and whether the planeswalkers of the controller are covered too.
   */
  | {
      readonly kind: 'attackTax';
      readonly cost: IrCost;
      readonly planeswalkers?: true;
      /** "Creatures can't attack planeswalkers you control unless ...": only the planeswalkers, not the controller (engine `planeswalkersOnly`). */
      readonly planeswalkersOnly?: true;
      /** "unless its controller pays {X}, where X is the number of counters on that creature": only creatures with counters, `cost` once for each counter. */
      readonly perCounter?: true;
    }
  /** "You may choose not to untap ~ during your untap step." (stage P24, D-125, CR 502.3). The subject is `~`. */
  | { readonly kind: 'optionalUntap' }
  /** "~ saddles Mounts and crews Vehicles as though its power were 2 greater." (Galadriel deck group 3, CR 702.122a, 702.171a). The subject is `~`. */
  | { readonly kind: 'crewSaddleBonus'; readonly amount: number }
  /**
   * "Untap all creatures you control during each other player's untap step." (stage P68, D-229, CR 502.3); `permanents` is "all permanents you control". The subject is `you`; with `self` (D-320,
   * "Untap ~ during each other player's untap step.") the permanent itself untaps and the subject is `~`.
   */
  | {
      readonly kind: 'untapInOthersStep';
      readonly self?: true;
      /** "Untap all permanents you control during each other player's untap step." (Seedborn Muse): every permanent of the controller, not only the creatures. */
      readonly permanents?: true;
    }
  /** "You may cast this card from your graveyard." (stage P29, D-133, CR 113.6b). The subject is `~`; a condition makes it "as long as ...". */
  | {
      readonly kind: 'castFromGraveyard';
      readonly cost?: readonly string[];
      /** "... using its blitz ability" (CR 702.152a): the permission is for the blitz cost only. */
      readonly using?: 'blitz';
    }
  /** "can't be blocked by Walls", "can't be blocked by creatures with power 2 or less" (stage P31, CR 509.1b): the blockers excluded. */
  | { readonly kind: 'cantBeBlockedBy'; readonly blockers: IrFilter }
  /** "have base power and toughness 5/3" (stage P31, CR 613.4b): the subject's power and toughness are set in layer 7b. */
  | { readonly kind: 'basePt'; readonly power: number; readonly toughness: number }
  /**
   * "are Juggernauts in addition to their other creature types" (stage P31, CR 205.1b, 613.1d): creature types added in layer 4. `types`
   * (Galadriel deck, group 2, D-541, "Nontoken creatures you control are Forest lands in addition to their other types"): card types added with them.
   */
  | {
      readonly kind: 'addTypes';
      readonly subtypes: readonly string[];
      readonly types?: readonly string[];
    }
  /** "You may cast artifact spells as though they had flash." (stage P31, CR 601.3b, 702.8a). The subject is `you`. */
  | { readonly kind: 'castAsThoughFlash'; readonly spells: IrFilter; readonly anyPlayer?: true }
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
   * "As long as the top card of your library is a Goblin card, ~ has all activated abilities of that card." (issue 144, CR 613.1f, 401.5): the activated abilities of the card on top of the
   * library, while it is `card`. The subject is `~`.
   */
  | { readonly kind: 'grantActivatedAbilitiesOfTopCard'; readonly card: IrFilter }
  /**
   * "Creatures you control have all activated abilities of all land cards exiled with ~." (issue 102, Steward of the Harvest, CR 613.1f, 607.2a): the activated abilities of the cards
   * the permanent exiled with its linked ability, given to the subject group.
   */
  | { readonly kind: 'grantActivatedAbilitiesOfLinkedExile'; readonly from: IrFilter }
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
  /**
   * "Creatures you control are every creature type. The same is true for creature spells you control and creature cards you own that aren't on the battlefield." (issue 104, CR 205.3m,
   * 613.1d, 604.3): the group the scope names has every creature type. One effect for each scope the statement names: `youControl` (the creatures you control, on the battlefield or as spells)
   * and `youOwn` (the creature cards you own outside the battlefield).
   */
  | { readonly kind: 'allCreatureTypes'; readonly scope: 'youControl' | 'youOwn' }
  /**
   * "Creature spells you cast have demonstrate." (issue 145, CR 702.144a, 702.51a, 613.1f): the spells the controller casts that the subject names (a noun with `det: 'each'` and the
   * controller `you`) have the keyword `keyword`, a keyword with no parameter.
   */
  | {
      readonly kind: 'spellKeyword';
      readonly keyword: 'demonstrate' | 'convoke' | 'improvise' | 'cascade' | 'replicateAtManaCost';
    }
  /**
   * "Elemental permanent spells you cast from your hand gain evoke {4} as you cast them." (CR 702.74a, 118.9, 601.2b): the permanent spells the subject names (a noun with the controller
   * `you`), cast from the hand, are given an evoke cost `cost` (a mana cost) as they are cast.
   */
  | { readonly kind: 'spellEvoke'; readonly cost: IrCost }
  /**
   * "Each creature card in your hand has cycling {1}{U}." (issue 104, CR 702.29a, 613.1f): the cards of the card types in the hand of the controller have a cycling ability with
   * `cost` (a mana cost). The subject of the statement is `you`.
   */
  | { readonly kind: 'handCycling'; readonly cardTypes: readonly string[]; readonly cost: IrCost }
  /**
   * `are Equipment in addition to their other types and have "Equipped creature gets +2/+0," equip Pirate {1}, and equip {3}` (CR 613.1d, 613.1f, 702.6a, 702.6c): the group of
   * the statement is Equipment as well, has the quoted "+N/+N" for the creature it equips and each equip ability (`subtype`: the creature type an "equip [type]" may target).
   */
  | {
      readonly kind: 'equipmentKit';
      readonly power: number;
      readonly toughness: number;
      readonly equips: readonly { readonly cost: IrCost; readonly subtype?: string }[];
    }
  /**
   * "Each instant and sorcery card in your graveyard has flashback. The flashback cost is equal to that card's mana cost." (CR 702.34a, 118.9, 613.1f): the cards of the graveyard of the
   * controller that `cards` names (a noun with no zone and no controller). The subject of the statement is `you`.
   */
  | { readonly kind: 'graveyardFlashback'; readonly cards: IrNoun }
  /** "You may pay eight {E} rather than pay the mana cost for permanent spells you cast." (issue 105, CR 118.9, 107.14): the permanent spells of the controller may be cast for `count` energy counters. The subject is `you`. */
  | {
      readonly kind: 'energyAlternative';
      readonly count: number;
      /** Tlincalli Hunter (CR 118.9, 601.2b): "Once each turn, you may pay {0} rather than pay the mana cost for a creature spell you cast from exile": the spells are cast from exile, one each turn. */
      readonly fromExile?: true;
      readonly oncePerTurn?: true;
      /** The card types of the spells the grant is for ("a creature spell"); left out for permanent spells. */
      readonly types?: readonly string[];
    }
  /** "~ isn't a creature" (stage P68, D-229, CR 613.1d, 205.1a): the card types the subject loses. */
  | { readonly kind: 'loseTypes'; readonly cardTypes: readonly string[] }
  /** "If a triggered ability of ... triggers, that ability triggers an additional time." (stage P67, D-220, CR 603.2d). The subject is the permanents named. `cause` (stage P71, D-339): "If you casting or copying an instant or sorcery spell causes a triggered ability of a permanent you control to trigger, ..." names the spell whose cast or copy must cause the trigger. */
  | {
      readonly kind: 'doubleTriggers';
      readonly cause?: IrNoun;
      /** Issue 81 (Windcrag Siege): "If a creature attacking causes a triggered ability ... to trigger". */
      readonly causeAttacks?: true;
      /** Felix Five-Boots: "If a creature you control dealing combat damage to a player causes a triggered ability ... to trigger". */
      readonly causeCombatDamage?: true;
      /** Yarok, the Desecrated: "If a permanent entering causes a triggered ability ... to trigger". */
      readonly causeEnters?: true;
      /** Issue 105 (Panharmonicon): with `causeEnters`, only a permanent that is one of these card types as it enters. */
      readonly causeEntersTypes?: readonly string[];
    }
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
  /** "Your opponents can't gain life." (Hashaton deck group 2, D-363, CR 119.7). The subject is `you`, the controller of the permanent; "Players can't gain life." is said of `players`. */
  | { readonly kind: 'cantGainLife'; readonly who: 'opponents' | 'players' }
  /** "Damage can't be prevented." (CR 615.12): the permanent changes a rule of the game. */
  | { readonly kind: 'damageCantBePrevented' }
  /** "All damage is dealt as though its source had wither." (CR 702.80a, 120.3d): the permanent changes a rule of the game. */
  | { readonly kind: 'damageAsThoughWither' }
  /** "Activated abilities of sources with the chosen name can't be activated." (Phyrexian Revoker, CR 602.5, 607.2d): the permanent changes a rule of the game, for the name it chose as it entered. */
  | { readonly kind: 'cantActivateChosenName' }
  /** "If an opponent would search a library, that player searches the top four cards of that library instead." (Aven Mindcensor, CR 701.23): the number of cards. */
  | { readonly kind: 'opponentSearchTopOnly'; readonly count: number }
  /**
   * "Creatures you control can't have -1/-1 counters put on them." (Hashaton deck group 3, D-380, CR 122.6, 101.2): no counter of the kind named (a power and
   * toughness counter, "+1/+1" or "-1/-1") is put on the permanents the subject names. The subject is a group, `~` or the attached permanent.
   */
  | { readonly kind: 'cantHaveCounters'; readonly counter: string }
  /** "This artifact can't be sacrificed." (CR 701.21a, 101.2; Hithlain Rope). The subject is `~`. */
  | { readonly kind: 'cantBeSacrificed' }
  /**
   * "Prevent all combat damage that would be dealt to ~." (stage P33, D-150, CR 615.1): the damage of the kind named that would be dealt to
   * the permanent is prevented. The subject is `~`.
   */
  | {
      readonly kind: 'preventDamageToThis';
      readonly scope: 'all' | 'combat' | 'noncombat';
      /** "..., prevent that damage and remove a +1/+1 counter from it." (issue 159): the counter removed for each damage event prevented. */
      readonly removeCounter?: string;
    }
  /**
   * "Prevent all combat damage that would be dealt by ~." and "Prevent all noncombat damage that would be dealt to you and other permanents you control." (Planeswalker
   * Party deck, CR 615.1): the engine's `preventDamageAround`. The subject is `~`.
   */
  | {
      readonly kind: 'preventDamageAround';
      readonly scope: 'all' | 'combat' | 'noncombat';
      readonly events:
        | 'dealtByThis'
        | 'dealtToYouAndYourOtherPermanents'
        | 'dealtToYouAndYourPlaneswalkers';
      /** "Prevent all but 1 of that damage" (Ajani Steadfast's emblem): the damage left. */
      readonly keep?: number;
    }
  /**
   * "Each opponent can't draw more than one card each turn." (Narset, Parter of Veils, CR 121.2b): the engine's `drawLimit`. The subject is `~`.
   */
  | {
      readonly kind: 'combatCreatureLimit';
      readonly what: 'attack' | 'block';
      readonly max: number;
    }
  | { readonly kind: 'drawLimit'; readonly who: 'opponents' | 'players'; readonly max: number }
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
   * "You may cast ~ from your graveyard by paying {B}{B} and sacrificing two creatures rather than paying its mana cost." (issue 159, CR 118.9, 601.2h, 701.21a): an alternative
   * cost of the face, cast from the owner's graveyard, that pays `cost` (mana) and sacrifices `count` permanents `what` describes. The subject is `~`.
   */
  | {
      readonly kind: 'graveyardSacrificeAlternative';
      readonly cost: IrCost;
      readonly what: IrNoun;
      readonly count: number;
    }
  /**
   * "You may sacrifice a nontoken black creature rather than pay ~'s mana cost." (Flare of Malice, CR 118.9, 601.2h, 701.21a): an alternative cost of the face that pays no mana and sacrifices
   * `count` permanents `what` describes. The subject is `~`.
   */
  | {
      readonly kind: 'sacrificeAlternative';
      readonly what: IrNoun;
      readonly count: number;
    }
  /**
   * "You don't lose unspent red mana as steps and phases end." (stage P34, D-152, CR 500.5, 106.4): mana of these colors (letters, `C` colorless) in
   * the controller's pool does not empty as a step or a phase ends. The subject is `you`.
   */
  | { readonly kind: 'unspentManaStays'; readonly colors: readonly string[] }
  /** "If you would lose unspent mana, that mana becomes colorless instead." (issue 81, Omnath, CR 106.4, 614.1a): the mana in the controller's pool is made colorless instead of lost. The subject is `you`. */
  | { readonly kind: 'unspentManaBecomesColorless' }
  /**
   * "~ gets +1/+1 for each unspent mana you have." (issue 81, Omnath, CR 106.4, 613.4c): +1 to each stat whose flag is set, for each mana in the controller's pool (the engine's `unspentMana`).
   */
  | { readonly kind: 'ptUnspentMana'; readonly power: boolean; readonly toughness: boolean }
  /**
   * "Creatures you control get +1/+1 for each unity counter on ~." (CR 122.1, 613.4c): +1 to each stat whose flag is set, for each counter of the kind `counter` (any kind when left out) on
   * the permanent with the ability (the engine's `countersOnSource`).
   */
  | {
      readonly kind: 'ptCountersOnSource';
      readonly power: boolean;
      readonly toughness: boolean;
      /** The kind of counter; left out for "for each counter on ~" (every kind added together, Gavel of the Righteous). */
      readonly counter?: string;
    }
  /**
   * "You may cast creature spells with power 4 or greater from the top of your library. If you cast a creature spell this way, it gains haste until end
   * of turn." (stage P34, D-152, CR 601.3, 401.5, 702.10): the controller may cast the top card of their library when it is a spell `spells`
   * describes (as the card it is); `gainsHaste` is the second sentence. The subject is `you`.
   */
  | {
      readonly kind: 'castFromTop';
      readonly spells: IrFilter;
      readonly gainsHaste: boolean;
      /** "... by sacrificing a nonland permanent in addition to paying their other costs" (Death Toll deck, group D, CR 601.2b, 118.8): the permanent each such spell sacrifices. */
      readonly sacrifice?: IrFilter;
    }
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
      /** "by exiling three other cards from your graveyard in addition to paying its other costs" (issue 102, Kotis, CR 601.2f): the other cards of the graveyard exiled as the cost. */
      readonly exileOthers?: number;
      /** "by sacrificing a land in addition to paying its other costs" (Exploration Broodship, CR 601.2b, 118.8): the permanent a spell cast this way sacrifices. */
      readonly sacrifice?: IrFilter;
      /** "from among cards in your graveyard that were put there from anywhere other than the battlefield this turn" (Banon, CR 404.1): the engine's `putElsewhereThisTurn`. */
      readonly putElsewhereThisTurn?: true;
    }
  /**
   * "During your turn, as long as you've sacrificed a nontoken permanent this turn, you may play cards exiled with ~." (Evendo Brushrazer, CR 607.2a, 601.2a, 305.1): the controller may
   * play the cards the permanent exiled with its linked ability, while the statement's condition holds. The subject is `you`.
   */
  | { readonly kind: 'linkedExilePlay' }
  /**
   * "Lands you control enter untapped." (stage P37, D-180, CR 614.1c, 614.12): the permanents that enter under the controller's control and that
   * the subject describes (a plural group of the controller's own) enter untapped. The subject is the group.
   */
  | { readonly kind: 'groupEntersUntapped' }
  | { readonly kind: 'groupEntersTapped' }
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
  /**
   * "The "legend rule" doesn't apply to Slivers you control." (issue 133, CR 704.5j, 604.1): the permanents of the controller the subject names (a noun with `det: 'each'` and the
   * controller `you`) are not subject to the legend rule while the permanent has the ability.
   */
  | { readonly kind: 'legendRuleDoesntApply' }
  /**
   * "Slivers you control and nontoken creatures you control are the chosen type in addition to their other creature types. The same is true for creature spells you control and creature
   * cards you own that aren't on the battlefield." (issue 133, CR 613.1d, 607.2d): the subject is the group of permanents (a noun whose filter is the choice of the two groups); the
   * creature spells and cards outside the battlefield are named by the second sentence.
   */
  | { readonly kind: 'chosenTypeGroups' }
  /**
   * "Each Sliver creature card in your graveyard has encore {X}, where X is its mana value." (issue 133, CR 702.141a, 613.1f): the creature cards of `cards` in the graveyard of the controller
   * (the statement's subject, `you`) have Encore with the cost the mana value of the card.
   */
  | { readonly kind: 'graveyardEncore'; readonly cards: IrNoun }
  /**
   * "Each creature card in your graveyard that's a Cleric, Rogue, Warrior, and/or Wizard has unearth {1}{B}." (Solemn Doomguide, CR 702.84a, 613.1f): the cards of `cards` in the graveyard of
   * the controller (the statement's subject, `you`) have Unearth with the plain mana cost `cost`.
   */
  | { readonly kind: 'graveyardUnearth'; readonly cards: IrNoun; readonly cost: IrCost }
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
   * "Equipped creature has lifelink if you control a Cleric, deathtouch if you control a Rogue, ..." (Multiclass Baldric, CR 611.3a, 613.1f): one condition for each effect,
   * in the order of `effects` (the same length), each effect applying only while its own condition holds. Set instead of `condition`, only by the rule that reads the list.
   */
  readonly effectConditions?: readonly IrCondition[];
  /**
   * "As long as this card is in your graveyard, ..." (stage P34, D-152, CR 113.6b, 604.2): the ability works while its card is in its owner's
   * graveyard, and not on the battlefield; the words are no condition of the engine, they say where the ability works.
   */
  readonly functionsIn?: 'graveyard';
  /** Issue 81 (Windcrag Siege, "• Mardu — ...", CR 607.2d): the ability works while the permanent has this option, chosen as it entered. Only an additional trigger carries it. */
  readonly option?: string;
  /** Stage P29: the other subjects the statement names after the first ("~ gets +2/+2 and creatures you control have vigilance"). */
  readonly also?: readonly IrStaticPart[];
}

/** One keyword: `name` is the words as written, lowercased ("first strike"). */
export interface IrKeyword extends IrNode {
  readonly kind: 'keyword';
  readonly name: string;
  readonly params: readonly IrArg[];
  /** What Gift gives when its line names the gift. */
  readonly gift?: 'card' | 'tappedFish';
  /** The cost of a keyword that has one: "Cycling {2}" (CR 702.29a). */
  readonly cost?: readonly IrCost[];
  /** "Kicker {X}. X can't be 0." (Thieving Skydiver, CR 702.33a, 107.3a): the kicker cost is {X}, announced as at least 1. */
  readonly xNotZero?: true;
  /** "Equip—Pay {3} or remove a counter from ~" (Gavel of the Righteous, CR 702.6a, 118.3): the other way to pay the equip ability, which `cost` is the first of. */
  readonly orCost?: readonly IrCost[];
  /** "Equip Wizard {1}" (stage P67, D-220, CR 702.6c): the creature type of the creature the equip ability attaches to. */
  readonly quality?: string;
  /** "Equip commander {3}" (stage P70, D-259, CR 702.6c, 903.3): the equip ability attaches only to a creature that is a commander. */
  readonly commanderOnly?: true;
  /** "Equip legendary creature {3}" (issue 345, CR 702.6c, 205.4): the equip ability attaches only to a legendary creature. */
  readonly legendaryOnly?: true;
  /** "Protection from red and from blue" (stage P68, D-229, CR 702.16): the color words, as written, lowercase. */
  readonly colors?: readonly string[];
  /** "Protection from mana value 3 or greater" (Mistmeadow Skulk, CR 702.16a, 202.3): the comparison and the number of the quality. */
  readonly manaValue?: { readonly cmp: 'atLeast' | 'atMost' | 'equal'; readonly value: number };
  /** "Equip {2}. This ability costs {2} less to activate if you have one or fewer cards in hand." (Ahoy Mateys group 10, CR 601.2f, 602.2b): the reduction of the equip ability, as that of `IrRestriction.costReduction`. */
  readonly costReducedIf?: { readonly amount: IrAmount; readonly condition: IrCondition };
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
  /** "Choose one that hasn't been chosen": a mode this permanent chose while it was the same object is not offered. */
  readonly notRepeatedBySource?: true;
  /**
   * "Choose three. You may choose the same mode more than once." (D-344, CR 700.2d): the same mode may be chosen more than once; `max` may be more than the number
   * of bullets, and `min` is 0 for "Choose up to three. You may choose the same mode more than once.".
   */
  readonly repeatable?: true;
  /** "you may choose two" (CR 700.2b): no mode or exactly `max` of them, `min` is 0; the engine's `ModeChoice.allOrNone`. Only a triggered ability. */
  readonly allOrNone?: true;
  /** "Each mode must target a different player." (CR 700.2d): the engine's `ModeChoice.differentTargets`. */
  readonly differentTargets?: true;
  /** "Choose one at random —" (CR 700.2): the engine's `ModeChoice.random`, the mode is drawn from the seeded generator as the triggered ability goes on the stack. */
  readonly random?: true;
}

/** The header line of a modal spell or ability ("Choose one —"), read by the `modal` rules. */
export interface IrModeHeader extends IrNode {
  readonly kind: 'modeHeader';
  readonly choose: IrModeChoice;
  /**
   * "Tiered" (D-433, CR 702.183a, 700.2h): every bullet starts with a name and the cost of the mode, "Cure — {0} — Target permanent gains ...": the
   * cost is paid as an additional cost when the mode is chosen. The modal reading takes the name and the cost off each bullet (`IrModes.costs`).
   */
  readonly costed?: true;
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
  /** Tiered (D-433, CR 702.183a): the mana symbols of each mode's cost, in the order of the bullets, from "Cure — {0} — ...". Absent for a modal text without costs. */
  readonly costs?: readonly (readonly string[])[];
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
       * "..., you may pay {1}. When you do, choose one —" and its bullets (Hylda deck group 1, D-511, CR 603.12, 700.2b): the body is the sentences before "When you do" (the
       * offer to pay) and these are the modes of the reflexive ability the payment creates.
       */
      readonly reflexiveModal?: IrModes;
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
      /** "Boast — {cost}: ..." (CR 702.142a): activate only if this creature attacked this turn, and only once each turn. */
      readonly boast?: true;
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
  'colorsOf',
  'cardTypesAmong',
  'creatureTypesAmong',
  'differentNamesAmong',
  'differentPowersAmong',
  'timesKicked',
  'lifeLostThisWay',
  'lifeLostThisTurn',
  'attackersOfAffected',
  'cardsInHandOfAffected',
  'lifeGainedThisTurn',
  'controllerLifeLostThisTurn',
  'opponentsLifeLostThisTurn',
  'lifeGainedOrLostThisTurn',
  'enteredThisTurn',
  'diedThisTurn',
  'cardsDrawnThisTurn',
  'experienceCounters',
  'partySize',
  'spellsCastThisTurn',
  'greatestManaValueCast',
  'cardsToGraveyardThisTurn',
  'toughnessOf',
  'countersOn',
  'countersOnGroup',
  'aggregate',
  'attackersGreatestPower',
  'devotion',
  'commanderColors',
  'opponentCount',
  'playerCount',
  'commanderManaValue',
  'commanderCasts',
  'damageDealtToThisTurn',
  'greatestCountOfAnOpponent',
  'half',
  'multiple',
  'minus',
  'sum',
  'extreme',
  'difference',
  'opponentsWithMore',
  'chosenPlayerLead',
  'thisWay',
  'triggerDamage',
  'dieResult',
  'amassedArmyPower',
  'lifePaidAsEntered',
  'triggerTargetCount',
  'triggerAttackerCount',
  'triggerDamagedPlayerCount',
  'cardTypesAmongThoseCards',
  'shortfall',
  'exiledStillThere',
  'movedCount',
  'aurasAttachedToIt',
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
    case 'countersOnGroup':
    case 'aggregate':
    case 'colorsAmong':
    case 'cardTypesAmong':
    case 'creatureTypesAmong':
    case 'differentPowersAmong':
      return [amount.of];
    case 'half':
    case 'multiple':
    case 'minus':
      return nounsOfAmount(amount.of);
    case 'difference':
    case 'extreme':
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
