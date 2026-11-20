/**
 * Noun phrases to engine selectors and target declarations (CR 115). A target noun must have been
 * numbered by the binding pass: its `ref` is the target id.
 */
import {
  type Amount,
  type AttackedBySelector,
  CARD_TYPES,
  type CardType,
  type Color,
  type Keyword,
  type NumberComparison,
  type ObjectFilter,
  type ObjectRef,
  type ObjectSelector,
  type PlayerSelector,
  SUPERTYPES,
  type Supertype,
  type TargetSpec,
} from '@commander-arena/engine';
import type { IrFilter, IrNoun, IrNounList } from '../ir/types';
import { isGrantable, keywordKind } from '../rules/keyword/vocabulary';
import { type FeatureRef, missingFeatures } from './features';
import type { LowerContext, LowerFailure, LowerResult } from './types';

const COLOR_LETTERS: Readonly<Record<string, Color>> = {
  white: 'W',
  blue: 'U',
  black: 'B',
  red: 'R',
  green: 'G',
};

/** The engine color for a color word ("white" is W), or undefined for a word that is not one. */
export function colorLetter(word: string): Color | undefined {
  return COLOR_LETTERS[word];
}

/** The selector each noun kind lowers to, as the feature it needs. */
export const SELECTOR_NEEDS: Readonly<Partial<Record<IrNoun['det'], FeatureRef>>> = {
  self: 'selector:this',
  // "sacrifice a creature": the acting player chooses among the permanents that match.
  a: 'selector:choose',
  target: 'selector:target',
  each: 'selector:each',
  you: 'selector:you',
  eachPlayer: 'selector:eachPlayer',
  eachOpponent: 'selector:eachOpponent',
  controllerOf: 'selector:controllerOf',
  ownerOf: 'selector:ownerOf',
  triggerSubject: 'selector:triggerSubject',
  triggerActor: 'selector:triggerActor',
  // Stage P29 (D-133): "the sacrificed creature", what the cost of this activated ability sacrificed.
  sacrificed: 'selector:sacrificedCost',
  // Stage P28 (D-131): "you and target opponent each" (several players at once), "defending player" (CR 508.5).
  players: 'selector:all',
  defendingPlayer: 'selector:defendingPlayer',
  // "the player to your right" (Hithlain Rope).
  playerToRight: 'selector:playerToYourRight',
  // Stage P33 (D-150): "this card".
  thisCard: 'selector:thisCard',
  // Stage P52 (D-210): "each player who discarded a card this way".
  discardedThisWay: 'selector:discardedThisWay',
  // CR 701.21a: "each player who can't" after a sacrifice (Plaguecrafter).
  couldntSacrificeThisWay: 'selector:couldntSacrificeThisWay',
  // D-269: "each player ~ attacked this turn" (CR 508.6).
  attackedPlayers: 'selector:attackedPlayers',
  // CR 120.2a: "each opponent dealt combat damage this game by a creature named ~".
  combatDamagedByNamed: 'selector:combatDamagedByNamed',
};

/** Features a noun can need beyond its selector kind. */
export const NOUN_EXTRA_NEEDS: readonly FeatureRef[] = [
  'selector:chosenType',
  'selector:chosen',
  'selector:chosenColor',
  'selector:thisSpell',
  'selector:anyTarget',
  'selector:anyOf',
  'selector:controllerRef',
  'selector:powerGreaterThan',
  'selector:bound',
  'selector:ownerRef',
  'selector:power',
  'selector:toughness',
  'selector:manaValue',
  'selector:attackingYou',
  'selector:attackingOpponents',
  'selector:attackingOrBlocking',
  'selector:damageSource',
  'selector:token',
  'selector:nontoken',
  'selector:notSubtypes',
  'selector:notSupertypes',
  'selector:colorless',
  'selector:notColors',
  'selector:keywords',
  'selector:triggerPlayer',
  'selector:triggerAttackedPlayer',
  'selector:sacrificedCost',
  'selector:thisCard',
  'selector:anyNumber',
  // Hylda group 3: "any number of target tapped creatures with different controllers" (`TargetSpec.differentControllers`).
  'selector:differentControllers',
  'selector:atLeastOne',
  'selector:upToThatMany',
  // D-513: "tap up to X target nonland permanents, where X is the number of cards looked at while scrying this way" (`TargetSpec.upToTriggerAmount`).
  'selector:upToTriggerAmount',
  // CR 107.3c, 603.3d: "return up to X target Zombie cards from your graveyard to the battlefield, where X is the number of opponents you have" (`TargetSpec.upToAmount`).
  'selector:upToAmount',
  // D-386: "X target creature cards from your graveyard" (`TargetSpec.countX`).
  'selector:countX',
  'selector:greatest',
  'selector:least',
  'selector:giftRecipient',
  'selector:attacking',
  'selector:colorCount',
  'selector:manaValueX',
  'selector:controllerDamagedBySource',
  'selector:attackedBy',
  'selector:hasCounter',
  'selector:commander',
  'selector:enteredThisTurn',
  'selector:modified',
  // CR 701.15b: "a goaded creature".
  'selector:goaded',
  // D-426 (Danitha group 3): "Aura attached to it", "creatures that aren't enchanted", "target enchanted creature".
  'selector:attachedTo',
  'selector:enchanted',
  'selector:enchantedByYou',
  'selector:hostOfSource',
  // D-437 (Feather group 3): "a spell that targets ~" and "that targets only ~" (CR 115.1, 115.9c).
  'selector:isSource',
  'selector:targetsOnly',
  'selector:powerAboveBase',
  'selector:basePowerIs',
  'selector:named',
  'selector:sharesCreatureTypeWith',
  'selector:sharesCreatureTypeWithSource',
  'selector:sharesCreatureTypeWithSacrificed',
  'selector:chooseFromTriggerSources',
  'selector:sharesCardTypeWith',
  'selector:eachOtherOpponent',
  'selector:eachPlayerExcept',
  'selector:discardedThisWay',
];

function failure(noun: IrNoun, needs: readonly FeatureRef[]): LowerFailure {
  return { ok: false, needs, at: noun.span, rule: noun.rule };
}

/** Checks the features of `refs`; a failure at `noun` names the missing ones. */
function gate(noun: IrNoun, refs: readonly FeatureRef[]): LowerFailure | null {
  const missing = missingFeatures(refs);
  return missing.length > 0 ? failure(noun, missing) : null;
}

/** The items of an operand: one noun, or the nouns of a list. */
export function itemsOf(operand: IrNoun | IrNounList): readonly IrNoun[] {
  return operand.kind === 'noun' ? [operand] : operand.items;
}

