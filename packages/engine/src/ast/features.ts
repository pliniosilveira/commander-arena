/**
 * What the engine can actually execute (SPEC 17.2 A7, D-007). A card is `supported` only if every
 * AST node it uses is listed here. The interpreter has no "not implemented" path: anything not in
 * this registry is rejected by validateCard before a card can be marked supported, and moves to
 * the registry only in the same change that implements and tests it.
 */
import type {
  Ability,
  Cost,
  Effect,
  Keyword,
  ManaProduction,
  Replacement,
  Restriction,
  SacrificeSelector,
  StaticSubject,
  TokenPreset,
  Trigger,
} from './types';

export interface SupportedFeatures {
  readonly abilityKinds: readonly Ability['kind'][];
  /**
   * Things an activated or mana ability may have besides its cost and effect: the restriction "Activate
   * only if <condition>" (CR 602.5b, D-099). Named `ability:<value>` in a `FeatureRef`; the condition
   * itself is a `condition:`.
   */
  readonly abilityFeatures: readonly AbilityFeatureKind[];
  readonly effectKinds: readonly Effect['kind'][];
  readonly triggerKinds: readonly Trigger['kind'][];
  /**
   * Things a triggered ability may have besides its trigger event: the intervening "if" of
   * CR 603.4. Named `trigger:<value>` in a `FeatureRef`; the condition itself is a `condition:`.
   */
  readonly triggerFeatures: readonly TriggerFeatureKind[];
  readonly keywordKinds: readonly Keyword['kind'][];
  readonly replacementKinds: readonly Replacement['kind'][];
  /** Cost kinds allowed on mana abilities (CR 605.1a abilities with costs beyond {T} need more engine work). */
  readonly manaAbilityCostKinds: readonly Cost['kind'][];
  /** What a mana ability or an `addMana` effect may produce (CR 106.1). Spell effects run `fixed` only. */
  readonly manaProductionKinds: readonly ManaProduction['kind'][];
  /** Effects a mana ability may carry besides the mana (CR 605.1a): no target, no decision. */
  readonly manaAbilityAlsoKinds: readonly Effect['kind'][];
  /** What a `sacrifice` effect may sacrifice (CR 701.21): this permanent, or a chosen one. */
  readonly sacrificeSelectors: readonly SacrificeSelector['kind'][];
  /** Predefined tokens (CR 111.10) whose abilities the engine can run. */
  readonly tokenPresets: readonly TokenPreset[];
  /** Card types a created token may have. */
  readonly tokenTypes: readonly string[];
  readonly layouts: readonly string[];
  readonly cardTypes: readonly string[];
  // ---- Dimensions added for the parser's `needs` (D-068). Each lists only what the engine runs.
  /** Costs of activated abilities that are not mana abilities (CR 602.1). */
  readonly costKinds: readonly Cost['kind'][];
  /** Selectors and filter features: `target`, `each`, `choose`, `anyOf`, ... (see SELECTOR_KINDS). */
  readonly selectorKinds: readonly SelectorKind[];
  /** Conditions of replacements, `conditional` effects and the intervening "if" of a trigger. */
  readonly conditionKinds: readonly ConditionKind[];
  /** Durations of continuous effects ("until end of turn"): `modifyPt` runs until end of turn only. */
  readonly durationKinds: readonly DurationKind[];
  /** Static ability effects (CR 604, 613): "no maximum hand size", "+N/+N" and keyword grants. */
  readonly staticKinds: readonly StaticKind[];
  /** Whom a static `modifyPt` or `grantKeyword` affects (CR 611.3): the attached permanent, or a filter. */
  readonly staticSubjectKinds: readonly StaticSubjectKind[];
  /** Token sources: predefined tokens by name (the `tokenPresets` above) and `custom` definitions. */
  readonly tokenKinds: readonly TokenKind[];
  /** Amount shapes. `x` (D-103) reads the X announced as a spell is cast or an ability activated. */
  readonly amountKinds: readonly AmountKind[];
  /** Where a `search` effect may put the cards it found (CR 701.23). */
  readonly searchDestinationKinds: readonly SearchDestinationKind[];
  /**
   * Ways to cast a spell other than from the hand by its mana cost, chosen with the `castSpell`
   * action's `alternative` field (CR 118.9): Flashback, from the graveyard (CR 702.34a), and `free`,
   * "cast without paying its mana cost" (`CardFace.alternativeCosts`, D-095).
   */
  readonly castAlternatives: readonly CastAlternativeKind[];
}

