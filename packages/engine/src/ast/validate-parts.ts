/**
 * Building blocks of AST validation (SPEC 17.2 A7, D-007): filters, target declarations,
 * selectors, amounts, costs and effects. `validate.ts` composes these for abilities, spells and
 * cards. Nothing here mutates its input; every function appends to an issue list.
 */
import { CARD_TYPES, COLORS, isNonCreatureSubtype, SUPERTYPES } from '../characteristics';
import { GRANTABLE_KEYWORDS } from './features';
import type {
  Ability,
  Amount,
  AttackedBySelector,
  ChooseSelector,
  Condition,
  Cost,
  Effect,
  ObjectFilter,
  ObjectRef,
  ObjectSelector,
  PlayerSelector,
  PtAmount,
  SacrificeSelector,
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
  /** True in an activated ability that functions from the graveyard, the only place `unearth` may stand (D-124). */
  readonly fromGraveyard?: boolean;
  /**
   * What `triggerSubject` is in the triggered ability being checked, from its trigger: 'permanent'
   * for enters, dies, attacks, tapped, landfall and sacrificed triggers, 'stack' for the spell or
   * ability of a cast or becomes-the-target trigger. Left out where there is none (an upkeep
   * trigger, a spell, an activated ability).
   */
  readonly triggerSubject?: 'permanent' | 'stack';
  /** True in the effect of an activated ability whose cost sacrifices something (`sacrificedCost`, D-133). */
  readonly sacrificedCost?: boolean;
  /** True in the effect of a triggered ability about the cards that left a graveyard (`becomeCopyOfCard`, D-232). */
  readonly triggerCards?: boolean;
  /** True in the effect of an activated ability whose cost exiles cards from the graveyard (`splitCostExiled`, D-232). */
  readonly exiledCost?: boolean;
  /**
   * True after a `sacrifice` effect (or the `may` of one) in the same sequence, and in the `reflexive` ability that follows it: the object
   * reference `sacrificed` has a permanent to read (D-177).
   */
  readonly sacrificedEarlier?: boolean;
  /** True in the effect of a triggered ability whose trigger has a player (`triggerPlayer`, D-133). */
  readonly triggerPlayer?: boolean;
  /** True in the effect of a triggered ability whose trigger deals damage (`triggerDamage`, D-133). */
  readonly triggerDamage?: boolean;
  /** True in the effect of a triggered ability whose trigger is a batch of attackers (`attackersAttackedYou`, D-149). */
  readonly triggerAttacked?: boolean;
  /** True in the effect of a triggered ability of an attack (`attacks`): an `extraCombat` has a combat phase to follow (D-151). */
  readonly attackTrigger?: boolean;
  /** True in the effect of a triggered ability whose intervening "if" is `yourMainPhase`: an `extraCombat` follows a main phase (D-187). */
  readonly mainPhaseTrigger?: boolean;
  /** True in the effect of a triggered ability of "the beginning of your postcombat main phase" (`step: 'main2'`): an `extraBeginningPhase` follows that phase (D-356). */
  readonly postcombatMainTrigger?: boolean;
  /** True after a `may` effect in the same sequence: `didPrevious` and `reflexive` have something to read (D-135). */
  readonly mayAvailable?: boolean;
  /** The number of sides of the latest `rollDie` earlier in the same sequence: the condition `dieResult` reads its result (CR 706.2, D-271). */
  readonly dieSides?: number;
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
  checkEnumList(out, `${path}.keywords`, f.keywords, GRANTABLE_KEYWORDS, 'keyword');
  checkEnumList(out, `${path}.notKeywords`, f.notKeywords, GRANTABLE_KEYWORDS, 'keyword');
  if (
    f.controller !== undefined &&
    !isOneOf(f.controller, ['you', 'opponent', 'any', 'triggerPlayer', 'defendingPlayer'])
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
  if (f.commander !== undefined && f.commander !== true && f.commander !== 'yours') {
    issue(out, `${path}.commander`, "commander must be true or 'yours'");
  }
  // D-120: "attacking" and "power less than this creature's power" are flags; D-179: so is "put there from the battlefield this turn", a graveyard card's.
  for (const key of [
    'attacking',
    'attackingYou',
    'attackingOpponents',
    'attackingOrBlocking',
    'powerLessThanSource',
    'putFromBattlefieldThisTurn',
    'notCastFromHand',
    'enteredThisTurn',
    'singleTarget',
    'modified',
  ] as const) {
    if (f[key] !== undefined && f[key] !== true)
      issue(out, `${path}.${key}`, `${key} must be true`);
  }
  // D-230: "mana value X or less, where X is ...": an amount that reads no target and no earlier instruction.
  if (f.manaValueAtMost !== undefined) {
    const a = f.manaValueAtMost as { kind?: string; of?: { kind?: string } };
    const ok =
      typeof a === 'number' ||
      (a?.kind === 'powerOf' && a.of?.kind === 'this') ||
      a?.kind === 'triggerDamage';
    if (!ok) {
      issue(
        out,
        `${path}.manaValueAtMost`,
        'the limit is a number, the power of this or the damage that triggered the ability',
      );
    }
    if (f.manaValue !== undefined) {
      issue(
        out,
        `${path}.manaValueAtMost`,
        'a filter has one mana value limit: manaValue or manaValueAtMost',
      );
    }
  }
  if (
    (f.attacking === true ||
      f.attackingYou === true ||
      f.attackingOpponents === true ||
      f.attackingOrBlocking === true) &&
    f.zone !== undefined &&
    f.zone !== 'battlefield'
  ) {
    issue(out, `${path}.attacking`, 'only a permanent on the battlefield can be attacking');
  }
  // CR 700.9 (D-1240): only a permanent is modified.
  if (f.modified === true && f.zone !== undefined && f.zone !== 'battlefield') {
    issue(out, `${path}.modified`, 'only a permanent on the battlefield can be modified');
  }
  if (f.putFromBattlefieldThisTurn === true && f.zone !== 'graveyard') {
    issue(
      out,
      `${path}.putFromBattlefieldThisTurn`,
      "only a card in a graveyard was put there: the filter's zone is 'graveyard'",
    );
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
  // CR 115.1 (D-206): "that targets a creature" is about a spell or ability on the stack, and its filter describes a permanent or an object it targets.
  if (f.targetsObject !== undefined) {
    if (f.zone !== 'stack' && f.stackKind === undefined) {
      issue(
        out,
        `${path}.targetsObject`,
        "only a spell or ability on the stack has targets chosen: the filter's zone is 'stack' or it has a stackKind",
      );
    }
    checkFilter(f.targetsObject, `${path}.targetsObject`, out);
  }
  // D-139: "mana value X" and "whose controller was dealt combat damage by this creature this turn" are flags read in an
  // effect's `each` selector (the one place with an X and a source ability).
  for (const key of ['manaValueX', 'controllerDealtDamageBySource'] as const) {
    if (f[key] === undefined) continue;
    if (f[key] !== true) issue(out, `${path}.${key}`, `${key} must be true`);
    else if (ownerScope === undefined) {
      issue(out, `${path}.${key}`, `${key} is only read in the 'each' selector of an effect`);
    } else if (key === 'manaValueX' && !ownerScope.xAllowed) {
      issue(out, `${path}.${key}`, 'mana value X is used but nothing in this ability has an X');
    } else if (key === 'controllerDealtDamageBySource' && ownerScope.owner !== 'ability') {
      issue(out, `${path}.${key}`, 'only an ability has a creature that dealt the damage');
    }
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
    if (f.sharesCreatureTypeWith !== 'triggerSubject') {
      issue(out, `${path}.sharesCreatureTypeWith`, "sharesCreatureTypeWith is 'triggerSubject'");
    } else if (sharesWith !== true) {
      issue(
        out,
        `${path}.sharesCreatureTypeWith`,
        'sharesCreatureTypeWith is read in the filter of a revealUntil in the effect of a "dies" trigger, where the creature that died is what the trigger is about',
      );
    }
  }
  // D-100: "of the chosen type" / "of the chosen color" are flags; the card must ask for the choice.
  for (const key of ['chosenType', 'chosenColor'] as const) {
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
      checkFilter(member, p, out, undefined, sharesWith);
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
  f.powerLessThanSource === true ||
  f.manaValueX !== undefined ||
  f.controllerDealtDamageBySource !== undefined ||
  f.putFromBattlefieldThisTurn !== undefined ||
  f.enteredThisTurn !== undefined ||
  f.singleTarget !== undefined ||
  f.modified !== undefined ||
  f.targetsObject !== undefined;

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

/** Validates a list of target specs and returns the ids they declare. */
export function declareTargets(
  specs: readonly TargetSpec[] | undefined,
  path: string,
  out: Out,
  /** D-145: only the targets of a spell's own text can divide something among them (CR 601.2d). */
  divideAllowed = false,
  /** D-187: only the targets of a reflexive ability after a sacrifice can be "up to that many" (CR 603.12). */
  thatManyAllowed = false,
  /** D-270: only the slot of a triggered ability can name objects of two zones (the one place the engine reads it). */
  crossZoneAllowed = false,
  /** D-386: only the targets of a spell's own text can take as many targets as the X announced (CR 601.2b, 601.2c). */
  countXAllowed = false,
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
        checkFilter(what.filter, `${p}.what.filter`, out);
        break;
      case 'player':
        if (!isOneOf(what.filter, ['any', 'opponent'])) {
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
      default:
        issue(out, `${p}.what`, `unknown target kind ${kindOf(what)}`);
    }
    if (spec.ifGiftPromised !== undefined && spec.ifGiftPromised !== true) {
      issue(out, `${p}.ifGiftPromised`, 'ifGiftPromised must be true when present');
    }
    // D-181, CR 702.33g, 601.2c: a slot chosen only if the spell was kicked, or only if it was not.
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
    if (spec.countX !== undefined) {
      // D-386, CR 107.3a, 601.2b, 601.2c: "X target creature cards": exactly as many targets as the X announced for the spell.
      if (spec.countX !== true) {
        issue(out, `${p}.countX`, 'countX must be true when present');
      } else if (!countXAllowed) {
        issue(
          out,
          `${p}.countX`,
          "only a slot of a spell's own text (not an ability or a mode) takes as many targets as the X announced",
        );
      } else if (
        spec.min !== undefined ||
        spec.max !== undefined ||
        spec.divide !== undefined ||
        spec.onePerOpponent !== undefined ||
        spec.upToThatMany !== undefined ||
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
        spec.upToThatMany !== undefined
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
    if (spec.divide !== undefined) {
      // CR 601.2d (D-145): the division is announced as the spell is cast, so the total is an amount that reads the game then.
      if (!divideAllowed) {
        issue(
          out,
          `${p}.divide`,
          "only the targets of a spell's own text (not an ability, not a mode) can have a division",
        );
      }
      checkStateAmount(spec.divide.total, `${p}.divide.total`, out, 'a division');
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
    case 'linkedExile':
      // D-145: "the exiled card" of a linked ability: the permanent's own, so an ability's (the face needs the ability that exiles it).
      if (scope.owner === 'spell') {
        issue(
          out,
          path,
          "'linkedExile' is only valid in abilities of a permanent with a linked exile",
        );
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
    if (each.except !== undefined) checkRef(each.except, 'object', `${path}.except`, scope, out);
    return;
  }
  checkRef(sel as ObjectRef, expect, path, scope, out);
}

export function checkPlayerSelector(sel: PlayerSelector, path: string, scope: Scope, out: Out) {
  switch (sel?.kind) {
    case 'you':
    case 'eachPlayer':
    case 'eachOpponent':
    case 'defendingPlayer':
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
  'all',
  'controllerOf',
  'ownerOf',
  'defendingPlayer',
  'triggerPlayer',
  'attackedPlayers',
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
  destroyed: 'a destroy effect',
  destroyedOwnNontoken: 'a destroy effect',
  exiledNonland: 'an exileOwnGraveyardCard effect',
  playersDrew: 'a draw effect',
  tapped: 'a tap effect',
  discarded: 'a discard effect',
  milledValue: 'a mill effect',
  discardedCreature: 'a discard effect',
  discardedNoncreature: 'a discard effect',
  discardedInstantOrSorcery: 'a discard effect',
};

/** Every `thisWay` count, one source of truth for the validator (the conditions and the amounts both read them from `ThisWayCounts`, D-131, D-210, D-358). */
const THIS_WAY_KINDS = Object.keys(THIS_WAY_SOURCES);

/** The `thisWay` counts an effect always produces (a `conditional` may not run, so it does not count). */
function thisWayProduced(e: Effect): ThisWayKind[] {
  if (e?.kind === 'sequence')
    return Array.isArray(e.effects) ? e.effects.flatMap(thisWayProduced) : [];
  if (e?.kind === 'sacrifice') return ['sacrificed'];
  if (e?.kind === 'destroy') return ['destroyed', 'destroyedOwnNontoken'];
  if (e?.kind === 'exileOwnGraveyardCard') return ['exiledNonland'];
  if (e?.kind === 'draw') return ['playersDrew'];
  if (e?.kind === 'tap') return ['tapped'];
  if (e?.kind === 'discard')
    return ['discarded', 'discardedCreature', 'discardedNoncreature', 'discardedInstantOrSorcery'];
  if (e?.kind === 'mill') return ['milledValue'];
  // D-210: what the players asked do is counted whether or not anyone accepts (the counts are 0 then).
  if (e?.kind === 'playersMay') return thisWayProduced(e.effect);
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
    case 'opponentsWithMore':
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
    case 'x':
      if (!scope.xAllowed)
        issue(out, path, 'X is used but nothing in this ability or spell has an X');
      break;
    case 'manaValueOf':
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
      if (a.kind === 'countersOn' && (typeof a.counter !== 'string' || a.counter === '')) {
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
      if (!isOneOf(a.stat, ['power', 'toughness', 'manaValue'])) {
        issue(out, `${path}.stat`, `unknown stat ${JSON.stringify(a.stat)}`);
      }
      if (a.filter === undefined || a.filter === null) {
        issue(out, `${path}.filter`, 'an aggregate needs a filter');
      } else {
        checkFilter(a.filter, `${path}.filter`, out);
      }
      break;
    case 'devotion':
      // CR 700.5: devotion to one or more of the five colors (colorless mana symbols are not a color).
      checkEnumList(out, `${path}.colors`, a.colors, COLORS, 'color');
      if (a.colors === undefined) issue(out, `${path}.colors`, 'devotion needs at least one color');
      break;
    case 'commanderColors':
    case 'commanderManaValue':
    case 'commanderCasts':
      break;
    case 'half':
      if (!isOneOf(a.round, ['down', 'up'])) {
        issue(out, `${path}.round`, 'half is rounded "down" or "up" (CR 107.1a)');
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
    case 'opponentsWithMore':
      if (!isOneOf(a.stat, PLAYER_STATS)) {
        issue(out, `${path}.stat`, `unknown player stat ${JSON.stringify(a.stat)}`);
      }
      break;
    case 'timesKicked':
      // D-110: the card must have a kicker or multikicker (`checkCastFace`).
      break;
    case 'manaSpent':
      // D-183: the spell that is the source of "When you cast this spell" paid for itself; nothing else has mana spent to cast it to read.
      if (a.of !== undefined) {
        // D-217 (CR 113.7a): the mana spent on a spell this ability targets ("that spell", Mana Sculpt).
        if (a.of.kind !== 'target')
          issue(out, `${path}.of`, 'the spell is a target of the ability');
        else checkRef(a.of, 'object', `${path}.of`, scope, out);
      } else if (scope.selfCast !== true && scope.owner !== 'spell') {
        // D-260: the effect of the spell itself reads what was spent to cast it ("You gain 1 life for each {S} spent to cast this spell").
        issue(
          out,
          path,
          'manaSpent is read in the effect of a spell, or of a "when you cast this spell" ability, where the spell is the source',
        );
      }
      checkManaSpentType(a.fromType, `${path}.fromType`, out, a.snow);
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
          "'triggerDamage' needs a triggered ability whose trigger is damage being dealt (dealtDamage, dealsCombatDamage or noncombatDamageDealt) or life being gained (lifeGained)",
        );
      }
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
      } else {
        checkFilter(a.filter, `${path}.filter`, out);
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
  kind: 'countOf' | 'colorsAmong' = 'countOf',
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
  if (filterSome(amount.filter, readsCombatOrSource)) {
    issue(
      out,
      `${path}.filter`,
      'a count in a static ability cannot read the combat or the source power (D-120)',
    );
  }
  if (filterSome(amount.filter, readsKeywords)) {
    issue(
      out,
      `${path}.filter`,
      'a count in a static ability cannot name a keyword: it would depend on layer 6 (CR 613.8)',
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
  // D-145: "where X is the greatest mana value among your commanders": plain (+X/+X) only, a mana value is never negative.
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
    checkCountOnly(amount, path, out, 'colorsAmong');
    return;
  }
  if (amount?.kind === 'sum') {
    // D-131: "the number of Zombies on the battlefield plus the number of Zombie cards in all graveyards".
    if (!Array.isArray(amount.of) || amount.of.length < 2) {
      issue(out, `${path}.of`, 'a sum needs at least two counts');
    } else {
      amount.of.forEach((part, i) => {
        checkCountOnly(part, `${path}.of[${i}]`, out);
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
    checkCountOnly(amount.of, `${path}.of`, out);
    return;
  }
  checkCountOnly(a, path, out);
}

// ---- Costs (CR 118)

export function checkCost(cost: Cost, path: string, out: Out): void {
  switch (cost?.kind) {
    case 'mana':
      checkManaSymbols(cost.symbols, `${path}.symbols`, out);
      break;
    case 'tap':
    case 'untap':
    case 'payXLife':
    case 'discardX':
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
    case 'blight':
      // D-407 (CR 701.68a): "Blight 1": a positive number of -1/-1 counters.
      if (!isCount(cost.count) || cost.count < 1) {
        issue(
          out,
          `${path}.count`,
          'the number of -1/-1 counters of a blight must be a positive integer',
        );
      }
      break;
    case 'sacrifice':
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
    case 'exileThis':
      // D-185: no operand; where it may stand is checked with the ability (`checkActivationCosts`).
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
    case 'energy':
      // D-209 (CR 107.14): a whole number of one or more energy counters, paid by the player an `unlessPays` names.
      if (!isCount(cost.count) || cost.count < 1) {
        issue(out, `${path}.count`, 'energy count must be a positive integer');
      }
      break;
    case 'discard':
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
      break;
    case 'returnToHand':
      // D-139: "Return an artifact you control to its owner's hand": this permanent, or a choice among the player's own.
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
    case 'yourMainPhase':
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
    case 'objectMatches':
      // D-135: these read what a resolving effect knows (what it did, the object it names), so only a `conditional` effect has them.
      issue(out, path, `${c.kind} is only valid in a conditional effect (D-135)`);
      break;
    case 'giftPromised': // D-135: the face must have the Gift keyword (`checkCastFace`)
      break;
    case 'lifeTotal':
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
    case 'triggerPlayerHasMore':
      // Where it may stand (an intervening "if" of a trigger whose event is about a player) is checked with the trigger (validate.ts).
      if (!isOneOf(c.stat, PLAYER_STATS))
        issue(out, `${path}.stat`, `unknown stat ${String(c.stat)}`);
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
      if (c.token !== undefined && typeof c.token !== 'boolean') {
        issue(out, `${path}.token`, 'token must be a boolean when present');
      }
      break;
    case 'cardsInLibrary': // D-331, CR 401.1: the same shape, for the library
    case 'cardsInGraveyard':
      // D-229, CR 404.1: the number of cards in the controller's graveyard against a whole number.
      if (!isOneOf(c.compare?.cmp, ['atLeast', 'atMost', 'equal'])) {
        issue(out, `${path}.compare.cmp`, `unknown comparison ${JSON.stringify(c.compare?.cmp)}`);
      }
      if (!Number.isSafeInteger(c.compare?.value)) {
        issue(out, `${path}.compare.value`, 'a card count is compared with a whole number');
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
    case 'spellsCastThisTurn':
      // D-318, CR 601.2i: the spells the controller has cast this turn.
      if (!isCount(c.atLeast) || c.atLeast < 1) {
        issue(out, `${path}.atLeast`, 'atLeast must be a positive integer');
      }
      break;
    case 'dieResult':
      // D-271, CR 706.2: the result of a die is read in the `conditional` effect after the roll (`checkEffectCondition`), nowhere else.
      issue(
        out,
        path,
        'dieResult reads the die rolled earlier in the same resolution: it is only valid in a conditional effect after a rollDie of the same sequence',
      );
      break;
    case 'thisInYourGraveyard':
      // D-271, CR 113.6b: no parameters; where it may stand is checked with the trigger (validate.ts).
      break;
    case 'kicked':
    case 'replicated': // D-129: the face must list a replicate cost (`checkCastFace`)
    case 'cameUnderControlSinceLastUpkeep': // D-127: where it may stand is checked with the trigger (validate.ts)
    case 'escaped': // D-124: the face must list an escape cost (`checkCastFace`)
    case 'subjectGreaterPt': // D-120: where it may stand is checked with the trigger (validate.ts)
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
  // D-139: a `createToken` produces objects `moved` names too ("create a token, then attach this to it").
  return (
    e?.kind === 'exile' ||
    e?.kind === 'destroy' ||
    e?.kind === 'moveToZone' ||
    e?.kind === 'createToken' ||
    // D-145: the card found by a `revealUntil` is "it".
    e?.kind === 'revealUntil' ||
    // D-151: the cards `exileTop` exiled are "those cards", and the card Discover found is "the discovered card".
    e?.kind === 'exileTop' ||
    // D-235: the card `exileRandomFromGraveyard` exiled is "the exiled card".
    e?.kind === 'exileRandomFromGraveyard' ||
    // D-393: the card `exileRandomFromHand` exiled is "it" ("If it's a land card, you may put it onto the battlefield").
    e?.kind === 'exileRandomFromHand' ||
    e?.kind === 'exileUntilCast' ||
    // D-177: the cards a `search` found and put somewhere are "it" and "that land" ("Then if you control four or more lands, untap that land").
    e?.kind === 'search' ||
    // D-216: the card a `lookAndSplit` exiled is "the exiled card" ("You may play the exiled card this turn").
    (e?.kind === 'lookAndSplit' && e.exile > 0) ||
    // D-327: the cards a `mill` put into a graveyard are "that card" ("Mill a card. You may play that card this turn.").
    e?.kind === 'mill'
  );
}

const TOKEN_PRESET_NAMES: readonly TokenPreset[] = ['Treasure', 'Food', 'Clue'];

/** The player selectors that name one player: what an effect with a single "it" (`exileRandomFromHand`) takes. */
const SINGLE_PLAYER_KINDS: readonly (string | undefined)[] = [
  'you',
  'controllerOf',
  'ownerOf',
  'target',
  'defendingPlayer',
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
  checkFilter(choose.filter, `${path}.filter`, out);
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
  if (sel.greatest !== undefined || sel.optional !== undefined) {
    issue(out, path, 'greatest and optional do not belong to a tap choice');
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
  if (
    sel.count === undefined ||
    typeof sel.count !== 'number' ||
    !isCount(sel.count) ||
    sel.count < 1
  ) {
    issue(out, `${path}.count`, 'the number of permanents to untap is a positive integer');
  }
  if (
    sel.anyNumber !== undefined ||
    sel.atLeastOne !== undefined ||
    sel.greatest !== undefined ||
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
  if (sel.atLeastOne !== undefined) {
    issue(out, `${path}.atLeastOne`, 'atLeastOne belongs to a sacrifice choice (D-187)');
  }
  if (sel.anyNumber !== undefined || sel.greatest !== undefined) {
    issue(out, path, 'anyNumber and greatest belong to a sacrifice choice (D-135)');
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
    !isOneOf(sel.filter.zone, ['battlefield', 'hand', 'graveyard', 'exile'])
  ) {
    issue(
      out,
      `${path}.filter.zone`,
      'only permanents on the battlefield, or cards in your hand or graveyard (D-139) or exiled with this permanent (D-207), can be chosen to move',
    );
  }
  // D-207, CR 607.2a: "a card exiled with this artifact": the permanent's own linked exile, so an ability's.
  if (sel.filter?.zone === 'exile' && scope.owner !== 'ability') {
    issue(
      out,
      `${path}.filter.zone`,
      'the cards exiled with a permanent are chosen by an ability of it',
    );
  }
  if (sel.optional !== undefined && sel.optional !== true) {
    issue(out, `${path}.optional`, 'optional must be true when present');
  }
  // D-411: "You may put a land card from among them into your hand": only the cards the effect before it moved (`moved`) are the candidates.
  if (sel.fromMoved !== undefined) {
    if (sel.fromMoved !== true)
      issue(out, `${path}.fromMoved`, 'fromMoved must be true when present');
    if (sel.filter?.zone !== 'graveyard') {
      issue(
        out,
        `${path}.filter.zone`,
        "a choice among the cards an earlier effect moved is among cards in your graveyard (D-411): set zone to 'graveyard'",
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
      if (typeof v !== 'number' || !Number.isSafeInteger(v)) {
        issue(out, `${path}.${key}`, `a creature token needs a numeric ${key}`);
      }
    } else if (v !== null) {
      issue(out, `${path}.${key}`, `only a creature token has ${key}`);
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
    default:
      issue(out, path, 'a copy is made from this permanent, a target or the triggering permanent');
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
  if (spec.noManaCost !== undefined && spec.noManaCost !== true) {
    issue(out, `${path}.noManaCost`, 'noManaCost must be true when present');
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
      if (ofKind !== 'target' && ofKind !== 'moved' && ofKind !== 'triggerSubject') {
        issue(
          out,
          `${path}.of`,
          'objectMatches reads a target, the object that was moved or the object that caused the trigger',
        );
      } else if (ofKind === 'triggerSubject') {
        // D-149: "If that land is a Plains": the permanent whose event caused the trigger.
        if (scope.triggerSubject !== 'permanent') {
          issue(
            out,
            `${path}.of`,
            'triggerSubject is only read where the trigger names a permanent (enters, dies, attacks, ...)',
          );
        }
      } else {
        checkRef(c.of, 'object', `${path}.of`, scope, out);
      }
      checkFilter(c.filter, `${path}.filter`, out);
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
      if (c.inZone !== undefined && c.inZone !== 'hand') {
        issue(out, `${path}.inZone`, "inZone is only 'hand' (D-412)");
      }
      break;
    }
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

export function checkEffect(e: Effect, path: string, scope: Scope, out: Out): void {
  switch (e?.kind) {
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
              child?.kind === 'exileOwnGraveyardCard') &&
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
      checkAmount(e.amount, `${path}.amount`, scope, out);
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
      if (kindOf(e.objects) !== 'each') {
        issue(out, `${path}.objects`, 'createCopies copies each permanent a group names');
      } else {
        checkObjectSelector(e.objects, `${path}.objects`, scope, out);
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
      checkCosts(e.cost, `${path}.cost`, out);
      break;
    case 'playersMay': {
      // D-210 (CR 608.2d): each player named is asked whether to do the effect; the effect and what is done otherwise are ordinary effects.
      checkPlayerSelector(e.players, `${path}.players`, scope, out);
      if (e.runsAs !== undefined && e.runsAs !== 'chooser') {
        issue(out, `${path}.runsAs`, "runsAs is 'chooser' when present");
      }
      checkEffect(e.effect, `${path}.effect`, scope, out);
      if (e.otherwise !== undefined) checkEffect(e.otherwise, `${path}.otherwise`, scope, out);
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
    case 'gainControl': {
      // CR 613.1b (D-189): a layer 2 effect for one named permanent: a target or the permanent that caused the trigger.
      const named = kindOf(e.objects);
      if (named === 'triggerSubject')
        checkSubjectRef(e.objects as ObjectRef, 'permanent', `${path}.objects`, scope, out);
      else if (named === 'target') checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      else
        issue(
          out,
          `${path}.objects`,
          'gainControl names a target or the permanent that caused the trigger',
        );
      if (
        !isOneOf(e.duration, [
          'untilEndOfTurn',
          'untilEndOfYourNextTurn',
          'forAsLongAsYouControlThis',
          'permanent',
        ])
      ) {
        issue(out, `${path}.duration`, `unknown duration ${JSON.stringify(e.duration)}`);
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
      break;
    case 'destroy':
      checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      // D-120: "It can't be regenerated" is a flag (CR 701.19c).
      if (e.cantBeRegenerated !== undefined && e.cantBeRegenerated !== true) {
        issue(out, `${path}.cantBeRegenerated`, 'cantBeRegenerated must be true when present');
      }
      break;
    case 'regenerate':
      // CR 701.19a: a shield for each permanent the selector names, until end of turn.
      checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      if (e.duration !== 'untilEndOfTurn') {
        issue(out, `${path}.duration`, 'a regeneration shield lasts until end of turn');
      }
      break;
    case 'mayPay':
      // CR 702.101a: "you may pay [cost]. If you do, [effect]".
      // D-364 (CR 119.4): the life paid may be the life that caused the trigger (`triggerDamage`, "pay that much life"), which the amount checks against
      // the trigger of the ability; any other amount is held to what a payment of life reads (`checkCost`).
      if (Array.isArray(e.cost)) {
        e.cost.forEach((c, i) => {
          if (c?.kind === 'payLife' && kindOf(c.amount) === 'triggerDamage') {
            checkAmount(c.amount, `${path}.cost[${i}].amount`, scope, out);
          }
        });
      }
      checkCosts(
        Array.isArray(e.cost)
          ? e.cost.map((c) =>
              c?.kind === 'payLife' && kindOf(c.amount) === 'triggerDamage'
                ? { ...c, amount: 1 }
                : c,
            )
          : e.cost,
        `${path}.cost`,
        out,
      );
      checkEffect(e.effect, `${path}.effect`, scope, out);
      break;
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
      checkDelayedTrigger(e, path, out, scope.movedAvailable === true, scope.diesTrigger === true);
      break;
    case 'delayedCast': {
      // CR 603.7 (D-336): an effect that creates a delayed triggered ability on the controller's next cast of a spell the filter names.
      checkFilter(e.filter, `${path}.filter`, out);
      if (e.filter?.stackKind !== 'spell') {
        issue(
          out,
          `${path}.filter`,
          'the filter of a delayed cast trigger is one of spells (stackKind "spell")',
        );
      }
      // CR 603.7c: nothing of the spell or ability that created it is left to name, so it does something to the spell cast, and only that.
      const inner = e.effect;
      if (inner?.kind !== 'copySpell' || kindOf(inner.spell) !== 'triggerSubject') {
        issue(
          out,
          `${path}.effect`,
          'a delayed cast trigger copies the spell that was cast (copySpell of triggerSubject)',
        );
        break;
      }
      checkEffect(
        inner,
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
      break;
    }
    case 'becomeMonarch':
      // CR 725.3 (D-127): one player becomes the monarch, so the selector names exactly one.
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      if (
        e.player?.kind === 'eachPlayer' ||
        e.player?.kind === 'eachOpponent' ||
        e.player?.kind === 'eachOtherOpponent' ||
        e.player?.kind === 'attackedPlayers' ||
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
      // CR 114.1, 114.4 (D-201): an emblem has static and triggered abilities, which work from the command zone: at least one, and no other kind.
      if (!Array.isArray(e.abilities) || e.abilities.length === 0) {
        issue(out, `${path}.abilities`, 'an emblem has at least one ability');
      } else {
        e.abilities.forEach((a, i) => {
          if (a?.kind !== 'static' && a?.kind !== 'triggered') {
            issue(
              out,
              `${path}.abilities[${i}]`,
              `an emblem has static and triggered abilities, not ${kindOf(a)}`,
            );
          } else {
            scope.checkAbility(a, `${path}.abilities[${i}]`, out);
          }
        });
      }
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
    case 'counter':
    case 'removeAllCounters':
    case 'connive':
    case 'reselectAttack':
    case 'transform':
      checkObjectSelector(e.objects, `${path}.objects`, scope, out);
      break;
    case 'moveToZone':
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
        const fromCards = zone === 'hand' || zone === 'graveyard';
        if (zone === 'exile' && e.to === 'battlefield') {
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
        // D-411: "You may put a land card from among them into your hand" is the one place a choice among moved cards goes (the hand).
        if ((e.objects as ChooseSelector).fromMoved === true && e.to !== 'hand') {
          issue(
            out,
            `${path}.to`,
            'a choice among the cards an earlier effect moved is put into the hand (D-411)',
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
      if (!isOneOf(e.to, ['hand', 'graveyard', 'library', 'battlefield'])) {
        issue(out, `${path}.to`, `cannot move to zone ${JSON.stringify(e.to)}`);
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
        if (e.attachTo?.kind !== 'target') {
          issue(out, `${path}.attachTo`, 'the object it enters attached to is a target');
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
        !isOneOf(e.take.to, ['hand', 'battlefield', 'exileFaceDown'])
      ) {
        issue(
          out,
          `${path}.take.to`,
          `the cards taken go to the hand, the battlefield or exile face down, not ${JSON.stringify(e.take.to)}`,
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
        checkStateAmount(
          e.take.manaValueAtMost,
          `${path}.take.manaValueAtMost`,
          out,
          'a mana value limit',
        );
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
      if (e.take?.hidden !== undefined && (e.take.hidden !== true || e.take.to === 'battlefield')) {
        issue(
          out,
          `${path}.take.hidden`,
          'hidden is true, and only for cards put into the hand (a card put onto the battlefield is public)',
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
      if (!isOneOf(e.rest, ['bottomRandom', 'graveyard', 'top', 'bottomChosen'])) {
        issue(out, `${path}.rest`, `unknown place for the rest ${JSON.stringify(e.rest)}`);
      }
      break;
    case 'castFree': {
      // CR 608.2g (D-145): a card chosen from the hand, or the card an earlier effect or a linked exile names; `play` also allows a land.
      if (e.play !== undefined && e.play !== true)
        issue(out, `${path}.play`, 'play must be true when present');
      const objects = e.objects as ChooseSelector | ObjectRef;
      if (kindOf(objects) === 'choose') {
        const choose = objects as ChooseSelector;
        checkFilter(choose.filter, `${path}.objects.filter`, out);
        if (choose.filter?.zone !== 'hand') {
          issue(
            out,
            `${path}.objects.filter.zone`,
            'the card is chosen from the hand: the filter says zone "hand"',
          );
        }
        if (
          choose.count !== undefined ||
          choose.anyNumber !== undefined ||
          choose.atLeastOne !== undefined ||
          choose.greatest !== undefined ||
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
      } else if (kindOf(objects) === 'moved' || kindOf(objects) === 'linkedExile') {
        checkRef(objects as ObjectRef, 'object', `${path}.objects`, scope, out);
      } else {
        issue(
          out,
          `${path}.objects`,
          "the card is chosen from the hand, or is 'moved' or 'linkedExile'",
        );
      }
      break;
    }
    case 'castCard':
      // CR 608.2g (D-350): "you may cast target [card] from a graveyard": the card is a target of the ability (a card in a graveyard when the ability resolves).
      if (kindOf(e.object) !== 'target') {
        issue(out, `${path}.object`, 'the card to cast is a target');
      } else {
        checkRef(e.object as ObjectRef, 'object', `${path}.object`, scope, out);
      }
      if (e.anyManaType !== undefined && e.anyManaType !== true) {
        issue(out, `${path}.anyManaType`, 'anyManaType must be true when present');
      }
      if (e.exileInstead !== undefined && e.exileInstead !== true) {
        issue(out, `${path}.exileInstead`, 'exileInstead must be true when present');
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
      // D-145: "reveal cards until you reveal a land card": a filter of cards in the library, and where the card found goes.
      checkFilter(e.filter, `${path}.filter`, out, undefined, scope.diesTrigger === true);
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
      if (!isOneOf(e.put, ['battlefield', 'hand'])) {
        issue(
          out,
          `${path}.put`,
          `a revealed card is put onto the battlefield or into the hand, not ${JSON.stringify(e.put)}`,
        );
      }
      if (e.tapped !== undefined && (e.tapped !== true || e.put !== 'battlefield')) {
        issue(
          out,
          `${path}.tapped`,
          'tapped is true, and only for a card put onto the battlefield',
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
    case 'exileRandomFromGraveyard':
      // CR 701.13 (D-235): no fields.
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
      break;
    case 'exileOwnGraveyardCard':
      // D-231: "each player exiles a card from their graveyard": the players of the selector, each choosing among their own cards.
      checkPlayerSelector(e.players, `${path}.players`, scope, out);
      break;
    case 'draw':
    case 'discard':
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      checkAmount(e.count, `${path}.count`, scope, out);
      // D-151: "Discard any number of cards": the player chooses how many, so `count` is 0 and nothing else narrows the choice.
      if (e.kind === 'discard' && e.anyNumber !== undefined) {
        if (e.anyNumber !== true || e.count !== 0 || e.unless !== undefined) {
          issue(
            out,
            `${path}.anyNumber`,
            'anyNumber is true, with a count of 0 and no "unless you discard"',
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
      if (e.kind === 'draw' && (e as { unless?: unknown }).unless !== undefined) {
        issue(out, `${path}.unless`, 'only a discard has an "unless you discard" alternative');
      }
      break;
    case 'gainLife':
    case 'loseLife':
    case 'gainEnergy':
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      // D-365: "the life that player lost this turn" is the whole amount of a `loseLife`, read for each player it affects (`rules/life-amounts.ts`).
      if (kindOf(e.amount) === 'lifeLostThisTurn') {
        if (e.kind !== 'loseLife') {
          issue(out, `${path}.amount`, 'lifeLostThisTurn is the amount of a loseLife effect');
        }
      } else {
        checkAmount(e.amount, `${path}.amount`, scope, out);
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
    case 'setLifeTotal':
      // CR 119.5 (D-201): a whole number, 0 or more.
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      if (!isCount(e.amount)) {
        issue(
          out,
          `${path}.amount`,
          'a life total that becomes a number is a whole number of 0 or more',
        );
      }
      break;
    case 'addMana':
      checkManaProduction(e.mana, `${path}.mana`, out);
      if (e.player !== undefined) {
        // D-229: the pool of one player a selector names; a fixed production only.
        checkPlayerSelector(e.player, `${path}.player`, scope, out);
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
      checkAmount(e.count, `${path}.count`, scope, out);
      break;
    case 'modifyPt':
    case 'setPt':
    case 'loseAllAbilities':
    case 'setTypes':
    case 'setColors':
    case 'grantKeyword':
    case 'grantAbility':
    case 'restrict':
    case 'preventDamage':
      scope.checkContinuous(e, path, scope, out);
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
    case 'attach':
      // CR 701.3: both are single objects named by reference ("this", a target, "this spell").
      checkRef(e.object, 'object', `${path}.object`, scope, out);
      // D-406: "Whenever a creature enters, you may attach this Aura to that creature": the permanent the trigger is about.
      if (kindOf(e.to) === 'triggerSubject')
        checkSubjectRef(e.to, 'permanent', `${path}.to`, scope, out);
      else checkRef(e.to, 'object', `${path}.to`, scope, out);
      break;
    case 'conditional':
      // CR 608.2c: "If [condition], [effect]. Otherwise, [else]." Both branches see the same
      // targets and X as the rest of the spell or ability.
      checkEffectCondition(e.condition, `${path}.condition`, scope, out);
      checkEffect(e.effect, `${path}.effect`, scope, out);
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
      if (e.chooser !== undefined) checkPlayerSelector(e.chooser, `${path}.chooser`, scope, out);
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
      if (scope.mayAvailable !== true) {
        issue(
          out,
          path,
          'a reflexive trigger ("when you do") needs a "may" effect before it in the sequence',
        );
      }
      if (e.ifThisWay !== undefined) {
        if (e.ifThisWay !== 'exiledNonland') {
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
      const inner: Scope = {
        owner: scope.owner,
        targets: own,
        xAllowed: false,
        // D-177: the reflexive ability reads the permanent the resolution that created it sacrificed.
        ...(scope.sacrificedEarlier === true ? { sacrificedEarlier: true } : {}),
        // D-231: and the count the `ifThisWay` names.
        ...(e.ifThisWay === undefined ? {} : { thisWay: [e.ifThisWay] }),
        checkAbility: scope.checkAbility,
        checkContinuous: scope.checkContinuous,
        checkEffectExt: scope.checkEffectExt,
      };
      checkEffect(e.effect, `${path}.effect`, inner, out);
      break;
    }
    case 'mayCast':
      // D-135: "you may cast target [card] from your graveyard this turn".
      if (kindOf(e.objects) !== 'target') {
        issue(out, `${path}.objects`, 'a cast permission names a target card');
      } else {
        checkRef(e.objects as ObjectRef, 'object', `${path}.objects`, scope, out);
      }
      if (e.duration !== 'untilEndOfTurn') {
        issue(out, `${path}.duration`, 'a cast permission lasts until end of turn');
      }
      if (e.exileInstead !== undefined && e.exileInstead !== true) {
        issue(out, `${path}.exileInstead`, 'exileInstead must be true when present');
      }
      break;
    case 'shuffle':
      checkPlayerSelector(e.player, `${path}.player`, scope, out);
      break;
    case 'rollDie':
      // CR 706.1a (D-271): a die has N equally likely outcomes numbered 1 to N; the engine draws from the generator with `nextInt`, which takes up to 2^32.
      if (!isCount(e.sides) || e.sides < 2 || e.sides > 4294967296) {
        issue(out, `${path}.sides`, 'a die has a whole number of sides from 2 to 4294967296');
      }
      break;
    case 'proliferate':
      // CR 701.34a (D-149): no parameters; the controller chooses what to give counters to as it resolves.
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