function lowerFilterAt(
  filter: IrFilter,
  noun: IrNoun,
  inner: boolean,
  /** D-437: a member of a disjunction of spells (the outer filter is on the stack): it may read what the spell targets. */
  stackMember = false,
  /** D-646: the filter of what a spell targets: matched against the permanent that is the target, so "modified" may be read in it although it is not the filter of the noun itself. */
  aimed = false,
): LowerResult<ObjectFilter> {
  const rule = noun.rule;
  const bad = (needs: readonly FeatureRef[]): LowerResult<ObjectFilter> => ({
    ok: false,
    needs,
    at: noun.span,
    rule,
  });
  if (typeof filter.controller === 'object') return bad(['selector:controllerRef']);
  // CR 208.1, 608.2c: "with power greater than target creature's power" is read by the group of an effect (`selectorOf`), where the targets are known.
  if (filter.powerGreaterThanNoun !== undefined) return bad(['selector:powerGreaterThan']);
  // D-656: "named ~" is read by the group of an effect (`selectorOf`) with the card's own name; anywhere else there is no name to give it.
  if (filter.namedSelf === true) return bad([]);
  const types = filter.types ?? [];
  const notTypes = filter.notTypes ?? [];
  if (![...types, ...notTypes].every((t) => (CARD_TYPES as readonly string[]).includes(t))) {
    return bad([]);
  }
  const supertypes = filter.supertypes ?? [];
  if (!supertypes.every((t) => (SUPERTYPES as readonly string[]).includes(t))) return bad([]);
  const notSupertypes = filter.notSupertypes ?? [];
  if (!notSupertypes.every((t) => (SUPERTYPES as readonly string[]).includes(t))) return bad([]);
  const colors: Color[] = [];
  for (const word of filter.colors ?? []) {
    const letter = COLOR_LETTERS[word];
    if (letter === undefined) return bad([]);
    colors.push(letter);
  }
  const notColors: Color[] = [];
  for (const word of filter.notColors ?? []) {
    const letter = COLOR_LETTERS[word];
    if (letter === undefined) return bad([]);
    notColors.push(letter);
  }
  let anyOf: ObjectFilter[] | undefined;
  if (filter.anyOf !== undefined) {
    const missing = missingFeatures(['selector:anyOf']);
    if (missing.length > 0) return bad(missing);
    anyOf = [];
    for (const member of filter.anyOf) {
      const lowered = lowerFilterAt(
        member,
        noun,
        true,
        filter.zone === 'stack' || filter.stackKind !== undefined,
        noun.det === 'each' && !inner,
      );
      if (!lowered.ok) return lowered;
      anyOf.push(lowered.value);
    }
  }
  // D-100, D-566: chosen-type filters read an entry choice or a type selected as this resolves.
  let chosen:
    | { chosenType: true }
    | { chosenColor: true }
    | { notChosenType: true }
    | Record<string, never> = {};
  if (filter.notChosenType === true) {
    const missing = missingFeatures(['selector:chosenType']);
    if (missing.length > 0) return bad(missing);
    chosen = { notChosenType: true };
  } else if (filter.chosen !== undefined) {
    const feature = filter.chosen === 'type' ? 'selector:chosenType' : 'selector:chosenColor';
    const missing = missingFeatures([feature]);
    if (missing.length > 0) return bad(missing);
    chosen = filter.chosen === 'type' ? { chosenType: true } : { chosenColor: true };
  }
  // D-111: "with power 4 or greater", "with mana value 3 or less": the engine's comparisons.
  const compared: Partial<Record<'power' | 'toughness' | 'manaValue', NumberComparison>> = {};
  for (const key of ['power', 'toughness', 'manaValue'] as const) {
    const comparison = filter[key];
    if (comparison === undefined) continue;
    const missing = missingFeatures([`selector:${key}`]);
    if (missing.length > 0) return bad(missing);
    compared[key] = { cmp: comparison.cmp, value: comparison.value };
  }
  // D-133 (stage P29): "nontoken" (CR 111.1), "non-Zombie" (CR 205.3d), "colorless" (CR 105.2c), "with flying".
  const parts: FeatureRef[] = [];
  if (filter.token !== undefined) parts.push(filter.token ? 'selector:token' : 'selector:nontoken');
  if (filter.notSubtypes !== undefined) parts.push('selector:notSubtypes');
  // D-135 (stage P30): "nonbasic land" (CR 205.4), the engine's `notSupertypes`.
  if (filter.notSupertypes !== undefined) parts.push('selector:notSupertypes');
  if (filter.colorless === true) parts.push('selector:colorless');
  // CR 105.2: "nonblack", the engine's `notColors`.
  if (notColors.length > 0) parts.push('selector:notColors');
  const keywordsOf = (words: readonly string[] | undefined): Keyword['kind'][] | null => {
    const kinds: Keyword['kind'][] = [];
    for (const word of words ?? []) {
      if (word === 'toxic') {
        kinds.push('toxic');
        continue;
      }
      const kind = keywordKind(word);
      if (kind === undefined || !isGrantable(kind)) return null;
      kinds.push(kind);
    }
    return kinds;
  };
  const keywords = keywordsOf(filter.keywords);
  const notKeywords = keywordsOf(filter.notKeywords);
  if (keywords === null || notKeywords === null) return bad([]);
  if (keywords.length > 0 || notKeywords.length > 0) parts.push('selector:keywords');
  // D-139 (stage P31): "attacking creatures" (CR 508.1k), a number of colors (CR 105.2).
  if (filter.attacking === true) parts.push('selector:attacking');
  if (filter.notAttacking === true) parts.push('selector:notAttacking');
  if (filter.blocking === true) parts.push('selector:blocking');
  if (filter.powerLessThanSource === true) parts.push('selector:powerLessThanSource');
  if (filter.colorCount !== undefined) parts.push('selector:colorCount');
  // "With mana value X" and "whose controller was dealt combat damage by ~ this turn" read the ability that resolves (its X, its
  // source): the engine reads them in the `each` selector of an effect only, so a target or a member of a choice is not lowered.
  const resolving = filter.manaValueX === true || filter.controllerDamagedBySource === true;
  // D2 group (CR 107.3a, 601.2b, 601.2c): "target creature with mana value X" reads the X announced before the targets are chosen; the engine reads it in the target
  // slot of a spell's own text (`validateCard` refuses it anywhere else).
  const aimedAtX =
    filter.manaValueX === true &&
    filter.controllerDamagedBySource !== true &&
    noun.det === 'target';
  if (resolving && (inner || (noun.det !== 'each' && !aimedAtX))) return bad([]);
  if (filter.manaValueX === true) parts.push('selector:manaValueX');
  if (filter.controllerDamagedBySource === true) parts.push('selector:controllerDamagedBySource');
  // D-145 (stage P32): "with a counter on it" (CR 122.1) and "commander" (CR 903.3).
  if (filter.hasCounter !== undefined) parts.push('selector:hasCounter');
  if (filter.commander !== undefined) parts.push('selector:commander');
  if (filter.isSelf === true) parts.push('selector:isSource');
  // D-180 (stage P37): "that was put there from the battlefield this turn" (CR 700.4), a card of a graveyard (the engine reads it of the filter of
  // a target or an `each` selector, never of a member of a choice).
  if (filter.putFromBattlefieldThisTurn === true) {
    if (inner) return bad([]);
    parts.push('selector:putFromBattlefieldThisTurn');
  }
  // D-235: "spells you cast from anywhere other than your hand" (CR 601.2a), a spell on the stack.
  if (filter.notCastFromHand === true) {
    if (inner) return bad([]);
    parts.push('selector:notCastFromHand');
  }
  // D-638: "an instant or sorcery spell ... from your hand" (CR 601.2a), a spell on the stack.
  if (filter.castFromHand === true) {
    if (inner) return bad([]);
    parts.push('selector:castFromHand');
  }
  // Quandrix Unlimited group E: "a spell with {X} in its mana cost" (CR 107.3), "your first such spell each turn" (CR 601.2i), a spell on the stack.
  if (filter.xInManaCost === true) {
    if (inner) return bad([]);
    parts.push('selector:xInManaCost');
  }
  if (filter.firstXSpellThisTurn === true) {
    if (inner) return bad([]);
    parts.push('selector:firstXSpellThisTurn');
  }
  // Group 4 of the Vraska deck: "that entered this turn" (CR 400.7), read where the filter is matched against the game (a target slot, an `each` selector).
  if (filter.enteredThisTurn === true) {
    if (inner) return bad([]);
    parts.push('selector:enteredThisTurn');
  }
  // Lorehold group 2: "target card exiled with ~" (CR 607.2a), read where the filter is matched against the game with the source (a target slot); never a member of a choice, and a card in exile.
  if (filter.exiledWithSelf === true) {
    if (inner || filter.zone !== 'exile') return bad([]);
    parts.push('selector:exiledWithSource');
  }
  // Issue 89 (Animate Dead, CR 400.7): "put onto the battlefield with ~", read where the filter is matched against the game with the source (an enchant ability); never a member of a choice.
  if (filter.putWithSelf === true) {
    if (inner || (filter.zone !== undefined && filter.zone !== 'battlefield')) return bad([]);
    parts.push('selector:putWithSource');
  }
  // D-416 (CR 700.9): "modified", read where the filter is matched against the game (a target slot, an `each` selector, an enchant ability); never a member of a choice,
  // except of the choice of an `each` selector ("Auras, Equipment, and modified creatures you control"), whose members are matched against the same game.
  if (filter.modified === true) {
    if (inner && !aimed) return bad([]);
    parts.push('selector:modified');
  }
  // CR 701.15b: "goaded", read where the filter is matched against the game (a trigger's subject, a target slot, an `each` selector); never a member of a choice.
  if (filter.goaded === true) {
    if (inner) return bad([]);
    parts.push('selector:goaded');
  }
  // D-431: "with power greater than its base power" (CR 208.4b), read from the object where the filter is matched against the game.
  if (filter.powerAboveBase === true) parts.push('selector:powerAboveBase');
  if (filter.basePowerIs !== undefined) parts.push('selector:basePowerIs');
  // Issue 104 (CR 201.2): "a card named X" of a library search, read where the filter is matched against the game; never a member of a choice.
  if (filter.named !== undefined) {
    if (inner) return bad([]);
    parts.push('selector:named');
  }
  // D-262: "that share a land type" is a condition on the cards found together, which a filter of one card cannot say: the search lowering takes it off first.
  if (filter.sharedLandType === true) return bad([]);
  // CR 202.3: "any number of ... with total mana value 6 or less" is also about the cards found together (the search lowering takes it off first).
  if (filter.anyNumberTotalManaValue !== undefined) return bad([]);
  // CR 701.23: "any number of creature cards" is about the cards found together as well.
  if (filter.anyNumber === true) return bad([]);
  // D-261: "that shares a creature type with it" (CR 205.3m, 603.10a): the creature a "dies" trigger is about; the engine refuses it anywhere but the filter of a `revealUntil`
  // of such a trigger (`validateCard`).
  if (filter.sharesCreatureTypeWithIt === true) parts.push('selector:sharesCreatureTypeWith');
  // CR 205.3m, 701.21a (Descendants' Fury): "shares a creature type with the sacrificed creature", read by the engine after a sacrifice of the same text.
  if (filter.sharesCreatureTypeWithSacrificed === true) {
    parts.push('selector:sharesCreatureTypeWithSacrificed');
  }
  // CR 205.3m (Titan of Littjara): "that shares a creature type with it" of a count, the creature types of the source of the ability.
  if (filter.sharesCreatureTypeWithSource === true) {
    if (inner) return bad([]);
    parts.push('selector:sharesCreatureTypeWithSource');
  }
  // CR 205.2a, 701.21a (Braids): "shares a card type with it", the permanent an earlier sacrifice sacrificed.
  if (filter.sharesCardTypeWithSacrificed === true) parts.push('selector:sharesCardTypeWith');
  // D-181 (stage P38): "with a single target" (CR 115.9a), a spell or ability on the stack (a target slot, never a member of a choice).
  if (filter.singleTarget === true) {
    if (inner || filter.zone !== 'stack') return bad([]);
    parts.push('selector:singleTarget');
  }
  // D-206 (stage P49): "that targets a creature" (CR 115.1, 601.2c), a spell on the stack (a cast trigger's filter or a target slot).
  let targetsObject: ObjectFilter | undefined;
  const onStack = inner ? stackMember : filter.zone === 'stack' || filter.stackKind !== undefined;
  if (filter.targets !== undefined) {
    if (!onStack) return bad([]);
    parts.push('selector:targetsObject');
    const aimed = lowerFilterAt(filter.targets, noun, true, false, true);
    if (!aimed.ok) return aimed;
    targetsObject = aimed.value;
  }
  // D-437 (CR 115.1, 115.9c): "that targets ~" and "that targets only ~": the source of the ability is the object the spell targets, the only one for "only".
  let targetsOnly: ObjectFilter | undefined;
  // Issue 144 (CR 115.9c): "that targets only a single creature you control": the one object the spell's targets are is of this kind.
  if (filter.targetsOnly !== undefined) {
    if (!onStack || targetsObject !== undefined) return bad([]);
    parts.push('selector:targetsOnly');
    const aimed = lowerFilterAt(filter.targetsOnly, noun, true, false, true);
    if (!aimed.ok) return aimed;
    targetsOnly = aimed.value;
  }
  if (filter.targetsSelf === true || filter.targetsOnlySelf === true) {
    if (!onStack || targetsObject !== undefined) return bad([]);
    parts.push('selector:isSource');
    if (filter.targetsOnlySelf === true) {
      parts.push('selector:targetsOnly');
      targetsOnly = { isSource: true };
    } else {
      parts.push('selector:targetsObject');
      targetsObject = { isSource: true };
    }
  }
  // D-426 (CR 303.4, 301.5, 701.3): the permanent something is attached to, and "enchanted": a permanent on the battlefield, so no member of a choice and no other zone.
  let attachedTo: ObjectFilter['attachedTo'];
  if (filter.attachedTo !== undefined) {
    if (inner || (filter.zone !== undefined && filter.zone !== 'battlefield')) return bad([]);
    parts.push('selector:attachedTo');
    const to = filter.attachedTo;
    // The statement the count is in says what "it" is (the lowering of a static ability does); anywhere else there is no such permanent.
    if (to.kind === 'it') return bad([]);
    if (to.kind === 'type') {
      if (!to.types.every((t) => (CARD_TYPES as readonly string[]).includes(t))) return bad([]);
      attachedTo = { kind: 'matching', filter: { types: to.types as CardType[] } };
    } else {
      attachedTo = { kind: to.kind };
    }
  }
  if (filter.enchanted !== undefined) {
    if (inner || (filter.zone !== undefined && filter.zone !== 'battlefield')) return bad([]);
    parts.push('selector:enchanted');
  }
  // D-647 (CR 303.4e): "enchanted by an Aura you control", a permanent on the battlefield, read where the filter is matched against the game.
  if (filter.enchantedByYou === true) {
    if (inner || (filter.zone !== undefined && filter.zone !== 'battlefield')) return bad([]);
    parts.push('selector:enchantedByYou');
  }
  // D-426 (CR 601.2c, 303.4): "that target enchanted creature", the objects a spell targets are the permanent its source is attached to. Only a spell's filter says it
  // (a cost reduction), as `targets`: not a member of a choice, and not together with it.
  if (filter.targetsHost === true) {
    if (inner || targetsObject !== undefined) return bad([]);
    parts.push('selector:hostOfSource');
    targetsObject = { hostOfSource: true };
  }
  // D-645 (CR 601.2c, 601.2f, 115.1): what the spell a cost reduction is about targets: the filter of the spells names no zone, so it is not asked to be on the stack.
  if (filter.castTargets !== undefined) {
    if (inner || targetsObject !== undefined) return bad([]);
    parts.push('selector:targetsObject');
    const aimed = lowerFilterAt(filter.castTargets, noun, true, false, true);
    if (!aimed.ok) return aimed;
    targetsObject = aimed.value;
  }
  // D-149 (CR 601.2c, 601.2f, 113.6): "Spells your opponents cast that target ~ cost {2} more": the object the spell targets is the permanent that has the ability.
  if (filter.castTargetsSelf === true) {
    if (inner || targetsObject !== undefined) return bad([]);
    parts.push('selector:isSource', 'selector:targetsObject');
    targetsObject = { isSource: true };
  }
  const missingParts = missingFeatures(parts);
  if (missingParts.length > 0) return bad(missingParts);
  // D-131: "creatures attacking you" (CR 508.1b): the attackers whose attack target is the controller as a player.
  if (filter.attackingYou !== undefined) {
    const missing = missingFeatures(['selector:attackingYou']);
    if (missing.length > 0) return bad(missing);
  }
  if (filter.attackingOrBlocking === true) {
    const missing = missingFeatures(['selector:attackingOrBlocking']);
    if (missing.length > 0) return bad(missing);
  }
  if (filter.attackingOpponents !== undefined) {
    const missing = missingFeatures(['selector:attackingOpponents']);
    if (missing.length > 0) return bad(missing);
  }
  // "with mana value X or less" (stage P68, D-230): only a target reads it, and `declareTarget` takes the flag off once it has the amount (a filter that still has it is
  // not lowered: an `each` selector or a member would drop the limit).
  if (filter.manaValueAtMostX === true) return bad([]);
  // "historic" (stage P68, D-230, CR 700.6): an artifact, a legendary permanent or a Saga.
  let anyOfFinal = anyOf;
  if (filter.historic === true) {
    // Issue 81 (Jhoira, "a historic permanent card"): every historic object is a permanent already (an artifact, a legendary permanent, a Saga), so "permanent" adds nothing.
    const onlyPermanentTypes =
      anyOf !== undefined &&
      anyOf.every(
        (member) =>
          Object.keys(member).length === 1 &&
          member.types?.length === 1 &&
          ['artifact', 'creature', 'enchantment', 'land', 'planeswalker', 'battle'].includes(
            member.types[0] ?? '',
          ),
      );
    if (anyOf !== undefined && !onlyPermanentTypes) return bad([]);
    anyOfFinal = [{ types: ['artifact'] }, { supertypes: ['legendary'] }, { subtypes: ['Saga'] }];
  }
  const value: ObjectFilter = {
    // A member of anyOf says what the object is, not where to look (CR 115.1, 601.2c).
    ...(filter.zone !== undefined && !inner ? { zone: filter.zone } : {}),
    ...(types.length > 0 ? { types: types as CardType[] } : {}),
    ...(notTypes.length > 0 ? { notTypes: notTypes as CardType[] } : {}),
    ...(supertypes.length > 0 ? { supertypes: supertypes as Supertype[] } : {}),
    ...(notSupertypes.length > 0 ? { notSupertypes: notSupertypes as Supertype[] } : {}),
    ...(filter.subtypes !== undefined && filter.subtypes.length > 0
      ? { subtypes: [...filter.subtypes] }
      : {}),
    ...(colors.length > 0 ? { colors } : {}),
    ...(notColors.length > 0 ? { notColors } : {}),
    ...(filter.notSubtypes !== undefined && filter.notSubtypes.length > 0
      ? { notSubtypes: [...filter.notSubtypes] }
      : {}),
    ...(filter.colorless === true ? { colorless: true as const } : {}),
    ...(filter.token !== undefined ? { token: filter.token } : {}),
    ...(keywords.length > 0 ? { keywords } : {}),
    ...(notKeywords.length > 0 ? { notKeywords } : {}),
    // "another creature": not the source itself (CR 109.1); the noun says it, not the filter.
    ...(noun.other && !inner ? { other: true } : {}),
    // A member of an `anyOf` may leave the source out on its own ("... and other Zombies you control", stage P29).
    ...(filter.other === true && inner ? { other: true as const } : {}),
    ...(filter.controller !== undefined ? { controller: filter.controller } : {}),
    ...(filter.tapped !== undefined ? { tapped: filter.tapped } : {}),
    ...(filter.stackKind !== undefined ? { stackKind: filter.stackKind } : {}),
    ...(filter.targetCountAtLeast !== undefined
      ? { targetCountAtLeast: filter.targetCountAtLeast }
      : {}),
    ...(filter.attackingYou !== undefined && !inner ? { attackingYou: filter.attackingYou } : {}),
    ...(filter.attackingOpponents !== undefined && !inner
      ? { attackingOpponents: filter.attackingOpponents }
      : {}),
    ...(filter.attackingOrBlocking === true ? { attackingOrBlocking: true as const } : {}),
    ...(filter.attacking === true ? { attacking: true as const } : {}),
    ...(filter.notAttacking === true ? { notAttacking: true as const } : {}),
    ...(filter.blocking === true ? { blocking: true as const } : {}),
    ...(filter.powerLessThanSource === true ? { powerLessThanSource: true as const } : {}),
    ...(filter.colorCount === undefined
      ? {}
      : { colorCount: { cmp: filter.colorCount.cmp, value: filter.colorCount.value } }),
    ...(filter.hasCounter === undefined ? {} : { hasCounter: filter.hasCounter }),
    ...(filter.commander === undefined ? {} : { commander: filter.commander }),
    ...(filter.isSelf === true ? { isSource: true as const } : {}),
    ...(filter.manaValueX === true ? { manaValueX: true as const } : {}),
    ...(filter.controllerDamagedBySource === true
      ? { controllerDealtDamageBySource: true as const }
      : {}),
    ...(filter.putFromBattlefieldThisTurn === true
      ? { putFromBattlefieldThisTurn: true as const }
      : {}),
    ...(filter.notCastFromHand === true ? { notCastFromHand: true as const } : {}),
    ...(filter.castFromHand === true ? { castFromHand: true as const } : {}),
    ...(filter.xInManaCost === true ? { xInManaCost: true as const } : {}),
    ...(filter.firstXSpellThisTurn === true ? { firstXSpellThisTurn: true as const } : {}),
    ...(filter.enteredThisTurn === true ? { enteredThisTurn: true as const } : {}),
    ...(filter.exiledWithSelf === true ? { exiledWithSource: true as const } : {}),
    ...(filter.putWithSelf === true ? { putWithSource: true as const } : {}),
    ...(filter.modified === true ? { modified: true as const } : {}),
    ...(filter.goaded === true ? { goaded: true as const } : {}),
    ...(filter.powerAboveBase === true ? { powerAboveBase: true as const } : {}),
    ...(filter.basePowerIs === undefined ? {} : { basePowerIs: filter.basePowerIs }),
    ...(filter.named === undefined ? {} : { named: filter.named }),
    ...(filter.singleTarget === true ? { singleTarget: true as const } : {}),
    ...(filter.sharesCreatureTypeWithIt === true
      ? { sharesCreatureTypeWith: 'triggerSubject' as const }
      : {}),
    ...(filter.sharesCardTypeWithSacrificed === true
      ? { sharesCardTypeWith: 'sacrificed' as const }
      : {}),
    ...(filter.sharesCreatureTypeWithSacrificed === true
      ? { sharesCreatureTypeWith: 'sacrificed' as const }
      : {}),
    ...(filter.sharesCreatureTypeWithSource === true
      ? { sharesCreatureTypeWith: 'source' as const }
      : {}),
    ...(targetsObject === undefined ? {} : { targetsObject }),
    ...(targetsOnly === undefined ? {} : { targetsOnly }),
    ...(attachedTo === undefined ? {} : { attachedTo }),
    ...(filter.enchanted === undefined ? {} : { enchanted: filter.enchanted }),
    ...(filter.enchantedByYou === true ? { enchantedByYou: true as const } : {}),
    ...compared,
    ...chosen,
    ...(anyOfFinal === undefined ? {} : { anyOf: anyOfFinal }),
  };
  return { ok: true, value, rule };
}