export const SUPPORTED_FEATURES: SupportedFeatures = {
  abilityKinds: ['mana', 'replacement', 'keyword', 'triggered', 'static', 'activated', 'level'],
  // D-133: `staticCondition`, "as long as ..." on a static ability.
  abilityFeatures: [
    'activateOnlyIf',
    'xCost',
    'modal',
    'staticCondition',
    'costReducedIf',
    'ifGiftPromised',
    // D-181: a target that exists only if the spell was kicked or only if it was not (`TargetSpec.ifKicked`, `unlessKicked`), the choice between two
    // additional costs (`CardFace.additionalCostChoice`) and "this spell costs {3} less to cast if ..." (a `costReduction` of `this` with a condition).
    'ifKicked',
    'additionalCostChoice',
    'selfCostReducedIf',
    // D-139: "this ability costs {1} less to activate for each other artifact you control".
    'costReducedBy',
    // D-139: "Activate only once each turn."
    'oncePerTurn',
    // D-145: "If you control a creature with power 4 or greater, add two mana of any one color instead" (`ManaAbility.instead`).
    'manaInstead',
    // D-149: "Spend this mana only to cast an Angel spell." (`ManaAbility.spendOnly`)
    'manaSpendOnly',
    // D-151: "As long as this card is in your graveyard ..." and "Whenever ..., return this card from your graveyard" (`functionsIn`).
    'functionsInGraveyard',
    // D-256: "Do this only once each turn." (`TriggeredAbility.doOnlyOnceEachTurn`, CR 603.2h)
    'doOnlyOnceEachTurn',
    // D-151: "If that mana is spent on a Dragon creature spell, it gains haste" (`ManaAbility.spentRider`).
    'manaSpentRider',
    // D-319: "Add two mana of different colors." (`anyCombination` with `distinct`, CR 106.1b).
    'manaDistinctColors',
    // D-328: "When that mana is spent to cast a red instant or sorcery spell, copy that spell" (`spentRider` with `copySpell`, a color of the spell).
    'manaSpentRiderCopy',
    // D-327: "Mill a card. You may play that card this turn." (`mayPlay` of the cards a `mill` put into the graveyard).
    'mayPlayFromGraveyard',
    // D-1270: "Tiered", a mode with a cost listed before its effect (`SpellMode.cost`, CR 700.2h, 702.183a).
    'modeCost',
  ],
  effectKinds: [
    'sequence',
    'dealDamage',
    'destroy',
    'exile',
    'sacrifice',
    'moveToZone',
    'counter',
    'draw',
    'discard',
    // D-231: "Each player exiles a card from their graveyard" (Augusta).
    'exileOwnGraveyardCard',
    // D-231: Tragic Arrogance's choices of the permanents to keep and the sacrifice of the rest.
    'sparePermanents',
    // D-232: Coin of Fate's "An opponent chooses one of the exiled cards ...".
    'splitCostExiled',
    // D-272: Dawnbreak Reclaimer's "choose a creature card in an opponent's graveyard, then that player chooses ...".
    'returnGraveyardPair',
    // D-234: "Any number of other target creatures you control phase out." (CR 702.26).
    'phaseOut',
    // D-235: the level bar of a Class (CR 716) and "exile a card from your graveyard at random".
    'gainLevel',
    'exileRandomFromGraveyard',
    // D-393 (provisional): "that source's controller exiles a card from their hand at random" (CR 701.13).
    'exileRandomFromHand',
    // D-232: Spirit of Resilience's "become a copy of an artifact or creature card from among those cards".
    'becomeCopyOfCard',
    'gainLife',
    // D-201: "Target player's life total becomes N" (CR 119.5).
    'setLifeTotal',
    'loseLife',
    // D-269: "Each player this creature attacked this turn loses the game." (CR 104.3e).
    'loseGame',
    // D-278: "Exile them, then meld them into X." (CR 701.42a).
    'meld',
    'tap',
    'untap',
    'removeAllCounters',
    // D-209: "You get {E}{E}" (`gainEnergy`) and "connives" (`connive`).
    'gainEnergy',
    'connive',
    // D-213: "for each creature target player controls, create a token that's a copy of that creature, except ..." (`createCopies`).
    'createCopies',
    // D-210: "each player may ...", "target opponent may have you ..." (`playersMay`).
    'playersMay',
    'addMana',
    'addCounters',
    'modifyPt',
    'setPt',
    'loseAllAbilities',
    // `setTypes` runs both the replacing form and `additive: true` (CR 205.1b, Crew's "becomes an
    // artifact creature"); `additive` is an option of the node, not a kind, so it has no `FeatureRef`.
    'setTypes',
    'setColors',
    'grantKeyword',
    // D-230: Backup's grant of the abilities printed below it, until end of turn. D-275 (CR 611.2a): the static abilities cantLoseGame and
    // opponentsCantWin given for the rest of the game (`duration: 'permanent'`).
    'grantAbility',
    'restrict',
    // D-179: "Until your next turn, creatures your opponents control attack each combat if able and attack a player other than you if able".
    'requireAttack',
    // D-189: "Gain control of target creature until end of turn", "... until the end of your next turn", "... for as long as you control this" (CR 613.1b).
    'gainControl',
    'shuffle',
    // D-271: "roll a four-sided die" (CR 706.1, 706.2) and, read by `dieResult`, "if the result is 1".
    'rollDie',
    'scry',
    'surveil',
    'lookAndReorder',
    'lookAndSplit',
    // D-303: "Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard." (CR 700.3).
    'revealAndSeparate',
    'putFromHandOnTop',
    'createToken',
    'search',
    'attach',
    'transform',
    'conditional',
    'counterUnlessPays',
    // D-111: "[do something] unless that player pays [cost]" (CR 118.12a).
    'unlessPays',
    'becomeCopy',
    'preventDamage',
    // D-120: regenerate (CR 701.19), "you may pay [cost]. If you do" (Extort) and Cascade (CR 702.85a).
    'regenerate',
    'mayPay',
    'cascade',
    // D-129: copying a spell (CR 707.10) and Storm (CR 702.40a), the effect of the engine's expansion of the keyword.
    'copySpell',
    // D-181: "Change the target of target spell or ability with a single target" (CR 115.7a).
    'changeTarget',
    'storm',
    // D-129: Replicate (CR 702.56a), the effect of the engine's expansion of the keyword.
    'replicate',
    // D-124: Unearth (CR 702.84a), the effect of the engine's expansion of the keyword.
    'unearth',
    // D-185: Encore (CR 702.141a), the effect of the engine's expansion of the keyword.
    'encore',
    // D-127: Cumulative upkeep (CR 702.24a), the effect of the engine's expansion of the keyword.
    'cumulativeUpkeep',
    // D-127: "you become the monarch" (CR 725).
    'becomeMonarch',
    // D-131: "mill N cards" (CR 701.17).
    'mill',
    // D-309: "manifest the top card of your library" (CR 701.40), and the face-down permanent it makes.
    'manifest',
    // D-128: an effect that creates a delayed triggered ability (CR 603.7): "at the beginning of the next turn's upkeep".
    'delayedTrigger',
    // D-336: "when you next cast an instant or sorcery spell this turn, copy that spell" (CR 603.7).
    'delayedCast',
    // D-128: the engine's own abilities of Suspend (CR 702.62a) and Madness (CR 702.35a), found from exile.
    'removeTimeCounter',
    'castExiled',
    // D-135: "you may [do something]", reflexive triggers ("when you do") and a cast permission for a card in the graveyard.
    'may',
    'reflexive',
    'mayCast',
    // D-139: "look at the top six cards of your library. You may reveal an artifact card from among them and put it into your hand".
    'lookAtTop',
    // D-139: "you may reselect which player or permanent target attacking creature is attacking" (CR 508.7).
    'reselectAttack',
    // D-175: "create a Food token or a Treasure token": the controller chooses one of the instructions as it resolves (CR 608.2d).
    'chooseOne',
    // D-194: "starting with you, each player votes for profit or security" (CR 701.38a).
    'vote',
    // D-196: "The Ring tempts you" (CR 701.54a), and the engine's own sacrifice at end of combat of the Ring's third ability.
    'ringTempts',
    // D-286: "you may pair this creature with another unpaired creature you control" (CR 702.95a): the engine's effect of the two abilities soulbond stands for.
    'pair',
    // D-201: "Empower Jace N" (CR 701.71a).
    'empowerJace',
    // D-367: "amass Zombies 1" (CR 701.47a).
    'amass',
    // D-201: "You get an emblem with ..." (CR 114).
    'createEmblem',
    'delayedSacrifice',
    // D-145: "reveal cards from the top of your library until you reveal a land card. Put it onto the battlefield tapped and the rest
    // on the bottom in a random order" (CR 701.20).
    'revealUntil',
    // D-145: "fights" (CR 701.14), also "each of those tokens fights a different one of those creatures".
    'fight',
    // D-145: "deals X damage divided as you choose among any number of target creatures" (CR 601.2d): with `TargetSpec.divide`.
    'dealDividedDamage',
    // D-145: "you may cast a spell ... from your hand without paying its mana cost", "you may play the exiled card" (CR 608.2g).
    'castFree',
    // D-350: "you may cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell. If that spell would be put into a graveyard, exile it instead" (CR 608.2g, 609.4b).
    'castCard',
    // D-149: "proliferate" (CR 701.34).
    'proliferate',
    // D-151: "exile the top card of your library. You may play that card this turn" (CR 701.13, 601.2, 305.1).
    'exileTop',
    'mayPlay',
    // D-151: "After this phase, there is an additional combat phase" (CR 500.8).
    'extraCombat',
    // D-356: "there is an additional beginning phase after this phase" (CR 500.8).
    'extraBeginningPhase',
    'enterAttacking',
    // D-151: "exile cards until you exile a nonland card. You may cast it ... If you don't, put it into your hand", Discover (CR 701.57).
    'exileUntilCast',
    // D-151: "reveals the top card of their library. If it's a permanent card, they put it onto the battlefield" (Chaos Warp).
    'revealTop',
    // D-151: "you may behold a Dragon" (CR 701.4).
    'behold',
    // D-151: "you may pay any amount of {R}. When you do, ..." (CR 603.12).
    'payAnyAmount',
  ],
  triggerKinds: [
    'entersBattlefield',
    'dies',
    'attacks',
    'castSpell',
    'landfall',
    'upkeep',
    'endStep',
    'permanentSacrificed',
    'becomesTapped',
    'becomesUntapped',
    'discarded',
    'diesBatch',
    'entersBatch',
    // D-229: "one or more cards leave your graveyard", "one or more cards are put into exile from your library and/or your graveyard".
    'leftGraveyard',
    'exiledFromLibraryOrGraveyard',
    'becomesTarget',
    'chapter',
    // D-111: steps and phases, draws, combat damage dealt, leaving the battlefield.
    'step',
    'drawn',
    'dealsCombatDamage',
    'leavesBattlefield',
    // D-333: "Whenever a source you control deals noncombat damage to an opponent".
    'noncombatDamageDealt',
    // D-133: "whenever [a creature] is dealt damage".
    'dealtDamage',
    // D-120: "whenever this blocks / becomes blocked" (Bushido, CR 702.45a).
    'blocks',
    'becomesBlocked',
    // D-139: a state trigger, "when there are four or more page counters on this artifact" (CR 603.8), and the triggered mana ability
    // "whenever you tap a permanent for {C}, add an additional {C}" (CR 605.1b).
    'state',
    'tappedForMana',
    // D-189: "Whenever an opponent taps an artifact for mana", an ordinary triggered ability (CR 106.12, 603.2).
    'tapsForMana',
    // D-139: "whenever one or more artifact creatures you control deal combat damage to a player" (CR 603.2c).
    'combatDamageBatch',
    // D-149: "whenever you gain life [for the first time each turn]", "whenever you put one or more +1/+1 counters on this creature",
    // "whenever you attack with two or more creatures".
    'lifeGained',
    'countersAdded',
    'attackBatch',
    // D-179: "When you cycle this card" (CR 702.29c).
    'cycled',
    // D-196: "Whenever the Ring tempts you" (CR 701.54d).
    'ringTempted',
  ],
  // D-110: `alone`, "attacks alone" (CR 506.5), a feature of the `attacks` trigger. D-133: `attacksAt`, "attacks you
  // or a planeswalker you control" (CR 508.1b).
  triggerFeatures: [
    'interveningIf',
    'alone',
    'attacksAt',
    'entersUntapped',
    'leavesToAnyOf',
    // D-145: "attacks while you don't control another Dinosaur" (`triggerCondition`).
    'triggerCondition',
    // D-177: "becomes the target of a spell" (`becomesTarget` with `spellOnly`).
    'becomesTargetSpell',
    // D-229: "casts their second spell each turn" (`castSpell` with `nth`).
    'castNth',
  ],
  keywordKinds: [
    'flying',
    'firstStrike',
    'doubleStrike',
    'deathtouch',
    'defender',
    'haste',
    'indestructible',
    'lifelink',
    'menace',
    'reach',
    'trample',
    'vigilance',
    'flash',
    'hexproof',
    'shroud',
    // D-229: protection from a color (CR 702.16).
    'protection',
    'cycling',
    'enchant',
    'equip',
    'kicker',
    'flashback',
    'prowess',
    'ward',
    'crew',
    'landwalk',
    'fear',
    'intimidate',
    'shadow',
    // D-110: keyword batch 1.
    'changeling',
    'devoid',
    'partner',
    'chooseBackground',
    // D-200: "~ can be your commander".
    'canBeCommander',
    // D-264: Ascend on a permanent (CR 702.131b).
    'ascend',
    // D-286: soulbond (CR 702.95a): two triggered abilities the engine builds for a creature; printed only.
    'soulbond',
    'exalted',
    'annihilator',
    // D-230: Backup N (CR 702.165).
    'backup',
    'persist',
    'undying',
    'infect',
    'wither',
    'toxic',
    'splitSecond',
    'typecycling',
    'multikicker',
    // D-120: keyword batch 2.
    'skulk',
    'battleCry',
    'mentor',
    'evolve',
    'bushido',
    'extort',
    'affinity',
    'convoke',
    'improvise',
    'delve',
    'cascade',
    // D-124: Unearth (CR 702.84a).
    'unearth',
    // D-185: Encore (CR 702.141a), Devour (CR 702.82a) and Riot (CR 702.136a).
    'encore',
    // D-384: Eternalize (CR 702.129a).
    'eternalize',
    'devour',
    'riot',
    // D-127: Echo (CR 702.30a) and Cumulative upkeep (CR 702.24a).
    'echo',
    'cumulativeUpkeep',
    // D-128: Suspend (CR 702.62a).
    'suspend',
    // D-129: Storm (CR 702.40a) and Replicate (CR 702.56a).
    'storm',
    'replicate',
    // D-135: Gift (CR 702.174), "Gift a card".
    'gift',
    // D-139: Living weapon (CR 702.92).
    'livingWeapon',
    // D-206: Job select (CR 702.182).
    'jobSelect',
    // D-145: Escalate (CR 702.120) and Hideaway (CR 702.75).
    'escalate',
    'hideaway',
    // D-151: Read ahead (CR 702.155), Dethrone (CR 702.105), Myriad (CR 702.116).
    'readAhead',
    'dethrone',
    'myriad',
  ],
  // D-100: `asEntersChoose` ("As this enters, choose a creature type / a color").
  replacementKinds: [
    'entersTapped',
    'entersWithCounters',
    'entersTappedUnlessPays',
    'entersTappedUnlessReveals',
    // D-214: "This creature enters prepared." (CR 722.3a).
    'entersPrepared',
    'asEntersChoose',
    // D-133: "If a nontoken creature an opponent controls would die, instead exile it and create a token".
    'wouldDie',
    // D-149: "If you would gain life, you gain that much life plus 1 instead", "each other Angel you control enters with an
    // additional +1/+1 counter on it".
    'lifeGainBonus',
    'othersEnterWithCounters',
    // D-219: "If one or more artifact tokens would be created under your control, ... are created instead".
    'tokensInstead',
    // D-179: "Lands you control enter untapped".
    'groupEntersUntapped',
    // D-151: "As this enters, you may have it become a copy of any creature on the battlefield until end of turn".
    'entersAsCopy',
    // D-192: "All damage that would be dealt to you and other permanents you control is dealt to this creature instead."
    'redirectDamage',
    // D-332: "If you would draw a card while your library has no cards in it, skip that draw instead."
    'skipDraw',
    // D-379 (CR 614.11): "If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead."
    'drawInstead',
  ],
  // {T}, "Sacrifice this permanent" (a Treasure, CR 111.10a) and mana ({1}, {T}: a Signet). A mana
  // cost is paid from the pool, or by auto-pay from sources that have no mana cost themselves.
  // D-099: "Pay N life" too (CR 119.4, 605.3), and the mana cost may use hybrid symbols (CR 107.4e).
  manaAbilityCostKinds: ['tap', 'sacrifice', 'mana', 'payLife', 'mill'],
  // D-099: `couldProduce` (CR 106.7) and `combination` ("Add {R}{R}, {R}{W}, or {W}{W}").
  manaProductionKinds: [
    'fixed',
    'anyColor',
    'commanderIdentity',
    'oneOf',
    'couldProduce',
    'combination',
    // D-149: "Add one mana of the chosen color."
    'chosenColor',
    // D-151: "Add two mana in any combination of colors."
    'anyCombination',
    // "Choose a color. Add an amount of mana of that color equal to your devotion to that color."
    'anyColorDevotion',
  ],
  manaAbilityAlsoKinds: ['dealDamage', 'loseLife', 'gainLife'],
  // D-139: `each`, "each player sacrifices all permanents they control that ..." (every permanent by its own controller).
  sacrificeSelectors: ['this', 'choose', 'each'],
  // Treasure's mana ability, and the activated abilities of Food and Clue (CR 111.10a, b, f).
  tokenPresets: ['Treasure', 'Food', 'Clue'],
  // D-200: a planeswalker token enters with loyalty counters (CR 306.5b).
  tokenTypes: ['artifact', 'creature', 'enchantment', 'land', 'planeswalker'],
  // CR 709 split (either half is cast), CR 715 Adventure, CR 712 modal and nonmodal double-faced, CR
  // 714 Saga (lore counters and chapter abilities; read ahead is a keyword and is not run), CR 701.42 and 712.4 meld
  // (D-277: two cards, one melded permanent). Fuse, Aftermath, Rooms and flip are not run (`validateCard` names the layout).
  layouts: [
    'normal',
    'split',
    'adventure',
    'modal_dfc',
    'transform',
    'saga',
    'class',
    'prepare',
    'meld',
  ],
  cardTypes: [
    'artifact',
    'battle',
    'creature',
    'enchantment',
    'instant',
    // D-139: the Kindred type (CR 308).
    'kindred',
    'land',
    'planeswalker',
    'sorcery',
  ],
  // CR 602.2: {T}, mana, "pay N life", "sacrifice this or a permanent", "remove N counters",
  // "discard this card" (Cycling), "discard N cards" (a choice, `forCost`; also an additional cost
  // to cast and Ward's cost, D-095) and "tap untapped creatures with total power N" (Crew, alone in
  // the cost). The same kinds `sacrifice`, `discard`, `payLife` and `mana` are the additional costs
  // a card may have (`CardFace.additionalCosts`). D-103: `payXLife` ("Pay X life") and an {X} in a
  // `mana` cost, with the value announced as the spell is cast or the ability activated.
  costKinds: [
    'tap',
    'mana',
    'payLife',
    'payXLife',
    // D-386 (provisional): "Discard X cards" as an additional cost to cast a spell (an activated ability's cost refuses it).
    'discardX',
    'sacrifice',
    'removeCounters',
    'discardThis',
    'discard',
    'tapCreatures',
    // D-133: "Tap three untapped Zombies you control".
    'tapPermanents',
    // D-407 (CR 701.68): "Blight 1" as the cost of an activated ability.
    'blight',
    // D-139: "Put a page counter on this artifact" and "Return an artifact you control to its owner's hand" as costs.
    'putCounters',
    'returnToHand',
    // D-185: "Exile this card from your graveyard" (the cost of Encore); D-229: "Exile this artifact" from the battlefield and "Mill a card" as costs.
    'exileThis',
    'mill',
    // D-232: "Exile two creature cards from your graveyard" as the cost of an activated ability (not an additional cost of a spell: `additionalCostIssues` refuses it).
    'exileFromGraveyard',
    // D-200: the loyalty symbol of a loyalty ability (CR 606).
    'loyalty',
    // D-209: "{E}{E}", paid by the player an `unlessPays` asks (`activationCostIssues` refuses it anywhere else).
    'energy',
  ],
  // `choose` is run by `sacrifice` and by `moveToZone` to hand, graveyard or library; `anyOf` is
  // ObjectFilter.anyOf (a disjunction of filters); `ownerRef` is ObjectFilter.owner, read in the
  // `each` selector of an effect.
  selectorKinds: [
    'this',
    'thisSpell',
    'target',
    'anyTarget',
    // D-200: "target player or planeswalker".
    'playerOrObject',
    // D-270: "up to three other target creatures from the battlefield and/or creature cards from graveyards" (`exile` only).
    'objectOrGraveyardCard',
    'each',
    'choose',
    'you',
    'eachPlayer',
    'eachOpponent',
    'eachOtherOpponent',
    // D-269: "each player this creature attacked this turn" (`attackedPlayers`, CR 508.6).
    'attackedPlayers',
    'controllerOf',
    'ownerOf',
    'anyOf',
    'ownerRef',
    // D-179: "each creature that player controls", the player a target (`ObjectFilter.controlledBy`, read in the `each` selector of an effect).
    'controllerRef',
    // D-179: "that was put there from the battlefield this turn" (`ObjectFilter.putFromBattlefieldThisTurn`).
    'putFromBattlefieldThisTurn',
    // D-235: "spells you cast from anywhere other than your hand" (`ObjectFilter.notCastFromHand`).
    'notCastFromHand',
    // Group 4 of the Vraska deck: "target commander that entered this turn" (`ObjectFilter.enteredThisTurn`).
    'enteredThisTurn',
    // D-261: "a creature card that shares a creature type with it" (`ObjectFilter.sharesCreatureTypeWith`).
    'sharesCreatureTypeWith',
    // D-262: "up to two basic land cards that share a land type" (`search.sharedLandType`).
    'sharedLandType',
    // D-181: "target spell or ability with a single target" (`ObjectFilter.singleTarget`).
    'singleTarget',
    // D-206: "an instant or sorcery spell that targets a creature" (`ObjectFilter.targetsObject`).
    'targetsObject',
    'moved',
    'triggerSubject',
    // D-100: `ObjectFilter.chosenType` and `chosenColor`, read relative to the source's choice.
    'chosenType',
    'chosenColor',
    // D-110: "defending player" (CR 508.5) and "it" for the card the source became (CR 400.7, Persist).
    'defendingPlayer',
    'thisCard',
    // D-230: "return that card" of a dies trigger; "mana value X or less, where X is ...".
    'triggerCard',
    'manaValueAtMost',
    // D-111: `ObjectFilter` comparisons with power, toughness and mana value, and the trigger subject
    // "equipped / enchanted creature" (`attached`).
    'power',
    'toughness',
    'manaValue',
    'attached',
    // D-120: `ObjectFilter.attacking` and `powerLessThanSource`.
    'attacking',
    'powerLessThanSource',
    // D-1261: "with power greater than its base power" (`ObjectFilter.powerAboveBase`).
    'powerAboveBase',
    // D-131: `ObjectFilter.attackingYou` ("creatures attacking you"), several players at once ("you and target
    // opponent", `all`) and a creature that deals the damage (`dealDamage.from`, a "bite").
    'attackingYou',
    // D-218: "creatures attacking your opponents and/or planeswalkers they control" (`ObjectFilter.attackingOpponents`).
    'attackingOpponents',
    // D-229: "attacking or blocking" (`ObjectFilter.attackingOrBlocking`).
    'attackingOrBlocking',
    'all',
    'damageSource',
    // D-133: `ObjectFilter.token` (tokens, "nontoken"), `notSubtypes` ("non-Zombie"), `colorless`, and `keywords` /
    // `notKeywords` ("with flying", "without flying").
    'token',
    'nontoken',
    'notSubtypes',
    'colorless',
    'keywords',
    // D-133: "that player", "that creature's controller" (the player the trigger's event is about).
    'triggerPlayer',
    // D-133: "the sacrificed creature" (the permanent sacrificed to pay the cost of this ability).
    'sacrificedCost',
    // D-177: "that creature" after a sacrifice of the same ability ("you may sacrifice another creature. When you do, ... that creature's power").
    'sacrificed',
    // D-135: "nonbasic land" (`ObjectFilter.notSupertypes`), "any number of other permanents" and "a creature with the
    // greatest power among creatures they control" (`ChooseSelector.anyNumber` and `greatest`), "the chosen player" of a gift.
    'notSupertypes',
    'anyNumber',
    // D-216: "Untap up to three lands" (`ChooseSelector.upTo`).
    'upTo',
    // D-187: "you may sacrifice one or more Treasures" (`ChooseSelector.atLeastOne`) and "up to that many target creatures" (`TargetSpec.upToThatMany`).
    'atLeastOne',
    'upToThatMany',
    // D-386 (provisional): "Return X target creature cards from your graveyard to your hand" (`TargetSpec.countX`).
    'countX',
    'greatest',
    'giftRecipient',
    // D-210: "each player who discarded a card this way" (`PlayerSelector` `discardedThisWay`).
    'discardedThisWay',
    // D-139: "two or more colors" (`ObjectFilter.colorCount`).
    'colorCount',
    // D-139: "mana value X" and "whose controller was dealt combat damage by this creature this turn".
    'manaValueX',
    'controllerDamagedBySource',
    // D-139: "the player or planeswalker it's attacking" (`dealDamage.to` `attackedBy`).
    'attackedBy',
    // D-145: "with a counter on it" (`ObjectFilter.hasCounter`), "target commander" (`ObjectFilter.commander`).
    'hasCounter',
    'commander',
  ],
  // Conditions of `entersTapped.unless` (CR 614.12), of the `conditional` effect (CR 608.2c) and of
  // the intervening "if" (CR 603.4): counts of permanents and opponents, "was kicked" (CR 702.33d),
  // combined.
  conditionKinds: [
    'controlsAtLeast',
    'opponentsAtLeast',
    'kicked',
    // D-129: "if a replicate cost was paid for it" (CR 702.56a).
    'replicated',
    'controlCommander',
    'sourceHasCounter',
    // D-120: "that creature's power or toughness is greater than this creature's" (Evolve).
    'subjectGreaterPt',
    // D-229: "if that player controls more lands than you".
    'subjectControllerHasMore',
    // Bruna deck: "if that player controls more creatures than you" in a trigger about a player.
    'triggerPlayerHasMore',
    // D-229: "as long as there are fewer than eight cards in your graveyard".
    'cardsInGraveyard',
    // D-331: "as long as there are no cards in your library".
    'cardsInLibrary',
    // D-124: "if it escaped", "unless it escaped" (as `not`).
    'escaped',
    // D-127: "if this permanent came under your control since the beginning of your last upkeep" (Echo).
    'cameUnderControlSinceLastUpkeep',
    // D-131: any state-reading amount compared with a number ("total power 8 or greater", "seven or more
    // creature cards in your graveyard").
    'amountIs',
    // D-131: "if you're the monarch" (CR 725): a player has a designation.
    'playerHasDesignation',
    // D-235: "Activate only if this Class is level N".
    'classLevelIs',
    // D-133: "as long as you have 30 or more life", "as long as it's untapped" (also "if you control your commander").
    'lifeTotal',
    'thisMatches',
    // D-135: "if you do" (CR 603.12), "if it's a Zombie card", "if the gift was promised", "if an opponent controls four or
    // more nonbasic lands".
    'didPrevious',
    // D-210: "if a creature card was discarded this way" (`thisWayAtLeast`).
    'thisWayAtLeast',
    'objectMatches',
    'giftPromised',
    'opponentControlsAtLeast',
    // D-139: "if you control the artifact with the greatest mana value or tied for the greatest mana value".
    'controlsGreatest',
    // D-139: "when this artifact enters during the declare attackers step" (`duringStep`).
    'duringStep',
    // D-187: "if it's your main phase" (`yourMainPhase`).
    'yourMainPhase',
    // D-206: "during your turn" (`yourTurn`), "if a card left your graveyard this turn", "if at least four mana was spent to cast it", "if this spell was cast from a graveyard".
    'yourTurn',
    'cardLeftYourGraveyard',
    'manaSpentAtLeast',
    'castFromZone',
    'spellTargets',
    // D-149: "if none of those creatures attacked you" (`not` of `attackersAttackedYou`), "during your first, second, or third turn",
    // "you control three or more lands with the same name".
    'attackersAttackedYou',
    'ownTurnNumber',
    'sameNameAtLeast',
    // D-151: "two or more nonland permanents entered the battlefield under your control this turn", "an opponent was dealt 7 or more damage".
    'enteredThisTurn',
    'playerDealtDamage',
    // D-252: "if you gained 3 or more life this turn".
    'lifeGainedThisTurn',
    // D-318: "Activate only if you've cast three or more spells this turn".
    'spellsCastThisTurn',
    // D-271: "if the result is 1" (after a die roll), "if this card is in your graveyard".
    'dieResult',
    'thisInYourGraveyard',
    // D-151: "Khans — ..." (the option the permanent chose as it entered).
    'chosenOption',
    // D-151: Dethrone ("attacking the player with the most life or tied for most life") and Pack tactics ("total power 6 or greater").
    'attackingMostLife',
    'attackersTotalPower',
    // D-196: "if you control your Ring-bearer" (CR 701.54e).
    'controlsRingBearer',
    // D-278: "if you both own and control this creature and a creature named X" (CR 701.42a).
    'ownsAndControlsNamed',
    // D-286: "as long as this creature is paired with another creature" (CR 702.95b), and the engine's own intervening "if" of soulbond.
    'paired',
    'soulbondReady',
    'and',
    'or',
    'not',
  ],
  // The continuous-effect nodes (`modifyPt`, `setPt`, `loseAllAbilities`, `setTypes`, `setColors`,
  // `grantKeyword`) run until end of turn (CR 611.2a, 514.2): a `ContinuousEffect` in the game
  // state. `permanent` stays out until a supported card needs it; the interpreter would run it.
  durationKinds: [
    'untilEndOfTurn',
    'untilYourNextTurn',
    'forAsLongAsYouControlThis',
    'forAsLongAsThisRemains',
  ],
  // CR 611.3, 613.1f, 613.4c: "+N/+N" in layer 7c and keyword grants in layer 6, from `derive`.
  // D-094: `restriction` ("can't block", "can't be blocked", "attacks each combat if able",
  // "doesn't untap", "can't be countered") from the permanent's own ability, an attached one or a filter.
  // D-095: `costReduction` ("costs {1} less to cast for each ...", "Artifact spells you cast cost {1} less").
  // D-099: `grantAbility` gives a mana ability ("Lands you control have "{T}: Add one mana of any color."").
  staticKinds: [
    'noMaximumHandSize',
    // D-125: "You may play an additional land on each of your turns."
    'additionalLandDrops',
    // D-125: "You may look at the top card of your library any time."
    'lookAtTopOfLibrary',
    // D-125: "Creatures can't attack you unless their controller pays {M} for each creature ..."
    'attackTax',
    // D-125: "You may choose not to untap ~ during your untap step."
    'optionalUntap',
    // D-229: "Untap all creatures you control during each other player's untap step."
    'untapInOthersUntapStep',
    'modifyPt',
    'characteristicPt',
    'grantKeyword',
    'grantAbility',
    'restriction',
    'costReduction',
    'setTypes',
    // D-133: "You may cast this card from your graveyard as long as you control a Zombie."
    'castFromGraveyard',
    // D-229: "~ isn't a creature" (layer 4, with a condition that reads no characteristic).
    'loseTypes',
    // D-139: base power and toughness, "can't be blocked by Walls", "has the power, toughness and creature types of the last creature
    // card exiled with it", "You may cast artifact spells as though they had flash".
    'setPt',
    'cantBeBlockedBy',
    'takeFromLinkedExile',
    'castAsThoughFlash',
    // D-145: "can't attack or block unless you control another creature with power 4 or greater"; "Enchanted creature loses all
    // abilities and is a green Elk creature" (`loseAllAbilities`, `setColors`, `setTypes` without `additive`).
    'restrictionUnless',
    'loseAllAbilities',
    'setColors',
    // D-149: "Prevent all combat damage that would be dealt to this creature", "You have hexproof", "You can't lose the game and your
    // opponents can't win the game" (`cantLoseGame`, `opponentsCantWin`), "You can't cast ~ during your first, second, or third turns".
    'preventDamageToThis',
    'playerHexproof',
    'cantLoseGame',
    'opponentsCantWin',
    // D-363 (CR 119.7): "Your opponents can't gain life."
    'cantGainLife',
    // D-377 (CR 702.16): "You have protection from the chosen card type."
    'playerProtection',
    // D-380 (CR 122.6, 101.2): "Creatures you control can't have -1/-1 counters put on them."
    'cantHaveCounters',
    // D-220: "If a triggered ability of ... triggers, that ability triggers an additional time" (`doubleTriggers`).
    'doubleTriggers',
    'cantCastThis',
    // D-149: "As long as this creature is attacking, creatures can't block unless their controller pays {1} for each of those creatures".
    'blockTax',
    // D-151: "You don't lose unspent red mana as steps and phases end."
    'unspentManaStays',
    // D-151: "You may cast creature spells with power 4 or greater from the top of your library."
    'castFromTopOfLibrary',
    // D-232: "Once during each of your turns, you may play a land from your graveyard or cast a permanent spell ... from your graveyard."
    'playFromGraveyardOnceEachTurn',
    // D-179: "Your opponents can't cast spells during your turn."
    'opponentsCantCastOnYourTurn',
    // D-282: "Your opponents can't cast spells with mana value 3 or less."
    'opponentsCantCastSpells',
    // D-185: "Creature spells you control can't be countered."
    'spellsCantBeCountered',
    // D-192: "Damage isn't removed from this creature during cleanup steps."
    'keepsDamage',
  ],
  // D-286: `pair`, "each of those creatures" of a soulbond card, for a modification of power and toughness, a granted keyword or a granted ability only.
  staticSubjectKinds: ['this', 'attached', 'filter', 'pair'],
  tokenKinds: ['Treasure', 'Food', 'Clue', 'custom', 'copyOf', 'tapped', 'copyExceptions'],
  amountKinds: [
    'number',
    'x',
    'powerOf',
    'manaValueOf',
    // D-151: "create a number of tapped Treasure tokens equal to the difference" (Discover).
    'shortfall',
    'countOf',
    'timesKicked',
    // D-183: "the amount of mana spent to cast it".
    'manaSpent',
    'times',
    // D-120: "the total life lost this way" (Extort).
    'lifeLostThisWay',
    // D-365: "the life that player lost this turn" (CR 119.3), read for each player a `loseLife` affects.
    'lifeLostThisTurn',
    // D-131: counts, aggregates and arithmetic.
    'toughnessOf',
    'countersOn',
    'aggregate',
    'devotion',
    'commanderColors',
    // D-145: "the greatest mana value among your commanders", "double its power" (`affected`, a power or toughness of the creature affected).
    'commanderManaValue',
    // D-229: "for each time you've cast your commander from the command zone this game".
    'commanderCasts',
    // D-179: "for each color among permanents you control" (a static ability's +N/+N).
    'colorsAmong',
    // D-187: "for each time it has attacked this turn" (a static ability's +N/+N).
    'timesAttacked',
    'affected',
    'half',
    'multiple',
    // D-321: "the number of cards in your hand minus 4".
    'minus',
    'sum',
    'opponentsWithMore',
    'thisWay',
    // D-133: "that much" for the damage that caused a trigger.
    'triggerDamage',
    // D-194: "the number of profit votes" (CR 701.38a).
    'votesFor',
  ],
  // D-405: 'library' is "then shuffle and put that card on top".
  searchDestinationKinds: ['battlefield', 'hand', 'graveyard', 'library'],
  // D-121, D-124: the named alternative costs (Overload, Evoke, Dash, Spectacle, Escape).
  castAlternatives: [
    'flashback',
    'free',
    'overload',
    'evoke',
    'dash',
    'spectacle',
    'escape',
    // D-128: Madness (CR 702.35) and Foretell (CR 702.143).
    'madness',
    // D-274: Miracle (CR 702.94).
    'miracle',
    'foretell',
    // D-149: "pay {W} and tap four untapped creatures you control with flying rather than pay this spell's mana cost".
    'tapPermanents',
  ],
};

