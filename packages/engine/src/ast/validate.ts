/**
 * validateAst (SPEC 17.2 A7, D-007). A card is supported only if `validateCard` returns an
 * empty list. The interpreter has no "not implemented" path, so everything a supported card
 * can reach must be well-formed here: declared targets, resolvable selectors, sane amounts
 * and costs, valid mana symbols (CR 107.4).
 *
 * Paths look like `faces[0].abilities[1].effect.effects[0].to`, for `validateAbility` they
 * start at `ability`.
 */
import type { CardDefinition, CardFace } from '../cards/definition';
import { CARD_TYPES, COLORS, isPermanentType, SUPERTYPES } from '../characteristics';
import { RESTRICTIONS } from './features';
import { unsupportedFeatureIssues } from './supported';
import type {
  Ability,
  Amount,
  Condition,
  Cost,
  Effect,
  Keyword,
  Replacement,
  SpellText,
  StaticEffect,
  Trigger,
} from './types';
import { TRIGGER_STEPS, ZONES } from './types';
import { checkAngelsReplacement, checkAngelsStatic, checkAngelsTrigger } from './validate-angels';
import { checkArtifactsFace, checkArtifactsStatic } from './validate-artifacts';
import {
  checkAttachmentFace,
  checkBattlefieldFilter,
  checkGrantedKeyword,
  checkProtectionTypes,
  checkStaticSubject,
} from './validate-attach';
import { kindOf, triggerHasPlayer } from './validate-base';
import {
  checkCastFace,
  checkFlashbackCost,
  checkKickerCost,
  giftTargetsUsedUnguarded,
  kickedTargetsUsedOutsideTheirCase,
} from './validate-cast';
import { chosenIssues } from './validate-chosen';
import { checkContinuousEffect } from './validate-continuous';
import {
  checkAdditionalCostChoice,
  checkAdditionalCosts,
  checkAlternativeCosts,
  checkAttackTax,
  checkCostReduction,
} from './validate-cost';
import { checkCrossZoneSlots } from './validate-cross-zone';
import { checkDinosaursFace, checkDinosaursStatic } from './validate-dinosaurs';
import {
  checkDragonsEffect,
  checkDragonsFace,
  checkDragonsReplacement,
  checkDragonsStatic,
  checkGraveyardAbility,
} from './validate-dragons';
import { checkBatchKeyword } from './validate-keywords';
import { layoutStructureIssues } from './validate-layouts';
import { checkManaAbility } from './validate-mana-ability';
import { checkModalAbilityShell, checkModes } from './validate-modes';
import {
  type AstIssue,
  checkCondition,
  checkCosts,
  checkEffect,
  checkEnumList,
  checkFilter,
  checkManaSymbols,
  checkReplacementToken,
  checkStarPairing,
  checkStateAmount,
  checkStaticPtAmount,
  declareTargets,
  filterSome,
  isCount,
  issue,
  loyaltyOffPlaneswalkerIssues,
  readsCombatOrSource,
  readsCombatOrSourceBesidesCommander,
  type Scope,
} from './validate-parts';
import {
  checkRedirectReplacement,
  checkRedirectStatic,
  redirectFaceIssues,
} from './validate-redirect';
import { checkStaticCondition } from './validate-static-condition';

export type { AstIssue } from './validate-parts';

function isOneOf(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === 'string' && allowed.includes(value);
}

// ---- Keywords, replacements, triggers