/** An IR filter as the engine's ObjectFilter. */
export function lowerFilter(noun: IrNoun): LowerResult<ObjectFilter> {
  // D-521 (CR 603.2, 102.1): "target creature that player controls" in a trigger about a player (the active player of a step): the player the binding pass found for "that
  // player" is the player of the event (`trigActor`), which a target slot names as the engine's `controller: 'triggerPlayer'`. Any other player is not read.
  const bound = noun.filter.controller;
  if (noun.det === 'target' && typeof bound === 'object') {
    if (bound.noun.ref !== 'trigActor' || bound.orPlaneswalkerController === true) {
      return failure(noun, ['selector:controllerRef']);
    }
    const { controller: _player, ...rest } = noun.filter;
    void _player;
    return lowerFilterAt({ ...rest, controller: 'triggerPlayer' }, noun, false);
  }
  return lowerFilterAt(noun.filter, noun, false);
}

/** How many targets a noun takes, as the TargetSpec bounds ("two target creatures"). */
function boundsOf(noun: IrNoun): { min?: number; max?: number } {
  const n = noun.count?.kind === 'number' ? noun.count.value : 1;
  // "one or two target creatures" (D-295, CR 601.2c): at least one, at most two.
  if (noun.minTargets !== undefined) return { min: noun.minTargets, max: n };
  if (noun.upTo) return { min: 0, max: n };
  return n > 1 ? { min: n, max: n } : {};
}