/**
 * Keywords a static ability or an effect may grant (CR 613.1f): the ones with no parameter that the engine
 * reads from a permanent's abilities. Flash, ward, protection, cycling, enchant, equip and crew are
 * excluded: they take a cost or a quality, or do nothing on the battlefield.
 */
export const GRANTABLE_KEYWORDS: readonly Keyword['kind'][] = [
  'flying',
  'trample',
  'haste',
  'vigilance',
  'lifelink',
  'deathtouch',
  'firstStrike',
  'doubleStrike',
  'menace',
  'reach',
  'hexproof',
  'shroud',
  'indestructible',
  'defender',
  'fear',
  'intimidate',
  'shadow',
  // D-149: "Clues you control have exalted": each instance granted is a triggered ability of its own (CR 702.83b), and so is prowess's.
  'exalted',
  'prowess',
  // D-110: read straight from the abilities `derive` leaves (not an expansion), so a grant works.
  'infect',
  'wither',
  // D-120: read straight from the derived abilities by the blocker check.
  'skulk',
  // D-185: Riot is read from the permanents on the battlefield as a permanent enters (`rules/enters-keywords.ts`), so only a static ability that
  // names a group can give it ("Nontoken creatures you control have riot"): an effect, an attached subject and an "enters as a copy" are refused.
  'riot',
];

