// Feature references (D-068): `<dimension>:<value>` names what the engine runs, for the parser's
// "recognised but not runnable" diagnostics. Nothing may be claimed that SUPPORTED_FEATURES lacks.
import { describe, expect, test } from 'vitest';
import {
  FEATURE_VALUES,
  type FeatureRef,
  isFeatureSupported,
  isKnownFeature,
  SUPPORTED_FEATURES,
  splitFeatureRef,
} from '../src/ast/features';

describe('the dimensions', () => {
  test('every supported value is a value its dimension could hold', () => {
    const lists: Record<keyof typeof FEATURE_VALUES, readonly string[]> = {
      ability: SUPPORTED_FEATURES.abilityKinds,
      effect: SUPPORTED_FEATURES.effectKinds,
      trigger: SUPPORTED_FEATURES.triggerKinds,
      keyword: SUPPORTED_FEATURES.keywordKinds,
      replacement: SUPPORTED_FEATURES.replacementKinds,
      cost: SUPPORTED_FEATURES.costKinds,
      manaCost: SUPPORTED_FEATURES.manaAbilityCostKinds,
      manaProduction: SUPPORTED_FEATURES.manaProductionKinds,
      manaAlso: SUPPORTED_FEATURES.manaAbilityAlsoKinds,
      selector: SUPPORTED_FEATURES.selectorKinds,
      condition: SUPPORTED_FEATURES.conditionKinds,
      duration: SUPPORTED_FEATURES.durationKinds,
      static: SUPPORTED_FEATURES.staticKinds,
      staticSubject: SUPPORTED_FEATURES.staticSubjectKinds,
      token: SUPPORTED_FEATURES.tokenKinds,
      amount: SUPPORTED_FEATURES.amountKinds,
      searchDestination: SUPPORTED_FEATURES.searchDestinationKinds,
      castAlternative: SUPPORTED_FEATURES.castAlternatives,
    };
    for (const [dimension, supported] of Object.entries(lists)) {
      const known = FEATURE_VALUES[dimension as keyof typeof FEATURE_VALUES];
      for (const value of supported) {
        expect(known, `${dimension}:${value}`).toContain(value);
      }
    }
  });

  test('the predefined tokens the engine runs are also token kinds', () => {
    for (const preset of SUPPORTED_FEATURES.tokenPresets) {
      expect(SUPPORTED_FEATURES.tokenKinds).toContain(preset);
    }
  });

  test('what the engine does not run yet is empty, not guessed', () => {
    // The costs and durations the engine pays and ends (scenario-xx-activated-*, -pump-*).
    expect(SUPPORTED_FEATURES.costKinds).toEqual([
      'tap',
      'mana',
      'payLife',
      'payXLife',
      // D-386: "Discard X cards" as an additional cost to cast a spell.
      'discardX',
      // D-575: an optional exile of any number of cards from hand as a spell cost.
      'exileFromHand',
      'sacrifice',
      'removeCounters',
      'discardThis',
      'revealThis',
      'discard',
      'tapCreatures',
      'tapPermanents',
      // D-407: "Blight 1" as the cost of an activated ability.
      'blight',
      'untapPermanents',
      // D-139: "Put a page counter on this artifact", "Return an artifact you control to its owner's hand".
      'putCounters',
      'returnToHand',
      // D-185: "Exile this card from your graveyard" (the cost of Encore).
      'exileThis',
      // D-229: "Mill a card" as the cost of an ordinary ability.
      'mill',
      // D-232: "Exile two creature cards from your graveyard" as the cost of an activated ability.
      'exileFromGraveyard',
      // D-200: the loyalty symbol of a loyalty ability.
      'loyalty',
      // D-209: "{E}{E}", paid in an `unlessPays`; issue 105: and as the cost of an activated ability.
      'energy',
      // Issue 105: "an amount of {E} equal to ...", the cost of a `mayPay`.
      'energyAmount',
    ]);
    expect(SUPPORTED_FEATURES.durationKinds).toEqual([
      'untilEndOfTurn',
      'untilYourNextTurn',
      // CR 611.2a (Hildibrand Manderville): `mayCast.duration`, "until the end of your next turn".
      'untilEndOfNextTurn',
      'whileHasCounter',
      'forAsLongAsYouControlThis',
      // D-207: "for as long as this Saga remains on the battlefield".
      'forAsLongAsThisRemains',
      // D-517: "doesn't untap during its controller's next untap step".
      'untilNextUntapStep',
      'thisCombat',
    ]);
    // Only what the interpreter runs: replacement and `conditional` conditions, and "was kicked".
    expect(SUPPORTED_FEATURES.conditionKinds).toEqual([
      'controlsAtLeast',
      'opponentsAtLeast',
      // D-599: corrupted checks an opponent's poison counters.
      'opponentPoisonAtLeast',
      'kicked',
      // Issue 244: "If you cast this spell during your main phase".
      'castInOwnMainPhase',
      // Issue 233: "If X is 5 or more".
      'xAtLeast',
      'replicated',
      // CR 118.8, 701.68a: "if this spell's additional cost was paid" (the optional blight).
      'additionalCostPaid',
      'sacrificedAsCost',
      'controlCommander',
      'sourceHasCounter',
      'subjectGreaterPt',
      'subjectControllerHasMore',
      // Auntie Ool, Massacre Girl, Lasting Tarfire.
      'subjectControlledByYou',
      'subjectStat',
      'subjectGreaterThanEach',
      'putCountersThisTurn',
      'triggerPlayerHasMore',
      'triggerPlayerTurn',
      'triggerPlayerIsOpponent',
      'triggerPlayerStat',
      'cardsInGraveyard',
      // D-331: "as long as there are no cards in your library".
      'cardsInLibrary',
      // Lorehold group 3: "if a player has one or fewer cards in hand".
      'aPlayerCardsInHand',
      'escaped',
      // CR 702.143a: "if this spell was foretold".
      'foretold',
      'cameUnderControlSinceLastUpkeep',
      'amountIs',
      'amountIsPrime',
      'playerHasDesignation',
      'maxSpeed',
      // D-235: "Activate only if this Class is level N".
      'classLevelIs',
      'lifeTotal',
      'thisMatches',
      'didPrevious',
      'movedTotalManaValue',
      'movedShareAllCardTypes',
      // CR 202.3, 608.2c: "If that card's mana value is less than or equal to the number of experience counters you have".
      'manaValueAtMostAmount',
      // D-210: "if a creature card was discarded this way".
      'thisWayAtLeast',
      'diedThisWay',
      'objectMatches',
      'giftPromised',
      'opponentControlsAtLeast',
      // D-139: "if you control the artifact with the greatest mana value or tied".
      'controlsGreatest',
      'duringStep',
      'yourMainPhase',
      'yourCombatPhase',
      // D-206: during your turn, a card left your graveyard this turn, mana spent, cast from a zone.
      'yourTurn',
      'cardLeftYourGraveyard',
      'descendedThisTurn',
      'playedLandThisTurn',
      'manaSpentAtLeast',
      'castFromZone',
      // Issue 100: "When this creature enters, if you cast it".
      'wasCast',
      // D-207: "if it targets a tapped creature".
      'spellTargets',
      'attackersAttackedYou',
      // D-643: "if two or more of those creatures are attacking you and/or planeswalkers you control".
      'attackersAtYouAtLeast',
      // D-648: "if that opponent has more life than another of your opponents".
      'attackedHasMoreLifeThanOtherOpponent',
      // Galadriel group 1: "if this is the second time this ability has resolved this turn", "if you chose a creature other than ~ as your Ring-bearer".
      'abilityResolvedTimes',
      'ringBearerChosen',
      'ownTurnNumber',
      'sameNameAtLeast',
      // D-151: what entered this turn, damage dealt this turn.
      'enteredThisTurn',
      // D-423: "as long as this Aura entered this turn".
      'thisEnteredThisTurn',
      'playerDealtDamage',
      'combatDamagedBy',
      // D-252: "if you gained 3 or more life this turn".
      'lifeGainedThisTurn',
      // D-591: life gain and life loss are both recorded this turn.
      'lifeGainedAndLostThisTurn',
      // CR 119.3: "if a player lost 4 or more life this turn".
      'aPlayerLostLifeThisTurn',
      // Issue 159: "if you've cast a spell from a graveyard or activated an ability of a card in a graveyard this turn".
      'castFromGraveyardThisTurn',
      // D-318: "Activate only if you've cast three or more spells this turn".
      'spellsCastThisTurn',
      // Issue 345: "if no spells were cast last turn".
      'spellsCastLastTurn',
      // Issue 279: "if you attacked with three or more creatures this turn".
      'attackedWithCreaturesThisTurn',
      'thisAttackedThisTurn',
      'dieResult',
      // CR 701.30d: "If you win" after a clash.
      'clashWon',
      // CR 107.3: "If X is 10 or more".
      'thisInYourGraveyard',
      'thisOnBattlefield',
      'thisSuspended',
      'chosenOption',
      // D-151: Dethrone's "attacking the player with the most life", Pack tactics' total power.
      'attackingMostLife',
      'attackersTotalPower',
      // D-196: "if you control your Ring-bearer".
      'controlsRingBearer',
      'thisIsRingBearer',
      'ringTemptedAtLeast',
      'ownsAndControlsNamed',
      // D-286: "as long as this creature is paired with another creature", and the engine's own intervening "if" of soulbond.
      'paired',
      'soulbondReady',
      'and',
      'or',
      'not',
    ]);
    expect(SUPPORTED_FEATURES.staticKinds).toEqual([
      'allCreatureTypes',
      // Issue 104: "Each creature card in your hand has cycling {1}{U}."
      'grantKeywordToHandCards',
      // Issue 145: "Creature spells you cast have demonstrate."
      'grantKeywordToSpells',
      // "Each instant and sorcery card in your graveyard has flashback. The flashback cost is equal to that card's mana cost." (CR 702.34a).
      'grantFlashbackToGraveyardCards',
      // "Elemental permanent spells you cast from your hand gain evoke {4} as you cast them." (CR 702.74a, 118.9).
      'grantAlternativeCostToSpells',
      // Issue 105: "You may pay eight {E} rather than pay the mana cost for permanent spells you cast."
      'grantEnergyAlternative',
      'noMaximumHandSize',
      // Issue 201: "Enchanted creature ... is goaded".
      'goaded',
      'additionalLandDrops',
      'lookAtTopOfLibrary',
      'revealTopOfLibrary',
      'playLandsFromTopOfLibrary',
      'attackTax',
      // D-647: "Inklings can't attack you or planeswalkers you control."
      'cantAttackYou',
      'optionalUntap',
      'exertOnAttack',
      'crewSaddleBonus',
      'untapInOthersUntapStep',
      'modifyPt',
      'characteristicPt',
      'grantKeyword',
      // Colossus Hammer (CR 613.1f): "Equipped creature gets +10/+10 and loses flying".
      'loseKeyword',
      'grantAbility',
      'restriction',
      'costReduction',
      'costIncrease',
      // D-641 (CR 601.2f): strive, "costs {2}{R} more to cast for each target beyond the first".
      'costPerExtraTarget',
      // D-425: "Equip abilities you activate that target enchanted creature cost {3} less to activate".
      'abilityCostReduction',
      'setTypes',
      'castFromGraveyard',
      // D-139: base power and toughness, "can't be blocked by Walls", "exiled with", "as though they had flash".
      'loseTypes',
      'setPt',
      'cantBeBlockedBy',
      'takeFromLinkedExile',
      // Issue 144: "As long as the top card of your library is a Goblin card, this creature has all activated abilities of that card."
      'grantActivatedAbilitiesOfTopCard',
      // Issue 102 (Steward of the Harvest): the same for the cards exiled with the permanent.
      'grantActivatedAbilitiesOfLinkedExile',
      'castAsThoughFlash',
      // Death Toll deck, group C: "As long as ~ isn't on the battlefield, it's a 1/1 Insect creature in addition to its other types."
      'creatureOffBattlefield',
      // D-145: "can't attack or block unless ...", "loses all abilities", "is a green ..." (colors).
      'restrictionUnless',
      'loseAllAbilities',
      'setColors',
      // D-149: prevention to this, a player's hexproof, can't lose, opponents can't win, can't cast this.
      'preventDamageToThis',
      'playerHexproof',
      'cantLoseGame',
      'opponentsCantWin',
      'cantGainLife',
      'damageCantBePrevented',
      'damageAsThoughWither',
      'playerProtection',
      'cantHaveCounters',
      'cantBeSacrificed',
      'doubleTriggers',
      'cantCastThis',
      'blockTax',
      // D-151: unspent mana that stays, casting from the top of the library.
      'unspentManaStays',
      // Issue 81: "If you would lose unspent mana, that mana becomes colorless instead."
      'unspentManaBecomesColorless',
      'castFromTopOfLibrary',
      'playFromGraveyardOnceEachTurn',
      'playFromGraveyardEachType',
      // CR 305.1: "You may play Forests from your graveyard."
      'playLandsFromGraveyard',
      // Issue 345 (CR 702.10b, 302.6): "You may activate abilities of creatures you control as though those creatures had haste."
      'activateAsThoughHaste',
      // CR 606.3: "You may activate the loyalty abilities of planeswalkers you control twice each turn rather than only once."
      'loyaltyActivationLimit',
      // D-179: "Your opponents can't cast spells during your turn."
      'opponentsCantCastOnYourTurn',
      // D-282: "Your opponents can't cast spells with mana value 3 or less."
      'opponentsCantCastSpells',
      // D-185: "Creature spells you control can't be countered."
      'spellsCantBeCountered',
      // D-192: "Damage isn't removed from this creature during cleanup steps."
      'keepsDamage',
      // "The \"legend rule\" doesn't apply to Slivers you control." (CR 704.5j).
      'legendRuleDoesntApply',
      'giveChosenCreatureType',
      'grantEncoreToGraveyardCards',
    ]);
    expect(SUPPORTED_FEATURES.staticSubjectKinds).toEqual(['this', 'attached', 'filter', 'pair']);
    // D-103: X in costs is announced as a spell is cast or an ability activated, and read by `x`.
    expect(SUPPORTED_FEATURES.amountKinds).toContain('x');
    expect(SUPPORTED_FEATURES.costKinds).toContain('payXLife');
    expect(SUPPORTED_FEATURES.abilityFeatures).toContain('xCost');
  });
});