/**
 * Declares the one targets slot of a spell or ability that divides damage as it is cast or put on the stack (stage P32, D-147, CR 601.2d, 602.2b, 603.3d):
 * "any number of target creatures" (no fewest or most: at most as many as the total, each needing 1), "up to three target creatures" or "one or two
 * targets" (any target, at least one), with the total read once then (`divide`). The kind of permanent is an object filter; any other target is not divided.
 */
export function declareDividedTarget(
  noun: IrNoun,
  ctx: LowerContext,
  total: Amount,
  /** "Distribute up to that many ...": the controller may give out fewer than the total (CR 601.2d). */
  upTo = false,
): LowerResult<string> {
  const id = noun.ref;
  const divide = { total, ...(upTo ? { upTo: true as const } : {}) };
  if (id === undefined || noun.det !== 'target' || noun.filter.player !== undefined) {
    return failure(noun, []);
  }
  if (ctx.targets.some((t) => t.id === id)) return failure(noun, []);
  // D-657 (CR 115.4, 601.2d): "divided as you choose among any number of targets": any target, none to as many as the total. "one or two targets": one to two of them.
  if (noun.filter.anyTarget === true) {
    const blockedAny = missingFeatures(['selector:anyTarget']);
    if (blockedAny.length > 0) return failure(noun, blockedAny);
    if (noun.anyNumber === true) {
      ctx.targets.push({ id, what: { kind: 'anyTarget' }, divide });
    } else if (noun.minTargets !== undefined) {
      ctx.targets.push({ id, what: { kind: 'anyTarget' }, ...boundsOf(noun), divide });
    } else {
      return failure(noun, []);
    }
    return { ok: true, value: id, rule: noun.rule };
  }
  const filter = lowerFilter(noun);
  if (!filter.ok) return filter;
  const bounds = noun.anyNumber === true ? {} : boundsOf(noun);
  ctx.targets.push({
    id,
    what: { kind: 'object', filter: filter.value },
    ...bounds,
    divide,
  });
  return { ok: true, value: id, rule: noun.rule };
}

