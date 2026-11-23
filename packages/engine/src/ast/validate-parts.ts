/**
 * Building blocks of AST validation (SPEC 17.2 A7, D-007): filters, target declarations,
 * selectors, amounts, costs and effects. `validate.ts` composes these for abilities, spells and
 * cards. Nothing here mutates its input; every function appends to an issue list.
 */
import { TOKEN_PRESETS } from '../cards/tokens';
import { CARD_TYPES, COLORS, isNonCreatureSubtype, SUPERTYPES } from '../characteristics';
import { FILTERABLE_KEYWORDS } from './features';
import type {
  Ability,
  Amount,
  AttachedTo,
  AttackedBySelector,
  ChooseSelector,
  Condition,
  Cost,
  Effect,
  ModeChoice,
  ObjectFilter,
  ObjectRef,
  ObjectSelector,
  PlayerSelector,
  PtAmount,
  SacrificeSelector,
  SpellMode,
  TargetSpec,
  ThisWayKind,
  TokenDefinition,
  TokenPreset,
} from './types';
import { COMBAT_STEPS, ZONES } from './types';
import { type AstIssue, isCount, isOneOf, issue, kindOf, type Out } from './validate-base';
import { chosenIssues } from './validate-chosen';
import { checkDelayedTrigger, checkEngineOnlyEffect } from './validate-later';
import { checkManaAbilityAlso, checkManaProduction, checkManaSymbols } from './validate-mana';

export {
  type AstIssue,
  checkManaAbilityAlso,
  checkManaProduction,
  checkManaSymbols,
  isCount,
  issue,
};

export type TargetKind = TargetSpec['what']['kind'];

/** What a selector may refer to at one point in the tree. */
export interface Scope {
  /** 'this' is legal only in abilities; 'thisSpell' only in spell text. */
  readonly owner: 'ability' | 'spell';
  /** Target specs declared on the same ability or spell mode, by id. */
  readonly targets: ReadonlyMap<string, TargetKind>;
  /** Resolving choices already made earlier in a sequence. */
  readonly chosenObjects?: ReadonlySet<string>;
  /** The `otherwise` branch of a playersMay can refer to the player whose choice was declined. */
  readonly declinedPlayer?: boolean;
  /** The players a gainLife/loseLife names: "a third of their life" may read the life of exactly these, each as it applies (issue 497). */
  readonly lifeAffected?: PlayerSelector;
  /** Whether the kind 'x' amount has an X to read (an X in the cost or a spell with X). */
  readonly xAllowed: boolean;
  /** Validates an ability nested in the tree, such as one a token carries (set by validate.ts). */
  readonly checkAbility: (a: Ability, path: string, out: AstIssue[]) => void;
  /** Validates a continuous-effect node (validate-continuous.ts, set by validate.ts). */
  readonly checkContinuous: (
    e: Extract<
      Effect,
      {
        kind:
          | 'modifyPt'
          | 'setPt'
          | 'loseAllAbilities'
          | 'loseHexproofShroud'
          | 'setTypes'
          | 'setColors'
          | 'grantKeyword'
          | 'grantAbility'
          | 'restrict'
          | 'preventDamage';
      }
    >,
    path: string,
    scope: Scope,
    out: AstIssue[],
  ) => void;
  /** Validates the effect kinds of the Dragons slice (D-151, `validate-dragons.ts`, set by validate.ts); true when it knew the kind. */
  readonly checkEffectExt: (e: Effect, path: string, scope: Scope, out: AstIssue[]) => boolean;
  /** Validates the modes of a modal reflexive ability (D-511, `validate-modes.ts`, set by validate.ts); absent where no ability of the engine has one. */
  readonly checkModes?: (
    modes: readonly SpellMode[] | undefined,
    choose: ModeChoice | undefined,
    path: string,
    scopeOf: (targets: Scope['targets']) => Scope,
    out: AstIssue[],
  ) => void;
  /** True in the `effect` of a `mayPay`: the cost has been paid, which `reflexive` with `afterPayment` reads (D-511, CR 603.12). */
  readonly paidAvailable?: boolean;
  /**
   * True after an effect that moves objects (`exile`, `destroy`, `moveToZone`) in the same
   * sequence: the `moved` reference has something to mean (CR 400.7j).
   */
  readonly movedAvailable?: boolean;
  /**
   * True after an effect that makes players lose life (`loseLife`) in the same sequence: the amount
   * `lifeLostThisWay` has something to read (CR 702.101a, D-120).
   */
  readonly lossAvailable?: boolean;
  /**
   * Which `thisWay` amounts have something to read (D-131): after an effect of the matching kind in the same sequence,
   * `sacrificed` after a `sacrifice`, `destroyed` after a `destroy` and `playersDrew` after a `draw`.
   */
  readonly thisWay?: readonly ThisWayKind[];
  /** The options of the latest `vote` earlier in the same sequence: the amount `votesFor` reads a tally of one of them (CR 701.38a, D-194). */
  readonly voteOptions?: readonly string[];
  /** True in the ability "When you cast this spell" (`castSpell` with `self`), the only place `cascade` may stand. */
  readonly selfCast?: boolean;
  /** True in the effect of a `dies` trigger: the creature that died is what the trigger is about, and `sharesCreatureTypeWith` reads its creature types (D-261). */
  readonly diesTrigger?: boolean;
  /** True in the effect of the trigger "when enchanted creature dies" of an Aura: the card of the Aura itself (`thisCard`) may be returned by a delayed ability (D-657). */
  readonly auraDiesTrigger?: boolean;
  /** True in an activated ability that functions from the graveyard, the only place `unearth` may stand (D-124). */
  readonly fromGraveyard?: boolean;
  /**
   * What `triggerSubject` is in the triggered ability being checked, from its trigger: 'permanent'
   * for enters, dies, attacks, tapped, landfall and sacrificed triggers, 'stack' for the spell or
   * ability of a cast or becomes-the-target trigger. Left out where there is none (an upkeep
   * trigger, a spell, an activated ability).
   */
  readonly triggerSubject?: 'permanent' | 'stack';
  /** True in the effect of a `tappedForMana` triggered ability, the only place `producedType` mana may stand (CR 605.1b). */
  readonly triggeredMana?: boolean;
  /** True in the effect of an activated ability whose cost sacrifices something (`sacrificedCost`, D-133). */
  readonly sacrificedCost?: boolean;
  /** True in the count of an `addCounters` with `perObject`: `eachObject` names the object the counters go on (Canopy Gargantuan). */
  readonly eachObject?: boolean;
  /** True in the effect of an activated ability whose cost taps permanents (`tappedAsCostPower`, CR 702.184a). */
  readonly tappedCost?: boolean;
  /** True in the effect of a triggered ability of a `combatDamageBatch` trigger: `triggerSources` names the creatures that dealt the damage. */
  readonly triggerSources?: boolean;
  /** True in the effect of a triggered ability about the cards that left a graveyard (`becomeCopyOfCard`, D-232). */
  readonly triggerCards?: boolean;
  /** True in the effect of an activated ability whose cost exiles cards from the graveyard (`splitCostExiled`, D-232). */
  readonly exiledCost?: boolean;
  /**
   * True after a `sacrifice` effect (or the `may` of one) in the same sequence, and in the `reflexive` ability that follows it: the object
   * reference `sacrificed` has a permanent to read (D-177).
   */
  readonly sacrificedEarlier?: boolean;
  /** True after a `chooseNumber` effect in the same sequence: `powerAtLeastChosenNumber` has a number to read (Expel the Interlopers). */
  readonly chosenNumber?: boolean;
  /** True in the effect of the triggered ability "When this permanent enters": `enteredX` reads the X of the spell it came from (CR 107.3m, Hylda group 3). */
  readonly entersX?: boolean;
  /** True in the effect of a triggered ability whose trigger has a player (`triggerPlayer`, D-133). */
  readonly triggerPlayer?: boolean;
  /** True in the effect of a triggered ability whose trigger deals damage (`triggerDamage`, D-133). */
  readonly triggerDamage?: boolean;
  /** True in the effect of a `cycled` trigger: `triggerCycleX` reads the X of the cycling cost (issue 81, Shark Typhoon). */
  readonly triggerCycleX?: boolean;
  /** True in the effect of an `attackBatch` trigger: `triggerAttackerCount` reads the creatures of the declaration that matched (issue 81, The Ur-Sphinx). */
  readonly triggerAttackerCount?: boolean;
  /** True in the effect of a `damageBatch` trigger to opponents: `triggerDamagedPlayerCount` reads the opponents dealt damage (CR 603.2c). */
  readonly triggerDamagedPlayerCount?: boolean;
  /** True in the effect of a `damageBatch` trigger to opponents: `triggerDamagedPlayers` names the opponents dealt damage (CR 603.2c). */
  readonly triggerDamagedPlayers?: boolean;
  /** True in the effect of a cast trigger that requires targets (`triggerTargetCount`, D-574). */
  readonly triggerTargetCount?: boolean;
  /** True in the effect of a triggered ability whose trigger is a batch of attackers (`attackersAttackedYou`, D-149). */
  readonly triggerAttacked?: boolean;
  /** True when the trigger is about exactly one attacked player (`playerAttacksOpponent`, or an `attackBatch` with `eachAttackedPlayer`): only then "that opponent" names one player (CR 508.6). */
  readonly triggerAttackedSingle?: boolean;
  /** True in the effect of any triggered ability: `abilityResolvedTimes` counts the resolutions of the ability it belongs to (Galadriel group 1). */
  readonly triggeredAbility?: boolean;
  /** True in the effect of an activated ability too (issue 345, CR 608.2c): `abilityResolvedTimes` counts the resolutions of a triggered or an activated ability. */
  readonly activatedAbility?: boolean;
  /** True in the effect of a triggered ability of an attack (`attacks`): an `extraCombat` has a combat phase to follow (D-151). */
  readonly attackTrigger?: boolean;
  /** True in the effect of a triggered ability of combat damage (`dealsCombatDamage`): combat damage is dealt in the combat phase, so an `extraCombat` has one to follow (CR 500.8, Port Razer). */
  readonly combatDamageTrigger?: boolean;
  /** True in the effect of a triggered ability of an attack batch (`attackBatch`): a creature can enter attacking (`enterAttacking`, CR 508.4) as the declaration has just been made. */
  readonly attackBatchTrigger?: boolean;
  /** True in the effect of a triggered ability whose intervening "if" is `yourMainPhase`: an `extraCombat` follows a main phase (D-187). */
  readonly mainPhaseTrigger?: boolean;
  /** True in the effect of a `conditional` whose condition is `yourCombatPhase`: an `extraCombat` follows the combat phase that is going on (issue 144). */
  readonly combatPhaseCondition?: boolean;
  /** True in the effect of a triggered ability of "the beginning of your postcombat main phase" (`step: 'main2'`): an `extraBeginningPhase` follows that phase (D-356). */
  readonly postcombatMainTrigger?: boolean;
  /** True after a `may` effect in the same sequence: `didPrevious` and `reflexive` have something to read (D-135). */
  readonly mayAvailable?: boolean;
  /** The number of sides of the latest `rollDie` earlier in the same sequence: the condition `dieResult` reads its result (CR 706.2, D-271). */
  readonly dieSides?: number;
  /** True after a `clash` earlier in the same sequence: the condition `clashWon` reads who won it (CR 701.30d). */
  readonly clashed?: boolean;
  /** True in the effect of a delayed trigger whose creating sequence exiled cards before it: `exiledStillThere` has cards to count (D-151). */
  readonly exiledStillThere?: boolean;
}

// ---- Filters

export function checkEnumList(
  out: Out,
  path: string,
  list: readonly unknown[] | undefined,
  allowed: readonly string[],
  what: string,
): void {
  if (list === undefined) return;
  if (!Array.isArray(list) || list.length === 0) {
    issue(out, path, `${what} must be a non-empty list when present`);
    return;
  }
  list.forEach((v, i) => {
    if (!isOneOf(v, allowed)) issue(out, `${path}[${i}]`, `unknown ${what} ${JSON.stringify(v)}`);
  });
}

/**
 * `ownerScope` is given only where the filter is an effect's `each` selector, the one place that
 * reads `owner` (it knows the effect's targets); anywhere else `owner` is refused.
 */
export function checkFilter(
  f: ObjectFilter,
  path: string,
  out: Out,
  ownerScope?: Scope,
  sharesWith?: boolean,
  where: FilterWhere = {},
): void {
  if (f.controlledBy !== undefined) {
    if (ownerScope === undefined) {
      issue(
        out,
        `${path}.controlledBy`,
        "controlledBy is only read in the 'each' selector of an effect (not in a target slot, trigger, condition, static ability, search or cost)",
      );
    } else {
      checkPlayerSelector(f.controlledBy, `${path}.controlledBy`, ownerScope, out);
      if (f.controller !== undefined) {
        issue(out, `${path}.controller`, 'controlledBy replaces controller: set one of them');
      }
    }
  }
  // CR 208.1, 608.2c: "power greater than target creature's power" names an object the effect knows, so only an `each` selector reads it.
  if (f.powerGreaterThan !== undefined) {
    if (ownerScope === undefined) {
      issue(
        out,
        `${path}.powerGreaterThan`,
        "powerGreaterThan is only read in the 'each' selector of an effect (not in a target slot, trigger, condition, static ability, search or cost)",
      );
    } else {
      checkRef(f.powerGreaterThan, 'object', `${path}.powerGreaterThan`, ownerScope, out);
    }
  }
  // CR 208.1, 608.2c (Expel the Interlopers): "with power greater than or equal to the chosen number" reads the number an earlier `chooseNumber` of the same sequence chose.
  if (f.powerAtLeastChosenNumber !== undefined) {
    if (f.powerAtLeastChosenNumber !== true) {
      issue(
        out,
        `${path}.powerAtLeastChosenNumber`,
        'powerAtLeastChosenNumber must be true when present',
      );
    } else if (ownerScope === undefined || ownerScope.chosenNumber !== true) {
      issue(
        out,
        `${path}.powerAtLeastChosenNumber`,
        "powerAtLeastChosenNumber is only read in the 'each' selector of an effect after a chooseNumber effect of the same sequence",
      );
    }
  }
  // CR 201.2, 608.2c: "with the same name as that card" names an object the effect knows, so only an `each` selector reads it.
  if (f.sameNameAs !== undefined) {
    if (ownerScope === undefined) {
      issue(
        out,
        `${path}.sameNameAs`,
        "sameNameAs is only read in the 'each' selector of an effect (not in a target slot, trigger, condition, static ability, search or cost)",
      );
    } else {
      checkRef(f.sameNameAs, 'object', `${path}.sameNameAs`, ownerScope, out);
    }
  }
  if (f.owner !== undefined) {
    if (ownerScope === undefined) {
      issue(
        out,
        `${path}.owner`,
        "owner is only read in the 'each' selector of an effect (not in a target slot, trigger, condition, static ability, search or cost)",
      );
    } else {
      checkPlayerSelector(f.owner, `${path}.owner`, ownerScope, out);
    }
  }
  if (f.zone !== undefined && !isOneOf(f.zone, ZONES)) {
    issue(out, `${path}.zone`, `unknown zone ${JSON.stringify(f.zone)}`);
  }
  checkEnumList(out, `${path}.types`, f.types, CARD_TYPES, 'card type');
  checkEnumList(out, `${path}.notTypes`, f.notTypes, CARD_TYPES, 'card type');
  checkEnumList(out, `${path}.supertypes`, f.supertypes, SUPERTYPES, 'supertype');
  checkEnumList(out, `${path}.notSupertypes`, f.notSupertypes, SUPERTYPES, 'supertype');
  checkEnumList(out, `${path}.colors`, f.colors, COLORS, 'color');
  checkEnumList(out, `${path}.notColors`, f.notColors, COLORS, 'color');
  if (f.subtypes !== undefined) {
    if (!Array.isArray(f.subtypes) || f.subtypes.length === 0) {
      issue(out, `${path}.subtypes`, 'subtypes must be a non-empty list when present');
    } else {
      f.subtypes.forEach((s, i) => {
        if (typeof s !== 'string' || s === '')
          issue(out, `${path}.subtypes[${i}]`, 'empty subtype');
      });
    }
  }
  if (f.notSubtypes !== undefined) {
    if (!Array.isArray(f.notSubtypes) || f.notSubtypes.length === 0) {
      issue(out, `${path}.notSubtypes`, 'notSubtypes must be a non-empty list when present');
    } else {
      f.notSubtypes.forEach((s, i) => {
        if (typeof s !== 'string' || s === '')
          issue(out, `${path}.notSubtypes[${i}]`, 'empty subtype');
      });
    }
  }
  // D-133: "colorless" is a flag, "token" / "nontoken" a boolean, keywords are the ones without parameters.
  if (f.colorless !== undefined && f.colorless !== true) {
    issue(out, `${path}.colorless`, 'colorless must be true');
  }
  if (f.token !== undefined && typeof f.token !== 'boolean') {
    issue(
      out,
      `${path}.token`,
      'token must be a boolean (true: tokens only, false: nontokens only)',
    );
  }
  checkEnumList(out, `${path}.keywords`, f.keywords, FILTERABLE_KEYWORDS, 'keyword');
  checkEnumList(out, `${path}.notKeywords`, f.notKeywords, FILTERABLE_KEYWORDS, 'keyword');
  if (
    f.controller !== undefined &&
    !isOneOf(f.controller, [
      'you',
      'opponent',
      'any',
      'triggerPlayer',
      'defendingPlayer',
      'monarch',
    ])
  ) {
    issue(out, `${path}.controller`, `unknown controller filter ${JSON.stringify(f.controller)}`);
  }
  if (f.stackKind !== undefined) {
    if (!isOneOf(f.stackKind, ['spell', 'ability', 'triggeredAbility'])) {
      issue(out, `${path}.stackKind`, `unknown stack kind ${JSON.stringify(f.stackKind)}`);
    } else if (f.zone !== undefined && f.zone !== 'stack') {
      issue(out, `${path}.stackKind`, 'stackKind only applies to the stack zone');
    }
  }
  for (const key of ['tapped', 'other'] as const) {
    if (f[key] !== undefined && typeof f[key] !== 'boolean') {
      issue(out, `${path}.${key}`, `${key} must be a boolean`);
    }
  }
  // D-145: "with a counter on it" is true (any kind) or the name of a counter; "commander" is a flag.
  if (
    f.hasCounter !== undefined &&
    f.hasCounter !== true &&
    (typeof f.hasCounter !== 'string' || f.hasCounter === '')
  ) {
    issue(out, `${path}.hasCounter`, 'hasCounter must be true or the name of a counter');
  }
  if (f.otherThanTriggerSubject !== undefined) {
    if (f.otherThanTriggerSubject !== true) {
      issue(
        out,
        `${path}.otherThanTriggerSubject`,
        'otherThanTriggerSubject must be true when present',
      );
    } else if (sharesWith !== true) {
      issue(
        out,
        `${path}.otherThanTriggerSubject`,
        'otherThanTriggerSubject is read in a count of a trigger about a permanent (the creature the trigger is about is left out)',
      );
    }
  }
  if (f.notTriggerCard !== undefined && f.notTriggerCard !== true) {
    issue(out, `${path}.notTriggerCard`, 'notTriggerCard must be true when present');
  }
  if (f.commander !== undefined && f.commander !== true && f.commander !== 'yours') {
    issue(out, `${path}.commander`, "commander must be true or 'yours'");
  }
  // D-489 (CR 201.2): "a card named X" is the text of a name.
  if (f.named !== undefined && (typeof f.named !== 'string' || f.named === '')) {
    issue(out, `${path}.named`, 'named must be the name of a card');
  }
  // D-120: "attacking" and "power less than this creature's power" are flags; D-179: so is "put there from the battlefield this turn", a graveyard card's.
  for (const key of [
    'attacking',
    'attackingOrBlocking',
    'blocking',
    'powerLessThanSource',
    'powerAboveBase',
    'putFromBattlefieldThisTurn',
    'discardedOrFromLibraryThisTurn',
    'notCastFromHand',
    'castFromHand',
    'castFromGraveyard',
    'castFromOwnGraveyard',
    'xInManaCost',
    'firstXSpellThisTurn',
    'enteredThisTurn',
    'exiledWithSource',
    'putWithSource',
    'singleTarget',
    'modified',
    'goaded',
  ] as const) {
    if (f[key] !== undefined && f[key] !== true)
      issue(out, `${path}.${key}`, `${key} must be true`);
  }
  // CR 601.2i: "the second spell you cast each turn" is the 2nd or a later one: a whole number of 2 or more.
  if (
    f.nthSpellThisTurn !== undefined &&
    (!Number.isInteger(f.nthSpellThisTurn) || f.nthSpellThisTurn < 2)
  ) {
    issue(out, `${path}.nthSpellThisTurn`, 'nthSpellThisTurn must be a whole number of 2 or more');
  }
  // CR 208.4b: "with base power 0" is a whole number of power.
  if (f.basePowerIs !== undefined && !Number.isInteger(f.basePowerIs)) {
    issue(out, `${path}.basePowerIs`, 'basePowerIs must be a whole number');
  }
  // D-131, CR 508.1b: "attacking you" is a flag; 'orPlaneswalkers' is "attacking you or a planeswalker you control".
  if (
    f.attackingYou !== undefined &&
    f.attackingYou !== true &&
    f.attackingYou !== 'orPlaneswalkers'
  ) {
    issue(out, `${path}.attackingYou`, "attackingYou must be true or 'orPlaneswalkers'");
  }
  // D-218, D-650: "attacking your opponents and/or planeswalkers they control" is a flag; `'players'` is "attacking one of your opponents".
  if (
    f.attackingOpponents !== undefined &&
    f.attackingOpponents !== true &&
    f.attackingOpponents !== 'players'
  ) {
    issue(out, `${path}.attackingOpponents`, "attackingOpponents must be true or 'players'");
  }
  // D-422: attachments: "attached to it", "that isn't enchanted", "enchanted creature" (of the source).
  if (f.attachedTo !== undefined) checkAttachedTo(f.attachedTo, `${path}.attachedTo`, out);
  if (f.enchanted !== undefined && typeof f.enchanted !== 'boolean') {
    issue(
      out,
      `${path}.enchanted`,
      'enchanted must be a boolean (true: has an Aura, false: has none)',
    );
  }
  if (f.notOwnedByYou !== undefined && f.notOwnedByYou !== true) {
    issue(out, `${path}.notOwnedByYou`, 'notOwnedByYou must be true');
  }
  if (f.ownedByYou !== undefined && f.ownedByYou !== true) {
    issue(out, `${path}.ownedByYou`, 'ownedByYou must be true');
  }
  if (f.enchantedByYou !== undefined && f.enchantedByYou !== true) {
    issue(out, `${path}.enchantedByYou`, 'enchantedByYou must be true');
  }
  if (f.enchantedByYou === true && f.enchanted === false) {
    issue(
      out,
      `${path}.enchantedByYou`,
      'a permanent enchanted by an Aura you control is enchanted: enchanted is not false',
    );
  }
  if (f.hostOfSource !== undefined && f.hostOfSource !== true) {
    issue(out, `${path}.hostOfSource`, 'hostOfSource must be true');
  }
  if (
    (f.attachedTo !== undefined ||
      f.enchanted !== undefined ||
      f.enchantedByYou === true ||
      f.hostOfSource === true) &&
    f.zone !== undefined &&
    f.zone !== 'battlefield'
  ) {
    issue(
      out,
      `${path}.attachedTo`,
      'only a permanent on the battlefield is attached to, or has something attached: the filter has no other zone',
    );
  }
  // D-230: "mana value X or less, where X is ...": an amount that reads no target and no earlier instruction.
  for (const limitKey of ['manaValueAtMost', 'manaValueBelow'] as const) {
    if (f[limitKey] === undefined) continue;
    const a = f[limitKey] as {
      kind?: string;
      of?: { kind?: string };
      filter?: ObjectFilter;
    };
    const countOfTargetControllerGraveyard =
      a?.kind === 'countOf' &&
      a.filter?.zone === 'graveyard' &&
      a.filter.owner?.kind === 'controllerOf' &&
      kindOf(a.filter.owner.of) === 'target';
    const ok =
      typeof a === 'number' ||
      (a?.kind === 'powerOf' && a.of?.kind === 'this') ||
      a?.kind === 'triggerDamage' ||
      // CR 107.3a: "a spell with mana value X or less from your hand" (castFree), the X announced for the spell that is resolving.
      a?.kind === 'x' ||
      // CR 603.3d: "with mana value less than or equal to that spell's mana value" (a cast trigger; `validateCard` checks the trigger).
      (a?.kind === 'manaValueOf' && a.of?.kind === 'triggerSubject') ||
      a?.kind === 'lifeGainedThisTurn' ||
      a?.kind === 'controllerLifeLostThisTurn' ||
      // CR 107.3m: "with mana value X or less" in the enters trigger of the permanent itself: the X of the spell it came from (`validateCard` checks the trigger and the cost).
      a?.kind === 'enteredX' ||
      // CR 122.1, 603.10a (Puca's Covenant): "with mana value less than or equal to the number of counters on that creature": the permanent the trigger is about, as it last was.
      (a?.kind === 'countersOn' && a.of?.kind === 'triggerSubject') ||
      countOfTargetControllerGraveyard;
    if (!ok) {
      issue(
        out,
        `${path}.${limitKey}`,
        'the limit is a number, the power of this, the damage that triggered the ability, the X of this spell, the mana value of the spell that triggered it or the counters on the permanent that triggered it',
      );
    }
    // CR 107.3a: "each nonland permanent with mana value X or less" reads the X announced for the spell or ability that has the selector.
    if (a?.kind === 'x' && ownerScope !== undefined && !ownerScope.xAllowed) {
      issue(
        out,
        `${path}.${limitKey}`,
        'the X of the limit is used but nothing in this ability or spell has an X',
      );
    }
    if (f.manaValue !== undefined) {
      issue(
        out,
        `${path}.${limitKey}`,
        'a filter has one mana value limit: manaValue, manaValueAtMost or manaValueBelow',
      );
    }
  }
  if (
    (f.attacking === true ||
      f.notAttacking === true ||
      f.blocking === true ||
      f.attackingYou !== undefined ||
      f.attackingOpponents !== undefined ||
      f.attackingOrBlocking === true) &&
    f.zone !== undefined &&
    f.zone !== 'battlefield'
  ) {
    issue(
      out,
      `${path}.attacking`,
      'attacking status only applies to a permanent on the battlefield',
    );
  }
  // CR 700.9 (D-416): only a permanent is modified.
  if (f.modified === true && f.zone !== undefined && f.zone !== 'battlefield') {
    issue(out, `${path}.modified`, 'only a permanent on the battlefield can be modified');
  }
  // CR 701.15b: only a permanent is goaded.
  if (f.goaded === true && f.zone !== undefined && f.zone !== 'battlefield') {
    issue(out, `${path}.goaded`, 'only a permanent on the battlefield can be goaded');
  }
  if (f.putFromBattlefieldThisTurn === true && f.zone !== 'graveyard') {
    issue(
      out,
      `${path}.putFromBattlefieldThisTurn`,
      "only a card in a graveyard was put there: the filter's zone is 'graveyard'",
    );
  }
  if (f.discardedOrFromLibraryThisTurn === true && f.zone !== 'graveyard') {
    issue(
      out,
      `${path}.discardedOrFromLibraryThisTurn`,
      "only a card in a graveyard was put there: the filter's zone is 'graveyard'",
    );
  }
  // CR 607.2a (Lorehold group 2): "card exiled with this creature" is a card in exile.
  if (f.exiledWithSource === true && f.zone !== 'exile') {
    issue(
      out,
      `${path}.exiledWithSource`,
      "only a card in exile was exiled with a permanent: the filter's zone is 'exile'",
    );
  }
  // CR 400.7 (Animate Dead): "put onto the battlefield with this Aura" is a permanent.
  if (f.putWithSource === true && f.zone !== undefined && f.zone !== 'battlefield') {
    issue(
      out,
      `${path}.putWithSource`,
      'only a permanent on the battlefield was put onto the battlefield with another',
    );
  }
  if (f.controllerDealtCombatDamageByAtLeast !== undefined) {
    const spec = f.controllerDealtCombatDamageByAtLeast;
    if (
      !Number.isInteger(spec.atLeast) ||
      spec.atLeast < 1 ||
      !Array.isArray(spec.subtypes) ||
      spec.subtypes.length === 0
    ) {
      issue(
        out,
        `${path}.controllerDealtCombatDamageByAtLeast`,
        'a count of one or more and at least one subtype',
      );
    }
    if (f.zone !== undefined && f.zone !== 'battlefield') {
      issue(
        out,
        `${path}.controllerDealtCombatDamageByAtLeast`,
        'only a permanent on the battlefield has a controller to ask',
      );
    }
  }
  if (f.enteredThisTurn === true && f.zone !== undefined && f.zone !== 'battlefield') {
    issue(
      out,
      `${path}.enteredThisTurn`,
      'only a permanent on the battlefield entered it this turn',
    );
  }
  // CR 115.9a (D-181): "with a single target" is about a spell or ability on the stack.
  if (f.singleTarget === true && f.zone !== 'stack') {
    issue(
      out,
      `${path}.singleTarget`,
      "only a spell or ability on the stack has targets chosen: the filter's zone is 'stack'",
    );
  }
  if (f.targetCountAtLeast !== undefined) {
    if (!Number.isInteger(f.targetCountAtLeast) || f.targetCountAtLeast < 1) {
      issue(out, `${path}.targetCountAtLeast`, 'target count must be a positive integer');
    }
    if (f.zone !== 'stack' && f.stackKind === undefined && where.onStack !== true) {
      issue(out, `${path}.targetCountAtLeast`, "target count requires a stack object's filter");
    }
  }
  // CR 115.1 (D-206): "that targets a creature" is about a spell or ability on the stack, and its filter describes a permanent or an object it targets.
  // D-437: "a spell that targets only this creature" (CR 115.9c) is read as `targetsObject` is; a member of a disjunction of such a filter is read with the outer filter's stack.
  for (const key of ['targetsObject', 'targetsOnly'] as const) {
    const aimed = f[key];
    if (aimed === undefined) continue;
    if (f.zone !== 'stack' && f.stackKind === undefined && where.onStack !== true) {
      issue(
        out,
        `${path}.${key}`,
        "only a spell or ability on the stack has targets chosen: the filter's zone is 'stack' or it has a stackKind",
      );
    }
    if (key === 'targetsOnly' && f.targetsObject !== undefined) {
      issue(out, `${path}.targetsOnly`, 'targetsObject and targetsOnly are not read together');
    }
    checkFilter(aimed, `${path}.${key}`, out, undefined, undefined, { inTargets: true });
  }
  // CR 115.1: "that targets a player" is about a spell or ability on the stack, as `targetsObject` is.
  if (f.targetsPlayer !== undefined) {
    if (f.targetsPlayer !== true && f.targetsPlayer !== 'you') {
      issue(out, `${path}.targetsPlayer`, "targetsPlayer must be true or 'you'");
    }
    if (f.zone !== 'stack' && f.stackKind === undefined && where.onStack !== true) {
      issue(
        out,
        `${path}.targetsPlayer`,
        "only a spell or ability on the stack has targets chosen: the filter's zone is 'stack' or it has a stackKind",
      );
    }
  }
  // D-437: "this creature" is the object a spell targets, in the filter of `targetsObject` or `targetsOnly`: the permanent that has the ability.
  if (f.isSource !== undefined) {
    if (f.isSource !== true) issue(out, `${path}.isSource`, 'isSource must be true');
    else if (where.inTargets !== true && where.sourceOk !== true) {
      issue(
        out,
        `${path}.isSource`,
        'isSource is read in the filter of what a spell targets (targetsObject, targetsOnly) or of the creatures an attackBatch trigger counts',
      );
    }
  }
  // D-139: "mana value X" and "whose controller was dealt combat damage by this creature this turn" are flags read in an
  // effect's `each` selector (the one place with an X and a source ability).
  for (const key of ['manaValueX', 'controllerDealtDamageBySource'] as const) {
    if (f[key] === undefined) continue;
    if (f[key] !== true) issue(out, `${path}.${key}`, `${key} must be true`);
    else if (ownerScope === undefined && key === 'manaValueX' && where.xTarget === true) {
      // The X of the spell is announced before its targets are chosen (CR 601.2b, 601.2c); the spell checks that it has one.
    } else if (ownerScope === undefined) {
      issue(out, `${path}.${key}`, `${key} is only read in the 'each' selector of an effect`);
    } else if (key === 'manaValueX' && !ownerScope.xAllowed) {
      issue(out, `${path}.${key}`, 'mana value X is used but nothing in this ability has an X');
    } else if (key === 'controllerDealtDamageBySource' && ownerScope.owner !== 'ability') {
      issue(out, `${path}.${key}`, 'only an ability has a creature that dealt the damage');
    }
  }
  if (f.powerParity !== undefined && !isOneOf(f.powerParity, ['odd', 'even'])) {
    issue(out, `${path}.powerParity`, "powerParity must be 'odd' or 'even'");
  }
  // D-111: power, toughness and mana value comparisons.
  for (const key of ['power', 'toughness', 'manaValue', 'colorCount'] as const) {
    const c = f[key];
    if (c === undefined) continue;
    if (!isOneOf(c.cmp, ['atLeast', 'atMost', 'equal'])) {
      issue(out, `${path}.${key}.cmp`, `unknown comparison ${JSON.stringify(c.cmp)}`);
    }
    if (typeof c.value !== 'number' || !Number.isInteger(c.value)) {
      issue(out, `${path}.${key}.value`, `${key} must be compared with a whole number`);
    } else if ((key === 'manaValue' || key === 'colorCount') && c.value < 0) {
      issue(
        out,
        `${path}.${key}.value`,
        `a ${key === 'manaValue' ? 'mana value' : 'number of colors'} is never negative`,
      );
    }
  }
  // D-261: "that shares a creature type with it" names the creature a "dies" trigger is about, which only the filter of a `revealUntil` in its effect reads.
  if (f.sharesCreatureTypeWith !== undefined) {
    if (!isOneOf(f.sharesCreatureTypeWith, ['triggerSubject', 'source', 'sacrificed'])) {
      issue(
        out,
        `${path}.sharesCreatureTypeWith`,
        "sharesCreatureTypeWith is 'triggerSubject', 'source' or 'sacrificed'",
      );
    } else if (f.sharesCreatureTypeWith === 'sacrificed') {
      if (where.afterSacrifice !== true) {
        issue(
          out,
          `${path}.sharesCreatureTypeWith`,
          "sharesCreatureTypeWith 'sacrificed' is read in the filter of a revealUntil that follows a sacrifice (or the offer of one) in the same sequence",
        );
      }
    } else if (f.sharesCreatureTypeWith === 'triggerSubject' && sharesWith !== true) {
      issue(
        out,
        `${path}.sharesCreatureTypeWith`,
        'sharesCreatureTypeWith is read in the filter of a revealUntil in the effect of a "dies" trigger, where the creature that died is what the trigger is about',
      );
    }
  }
  // CR 205.2a, 603.3d: "that shares a card type with it" names the spell a cast trigger is about.
  if (
    f.sharesCardTypeWith !== undefined &&
    f.sharesCardTypeWith !== 'triggerSubject' &&
    f.sharesCardTypeWith !== 'sacrificed'
  ) {
    issue(
      out,
      `${path}.sharesCardTypeWith`,
      "sharesCardTypeWith is 'triggerSubject' or 'sacrificed'",
    );
  } else if (f.sharesCardTypeWith === 'sacrificed' && where.afterSacrifice !== true) {
    issue(
      out,
      `${path}.sharesCardTypeWith`,
      "sharesCardTypeWith 'sacrificed' is read in the filter of a sacrifice that follows another sacrifice (or the offer of one) in the same sequence",
    );
  }
  if (f.manaValueExact === true && f.manaValueAtMost === undefined) {
    issue(out, `${path}.manaValueExact`, 'manaValueExact needs the manaValueAtMost it makes exact');
  }
  if (f.manaValueAtMost !== undefined && f.manaValueBelow !== undefined) {
    issue(out, `${path}.manaValueBelow`, 'a filter has one mana value limit');
  }
  // D-100: "of the chosen type" / "of the chosen color" are flags; the card must ask for the choice.
  for (const key of [
    'chosenType',
    'chosenColor',
    'notChosenType',
    'chosenPlaneswalkerType',
  ] as const) {
    if (f[key] !== undefined && f[key] !== true)
      issue(out, `${path}.${key}`, `${key} must be true`);
  }
  if (f.anyOf !== undefined) {
    if (!Array.isArray(f.anyOf) || f.anyOf.length === 0) {
      // An empty disjunction matches nothing, so a target slot that uses it could never be filled.
      issue(out, `${path}.anyOf`, 'anyOf must be a non-empty list when present');
      return;
    }
    f.anyOf.forEach((member, i) => {
      const p = `${path}.anyOf[${i}]`;
      checkFilter(member, p, out, undefined, sharesWith, {
        onStack: f.zone === 'stack' || f.stackKind !== undefined || where.onStack === true,
        ...(where.inTargets === true ? { inTargets: true } : {}),
        ...(where.sourceOk === true ? { sourceOk: true } : {}),
        ...(where.afterSacrifice === true ? { afterSacrifice: true } : {}),
      });
      // Where to look (CR 115.1, 601.2c) is the outer filter's business.
      // D-207: a member may say what kind of stack object it is when the outer filter, on the stack, does not ("triggered ability or colorless spell").
      if (member.zone !== undefined) {
        issue(out, `${p}.zone`, 'zone is set on the outer filter, not on an anyOf member');
      }
      if (member.stackKind !== undefined && (f.stackKind !== undefined || f.zone !== 'stack')) {
        issue(
          out,
          `${p}.stackKind`,
          "stackKind is set on the outer filter, or on the members of a filter whose zone is 'stack' and that has none",
        );
      }
    });
  }
}

/** Where a filter is read (D-437): on the stack (a member of a disjunction of the outer filter's spells), or as the object a spell targets. */
interface FilterWhere {
  readonly onStack?: boolean;
  readonly inTargets?: boolean;
  /** Issue 101 (CR 508.1): the filter of the creatures an `attackBatch` trigger counts, where "this creature" (`isSource`) is the permanent that has the ability. */
  readonly sourceOk?: boolean;
  /** CR 107.3a, 202.3: the filter of a target slot of a spell with an {X} in its text: "target creature with mana value X" reads the X announced (D2 group). */
  readonly xTarget?: boolean;
  /** CR 701.21a (Braids): the filter of a `sacrifice` choice that follows a sacrifice of the same resolution, so `sharesCardTypeWith: 'sacrificed'` has a permanent to read. */
  readonly afterSacrifice?: boolean;
}

/** The parts of a filter a host named by `attachedTo` may have (D-422): what layers 1, 4 and 5 give it, and its controller; nothing of layers 6 and 7, nothing of the game. */
const HOST_FILTER_KEYS: readonly string[] = [
  'types',
  'notTypes',
  'supertypes',
  'notSupertypes',
  'subtypes',
  'notSubtypes',
  'colors',
  'notColors',
  'colorless',
  'controller',
];

/** D-422: what an `attachedTo` filter names: the source, its host, or a permanent a plain filter describes. */
function checkAttachedTo(a: AttachedTo, path: string, out: Out): void {
  switch (a?.kind) {
    case 'source':
    case 'host':
      return;
    case 'matching': {
      const inner = a.filter;
      if (inner === undefined || inner === null || typeof inner !== 'object') {
        issue(out, `${path}.filter`, 'a matching host needs a filter');
        return;
      }
      checkFilter(inner, `${path}.filter`, out);
      for (const key of Object.keys(inner)) {
        if (!HOST_FILTER_KEYS.includes(key)) {
          issue(
            out,
            `${path}.filter.${key}`,
            'the permanent something is attached to is described by types, subtypes, colors, supertypes and its controller only',
          );
        }
      }
      if (
        inner.controller !== undefined &&
        inner.controller !== 'you' &&
        inner.controller !== 'opponent' &&
        inner.controller !== 'any'
      ) {
        issue(out, `${path}.filter.controller`, "the host's controller is you, opponent or any");
      }
      return;
    }
    default:
      issue(out, path, `attachedTo is source, host or matching, not ${kindOf(a)}`);
  }
}

/** True when the filter or any anyOf member satisfies `test`. */
/** True for a filter that reads the combat or the source's power, which `derive` cannot (D-120, D-131). */
export const readsCombatOrSource = (f: ObjectFilter): boolean =>
  readsCombatOrSourceBesidesCommander(f) || f.commander !== undefined;

/** `readsCombatOrSource` without `commander`: what the quality of an equip ability may not read ("Equip commander" reads it, D-259). */
export const readsCombatOrSourceBesidesCommander = (f: ObjectFilter): boolean =>
  f.attacking !== undefined ||
  f.attackingYou !== undefined ||
  f.attackingOpponents !== undefined ||
  f.attackingOrBlocking !== undefined ||
  f.blocking !== undefined ||
  f.powerLessThanSource === true ||
  f.powerAboveBase === true ||
  f.basePowerIs !== undefined ||
  f.powerGreaterThan !== undefined ||
  f.sameNameAs !== undefined ||
  f.manaValueX !== undefined ||
  f.controllerDealtDamageBySource !== undefined ||
  f.controllerDealtCombatDamageByAtLeast !== undefined ||
  f.putFromBattlefieldThisTurn !== undefined ||
  f.discardedOrFromLibraryThisTurn !== undefined ||
  f.enteredThisTurn !== undefined ||
  f.exiledWithSource !== undefined ||
  f.putWithSource !== undefined ||
  f.singleTarget !== undefined ||
  f.modified !== undefined ||
  f.goaded !== undefined ||
  f.named !== undefined ||
  f.targetsObject !== undefined ||
  f.targetsPlayer !== undefined;

/**
 * True for a filter that names keywords (D-133): `derive` matches the subject of a static ability, and the objects a
 * count in a static ability counts, before the abilities are settled (layer 6 itself would depend on them, CR 613.8).
 */
export const readsKeywords = (f: ObjectFilter): boolean =>
  f.keywords !== undefined || f.notKeywords !== undefined;

export function filterSome(f: ObjectFilter, test: (f: ObjectFilter) => boolean): boolean {
  return test(f) || (Array.isArray(f.anyOf) && f.anyOf.some((m) => filterSome(m, test)));
}

// ---- Target declarations (CR 115)

/** Amount kinds that read an object or a target, which the number of targets of a slot (read before any is chosen) cannot. */
const READS_NO_OBJECT: ReadonlySet<string> = new Set([
  'x',
  'enteredX',
  'lifePaidAsEntered',
  'powerOf',
  'manaValueOf',
  'toughnessOf',
  'countersOn',
  'thisWay',
  'triggerDamage',
  'triggerTargetCount',
  'triggerSpellX',
  'triggerCycleX',
  'triggerAttackerCount',
  'triggerDamagedPlayerCount',
  'cardTypesAmongTriggerCards',
  'dieResult',
  'votesFor',
  'exiledStillThere',
  'cardsStillExiled',
  'shortfall',
  'lifeLostThisWay',
]);

/** Validates a list of target specs and returns the ids they declare. */
export function declareTargets(
  specs: readonly TargetSpec[] | undefined,
  path: string,
  out: Out,
  /** D-145: only the targets of a spell's own text, an activated ability or a triggered ability (not a mode, not a reflexive ability) can divide something among them (CR 601.2d). */
  divideAllowed = false,
  /** D-187: only the targets of a reflexive ability after a sacrifice can be "up to that many" (CR 603.12). */
  thatManyAllowed = false,
  /** D-270: only the slot of a triggered ability can name objects of two zones (the one place the engine reads it). */
  crossZoneAllowed = false,
  /** D-386: only the targets of a spell's own text can take as many targets as the X announced (CR 601.2b, 601.2c). */
  /** `'slot'` (issue 345): only a slot of as many targets as the X announced (an activated ability whose cost has an X); `true` is a spell's own text, which also lets a division and a filter read X. */
  countXAllowed: boolean | 'slot' = false,
  /** D-513: only the targets of a triggered ability whose event carries a number (a scry) can take up to as many targets as it (CR 603.3d). */
  triggerAmountAllowed = false,
  /** Only the targets of a triggered ability can take up to as many targets as an amount read as it triggers (CR 603.3d). */
  upToAmountAllowed = false,
  /** CR 107.3a, 602.2b: the targets of an activated ability whose cost has an {X} can name "mana value X": the X is announced before the targets are chosen. */
  xFilterAllowed = false,
): Map<string, TargetKind> {
  const declared = new Map<string, TargetKind>();
  if (specs === undefined) return declared;
  specs.forEach((spec, i) => {
    const p = `${path}[${i}]`;
    if (typeof spec.id !== 'string' || spec.id === '') {
      issue(out, `${p}.id`, 'target id must be a non-empty string');
    } else if (declared.has(spec.id)) {
      issue(out, `${p}.id`, `duplicate target id "${spec.id}"`);
    }
    const what = spec.what;
    switch (what?.kind) {
      case 'object':
        checkFilter(
          what.filter,
          `${p}.what.filter`,
          out,
          undefined,
          undefined,
          countXAllowed === true || xFilterAllowed ? { xTarget: true } : {},
        );
        if (
          what.filter.manaValueAtMost !== undefined &&
          typeof what.filter.manaValueAtMost === 'object' &&
          what.filter.manaValueAtMost.kind === 'countOf' &&
          what.filter.manaValueAtMost.filter.owner !== undefined
        ) {
          const owner = what.filter.manaValueAtMost.filter.owner;
          if (
            owner.kind !== 'controllerOf' ||
            owner.of.kind !== 'target' ||
            owner.of.id !== spec.id
          ) {
            issue(
              out,
              `${p}.what.filter.manaValueAtMost`,
              'the graveyard count must use the controller of this target',
            );
          }
        }
        break;
      case 'player':
        if (!isOneOf(what.filter, ['any', 'opponent', 'opponentWhoseTurn'])) {
          issue(out, `${p}.what.filter`, `unknown player filter ${JSON.stringify(what.filter)}`);
        }
        break;
      case 'anyTarget':
        break;
      case 'playerOrObject':
        // D-200: "target player or planeswalker": a player, or a planeswalker or battle (nothing else).
        if (!isOneOf(what.player, ['any', 'opponent'])) {
          issue(out, `${p}.what.player`, `unknown player filter ${JSON.stringify(what.player)}`);
        }
        checkFilter(what.filter, `${p}.what.filter`, out);
        if (
          !Array.isArray(what.filter?.types) ||
          what.filter.types.length === 0 ||
          what.filter.types.some((t) => t !== 'planeswalker' && t !== 'battle') ||
          what.filter.anyOf !== undefined
        ) {
          issue(
            out,
            `${p}.what.filter.types`,
            'a target "player or ..." names planeswalkers, battles or both, and nothing else',
          );
        }
        break;
      case 'objectOrGraveyardCard': {
        // D-270 (CR 115.1, 115.2): "target creatures from the battlefield and/or creature cards from graveyards": a permanent or a card of any graveyard.
        if (!crossZoneAllowed) {
          issue(
            out,
            `${p}.what`,
            'a target of two zones (the battlefield and graveyards) is read only in a triggered ability of a permanent',
          );
        }
        checkFilter(what.filter, `${p}.what.filter`, out);
        checkFilter(what.card, `${p}.what.card`, out);
        if (
          filterSome(
            what.filter,
            (f) =>
              (f.zone !== undefined && f.zone !== 'battlefield') ||
              f.stackKind !== undefined ||
              f.owner !== undefined,
          )
        ) {
          issue(
            out,
            `${p}.what.filter`,
            'the permanent half is on the battlefield: no other zone, owner or stackKind',
          );
        }
        if (
          what.card?.zone !== 'graveyard' ||
          what.card.other !== undefined ||
          what.card.controller !== undefined ||
          what.card.owner !== undefined ||
          what.card.stackKind !== undefined ||
          (what.card.anyOf?.some(
            (f) =>
              f.zone !== undefined ||
              f.other !== undefined ||
              f.controller !== undefined ||
              f.owner !== undefined,
          ) ??
            false)
        ) {
          issue(
            out,
            `${p}.what.card`,
            'the card half is a card of any graveyard: zone "graveyard" and no other, controller, owner or stackKind',
          );
        }
        if (
          spec.onePerOpponent !== undefined ||
          spec.divide !== undefined ||
          spec.upToThatMany !== undefined ||
          spec.anyNumber !== undefined
        ) {
          issue(
            out,
            p,
            'a target of two zones takes a count (min and max), not onePerOpponent, divide, upToThatMany or anyNumber',
          );
        }
        break;
      }
      case 'objectOrSpell':
        // CR 115.1 (issue 81, Fatehold Charm): "target spell or creature": a permanent the filter matches or a spell the spell filter matches.
        checkFilter(what.filter, `${p}.what.filter`, out);
        checkFilter(what.spell, `${p}.what.spell`, out);
        if (
          filterSome(
            what.filter,
            (f) =>
              (f.zone !== undefined && f.zone !== 'battlefield') ||
              f.stackKind !== undefined ||
              f.owner !== undefined,
          )
        ) {
          issue(
            out,
            `${p}.what.filter`,
            'the permanent half is on the battlefield: no other zone, owner or stackKind',
          );
        }
        if (
          what.spell?.stackKind !== 'spell' ||
          (what.spell.zone !== undefined && what.spell.zone !== 'stack') ||
          what.spell.owner !== undefined
        ) {
          issue(
            out,
            `${p}.what.spell`,
            'the spell half is a spell on the stack: stackKind "spell", no zone or owner',
          );
        }
        if (
          spec.onePerOpponent !== undefined ||
          spec.divide !== undefined ||
          spec.upToThatMany !== undefined ||
          spec.anyNumber !== undefined
        ) {
          issue(
            out,
            p,
            'a target of a permanent or a spell takes one target, not onePerOpponent, divide, upToThatMany or anyNumber',
          );
        }
        break;
      default:
        issue(out, `${p}.what`, `unknown target kind ${kindOf(what)}`);
    }
    if (spec.ifGiftPromised !== undefined && typeof spec.ifGiftPromised !== 'boolean') {
      issue(out, `${p}.ifGiftPromised`, 'ifGiftPromised must be boolean when present');
    }
    // D-181, CR 702.33g, 601.2c: a slot chosen only if the spell was kicked, or only if it was not.
    // Issue 244, CR 601.2c: a slot chosen only if the spell was cast during its controller's main phase.
    if (spec.ifCastInOwnMain !== undefined && spec.ifCastInOwnMain !== true) {
      issue(out, `${p}.ifCastInOwnMain`, 'ifCastInOwnMain must be true when present');
    }
    for (const key of ['ifKicked', 'unlessKicked'] as const) {
      if (spec[key] !== undefined && spec[key] !== true) {
        issue(out, `${p}.${key}`, `${key} must be true when present`);
      }
    }
    if (spec.ifKicked === true && spec.unlessKicked === true) {
      issue(
        out,
        p,
        'a slot is chosen only if the spell was kicked or only if it was not, not both',
      );
    }
    if (spec.upToThatMany !== undefined) {
      // D-187, CR 603.12: "up to that many target creatures" after "you may sacrifice one or more ...".
      if (spec.upToThatMany !== true) {
        issue(out, `${p}.upToThatMany`, 'upToThatMany must be true when present');
      } else if (!thatManyAllowed) {
        issue(
          out,
          `${p}.upToThatMany`,
          'only a slot of a reflexive ability after a sacrifice takes up to as many targets as were sacrificed',
        );
      } else if (spec.min !== undefined || spec.max !== undefined || spec.divide !== undefined) {
        issue(out, p, 'up to that many targets has no min, max or divide');
      } else if (spec.onePerOpponent !== undefined) {
        issue(out, p, 'up to that many targets is not one for each opponent');
      }
    }
    if (spec.upToTriggerAmount !== undefined) {
      // D-513, CR 603.3d, 701.22: "tap up to X target nonland permanents, where X is the number of cards looked at while scrying this way".
      if (spec.upToTriggerAmount !== true) {
        issue(out, `${p}.upToTriggerAmount`, 'upToTriggerAmount must be true when present');
      } else if (!triggerAmountAllowed) {
        issue(
          out,
          `${p}.upToTriggerAmount`,
          'only a slot of a triggered ability whose event carries a number (whenever you scry) takes up to as many targets as that number',
        );
      } else if (
        spec.min !== undefined ||
        spec.max !== undefined ||
        spec.divide !== undefined ||
        spec.onePerOpponent !== undefined ||
        spec.upToThatMany !== undefined ||
        spec.anyNumber !== undefined ||
        spec.countX !== undefined
      ) {
        issue(out, p, 'up to as many targets as the trigger says has no min, max or other count');
      }
    }
    if (spec.upToAmount !== undefined) {
      // CR 107.3c, 603.3d: "up to X target Zombie cards ..., where X is the number of opponents you have".
      if (!upToAmountAllowed) {
        issue(
          out,
          `${p}.upToAmount`,
          'only a slot of a triggered ability takes up to as many targets as an amount read as it triggers',
        );
      } else if (
        spec.min !== undefined ||
        spec.max !== undefined ||
        spec.divide !== undefined ||
        spec.onePerOpponent !== undefined ||
        spec.upToThatMany !== undefined ||
        spec.upToTriggerAmount !== undefined ||
        spec.anyNumber !== undefined ||
        spec.countX !== undefined
      ) {
        issue(out, p, 'up to as many targets as an amount has no min, max or other count');
      } else {
        checkAmount(spec.upToAmount, `${p}.upToAmount`, NO_SCOPE, out);
        if (typeof spec.upToAmount === 'object' && READS_NO_OBJECT.has(spec.upToAmount.kind)) {
          issue(out, `${p}.upToAmount`, 'the number of targets reads the game, not an object');
        }
      }
    }
    if (spec.countX !== undefined) {
      // D-386, CR 107.3a, 601.2b, 601.2c: "X target creature cards": exactly as many targets as the X announced for the spell.
      if (spec.countX !== true) {
        issue(out, `${p}.countX`, 'countX must be true when present');
      } else if (!countXAllowed) {
        issue(
          out,
          `${p}.countX`,
          "only a slot of a spell's own text or of a mode of a spell with an X (not an ability) takes as many targets as the X announced",
        );
      } else if (
        (spec.min !== undefined && spec.min !== 0) ||
        spec.max !== undefined ||
        spec.divide !== undefined ||
        spec.onePerOpponent !== undefined ||
        spec.upToThatMany !== undefined ||
        spec.upToTriggerAmount !== undefined ||
        spec.anyNumber !== undefined ||
        spec.ifKicked !== undefined ||
        spec.unlessKicked !== undefined ||
        spec.ifGiftPromised !== undefined
      ) {
        issue(
          out,
          p,
          'X targets have no min, max, divide, onePerOpponent, upToThatMany, anyNumber or kicker or gift condition',
        );
      } else if (what?.kind !== 'object') {
        issue(out, `${p}.what`, 'X targets are objects (cards or permanents), not players');
      }
    }
    if (spec.anyNumber !== undefined) {
      // CR 115.1 (D-234): "any number of target ...": none at least, every legal target at most.
      if (spec.anyNumber !== true) {
        issue(out, `${p}.anyNumber`, 'anyNumber must be true when present');
      } else if (
        spec.min !== undefined ||
        spec.max !== undefined ||
        spec.divide !== undefined ||
        spec.onePerOpponent !== undefined ||
        spec.upToThatMany !== undefined ||
        spec.upToTriggerAmount !== undefined
      ) {
        issue(
          out,
          p,
          'any number of targets has no min, max, divide, onePerOpponent or upToThatMany',
        );
      }
    }
    if (spec.min !== undefined && !isCount(spec.min)) {
      issue(out, `${p}.min`, 'min must be a non-negative integer');
    }
    if (spec.max !== undefined && (!isCount(spec.max) || spec.max < 1)) {
      issue(out, `${p}.max`, 'max must be a positive integer');
    }
    if (isCount(spec.min) && isCount(spec.max) && spec.min > spec.max) {
      issue(out, p, `min ${spec.min} is greater than max ${spec.max}`);
    }
    if (spec.onePerOpponent !== undefined) {
      // D-149: "for each opponent, up to one target ... that player controls".
      if (spec.onePerOpponent !== true) {
        issue(out, `${p}.onePerOpponent`, 'onePerOpponent must be true when present');
      }
      if (
        what?.kind !== 'object' ||
        !filterSome(what.filter, (f) => f.controller === 'opponent') ||
        (what.filter.anyOf !== undefined && what.filter.controller !== 'opponent')
      ) {
        issue(
          out,
          `${p}.what`,
          'a slot with one target for each opponent names permanents that opponent controls (controller "opponent" on the filter)',
        );
      }
      if (spec.divide !== undefined) {
        issue(
          out,
          `${p}.onePerOpponent`,
          'a slot cannot divide and take one target for each opponent',
        );
      }
      if (isCount(spec.min) && spec.min > 0) {
        issue(out, `${p}.min`, '"up to one for each opponent" has no minimum');
      }
    }
    if (spec.totalPowerAtMost !== undefined) {
      // Reunion of the House (CR 115.1, 208.1): "any number of target creature cards with total power 10 or less".
      if (!Number.isInteger(spec.totalPowerAtMost) || spec.totalPowerAtMost < 0) {
        issue(out, `${p}.totalPowerAtMost`, 'totalPowerAtMost must be a whole number, 0 or more');
      }
      if (what?.kind !== 'object') {
        issue(out, `${p}.what`, 'a total power limit is for objects (cards or permanents)');
      }
      if (
        spec.anyNumber !== true ||
        spec.divide !== undefined ||
        spec.countX !== undefined ||
        spec.onePerOpponent !== undefined ||
        spec.differentControllers !== undefined ||
        spec.upToThatMany !== undefined
      ) {
        issue(
          out,
          `${p}.totalPowerAtMost`,
          'a total power limit goes with any number of targets, and not with divide, countX, onePerOpponent, differentControllers or upToThatMany',
        );
      }
    }
    if (spec.differentControllers !== undefined) {
      // Hylda group 3 (CR 115.1, 601.2c): "any number of target tapped creatures with different controllers".
      if (spec.differentControllers !== true) {
        issue(out, `${p}.differentControllers`, 'differentControllers must be true when present');
      }
      if (what?.kind !== 'object') {
        issue(
          out,
          `${p}.what`,
          'a slot of targets with different controllers names objects (permanents), not players',
        );
      } else if (
        (what.filter.zone ?? 'battlefield') !== 'battlefield' &&
        // Issue 102 (Afterlife from the Loam): "For each player, choose up to one target creature card in that player's graveyard": cards of graveyards, one for each owner.
        what.filter.zone !== 'graveyard'
      ) {
        issue(
          out,
          `${p}.what`,
          'targets with different controllers are permanents on the battlefield, or cards in graveyards (one for each owner)',
        );
      }
      if (
        spec.onePerOpponent !== undefined ||
        spec.divide !== undefined ||
        spec.countX !== undefined ||
        spec.upToThatMany !== undefined
      ) {
        issue(
          out,
          p,
          'targets with different controllers have no onePerOpponent, divide, countX or upToThatMany',
        );
      }
    }
    if (spec.differentFrom !== undefined) {
      // CR 115.3 (D-151): "other targets": an earlier slot of the ability, not this one.
      if (typeof spec.differentFrom !== 'string' || !declared.has(spec.differentFrom)) {
        issue(
          out,
          `${p}.differentFrom`,
          'differentFrom names an earlier target slot of the same ability',
        );
      }
    }
    if (spec.alsoDifferentFrom !== undefined) {
      // CR 115.3: more earlier slots of the same ability the targets of this one differ from; a nearest slot (`differentFrom`) goes with them.
      if (
        spec.differentFrom === undefined ||
        !Array.isArray(spec.alsoDifferentFrom) ||
        spec.alsoDifferentFrom.length === 0 ||
        spec.alsoDifferentFrom.some((id) => typeof id !== 'string' || !declared.has(id))
      ) {
        issue(
          out,
          `${p}.alsoDifferentFrom`,
          'alsoDifferentFrom names earlier target slots of the same ability, with differentFrom',
        );
      }
    }
    if (spec.ownedByTarget !== undefined) {
      // CR 115.1, 608.2b: cards in the graveyard of the player an earlier slot of the ability targets.
      if (typeof spec.ownedByTarget !== 'string' || declared.get(spec.ownedByTarget) !== 'player') {
        issue(out, `${p}.ownedByTarget`, 'ownedByTarget names an earlier player target slot');
      }
      if (what?.kind !== 'object' || what.filter.zone !== 'graveyard') {
        issue(out, `${p}.what`, 'ownedByTarget is said of cards in a graveyard');
      }
    }
    if (spec.divide !== undefined) {
      // CR 601.2d (D-145): the division is announced as the spell is cast, so the total is an amount that reads the game then.
      if (!divideAllowed) {
        issue(
          out,
          `${p}.divide`,
          "only the targets of a spell's own text, an activated ability or a triggered ability (not a mode) can have a division",
        );
      }
      if (kindOf(spec.divide.total) === 'x') {
        // CR 107.3a, 601.2b, 601.2d: "Distribute X +1/+1 counters among ...": the X is announced before the targets are chosen and the division, so the total is read as the X
        // announced for the spell (`validateSpell` checks that the spell announces one). Only a spell's own text announces an X before its targets.
        if (countXAllowed !== true) {
          issue(
            out,
            `${p}.divide.total`,
            "only a slot of a spell's own text (not an ability or a mode) divides the X announced for the spell",
          );
        }
      } else {
        checkStateAmount(spec.divide.total, `${p}.divide.total`, out, 'a division');
      }
    }
    if (typeof spec.id === 'string' && spec.id !== '' && what !== undefined) {
      if (!declared.has(spec.id)) declared.set(spec.id, what.kind);
    }
  });
  return declared;
}

// ---- Selectors

function checkTargetRef(
  id: string,
  expect: 'object' | 'player' | 'any',
  path: string,
  scope: Scope,
  out: Out,
): void {
  const kind = scope.targets.get(id);
  if (kind === undefined) {
    issue(out, path, `target "${id}" is not declared on this ability or spell mode`);
    return;
  }
  if (expect === 'object' && kind === 'player') {
    issue(out, path, `target "${id}" is a player but an object is required here`);
  } else if (expect === 'player' && (kind === 'object' || kind === 'objectOrGraveyardCard')) {
    issue(out, path, `target "${id}" is an object but a player is required here`);
  }
}

export function checkRef(
  ref: ObjectRef,
  expect: 'object' | 'player' | 'any',
  path: string,
  scope: Scope,
  out: Out,
): void {
  switch (ref?.kind) {
    case 'this':
      if (scope.owner === 'spell') {
        issue(out, path, "'this' is only valid in abilities; spell text uses 'thisSpell'");
      }
      break;
    case 'thisSpell':
      if (scope.owner === 'ability') {
        issue(out, path, "'thisSpell' is only valid in spell text; abilities use 'this'");
      }
      break;
    case 'target':
      checkTargetRef(ref.id, expect, path, scope, out);
      break;
    case 'chosen':
      if (!scope.chosenObjects?.has(ref.id))
        issue(out, path, "'chosen' needs an earlier chooseObjects instruction");
      break;
    case 'boundObjects':
      issue(
        out,
        path,
        "'boundObjects' is the engine's own form of 'moved' in a delayed ability and is never written in a card",
      );
      break;
    case 'moved':
      if (scope.movedAvailable !== true) {
        issue(
          out,
          path,
          "'moved' needs an exile, destroy or moveToZone effect before it in the sequence",
        );
      }
      break;
    case 'triggerSubject':
      // The engine reads it only where a node says so (`checkSubjectRef`), not in any selector.
      issue(
        out,
        path,
        "'triggerSubject' is only valid as the object of counterUnlessPays or as the source of a copy",
      );
      break;
    case 'thisCard':
      // Read only where a node says so: the object of a moveToZone in an ability (Persist's "return it").
      issue(out, path, "'thisCard' is only valid as the object of moveToZone in an ability");
      break;
    case 'convokers':
      // Lethal Scheme: the creatures that convoked the spell, read in the effect of a spell.
      if (scope.owner !== 'spell') {
        issue(out, path, "'convokers' is only valid in the effect of a spell");
      }
      break;
    case 'triggerSources':
      // Tamiyo, Upriser Crowned: the creatures of the batch of combat damage that triggered the ability.
      if (scope.triggerSources !== true) {
        issue(
          out,
          path,
          "'triggerSources' needs a triggered ability of a combatDamageBatch or becomesBlockedBy trigger",
        );
      }
      break;
    case 'triggerAttackers':
      // Champions from Beyond: the creatures of the attack event of an `attackBatch` trigger (`scope.triggerAttackerCount` is set only there).
      if (scope.triggerAttackerCount !== true) {
        issue(out, path, "'triggerAttackers' needs a triggered ability of an attackBatch trigger");
      }
      break;
    case 'triggerCard':
      // D-230: read only where a node says so: the object of a moveToZone or an exile in a triggered ability.
      issue(
        out,
        path,
        "'triggerCard' is only valid as the object of moveToZone or exile in a triggered ability",
      );
      break;
    case 'attached':
      // D-139: "enchanted creature", "equipped creature": the permanent this Aura or Equipment is attached to (an ability's).
      if (scope.owner === 'spell') {
        issue(out, path, "'attached' is only valid in abilities of an Aura or an Equipment");
      }
      break;
    case 'putWithThis':
      // CR 400.7 (Animate Dead): "that creature", what the permanent put onto the battlefield with `moveToZone.putWithSource`: the permanent's own, so an ability's.
      if (scope.owner === 'spell') {
        issue(out, path, "'putWithThis' is only valid in abilities of a permanent");
      }
      break;
    case 'linkedExile':
      // D-145: "the exiled card" of a linked ability: the permanent's own, so an ability's (the face needs the ability that exiles it).
      if (scope.owner === 'spell') {
        issue(
          out,
          path,
          "'linkedExile' is only valid in abilities of a permanent with a linked exile",
        );
      }
      // D-460: "each creature card exiled with this artifact": the cards of the link a filter of cards in exile describes.
      if (ref.filter !== undefined) {
        checkFilter(ref.filter, `${path}.filter`, out);
        if (
          filterSome(
            ref.filter,
            (f) =>
              f.zone !== undefined ||
              f.controller !== undefined ||
              f.owner !== undefined ||
              f.stackKind !== undefined,
          )
        ) {
          issue(
            out,
            `${path}.filter`,
            'the cards exiled with a permanent are described by what they are: no zone, controller, owner or stackKind',
          );
        }
      }
      break;
    default:
      issue(out, path, `unknown object reference ${kindOf(ref)}`);
  }
}

/**
 * The objects a continuous effect or a counter effect acts on (D-133): a selector, or "it", the permanent a trigger is
 * about ("it gains haste until end of turn", "put a +1/+1 counter on it").
 */
export function checkAffectedObjects(
  sel: ObjectSelector,
  path: string,
  scope: Scope,
  out: Out,
): void {
  if (kindOf(sel) === 'triggerSubject')
    checkSubjectRef(sel as ObjectRef, 'permanent', path, scope, out);
  else checkObjectSelector(sel, path, scope, out);
}

export function checkObjectSelector(
  sel: ObjectSelector,
  path: string,
  scope: Scope,
  out: Out,
  expect: 'object' | 'any' = 'object',
): void {
  if (kindOf(sel) === 'each') {
    const each = sel as Extract<ObjectSelector, { kind: 'each' }>;
    checkFilter(each.filter, `${path}.filter`, out, scope);
    // D-151: "each other creature" besides the one an effect names.
    // D-650: "each other creature that's attacking ..." of an Aura's attack trigger: besides the creature the trigger is about.
    if (each.except?.kind === 'triggerSubject') {
      checkSubjectRef(each.except, 'permanent', `${path}.except`, scope, out);
    } else if (each.except !== undefined) {
      checkRef(each.except, 'object', `${path}.except`, scope, out);
    }
    return;
  }
  checkRef(sel as ObjectRef, expect, path, scope, out);
}

/**
 * CR 120.2a, 510.2: the kind of source of combat damage a turn-log read names (`combatDamagedBy`, `combatDamagedThisTurn`): the turn log keeps only the card types, the subtypes and who
 * controlled the source, so the filter names those and nothing else, and at least the types or the subtypes.
 */
function checkCombatDamageSourceKind(f: unknown, path: string, what: string, out: Out): void {
  if (f === undefined || f === null || typeof f !== 'object') {
    issue(out, path, `${what} needs a filter of the damage source`);
    return;
  }
  const g = f as {
    types?: unknown;
    subtypes?: unknown;
    controller?: unknown;
  };
  checkEnumList(
    out,
    `${path}.types`,
    g.types as readonly unknown[] | undefined,
    CARD_TYPES,
    'card type',
  );
  if (g.subtypes !== undefined && (!Array.isArray(g.subtypes) || g.subtypes.length === 0)) {
    issue(out, `${path}.subtypes`, 'subtypes must be a non-empty list when present');
  }
  if (g.controller !== undefined && !isOneOf(g.controller, ['you', 'opponent', 'any'])) {
    issue(out, `${path}.controller`, 'the controller is you, opponent or any');
  }
  const extra = Object.keys(g).filter(
    (k) => k !== 'types' && k !== 'subtypes' && k !== 'controller',
  );
  if (extra.length > 0) {
    issue(
      out,
      path,
      `the turn log keeps only the types, subtypes and controller of the source: not ${extra.join(', ')}`,
    );
  }
  if (g.types === undefined && g.subtypes === undefined) {
    issue(out, path, 'name the card types or the subtypes of the source');
  }
}

/**
 * Selectors that can name more than one player (CR 101.4, 800.4): an operand that reads one player ("its life total", "that player adds", "reveals") would read the first
 * of them and ignore the rest with 3 or 4 seats. `eachOpponent` is one player only in a 1v1 game.
 */
export function selectsSeveralPlayers(sel: PlayerSelector | undefined): boolean {
  switch (sel?.kind) {
    case 'eachPlayer':
    case 'eachOpponent':
    case 'eachOtherOpponent':
    case 'eachPlayerExcept':
    case 'eachPlayerControlling':
    case 'attackedPlayers':
    case 'triggerDamagedPlayers':
    case 'combatDamagedByNamed':
    case 'lostLifeThisTurn':
    case 'combatDamagedThisTurn':
    case 'opponentsAttackingTriggerPlayer':
    case 'all':
      return true;
    default:
      return false;
  }
}

function checkSinglePlayer(sel: PlayerSelector | undefined, path: string, what: string, out: Out) {
  if (selectsSeveralPlayers(sel)) {
    issue(out, path, `${what} reads one player: name a single player (a target, 'you', ...)`);
  }
}

export function checkPlayerSelector(sel: PlayerSelector, path: string, scope: Scope, out: Out) {
  switch (sel?.kind) {
    case 'you':
    case 'eachPlayer':
    case 'eachOpponent':
    case 'defendingPlayer':
    case 'playerToYourRight':
    case 'chosenPlayer':
      break;
    case 'eachOtherOpponent':
      // D-151: "each other opponent": besides the player the event is about, so the trigger must have one.
      if (scope.triggerPlayer !== true) {
        issue(
          out,
          path,
          "'eachOtherOpponent' needs a triggered ability whose event is about a player",
        );
      }
      break;
    case 'eachPlayerControlling':
      // CR 102.1, 109.4 (Shatter the Sky): "each player who controls a creature with power 4 or greater": the filter reads battlefield permanents, each player as "you".
      checkFilter(sel.filter, `${path}.filter`, out);
      if (sel.filter?.zone !== undefined && sel.filter.zone !== 'battlefield') {
        issue(out, `${path}.filter.zone`, 'only permanents on the battlefield can be counted');
      }
      if (sel.filter?.controller !== undefined) {
        issue(
          out,
          `${path}.filter.controller`,
          "'each player who controls' names the controller itself",
        );
      }
      break;
    case 'eachPlayerExcept':
      // CR 102.1 (Oft-Nabbed Goat): "each other player": the players the `except` selector does not name.
      checkPlayerSelector(sel.except, `${path}.except`, scope, out);
      break;
    case 'triggerPlayer':
      // D-133: "that player": only a trigger whose event is about a player has one.
      if (scope.triggerPlayer !== true) {
        issue(
          out,
          path,
          "'triggerPlayer' needs a triggered ability whose event is about a player (a draw, a cast, an attack, damage to a player, becoming a target, a sacrifice)",
        );
      }
      break;
    case 'triggerAttackedPlayer':
      // D-648: "that opponent": the player a `playerAttacksOpponent` trigger is about.
      // CR 508.6: an attack batch of a whole declaration may attack several players, so "that opponent" is one player only with `eachAttackedPlayer`.
      if (scope.triggerAttackedSingle !== true) {
        issue(
          out,
          path,
          "'triggerAttackedPlayer' is only valid in a triggered ability about one attacked player: a player attacking one of your opponents, or an attack batch with eachAttackedPlayer",
        );
      }
      break;
    case 'opponentsAttackingTriggerPlayer':
      // Issue 159 (CR 508.6): "each opponent attacking that player": the trigger is about an attacked player.
      if (scope.triggerPlayer !== true) {
        issue(
          out,
          path,
          "'opponentsAttackingTriggerPlayer' needs the effect of a trigger about an attacked player (attackBatch)",
        );
      }
      break;
    case 'triggerDamagedPlayers':
      // CR 603.2c: "each of those opponents": the opponents a batch of sources damaged in one event.
      if (scope.triggerDamagedPlayers !== true) {
        issue(
          out,
          path,
          "'triggerDamagedPlayers' needs the effect of a trigger of damage dealt to your opponents by a group of sources (damageBatch to 'opponents')",
        );
      }
      break;
    case 'declinedPlayer':
      if (scope.declinedPlayer !== true) {
        issue(out, path, "'declinedPlayer' is only valid in a playersMay 'otherwise' effect");
      }
      break;
    case 'giftRecipient':
      // D-135: "the chosen player" of a gift: the face must have the Gift keyword (`checkCastFace`).
      break;
    case 'attackedPlayers':
      // D-269 (CR 508.6): "each player this creature attacked this turn": the permanent of an ability, never a spell (a spell attacks nothing).
      if (kindOf(sel.of) !== 'this') {
        issue(out, `${path}.of`, "'attackedPlayers' reads the attacks of this permanent ('this')");
      } else if (scope.owner !== 'ability') {
        issue(out, path, "'attackedPlayers' needs an ability of a permanent, not a spell");
      }
      break;
    case 'combatDamagedByNamed':
      // CR 120.2a: "each opponent dealt combat damage this game by a creature named X": a non-empty name, read from the game history anywhere.
      if (typeof sel.name !== 'string' || sel.name === '') {
        issue(out, `${path}.name`, "'combatDamagedByNamed' needs the name of the creature");
      }
      break;
    case 'lostLifeThisTurn':
    case 'combatDamagedThisTurn':
      // CR 119.3, 120.2a: the players of a group (every player or every opponent) the turn log says lost life, or were dealt combat damage by the sources named.
      if (kindOf(sel.of) !== 'eachPlayer' && kindOf(sel.of) !== 'eachOpponent') {
        issue(out, `${path}.of`, `'${sel.kind}' reads the group 'eachPlayer' or 'eachOpponent'`);
      }
      if (sel.kind === 'combatDamagedThisTurn') {
        if (sel.byThis !== undefined && sel.byThis !== true) {
          issue(out, `${path}.byThis`, 'byThis is true when present');
        }
        if (sel.byThis === undefined && sel.by === undefined) {
          issue(out, path, "'combatDamagedThisTurn' names the source: byThis, by, or both");
        } else if (sel.by !== undefined) {
          checkCombatDamageSourceKind(sel.by, `${path}.by`, 'combatDamagedThisTurn', out);
        }
        if (sel.byThis === true && scope.owner !== 'ability') {
          issue(out, path, "'byThis' needs an ability of a permanent, not a spell");
        }
      }
      break;
    case 'discardedThisWay':
      // D-210: "each player who discarded a card this way": a discard before it in the same sequence.
      if (!(scope.thisWay ?? []).includes('discarded')) {
        issue(
          out,
          path,
          "'discardedThisWay' needs a discard effect before it in the same sequence",
        );
      }
      break;
    case 'couldntSacrificeThisWay':
      // CR 701.21a (Plaguecrafter): "each player who can't": a sacrifice before it in the same sequence.
      if (!(scope.thisWay ?? []).includes('sacrificed')) {
        issue(
          out,
          path,
          "'couldntSacrificeThisWay' needs a sacrifice effect before it in the same sequence",
        );
      }
      break;
    case 'all':
      // D-131: "you and target opponent": two or more selectors, each a selector of its own (not another `all`).
      if (!Array.isArray(sel.of) || sel.of.length < 2) {
        issue(out, `${path}.of`, 'all names at least two player selectors');
      } else {
        sel.of.forEach((member, i) => {
          if (kindOf(member) === 'all') {
            issue(
              out,
              `${path}.of[${i}]`,
              'a list of players does not nest: list the members once',
            );
          } else {
            checkPlayerSelector(member, `${path}.of[${i}]`, scope, out);
          }
        });
      }
      break;
    case 'controllerOf':
    case 'ownerOf':
      if (kindOf(sel.of) === 'triggerSubject') {
        // D-111: "that spell's controller", "that player": the object whose event caused the trigger,
        // a spell or ability or a permanent (last-known information once it is gone, CR 608.2h).
        if (scope.triggerSubject === undefined) {
          issue(
            out,
            `${path}.of`,
            "'triggerSubject' needs a triggered ability whose trigger has a subject",
          );
        }
      } else {
        checkRef(sel.of, 'object', `${path}.of`, scope, out);
      }
      break;
    case 'target':
      checkTargetRef(sel.id, 'player', path, scope, out);
      break;
    default:
      issue(out, path, `unknown player selector ${kindOf(sel)}`);
  }
}

export const PLAYER_ONLY = [
  'you',
  'eachPlayer',
  'eachOpponent',
  'eachOtherOpponent',
  'eachPlayerExcept',
  'eachPlayerControlling',
  'all',
  'controllerOf',
  'ownerOf',
  'defendingPlayer',
  'playerToYourRight',
  'chosenPlayer',
  'triggerPlayer',
  'triggerDamagedPlayers',
  'attackedPlayers',
  'combatDamagedByNamed',
  'lostLifeThisTurn',
  'combatDamagedThisTurn',
];

export function checkDamageRecipient(
  to: ObjectSelector | PlayerSelector | AttackedBySelector,
  path: string,
  scope: Scope,
  out: Out,
): void {
  if (kindOf(to) === 'attackedBy') {
    // CR 508.1b (D-139): "the player or planeswalker it's attacking": the attacker is this permanent or the permanent a trigger is about.
    checkDamageSource((to as AttackedBySelector).of, `${path}.of`, scope, out);
    return;
  }
  if (PLAYER_ONLY.includes(kindOf(to))) {
    checkPlayerSelector(to as PlayerSelector, path, scope, out);
  } else {
    // Damage may go to a creature, planeswalker, battle or player (CR 120.2): any target kind.
    checkObjectSelector(to as ObjectSelector, path, scope, out, 'any');
  }
}

/**
 * The creature that deals the damage of a `dealDamage` with `from` (D-131): a target of the spell or ability (a
 * creature slot), this permanent, or the permanent a trigger is about. A spell has no "this" permanent that deals
 * damage as a creature, so `thisSpell` is not a source here.
 */
function checkDamageSource(ref: ObjectRef, path: string, scope: Scope, out: Out): void {
  switch (kindOf(ref)) {
    case 'triggerSubject':
      checkSubjectRef(ref, 'permanent', path, scope, out);
      break;
    case 'this':
    case 'target':
      checkRef(ref, 'object', path, scope, out);
      break;
    default:
      issue(
        out,
        path,
        'damage is dealt by a target creature, this permanent or the permanent the trigger is about',
      );
  }
}

// ---- Amounts

/** The effect each `thisWay` count is made of (D-131). */
const THIS_WAY_SOURCES: Readonly<Record<ThisWayKind, string>> = {
  sacrificed: 'a sacrifice effect',
  sacrificedOwn: 'a sacrifice effect',
  destroyed: 'a destroy effect',
  destroyedOwnNontoken: 'a destroy effect',
  destroyedNontokenCreatures: 'a destroy effect',
  destroyedValue: 'a destroy effect',
  exiledNonland: 'an exileOwnGraveyardCard effect',
  returned: 'a moveToZone effect that chooses cards of a graveyard',
  playersDrew: 'a draw effect',
  tapped: 'a tap effect',
  discarded: 'a discard effect',
  milledValue: 'a mill effect',
  milledCreature: 'a mill effect',
  discardedCreature: 'a discard effect',
  discardedNoncreature: 'a discard effect',
  discardedNonland: 'a discard effect',
  countersPut: 'an addCounters effect',
  discardedInstantOrSorcery: 'a discard effect',
  discardedMost: 'a discard effect',
  damageDealt: 'a dealDamage effect',
  excessDamageDealt: 'a dealDamage effect',
  countersRemoved: 'a removeAllCounters or removeChosenCounters effect',
  searched: 'a search effect',
  exiledPowerOwn: 'an exile effect',
  destroyedCreaturesOfAffected: 'a destroy effect',
  exiledCreatures: 'an exile effect',
  discardedTypeCount: 'a discard effect',
};

/** Every `thisWay` count, one source of truth for the validator (the conditions and the amounts both read them from `ThisWayCounts`, D-131, D-210, D-358). */
const THIS_WAY_KINDS = Object.keys(THIS_WAY_SOURCES);

/** The `thisWay` counts an effect always produces (a `conditional` may not run, so it does not count). */
function thisWayProduced(e: Effect): ThisWayKind[] {
  if (e?.kind === 'sequence')
    return Array.isArray(e.effects) ? e.effects.flatMap(thisWayProduced) : [];
  if (e?.kind === 'sacrifice') return ['sacrificed', 'sacrificedOwn'];
  if (e?.kind === 'destroy')
    return [
      'destroyed',
      'destroyedOwnNontoken',
      'destroyedNontokenCreatures',
      'destroyedValue',
      'destroyedCreaturesOfAffected',
    ];
  if (e?.kind === 'exileOwnGraveyardCard') return ['exiledNonland'];
  if (
    e?.kind === 'moveToZone' &&
    e.to === 'battlefield' &&
    e.objects?.kind === 'choose' &&
    e.objects.filter?.zone === 'graveyard'
  ) {
    return ['returned'];
  }
  if (e?.kind === 'draw') return ['playersDrew'];
  if (e?.kind === 'tap') return ['tapped'];
  if (e?.kind === 'discard')
    return [
      'discarded',
      'discardedCreature',
      'discardedNoncreature',
      'discardedNonland',
      'discardedInstantOrSorcery',
      'discardedMost',
      'discardedTypeCount',
    ];
  if (e?.kind === 'mill') return ['milledValue', 'milledCreature'];
  if (e?.kind === 'dealDamage') return ['damageDealt', 'excessDamageDealt'];
  // Federation Fleet group D (CR 122.6, 608.2c): "If you put two or more +1/+1 counters on creatures this way".
  if (e?.kind === 'addCounters') return ['countersPut'];
  // "You may reveal the top card of your library. Draw a card if it's an artifact card": what the effect done for a card of the kind produced.
  if (e?.kind === 'revealTop' && e.onMatch !== undefined) return thisWayProduced(e.onMatch);
  if (e?.kind === 'removeAllCounters' || e?.kind === 'removeChosenCounters') {
    return ['countersRemoved'];
  }
  // Oversimplify: the creatures an exile really exiled, by controller.
  if (e?.kind === 'exile') return ['exiledPowerOwn', 'exiledCreatures'];
  // Lorehold group 1: "If you search your library this way, shuffle."
  if (e?.kind === 'search') return ['searched'];
  // D-210: what the players asked do is counted whether or not anyone accepts (the counts are 0 then).
  if (e?.kind === 'playersMay') return thisWayProduced(e.effect);
  // "You may discard all the cards in your hand. If you do, draw that many cards": a declined offer counts 0.
  if (e?.kind === 'may') return thisWayProduced(e.effect);
  return [];
}

export const PLAYER_STATS = ['life', 'cardsInHand', 'creatures', 'lands'];

/** The scope of an amount that reads the game only (a condition, a cost reduction): no target, no X, the permanent's own `this`. */
const NO_SCOPE: Scope = {
  owner: 'ability',
  targets: new Map(),
  xAllowed: false,
  checkAbility: () => undefined,
  checkContinuous: () => undefined,
  checkEffectExt: () => false,
};

/**
 * The object an amount reads a value of (a power, a toughness, counters): a selector reference, or the permanent a
 * trigger is about ("that creature's toughness", D-131; last-known information once it has left, CR 113.7a).
 */
function checkAmountObject(
  ref: ObjectRef,
  path: string,
  scope: Scope,
  out: Out,
  /** D-179: a mana value is the one stat a spell has (CR 202.3), so `manaValueOf` may read the spell that caused a cast trigger. */
  spellSubject = false,
): void {
  if (kindOf(ref) === 'triggerSubject') {
    checkSubjectRef(
      ref,
      spellSubject && scope.triggerSubject === 'stack' ? 'stack' : 'permanent',
      path,
      scope,
      out,
    );
  } else if (kindOf(ref) === 'eachObject') {
    if (scope.eachObject !== true) {
      issue(out, path, "'eachObject' is only read in the count of an addCounters with perObject");
    }
  } else if (kindOf(ref) === 'sacrificedCost') checkSacrificedCost(path, scope, out);
  else if (kindOf(ref) === 'sacrificed') checkSacrificedEarlier(path, scope, out);
  else checkRef(ref, 'object', path, scope, out);
}

/** "That creature", the permanent an earlier sacrifice of the same resolution sacrificed (D-177): read in an amount, after the `sacrifice` or in the reflexive ability after it. */
function checkSacrificedEarlier(path: string, scope: Scope, out: Out): void {
  if (scope.sacrificedEarlier !== true) {
    issue(
      out,
      path,
      "'sacrificed' needs a sacrifice effect before it in the sequence, or before the reflexive trigger it is in (and is read only in an amount)",
    );
  }
}

/** "The sacrificed creature" (D-133): read in the effect of an activated ability whose cost sacrifices something. */
function checkSacrificedCost(path: string, scope: Scope, out: Out): void {
  if (scope.sacrificedCost !== true) {
    issue(
      out,
      path,
      "'sacrificedCost' needs an activated ability whose cost sacrifices a permanent (and is read only in an amount)",
    );
  }
}

/**
 * The amounts a condition or a cost reduction may read (D-131): what the game says right now with no target, X,
 * trigger subject or earlier instruction to read. Counts of objects, aggregates, devotion, the colors of the
 * commanders, the counters on this very permanent, opponents with more of something, and arithmetic on those.
 */
export function checkStateAmount(a: Amount, path: string, out: Out, label: string): void {
  if (typeof a === 'number') {
    if (!isCount(a)) issue(out, path, `amount ${a} must be a non-negative integer`);
    return;
  }
  switch (a?.kind) {
    case 'countOf':
    case 'aggregate':
    case 'devotion':
    case 'commanderColors':
    case 'commanderManaValue':
    case 'commanderCasts':
    case 'cardTypesAmong':
    case 'differentManaValuesAmong':
    case 'differentNamesAmong':
    case 'colorsAmong':
    case 'opponentsWithMore':
    case 'chosenPlayerLead':
    case 'opponentCount':
    case 'lifeGainedThisTurn':
    case 'controllerLifeLostThisTurn':
    case 'lifeGainedOrLostThisTurn':
    case 'enteredThisTurn':
    case 'diedThisTurn':
      checkAmount(a, path, NO_SCOPE, out);
      break;
    case 'countersOn':
      if (kindOf(a.of) !== 'this') {
        issue(out, `${path}.of`, `${label} reads the counters on this permanent only`);
      }
      checkAmount(a, path, NO_SCOPE, out);
      break;
    case 'half':
    case 'multiple':
      checkAmount({ ...a, of: 0 }, path, NO_SCOPE, out);
      checkStateAmount(a.of, `${path}.of`, out, label);
      break;
    case 'sum':
      checkAmount({ ...a, of: [0, 0] }, path, NO_SCOPE, out);
      if (Array.isArray(a.of)) {
        a.of.forEach((part, i) => {
          checkStateAmount(part, `${path}.of[${i}]`, out, label);
        });
      }
      break;
    default:
      issue(
        out,
        path,
        `${label} reads what the game says now (a count, a greatest or total, devotion, ...), not ${kindOf(a)}`,
      );
  }
}

/** D-183: the card type of the source of the mana an amount counts, when it names one: a card type of CR 205.2a, in lower case. */
export function checkManaSpentType(
  type: string | undefined,
  path: string,
  out: Out,
  snow?: unknown,
): void {
  if (type !== undefined && !isOneOf(type, CARD_TYPES)) {
    issue(out, path, `fromType is a card type, not ${JSON.stringify(type)}`);
  }
  // D-260: "for each {S} spent" is the mana of snow sources, a different cut of the mana spent than a card type of the source.
  if (snow !== undefined && (snow !== true || type !== undefined)) {
    issue(out, path, 'snow is true and is not given with fromType');
  }
}

export function checkAmount(a: Amount, path: string, scope: Scope, out: Out): void {
  if (typeof a === 'number') {
    if (!isCount(a)) issue(out, path, `amount ${a} must be a non-negative integer`);
    return;
  }
  switch (a?.kind) {
    case 'tappedAsCostPower':
      // CR 702.184a (Station): the power of the creature tapped for the cost, read when the ability resolves.
      if (scope.tappedCost !== true) {
        issue(
          out,
          path,
          "'tappedAsCostPower' needs an activated ability whose cost taps permanents (a tapPermanents cost)",
        );
      }
      break;
    case 'x':
      if (!scope.xAllowed)
        issue(out, path, 'X is used but nothing in this ability or spell has an X');
      break;
    case 'dieResult':
      // CR 706.2 (Galadriel group 3): "Scry X, where X is the result": the die rolled earlier in the same sequence (`scope.dieSides` is set after a `rollDie`).
      if (scope.dieSides === undefined) {
        issue(
          out,
          path,
          'dieResult needs a rollDie before it in the same sequence (the result of the roll is what it reads)',
        );
      }
      break;
    case 'aurasAttachedToTriggerSubject':
      // CR 603.10a, 113.7a (D-654): the Auras that were attached to the permanent the trigger is about as it left.
      if (scope.triggerSubject !== 'permanent') {
        issue(
          out,
          path,
          "'aurasAttachedToTriggerSubject' needs a trigger whose subject is a permanent",
        );
      }
      if (a.controlledBy !== 'you')
        issue(out, `${path}.controlledBy`, "controlledBy must be 'you'");
      break;
    case 'enteredX':
      // CR 107.3m (Hylda group 3): only the enters trigger of the permanent itself reads the X of the spell it came from (the card's {X} is checked with the face).
      if (scope.entersX !== true) {
        issue(
          out,
          path,
          "'enteredX' needs a triggered ability whose trigger is this permanent entering the battlefield",
        );
      }
      break;
    case 'lifePaidAsEntered':
      // CR 119.4, 614.12: the face must pay life as it enters (`chosenIssues` checks it with the other entry-time choices).
      break;
    case 'attackersGreatestPower':
      // CR 508.1: the creatures of the attack event of an `attackBatch` trigger (`scope.triggerAttacked` is set only there).
      if (scope.triggerAttacked !== true) {
        issue(
          out,
          path,
          'attackersGreatestPower reads the creatures of an attackBatch trigger: it is only valid in the effect of one',
        );
      }
      break;
    case 'manaValueOf':
    case 'colorsOf':
      checkAmountObject(a.of, `${path}.of`, scope, out, true);
      break;
    case 'shortfall':
      // D-151: a positive whole number less the mana value of what an earlier effect moved or the like.
      if (!isCount(a.limit) || a.limit < 1) {
        issue(out, `${path}.limit`, 'limit must be a positive integer');
      }
      checkAmountObject(a.of, `${path}.of`, scope, out);
      break;
    case 'powerOf':
    case 'toughnessOf':
    case 'countersOn':
      checkAmountObject(a.of, `${path}.of`, scope, out);
      if (
        a.kind === 'countersOn' &&
        a.counter !== undefined &&
        (typeof a.counter !== 'string' || a.counter === '')
      ) {
        issue(out, `${path}.counter`, 'counter name must be non-empty');
      }
      break;
    case 'aggregate':
      // D-131: the greatest or the total of a stat over the objects a filter matches.
      if (!isOneOf(a.how, ['greatest', 'total'])) {
        issue(
          out,
          `${path}.how`,
          `an aggregate is "greatest" or "total", not ${JSON.stringify(a.how)}`,
        );
      }
      if (!isOneOf(a.stat, ['power', 'toughness', 'manaValue', 'counters'])) {
        issue(out, `${path}.stat`, `unknown stat ${JSON.stringify(a.stat)}`);
      }
      if (a.filter === undefined || a.filter === null) {
        issue(out, `${path}.filter`, 'an aggregate needs a filter');
      } else if (a.filter.controlledBy !== undefined) {
        // Death Toll deck, group D (CR 109.4, 608.2c): "the greatest power among creatures they control": the player is a target the effect declared, read as the amount
        // is worked out (with the targets), as a count's is; a player named any other way is not read here.
        const { controlledBy, ...rest } = a.filter;
        if (kindOf(controlledBy) !== 'target') {
          issue(
            out,
            `${path}.filter.controlledBy`,
            'an aggregate names the player whose objects it reads by a target of the ability or spell (controlledBy: target)',
          );
        } else {
          checkPlayerSelector(controlledBy, `${path}.filter.controlledBy`, scope, out);
        }
        if (rest.controller !== undefined) {
          issue(
            out,
            `${path}.filter.controller`,
            'controlledBy replaces controller: set one of them',
          );
        }
        checkFilter(rest, `${path}.filter`, out);
      } else {
        checkFilter(a.filter, `${path}.filter`, out);
      }
      break;
    case 'cardTypesAmong':
      // D-518: the distinct card types among the cards a filter matches in a zone outside the battlefield and the stack.
      if (a.filter === undefined || a.filter === null) {
        issue(out, `${path}.filter`, 'cardTypesAmong needs a filter');
      } else {
        checkFilter(a.filter, `${path}.filter`, out);
        if (
          filterSome(
            a.filter,
            (f) => f.zone === undefined || f.zone === 'battlefield' || f.zone === 'stack',
          )
        ) {
          issue(
            out,
            `${path}.filter.zone`,
            'cardTypesAmong counts the card types of cards in a zone (a graveyard, exile, the hand or the library)',
          );
        }
        if (
          filterSome(
            a.filter,
            (f) => readsCombatOrSource(f) || f.power !== undefined || f.toughness !== undefined,
          )
        ) {
          issue(
            out,
            `${path}.filter`,
            'cardTypesAmong cannot read the combat, the source power, power or toughness',
          );
        }
      }
      break;
    case 'differentNamesAmong':
      // Issue 101 (CR 201.2): the distinct names among the battlefield permanents a filter matches; no combat, source power, power or toughness is read.
      if (a.filter === undefined || a.filter === null) {
        issue(out, `${path}.filter`, 'differentNamesAmong needs a filter');
      } else {
        checkFilter(a.filter, `${path}.filter`, out);
        if (filterSome(a.filter, (f) => f.zone !== undefined && f.zone !== 'battlefield')) {
          issue(
            out,
            `${path}.filter.zone`,
            'differentNamesAmong counts the names of permanents on the battlefield',
          );
        }
        if (
          filterSome(
            a.filter,
            (f) => readsCombatOrSource(f) || f.power !== undefined || f.toughness !== undefined,
          )
        ) {
          issue(
            out,
            `${path}.filter`,
            'differentNamesAmong cannot read the combat, the source power, power or toughness',
          );
        }
      }
      break;
    case 'colorsAmong':
      // CR 105.2 (Vivid): the colors among the battlefield permanents a filter matches; no combat, source power, power or toughness is read.
      if (a.filter === undefined || a.filter === null) {
        issue(out, `${path}.filter`, 'colorsAmong needs a filter');
      } else {
        checkFilter(a.filter, `${path}.filter`, out);
        if (filterSome(a.filter, (f) => f.zone !== undefined && f.zone !== 'battlefield')) {
          issue(
            out,
            `${path}.filter.zone`,
            'only permanents on the battlefield have their colors counted',
          );
        }
        if (
          filterSome(
            a.filter,
            (f) => readsCombatOrSource(f) || f.power !== undefined || f.toughness !== undefined,
          )
        ) {
          issue(
            out,
            `${path}.filter`,
            'colorsAmong cannot read the combat, the source power, power or toughness',
          );
        }
      }
      break;
    case 'differentManaValuesAmong':
      // Issue 121 (CR 202.3): the distinct mana values among the cards a filter matches in a zone outside the battlefield and the stack.
      if (a.filter === undefined || a.filter === null) {
        issue(out, `${path}.filter`, 'differentManaValuesAmong needs a filter');
      } else {
        checkFilter(a.filter, `${path}.filter`, out);
        if (
          a.filter.zone === undefined ||
          filterSome(a.filter, (f) => f.zone === 'battlefield' || f.zone === 'stack')
        ) {
          issue(
            out,
            `${path}.filter.zone`,
            'differentManaValuesAmong counts the mana values of cards in a zone (a graveyard, exile, the hand or the library)',
          );
        }
        if (
          filterSome(
            a.filter,
            (f) => readsCombatOrSource(f) || f.power !== undefined || f.toughness !== undefined,
          )
        ) {
          issue(
            out,
            `${path}.filter`,
            'differentManaValuesAmong cannot read the combat, the source power, power or toughness',
          );
        }
      }
      break;
    case 'devotion':
      // CR 700.5: devotion to one or more of the five colors (colorless mana symbols are not a color).
      checkEnumList(out, `${path}.colors`, a.colors, COLORS, 'color');
      if (a.colors === undefined) issue(out, `${path}.colors`, 'devotion needs at least one color');
      break;
    case 'commanderColors':
    case 'commanderManaValue':
      break;
    case 'commanderCasts':
      // CR 903.8: "they've cast": the player a selector names, which may be a target of the effect.
      if (a.player !== undefined) {
        if (a.of !== undefined) issue(out, `${path}.player`, 'player and of are two readings');
        checkPlayerSelector(a.player, `${path}.player`, scope, out);
        checkSinglePlayer(a.player, `${path}.player`, 'commanderCasts', out);
      }
      break;
    case 'lifeTotalOf':
      // Issue 497: several players only where the amount is read per affected player ("a third of their life", Dire Fleet Ravager: the same selector as the gainLife/loseLife, `life-amounts.ts`).
      checkPlayerSelector(a.player, `${path}.player`, scope, out);
      if (
        selectsSeveralPlayers(a.player) &&
        JSON.stringify(a.player) !== JSON.stringify(scope.lifeAffected)
      ) {
        checkSinglePlayer(a.player, `${path}.player`, 'lifeTotalOf', out);
      }
      break;
    case 'playerCount':
      // CR 102.1: the number of players a selector names, read as the amount is read.
      checkPlayerSelector(a.of, `${path}.of`, scope, out);
      break;
    case 'poisonShortfall':
      // CR 122.1, 107.1b: a positive whole number less a player's poison counters, read as the instruction runs.
      if (!isCount(a.limit) || a.limit < 1) {
        issue(out, `${path}.limit`, 'limit must be a positive integer');
      }
      checkPlayerSelector(a.player, `${path}.player`, scope, out);
      checkSinglePlayer(a.player, `${path}.player`, 'poisonShortfall', out);
      break;
    case 'experienceCounters':
      // CR 122.1 (Meren of Clan Nel Toth): the controller's own experience counters now; valid wherever an amount of an effect is (statics refuse it in `checkStateAmount`).
      break;
    case 'cardsDrawnThisTurn':
      // D-450 (CR 121.1): the controller's own count this turn; valid wherever an amount of an effect is (statics refuse it in `checkStateAmount`).
      break;
    case 'cardsToGraveyardThisTurn':
      // Issue 102 (CR 404.1): the controller's own cards put into a graveyard this turn from the hand and/or the library (statics refuse it in `checkStateAmount`).
      if (
        !Array.isArray(a.from) ||
        a.from.length === 0 ||
        a.from.some((z) => z !== 'hand' && z !== 'library')
      ) {
        issue(out, `${path}.from`, 'from names the hand and/or the library');
      }
      for (const key of Object.keys(a)) {
        if (key !== 'kind' && key !== 'from') {
          issue(out, `${path}.${key}`, 'cards put into a graveyard this turn reads only the zones');
        }
      }
      break;
    case 'greatestManaValueCast':
    case 'spellsCastThisTurn':
      // D-638 (CR 601.2i): the controller's own count of the spells cast this turn, by card type when `ofTypes` names some (statics refuse it in `checkStateAmount`).
      // D-646 (CR 202.3): and the greatest mana value among them, read the same way.
      checkEnumList(out, `${path}.ofTypes`, a.ofTypes, CARD_TYPES, 'card type');
      for (const key of Object.keys(a)) {
        if (key !== 'kind' && key !== 'ofTypes' && key !== 'otherThanThis') {
          issue(
            out,
            `${path}.${key}`,
            'spells cast this turn reads only the controller, the card types and whether to leave out this spell',
          );
        }
      }
      break;
    case 'lifeGainedThisTurn':
    case 'controllerLifeLostThisTurn':
    case 'lifeGainedOrLostThisTurn':
      if (Object.keys(a).some((key) => key !== 'kind')) {
        issue(out, path, 'life gained this turn reads only the controller; no extra fields');
      }
      break;
    case 'enteredThisTurn':
    case 'diedThisTurn':
      checkEnumList(out, `${path}.types`, a.types, CARD_TYPES, 'card type');
      if (!isOneOf(a.controller, ['you', 'any'])) {
        issue(out, `${path}.controller`, 'history controller is you or any');
      }
      if (a.token !== undefined && typeof a.token !== 'boolean') {
        issue(out, `${path}.token`, 'history token filter is a boolean');
      }
      if (a.kind === 'diedThisTurn' && a.modified !== undefined && a.modified !== true) {
        issue(out, `${path}.modified`, 'history modified filter must be true when present');
      }
      if (a.kind === 'diedThisTurn' && a.leftBattlefield !== undefined) {
        if (a.leftBattlefield !== true) {
          issue(
            out,
            `${path}.leftBattlefield`,
            'history leftBattlefield filter must be true when present',
          );
        } else if (a.modified !== undefined) {
          issue(
            out,
            `${path}.modified`,
            'a permanent that left the battlefield is not read as modified',
          );
        }
      }
      for (const key of Object.keys(a)) {
        if (
          !['kind', 'types', 'controller', 'token', 'modified', 'leftBattlefield'].includes(key)
        ) {
          issue(out, `${path}.${key}`, 'history does not record this property');
        }
      }
      break;
    case 'sacrificedAsCost':
      // D-491 (CR 118.8): what the spell sacrificed for its additional cost; the face is checked as a whole (`checkSacrificedAsCost`: only a spell's own cast trigger and text).
      break;
    case 'half':
      if (!isOneOf(a.round, ['down', 'up'])) {
        issue(out, `${path}.round`, 'half is rounded "down" or "up" (CR 107.1a)');
      }
      if (a.divisor !== undefined && a.divisor !== 3) {
        issue(out, `${path}.divisor`, 'divisor is 3 ("a third of"), or absent for half');
      }
      checkAmount(a.of, `${path}.of`, scope, out);
      break;
    case 'minus':
      // D-321, CR 107.1b: `of` less a whole number of 1 or more, floored at 0.
      if (!Number.isSafeInteger(a.by) || a.by < 1) {
        issue(out, `${path}.by`, 'a minus needs a whole number of 1 or more to take away');
      }
      checkAmount(a.of, `${path}.of`, scope, out);
      break;
    case 'multiple':
      if (!Number.isSafeInteger(a.factor) || a.factor < 2) {
        issue(out, `${path}.factor`, 'a multiple needs a whole factor of 2 or more');
      }
      checkAmount(a.of, `${path}.of`, scope, out);
      break;
    case 'sum':
      if (!Array.isArray(a.of) || a.of.length < 2) {
        issue(out, `${path}.of`, 'a sum needs at least two amounts');
      } else {
        a.of.forEach((part, i) => {
          checkAmount(part, `${path}.of[${i}]`, scope, out);
        });
      }
      break;
    case 'difference':
      if (!Array.isArray(a.of) || a.of.length !== 2) {
        issue(out, `${path}.of`, 'a difference needs exactly two amounts');
      } else {
        a.of.forEach((part, i) => {
          checkAmount(part, `${path}.of[${i}]`, scope, out);
        });
      }
      break;
    case 'extreme':
      if (a.pick !== 'greater' && a.pick !== 'lesser') {
        issue(out, `${path}.pick`, 'an extreme amount picks the greater or the lesser');
      }
      if (!Array.isArray(a.of) || a.of.length < 2) {
        issue(out, `${path}.of`, 'an extreme amount needs at least two amounts');
      } else {
        a.of.forEach((part, i) => {
          checkAmount(part, `${path}.of[${i}]`, scope, out);
        });
      }
      break;
    case 'opponentsWithMore':
      if (!isOneOf(a.stat, PLAYER_STATS)) {
        issue(out, `${path}.stat`, `unknown player stat ${JSON.stringify(a.stat)}`);
      }
      if (a.fewer !== undefined && a.fewer !== true) {
        issue(out, `${path}.fewer`, 'fewer is true when present');
      }
      break;
    case 'chosenPlayerLead':
      if (!isOneOf(a.stat, PLAYER_STATS)) {
        issue(out, `${path}.stat`, `unknown player stat ${JSON.stringify(a.stat)}`);
      }
      break;
    case 'opponentCount':
      break;
    case 'movedCount':
      // CR 608.2c: what the instruction before it moved (`moved`): a trailing amount of the same resolution, never a number a static ability reads.
      break;
    case 'timesKicked':
      // D-110: the card must have a kicker or multikicker (`checkCastFace`).
      break;
    case 'manaSpent':
      // D-183: the spell that is the source of "When you cast this spell" paid for itself; nothing else has mana spent to cast it to read.
      if (a.of !== undefined) {
        // D-217 (CR 113.7a): the mana spent on a spell this ability targets ("that spell", Mana Sculpt).
        // D-646 (CR 601.2h): or the spell that caused a "whenever you cast" trigger.
        if (a.of.kind === 'triggerSubject') {
          if (scope.triggerSubject !== 'stack') {
            issue(
              out,
              `${path}.of`,
              'the spell that was cast is read only in a trigger about a spell being cast',
            );
          }
        } else if (a.of.kind !== 'target') {
          issue(
            out,
            `${path}.of`,
            'the spell is a target of the ability or the spell that was cast',
          );
        } else checkRef(a.of, 'object', `${path}.of`, scope, out);
      } else if (scope.selfCast !== true && scope.owner !== 'spell') {
        // D-260: the effect of the spell itself reads what was spent to cast it ("You gain 1 life for each {S} spent to cast this spell").
        issue(
          out,
          path,
          'manaSpent is read in the effect of a spell, or of a "when you cast this spell" ability, where the spell is the source',
        );
      }
      checkManaSpentType(a.fromType, `${path}.fromType`, out, a.snow);
      if (a.colors !== undefined) {
        if (a.colors !== true) issue(out, `${path}.colors`, 'colors must be true');
        if (a.fromType !== undefined || a.snow !== undefined) {
          issue(
            out,
            `${path}.colors`,
            'the colors of the mana spent are not read with fromType or snow',
          );
        }
      }
      break;
    case 'exiledStillThere':
      // D-151: only the effect of a delayed trigger created after an effect that exiled cards (`checkDelayedTrigger`).
      if (scope.exiledStillThere !== true) {
        issue(
          out,
          path,
          "'exiledStillThere' needs the effect of a delayed trigger that follows an exile effect in the same sequence",
        );
      }
      break;
    case 'cardsStillExiled':
      issue(
        out,
        path,
        "'cardsStillExiled' is the engine's own form of 'exiledStillThere' and is never written in a card",
      );
      break;
    case 'thisWay':
      // D-131: what an earlier effect of this same sequence did.
      if (!isOneOf(a.what, THIS_WAY_KINDS)) {
        issue(out, `${path}.what`, `unknown thisWay count ${JSON.stringify(a.what)}`);
      } else if (!(scope.thisWay ?? []).includes(a.what)) {
        issue(
          out,
          path,
          `thisWay "${a.what}" needs ${THIS_WAY_SOURCES[a.what]} before it in the same sequence`,
        );
      } else if (a.what === 'destroyedCreaturesOfAffected') {
        // Only as the whole amount of a `loseLife` (checked with the effect), where it is read for each player the effect affects.
        issue(
          out,
          path,
          'destroyedCreaturesOfAffected is the whole amount of a loseLife effect, not part of another amount',
        );
      }
      break;
    case 'votesFor':
      // D-194 (CR 701.38a): the votes for one option of the vote that ran earlier in this same sequence.
      if (typeof a.option !== 'string' || a.option.trim() === '') {
        issue(out, `${path}.option`, 'votesFor names the option whose votes it counts');
      } else if (scope.voteOptions === undefined) {
        issue(out, path, 'votesFor needs a vote effect before it in the same sequence');
      } else if (!scope.voteOptions.includes(a.option)) {
        issue(
          out,
          `${path}.option`,
          `"${a.option}" is not an option of the vote (${scope.voteOptions.join(', ')})`,
        );
      }
      break;
    case 'triggerDamage':
      // D-133: "that much": the damage that caused the trigger.
      if (scope.triggerDamage !== true) {
        issue(
          out,
          path,
          "'triggerDamage' needs a triggered ability whose trigger is damage being dealt (dealtDamage, dealsCombatDamage, dealsDamage or noncombatDamageDealt) or life being gained (lifeGained)",
        );
      }
      break;
    case 'triggerSpellX':
      // CR 107.3 (Quandrix Unlimited group E): the X of the spell a "whenever you cast" trigger is about.
      if (scope.triggerSubject !== 'stack') {
        issue(out, path, "'triggerSpellX' needs a trigger about a spell being cast");
      }
      break;
    case 'triggerCycleX':
      // CR 702.29a (issue 81, Shark Typhoon): the X of the cycling cost of the card that was cycled.
      if (scope.triggerCycleX !== true) {
        issue(
          out,
          path,
          "'triggerCycleX' needs a triggered ability whose trigger is cycling this card",
        );
      }
      break;
    case 'triggerAttackerCount':
      // CR 508.1 (issue 81): the creatures of the declaration the trigger counted.
      if (scope.triggerAttackerCount !== true) {
        issue(
          out,
          path,
          "'triggerAttackerCount' needs a triggered ability whose trigger is a batch of attackers",
        );
      }
      break;
    case 'triggerDamagedPlayerCount':
      // CR 603.2c: the opponents the sources of the batch dealt damage to.
      if (scope.triggerDamagedPlayerCount !== true) {
        issue(
          out,
          path,
          "'triggerDamagedPlayerCount' needs a triggered ability whose trigger is damage dealt to your opponents by a group of sources",
        );
      }
      break;
    case 'cardTypesAmongTriggerCards':
      // CR 603.2c: the cards a batch trigger saw put into a graveyard.
      if (scope.triggerCards !== true) {
        issue(
          out,
          path,
          "'cardTypesAmongTriggerCards' needs a trigger about a batch of cards (a batch putIntoGraveyard, leftGraveyard or batch discarded trigger)",
        );
      }
      break;
    case 'triggerTargetCount':
      if (scope.triggerTargetCount !== true) {
        issue(
          out,
          path,
          "'triggerTargetCount' needs a cast trigger whose filter requires one or more targets",
        );
      }
      break;
    case 'cardsInHandOfAffected':
      // CR 402.1: only as the whole amount of a `dealDamage` to players (checked with the effect), where it is read for each player hurt.
      issue(
        out,
        path,
        'cardsInHandOfAffected is the whole amount of a dealDamage to players, not part of another amount',
      );
      break;
    case 'attackersOfAffected':
      // Issue 101: only as the whole amount of a `loseLife` (checked with the effect).
      issue(
        out,
        path,
        'attackersOfAffected is the whole amount of a loseLife effect, not part of another amount',
      );
      break;
    case 'lifeLostThisTurn':
      // D-365: only as the whole amount of a `loseLife` (checked with the effect), where it is read for each player the effect affects.
      issue(
        out,
        path,
        'lifeLostThisTurn is the whole amount of a loseLife effect, not part of another amount',
      );
      break;
    case 'lifeLostThisWay':
      // D-120: the total of the life lost by an earlier `loseLife` of the same sequence.
      if (scope.lossAvailable !== true) {
        issue(out, path, 'lifeLostThisWay needs a loseLife effect before it in the same sequence');
      }
      break;
    case 'countOf':
      // D-095: a count of the objects the filter matches; `owner` is not read here (checkFilter).
      if (a.filter === undefined || a.filter === null) {
        issue(out, `${path}.filter`, 'countOf needs a filter');
      } else if (
        a.filter.owner !== undefined &&
        kindOf(a.filter.owner) === 'target' &&
        a.filter.zone !== undefined &&
        a.filter.zone !== 'battlefield'
      ) {
        // D-649 (CR 108.3, 400.1, 608.2c): "for each card in target opponent's hand": the cards of a zone outside the battlefield that a player the effect targets owns, counted as
        // the amount is read, with the targets.
        const { owner, ...rest } = a.filter;
        checkPlayerSelector(owner, `${path}.filter.owner`, scope, out);
        if (rest.controller !== undefined || rest.controlledBy !== undefined) {
          issue(
            out,
            `${path}.filter`,
            'a count of the cards a targeted player owns sets owner alone, not controller or controlledBy',
          );
        }
        checkFilter(rest, `${path}.filter`, out);
      } else if (a.filter.owner !== undefined) {
        const { owner: _owner, ...rest } = a.filter;
        void _owner;
        issue(
          out,
          `${path}.filter.owner`,
          "owner is only read in an effect's each selector, except for a target mana-value limit and the cards of a zone outside the battlefield that a target player owns",
        );
        if (rest.controlledBy !== undefined) {
          issue(out, `${path}.filter.controlledBy`, 'owner and controlledBy cannot both be set');
        }
        checkFilter(rest, `${path}.filter`, out);
      } else if (a.filter.controlledBy !== undefined) {
        // Hylda group 3 (CR 109.4, 608.2c): "for each tapped creature target opponent controls": the player is a target the effect declared, read as the amount is
        // counted (with the targets); a player named any other way is not read here, and the other fields are those of any count.
        const { controlledBy, ...rest } = a.filter;
        // CR 109.4, 608.2c (Observed Stasis): "for each tapped creature its controller controls": `controllerOf` of the permanent an Aura is attached to, counted the same way.
        if (kindOf(controlledBy) !== 'target' && kindOf(controlledBy) !== 'controllerOf') {
          issue(
            out,
            `${path}.filter.controlledBy`,
            'a count names the player whose objects it counts by a target of the ability or spell, or the controller of an object (controlledBy: target or controllerOf)',
          );
        } else {
          checkPlayerSelector(controlledBy, `${path}.filter.controlledBy`, scope, out);
        }
        if (rest.controller !== undefined) {
          issue(
            out,
            `${path}.filter.controller`,
            'controlledBy replaces controller: set one of them',
          );
        }
        checkFilter(rest, `${path}.filter`, out);
      } else {
        // CR 603.10a, 205.3m (Shared Animosity): "shares a creature type with it" in a count of a trigger about a permanent reads that permanent (`triggerSubject`).
        checkFilter(
          a.filter,
          `${path}.filter`,
          out,
          undefined,
          scope.triggerSubject === 'permanent',
        );
      }
      break;
    default:
      issue(out, path, `unknown amount ${kindOf(a)}`);
  }
}

/**
 * The amount of a power or toughness change or setting (D-115): an integer (negative allowed), any
 * `Amount`, or a multiple of one. `x` follows the same rule as everywhere (an X in the cost of the spell or
 * ability). A multiple has a whole non-zero factor.
 */
export function checkPtAmount(
  a: PtAmount,
  path: string,
  scope: Scope,
  out: Out,
  label: string,
  /** "Double its power" (D-145): only a `modifyPt` effect reads the power or toughness of what it affects. */
  allowAffected = false,
): void {
  if (typeof a === 'number') {
    if (!Number.isSafeInteger(a)) issue(out, path, `${label} must be an integer`);
    return;
  }
  if (a?.kind === 'affected') {
    if (!allowAffected) {
      issue(
        out,
        path,
        `${label} cannot read the power or toughness of what it affects: only a modifyPt effect can`,
      );
    }
    if (!isOneOf(a.stat, ['power', 'toughness'])) {
      issue(out, `${path}.stat`, `unknown stat ${JSON.stringify(a.stat)}`);
    }
    return;
  }
  if (a?.kind === 'times') {
    if (!Number.isSafeInteger(a.factor) || a.factor === 0) {
      issue(out, `${path}.factor`, 'a multiple needs a whole factor other than 0');
    }
    checkAmount(a.of, `${path}.of`, scope, out);
    return;
  }
  checkAmount(a, path, scope, out);
}

/**
 * A count a static ability or a characteristic-defining ability reads (D-115): `countOf` over objects
 * by their types, colors, subtypes, controller, tapped status, zone and mana value. It never compares a
 * power or toughness (CR 613.8: the layer would depend on itself).
 */
function checkCountOnly(
  a: unknown,
  path: string,
  out: Out,
  /** D-179: the amount that reads colors (`colorsAmong`) is checked the same way, as it reads the same objects. */
  kind: 'countOf' | 'colorsAmong' | 'greatestPowerAmong' = 'countOf',
  /** D-149: a "+N/+N" count (layer 7c) may name a keyword, read after layer 6; a characteristic-defining ability (layer 7a) may not. */
  allowKeywords = false,
): void {
  const amount = a as { kind?: string; filter?: ObjectFilter };
  if (amount?.kind !== kind) {
    issue(
      out,
      path,
      `a static ability's power or toughness counts objects (countOf), not ${kindOf(a)}: an X, kicks or another object's power are not read there (D-115, CR 107.3j, 613.8)`,
    );
    return;
  }
  if (amount.filter === undefined || amount.filter === null) {
    issue(out, `${path}.filter`, `${kind} needs a filter`);
    return;
  }
  checkFilter(amount.filter, `${path}.filter`, out);
  if (
    kind === 'colorsAmong' &&
    filterSome(amount.filter, (f) => f.zone !== undefined && f.zone !== 'battlefield')
  ) {
    issue(
      out,
      `${path}.filter.zone`,
      'only permanents on the battlefield have their colors counted',
    );
  }
  if (
    kind === 'greatestPowerAmong' &&
    filterSome(
      amount.filter,
      (f) => f.zone === undefined || f.zone === 'battlefield' || f.zone === 'stack',
    )
  ) {
    issue(
      out,
      `${path}.filter.zone`,
      'only the printed power of cards outside the battlefield and the stack is read (CR 613.8)',
    );
  }
  if (filterSome(amount.filter, readsCombatOrSource)) {
    issue(
      out,
      `${path}.filter`,
      'a count in a static ability cannot read the combat or the source power (D-120)',
    );
  }
  if (!allowKeywords && filterSome(amount.filter, readsKeywords)) {
    issue(
      out,
      `${path}.filter`,
      'a count in a characteristic-defining ability cannot name a keyword: it would depend on layer 6 (CR 613.8)',
    );
  }
  if (filterSome(amount.filter, (f) => f.power !== undefined || f.toughness !== undefined)) {
    issue(
      out,
      `${path}.filter`,
      'a count in a static ability cannot compare power or toughness: it would depend on the layer it is in (CR 613.8)',
    );
  }
}

/**
 * The power or toughness amount of a static ability (D-115, `plain`: "+N/+N", an integer, negative
 * allowed) or of a characteristic-defining ability (not `plain`: a count, or a positive multiple of one,
 * CR 604.3a).
 */
export function checkStaticPtAmount(a: unknown, path: string, plain: boolean, out: Out): void {
  if (typeof a === 'number') {
    if (!plain) {
      issue(
        out,
        path,
        'a characteristic-defining ability counts something: a number is not a count',
      );
    } else if (!Number.isSafeInteger(a)) {
      issue(out, path, `amount ${a} must be an integer`);
    }
    return;
  }
  const amount = a as { kind?: string; factor?: number; of?: unknown };
  if (amount?.kind === 'devotion') {
    if (plain)
      issue(out, path, 'devotion is not supported as a plain static power/toughness modifier');
    return;
  }
  // Issue 145 (Soul of Eternity, CR 604.3): "equal to your life total": a characteristic-defining ability only, of the controller.
  if (amount?.kind === 'lifeTotalOf') {
    const player = (a as { player?: { kind?: string } }).player;
    if (plain) {
      issue(
        out,
        path,
        'a life total is the amount of a characteristic-defining ability, not a plain static power/toughness modifier',
      );
    } else if (player?.kind !== 'you') {
      issue(out, `${path}.player`, 'a characteristic-defining ability reads the life total of you');
    }
    return;
  }
  // D-145: "where X is the greatest mana value among your commanders": plain (+X/+X) only, a mana value is never negative.
  // Issue 81 (Omnath, CR 106.4): "for each unspent mana you have": plain (+N/+N) only.
  if (amount?.kind === 'unspentMana') {
    if (!plain) {
      issue(out, path, 'a characteristic-defining ability counts objects, not unspent mana');
    }
    return;
  }
  // CR 122.1 (Call for Unity): "for each unity counter on this enchantment": plain (+N/+N) only, the counters of one kind on the permanent that has the ability.
  if (amount?.kind === 'countersOnSource') {
    if (!plain) {
      issue(out, path, 'a characteristic-defining ability counts objects, not counters');
    }
    const counter = (a as { counter?: unknown }).counter;
    if (typeof counter !== 'string' || counter.length === 0) {
      issue(out, `${path}.counter`, 'countersOnSource names the kind of counter');
    }
    return;
  }
  if (amount?.kind === 'commanderManaValue' || amount?.kind === 'commanderCasts') {
    if (!plain) {
      issue(out, path, 'a characteristic-defining ability counts objects, not a commander');
    }
    return;
  }
  // D-187: "for each time it has attacked this turn": plain (+N/+N) only; a characteristic-defining ability counts objects.
  if (amount?.kind === 'timesAttacked') {
    if (!plain) {
      issue(out, path, 'a characteristic-defining ability counts objects, not attacks');
    }
    return;
  }
  // D-179: "for each color among permanents you control": plain (+N/+N) only, as it is not a count of objects a characteristic-defining ability sets.
  if (amount?.kind === 'colorsAmong') {
    if (!plain) {
      issue(out, path, 'a characteristic-defining ability counts objects, not colors');
    }
    checkCountOnly(amount, path, out, 'colorsAmong', false);
    return;
  }
  // CR 613.4c: "the greatest power among creature cards in your graveyard": plain (+X/+X) only, of cards outside the battlefield.
  if (amount?.kind === 'greatestPowerAmong') {
    if (!plain) {
      issue(out, path, 'a characteristic-defining ability counts objects, not a greatest power');
    }
    checkCountOnly(amount, path, out, 'greatestPowerAmong', false);
    return;
  }
  if (amount?.kind === 'sum') {
    // D-131: "the number of Zombies on the battlefield plus the number of Zombie cards in all graveyards".
    if (!Array.isArray(amount.of) || amount.of.length < 2) {
      issue(out, `${path}.of`, 'a sum needs at least two counts');
    } else {
      amount.of.forEach((part, i) => {
        checkCountOnly(part, `${path}.of[${i}]`, out, 'countOf', plain);
      });
    }
    return;
  }
  if (amount?.kind === 'times') {
    if (!Number.isSafeInteger(amount.factor) || amount.factor === 0) {
      issue(out, `${path}.factor`, 'a multiple needs a whole factor other than 0');
    } else if (!plain && (amount.factor ?? 0) < 0) {
      issue(
        out,
        `${path}.factor`,
        'a characteristic-defining ability sets a count or a positive multiple of one',
      );
    }
    checkCountOnly(amount.of, `${path}.of`, out, 'countOf', plain);
    return;
  }
  checkCountOnly(a, path, out, 'countOf', plain);
}

// ---- Costs (CR 118)

export function checkCost(cost: Cost, path: string, out: Out): void {
  switch (cost?.kind) {
    case 'mana':
      checkManaSymbols(cost.symbols, `${path}.symbols`, out);
      if (cost.onlyChosenColor !== undefined && cost.onlyChosenColor !== true) {
        issue(out, `${path}.onlyChosenColor`, 'onlyChosenColor must be true when present');
      }
      break;
    case 'tap':
    case 'untap':
    case 'exert':
    case 'payXLife':
    case 'discardX':
      break;
    case 'exileFromHand':
      checkFilter(cost.filter, `${path}.filter`, out);
      if (cost.filter.zone !== 'hand') {
        issue(out, `${path}.filter.zone`, 'an additional exile cost selects cards from hand');
      }
      break;
    case 'payLife':
      // D-135: a number, or an amount that reads the game as the ability is activated (only an activated ability's cost
      // takes the latter: `unsupportedFeatureIssues`).
      if (typeof cost.amount === 'number') {
        if (!isCount(cost.amount))
          issue(out, `${path}.amount`, 'life paid must be a non-negative integer');
      } else {
        checkStateAmount(cost.amount, `${path}.amount`, out, 'a life payment');
      }
      break;
    case 'tapPermanents':
      // D-133: "Tap three untapped Zombies you control": a count of 1 or more, permanents the player controls, on the
      // battlefield, that are untapped (the engine adds that itself).
      checkFilter(cost.filter, `${path}.filter`, out);
      if (!isCount(cost.count) || cost.count < 1) {
        issue(out, `${path}.count`, 'the number of permanents to tap must be a positive integer');
      }
      if (filterSome(cost.filter, (f) => f.controller === 'opponent')) {
        issue(
          out,
          `${path}.filter.controller`,
          'only permanents you control can be tapped for a cost',
        );
      }
      if (filterSome(cost.filter, (f) => f.tapped !== undefined)) {
        issue(
          out,
          `${path}.filter.tapped`,
          'the permanents tapped for a cost are untapped: the filter does not say so',
        );
      }
      if (filterSome(cost.filter, (f) => f.zone !== undefined && f.zone !== 'battlefield')) {
        issue(out, `${path}.filter.zone`, 'only permanents on the battlefield can be tapped');
      }
      if (filterSome(cost.filter, (f) => f.stackKind !== undefined || f.owner !== undefined)) {
        issue(
          out,
          `${path}.filter`,
          'a tap cost names permanents by type, subtype, color and the like: no stackKind or owner',
        );
      }
      break;
    case 'untapPermanents':
      // CR 701.26b, 118.3: "Untap two tapped creatures you control": a count of 1 or more, permanents the player controls, on the battlefield, that are
      // tapped (the engine adds that itself).
      checkFilter(cost.filter, `${path}.filter`, out);
      if (!isCount(cost.count) || cost.count < 1) {
        issue(out, `${path}.count`, 'the number of permanents to untap must be a positive integer');
      }
      if (filterSome(cost.filter, (f) => f.controller === 'opponent')) {
        issue(
          out,
          `${path}.filter.controller`,
          'only permanents you control can be untapped for a cost',
        );
      }
      if (filterSome(cost.filter, (f) => f.tapped !== undefined)) {
        issue(
          out,
          `${path}.filter.tapped`,
          'the permanents untapped for a cost are tapped: the filter does not say so',
        );
      }
      if (filterSome(cost.filter, (f) => f.zone !== undefined && f.zone !== 'battlefield')) {
        issue(out, `${path}.filter.zone`, 'only permanents on the battlefield can be untapped');
      }
      if (filterSome(cost.filter, (f) => f.stackKind !== undefined || f.owner !== undefined)) {
        issue(
          out,
          `${path}.filter`,
          'an untap cost names permanents by type, subtype, color and the like: no stackKind or owner',
        );
      }
      break;
    case 'blight':
      // D-407 (CR 701.68a): "Blight 1": a positive number of -1/-1 counters.
      if (!isCount(cost.count) || cost.count < 1) {
        issue(
          out,
          `${path}.count`,
          'the number of -1/-1 counters of a blight must be a positive integer',
        );
      }
      if (cost.optional !== undefined && cost.optional !== true) {
        issue(out, `${path}.optional`, 'optional must be true when present');
      }
      break;
    case 'sacrifice':
      if (cost.countX !== undefined) {
        // D-488 (CR 107.3a): "Sacrifice X creatures": the X announced for the ability, of permanents chosen among those that match; no fixed count and not the permanent itself.
        if (cost.countX !== true) {
          issue(out, `${path}.countX`, 'countX must be true when present');
        } else if (cost.count !== undefined) {
          issue(out, `${path}.countX`, 'the number sacrificed is X or a count, not both');
        } else if (kindOf(cost.what) === 'this') {
          issue(out, `${path}.countX`, 'this permanent is sacrificed once: no X');
        }
      }
      if (cost.anyNumber !== undefined) {
        // D-491 (CR 118.8, 701.21a): "you may sacrifice one or more creatures": any number of the permanents that match; only an additional cost of a spell, checked where it stands.
        if (cost.anyNumber !== true) {
          issue(out, `${path}.anyNumber`, 'anyNumber must be true when present');
        } else if (cost.count !== undefined || cost.countX !== undefined) {
          issue(out, `${path}.anyNumber`, 'any number of permanents is no count and no X');
        } else if (kindOf(cost.what) === 'this') {
          issue(out, `${path}.anyNumber`, 'this permanent is sacrificed once: no "any number"');
        }
      }
      if (cost.atLeastOne !== undefined) {
        // D-583 (CR 602.2b, 701.21a): "Sacrifice one or more artifacts": at least one of the permanents that match, so it goes with `anyNumber`; where it may stand is checked there.
        if (cost.atLeastOne !== true || cost.anyNumber !== true) {
          issue(out, `${path}.atLeastOne`, 'atLeastOne is true and goes with anyNumber');
        }
      }
      if (cost.alongside !== undefined) {
        // CR 701.21a, 118.3: "Sacrifice a Swamp and a Forest": one different permanent for `what` and for each filter of `alongside`; an ability's cost only (checked where it stands).
        if (!Array.isArray(cost.alongside) || cost.alongside.length < 1) {
          issue(out, `${path}.alongside`, 'alongside lists at least one more filter');
        } else {
          if (
            kindOf(cost.what) === 'this' ||
            cost.count !== undefined ||
            cost.countX !== undefined ||
            cost.anyNumber !== undefined
          ) {
            issue(
              out,
              `${path}.alongside`,
              'a sacrifice of several different permanents names each by a filter: no this, count, X or any number',
            );
          }
          cost.alongside.forEach((filter, j) => {
            checkFilter(filter, `${path}.alongside[${j}]`, out);
            if (filterSome(filter, (f) => f.controller === 'opponent')) {
              issue(
                out,
                `${path}.alongside[${j}].controller`,
                'a player can only sacrifice permanents they control',
              );
            }
            if (filter.zone !== undefined && filter.zone !== 'battlefield') {
              issue(
                out,
                `${path}.alongside[${j}].zone`,
                'only permanents on the battlefield can be sacrificed',
              );
            }
          });
        }
      }
      if (cost.count !== undefined) {
        // D-133: "Sacrifice two artifacts": 2 or more, of permanents chosen among those that match.
        if (!isCount(cost.count) || cost.count < 2) {
          issue(
            out,
            `${path}.count`,
            'a sacrifice count is a whole number of 2 or more (one is the default)',
          );
        } else if (kindOf(cost.what) === 'this') {
          issue(out, `${path}.count`, 'this permanent is sacrificed once: no count');
        }
      }
      if (kindOf(cost.what) !== 'this') {
        const what = cost.what as ObjectFilter;
        checkFilter(what, `${path}.what`, out);
        // CR 701.21a: a player can only sacrifice permanents they control, on the battlefield.
        if (filterSome(what, (f) => f.controller === 'opponent')) {
          issue(
            out,
            `${path}.what.controller`,
            'a player can only sacrifice permanents they control',
          );
        }
        if (what.zone !== undefined && what.zone !== 'battlefield') {
          issue(out, `${path}.what.zone`, 'only permanents on the battlefield can be sacrificed');
        }
      }
      break;
    case 'behold':
      // CR 701.4 (D-151): the filter is a quality shared by hand cards and permanents, not a zone or controller restriction.
      checkFilter(cost.filter, `${path}.filter`, out);
      if (
        filterSome(
          cost.filter,
          (f) =>
            f.zone !== undefined ||
            f.controller !== undefined ||
            f.owner !== undefined ||
            f.controlledBy !== undefined ||
            f.stackKind !== undefined ||
            f.other !== undefined ||
            f.tapped !== undefined ||
            f.attacking !== undefined ||
            readsCombatOrSource(f),
        )
      ) {
        issue(
          out,
          `${path}.filter`,
          'the quality of a card or permanent: no zone, controller, owner, stackKind, other, or game state',
        );
      }
      break;
    case 'exileThis':
      // D-185: no operand; where it may stand is checked with the ability (`checkActivationCosts`).
      break;
    case 'revealThis':
      // D-462 (CR 701.20a): no operand; paid from the hand (`checkActivationCosts`).
      break;
    case 'discardThis':
      // D-179: the engine marks the cost of a cycling ability itself; a card does not say that its own discard is a cycling.
      if (cost.cycling !== undefined) {
        issue(
          out,
          `${path}.cycling`,
          'cycling is written by the engine for Cycling and typecycling',
        );
      }
      break;
    case 'tapCreatures':
      // CR 702.122a: "total power N or greater" with N a positive integer.
      if (!Number.isSafeInteger(cost.totalPower) || cost.totalPower < 1) {
        issue(out, `${path}.totalPower`, 'total power to tap must be a positive integer');
      }
      break;
    case 'mill':
      // D-208 (CR 701.17): a whole number of one or more cards, the cost of a mana ability.
      if (!isCount(cost.count) || cost.count < 1) {
        issue(out, `${path}.count`, 'mill count must be a positive integer');
      }
      break;
    case 'energyAmount':
      // Issue 105 (CR 107.14, 608.2c): the amount is read as the `mayPay` resolves (the checks of the effect hold it to what it may read).
      if (cost.amount === undefined) issue(out, `${path}.amount`, 'energyAmount needs an amount');
      break;
    case 'energy':
      // D-209 (CR 107.14): a whole number of one or more energy counters, paid by the player an `unlessPays` names.
      if (!isCount(cost.count) || cost.count < 1) {
        issue(out, `${path}.count`, 'energy count must be a positive integer');
      }
      break;
    case 'discard':
      // Issue 101: "Discard X cards": the X announced for the ability, with a count of 0 and nothing that narrows the cards.
      if (cost.countX !== undefined) {
        if (
          cost.countX !== true ||
          cost.count !== 0 ||
          cost.hand !== undefined ||
          cost.filter !== undefined ||
          cost.named !== undefined
        ) {
          issue(
            out,
            `${path}.countX`,
            'countX is true, with a count of 0 and no filter, name or hand',
          );
        }
        break;
      }
      if (cost.hand !== undefined) {
        // D-626: "Discard your hand": the whole hand, so no count, filter or name narrows it.
        if (
          cost.hand !== true ||
          cost.count !== 0 ||
          cost.filter !== undefined ||
          cost.named !== undefined
        ) {
          issue(out, `${path}.hand`, 'hand is true, with a count of 0 and no filter or name');
        }
        break;
      }
      if (!isCount(cost.count) || cost.count < 1) {
        issue(out, `${path}.count`, 'discard count must be a positive integer');
      }
      // D-207: "Discard a legendary card", "Discard another card named ~".
      if (cost.filter !== undefined) {
        checkFilter(cost.filter, `${path}.filter`, out);
        if (filterSome(cost.filter, (f) => f.zone !== undefined || f.controller !== undefined)) {
          issue(
            out,
            `${path}.filter`,
            'the cards discarded are in the hand: no zone, no controller',
          );
        }
      }
      if (cost.named !== undefined && cost.named !== true) {
        issue(out, `${path}.named`, 'named must be true when present');
      }
      break;
    case 'exileFromGraveyard':
      checkFilter(cost.filter, `${path}.filter`, out);
      if (!isCount(cost.count) || cost.count < 1) {
        issue(out, `${path}.count`, 'count must be a positive integer');
      }
      // Issue 102 (Necropolis Fiend): "Exile X cards from your graveyard" has the count 1 and `countX`.
      if (cost.countX !== undefined && (cost.countX !== true || cost.count !== 1)) {
        issue(out, `${path}.countX`, 'countX must be true, with a count of 1');
      }
      break;
    case 'loyalty':
      // CR 606.4, 606.5 (D-200): [+N], [-N], [0] or [-X].
      if (cost.change !== 'x' && !Number.isSafeInteger(cost.change)) {
        issue(out, `${path}.change`, "a loyalty cost is a whole number or 'x' (for [-X])");
      }
      break;
    case 'removeCounters':
    case 'putCounters':
      if (typeof cost.counter !== 'string' || cost.counter === '') {
        issue(out, `${path}.counter`, 'counter name must be non-empty');
      }
      if (!isCount(cost.count) || cost.count < 1) {
        issue(out, `${path}.count`, 'count must be a positive integer');
      }
      if (cost.kind === 'removeCounters' && cost.among !== undefined) {
        // Federation Fleet group D (CR 118.3, 122.1): "Remove two +1/+1 counters from among creatures you control": permanents the player controls, on the battlefield.
        checkFilter(cost.among, `${path}.among`, out);
        if (filterSome(cost.among, (f) => f.controller === 'opponent')) {
          issue(
            out,
            `${path}.among.controller`,
            'counters are removed for a cost only from permanents you control',
          );
        }
        if (filterSome(cost.among, (f) => f.zone !== undefined && f.zone !== 'battlefield')) {
          issue(out, `${path}.among.zone`, 'only permanents on the battlefield give up counters');
        }
        if (filterSome(cost.among, (f) => f.stackKind !== undefined || f.owner !== undefined)) {
          issue(
            out,
            `${path}.among`,
            'a remove-counters cost names permanents by type, subtype, color and the like: no stackKind or owner',
          );
        }
      }
      break;
    case 'returnToHand':
      // D-139: "Return an artifact you control to its owner's hand": this permanent, or a choice among the player's own.
      if (cost.toLibraryBottom !== undefined) {
        // CR 401.4: "put this creature on the bottom of its owner's library": one card, so no order to choose.
        if (cost.toLibraryBottom !== true) {
          issue(out, `${path}.toLibraryBottom`, 'it is true or left out');
        } else if (kindOf(cost.what) !== 'this') {
          issue(
            out,
            `${path}.toLibraryBottom`,
            'only this permanent is put on the bottom of its owner’s library',
          );
        }
      }
      if (cost.count !== undefined) {
        if (!isCount(cost.count) || cost.count < 2) {
          issue(
            out,
            `${path}.count`,
            'a return count is a whole number of 2 or more (one is the default)',
          );
        } else if (kindOf(cost.what) === 'this') {
          issue(out, `${path}.count`, 'this permanent is returned once: no count');
        }
      }
      if (kindOf(cost.what) !== 'this') {
        const what = cost.what as ObjectFilter;
        checkFilter(what, `${path}.what`, out);
        if (filterSome(what, (f) => f.controller === 'opponent')) {
          issue(
            out,
            `${path}.what.controller`,
            'only permanents you control can be returned for a cost',
          );
        }
        if (what.zone !== undefined && what.zone !== 'battlefield') {
          issue(out, `${path}.what.zone`, 'only permanents on the battlefield can be returned');
        }
        if (filterSome(what, (f) => f.owner !== undefined || f.stackKind !== undefined)) {
          issue(
            out,
            `${path}.what`,
            'a cost names permanents by type and the like: no owner or stackKind',
          );
        }
      }
      break;
    default:
      issue(out, path, `unknown cost ${kindOf(cost)}`);
  }
}

export function checkCosts(costs: readonly Cost[], path: string, out: Out): void {
  if (!Array.isArray(costs) || costs.length === 0) {
    issue(out, path, 'cost list is empty (an ability with no cost must say {0}, CR 602.1)');
    return;
  }
  costs.forEach((c, i) => {
    checkCost(c, `${path}[${i}]`, out);
  });
}

/** Abilities of a face or token that are not a planeswalker's have no loyalty symbol (CR 606.2: a planeswalker's abilities). */
export function loyaltyOffPlaneswalkerIssues(
  types: readonly string[],
  abilities: readonly Ability[],
  path: string,
  out: Out,
): void {
  if (types.includes('planeswalker')) return;
  abilities.forEach((a, i) => {
    if (
      a?.kind === 'activated' &&
      Array.isArray(a.cost) &&
      a.cost.some((c) => c?.kind === 'loyalty')
    ) {
      issue(
        out,
        `${path}.abilities[${i}].cost`,
        'a loyalty ability belongs to a planeswalker (CR 606.2)',
      );
    }
  });
}

export const DESIGNATIONS = ['monarch', 'citysBlessing'];

/** The players a condition names: no target and no trigger subject to read there (D-131). */
function checkConditionPlayers(sel: PlayerSelector, path: string, out: Out): void {
  switch (sel?.kind) {
    case 'you':
    case 'eachPlayer':
    case 'eachOpponent':
    case 'defendingPlayer':
    case 'playerToYourRight':
    case 'chosenPlayer':
      break;
    case 'all':
      if (!Array.isArray(sel.of) || sel.of.length < 2) {
        issue(out, `${path}.of`, 'all names at least two player selectors');
      } else {
        sel.of.forEach((member, i) => {
          checkConditionPlayers(member, `${path}.of[${i}]`, out);
        });
      }
      break;
    case 'controllerOf':
    case 'ownerOf':
      // D-139: this permanent, or the permanent it is attached to ("unless that player is the monarch", that player being the
      // controller of the enchanted creature).
      if (kindOf(sel.of) !== 'this' && kindOf(sel.of) !== 'attached') {
        issue(
          out,
          `${path}.of`,
          'a condition names the controller or owner of this permanent or of the one it is attached to, not of a target or the trigger subject',
        );
      }
      break;
    default:
      issue(
        out,
        path,
        `a condition names its players by you, each player, each opponent, defending player or this permanent's controller, not ${kindOf(sel)}`,
      );
  }
}

// ---- Effects

/** A condition (see `Condition`): a count of permanents or opponents, or a combination. */
export function checkCondition(c: Condition, path: string, out: Out): void {
  const positive = (n: unknown): boolean => isCount(n) && n >= 1;
  switch (c?.kind) {
    case 'controlsAtLeast':
      checkFilter(c.filter, `${path}.filter`, out);
      // "You control" counts the condition's controller's battlefield permanents.
      if (c.filter?.zone !== undefined && c.filter.zone !== 'battlefield') {
        issue(out, `${path}.filter.zone`, 'only permanents on the battlefield can be counted');
      }
      if (c.filter?.controller !== undefined && c.filter.controller !== 'you') {
        issue(out, `${path}.filter.controller`, "'you control' counts the permanents you control");
      }
      if (!positive(c.count)) issue(out, `${path}.count`, 'count must be a positive integer');
      break;
    case 'opponentsAtLeast':
      if (!positive(c.count)) issue(out, `${path}.count`, 'count must be a positive integer');
      break;
    case 'opponentPoisonAtLeast':
      if (!positive(c.count)) issue(out, `${path}.count`, 'count must be a positive integer');
      break;
    case 'opponentControlsAtLeast':
      // D-135: some one opponent's battlefield permanents that match the filter; whose they are and where they are are the condition's.
      checkFilter(c.filter, `${path}.filter`, out);
      if (filterSome(c.filter, (f) => f.zone !== undefined && f.zone !== 'battlefield')) {
        issue(out, `${path}.filter.zone`, 'only permanents on the battlefield can be counted');
      }
      if (filterSome(c.filter, (f) => f.controller !== undefined)) {
        issue(
          out,
          `${path}.filter.controller`,
          'the opponent is named by the condition: the filter sets no controller',
        );
      }
      if (!positive(c.count)) issue(out, `${path}.count`, 'count must be a positive integer');
      break;
    case 'duringStep':
      if (!isOneOf(c.step, COMBAT_STEPS)) {
        issue(out, `${path}.step`, `unknown combat step ${JSON.stringify(c.step)}`);
      }
      break;
    case 'classLevelIs':
      // CR 716.2a (D-235): the level the Class is at, a whole number from 1.
      if (!Number.isSafeInteger(c.level) || c.level < 1) {
        issue(out, `${path}.level`, 'a class level is a whole number from 1');
      }
      break;
    case 'cardLeftYourGraveyard':
    case 'descendedThisTurn':
    case 'yourMainPhase':
    case 'yourCombatPhase':
    case 'yourTurn':
      // D-187, D-206: no parameters.
      break;
    case 'controlsGreatest':
      // D-139: the permanent with the greatest stat among those the filter matches; whose they are is the condition's business.
      checkFilter(c.filter, `${path}.filter`, out);
      if (!isOneOf(c.stat, ['power', 'toughness', 'manaValue'])) {
        issue(out, `${path}.stat`, `unknown stat ${JSON.stringify(c.stat)}`);
      }
      if (filterSome(c.filter, (f) => f.zone !== undefined && f.zone !== 'battlefield')) {
        issue(out, `${path}.filter.zone`, 'only permanents on the battlefield can be compared');
      }
      if (filterSome(c.filter, (f) => f.controller !== undefined)) {
        issue(
          out,
          `${path}.filter.controller`,
          "the permanents compared are everyone's: the filter sets no controller",
        );
      }
      break;
    case 'attackedHasMoreLifeThanOtherOpponent':
      // D-648: no parameters; where it may stand (the intervening "if" of a playerAttacksOpponent trigger) is checked with the trigger (validate.ts).
      break;
    case 'attackersAtYouAtLeast':
      // D-643: read from the declaration of the attack event; where it may stand (the intervening "if" of an attackBatch trigger) is checked with the trigger (validate.ts).
      if (!isCount(c.count) || c.count < 1) {
        issue(out, `${path}.count`, 'count must be a positive integer');
      }
      break;
    case 'attackersAttackedYou':
      // D-149: read from the declaration of the attack event, so only a conditional effect of an attackBatch trigger.
      issue(
        out,
        path,
        'attackersAttackedYou is only valid in a conditional effect of an attackBatch trigger (D-149)',
      );
      break;
    case 'didPrevious':
    case 'thisWayAtLeast':
    case 'movedTotalManaValue':
    case 'movedShareAllCardTypes':
    case 'manaValueAtMostAmount':
    case 'objectMatches':
      // D-135: these read what a resolving effect knows (what it did, the object it names), so only a `conditional` effect has them.
      issue(out, path, `${c.kind} is only valid in a conditional effect (D-135)`);
      break;
    case 'giftPromised': // D-135: the face must have the Gift keyword (`checkCastFace`)
      break;
    case 'lifeTotal':
      if (c.player !== undefined && c.player !== 'opponent') {
        issue(out, `${path}.player`, 'player must be opponent when present');
      }
      // D-133, CR 119.1: a life total (or how far it is above the starting life total) against a whole number.
      if (!isOneOf(c.compare?.cmp, ['atLeast', 'atMost', 'equal'])) {
        issue(out, `${path}.compare.cmp`, `unknown comparison ${JSON.stringify(c.compare?.cmp)}`);
      }
      if (c.aboveStarting !== undefined && c.aboveStarting !== true) {
        issue(out, `${path}.aboveStarting`, 'aboveStarting must be true when present');
      }
      if (!Number.isSafeInteger(c.compare?.value)) {
        issue(out, `${path}.compare.value`, 'a life total is compared with a whole number');
      } else if (c.aboveStarting !== true && (c.compare?.value ?? 0) < 0) {
        issue(
          out,
          `${path}.compare.value`,
          'a life total is compared with a non-negative number (only the difference from the starting life total may be negative)',
        );
      }
      break;
    case 'thisMatches':
      // D-133: the permanent this condition belongs to, against a filter; where it is and whose it is are the permanent's.
      checkFilter(c.filter, `${path}.filter`, out);
      if (filterSome(c.filter, (f) => f.zone !== undefined || f.stackKind !== undefined)) {
        issue(
          out,
          `${path}.filter`,
          'thisMatches looks at this permanent where it is: no zone or stackKind',
        );
      }
      if (filterSome(c.filter, (f) => f.controller !== undefined && f.controller !== 'you')) {
        issue(out, `${path}.filter`, "thisMatches may only name its own controller ('you')");
      }
      break;
    case 'ownTurnNumber':
      // D-149: the player's own turn, and how many turns they have had.
      if (!isOneOf(c.compare?.cmp, ['atLeast', 'atMost', 'equal'])) {
        issue(out, `${path}.compare.cmp`, `unknown comparison ${JSON.stringify(c.compare?.cmp)}`);
      }
      if (!isCount(c.compare?.value) || (c.compare?.value ?? 0) < 1) {
        issue(out, `${path}.compare.value`, 'turns are counted from 1: a positive whole number');
      }
      break;
    case 'manaSpentAtLeast':
      // D-206: the mana spent on the spell that caused a cast trigger.
      if (!isCount(c.count) || c.count < 1) {
        issue(out, `${path}.count`, 'the mana spent is a whole number of 1 or more');
      }
      break;
    case 'spellTargets':
      // D-207: a filter of the objects the spell targets (battlefield permanents).
      checkFilter(c.filter, `${path}.filter`, out);
      break;
    case 'castFromZone':
      // D-206: the zone the source spell was cast from.
      if (!isOneOf(c.zone, ZONES))
        issue(out, `${path}.zone`, `unknown zone ${JSON.stringify(c.zone)}`);
      break;
    case 'wasCast':
      break;
    case 'sameNameAtLeast':
      // D-149: some name shared by `count` of the controller's permanents that match; whose they are is the condition's.
      checkFilter(c.filter, `${path}.filter`, out);
      if (filterSome(c.filter, (f) => f.zone !== undefined && f.zone !== 'battlefield')) {
        issue(out, `${path}.filter.zone`, 'only permanents on the battlefield can be counted');
      }
      if (filterSome(c.filter, (f) => f.controller !== undefined)) {
        issue(
          out,
          `${path}.filter.controller`,
          "the permanents counted are the controller's: the filter sets no controller",
        );
      }
      if (!isCount(c.count) || c.count < 2) {
        issue(out, `${path}.count`, 'count is a whole number of 2 or more');
      }
      break;
    case 'controlCommander':
      if (c.yours !== undefined && c.yours !== true) {
        issue(out, `${path}.yours`, 'yours must be true when present');
      }
      break;
    case 'chosenOption':
      // D-151: a linked ability of "choose Khans or Dragons" (`checkChosen`: the face must ask for it and name the option).
      if (typeof c.option !== 'string' || c.option === '') {
        issue(out, `${path}.option`, 'an option is a non-empty name');
      }
      break;
    case 'controlsRingBearer':
      // CR 701.54e (D-196): read from the permanents of the controller; no operand.
      break;
    case 'thisIsRingBearer':
      // CR 701.54e: the permanent the condition belongs to is its controller's Ring-bearer; no operand.
      break;
    case 'ringTemptedAtLeast':
      // CR 701.54c: the times the Ring has tempted the controller, a whole number of 1 or more.
      if (!isCount(c.times) || c.times < 1) {
        issue(out, `${path}.times`, 'ringTemptedAtLeast times is a whole number of 1 or more');
      }
      break;
    case 'thisEnteredThisTurn':
      // D-423 (CR 400.7): the permanent the condition belongs to entered this turn; no operand.
      break;
    case 'paired':
      // CR 702.95b (D-286): the permanent the condition belongs to is paired with a creature; no operand. Where it may stand (a static ability that
      // `derive` reads, an intervening "if") is checked with the ability.
      break;
    case 'soulbondReady':
      issue(
        out,
        path,
        "soulbondReady is the intervening 'if' of the abilities the engine builds for soulbond (CR 702.95a); a card writes the keyword",
      );
      break;
    case 'subjectControllerHasMore':
      // D-229: where it may stand (an intervening "if" of a trigger with a permanent as its subject) is checked with the trigger (validate.ts).
      if (!isOneOf(c.stat, PLAYER_STATS))
        issue(out, `${path}.stat`, `unknown stat ${String(c.stat)}`);
      break;
    case 'subjectGreaterThanEach':
      // CR 603.10a, 208.1 (Selvala): the filter describes the other permanents on the battlefield, whoever controls them.
      checkFilter(c.filter, `${path}.filter`, out);
      if (
        c.filter !== undefined &&
        (c.filter.zone !== undefined ||
          c.filter.controller !== undefined ||
          c.filter.owner !== undefined)
      ) {
        issue(out, `${path}.filter`, 'the filter names no zone, controller or owner');
      }
      if (!isOneOf(c.stat, ['power', 'toughness'])) {
        issue(out, `${path}.stat`, `unknown stat ${String(c.stat)}: power or toughness`);
      }
      break;
    case 'subjectControlledByYou':
      // Where it may stand (the intervening "if" of a trigger about a permanent, or a conditional effect of one) is checked with the trigger (validate.ts, `checkEffectCondition`).
      break;
    case 'subjectStat':
      if (!isOneOf(c.stat, ['power', 'toughness'])) {
        issue(out, `${path}.stat`, `unknown stat ${String(c.stat)}: power or toughness`);
      }
      if (!isOneOf(c.compare?.cmp, ['atLeast', 'atMost', 'equal'])) {
        issue(out, `${path}.compare.cmp`, `unknown comparison ${JSON.stringify(c.compare?.cmp)}`);
      }
      if (!Number.isSafeInteger(c.compare?.value)) {
        issue(out, `${path}.compare.value`, 'a power or toughness is compared with a whole number');
      }
      break;
    case 'putCountersThisTurn':
      // CR 122.6 (Lasting Tarfire): the turn log of the controller of the ability; no parameter is needed.
      if (c.counter !== undefined && (typeof c.counter !== 'string' || c.counter === '')) {
        issue(out, `${path}.counter`, 'counter name must be non-empty when present');
      }
      if (c.onType !== undefined && !(CARD_TYPES as readonly string[]).includes(c.onType)) {
        issue(out, `${path}.onType`, `unknown card type ${String(c.onType)}`);
      }
      break;
    case 'triggerPlayerHasMore':
      // Where it may stand (an intervening "if" of a trigger whose event is about a player) is checked with the trigger (validate.ts).
      if (!isOneOf(c.stat, PLAYER_STATS))
        issue(out, `${path}.stat`, `unknown stat ${String(c.stat)}`);
      break;
    case 'triggerPlayerTurn':
      // Where it may stand (an intervening "if" of a trigger whose event is about a player) is checked with the trigger (validate.ts).
      break;
    case 'triggerPlayerIsOpponent':
    case 'triggerPlayerStat':
      // CR 603.2b, 608.2c: read as the instruction comes up, from the player the event is about: only in a conditional effect of a trigger about a player (`checkEffectCondition`).
      issue(
        out,
        path,
        `${c.kind} reads the player the event of a trigger is about as an instruction comes up: it is only valid in a conditional effect of such a trigger, not as an intervening "if" or a static condition`,
      );
      break;
    case 'attackingMostLife':
      // D-151 (Dethrone): read from the combat of the source, which must be an attacking creature.
      break;
    case 'attackersTotalPower':
      if (!isCount(c.atLeast) || c.atLeast < 1) {
        issue(out, `${path}.atLeast`, 'atLeast must be a positive integer');
      }
      break;
    case 'enteredThisTurn':
      // D-151 (Celebration): permanents that entered under the controller's control this turn, by card type and by token or card.
      if (!isCount(c.count) || c.count < 1) {
        issue(out, `${path}.count`, 'count must be a positive integer');
      }
      checkEnumList(out, `${path}.types`, c.types, CARD_TYPES, 'card type');
      checkEnumList(out, `${path}.notTypes`, c.notTypes, CARD_TYPES, 'card type');
      if (
        c.subtypes !== undefined &&
        (!Array.isArray(c.subtypes) ||
          c.subtypes.length === 0 ||
          c.subtypes.some((s) => typeof s !== 'string' || s === ''))
      ) {
        issue(out, `${path}.subtypes`, 'subtypes must be a non-empty list of names when present');
      }
      if (c.token !== undefined && typeof c.token !== 'boolean') {
        issue(out, `${path}.token`, 'token must be a boolean when present');
      }
      break;
    case 'aPlayerCardsInHand': // Lorehold group 3, CR 402.1: the same shape, for the hands of the players
    case 'cardsInLibrary': // D-331, CR 401.1: the same shape, for the library
    case 'cardsInGraveyard':
      // D-229, CR 404.1: the number of cards in the controller's graveyard against a whole number.
      if (!isOneOf(c.compare?.cmp, ['atLeast', 'atMost', 'equal'])) {
        issue(out, `${path}.compare.cmp`, `unknown comparison ${JSON.stringify(c.compare?.cmp)}`);
      }
      if (!Number.isSafeInteger(c.compare?.value)) {
        issue(out, `${path}.compare.value`, 'a card count is compared with a whole number');
      }
      // CR 404.1, 102.2 (Into the Story): only a graveyard condition names whose graveyard: an opponent's.
      if (
        (c as { readonly player?: unknown }).player !== undefined &&
        !(c.kind === 'cardsInGraveyard' && c.player === 'anOpponent')
      ) {
        issue(out, `${path}.player`, 'only cardsInGraveyard names a player, and only anOpponent');
      }
      break;
    case 'playerDealtDamage':
      // D-151, CR 120.3: damage dealt to the controller or to an opponent this turn.
      if (!isOneOf(c.player, ['you', 'opponent'])) {
        issue(out, `${path}.player`, `unknown player ${JSON.stringify(c.player)}`);
      }
      if (!isCount(c.atLeast) || c.atLeast < 1) {
        issue(out, `${path}.atLeast`, 'atLeast must be a positive integer');
      }
      break;
    case 'combatDamagedBy':
      // D-475, CR 120.2a: the kind of source: card types, subtypes and (relative to the controller) who controlled it, nothing else.
      checkCombatDamageSourceKind(c.filter, `${path}.filter`, 'combatDamagedBy', out);
      break;
    case 'ownsAndControlsNamed':
      // D-278, CR 701.42a: the permanent the ability belongs to and a permanent of a card type with a name.
      if (typeof c.name !== 'string' || c.name === '') {
        issue(out, `${path}.name`, 'the name of the other permanent must be a non-empty string');
      }
      if (!isOneOf(c.type, CARD_TYPES)) {
        issue(out, `${path}.type`, `unknown card type ${JSON.stringify(c.type)}`);
      }
      break;
    case 'lifeGainedThisTurn':
      // D-252, CR 119.3: the life the controller has gained this turn.
      if (!isCount(c.atLeast) || c.atLeast < 1) {
        issue(out, `${path}.atLeast`, 'atLeast must be a positive integer');
      }
      break;
    case 'castFromGraveyardThisTurn':
      if (Object.keys(c).some((key) => key !== 'kind')) {
        issue(out, path, 'the cast-from-a-graveyard condition has no extra fields');
      }
      break;
    case 'aPlayerLostLifeThisTurn':
      // CR 119.3: some player lost at least this much life this turn.
      if (!isCount(c.atLeast) || c.atLeast < 1) {
        issue(out, `${path}.atLeast`, 'atLeast must be a positive integer');
      }
      break;
    case 'lifeGainedAndLostThisTurn':
      if (Object.keys(c).some((key) => key !== 'kind')) {
        issue(out, path, 'the gained-and-lost-life condition has no extra fields');
      }
      break;
    case 'spellsCastLastTurn':
      // Issue 345 (CR 601.2i): `none`, or `aPlayerAtLeast` with a positive count.
      if (c.mode !== 'none' && c.mode !== 'aPlayerAtLeast') {
        issue(out, `${path}.mode`, 'mode is none or aPlayerAtLeast');
      } else if (c.mode === 'none' && c.atLeast !== undefined) {
        issue(out, `${path}.atLeast`, 'none takes no count');
      } else if (c.mode === 'aPlayerAtLeast' && (!isCount(c.atLeast) || c.atLeast < 1)) {
        issue(out, `${path}.atLeast`, 'atLeast must be a positive integer');
      }
      break;
    case 'spellsCastThisTurn':
      // D-318, CR 601.2i: the spells the controller has cast this turn.
      if (!isCount(c.atLeast) || c.atLeast < 1) {
        issue(out, `${path}.atLeast`, 'atLeast must be a positive integer');
      }
      // D-444: only the spells of these card types count; at least one, each a card type.
      if (c.ofTypes !== undefined) {
        if (!Array.isArray(c.ofTypes) || c.ofTypes.length === 0) {
          issue(out, `${path}.ofTypes`, 'ofTypes names at least one card type');
        } else {
          checkEnumList(out, `${path}.ofTypes`, c.ofTypes, CARD_TYPES, 'card type');
        }
      }
      // CR 205.2a (Lyse Hext): "noncreature spells": the spells with none of these card types; not with `ofTypes`.
      if (c.notOfTypes !== undefined) {
        if (!Array.isArray(c.notOfTypes) || c.notOfTypes.length === 0) {
          issue(out, `${path}.notOfTypes`, 'notOfTypes names at least one card type');
        } else {
          checkEnumList(out, `${path}.notOfTypes`, c.notOfTypes, CARD_TYPES, 'card type');
        }
        if (c.ofTypes !== undefined) {
          issue(out, `${path}.notOfTypes`, 'ofTypes and notOfTypes are not read together');
        }
      }
      break;
    case 'attackedWithCreaturesThisTurn':
      // Issue 279, CR 508.1: the different creatures the controller attacked with this turn.
      if (!isCount(c.atLeast) || c.atLeast < 1) {
        issue(out, `${path}.atLeast`, 'atLeast must be a positive integer');
      }
      break;
    case 'clashWon':
      // CR 701.30d: who won a clash is read in the `conditional` or `repeatWhile` after the clash (`checkEffectCondition`), nowhere else.
      issue(
        out,
        path,
        'clashWon reads the clash earlier in the same resolution: it is only valid in a conditional effect after a clash of the same sequence',
      );
      break;
    case 'dieResult':
      // D-271, CR 706.2: the result of a die is read in the `conditional` effect after the roll (`checkEffectCondition`), nowhere else.
      issue(
        out,
        path,
        'dieResult reads the die rolled earlier in the same resolution: it is only valid in a conditional effect after a rollDie of the same sequence',
      );
      break;
    case 'thisAttackedThisTurn':
      // CR 702.142a (Boast): no parameters; the permanent the ability belongs to.
      break;
    case 'thisInYourGraveyard':
      // D-271, CR 113.6b: no parameters; where it may stand is checked with the trigger (validate.ts).
      break;
    case 'thisOnBattlefield':
      // CR 603.4 (Animate Dead): no parameters; the permanent the ability belongs to.
      break;
    case 'xAtLeast': // issue 233: the X of the spell is at least a whole number of 1 or more
      if (!Number.isSafeInteger(c.value) || c.value < 1) {
        issue(out, `${path}.value`, 'xAtLeast names a whole number of at least 1');
      }
      break;
    case 'kicked':
    case 'castInOwnMainPhase': // issue 244: no parameters; it reads the spell it is asked of
    case 'sacrificedAsCost': // D-491: the face must list a cost that sacrifices any number of permanents (`checkSacrificedAsCost`)
    case 'additionalCostPaid': // CR 118.8, 701.68a: the face must list an optional blight additional cost (`checkAdditionalCostPaid`)
    case 'replicated': // D-129: the face must list a replicate cost (`checkCastFace`)
    case 'cameUnderControlSinceLastUpkeep': // D-127: where it may stand is checked with the trigger (validate.ts)
    case 'escaped': // D-124: the face must list an escape cost (`checkCastFace`)
    case 'foretold': // CR 702.143a: the face must list a foretell cost (`checkCastFace`)
      break;
    case 'subjectGreaterPt': // D-120: where it may stand is checked with the trigger (validate.ts)
      // Federation Fleet group D: "if it has greater power than ~" compares the power alone.
      if (c.onlyPower !== undefined && c.onlyPower !== true) {
        issue(out, `${path}.onlyPower`, 'onlyPower must be true when present');
      }
      break;
    case 'ringBearerChosen':
      // Galadriel group 1 (CR 701.54a): the creature chosen by the tempting of this trigger; where it may stand is checked with the trigger (validate.ts).
      if (c.other !== undefined && c.other !== true) {
        issue(out, `${path}.other`, 'other must be true when present');
      }
      break;
    case 'abilityResolvedTimes':
      issue(
        out,
        path,
        'abilityResolvedTimes reads the resolution of a triggered ability: it is only valid in a conditional effect of one',
      );
      break;
    case 'amountIs':
      // D-131: an amount that reads the game now, compared with a whole number.
      checkStateAmount(c.amount, `${path}.amount`, out, 'a condition');
      if (!isOneOf(c.compare?.cmp, ['atLeast', 'atMost', 'equal'])) {
        issue(out, `${path}.compare.cmp`, `unknown comparison ${JSON.stringify(c.compare?.cmp)}`);
      }
      if (!isCount(c.compare?.value)) {
        issue(out, `${path}.compare.value`, 'a count is compared with a non-negative whole number');
      }
      break;
    case 'amountIsPrime':
      // Zimone, All-Questioning: an amount that reads the game now, which is or is not a prime number.
      checkStateAmount(c.amount, `${path}.amount`, out, 'a condition');
      break;
    case 'maxSpeed':
      // CR 702.179e: whether one of the players the selector names has speed 4. A condition has no targets and reads no trigger subject.
      checkConditionPlayers(c.player, `${path}.player`, out);
      break;
    case 'playerHasDesignation':
      // D-131: whether the designation's holder is one of the players the selector names (so "an opponent is the
      // monarch" is `eachOpponent`). A condition has no targets and reads no trigger subject.
      if (!isOneOf(c.designation, DESIGNATIONS)) {
        issue(out, `${path}.designation`, `unknown designation ${JSON.stringify(c.designation)}`);
      }
      checkConditionPlayers(c.player, `${path}.player`, out);
      break;
    case 'sourceHasCounter':
      if (typeof c.counter !== 'string' || c.counter === '') {
        issue(out, `${path}.counter`, 'counter name must be non-empty');
      }
      break;
    case 'and':
    case 'or':
      if (!Array.isArray(c.terms) || c.terms.length === 0) {
        issue(out, `${path}.terms`, `${c.kind} needs at least one term`);
      } else {
        c.terms.forEach((t, i) => {
          checkCondition(t, `${path}.terms[${i}]`, out);
        });
      }
      break;
    case 'not':
      checkCondition(c.term, `${path}.term`, out);
      break;
    default:
      issue(out, path, `unknown condition ${kindOf(c)}`);
  }
}

/**
 * Whether the effect always moves objects, so that the `moved` reference of a later effect has
 * something to mean: an `exile`, `destroy` or `moveToZone`, or a sequence containing one. A
 * `conditional` may not run its branch, so it does not count.
 */
function movesObjects(e: Effect): boolean {
  if (e?.kind === 'sequence') return Array.isArray(e.effects) && e.effects.some(movesObjects);
  // Lorehold group 1: "you may exile that card from your graveyard. If you do, you may play that card this turn": the card a declined `may` did not exile is no card (`moved` is empty).
  if (e?.kind === 'may') return movesObjects(e.effect);
  // CR 608.2c: "If you do, put a +1/+1 counter on this creature and exile the top card of your library. You may play that card this turn.": the cards the branch that ran moved are "that card"; when the condition fails nothing moved and `moved` is empty (`lastMoved` outlives the queued branch).
  if (e?.kind === 'conditional') {
    return movesObjects(e.effect) || (e.else !== undefined && movesObjects(e.else));
  }
  // D-139: a `createToken` produces objects `moved` names too ("create a token, then attach this to it").
  return (
    e?.kind === 'exile' ||
    e?.kind === 'destroy' ||
    e?.kind === 'moveToZone' ||
    // CR 701.6a, 614.1a: the spell a `counter` with `exileInstead` exiled is "it" ("then you may cast it without paying its mana cost").
    (e?.kind === 'counter' && e.exileInstead === true) ||
    e?.kind === 'createToken' ||
    // D-639: the tokens `createCopies` and `populate` made are "they" / "it" / "those tokens" ("Exile those tokens at the beginning of the next end step").
    e?.kind === 'createCopies' ||
    e?.kind === 'populate' ||
    // Twilight Diviner: the token `copyOneOfTriggerCards` made is "it".
    e?.kind === 'copyOneOfTriggerCards' ||
    // D-145: the card found by a `revealUntil` is "it".
    e?.kind === 'revealUntil' ||
    // D-151: the cards `exileTop` exiled are "those cards", and the card Discover found is "the discovered card".
    e?.kind === 'exileTop' ||
    // CR 701.20a, 400.7j: the card `revealTopCard` revealed is "that card" ("Reveal the top card of your library. Draw cards equal to that card's mana value").
    e?.kind === 'revealTopCard' ||
    // D-235: the card `exileRandomFromGraveyard` exiled is "the exiled card".
    e?.kind === 'exileRandomFromGraveyard' ||
    // Death Toll deck group B: the cards `chooseRandomFromGraveyard` picked are "it" ("If it's a creature card, put it onto the battlefield").
    e?.kind === 'chooseRandomFromGraveyard' ||
    // D-393: the card `exileRandomFromHand` exiled is "it" ("If it's a land card, you may put it onto the battlefield").
    e?.kind === 'exileRandomFromHand' ||
    e?.kind === 'exileUntilCast' ||
    // D-660, D-661, D-663: the cards exiled by `exileUntilFound`, `exileTopAnyNumber` and `exilePiles` are "the cards exiled this way" (`opponentChoosesCard` keeps the others).
    e?.kind === 'exileUntilFound' ||
    e?.kind === 'opponentChoosesCard' ||
    e?.kind === 'exileTopAnyNumber' ||
    e?.kind === 'exilePiles' ||
    // D-177: the cards a `search` found and put somewhere are "it" and "that land" ("Then if you control four or more lands, untap that land").
    e?.kind === 'search' ||
    // D-216: the card a `lookAndSplit` exiled is "the exiled card" ("You may play the exiled card this turn").
    (e?.kind === 'lookAndSplit' && e.exile > 0) ||
    // D-658: the card a `lookAtTop` put onto the battlefield is "it" ("If an Equipment is put onto the battlefield this way, you may attach it to a creature you control").
    (e?.kind === 'lookAtTop' && e.take?.to === 'battlefield') ||
    // D-327: the cards a `mill` put into a graveyard are "that card" ("Mill a card. You may play that card this turn.").
    e?.kind === 'mill' ||
    // Lorehold group 1: the card `exileFromTriggerCards` exiled is "it" ("If you do, you may cast it this turn").
    e?.kind === 'exileFromTriggerCards' ||
    // Issue 121 (Finale of Promise): the spells a `castCard` with `remember` cast are "those spells" ("If X is 10 or more, copy each of those spells twice").
    (e?.kind === 'castCard' && e.remember === true) ||
    // Cmdr. Troi (CR 608.2g, 707.10): the spell a `castFree` with `remember` cast is "that spell" ("If they do, you copy that spell").
    (e?.kind === 'castFree' && e.remember === true) ||
    // Galadriel group 3: the card a `draw` with `reveal` drew is "that card" ("Draw a card and reveal it. ... that card's mana value").
    (e?.kind === 'draw' && e.reveal === true)
  );
}

const TOKEN_PRESET_NAMES: readonly TokenPreset[] = [
  'Treasure',
  'Food',
  'Clue',
  'Gold',
  'Map',
  'Gingerbrute',
  'Incubator',
  'Lander',
  'Wicked Role',
  'Junk',
];

/** The player selectors that name one player: what an effect with a single "it" (`exileRandomFromHand`) takes. */
const SINGLE_PLAYER_KINDS: readonly (string | undefined)[] = [
  'you',
  'controllerOf',
  'ownerOf',
  'target',
  'defendingPlayer',
  'playerToYourRight',
  'chosenPlayer',
  'triggerPlayer',
];

function checkSacrificeSelector(
  sel: SacrificeSelector,
  path: string,
  scope: Scope,
  out: Out,
): void {
  if (kindOf(sel) !== 'choose') {
    checkObjectSelector(sel as ObjectSelector, path, scope, out);
    return;
  }
  const choose = sel as ChooseSelector;
  // CR 603.2c (Descendants' Fury): "sacrifice one of them" names the creatures that dealt the combat damage of the batch trigger.
  if (choose.fromTriggerSources !== undefined) {
    if (choose.fromTriggerSources !== true) {
      issue(out, `${path}.fromTriggerSources`, 'fromTriggerSources must be true when present');
    } else if (scope.triggerSources !== true) {
      issue(
        out,
        `${path}.fromTriggerSources`,
        "fromTriggerSources needs a triggered ability of a combatDamageBatch trigger: 'them' are the creatures that dealt the damage",
      );
    }
  }
  if (choose.dealtCombatDamageToYou !== undefined && choose.dealtCombatDamageToYou !== true) {
    issue(
      out,
      `${path}.dealtCombatDamageToYou`,
      'dealtCombatDamageToYou must be true when present',
    );
  }
  checkFilter(choose.filter, `${path}.filter`, out, undefined, undefined, {
    ...(scope.sacrificedEarlier === true ? { afterSacrifice: true } : {}),
  });
  // CR 701.21a: a player can only sacrifice their own permanents, so the filter may not name others.
  if (filterSome(choose.filter, (f) => f.controller === 'opponent')) {
    issue(out, `${path}.filter.controller`, 'a player can only sacrifice permanents they control');
  }
  if (choose.filter.zone !== undefined && choose.filter.zone !== 'battlefield') {
    issue(out, `${path}.filter.zone`, 'only permanents on the battlefield can be sacrificed');
  }
  // D-135: "any number of other permanents" (no count) and "the greatest power among" (a stat).
  if (choose.anyNumber !== undefined && choose.anyNumber !== true) {
    issue(out, `${path}.anyNumber`, 'anyNumber must be true when present');
  }
  if (choose.anyNumber === true && choose.count !== undefined) {
    issue(out, `${path}.count`, 'any number of permanents has no count');
  }
  // D-187: "one or more": at least one of any number.
  if (
    choose.atLeastOne !== undefined &&
    (choose.atLeastOne !== true || choose.anyNumber !== true)
  ) {
    issue(out, `${path}.atLeastOne`, 'atLeastOne is true and goes with anyNumber');
  }
  if (
    choose.greatest !== undefined &&
    !isOneOf(choose.greatest, ['power', 'toughness', 'manaValue'])
  ) {
    issue(out, `${path}.greatest`, `unknown stat ${JSON.stringify(choose.greatest)}`);
  }
  if (choose.least !== undefined && !isOneOf(choose.least, ['power', 'toughness', 'manaValue'])) {
    issue(out, `${path}.least`, `unknown stat ${JSON.stringify(choose.least)}`);
  }
  if (choose.least !== undefined && choose.greatest !== undefined) {
    issue(out, `${path}.least`, 'a choice is of the greatest or of the least, not both');
  }
  // D-131: a number, or an amount read as the effect runs ("each player sacrifices X creatures").
  if (choose.count !== undefined) {
    if (typeof choose.count === 'number' && (!isCount(choose.count) || choose.count < 1)) {
      issue(out, `${path}.count`, 'count must be a positive integer');
    } else if (typeof choose.count !== 'number') {
      checkAmount(choose.count, `${path}.count`, scope, out);
    }
  }
}

/**
 * The `choose` selector of `tap` ("tap X untapped Myr you control", D-139): the controller chooses among the untapped permanents on the
 * battlefield they control that match (CR 608.2d), none to all (`anyNumber`) or `count` of them.
 */
function checkChooseTap(sel: ChooseSelector, path: string, scope: Scope, out: Out): void {
  checkFilter(sel.filter, `${path}.filter`, out);
  if (
    sel.greatest !== undefined ||
    sel.least !== undefined ||
    sel.dealtCombatDamageToYou !== undefined ||
    sel.optional !== undefined
  ) {
    issue(out, path, 'greatest, least and optional do not belong to a tap choice');
  }
  if (sel.filter?.controller !== 'you') {
    issue(
      out,
      `${path}.filter.controller`,
      "a choice of what to tap is among the permanents you control: set controller to 'you'",
    );
  }
  if (sel.filter?.zone !== undefined && sel.filter.zone !== 'battlefield') {
    issue(out, `${path}.filter.zone`, 'only permanents on the battlefield can be tapped');
  }
  if (sel.filter?.tapped !== undefined) {
    issue(
      out,
      `${path}.filter.tapped`,
      'a tap choice is among untapped permanents: leave tapped out',
    );
  }
  if (sel.anyNumber !== undefined && sel.anyNumber !== true) {
    issue(out, `${path}.anyNumber`, 'anyNumber must be true when present');
  }
  if (sel.anyNumber === true && sel.count !== undefined) {
    issue(out, `${path}.count`, 'any number of permanents has no count');
  }
  if (sel.atLeastOne !== undefined) {
    issue(out, `${path}.atLeastOne`, 'atLeastOne belongs to a sacrifice choice (D-187)');
  }
  // Issue 102 (Tasigur): "of an opponent's choice": an opponent picks among the controller's own cards of a graveyard; not an offer, not a choice among cards moved.
  if (sel.chosenBy !== undefined) {
    if (
      sel.chosenBy !== 'opponent' ||
      sel.filter?.zone !== 'graveyard' ||
      sel.filter?.controller !== 'you' ||
      sel.optional !== undefined ||
      sel.fromMoved !== undefined ||
      sel.alsoGraveyard !== undefined ||
      sel.anyNumber !== undefined
    ) {
      issue(
        out,
        `${path}.chosenBy`,
        "chosenBy is 'opponent', for a card of the controller's graveyard, with no optional, fromMoved, alsoGraveyard or anyNumber",
      );
    }
  }
  if (sel.count !== undefined) {
    if (typeof sel.count === 'number' && (!isCount(sel.count) || sel.count < 1)) {
      issue(out, `${path}.count`, 'count must be a positive integer');
    } else if (typeof sel.count !== 'number') {
      checkAmount(sel.count, `${path}.count`, scope, out);
    }
  }
}

/**
 * The `choose` selector of `untap` ("Untap up to three lands", D-216, CR 701.26a): none up to `count` of the tapped permanents on the battlefield that the
 * filter matches, whoever controls them.
 */
function checkChooseUntap(sel: ChooseSelector, path: string, scope: Scope, out: Out): void {
  checkFilter(sel.filter, `${path}.filter`, out);
  if (sel.upTo !== true) issue(out, `${path}.upTo`, 'a choice of what to untap is "up to" a count');
  if (sel.count === undefined) {
    issue(
      out,
      `${path}.count`,
      'the number of permanents to untap is a positive integer or an amount',
    );
  } else if (typeof sel.count === 'number') {
    if (!isCount(sel.count) || sel.count < 1) {
      issue(out, `${path}.count`, 'the number of permanents to untap is a positive integer');
    }
  } else {
    // "Untap up to X lands, where X is the greatest power among those creatures": an amount read as the effect runs (0 untaps nothing).
    checkAmount(sel.count, `${path}.count`, scope, out);
  }
  if (
    sel.anyNumber !== undefined ||
    sel.atLeastOne !== undefined ||
    sel.greatest !== undefined ||
    sel.least !== undefined ||
    sel.dealtCombatDamageToYou !== undefined ||
    sel.optional !== undefined
  ) {
    issue(
      out,
      path,
      'anyNumber, atLeastOne, greatest and optional do not belong to an untap choice',
    );
  }
  if (sel.filter?.zone !== undefined && sel.filter.zone !== 'battlefield') {
    issue(out, `${path}.filter.zone`, 'only permanents on the battlefield can be untapped');
  }
  if (sel.filter?.tapped !== undefined) {
    issue(
      out,
      `${path}.filter.tapped`,
      'an untap choice is among tapped permanents: leave tapped out',
    );
  }
  void scope;
}

/**
 * The `choose` selector of `moveToZone` ("return a land you control to its owner's hand"): the
 * controller of the effect chooses among the permanents they control (CR 608.2d), so the filter
 * says "you control" and looks at the battlefield. Choosing among other players' permanents, or
 * among cards in other zones, is not run (docs/ROADMAP.md).
 */
function checkChooseMove(sel: ChooseSelector, path: string, scope: Scope, out: Out): void {
  checkFilter(sel.filter, `${path}.filter`, out);
  // CR 107.3a: "mana value X or less" of a card chosen reads the X of the spell or ability that has one.
  if (
    (sel.filter?.manaValueAtMost as { kind?: string } | undefined)?.kind === 'x' &&
    !scope.xAllowed
  ) {
    issue(
      out,
      `${path}.filter.manaValueAtMost`,
      'the X of the limit is used but nothing in this ability or spell has an X',
    );
  }
  if (sel.atLeastOne !== undefined) {
    issue(out, `${path}.atLeastOne`, 'atLeastOne belongs to a sacrifice choice (D-187)');
  }
  if (
    sel.greatest !== undefined ||
    sel.least !== undefined ||
    sel.dealtCombatDamageToYou !== undefined ||
    (sel.anyNumber !== undefined && sel.minCardTypes === undefined)
  ) {
    issue(
      out,
      path,
      'anyNumber and greatest belong to a sacrifice choice (D-135), and so does least',
    );
  }
  // CR 205.2a: "you may exile any number of cards from your graveyard with four or more card types among them": a number of card types for the cards chosen together.
  if (sel.minCardTypes !== undefined) {
    if (!isCount(sel.minCardTypes) || sel.minCardTypes < 2 || sel.minCardTypes > 8) {
      issue(out, `${path}.minCardTypes`, 'minCardTypes is a whole number of card types, 2 to 8');
    }
    if (
      sel.anyNumber !== true ||
      sel.optional !== true ||
      sel.count !== undefined ||
      sel.filter?.zone !== 'graveyard' ||
      sel.fromMoved !== undefined ||
      sel.alsoGraveyard !== undefined
    ) {
      issue(
        out,
        `${path}.minCardTypes`,
        "minCardTypes goes with anyNumber and optional, with no count, for cards chosen from the graveyard (zone 'graveyard') and not from among moved cards",
      );
    }
  }
  if (sel.filter?.controller !== 'you') {
    issue(
      out,
      `${path}.filter.controller`,
      "a choice of what to move is among the permanents you control: set controller to 'you'",
    );
  }
  if (
    sel.filter?.zone !== undefined &&
    !isOneOf(sel.filter.zone, ['battlefield', 'hand', 'graveyard', 'exile', 'command'])
  ) {
    issue(
      out,
      `${path}.filter.zone`,
      'only permanents on the battlefield, or cards in your hand or graveyard (D-139) or exiled with this permanent (D-207), can be chosen to move',
    );
  }
  // D-207, CR 607.2a: "a card exiled with this artifact": the permanent's own linked exile, so an ability's.
  if (sel.filter?.zone === 'exile' && scope.owner !== 'ability' && sel.fromMoved !== true) {
    issue(
      out,
      `${path}.filter.zone`,
      'the cards exiled with a permanent are chosen by an ability of it',
    );
  }
  if (sel.optional !== undefined && sel.optional !== true) {
    issue(out, `${path}.optional`, 'optional must be true when present');
  }
  if (sel.exceptSacrificed !== undefined) {
    if (sel.exceptSacrificed !== true || sel.fromMoved === true) {
      issue(
        out,
        `${path}.exceptSacrificed`,
        'exceptSacrificed must be true and not combined with fromMoved',
      );
    }
    if (sel.filter?.zone !== 'graveyard' || !(scope.thisWay ?? []).includes('sacrificed')) {
      issue(
        out,
        `${path}.exceptSacrificed`,
        'excluding sacrificed cards needs a prior sacrifice and a graveyard choice',
      );
    }
  }
  // D-411: "You may put a land card from among them into your hand": only the cards the effect before it moved (`moved`) are the candidates.
  if (sel.fromMoved !== undefined) {
    if (sel.fromMoved !== true)
      issue(out, `${path}.fromMoved`, 'fromMoved must be true when present');
    // Death Toll deck: "exile any number of cards ... If you do, put a permanent card from among them onto the battlefield": the cards the effect before it exiled.
    if (sel.filter?.zone !== 'graveyard' && sel.filter?.zone !== 'exile') {
      issue(
        out,
        `${path}.filter.zone`,
        "a choice among the cards an earlier effect moved is among cards in your graveyard (D-411) or exile: set zone to 'graveyard' or 'exile'",
      );
    }
    if (scope.movedAvailable !== true) {
      issue(
        out,
        `${path}.fromMoved`,
        'fromMoved ("from among them") needs an effect before it in the sequence that moved cards (a mill)',
      );
    }
  }
  if (
    sel.fromAnyGraveyard !== undefined &&
    (sel.fromAnyGraveyard !== true || sel.fromMoved !== true)
  ) {
    issue(
      out,
      `${path}.fromAnyGraveyard`,
      'fromAnyGraveyard is true and only with fromMoved (issue 159)',
    );
  }
  // D-544: "from your hand or graveyard": the graveyard is added to a choice among the cards of the hand; the destination (the battlefield) is checked with the move.
  if (sel.alsoGraveyard !== undefined) {
    if (sel.alsoGraveyard !== true) {
      issue(out, `${path}.alsoGraveyard`, 'alsoGraveyard must be true when present');
    }
    if (sel.filter?.zone !== 'hand' || sel.fromMoved === true) {
      issue(
        out,
        `${path}.alsoGraveyard`,
        'a choice from the hand or the graveyard (D-544) names the hand as its zone and is not a choice among moved cards',
      );
    }
  }
  // "Put a creature card from defending player's hand onto the battlefield": the hand of one named player, the chooser choosing.
  if (sel.fromHandOf !== undefined) {
    checkPlayerSelector(sel.fromHandOf, `${path}.fromHandOf`, scope, out);
    if (
      sel.filter?.zone !== 'hand' ||
      sel.fromMoved === true ||
      sel.alsoGraveyard !== undefined ||
      sel.optional !== true
    ) {
      issue(
        out,
        `${path}.fromHandOf`,
        'a choice from the hand of another player names the hand as its zone, is optional and is not a choice among moved cards or from the graveyard',
      );
    }
    if (sel.fromHandOf.kind !== 'defendingPlayer') {
      issue(out, `${path}.fromHandOf`, "only the defending player's hand is read");
    }
  }
  if (sel.count !== undefined) {
    if (typeof sel.count === 'number' && (!isCount(sel.count) || sel.count < 1)) {
      issue(out, `${path}.count`, 'count must be a positive integer');
    } else if (typeof sel.count !== 'number') {
      checkAmount(sel.count, `${path}.count`, scope, out);
    }
  }
}

/**
 * CR 208.2, 208.2a, 604.3: a card prints `'*'` for the power or toughness a characteristic-defining
 * ability defines, and for nothing else. So a printed star needs the ability (without it nothing says what
 * the star is) and the ability needs the star (otherwise it would silently override a number the card
 * prints), and each of the two is defined once. `print` is the face's or the token's printed power and
 * toughness.
 */
export function checkStarPairing(
  print: { readonly power: unknown; readonly toughness: unknown },
  abilities: readonly Ability[],
  path: string,
  out: Out,
): void {
  for (const key of ['power', 'toughness'] as const) {
    const defining = abilities.filter(
      (a) =>
        a?.kind === 'static' &&
        a.static?.kind === 'characteristicPt' &&
        a.static[key] !== undefined,
    ).length;
    if (print[key] === '*' && defining === 0) {
      issue(
        out,
        `${path}.${key}`,
        `a printed '*' ${key} needs a characteristic-defining ability that defines it (CR 208.2a, 604.3)`,
      );
    }
    if (print[key] !== '*' && defining > 0) {
      issue(
        out,
        `${path}.${key}`,
        `a characteristic-defining ability defines the ${key}, which the card must print as '*' (CR 208.2)`,
      );
    }
    if (defining > 1) {
      issue(out, `${path}.abilities`, `the ${key} is defined by more than one ability (CR 604.3)`);
    }
  }
}

function checkTokenDefinition(def: TokenDefinition, path: string, scope: Scope, out: Out): void {
  if (typeof def.name !== 'string' || def.name === '') issue(out, `${path}.name`, 'name is empty');
  if (!Array.isArray(def.types) || def.types.length === 0) {
    issue(out, `${path}.types`, 'a token needs at least one card type');
  } else {
    def.types.forEach((t, i) => {
      if (!isOneOf(t, CARD_TYPES)) issue(out, `${path}.types[${i}]`, `unknown card type ${t}`);
    });
  }
  (def.supertypes ?? []).forEach((t, i) => {
    if (!isOneOf(t, SUPERTYPES)) issue(out, `${path}.supertypes[${i}]`, `unknown supertype ${t}`);
  });
  (def.colors ?? []).forEach((c, i) => {
    if (!isOneOf(c, COLORS)) issue(out, `${path}.colors[${i}]`, `unknown color ${c}`);
  });
  for (const key of ['power', 'toughness'] as const) {
    const v = def[key];
    if (def.types?.includes('creature')) {
      // D-543 (CR 208.2a, 604.3): a '*' is the power or toughness its own characteristic-defining ability sets (`checkStarPairing` below pairs the two).
      if (v !== '*' && (typeof v !== 'number' || !Number.isSafeInteger(v))) {
        issue(out, `${path}.${key}`, `a creature token needs a numeric ${key}`);
      }
    } else if (v !== null) {
      // Issue 105 (CR 301.7, 302.1): a Vehicle token is an artifact with a power and a toughness that becomes a creature when it is crewed.
      const vehicle = def.types?.includes('artifact') === true && def.subtypes?.includes('Vehicle');
      if (!vehicle || typeof v !== 'number' || !Number.isSafeInteger(v)) {
        issue(out, `${path}.${key}`, `only a creature token has ${key}`);
      }
    }
  }
  // CR 306.5b, 310.4b (D-200): a planeswalker token enters with loyalty counters equal to its loyalty, a battle token with defense counters.
  for (const [key, type] of [
    ['loyalty', 'planeswalker'],
    ['defense', 'battle'],
  ] as const) {
    const v = def[key];
    if (def.types?.includes(type)) {
      if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
        issue(out, `${path}.${key}`, `a ${type} token needs a non-negative ${key}`);
      }
    } else if (v !== null && v !== undefined) {
      issue(out, `${path}.${key}`, `only a ${type} token has ${key}`);
    }
  }
  if (!Array.isArray(def.abilities)) {
    issue(out, `${path}.abilities`, 'abilities must be a list');
  } else {
    def.abilities.forEach((a, i) => {
      scope.checkAbility(a, `${path}.abilities[${i}]`, out);
    });
    checkStarPairing(def, def.abilities, path, out);
    loyaltyOffPlaneswalkerIssues(def.types ?? [], def.abilities, path, out);
    // D-185: one devour ability on a token (CR 702.82a: the engine reads the first).
    if (
      def.abilities.filter((a) => a?.kind === 'keyword' && a.keyword?.kind === 'devour').length > 1
    ) {
      issue(out, `${path}.abilities`, 'more than one devour ability on a token is not supported');
    }
    // CR 702.95a (D-286): soulbond pairs creatures, so on a token that is not a creature it would be accepted and do nothing (the same refusal as for a card face).
    if (!def.types?.includes('creature')) {
      def.abilities.forEach((a, i) => {
        if (a?.kind === 'keyword' && a.keyword?.kind === 'soulbond') {
          issue(
            out,
            `${path}.abilities[${i}]`,
            'Soulbond is an ability of creatures (CR 702.95a): a token that is not a creature cannot have it',
          );
        }
      });
    }
    // D-100: a token that refers to "the chosen type" asks for it as it is created.
    chosenIssues(def.abilities, [], path, true, out);
  }
}

/**
 * The `triggerSubject` reference where the engine reads it: `expect` says what kind of object the
 * node needs ('stack': a spell or ability, 'permanent': a permanent). Anything else is reported.
 */
export function checkSubjectRef(
  ref: ObjectRef,
  expect: 'permanent' | 'stack',
  path: string,
  scope: Scope,
  out: Out,
): void {
  if (scope.triggerSubject === undefined) {
    issue(out, path, "'triggerSubject' needs a triggered ability whose trigger has a subject");
  } else if (scope.triggerSubject !== expect) {
    issue(
      out,
      path,
      expect === 'stack'
        ? 'the triggering object is a permanent here, not a spell or ability'
        : 'the triggering object is a spell or ability here, not a permanent',
    );
  } else if (ref?.kind !== 'triggerSubject') {
    issue(out, path, 'expected the triggerSubject reference');
  }
}

/** What a copy is made from (CR 707.2): this permanent, a target, or the triggering permanent. */
function checkCopySource(ref: ObjectRef, path: string, scope: Scope, out: Out): void {
  switch (ref?.kind) {
    case 'triggerSubject':
      checkSubjectRef(ref, 'permanent', path, scope, out);
      break;
    case 'this':
    case 'target':
      checkRef(ref, 'object', path, scope, out);
      break;
    case 'chosen':
      // D-642 (CR 608.2d): "each other token you control becomes a copy of that token": the one an earlier `chooseObjects` of the same sequence chose.
      checkRef(ref, 'object', path, scope, out);
      break;
    case 'moved':
      // CR 707.2, 400.7j: "you may exile a creature card from your graveyard. If you do, create a token that's a copy of that card": the card the effect before it moved.
      checkRef(ref, 'object', path, scope, out);
      break;
    default:
      issue(
        out,
        path,
        'a copy is made from this permanent, a target, the permanent chosen or the triggering permanent',
      );
  }
}

/** The exceptions of a copy that change a characteristic (D-382, CR 707.9b, 707.9d): creature types, colors, power and toughness, no mana cost. */
function checkCopyExceptions(
  spec: Extract<Extract<Effect, { kind: 'createToken' }>['token'], { kind: 'copyOf' }>,
  path: string,
  out: Out,
): void {
  if (spec.setCreatureTypes !== undefined) {
    if (!Array.isArray(spec.setCreatureTypes) || spec.setCreatureTypes.length === 0) {
      issue(
        out,
        `${path}.setCreatureTypes`,
        'setCreatureTypes is a non-empty list of creature types',
      );
    } else if (
      spec.setCreatureTypes.some((t) => typeof t !== 'string' || isNonCreatureSubtype(t))
    ) {
      issue(out, `${path}.setCreatureTypes`, 'setCreatureTypes names creature types only');
    }
    if (spec.addSubtypes !== undefined) {
      issue(
        out,
        path,
        'a copy is given creature types instead of its own (setCreatureTypes) or in addition to them (addSubtypes), not both',
      );
    }
  }
  if (spec.addTypes !== undefined) {
    if (!Array.isArray(spec.addTypes) || spec.addTypes.length === 0) {
      issue(out, `${path}.addTypes`, 'addTypes is a non-empty list of card types');
    } else {
      checkEnumList(out, `${path}.addTypes`, spec.addTypes, CARD_TYPES, 'card type');
    }
  }
  if (spec.setColors !== undefined) {
    if (!Array.isArray(spec.setColors) || spec.setColors.some((c) => !isOneOf(c, COLORS))) {
      issue(out, `${path}.setColors`, 'setColors is a list of colors');
    } else if (new Set(spec.setColors).size !== spec.setColors.length) {
      issue(out, `${path}.setColors`, 'duplicate color');
    }
  }
  if (spec.setPt !== undefined) {
    const { power, toughness } = spec.setPt;
    if (!Number.isSafeInteger(power) || !Number.isSafeInteger(toughness)) {
      issue(out, `${path}.setPt`, 'setPt is a whole power and a whole toughness');
    }
  }
  // CR 707.9b, 107.1a (Saw in Half): "except their power is half that creature's power and their toughness is half ... Round up each time".
  if (spec.halfPt !== undefined) {
    if (spec.halfPt !== true) issue(out, `${path}.halfPt`, 'halfPt must be true when present');
    if (spec.setPt !== undefined) {
      issue(out, `${path}.halfPt`, 'halfPt and setPt both give the power and toughness: only one');
    }
  }
  if (spec.noManaCost !== undefined && spec.noManaCost !== true) {
    issue(out, `${path}.noManaCost`, 'noManaCost must be true when present');
  }
  // Galadriel group 3: "except it's not legendary and its starting loyalty is 1".
  if (spec.notLegendary !== undefined && spec.notLegendary !== true) {
    issue(out, `${path}.notLegendary`, 'notLegendary must be true when present');
  }
  if (spec.startingLoyalty !== undefined && !isCount(spec.startingLoyalty)) {
    issue(out, `${path}.startingLoyalty`, 'startingLoyalty is a whole number from 0');
  }
}

/**
 * CR 303.4f, 303.4g, 701.3 (issue 89): `createToken.attachTo` names the target an Aura token is attached to as it is created. An Aura token (a custom token with the Aura subtype)
 * has one, and a token with one is a custom Aura token with an "enchant" ability that is not "enchant player" (a player is not a permanent a target can name here).
 */
function checkAuraTokenAttachment(
  e: Extract<Effect, { kind: 'createToken' }>,
  path: string,
  scope: Scope,
  out: Out,
): void {
  // A predefined Role token (CR 111.10, 303.7) is an Aura token too: it is created attached to its host like a custom one.
  const definition =
    e.token?.kind === 'custom'
      ? e.token.definition
      : e.token?.kind === 'preset'
        ? TOKEN_PRESETS[e.token.preset]
        : undefined;
  const isAura = definition?.subtypes?.includes('Aura') === true;
  if (e.attachTo === undefined) {
    if (isAura) {
      issue(out, `${path}.attachTo`, 'an Aura token is created attached to a target: name it');
    }
    return;
  }
  if (e.attachTo?.kind !== 'target') {
    issue(out, `${path}.attachTo`, 'the object an Aura token is attached to is a target');
  } else {
    checkRef(e.attachTo, 'object', `${path}.attachTo`, scope, out);
  }
  const enchants = (definition?.abilities ?? []).some(
    (a) => a?.kind === 'keyword' && a.keyword?.kind === 'enchant' && a.keyword.player !== true,
  );
  if (
    !isAura ||
    definition?.types?.includes('enchantment') !== true ||
    !enchants ||
    e.attacking !== undefined ||
    e.forEachOpponent !== undefined
  ) {
    issue(
      out,
      `${path}.attachTo`,
      'only a custom Aura enchantment token with an enchant ability is created attached',
    );
  }
}

function checkTokenSpec(
  spec: Extract<Effect, { kind: 'createToken' }>['token'],
  path: string,
  scope: Scope,
  out: Out,
): void {
  switch (spec?.kind) {
    case 'preset':
      if (!isOneOf(spec.preset, TOKEN_PRESET_NAMES)) {
        issue(out, `${path}.preset`, `unknown predefined token ${JSON.stringify(spec.preset)}`);
      }
      break;
    case 'custom':
      checkTokenDefinition(spec.definition, `${path}.definition`, scope, out);
      if (spec.ptAmount !== undefined) checkAmount(spec.ptAmount, `${path}.ptAmount`, scope, out);
      break;
    case 'copyOf':
      checkCopySource(spec.object, `${path}.object`, scope, out);
      // D-230: the exceptions of a copy: creature types and abilities it has besides what it copies; `linkExiled` after an exile in the same sequence.
      if (
        spec.addSubtypes !== undefined &&
        (!Array.isArray(spec.addSubtypes) || spec.addSubtypes.length === 0)
      ) {
        issue(out, `${path}.addSubtypes`, 'addSubtypes is a non-empty list of creature types');
      }
      checkCopyExceptions(spec, path, out);
      if (spec.abilities !== undefined) {
        if (!Array.isArray(spec.abilities))
          issue(out, `${path}.abilities`, 'abilities must be a list');
        else
          spec.abilities.forEach((a, i) => {
            scope.checkAbility(a, `${path}.abilities[${i}]`, out);
          });
      }
      if (spec.embalmed !== undefined && spec.embalmed !== true) {
        issue(out, `${path}.embalmed`, 'embalmed must be true when present');
      }
      if (spec.linkExiled !== undefined && spec.linkExiled !== true) {
        issue(out, `${path}.linkExiled`, 'linkExiled must be true when present');
      }
      break;
    default:
      issue(out, path, `unknown token specification ${kindOf(spec)}`);
  }
}

/** The token a replacement effect creates (D-133): a predefined or a described one, no reference to another object. */
export function checkReplacementToken(spec: unknown, path: string, out: Out): void {
  const kind = kindOf(spec);
  if (kind !== 'preset' && kind !== 'custom') {
    issue(out, path, `a replacement creates a predefined or a described token, not ${kind}`);
    return;
  }
  checkTokenSpec(spec as Extract<Effect, { kind: 'createToken' }>['token'], path, NO_SCOPE, out);
  // D-185: the token a replacement effect creates is made as the creature dies, with no question asked; a token with devour or riot would
  // skip its choice.
  const abilities =
    kind === 'custom'
      ? (spec as { definition?: { abilities?: unknown } }).definition?.abilities
      : undefined;
  if (
    Array.isArray(abilities) &&
    abilities.some(
      (a) => a?.kind === 'keyword' && (a.keyword?.kind === 'devour' || a.keyword?.kind === 'riot'),
    )
  ) {
    issue(
      out,
      path,
      'a token a replacement creates asks no question as it enters: no devour or riot',
    );
  }
}

const SEARCH_ZONES = ['battlefield', 'hand', 'graveyard', 'library'];

/** CR 701.23 (Search): the filter, the number of cards and where the cards found go. */
function checkSearch(
  e: Extract<Effect, { kind: 'search' }>,
  path: string,
  scope: Scope,
  out: Out,
): void {
  // Any player a selector names may search (CR 701.23a): the decisions go to that player.
  checkPlayerSelector(e.player, `${path}.player`, scope, out);
  if (e.optional !== undefined && e.optional !== true) {
    issue(out, `${path}.optional`, 'optional must be true when present');
  }
  const filter = e.filter;
  if (filter === undefined || filter === null || typeof filter !== 'object') {
    issue(out, `${path}.filter`, 'a search needs a filter (use {} for "a card")');
  } else {
    checkFilter(filter, `${path}.filter`, out);
    // CR 107.3a: "a creature card with mana value X or less" reads the X announced for the spell that is resolving.
    if (
      (filter.manaValueAtMost as { kind?: string } | undefined)?.kind === 'x' &&
      !scope.xAllowed
    ) {
      issue(
        out,
        `${path}.filter.manaValueAtMost`,
        'the X of the limit is used but nothing in this ability or spell has an X',
      );
    }
    // The searched zone is the searcher's own library; naming another zone or controller is wrong.
    if (filterSome(filter, (f) => f.zone !== undefined)) {
      issue(out, `${path}.filter.zone`, "a search looks in the searcher's library: leave zone out");
    }
    if (filterSome(filter, (f) => f.controller !== undefined)) {
      issue(
        out,
        `${path}.filter.controller`,
        'cards in a library have no controller: leave it out',
      );
    }
    if (filterSome(filter, (f) => f.tapped !== undefined || f.other === true)) {
      issue(out, `${path}.filter`, 'tapped and other do not apply to cards in a library');
    }
  }
  if (!isCount(e.max) || e.max < 1) {
    issue(out, `${path}.max`, 'max must be a positive integer');
  }
  // D-626: "up to X": an amount read as the search begins; the cards found all go to one place.
  if (e.maxAmount !== undefined) {
    checkAmount(e.maxAmount, `${path}.maxAmount`, scope, out);
    if (
      e.max !== 1 ||
      e.sharedLandType !== undefined ||
      e.destinations?.length !== 1 ||
      e.destinations[0]?.count !== 'rest'
    ) {
      issue(
        out,
        `${path}.maxAmount`,
        "a search for up to an amount has a max of 1 (unread), one destination of 'rest' and no shared land type",
      );
    }
  }
  // CR 202.3: "any number of ... cards with total mana value N or less": a positive limit; one 'rest' destination, nothing else that changes how many are found.
  if (e.totalManaValue !== undefined) {
    if (!isCount(e.totalManaValue) || e.totalManaValue < 1) {
      issue(out, `${path}.totalManaValue`, 'totalManaValue is a positive integer');
    }
    if (
      e.max !== 1 ||
      e.sharedLandType !== undefined ||
      e.maxAmount !== undefined ||
      e.zones !== undefined ||
      e.destinations?.length !== 1 ||
      e.destinations[0]?.count !== 'rest'
    ) {
      issue(
        out,
        `${path}.totalManaValue`,
        "a search with a total mana value has a max of 1 (unread), one destination of 'rest', and no shared land type, zones or maxAmount",
      );
    }
  }
  // CR 701.23: "any number of creature cards": no limit but the library; one 'rest' destination, nothing else that changes how many are found.
  if (e.anyNumber !== undefined) {
    if (e.anyNumber !== true) {
      issue(out, `${path}.anyNumber`, 'anyNumber must be true when present');
    }
    if (
      e.max !== 1 ||
      e.sharedLandType !== undefined ||
      e.maxAmount !== undefined ||
      e.totalManaValue !== undefined ||
      e.zones !== undefined ||
      e.destinations?.length !== 1 ||
      e.destinations[0]?.count !== 'rest'
    ) {
      issue(
        out,
        `${path}.anyNumber`,
        "a search for any number of cards has a max of 1 (unread), one destination of 'rest', and no shared land type, zones, maxAmount or totalManaValue",
      );
    }
  }
  // D-262: "that share a land type" is about two or more land cards found together.
  if (e.sharedLandType !== undefined) {
    if (e.sharedLandType !== true) {
      issue(out, `${path}.sharedLandType`, 'sharedLandType must be true when present');
    } else if (!isCount(e.max) || e.max < 2) {
      issue(
        out,
        `${path}.sharedLandType`,
        'cards share a land type only when two or more are found',
      );
    } else if (!(filter?.types ?? []).includes('land')) {
      issue(
        out,
        `${path}.sharedLandType`,
        "the cards found are land cards: the filter's types include 'land'",
      );
    }
  }
  // CR 701.23a: "your graveyard, hand, and/or library": two or more different zones of the searcher; nothing else of the search is built with them.
  if (e.zones !== undefined) {
    if (
      !Array.isArray(e.zones) ||
      e.zones.length < 2 ||
      new Set(e.zones).size !== e.zones.length ||
      !e.zones.every((z) => isOneOf(z, ['graveyard', 'hand', 'library']))
    ) {
      issue(
        out,
        `${path}.zones`,
        'zones are two or more different ones of graveyard, hand and library',
      );
    }
    if (e.reveal === true || e.shuffle === true || e.sharedLandType !== undefined) {
      issue(
        out,
        `${path}.zones`,
        'a search of several zones has no reveal, shuffle or shared land type: shuffle with a "searched this way" condition',
      );
    }
    if (e.maxAmount !== undefined) {
      issue(out, `${path}.zones`, 'a search of several zones has no maxAmount');
    }
  }
  for (const key of ['reveal', 'shuffle'] as const) {
    if (typeof e[key] !== 'boolean') issue(out, `${path}.${key}`, `${key} must be a boolean`);
  }
  if (!Array.isArray(e.destinations) || e.destinations.length === 0) {
    issue(out, `${path}.destinations`, 'a search needs at least one destination');
    return;
  }
  let fixed = 0;
  let hasRest = false;
  e.destinations.forEach((d, i) => {
    const p = `${path}.destinations[${i}]`;
    if (!isOneOf(d?.zone, SEARCH_ZONES)) {
      issue(out, `${p}.zone`, `cards found cannot go to zone ${JSON.stringify(d?.zone)}`);
    }
    if (d?.tapped !== undefined && (d.zone !== 'battlefield' || typeof d.tapped !== 'boolean')) {
      issue(out, `${p}.tapped`, 'tapped is only valid, as a boolean, for the battlefield');
    }
    if (d?.count === 'rest') {
      if (i !== e.destinations.length - 1) {
        issue(out, `${p}.count`, "'rest' is only valid on the last destination");
      }
      hasRest = true;
    } else if (!isCount(d?.count) || d.count < 1) {
      issue(out, `${p}.count`, "count must be a positive integer or 'rest'");
    } else {
      fixed += d.count;
    }
  });
  // Every card found needs a destination, and none may be left without cards to take.
  if (isCount(e.max)) {
    if (hasRest && fixed >= e.max) {
      issue(out, `${path}.destinations`, "'rest' needs fewer fixed cards than max");
    }
    if (!hasRest && fixed !== e.max) {
      issue(
        out,
        `${path}.destinations`,
        'the destination counts must add up to max (or end in rest)',
      );
    }
  }
}

/**
 * D-660: the filter of an effect that picks cards among those in a library or in exile ("a nonland card"): it describes the card (types, supertypes, subtypes, colors, mana
 * value), and says no zone, controller, owner or stackKind, nor anything read from the game.
 */
function checkLibraryFilter(f: ObjectFilter, path: string, out: Out, scope: Scope): void {
  checkFilter(f, path, out, undefined, scope.diesTrigger === true);
  if (
    filterSome(
      f,
      (g) =>
        g.zone !== undefined ||
        g.controller !== undefined ||
        g.owner !== undefined ||
        g.stackKind !== undefined ||
        g.other !== undefined ||
        readsCombatOrSource(g),
    )
  ) {
    issue(
      out,
      path,
      'the cards are in a library or in exile: no zone, controller, owner, stackKind, other, or anything read from the game',
    );
  }
}

/** The effects a `may` effect wraps: each one tells the engine whether it did something (`StepOutcome.performed`, D-135). */
export const MAY_EFFECT_KINDS = [
  // D-206 (CR 701.3): "you may attach it to target creature you control. If you do, ...".
  'attach',
  'discard',
  'sacrifice',
  'exile',
  'moveToZone',
  'draw',
  'mill',
  'tap',
  // D-151: "you may behold a Dragon. If you do, ...".
  'behold',
  // D-212: "you may have ~ become a copy of another target creature you control until end of turn. If you do, ...".
  'becomeCopy',
  // D-216 (CR 701.24): Ponder's "You may shuffle."
  'shuffle',
  // D-230 (CR 707.10): "you may copy this spell and may choose a new target for the copy".
  'copySpell',
  // D-232: "you may have this creature become a copy of an artifact or creature card from among those cards".
  'becomeCopyOfCard',
  // Galadriel group 1: "you may reveal the top card of your library. If a land card is revealed this way, ...".
  'revealTop',
  // Ingenious Prodigy (Quandrix Unlimited deck, group G): "you may remove a +1/+1 counter from ~. If you do, draw a card." (CR 122.1, 608.2c).
  'removeCounters',
  // Death Toll deck, group D (CR 701.8, 608.2c): "you may destroy another target creature. If a creature is destroyed this way, ...".
  'destroy',
  // Issue 345 (Soulbright Flamekin, CR 608.2c): "If this is the third time this ability has resolved this turn, you may add {R}{R}...".
  'addMana',
  // Issue 102 (Ob Nixilis, the Fallen, CR 119.3, 608.2c): "you may have target player lose 3 life. If you do, put three +1/+1 counters on ~": life was lost when the amount was above 0.
  'loseLife',
];

/**
 * The condition of a `conditional` effect (D-135): the conditions that read the effect's own resolution (`objectMatches`: an
 * object a reference names, `didPrevious`: the `may` before it was done) are checked here, where the scope knows the targets and
 * what was moved; the rest are the plain conditions of `checkCondition`.
 */
function checkEffectCondition(c: Condition, path: string, scope: Scope, out: Out): void {
  switch (c?.kind) {
    case 'objectMatches': {
      const ofKind = kindOf(c.of);
      if (
        ofKind !== 'target' &&
        ofKind !== 'moved' &&
        ofKind !== 'triggerSubject' &&
        ofKind !== 'attached'
      ) {
        issue(
          out,
          `${path}.of`,
          'objectMatches reads a target, the object that was moved, the object that caused the trigger or the permanent this Aura or Equipment is attached to',
        );
      } else if (ofKind === 'triggerSubject') {
        // D-149: "If that land is a Plains": the permanent whose event caused the trigger.
        // D-646 (CR 202.3, 608.2h): or the spell that was cast ("If that spell's mana value is 5 or greater"), read from the spell on the stack or from its last-known information.
        if (scope.triggerSubject !== 'permanent' && scope.triggerSubject !== 'stack') {
          issue(
            out,
            `${path}.of`,
            'triggerSubject is only read where the trigger names a permanent (enters, dies, attacks, ...) or a spell that was cast',
          );
        }
      } else {
        checkRef(c.of, 'object', `${path}.of`, scope, out);
      }
      // CR 115.1 (Shiko and Narset, Unified: "if it targets a permanent or player"): the spell the trigger is about is on the stack, so its filter may say what it targets.
      checkFilter(
        c.filter,
        `${path}.filter`,
        out,
        undefined,
        undefined,
        ofKind === 'triggerSubject' && scope.triggerSubject === 'stack' ? { onStack: true } : {},
      );
      if (
        filterSome(
          c.filter,
          (f) =>
            f.zone !== undefined ||
            f.stackKind !== undefined ||
            f.controller !== undefined ||
            f.owner !== undefined,
        )
      ) {
        issue(
          out,
          `${path}.filter`,
          'objectMatches describes the object (type, subtype, color, ...): no zone, controller, owner or stackKind',
        );
      }
      // D-412: "If you put a Town card into your hand this way": the card is where the earlier instruction put it.
      if (c.inZone !== undefined && c.inZone !== 'hand' && c.inZone !== 'exile') {
        issue(out, `${path}.inZone`, "inZone is only 'hand' or 'exile'");
      }
      // Issue 159: "If at least one Zombie card is milled this way": any of the objects that were moved.
      if (c.any !== undefined && (c.any !== true || ofKind !== 'moved')) {
        issue(out, `${path}.any`, 'any is true, and only with the moved reference');
      }
      break;
    }
    case 'movedTotalManaValue':
      // D-661 (CR 202.3): the cards an earlier moving effect of the sequence moved, added up, against a whole number.
      checkRef({ kind: 'moved' }, 'object', `${path}`, scope, out);
      if (!isOneOf(c.compare?.cmp, ['atLeast', 'atMost', 'equal'])) {
        issue(out, `${path}.compare.cmp`, `unknown comparison ${JSON.stringify(c.compare?.cmp)}`);
      }
      if (!isCount(c.compare?.value)) {
        issue(out, `${path}.compare.value`, 'a total mana value is compared with a whole number');
      }
      break;
    case 'manaValueAtMostAmount': {
      // CR 202.3, 608.2c (Meren of Clan Nel Toth): the mana value of a target, the object that was moved or the one that caused the trigger, against an amount read now.
      const ofKind = kindOf(c.of);
      if (ofKind !== 'target' && ofKind !== 'moved' && ofKind !== 'triggerSubject') {
        issue(
          out,
          `${path}.of`,
          'manaValueAtMostAmount reads a target, the object that was moved or the object that caused the trigger',
        );
      } else if (ofKind === 'triggerSubject') {
        if (scope.triggerSubject !== 'permanent' && scope.triggerSubject !== 'stack') {
          issue(
            out,
            `${path}.of`,
            'triggerSubject is only read where the trigger names a permanent or a spell that was cast',
          );
        }
      } else {
        checkRef(c.of, 'object', `${path}.of`, scope, out);
      }
      checkAmount(c.amount, `${path}.amount`, scope, out);
      break;
    }
    case 'movedShareAllCardTypes':
      // CR 205.2a (Demonic Covenant): the cards an earlier moving effect of the sequence moved, compared by their card types.
      checkRef({ kind: 'moved' }, 'object', `${path}`, scope, out);
      break;
    case 'ringBearerChosen':
      issue(
        out,
        path,
        'ringBearerChosen is the intervening "if" of a ringTempted trigger, read as it triggers and again as it resolves',
      );
      break;
    case 'subjectControlledByYou':
    case 'subjectStat':
    case 'subjectGreaterThanEach':
      // CR 603.10a: "if you control that creature": the permanent whose event caused the trigger.
      if (scope.triggerSubject !== 'permanent') {
        issue(
          out,
          path,
          `${c.kind} reads the permanent the trigger is about: it is only valid in the effect of a trigger about a permanent`,
        );
      }
      checkCondition(c, path, out);
      break;
    case 'abilityResolvedTimes':
      // Galadriel group 1 (CR 608.2c): "if this is the second time this ability has resolved this turn": a whole number from 1, in the effect of a triggered ability.
      if (scope.triggeredAbility !== true && scope.activatedAbility !== true) {
        issue(
          out,
          path,
          'abilityResolvedTimes counts the resolutions of a triggered or an activated ability: it is only valid in the effect of one',
        );
      }
      if (!isCount(c.times) || c.times < 1) {
        issue(out, `${path}.times`, 'times is a whole number from 1');
      }
      break;
    case 'attackersAttackedYou':
      if (scope.triggerAttacked !== true) {
        issue(
          out,
          path,
          'attackersAttackedYou reads the creatures of an attackBatch trigger: it is only valid in the effect of one',
        );
      }
      break;
    case 'thisWayAtLeast':
      // D-210: "if a creature card was discarded this way": what an earlier effect of this same sequence did.
      // D-358: any count an earlier effect of the sequence makes ("If you do" after a mandatory sacrifice reads `sacrificed`, Victimize).
      if (!isOneOf(c.what, THIS_WAY_KINDS)) {
        issue(out, `${path}.what`, `unknown thisWay count ${JSON.stringify(c.what)}`);
      } else if (!(scope.thisWay ?? []).includes(c.what)) {
        issue(
          out,
          path,
          `thisWay "${c.what}" needs ${THIS_WAY_SOURCES[c.what]} before it in the same sequence`,
        );
      }
      if (!isCount(c.count) || c.count < 1) {
        issue(out, `${path}.count`, 'a count of one or more');
      }
      break;
    case 'diedThisWay':
      // CR 700.4, 608.2h (Saw in Half): the creature a reference names went to a graveyard because of a `destroy` earlier in the same sequence.
      checkRef(c.of, 'object', `${path}.of`, scope, out);
      if (!(scope.thisWay ?? []).includes('destroyed')) {
        issue(out, path, 'diedThisWay needs a destroy before it in the same sequence');
      }
      break;
    case 'clashWon':
      // CR 701.30d: "If you win": the clash earlier in the same sequence.
      if (scope.clashed !== true) {
        issue(out, path, 'clashWon needs a clash before it in the same sequence');
      }
      break;
    case 'dieResult': {
      // D-271, CR 706.2, 706.3a: "If the result is 1", "if the result is 4 or more": a number a die of the roll can show.
      const sides = scope.dieSides;
      if (sides === undefined) {
        issue(
          out,
          path,
          'dieResult needs a rollDie before it in the same sequence (the result of the roll is what it reads)',
        );
      }
      if (!isOneOf(c.compare?.cmp, ['atLeast', 'atMost', 'equal'])) {
        issue(out, `${path}.compare.cmp`, `unknown comparison ${JSON.stringify(c.compare?.cmp)}`);
      }
      const value = c.compare?.value;
      if (!isCount(value) || value < 1 || (sides !== undefined && value > sides)) {
        issue(
          out,
          `${path}.compare.value`,
          sides === undefined
            ? 'a die result is a whole number from 1'
            : `a die result is a whole number from 1 to ${sides} (the sides of the roll)`,
        );
      }
      break;
    }
    case 'paired':
      // D-286 (CR 702.95b): the permanent the ability belongs to is paired; a spell is not a permanent, so it never is.
      if (scope.owner !== 'ability') {
        issue(
          out,
          path,
          "'paired' reads the pair of a permanent: it is only valid in an ability of one",
        );
      }
      break;
    case 'didPrevious':
      if (scope.mayAvailable !== true) {
        issue(
          out,
          path,
          'didPrevious ("if you do") needs a "may" effect before it in the sequence (or an effect whose doing it can tell: discard, sacrifice, exile, move, draw, mill)',
        );
      }
      break;
    case 'triggerPlayerIsOpponent':
    case 'triggerPlayerStat':
      // CR 603.2b, 402.1, 608.2c (Fevered Visions): "if the player is your opponent and has four or more cards in hand": the player the event is about.
      if (scope.triggerPlayer !== true) {
        issue(
          out,
          path,
          `${c.kind} reads the player the event is about: it needs a triggered ability whose event is about a player`,
        );
      }
      if (c.kind === 'triggerPlayerStat') {
        if (!isOneOf(c.stat, PLAYER_STATS))
          issue(out, `${path}.stat`, `unknown stat ${String(c.stat)}`);
        if (!isOneOf(c.compare?.cmp, ['atLeast', 'atMost', 'equal'])) {
          issue(out, `${path}.compare.cmp`, `unknown comparison ${JSON.stringify(c.compare?.cmp)}`);
        }
        if (!Number.isSafeInteger(c.compare?.value)) {
          issue(out, `${path}.compare.value`, 'a player stat is compared with a whole number');
        }
      }
      break;
    case 'and':
    case 'or':
      if (!Array.isArray(c.terms) || c.terms.length === 0) {
        issue(out, `${path}.terms`, `${c.kind} needs at least one term`);
      } else {
        c.terms.forEach((t, i) => {
          checkEffectCondition(t, `${path}.terms[${i}]`, scope, out);
        });
      }
      break;
    case 'not':
      checkEffectCondition(c.term, `${path}.term`, scope, out);
      break;
    default:
      checkCondition(c, path, out);
  }
}

/**
 * What a delayed cast trigger may do (CR 603.7c: nothing of the spell or ability that created it is left to name, so it does something to the spell that was cast, or something
 * only the controller does): copy the spell that was cast (D-336), or draw cards and gain life, alone or in a sequence (Quandrix Unlimited group E, Brass Infiniscope).
 */
function isDelayedCastBody(e: Effect | undefined): boolean {
  if (e === undefined || e === null) return false;
  if (e.kind === 'copySpell') return kindOf(e.spell) === 'triggerSubject';
  if (e.kind === 'draw') return kindOf(e.player) === 'you';
  if (e.kind === 'gainLife') return kindOf(e.player) === 'you';
  // CR 608.2d, 707.2 (Summon: Good King Mog XII): "create a token that's a copy of a non-Saga token you control": the permanent is chosen as the ability resolves, then copied.
  if (e.kind === 'chooseObjects') return true;
  if (e.kind === 'createToken') {
    return e.token?.kind === 'copyOf' && kindOf(e.token.object) === 'chosen';
  }
  if (e.kind === 'sequence') {
    return Array.isArray(e.effects) && e.effects.length > 0 && e.effects.every(isDelayedCastBody);
  }
  return false;
}

/**
 * The effect `delayedCast` (CR 603.7, D-336): creates a delayed triggered ability on the controller's next cast of a spell the filter names. Shared by a spell or ability and by the
 * extra effects of a mana ability (Brass Infiniscope).
 */
export function checkDelayedCast(
  e: Extract<Effect, { readonly kind: 'delayedCast' }>,
  path: string,
  scope: Scope,
  out: Out,
): void {
  checkFilter(e.filter, `${path}.filter`, out);
  if (e.filter?.stackKind !== 'spell') {
    issue(
      out,
      `${path}.filter`,
      'the filter of a delayed cast trigger is one of spells (stackKind "spell")',
    );
  }
  if (e.repeat !== undefined && e.repeat !== true) {
    issue(out, `${path}.repeat`, 'repeat must be true when present');
  }
  if (!isDelayedCastBody(e.effect)) {
    issue(
      out,
      `${path}.effect`,
      'a delayed cast trigger copies the spell that was cast, copies a permanent it chooses, or its controller draws cards and gains life',
    );
    return;
  }
  checkEffect(
    e.effect,
    `${path}.effect`,
    {
      owner: 'ability',
      targets: new Map(),
      xAllowed: false,
      triggerSubject: 'stack',
      triggerPlayer: true,
      checkAbility: scope.checkAbility,
      checkContinuous: scope.checkContinuous,
      checkEffectExt: scope.checkEffectExt,
    },
    out,
  );
}

export function checkEffect(e: Effect, path: string, scope: Scope, out: Out): void {
  if (
    e !== undefined &&
    'objects' in e &&
    e.objects?.kind === 'choose' &&
    e.objects.exceptSacrificed !== undefined &&
    e.kind !== 'moveToZone'
  ) {
    issue(
      out,
      `${path}.objects.exceptSacrificed`,
      'excluding sacrificed cards is only read by a moveToZone choice',
    );
  }
  switch (e?.kind) {
    case 'chooseObjects':
      if (typeof e.id !== 'string' || e.id.length === 0)
        issue(out, `${path}.id`, 'chooseObjects needs an id');
      if (!Number.isInteger(e.count) || e.count < 1)
        issue(out, `${path}.count`, 'chooseObjects count must be positive');
      if (e.exactly !== undefined && e.exactly !== true)
        issue(out, `${path}.exactly`, 'exactly must be true when present');
      if (e.filter.zone !== undefined && e.filter.zone !== 'battlefield') {
        issue(out, `${path}.filter.zone`, 'chooseObjects selects permanents on the battlefield');
      }
      // A permanent of any player may be chosen only when the choice is not forced ("You may put a +1/+1 counter on a creature": none is a way to decline); `exactly` is for the
      // controller's own permanents.
      if (
        e.filter.controller !== 'you' &&
        !(e.filter.controller === undefined && e.exactly !== true)
      ) {
        issue(
          out,
          `${path}.filter.controller`,
          'chooseObjects must select permanents the controller controls (or, with no controller said, any permanent when the choice is not exactly)',
        );
      }
      checkFilter(e.filter, `${path}.filter`, out, scope);
      break;
    case 'chooseCreatureType':
      // CR 101.4 (Harsh Mercy): "each player chooses a creature type" names the players who choose.
      if (e.players !== undefined) checkPlayerSelector(e.players, `${path}.players`, scope, out);
      break;
    case 'chooseNumber':
      // CR 608.2d (Expel the Interlopers): "Choose a number between 0 and 10": whole numbers, the least first.
      if (!Number.isInteger(e.min) || !Number.isInteger(e.max) || e.min < 0 || e.max < e.min) {
        issue(out, path, 'chooseNumber needs whole numbers 0 <= min <= max');
      }
      break;
    case 'sequence':
      if (!Array.isArray(e.effects) || e.effects.length === 0) {
        issue(out, `${path}.effects`, 'a sequence needs at least one effect');
      } else {
        // CR 400.7j: from the first moving effect on, `moved` means what that effect produced.
        let after = scope;
        e.effects.forEach((child, i) => {
          checkEffect(child, `${path}.effects[${i}]`, after, out);
          if (movesObjects(child) && after.movedAvailable !== true) {
            after = { ...after, movedAvailable: true };
          }
          if (child?.kind === 'chooseObjects') {
            after = {
              ...after,
              chosenObjects: new Set([...(after.chosenObjects ?? []), child.id]),
            };
          }
          if (child?.kind === 'chooseNumber' && after.chosenNumber !== true) {
            after = { ...after, chosenNumber: true };
          }
          // D-120: after a `loseLife`, "the total life lost this way" can be read.
          if (child?.kind === 'loseLife' && after.lossAvailable !== true) {
            after = { ...after, lossAvailable: true };
          }
          // D-135: after a `may` effect, "if you do" and "when you do" can be used. D-139: also after an effect whose doing the
          // engine can tell (the kinds a `may` wraps: "exile it. If you do, you gain 4 life", CR 608.2c).
          if (
            (child?.kind === 'may' ||
              MAY_EFFECT_KINDS.includes(child?.kind) ||
              // D-231: "each player exiles a card from their graveyard. When one or more nonland cards are exiled this way, ...".
              child?.kind === 'exileOwnGraveyardCard' ||
              // Lorehold group 1: "you may exile one of them from your graveyard. If you do, ...".
              child?.kind === 'exileFromTriggerCards' ||
              // Issue 100 (CR 608.2g): "you may cast a spell ... without paying its mana cost. If you don't, ...": whether a spell was cast is something done (`performed`).
              (child?.kind === 'castFree' && child.max === undefined) ||
              // CR 608.2c, 608.2g: "you may cast that card. If you do, ...": the card was cast when the question of `castCard` was accepted (`performed`).
              child?.kind === 'castCard' ||
              // Issue 89 (CR 603.12): "Create a 2/1 token. When you do, ...": the tokens made are something done (`performed`).
              child?.kind === 'createToken') &&
            after.mayAvailable !== true
          ) {
            after = { ...after, mayAvailable: true };
          }
          // D-135: a reflexive trigger is created when the sequence reaches it and ends the sequence.
          if (child?.kind === 'reflexive' && i !== (e.effects?.length ?? 0) - 1) {
            issue(
              out,
              `${path}.effects[${i}]`,
              'a reflexive trigger is the last effect of its sequence',
            );
          }
          // D-177: after a sacrifice (or the offer of one), "that creature's power" reads the permanent that was sacrificed.
          if (
            (child?.kind === 'sacrifice' ||
              (child?.kind === 'may' && child.effect?.kind === 'sacrifice')) &&
            after.sacrificedEarlier !== true
          ) {
            after = { ...after, sacrificedEarlier: true };
          }
          // D-271: after a die is rolled, the condition `dieResult` can read its result (a later roll replaces it).
          if (child?.kind === 'rollDie' && isCount(child.sides)) {
            after = { ...after, dieSides: child.sides };
          }
          // CR 701.30d: after a clash, the condition `clashWon` can read who won it.
          if (child?.kind === 'clash') after = { ...after, clashed: true };
          // D-194: after a vote, the amount `votesFor` can read the tally of its options.
          if (child?.kind === 'vote' && Array.isArray(child.options)) {
            after = { ...after, voteOptions: child.options };
          }
          // D-131: after a sacrifice, a destroy or a draw, "for each ... this way" can be read.
          const produced = thisWayProduced(child).filter((k) => !(after.thisWay ?? []).includes(k));
          if (produced.length > 0)
            after = { ...after, thisWay: [...(after.thisWay ?? []), ...produced] };
        });
      }
      break;
    case 'dealDamage':
      // CR 402.1: "the number of cards in that player's hand" is the whole amount of damage dealt to players, read for each of them (`rules/damage-effects.ts`).
      if (kindOf(e.amount) === 'cardsInHandOfAffected') {
        if (!PLAYER_ONLY.includes(kindOf(e.to))) {
          issue(
            out,
            `${path}.amount`,
            'cardsInHandOfAffected is the amount of a dealDamage to players',
          );
        }
      } else {
        checkAmount(e.amount, `${path}.amount`, scope, out);
      }
      checkDamageRecipient(e.to, `${path}.to`, scope, out);
      if (e.from !== undefined) checkDamageSource(e.from, `${path}.from`, scope, out);
      // D-145: "if it has trample, excess damage is dealt to that creature's controller instead": a creature deals the damage to creatures.
      if (e.trampleExcess !== undefined) {
        if (e.trampleExcess !== true)
          issue(out, `${path}.trampleExcess`, 'trampleExcess must be true when present');
        if (e.from === undefined) {
          issue(
            out,
            `${path}.trampleExcess`,
            'trampleExcess is about the creature that deals the damage: it needs from',
          );
        }
        const to = kindOf(e.to);
        if (PLAYER_ONLY.includes(to) || to === 'giftRecipient' || to === 'attackedBy') {
          issue(
            out,
            `${path}.trampleExcess`,
            'trampleExcess is about the creatures the damage is dealt to: the recipient names permanents',
          );
        }
      }
      break;
    case 'dealDamageToSelf':
      // CR 120.3 (Lorehold group 1): each object the selector names deals damage to itself equal to its power: a group or a reference, never a choice.
      if (kindOf(e.objects) === 'choose') {
        issue(out, `${path}.objects`, 'dealDamageToSelf names the objects: each or a reference');
      } else {
        checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      }
      break;
    case 'dealDamageToController':
      // CR 120.3 (issue 279): each object the selector names deals the damage to its controller: a group or a reference, never a choice.
      if (kindOf(e.objects) === 'choose') {
        issue(
          out,
          `${path}.objects`,
          'dealDamageToController names the objects: each or a reference',
        );
      } else {
        checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      }
      checkAmount(e.amount, `${path}.amount`, scope, out);
      break;
    case 'exileFromTriggerCards':
      // CR 603.2c (Lorehold group 1): the cards a batch `discarded` trigger saw discarded, one of which is exiled.
      if (scope.triggerCards !== true) {
        issue(
          out,
          path,
          'exileFromTriggerCards needs a trigger about a batch of cards (a batch discarded trigger)',
        );
      }
      break;
    case 'mayPlayCounterCard':
      // CR 122.1 (issue 102, Dauthi Voidwalker): the kind of counter the exiled card has, and whether it is played without paying its mana cost.
      if (typeof e.counter !== 'string' || e.counter === '') {
        issue(out, `${path}.counter`, 'counter names a kind of counter');
      }
      if (e.free !== undefined && e.free !== true) {
        issue(out, `${path}.free`, 'free must be true when present');
      }
      break;
    case 'putOneOfTriggerCards':
      // CR 603.2c (issue 102, Colossal Grave-Reaver): the cards a batch `putIntoGraveyard` trigger saw put into a graveyard, one of which is put onto the battlefield.
      if (scope.triggerCards !== true) {
        issue(
          out,
          path,
          'putOneOfTriggerCards needs a trigger about a batch of cards (a batch putIntoGraveyard trigger)',
        );
      }
      break;
    case 'copyOneOfTriggerCards':
      // CR 603.2c, 707.2 (Twilight Diviner): the permanents a batch `entersBatch` trigger saw enter, one of which is copied.
      if (scope.triggerCards !== true) {
        issue(
          out,
          path,
          'copyOneOfTriggerCards needs a trigger about a batch of permanents (an entersBatch trigger)',
        );
      }
      break;
    case 'dealDividedDamage':
      // CR 601.2d (D-145): the slot the effect names divides the damage; `checkDinosaursFace` checks that it has a `divide`.
      if (kindOf(e.to) !== 'target') {
        issue(
          out,
          `${path}.to`,
          'dealDividedDamage deals the damage to the targets of a slot: a target reference',
        );
      } else {
        checkRef(e.to, 'any', `${path}.to`, scope, out);
      }
      break;
    case 'mill':
      // CR 701.17: each player the selector names mills the amount.
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      checkAmount(e.count, `${path}.count`, scope, out);
      break;
    case 'manifest':
      // CR 701.40a (D-309): each player the selector names manifests the top card of a library, theirs or `fromLibraryOf`'s.
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      if (e.fromLibraryOf !== undefined) {
        checkPlayerSelector(e.fromLibraryOf, `${path}.fromLibraryOf`, scope, out);
      }
      break;
    case 'keepOrSacrifice':
      // CR 608.2d, 701.21a (Slaughter the Strong): each player the selector names keeps a set of their own permanents with total power at most the limit, and sacrifices the rest.
      checkPlayerSelector(e.players, `${path}.players`, scope, out);
      checkFilter(e.filter, `${path}.filter`, out);
      if (e.filter?.controller !== undefined) {
        issue(
          out,
          `${path}.filter.controller`,
          'each player chooses among the permanents they control: leave controller out',
        );
      }
      if (e.filter?.zone !== undefined && e.filter.zone !== 'battlefield') {
        issue(out, `${path}.filter.zone`, 'only permanents on the battlefield can be sacrificed');
      }
      if (!Number.isInteger(e.totalPowerAtMost) || e.totalPowerAtMost < 0) {
        issue(
          out,
          `${path}.totalPowerAtMost`,
          'totalPowerAtMost must be a whole number, 0 or more',
        );
      }
      break;
    case 'sacrifice':
      checkSacrificeSelector(e.objects, `${path}.objects`, scope, out);
      if (e.player !== undefined) {
        checkPlayerSelector(e.player, `${path}.player`, scope, out);
        // CR 701.21a: another player sacrifices a permanent of their choice, never a named one.
        if (kindOf(e.objects) !== 'choose') {
          issue(
            out,
            `${path}.player`,
            'another player can sacrifice only permanents they choose: use a choose selector',
          );
        }
      }
      if (e.byController !== undefined) {
        // D-196: "its controller sacrifices it": a named permanent, sacrificed by whoever controls it; no player and no choice.
        if (e.byController !== true)
          issue(out, `${path}.byController`, 'byController must be true when present');
        if (kindOf(e.objects) === 'choose' || e.player !== undefined) {
          issue(
            out,
            `${path}.byController`,
            'byController is for named permanents, with no player and no choose selector',
          );
        }
      }
      break;
    case 'createCopies': {
      // D-213: a group of permanents named by an `each` selector, and the abilities the copies have besides their own.
      // D-639 (CR 601.2c, 608.2c): "Choose any number of target creatures you control. For each of them, create a token that's a copy of that creature": the permanents a target slot named.
      if (kindOf(e.objects) !== 'each' && kindOf(e.objects) !== 'target') {
        issue(
          out,
          `${path}.objects`,
          'createCopies copies each permanent a group or a target names',
        );
      } else {
        checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      }
      if (e.tapped !== undefined && e.tapped !== true) {
        issue(out, `${path}.tapped`, 'tapped must be true when present');
      }
      if (e.abilities !== undefined) {
        if (!Array.isArray(e.abilities))
          issue(out, `${path}.abilities`, 'abilities must be a list');
        else
          e.abilities.forEach((a, i) => {
            scope.checkAbility(a, `${path}.abilities[${i}]`, out);
          });
      }
      break;
    }
    case 'createToken':
      checkTokenSpec(e.token, `${path}.token`, scope, out);
      checkAmount(e.count, `${path}.count`, scope, out);
      // CR 111.2: the player who creates a token owns it and controls it.
      if (e.controller !== undefined) {
        checkPlayerSelector(e.controller, `${path}.controller`, scope, out);
      }
      // D-131: "tapped" is a flag.
      if (e.tapped !== undefined && e.tapped !== true) {
        issue(out, `${path}.tapped`, 'tapped must be true when present');
      }
      // D-648 (CR 508.4): "that's attacking that opponent": the player the tokens attack.
      if (e.attacking !== undefined) {
        // CR 508.4: with `controllerChooses` the first player an attack batch attacked is only where the token enters; its controller then chooses what it attacks, so a batch that
        // attacked several players is fine there.
        checkPlayerSelector(
          e.attacking.at,
          `${path}.attacking.at`,
          e.attacking.controllerChooses === true && scope.triggerAttacked === true
            ? { ...scope, triggerAttackedSingle: true }
            : scope,
          out,
        );
      }
      // CR 303.4f, 303.4g, 701.3 (issue 89): an Aura token is created attached to a target of the ability (its host is named by the effect, never chosen), and only an Aura token is.
      checkAuraTokenAttachment(e, path, scope, out);
      // D-652 (CR 508.1d, 101.4): "for each opponent, create ... tokens that attack that opponent this turn if able": the controller of the effect makes them for each opponent;
      // the tokens are plain (keywords only), so nothing is asked as they enter and each opponent's tokens are known.
      if (e.forEachOpponent !== undefined) {
        const each = e.forEachOpponent as { mustAttack?: unknown; attacking?: unknown };
        if ((each?.mustAttack === true) === (each?.attacking === true)) {
          issue(
            out,
            `${path}.forEachOpponent`,
            'forEachOpponent is { mustAttack: true } or { attacking: true }',
          );
        }
        if (each?.attacking === true && e.attacking !== undefined) {
          issue(out, `${path}.attacking`, 'the tokens made for each opponent attack that opponent');
        }
        if (e.controller !== undefined) {
          issue(
            out,
            `${path}.controller`,
            'the tokens made for each opponent are the controller’s own',
          );
        }
        if (
          e.token?.kind !== 'custom' ||
          !(e.token.definition?.abilities ?? []).every((a) => a?.kind === 'keyword')
        ) {
          issue(
            out,
            `${path}.token`,
            'tokens made for each opponent are a custom token with keyword abilities only',
          );
        }
      }
      break;
    case 'counterUnlessPays':
      // CR 702.21a, 701.6: "counter that spell or ability" of a trigger about a spell or ability,
      // or "counter target spell unless its controller pays": a target slot of the spell or ability.
      if (kindOf(e.objects) === 'target') {
        checkRef(e.objects as ObjectRef, 'object', `${path}.objects`, scope, out);
      } else if (kindOf(e.objects) === 'triggerSubject') {
        checkSubjectRef(e.objects as ObjectRef, 'stack', `${path}.objects`, scope, out);
      } else {
        issue(
          out,
          `${path}.objects`,
          'counterUnlessPays names a target spell or ability, or the triggering one (triggerSubject)',
        );
      }
      if (e.genericAmount !== undefined) {
        // Galadriel group 3 (CR 118.12a): "unless its controller pays mana equal to ...": the whole cost is that much generic mana, of a target spell.
        if (kindOf(e.objects) !== 'target') {
          issue(out, `${path}.genericAmount`, 'a generic amount to pay is for a target spell');
        }
        if (!Array.isArray(e.cost) || e.cost.length !== 0) {
          issue(out, `${path}.cost`, 'the cost is empty when the amount to pay is generic');
        }
        checkAmount(e.genericAmount, `${path}.genericAmount`, scope, out);
      } else {
        checkCosts(e.cost, `${path}.cost`, out);
      }
      break;
    case 'repeatWhile': {
      // CR 608.2c (Grist, the Hunger Tide): the effects, then `then` and the effects again while the test holds. The last effect is a mill, so each pass takes cards out of a
      // library and the repeat ends; the test reads the cards that mill moved.
      if (!Array.isArray(e.effects) || e.effects.length === 0) {
        issue(out, `${path}.effects`, 'a repeated process needs at least one effect');
        break;
      }
      // CR 701.30d (Hoarder's Greed): or a process that draws cards and ends in a clash, repeated while the controller wins it; each pass draws, so the repeat ends when a library does.
      const clashes =
        e.effects[e.effects.length - 1]?.kind === 'clash' &&
        e.effects.some((child) => child?.kind === 'draw');
      if (e.effects[e.effects.length - 1]?.kind !== 'mill' && !clashes) {
        issue(
          out,
          `${path}.effects`,
          'the repeated process ends with a mill (each pass takes cards out of a library, so the repeat ends), or draws cards and ends with a clash',
        );
      }
      checkEffect({ kind: 'sequence', effects: e.effects }, `${path}.effects`, scope, out);
      const after = { ...scope, movedAvailable: true, ...(clashes ? { clashed: true } : {}) };
      checkEffectCondition(e.condition, `${path}.condition`, after, out);
      if (clashes) {
        if (e.condition?.kind !== 'clashWon') {
          issue(
            out,
            `${path}.condition`,
            'the test of a repeated clash reads who won it (clashWon)',
          );
        }
      } else if (e.condition?.kind !== 'objectMatches' || kindOf(e.condition.of) !== 'moved') {
        issue(
          out,
          `${path}.condition`,
          'the test of a repeated process reads the cards the mill moved (objectMatches of moved)',
        );
      }
      if (e.beforeAgain !== undefined) {
        if (!Array.isArray(e.beforeAgain) || e.beforeAgain.length === 0) {
          issue(
            out,
            `${path}.beforeAgain`,
            'beforeAgain is a list of at least one effect when present',
          );
        } else {
          checkEffect(
            { kind: 'sequence', effects: e.beforeAgain },
            `${path}.beforeAgain`,
            after,
            out,
          );
        }
      }
      break;
    }
    case 'playersMay': {
      // D-210 (CR 608.2d): each player named is asked whether to do the effect; the effect and what is done otherwise are ordinary effects.
      checkPlayerSelector(e.players, `${path}.players`, scope, out);
      if (e.runsAs !== undefined && e.runsAs !== 'chooser') {
        issue(out, `${path}.runsAs`, "runsAs is 'chooser' when present");
      }
      checkEffect(e.effect, `${path}.effect`, scope, out);
      if (e.otherwise !== undefined) {
        checkEffect(e.otherwise, `${path}.otherwise`, { ...scope, declinedPlayer: true }, out);
      }
      break;
    }
    case 'unlessPays':
      // CR 118.12a: "[do something] unless [a player] pays [cost]".
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      checkCosts(e.cost, `${path}.cost`, out);
      checkEffect(e.effect, `${path}.effect`, scope, out);
      if (e.optional !== undefined && e.optional !== true) {
        issue(out, `${path}.optional`, 'optional must be true when present');
      }
      break;
    case 'grantPlayerHexproof': {
      // CR 702.11b (Hylda group 3): players named by a selector ("you", "each opponent", a target player), until end of turn.
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      if (e.duration !== 'untilEndOfTurn') {
        issue(out, `${path}.duration`, 'a player has hexproof until end of turn only');
      }
      break;
    }
    case 'grantCastAsThoughFlash': {
      // CR 601.3b: players named by a selector, until end of turn.
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      if (e.duration !== 'untilEndOfTurn') {
        issue(
          out,
          `${path}.duration`,
          'the permission to cast as though with flash lasts until end of turn',
        );
      }
      break;
    }
    case 'grantPlayerManaAbility': {
      // CR 118.3, 605.1a: a life cost of a whole number from 1, one mana of a color or {C}, until end of turn.
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      if (!Number.isInteger(e.life) || e.life < 1) {
        issue(out, `${path}.life`, 'the life paid for the mana is a whole number from 1');
      }
      if (!['W', 'U', 'B', 'R', 'G', 'C'].includes(e.mana)) {
        issue(out, `${path}.mana`, 'the mana is W, U, B, R, G or C');
      }
      if (e.duration !== 'untilEndOfTurn') {
        issue(out, `${path}.duration`, 'the mana ability of a player lasts until end of turn');
      }
      break;
    }
    case 'grantPlayerProtectionEverything':
    case 'preventPlayerLifeTotalChange':
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      if (e.duration !== 'untilNextTurn') {
        issue(
          out,
          `${path}.duration`,
          "this player effect lasts until the named player's next turn",
        );
      }
      break;
    case 'playerCantCastSpells':
      // CR 101.2, 601.2: the players named can't cast spells for the rest of the turn.
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      if (e.duration !== 'untilEndOfTurn') {
        issue(out, `${path}.duration`, 'this player effect lasts until end of turn');
      }
      break;
    case 'requireAttackSource':
      // CR 508.1d: creatures of the named player (a target player, an opponent) attack the permanent with the ability, during that player's next turn.
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      if (e.duration !== 'untilEndOfTheirNextTurn') {
        issue(out, `${path}.duration`, "this lasts through the end of the player's next turn");
      }
      break;
    case 'gainControl': {
      // CR 613.1b (D-189): a layer 2 effect for one named permanent: a target or the permanent that caused the trigger.
      const named = kindOf(e.objects);
      if (named === 'triggerSubject')
        checkSubjectRef(e.objects as ObjectRef, 'permanent', `${path}.objects`, scope, out);
      else if (named === 'target') checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      else if (named === 'this' && scope.owner === 'ability') {
        // CR 613.1b: "that player gains control of this artifact" (the one player `player` names) or "gain control of ~" (the controller of the ability): the permanent with the ability.
        checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      } else
        issue(
          out,
          `${path}.objects`,
          'gainControl names a target, the permanent that caused the trigger, or the permanent with the ability',
        );
      if (e.player !== undefined) {
        checkPlayerSelector(e.player, `${path}.player`, scope, out);
        if (!SINGLE_PLAYER_KINDS.includes(e.player.kind)) {
          issue(out, `${path}.player`, 'gainControl names one player who gains control');
        }
      }
      if (
        !isOneOf(e.duration, [
          'untilEndOfTurn',
          'untilEndOfYourNextTurn',
          'forAsLongAsYouControlThis',
          'forAsLongAsThisRemains',
          'permanent',
        ])
      ) {
        issue(out, `${path}.duration`, `unknown duration ${JSON.stringify(e.duration)}`);
      }
      if (e.duration === 'forAsLongAsThisRemains' && scope.owner !== 'ability') {
        issue(
          out,
          `${path}.duration`,
          '"for as long as this remains on the battlefield" is the effect of an ability of a permanent',
        );
      }
      if (e.duration === 'forAsLongAsYouControlThis' && scope.owner !== 'ability') {
        issue(
          out,
          `${path}.duration`,
          '"for as long as you control this" is the effect of an ability of a permanent',
        );
      }
      break;
    }
    case 'returnControlToOwners':
      // CR 613.1b (D-628): a group, a target or the permanent with the ability.
      checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      break;
    case 'exchangeControl': {
      // CR 701.12a (Galadriel group 3): two permanents, each the permanent with the ability or a target; never the same one twice.
      const sides = [
        ['first', e.first],
        ['second', e.second],
      ] as const;
      for (const [name, selector] of sides) {
        const named = kindOf(selector);
        if (named === 'target' || named === 'this') {
          checkObjectSelector(selector, `${path}.${name}`, scope, out);
        } else {
          issue(
            out,
            `${path}.${name}`,
            'exchangeControl names the permanent with the ability (this) or a target',
          );
        }
      }
      if (kindOf(e.first) === kindOf(e.second) && kindOf(e.first) === 'this') {
        issue(out, path, 'exchangeControl names two different permanents');
      }
      if (
        kindOf(e.first) === 'target' &&
        kindOf(e.second) === 'target' &&
        (e.first as { id?: string }).id === (e.second as { id?: string }).id
      ) {
        issue(out, path, 'exchangeControl names two different permanents');
      }
      break;
    }
    case 'removeCounters':
      // CR 122.1 (Galadriel group 3): counters of one kind come off the permanents the selector names, a number read as the effect resolves.
      checkAffectedObjects(e.objects, `${path}.objects`, scope, out);
      if (typeof e.counter !== 'string' || e.counter === '') {
        issue(out, `${path}.counter`, 'counter name must be non-empty');
      }
      checkAmount(e.count, `${path}.count`, scope, out);
      break;
    case 'becomeCopy':
      checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      checkCopySource(e.of, `${path}.of`, scope, out);
      if (!isOneOf(e.duration, ['untilEndOfTurn', 'permanent'])) {
        issue(out, `${path}.duration`, `unknown duration ${JSON.stringify(e.duration)}`);
      }
      if (e.keepName !== undefined && e.keepName !== true) {
        issue(out, `${path}.keepName`, 'keepName is true when present');
      }
      if (e.addTypes !== undefined) {
        if (!Array.isArray(e.addTypes) || e.addTypes.length === 0) {
          issue(out, `${path}.addTypes`, 'addTypes is a non-empty list when present');
        } else {
          checkEnumList(out, `${path}.addTypes`, e.addTypes, CARD_TYPES, 'card type');
        }
      }
      if (e.addSupertypes !== undefined) {
        if (!Array.isArray(e.addSupertypes) || e.addSupertypes.length === 0) {
          issue(out, `${path}.addSupertypes`, 'addSupertypes is a non-empty list when present');
        } else {
          checkEnumList(out, `${path}.addSupertypes`, e.addSupertypes, SUPERTYPES, 'supertype');
        }
      }
      // D-640 (CR 707.9b): "..., except it has myriad": the abilities the copy has besides the ones it copies.
      if (e.abilities !== undefined) {
        if (!Array.isArray(e.abilities) || e.abilities.length === 0) {
          issue(out, `${path}.abilities`, 'abilities is a non-empty list when present');
        } else {
          e.abilities.forEach((a, i) => {
            scope.checkAbility(a, `${path}.abilities[${i}]`, out);
          });
        }
      }
      break;
    case 'destroy':
      checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      // D-120: "It can't be regenerated" is a flag (CR 701.19c).
      if (e.cantBeRegenerated !== undefined && e.cantBeRegenerated !== true) {
        issue(out, `${path}.cantBeRegenerated`, 'cantBeRegenerated must be true when present');
      }
      break;
    case 'attackRandomOpponent':
      // CR 508.1d: the creature of the ability, which is a permanent: not a spell.
      if (e.creature.kind !== 'this') {
        issue(
          out,
          `${path}.creature`,
          "'attackRandomOpponent' names the creature of the ability ('this')",
        );
      }
      if (scope.owner !== 'ability') {
        issue(out, path, "'attackRandomOpponent' needs an ability of a permanent, not a spell");
      }
      break;
    case 'assignControlToOpponents':
      // Issue 81 (Dack Fayden): the permanents an earlier effect moved.
      checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      if (kindOf(e.objects) !== 'moved') {
        issue(
          out,
          `${path}.objects`,
          "the permanents are the ones an effect before moved ('moved')",
        );
      }
      break;
    case 'goad':
      // D-639 (CR 701.15a): each creature the selector names is goaded by the controller of the effect.
      checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      if (e.forever !== undefined && e.forever !== true) {
        issue(out, `${path}.forever`, 'forever must be true when present');
      }
      break;
    case 'removeFromCombat':
      // CR 506.4: each creature the selector names is taken out of the combat in progress.
      checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      break;
    case 'regenerate':
      // CR 701.19a: a shield for each permanent the selector names, until end of turn.
      checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      if (e.duration !== 'untilEndOfTurn') {
        issue(out, `${path}.duration`, 'a regeneration shield lasts until end of turn');
      }
      break;
    case 'mayPay': {
      // CR 702.101a: "you may pay [cost]. If you do, [effect]".
      // Issue 101: the player who pays is named by `by` ("its controller"), a player selector of the ability.
      if (e.by !== undefined) {
        checkPlayerSelector(e.by, `${path}.by`, scope, out);
        checkSinglePlayer(e.by, `${path}.by`, 'mayPay', out);
        if (e.effect?.kind === 'reflexive') {
          issue(out, `${path}.by`, 'a payment by another player has no reflexive ability');
        }
      }
      // D-364 (CR 119.4): the life paid may be the life that caused the trigger (`triggerDamage`, "pay that much life"), which the amount checks against
      // the trigger of the ability; any other amount is held to what a payment of life reads (`checkCost`).
      // CR 202.3, 603.3d (G'raha Tia): "you may pay X life, where X is that spell's mana value": the amount `manaValueOf` the `triggerSubject` is read the same way, as the
      // ability resolves, and `checkAmount` holds it to a trigger that has a spell.
      const readsTrigger = (a: Amount): boolean =>
        kindOf(a) === 'triggerDamage' ||
        (kindOf(a) === 'manaValueOf' && kindOf((a as { of?: unknown }).of) === 'triggerSubject');
      if (Array.isArray(e.cost)) {
        e.cost.forEach((c, i) => {
          if (c?.kind === 'payLife' && readsTrigger(c.amount)) {
            checkAmount(c.amount, `${path}.cost[${i}].amount`, scope, out);
          }
        });
      }
      checkCosts(
        Array.isArray(e.cost)
          ? e.cost.map((c) =>
              c?.kind === 'payLife' && readsTrigger(c.amount) ? { ...c, amount: 1 } : c,
            )
          : e.cost,
        `${path}.cost`,
        out,
      );
      // D-511 (CR 603.12): "you may pay {1}. When you do, ...": the effect runs when the payment was made.
      checkEffect(e.effect, `${path}.effect`, { ...scope, paidAvailable: true }, out);
      break;
    }
    case 'cumulativeUpkeep':
      // CR 702.24a (D-127): the cost for each age counter; the effect of an ability of a permanent, never a spell.
      checkCosts(e.cost, `${path}.cost`, out);
      if (Array.isArray(e.cost) && e.cost.length === 0) {
        issue(out, `${path}.cost`, 'cumulativeUpkeep needs a cost to pay');
      }
      if (scope.owner !== 'ability') {
        issue(out, path, 'cumulativeUpkeep is the effect of an ability of a permanent only');
      }
      break;
    case 'removeTimeCounter':
    case 'castExiled':
      checkEngineOnlyEffect(e.kind, path, out);
      break;
    case 'pair':
      // CR 702.95a (D-286): the effect of the two abilities soulbond stands for, built by the engine.
      issue(
        out,
        path,
        'pair is the effect of the abilities the engine builds for soulbond (CR 702.95a); a card writes the keyword',
      );
      break;
    case 'delayedTrigger':
      // CR 603.7 (D-128): an effect that creates a delayed triggered ability.
      if (e.effect?.kind === 'unlessPays') checkCosts(e.effect.cost, `${path}.effect.cost`, out);
      // The delayed draw of another player ("its controller draws a card") is bound to one player as the ability is made (CR 603.7c).
      if (e.effect?.kind === 'draw') {
        checkSinglePlayer(e.effect.player, `${path}.effect.player`, 'a delayed draw', out);
      }
      checkDelayedTrigger(
        e,
        path,
        out,
        scope.movedAvailable === true,
        scope.diesTrigger === true,
        scope.auraDiesTrigger === true,
        scope.thisWay?.includes('exiledCreatures') === true,
      );
      break;
    case 'prepare':
      checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      break;
    case 'forEachPlayer':
      checkPlayerSelector(e.players, `${path}.players`, scope, out);
      checkEffect(e.effect, `${path}.effect`, scope, out);
      break;
    case 'exileUntilFound':
      // D-660 (CR 701.13, 101.4): each player the selector names exiles from their own library until a card the filter describes (a card in a library).
      checkPlayerSelector(e.players, `${path}.players`, scope, out);
      checkLibraryFilter(e.filter, `${path}.filter`, out, scope);
      break;
    case 'opponentChoosesCard':
      // D-660 (CR 608.2d): an opponent chooses among the cards an earlier effect moved, which a filter describes (cards in exile: no zone, controller or owner).
      if (kindOf(e.objects) !== 'moved') {
        issue(
          out,
          `${path}.objects`,
          "an opponent chooses among the cards an effect before moved ('moved')",
        );
      } else {
        checkRef(e.objects as ObjectRef, 'object', `${path}.objects`, scope, out);
      }
      checkLibraryFilter(e.filter, `${path}.filter`, out, scope);
      break;
    case 'exilePiles':
      // D-663 (CR 700.3, 406.3): the number of cards of each pile; the chosen pile goes to the graveyard.
      checkAmount(e.count, `${path}.count`, scope, out);
      if (e.chosenTo !== 'graveyard') {
        issue(out, `${path}.chosenTo`, 'the chosen pile is put into the graveyard');
      }
      break;
    case 'exileTopAnyNumber':
      // D-661 (CR 701.13, 608.2d): no parameter; the player decides how many times.
      break;
    case 'delayedCombatDamageTurn': {
      // D-662 (CR 603.7, 510.3a): a delayed ability that triggers on combat damage to a player by a source the filter names, until end of turn; what it does is about the card an
      // earlier effect of the same sequence exiled, the only thing it can name (CR 603.7c).
      checkFilter(e.filter, `${path}.filter`, out);
      if (e.filter?.controller !== 'you' || e.filter?.zone !== undefined) {
        issue(
          out,
          `${path}.filter`,
          "the sources are creatures the controller controls (controller 'you'), as they are on the battlefield",
        );
      }
      if (e.effect?.kind !== 'copyCardAndCast' || kindOf(e.effect.objects) !== 'moved') {
        issue(
          out,
          `${path}.effect`,
          "a delayed combat damage trigger copies the card an earlier effect moved (copyCardAndCast of 'moved')",
        );
        break;
      }
      checkEffect(e.effect, `${path}.effect`, scope, out);
      break;
    }
    case 'delayedCombatDamageToPlayer': {
      // Issue 144 (CR 603.7c, 510.3a): the sources are creatures the controller controls; the player is a target of the spell or ability; what the ability does names no target and
      // reads nothing of the spell (nothing of it is left when the ability triggers).
      checkFilter(e.filter, `${path}.filter`, out);
      if (e.filter?.controller !== 'you' || e.filter?.zone !== undefined) {
        issue(
          out,
          `${path}.filter`,
          "the sources are creatures the controller controls (controller 'you'), as they are on the battlefield",
        );
      }
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      checkSinglePlayer(e.player, `${path}.player`, 'delayedCombatDamageToPlayer', out);
      checkEffect(e.effect, `${path}.effect`, { ...scope, targets: new Map() }, out);
      break;
    }
    case 'delayedCombatDamage':
      checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      checkEffect(e.effect, `${path}.effect`, { ...scope, targets: new Map() }, out);
      break;
    case 'delayedCast':
      checkDelayedCast(e, path, scope, out);
      break;
    case 'extraTurn':
      // CR 500.7: each player the selector names takes an extra turn.
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      break;
    case 'becomeMonarch':
      // CR 725.3 (D-127): one player becomes the monarch, so the selector names exactly one.
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      if (
        e.player?.kind === 'eachPlayer' ||
        e.player?.kind === 'eachOpponent' ||
        e.player?.kind === 'eachOtherOpponent' ||
        e.player?.kind === 'eachPlayerExcept' ||
        e.player?.kind === 'attackedPlayers' ||
        e.player?.kind === 'triggerDamagedPlayers' ||
        e.player?.kind === 'combatDamagedByNamed' ||
        e.player?.kind === 'all'
      ) {
        issue(out, `${path}.player`, 'only one player can be the monarch (CR 725.3)');
      }
      break;
    case 'cascade':
      // CR 702.85a: no operand; it is the effect of "When you cast this spell" and stands nowhere else.
      if (scope.selfCast !== true) {
        issue(out, path, 'cascade is the effect of a "when you cast this spell" ability only');
      }
      break;
    case 'storm':
      // CR 702.40a (D-129): no operand; it is the effect of "When you cast this spell" and stands nowhere else.
      if (scope.selfCast !== true) {
        issue(out, path, 'storm is the effect of a "when you cast this spell" ability only');
      }
      break;
    case 'replicate':
      // CR 702.56a (D-129): the same, and the card needs a replicate cost (`checkCastFace`).
      if (scope.selfCast !== true) {
        issue(out, path, 'replicate is the effect of a "when you cast this spell" ability only');
      }
      break;
    case 'changeTarget':
      // CR 115.7a (D-181): a target spell or ability on the stack (`supported.ts` wants its slot to say "single target").
      if (kindOf(e.object) === 'target') {
        checkRef(e.object, 'object', `${path}.object`, scope, out);
      } else {
        issue(out, `${path}.object`, 'changeTarget names a target spell or ability');
      }
      break;
    case 'copySpell':
      // CR 707.10 (D-129): a target spell, or the spell whose casting caused the trigger.
      if (kindOf(e.spell) === 'triggerSubject') {
        checkSubjectRef(e.spell, 'stack', `${path}.spell`, scope, out);
      } else if (kindOf(e.spell) === 'target') {
        checkRef(e.spell, 'object', `${path}.spell`, scope, out);
      } else if (kindOf(e.spell) === 'moved') {
        // Issue 121 (Finale of Promise): "copy each of those spells": the spells a `castCard` with `remember` cast.
        checkRef(e.spell, 'object', `${path}.spell`, scope, out);
      } else if (kindOf(e.spell) === 'thisSpell') {
        // D-230: "you may copy this spell" (Sevinne's Reclamation): the spell that is resolving, so a spell's own text.
        if (scope.owner !== 'spell') {
          issue(
            out,
            `${path}.spell`,
            "'thisSpell' is the spell that is resolving: a spell's own text",
          );
        }
      } else {
        issue(
          out,
          `${path}.spell`,
          'copySpell names a target spell, or the spell that was cast (triggerSubject)',
        );
      }
      if (!isOneOf(e.newTargets, ['may', 'no'])) {
        issue(out, `${path}.newTargets`, 'newTargets is "may" or "no"');
      }
      // D-337 (CR 707.10): how many copies, an amount of the game as the effect resolves (zero makes none).
      if (e.count !== undefined) checkAmount(e.count, `${path}.count`, scope, out);
      // D-438 (CR 707.10, 707.10e): "for each other creature you control that the spell could target", each copy aimed at one of them; nobody chooses, and a count says nothing then.
      if (e.forEach !== undefined) {
        checkFilter(e.forEach, `${path}.forEach`, out);
        if (e.newTargets !== 'no') {
          issue(
            out,
            `${path}.newTargets`,
            'a copy for each object has the target the effect gives it: newTargets is "no"',
          );
        }
        if (e.count !== undefined) {
          issue(out, `${path}.count`, 'a copy for each object has no count of its own');
        }
        if (
          scope.triggerPlayer !== true &&
          filterSome(e.forEach, (f) => f.controller === 'triggerPlayer')
        ) {
          issue(
            out,
            `${path}.forEach`,
            "'triggerPlayer' needs a trigger whose event is about a player",
          );
        }
        if (filterSome(e.forEach, (f) => f.zone !== undefined && f.zone !== 'battlefield')) {
          issue(
            out,
            `${path}.forEach`,
            'the objects a copy of a spell is aimed at are permanents on the battlefield',
          );
        }
      }
      // Issue 144 (CR 707.10e): "The copy targets that token.": one copy of the spell of the trigger, aimed at what the effect before it made.
      if (e.newTarget !== undefined) {
        if (kindOf(e.newTarget) !== 'moved') {
          issue(
            out,
            `${path}.newTarget`,
            "the object the copy targets is the 'moved' of an earlier effect",
          );
        } else {
          checkRef(e.newTarget, 'object', `${path}.newTarget`, scope, out);
        }
        if (
          e.newTargets !== 'no' ||
          e.count !== undefined ||
          e.forEach !== undefined ||
          e.copier !== undefined ||
          kindOf(e.spell) !== 'triggerSubject'
        ) {
          issue(
            out,
            `${path}.newTarget`,
            'a copy that targets an object is one copy of the spell of the trigger (triggerSubject), newTargets "no", with no count, forEach or copier',
          );
        }
      }
      if (e.copier !== undefined && e.copier !== 'triggerPlayer' && e.copier !== 'opponent') {
        issue(out, `${path}.copier`, 'copier is "triggerPlayer" or "opponent"');
      } else if (e.copier === 'opponent') {
        // D-665 (CR 702.144a): "choose an opponent. That player copies the spell": one copy of the spell of the trigger, with no group of copies.
        if (e.forEach !== undefined || kindOf(e.spell) !== 'triggerSubject') {
          issue(
            out,
            `${path}.copier`,
            'an opponent copies the spell of the trigger (triggerSubject), one copy, with no forEach',
          );
        }
      } else if (e.copier !== undefined && kindOf(e.spell) !== 'triggerSubject') {
        issue(
          out,
          `${path}.copier`,
          'the player a copy belongs to is the one who cast the spell of the trigger (triggerSubject)',
        );
      }
      break;
    case 'exileOnResolve':
      // D-439 (CR 614.1a, 608.2n): the spell whose casting caused the trigger.
      if (kindOf(e.spell) === 'triggerSubject') {
        checkSubjectRef(e.spell, 'stack', `${path}.spell`, scope, out);
      } else {
        issue(
          out,
          `${path}.spell`,
          'exileOnResolve names the spell that was cast (triggerSubject)',
        );
      }
      // Issue 121: "exiled with this artifact": only an ability of a permanent remembers what it exiles.
      if (e.linked !== undefined) {
        if (e.linked !== true) issue(out, `${path}.linked`, 'linked must be true when present');
        if (scope.owner !== 'ability') {
          issue(
            out,
            `${path}.linked`,
            'only an ability of a permanent can link what it exiles to it',
          );
        }
      }
      break;
    case 'doubleSpellX':
      // CR 107.3 (Unbound Flourishing): the spell whose casting caused the trigger.
      if (kindOf(e.spell) === 'triggerSubject') {
        checkSubjectRef(e.spell, 'stack', `${path}.spell`, scope, out);
      } else {
        issue(out, `${path}.spell`, 'doubleSpellX names the spell that was cast (triggerSubject)');
      }
      break;
    case 'exileSpellWithTimeCounters':
      // D-651 (CR 608.2n, 122.1): the spell's own text; a whole number of counters of 1 or more.
      if (scope.owner !== 'spell') {
        issue(
          out,
          path,
          "exileSpellWithTimeCounters is only valid in spell text (it exiles 'this spell')",
        );
      }
      if (!Number.isSafeInteger(e.count) || e.count < 1) {
        issue(out, `${path}.count`, 'the number of time counters is a positive whole number');
      }
      break;
    case 'unearth':
      // CR 702.84a: no operand; it is the effect of an ability that functions from the graveyard and stands nowhere else.
      if (scope.fromGraveyard !== true) {
        issue(
          out,
          path,
          'unearth is the effect of an ability that functions from the graveyard only',
        );
      }
      break;
    case 'ringTempts':
      // CR 701.54a (D-196): no operand; the Ring tempts the controller of the effect.
      break;
    case 'createEmblem':
      // CR 114.1, 114.4 (D-201): an emblem can have static, triggered or activated abilities that work from the command zone: at least one, and no other kind.
      if (!Array.isArray(e.abilities) || e.abilities.length === 0) {
        issue(out, `${path}.abilities`, 'an emblem has at least one ability');
      } else {
        e.abilities.forEach((a, i) => {
          if (a?.kind !== 'static' && a?.kind !== 'triggered' && a?.kind !== 'activated') {
            issue(
              out,
              `${path}.abilities[${i}]`,
              `an emblem has static, triggered and activated abilities, not ${kindOf(a)}`,
            );
          } else {
            scope.checkAbility(a, `${path}.abilities[${i}]`, out);
          }
        });
      }
      if (e.player !== undefined) checkPlayerSelector(e.player, `${path}.player`, scope, out);
      if (typeof e.text !== 'string') issue(out, `${path}.text`, 'the emblem needs its text');
      break;
    case 'empowerJace':
      // CR 701.71a (D-201): N loyalty counters, a positive whole number.
      if (!isCount(e.amount) || e.amount < 1) {
        issue(
          out,
          `${path}.amount`,
          'Empower Jace puts a positive whole number of loyalty counters',
        );
      }
      break;
    case 'populate':
      // CR 701.36 (D-627): no fields.
      break;
    case 'blight':
      // CR 701.68a: "Blight 1" as an instruction: a positive number of -1/-1 counters.
      if (!isCount(e.count) || e.count < 1) {
        issue(out, `${path}.count`, 'blight puts a positive whole number of -1/-1 counters');
      }
      break;
    case 'moveCountersOnto':
      // CR 122.1 (issue 230): a kind of counter and the permanents it moves onto.
      if (typeof e.counter !== 'string' || e.counter === '') {
        issue(out, `${path}.counter`, 'moveCountersOnto names a kind of counter');
      }
      checkFilter(e.to, `${path}.to`, out);
      break;
    case 'additionalLandDropThisTurn':
      // CR 305.2: a positive whole number of additional land plays.
      if (typeof e.count === 'number' ? !isCount(e.count) || e.count < 1 : e.count === undefined) {
        issue(
          out,
          `${path}.count`,
          'additionalLandDropThisTurn adds a positive whole number of land plays',
        );
      } else if (typeof e.count !== 'number') {
        // CR 107.3a: "play X additional lands": an amount read as the effect runs.
        checkAmount(e.count, `${path}.count`, scope, out);
      }
      break;
    case 'amass':
      // CR 701.47a (D-367): N +1/+1 counters and the creature type of the token and of the change; the type is a creature type (an Army is a creature).
      checkAmount(e.count, `${path}.count`, scope, out);
      if (typeof e.subtype !== 'string' || e.subtype === '') {
        issue(out, `${path}.subtype`, 'amass names a creature type');
      } else if (isNonCreatureSubtype(e.subtype)) {
        issue(
          out,
          `${path}.subtype`,
          `${e.subtype} is not a creature type, which is all an Army can be`,
        );
      }
      break;
    case 'exileIfLeaves':
      // CR 614.1a (D-459): the object is what the effect before it put onto the battlefield.
      if (kindOf(e.objects) !== 'moved') {
        issue(
          out,
          `${path}.objects`,
          "exileIfLeaves names the objects an earlier effect moved ('moved')",
        );
      } else {
        checkRef(e.objects, 'object', `${path}.objects`, scope, out);
      }
      break;
    case 'myriad':
      // CR 702.116a: the effect of the triggered ability the keyword stands for, which the engine writes; a card says "Myriad".
      issue(out, path, "myriad is the engine's own effect for the keyword Myriad");
      break;
    case 'delayedSacrifice':
      // CR 701.54c (D-196): the effect of the third ability of the Ring, which the engine writes; a card says "the Ring tempts you".
      issue(out, path, "delayedSacrifice is part of the engine's own abilities of the Ring");
      break;
    case 'encore':
      // CR 702.141a (D-185): no operand; it is the effect of an ability that functions from the graveyard (the card is its source) and stands nowhere else.
      if (scope.fromGraveyard !== true) {
        issue(
          out,
          path,
          'encore is the effect of an ability that functions from the graveyard only',
        );
      }
      break;
    case 'exile':
      // D-135: "you may exile it": the card the source became (as `moveToZone` reads it).
      if (kindOf(e.objects) === 'thisCard') {
        if (scope.owner !== 'ability') {
          issue(out, `${path}.objects`, "'thisCard' is only valid in abilities");
        }
      } else if (kindOf(e.objects) === 'triggerCard') {
        // D-230: "exile it" of a dies trigger: the card the permanent became in the graveyard.
        if (scope.triggerSubject !== 'permanent') {
          issue(out, `${path}.objects`, "'triggerCard' needs a trigger about a permanent");
        }
      } else if (kindOf(e.objects) === 'triggerSubject') {
        // D-206 (CR 701.9a): "Whenever you discard a card, you may exile that card from your graveyard": the card the trigger is about.
        checkSubjectRef(e.objects as ObjectRef, 'permanent', `${path}.objects`, scope, out);
      } else {
        checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      }
      // D-139, CR 607.2a: "exiled with this creature": only an ability of a permanent remembers what it exiles.
      if (e.linked !== undefined) {
        if (e.linked !== true) issue(out, `${path}.linked`, 'linked must be true when present');
        if (scope.owner !== 'ability') {
          issue(
            out,
            `${path}.linked`,
            'only an ability of a permanent can link what it exiles to it',
          );
        }
      }
      // Issue 121: "at random": one card of an `each` selector.
      if (e.atRandom !== undefined) {
        if (e.atRandom !== true)
          issue(out, `${path}.atRandom`, 'atRandom must be true when present');
        if (kindOf(e.objects) !== 'each') {
          issue(
            out,
            `${path}.objects`,
            "an exile at random picks one of an 'each' selector's objects",
          );
        }
      }
      // D-149, CR 610.3: "until this enchantment leaves the battlefield": only an ability of a permanent can leave it.
      if (e.until !== undefined) {
        if (e.until !== 'sourceLeaves' && e.until !== 'opponentBecomesMonarch') {
          issue(out, `${path}.until`, `unknown end ${JSON.stringify(e.until)}`);
        }
        if (scope.owner !== 'ability') {
          issue(
            out,
            `${path}.until`,
            'only an ability of a permanent can last until it leaves the battlefield',
          );
        }
        if (kindOf(e.objects) === 'thisCard') {
          issue(out, `${path}.objects`, "'thisCard' is not exiled until the permanent leaves");
        }
      }
      break;
    case 'tap':
      if (kindOf(e.objects) === 'choose') {
        checkChooseTap(e.objects as ChooseSelector, `${path}.objects`, scope, out);
      } else {
        checkObjectSelector(e.objects as ObjectSelector, `${path}.objects`, scope, out);
      }
      break;
    case 'untap':
      if (kindOf(e.objects) === 'choose') {
        checkChooseUntap(e.objects as ChooseSelector, `${path}.objects`, scope, out);
      } else {
        checkObjectSelector(e.objects as ObjectSelector, `${path}.objects`, scope, out);
      }
      break;
    case 'removeAllPlayerCounters':
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      break;
    case 'moveCounter':
      // CR 122.5: both permanents are targets of the ability (or the permanent with it), as for `moveAllCounters`.
      checkRef(e.from, 'object', `${path}.from`, scope, out);
      checkRef(e.to, 'object', `${path}.to`, scope, out);
      break;
    case 'removeChosenCounters':
      // CR 122.1, 608.2d: the permanents the counters may come off, and at most `upTo` of them.
      checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      if (e.upTo !== undefined && (!isCount(e.upTo) || e.upTo < 1)) {
        issue(out, `${path}.upTo`, 'upTo must be a positive integer');
      }
      break;
    case 'moveAllCounters':
      // CR 122.1: both permanents are targets of the ability (or the triggering permanent), as for a copy that names its original.
      checkRef(e.from, 'object', `${path}.from`, scope, out);
      checkRef(e.to, 'object', `${path}.to`, scope, out);
      break;
    case 'counter':
    case 'removeAllCounters':
    case 'connive':
    case 'reselectAttack':
    case 'transform':
      checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      break;
    case 'moveToZone':
      // D-655 (CR 401.4): "in a random order" is for several cards put at the bottom of a library at once.
      if (
        e.random !== undefined &&
        (e.random !== true || e.to !== 'library' || e.position !== 'bottom')
      ) {
        issue(out, `${path}.random`, "random is true, with to 'library' and position 'bottom'");
      }
      if (kindOf(e.objects) === 'triggerCard') {
        // D-230: "return that card to the battlefield" of a dies trigger.
        if (scope.triggerSubject !== 'permanent') {
          issue(out, `${path}.objects`, "'triggerCard' needs a trigger about a permanent");
        }
      } else if (kindOf(e.objects) === 'thisCard') {
        // D-110: the card the source became, in an ability; it can be put onto the battlefield only.
        if (scope.owner !== 'ability') {
          issue(out, `${path}.objects`, "'thisCard' is only valid in abilities");
        }
      } else if (kindOf(e.objects) === 'choose') {
        checkChooseMove(e.objects as ChooseSelector, `${path}.objects`, scope, out);
        // A chosen permanent would enter under a control the choice does not settle: only a card chosen from the hand or the
        // graveyard (D-139) is put onto the battlefield, by the controller of the effect. A card that could be an Aura would need to
        // choose what to enchant (CR 303.4f): not run (`ast/supported.ts`).
        const zone = (e.objects as ChooseSelector).filter?.zone;
        // Issue 103 (Hellkite Courser): "a commander you own from the command zone" is a card chosen from the command zone, only to put onto the battlefield.
        const fromCards = zone === 'hand' || zone === 'graveyard' || zone === 'command';
        // Federation Fleet group F (Command Beacon): or into the hand ("Put your commander into your hand from the command zone").
        if (zone === 'command' && e.to !== 'battlefield' && e.to !== 'hand') {
          issue(
            out,
            `${path}.to`,
            'a commander chosen from the command zone is put onto the battlefield or into the hand',
          );
        }
        if (
          zone === 'exile' &&
          e.to === 'battlefield' &&
          (e.objects as ChooseSelector).fromMoved !== true
        ) {
          issue(
            out,
            `${path}.to`,
            'a card exiled with this permanent is not put onto the battlefield (D-207)',
          );
        }
        if (e.to === 'battlefield' && !fromCards && zone !== 'exile') {
          issue(out, `${path}.to`, 'a chosen permanent cannot be moved onto the battlefield');
        }
        if (fromCards && e.to === zone) {
          issue(out, `${path}.to`, `the cards chosen are already in the ${zone}`);
        }
        if ((e.objects as ChooseSelector).fromHandOf !== undefined && e.to !== 'battlefield') {
          issue(
            out,
            `${path}.to`,
            "a card chosen from another player's hand is put onto the battlefield",
          );
        }
        if ((e.objects as ChooseSelector).alsoGraveyard === true && e.to !== 'battlefield') {
          issue(
            out,
            `${path}.to`,
            'a card chosen from the hand or the graveyard is put onto the battlefield (D-544)',
          );
        }
        // King Narfi's Betrayal (CR 608.2d, 607.2a): "you may exile a creature or planeswalker card from each graveyard", the cards exiled with this permanent.
        const eachGy = e.objects as ChooseSelector;
        if (eachGy.eachGraveyard !== undefined) {
          if (
            eachGy.eachGraveyard !== true ||
            e.to !== 'exile' ||
            zone !== 'graveyard' ||
            eachGy.optional !== true ||
            (eachGy.count !== undefined && eachGy.count !== 1) ||
            eachGy.fromMoved !== undefined ||
            eachGy.alsoGraveyard !== undefined ||
            eachGy.minCardTypes !== undefined
          ) {
            issue(
              out,
              `${path}.objects.eachGraveyard`,
              "eachGraveyard is true, with an optional choice of one card from the graveyard, to 'exile'",
            );
          }
        }
        if (e.linked !== undefined) {
          if (e.linked !== true || e.to !== 'exile') {
            issue(out, `${path}.linked`, "linked is true, with to 'exile'");
          }
          if (scope.owner !== 'ability') {
            issue(
              out,
              `${path}.linked`,
              'cards exiled with this permanent: an ability of a permanent',
            );
          }
        }
        // D-411: "You may put a land card from among them into your hand" is the one place a choice among moved cards goes (the hand); onto the battlefield from exile too.
        const among = e.objects as ChooseSelector;
        if (
          among.fromMoved === true &&
          e.to !== 'hand' &&
          !(e.to === 'battlefield' && among.fromAnyGraveyard === true) &&
          !(e.to === 'battlefield' && zone === 'exile')
        ) {
          issue(
            out,
            `${path}.to`,
            'a choice among the cards an earlier effect moved is put into the hand (D-411), or onto the battlefield from any graveyard (issue 159)',
          );
        }
      } else {
        checkObjectSelector(e.objects as ObjectSelector, `${path}.objects`, scope, out);
      }
      if (e.withCounters !== undefined) {
        const w = e.withCounters;
        if (e.to !== 'battlefield') {
          issue(out, `${path}.withCounters`, 'counters on entering are only for the battlefield');
        }
        if (typeof w?.counter !== 'string' || w.counter === '') {
          issue(out, `${path}.withCounters.counter`, 'counter name must be non-empty');
        }
        if (!isCount(w?.count) || w.count < 1) {
          issue(out, `${path}.withCounters.count`, 'counter count must be a positive integer');
        }
      }
      if (!isOneOf(e.to, ['hand', 'graveyard', 'library', 'battlefield', 'exile'])) {
        // Issue 103: 'command' is the return of a delayed trigger (`checkDelayedTrigger`), never a move of its own.
        issue(out, `${path}.to`, `cannot move to zone ${JSON.stringify(e.to)}`);
      }
      // CR 406.1, 608.2d: a card chosen from the hand or the graveyard can be exiled by the choice itself; every other exile is the `exile` effect.
      if (e.to === 'exile') {
        const chosen = kindOf(e.objects) === 'choose' ? (e.objects as ChooseSelector) : null;
        if (
          chosen === null ||
          (chosen.filter?.zone !== 'hand' && chosen.filter?.zone !== 'graveyard')
        ) {
          issue(
            out,
            `${path}.to`,
            "moveToZone puts into exile only a choice of cards in the hand or the graveyard; exile anything else with the 'exile' effect",
          );
        }
      }
      // CR 400.7 (Animate Dead): the permanent put onto the battlefield remembers the permanent whose ability put it there.
      if (e.putWithSource !== undefined) {
        if (e.putWithSource !== true) {
          issue(out, `${path}.putWithSource`, 'putWithSource must be true when present');
        }
        if (e.to !== 'battlefield' || scope.owner !== 'ability') {
          issue(
            out,
            `${path}.putWithSource`,
            'only an ability of a permanent that puts a card onto the battlefield remembers it',
          );
        }
        if (kindOf(e.objects) === 'choose') {
          issue(out, `${path}.putWithSource`, 'a card chosen as the effect runs is not remembered');
        }
      }
      // CR 708.2, 708.3: "return it to the battlefield face down ... It's a Forest land": the one kind of face-down permanent a card can put onto the battlefield this way.
      if (e.faceDownAs !== undefined) {
        if (e.faceDownAs !== 'forestLand') {
          issue(out, `${path}.faceDownAs`, "faceDownAs must be 'forestLand' when present");
        }
        if (e.to !== 'battlefield') {
          issue(out, `${path}.faceDownAs`, 'only a card put onto the battlefield enters face down');
        }
        if (kindOf(e.objects) === 'choose') {
          issue(
            out,
            `${path}.faceDownAs`,
            'a card chosen as the effect runs does not enter face down',
          );
        }
      }
      // D-207 (CR 303.4g): "attached to target creature ...": an Aura card entering the battlefield, attached to a target of this ability.
      if (e.attachTo !== undefined) {
        if (e.to !== 'battlefield') {
          issue(
            out,
            `${path}.attachTo`,
            'only a card put onto the battlefield is attached as it enters',
          );
        }
        if (e.attachTo?.kind === 'moved') {
          // Issue 89 (CR 400.7j): "attached to that token", "attached to that creature": the object an effect before it made or moved, or the one a reflexive ability carries.
          checkRef(e.attachTo as ObjectRef, 'object', `${path}.attachTo`, scope, out);
          if (kindOf(e.objects) === 'choose') {
            issue(
              out,
              `${path}.attachTo`,
              'a card chosen as the effect runs is not attached to the object it names',
            );
          }
        } else if (e.attachTo?.kind !== 'target') {
          issue(
            out,
            `${path}.attachTo`,
            'the object it enters attached to is a target, or the object an effect before it made',
          );
        } else {
          checkRef(e.attachTo, 'object', `${path}.attachTo`, scope, out);
        }
      }
      if (e.position !== undefined) {
        // D-135, CR 401.7: 'top', 'bottom' or "Nth from the top" (2 or more) of a library.
        const nth =
          typeof e.position === 'number' && Number.isSafeInteger(e.position) && e.position >= 2;
        if (e.to !== 'library' || !(isOneOf(e.position, ['top', 'bottom']) || nth)) {
          issue(
            out,
            `${path}.position`,
            "position is only valid for 'top', 'bottom' or a number of 2 or more (Nth from the top) of a library",
          );
        }
      }
      if (e.tapped !== undefined && (e.to !== 'battlefield' || typeof e.tapped !== 'boolean')) {
        issue(
          out,
          `${path}.tapped`,
          'tapped is only valid, as a boolean, when moving to the battlefield',
        );
      }
      if (
        e.controller !== undefined &&
        (e.to !== 'battlefield' || !isOneOf(e.controller, ['owner', 'you']))
      ) {
        issue(
          out,
          `${path}.controller`,
          "controller is only valid, as 'owner' or 'you', for the battlefield",
        );
      }
      break;
    case 'lookAtTop':
      // D-139: look at the top N cards of the controller's library and take some that match.
      checkAmount(e.count, `${path}.count`, scope, out);
      checkFilter(e.take?.filter, `${path}.take.filter`, out);
      if (
        filterSome(
          e.take?.filter,
          (f) =>
            f.zone !== undefined ||
            f.controller !== undefined ||
            f.owner !== undefined ||
            f.stackKind !== undefined,
        )
      ) {
        issue(
          out,
          `${path}.take.filter`,
          'the cards are in the library: no zone, controller, owner or stackKind',
        );
      }
      if (!isCount(e.take?.max) || e.take.max < 1) {
        issue(out, `${path}.take.max`, 'max must be a positive integer');
      }
      // D-145: the cards taken go into the hand (default) or onto the battlefield, with an optional mana value limit.
      if (
        e.take?.to !== undefined &&
        !isOneOf(e.take.to, ['hand', 'battlefield', 'exileFaceDown', 'castFree', 'top'])
      ) {
        issue(
          out,
          `${path}.take.to`,
          `the cards taken go to the hand, the battlefield or exile face down, are cast, or stay on top, not ${JSON.stringify(e.take.to)}`,
        );
      }
      // CR 401.2, 401.4: "Put one of those cards on top of your library and the rest on the bottom": one card, unrevealed, left in the library; the rest goes to the bottom or the graveyard.
      if (
        e.take?.to === 'top' &&
        (e.take.max !== 1 ||
          e.take.min !== 1 ||
          e.take.hidden !== true ||
          e.take.tapped !== undefined ||
          e.take.totalManaValue !== undefined ||
          e.take.all !== undefined ||
          e.take.elseAnyToHand !== undefined ||
          e.revealAll !== undefined ||
          !isOneOf(e.rest, ['bottomRandom', 'bottomChosen', 'graveyard']))
      ) {
        issue(
          out,
          `${path}.take`,
          'a card put on top is one card (min and max 1), hidden, with no tapped, totalManaValue, all, elseAnyToHand or revealAll, and the rest goes to the bottom or the graveyard',
        );
      }
      // CR 608.2g: "You may cast ... from among them without paying its mana cost": one spell, chosen from those that match.
      if (
        e.take?.to === 'castFree' &&
        (e.take.max !== 1 ||
          e.take.min !== undefined ||
          e.take.tapped !== undefined ||
          e.take.totalManaValue !== undefined ||
          e.take.hidden !== undefined ||
          e.revealAll !== undefined)
      ) {
        issue(
          out,
          `${path}.take`,
          'a spell cast from among the cards looked at is one card (max 1), with no min, tapped, totalManaValue or hidden, and nothing revealed',
        );
      }
      if (
        e.take?.min !== undefined &&
        (!isCount(e.take.min) || e.take.min < 1 || e.take.min > e.take.max)
      ) {
        issue(out, `${path}.take.min`, 'min is a positive integer, at most max');
      }
      if (e.take?.tapped !== undefined && (e.take.tapped !== true || e.take.to !== 'battlefield')) {
        issue(
          out,
          `${path}.take.tapped`,
          'tapped is true, and only for cards put onto the battlefield',
        );
      }
      if (e.take?.manaValueAtMost !== undefined) {
        const limit = e.take.manaValueAtMost;
        if (typeof limit === 'object' && limit?.kind === 'powerOf') {
          // CR 202.3 (Velomachus Lorehold shape): "mana value less than or equal to this creature's power", read as the effect runs.
          if (kindOf(limit.of) !== 'this') {
            issue(
              out,
              `${path}.take.manaValueAtMost.of`,
              'a mana value limit reads the power of this creature only',
            );
          }
          checkAmount(limit, `${path}.take.manaValueAtMost`, NO_SCOPE, out);
        } else {
          checkStateAmount(limit, `${path}.take.manaValueAtMost`, out, 'a mana value limit');
        }
      }
      if (e.take?.totalManaValue !== undefined) {
        // D-230: a whole number, with the cards put onto the battlefield.
        if (
          !isCount(e.take.totalManaValue) ||
          e.take.totalManaValue < 1 ||
          e.take.to !== 'battlefield'
        ) {
          issue(
            out,
            `${path}.take.totalManaValue`,
            'totalManaValue is a positive integer, for cards put onto the battlefield',
          );
        }
      }
      if (
        e.take?.hidden !== undefined &&
        (e.take.hidden !== true || (e.take.to === 'battlefield' && e.take.elseAnyToHand !== true))
      ) {
        issue(
          out,
          `${path}.take.hidden`,
          'hidden is true, and only for cards put into the hand, or onto the battlefield with elseAnyToHand (a card put onto the battlefield is public, but it is not revealed)',
        );
      }
      // CR 608.2c: "If you don't, put a card from among them into your hand": after a take onto the battlefield that reveals nothing, of at most one card the player may decline.
      if (
        e.take?.elseAnyToHand !== undefined &&
        (e.take.elseAnyToHand !== true ||
          e.take.to !== 'battlefield' ||
          e.take.hidden !== true ||
          e.take.max !== 1 ||
          e.take.min !== undefined ||
          e.take.totalManaValue !== undefined)
      ) {
        issue(
          out,
          `${path}.take.elseAnyToHand`,
          'elseAnyToHand is true, for one optional card taken onto the battlefield unrevealed (to battlefield, hidden, max 1, no min or totalManaValue)',
        );
      }
      // D-396 (CR 701.20a): "Reveal the top five cards": every card is shown, so nothing about the take can be hidden from anyone.
      if (
        e.revealAll !== undefined &&
        (e.revealAll !== true || e.take?.hidden === true || e.take?.to === 'exileFaceDown')
      ) {
        issue(
          out,
          `${path}.revealAll`,
          'revealAll is true, and not with cards taken unrevealed (take.hidden) or exiled face down',
        );
      }
      if (!isOneOf(e.rest, ['bottomRandom', 'graveyard', 'top', 'bottomChosen', 'topChosen'])) {
        issue(out, `${path}.rest`, `unknown place for the rest ${JSON.stringify(e.rest)}`);
      }
      // CR 701.20, 608.2c: "Put all land cards from among them onto the battlefield" and "Put all land cards revealed this way into your hand": every matching card goes, in a reveal of the top.
      if (
        e.take?.all !== undefined &&
        (e.take.all !== true ||
          e.revealAll !== true ||
          (e.take.to !== 'battlefield' && e.take.to !== 'hand') ||
          e.take.min !== undefined ||
          e.take.totalManaValue !== undefined)
      ) {
        issue(
          out,
          `${path}.take.all`,
          'all is true, and only for a reveal of the top (revealAll) whose cards go onto the battlefield or into the hand, with no min or total mana value',
        );
      }
      break;
    case 'copyCardAndCast':
      // D-654 (CR 707.12): the card an earlier effect of the same sequence exiled ("copy it"), as it is in exile.
      // Issue 121 (Arcane Bombardment): or the cards the permanent exiled with its linked ability ("copy each card exiled with this enchantment").
      if (kindOf(e.objects) !== 'moved' && kindOf(e.objects) !== 'linkedExile') {
        issue(
          out,
          `${path}.objects`,
          "copyCardAndCast copies the card an effect before it exiled (objects: 'moved') or the cards exiled with this permanent ('linkedExile')",
        );
      } else {
        checkRef(e.objects as ObjectRef, 'object', `${path}.objects`, scope, out);
      }
      if (e.times !== undefined && !(Number.isSafeInteger(e.times) && e.times >= 2)) {
        issue(out, `${path}.times`, 'times is a whole number of 2 or more when present');
      }
      // Blue Mage's Cane (CR 118.9, 601.2f): "by paying {3} rather than paying its mana cost": mana only, at least one symbol.
      if (e.cost !== undefined) {
        const costs = e.cost as readonly { kind?: unknown; symbols?: unknown }[];
        if (
          !Array.isArray(costs) ||
          costs.length === 0 ||
          costs.some(
            (c) => c.kind !== 'mana' || !Array.isArray(c.symbols) || c.symbols.length === 0,
          )
        ) {
          issue(out, `${path}.cost`, 'the cost a copy is cast for is mana only');
        }
      }
      break;
    case 'castFree': {
      // CR 608.2g (D-145): a card chosen from the hand, or the card an earlier effect or a linked exile names; `play` also allows a land.
      if (e.play !== undefined && e.play !== true)
        issue(out, `${path}.play`, 'play must be true when present');
      // D-660 (CR 608.2g): "up to two spells", "any number of spells": the cards an earlier effect moved, spells only (a land is played, one at a time).
      if (e.max !== undefined) {
        if (e.max !== 'any' && !(Number.isSafeInteger(e.max) && e.max >= 2)) {
          issue(out, `${path}.max`, "max is a whole number of 2 or more, or 'any'");
        }
        // Issue 121 (Forger's Foundry): or the cards the permanent exiled with its linked ability ("from among cards exiled with this artifact").
        // Issue 105 (Aetherflux Conduit): or the spells in the controller's hand ("any number of spells from your hand").
        const fromHand =
          kindOf(e.objects) === 'choose' && (e.objects as ChooseSelector).filter?.zone === 'hand';
        if (kindOf(e.objects) !== 'moved' && kindOf(e.objects) !== 'linkedExile' && !fromHand) {
          issue(
            out,
            `${path}.max`,
            "several spells are cast from the cards an effect before moved ('moved'), the cards exiled with this permanent ('linkedExile') or the spells in the hand",
          );
        }
        if (e.play === true) {
          issue(out, `${path}.max`, 'several cards are cast, not played (no play)');
        }
      }
      // CR 608.2g, 101.4 (issue 81): one question for each owner of the cards an earlier effect moved: nothing else about who casts or how many.
      if (e.perOwner !== undefined) {
        if (
          e.perOwner !== true ||
          kindOf(e.objects) !== 'moved' ||
          e.play !== undefined ||
          e.max !== undefined ||
          e.filter !== undefined ||
          e.player !== undefined
        ) {
          issue(
            out,
            `${path}.perOwner`,
            "perOwner is true, on the cards an effect before moved ('moved'), with no play, max, filter or player",
          );
        }
      }
      const objects = e.objects as ChooseSelector | ObjectRef;
      // CR 608.2g: "then they may cast that card": another player casts the cards an earlier effect exiled.
      if (e.player !== undefined) {
        checkPlayerSelector(e.player, `${path}.player`, scope, out);
        // Cmdr. Troi: or a spell of their own hand ("target opponent may cast a spell from their hand without paying its mana cost").
        if ((kindOf(objects) !== 'moved' && kindOf(objects) !== 'choose') || e.play === true) {
          issue(
            out,
            `${path}.player`,
            "another player casts the cards an effect before moved ('moved') or a spell of their own hand, and does not play them",
          );
        }
      }
      // Cmdr. Troi (CR 608.2g, 707.10): the spell cast is what `moved` names afterwards; one spell only.
      if (e.remember !== undefined) {
        if (e.remember !== true || e.max !== undefined || e.perOwner !== undefined) {
          issue(out, `${path}.remember`, 'remember is true, for one spell (no max, no perOwner)');
        }
      }
      // D-655: "an Aura spell from among them": a filter for the cards a reference names; a choice from the hand has its own.
      if (e.filter !== undefined) {
        if (kindOf(objects) === 'choose') {
          issue(out, `${path}.filter`, 'a choice from the hand has its own filter');
        } else {
          checkFilter(e.filter, `${path}.filter`, out);
        }
      }
      if (e.exileInstead !== undefined && kindOf(objects) !== 'choose') {
        issue(out, `${path}.exileInstead`, 'exileInstead is for a card chosen from the graveyard');
      }
      if (kindOf(objects) === 'choose') {
        const choose = objects as ChooseSelector;
        checkFilter(choose.filter, `${path}.objects.filter`, out);
        // Issue 102 (Diviner of Mist): or from the controller's graveyard, with the rider that exiles the spell.
        if (choose.filter?.zone !== 'hand' && choose.filter?.zone !== 'graveyard') {
          issue(
            out,
            `${path}.objects.filter.zone`,
            'the card is chosen from the hand or the graveyard: the filter says zone "hand" or "graveyard"',
          );
        }
        if (
          e.exileInstead !== undefined &&
          (e.exileInstead !== true || choose.filter?.zone !== 'graveyard')
        ) {
          issue(
            out,
            `${path}.exileInstead`,
            'exileInstead is true, only for a card chosen from the graveyard',
          );
        }
        if (
          choose.count !== undefined ||
          choose.anyNumber !== undefined ||
          choose.atLeastOne !== undefined ||
          choose.greatest !== undefined ||
          choose.least !== undefined ||
          choose.dealtCombatDamageToYou !== undefined ||
          choose.optional !== undefined
        ) {
          issue(
            out,
            `${path}.objects`,
            'one card is chosen: no count, anyNumber, greatest or optional',
          );
        }
        if (filterSome(choose.filter, (f) => f.owner !== undefined || f.stackKind !== undefined)) {
          issue(
            out,
            `${path}.objects.filter`,
            "the cards are in the controller's hand: no owner or stackKind",
          );
        }
      } else if (
        kindOf(objects) === 'moved' ||
        kindOf(objects) === 'linkedExile' ||
        kindOf(objects) === 'target'
      ) {
        checkRef(objects as ObjectRef, 'object', `${path}.objects`, scope, out);
        // CR 115.1, 608.2b: a target card of a graveyard: one card, cast or played, with none of the several-card or other-player forms.
        if (
          kindOf(objects) === 'target' &&
          (e.max !== undefined ||
            e.perOwner !== undefined ||
            e.player !== undefined ||
            e.remember !== undefined ||
            e.filter !== undefined)
        ) {
          issue(
            out,
            `${path}.objects`,
            'a target card has no max, perOwner, player, remember or filter',
          );
        }
      } else {
        issue(
          out,
          `${path}.objects`,
          "the card is chosen from the hand, or is 'moved', 'linkedExile' or a target",
        );
      }
      break;
    }
    case 'castCard':
      // CR 608.2g (D-350): "you may cast target [card] from a graveyard": the card is a target of the ability (a card in a graveyard when the ability resolves).
      if (kindOf(e.object) === 'this') {
        // CR 113.6b (Sproutback Trudge): the card itself, which only an ability that works from its graveyard can name there (`validateCard` checks `functionsIn`).
        if (scope.owner !== 'ability') {
          issue(out, `${path}.object`, 'casting this card is the effect of an ability');
        }
      } else if (kindOf(e.object) !== 'target') {
        issue(out, `${path}.object`, 'the card to cast is a target or this card');
      } else {
        checkRef(e.object as ObjectRef, 'object', `${path}.object`, scope, out);
      }
      if (e.anyManaType !== undefined && e.anyManaType !== true) {
        issue(out, `${path}.anyManaType`, 'anyManaType must be true when present');
      }
      if (e.exileInstead !== undefined && e.exileInstead !== true) {
        issue(out, `${path}.exileInstead`, 'exileInstead must be true when present');
      }
      if (e.free !== undefined && e.free !== true) {
        issue(out, `${path}.free`, 'free must be true when present');
      }
      if (e.free === true && e.anyManaType === true) {
        issue(
          out,
          `${path}.free`,
          'a spell cast without paying its mana cost has no mana to spend',
        );
      }
      if (e.remember !== undefined && e.remember !== true) {
        issue(out, `${path}.remember`, 'remember must be true when present');
      }
      break;
    case 'fight':
      // CR 701.14 (D-145): creatures fight. Without a pairing each side is one creature; with `differentChosen` the group on the
      // other side is a selector the controller pairs the fighters with.
      checkAffectedObjects(e.fighters, `${path}.fighters`, scope, out);
      checkAffectedObjects(e.against, `${path}.against`, scope, out);
      if (e.pairing !== undefined && e.pairing !== 'differentChosen') {
        issue(out, `${path}.pairing`, `unknown pairing ${JSON.stringify(e.pairing)}`);
      }
      if (e.pairing === undefined) {
        for (const key of ['fighters', 'against'] as const) {
          if (kindOf(e[key]) === 'each') {
            issue(
              out,
              `${path}.${key}`,
              'a plain fight names one creature on each side: name a group only with a pairing',
            );
          }
        }
      } else if (kindOf(e.against) !== 'each') {
        issue(
          out,
          `${path}.against`,
          'with a pairing the creatures to fight are a group (an each selector)',
        );
      }
      break;
    case 'revealUntil':
      if (e.from !== undefined) {
        checkPlayerSelector(e.from, `${path}.from`, scope, out);
        // `perPlayer`: every player named reveals from their own library (Consuming Aberration).
        if (e.perPlayer !== true) checkSinglePlayer(e.from, `${path}.from`, 'revealUntil', out);
      }
      // D-145: "reveal cards until you reveal a land card": a filter of cards in the library, and where the card found goes.
      // CR 701.21a (Descendants' Fury): after a sacrifice (or the offer of one) in the same sequence the cards may share a creature type with what was sacrificed.
      checkFilter(e.filter, `${path}.filter`, out, undefined, scope.diesTrigger === true, {
        ...(scope.sacrificedEarlier === true ? { afterSacrifice: true } : {}),
      });
      if (
        filterSome(
          e.filter,
          (f) =>
            f.zone !== undefined ||
            f.controller !== undefined ||
            f.owner !== undefined ||
            f.stackKind !== undefined ||
            f.other !== undefined ||
            readsCombatOrSource(f),
        )
      ) {
        issue(
          out,
          `${path}.filter`,
          'the cards are in the library: no zone, controller, owner, stackKind, other, or anything read from the game',
        );
      }
      if (!isOneOf(e.put, ['battlefield', 'hand', 'exile', 'graveyard', 'none'])) {
        issue(
          out,
          `${path}.put`,
          `a revealed card is put onto the battlefield, into the hand, into the graveyard, into exile or (the card found stays, for the effects after it) nowhere, not ${JSON.stringify(e.put)}`,
        );
      }
      if (e.tapped !== undefined && (e.tapped !== true || e.put !== 'battlefield')) {
        issue(
          out,
          `${path}.tapped`,
          'tapped is true, and only for a card put onto the battlefield',
        );
      }
      // Issue 103 (CR 701.20, 701.24): "until you reveal a creature card for each wild vote", then the rest is shuffled in by the effect after it.
      if (e.count !== undefined) {
        if (e.put === 'none') {
          issue(out, `${path}.count`, 'a count of cards found does not go with put none');
        }
        if (typeof e.count === 'number' && (!isCount(e.count) || e.count < 1)) {
          issue(out, `${path}.count`, 'a number of cards to find is a whole number from 1');
        } else if (typeof e.count !== 'number') {
          checkAmount(e.count, `${path}.count`, scope, out);
        }
      }
      if (
        e.rest !== undefined &&
        e.rest !== 'stay' &&
        e.rest !== 'bottomChosen' &&
        e.rest !== 'graveyard'
      ) {
        issue(out, `${path}.rest`, 'rest is stay, bottomChosen or graveyard when present');
      }
      // Issue 102 (Consuming Aberration): "then puts those cards into their graveyard": the cards found and the rest both go to the graveyard.
      if (e.rest === 'graveyard' && e.put !== 'graveyard') {
        issue(out, `${path}.rest`, 'rest graveyard goes with put graveyard');
      }
      if (
        e.perPlayer !== undefined &&
        (e.perPlayer !== true ||
          e.from === undefined ||
          e.put !== 'graveyard' ||
          e.rest !== 'graveyard' ||
          e.count !== undefined)
      ) {
        issue(
          out,
          `${path}.perPlayer`,
          'perPlayer is true, only with from, put graveyard, rest graveyard and no count',
        );
      }
      // Issue 81 (Jhoira, Proteus Staff): whose library is revealed, and who controls the card put onto the battlefield.
      if (e.from !== undefined) {
        checkPlayerSelector(e.from, `${path}.from`, scope, out);
      }
      if (
        e.putUnder !== undefined &&
        (e.putUnder !== 'revealer' || e.from === undefined || e.put !== 'battlefield')
      ) {
        issue(
          out,
          `${path}.putUnder`,
          'putUnder is revealer, only with from and a card put onto the battlefield',
        );
      }
      break;
    case 'gainLevel':
      // CR 716.2a (D-235): the level the Class gains is 2 or more (level 1 is the one it has).
      if (!Number.isSafeInteger(e.level) || e.level < 2) {
        issue(out, `${path}.level`, 'the level a Class gains is a whole number from 2');
      }
      if (scope.owner !== 'ability') {
        issue(out, path, 'only an ability of a permanent gains a level');
      }
      break;
    case 'monstrosity':
      // CR 701.37a (D-445): N counters on the permanent the ability belongs to; an amount that is a whole number of one or more, or a count the game reads.
      checkAmount(e.count, `${path}.count`, scope, out);
      if (typeof e.count === 'number' && !(Number.isSafeInteger(e.count) && e.count >= 1)) {
        issue(out, `${path}.count`, 'monstrosity puts one or more counters');
      }
      if (scope.owner !== 'ability') {
        issue(out, path, 'only an ability of a permanent becomes monstrous');
      }
      break;
    case 'exileRandomFromGraveyard':
      // CR 701.13 (D-235): no fields.
      break;
    case 'chooseRandomFromGraveyard':
      // CR 608.2c (Death Toll deck group B): one or more cards of the controller's graveyard, described by a filter of cards.
      if (!Number.isSafeInteger(e.count) || e.count < 1) {
        issue(out, `${path}.count`, 'count is a whole number of one or more');
      }
      if (e.filter !== undefined) {
        checkFilter(e.filter, `${path}.filter`, out);
        if (
          filterSome(
            e.filter,
            (f) =>
              f.zone !== undefined ||
              f.controller !== undefined ||
              f.owner !== undefined ||
              f.stackKind !== undefined ||
              readsCombatOrSource(f),
          )
        ) {
          issue(
            out,
            `${path}.filter`,
            'the cards are in your graveyard: no zone, controller, owner, stackKind, or anything read from the game',
          );
        }
      }
      break;
    case 'exileRandomFromHand':
      // CR 701.13 (D-393): one player exiles one card of their own hand at random, and `moved` names it, so the selector names one player.
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      if (!SINGLE_PLAYER_KINDS.includes(e.player?.kind)) {
        issue(
          out,
          `${path}.player`,
          'exileRandomFromHand names one player (you, a target, the controller or owner of an object, the trigger player or the defending player): "moved" is the one card',
        );
      }
      break;
    case 'phaseOut':
      // CR 702.26 (D-234): the permanents an object selector names phase out.
      checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      break;
    case 'becomeCopyOfCard':
      // D-232: the cards a `leftGraveyard` trigger is about, one of which the permanents become a copy of until end of turn.
      if (scope.triggerCards !== true) {
        issue(out, path, 'becomeCopyOfCard needs a trigger about the cards that left a graveyard');
      }
      checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      if (!Array.isArray(e.types) || e.types.length === 0) {
        issue(out, `${path}.types`, 'becomeCopyOfCard names the card types it may copy');
      } else {
        checkEnumList(out, `${path}.types`, e.types, CARD_TYPES, 'card type');
      }
      if (e.duration !== 'untilEndOfTurn') {
        issue(out, `${path}.duration`, 'the copy lasts until end of turn');
      }
      break;
    case 'splitCostExiled':
      // D-232: only the activated ability whose cost exiles cards from the graveyard has cards to split (checked with the ability, `checkActivated`).
      if (scope.exiledCost !== true) {
        issue(
          out,
          path,
          'splitCostExiled needs an activated ability whose cost exiles cards from the graveyard',
        );
      }
      if (e.chosenTo !== 'libraryBottom' || e.otherTo !== 'battlefieldTapped') {
        issue(
          out,
          path,
          'splitCostExiled puts the chosen card on the bottom of the library and returns the other tapped',
        );
      }
      break;
    case 'returnGraveyardPair':
      // D-272: the one card type both chosen cards must have ("a creature card"); the rest of the wording is fixed by the effect.
      if (!(CARD_TYPES as readonly string[]).includes(e.cardType)) {
        issue(out, `${path}.cardType`, 'returnGraveyardPair names one card type');
      }
      // CR 304.4, 307.4: an instant or a sorcery would stay in the graveyard, and the engine does not apply that to this return.
      if (e.cardType === 'instant' || e.cardType === 'sorcery') {
        issue(out, `${path}.cardType`, 'returnGraveyardPair cannot return an instant or a sorcery');
      }
      break;
    case 'sparePermanents':
      // D-231: the card types the controller chooses a permanent of, for each player.
      if (!Array.isArray(e.types) || e.types.length === 0) {
        issue(out, `${path}.types`, 'sparePermanents needs the list of card types to choose');
      } else {
        checkEnumList(out, `${path}.types`, e.types, CARD_TYPES, 'card type');
      }
      // D-484: "Each opponent chooses a permanent they control of each permanent type and sacrifices the rest": the players choose for themselves.
      if (e.own !== undefined) {
        checkPlayerSelector(e.own.players, `${path}.own.players`, scope, out);
        if (e.own.players?.kind !== 'eachPlayer' && e.own.players?.kind !== 'eachOpponent') {
          issue(
            out,
            `${path}.own.players`,
            'the players who choose for themselves are each player or each opponent',
          );
        }
        if (e.own.typesOnly !== undefined && e.own.typesOnly !== true) {
          issue(out, `${path}.own.typesOnly`, 'typesOnly is true or absent');
        }
        if (
          e.own.counter !== undefined &&
          (typeof e.own.counter !== 'string' || e.own.counter === '')
        ) {
          issue(out, `${path}.own.counter`, 'counter names the kind of counter put on each kept');
        }
        if (e.own.cantAttackYou !== undefined) {
          if (e.own.cantAttackYou !== true) {
            issue(out, `${path}.own.cantAttackYou`, 'cantAttackYou is true or absent');
          }
          if (e.own.counter === undefined) {
            issue(
              out,
              `${path}.own.cantAttackYou`,
              'cantAttackYou lasts while the counter does: it needs counter',
            );
          }
        }
      }
      break;
    case 'exileOwnGraveyardCard':
      // D-231: "each player exiles a card from their graveyard": the players of the selector, each choosing among their own cards.
      checkPlayerSelector(e.players, `${path}.players`, scope, out);
      break;
    case 'draw':
    case 'discard':
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      checkAmount(e.count, `${path}.count`, scope, out);
      // Galadriel group 3: "Draw a card and reveal it": one card, drawn (not "up to"); `moved` names it afterwards.
      if (e.kind === 'draw' && e.reveal !== undefined) {
        if (e.reveal !== true || e.count !== 1 || e.upTo !== undefined) {
          issue(out, `${path}.reveal`, 'reveal is true, with a count of exactly 1 and no "up to"');
        }
      }
      // D-151: "Discard any number of cards": the player chooses how many, so `count` is 0 and nothing else narrows the choice.
      // Lorehold group 3: "Each player discards their hand": the hand as the instruction comes up, so `count` is 0 and nothing else narrows or chooses.
      if (e.kind === 'discard' && e.hand !== undefined) {
        if (
          e.hand !== true ||
          e.count !== 0 ||
          e.anyNumber !== undefined ||
          e.unless !== undefined ||
          e.random !== undefined
        ) {
          issue(
            out,
            `${path}.hand`,
            'hand is true, with a count of 0 and no "any number", "unless you discard" or "at random"',
          );
        }
      }
      if (e.kind === 'discard' && e.anyNumber !== undefined) {
        if (e.anyNumber !== true || e.count !== 0 || e.unless !== undefined) {
          issue(
            out,
            `${path}.anyNumber`,
            'anyNumber is true, with a count of 0 and no "unless you discard"',
          );
        }
      }
      // CR 701.9, 107.1c: "Discard up to N cards": the player chooses how many, up to `count`, so no other way of choosing goes with it.
      if (e.kind === 'discard' && e.upTo !== undefined) {
        if (
          e.upTo !== true ||
          e.anyNumber !== undefined ||
          e.hand !== undefined ||
          e.random !== undefined ||
          e.unless !== undefined ||
          e.together !== undefined
        ) {
          issue(
            out,
            `${path}.upTo`,
            'upTo is true, and goes with none of anyNumber, hand, random, unless or together',
          );
        }
      }
      // D-139: "discard N cards unless you discard an artifact card": a filter of the cards in the hand.
      if (e.kind === 'discard' && e.unless !== undefined) {
        checkFilter(e.unless, `${path}.unless`, out);
        if (
          filterSome(
            e.unless,
            (f) =>
              f.zone !== undefined ||
              f.controller !== undefined ||
              f.owner !== undefined ||
              f.stackKind !== undefined,
          )
        ) {
          issue(
            out,
            `${path}.unless`,
            'the card described is one in the hand: no zone, controller, owner or stackKind',
          );
        }
      }
      // D-209: "Discard a card at random": nobody chooses, so neither "any number" nor "unless you discard" goes with it.
      if (e.kind === 'discard' && e.random !== undefined) {
        if (e.random !== true || e.anyNumber !== undefined || e.unless !== undefined) {
          issue(
            out,
            `${path}.random`,
            'random is true, and goes with neither anyNumber nor "unless you discard"',
          );
        }
      }
      // CR 701.9, 101.4 (Plaguecrafter): the players choose in turn and all the chosen cards go together; nobody chooses a random or a whole-hand discard.
      if (e.kind === 'discard' && e.together !== undefined) {
        if (e.together !== true || e.random !== undefined || e.hand !== undefined) {
          issue(out, `${path}.together`, 'together is true, and goes with neither random nor hand');
        }
      }
      if (e.kind === 'draw' && (e as { unless?: unknown }).unless !== undefined) {
        issue(out, `${path}.unless`, 'only a discard has an "unless you discard" alternative');
      }
      break;
    case 'doublePlayerCounters':
      // Issue 105 (CR 701.10, 122.1): each player the selector names doubles their own counters.
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      break;
    case 'gainLife':
    case 'loseLife':
    case 'gainEnergy':
    case 'gainExperience':
    case 'givePoison':
    case 'increaseSpeed':
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      // D-365: "the life that player lost this turn" is the whole amount of a `loseLife`, read for each player it affects (`rules/life-amounts.ts`).
      if (kindOf(e.amount) === 'lifeLostThisTurn' || kindOf(e.amount) === 'attackersOfAffected') {
        if (e.kind !== 'loseLife') {
          issue(out, `${path}.amount`, `${kindOf(e.amount)} is the amount of a loseLife effect`);
        }
      } else if (
        kindOf(e.amount) === 'thisWay' &&
        (e.amount as { what?: unknown }).what === 'destroyedCreaturesOfAffected'
      ) {
        // CR 608.2c: "each player loses life equal to the number of creatures they controlled that were destroyed this way": each player's own number.
        if (e.kind !== 'loseLife') {
          issue(
            out,
            `${path}.amount`,
            'destroyedCreaturesOfAffected is the amount of a loseLife effect',
          );
        } else if (!(scope.thisWay ?? []).includes('destroyedCreaturesOfAffected')) {
          issue(
            out,
            `${path}.amount`,
            'destroyedCreaturesOfAffected needs a destroy effect before it',
          );
        }
      } else {
        const lifeEffect = e.kind === 'gainLife' || e.kind === 'loseLife';
        checkAmount(
          e.amount,
          `${path}.amount`,
          lifeEffect ? { ...scope, lifeAffected: e.player } : scope,
          out,
        );
      }
      break;
    case 'meld':
      // CR 701.42a (D-278): the creature named `partner` and the name of the combined face the two become; `validateCard` checks them against the card.
      if (typeof e.partner !== 'string' || e.partner === '') {
        issue(
          out,
          `${path}.partner`,
          'the name of the card to meld with must be a non-empty string',
        );
      }
      if (typeof e.result !== 'string' || e.result === '') {
        issue(out, `${path}.result`, 'the name of the melded face must be a non-empty string');
      }
      break;
    case 'loseGame':
      // CR 104.3e (D-269): the players the selector names lose the game; no other operand.
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      break;
    case 'winGame':
      // CR 104.2b: one player wins the game; a selector that names several players has no meaning ("each opponent wins").
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      if (
        e.player?.kind === 'eachPlayer' ||
        e.player?.kind === 'eachOpponent' ||
        e.player?.kind === 'eachOtherOpponent' ||
        e.player?.kind === 'eachPlayerExcept' ||
        e.player?.kind === 'all'
      ) {
        issue(out, `${path}.player`, 'only one player wins the game: name a single player');
      }
      break;
    case 'exchangeLifeWithPt':
      // CR 701.12g: one player and one permanent swap their values.
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      if (
        e.player.kind === 'eachOpponent' ||
        e.player.kind === 'eachOtherOpponent' ||
        e.player.kind === 'eachPlayerExcept' ||
        e.player.kind === 'all'
      ) {
        issue(out, `${path}.player`, 'an exchange is made by one player: name a single player');
      }
      break;
    case 'setLifeTotal':
      // CR 119.5 (D-201): a whole number, 0 or more.
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      checkAmount(e.amount, `${path}.amount`, scope, out);
      break;
    case 'addMana':
      checkManaProduction(e.mana, `${path}.mana`, out);
      // CR 106.12a, 605.1b: "add one mana of any type that land produced" reads the mana ability that triggered it: only a triggered mana ability has one.
      if (e.mana?.kind === 'producedType' && scope.triggeredMana !== true) {
        issue(
          out,
          `${path}.mana`,
          'one mana of a type the tapped permanent produced is only the effect of a "tapped for mana" triggered mana ability',
        );
      }
      if (e.mana?.kind === 'anyColorAmount' || e.mana?.kind === 'anyCombinationAmount') {
        issue(
          out,
          `${path}.mana`,
          'only a mana ability can ask for the color of an amount of mana',
        );
      }
      if (e.mana?.kind === 'eachColorAmong') {
        issue(
          out,
          `${path}.mana`,
          'only a mana ability adds a mana of each color among permanents',
        );
      }
      if (e.player !== undefined) {
        // D-229: the pool of one player a selector names; a fixed production only.
        checkPlayerSelector(e.player, `${path}.player`, scope, out);
        checkSinglePlayer(e.player, `${path}.player`, 'addMana', out);
        if (e.mana?.kind !== 'fixed')
          issue(out, `${path}.player`, 'only fixed mana is added to another player');
      }
      // D-151: "Add {R} for each tapped land your opponents control": an amount read as the effect runs.
      if (e.mana?.kind === 'fixed' && e.mana.times !== undefined) {
        checkAmount(e.mana.times, `${path}.mana.times`, scope, out);
      }
      break;
    case 'addCounters':
      checkAffectedObjects(e.objects, `${path}.objects`, scope, out);
      if (typeof e.counter !== 'string' || e.counter === '') {
        issue(out, `${path}.counter`, 'counter name must be non-empty');
      }
      if (e.perObject !== undefined && e.perObject !== true) {
        issue(out, `${path}.perObject`, 'perObject is true when present');
      }
      if (e.perObject === true && e.perController === true) {
        issue(out, `${path}.perObject`, 'perObject and perController cannot both be set');
      }
      checkAmount(
        e.count,
        `${path}.count`,
        e.perObject === true ? { ...scope, eachObject: true } : scope,
        out,
      );
      // Oversimplify: only an `addCounters` that reads its count for the controller of each object can read one player's total.
      if (e.perController !== undefined && e.perController !== true) {
        issue(out, `${path}.perController`, 'perController is true when present');
      }
      if (e.perController !== true && JSON.stringify(e.count).includes('exiledPowerOwn')) {
        issue(
          out,
          `${path}.count`,
          'exiledPowerOwn is read only by an addCounters with perController',
        );
      }
      break;
    case 'modifyPt':
    case 'setPt':
    case 'loseAllAbilities':
    case 'loseHexproofShroud':
    case 'setTypes':
    case 'setColors':
    case 'grantKeyword':
    case 'grantAbility':
    case 'restrict':
    case 'preventDamage':
      scope.checkContinuous(e, path, scope, out);
      break;
    case 'doubleTokens':
      // Issue 101: the tokens as they would be on the battlefield, read for the controller: no zone, owner, stack kind, combat, tapped state or trigger player.
      checkFilter(e.tokens, `${path}.tokens`, out);
      if (
        filterSome(
          e.tokens,
          (f) =>
            f.zone !== undefined ||
            f.stackKind !== undefined ||
            f.owner !== undefined ||
            f.controlledBy !== undefined ||
            f.tapped !== undefined ||
            readsCombatOrSource(f) ||
            f.controller === 'triggerPlayer' ||
            f.controller === 'defendingPlayer',
        )
      ) {
        issue(
          out,
          `${path}.tokens`,
          'the tokens that are created twice over are named by type, color, controller and the like: no zone, owner, stackKind, tapped, combat or trigger player',
        );
      }
      break;
    case 'permanentsEnterTapped':
      // D-519: a replacement of the game read as a permanent enters: a filter relative to the controller, with no zone, owner, stack kind, combat or trigger player.
      checkFilter(e.permanents, `${path}.permanents`, out);
      if (
        filterSome(
          e.permanents,
          (f) =>
            f.zone !== undefined ||
            f.stackKind !== undefined ||
            f.owner !== undefined ||
            f.controlledBy !== undefined ||
            readsCombatOrSource(f) ||
            f.controller === 'triggerPlayer' ||
            f.controller === 'defendingPlayer',
        )
      ) {
        issue(
          out,
          `${path}.permanents`,
          'a permanent that enters tapped is named by type, color, controller and the like: no zone, owner, stackKind, combat or trigger player',
        );
      }
      if (!isOneOf(e.duration, ['untilEndOfTurn', 'untilYourNextTurn'])) {
        issue(
          out,
          `${path}.duration`,
          `enters tapped lasts until end of turn or until your next turn, not ${JSON.stringify(e.duration)}`,
        );
      }
      break;
    case 'requireAttack':
      // D-179: a group requirement read when attackers are declared: a filter of creatures, relative to the controller, with no zone and nothing
      // that needs a target, an X, a trigger or the combat.
      checkFilter(e.creatures, `${path}.creatures`, out);
      if (
        filterSome(
          e.creatures,
          (f) =>
            f.zone !== undefined ||
            f.stackKind !== undefined ||
            f.owner !== undefined ||
            readsCombatOrSource(f) ||
            f.controller === 'triggerPlayer' ||
            f.controller === 'defendingPlayer',
        )
      ) {
        issue(
          out,
          `${path}.creatures`,
          'a requirement names creatures by type, color, controller and the like (the battlefield, as they are when attackers are declared): no zone, owner, stackKind, combat or trigger player',
        );
      }
      if (!isOneOf(e.duration, ['untilEndOfTurn', 'untilYourNextTurn'])) {
        issue(
          out,
          `${path}.duration`,
          `a requirement lasts until end of turn or until your next turn, not ${JSON.stringify(e.duration)}`,
        );
      }
      if (e.awayFromYou !== undefined && e.awayFromYou !== true) {
        issue(out, `${path}.awayFromYou`, 'awayFromYou is true when present');
      }
      break;
    case 'creaturesCantAttackYou':
      // CR 508.1a, 611.2c: a group restriction read when attackers are declared: a filter of creatures, as for `requireAttack`.
      checkFilter(e.creatures, `${path}.creatures`, out);
      if (
        filterSome(
          e.creatures,
          (f) =>
            f.zone !== undefined ||
            f.stackKind !== undefined ||
            f.owner !== undefined ||
            readsCombatOrSource(f) ||
            f.controller === 'triggerPlayer' ||
            f.controller === 'defendingPlayer',
        )
      ) {
        issue(
          out,
          `${path}.creatures`,
          'a restriction names creatures by type, color, controller and the like (the battlefield, as they are when attackers are declared): no zone, owner, stackKind, combat or trigger player',
        );
      }
      if (e.duration !== 'untilYourNextTurn') {
        issue(out, `${path}.duration`, 'the restriction lasts until your next turn');
      }
      break;
    case 'restrictGroup':
      // CR 609.4, 611.2c: a group rule change read where the rule acts: a filter of creatures, as for `requireAttack`.
      checkFilter(e.creatures, `${path}.creatures`, out);
      if (
        filterSome(
          e.creatures,
          (f) =>
            f.zone !== undefined ||
            f.stackKind !== undefined ||
            f.owner !== undefined ||
            readsCombatOrSource(f) ||
            f.controller === 'triggerPlayer' ||
            f.controller === 'defendingPlayer',
        )
      ) {
        issue(
          out,
          `${path}.creatures`,
          'a group rule change names creatures by type, color, keyword, controller and the like (the battlefield, as they are when the rule acts): no zone, owner, stackKind, combat or trigger player',
        );
      }
      if (!isOneOf(e.restriction, ['canAttackAsThoughNoDefender', 'assignsDamageByToughness'])) {
        issue(
          out,
          `${path}.restriction`,
          `a group rule change gives canAttackAsThoughNoDefender or assignsDamageByToughness, not ${JSON.stringify(e.restriction)}`,
        );
      }
      if (e.duration !== 'untilEndOfTurn') {
        issue(out, `${path}.duration`, 'a group rule change lasts until end of turn');
      }
      break;
    case 'attach':
      // CR 701.3: both are single objects named by reference ("this", a target, "this spell").
      // D-660 (Ajani's Chosen): "If that enchantment is an Aura, you may attach it to the token": the Aura or Equipment the trigger is about.
      if (kindOf(e.object) === 'triggerSubject')
        checkSubjectRef(e.object, 'permanent', `${path}.object`, scope, out);
      else checkRef(e.object, 'object', `${path}.object`, scope, out);
      // D-406: "Whenever a creature enters, you may attach this Aura to that creature": the permanent the trigger is about.
      if (kindOf(e.to) === 'triggerSubject')
        checkSubjectRef(e.to, 'permanent', `${path}.to`, scope, out);
      else checkRef(e.to, 'object', `${path}.to`, scope, out);
      break;
    case 'unattach':
      // CR 701.3d: the permanent to unattach is named by reference ("this").
      checkRef(e.object, 'object', `${path}.object`, scope, out);
      break;
    case 'conditional':
      // CR 608.2c: "If [condition], [effect]. Otherwise, [else]." Both branches see the same
      // targets and X as the rest of the spell or ability.
      checkEffectCondition(e.condition, `${path}.condition`, scope, out);
      checkEffect(
        e.effect,
        `${path}.effect`,
        e.condition.kind === 'yourCombatPhase' ? { ...scope, combatPhaseCondition: true } : scope,
        out,
      );
      if (e.else !== undefined) checkEffect(e.else, `${path}.else`, scope, out);
      break;
    case 'may':
      // D-135: "you may [do something]": only what the engine can tell was done (`didPrevious` reads it).
      if (!isOneOf(kindOf(e.effect), MAY_EFFECT_KINDS)) {
        issue(
          out,
          `${path}.effect`,
          `"you may" is run for ${MAY_EFFECT_KINDS.join(', ')}: "if you do" could not tell whether ${kindOf(e.effect)} was done`,
        );
      }
      checkEffect(e.effect, `${path}.effect`, scope, out);
      break;
    case 'chooseOne': {
      if (e.times !== undefined) checkAmount(e.times, `${path}.times`, scope, out);
      if (e.chooser !== undefined) {
        checkPlayerSelector(e.chooser, `${path}.chooser`, scope, out);
        checkSinglePlayer(e.chooser, `${path}.chooser`, 'chooseOne chooser', out);
      }
      if (e.optional !== undefined && e.optional !== true) {
        issue(out, `${path}.optional`, 'optional must be true when present');
      }
      // CR 608.2d (D-175): two to eight offered instructions, each with the words the player is shown (distinct, so the answer names one).
      const options = Array.isArray(e.options) ? e.options : [];
      if (!Array.isArray(e.options) || options.length < 2 || options.length > 8) {
        issue(out, `${path}.options`, 'a choice offers two to eight instructions (CR 608.2d)');
      }
      const labels = new Set<string>();
      options.forEach((option, i) => {
        const at = `${path}.options[${i}]`;
        if (typeof option?.label !== 'string' || option.label.trim() === '') {
          issue(out, `${at}.label`, 'an offered instruction needs the words shown to the player');
        } else if (labels.has(option.label)) {
          issue(out, `${at}.label`, `two offered instructions are both called "${option.label}"`);
        } else {
          labels.add(option.label);
        }
        checkEffect(option?.effect, `${at}.effect`, scope, out);
      });
      break;
    }
    case 'vote': {
      // CR 701.38a, 701.38b (D-194): two to eight options, each a word with no rules meaning, distinct; the voting starts with the controller.
      const options = Array.isArray(e.options) ? e.options : [];
      if (!Array.isArray(e.options) || options.length < 2 || options.length > 8) {
        issue(out, `${path}.options`, 'a vote offers two to eight options (CR 701.38a)');
      }
      const seen = new Set<string>();
      options.forEach((option, i) => {
        if (typeof option !== 'string' || option.trim() === '') {
          issue(out, `${path}.options[${i}]`, 'a vote option needs its words');
        } else if (seen.has(option)) {
          issue(out, `${path}.options[${i}]`, `two options of the vote are both "${option}"`);
        } else {
          seen.add(option);
        }
      });
      if (e.startingWith !== 'you') {
        issue(out, `${path}.startingWith`, 'a vote starts with "you", the controller (CR 701.38a)');
      }
      break;
    }
    case 'reflexive': {
      // CR 603.12 (D-135): a triggered ability of its own: its targets are its own, and it knows nothing of what the
      // resolution that created it chose or moved (the source is the same, "it" the card the source became).
      if (e.afterPayment !== undefined) {
        // D-511 (CR 603.12): "you may pay {1}. When you do, ...": the payment of the `mayPay` this is the effect of.
        if (e.afterPayment !== true)
          issue(out, `${path}.afterPayment`, 'afterPayment must be true when present');
        if (scope.paidAvailable !== true) {
          issue(
            out,
            `${path}.afterPayment`,
            'a reflexive trigger after a payment is the effect of a mayPay',
          );
        }
        if (e.ifThisWay !== undefined) {
          issue(out, `${path}.afterPayment`, 'what triggers it is the payment: no ifThisWay');
        }
      } else if (scope.mayAvailable !== true) {
        issue(
          out,
          path,
          'a reflexive trigger ("when you do") needs a "may" effect before it in the sequence',
        );
      }
      if (e.ifThisWay !== undefined) {
        if (e.ifThisWay !== 'exiledNonland' && e.ifThisWay !== 'discardedNonland') {
          issue(out, `${path}.ifThisWay`, `unknown count ${JSON.stringify(e.ifThisWay)}`);
        } else if (!(scope.thisWay ?? []).includes(e.ifThisWay)) {
          issue(
            out,
            `${path}.ifThisWay`,
            'ifThisWay needs the effect that counts it before the reflexive trigger in the same sequence',
          );
        }
      }
      const own = declareTargets(
        e.targets,
        `${path}.targets`,
        out,
        false,
        scope.sacrificedEarlier === true,
      );
      // Issue 89 (CR 603.12, 400.7j): "Create a token. When you do, return ... attached to that token": the ability carries the objects the resolution before it made.
      if (e.carriesMoved !== undefined) {
        if (e.carriesMoved !== true) {
          issue(out, `${path}.carriesMoved`, 'carriesMoved must be true when present');
        } else if (scope.movedAvailable !== true || e.afterPayment !== undefined) {
          issue(
            out,
            `${path}.carriesMoved`,
            'a reflexive ability carries the objects an effect before it made or moved, not those of a payment',
          );
        }
      }
      const innerOf = (declared: Scope['targets']): Scope => ({
        owner: scope.owner,
        targets: declared,
        xAllowed: false,
        ...(e.carriesMoved === true ? { movedAvailable: true } : {}),
        // D-177: the reflexive ability reads the permanent the resolution that created it sacrificed.
        ...(scope.sacrificedEarlier === true ? { sacrificedEarlier: true } : {}),
        // D-231: and the count the `ifThisWay` names.
        ...(e.ifThisWay === undefined ? {} : { thisWay: [e.ifThisWay] }),
        checkAbility: scope.checkAbility,
        checkContinuous: scope.checkContinuous,
        checkEffectExt: scope.checkEffectExt,
        ...(scope.checkModes === undefined ? {} : { checkModes: scope.checkModes }),
      });
      if (e.modes !== undefined || e.chooseModes !== undefined) {
        // D-511 (CR 603.12, 700.2b): "When you do, choose one —": a modal reflexive ability keeps its effects in the modes.
        if (e.effect?.kind !== 'sequence' || e.effect.effects.length !== 0) {
          issue(
            out,
            `${path}.effect`,
            'a modal reflexive ability puts its effects in the modes: effect is the empty sequence',
          );
        }
        if (e.targets !== undefined && e.targets.length > 0) {
          issue(out, `${path}.targets`, 'a modal reflexive ability declares targets on each mode');
        }
        if (scope.checkModes === undefined) {
          issue(out, path, 'a modal reflexive ability is not supported here');
        } else {
          scope.checkModes(e.modes, e.chooseModes, path, innerOf, out);
        }
      } else {
        checkEffect(e.effect, `${path}.effect`, innerOf(own), out);
      }
      break;
    }
    case 'mayCast':
      // D-135: "you may cast target [card] from your graveyard this turn".
      // Hildibrand Manderville (issue 98, CR 603.10a, 715.3): "When ~ dies, you may cast it from your graveyard as an Adventure until the end of your next turn": the card the
      // permanent became, named by `thisCard` (an ability of the permanent that dies) or `triggerCard` (a trigger about a permanent that died).
      if (e.adventure === true && kindOf(e.objects) === 'thisCard') {
        if (scope.owner !== 'ability') {
          issue(out, `${path}.objects`, "'thisCard' is only valid in abilities");
        }
      } else if (e.adventure === true && kindOf(e.objects) === 'triggerCard') {
        if (scope.triggerSubject !== 'permanent') {
          issue(out, `${path}.objects`, "'triggerCard' needs a trigger about a permanent");
        }
      } else if (kindOf(e.objects) !== 'target') {
        issue(out, `${path}.objects`, 'a cast permission names a target card');
      } else {
        checkRef(e.objects as ObjectRef, 'object', `${path}.objects`, scope, out);
      }
      if (e.duration !== 'untilEndOfTurn' && e.duration !== 'untilEndOfNextTurn') {
        issue(
          out,
          `${path}.duration`,
          'a cast permission lasts until end of turn or until the end of your next turn',
        );
      }
      if (e.adventure !== undefined && e.adventure !== true) {
        issue(out, `${path}.adventure`, 'adventure must be true when present');
      }
      if (e.adventure === true) {
        for (const key of ['exileInstead', 'anyGraveyard', 'free', 'bottomInstead'] as const) {
          if (e[key] !== undefined) {
            issue(out, `${path}.${key}`, `${key} is not for a permission to cast as an Adventure`);
          }
        }
        if (e.from !== undefined) {
          issue(
            out,
            `${path}.from`,
            'a permission to cast as an Adventure is for a graveyard card',
          );
        }
        if (e.whenCast !== undefined) {
          issue(out, `${path}.whenCast`, 'a permission to cast as an Adventure has no cast rider');
        }
      } else if (e.duration === 'untilEndOfNextTurn') {
        issue(
          out,
          `${path}.duration`,
          'until the end of your next turn is only for a permission to cast as an Adventure',
        );
      }
      if (e.exileInstead !== undefined && e.exileInstead !== true) {
        issue(out, `${path}.exileInstead`, 'exileInstead must be true when present');
      }
      // Lorehold group 2 (CR 118.9, 614.1a): "without paying its mana cost" and the library rider, of a card in exile.
      if (e.from !== undefined && e.from !== 'exile') {
        issue(
          out,
          `${path}.from`,
          "a cast permission is of a graveyard card or, with from, 'exile'",
        );
      }
      for (const key of ['free', 'bottomInstead'] as const) {
        if (e[key] !== undefined && e[key] !== true) {
          issue(out, `${path}.${key}`, `${key} must be true when present`);
        } else if (e[key] === true && e.from !== 'exile') {
          issue(out, `${path}.${key}`, `${key} is only for a card in exile (from: 'exile')`);
        }
      }
      if (e.from === 'exile' && e.exileInstead === true) {
        issue(
          out,
          `${path}.exileInstead`,
          'a card cast from exile has bottomInstead, not exileInstead',
        );
      }
      if (e.anyGraveyard !== undefined && e.anyGraveyard !== true) {
        issue(out, `${path}.anyGraveyard`, 'anyGraveyard must be true when present');
      }
      // Issue 159: "When you cast it this turn, this creature gains all activated abilities of that card": a delayed trigger of the cast of that card, which does
      // something to the permanent with the ability (`this`) with the spell cast (`triggerSubject`), and nothing of the ability that made it is left to name (CR 603.7c).
      if (e.whenCast !== undefined) {
        const inner = e.whenCast;
        if (
          inner?.kind !== 'gainActivatedAbilitiesOf' ||
          kindOf(inner.from) !== 'triggerSubject' ||
          kindOf(inner.to) !== 'this'
        ) {
          issue(
            out,
            `${path}.whenCast`,
            'a cast rider gives the permanent with the ability the abilities of the spell cast (gainActivatedAbilitiesOf from triggerSubject to this)',
          );
        } else {
          checkEffect(
            inner,
            `${path}.whenCast`,
            {
              owner: 'ability',
              targets: new Map(),
              xAllowed: false,
              triggerSubject: 'stack',
              triggerPlayer: true,
              checkAbility: scope.checkAbility,
              checkContinuous: scope.checkContinuous,
              checkEffectExt: scope.checkEffectExt,
            },
            out,
          );
        }
      }
      break;
    case 'gainActivatedAbilitiesOf':
      // Issue 159: the abilities of the spell cast (`triggerSubject`, only where a cast trigger names it) or of an object a reference names, given to the permanent that has this effect.
      if (kindOf(e.to) !== 'this') {
        issue(out, `${path}.to`, 'the abilities go to the permanent with the ability (this)');
      }
      if (kindOf(e.from) !== 'triggerSubject') {
        issue(out, `${path}.from`, 'the abilities are those of the spell cast (triggerSubject)');
      } else {
        checkSubjectRef(e.from as ObjectRef, 'stack', `${path}.from`, scope, out);
      }
      if (e.duration !== 'untilEndOfTurn') {
        issue(out, `${path}.duration`, 'the abilities are gained until end of turn');
      }
      break;
    case 'gainEscape':
      // CR 702.138a: "each creature card in your graveyard gains escape until end of turn": a filter of the cards, the cost (mana only) and how many other cards are exiled.
      checkFilter(e.what, `${path}.what`, out);
      if (
        e.what?.zone !== undefined ||
        e.what?.controller !== undefined ||
        e.what?.owner !== undefined
      ) {
        issue(
          out,
          `${path}.what`,
          'the cards name no zone, controller or owner (they are cards of your graveyard)',
        );
      }
      if (
        !Array.isArray(e.cost) ||
        e.cost.length === 0 ||
        !e.cost.every((c) => c.kind === 'mana')
      ) {
        issue(out, `${path}.cost`, 'the escape cost is paid with mana only');
      }
      if (!Number.isInteger(e.exile) || e.exile < 1) {
        issue(out, `${path}.exile`, 'escape exiles at least one other card');
      }
      if (e.duration !== 'untilEndOfTurn') {
        issue(out, `${path}.duration`, 'the escape is gained until end of turn');
      }
      break;
    case 'gainFlashbackFromManaCost':
      // CR 702.34a: "each instant and sorcery card in your graveyard gains flashback until end of turn": a filter of the cards, for the rest of the turn.
      checkFilter(e.what, `${path}.what`, out);
      if (
        e.what?.zone !== undefined ||
        e.what?.controller !== undefined ||
        e.what?.owner !== undefined
      ) {
        issue(
          out,
          `${path}.what`,
          'the cards name no zone, controller or owner (they are cards of your graveyard)',
        );
      }
      if (e.duration !== 'untilEndOfTurn') {
        issue(out, `${path}.duration`, 'the flashback is gained until end of turn');
      }
      break;
    case 'mayCastSpells':
      // Issue 159: "you may cast Zombie spells from your graveyard this turn": a filter of the spells, for the rest of the turn.
      checkFilter(e.spells, `${path}.spells`, out);
      if (
        e.spells?.zone !== undefined ||
        e.spells?.controller !== undefined ||
        e.spells?.owner !== undefined
      ) {
        issue(
          out,
          `${path}.spells`,
          'the spells name no zone, controller or owner (they are cards of your graveyard)',
        );
      }
      if (e.duration !== 'untilEndOfTurn') {
        issue(out, `${path}.duration`, 'a cast permission lasts until end of turn');
      }
      break;
    case 'shuffle':
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      break;
    case 'noMaxHandSizeForGame':
      // CR 402.2: no parameters; it is the controller's.
      break;
    case 'clash':
      // CR 701.30b: the controller clashes with an opponent; no parameters.
      break;
    case 'rollDie':
      // CR 706.1a (D-271): a die has N equally likely outcomes numbered 1 to N; the engine draws from the generator with `nextInt`, which takes up to 2^32.
      if (!isCount(e.sides) || e.sides < 2 || e.sides > 4294967296) {
        issue(out, `${path}.sides`, 'a die has a whole number of sides from 2 to 4294967296');
      }
      break;
    case 'eachPlayerChoosesDestroy':
      // CR 101.4, 608.2d (issue 105): the permanents the players may choose are a filter of the battlefield, read from the controller of the effect.
      checkFilter(e.filter, `${path}.filter`, out);
      if (e.filter?.zone !== undefined && e.filter.zone !== 'battlefield') {
        issue(out, `${path}.filter.zone`, 'the permanents are on the battlefield');
      }
      break;
    case 'proliferate':
      // CR 701.34a (D-149): the controller chooses what to give counters to as it resolves; `times` repeats it.
      if (e.times !== undefined) checkAmount(e.times, `${path}.times`, scope, out);
      break;
    case 'distributeCounters':
      // CR 601.2d: the slot the effect names divides the counters; `checkDinosaursFace` checks that it has a `divide`.
      if (kindOf(e.to) !== 'target') {
        issue(
          out,
          `${path}.to`,
          'distributeCounters puts the counters on the targets of a slot: a target reference',
        );
      } else {
        checkRef(e.to, 'any', `${path}.to`, scope, out);
      }
      if (typeof e.counter !== 'string' || e.counter === '') {
        issue(out, `${path}.counter`, 'counter name must be non-empty');
      }
      break;
    case 'doubleCounters':
      checkAffectedObjects(e.objects, `${path}.objects`, scope, out);
      if (e.counter !== undefined && (typeof e.counter !== 'string' || e.counter === '')) {
        issue(out, `${path}.counter`, 'counter name must be non-empty');
      }
      break;
    case 'ownerPutsOnLibrary':
      // CR 108.3 (issue 81): the permanents named are put into their owners' libraries; they are a selector of permanents.
      checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      break;
    case 'explore':
      // CR 701.44a (issue 81): the permanents named explore; they are a selector of permanents.
      checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      break;
    case 'scry':
    case 'surveil':
      // CR 701.22a, 701.25a: the player looks at their own library, which is hidden from everyone
      // else. Only the controller is asked (another player's scry is not built).
      if (e.player !== undefined) {
        checkPlayerSelector(e.player, `${path}.player`, scope, out);
        if (kindOf(e.player) !== 'you') {
          issue(
            out,
            `${path}.player`,
            `only the controller of the effect can ${e.kind} in this engine`,
          );
        }
      }
      checkAmount(e.count, `${path}.count`, scope, out);
      break;
    case 'lookAndReorder':
    case 'putFromHandOnTop':
      checkAmount(e.count, `${path}.count`, scope, out);
      break;
    case 'putFromHandOnBottom':
      break;
    case 'choosePlayer':
      // CR 608.2d: the players to choose among are those with the most life (The Black Gate) or the opponents (Slithermuse).
      if (e.among !== 'mostLife' && e.among !== 'opponent') {
        issue(out, `${path}.among`, `unknown rule for choosing a player ${String(e.among)}`);
      }
      break;
    case 'cantBeBlockedByPlayer':
      checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      break;
    case 'cantAttackPlaneswalkers':
      checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      if (typeof e.subtype !== 'string' || e.subtype === '') {
        issue(out, `${path}.subtype`, 'a planeswalker subtype is a non-empty string');
      }
      break;
    case 'lookAndSplit':
      // D-216: the piles are whole numbers, and with a fixed count they add up to it (the cards looked at are all placed).
      checkAmount(e.count, `${path}.count`, scope, out);
      for (const pile of ['hand', 'bottom', 'exile'] as const) {
        if (!isCount(e[pile]))
          issue(out, `${path}.${pile}`, `${pile} must be a non-negative integer`);
      }
      if (typeof e.count === 'number' && e.count !== e.hand + e.bottom + e.exile) {
        issue(
          out,
          `${path}.count`,
          'the cards looked at are all placed: count is hand + bottom + exile',
        );
      }
      break;
    case 'revealAndSeparate':
      // D-303 (CR 700.3): who makes the piles is one of two players, and the two piles go to two different places of the controller.
      checkAmount(e.count, `${path}.count`, scope, out);
      if (e.faceDownPile !== undefined && e.faceDownPile !== true) {
        issue(out, `${path}.faceDownPile`, 'faceDownPile is true or absent');
      }
      if (e.separator !== 'opponent' && e.separator !== 'you') {
        issue(out, `${path}.separator`, 'the piles are separated by an opponent or by you');
      }
      for (const field of ['chosenTo', 'otherTo'] as const) {
        if (e[field] !== 'hand' && e[field] !== 'graveyard') {
          issue(out, `${path}.${field}`, 'a pile goes into the hand or the graveyard');
        }
      }
      if (e.chosenTo === e.otherTo) {
        issue(out, path, 'the two piles go to different places');
      }
      break;
    case 'search':
      checkSearch(e, path, scope, out);
      break;
    default:
      // D-151: the effects of the Dragons slice are checked in `validate-dragons.ts`.
      if (!scope.checkEffectExt(e, path, scope, out))
        issue(out, path, `unknown effect ${kindOf(e)}`);
  }
}