function checkKeyword(k: Keyword, path: string, out: AstIssue[]): void {
  switch (k?.kind) {
    case 'ward':
      checkCosts(k.cost, `${path}.cost`, out);
      break;
    case 'cycling':
      // CR 702.29a: "[Cost], Discard this card: Draw a card" adds the discard itself.
      checkCosts(k.cost, `${path}.cost`, out);
      if (Array.isArray(k.cost) && k.cost.some((c) => c?.kind === 'discardThis')) {
        issue(out, `${path}.cost`, 'cycling already discards the card; do not list discardThis');
      }
      break;
    case 'enchant':
      // CR 702.5a: what an Aura spell can target and what it can stay attached to: permanents.
      if (k.filter === undefined || k.filter === null) {
        issue(out, `${path}.filter`, 'enchant needs a filter');
      } else {
        checkBattlefieldFilter(k.filter, `${path}.filter`, out);
      }
      break;
    case 'equip':
      // CR 702.6a: "[Cost]: Attach this permanent to target creature you control."
      checkCosts(k.cost, `${path}.cost`, out);
      if (Array.isArray(k.cost) && k.cost.some((c) => c?.kind === 'discardThis')) {
        issue(out, `${path}.cost`, 'discardThis is only a cost of a card in the hand');
      }
      // D-220 (CR 702.6c): "Equip Wizard {1}": a filter of the creature to attach to; no zone, no owner, no combat, no tapped state.
      if (k.restriction !== undefined) {
        checkFilter(k.restriction, `${path}.restriction`, out);
        if (
          filterSome(
            k.restriction,
            (f) =>
              f.zone !== undefined ||
              f.owner !== undefined ||
              f.controller !== undefined ||
              f.stackKind !== undefined ||
              readsCombatOrSourceBesidesCommander(f),
          )
        ) {
          issue(
            out,
            `${path}.restriction`,
            'the quality of the creature an equip ability attaches to has no zone, controller or combat: it is a creature you control',
          );
        }
      }
      break;
    case 'crew':
      // CR 702.122a: "Crew N": tap other untapped creatures with total power N or greater.
      if (!Number.isSafeInteger(k.power) || k.power < 1) {
        issue(out, `${path}.power`, 'crew power must be a positive integer');
      }
      break;
    case 'kicker':
      // CR 702.33a: an additional cost, paid as the spell is cast.
      checkKickerCost(k.cost, `${path}.cost`, out);
      break;
    case 'flashback':
      // CR 702.34a: an alternative cost, paid instead of the mana cost from the graveyard.
      checkFlashbackCost(k.cost, `${path}.cost`, out);
      break;
    case 'protection':
      // D-259 (CR 903.4f): "each color that's not in your commander's color identity" names no color: the engine works them out.
      if (k.from === 'colorsNotInCommanderIdentity') break;
      // D-376 (CR 702.16a): "the chosen card type" is read from the permanent's own choice (the card must ask it, `validate-chosen.ts`); named card types are checked.
      if (k.from === 'chosenCardType') break;
      if (k.from === 'cardType') {
        checkProtectionTypes(k.types, `${path}.types`, out);
        break;
      }
      if (k.from !== 'color') {
        issue(
          out,
          `${path}.from`,
          `unknown protection quality ${String((k as { from: unknown }).from)}`,
        );
        break;
      }
      if (!Array.isArray(k.colors) || k.colors.length === 0) {
        issue(out, `${path}.colors`, 'protection needs at least one color');
      } else {
        k.colors.forEach((c, i) => {
          if (!isOneOf(c, COLORS)) issue(out, `${path}.colors[${i}]`, `unknown color ${String(c)}`);
        });
      }
      break;
    case 'landwalk':
      // CR 702.14a, 702.14c: a land type ("Island") or "nonbasic". Snow and artifact landwalk
      // (a type or supertype besides the land type) are not run.
      if (typeof k.landType !== 'string' || k.landType === '') {
        issue(out, `${path}.landType`, 'landwalk needs a land type or "nonbasic"');
      } else if (k.landType !== 'nonbasic' && !/^[A-Z][A-Za-z'-]*$/.test(k.landType)) {
        issue(out, `${path}.landType`, `${JSON.stringify(k.landType)} is not a land type`);
      }
      break;
    case 'fear':
    case 'intimidate':
    case 'shadow':
    case 'flying':
    case 'firstStrike':
    case 'doubleStrike':
    case 'deathtouch':
    case 'defender':
    case 'haste':
    case 'hexproof':
    case 'shroud':
    case 'indestructible':
    case 'lifelink':
    case 'menace':
    case 'reach':
    case 'trample':
    case 'vigilance':
    case 'flash':
    case 'prowess':
      break;
    default:
      // D-110: Changeling, Devoid, Partner, Exalted, Annihilator, Persist, Undying, Infect, Wither,
      // Toxic, Split second, typecycling and Multikicker.
      if (!checkBatchKeyword(k, path, out)) issue(out, path, `unknown keyword ${kindOf(k)}`);
  }
}

function checkReplacement(r: Replacement, path: string, out: AstIssue[]): void {
  switch (r?.kind) {
    case 'entersTapped':
      if (r.unless !== undefined) checkCondition(r.unless, `${path}.unless`, out);
      break;
    case 'entersPrepared':
      // D-214: where it may stand is checked with the layout (`layoutStructureIssues`).
      break;
    case 'entersTappedUnlessReveals':
      // D-208 (CR 701.20, 701.4): the cards that may be revealed, as a filter of the hand (and the permanents the controller controls, for behold).
      checkFilter(r.filter, `${path}.filter`, out);
      if (typeof r.words !== 'string' || r.words.trim() === '') {
        issue(out, `${path}.words`, 'the dialog needs the words of what is revealed');
      }
      if (r.fromBattlefield !== undefined && r.fromBattlefield !== true) {
        issue(out, `${path}.fromBattlefield`, 'fromBattlefield must be true when present');
      }
      if (filterSome(r.filter, (f) => f.zone !== undefined || f.controller !== undefined)) {
        issue(
          out,
          `${path}.filter`,
          "the cards revealed are the controller's: no zone, no controller",
        );
      }
      break;
    case 'entersTappedUnlessPays':
      // CR 119.4: paying life is the only payment a shock land asks for.
      checkCosts(r.cost, `${path}.cost`, out);
      if (Array.isArray(r.cost)) {
        r.cost.forEach((c, i) => {
          if (c?.kind !== 'payLife') {
            issue(out, `${path}.cost[${i}]`, 'only a payLife cost is supported here');
          } else if (c.amount < 1) {
            issue(out, `${path}.cost[${i}].amount`, 'life paid must be at least 1');
          }
        });
      }
      break;
    case 'entersWithCounters':
      if (typeof r.counter !== 'string' || r.counter === '') {
        issue(out, `${path}.counter`, 'counter name must be non-empty');
      }
      // D-103: "enters with X +1/+1 counters" reads the X of the spell it entered from (CR 107.3m).
      // D-131: a `countOf` is "a +1/+1 counter on it for each Zombie card in your graveyard".
      if (kindOf(r.count) === 'countOf') {
        checkStateAmount(r.count as Amount, `${path}.count`, out, 'an enters-with count');
      } else if (
        kindOf(r.count) !== 'x' &&
        kindOf(r.count) !== 'timesKicked' &&
        (!isCount(r.count) || r.count < 1)
      ) {
        issue(
          out,
          `${path}.count`,
          'counter count must be a positive integer, { kind: "x" }, { kind: "timesKicked" } or a countOf',
        );
      }
      // CR 702.138c (D-124): "escapes with" is the only conditional form; it needs an escape cost (`checkCastFace`).
      if (r.ifEscaped !== undefined && r.ifEscaped !== true) {
        issue(out, `${path}.ifEscaped`, 'ifEscaped is true or absent');
      }
      break;
    case 'asEntersChoose':
      // CR 614.12a (D-100): what is chosen is a creature type or a color; D-151: or a name from a list the card gives; D-376: or a card type.
      if (!isOneOf(r.what, ['creatureType', 'color', 'option', 'cardType'])) {
        issue(out, `${path}.what`, `unknown choice ${JSON.stringify(r.what)}`);
      }
      break;
    case 'wouldDie':
      // D-133: the creatures that would die, what happens instead, and tokens made at the same time.
      checkFilter(r.what, `${path}.what`, out);
      if (filterSome(r.what, (f) => f.zone !== undefined || f.stackKind !== undefined)) {
        issue(
          out,
          `${path}.what`,
          'the creature that would die is on the battlefield: no zone or stackKind',
        );
      }
      if (
        filterSome(
          r.what,
          (f) =>
            f.attacking !== undefined ||
            f.attackingYou !== undefined ||
            f.attackingOpponents !== undefined ||
            f.attackingOrBlocking !== undefined,
        )
      ) {
        issue(out, `${path}.what`, 'a replacement of a death does not read the combat');
      }
      if (r.instead !== 'exile') {
        issue(
          out,
          `${path}.instead`,
          `a creature that would die is exiled instead, not ${JSON.stringify(r.instead)}`,
        );
      }
      if (r.alsoCreate !== undefined) {
        if (!isCount(r.alsoCreate.count) || r.alsoCreate.count < 1) {
          issue(
            out,
            `${path}.alsoCreate.count`,
            'the number of tokens must be a positive integer (count)',
          );
        }
        checkReplacementToken(r.alsoCreate.token, `${path}.alsoCreate.token`, out);
      }
      break;
    default:
      // D-149: "If you would gain life, you gain that much life plus 1 instead."
      if (
        !checkAngelsReplacement(r, path, out) &&
        !checkDragonsReplacement(r, path, out) &&
        !checkRedirectReplacement(r, path, out)
      ) {
        issue(out, path, `unknown replacement ${kindOf(r)}`);
      }
  }
}

function checkStatic(s: StaticEffect, path: string, out: AstIssue[]): void {
  switch (s?.kind) {
    case 'noMaximumHandSize':
      break;
    case 'lookAtTopOfLibrary':
    case 'optionalUntap':
      break;
    case 'untapInOthersUntapStep':
      // D-320: the permanent itself (`self`), or (D-229) the permanents a filter names: exactly one of the two.
      if (s.self !== undefined && s.self !== true) {
        issue(out, `${path}.self`, 'self is true or absent');
      }
      if ((s.self === true) === (s.what !== undefined)) {
        issue(out, path, 'name the permanents that untap with exactly one of `what` and `self`');
      }
      if (s.what === undefined) break;
      // D-229: permanents on the battlefield: no zone, owner, stack kind or combat.
      checkFilter(s.what, `${path}.what`, out);
      if (
        filterSome(
          s.what,
          (f) =>
            f.zone !== undefined ||
            f.owner !== undefined ||
            f.stackKind !== undefined ||
            readsCombatOrSource(f),
        )
      ) {
        issue(
          out,
          `${path}.what`,
          'the permanents that untap are on the battlefield: no zone, owner, stackKind or combat',
        );
      }
      break;
    case 'attackTax':
      checkAttackTax(s, path, out);
      break;
    case 'additionalLandDrops':
      // CR 305.2 (D-125): a positive whole number of extra land plays.
      if (!Number.isSafeInteger(s.count) || s.count < 1) {
        issue(out, `${path}.count`, 'count must be a whole number of at least 1');
      }
      if (s.eachPlayer !== undefined && s.eachPlayer !== true) {
        issue(out, `${path}.eachPlayer`, 'eachPlayer is true or absent');
      }
      break;
    case 'modifyPt':
      checkStaticSubject(s.subject, `${path}.subject`, out, false, true);
      // D-115: an integer, or a count of objects (or a multiple of one) that follows the board.
      checkStaticPtAmount(s.power, `${path}.power`, true, out);
      checkStaticPtAmount(s.toughness, `${path}.toughness`, true, out);
      break;
    case 'characteristicPt':
      // CR 604.3, 613.4a: "~'s power and toughness are each equal to ..." defines what it names.
      if (s.power === undefined && s.toughness === undefined) {
        issue(out, path, 'a characteristic-defining ability defines power, toughness or both');
      }
      if (s.power !== undefined) checkStaticPtAmount(s.power, `${path}.power`, false, out);
      if (s.toughness !== undefined) {
        checkStaticPtAmount(s.toughness, `${path}.toughness`, false, out);
      }
      break;
    case 'grantKeyword':
      checkStaticSubject(s.subject, `${path}.subject`, out, true, true);
      checkGrantedKeyword(s.keyword, `${path}.keyword`, out);
      // D-185: riot is applied as a permanent enters, so only a group the battlefield names can give it (CR 614.12).
      if (s.keyword?.kind === 'riot' && s.subject?.kind !== 'filter') {
        issue(out, `${path}.subject`, 'riot is given to a group of permanents, as they enter');
      }
      break;
    case 'restriction':
      checkStaticSubject(s.subject, `${path}.subject`, out);
      if (!isOneOf(s.restriction, RESTRICTIONS)) {
        issue(out, `${path}.restriction`, `unknown restriction ${JSON.stringify(s.restriction)}`);
      }
      // CR 113.6g: "can't be countered" is a spell's own ability and works on the stack, so it
      // belongs to `this`; a permanent giving it to spells would be another rule.
      if (s.restriction === 'cantBeCountered' && s.subject?.kind !== 'this') {
        issue(
          out,
          `${path}.subject`,
          'cantBeCountered is the spell\'s own ability: its subject is "this"',
        );
      }
      break;
    case 'costReduction':
      checkCostReduction(s, path, out);
      break;
    case 'castFromGraveyard':
      // D-133: the permission has no parameters; the face-level checks say where it may stand.
      break;
    case 'grantAbility':
      checkStaticSubject(s.subject, `${path}.subject`, out, false, s.ability?.kind !== 'mana');
      // D-099: a mana ability; D-151: an activated or a triggered ability too, held to the rules of one of the card's own.
      if (s.ability?.kind === 'mana') {
        checkManaAbility(s.ability, `${path}.ability`, out);
      } else if (s.ability?.kind === 'activated' || s.ability?.kind === 'triggered') {
        checkAbility(s.ability, `${path}.ability`, out);
        if (
          s.ability.kind === 'activated' &&
          Array.isArray(s.ability.cost) &&
          s.ability.cost.some((c) => c?.kind === 'loyalty')
        ) {
          issue(out, `${path}.ability.cost`, 'a granted loyalty ability is not supported');
        }
        if (
          s.ability.kind === 'activated' &&
          s.ability.functionsIn !== undefined &&
          s.ability.functionsIn !== 'battlefield'
        ) {
          issue(out, `${path}.ability.functionsIn`, 'a granted ability works on the battlefield');
        }
        if (s.ability.kind === 'triggered' && s.ability.functionsIn !== undefined) {
          issue(out, `${path}.ability.functionsIn`, 'a granted ability works on the battlefield');
        }
      } else {
        issue(
          out,
          `${path}.ability`,
          `a static ability can grant a mana, an activated or a triggered ability, not ${kindOf(s.ability)}`,
        );
      }
      break;
    case 'setPt':
    case 'cantBeBlockedBy':
    case 'takeFromLinkedExile':
    case 'castAsThoughFlash':
    case 'spellsCantBeCountered':
    case 'opponentsCantCastSpells':
      checkArtifactsStatic(s, path, out);
      break;
    case 'restrictionUnless':
    case 'setColors':
    case 'loseAllAbilities':
      checkDinosaursStatic(s, path, out);
      break;
    case 'loseTypes':
      // D-229: "~ isn't a creature": the permanent itself loses card types.
      checkStaticSubject(s.subject, `${path}.subject`, out);
      if (s.subject?.kind !== 'this') {
        issue(
          out,
          `${path}.subject`,
          'a static loseTypes affects only the permanent itself ("this")',
        );
      }
      checkEnumList(out, `${path}.types`, s.types, CARD_TYPES, 'card type');
      if (!Array.isArray(s.types) || s.types.length === 0) {
        issue(out, `${path}.types`, 'loseTypes names at least one card type');
      }
      break;
    case 'setTypes':
      // D-139: "are Juggernauts in addition to their other creature types": named types for a subject.
      if (checkArtifactsStatic(s, path, out)) break;
      // D-100: "~ is the chosen type in addition to its other types": the permanent itself, additive.
      checkStaticSubject(s.subject, `${path}.subject`, out);
      if (s.subject?.kind !== 'this') {
        issue(
          out,
          `${path}.subject`,
          'a static setTypes affects only the permanent itself ("this")',
        );
      }
      if (s.chosenType !== true) issue(out, `${path}.chosenType`, 'chosenType must be true');
      if (s.additive !== true) {
        issue(out, `${path}.additive`, 'a static setTypes is "in addition to its other types"');
      }
      break;
    default:
      // D-149: prevention, protection of a player, "can't cast this".
      if (
        !checkAngelsStatic(s, path, out) &&
        !checkDragonsStatic(s, path, out) &&
        !checkRedirectStatic(s, path, out)
      ) {
        issue(out, path, `unknown static effect ${kindOf(s)}`);
      }
  }
}

function checkTrigger(t: Trigger, path: string, out: AstIssue[]): void {
  // D-133: "attacks you or a planeswalker you control" belongs to the attack trigger.
  const at = (t as { at?: unknown } | null)?.at;
  if (at !== undefined) {
    if (t?.kind !== 'attacks') {
      issue(out, `${path}.at`, 'at (whom it attacks) belongs to an attacks trigger');
    } else if (!isOneOf(at, ['you', 'youOrPlaneswalkers'])) {
      issue(out, `${path}.at`, `unknown attack target ${JSON.stringify(at)}`);
    }
  }
  switch (t?.kind) {
    case 'entersBattlefield':
    case 'dies':
    case 'attacks':
    case 'becomesTapped':
    case 'becomesUntapped':
    case 'blocks':
    case 'becomesBlocked':
      checkTriggerSubject(t.what, t.kind !== 'entersBattlefield', `${path}.what`, out);
      // D-135: "enters untapped" / "enters tapped" belongs to the enters trigger.
      if (
        t.kind === 'entersBattlefield' &&
        t.tapped !== undefined &&
        typeof t.tapped !== 'boolean'
      ) {
        issue(out, `${path}.tapped`, 'tapped must be a boolean when present');
      }
      // D-110: "attacks alone" (CR 506.5) is a flag of the attacks trigger.
      if (t.kind === 'attacks' && t.alone !== undefined && t.alone !== true) {
        issue(out, `${path}.alone`, 'alone must be true when present');
      }
      // D-151: "attacks for the first time each turn".
      if (
        t.kind === 'attacks' &&
        t.firstTimeEachTurn !== undefined &&
        (t.firstTimeEachTurn !== true || t.alone === true)
      ) {
        issue(
          out,
          `${path}.firstTimeEachTurn`,
          'firstTimeEachTurn must be true when present, and it does not go with alone',
        );
      }
      break;
    case 'dealtDamage':
      // D-133: "whenever [it] is dealt damage": a permanent (not `this` of a spell), optionally combat damage only.
      checkTriggerSubject(t.what, true, `${path}.what`, out);
      if (t.combat !== undefined && t.combat !== true) {
        issue(out, `${path}.combat`, 'combat must be true when present');
      }
      break;
    case 'castSpell':
      checkFilter(t.filter, `${path}.filter`, out);
      if (!isOneOf(t.by, ['you', 'opponent', 'any']))
        issue(out, `${path}.by`, `unknown caster ${String(t.by)}`);
      // D-120: "When you cast this spell" (CR 702.85a): the spell's own ability, for itself only.
      if (t.self !== undefined) {
        if (t.self !== true) issue(out, `${path}.self`, 'self must be true when present');
        if (t.by !== 'you') issue(out, `${path}.by`, '"when you cast this spell" is cast by you');
        if (
          t.filter?.stackKind !== 'spell' ||
          Object.keys(t.filter).some((key) => key !== 'stackKind')
        ) {
          issue(out, `${path}.filter`, 'a self cast trigger has the filter { stackKind: "spell" }');
        }
      }
      // D-229: "casts their second spell each turn": the nth spell of the caster this turn, counting from 1; never with `self`.
      if (t.nth !== undefined) {
        if (!isCount(t.nth) || t.nth < 1)
          issue(out, `${path}.nth`, 'nth must be a positive integer');
        if (t.self !== undefined) issue(out, `${path}.nth`, 'a self cast trigger has no count');
      }
      break;
    case 'landfall':
      break;
    case 'ringTempted':
      // D-196: "whenever the Ring tempts you" (CR 701.54d) has no parameters.
      break;
    case 'cycled':
      // D-179: "when you cycle this card" has no parameters; the face is checked for Cycling or typecycling with its abilities.
      break;
    case 'becomesTarget':
      checkTriggerSubject(t.what, true, `${path}.what`, out);
      if (!isOneOf(t.by, ['you', 'opponent', 'any'])) {
        issue(out, `${path}.by`, `unknown controller of the targeting object ${String(t.by)}`);
      }
      if (t.spellOnly !== undefined && t.spellOnly !== true) {
        issue(out, `${path}.spellOnly`, 'spellOnly is true when present');
      }
      break;
    case 'chapter':
      // CR 714.2a, 714.2c: chapter numbers count from 1; "I, II" is the range 1 to 2.
      if (!isCount(t.from) || t.from < 1) {
        issue(out, `${path}.from`, 'a chapter number must be a positive integer');
      }
      if (!isCount(t.to) || t.to < 1) {
        issue(out, `${path}.to`, 'a chapter number must be a positive integer');
      } else if (isCount(t.from) && t.to < t.from) {
        issue(
          out,
          `${path}.to`,
          'the last chapter of a chapter ability cannot be before its first',
        );
      }
      break;
    case 'state':
      // CR 603.8 (D-139): a state trigger reads a condition of the game, as a plain condition does.
      checkCondition(t.condition, `${path}.condition`, out);
      break;
    case 'combatDamageBatch':
      // D-139: one or more sources that `what` names deal combat damage to a player: a filter, whom, and how many sources.
      checkFilter(t.what, `${path}.what`, out);
      if (
        filterSome(
          t.what,
          (f) => f.zone !== undefined || f.owner !== undefined || f.stackKind !== undefined,
        )
      ) {
        issue(
          out,
          `${path}.what`,
          'the source of the damage is on the battlefield: no zone, owner or stackKind',
        );
      }
      if (!isOneOf(t.to, ['player', 'opponent'])) {
        issue(out, `${path}.to`, `unknown recipient ${String(t.to)}`);
      }
      if (t.atLeast !== undefined && (!isCount(t.atLeast) || t.atLeast < 2)) {
        issue(
          out,
          `${path}.atLeast`,
          'atLeast is a whole number of 2 or more (one is the default)',
        );
      }
      break;
    case 'tapsForMana':
      // CR 106.12, 603.2 (D-189): "whenever an opponent taps an artifact for mana": who taps, which permanents (still on the battlefield as it is tapped).
      if (!isOneOf(t.who, ['you', 'opponent', 'any'])) {
        issue(out, `${path}.who`, `unknown player ${JSON.stringify(t.who)}`);
      }
      checkFilter(t.what, `${path}.what`, out);
      if (
        filterSome(
          t.what,
          (f) => f.zone !== undefined || f.owner !== undefined || f.stackKind !== undefined,
        )
      ) {
        issue(
          out,
          `${path}.what`,
          'the permanent tapped is on the battlefield: no zone, owner or stackKind',
        );
      }
      break;
    case 'tappedForMana':
      // CR 605.1b (D-139): "whenever you tap a permanent for {C}, add an additional {C}": the permanents, whose mana it is, which type.
      checkFilter(t.what, `${path}.what`, out);
      if (
        filterSome(
          t.what,
          (f) => f.zone !== undefined || f.owner !== undefined || f.stackKind !== undefined,
        )
      ) {
        issue(
          out,
          `${path}.what`,
          'the permanent tapped is on the battlefield: no zone, owner or stackKind',
        );
      }
      if (t.by !== 'you')
        issue(out, `${path}.by`, 'only your own tapping is supported: by must be "you"');
      if (t.mana !== undefined && !isOneOf(t.mana, ['W', 'U', 'B', 'R', 'G', 'C'])) {
        issue(out, `${path}.mana`, `unknown mana type ${JSON.stringify(t.mana)}`);
      }
      break;
    case 'discarded':
      // D-206: "whenever you discard a card": whose discard.
      if (!isOneOf(t.who, ['you', 'opponent', 'any'])) {
        issue(out, `${path}.who`, `unknown player ${JSON.stringify(t.who)}`);
      }
      // D-374: "another card".
      if (t.another !== undefined && typeof t.another !== 'boolean') {
        issue(out, `${path}.another`, 'another must be a boolean');
      }
      // D-383: "a creature card": read against the card where it went (a graveyard, or exile for madness), so no zone, controller or owner.
      if (t.filter !== undefined) {
        checkFilter(t.filter, `${path}.filter`, out);
        if (
          filterSome(
            t.filter,
            (f) => f.zone !== undefined || f.controller !== undefined || f.owner !== undefined,
          )
        ) {
          issue(
            out,
            `${path}.filter`,
            'the card discarded is read where it went: the filter names no zone, controller or owner',
          );
        }
      }
      break;
    case 'entersBatch':
      // D-218: one or more permanents that `what` names enter together: a filter of battlefield permanents, as they enter.
      checkFilter(t.what, `${path}.what`, out);
      if (
        filterSome(
          t.what,
          (f) =>
            f.zone !== undefined ||
            f.owner !== undefined ||
            f.stackKind !== undefined ||
            readsCombatOrSource(f),
        )
      ) {
        issue(
          out,
          `${path}.what`,
          'the permanents that enter are on the battlefield: no zone, stackKind or combat',
        );
      }
      break;
    case 'leftGraveyard':
    case 'exiledFromLibraryOrGraveyard':
      // D-229: the cards of the controller's own graveyard (and library): `who` is "you".
      if (!isOneOf(t.who, ['you'])) issue(out, `${path}.who`, `unknown player ${String(t.who)}`);
      break;
    case 'diesBatch':
      // D-206: one or more permanents that `what` names die together: a filter of battlefield permanents, as they were.
      checkFilter(t.what, `${path}.what`, out);
      if (
        filterSome(
          t.what,
          (f) => f.zone !== undefined || f.owner !== undefined || f.stackKind !== undefined,
        )
      ) {
        issue(
          out,
          `${path}.what`,
          'the permanents that die were on the battlefield: no zone, owner or stackKind',
        );
      }
      break;
    case 'permanentSacrificed':
      if (!isOneOf(t.by, ['you', 'any'])) {
        issue(out, `${path}.by`, `unknown sacrificing player ${String(t.by)}`);
      }
      if (t.filter !== undefined) checkFilter(t.filter, `${path}.filter`, out);
      break;
    case 'upkeep':
    case 'endStep':
      if (!isOneOf(t.whose, ['you', 'each'])) {
        issue(out, `${path}.whose`, `unknown turn owner ${String(t.whose)}`);
      }
      break;
    case 'step':
      if (!isOneOf(t.step, TRIGGER_STEPS)) {
        issue(out, `${path}.step`, `unknown step ${String(t.step)}`);
      }
      if (!isOneOf(t.whose, ['you', 'each', 'opponent'])) {
        issue(out, `${path}.whose`, `unknown turn owner ${String(t.whose)}`);
      }
      break;
    case 'drawn':
      if (!isOneOf(t.who, ['you', 'opponent', 'any'])) {
        issue(out, `${path}.who`, `unknown player ${String(t.who)}`);
      }
      // CR 121.1: "your second card each turn": the nth card drawn, counting from 1.
      if (t.nth !== undefined && (!isCount(t.nth) || t.nth < 1)) {
        issue(out, `${path}.nth`, 'nth must be a positive integer');
      }
      break;
    case 'dealsCombatDamage':
      checkTriggerSubject(t.what, true, `${path}.what`, out);
      if (!isOneOf(t.to, ['player', 'opponent', 'creature', 'any', 'playerOrPlaneswalker'])) {
        issue(out, `${path}.to`, `unknown recipient ${String(t.to)}`);
      }
      if (t.filter !== undefined) {
        checkFilter(t.filter, `${path}.filter`, out);
        if (t.to !== 'creature') {
          issue(out, `${path}.filter`, "a recipient filter only goes with to: 'creature'");
        }
      }
      break;
    case 'noncombatDamageDealt':
      // D-333: whose source it is and which player it damaged; any object can be the source, so there is no subject to check.
      if (!isOneOf(t.by, ['you', 'any'])) {
        issue(out, `${path}.by`, `unknown source controller ${String(t.by)}`);
      }
      if (!isOneOf(t.to, ['opponent', 'player'])) {
        issue(out, `${path}.to`, `unknown recipient ${String(t.to)}`);
      }
      break;
    case 'leavesBattlefield':
      checkTriggerSubject(t.what, true, `${path}.what`, out);
      // CR 603.6c: where it went; a permanent leaves the battlefield for any other zone.
      if (t.to !== undefined) {
        // D-135: one zone, or a list of two or more ("dies or is put into exile from the battlefield").
        const zones: readonly unknown[] =
          typeof t.to === 'string' ? [t.to] : Array.isArray(t.to) ? t.to : [];
        if (typeof t.to !== 'string' && (!Array.isArray(t.to) || t.to.length < 2)) {
          issue(out, `${path}.to`, 'to is a zone, or a list of at least two zones');
        }
        if (Array.isArray(t.to) && new Set(t.to).size !== t.to.length) {
          issue(out, `${path}.to`, 'a zone is listed once');
        }
        for (const zone of zones) {
          if (!isOneOf(zone, ZONES) || zone === 'battlefield' || zone === 'stack') {
            issue(
              out,
              `${path}.to`,
              `a permanent cannot leave the battlefield for ${JSON.stringify(zone)}`,
            );
          }
        }
      }
      break;
    default:
      // D-149: life gained, counters put on a permanent and a batch of attackers.
      if (!checkAngelsTrigger(t, path, out)) {
        issue(out, path, `unknown trigger ${kindOf(t)}`);
      }
  }
}

/**
 * The permanent a trigger names (D-111): `this`, the permanent the source is attached to
 * (`attached`, not for an enters trigger: a permanent cannot be attached as it enters), or a filter.
 */
function checkTriggerSubject(
  what: unknown,
  allowAttached: boolean,
  path: string,
  out: AstIssue[],
): void {
  const kind = kindOf(what);
  if (kind === 'this') return;
  if (kind === 'attached') {
    if (!allowAttached) issue(out, path, "'attached' is not a subject an enters trigger can have");
    return;
  }
  checkFilter(what as never, path, out);
}

/**
 * Whether the trigger's event has an amount that "that much" or "that many" can mean (`triggerDamage`): the damage dealt (D-133) or the life
 * gained (D-256, CR 119.9).
 */
function hasDamage(t: Trigger): boolean {
  return (
    t?.kind === 'dealtDamage' ||
    t?.kind === 'dealsCombatDamage' ||
    t?.kind === 'noncombatDamageDealt' ||
    t?.kind === 'lifeGained'
  );
}

/** Whether the effect, or one of a sequence or a "may" inside it, adds mana (D-189). */
function addsMana(e: Effect | undefined): boolean {
  if (e === undefined) return false;
  if (e.kind === 'addMana') return true;
  if (e.kind === 'sequence') return e.effects.some(addsMana);
  if (e.kind === 'may') return addsMana(e.effect);
  return false;
}

/** What `triggerSubject` is for a trigger (see `Scope.triggerSubject`); none for the step triggers. */
function subjectOf(t: Trigger): 'permanent' | 'stack' | undefined {
  switch (t?.kind) {
    case 'entersBattlefield':
    case 'dies':
    case 'attacks':
    case 'becomesTapped':
    case 'becomesUntapped':
    case 'blocks':
    case 'becomesBlocked':
    case 'landfall':
    case 'diesBatch':
    case 'entersBatch':
    case 'discarded':
    case 'permanentSacrificed':
    case 'dealsCombatDamage':
    case 'dealtDamage':
    case 'leavesBattlefield':
    case 'countersAdded':
    case 'tapsForMana':
      return 'permanent';
    case 'castSpell':
    case 'becomesTarget':
      return 'stack';
    default:
      return undefined;
  }
}

// ---- Abilities (CR 113)

/** "At the beginning of your upkeep" (CR 503.1): the `upkeep` kind, or the `step` kind of the upkeep, of `you`. */
function isOwnUpkeep(t: Trigger | undefined): boolean {
  if (t?.kind === 'upkeep') return t.whose === 'you';
  return t?.kind === 'step' && t.step === 'upkeep' && t.whose === 'you';
}

/** Whether the condition holds a term of the kind, at any depth. */
function conditionHas(c: unknown, kind: string): boolean {
  const k = c as { kind?: string; terms?: unknown[]; term?: unknown } | null;
  if (k?.kind === kind) return true;
  if (Array.isArray(k?.terms)) return k.terms.some((t) => conditionHas(t, kind));
  return k?.term !== undefined && conditionHas(k.term, kind);
}

/** Whether the effect is, or contains at any depth, a node of the kind. */
function effectHas(e: unknown, kind: string): boolean {
  return JSON.stringify(e ?? null).includes(`"kind":"${kind}"`);
}

/** The mana cost of the face as a cost and its additional costs: where a spell can have an X. */
function spellCosts(face: CardFace): readonly Cost[] {
  const mana: readonly Cost[] =
    face.manaCost === null ? [] : [{ kind: 'mana', symbols: face.manaCost }];
  return [...mana, ...(face.additionalCosts ?? [])];
}

/** An {X} in a mana cost or "pay X life": a value the player announces (CR 107.3a, D-103). */
function hasXCost(
  costs: readonly { kind: string; symbols?: readonly string[]; change?: unknown }[],
): boolean {
  return costs.some(
    (c) =>
      c.kind === 'payXLife' ||
      c.kind === 'discardX' ||
      (c.kind === 'mana' && (c.symbols ?? []).includes('X')) ||
      // D-200: the X of "[-X]".
      (c.kind === 'loyalty' && c.change === 'x'),
  );
}

/**
 * Costs that only make sense in one zone (CR 602.2, 113.6b): "discard this card" needs the source
 * in the hand, and an ability that functions from the hand or the graveyard (Unearth, D-124) cannot tap,
 * sacrifice or remove counters from a card that is not on the battlefield.
 */
function checkActivationCosts(
  a: Extract<Ability, { kind: 'activated' }>,
  path: string,
  out: AstIssue[],
): void {
  if (!Array.isArray(a.cost)) return;
  const fromHand = a.functionsIn === 'hand';
  const offBattlefield = fromHand || a.functionsIn === 'graveyard';
  a.cost.forEach((c, i) => {
    const kind = c?.kind;
    if (kind === 'discardThis' && !fromHand) {
      issue(out, `${path}.cost[${i}]`, "discardThis needs functionsIn: 'hand'");
    }
    // D-185: "Exile this card from your graveyard" is paid from the graveyard.
    if (kind === 'exileThis' && a.functionsIn === 'hand') {
      issue(
        out,
        `${path}.cost[${i}]`,
        'exileThis is paid from the graveyard or the battlefield, not the hand',
      );
    }
    const needsBattlefield =
      kind === 'tap' ||
      kind === 'untap' ||
      kind === 'removeCounters' ||
      kind === 'loyalty' ||
      kind === 'putCounters' ||
      kind === 'returnToHand' ||
      kind === 'sacrifice' ||
      kind === 'discard' ||
      kind === 'tapCreatures';
    if (offBattlefield && needsBattlefield) {
      issue(
        out,
        `${path}.cost[${i}]`,
        `an ability that functions from the ${a.functionsIn} cannot cost ${kind}`,
      );
    }
  });
}

/**
 * CR 606 (D-200): an activated ability with a loyalty symbol in its cost is a loyalty ability. It has one symbol, works on the
 * battlefield, and has no `oncePerTurn` of its own (CR 606.3 limits every loyalty ability of a permanent to one a turn); it is
 * activated at sorcery timing whatever `timing` says. Where it may stand (a planeswalker) is checked with the face or the token.
 */
function checkLoyaltyAbility(
  a: Extract<Ability, { kind: 'activated' }>,
  path: string,
  out: AstIssue[],
): void {
  if (!Array.isArray(a.cost)) return;
  const symbols = a.cost.filter((c) => c?.kind === 'loyalty').length;
  if (symbols === 0) return;
  if (symbols > 1)
    issue(out, `${path}.cost`, 'a loyalty ability has one loyalty symbol in its cost');
  if (a.oncePerTurn !== undefined) {
    issue(out, `${path}.oncePerTurn`, 'a loyalty ability is limited by CR 606.3: no oncePerTurn');
  }
  if (a.functionsIn !== undefined && a.functionsIn !== 'battlefield') {
    issue(out, `${path}.functionsIn`, 'a loyalty ability works on the battlefield');
  }
  if (a.timing === 'instant') {
    issue(out, `${path}.timing`, 'a loyalty ability is activated at sorcery timing (CR 606.3)');
  }
}

/**
 * D-287 (CR 702.95b, 400.7, 603.4, 608.2h): `paired` reads the pair of the permanent on the battlefield now (`partnerOf` of the object table; nothing of the
 * last-known information). It is exact in one place only: the "as long as" condition of a static ability of a permanent on the battlefield, which `derive` reads
 * while the permanent is there. In any other ability the source can be gone when the condition is read: a triggered ability's source may die to a response between the
 * event and the resolution (CR 603.4 checks the intervening "if" again, 608.2h reads what left with its last-known information, which was paired) and an activated
 * ability's cost may remove it; a replacement effect or a delayed trigger works with no permanent at all. The engine's own soulbond abilities read `soulbondReady`.
 * The card is refused, never accepted with a condition that would be false for the wrong reason.
 */
function checkPairedPlacement(a: Ability, path: string, out: AstIssue[]): void {
  const refuse = (): void =>
    issue(
      out,
      path,
      '\'paired\' is valid only as the "as long as" condition of a static ability of a permanent on the battlefield: anywhere else the permanent may have left when it is read (CR 400.7, 603.4, 608.2h)',
    );
  switch (a?.kind) {
    case 'static':
      // The condition of the ability itself; the payload (a granted ability, a nested condition) and a card in the graveyard have no place for it.
      if (effectHas([a.static], 'paired')) refuse();
      else if (a.functionsIn === 'graveyard' && conditionHas(a.condition, 'paired')) refuse();
      return;
    case 'triggered':
    case 'activated':
    case 'mana':
    case 'replacement':
      if (effectHas([a], 'paired')) refuse();
      return;
    default:
      return;
  }
}

function checkAbility(a: Ability, path: string, out: AstIssue[]): void {
  checkPairedPlacement(a, path, out);
  switch (a?.kind) {
    case 'keyword':
      checkKeyword(a.keyword, `${path}.keyword`, out);
      break;
    case 'replacement':
      checkReplacement(a.replacement, `${path}.replacement`, out);
      break;
    case 'level':
      // CR 716.2a (D-235): the abilities a class level bar adds from level `level` on: two or more of them is not a thing, a nested bar is not either.
      if (!Number.isSafeInteger(a.level) || a.level < 2) {
        issue(out, `${path}.level`, 'the level of a class level bar is a whole number from 2');
      }
      if (!Array.isArray(a.abilities) || a.abilities.length === 0) {
        issue(out, `${path}.abilities`, 'a class level bar adds at least one ability');
      } else {
        a.abilities.forEach((inner, i) => {
          if (inner?.kind === 'level') {
            issue(out, `${path}.abilities[${i}]`, 'a class level bar does not hold another one');
          } else {
            checkAbility(inner, `${path}.abilities[${i}]`, out);
          }
        });
      }
      break;
    case 'static':
      checkStatic(a.static, `${path}.static`, out);
      checkStaticCondition(a.static, a.condition, path, out);
      checkGraveyardAbility(a, path, out);
      // D-149: without a condition "you can't cast ~" would hold for ever.
      if (a.static?.kind === 'cantCastThis' && a.condition === undefined) {
        issue(out, `${path}.condition`, 'cantCastThis needs the condition that says when');
      }
      break;
    case 'triggered': {
      checkTrigger(a.trigger, `${path}.trigger`, out);
      checkGraveyardAbility(a, path, out);
      const targets = declareTargets(a.targets, `${path}.targets`, out, false, false, true);
      // D-270: a slot of two zones (the battlefield and graveyards) is named only by an `exile` of it, in an ability with no modes.
      checkCrossZoneSlots(
        a,
        a.effect,
        a.modes !== undefined || a.chooseModes !== undefined,
        path,
        out,
      );
      const subject = subjectOf(a.trigger);
      const selfCast = a.trigger?.kind === 'castSpell' && a.trigger.self === true;
      const scopeOf = (declared: Scope['targets']): Scope => ({
        owner: 'ability',
        targets: declared,
        xAllowed: false,
        ...(subject === undefined ? {} : { triggerSubject: subject }),
        // D-232: "from among those cards" is read where the trigger is about the cards that left a graveyard.
        ...(a.trigger.kind === 'leftGraveyard' ? { triggerCards: true } : {}),
        ...(triggerHasPlayer(a.trigger) ? { triggerPlayer: true } : {}),
        ...(hasDamage(a.trigger) ? { triggerDamage: true } : {}),
        ...(a.trigger?.kind === 'attackBatch' ? { triggerAttacked: true } : {}),
        ...(a.trigger?.kind === 'attacks' ? { attackTrigger: true } : {}),
        ...(mentionsCondition(a.interveningIf, 'yourMainPhase') ? { mainPhaseTrigger: true } : {}),
        ...(a.trigger?.kind === 'step' && a.trigger.step === 'main2'
          ? { postcombatMainTrigger: true }
          : {}),
        ...(selfCast ? { selfCast: true } : {}),
        ...(a.trigger?.kind === 'dies' ? { diesTrigger: true } : {}),
        ...HOOKS,
      });
      if (a.modes !== undefined || a.chooseModes !== undefined) {
        // CR 603.3c, 700.2b (D-114): a modal triggered ability.
        checkModalAbilityShell(a.effect, a.targets, path, out);
        checkModes(a.modes, a.chooseModes, path, scopeOf, out, true);
      } else {
        checkEffect(a.effect, `${path}.effect`, scopeOf(targets), out);
      }
      if (a.optional !== undefined && typeof a.optional !== 'boolean') {
        issue(out, `${path}.optional`, 'optional must be a boolean');
      }
      // D-256 (CR 603.2h): "Do this only once each turn."
      if (a.doOnlyOnceEachTurn !== undefined) {
        if (a.doOnlyOnceEachTurn !== true) {
          issue(out, `${path}.doOnlyOnceEachTurn`, 'doOnlyOnceEachTurn must be true');
        }
        if (a.oncePerTurn !== undefined) {
          issue(
            out,
            `${path}.doOnlyOnceEachTurn`,
            'oncePerTurn and doOnlyOnceEachTurn are two different limits (CR 603.2, 603.2h): one of them',
          );
        }
        if (a.trigger?.kind === 'state' || a.trigger?.kind === 'tappedForMana') {
          issue(
            out,
            `${path}.doOnlyOnceEachTurn`,
            'a state trigger and a triggered mana ability have their own rules: no doOnlyOnceEachTurn',
          );
        }
        // CR 603.2h: the action is "taken" when the player does what is asked. A choice inside the effect
        // (a `may`, a payment of any amount) is not the ability's own `optional`, so the engine would count
        // a declined or zero payment as taken: refused, never guessed (D-256).
        if (a.optional !== true && hasPlayerChoiceStep(a.effect)) {
          issue(
            out,
            `${path}.doOnlyOnceEachTurn`,
            'doOnlyOnceEachTurn with a choice inside the effect (may, payAnyAmount) needs the ability to be optional',
          );
        }
      }
      // D-149: "This ability triggers only once each turn."
      if (a.oncePerTurn !== undefined) {
        if (a.oncePerTurn !== true) issue(out, `${path}.oncePerTurn`, 'oncePerTurn must be true');
        if (a.trigger?.kind === 'state' || a.trigger?.kind === 'tappedForMana') {
          issue(
            out,
            `${path}.oncePerTurn`,
            'a state trigger and a triggered mana ability have their own rules: no oncePerTurn',
          );
        }
      }
      // CR 605.1b (D-139): a triggered mana ability adds fixed mana at once, with nothing to choose.
      if (a.trigger?.kind === 'tappedForMana') {
        const plain =
          a.effect?.kind === 'addMana' &&
          a.effect.mana?.kind === 'fixed' &&
          a.targets === undefined &&
          a.modes === undefined &&
          a.optional !== true &&
          a.interveningIf === undefined;
        if (!plain) {
          issue(
            out,
            path,
            'an ability that triggers when a permanent is tapped for mana is a triggered mana ability (CR 605.1b): it only adds fixed mana, with no target, mode, "may" or intervening "if"',
          );
        }
      }
      // CR 605.1b (D-189): a triggered ability that adds mana and triggers from tapping a permanent for mana is a mana ability, which is
      // `tappedForMana`; `tapsForMana` is the ability that uses the stack, so its effect makes no mana.
      if (a.trigger?.kind === 'tapsForMana' && addsMana(a.effect)) {
        issue(
          out,
          `${path}.effect`,
          'an ability that adds mana when a permanent is tapped for mana is a triggered mana ability (CR 605.1b): use tappedForMana',
        );
      }
      // CR 603.4: the intervening "if" is an ordinary condition, checked twice by the engine.
      if (a.interveningIf !== undefined) {
        checkCondition(a.interveningIf, `${path}.interveningIf`, out);
        // D-120: Evolve's comparison reads the creature that entered, so only an enters trigger has one.
        if (
          conditionHas(a.interveningIf, 'subjectControllerHasMore') &&
          subjectOf(a.trigger) !== 'permanent'
        ) {
          issue(
            out,
            `${path}.interveningIf`,
            'subjectControllerHasMore reads the controller of a permanent the event is about',
          );
        }
        if (conditionHas(a.interveningIf, 'triggerPlayerHasMore') && !triggerHasPlayer(a.trigger)) {
          issue(
            out,
            `${path}.interveningIf`,
            'triggerPlayerHasMore reads the player the event is about: it needs a trigger whose event is about a player',
          );
        }
        if (
          conditionHas(a.interveningIf, 'subjectGreaterPt') &&
          a.trigger?.kind !== 'entersBattlefield'
        ) {
          issue(
            out,
            `${path}.interveningIf`,
            'subjectGreaterPt compares the creature that entered: it needs an entersBattlefield trigger',
          );
        }
      }
      // D-271: "if this card is in your graveyard" is true only for an ability that works there, which the ability must say (CR 113.6b).
      if (
        (conditionHas(a.interveningIf, 'thisInYourGraveyard') ||
          conditionHas(a.triggerCondition, 'thisInYourGraveyard')) &&
        a.functionsIn !== 'graveyard'
      ) {
        issue(
          out,
          `${path}.interveningIf`,
          "thisInYourGraveyard needs functionsIn: 'graveyard': an ability that works on the battlefield has its card there",
        );
      }
      // D-145: "attacks while you don't control another Dinosaur": the condition of the event itself, read once.
      if (a.triggerCondition !== undefined) {
        checkCondition(a.triggerCondition, `${path}.triggerCondition`, out);
        if (a.trigger?.kind === 'state') {
          issue(
            out,
            `${path}.triggerCondition`,
            'a state trigger is its condition (CR 603.8): it has no further condition of the event',
          );
        }
        if (conditionHas(a.triggerCondition, 'subjectControllerHasMore')) {
          issue(
            out,
            `${path}.triggerCondition`,
            'subjectControllerHasMore is read as an intervening "if"',
          );
        }
        if (conditionHas(a.triggerCondition, 'triggerPlayerHasMore')) {
          issue(
            out,
            `${path}.triggerCondition`,
            'triggerPlayerHasMore is read as an intervening "if"',
          );
        }
        if (conditionHas(a.triggerCondition, 'subjectGreaterPt')) {
          issue(out, `${path}.triggerCondition`, 'subjectGreaterPt is read as an intervening "if"');
        }
      }
      // D-127: Echo's condition reads the controller's own upkeep, so only "at the beginning of your upkeep" has it.
      if (
        a.interveningIf !== undefined &&
        conditionHas(a.interveningIf, 'cameUnderControlSinceLastUpkeep') &&
        !isOwnUpkeep(a.trigger)
      ) {
        issue(
          out,
          `${path}.interveningIf`,
          'cameUnderControlSinceLastUpkeep needs a trigger at the beginning of your upkeep',
        );
      }
      // D-129: the replicate effect is the effect of "When you cast this spell" (CR 702.56a) and nothing else.
      if (effectHas(a.effect, 'replicate')) {
        const own = a.trigger?.kind === 'castSpell' && a.trigger.self === true;
        if (!own || a.effect?.kind !== 'replicate') {
          issue(
            out,
            `${path}.effect`,
            'replicate is the whole effect of a "when you cast this spell" ability',
          );
        }
      }
      // D-129: the storm effect is the effect of "When you cast this spell" (CR 702.40a) and nothing else.
      if (effectHas(a.effect, 'storm')) {
        const own = a.trigger?.kind === 'castSpell' && a.trigger.self === true;
        if (!own || a.effect?.kind !== 'storm') {
          issue(
            out,
            `${path}.effect`,
            'storm is the whole effect of a "when you cast this spell" ability',
          );
        }
      }
      // D-120: the cascade effect is the effect of "When you cast this spell" (CR 702.85a) and nothing else.
      if (effectHas(a.effect, 'cascade')) {
        const own = a.trigger?.kind === 'castSpell' && a.trigger.self === true;
        if (!own || a.effect?.kind !== 'cascade') {
          issue(
            out,
            `${path}.effect`,
            'cascade is the whole effect of a "when you cast this spell" ability',
          );
        }
      }
      break;
    }
    case 'activated': {
      checkCosts(a.cost, `${path}.cost`, out);
      if (a.timing !== undefined && !isOneOf(a.timing, ['instant', 'sorcery'])) {
        issue(out, `${path}.timing`, `unknown timing ${String(a.timing)}`);
      }
      if (
        a.functionsIn !== undefined &&
        !isOneOf(a.functionsIn, ['battlefield', 'hand', 'graveyard'])
      ) {
        issue(out, `${path}.functionsIn`, `unknown zone ${String(a.functionsIn)}`);
      }
      checkActivationCosts(a, path, out);
      checkLoyaltyAbility(a, path, out);
      if (a.activateOnlyIf !== undefined) {
        checkCondition(a.activateOnlyIf, `${path}.activateOnlyIf`, out);
      }
      // D-135: "This ability costs {4} less to activate if ...": a positive reduction of the generic mana of a mana cost.
      if (a.costReducedIf !== undefined) {
        const reduced = a.costReducedIf;
        if (!Number.isSafeInteger(reduced.generic) || reduced.generic < 1) {
          issue(out, `${path}.costReducedIf.generic`, 'the reduction is a positive whole number');
        }
        checkCondition(reduced.condition, `${path}.costReducedIf.condition`, out);
        if (!Array.isArray(a.cost) || !a.cost.some((c) => c?.kind === 'mana')) {
          issue(out, `${path}.costReducedIf`, 'only a mana cost can be reduced');
        }
      }
      // D-139: "This ability costs {1} less to activate for each ...": an amount that reads the game as it is activated.
      if (a.costReducedBy !== undefined) {
        checkStateAmount(
          a.costReducedBy.amount,
          `${path}.costReducedBy.amount`,
          out,
          'a cost reduction',
        );
        if (!Array.isArray(a.cost) || !a.cost.some((c) => c?.kind === 'mana')) {
          issue(out, `${path}.costReducedBy`, 'only a mana cost can be reduced');
        }
      }
      const targets = declareTargets(a.targets, `${path}.targets`, out);
      const scopeOf = (declared: Scope['targets']): Scope => ({
        owner: 'ability',
        targets: declared,
        xAllowed: Array.isArray(a.cost) && hasXCost(a.cost),
        ...(a.functionsIn === 'graveyard' ? { fromGraveyard: true } : {}),
        // D-133: "the sacrificed creature" is readable where the cost sacrificed something.
        ...(Array.isArray(a.cost) && a.cost.some((c) => c?.kind === 'sacrifice')
          ? { sacrificedCost: true }
          : {}),
        // D-232: "the exiled cards" are readable where the cost exiled cards from the graveyard.
        ...(Array.isArray(a.cost) && a.cost.some((c) => c?.kind === 'exileFromGraveyard')
          ? { exiledCost: true }
          : {}),
        ...HOOKS,
      });
      if (a.modes !== undefined || a.chooseModes !== undefined) {
        // CR 602.2b, 700.2a (D-114): a modal activated ability.
        checkModalAbilityShell(a.effect, a.targets, path, out);
        checkModes(a.modes, a.chooseModes, path, scopeOf, out);
      } else {
        checkEffect(a.effect, `${path}.effect`, scopeOf(targets), out);
      }
      // CR 605.1a: an activated ability that has no target and could add mana is a mana ability, unless it is a loyalty ability
      // (CR 606.2: Chandra's "+1: Add {R}{R}" is activated and uses the stack).
      if (
        a.effect?.kind === 'addMana' &&
        targets.size === 0 &&
        !(Array.isArray(a.cost) && a.cost.some((c) => c?.kind === 'loyalty'))
      ) {
        issue(
          out,
          path,
          "an activated ability with no target that adds mana must be kind 'mana' (CR 605.1a)",
        );
      }
      break;
    }
    case 'mana':
      checkManaAbility(a, path, out);
      break;
    default:
      issue(out, path, `unknown ability ${kindOf(a)}`);
  }
}

/** What a `Scope` needs from this file: validating a nested ability, and a continuous effect. */
const HOOKS = {
  checkAbility,
  checkContinuous: checkContinuousEffect,
  checkEffectExt: checkDragonsEffect,
};

/** True if the effect, or a step of a top-level sequence, is a `may` or a `payAnyAmount` (a choice of the player inside the effect). */
function hasPlayerChoiceStep(effect: Effect): boolean {
  if (effect.kind === 'may' || effect.kind === 'payAnyAmount') return true;
  if (effect.kind === 'sequence') return effect.effects.some(hasPlayerChoiceStep);
  return false;
}

export function validateAbility(a: Ability): AstIssue[] {
  const out: AstIssue[] = [];
  checkAbility(a, 'ability', out);
  return out;
}

// ---- Spell text (CR 608)

function checkSpellText(s: SpellText, path: string, out: AstIssue[]): void {
  const xAllowed = s.x === true;
  const hasModes = s.modes !== undefined;
  if (s.x !== undefined && typeof s.x !== 'boolean') issue(out, `${path}.x`, 'x must be a boolean');

  if (hasModes) {
    if (s.effect !== undefined) {
      issue(out, `${path}.effect`, 'a modal spell puts its effects in the modes, not in effect');
    }
    if (s.targets !== undefined) {
      issue(out, `${path}.targets`, 'a modal spell declares targets on each mode');
    }
    checkModes(
      s.modes,
      s.chooseModes,
      path,
      (targets) => ({ owner: 'spell', targets, xAllowed, ...HOOKS }),
      out,
    );
    return;
  }

  if (s.chooseModes !== undefined) {
    issue(out, `${path}.chooseModes`, 'chooseModes without modes');
  }
  const targets = declareTargets(s.targets, `${path}.targets`, out, true, false, false, true);
  // D-386: X targets read the X announced for the spell: the text must say it has one.
  if (!xAllowed && (s.targets ?? []).some((t) => t.countX === true)) {
    issue(out, `${path}.x`, 'X targets need x: true (the spell announces an X)');
  }
  if (s.effect !== undefined) {
    checkEffect(s.effect, `${path}.effect`, { owner: 'spell', targets, xAllowed, ...HOOKS }, out);
  } else if (targets.size > 0) {
    issue(out, `${path}.targets`, 'targets are declared but there is no effect to use them');
  }
}

/** A spell's resolution effect exists: either `effect`, or modes that each carry one. */
function spellHasEffect(s: SpellText | null): boolean {
  return s !== null && (s.effect !== undefined || (s.modes !== undefined && s.modes.length > 0));
}

// ---- Faces and cards

function checkFace(face: CardFace, path: string, supported: boolean, out: AstIssue[]): void {
  if (typeof face.name !== 'string' || face.name === '')
    issue(out, `${path}.name`, 'name is empty');

  if (face.manaCost !== null) {
    if (!Array.isArray(face.manaCost) || face.manaCost.length === 0) {
      issue(out, `${path}.manaCost`, 'use null for "no mana cost"; an empty cost is not a cost');
    } else {
      checkManaSymbols(face.manaCost, `${path}.manaCost`, out);
    }
  }

  if (!Array.isArray(face.types) || face.types.length === 0) {
    issue(out, `${path}.types`, 'a face needs at least one card type');
  } else {
    face.types.forEach((t, i) => {
      if (!isOneOf(t, CARD_TYPES))
        issue(out, `${path}.types[${i}]`, `unknown card type ${String(t)}`);
    });
  }
  face.supertypes.forEach((t, i) => {
    if (!isOneOf(t, SUPERTYPES))
      issue(out, `${path}.supertypes[${i}]`, `unknown supertype ${String(t)}`);
  });
  face.colors.forEach((c, i) => {
    if (!isOneOf(c, COLORS)) issue(out, `${path}.colors[${i}]`, `unknown color ${String(c)}`);
  });
  if (new Set(face.colors).size !== face.colors.length) {
    issue(out, `${path}.colors`, 'duplicate color');
  }

  const isCreature = face.types.includes('creature');
  for (const key of ['power', 'toughness'] as const) {
    const v = face[key];
    if (v === null) {
      if (isCreature) issue(out, `${path}.${key}`, `a creature needs ${key}`);
    } else if (v !== '*' && !Number.isSafeInteger(v)) {
      issue(out, `${path}.${key}`, `${key} must be an integer or '*'`);
    }
  }
  if (face.types.includes('planeswalker') && !isCount(face.loyalty)) {
    issue(out, `${path}.loyalty`, 'a planeswalker needs a non-negative loyalty');
  }
  if (face.types.includes('battle') && !isCount(face.defense)) {
    issue(out, `${path}.defense`, 'a battle needs a non-negative defense');
  }

  face.abilities.forEach((a, i) => {
    checkAbility(a, `${path}.abilities[${i}]`, out);
  });
  loyaltyOffPlaneswalkerIssues(face.types, face.abilities, path, out);
  // D-287: the conditions a face keeps outside its abilities (the spell itself with the choice of its modes, an alternative cost, an additional cost) are read for a card that is
  // being cast: it is not a permanent, so it is never paired.
  if (
    effectHas(
      [face.spell, face.alternativeCosts, face.additionalCosts, face.additionalCostChoice],
      'paired',
    )
  ) {
    issue(
      out,
      path,
      '\'paired\' is valid only as the "as long as" condition of a static ability of a permanent on the battlefield: a card that is cast is not a permanent',
    );
  }
  // CR 208.2, 604.3: a printed '*' is defined by a characteristic-defining ability, and only by one.
  checkStarPairing(face, face.abilities, path, out);
  checkAttachmentFace(face.abilities, face, path, out);
  checkArtifactsFace(face, path, out);
  checkDinosaursFace(face, path, out);
  checkDragonsFace(face, path, out);
  // CR 702.165a (D-230): Backup gives the abilities printed below it as they are: a static or replacement ability there would not be given, so the face is refused.
  const backupAt = face.abilities.findIndex(
    (a) => a?.kind === 'keyword' && a.keyword?.kind === 'backup',
  );
  if (
    backupAt >= 0 &&
    face.abilities
      .slice(backupAt + 1)
      .some((a) => a?.kind === 'static' || a?.kind === 'replacement')
  ) {
    issue(
      out,
      `${path}.abilities`,
      'Backup gives the keyword, triggered, activated and mana abilities printed below it; a static or replacement ability there is not given by the engine',
    );
  }
  // D-133: "You may cast this card from your graveyard": a card that is cast, once.
  const permissions = face.abilities.filter(
    (a) => a?.kind === 'static' && a.static?.kind === 'castFromGraveyard',
  ).length;
  if (permissions > 1) {
    issue(
      out,
      `${path}.abilities`,
      'castFromGraveyard once is enough: a card has one permission to be cast from its graveyard',
    );
  }
  if (permissions > 0 && face.types.includes('land')) {
    issue(
      out,
      `${path}.abilities`,
      'a land is played, not cast: it has no castFromGraveyard to give it permission for',
    );
  }
  // CR 607.2d, 614.12 (D-100): the choice a permanent makes as it enters and what reads it.
  chosenIssues(
    face.abilities,
    [face.spell, face.additionalCosts, face.alternativeCosts],
    path,
    face.types.some((t) => isPermanentType(t)),
    out,
  );
  checkCastFace(face.abilities, face.spell, face, path, out, face.alternativeCosts);
  if (face.additionalCosts !== undefined) {
    checkAdditionalCosts(face.additionalCosts, `${path}.additionalCosts`, out);
  }
  if (face.additionalCostChoice !== undefined) {
    checkAdditionalCostChoice(
      face.additionalCostChoice,
      face.additionalCosts ?? [],
      `${path}.additionalCostChoice`,
      out,
    );
    if (face.types.includes('land')) {
      issue(
        out,
        `${path}.additionalCostChoice`,
        'a land is played, not cast: it has no additional cost to choose',
      );
    }
  }
  if (face.alternativeCosts !== undefined) {
    checkAlternativeCosts(face.alternativeCosts, `${path}.alternativeCosts`, out);
  }

  if (face.spell !== null) {
    checkSpellText(face.spell, `${path}.spell`, out);
    // D-135, CR 702.174m: a target chosen only if the gift was promised is used only under that condition.
    for (const id of giftTargetsUsedUnguarded(face.spell)) {
      issue(
        out,
        `${path}.spell.targets`,
        `target "${id}" exists only if the gift was promised: use it only in the effect of a giftPromised conditional`,
      );
    }
    // D-181, CR 702.33g, 601.2c: a target chosen only if the spell was kicked (or only if it was not) is used only in that case.
    for (const id of kickedTargetsUsedOutsideTheirCase(face.spell)) {
      issue(
        out,
        `${path}.spell.targets`,
        `target "${id}" exists only if the spell was kicked (or only if it was not): use it only in the matching branch of a kicked conditional`,
      );
    }
    if (face.spell.x === true && !hasXCost(spellCosts(face))) {
      issue(out, `${path}.spell.x`, 'spell uses X but its cost has no {X} and no "pay X life"');
    }
  }
  // CR 107.3m: "enters with X counters" reads the X of the spell's mana cost; without an {X} there
  // is nothing to read (a card that is not a spell has X = 0, CR 107.3g).
  face.abilities.forEach((a, i) => {
    if (
      a?.kind === 'replacement' &&
      a.replacement?.kind === 'entersWithCounters' &&
      kindOf(a.replacement.count) === 'x' &&
      !(face.manaCost ?? []).includes('X')
    ) {
      issue(
        out,
        `${path}.abilities[${i}].replacement.count`,
        'enters with X counters but the mana cost has no {X}',
      );
    }
  });

  // CR 614.9 (D-192): a redirection deals the damage to the permanent that has it.
  redirectFaceIssues(face, path, out);

  // CR 702.29c (D-179): "When you cycle this card" triggers only when the card is discarded to pay a cycling cost, so the face needs Cycling or typecycling.
  face.abilities.forEach((a, i) => {
    if (
      a?.kind === 'triggered' &&
      a.trigger?.kind === 'cycled' &&
      !face.abilities.some(
        (k) =>
          k?.kind === 'keyword' &&
          (k.keyword?.kind === 'cycling' || k.keyword?.kind === 'typecycling'),
      )
    ) {
      issue(
        out,
        `${path}.abilities[${i}].trigger`,
        '"when you cycle this card" needs a face with Cycling or typecycling',
      );
    }
  });

  // An unsupported instant or sorcery has had its text dropped (SPEC 7.1), so only a supported
  // one must carry an effect. A supported instant or sorcery with no effect would do nothing.
  const isSpellCard = face.types.includes('instant') || face.types.includes('sorcery');
  if (supported && isSpellCard && !spellHasEffect(face.spell)) {
    issue(out, `${path}.spell`, 'an instant or sorcery must have spell text with an effect');
  }
}

const LAYOUT_FACES: Readonly<Record<string, number>> = {
  normal: 1,
  saga: 1,
  class: 1,
  split: 2,
  adventure: 2,
  transform: 2,
  modal_dfc: 2,
  prepare: 2,
  // D-277: the front face and the combined back face of the meld pair.
  meld: 2,
};

/** Structural validity only: is the AST well-formed, regardless of what the engine can execute. */
export function validateCardStructure(def: CardDefinition): AstIssue[] {
  const out: AstIssue[] = [];
  if (typeof def.name !== 'string' || def.name === '') issue(out, 'name', 'card name is empty');
  if (def.oracleId !== null && (typeof def.oracleId !== 'string' || def.oracleId === '')) {
    issue(out, 'oracleId', 'oracleId must be null or a non-empty string');
  }
  if (!isOneOf(def.support, ['supported', 'unsupported'])) {
    issue(out, 'support', `unknown support status ${String(def.support)}`);
  }
  const expected = LAYOUT_FACES[def.layout];
  if (expected === undefined) {
    issue(out, 'layout', `unknown layout ${String(def.layout)}`);
  } else if (def.faces.length !== expected) {
    issue(
      out,
      'faces',
      `layout ${def.layout} needs ${expected} face(s), found ${def.faces.length}`,
    );
  }
  def.colorIdentity.forEach((c, i) => {
    if (!isOneOf(c, COLORS)) issue(out, `colorIdentity[${i}]`, `unknown color ${String(c)}`);
  });
  if (new Set(def.colorIdentity).size !== def.colorIdentity.length) {
    issue(out, 'colorIdentity', 'duplicate color');
  }
  def.faces.forEach((face, i) => {
    checkFace(face, `faces[${i}]`, def.support === 'supported', out);
    // CR 702.94a (D-274): the reveal is read from the card's front face only (`rules/miracle.ts`, `miracleCostOf`), so a miracle
    // cost on any other face would never be offered: refused here instead of accepted and dropped without a word.
    if (i > 0 && face.alternativeCosts?.some((a) => a?.kind === 'miracle')) {
      issue(
        out,
        `faces[${i}].alternativeCosts`,
        'miracle on a face other than the front face is not supported (CR 702.94a)',
      );
    }
  });
  out.push(...layoutStructureIssues(def));
  return out;
}

/**
 * Full validation (SPEC 17.2 A7): the AST is well-formed and, for a card marked `supported`,
 * every node in it is something the engine can execute (SUPPORTED_FEATURES).
 */
export function validateCard(def: CardDefinition): AstIssue[] {
  const out = validateCardStructure(def);
  if (def.support === 'supported') out.push(...unsupportedFeatureIssues(def));
  return out;
}

/** D-187: whether the condition is, or has among its `and` terms, one of the given kind (the intervening "if" of a triggered ability). */
function mentionsCondition(condition: Condition | undefined, kind: Condition['kind']): boolean {
  if (condition === undefined) return false;
  if (condition.kind === kind) return true;
  return condition.kind === 'and' && condition.terms.some((t) => mentionsCondition(t, kind));
}