/** Declares the target of a bound target noun once, and returns its id. */
function declareTarget(noun: IrNoun, ctx: LowerContext): LowerResult<string> {
  const id = noun.ref;
  if (id === undefined) return failure(noun, []);
  // Issue 81 (Plan for All Outcomes): "up to one other target nonland permanent" as the first target of an ability of a permanent: there is no slot before it to be different
  // from, so "other" is the permanent with the ability (CR 115.1, 109.1), as in "another target ...".
  if (noun.otherTarget === true && ctx.targets.length === 0 && ctx.owner === 'ability') {
    const { otherTarget: _apart, ...rest } = noun;
    return declareTarget({ ...rest, other: true }, ctx);
  }
  // "Any number of target creatures" has no bounds of its own: a divided damage reads it (`declareDividedTarget`), and an effect that takes any number of
  // targets (stage P74, D-234: "any number of other target creatures you control phase out") has the slot `anyNumber`.
  const anyNumberTarget = noun.anyNumber === true && noun.det === 'target';
  // D-486 (CR 115.1): "any number of target players" is a player slot of the engine's `anyNumber`; other player forms ("or planeswalker") are not read.
  if (anyNumberTarget && noun.filter.player !== undefined && noun.filter.orPlaneswalker === true) {
    return failure(noun, []);
  }
  // "Return X target creature cards from your graveyard to your hand" (Hashaton group 10, D-386, CR 601.2b-c): as many targets as the X announced, of a spell's own
  // text and of objects (cards or permanents); the one place the engine's `countX` is read. Anything else about the noun that sets a count refuses it.
  // "up to X target Zombie cards from your graveyard to the battlefield, where X is the number of opponents you have" (CR 107.3c, 603.3d): when the sentence defines X, the number of
  // targets is that amount, read as the ability triggers (the engine's `upToAmount`); only in a triggered ability, where the ability is put on the stack with it.
  const upToDefinedX =
    noun.det === 'target' &&
    noun.count?.kind === 'x' &&
    noun.upTo === true &&
    noun.rule === 'noun.up-to-x-target-graveyard-cards' &&
    ctx.xIs !== null &&
    ctx.owner === 'ability' &&
    ctx.triggeredBody;
  const countX = noun.det === 'target' && noun.count?.kind === 'x' && !upToDefinedX;
  // The new graveyard noun rule reads "up to X" only where the sentence defines X for a triggered ability; elsewhere (a spell's "up to X", an activated ability's) the
  // announced X is exactly X, never up to it (D-386), so that wording is not read. Every other noun is lowered as it always was.
  if (noun.rule === 'noun.up-to-x-target-graveyard-cards' && !upToDefinedX) {
    return failure(noun, []);
  }
  if (countX) {
    if (
      // Issue 345 (Magus of the Candelabra, CR 602.2b): an activated ability announces its X before the targets too; a triggered ability has no X to announce.
      (ctx.owner !== 'spell' && (ctx.owner !== 'ability' || ctx.triggeredBody)) ||
      noun.filter.player !== undefined ||
      noun.filter.anyTarget === true ||
      noun.orCard !== undefined ||
      noun.minTargets !== undefined ||
      anyNumberTarget ||
      noun.perOpponent === true ||
      noun.otherTarget === true ||
      noun.upToThatMany === true
    ) {
      return failure(noun, []);
    }
  }
  if (upToDefinedX) {
    if (
      noun.filter.player !== undefined ||
      noun.filter.anyTarget === true ||
      noun.orCard !== undefined ||
      noun.minTargets !== undefined ||
      anyNumberTarget ||
      noun.perOpponent === true ||
      noun.otherTarget === true ||
      noun.upToThatMany === true
    ) {
      return failure(noun, []);
    }
  }
  if (!ctx.targets.some((t) => t.id === id)) {
    let spec: TargetSpec;
    if (noun.filter.anyTarget === true) {
      // "each of up to two other targets" (stage P34, D-152, CR 115.3): none of them a target of the slot of this ability before it.
      let differentFrom: string | undefined;
      if (noun.otherTarget === true) {
        differentFrom = ctx.targets[ctx.targets.length - 1]?.id;
        if (differentFrom === undefined) return failure(noun, []);
      }
      spec = {
        id,
        what: { kind: 'anyTarget' },
        ...boundsOf(noun),
        ...(differentFrom === undefined ? {} : { differentFrom }),
      };
    } else if (noun.filter.player !== undefined && noun.filter.orPlaneswalker === true) {
      // "target player or planeswalker" (stage P47, D-200, CR 115.1): the engine's `playerOrObject`.
      const blocked = missingFeatures(['selector:playerOrObject']);
      if (blocked.length > 0) return failure(noun, blocked);
      spec = {
        id,
        what: {
          kind: 'playerOrObject',
          player: noun.filter.player,
          filter: { types: ['planeswalker'] },
        },
        ...boundsOf(noun),
      };
    } else if (noun.filter.player !== undefined) {
      // "with different controllers" is said of permanents, never of players.
      if (noun.differentControllers === true) return failure(noun, []);
      if (anyNumberTarget) {
        const blocked = missingFeatures(['selector:anyNumber']);
        if (blocked.length > 0) return failure(noun, blocked);
      }
      spec = anyNumberTarget
        ? { id, what: { kind: 'player', filter: noun.filter.player }, anyNumber: true }
        : { id, what: { kind: 'player', filter: noun.filter.player }, ...boundsOf(noun) };
    } else if (noun.orSpell !== undefined) {
      // "target spell or creature" (issue 81, Fatehold Charm, CR 115.1): the engine's slot of a permanent or a spell; one target, nothing else about the noun.
      if (
        noun.upTo === true ||
        noun.other ||
        noun.otherTarget === true ||
        anyNumberTarget ||
        noun.perOpponent === true ||
        noun.upToThatMany === true ||
        noun.count !== undefined
      ) {
        return failure(noun, []);
      }
      const blocked = missingFeatures(['selector:objectOrSpell']);
      if (blocked.length > 0) return failure(noun, blocked);
      const permanents = lowerFilter(noun);
      if (!permanents.ok) return permanents;
      const spells = lowerFilterAt(noun.orSpell, { ...noun, other: false }, false);
      if (!spells.ok) return spells;
      spec = {
        id,
        what: { kind: 'objectOrSpell', filter: permanents.value, spell: spells.value },
        ...boundsOf(noun),
      };
    } else if (noun.orCard !== undefined) {
      // "up to three other target creatures from the battlefield and/or creature cards from graveyards" (D-270, CR 115.1): the engine's slot of two zones. The text of a
      // spell has no such slot (the engine reads it in a triggered ability only), and nothing else about the noun may be set that the slot does not say.
      if (ctx.owner === 'spell') return failure(noun, []);
      if (
        noun.upToThatMany === true ||
        anyNumberTarget ||
        noun.perOpponent === true ||
        noun.otherTarget === true ||
        noun.atLeastOne === true ||
        noun.greatest !== undefined ||
        noun.least !== undefined ||
        noun.filter.manaValueAtMostX === true ||
        noun.filter.manaValueAtMostAmount !== undefined ||
        noun.upTo !== true
      ) {
        return failure(noun, []);
      }
      const blocked = missingFeatures(['selector:objectOrGraveyardCard']);
      if (blocked.length > 0) return failure(noun, blocked);
      const permanents = lowerFilter(noun);
      if (!permanents.ok) return permanents;
      const cards = lowerFilterAt(noun.orCard, { ...noun, other: false }, false);
      if (!cards.ok) return cards;
      spec = {
        id,
        what: { kind: 'objectOrGraveyardCard', filter: permanents.value, card: cards.value },
        ...boundsOf(noun),
      };
    } else {
      // "return target nonland permanent card with mana value X or less from your graveyard ..., where X is ~'s power" (stage P68, D-230, CR 202.3, 601.2c):
      // the X the sentence defines becomes the limit of the filter, read as the targets are chosen.
      let atMost: ObjectFilter['manaValueAtMost'];
      let subject: IrNoun = noun;
      if (noun.filter.manaValueAtMostAmount !== undefined) {
        const missing = missingFeatures(['selector:manaValueAtMost']);
        if (missing.length > 0) return failure(noun, missing);
        const dynamic = noun.filter.manaValueAtMostAmount;
        if (dynamic.kind === 'manaValueOf') {
          // "with mana value less than or equal to that spell's mana value" (CR 202.3, 603.3d): the spell that caused a cast trigger, read as the targets are
          // chosen and again as the ability resolves (the engine's `manaValueOf` of the `triggerSubject`). No other object is the limit of a filter.
          if (!ctx.castTrigger) return failure(noun, []);
          const limit = objectRefOf(dynamic.of, ctx, { triggerSubject: true });
          if (!limit.ok) return limit;
          if (limit.value.kind !== 'triggerSubject') return failure(noun, []);
          atMost = { kind: 'manaValueOf', of: limit.value };
        } else if (dynamic.kind === 'countersOn') {
          // "with mana value less than or equal to the number of counters on that creature" (Puca's Covenant, CR 202.3, 122.1, 603.10a): the counters of the permanent the trigger
          // is about, as it last was, read as the targets are chosen and again as the ability resolves (the engine's `countersOn` of the `triggerSubject`).
          const blockedCounters = missingFeatures(['amount:countersOn']);
          if (blockedCounters.length > 0) return failure(noun, blockedCounters);
          const limit = objectRefOf(dynamic.of, ctx, { triggerSubject: true });
          if (!limit.ok) return limit;
          if (limit.value.kind !== 'triggerSubject') return failure(noun, []);
          atMost = {
            kind: 'countersOn',
            of: limit.value,
            ...(dynamic.counter === undefined ? {} : { counter: dynamic.counter }),
          };
        } else {
          if (dynamic.kind !== 'countOf' || typeof dynamic.of.filter.controller !== 'object') {
            return failure(noun, []);
          }
          const ownerNoun = dynamic.of.filter.controller.noun;
          if (ownerNoun.det !== 'controllerOf' || ownerNoun.of?.ref !== noun.ref) {
            return failure(noun, []);
          }
          const owner = playerSelectorOf(ownerNoun, ctx);
          if (!owner.ok) return owner;
          const { controller: _controller, ...countFilter } = dynamic.of.filter;
          void _controller;
          const counted = lowerFilter({ ...dynamic.of, filter: countFilter });
          if (!counted.ok) return counted;
          atMost = { kind: 'countOf', filter: { ...counted.value, owner: owner.value } };
        }
        const { manaValueAtMostAmount: _amount, ...rest } = noun.filter;
        void _amount;
        subject = { ...noun, filter: rest };
      }
      if (noun.filter.manaValueAtMostX === true && ctx.xIs === null && ctx.entersX) {
        // CR 107.3m (D2 group, Kinetic Ooze): "destroy up to one target artifact or enchantment with mana value X or less" in the enters trigger of the permanent itself: the X of the
        // spell it came from.
        const missing = missingFeatures(['selector:manaValueAtMost', 'amount:enteredX']);
        if (missing.length > 0) return failure(noun, missing);
        atMost = { kind: 'enteredX' };
        const { manaValueAtMostX: _x, ...rest } = noun.filter;
        void _x;
        subject = { ...noun, filter: rest };
      } else if (noun.filter.manaValueAtMostX === true) {
        const defined = ctx.xIs;
        if (defined === null) return failure(noun, []);
        const missing = missingFeatures(['selector:manaValueAtMost']);
        if (missing.length > 0) return failure(noun, missing);
        defined.used = true;
        const amount = defined.lower === undefined ? failure(noun, []) : defined.lower();
        if (!amount.ok) return amount;
        atMost = amount.value;
        const { manaValueAtMostX: _x, ...rest } = noun.filter;
        void _x;
        subject = { ...noun, filter: rest };
      }
      // "return another target permanent card ... from your graveyard" in the trigger of a creature that died (Puca's Covenant, CR 400.7, 603.10a, 109.1): "another" is besides the card
      // that creature became, which the permanent with the ability is not (it is no card in a graveyard).
      const exceptDying =
        ctx.deathOfOther &&
        subject.other &&
        subject.otherTarget !== true &&
        subject.filter.zone === 'graveyard';
      if (exceptDying) {
        const blockedExcept = missingFeatures(['selector:notTriggerCard']);
        if (blockedExcept.length > 0) return failure(noun, blockedExcept);
        subject = { ...subject, other: false };
      }
      const lowered = lowerFilter(subject);
      if (!lowered.ok) return lowered;
      const withExcept = exceptDying
        ? { ...lowered, value: { ...lowered.value, notTriggerCard: true as const } }
        : lowered;
      const filter =
        atMost === undefined
          ? withExcept
          : { ...withExcept, value: { ...withExcept.value, manaValueAtMost: atMost } };
      // "target creature with mana value X" (CR 107.3a, 601.2b): the spell announces the X its target is read against (`SpellText.x`).
      if (filter.value.manaValueX === true) ctx.usesX = true;
      // "for each opponent, exile up to one target ... that player controls" (stage P33, D-150, CR 115.1, 601.2c): one slot with at most one
      // target of each opponent, whose bounds are those of the slot ("up to one" for each).
      // "up to that many target creatures" (stage P41, D-188, CR 603.12): as many targets, at most, as the permanents the resolution that created
      // the reflexive ability sacrificed.
      if (noun.upToThatMany === true) {
        const blocked = missingFeatures(['selector:upToThatMany']);
        if (blocked.length > 0) return failure(noun, blocked);
      }
      // "tap up to X target nonland permanents, where X is the number of cards looked at while scrying this way" (D-513, CR 603.3d, 701.22): the number of the scry event, so
      // only the body of a trigger of a scry reads it, and the noun has no other count.
      if (noun.upToTriggerAmount === true) {
        const blocked = missingFeatures(['selector:upToTriggerAmount']);
        if (blocked.length > 0) return failure(noun, blocked);
        if (!ctx.scryTrigger || noun.det !== 'target') return failure(noun, []);
      }
      // "another target artifact or creature you control" after a first target (stage P64, D-217, CR 115.3): not the target of the slot before it.
      const apart = noun.otherTarget === true ? ctx.targets[ctx.targets.length - 1]?.id : undefined;
      if (noun.otherTarget === true && apart === undefined) return failure(noun, []);
      if (anyNumberTarget) {
        const blocked = missingFeatures(['selector:anyNumber']);
        if (blocked.length > 0) return failure(noun, blocked);
      }
      if (noun.differentControllers === true) {
        const blocked = missingFeatures(['selector:differentControllers']);
        if (blocked.length > 0) return failure(noun, blocked);
        // Only a slot of any number of objects says "with different controllers".
        if (!anyNumberTarget) return failure(noun, []);
      }
      let upToAmount: Amount | undefined;
      if (upToDefinedX) {
        const blocked = missingFeatures(['selector:upToAmount']);
        if (blocked.length > 0) return failure(noun, blocked);
        const defined = ctx.xIs;
        const lowered = defined?.lower === undefined ? failure(noun, []) : defined.lower();
        if (!lowered.ok) return lowered;
        if (defined !== null) defined.used = true;
        upToAmount = lowered.value;
      }
      if (countX) {
        const blocked = missingFeatures(['selector:countX']);
        if (blocked.length > 0) return failure(noun, blocked);
        // The X is read by the spell: the face announces it (`SpellText.x`).
        ctx.usesX = true;
      }
      spec = countX
        ? {
            id,
            what: { kind: 'object', filter: filter.value },
            countX: true,
            ...(noun.upTo ? { min: 0 } : {}),
          }
        : anyNumberTarget
          ? {
              id,
              what: { kind: 'object', filter: filter.value },
              anyNumber: true,
              ...(noun.differentControllers === true
                ? { differentControllers: true as const }
                : {}),
            }
          : noun.perOpponent === true
            ? { id, what: { kind: 'object', filter: filter.value }, onePerOpponent: true }
            : upToAmount !== undefined
              ? { id, what: { kind: 'object', filter: filter.value }, upToAmount }
              : noun.upToTriggerAmount === true
                ? { id, what: { kind: 'object', filter: filter.value }, upToTriggerAmount: true }
                : noun.upToThatMany === true
                  ? { id, what: { kind: 'object', filter: filter.value }, upToThatMany: true }
                  : {
                      id,
                      what: { kind: 'object', filter: filter.value },
                      ...boundsOf(noun),
                      ...(apart === undefined ? {} : { differentFrom: apart }),
                      // "a third target creature" (CR 115.3): also none of the targets of the slots before the nearest one.
                      ...(apart === undefined ||
                      noun.otherTargetAll !== true ||
                      ctx.targets.length < 2
                        ? {}
                        : { alsoDifferentFrom: ctx.targets.slice(0, -1).map((t) => t.id) }),
                    };
    }
    ctx.targets.push(spec);
  }
  return { ok: true, value: id, rule: noun.rule };
}