/**
 * What a `restriction` static ability may name, by the subject kinds it accepts: every restriction
 * can belong to a permanent and reach it, an attached permanent or a filter; `cantBeCountered` is a
 * spell's own ability (CR 113.6g), so only `this`.
 */
export const RESTRICTIONS: readonly Restriction[] = [
  'cantBlock',
  'cantAttack',
  'cantBeBlocked',
  'cantBeBlockedByMoreThanOne',
  'attacksEachCombat',
  'mustBeBlocked',
  'doesntUntap',
  'cantBeCountered',
];

/**
 * What a `restrict` effect may give (D-094): the ones that can last until end of turn. "Doesn't
 * untap" needs a duration that reaches the next untap step, and "can't be countered" belongs to a
 * spell's own text.
 */
export const RESTRICTABLE_BY_EFFECT: readonly Restriction[] = [
  'cantBlock',
  'cantAttack',
  'cantBeBlocked',
  'attacksEachCombat',
  'mustBeBlocked',
];

/**
 * Trigger kinds that look back in time (CR 603.10a): they are checked against the battlefield as it
 * was before the event, not as it is after it. An intervening "if" on one of these cannot count
 * permanents yet (see `ast/supported.ts`).
 */
export const LOOK_BACK_TRIGGER_KINDS: readonly Trigger['kind'][] = [
  'dies',
  'diesBatch',
  'permanentSacrificed',
  'leavesBattlefield',
];