describe('feature references', () => {
  test('a reference splits at the first colon', () => {
    expect(splitFeatureRef('effect:createToken')).toEqual({
      dimension: 'effect',
      value: 'createToken',
    });
  });

  test('supported follows SUPPORTED_FEATURES, per dimension', () => {
    expect(isFeatureSupported('effect:draw')).toBe(true);
    expect(isFeatureSupported('effect:search')).toBe(true);
    expect(isFeatureSupported('effect:discard')).toBe(true);
    expect(isFeatureSupported('searchDestination:battlefield')).toBe(true);
    expect(isFeatureSupported('searchDestination:hand')).toBe(true);
    expect(isFeatureSupported('searchDestination:graveyard')).toBe(true);
    expect(isFeatureSupported('searchDestination:library')).toBe(true);
    expect(isFeatureSupported('searchDestination:exile')).toBe(false);
    expect(isFeatureSupported('effect:modifyPt')).toBe(true);
    expect(isFeatureSupported('duration:untilEndOfTurn')).toBe(true);
    expect(isFeatureSupported('duration:permanent')).toBe(false);
    expect(isFeatureSupported('keyword:cycling')).toBe(true);
    expect(isFeatureSupported('keyword:flash')).toBe(true);
    expect(isFeatureSupported('keyword:ward')).toBe(true);
    expect(isFeatureSupported('keyword:protection')).toBe(true); // D-229: protection from a color
    expect(isFeatureSupported('trigger:becomesTarget')).toBe(true);
    expect(isFeatureSupported('effect:counterUnlessPays')).toBe(true);
    expect(isFeatureSupported('effect:becomeCopy')).toBe(true);
    expect(isFeatureSupported('selector:triggerSubject')).toBe(true);
    expect(isFeatureSupported('token:copyOf')).toBe(true);
    expect(isFeatureSupported('ability:mana')).toBe(true);
    expect(isFeatureSupported('ability:activated')).toBe(true);
    expect(isFeatureSupported('manaCost:tap')).toBe(true);
    expect(isFeatureSupported('manaCost:mana')).toBe(true);
    expect(isFeatureSupported('manaCost:discard')).toBe(false);
    expect(isFeatureSupported('manaProduction:oneOf')).toBe(true);
    expect(isFeatureSupported('manaAlso:dealDamage')).toBe(true);
    expect(isFeatureSupported('manaAlso:draw')).toBe(false);
    expect(isFeatureSupported('static:noMaximumHandSize')).toBe(true);
    expect(isFeatureSupported('static:additionalLandDrops')).toBe(true);
    expect(isFeatureSupported('static:lookAtTopOfLibrary')).toBe(true);
    expect(isFeatureSupported('static:attackTax')).toBe(true);
    expect(isFeatureSupported('static:optionalUntap')).toBe(true);
    expect(isFeatureSupported('static:modifyPt')).toBe(true);
    expect(isFeatureSupported('static:grantKeyword')).toBe(true);
    // `pt` is the old spelling of `modifyPt`: kept as a known value, never supported.
    expect(isFeatureSupported('static:pt')).toBe(false);
    expect(isFeatureSupported('static:grantAbility')).toBe(true);
    expect(isFeatureSupported('staticSubject:attached')).toBe(true);
    expect(isFeatureSupported('staticSubject:filter')).toBe(true);
    expect(isFeatureSupported('keyword:enchant')).toBe(true);
    expect(isFeatureSupported('keyword:equip')).toBe(true);
    expect(isFeatureSupported('effect:attach')).toBe(true);
    expect(isFeatureSupported('condition:controlsAtLeast')).toBe(true);
    expect(isFeatureSupported('replacement:entersTappedUnlessPays')).toBe(true);
    expect(isFeatureSupported('cost:tap')).toBe(true);
    expect(isFeatureSupported('cost:discardThis')).toBe(true);
    // D-095: "discard N cards" is a cost with a choice (`forCost`): activations, Ward, additional costs.
    expect(isFeatureSupported('cost:discard')).toBe(true);
    expect(isFeatureSupported('amount:countOf')).toBe(true);
    expect(isFeatureSupported('static:costReduction')).toBe(true);
    expect(isFeatureSupported('condition:controlCommander')).toBe(true);
    expect(isFeatureSupported('cost:untap')).toBe(false);
    // D-232: the cost of an activated ability (Coin of Fate); an additional cost of a spell refuses it.
    expect(isFeatureSupported('cost:exileFromGraveyard')).toBe(true);
    expect(isFeatureSupported('selector:anyOf')).toBe(true);
    expect(isFeatureSupported('selector:colorChoice')).toBe(false);
    expect(isFeatureSupported('token:Treasure')).toBe(true);
    // Food and Clue run their activated abilities through the ordinary activation path (CR 111.10).
    expect(isFeatureSupported('token:Food')).toBe(true);
    expect(isFeatureSupported('token:Clue')).toBe(true);
    expect(isFeatureSupported('token:Map')).toBe(true); // issue 81: the Map token and explore
    expect(isFeatureSupported('token:Blood')).toBe(false);
    // The intervening "if" (CR 603.4) is a `trigger:` feature; the condition is a `condition:`.
    expect(isFeatureSupported('trigger:interveningIf')).toBe(true);
    expect(isFeatureSupported('condition:kicked')).toBe(true);
    // D-135: "if you do" after a "you may" effect.
    expect(isFeatureSupported('condition:didPrevious')).toBe(true);
    expect(isFeatureSupported('condition:cardsInGraveyard')).toBe(true); // D-229
    expect(isFeatureSupported('layout:normal')).toBe(true);
    expect(isFeatureSupported('layout:split')).toBe(true);
    expect(isFeatureSupported('layout:transform')).toBe(true);
    expect(isFeatureSupported('layout:saga')).toBe(true);
    expect(isFeatureSupported('trigger:chapter')).toBe(true);
    expect(isFeatureSupported('layout:meld')).toBe(true); // D-277
    expect(isFeatureSupported('layout:flip')).toBe(false);
  });

  test('a value outside the universe is not known', () => {
    expect(isKnownFeature('effect:draw')).toBe(true);
    expect(isKnownFeature('layout:split')).toBe(true);
    expect(isKnownFeature('trigger:interveningIf')).toBe(true);
    expect(isKnownFeature('trigger:delayed' as FeatureRef)).toBe(false);
    expect(isKnownFeature('effect:drawCard' as FeatureRef)).toBe(false);
    expect(isKnownFeature('selector:colourChoice' as FeatureRef)).toBe(false);
  });
});