/**
 * What a bound pronoun stands for: a target (`t1`: "Destroy target creature. Tap it."), the
 * object itself (`self`), the trigger's subject or actor, or a noun mentioned earlier (`m1`, `b1`,
 * `t1.2`), which the engine cannot refer back to yet (`selector:bound`).
 */
function followed(noun: IrNoun): { target: string } | { self: true } | { needs: FeatureRef } {
  const ref = noun.ref ?? '';
  if (noun.det === 'triggerSubject') return { needs: 'selector:triggerSubject' };
  if (noun.det === 'triggerActor') return { needs: 'selector:triggerActor' };
  if (ref === 'self') return { self: true };
  if (/^t\d+$/.test(ref)) return { target: ref };
  return { needs: 'selector:bound' };
}

/**
 * `this`, `thisSpell` or a declared target: something an effect can name directly. With `triggerSubject`, also the
 * object whose event caused the trigger ("it" in "Whenever a creature you control enters, it deals damage ...",
 * stage P28, D-131): the amounts and the damage source read it; every other caller leaves it unread.
 */
export interface RefOptions {
  readonly triggerSubject?: boolean;
  /**
   * "It" may be the card the permanent became (stage P30, D-135, CR 400.7, 603.10a): in a trigger of `~` dying or leaving the
   * battlefield (`ctx.itIsCard`), the engine's `thisCard`, for the effects that move that card ("exile it", "put it into its
   * owner's library").
   */
  readonly thisCard?: boolean;
  /**
   * "It" may be the object that the last move put onto the battlefield (stage P30, D-135, CR 400.7): the engine's `moved`, for the
   * effects that act on it afterwards ("If it's an Angel, put two +1/+1 counters on it"). Amounts read a target as it was.
   */
  readonly moved?: boolean;
  /**
   * "That token" and "it" may be the token the instruction before made (stage P48, D-205, CR 111.2, 400.7j): the engine's `moved`, for the effects that act on
   * it afterwards ("That token gains haste until end of turn", "then attach ~ to it").
   */
  readonly token?: boolean;
  /**
   * "That creature" may be the permanent a sacrifice of the same text sacrificed (stage P36, D-178, CR 603.12, 608.2h): the engine's `sacrificed`,
   * read in an amount ("deals damage equal to that creature's power").
   */
  readonly sacrificed?: boolean;
  /**
   * "Those creatures" may be a group of "each" an earlier clause of the text named (D-517, CR 608.2c): the selector that clause lowered, read again as this effect runs (the
   * same group, since nothing between them changes who is in it). Only for the clauses that say it ("those creatures don't untap during ...").
   */
  readonly eachMention?: boolean;
}