/**
 * What an activated or mana ability, or a spell, can have besides its cost and effect, as an `ability:`
 * feature value: `activateOnlyIf` (D-099) and `xCost` (D-103): an {X} in a mana cost, an activation cost
 * or "pay X life", whose value the player announces as the spell is cast or the ability activated; and
 * `modal` (D-114): "Choose one —" and the like, on a spell (`SpellText.modes`), an activated ability or a
 * triggered ability (`modes`, `chooseModes`).
 */
export const ABILITY_FEATURES = [
  'activateOnlyIf',
  'xCost',
  'modal',
  'staticCondition',
  'costReducedIf',
  'ifGiftPromised',
  /** D-181: `TargetSpec.ifKicked` and `unlessKicked`: a target chosen only if the spell was kicked, or only if it was not (CR 702.33g, 601.2c). */
  'ifKicked',
  /** D-181: `CardFace.additionalCostChoice`: "As an additional cost to cast this spell, sacrifice an artifact or creature or pay {4}" (CR 118.8, 601.2b). */
  'additionalCostChoice',
  /** D-181: "This spell costs {3} less to cast if you control a creature with power 4 or greater": a `costReduction` of `this` with a condition (CR 601.2f). */
  'selfCostReducedIf',
  'costReducedBy',
  'oncePerTurn',
  'manaInstead',
  'manaSpendOnly',
  /** An ability that works while its card is in the graveyard (CR 113.6b, D-151): `functionsIn: 'graveyard'` on a static or triggered ability. */
  'functionsInGraveyard',
  /** "Do this only once each turn" (D-256): the engine's `doOnlyOnceEachTurn` of a triggered ability (CR 603.2h). */
  'doOnlyOnceEachTurn',
  /** "If that mana is spent on a Dragon creature spell, it gains haste until end of turn" (D-151): the engine's `ManaAbility.spentRider`. */
  'manaSpentRider',
  /** "Add two mana of different colors" (CR 106.1b, D-319): `anyCombination` with `distinct`, the sets of different colors of the five. */
  'manaDistinctColors',
  /** "When that mana is spent to cast a red instant or sorcery spell, copy that spell and you may choose new targets for the copy" (D-328): `spentRider` with `copySpell`. */
  'manaSpentRiderCopy',
  /** "Mill a card. You may play that card this turn" (D-327, CR 601.2, 305.1): the engine's `mayPlay` of a card a `mill` put into its owner's graveyard. */
  'mayPlayFromGraveyard',
  /** "Tiered" (D-1270, CR 700.2h, 702.183a): a mode of a modal spell with a cost listed before its effect, paid as an additional cost when the mode is chosen (`SpellMode.cost`). */
  'modeCost',
] as const;
export type AbilityFeatureKind = (typeof ABILITY_FEATURES)[number];

/** What a triggered ability can have besides its event, as a `trigger:` feature value. */
export const TRIGGER_FEATURES = [
  'interveningIf',
  'alone',
  'attacksAt',
  'entersUntapped',
  'leavesToAnyOf',
  /** "Whenever it attacks while you don't control another Dinosaur" (CR 603.2, D-145): the engine's `triggerCondition`. */
  'triggerCondition',
  /** "Whenever this creature becomes the target of a spell" (CR 603.2, D-177): the engine's `becomesTarget` with `spellOnly`. */
  'becomesTargetSpell',
  /** "Whenever an opponent casts their second spell each turn" (CR 601.2i, D-229): the engine's `castSpell` with `nth`. */
  'castNth',
] as const;
export type TriggerFeatureKind = (typeof TRIGGER_FEATURES)[number];

// ---------------------------------------------------------------- feature references (D-068)

/** Selectors and filter features a lowering may need. Superset of what is supported. */
export const SELECTOR_KINDS = [
  'this',
  'thisSpell',
  'target',
  'anyTarget',
  /** "Target player or planeswalker" (D-200): the engine's `TargetSpec.what` `playerOrObject`. */
  'playerOrObject',
  /** "Up to three other target creatures from the battlefield and/or creature cards from graveyards" (D-270): `TargetSpec.what` `objectOrGraveyardCard`. */
  'objectOrGraveyardCard',
  'each',
  'choose',
  'you',
  'eachPlayer',
  'eachOpponent',
  /** "Each other opponent" (D-151): the opponents besides the player of the trigger's event. */
  'eachOtherOpponent',
  /** "Each player this creature attacked this turn" (D-269, CR 508.6): the players the permanent of the ability was declared attacking this turn. */
  'attackedPlayers',
  'controllerOf',
  'ownerOf',
  'anyOf',
  /** "It" for what an earlier instruction of the same resolution moved (CR 400.7j): the engine's `moved`. */
  'moved',
  /** A choice of color while a spell or ability resolves: the interpreter has none, a mana ability chooses while paying. */
  'colorChoice',
  /**
   * A card filter that names its owner by reference ("target player's graveyard", CR 108.3): the
   * engine's `ObjectFilter.owner`, run where an effect's `each` selector is read.
   */
  'ownerRef',
  /**
   * "Each creature that player controls" (CR 109.4, D-179): the engine's `ObjectFilter.controlledBy`, a player the filter names by reference,
   * run where an effect's `each` selector is read.
   */
  'controllerRef',
  /** "That was put there from the battlefield this turn" (CR 700.4, D-179): the engine's `ObjectFilter.putFromBattlefieldThisTurn`. */
  'putFromBattlefieldThisTurn',
  /** "That entered this turn" (CR 400.7, group 4 of the Vraska deck): the engine's `ObjectFilter.enteredThisTurn`. */
  'enteredThisTurn',
  /** "That shares a creature type with it" (CR 205.3m, 603.10a, D-261): the engine's `ObjectFilter.sharesCreatureTypeWith`. */
  'sharesCreatureTypeWith',
  /** "Up to two basic land cards that share a land type" (CR 205.3i, 701.23, D-262): the engine's `search.sharedLandType`. */
  'sharedLandType',
  /** "That targets a creature" (CR 115.1, 601.2c, D-206): the engine's `ObjectFilter.targetsObject`. */
  'targetsObject',
  /** "Target spell or ability with a single target" (CR 115.9a, D-181): the engine's `ObjectFilter.singleTarget`. */
  'singleTarget',
  /** "Spells you cast from anywhere other than your hand" (CR 601.2a, D-235): the engine's `ObjectFilter.notCastFromHand`. */
  'notCastFromHand',
  'triggerSubject',
  'triggerActor',
  'bound',
  /** "Of the chosen type" / "of the chosen color" (D-100, CR 607.2d): the engine's `ObjectFilter.chosenType` and `chosenColor`. */
  'chosenType',
  'chosenColor',
  /** "Defending player" (CR 508.5, Annihilator): the engine's `PlayerSelector` `defendingPlayer`. */
  'defendingPlayer',
  /** "Return it" for the card the source became in another zone (CR 400.7, Persist): the engine's `thisCard`. */
  'thisCard',
  /** "That card" of a trigger about a permanent that went to a graveyard (CR 400.7, D-230): the engine's `triggerCard`. */
  'triggerCard',
  /** "Mana value X or less, where X is this creature's power" (CR 202.3, D-230): the engine's `ObjectFilter.manaValueAtMost`. */
  'manaValueAtMost',
  /** "Power 4 or greater", "toughness 2 or less", "mana value 3" (D-111): the engine's `ObjectFilter` `power`, `toughness`, `manaValue`. */
  'power',
  'toughness',
  'manaValue',
  /** "Equipped creature", "enchanted creature" as a trigger's subject (D-111): the engine's `TriggerSubject` `attached`. */
  'attached',
  /** "Attacking creature" (CR 506.4, D-120): the engine's `ObjectFilter.attacking`. */
  'attacking',
  /** "With power less than this creature's power" (CR 702.134a, D-120): the engine's `ObjectFilter.powerLessThanSource`. */
  'powerLessThanSource',
  /** "With power greater than its base power" (CR 208.4b, D-1261): the engine's `ObjectFilter.powerAboveBase`. */
  'powerAboveBase',
  /** "Creatures attacking you" (CR 508.1b, D-131): the engine's `ObjectFilter.attackingYou`. */
  'attackingYou',
  /** "Creatures attacking your opponents and/or planeswalkers they control" (D-218): the engine's `ObjectFilter.attackingOpponents`. */
  'attackingOpponents',
  /** "Attacking or blocking creatures" (CR 506.4, 509.1g, D-229): the engine's `ObjectFilter.attackingOrBlocking`. */
  'attackingOrBlocking',
  /** "You and target opponent each ...": several players in one selector (D-131), the engine's `PlayerSelector` `all`. */
  'all',
  /** "Target creature you control deals damage equal to its power to ..." (D-131): the engine's `dealDamage.from`. */
  'damageSource',
  /** "Creature token", "nontoken creature" (CR 111.1, D-133): the engine's `ObjectFilter.token` (`true` and `false`). */
  'token',
  'nontoken',
  /** "Non-Zombie creature" (CR 205.3d, D-133): the engine's `ObjectFilter.notSubtypes`. */
  'notSubtypes',
  /** "Colorless creature" (CR 105.2c, D-133): the engine's `ObjectFilter.colorless`. */
  'colorless',
  /** "Creature with flying", "creature without flying" (CR 702, D-133): the engine's `ObjectFilter.keywords` and `notKeywords`. */
  'keywords',
  /** "That player", "that creature's controller" in a trigger's effect (D-133): the engine's `PlayerSelector` `triggerPlayer`. */
  'triggerPlayer',
  /** "The sacrificed creature's power" (D-133): the engine's `ObjectRef` `sacrificedCost`. */
  'sacrificedCost',
  /** "That creature's power" after the ability sacrificed it (CR 603.12, 608.2h, D-177): the engine's `ObjectRef` `sacrificed`. */
  'sacrificed',
  /** "Nonbasic land" (CR 205.4, D-135): the engine's `ObjectFilter.notSupertypes`. */
  'notSupertypes',
  /** "Sacrifice any number of other permanents" (D-135): the engine's `ChooseSelector.anyNumber`. */
  'anyNumber',
  /** "Untap up to three lands" (D-216): the engine's `ChooseSelector.upTo`. */
  'upTo',
  /** "Sacrifice one or more Treasures" (D-187): the engine's `ChooseSelector.atLeastOne`, with `anyNumber`. */
  'atLeastOne',
  /** "Up to that many target creatures" after a sacrifice (CR 603.12, D-187): the engine's `TargetSpec.upToThatMany`. */
  'upToThatMany',
  /** "X target creature cards" (CR 601.2b, 601.2c, D-386): the engine's `TargetSpec.countX`, as many targets as the X announced. */
  'countX',
  /** "A creature with the greatest power among creatures they control" (D-135): the engine's `ChooseSelector.greatest`. */
  'greatest',
  /** "The chosen player" of a gift (CR 702.174a, D-135): the engine's `PlayerSelector` `giftRecipient`. */
  'giftRecipient',
  /** "Each player who discarded a card this way" (CR 701.9, D-210): the engine's `PlayerSelector` `discardedThisWay`. */
  'discardedThisWay',
  /** "Permanents that are two or more colors", "monocolored" (CR 105.2, D-139): the engine's `ObjectFilter.colorCount`. */
  'colorCount',
  /** "With mana value X" (CR 202.3, D-139): the engine's `ObjectFilter.manaValueX`. */
  'manaValueX',
  /** "Whose controller was dealt combat damage by this creature this turn" (CR 510.2, D-139): the engine's `ObjectFilter.controllerDealtDamageBySource`. */
  'controllerDamagedBySource',
  /** "Deals X damage to the player or planeswalker it's attacking" (CR 508.1b, D-139): the engine's `dealDamage.to` `attackedBy`. */
  'attackedBy',
  /** "A creature with a counter on it" (CR 122.1, D-145): the engine's `ObjectFilter.hasCounter`. */
  'hasCounter',
  /** "Target commander" (CR 903.3, D-145): the engine's `ObjectFilter.commander`. */
  'commander',
] as const;
export type SelectorKind = (typeof SELECTOR_KINDS)[number];

