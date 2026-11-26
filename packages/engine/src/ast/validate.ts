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
  castPhaseTargetsUsedUnguarded,
  checkCastFace,
  checkFlashbackCost,
  checkKickerCost,
  giftTargetsUsedUnguarded,
  kickedTargetsUsedOutsideTheirCase,
} from './validate-cast';
import { chosenIssues } from './validate-chosen';
import { checkContinuousEffect } from './validate-continuous';
import {
  checkAbilityCostReduction,
  checkAdditionalCostChoice,
  checkAdditionalCosts,
  checkAlternativeCosts,
  checkAttackTax,
  checkCostIncrease,
  checkCostPerExtraTarget,
  checkCostReduction,
  checkNamedAlternativeCost,
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
  readsKeywords,
  type Scope,
} from './validate-parts';
import {
  checkRedirectReplacement,
  checkRedirectStatic,
  redirectFaceIssues,
} from './validate-redirect';
import { checkAttachedIf, checkStaticCondition } from './validate-static-condition';
import { checkUmbraReplacement, umbraFaceIssues } from './validate-umbra';

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
      } else if (k.player !== undefined) {
        // Issue 159 (CR 702.5a, 702.5d): "Enchant player": a player, never a permanent, so there is nothing to describe.
        if (k.player !== true) issue(out, `${path}.player`, 'player must be true when present');
        if (Object.keys(k.filter).length > 0) {
          issue(out, `${path}.filter`, 'an Aura that enchants a player has an empty filter');
        }
      } else if (k.filter.zone === 'graveyard') {
        // CR 702.5a, 303.4a (Animate Dead): "Enchant creature card in a graveyard": the spell targets such a card, which the Aura is attached to while it stays there.
        checkFilter(k.filter, `${path}.filter`, out);
        if (k.filter.stackKind !== undefined || k.filter.controller !== undefined) {
          issue(
            out,
            `${path}.filter`,
            "a card in a graveyard is its owner's (CR 108.4a), so the filter names no controller, and is no spell",
          );
        }
        if (k.filter.putWithSource === true) {
          issue(
            out,
            `${path}.filter`,
            'only a permanent was put onto the battlefield with an Aura',
          );
        }
      } else {
        checkBattlefieldFilter(k.filter, `${path}.filter`, out);
      }
      // D-629: "Enchant player": the Aura enchants a player; the filter of permanents says nothing then.
      if (k.player !== undefined) {
        if (k.player !== true) issue(out, `${path}.player`, 'player is true when present');
        else if (k.filter !== undefined && k.filter !== null && Object.keys(k.filter).length > 0) {
          issue(out, `${path}.filter`, 'an Aura that enchants a player has an empty filter');
        }
      }
      break;
    case 'reconfigure':
      // CR 702.151a: "[Cost]: Attach this permanent to another target creature you control."
      checkCosts(k.cost, `${path}.cost`, out);
      if (Array.isArray(k.cost) && k.cost.some((c) => c?.kind === 'discardThis')) {
        issue(out, `${path}.cost`, 'discardThis is only a cost of a card in the hand');
      }
      break;
    case 'equip':
      // CR 702.6a: "[Cost]: Attach this permanent to target creature you control."
      checkCosts(k.cost, `${path}.cost`, out);
      // Gavel of the Righteous: "Equip—Pay {3} or remove a counter from ~": the other way to pay, the one cost of removing a counter from the Equipment itself.
      if (k.orCost !== undefined) {
        checkCosts(k.orCost, `${path}.orCost`, out);
        if (
          !Array.isArray(k.orCost) ||
          k.orCost.length !== 1 ||
          k.orCost.some(
            (c) =>
              c?.kind !== 'removeCounters' ||
              c.among !== undefined ||
              c.countX !== undefined ||
              c.fromOne !== undefined,
          )
        ) {
          issue(
            out,
            `${path}.orCost`,
            'the other way to pay an equip ability is the removal of counters from the Equipment itself',
          );
        }
        if (k.costReducedIf !== undefined) {
          issue(
            out,
            `${path}.orCost`,
            'an equip ability with another way to pay has no cost reduction',
          );
        }
      }
      if (Array.isArray(k.cost) && k.cost.some((c) => c?.kind === 'discardThis')) {
        issue(out, `${path}.cost`, 'discardThis is only a cost of a card in the hand');
      }
      // "Equip {2}. This ability costs {2} less to activate if ...": as `costReducedIf` of an activated ability (D-135).
      if (k.costReducedIf !== undefined) {
        const reduced = k.costReducedIf;
        if (!Number.isSafeInteger(reduced.generic) || reduced.generic < 1) {
          issue(out, `${path}.costReducedIf.generic`, 'the reduction is a positive whole number');
        }
        checkCondition(reduced.condition, `${path}.costReducedIf.condition`, out);
        if (!Array.isArray(k.cost) || !k.cost.some((c) => c?.kind === 'mana')) {
          issue(out, `${path}.costReducedIf`, 'only a mana cost can be reduced');
        }
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
    case 'station':
      // CR 702.184a: no parameters; the permanent is a station card (CR 702.184b).
      break;
    case 'kicker':
      // CR 702.33a: an additional cost, paid as the spell is cast.
      checkKickerCost(k.cost, `${path}.cost`, out, { xNotZero: k.xNotZero });
      break;
    case 'flashback':
      // CR 702.34a: an alternative cost, paid instead of the mana cost from the graveyard.
      checkFlashbackCost(k.cost, `${path}.cost`, out);
      break;
    case 'protection':
      // D-259 (CR 903.4f): "each color that's not in your commander's color identity" names no color: the engine works them out.
      if (k.from === 'colorsNotInCommanderIdentity') break;
      if (k.from === 'ringBearer') break;
      // CR 702.16a, 105.2: protection from sources of two or more colors names nothing to check.
      if (k.from === 'multicolored') break;
      // D-376 (CR 702.16a): "the chosen card type" is read from the permanent's own choice (the card must ask it, `validate-chosen.ts`); named card types are checked.
      if (k.from === 'chosenCardType') break;
      // D-652 (CR 702.16a, 607.2d): "the chosen color", and "this effect doesn't remove this Aura" as a flag; the card must ask the color (`validate-chosen.ts`).
      if (k.from === 'chosenColor') {
        if (k.exceptSource !== undefined && k.exceptSource !== true) {
          issue(out, `${path}.exceptSource`, 'exceptSource must be true when present');
        }
        break;
      }
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
      if (k.exceptSource !== undefined) {
        issue(
          out,
          `${path}.exceptSource`,
          'exceptSource is what chosenColor becomes, never written',
        );
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
      if (r.orIf !== undefined) checkCondition(r.orIf, `${path}.orIf`, out);
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
      } else if (kindOf(r.count) === 'aggregate') {
        // Towering Titan: the total of a stat over a group, read as the permanent enters.
        checkStateAmount(r.count as Amount, `${path}.count`, out, 'an enters-with count');
      } else if (kindOf(r.count) === 'diedThisTurn') {
        // Issue 101: the creatures that died this turn, read from the history as the permanent enters; no state of the game is read, so nothing more to check.
        checkStateAmount(r.count as Amount, `${path}.count`, out, 'an enters-with count');
      } else if (kindOf(r.count) === 'manaSpent') {
        // Converge (CR 105.1, 601.2h, 614.12): the mana spent on the spell the permanent entered from; the spell is the permanent itself, so it names no other.
        if ((r.count as { of?: unknown }).of !== undefined) {
          issue(
            out,
            `${path}.count.of`,
            'an enters-with count of the mana spent is the spell the permanent came from',
          );
        }
      } else if (kindOf(r.count) === 'sum') {
        // Issue 159: "for each A and each B": two or more counts, each read as the permanent enters.
        const parts = (r.count as { of?: unknown }).of;
        if (!Array.isArray(parts) || parts.length < 2) {
          issue(out, `${path}.count.of`, 'a sum of counts needs at least two counts');
        } else {
          parts.forEach((part, i) => {
            if (kindOf(part) !== 'countOf') {
              issue(out, `${path}.count.of[${i}]`, 'an enters-with sum is made of countOf amounts');
            } else {
              checkStateAmount(
                part as Amount,
                `${path}.count.of[${i}]`,
                out,
                'an enters-with count',
              );
            }
          });
        }
      } else if (kindOf(r.count) === 'x') {
        const times = (r.count as { times?: unknown }).times;
        if (times !== undefined && (!isCount(times) || times < 2)) {
          issue(out, `${path}.count.times`, 'the multiple of X is an integer of 2 or more');
        }
      } else if (kindOf(r.count) === 'countersRemovedAsEntered') {
        // Sin, Unending Cataclysm: the counters removed as it entered, times 1 (absent) or an integer of 2 or more; the face must remove them (below).
        const times = (r.count as { times?: unknown }).times;
        if (times !== undefined && (!isCount(times) || times < 2)) {
          issue(
            out,
            `${path}.count.times`,
            'the multiple of the counters removed is an integer of 2 or more',
          );
        }
      } else if (
        kindOf(r.count) !== 'x' &&
        kindOf(r.count) !== 'timesKicked' &&
        (!isCount(r.count) || r.count < 1)
      ) {
        issue(
          out,
          `${path}.count`,
          'counter count must be a positive integer, { kind: "x" }, { kind: "timesKicked" }, a countOf or a sum of them',
        );
      }
      // CR 702.138c (D-124): "escapes with" is the only conditional form; it needs an escape cost (`checkCastFace`).
      if (r.ifEscaped !== undefined && r.ifEscaped !== true) {
        issue(out, `${path}.ifEscaped`, 'ifEscaped is true or absent');
      }
      break;
    case 'asEntersRemoveCounters': {
      // CR 614.12, 122.1 (Sin, Unending Cataclysm): the permanents are on the battlefield, of any player, so the filter names neither a zone nor a controller nor an owner.
      checkFilter(r.filter, `${path}.filter`, out);
      const f = r.filter as { zone?: unknown; controller?: unknown; owner?: unknown } | undefined;
      if (f?.zone !== undefined || f?.controller !== undefined || f?.owner !== undefined) {
        issue(
          out,
          `${path}.filter`,
          'the permanents are those of the battlefield, of any player: no zone, controller or owner',
        );
      }
      break;
    }
    case 'asEntersChoose':
      // CR 614.12a (D-100): what is chosen is a creature type or a color; D-151: or a name from a list the card gives; D-376: or a card type.
      if (
        !isOneOf(r.what, [
          'creatureType',
          'color',
          'option',
          'cardType',
          'planeswalkerType',
          'lifePaid',
          'player',
          'cardName',
        ])
      ) {
        issue(out, `${path}.what`, `unknown choice ${JSON.stringify(r.what)}`);
      }
      break;
    case 'exileInsteadOfOpponentGraveyard':
      // Issue 102 (Dauthi Voidwalker): the counter the exiled card gets.
      if (typeof r.counter !== 'string' || r.counter === '') {
        issue(out, `${path}.counter`, 'counter names a kind of counter');
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
            f.attackingOrBlocking !== undefined ||
            f.blocking !== undefined ||
            f.unblocked !== undefined,
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
      // The Darkness Crystal (CR 614.1a): the life the controller gains as the creature is exiled, and the link to the card an ability reads as "exiled with ~".
      if (r.alsoGainLife !== undefined && (!isCount(r.alsoGainLife) || r.alsoGainLife < 1)) {
        issue(out, `${path}.alsoGainLife`, 'the life gained must be a positive integer');
      }
      if (r.linkExiled !== undefined && r.linkExiled !== true) {
        issue(out, `${path}.linkExiled`, 'linkExiled must be true when present');
      }
      break;
    default:
      // D-149: "If you would gain life, you gain that much life plus 1 instead."
      if (
        !checkAngelsReplacement(r, path, out) &&
        !checkDragonsReplacement(r, path, out) &&
        !checkRedirectReplacement(r, path, out) &&
        !checkUmbraReplacement(r, path, out)
      ) {
        issue(out, path, `unknown replacement ${kindOf(r)}`);
      }
  }
}