export function objectRefOf(
  noun: IrNoun,
  ctx: LowerContext,
  options: RefOptions = {},
): LowerResult<ObjectRef> {
  if (options.thisCard === true && ctx.itIsCard && noun.det === 'triggerSubject') {
    return (
      gate(noun, ['selector:thisCard']) ?? {
        ok: true,
        value: { kind: 'thisCard' },
        rule: noun.rule,
      }
    );
  }
  // "Then if you control four or more lands, untap that land." (stage P36, D-178, CR 400.7j): the card a search found, the engine's `moved`.
  if (
    options.moved === true &&
    noun.det === 'anaphor' &&
    ctx.searched !== null &&
    noun.ref === ctx.searched
  ) {
    return (
      gate(noun, ['selector:moved']) ?? { ok: true, value: { kind: 'moved' }, rule: noun.rule }
    );
  }
  if (
    options.sacrificed === true &&
    noun.det === 'anaphor' &&
    ctx.sacrificedRef !== null &&
    noun.ref === ctx.sacrificedRef
  ) {
    return (
      gate(noun, ['selector:sacrificed']) ?? {
        ok: true,
        value: { kind: 'sacrificed' },
        rule: noun.rule,
      }
    );
  }
  // "That token gains haste until end of turn", "then attach ~ to it" (stage P48, D-205, CR 400.7j): the token the instruction before made, the engine's `moved`.
  if (
    options.token === true &&
    noun.det === 'anaphor' &&
    ctx.madeToken !== null &&
    noun.ref === ctx.madeToken
  ) {
    return (
      gate(noun, ['selector:moved']) ?? { ok: true, value: { kind: 'moved' }, rule: noun.rule }
    );
  }
  if (noun.det === 'anaphor' || noun.det === 'triggerSubject') {
    if (noun.det === 'anaphor' && noun.ref !== undefined && ctx.chosenObjectRefs.has(noun.ref)) {
      return (
        gate(noun, ['selector:chosen']) ?? {
          ok: true,
          value: { kind: 'chosen', id: noun.ref },
          rule: noun.rule,
        }
      );
    }
    const to = followed(noun);
    if ('needs' in to) {
      if (options.triggerSubject === true && noun.det === 'triggerSubject') {
        return (
          gate(noun, [to.needs]) ?? { ok: true, value: { kind: 'triggerSubject' }, rule: noun.rule }
        );
      }
      return gate(noun, [to.needs]) ?? failure(noun, []);
    }
    if ('self' in to) return objectRefOf({ ...noun, det: 'self' }, ctx);
    const blocked = gate(noun, ['selector:target']);
    if (blocked !== null) return blocked;
    // D-270: "them" of a slot of targets in two zones names permanents and cards of graveyards, which the engine moves only in the exile that names the slot.
    if (ctx.targets.some((t) => t.id === to.target && t.what.kind === 'objectOrGraveyardCard')) {
      return failure(noun, []);
    }
    // After an instruction that put this target onto the battlefield "it" is the new object (CR 400.7): the engine's `moved`.
    if (options.moved === true && ctx.movedOnto === to.target)
      return { ok: true, value: { kind: 'moved' }, rule: noun.rule };
    return { ok: true, value: { kind: 'target', id: to.target }, rule: noun.rule };
  }
  // "Tap enchanted creature", "unless that player is the monarch" (stage P31, D-139, CR 303.4b, 301.5a): the permanent the Aura or
  // Equipment with the ability is attached to, the engine's `attached`. Only on a face of that kind, and only a creature host.
  if (noun.det === 'enchanted' || noun.det === 'equipped') {
    const needed = noun.det === 'enchanted' ? 'Aura' : 'Equipment';
    const types = noun.filter.types ?? [];
    if (
      !ctx.faceSubtypes.includes(needed) ||
      types.length !== 1 ||
      types[0] !== 'creature' ||
      (noun.filter.supertypes?.length ?? 0) > 0
    ) {
      return failure(noun, []);
    }
    return (
      gate(noun, ['selector:attached']) ?? {
        ok: true,
        value: { kind: 'attached' },
        rule: noun.rule,
      }
    );
  }
  // "The exiled card" (stage P32, D-147, CR 607.2a): what the linked ability of this permanent exiled (Hideaway), the engine's `linkedExile`.
  if (noun.det === 'linkedExile') {
    return { ok: true, value: { kind: 'linkedExile' }, rule: noun.rule };
  }
  if (noun.det === 'sacrificed') {
    return (
      gate(noun, ['selector:sacrificedCost']) ?? {
        ok: true,
        value: { kind: 'sacrificedCost' },
        rule: noun.rule,
      }
    );
  }
  // "Return this card to its owner's hand" (stage P33, D-150, CR 400.7): the card of the source of the ability, wherever it is.
  if (noun.det === 'thisCard') {
    return (
      gate(noun, ['selector:thisCard']) ?? {
        ok: true,
        value: { kind: 'thisCard' },
        rule: noun.rule,
      }
    );
  }
  if (noun.det === 'self') {
    const kind = ctx.owner === 'spell' ? 'thisSpell' : 'this';
    return gate(noun, [`selector:${kind}`]) ?? { ok: true, value: { kind }, rule: noun.rule };
  }
  if (noun.det === 'target' && noun.filter.player === undefined) {
    const need = noun.filter.anyTarget === true ? 'selector:anyTarget' : 'selector:target';
    const blocked = gate(noun, [need]);
    if (blocked !== null) return blocked;
    const id = declareTarget(noun, ctx);
    return id.ok ? { ok: true, value: { kind: 'target', id: id.value }, rule: noun.rule } : id;
  }
  return failure(noun, []);
}

/** The objects a noun names: an `ObjectRef`, or "each" of a filter. */
export function objectSelectorOf(
  noun: IrNoun,
  ctx: LowerContext,
  options: RefOptions = {},
): LowerResult<ObjectSelector> {
  // D-517: "those creatures" after "tap all creatures target player controls": the group the text named, as it was lowered.
  // Only the plural pronoun ("those creatures") names the group back: "it" after "each creature" is one of them, which the engine cannot name (issue 160, D-627).
  if (options.eachMention === true && noun.det === 'anaphor' && noun.plural) {
    const mentioned = noun.ref === undefined ? undefined : ctx.eachMentions.get(noun.ref);
    if (mentioned !== undefined) return { ok: true, value: mentioned, rule: noun.rule };
  }
  const selector = selectorOf(noun, ctx, options);
  if (selector.ok && noun.det === 'each' && noun.ref !== undefined) {
    ctx.eachMentions.set(noun.ref, selector.value);
  }
  return selector;
}

function selectorOf(
  noun: IrNoun,
  ctx: LowerContext,
  options: RefOptions = {},
): LowerResult<ObjectSelector> {
  if (noun.det === 'each') {
    const blocked = gate(noun, ['selector:each']);
    if (blocked !== null) return blocked;
    // "Each creature that player controls" (stage P37, D-180, CR 109.4): the filter names the player by reference, the engine's `controlledBy`, read
    // here where the targets are known (`lowerFilter` alone refuses it).
    // "Each creature with power greater than target creature's power" (CR 208.1, 608.2c): the filter names the target by reference, the engine's `powerGreaterThan`.
    const powerNoun = noun.filter.powerGreaterThanNoun;
    if (powerNoun !== undefined) {
      const refused = gate(noun, ['selector:powerGreaterThan']);
      if (refused !== null) return refused;
      if (typeof noun.filter.controller === 'object') return failure(noun, []);
      const named = selectorOf(powerNoun, ctx);
      if (!named.ok) return named;
      if (named.value.kind !== 'target') return failure(powerNoun, []);
      const { powerGreaterThanNoun: _bound, ...rest } = noun.filter;
      const plain = lowerFilterAt(rest, noun, false);
      if (!plain.ok) return plain;
      return {
        ok: true,
        value: { kind: 'each', filter: { ...plain.value, powerGreaterThan: named.value } },
        rule: noun.rule,
      };
    }
    const controller = noun.filter.controller;
    if (typeof controller === 'object') {
      const refused = gate(noun, ['selector:controllerRef']);
      if (refused !== null) return refused;
      const named = playerSelectorOf(controller.noun, ctx);
      if (!named.ok) return named;
      // "that player or that planeswalker's controller" (stage P47, D-200): the player the target is, or the controller of the planeswalker it is.
      const player: LowerResult<PlayerSelector> =
        controller.orPlaneswalkerController === true && named.value.kind === 'target'
          ? {
              ok: true,
              value: {
                kind: 'all',
                of: [
                  named.value,
                  { kind: 'controllerOf', of: { kind: 'target', id: named.value.id } },
                ],
              },
              rule: named.rule,
            }
          : named;
      const { controller: _bound, ...rest } = noun.filter;
      const plain = lowerFilterAt(rest, noun, false);
      if (!plain.ok) return plain;
      return {
        ok: true,
        value: { kind: 'each', filter: { ...plain.value, controlledBy: player.value } },
        rule: noun.rule,
      };
    }
    // "Creatures named ~" (Prismari deck group 2, D-656, CR 201.2): every creature with the card's own name, whoever controls it, as the effect begins.
    if (noun.filter.namedSelf === true) {
      const blockedName = gate(noun, ['selector:named']);
      if (blockedName !== null) return blockedName;
      // The tilde is the card's whole name only when the card has no shorter name for it (a legendary "Rootha" is `~` as well): a text that may name either is refused.
      if (ctx.selfName === '' || ctx.selfName !== ctx.cardName || noun.of !== undefined) {
        return failure(noun, []);
      }
      const { namedSelf: _named, ...rest } = noun.filter;
      const plain = lowerFilterAt(rest, noun, false);
      if (!plain.ok) return plain;
      return {
        ok: true,
        value: { kind: 'each', filter: { ...plain.value, named: ctx.selfName } },
        rule: noun.rule,
      };
    }
    // "Destroy each nonland permanent with mana value X or less" (CR 107.3a, 202.3): the limit is the X announced for the spell (or the X the sentence defines), read as the
    // effect resolves; the flag is replaced by the engine's `manaValueAtMost`.
    let eachLimit: ObjectFilter['manaValueAtMost'];
    let eachNoun = noun;
    if (noun.filter.manaValueAtMostX === true) {
      const refused = gate(noun, ['selector:manaValueAtMost']);
      if (refused !== null) return refused;
      const defined = ctx.xIs;
      if (defined === null) {
        ctx.usesX = true;
        eachLimit = { kind: 'x' };
      } else {
        defined.used = true;
        const amount = defined.lower === undefined ? failure(noun, []) : defined.lower();
        if (!amount.ok) return amount;
        eachLimit = amount.value;
      }
      const { manaValueAtMostX: _x, ...rest } = noun.filter;
      void _x;
      eachNoun = { ...noun, filter: rest };
    }
    const lowered = lowerFilter(eachNoun);
    if (!lowered.ok) return lowered;
    const filter =
      eachLimit === undefined
        ? lowered
        : { ...lowered, value: { ...lowered.value, manaValueAtMost: eachLimit } };
    // "Target player's graveyard": the cards in it, selected by their owner (CR 108.3, 404.1).
    if (noun.of !== undefined) {
      const owned = gate(noun, ['selector:ownerRef']);
      if (owned !== null) return owned;
      const owner = playerSelectorOf(noun.of, ctx);
      if (!owner.ok) return owner;
      return {
        ok: true,
        value: { kind: 'each', filter: { ...filter.value, owner: owner.value } },
        rule: noun.rule,
      };
    }
    // D-650 (CR 508.1b): "each other creature that's attacking one of your opponents" in an ability that triggers on a creature: the other is the creature the trigger is
    // about (the one enchanted, for an Aura), not the source of the ability.
    if (noun.other && noun.filter.attackingOpponents === 'players' && options.triggerSubject) {
      const { other: _source, ...rest } = filter.value;
      return {
        ok: true,
        value: { kind: 'each', filter: rest, except: { kind: 'triggerSubject' } },
        rule: noun.rule,
      };
    }
    return { ok: true, value: { kind: 'each', filter: filter.value }, rule: noun.rule };
  }
  return objectRefOf(noun, ctx, options);
}