export const CONDITION_KINDS = [
  /** "You control two or more basic lands" (CR 614.12): the engine's `controlsAtLeast`. */
  'controlsAtLeast',
  /** "You have two or more opponents": the engine's `opponentsAtLeast`. */
  'opponentsAtLeast',
  /** "If this spell was kicked", "if it was kicked" (CR 702.33d): the engine's `kicked`. */
  'kicked',
  /** "If a replicate cost was paid for it" (CR 702.56a): the engine's `replicated`. */
  'replicated',
  /** "If you control a commander" (CR 903.3d): the engine's `controlCommander`. */
  'controlCommander',
  /** "If it had no -1/-1 counters on it" (CR 702.79a, as `not` of this): the engine's `sourceHasCounter`. */
  'sourceHasCounter',
  /** "That creature's power or toughness is greater than this creature's" (CR 702.100a, D-120): the engine's `subjectGreaterPt`. */
  'subjectGreaterPt',
  /** "If that player controls more lands than you" (CR 603.4, D-229): the engine's `subjectControllerHasMore`. */
  'subjectControllerHasMore',
  /** "If that player controls more creatures than you", the player being the one of the event (CR 603.4): the engine's `triggerPlayerHasMore`. */
  'triggerPlayerHasMore',
  /** "If it escaped", "unless it escaped" (CR 702.138b, D-124): the engine's `escaped`. */
  'escaped',
  /** "If this permanent came under your control since the beginning of your last upkeep" (CR 702.30a, D-127): the engine's `cameUnderControlSinceLastUpkeep`. */
  'cameUnderControlSinceLastUpkeep',
  /** "If creatures you control have total power 8 or greater", "if you have seven or more creature cards in your graveyard" (D-131): the engine's `amountIs`. */
  'amountIs',
  /** "If you're the monarch", "if an opponent is the monarch" (CR 725, D-131): the engine's `playerHasDesignation`. */
  'playerHasDesignation',
  /** "Activate only if this Class is level N" (CR 716.2a, D-235): the engine's `classLevelIs`. */
  'classLevelIs',
  /** "As long as you have 30 or more life", "7 life more than your starting life total" (CR 119.1, D-133): the engine's `lifeTotal`. */
  'lifeTotal',
  /** "As long as it's untapped", "if this is a Zombie" (D-133): the engine's `thisMatches`. */
  'thisMatches',
  /** "If it's a Zombie card", "if it's an Angel" (D-135): the engine's `objectMatches`. */
  'objectMatches',
  /** "If the gift was promised" (CR 702.174k, D-135): the engine's `giftPromised`. */
  'giftPromised',
  /** "If an opponent controls four or more nonbasic lands" (D-135): the engine's `opponentControlsAtLeast`. */
  'opponentControlsAtLeast',
  /** "If you do" (CR 603.12, D-135): the engine's `didPrevious`, after a `may` effect. */
  'didPrevious',
  /** "If a creature card was discarded this way" (CR 608.2c, D-210): the engine's `thisWayAtLeast`. */
  'thisWayAtLeast',
  /** "If you control the artifact with the greatest mana value or tied for the greatest" (D-139): the engine's `controlsGreatest`. */
  'controlsGreatest',
  /** "If it's your main phase" (CR 505.1, D-187): the engine's `yourMainPhase`. */
  'yourMainPhase',
  /** "During your turn" (CR 611.3a, D-206): the engine's `yourTurn`. */
  'yourTurn',
  /** "If a card left your graveyard this turn" (D-206): the engine's `cardLeftYourGraveyard`. */
  'cardLeftYourGraveyard',
  /** "If at least four mana was spent to cast it" (D-206): the engine's `manaSpentAtLeast`. */
  'manaSpentAtLeast',
  /** "If this spell was cast from a graveyard" (D-206): the engine's `castFromZone`. */
  'castFromZone',
  /** "If it targets a tapped creature" (CR 601.2f, D-207): the engine's `spellTargets`. */
  'spellTargets',
  /** "During the declare attackers step" (CR 506.1, D-139): the engine's `duringStep`. */
  'duringStep',
  /** "None of those creatures attacked you" (CR 508.1b, D-149): the engine's `attackersAttackedYou`. */
  'attackersAttackedYou',
  /** "During your first, second, or third turn of the game" (CR 500.1, D-149): the engine's `ownTurnNumber`. */
  'ownTurnNumber',
  /** "You control three or more lands with the same name" (D-149): the engine's `sameNameAtLeast`. */
  'sameNameAtLeast',
  /** "Two or more nonland permanents entered the battlefield under your control this turn" (D-151): the engine's `enteredThisTurn`. */
  'enteredThisTurn',
  /** "An opponent was dealt 7 or more damage this turn" (D-151): the engine's `playerDealtDamage`. */
  'playerDealtDamage',
  /** "If you gained 3 or more life this turn" (D-252): the engine's `lifeGainedThisTurn`. */
  'lifeGainedThisTurn',
  /** "Activate only if you've cast three or more spells this turn" (CR 602.5b, D-318): the engine's `spellsCastThisTurn`. */
  'spellsCastThisTurn',
  /** "If the result is 1" after a die roll (CR 706.2, D-271): the engine's `dieResult`. */
  'dieResult',
  /** "If this card is in your graveyard" (CR 113.6b, D-271): the engine's `thisInYourGraveyard`. */
  'thisInYourGraveyard',
  /** "Khans — ..." (D-151): the engine's `chosenOption`, a linked ability of "choose Khans or Dragons". */
  'chosenOption',
  /** "Attacks the player with the most life or tied for most life" (D-151): the engine's `attackingMostLife`. */
  'attackingMostLife',
  /** "If you attacked with creatures with total power 6 or greater this combat" (D-151): the engine's `attackersTotalPower`. */
  'attackersTotalPower',
  /** "If you control your Ring-bearer" (CR 701.54e, D-196): the engine's `controlsRingBearer`. */
  'controlsRingBearer',
  /** "If you both own and control this creature and a creature named X" (CR 701.42a, D-278): the engine's `ownsAndControlsNamed`. */
  'ownsAndControlsNamed',
  /** "As long as this creature is paired with another creature" (CR 702.95b, D-286): the engine's `paired`. */
  'paired',
  /** The intervening "if" of the two abilities soulbond stands for (CR 702.95a, D-286): the engine's `soulbondReady`; built by the engine, refused in card data. */
  'soulbondReady',
  'unlessPays',
  'cardsInGraveyard',
  /** "As long as there are no cards in your library" (CR 401.1, D-331): the engine's `cardsInLibrary`. */
  'cardsInLibrary',
  'and',
  'or',
  'not',
] as const;
export type ConditionKind = (typeof CONDITION_KINDS)[number];

export const DURATION_KINDS = [
  'untilEndOfTurn',
  'untilYourNextTurn',
  'untilEndOfNextTurn',
  'asLongAs',
  'thisTurn',
  'permanent',
  /** "For as long as you control this Saga" (CR 611.2b, D-196): the duration of a `restrict` in an ability of a permanent (and of `gainControl`, D-189). */
  'forAsLongAsYouControlThis',
  /** "For as long as this Saga remains on the battlefield" (CR 611.2b, D-207): the duration of a `grantKeyword` and a `preventDamage` in an ability of a permanent. */
  'forAsLongAsThisRemains',
] as const;
export type DurationKind = (typeof DURATION_KINDS)[number];

