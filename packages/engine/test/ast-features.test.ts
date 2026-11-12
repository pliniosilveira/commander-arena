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
    // Only the costs and the duration the engine pays and ends (scenario-xx-activated-*, -pump-*).
    expect(SUPPORTED_FEATURES.costKinds).toEqual([
      'tap',
      'mana',
      'payLife',
      'payXLife',
      'sacrifice',
      'removeCounters',
      'discardThis',
      'discard',
      'tapCreatures',
      'tapPermanents',
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
      // D-209: "{E}{E}", paid in an `unlessPays` only.
      'energy',
    ]);
    expect(SUPPORTED_FEATURES.durationKinds).toEqual([
      'untilEndOfTurn',
      'untilYourNextTurn',
      'forAsLongAsYouControlThis',
      // D-207: "for as long as this Saga remains on the battlefield".
      'forAsLongAsThisRemains',
    ]);
    // Only what the interpreter runs: replacement and `conditional` conditions, and "was kicked".
    expect(SUPPORTED_FEATURES.conditionKinds).toEqual([
      'controlsAtLeast',
      'opponentsAtLeast',
      'kicked',
      'replicated',
      'controlCommander',
      'sourceHasCounter',
      'subjectGreaterPt',
      'subjectControllerHasMore',
      'triggerPlayerHasMore',
      'cardsInGraveyard',
      'escaped',
      'cameUnderControlSinceLastUpkeep',
      'amountIs',
      'playerHasDesignation',
      // D-235: "Activate only if this Class is level N".
      'classLevelIs',
      'lifeTotal',
      'thisMatches',
      'didPrevious',
      // D-210: "if a creature card was discarded this way".
      'thisWayAtLeast',
      'objectMatches',
      'giftPromised',
      'opponentControlsAtLeast',
      // D-139: "if you control the artifact with the greatest mana value or tied".
      'controlsGreatest',
      'duringStep',
      'yourMainPhase',
      // D-206: during your turn, a card left your graveyard this turn, mana spent, cast from a zone.
      'yourTurn',
      'cardLeftYourGraveyard',
      'manaSpentAtLeast',
      'castFromZone',
      // D-207: "if it targets a tapped creature".
      'spellTargets',
      'attackersAttackedYou',
      'ownTurnNumber',
      'sameNameAtLeast',
      // D-151: what entered this turn, damage dealt this turn.
      'enteredThisTurn',
      'playerDealtDamage',
      // D-252: "if you gained 3 or more life this turn".
      'lifeGainedThisTurn',
      'dieResult',
      'thisInYourGraveyard',
      'chosenOption',
      // D-151: Dethrone's "attacking the player with the most life", Pack tactics' total power.
      'attackingMostLife',
      'attackersTotalPower',
      // D-196: "if you control your Ring-bearer".
      'controlsRingBearer',
      'and',
      'or',
      'not',
    ]);
    expect(SUPPORTED_FEATURES.staticKinds).toEqual([
      'noMaximumHandSize',
      'additionalLandDrops',
      'lookAtTopOfLibrary',
      'attackTax',
      'optionalUntap',
      'untapInOthersUntapStep',
      'modifyPt',
      'characteristicPt',
      'grantKeyword',
      'grantAbility',
      'restriction',
      'costReduction',
      'setTypes',
      'castFromGraveyard',
      // D-139: base power and toughness, "can't be blocked by Walls", "exiled with", "as though they had flash".
      'loseTypes',
      'setPt',
      'cantBeBlockedBy',
      'takeFromLinkedExile',
      'castAsThoughFlash',
      // D-145: "can't attack or block unless ...", "loses all abilities", "is a green ..." (colors).
      'restrictionUnless',
      'loseAllAbilities',
      'setColors',
      // D-149: prevention to this, a player's hexproof, can't lose, opponents can't win, can't cast this.
      'preventDamageToThis',
      'playerHexproof',
      'cantLoseGame',
      'opponentsCantWin',
      'doubleTriggers',
      'cantCastThis',
      'blockTax',
      // D-151: unspent mana that stays, casting from the top of the library.
      'unspentManaStays',
      'castFromTopOfLibrary',
      'playFromGraveyardOnceEachTurn',
      // D-179: "Your opponents can't cast spells during your turn."
      'opponentsCantCastOnYourTurn',
      // D-185: "Creature spells you control can't be countered."
      'spellsCantBeCountered',
      // D-192: "Damage isn't removed from this creature during cleanup steps."
      'keepsDamage',
    ]);
    expect(SUPPORTED_FEATURES.staticSubjectKinds).toEqual(['this', 'attached', 'filter']);
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
    expect(isFeatureSupported('searchDestination:library')).toBe(false);
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
    expect(isFeatureSupported('token:Map')).toBe(false);
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
    expect(isFeatureSupported('layout:meld')).toBe(false);
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
