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
  // Stage P33 (D-150): "this card".
  thisCard: 'selector:thisCard',
  // Stage P52 (D-210): "each player who discarded a card this way".
  discardedThisWay: 'selector:discardedThisWay',
  // D-921: "each player ~ attacked this turn" (CR 508.6).
  attackedPlayers: 'selector:attackedPlayers',
};

/** Features a noun can need beyond its selector kind. */
export const NOUN_EXTRA_NEEDS: readonly FeatureRef[] = [
  'selector:chosenType',
  'selector:chosenColor',
  'selector:thisSpell',
  'selector:anyTarget',
  'selector:anyOf',
  'selector:controllerRef',
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
  'selector:keywords',
  'selector:triggerPlayer',
  'selector:sacrificedCost',
  'selector:thisCard',
  'selector:anyNumber',
  'selector:atLeastOne',
  'selector:upToThatMany',
  'selector:greatest',
  'selector:giftRecipient',
  'selector:attacking',
  'selector:colorCount',
  'selector:manaValueX',
  'selector:controllerDamagedBySource',
  'selector:attackedBy',
  'selector:hasCounter',
  'selector:commander',
  'selector:enteredThisTurn',
  'selector:sharesCreatureTypeWith',
  'selector:eachOtherOpponent',
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

function lowerFilterAt(filter: IrFilter, noun: IrNoun, inner: boolean): LowerResult<ObjectFilter> {
  const rule = noun.rule;
  const bad = (needs: readonly FeatureRef[]): LowerResult<ObjectFilter> => ({
    ok: false,
    needs,
    at: noun.span,
    rule,
  });
  if (typeof filter.controller === 'object') return bad(['selector:controllerRef']);
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
  let anyOf: ObjectFilter[] | undefined;
  if (filter.anyOf !== undefined) {
    const missing = missingFeatures(['selector:anyOf']);
    if (missing.length > 0) return bad(missing);
    anyOf = [];
    for (const member of filter.anyOf) {
      const lowered = lowerFilterAt(member, noun, true);
      if (!lowered.ok) return lowered;
      anyOf.push(lowered.value);
    }
  }
  // D-100: "of the chosen type" reads the choice the source made as it entered (CR 607.2d).
  let chosen: { chosenType: true } | { chosenColor: true } | Record<string, never> = {};
  if (filter.chosen !== undefined) {
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
  const keywordsOf = (words: readonly string[] | undefined): Keyword['kind'][] | null => {
    const kinds: Keyword['kind'][] = [];
    for (const word of words ?? []) {
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
  if (filter.colorCount !== undefined) parts.push('selector:colorCount');
  // "With mana value X" and "whose controller was dealt combat damage by ~ this turn" read the ability that resolves (its X, its
  // source): the engine reads them in the `each` selector of an effect only, so a target or a member of a choice is not lowered.
  const resolving = filter.manaValueX === true || filter.controllerDamagedBySource === true;
  if (resolving && (inner || noun.det !== 'each')) return bad([]);
  if (filter.manaValueX === true) parts.push('selector:manaValueX');
  if (filter.controllerDamagedBySource === true) parts.push('selector:controllerDamagedBySource');
  // D-145 (stage P32): "with a counter on it" (CR 122.1) and "commander" (CR 903.3).
  if (filter.hasCounter !== undefined) parts.push('selector:hasCounter');
  if (filter.commander !== undefined) parts.push('selector:commander');
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
  // Group 4 of the Vraska deck: "that entered this turn" (CR 400.7), read where the filter is matched against the game (a target slot, an `each` selector).
  if (filter.enteredThisTurn === true) {
    if (inner) return bad([]);
    parts.push('selector:enteredThisTurn');
  }
  // D-262: "that share a land type" is a condition on the cards found together, which a filter of one card cannot say: the search lowering takes it off first.
  if (filter.sharedLandType === true) return bad([]);
  // D-261: "that shares a creature type with it" (CR 205.3m, 603.10a): the creature a "dies" trigger is about; the engine refuses it anywhere but the filter of a `revealUntil`
  // of such a trigger (`validateCard`).
  if (filter.sharesCreatureTypeWithIt === true) parts.push('selector:sharesCreatureTypeWith');
  // D-181 (stage P38): "with a single target" (CR 115.9a), a spell or ability on the stack (a target slot, never a member of a choice).
  if (filter.singleTarget === true) {
    if (inner || filter.zone !== 'stack') return bad([]);
    parts.push('selector:singleTarget');
  }
  // D-206 (stage P49): "that targets a creature" (CR 115.1, 601.2c), a spell on the stack (a cast trigger's filter or a target slot).
  let targetsObject: ObjectFilter | undefined;
  if (filter.targets !== undefined) {
    if (inner || (filter.zone !== 'stack' && filter.stackKind === undefined)) return bad([]);
    parts.push('selector:targetsObject');
    const aimed = lowerFilterAt(filter.targets, noun, true);
    if (!aimed.ok) return aimed;
    targetsObject = aimed.value;
  }
  const missingParts = missingFeatures(parts);
  if (missingParts.length > 0) return bad(missingParts);
  // D-131: "creatures attacking you" (CR 508.1b): the attackers whose attack target is the controller as a player.
  if (filter.attackingYou === true) {
    const missing = missingFeatures(['selector:attackingYou']);
    if (missing.length > 0) return bad(missing);
  }
  if (filter.attackingOrBlocking === true) {
    const missing = missingFeatures(['selector:attackingOrBlocking']);
    if (missing.length > 0) return bad(missing);
  }
  if (filter.attackingOpponents === true) {
    const missing = missingFeatures(['selector:attackingOpponents']);
    if (missing.length > 0) return bad(missing);
  }
  // "with mana value X or less" (stage P68, D-230): only a target reads it, and `declareTarget` takes the flag off once it has the amount (a filter that still has it is
  // not lowered: an `each` selector or a member would drop the limit).
  if (filter.manaValueAtMostX === true) return bad([]);
  // "historic" (stage P68, D-230, CR 700.6): an artifact, a legendary permanent or a Saga.
  let anyOfFinal = anyOf;
  if (filter.historic === true) {
    if (anyOf !== undefined) return bad([]);
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
    ...(filter.attackingYou === true && !inner ? { attackingYou: true as const } : {}),
    ...(filter.attackingOpponents === true && !inner ? { attackingOpponents: true as const } : {}),
    ...(filter.attackingOrBlocking === true ? { attackingOrBlocking: true as const } : {}),
    ...(filter.attacking === true ? { attacking: true as const } : {}),
    ...(filter.colorCount === undefined
      ? {}
      : { colorCount: { cmp: filter.colorCount.cmp, value: filter.colorCount.value } }),
    ...(filter.hasCounter === undefined ? {} : { hasCounter: filter.hasCounter }),
    ...(filter.commander === undefined ? {} : { commander: filter.commander }),
    ...(filter.manaValueX === true ? { manaValueX: true as const } : {}),
    ...(filter.controllerDamagedBySource === true
      ? { controllerDealtDamageBySource: true as const }
      : {}),
    ...(filter.putFromBattlefieldThisTurn === true
      ? { putFromBattlefieldThisTurn: true as const }
      : {}),
    ...(filter.notCastFromHand === true ? { notCastFromHand: true as const } : {}),
    ...(filter.enteredThisTurn === true ? { enteredThisTurn: true as const } : {}),
    ...(filter.singleTarget === true ? { singleTarget: true as const } : {}),
    ...(filter.sharesCreatureTypeWithIt === true
      ? { sharesCreatureTypeWith: 'triggerSubject' as const }
      : {}),
    ...(targetsObject === undefined ? {} : { targetsObject }),
    ...compared,
    ...chosen,
    ...(anyOfFinal === undefined ? {} : { anyOf: anyOfFinal }),
  };
  return { ok: true, value, rule };
}

/** An IR filter as the engine's ObjectFilter. */
export function lowerFilter(noun: IrNoun): LowerResult<ObjectFilter> {
  return lowerFilterAt(noun.filter, noun, false);
}

/** How many targets a noun takes, as the TargetSpec bounds ("two target creatures"). */
function boundsOf(noun: IrNoun): { min?: number; max?: number } {
  const n = noun.count?.kind === 'number' ? noun.count.value : 1;
  if (noun.upTo) return { min: 0, max: n };
  return n > 1 ? { min: n, max: n } : {};
}

/**
 * Declares the one targets slot of a spell that divides damage as it is cast (stage P32, D-147, CR 601.2d): "any number of target
 * creatures" (no fewest or most: at most as many as the total, each needing 1) or "up to three target creatures", with the total read
 * once as the spell is cast (`divide`). The kind of permanent is an object filter; any other target is not divided.
 */
export function declareDividedTarget(
  noun: IrNoun,
  ctx: LowerContext,
  total: Amount,
): LowerResult<string> {
  const id = noun.ref;
  if (id === undefined || noun.det !== 'target' || noun.filter.player !== undefined) {
    return failure(noun, []);
  }
  if (noun.filter.anyTarget === true || ctx.targets.some((t) => t.id === id)) {
    return failure(noun, []);
  }
  const filter = lowerFilter(noun);
  if (!filter.ok) return filter;
  const bounds = noun.anyNumber === true ? {} : boundsOf(noun);
  ctx.targets.push({
    id,
    what: { kind: 'object', filter: filter.value },
    ...bounds,
    divide: { total },
  });
  return { ok: true, value: id, rule: noun.rule };
}

/** Declares the target of a bound target noun once, and returns its id. */
function declareTarget(noun: IrNoun, ctx: LowerContext): LowerResult<string> {
  const id = noun.ref;
  if (id === undefined) return failure(noun, []);
  // "Any number of target creatures" has no bounds of its own: a divided damage reads it (`declareDividedTarget`), and an effect that takes any number of
  // targets (stage P74, D-234: "any number of other target creatures you control phase out") has the slot `anyNumber`.
  const anyNumberTarget = noun.anyNumber === true && noun.det === 'target';
  if (anyNumberTarget && noun.filter.player !== undefined) return failure(noun, []);
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
      spec = { id, what: { kind: 'player', filter: noun.filter.player }, ...boundsOf(noun) };
    } else if (noun.orCard !== undefined) {
      // "up to three other target creatures from the battlefield and/or creature cards from graveyards" (D-931, CR 115.1): the engine's slot of two zones. The text of a
      // spell has no such slot (the engine reads it in a triggered ability only), and nothing else about the noun may be set that the slot does not say.
      if (ctx.owner === 'spell') return failure(noun, []);
      if (
        noun.upToThatMany === true ||
        anyNumberTarget ||
        noun.perOpponent === true ||
        noun.otherTarget === true ||
        noun.atLeastOne === true ||
        noun.greatest !== undefined ||
        noun.filter.manaValueAtMostX === true ||
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
      if (noun.filter.manaValueAtMostX === true) {
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
      const lowered = lowerFilter(subject);
      if (!lowered.ok) return lowered;
      const filter =
        atMost === undefined
          ? lowered
          : { ...lowered, value: { ...lowered.value, manaValueAtMost: atMost } };
      // "for each opponent, exile up to one target ... that player controls" (stage P33, D-150, CR 115.1, 601.2c): one slot with at most one
      // target of each opponent, whose bounds are those of the slot ("up to one" for each).
      // "up to that many target creatures" (stage P41, D-188, CR 603.12): as many targets, at most, as the permanents the resolution that created
      // the reflexive ability sacrificed.
      if (noun.upToThatMany === true) {
        const blocked = missingFeatures(['selector:upToThatMany']);
        if (blocked.length > 0) return failure(noun, blocked);
      }
      // "another target artifact or creature you control" after a first target (stage P64, D-217, CR 115.3): not the target of the slot before it.
      const apart = noun.otherTarget === true ? ctx.targets[ctx.targets.length - 1]?.id : undefined;
      if (noun.otherTarget === true && apart === undefined) return failure(noun, []);
      if (anyNumberTarget) {
        const blocked = missingFeatures(['selector:anyNumber']);
        if (blocked.length > 0) return failure(noun, blocked);
      }
      spec = anyNumberTarget
        ? { id, what: { kind: 'object', filter: filter.value }, anyNumber: true }
        : noun.perOpponent === true
          ? { id, what: { kind: 'object', filter: filter.value }, onePerOpponent: true }
          : noun.upToThatMany === true
            ? { id, what: { kind: 'object', filter: filter.value }, upToThatMany: true }
            : {
                id,
                what: { kind: 'object', filter: filter.value },
                ...boundsOf(noun),
                ...(apart === undefined ? {} : { differentFrom: apart }),
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
    // D-931: "them" of a slot of targets in two zones names permanents and cards of graveyards, which the engine moves only in the exile that names the slot.
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
  if (noun.det === 'each') {
    const blocked = gate(noun, ['selector:each']);
    if (blocked !== null) return blocked;
    // "Each creature that player controls" (stage P37, D-180, CR 109.4): the filter names the player by reference, the engine's `controlledBy`, read
    // here where the targets are known (`lowerFilter` alone refuses it).
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
    const filter = lowerFilter(noun);
    if (!filter.ok) return filter;
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
    case 'discardedThisWay': {
      const blocked = gate(noun, need === undefined ? [] : [need]);
      return blocked ?? ok({ kind: 'discardedThisWay' });
    }
    case 'attackedPlayers': {
      // D-921 (CR 508.6): the permanent of the ability, which `~` is: only an ability of a permanent has attacked.
      if (ctx.owner !== 'ability') return failure(noun, []);
      const blocked = gate(noun, need === undefined ? [] : [need]);
      return blocked ?? ok({ kind: 'attackedPlayers', of: { kind: 'this' } });
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
      // D-921: a list that names the same player twice is not "you and that player" ("that player" of your own end step is you): refused, not read as one.
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
      const blocked = gate(noun, need === undefined ? [] : [need]);
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
    (noun.det === 'anaphor' && noun.filter.raw.toLowerCase() === 'that player') ||
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