export const STATIC_KINDS = [
  /** Legacy spelling kept for compatibility; the engine's kind is `modifyPt` and `pt` is never supported. */
  'pt',
  /** "Equipped creature gets +N/+N", "Creatures you control get +1/+1" (CR 613.4c). */
  'modifyPt',
  'grantKeyword',
  'grantAbility',
  'cantBeBlocked',
  /** "~ can't block", "can't be blocked", "attacks each combat if able", "doesn't untap", "can't be countered" (D-094): the engine's `restriction`. */
  'restriction',
  'noMaximumHandSize',
  /** "You may play an additional land on each of your turns." (CR 305.2, D-125). */
  'additionalLandDrops',
  /** "You may look at the top card of your library any time." (CR 401.5, D-125). */
  'lookAtTopOfLibrary',
  /** "Creatures can't attack you unless their controller pays {M} for each creature they control that's attacking you." (CR 508.1h, D-125). */
  'attackTax',
  /** "You may choose not to untap ~ during your untap step." (CR 502.3, D-125). */
  'optionalUntap',
  /** "Untap all creatures you control during each other player's untap step." (CR 502.3, D-229). */
  'untapInOthersUntapStep',
  /** "~ costs {1} less to cast for each ...", "Artifact spells you cast cost {1} less" (D-095): the engine's `costReduction`. */
  'costReduction',
  /** "~ is the chosen type in addition to its other types." (D-100): the engine's `setTypes` static, layer 4. */
  'setTypes',
  /** "~'s power and toughness are each equal to the number of ..." (CR 604.3, D-115): a characteristic-defining ability, layer 7a. */
  'characteristicPt',
  /** "You may cast this card from your graveyard [as long as ...]" (CR 113.6b, D-133): the engine's `castFromGraveyard`. */
  'castFromGraveyard',
  /** "~ isn't a creature" (CR 613.1d, 205.1a, D-229): the engine's static `loseTypes`, layer 4. */
  'loseTypes',
  /** "Other creatures you control have base power and toughness 5/3" (CR 613.4b, D-139): the engine's static `setPt`. */
  'setPt',
  /** "Juggernauts you control can't be blocked by Walls" (CR 509.1b, D-139): the engine's `cantBeBlockedBy`. */
  'cantBeBlockedBy',
  /** "... has the power, toughness, and creature types of the last creature card exiled with it" (CR 607.2a, D-139). */
  'takeFromLinkedExile',
  /** "You may cast artifact spells as though they had flash" (CR 601.3b, D-139): the engine's `castAsThoughFlash`. */
  'castAsThoughFlash',
  /** "Can't attack or block unless you control another creature with power 4 or greater" (CR 508.1a, D-145): the engine's `restrictionUnless`. */
  'restrictionUnless',
  /** "Enchanted creature loses all abilities" (CR 613.1f, D-145): the engine's static `loseAllAbilities`. */
  'loseAllAbilities',
  /** "Enchanted creature is a green Elk creature" (CR 613.1e, D-145): the engine's static `setColors`. */
  'setColors',
  /** "Prevent all combat damage that would be dealt to this creature" (CR 615.1, D-149): the engine's `preventDamageToThis`. */
  'preventDamageToThis',
  /** "You have hexproof" (CR 702.11b, D-149): the engine's `playerHexproof`. */
  'playerHexproof',
  /** "You can't lose the game" and "your opponents can't win the game" (CR 104.2, 104.3, D-149): `cantLoseGame` and `opponentsCantWin`. */
  'cantLoseGame',
  'opponentsCantWin',
  /** "Your opponents can't gain life" (CR 119.7, D-363): the engine's `cantGainLife`. */
  'cantGainLife',
  /** "You have protection from the chosen card type" (CR 702.16, D-377): the engine's `playerProtection`. */
  'playerProtection',
  /** "Creatures you control can't have -1/-1 counters put on them" (CR 122.6, 101.2, D-380): the engine's `cantHaveCounters`. */
  'cantHaveCounters',
  /** "If a triggered ability of a Wizard you control triggers, that ability triggers an additional time" (CR 603.2d, D-220): `doubleTriggers`. */
  'doubleTriggers',
  /** "You can't cast ~ during your first, second, or third turns of the game" (CR 101.2, D-149): `cantCastThis`. */
  'cantCastThis',
  /** "Your opponents can't cast spells during your turn" (CR 101.2, D-179): the engine's `opponentsCantCastOnYourTurn`. */
  'opponentsCantCastOnYourTurn',
  /** "Your opponents can't cast spells with mana value 3 or less" (CR 101.2, D-282): the engine's `opponentsCantCastSpells`. */
  'opponentsCantCastSpells',
  /** "Creature spells you control can't be countered" (CR 101.2, 701.6a, D-185): the engine's `spellsCantBeCountered`. */
  'spellsCantBeCountered',
  /** "Creatures can't block unless their controller pays {1} for each of those creatures" (CR 509.1d, D-149): `blockTax`. */
  'blockTax',
  /** "You don't lose unspent red mana as steps and phases end" (CR 500.5, D-151): `unspentManaStays`. */
  'unspentManaStays',
  /** "You may cast creature spells with power 4 or greater from the top of your library" (CR 601.3, D-151): `castFromTopOfLibrary`. */
  'castFromTopOfLibrary',
  /** "Once during each of your turns, you may cast an artifact spell from your graveyard" (CR 601.2a, 305.1, D-232): `playFromGraveyardOnceEachTurn`. */
  'playFromGraveyardOnceEachTurn',
  /** "Damage isn't removed from this creature during cleanup steps" (CR 514.2, D-192): the engine's `keepsDamage`. */
  'keepsDamage',
] as const;
export type StaticKind = (typeof STATIC_KINDS)[number];

/** Whom a static ability affects: the engine's `StaticSubject` kinds. */
export const STATIC_SUBJECT_KINDS = [
  'this',
  'attached',
  'filter',
  'pair',
] as const satisfies readonly StaticSubject['kind'][];
export type StaticSubjectKind = (typeof STATIC_SUBJECT_KINDS)[number];

export const TOKEN_KINDS = [
  'Treasure',
  'Food',
  'Clue',
  'Map',
  'Blood',
  'custom',
  /** "A token that's a copy of target creature" (CR 707.2): the engine's `copyOf`. */
  'copyOf',
  /** "Create two tapped Treasure tokens" (CR 110.5b, D-131): the engine's `createToken.tapped`. */
  'tapped',
  /** "A token that's a copy of that card, except it's a 4/4 black Zombie" (CR 707.9b, D-382): the engine's `copyOf` with `setPt`, `setColors`, `setCreatureTypes`, `noManaCost`. */
  'copyExceptions',
] as const;
export type TokenKind = (typeof TOKEN_KINDS)[number];

export const AMOUNT_KINDS = [
  'number',
  'x',
  'powerOf',
  'manaValueOf',
  /** "The difference" between a number and a mana value (D-151): the engine's `shortfall`. */
  'shortfall',
  'countOf',
  /** "For each time it was kicked" (CR 702.33c): the engine's `timesKicked`. */
  'timesKicked',
  /** "The amount of mana spent to cast it", "for each mana from an artifact source spent to cast it" (CR 601.2h, D-183): the engine's `manaSpent`. */
  'manaSpent',
  /** "The total life lost this way" (CR 702.101a, D-120): the engine's `lifeLostThisWay`. */
  'lifeLostThisWay',
  /** "The life that player lost this turn" (CR 119.3, D-365): the engine's `lifeLostThisTurn`, the whole amount of a `loseLife`. */
  'lifeLostThisTurn',
  /** "-X/-X", "+2/+2 for each ..." (D-115): a multiple of an amount, only as a power or toughness. */
  'times',
  /** "That creature's toughness" (D-131): the engine's `toughnessOf`. */
  'toughnessOf',
  /** "For each +1/+1 counter on it" (D-131): the engine's `countersOn`. */
  'countersOn',
  /** "The greatest power among creatures you control", "the total power of creatures you control" (D-131): the engine's `aggregate`. */
  'aggregate',
  /** "Your devotion to black" (CR 700.5, D-131): the engine's `devotion`. */
  'devotion',
  /** "The number of colors in your commander's color identity" (CR 903.4, D-131): the engine's `commanderColors`. */
  'commanderColors',
  /** "The greatest mana value among your commanders" (CR 903.3, 202.3, D-145): the engine's `commanderManaValue`. */
  'commanderManaValue',
  /** "The number of times you've cast your commander from the command zone this game" (CR 903.8, D-229): the engine's `commanderCasts`. */
  'commanderCasts',
  /** "For each color among permanents you control" (CR 105.2, D-179): the engine's `colorsAmong`, a static ability's +N/+N. */
  'colorsAmong',
  /** "For each time it has attacked this turn" (CR 508.1, D-187): the engine's `timesAttacked`, a static ability's +N/+N. */
  'timesAttacked',
  /** "Double the power and toughness of each creature you control" (CR 701.10, D-145): the engine's `affected` power or toughness amount. */
  'affected',
  /** "Half the number of ..., rounded down" (D-131): the engine's `half`. */
  'half',
  /** "Twice ...", "2 life for each ..." (D-131): the engine's `multiple`. */
  'multiple',
  /** "... minus 4" (CR 107.1b, D-321): the engine's `minus`, floored at 0. */
  'minus',
  /** "... plus ..." (D-131): the engine's `sum`. */
  'sum',
  /** "For each creature sacrificed / destroyed this way", "for each opponent who drew a card this way" (D-131): the engine's `thisWay`. */
  'thisWay',
  /** "For each opponent who has more life / cards in hand / creatures than you" (D-131): the engine's `opponentsWithMore`. */
  'opponentsWithMore',
  /** "That much" for the damage that caused a trigger (D-133): the engine's `triggerDamage`. */
  'triggerDamage',
  /** "The number of profit votes" (CR 701.38a, D-194): the engine's `votesFor`. */
  'votesFor',
  'bound',
] as const;
export type AmountKind = (typeof AMOUNT_KINDS)[number];

/** Where a searched-for card may be put: the AST's three, and the zones other cards ask for. */
export const SEARCH_DESTINATION_KINDS = [
  'battlefield',
  'hand',
  'graveyard',
  'library',
  'exile',
] as const;
export type SearchDestinationKind = (typeof SEARCH_DESTINATION_KINDS)[number];

/** The alternative ways to cast a spell the `castSpell` action names (CR 118.9, D-121). */
export const CAST_ALTERNATIVE_KINDS = [
  'flashback',
  'free',
  'overload',
  'evoke',
  'dash',
  'spectacle',
  'escape',
  'madness',
  'miracle',
  'foretell',
  'tapPermanents',
] as const;
export type CastAlternativeKind = (typeof CAST_ALTERNATIVE_KINDS)[number];

/**
 * One thing the engine may or may not run, named `<dimension>:<value>`: the unit a parser lowering
 * declares in `needs`, and the unit a "not runnable" diagnostic reports. Dimensions with a closed
 * AST type are typed by it, so a misspelt `effect:` or `keyword:` fails to compile.
 * `manaCost:` is a cost of a mana ability (CR 605.1a), `cost:` one of any other activated ability.
 */
export type FeatureRef =
  | `ability:${Ability['kind'] | AbilityFeatureKind}`
  | `effect:${Effect['kind']}`
  | `trigger:${Trigger['kind'] | TriggerFeatureKind}`
  | `keyword:${Keyword['kind']}`
  | `replacement:${Replacement['kind']}`
  | `cost:${Cost['kind']}`
  | `manaCost:${Cost['kind']}`
  | `selector:${SelectorKind}`
  | `condition:${ConditionKind}`
  | `duration:${DurationKind}`
  | `static:${StaticKind}`
  | `staticSubject:${StaticSubjectKind}`
  | `manaProduction:${ManaProduction['kind']}`
  | `manaAlso:${Effect['kind']}`
  | `token:${TokenKind}`
  | `amount:${AmountKind}`
  | `searchDestination:${SearchDestinationKind}`
  | `castAlternative:${CastAlternativeKind}`
  | `layout:${string}`;

export type FeatureDimension = FeatureRef extends `${infer D}:${string}` ? D : never;

type KindTable<T extends string> = { readonly [K in T]: true };