function checkStatic(s: StaticEffect, path: string, out: AstIssue[]): void {
  switch (s?.kind) {
    case 'allCreatureTypes':
      if (s.scope !== 'youControl' && s.scope !== 'youOwn') {
        issue(out, `${path}.scope`, 'scope must be youControl or youOwn');
      }
      break;
    case 'grantKeywordToHandCards':
      // Issue 104 (CR 702.29a): "Each creature card in your hand has cycling {1}{U}": only Cycling, for the cards of the controller's hand a filter names.
      if (s.keyword?.kind !== 'cycling') {
        issue(out, `${path}.keyword`, 'only cycling can be given to the cards in a hand');
      } else {
        checkKeyword(s.keyword, `${path}.keyword`, out);
      }
      checkFilter(s.what, `${path}.what`, out);
      if (
        filterSome(
          s.what,
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
          `${path}.what`,
          'the cards of a hand are named by what they are: no zone, controller, owner, stackKind or combat',
        );
      }
      break;
    case 'grantKeywordToSpells':
      // Issue 145 (CR 702.144a, 702.51a): "Creature spells you cast have demonstrate": only the keywords the engine reads from a spell as it is cast, for the spells of the permanent's
      // controller a filter names, as the spells they are on the stack (a spell the controller casts: `controller` is 'you', and nothing else says where or whose it is).
      if (
        s.keyword?.kind !== 'demonstrate' &&
        s.keyword?.kind !== 'convoke' &&
        s.keyword?.kind !== 'improvise' &&
        s.keyword?.kind !== 'cascade' &&
        s.keyword?.kind !== 'replicateAtManaCost'
      ) {
        issue(
          out,
          `${path}.keyword`,
          'only demonstrate and convoke (and improvise, cascade, replicateAtManaCost) can be given to spells',
        );
      }
      checkFilter(s.what, `${path}.what`, out);
      if (
        s.what?.controller !== 'you' ||
        filterSome(s.what, (f) => f.controller !== undefined && f.controller !== 'you')
      ) {
        issue(out, `${path}.what`, "the spells are the ones you cast: controller is 'you'");
      }
      if (
        filterSome(
          s.what,
          (f) =>
            f.zone !== undefined ||
            f.owner !== undefined ||
            f.stackKind !== undefined ||
            f.keywords !== undefined ||
            f.notKeywords !== undefined ||
            f.targetsObject !== undefined ||
            f.abilitySource !== undefined ||
            readsCombatOrSource(f),
        )
      ) {
        issue(
          out,
          `${path}.what`,
          'the spells are named by what they are: no zone, owner, stackKind, keywords, targets, combat or source',
        );
      }
      break;
    case 'grantFlashbackToGraveyardCards':
      // CR 702.34a: "Each instant and sorcery card in your graveyard has flashback": the cards of the controller's graveyard a filter names, as the cards they are.
      checkFilter(s.what, `${path}.what`, out);
      if (
        filterSome(
          s.what,
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
          `${path}.what`,
          'the cards of a graveyard are named by what they are: no zone, controller, owner, stackKind or combat',
        );
      }
      break;
    case 'grantAlternativeCostToSpells':
      // CR 702.74a, 118.9: "Elemental permanent spells you cast from your hand gain evoke {4}": only evoke with a mana cost, for the spells of the permanent's controller a filter names,
      // as the spells they are on the stack, cast from the hand.
      if (s.from !== 'hand') issue(out, `${path}.from`, 'the spells are cast from the hand');
      if (s.alt?.kind !== 'evoke') {
        issue(out, `${path}.alt`, 'only evoke can be given to spells as an alternative cost');
      } else {
        checkNamedAlternativeCost(s.alt.cost, `${path}.alt.cost`, out);
        if (Array.isArray(s.alt.cost) && s.alt.cost.length === 0) {
          issue(out, `${path}.alt.cost`, 'the granted evoke cost is a mana cost');
        }
      }
      checkFilter(s.what, `${path}.what`, out);
      if (
        s.what?.controller !== 'you' ||
        filterSome(s.what, (f) => f.controller !== undefined && f.controller !== 'you')
      ) {
        issue(out, `${path}.what`, "the spells are the ones you cast: controller is 'you'");
      }
      if (
        filterSome(
          s.what,
          (f) =>
            f.zone !== undefined ||
            f.owner !== undefined ||
            f.stackKind !== undefined ||
            f.keywords !== undefined ||
            f.notKeywords !== undefined ||
            f.targetsObject !== undefined ||
            readsCombatOrSource(f),
        )
      ) {
        issue(
          out,
          `${path}.what`,
          'the spells are named by what they are: no zone, owner, stackKind, keywords, targets, combat or source',
        );
      }
      break;
    case 'grantEnergyAlternative':
      // CR 118.9, 107.14 (issue 105): "You may pay eight {E} rather than pay the mana cost for permanent spells you cast": a whole number of one or more, for the spells of the controller.
      if (!isCount(s.energy) || (s.energy < 1 && !(s.energy === 0 && s.oncePerTurn === true))) {
        issue(
          out,
          `${path}.energy`,
          'the energy paid is a whole number of one or more (0 only for a grant once each turn: {0} is paying nothing)',
        );
      }
      if (s.from !== undefined && s.from !== 'hand' && s.from !== 'exile') {
        issue(out, `${path}.from`, "the zone the spell is cast from is 'hand' or 'exile'");
      }
      if (s.oncePerTurn !== undefined && s.oncePerTurn !== true) {
        issue(out, `${path}.oncePerTurn`, 'oncePerTurn must be true when present');
      }
      checkFilter(s.what, `${path}.what`, out);
      if (s.what?.controller !== 'you') {
        issue(out, `${path}.what`, "the spells are the ones you cast: controller is 'you'");
      }
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
          'the spells are named by what they are: no zone, owner, stackKind or combat',
        );
      }
      break;
    case 'legendRuleDoesntApply':
      // CR 704.5j: "The "legend rule" doesn't apply to Slivers you control": the permanents on the battlefield a filter names, as the permanents they are (`controller` is "you").
      if (s.what === undefined || s.what === null || typeof s.what !== 'object') {
        issue(out, `${path}.what`, 'legendRuleDoesntApply needs a filter of the permanents');
        break;
      }
      checkFilter(s.what, `${path}.what`, out);
      if (
        filterSome(
          s.what,
          (f) =>
            f.zone !== undefined ||
            f.owner !== undefined ||
            f.stackKind !== undefined ||
            (f.controller !== undefined && f.controller !== 'you') ||
            readsCombatOrSource(f),
        )
      ) {
        issue(
          out,
          `${path}.what`,
          "the permanents are named by what they are: no zone, owner, stackKind or combat, and the controller is 'you' or absent",
        );
      }
      break;
    case 'giveChosenCreatureType':
      // CR 613.1d: "Slivers you control and nontoken creatures you control are the chosen type": the permanents a filter names as they are on the battlefield (`controller` is "you").
      if (s.what === undefined || s.what === null || typeof s.what !== 'object') {
        issue(out, `${path}.what`, 'giveChosenCreatureType needs a filter of the permanents');
        break;
      }
      checkFilter(s.what, `${path}.what`, out);
      if (
        filterSome(
          s.what,
          (f) =>
            f.zone !== undefined ||
            f.owner !== undefined ||
            f.stackKind !== undefined ||
            f.chosenType !== undefined ||
            (f.controller !== undefined && f.controller !== 'you') ||
            readsCombatOrSource(f),
        )
      ) {
        issue(
          out,
          `${path}.what`,
          "the permanents are named by what they are: no zone, owner, stackKind, chosen type or combat, and the controller is 'you' or absent",
        );
      }
      if (s.alsoCardsAndSpells !== undefined && s.alsoCardsAndSpells !== true) {
        issue(out, `${path}.alsoCardsAndSpells`, 'alsoCardsAndSpells is true or absent');
      }
      break;
    case 'giveTypesToCardsOffBattlefield':
      // CR 613.1d: the cards a filter names outside the battlefield get types in addition to their own.
      if (s.what === undefined || s.what === null || typeof s.what !== 'object') {
        issue(out, `${path}.what`, 'giveTypesToCardsOffBattlefield needs a filter of the cards');
        break;
      }
      checkFilter(s.what, `${path}.what`, out);
      if (
        filterSome(
          s.what,
          (f) =>
            f.zone !== undefined ||
            f.owner !== undefined ||
            f.stackKind !== undefined ||
            (f.controller !== undefined && f.controller !== 'you') ||
            readsCombatOrSource(f),
        )
      ) {
        issue(
          out,
          `${path}.what`,
          "the cards are named by what they are: no zone, owner, stackKind or combat, and the controller is 'you' or absent",
        );
      }
      checkEnumList(out, `${path}.types`, s.types, CARD_TYPES, 'card type');
      if (
        (s.types === undefined || s.types.length === 0) &&
        (s.subtypes === undefined || s.subtypes.length === 0)
      ) {
        issue(out, path, 'giveTypesToCardsOffBattlefield names at least one type or subtype');
      }
      break;
    case 'grantUnearthToGraveyardCards':
    case 'grantEncoreToGraveyardCards':
      // CR 702.141a: "Each Sliver creature card in your graveyard has encore {X}, where X is its mana value": the cards of the controller's graveyard a filter names, as they are there.
      if (s.what === undefined || s.what === null || typeof s.what !== 'object') {
        issue(out, `${path}.what`, 'grantEncoreToGraveyardCards needs a filter of the cards');
        break;
      }
      checkFilter(s.what, `${path}.what`, out);
      if (
        filterSome(
          s.what,
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
          `${path}.what`,
          'the cards of a graveyard are named by what they are: no zone, controller, owner, stackKind or combat',
        );
      }
      // CR 702.84a: the Unearth it gives is checked as a printed one is.
      if (s.kind === 'grantUnearthToGraveyardCards') {
        checkKeyword({ kind: 'unearth', cost: s.cost }, `${path}.cost`, out);
      }
      break;
    case 'creatureOffBattlefield':
      // CR 604.3: a characteristic-defining ability of the card itself: a power and toughness (whole numbers, not negative) and at least one creature type.
      if (!isCount(s.power) || !isCount(s.toughness)) {
        issue(out, path, 'the power and toughness are whole numbers, 0 or more');
      }
      if (!Array.isArray(s.subtypes) || s.subtypes.length === 0) {
        issue(out, `${path}.subtypes`, 'name at least one creature type');
      }
      break;
    case 'noMaximumHandSize':
    case 'beginGameOnBattlefield':
      break;
    case 'lookAtTopOfLibrary':
    case 'revealTopOfLibrary':
    case 'optionalUntap':
      break;
    case 'exertOnAttack':
      if (s.unlessExertedThisTurn !== undefined && s.unlessExertedThisTurn !== true) {
        issue(out, `${path}.unlessExertedThisTurn`, 'unlessExertedThisTurn is true when present');
      }
      break;
    case 'crewSaddleBonus':
      // Galadriel group 3 (CR 702.122a): the power a creature counts more as it is tapped for a crew cost: a positive whole number.
      if (!Number.isSafeInteger(s.amount) || s.amount < 1) {
        issue(out, `${path}.amount`, 'the bonus is a positive whole number');
      }
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
    case 'cantAttackYou':
      // D-647: a filter of battlefield permanents, read for the controller of the permanent; `planeswalkers` is true when present.
      checkBattlefieldFilter(s.creatures, `${path}.creatures`, out);
      if (s.planeswalkers !== undefined && s.planeswalkers !== true) {
        issue(out, `${path}.planeswalkers`, 'planeswalkers is true or absent');
      }
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
      checkStaticSubject(s.subject, `${path}.subject`, out, true, true);
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
    case 'loseKeyword':
      // Colossus Hammer (CR 613.1f): a keyword without parameters taken from the subject.
      checkStaticSubject(s.subject, `${path}.subject`, out, true, true);
      checkGrantedKeyword(s.keyword, `${path}.keyword`, out);
      if (
        typeof s.keyword === 'object' &&
        s.keyword !== null &&
        Object.keys(s.keyword).length > 1
      ) {
        issue(out, `${path}.keyword`, 'only a keyword without parameters is taken away');
      }
      break;
    case 'restriction':
      // "Goaded creatures your opponents control can't block" (CR 701.15b): the subject may name a goaded creature.
      checkStaticSubject(s.subject, `${path}.subject`, out, false, false, true);
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
    case 'controlAttached':
      // CR 613.1b, 725.1: the permanent this one is attached to is controlled by the monarch.
      if (s.by !== 'monarch') issue(out, `${path}.by`, 'controlAttached is by the monarch');
      break;
    case 'goaded':
      // CR 701.15 (issue 201): the subject is goaded by the controller of the permanent with the ability.
      checkStaticSubject(s.subject, `${path}.subject`, out, false, false, false, true);
      break;
    case 'costReduction':
      checkCostReduction(s, path, out);
      break;
    case 'costIncrease':
      checkCostIncrease(s, path, out);
      break;
    case 'costPerExtraTarget':
      checkCostPerExtraTarget(s, path, out);
      break;
    case 'abilityCostReduction':
      checkAbilityCostReduction(s, path, out);
      break;
    case 'plotCostReduction':
      // CR 702.170a (Doc Aurlock, Grizzled Genius): the generic mana taken off a plot cost, a positive whole number.
      if (!isCount(s.amount) || s.amount < 1) {
        issue(out, `${path}.amount`, 'a plot cost reduction must be a positive integer');
      }
      break;
    case 'castFromGraveyard':
      // D-133: the face-level checks say where it may stand. D-656: its alternative cost, mana only (CR 118.9), the same as the cost of a flashback.
      // CR 702.152a: `using` names the alternative cost the permission is for: blitz only, and then the ability has no cost of its own.
      if (s.using !== undefined && (s.using !== 'blitz' || s.cost !== undefined)) {
        issue(
          out,
          `${path}.using`,
          'castFromGraveyard using is "blitz" and has no cost of its own',
        );
      }
      if (s.cost !== undefined) {
        if (!Array.isArray(s.cost) || s.cost.length === 0) {
          issue(
            out,
            `${path}.cost`,
            'the alternative cost of castFromGraveyard needs at least one cost',
          );
        } else if (s.cost.some((c) => c?.kind !== 'mana')) {
          issue(out, `${path}.cost`, 'the alternative cost of castFromGraveyard is mana only');
        } else {
          checkFlashbackCost(s.cost, `${path}.cost`, out);
        }
      }
      break;
    case 'grantAbility':
      // D-149: a group of the cost increase may name a keyword ("creatures you control with flying"): it gives no keyword, so it cannot change what it reads (CR 613.8).
      checkStaticSubject(
        s.subject,
        `${path}.subject`,
        out,
        s.ability?.kind === 'static',
        s.ability?.kind !== 'mana',
      );
      // D-099: a mana ability; D-151: an activated or a triggered ability too, held to the rules of one of the card's own.
      if (s.ability?.kind === 'mana') {
        checkManaAbility(s.ability, `${path}.ability`, out);
      } else if (s.ability?.kind === 'activated' || s.ability?.kind === 'triggered') {
        checkAbility(s.ability, `${path}.ability`, out);
        // D-560: a granted loyalty ability is activated only from a planeswalker, so it is granted to planeswalkers (CR 606.1).
        if (
          s.ability.kind === 'activated' &&
          Array.isArray(s.ability.cost) &&
          s.ability.cost.some((c) => c?.kind === 'loyalty') &&
          !(
            s.subject.kind === 'filter' &&
            filterSome(s.subject.filter, (f) => f.types?.includes('planeswalker') === true)
          )
        ) {
          issue(
            out,
            `${path}.ability.cost`,
            'a granted loyalty ability is granted to planeswalkers only',
          );
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
      } else if (s.ability?.kind === 'static' && s.ability.static?.kind === 'costIncrease') {
        // D-149 (CR 604.1, 613.1f): the one static ability a static ability gives; it has no condition and works on the battlefield.
        checkAbility(s.ability, `${path}.ability`, out);
        if (s.ability.condition !== undefined || s.ability.functionsIn !== undefined) {
          issue(
            out,
            `${path}.ability`,
            'a granted cost increase has no condition and works on the battlefield',
          );
        }
      } else if (
        s.ability?.kind === 'static' &&
        (s.ability.static?.kind === 'modifyPt' || s.ability.static?.kind === 'grantKeyword')
      ) {
        // Dancer's Chakrams (CR 604.1, 613.1f, 613.8): the one "+N/+N" or keyword a static ability gives, to a group. `derive` applies it after layer 6 in a second pass, reading
        // the group against the permanent that has the ability (`rules/granted-statics.ts`), so the group is named by what no layer changes, the amount is a number, and the
        // ability has no condition (the engine would not check it) and works on the battlefield.
        checkAbility(s.ability, `${path}.ability`, out);
        const inner = s.ability.static;
        // CR 301.5, 613.4c: "Treasures you control ... have \"Equipped creature gets +2/+0\"": the permanent the one with the ability is attached to (it is given the
        // Equipment type by another ability; attached to nothing it gives nothing).
        const attachedHost =
          inner.subject?.kind === 'attached' &&
          !('andThis' in inner.subject && inner.subject.andThis === true);
        if (attachedHost) {
          // Nothing more to check: the subject reads no characteristic.
        } else if (inner.subject?.kind !== 'filter') {
          issue(
            out,
            `${path}.ability.static.subject`,
            'a granted "+N/+N" or keyword ability gives to a group of permanents (a filter subject) or to the permanent it is attached to',
          );
        } else if (
          filterSome(
            inner.subject.filter,
            (f) =>
              readsKeywords(f) ||
              f.power !== undefined ||
              f.toughness !== undefined ||
              readsCombatOrSourceBesidesCommander(f),
          )
        ) {
          issue(
            out,
            `${path}.ability.static.subject`,
            'the group a granted static ability gives to is not named by a keyword, power, toughness or combat: they are read after the layer it applies in (CR 613.8)',
          );
        }
        if (
          inner.kind === 'modifyPt' &&
          (typeof inner.power !== 'number' || typeof inner.toughness !== 'number')
        ) {
          issue(
            out,
            `${path}.ability.static`,
            'a granted "+N/+N" is a fixed number, not an amount counted on the board',
          );
        }
        if (
          inner.kind === 'grantKeyword' &&
          (inner.keyword?.kind === 'riot' ||
            (inner.keyword?.kind === 'protection' &&
              inner.keyword.from !== 'color' &&
              inner.keyword.from !== 'cardType'))
        ) {
          issue(
            out,
            `${path}.ability.static.keyword`,
            'a granted keyword is one with no choice and no source to read: not riot, and a protection only from colors or card types',
          );
        }
        if (s.ability.condition !== undefined || s.ability.functionsIn !== undefined) {
          issue(
            out,
            `${path}.ability`,
            'a granted static ability has no condition and works on the battlefield',
          );
        }
      } else {
        issue(
          out,
          `${path}.ability`,
          `a static ability can grant a mana, an activated, a triggered ability, a cost increase, a "+N/+N" or a keyword to a group, not ${kindOf(s.ability)}`,
        );
      }
      break;
    case 'setPt':
    case 'cantBeBlockedBy':
    case 'takeFromLinkedExile':
    case 'grantActivatedAbilitiesOfTopCard':
    case 'grantActivatedAbilitiesOfLinkedExile':
    case 'castAsThoughFlash':
    case 'spellsCantBeCountered':
    case 'opponentsCantCastSpells':
      checkArtifactsStatic(s, path, out);
      break;
    case 'restrictionUnless':
    case 'setColors':
    case 'loseAllAbilities':
    case 'cantActivateChosenName':
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
    } else if (!isOneOf(at, ['you', 'youOrPlaneswalkers', 'defendingYou', 'opponent'])) {
      issue(out, `${path}.at`, `unknown attack target ${JSON.stringify(at)}`);
    }
  }
  // CR 603.6a, 404.1: "enters from your graveyard" is an enters trigger from a graveyard.
  if (t?.kind === 'entersBattlefield' && t.graveyardOwner !== undefined) {
    if (t.graveyardOwner !== 'you') issue(out, `${path}.graveyardOwner`, "graveyardOwner is 'you'");
    if (t.fromGraveyard !== true) {
      issue(out, `${path}.graveyardOwner`, 'graveyardOwner needs fromGraveyard');
    }
  }
  switch (t?.kind) {
    case 'entersBattlefield':
    case 'dies':
    case 'attacks':
    case 'becomesTapped':
    case 'becomesUntapped':
    case 'becomesMonstrous':
    case 'turnedFaceUp':
    case 'blocks':
    case 'becomesBlocked':
    case 'becomesUnblocked':
    case 'becomesBlockedBy':
      checkTriggerSubject(t.what, t.kind !== 'entersBattlefield', `${path}.what`, out);
      // CR 509.3d (Flanking): the filter the blocking creature must match, on the battlefield, no zone, owner or combat.
      if (t.kind === 'becomesBlockedBy') {
        checkFilter(t.by, `${path}.by`, out);
        if (
          filterSome(
            t.by,
            (f) =>
              f.zone !== undefined ||
              f.owner !== undefined ||
              f.stackKind !== undefined ||
              readsCombatOrSource(f),
          )
        ) {
          issue(
            out,
            `${path}.by`,
            'the creature that blocks is on the battlefield: no zone, owner, stackKind or combat',
          );
        }
      }
      if (t.kind === 'becomesTapped') checkBecomesTapped(t, path, out);
      // D-135: "enters untapped" / "enters tapped" belongs to the enters trigger.
      if (
        t.kind === 'entersBattlefield' &&
        t.tapped !== undefined &&
        typeof t.tapped !== 'boolean'
      ) {
        issue(out, `${path}.tapped`, 'tapped must be a boolean when present');
      }
      // Issue 102 (River Kelpie): "enters from a graveyard" belongs to the enters trigger.
      if (
        t.kind === 'entersBattlefield' &&
        t.fromGraveyard !== undefined &&
        t.fromGraveyard !== true
      ) {
        issue(out, `${path}.fromGraveyard`, 'fromGraveyard must be true when present');
      }
      // Exit from Exile deck (Faldorn): "enters from exile" belongs to the enters trigger and excludes "from a graveyard".
      if (t.kind === 'entersBattlefield' && t.fromExile !== undefined) {
        if (t.fromExile !== true)
          issue(out, `${path}.fromExile`, 'fromExile must be true when present');
        if (t.fromGraveyard === true) {
          issue(out, `${path}.fromExile`, 'fromExile and fromGraveyard name two different zones');
        }
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
      if (t.noncombat !== undefined && t.noncombat !== true) {
        issue(out, `${path}.noncombat`, 'noncombat must be true when present');
      }
      if (t.combat === true && t.noncombat === true) {
        issue(out, `${path}.noncombat`, 'noncombat does not go with combat');
      }
      if (t.excess !== undefined && t.excess !== true) {
        issue(out, `${path}.excess`, 'excess must be true when present');
      }
      break;
    case 'castSpell':
      checkFilter(t.filter, `${path}.filter`, out);
      if (!isOneOf(t.by, ['you', 'opponent', 'any', 'chosenPlayer']))
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
      // CR 601.2i: "your first instant or sorcery spell each turn": the first spell of the card types the filter names; not with `self` or `nth`.
      if (t.firstOfKind !== undefined) {
        const typed =
          (t.filter?.types?.length ?? 0) > 0 ||
          (t.filter?.notTypes?.length ?? 0) > 0 ||
          (t.filter?.anyOf?.some((m) => (m.types?.length ?? 0) > 0) ?? false);
        if (t.firstOfKind !== true) issue(out, `${path}.firstOfKind`, 'firstOfKind must be true');
        if (t.self !== undefined || t.nth !== undefined) {
          issue(out, `${path}.firstOfKind`, 'firstOfKind is not for a self trigger or with nth');
        }
        if (!typed)
          issue(
            out,
            `${path}.filter`,
            'firstOfKind names at least one card type, or one it must not have',
          );
      }
      if (t.duringTurn !== undefined && t.duringTurn !== 'opponent' && t.duringTurn !== 'you') {
        issue(out, `${path}.duringTurn`, 'unknown active player condition');
      }
      // "your first spell during each opponent's turn" (D-565) is a first spell of the controller; "during your turn" is for any cast trigger.
      if (t.duringTurn === 'opponent' && (t.nth !== 1 || t.by !== 'you')) {
        issue(out, `${path}.duringTurn`, 'opponent-turn first-spell trigger must be you and nth 1');
      }
      if (t.duringTurn !== undefined && t.self !== undefined) {
        issue(out, `${path}.duringTurn`, 'a self cast trigger has no turn condition');
      }
      break;
    case 'landfall':
      break;
    case 'playsCard':
      // CR 305.1, 601.2: at least one card type (a card has one or more); none is any card.
      if (t.minCardTypes !== undefined && (!isCount(t.minCardTypes) || t.minCardTypes < 1)) {
        issue(out, `${path}.minCardTypes`, 'minCardTypes must be a positive integer when present');
      }
      if (t.fromExile !== undefined && t.fromExile !== true) {
        issue(out, `${path}.fromExile`, 'fromExile must be true when present');
      }
      break;
    case 'dungeonCompleted':
      break;
    case 'ringTempted':
      if (t.bearerChosen !== undefined && t.bearerChosen !== true) {
        issue(out, `${path}.bearerChosen`, 'must be true when present');
      }
      break;
    case 'classLevel':
      if (!isCount(t.level) || t.level < 2) {
        issue(out, `${path}.level`, 'a Class level trigger must name a level of 2 or greater');
      }
      break;
    case 'milled':
      // CR 701.17a: a card read where it went (a graveyard), so no zone, controller or owner.
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
            'the cards milled are read in the graveyard: the filter names no zone, controller or owner',
          );
        }
      }
      if (!isOneOf(t.who, ['you', 'opponent', 'any'])) {
        issue(out, `${path}.who`, `unknown player ${String(t.who)}`);
      }
      break;
    case 'entersCausesTrigger':
      // Aboleth Spawn: the permanent that entered (a filter that names no zone) and its controller, relative to the controller of this ability.
      checkFilter(t.what, `${path}.what`, out);
      if (t.what?.zone !== undefined || t.what?.controller !== undefined) {
        issue(
          out,
          `${path}.what`,
          'the permanent that entered names no zone or controller: `who` says whose',
        );
      }
      if (!isOneOf(t.who, ['you', 'opponent', 'any'])) {
        issue(out, `${path}.who`, `unknown player ${String(t.who)}`);
      }
      break;
    case 'votingFinished':
      // CR 701.38a: "whenever players finish voting": no parameter, any vote of any spell or ability.
      break;
    case 'crimeCommitted':
    case 'tokenCreated':
    case 'activatesAbility':
    case 'scries':
    case 'surveils':
    case 'rollsHighest':
    case 'winsCoinFlip':
      // D-464, D-465, D-513: the player who commits the crime, creates the token or scries, relative to the controller of this ability.
      if (!isOneOf(t.who, ['you', 'opponent', 'any'])) {
        issue(out, `${path}.who`, `unknown player ${String(t.who)}`);
      }
      if (t.kind === 'activatesAbility') {
        for (const flag of ['xCost', 'anySource'] as const) {
          if (t[flag] !== undefined && t[flag] !== true) {
            issue(out, `${path}.${flag}`, 'must be true when present');
          }
        }
        // Avalanche of Sector 7: the permanent whose ability was activated (`ofSource`), read against the player who activated it.
        if (t.ofSource !== undefined) checkFilter(t.ofSource, `${path}.ofSource`, out);
      }
      break;
    case 'cycled':
      // D-179: "when you cycle this card" has no parameters; the face is checked for Cycling or typecycling with its abilities.
      break;
    case 'exerted':
      // CR 701.43d: "When you do" has no parameters; the face is checked for the exert static ability it is linked to.
      break;
    case 'becomesTarget':
      checkTriggerSubject(t.what, true, `${path}.what`, out);
      if (!isOneOf(t.by, ['you', 'opponent', 'any'])) {
        issue(out, `${path}.by`, `unknown controller of the targeting object ${String(t.by)}`);
      }
      if (t.spellOnly !== undefined && t.spellOnly !== true) {
        issue(out, `${path}.spellOnly`, 'spellOnly is true when present');
      }
      for (const flag of ['activatedOnly', 'batch'] as const) {
        if (t[flag] !== undefined && t[flag] !== true) {
          issue(out, `${path}.${flag}`, `${flag} is true when present`);
        }
      }
      if (t.spellOnly === true && t.activatedOnly === true) {
        issue(
          out,
          `${path}.activatedOnly`,
          'a trigger is for spells or for activated abilities, not both',
        );
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
      if (!isOneOf(t.to, ['player', 'opponent', 'opponents', 'you'])) {
        issue(out, `${path}.to`, `unknown recipient ${String(t.to)}`);
      }
      if (t.whileMonarch !== undefined && t.whileMonarch !== true) {
        issue(out, `${path}.whileMonarch`, 'whileMonarch is true when present');
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
      if (t.by !== 'you' && t.by !== 'tapper')
        issue(
          out,
          `${path}.by`,
          'by must be "you" (your own tapping) or "tapper" (whoever taps it)',
        );
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
      // CR 603.2c (Lorehold group 1): "one or more cards": a batch.
      if (t.batch !== undefined && t.batch !== true) {
        issue(out, `${path}.batch`, 'batch must be true when present');
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
      if (t.notPlayed !== undefined && t.notPlayed !== true) {
        issue(out, `${path}.notPlayed`, 'notPlayed must be true when present');
      }
      if (t.fromGraveyard !== undefined && t.fromGraveyard !== true) {
        issue(out, `${path}.fromGraveyard`, 'fromGraveyard must be true when present');
      }
      break;
    case 'leftGraveyard':
    case 'exiledFromLibraryOrGraveyard':
      // D-229: the cards of the controller's own graveyard (and library): `who` is "you".
      if (!isOneOf(t.who, ['you'])) issue(out, `${path}.who`, `unknown player ${String(t.who)}`);
      if (t.kind === 'leftGraveyard') {
        if (t.each !== undefined && t.each !== true) {
          issue(out, `${path}.each`, 'each must be true when present');
        }
        if (t.duringTurn !== undefined && t.duringTurn !== 'you') {
          issue(out, `${path}.duringTurn`, "duringTurn must be 'you' when present");
        }
        // The card is read where it was (its owner's graveyard): no zone, controller or owner.
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
              'the card that left the graveyard is read there: the filter names no zone, controller or owner',
            );
          }
        }
      }
      break;
    case 'exploits':
      // CR 702.110b: no parameters; the creature with the ability.
      break;
    case 'doorUnlocked':
      // CR 709.5h: the controller of the ability unlocks its own half; `validateCard` checks the half is a Room's.
      if (!isOneOf(t.who, ['you'])) issue(out, `${path}.who`, `unknown player ${String(t.who)}`);
      if (t.door !== 'this') issue(out, `${path}.door`, 'door must be "this"');
      break;
    case 'putIntoGraveyard':
      // CR 603.2, 404.1: cards put into the controller's own graveyard, from anywhere or from the library.
      if (!isOneOf(t.who, ['you', 'any', 'opponent'])) {
        issue(out, `${path}.who`, `unknown player ${String(t.who)}`);
      }
      if (
        t.who === 'opponent' &&
        (t.firstTimeEachTurn === true || t.batch === true || t.self === true)
      ) {
        issue(
          out,
          `${path}.who`,
          "an opponent's graveyard goes with a trigger for each card, not a batch, first-time or self trigger",
        );
      }
      if (!isOneOf(t.from, ['anywhere', 'library', 'notBattlefield'])) {
        issue(
          out,
          `${path}.from`,
          `from must be "anywhere", "library" or "notBattlefield", not ${String(t.from)}`,
        );
      }
      if (t.who === 'any' && t.firstTimeEachTurn !== undefined) {
        issue(
          out,
          `${path}.firstTimeEachTurn`,
          'firstTimeEachTurn goes with the graveyard of "you"',
        );
      }
      if (t.batch !== undefined && t.batch !== true) {
        issue(out, `${path}.batch`, 'batch must be true when present');
      }
      if (t.self !== undefined) {
        // CR 603.6c: "When ~ is put into a graveyard from anywhere": the card itself, from any zone, the graveyard of its owner.
        if (t.self !== true) issue(out, `${path}.self`, 'self must be true when present');
        if (
          t.who !== 'any' ||
          t.from !== 'anywhere' ||
          t.filter !== undefined ||
          t.batch !== undefined ||
          t.firstTimeEachTurn !== undefined
        ) {
          issue(
            out,
            `${path}.self`,
            'self goes with who "any" and from "anywhere", without a filter, batch or firstTimeEachTurn',
          );
        }
      }
      if (t.firstTimeEachTurn !== undefined) {
        if (t.firstTimeEachTurn !== true || t.batch !== true) {
          issue(
            out,
            `${path}.firstTimeEachTurn`,
            'firstTimeEachTurn must be true, and it goes with batch',
          );
        }
        // Only the card types of an earlier card are kept for it (`TurnLog.graveyardEntries`).
        if (
          t.filter !== undefined &&
          Object.keys(t.filter).some((k) => k !== 'types' && k !== 'notTypes')
        ) {
          issue(
            out,
            `${path}.filter`,
            'firstTimeEachTurn reads card types only: the filter has types or notTypes',
          );
        }
      }
      // The card is read where it went (its owner's graveyard): no zone, controller or owner.
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
            'the card put into the graveyard is read there: the filter names no zone, controller or owner',
          );
        }
      }
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
      if (!isOneOf(t.by, ['you', 'opponent', 'any'])) {
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
      if (
        t.alsoStep !== undefined &&
        (!isOneOf(t.alsoStep, TRIGGER_STEPS) || t.alsoStep === t.step)
      ) {
        issue(
          out,
          `${path}.alsoStep`,
          `alsoStep must be another known step, not ${String(t.alsoStep)}`,
        );
      }
      if (!isOneOf(t.whose, ['you', 'each', 'opponent', 'monarch'])) {
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
      // CR 504.1 (Orcish Bowmasters): "except the first one they draw in each of their draw steps": every draw but one, so not with a count.
      if (t.exceptFirstInDrawStep !== undefined) {
        if (t.exceptFirstInDrawStep !== true) {
          issue(out, `${path}.exceptFirstInDrawStep`, 'exceptFirstInDrawStep must be true');
        }
        if (t.nth !== undefined) {
          issue(out, `${path}.exceptFirstInDrawStep`, 'exceptFirstInDrawStep does not go with nth');
        }
      }
      break;
    case 'damageBatch':
      // CR 120.2, 603.2c: a filter of the sources, whom they damaged, and how many sources.
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
      if (!isOneOf(t.to, ['player', 'opponents'])) {
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
    case 'dealsDamage':
      checkTriggerSubject(t.what, true, `${path}.what`, out);
      if (!isOneOf(t.to, ['opponent', 'player', 'you'])) {
        issue(out, `${path}.to`, `unknown recipient ${String(t.to)}`);
      }
      break;
    case 'damageToPlayerPrevented':
    case 'dealtDamageToPlayer':
      if (!isOneOf(t.who, ['you', 'opponent', 'player'])) {
        issue(out, `${path}.who`, `unknown player ${String(t.who)}`);
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
    t?.kind === 'dealsDamage' ||
    t?.kind === 'noncombatDamageDealt' ||
    t?.kind === 'dealtDamageToPlayer' ||
    t?.kind === 'damageToPlayerPrevented' ||
    // Issue 103: all the combat damage the sources dealt to the player, "that damage".
    t?.kind === 'combatDamageBatch' ||
    t?.kind === 'lifeGained' ||
    // CR 119.3: "Whenever an opponent loses life, ... that many": the life that event lost. A batch spans several events, so it has no one amount.
    (t?.kind === 'lifeLost' && t.batch !== true) ||
    // D-513: the cards looked at while scrying are "that many".
    t?.kind === 'scries' ||
    t?.kind === 'surveils'
  );
}

/** Whether a cast trigger records the number of chosen targets for its effect (`triggerTargetCount`, D-574). */
function hasTargetCount(t: Trigger): boolean {
  return t?.kind === 'castSpell' && t.filter.targetCountAtLeast !== undefined;
}

/**
 * D-510 (CR 701.26a, 508.1f, 603.2c): the fields of a `becomesTapped` trigger besides its subject: who tapped the permanent, "if it isn't being declared as an attacker" and
 * the batch ("one or more"). Who tapped it and a batch need a filter for the permanent (a trigger on `this` or on what is attached has one permanent and no batch to make).
 */
function checkBecomesTapped(
  t: Extract<Trigger, { kind: 'becomesTapped' }>,
  path: string,
  out: AstIssue[],
): void {
  if (t.by !== undefined && !isOneOf(t.by, ['you', 'opponent'])) {
    issue(out, `${path}.by`, `unknown player ${String(t.by)}: you or opponent`);
  }
  for (const key of ['notAsAttacker', 'batch'] as const) {
    if (t[key] !== undefined && t[key] !== true)
      issue(out, `${path}.${key}`, `${key} must be true when present`);
  }
  if (t.batch === true && 'kind' in (t.what ?? {})) {
    issue(
      out,
      `${path}.batch`,
      'a batch of tapped permanents needs a filter for them, not this or attached',
    );
  }
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
    case 'becomesMonstrous':
    case 'turnedFaceUp':
    case 'blocks':
    case 'becomesBlocked':
    case 'becomesUnblocked':
    case 'becomesBlockedBy':
    case 'landfall':
    case 'diesBatch':
    case 'entersBatch':
    case 'discarded':
    case 'permanentSacrificed':
    case 'dealsCombatDamage':
    case 'dealsDamage':
    case 'dealtDamage':
    case 'leavesBattlefield':
    case 'countersAdded':
    case 'tapsForMana':
    case 'exerted':
      return 'permanent';
    case 'castSpell':
    case 'becomesTarget':
    case 'crimeCommitted':
    case 'activatesAbility':
    case 'entersCausesTrigger':
      return 'stack';
    case 'tokenCreated':
      return 'permanent';
    case 'putIntoGraveyard':
      // One card for each occurrence; a batch is about several cards and has no one subject.
      return t.batch === true ? undefined : 'permanent';
    case 'doorUnlocked':
    case 'exploits':
      return 'permanent';
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

/**
 * D-491 (CR 118.8, 701.21a): the amount and the condition `sacrificedAsCost` read what a spell sacrificed for its additional cost, so the face lists a cost that sacrifices any
 * number of permanents, a land is not cast, and an ability reads it only in "When you cast this spell" (`castSpell` with `self`, the spell being the source of its own ability).
 * D-583 (CR 602.2b): an activated ability reads it too, when its own cost sacrifices one or more permanents (`atLeastOne`): the permanents its cost sacrificed.
 */
function checkSacrificedAsCost(face: CardFace, path: string, out: AstIssue[]): void {
  const reads = (node: unknown) => effectHas(node, 'sacrificedAsCost');
  const optional = (face.additionalCosts ?? []).some(
    (c) => c?.kind === 'sacrifice' && c.anyNumber === true,
  );
  // D-583 (CR 602.2b): an activated ability reads what its own cost sacrificed, when that cost sacrifices one or more permanents.
  const ownCost = (a: Ability): boolean =>
    a.kind === 'activated' &&
    Array.isArray(a.cost) &&
    a.cost.some((c) => c?.kind === 'sacrifice' && c.anyNumber === true && c.atLeastOne === true);
  const readers = face.abilities.filter((a) => a.kind !== 'activated' && reads(a));
  if (!optional && (readers.length > 0 || reads(face.spell))) {
    issue(
      out,
      path,
      'sacrificedAsCost reads the permanents a spell sacrificed for its additional cost: the face needs a cost that sacrifices any number of permanents (D-491)',
    );
  }
  face.abilities.forEach((a, i) => {
    if (!reads(a)) return;
    if (a.kind === 'activated') {
      if (!ownCost(a)) {
        issue(
          out,
          `${path}.abilities[${i}]`,
          'sacrificedAsCost is read by an activated ability only when its own cost sacrifices one or more permanents (D-583)',
        );
      }
      return;
    }
    const own =
      a.kind === 'triggered' && a.trigger?.kind === 'castSpell' && a.trigger.self === true;
    if (!own) {
      issue(
        out,
        `${path}.abilities[${i}]`,
        'sacrificedAsCost is read by the spell\'s own "When you cast this spell" ability (castSpell with self) and by its text only (D-491)',
      );
    }
  });
}

/**
 * CR 602.2b, 701.9a: the condition `discardedAsCostMatches` reads the cards the cost of an activated ability discarded from the hand, so only an activated ability whose own cost
 * discards (a `discard` cost that is not "this card" or an X) reads it.
 */
function checkDiscardedAsCost(face: CardFace, path: string, out: AstIssue[]): void {
  face.abilities.forEach((a, i) => {
    if (!effectHas(a, 'discardedAsCostMatches')) return;
    const own =
      a.kind === 'activated' && Array.isArray(a.cost) && a.cost.some((c) => c?.kind === 'discard');
    if (!own) {
      issue(
        out,
        `${path}.abilities[${i}]`,
        'discardedAsCostMatches is read only by an activated ability whose own cost discards cards from the hand (CR 602.2b)',
      );
    }
  });
  if (effectHas(face.spell, 'discardedAsCostMatches')) {
    issue(out, `${path}.spell`, 'discardedAsCostMatches is not read by a spell (CR 602.2b)');
  }
}

/**
 * CR 118.8, 701.68a: the condition `additionalCostPaid` reads whether a spell paid the optional blight of its additional cost, so the face lists one and only the spell's own text reads it.
 */
function checkAdditionalCostPaid(face: CardFace, path: string, out: AstIssue[]): void {
  const reads = (node: unknown) => effectHas(node, 'additionalCostPaid');
  const optional = (face.additionalCosts ?? []).some((c) => c?.kind === 'blight');
  face.abilities.forEach((a, i) => {
    if (reads(a)) {
      issue(
        out,
        `${path}.abilities[${i}]`,
        'additionalCostPaid is read by the effect of the spell whose additional cost it asks about, not by an ability',
      );
    }
  });
  if (!optional && reads(face.spell)) {
    issue(
      out,
      path,
      'additionalCostPaid reads whether the additional cost of a spell was paid: the face needs an optional blight cost (CR 701.68a)',
    );
  }
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
      // Issue 101: "Discard X cards" announces X as the ability is activated.
      (c.kind === 'discard' && (c as { countX?: unknown }).countX === true) ||
      // D-488: "Sacrifice X creatures" announces X as the ability is activated.
      (c.kind === 'sacrifice' && (c as { countX?: unknown }).countX === true) ||
      // Moxite Refinery: "Remove X counters from an artifact or creature you control" announces X as the ability is activated.
      (c.kind === 'removeCounters' && (c as { countX?: unknown }).countX === true) ||
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
    // D-462 (CR 701.20a): "Reveal this card from your hand" is paid from the hand.
    if (kind === 'revealThis' && !fromHand) {
      issue(out, `${path}.cost[${i}]`, "revealThis needs functionsIn: 'hand'");
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
      // D-540 (CR 602.2, 118.3): returning other permanents you control is paid wherever the ability works ("Return two lands you control to their owner's hand: Return this card from your graveyard to your hand"); returning the source itself needs it on the battlefield.
      c?.kind === 'exilePermanent' ||
      (c?.kind === 'returnToHand' &&
        typeof c.what === 'object' &&
        c.what !== null &&
        'kind' in c.what) ||
      // CR 701.21a: sacrificing permanents you control (a filter) is paid wherever the ability works ("Sacrifice a Swamp and a Forest: Return this card from your graveyard to your hand"); sacrificing the source itself needs it on the battlefield.
      (c?.kind === 'sacrifice' && 'kind' in c.what) ||
      kind === 'discard' ||
      kind === 'tapCreatures';
    // D-491: "you may sacrifice one or more creatures" is an additional cost of a spell, chosen as it is cast. D-583 (CR 602.2b): an activated ability may sacrifice "one or more"
    // permanents (`atLeastOne`), never "any number" including none.
    if (c?.kind === 'sacrifice' && c.anyNumber !== undefined && c.atLeastOne !== true) {
      issue(
        out,
        `${path}.cost[${i}].anyNumber`,
        'an activated ability sacrifices a number it states: "any number" is an additional cost of a spell (D-491); "one or more" needs atLeastOne (D-583)',
      );
    }
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
      checkGraveyardAbility(a, path, out);
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
    case 'stationLevel':
      // CR 721.2a (Station): the abilities of a station symbol, from `threshold` charge counters on: a whole number of 1 or more, one or more abilities, and no symbol inside another.
      if (!Number.isSafeInteger(a.threshold) || a.threshold < 1) {
        issue(
          out,
          `${path}.threshold`,
          'the threshold of a station symbol is a whole number from 1',
        );
      }
      if (!Array.isArray(a.abilities) || a.abilities.length === 0) {
        issue(out, `${path}.abilities`, 'a station symbol gates at least one ability');
      } else {
        a.abilities.forEach((inner, i) => {
          if (inner?.kind === 'stationLevel' || inner?.kind === 'level') {
            issue(
              out,
              `${path}.abilities[${i}]`,
              `a station symbol does not hold a ${inner.kind} ability`,
            );
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
      // CR 113.6b (Sproutback Trudge): "cast this card from your graveyard" names the card in the graveyard its ability works from.
      if (
        a.functionsIn !== 'graveyard' &&
        JSON.stringify(a.effect ?? null).includes('"kind":"castCard","object":{"kind":"this"}')
      ) {
        issue(
          out,
          `${path}.functionsIn`,
          "casting this card needs a triggered ability with functionsIn: 'graveyard'",
        );
      }
      const targets = declareTargets(
        a.targets,
        `${path}.targets`,
        out,
        // CR 601.2d, 603.3d: a triggered ability announces its division as it is put on the stack.
        true,
        false,
        true,
        false,
        a.trigger?.kind === 'scries' || a.trigger?.kind === 'cycled',
        true,
        false,
        // CR 107.3m: the enters trigger of the permanent itself may take up to as many targets as the X of the spell it came from.
        a.trigger?.kind === 'entersBattlefield' && kindOf(a.trigger.what) === 'this',
        // CR 701.37c: the becomes monstrous trigger of the permanent itself may take up to as many targets as the X of its monstrosity.
        a.trigger?.kind === 'becomesMonstrous' && kindOf(a.trigger.what) === 'this',
        // CR 603.3d (Bladegriff Prototype): the player the event is about may choose the target.
        triggerHasPlayer(a.trigger) && a.modes === undefined && a.chooseModes === undefined,
      );
      // D-270: a slot of two zones (the battlefield and graveyards) is named only by an `exile` of it, in an ability with no modes.
      checkCrossZoneSlots(
        a,
        a.effect,
        a.modes !== undefined || a.chooseModes !== undefined,
        path,
        out,
      );
      const subject = subjectOf(a.trigger);
      // CR 603.3d: a target filter reads the triggering object only where it is a spell (`manaValueAtMost` of its mana value).
      const targetsText = JSON.stringify(a.targets ?? []);
      // CR 400.7, 603.10a: "another target ... card" besides the card the permanent the trigger is about became.
      if (targetsText.includes('"notTriggerCard"') && subject !== 'permanent') {
        issue(
          out,
          `${path}.targets`,
          'notTriggerCard leaves out the card of the permanent the trigger is about: it needs a trigger about a permanent',
        );
      }
      if (targetsText.includes('"triggerSubject"')) {
        // CR 122.1, 603.10a (Puca's Covenant): "mana value less than or equal to the number of counters on that creature" reads the counters of the permanent the trigger is about.
        const readsSpell = targetsText.includes('"manaValueOf"');
        if (readsSpell && subject !== 'stack') {
          issue(
            out,
            `${path}.targets`,
            'a target filter that reads the triggering spell needs a cast trigger',
          );
        } else if (!readsSpell && subject !== 'permanent') {
          issue(
            out,
            `${path}.targets`,
            'a target filter that reads the counters of the triggering permanent needs a trigger about a permanent',
          );
        }
      }
      const selfCast = a.trigger?.kind === 'castSpell' && a.trigger.self === true;
      const scopeOf = (declared: Scope['targets']): Scope => ({
        owner: 'ability',
        targets: declared,
        // CR 601.2b: "When you cast this spell, ... half X": the spell is still on the stack with the X announced for it (the face checks its cost has an {X}).
        xAllowed: selfCast,
        ...(subject === undefined ? {} : { triggerSubject: subject }),
        // D-232: "from among those cards" is read where the trigger is about the cards that left a graveyard.
        ...(a.trigger.kind === 'leftGraveyard' ||
        (a.trigger.kind === 'putIntoGraveyard' && a.trigger.batch === true) ||
        (a.trigger.kind === 'discarded' && a.trigger.batch === true) ||
        a.trigger.kind === 'entersBatch'
          ? { triggerCards: true }
          : {}),
        // CR 509.3d (Flanking): "the blocking creature" is the creature that blocked, `triggerSources`.
        ...(a.trigger.kind === 'combatDamageBatch' || a.trigger.kind === 'becomesBlockedBy'
          ? { triggerSources: true }
          : {}),
        ...(a.trigger.kind === 'cycled' ? { triggerCycleX: true } : {}),
        // CR 701.38a (Erestor of the Council): the ability reads who voted for what in the vote that finished.
        ...(a.trigger.kind === 'votingFinished' ? { voteTrigger: true } : {}),
        ...(a.trigger.kind === 'attackBatch' ? { triggerAttackerCount: true } : {}),
        ...(a.trigger.kind === 'damageBatch' && a.trigger.to === 'opponents'
          ? { triggerDamagedPlayerCount: true, triggerDamagedPlayers: true }
          : {}),
        ...(triggerHasPlayer(a.trigger) ? { triggerPlayer: true } : {}),
        ...(hasDamage(a.trigger) ? { triggerDamage: true } : {}),
        ...(hasTargetCount(a.trigger) ? { triggerTargetCount: true } : {}),
        ...(a.trigger?.kind === 'attackBatch' ||
        a.trigger?.kind === 'playerAttacksOpponent' ||
        (a.trigger?.kind === 'attacks' && a.trigger.at === 'opponent')
          ? { triggerAttacked: true }
          : {}),
        ...(a.trigger?.kind === 'playerAttacksOpponent' ||
        (a.trigger?.kind === 'attacks' && a.trigger.at === 'opponent') ||
        (a.trigger?.kind === 'attackBatch' &&
          (a.trigger.eachAttackedPlayer === true || a.trigger.eachAttackedOpponent === true))
          ? { triggerAttackedSingle: true }
          : {}),
        triggeredAbility: true,
        ...(a.trigger.kind === 'tappedForMana' ? { triggeredMana: true } : {}),
        ...(a.trigger?.kind === 'attacks' ? { attackTrigger: true } : {}),
        ...(a.trigger?.kind === 'exerted' ? { exertTrigger: true } : {}),
        ...(a.trigger?.kind === 'attackBatch' ? { attackBatchTrigger: true } : {}),
        ...(a.trigger?.kind === 'dealsCombatDamage' ? { combatDamageTrigger: true } : {}),
        ...(mentionsCondition(a.interveningIf, 'yourMainPhase') ? { mainPhaseTrigger: true } : {}),
        ...(a.trigger?.kind === 'step' && a.trigger.step === 'main2'
          ? { postcombatMainTrigger: true }
          : {}),
        ...(selfCast ? { selfCast: true } : {}),
        ...(a.trigger?.kind === 'dies' ? { diesTrigger: true } : {}),
        // D-657: the Aura's own trigger "when enchanted creature dies".
        ...(a.trigger?.kind === 'dies' && kindOf(a.trigger.what) === 'attached'
          ? { auraDiesTrigger: true }
          : {}),
        // CR 107.3m (Hylda group 3): the enters trigger of the permanent itself may refer to the X of the spell it came from.
        ...(a.trigger?.kind === 'entersBattlefield' && kindOf(a.trigger.what) === 'this'
          ? { entersX: true }
          : {}),
        // CR 701.37c (Death Kiss): the becomes monstrous trigger of the permanent itself may refer to the X of its monstrosity.
        ...(a.trigger?.kind === 'becomesMonstrous' && kindOf(a.trigger.what) === 'this'
          ? { monstrousX: true }
          : {}),
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
          (a.effect.mana?.kind === 'fixed' ||
            // CR 106.1b, 605.3b: one mana of any color, named as the mana ability is activated.
            (a.effect.mana?.kind === 'anyColor' && (a.effect.mana.count ?? 1) === 1) ||
            // CR 106.12a, 605.4a: one mana of a type the tapped permanent produced.
            a.effect.mana?.kind === 'producedType') &&
          a.targets === undefined &&
          a.modes === undefined &&
          a.optional !== true &&
          a.interveningIf === undefined;
        if (!plain) {
          issue(
            out,
            path,
            'an ability that triggers when a permanent is tapped for mana is a triggered mana ability (CR 605.1b): it only adds fixed mana or one mana of any color, with no target, mode, "may" or intervening "if"',
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
        // D-520: "if enchanted creature is untapped": the permanent an Aura is attached to against a filter.
        if (a.interveningIf.kind === 'objectMatches' && kindOf(a.interveningIf.of) === 'attached') {
          checkAttachedIf(a.interveningIf, `${path}.interveningIf`, out);
        } else {
          checkCondition(a.interveningIf, `${path}.interveningIf`, out);
        }
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
        // CR 603.10a: "if you control that creature", "if its toughness was less than 1" read the permanent the event is about.
        for (const kind of [
          'subjectControlledByYou',
          'subjectHadToAttack',
          'subjectMatches',
          'subjectStat',
          'subjectGreaterThanEach',
          'subjectPowerLessThanThis',
        ]) {
          if (conditionHas(a.interveningIf, kind) && subjectOf(a.trigger) !== 'permanent') {
            issue(
              out,
              `${path}.interveningIf`,
              `${kind} reads the permanent the event is about: it needs a trigger about a permanent`,
            );
          }
        }
        // D-648: "that opponent" is the player a `playerAttacksOpponent` trigger is about.
        if (
          conditionHas(a.interveningIf, 'attackedHasMoreLifeThanOtherOpponent') &&
          a.trigger?.kind !== 'playerAttacksOpponent'
        ) {
          issue(
            out,
            `${path}.interveningIf`,
            'attackedHasMoreLifeThanOtherOpponent reads the player a playerAttacksOpponent trigger is about: it is only valid in the intervening "if" of one',
          );
        }
        // D-643: the attack declaration is what `attackersAtYouAtLeast` reads, so only the intervening "if" of an attackBatch trigger has it.
        if (
          conditionHas(a.interveningIf, 'attackersAtYouAtLeast') &&
          a.trigger?.kind !== 'attackBatch'
        ) {
          issue(
            out,
            `${path}.interveningIf`,
            'attackersAtYouAtLeast reads the creatures of an attackBatch trigger: it is only valid in the intervening "if" of one',
          );
        }
        // CR 603.4, 508.1b (Mirkwood Trapper): the declaration is what `attackersAttackedYou` reads.
        if (
          conditionHas(a.interveningIf, 'attackersAttackedYou') &&
          a.trigger?.kind !== 'attackBatch'
        ) {
          issue(
            out,
            `${path}.interveningIf`,
            'attackersAttackedYou reads the creatures of an attackBatch trigger: it is only valid in the intervening "if" of one',
          );
        }
        if (conditionHas(a.interveningIf, 'triggerPlayerHasMore') && !triggerHasPlayer(a.trigger)) {
          issue(
            out,
            `${path}.interveningIf`,
            'triggerPlayerHasMore reads the player the event is about: it needs a trigger whose event is about a player',
          );
        }
        if (conditionHas(a.interveningIf, 'triggerPlayerTurn') && !triggerHasPlayer(a.trigger)) {
          issue(
            out,
            `${path}.interveningIf`,
            'triggerPlayerTurn reads the player the event is about: it needs a trigger whose event is about a player',
          );
        }
        if (
          conditionHas(a.interveningIf, 'ringBearerChosen') &&
          a.trigger?.kind !== 'ringTempted'
        ) {
          issue(
            out,
            `${path}.interveningIf`,
            'ringBearerChosen reads the creature the Ring tempted its controller to choose: it needs a ringTempted trigger',
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
      // CR 702.62b: "if this card is suspended" is true only for a card in exile, which the ability must say it works from (CR 113.6b).
      if (
        (conditionHas(a.interveningIf, 'thisSuspended') ||
          conditionHas(a.triggerCondition, 'thisSuspended')) &&
        a.functionsIn !== 'exile'
      ) {
        issue(
          out,
          `${path}.interveningIf`,
          "thisSuspended needs functionsIn: 'exile': an ability that works on the battlefield has its card there",
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
        // CR 603.2: "deals combat damage to a player who controls more lands than you" is part of the event, read once as it happens.
        if (
          conditionHas(a.triggerCondition, 'triggerPlayerHasMore') &&
          !triggerHasPlayer(a.trigger)
        ) {
          issue(
            out,
            `${path}.triggerCondition`,
            'triggerPlayerHasMore reads the player the event is about: it needs a trigger whose event is about a player',
          );
        }
        for (const kind of [
          'subjectControlledByYou',
          'subjectHadToAttack',
          'subjectMatches',
          'subjectStat',
          'subjectGreaterThanEach',
          'subjectPowerLessThanThis',
        ]) {
          if (conditionHas(a.triggerCondition, kind)) {
            issue(out, `${path}.triggerCondition`, `${kind} is read as an intervening "if"`);
          }
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
        !isOneOf(a.functionsIn, ['battlefield', 'hand', 'graveyard', 'exile'])
      ) {
        issue(out, `${path}.functionsIn`, `unknown zone ${String(a.functionsIn)}`);
      }
      checkActivationCosts(a, path, out);
      checkLoyaltyAbility(a, path, out);
      // Issue 345 (CR 702.177a): "Exhaust": activated only once; a loyalty ability has its own limit.
      if (a.exhaust !== undefined) {
        if (a.exhaust !== true) issue(out, `${path}.exhaust`, 'exhaust must be true when present');
        if (a.cost?.some((c) => c?.kind === 'loyalty') === true) {
          issue(out, `${path}.exhaust`, 'a loyalty ability is limited by CR 606.3: no exhaust');
        }
      }
      // CR 602.2: "Only your opponents may activate this ability": an ability of a permanent, not a loyalty ability.
      if (a.activator !== undefined) {
        if (a.activator !== 'opponents') issue(out, `${path}.activator`, 'activator is opponents');
        if (a.cost?.some((c) => c?.kind === 'loyalty') === true) {
          issue(out, `${path}.activator`, 'a loyalty ability is activated by its controller only');
        }
        if (a.functionsIn !== undefined && a.functionsIn !== 'battlefield') {
          issue(out, `${path}.activator`, 'only an ability of the battlefield has an activator');
        }
      }
      // D-425: the engine writes it as it expands an Equip keyword; card data says "equip {N}" with the keyword.
      if (a.equip !== undefined) {
        issue(
          out,
          `${path}.equip`,
          'equip is written by the engine for the Equip keyword: a card writes the keyword',
        );
      }
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
      // CR 601.2d, 602.2b: an activated ability announces its division as it is activated.
      // Issue 345 (Magus of the Candelabra, CR 601.2b, 602.2b): "{X}, {T}: Untap X target lands": a slot of as many targets as the X announced, for an ability whose cost has an X.
      const targets = declareTargets(
        a.targets,
        `${path}.targets`,
        out,
        true,
        false,
        false,
        'slot',
        false,
        false,
        Array.isArray(a.cost) && hasXCost(a.cost),
      );
      if (
        (a.targets ?? []).some((t) => t.countX === true) &&
        !(Array.isArray(a.cost) && hasXCost(a.cost))
      ) {
        issue(out, `${path}.targets`, 'X targets need an X in the cost of the ability');
      }
      const scopeOf = (declared: Scope['targets']): Scope => ({
        owner: 'ability',
        targets: declared,
        activatedAbility: true,
        xAllowed: Array.isArray(a.cost) && hasXCost(a.cost),
        ...(a.functionsIn === 'graveyard' ? { fromGraveyard: true } : {}),
        // D-133: "the sacrificed creature" is readable where the cost sacrificed something.
        ...(Array.isArray(a.cost) && a.cost.some((c) => c?.kind === 'sacrifice')
          ? { sacrificedCost: true }
          : {}),
        // CR 702.184a: "equal to the tapped creature's power" is readable where the cost taps permanents.
        ...(Array.isArray(a.cost) && a.cost.some((c) => c?.kind === 'tapPermanents')
          ? { tappedCost: true }
          : {}),
        // D-232: "the exiled cards" are readable where the cost exiled cards from the graveyard.
        ...(Array.isArray(a.cost) && a.cost.some((c) => c?.kind === 'exileFromGraveyard')
          ? { exiledCost: true }
          : {}),
        // Primordial Mist: "that card" is the card the cost exiled from the battlefield, which `moved` names.
        ...(Array.isArray(a.cost) && a.cost.some((c) => c?.kind === 'exilePermanent')
          ? { movedAvailable: true }
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
  // D-511: the modes of "When you do, choose one —" are those of a triggered ability.
  checkModes: (
    modes: Parameters<typeof checkModes>[0],
    choose: Parameters<typeof checkModes>[1],
    path: string,
    scopeOf: Parameters<typeof checkModes>[3],
    out: AstIssue[],
  ) => checkModes(modes, choose, path, scopeOf, out, true),
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
      false,
      true,
      xAllowed,
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
  if (!xAllowed && (s.targets ?? []).some((t) => kindOf(t.divide?.total) === 'x')) {
    issue(out, `${path}.x`, 'a division of X needs x: true (the spell announces an X)');
  }
  // CR 107.3a, 601.2b: "X can't be greater than the number of players in the game": a limit on the X announced, read as the spell is cast.
  if (s.xAtMost !== undefined) {
    if (!xAllowed)
      issue(out, `${path}.xAtMost`, 'a limit on X needs x: true (the spell announces an X)');
    checkStateAmount(s.xAtMost, `${path}.xAtMost`, out, 'the limit on X');
  }
  // CR 107.3a, 202.3: "target creature with mana value X" reads the X announced for the spell.
  if (
    !xAllowed &&
    (s.targets ?? []).some(
      (t) => t.what?.kind === 'object' && JSON.stringify(t.what.filter).includes('"manaValueX"'),
    )
  ) {
    issue(out, `${path}.x`, 'a target with mana value X needs x: true (the spell announces an X)');
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
  if (
    face.commanderTaxLife !== undefined &&
    (!Number.isSafeInteger(face.commanderTaxLife) || face.commanderTaxLife <= 0)
  ) {
    issue(out, `${path}.commanderTaxLife`, 'commander tax life must be a positive whole number');
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
  // CR 702.34a, 601.2f (Visions of Glory): "costs {X} less to cast this way" is for a flashback cost the face has.
  face.abilities.forEach((a, i) => {
    if (
      a?.kind === 'static' &&
      a.static?.kind === 'costReduction' &&
      a.static.forAlternative === 'flashback' &&
      !face.abilities.some((k) => k?.kind === 'keyword' && k.keyword?.kind === 'flashback')
    ) {
      issue(
        out,
        `${path}.abilities[${i}].static.forAlternative`,
        'a reduction for the flashback cost needs the flashback keyword on the face',
      );
    }
  });
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
    (a) =>
      a?.kind === 'static' &&
      a.static?.kind === 'castFromGraveyard' &&
      a.static.using === undefined,
  ).length;
  // CR 702.152a: "You may cast this card from your graveyard using its blitz ability": once, and only on a face that lists a blitz cost to use.
  const blitzPermissions = face.abilities.filter(
    (a) =>
      a?.kind === 'static' && a.static?.kind === 'castFromGraveyard' && a.static.using === 'blitz',
  ).length;
  if (blitzPermissions > 1) {
    issue(out, `${path}.abilities`, 'castFromGraveyard using blitz once is enough');
  }
  if (blitzPermissions > 0 && !face.alternativeCosts?.some((a) => a?.kind === 'blitz')) {
    issue(
      out,
      `${path}.abilities`,
      'castFromGraveyard using blitz needs a blitz alternative cost on the face (CR 702.152a)',
    );
  }
  if (permissions > 1) {
    issue(
      out,
      `${path}.abilities`,
      'castFromGraveyard once is enough: a card has one permission to be cast from its graveyard',
    );
  }
  if ((permissions > 0 || blitzPermissions > 0) && face.types.includes('land')) {
    issue(
      out,
      `${path}.abilities`,
      'a land is played, not cast: it has no castFromGraveyard to give it permission for',
    );
  }
  // D-641 (CR 601.2f): "costs {2}{R} more to cast for each target beyond the first" is the cost of a spell, once, of a face with targets to count.
  const strive = face.abilities.filter(
    (a) => a?.kind === 'static' && a.static?.kind === 'costPerExtraTarget',
  ).length;
  if (strive > 0 && !face.types.some((t) => t === 'instant' || t === 'sorcery')) {
    issue(
      out,
      `${path}.abilities`,
      'costPerExtraTarget is the cost of a spell: an instant or a sorcery face (CR 601.2f)',
    );
  }
  if (strive > 1) {
    issue(out, `${path}.abilities`, 'costPerExtraTarget once is enough: a spell has one such cost');
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
  checkSacrificedAsCost(face, path, out);
  checkDiscardedAsCost(face, path, out);
  checkAdditionalCostPaid(face, path, out);
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
    // D-135: a gift-conditioned target is used only in the matching promised or unpromised branch.
    for (const id of giftTargetsUsedUnguarded(face.spell)) {
      issue(
        out,
        `${path}.spell.targets`,
        `target "${id}" exists only in the matching gift branch: use it only in that branch`,
      );
    }
    // Issue 244, CR 601.2c: a target chosen only if the spell was cast during its controller's main phase is used only in a `castInOwnMainPhase` conditional.
    for (const id of castPhaseTargetsUsedUnguarded(face.spell)) {
      issue(
        out,
        `${path}.spell.targets`,
        `target "${id}" exists only if the spell was cast during its controller's main phase: use it only in the effect of a castInOwnMainPhase conditional`,
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
    // Sin, Unending Cataclysm: the counters removed as it enters can only be read where the face removes them.
    if (
      a?.kind === 'replacement' &&
      a.replacement?.kind === 'entersWithCounters' &&
      kindOf(a.replacement.count) === 'countersRemovedAsEntered' &&
      !face.abilities.some(
        (b) => b?.kind === 'replacement' && b.replacement?.kind === 'asEntersRemoveCounters',
      )
    ) {
      issue(
        out,
        `${path}.abilities[${i}].replacement.count`,
        'it counts the counters removed as it enters, but the face removes none (asEntersRemoveCounters)',
      );
    }
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

  // CR 601.2b: the X read by "When you cast this spell, ..." is the X announced for that spell, so the mana cost needs an {X}.
  face.abilities.forEach((a, i) => {
    if (
      a?.kind === 'triggered' &&
      a.trigger?.kind === 'castSpell' &&
      a.trigger.self === true &&
      JSON.stringify(a.effect ?? null).includes('"x"') &&
      !(face.manaCost ?? []).includes('X')
    ) {
      issue(out, `${path}.abilities[${i}].effect`, 'X is read but the mana cost has no {X}');
    }
  });
  // CR 707.9b (Mocking Doppelganger): "except it has \"<static ability>\"": a non-empty list of static abilities, each checked as an ability of its own.
  face.abilities.forEach((a, i) => {
    if (a?.kind !== 'replacement' || a.replacement?.kind !== 'entersAsCopy') return;
    const statics = a.replacement.addStatics;
    if (statics === undefined) return;
    const at = `${path}.abilities[${i}].replacement.addStatics`;
    if (!Array.isArray(statics) || statics.length === 0) {
      issue(out, at, 'addStatics is a non-empty list when present');
      return;
    }
    statics.forEach((inner, j) => {
      if (inner?.kind !== 'static') {
        issue(out, `${at}[${j}]`, 'addStatics holds static abilities only');
      } else {
        checkAbility(inner, `${at}[${j}]`, out);
      }
    });
  });
  // CR 107.3m: the X of a copy's "enters with X additional counters" is the spell's X, so the cost needs an {X}.
  face.abilities.forEach((a, i) => {
    if (
      a?.kind === 'replacement' &&
      a.replacement?.kind === 'entersAsCopy' &&
      a.replacement.withX !== undefined &&
      !(face.manaCost ?? []).includes('X')
    ) {
      issue(
        out,
        `${path}.abilities[${i}].replacement.withX`,
        'enters with X counters but the mana cost has no {X}',
      );
    }
  });

  // CR 107.3m: "destroy up to one target artifact or enchantment with mana value X or less" reads the X of the spell the permanent came from, so only the enters trigger of the permanent itself has it.
  face.abilities.forEach((a, i) => {
    if (
      a?.kind === 'triggered' &&
      JSON.stringify(a.targets ?? null).includes('"enteredX"') &&
      !(a.trigger?.kind === 'entersBattlefield' && kindOf(a.trigger.what) === 'this')
    ) {
      issue(
        out,
        `${path}.abilities[${i}].targets`,
        'enteredX in a target reads the X of the spell the permanent came from: only its own enters trigger has one',
      );
    }
  });

  // CR 107.3m (Hylda group 3): "When this creature enters, draw X cards" reads the X of the spell's mana cost; without an {X} there is nothing to read.
  face.abilities.forEach((a, i) => {
    if (
      a?.kind === 'triggered' &&
      (JSON.stringify(a.effect ?? null).includes('"enteredX"') ||
        JSON.stringify(a.targets ?? null).includes('"enteredX"') ||
        (a.trigger?.kind === 'entersBattlefield' &&
          JSON.stringify(a.effect ?? null).includes('"xAtLeast"'))) &&
      !(face.manaCost ?? []).includes('X') &&
      // Thieving Skydiver (CR 702.33a, 107.3m): the X of the kicker cost is the X the permanent remembers too.
      !face.abilities.some(
        (k) =>
          k?.kind === 'keyword' &&
          k.keyword?.kind === 'kicker' &&
          k.keyword.cost?.some((c) => c?.kind === 'mana' && c.symbols?.includes('X')),
      )
    ) {
      issue(
        out,
        `${path}.abilities[${i}].effect`,
        'enteredX is the X of the spell the permanent came from, but the mana cost has no {X}',
      );
    }
  });

  // CR 701.37c: "goad up to X target creatures" in the becomes monstrous trigger reads the X of a "Monstrosity X" of the permanent: without a monstrosity there is nothing to read.
  face.abilities.forEach((a, i) => {
    if (
      a?.kind === 'triggered' &&
      (JSON.stringify(a.effect ?? null).includes('"monstrousX"') ||
        JSON.stringify(a.targets ?? null).includes('"monstrousX"')) &&
      !face.abilities.some(
        (other) =>
          other?.kind === 'activated' &&
          JSON.stringify(other.effect ?? null).includes('"kind":"monstrosity"'),
      )
    ) {
      issue(
        out,
        `${path}.abilities[${i}].effect`,
        'monstrousX is the X of a monstrosity of the permanent, but no ability of the face has one',
      );
    }
  });

  // CR 614.9 (D-192): a redirection deals the damage to the permanent that has it.
  redirectFaceIssues(face, path, out);
  // CR 702.89a (D-417): Umbra armor is the ability of an Aura.
  umbraFaceIssues(face, path, out);

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

  // CR 701.43d, 607.2h: "You may exert ~ as it attacks" is a cost to attack, so it is on a creature; the "When you do" abilities linked to it are on the same face.
  const exerts = face.abilities.some(
    (k) => k?.kind === 'static' && k.static?.kind === 'exertOnAttack',
  );
  face.abilities.forEach((a, i) => {
    if (a?.kind === 'triggered' && a.trigger?.kind === 'exerted' && !exerts) {
      issue(
        out,
        `${path}.abilities[${i}].trigger`,
        '"when you do" after exerting needs the "you may exert this creature as it attacks" ability on the same face (CR 607.2h)',
      );
    }
  });
  if (exerts && !face.types.includes('creature')) {
    issue(
      out,
      `${path}.abilities`,
      'exert is the cost of attacking: a creature has it (CR 701.43d)',
    );
  }

  // An unsupported instant or sorcery has had its text dropped (SPEC 7.1), so only a supported
  // one must carry an effect. A supported instant or sorcery with no effect would do nothing.
  // D-667 (CR 702.85a, 608.2): "Cascade. Retrace." is a sorcery with no spell text whose cast trigger does the work: cascade alone makes a spell with no effect to resolve valid.
  const isSpellCard = face.types.includes('instant') || face.types.includes('sorcery');
  const castsOnItsOwn = face.abilities.some(
    (a) => a.kind === 'keyword' && a.keyword.kind === 'cascade',
  );
  if (supported && isSpellCard && !spellHasEffect(face.spell) && !castsOnItsOwn) {
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
    if (i > 0 && face.alternativeCosts?.some((a) => a?.kind === 'harmonize')) {
      issue(
        out,
        `faces[${i}].alternativeCosts`,
        'harmonize on a face other than the front face is not supported (CR 702.180a)',
      );
    }
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