/** The players a noun names. */
export function playerSelectorOf(noun: IrNoun, ctx: LowerContext): LowerResult<PlayerSelector> {
  const ok = (value: PlayerSelector): LowerResult<PlayerSelector> => ({
    ok: true,
    value,
    rule: noun.rule,
  });
  const need = SELECTOR_NEEDS[noun.det];
  switch (noun.det) {
    case 'you':
    case 'eachPlayer':
    case 'eachOpponent': {
      // "its owner draws that many cards and each other player loses that much life" (Oft-Nabbed Goat, CR 102.1): every player but the one the instruction before it was said of, when that
      // is a player the text names by an object or a target (after "you", "each other player" is "each opponent").
      if (
        noun.det === 'eachOpponent' &&
        /^each other player$/iu.test(noun.filter.raw.trim()) &&
        (ctx.lastPlayer?.kind === 'ownerOf' ||
          ctx.lastPlayer?.kind === 'controllerOf' ||
          ctx.lastPlayer?.kind === 'target')
      ) {
        const blockedExcept = gate(noun, ['selector:eachPlayerExcept']);
        return blockedExcept ?? ok({ kind: 'eachPlayerExcept', except: ctx.lastPlayer });
      }
      // "Each other opponent" (stage P34, D-152, CR 102.2): the opponents but the player the event of the trigger is about.
      if (noun.det === 'eachOpponent' && noun.other) {
        const blockedOther = gate(noun, ['selector:eachOtherOpponent']);
        return blockedOther ?? ok({ kind: 'eachOtherOpponent' });
      }
      const blocked = gate(noun, need === undefined ? [] : [need]);
      return blocked ?? ok({ kind: noun.det });
    }
    case 'target': {
      if (noun.filter.player === undefined) return failure(noun, []);
      const blocked = gate(noun, ['selector:target']);
      if (blocked !== null) return blocked;
      const id = declareTarget(noun, ctx);
      return id.ok ? ok({ kind: 'target', id: id.value }) : id;
    }
    case 'defendingPlayer': {
      const blocked = gate(noun, need === undefined ? [] : [need]);
      return blocked ?? ok({ kind: 'defendingPlayer' });
    }
    case 'playerToRight': {
      const blocked = gate(noun, need === undefined ? [] : [need]);
      return blocked ?? ok({ kind: 'playerToYourRight' });
    }
    case 'discardedThisWay': {
      const blocked = gate(noun, need === undefined ? [] : [need]);
      return blocked ?? ok({ kind: 'discardedThisWay' });
    }
    case 'couldntSacrificeThisWay': {
      // CR 701.21a: only after a sacrifice of the same text, whose players it names.
      if (ctx.thisWay !== 'sacrificed') return failure(noun, []);
      const blocked = gate(noun, need === undefined ? [] : [need]);
      return blocked ?? ok({ kind: 'couldntSacrificeThisWay' });
    }
    case 'attackedPlayers': {
      // D-269 (CR 508.6): the permanent of the ability, which `~` is: only an ability of a permanent has attacked.
      if (ctx.owner !== 'ability') return failure(noun, []);
      const blocked = gate(noun, need === undefined ? [] : [need]);
      return blocked ?? ok({ kind: 'attackedPlayers', of: { kind: 'this' } });
    }
    case 'combatDamagedByNamed': {
      // CR 120.2a, 510.2: the creature is named like the card of the ability (`~`), so the name is the one the text is of.
      // The tilde is the name the text wrote: the short name it used, or the whole name when it said "named" and then that (a card with a short name too, "Gollum, Obsessed Stalker").
      const name = ctx.selfName !== '' ? ctx.selfName : ctx.namedWholeName ? ctx.cardName : '';
      if (name === '') return failure(noun, []);
      const blocked = gate(noun, need === undefined ? [] : [need]);
      return blocked ?? ok({ kind: 'combatDamagedByNamed', name });
    }
    case 'players': {
      // D-131: "you and target opponent each draw two cards": several players at once, each acting once, in the
      // order of CR 101.4. The members are player nouns of their own.
      const blocked = gate(noun, need === undefined ? [] : [need]);
      if (blocked !== null) return blocked;
      const of: PlayerSelector[] = [];
      for (const member of noun.members ?? []) {
        const selector = playerSelectorOf(member, ctx);
        if (!selector.ok) return selector;
        of.push(selector.value);
      }
      // D-269: a list that names the same player twice is not "you and that player" ("that player" of your own end step is you): refused, not read as one.
      if (new Set(of.map((selector) => JSON.stringify(selector))).size < of.length) {
        return failure(noun, []);
      }
      return of.length < 2 ? failure(noun, []) : ok({ kind: 'all', of });
    }
    case 'controllerOf':
    case 'ownerOf': {
      // "Its controller": the controller of the object the pronoun stands for (CR 109.4), read
      // from its last known information when it has left (CR 608.2h).
      if (noun.of === undefined) return failure(noun, []);
      const blocked = gate(
        noun,
        noun.det === 'controllerOf'
          ? [
              ...(need === undefined ? [] : [need]),
              'selector:controllerOf',
              'selector:controllerRef',
            ]
          : need === undefined
            ? []
            : [need],
      );
      if (blocked !== null) return blocked;
      // D-111: "its controller", "that creature's owner" in a trigger: the object whose event caused it,
      // read from last-known information when it is gone (CR 608.2h).
      if (noun.of.det === 'triggerSubject') {
        const subject = gate(noun.of, ['selector:triggerSubject']);
        return subject ?? ok({ kind: noun.det, of: { kind: 'triggerSubject' } });
      }
      const of = objectRefOf(noun.of, ctx);
      return of.ok ? ok({ kind: noun.det, of: of.value }) : of;
    }
    case 'anaphor':
    case 'triggerActor': {
      // Death Toll deck, group C: "If they don't, they lose 3 life" after "Each opponent may discard a card": the player who declined.
      if (
        noun.det === 'anaphor' &&
        ctx.declinedPlayer &&
        /^(?:they|that player)$/iu.test(noun.filter.raw.trim())
      ) {
        return ok({ kind: 'declinedPlayer' });
      }
      // D-648: "that opponent" of a trigger about a player attacking one of your opponents is the player attacked (any other trigger: the player the trigger names, below).
      if (/^that opponent$/iu.test(noun.filter.raw.trim()) && ctx.attackedPlayer !== null) {
        return gate(noun, ctx.attackedPlayer.needs) ?? ok(ctx.attackedPlayer.selector);
      }
      // "That player" in a trigger about a player's action (stage P18): the player the trigger names.
      if (noun.det === 'triggerActor' || noun.ref === 'trigActor') {
        if (ctx.thatPlayer === null)
          return gate(noun, ['selector:triggerActor']) ?? failure(noun, []);
        const blocked = gate(noun, ctx.thatPlayer.needs);
        return blocked ?? ok(ctx.thatPlayer.selector);
      }
      const to = followed(noun);
      if ('needs' in to) return gate(noun, [to.needs]) ?? failure(noun, []);
      if ('target' in to && /^t\d+$/.test(to.target)) {
        const known = ctx.targets.find((t) => t.id === to.target);
        // "that player" can only mean a player the ability already targets.
        if (known?.what.kind !== 'player' && known?.what.kind !== 'playerOrObject') {
          return failure(noun, []);
        }
        const blocked = gate(noun, ['selector:target']);
        return blocked ?? ok({ kind: 'target', id: to.target });
      }
      return failure(noun, []);
    }
    default:
      return failure(noun, []);
  }
}

/** Damage may go to an object or a player (CR 120.2): "any target" is both. */
export function recipientOf(
  noun: IrNoun,
  ctx: LowerContext,
): LowerResult<ObjectSelector | PlayerSelector> {
  const asPlayer =
    noun.det === 'you' ||
    noun.det === 'eachPlayer' ||
    noun.det === 'eachOpponent' ||
    noun.det === 'triggerActor' ||
    noun.det === 'controllerOf' ||
    (noun.det === 'anaphor' && /^that (?:player|opponent)$/iu.test(noun.filter.raw)) ||
    (noun.det === 'target' && noun.filter.player !== undefined);
  if (asPlayer) return playerSelectorOf(noun, ctx);
  return objectSelectorOf(noun, ctx);
}

/**
 * "The player or planeswalker it's attacking" (stage P31, D-140, CR 508.1b): what the creature "it" names attacks, the engine's
 * `attackedBy`. "It" is the permanent the ability belongs to (a pronoun the binding pass made `~`).
 */
export function attackedByOf(noun: IrNoun, ctx: LowerContext): LowerResult<AttackedBySelector> {
  if (noun.det !== 'attackedBy' || noun.of === undefined) return failure(noun, []);
  const blocked = gate(noun, ['selector:attackedBy']);
  if (blocked !== null) return blocked;
  const of = objectRefOf(noun.of, ctx);
  if (!of.ok) return of;
  if (of.value.kind !== 'this') return failure(noun, []);
  return { ok: true, value: { kind: 'attackedBy', of: of.value }, rule: noun.rule };
}