const ABILITY_TABLE: KindTable<Ability['kind'] | AbilityFeatureKind> = {
  level: true,
  staticCondition: true,
  costReducedIf: true,
  ifGiftPromised: true,
  ifKicked: true,
  additionalCostChoice: true,
  selfCostReducedIf: true,
  costReducedBy: true,
  oncePerTurn: true,
  manaInstead: true,
  manaSpendOnly: true,
  functionsInGraveyard: true,
  doOnlyOnceEachTurn: true,
  manaSpentRider: true,
  manaDistinctColors: true,
  manaSpentRiderCopy: true,
  mayPlayFromGraveyard: true,
  modeCost: true,
  activateOnlyIf: true,
  xCost: true,
  modal: true,
  keyword: true,
  static: true,
  replacement: true,
  triggered: true,
  activated: true,
  mana: true,
};
const EFFECT_TABLE: KindTable<Effect['kind']> = {
  sequence: true,
  mill: true,
  manifest: true,
  dealDamage: true,
  destroy: true,
  exile: true,
  sacrifice: true,
  moveToZone: true,
  counter: true,
  draw: true,
  discard: true,
  exileOwnGraveyardCard: true,
  sparePermanents: true,
  splitCostExiled: true,
  returnGraveyardPair: true,
  phaseOut: true,
  gainLevel: true,
  exileRandomFromGraveyard: true,
  exileRandomFromHand: true,
  becomeCopyOfCard: true,
  gainLife: true,
  setLifeTotal: true,
  loseLife: true,
  loseGame: true,
  meld: true,
  tap: true,
  untap: true,
  removeAllCounters: true,
  gainEnergy: true,
  connive: true,
  createCopies: true,
  playersMay: true,
  addMana: true,
  addCounters: true,
  modifyPt: true,
  setPt: true,
  loseAllAbilities: true,
  setTypes: true,
  setColors: true,
  grantKeyword: true,
  grantAbility: true,
  restrict: true,
  requireAttack: true,
  gainControl: true,
  shuffle: true,
  rollDie: true,
  scry: true,
  surveil: true,
  lookAndReorder: true,
  lookAndSplit: true,
  revealAndSeparate: true,
  putFromHandOnTop: true,
  createToken: true,
  search: true,
  attach: true,
  transform: true,
  conditional: true,
  counterUnlessPays: true,
  unlessPays: true,
  becomeCopy: true,
  preventDamage: true,
  regenerate: true,
  mayPay: true,
  cascade: true,
  copySpell: true,
  changeTarget: true,
  storm: true,
  replicate: true,
  unearth: true,
  encore: true,
  cumulativeUpkeep: true,
  becomeMonarch: true,
  delayedTrigger: true,
  delayedCast: true,
  removeTimeCounter: true,
  castExiled: true,
  may: true,
  reflexive: true,
  mayCast: true,
  lookAtTop: true,
  revealUntil: true,
  dealDividedDamage: true,
  fight: true,
  castFree: true,
  castCard: true,
  reselectAttack: true,
  chooseOne: true,
  vote: true,
  ringTempts: true,
  pair: true,
  empowerJace: true,
  amass: true,
  createEmblem: true,
  delayedSacrifice: true,
  proliferate: true,
  exileTop: true,
  mayPlay: true,
  extraCombat: true,
  extraBeginningPhase: true,
  enterAttacking: true,
  exileUntilCast: true,
  revealTop: true,
  behold: true,
  payAnyAmount: true,
};
const TRIGGER_TABLE: KindTable<Trigger['kind'] | TriggerFeatureKind> = {
  entersBattlefield: true,
  dies: true,
  attacks: true,
  castSpell: true,
  landfall: true,
  upkeep: true,
  endStep: true,
  permanentSacrificed: true,
  becomesTapped: true,
  becomesUntapped: true,
  discarded: true,
  diesBatch: true,
  entersBatch: true,
  leftGraveyard: true,
  exiledFromLibraryOrGraveyard: true,
  becomesTarget: true,
  chapter: true,
  step: true,
  drawn: true,
  dealsCombatDamage: true,
  noncombatDamageDealt: true,
  dealtDamage: true,
  leavesBattlefield: true,
  blocks: true,
  becomesBlocked: true,
  state: true,
  tappedForMana: true,
  tapsForMana: true,
  combatDamageBatch: true,
  lifeGained: true,
  countersAdded: true,
  attackBatch: true,
  cycled: true,
  ringTempted: true,
  interveningIf: true,
  alone: true,
  attacksAt: true,
  entersUntapped: true,
  leavesToAnyOf: true,
  triggerCondition: true,
  becomesTargetSpell: true,
  castNth: true,
};
const KEYWORD_TABLE: KindTable<Keyword['kind']> = {
  flying: true,
  firstStrike: true,
  doubleStrike: true,
  deathtouch: true,
  defender: true,
  haste: true,
  hexproof: true,
  shroud: true,
  indestructible: true,
  lifelink: true,
  menace: true,
  reach: true,
  trample: true,
  vigilance: true,
  flash: true,
  cycling: true,
  enchant: true,
  equip: true,
  kicker: true,
  flashback: true,
  prowess: true,
  ward: true,
  crew: true,
  protection: true,
  landwalk: true,
  fear: true,
  intimidate: true,
  shadow: true,
  changeling: true,
  devoid: true,
  partner: true,
  chooseBackground: true,
  canBeCommander: true,
  ascend: true,
  soulbond: true,
  exalted: true,
  annihilator: true,
  backup: true,
  persist: true,
  undying: true,
  infect: true,
  wither: true,
  toxic: true,
  splitSecond: true,
  typecycling: true,
  multikicker: true,
  skulk: true,
  battleCry: true,
  mentor: true,
  evolve: true,
  bushido: true,
  extort: true,
  affinity: true,
  convoke: true,
  improvise: true,
  delve: true,
  cascade: true,
  unearth: true,
  encore: true,
  eternalize: true,
  devour: true,
  riot: true,
  echo: true,
  cumulativeUpkeep: true,
  suspend: true,
  storm: true,
  replicate: true,
  gift: true,
  livingWeapon: true,
  jobSelect: true,
  escalate: true,
  hideaway: true,
  readAhead: true,
  dethrone: true,
  myriad: true,
};
const REPLACEMENT_TABLE: KindTable<Replacement['kind']> = {
  entersTapped: true,
  entersWithCounters: true,
  entersTappedUnlessPays: true,
  entersTappedUnlessReveals: true,
  entersPrepared: true,
  asEntersChoose: true,
  wouldDie: true,
  lifeGainBonus: true,
  othersEnterWithCounters: true,
  tokensInstead: true,
  groupEntersUntapped: true,
  entersAsCopy: true,
  redirectDamage: true,
  skipDraw: true,
  drawInstead: true,
};
const MANA_PRODUCTION_TABLE: KindTable<ManaProduction['kind']> = {
  fixed: true,
  anyColor: true,
  commanderIdentity: true,
  chosenColor: true,
  oneOf: true,
  couldProduce: true,
  combination: true,
  anyCombination: true,
  anyColorDevotion: true,
};
const COST_TABLE: KindTable<Cost['kind']> = {
  mana: true,
  tap: true,
  untap: true,
  payLife: true,
  payXLife: true,
  discardX: true,
  sacrifice: true,
  discard: true,
  discardThis: true,
  exileThis: true,
  tapCreatures: true,
  tapPermanents: true,
  blight: true,
  exileFromGraveyard: true,
  removeCounters: true,
  loyalty: true,
  putCounters: true,
  mill: true,
  energy: true,
  returnToHand: true,
};

/**
 * Every value each dimension could ever hold, supported or not. A lowering may only name these
 * (`layout:` is open: layouts are Scryfall strings). The parser's dimension test walks its
 * lowerings against this table, so a misspelt reference fails the build.
 */
export const FEATURE_VALUES: Readonly<
  Record<Exclude<FeatureDimension, 'layout'>, readonly string[]>
> = {
  ability: Object.keys(ABILITY_TABLE),
  effect: Object.keys(EFFECT_TABLE),
  trigger: Object.keys(TRIGGER_TABLE),
  keyword: Object.keys(KEYWORD_TABLE),
  replacement: Object.keys(REPLACEMENT_TABLE),
  cost: Object.keys(COST_TABLE),
  manaCost: Object.keys(COST_TABLE),
  manaProduction: Object.keys(MANA_PRODUCTION_TABLE),
  manaAlso: Object.keys(EFFECT_TABLE),
  selector: SELECTOR_KINDS,
  condition: CONDITION_KINDS,
  duration: DURATION_KINDS,
  static: STATIC_KINDS,
  staticSubject: STATIC_SUBJECT_KINDS,
  token: TOKEN_KINDS,
  amount: AMOUNT_KINDS,
  searchDestination: SEARCH_DESTINATION_KINDS,
  castAlternative: CAST_ALTERNATIVE_KINDS,
};

function supportedList(dimension: FeatureDimension): readonly string[] {
  switch (dimension) {
    case 'ability':
      return [...SUPPORTED_FEATURES.abilityKinds, ...SUPPORTED_FEATURES.abilityFeatures];
    case 'effect':
      return SUPPORTED_FEATURES.effectKinds;
    case 'trigger':
      return [...SUPPORTED_FEATURES.triggerKinds, ...SUPPORTED_FEATURES.triggerFeatures];
    case 'keyword':
      return SUPPORTED_FEATURES.keywordKinds;
    case 'replacement':
      return SUPPORTED_FEATURES.replacementKinds;
    case 'cost':
      return SUPPORTED_FEATURES.costKinds;
    case 'manaCost':
      return SUPPORTED_FEATURES.manaAbilityCostKinds;
    case 'manaProduction':
      return SUPPORTED_FEATURES.manaProductionKinds;
    case 'manaAlso':
      return SUPPORTED_FEATURES.manaAbilityAlsoKinds;
    case 'selector':
      return SUPPORTED_FEATURES.selectorKinds;
    case 'condition':
      return SUPPORTED_FEATURES.conditionKinds;
    case 'duration':
      return SUPPORTED_FEATURES.durationKinds;
    case 'static':
      return SUPPORTED_FEATURES.staticKinds;
    case 'staticSubject':
      return SUPPORTED_FEATURES.staticSubjectKinds;
    case 'token':
      return SUPPORTED_FEATURES.tokenKinds;
    case 'amount':
      return SUPPORTED_FEATURES.amountKinds;
    case 'searchDestination':
      return SUPPORTED_FEATURES.searchDestinationKinds;
    case 'castAlternative':
      return SUPPORTED_FEATURES.castAlternatives;
    case 'layout':
      return SUPPORTED_FEATURES.layouts;
    default: {
      const unreachable: never = dimension;
      return unreachable;
    }
  }
}

/** Splits `effect:createToken` into its dimension and value. */
export function splitFeatureRef(ref: FeatureRef): { dimension: FeatureDimension; value: string } {
  const at = ref.indexOf(':');
  return { dimension: ref.slice(0, at) as FeatureDimension, value: ref.slice(at + 1) };
}

/** True when `ref` names a value its dimension could hold (a typo in a lowering is not "known"). */
export function isKnownFeature(ref: FeatureRef): boolean {
  const { dimension, value } = splitFeatureRef(ref);
  if (dimension === 'layout') return value.length > 0;
  return FEATURE_VALUES[dimension].includes(value);
}

/** True when the engine runs `ref` today, as declared in SUPPORTED_FEATURES. */
export function isFeatureSupported(ref: FeatureRef): boolean {
  const { dimension, value } = splitFeatureRef(ref);
  return supportedList(dimension).includes(value);
}
