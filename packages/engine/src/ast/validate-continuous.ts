/**
 * Validation of the continuous-effect nodes (CR 611.2, 613): "gets +N/+N" (or "+X/+0", "-X/-X", "+1/+1 for each
 * artifact you control": amounts, D-115), "has base power and
 * toughness N/N", "loses all abilities", "becomes a [creature type]" or "an [card type]", "becomes
 * [color]" and "gains [keyword]". `validate.ts` hands them to `checkEffect` (validate-parts.ts)
 * through `Scope.checkContinuous`, because this file needs that one's building blocks.
 */
import {
  ARTIFACT_TYPES,
  BASIC_LAND_TYPES,
  CARD_TYPES,
  COLORS,
  isNonCreatureSubtype,
} from '../characteristics';

/** D-474 (CR 305.6): the basic land types, the one kind of land subtype an effect can set. */
const BASIC_LAND_TYPE_NAMES: readonly string[] = Object.keys(BASIC_LAND_TYPES);

import { GRANTABLE_KEYWORDS, RESTRICTABLE_BY_EFFECT } from './features';
import type { Effect } from './types';
import { checkGrantedParameter, checkProtectionTypes } from './validate-attach';
import {
  type AstIssue,
  checkAffectedObjects,
  checkEnumList,
  checkFilter,
  checkPtAmount,
  filterSome,
  issue,
  type Scope,
} from './validate-parts';
import { checkPreventDamage } from './validate-prevent';

type ContinuousNode = Extract<
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
      | 'restrict';
  }
>;

/** What `validate.ts` hands to this file: the continuous nodes above, and a prevention shield. */
export type ContinuousOrPrevent = ContinuousNode | Extract<Effect, { kind: 'preventDamage' }>;

const DURATIONS = ['untilEndOfTurn', 'permanent'];

function isOneOf(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === 'string' && allowed.includes(value);
}

/** The static abilities an effect may give for good (D-275): the ones read from the abilities an object has after the layers. */
// Issue 345 (Beorn's Hospitality): and a characteristic-defining ability of power and toughness, which layer 7a reads from the abilities the effect gave.
const GRANTABLE_STATICS = ['cantLoseGame', 'opponentsCantWin', 'characteristicPt'];

/**
 * CR 613.1f: a resolving effect can grant activated, triggered, or mana abilities until end of turn (Backup is one source). D-275
 * (CR 611.2a): a card gives only "You can't lose the game" or "your opponents can't win the game" with no duration, for the rest of the game.
 */
function checkGrantAbility(
  e: Extract<ContinuousNode, { kind: 'grantAbility' }>,
  path: string,
  scope: Scope,
  out: AstIssue[],
): void {
  if (e.duration === 'untilEndOfTurn' || e.duration === 'untilYourNextTurn') {
    if (!Array.isArray(e.abilities) || e.abilities.length === 0) {
      issue(out, `${path}.abilities`, 'a grant gives at least one ability');
      return;
    }
    e.abilities.forEach((ability, i) => {
      if (
        ability?.kind !== 'activated' &&
        ability?.kind !== 'triggered' &&
        ability?.kind !== 'mana'
      ) {
        issue(
          out,
          `${path}.abilities[${i}]`,
          'a temporary grant gives an activated, triggered or mana ability',
        );
        return;
      }
      scope.checkAbility(ability, `${path}.abilities[${i}]`, out);
    });
    return;
  }
  if (e.duration !== 'permanent') {
    issue(
      out,
      path,
      "'grantAbility' until end of turn is written by the engine for Backup, not in a card",
    );
    return;
  }
  if (!Array.isArray(e.abilities) || e.abilities.length === 0) {
    issue(out, `${path}.abilities`, 'a grant gives at least one ability');
    return;
  }
  e.abilities.forEach((a, i) => {
    // CR 613.1f, 605.1a, 611.2a: "becomes a Treasure artifact with \"{T}, Sacrifice this artifact: Add one mana of any color\"": a mana ability given for good.
    if (a?.kind === 'mana') {
      scope.checkAbility(a, `${path}.abilities[${i}]`, out);
      return;
    }
    if (a?.kind !== 'static' || !isOneOf(a.static?.kind, GRANTABLE_STATICS)) {
      issue(
        out,
        `${path}.abilities[${i}]`,
        `an effect gives only a mana ability or the static abilities ${GRANTABLE_STATICS.join(' and ')}`,
      );
      return;
    }
    if (a.static.kind === 'characteristicPt') scope.checkAbility(a, `${path}.abilities[${i}]`, out);
    // The engine reads the given static with no condition (`hasStaticOf`, `derive`): a condition would be dropped, so it is refused.
    if (a.condition !== undefined) {
      issue(
        out,
        `${path}.abilities[${i}].condition`,
        'a static ability an effect gives has no condition: the engine would not check it',
      );
    }
  });
}

/**
 * CR 205.1a, 205.3d: card types replace card types, subtypes replace creature types. With `additive`
 * (CR 205.1b) they are added to what the object has, so a subtype need not be checked against the
 * types in the same node: the object may already be a creature.
 */
/** CR 205.3g, 205.1a: "becomes a Treasure artifact": the card type artifact alone, with artifact types for subtypes. */
function isArtifactBecoming(e: Extract<ContinuousNode, { kind: 'setTypes' }>): boolean {
  return (
    e.additive !== true &&
    Array.isArray(e.types) &&
    e.types.length === 1 &&
    e.types[0] === 'artifact'
  );
}

function checkSetTypes(
  e: Extract<ContinuousNode, { kind: 'setTypes' }>,
  path: string,
  out: AstIssue[],
): void {
  if (e.allCreatureTypes !== undefined) {
    // CR 205.3m, 702.73a: "gain all creature types" is its own effect: added to what the object has, with nothing else to say.
    if (e.allCreatureTypes !== true) {
      issue(out, `${path}.allCreatureTypes`, 'allCreatureTypes must be true when present');
    }
    if (e.types !== undefined || e.subtypes !== undefined || e.additive !== undefined) {
      issue(
        out,
        path,
        'allCreatureTypes adds every creature type alone: no types, subtypes or additive with it',
      );
    }
    if (e.basePt !== undefined) {
      issue(out, `${path}.basePt`, 'allCreatureTypes does not set base power and toughness');
    }
    return;
  }
  if (e.types === undefined && e.subtypes === undefined) {
    issue(out, path, 'setTypes needs types, subtypes or both');
  }
  if (e.additive !== undefined && e.additive !== true) {
    issue(out, `${path}.additive`, 'additive must be true when present (CR 205.1b)');
  }
  checkEnumList(out, `${path}.types`, e.types, CARD_TYPES, 'card type');
  // D-217: the base power and toughness of "becomes a 4/4 artifact creature": whole numbers, on something that is a creature.
  if (e.basePt !== undefined) {
    const { power, toughness } = e.basePt;
    if (!Number.isSafeInteger(power) || !Number.isSafeInteger(toughness)) {
      issue(out, `${path}.basePt`, 'base power and toughness are whole numbers');
    }
    if (e.types?.includes('creature') !== true) {
      issue(out, `${path}.basePt`, 'base power and toughness go with the type creature');
    }
  }
  if (e.subtypes !== undefined) {
    if (!Array.isArray(e.subtypes) || e.subtypes.length === 0) {
      issue(out, `${path}.subtypes`, 'subtypes must be a non-empty list when present');
      return;
    }
    e.subtypes.forEach((s, i) => {
      if (typeof s !== 'string' || s === '') {
        issue(out, `${path}.subtypes[${i}]`, 'empty subtype');
      } else if (
        isNonCreatureSubtype(s) &&
        !BASIC_LAND_TYPE_NAMES.includes(s) &&
        !(isArtifactBecoming(e) && ARTIFACT_TYPES.includes(s))
      ) {
        // The effect replaces creature types, or (D-474, CR 305.7) a land's basic land types, or (CR 205.3g) is an artifact of an artifact type ("becomes a Treasure artifact");
        // replacing another card type's subtypes is not run.
        issue(
          out,
          `${path}.subtypes[${i}]`,
          `${s} is not a creature type or a basic land type, which are all that can be set`,
        );
      }
    });
    // D-474 (CR 305.7): a land's basic land types are set alone: no card type goes with them and no creature type is mixed in.
    const landTypes = e.subtypes.filter((s) => BASIC_LAND_TYPE_NAMES.includes(s));
    if (landTypes.length > 0 && (landTypes.length !== e.subtypes.length || e.types !== undefined)) {
      issue(
        out,
        `${path}.subtypes`,
        'basic land types are set alone: with no card types and no creature types (CR 305.7)',
      );
    }
    // CR 205.1a: without the creature type, creature subtypes do not stay. An additive effect may
    // add a creature type to what already is a creature (CR 205.1b), so it is not held to this.
    if (
      e.additive !== true &&
      Array.isArray(e.types) &&
      !e.types.includes('creature') &&
      !e.types.includes('kindred') &&
      !(isArtifactBecoming(e) && e.subtypes.every((s) => ARTIFACT_TYPES.includes(s)))
    ) {
      issue(out, `${path}.subtypes`, 'creature subtypes need the creature or kindred card type');
    }
  }
}

function checkSetColors(
  e: Extract<ContinuousNode, { kind: 'setColors' }>,
  path: string,
  out: AstIssue[],
): void {
  if (!Array.isArray(e.colors)) {
    issue(out, `${path}.colors`, 'colors must be a list (empty for colorless)');
    return;
  }
  e.colors.forEach((c, i) => {
    if (!isOneOf(c, COLORS)) issue(out, `${path}.colors[${i}]`, `unknown color ${String(c)}`);
  });
  if (new Set(e.colors).size !== e.colors.length) issue(out, `${path}.colors`, 'duplicate color');
  // Issue 159: "in addition to its other colors" adds colors, so an empty list would add nothing.
  if (e.additive !== undefined && e.additive !== true) {
    issue(out, `${path}.additive`, 'additive is true or absent');
  } else if (e.additive === true && e.colors.length === 0) {
    issue(out, `${path}.colors`, 'an additive setColors names at least one color');
  }
}

export function checkContinuousEffect(
  node: ContinuousOrPrevent,
  path: string,
  scope: Scope,
  out: AstIssue[],
): void {
  if (node.kind === 'preventDamage') {
    checkPreventDamage(node, path, scope, out);
    return;
  }
  const e = node;
  // D-110, D-133: "that creature gets +1/+1" (Exalted), "it gains haste until end of turn": the permanent whose
  // event caused the trigger.
  checkAffectedObjects(e.objects, `${path}.objects`, scope, out);
  if (e.kind === 'restrict' && e.duration === 'forAsLongAsYouControlThis') {
    // D-196, CR 611.2b: "for as long as you control this Saga" is a duration of an ability of a permanent.
    if (scope.owner !== 'ability') {
      issue(
        out,
        `${path}.duration`,
        '"for as long as you control this" is the effect of an ability of a permanent',
      );
    }
  } else if (
    (e.kind === 'grantKeyword' ||
      e.kind === 'loseAllAbilities' ||
      (e.kind === 'restrict' && e.duration === 'forAsLongAsThisRemains')) &&
    (e.duration === 'forAsLongAsThisRemains' || e.duration === 'forAsLongAsYouControlThis')
  ) {
    // D-207, CR 611.2b: "for as long as this Saga remains on the battlefield" is a duration of an ability of a permanent.
    if (scope.owner !== 'ability') {
      issue(
        out,
        `${path}.duration`,
        '"for as long as this remains on the battlefield" is the effect of an ability of a permanent',
      );
    }
  } else if (e.kind === 'restrict' && e.duration === 'untilNextUntapStep') {
    // D-517, CR 502.3: the one duration of "doesn't untap during its controller's next untap step".
    if (e.restriction !== 'doesntUntap') {
      issue(
        out,
        `${path}.duration`,
        '"until the next untap step" is the duration of doesntUntap only',
      );
    }
  } else if (e.kind === 'restrict' && e.duration === 'thisCombat') {
    // CR 506.1, 508.1d, 611.2a: the one duration of "attacks this combat if able".
    if (e.restriction !== 'attacksEachCombat') {
      issue(out, `${path}.duration`, '"this combat" is the duration of attacksEachCombat only');
    }
  } else if (e.kind === 'grantAbility' && e.duration === 'untilYourNextTurn') {
    // Issue 145 (Song of Freyalise, CR 611.2a, 500.1): the duration of a temporary grant of an activated, triggered or mana ability (`checkGrantAbility` checks the abilities).
  } else if (!isOneOf(e.duration, DURATIONS)) {
    issue(out, `${path}.duration`, `unknown duration ${JSON.stringify(e.duration)}`);
  }
  switch (e.kind) {
    case 'modifyPt':
    case 'setPt': {
      // D-115: a number, an Amount or a multiple of one, read as the effect resolves (CR 611.2c).
      const name = (stat: string) => (e.kind === 'modifyPt' ? `${stat} change` : `base ${stat}`);
      checkPtAmount(e.power, `${path}.power`, scope, out, name('power'), e.kind === 'modifyPt');
      checkPtAmount(
        e.toughness,
        `${path}.toughness`,
        scope,
        out,
        name('toughness'),
        e.kind === 'modifyPt',
      );
      break;
    }
    case 'loseAllAbilities':
    case 'loseHexproofShroud':
      break;
    case 'setTypes':
      checkSetTypes(e, path, out);
      break;
    case 'setColors':
      checkSetColors(e, path, out);
      break;
    case 'grantAbility':
      checkGrantAbility(e, path, scope, out);
      break;
    case 'grantKeyword':
      // D-653 (CR 604.1): "During your turn, this creature has first strike": only while it is its controller's turn; true or absent, and a keyword without parameters.
      if (e.duringYourTurn !== undefined && e.duringYourTurn !== true) {
        issue(out, `${path}.duringYourTurn`, 'duringYourTurn is true or absent');
      }
      if (e.duringYourTurn === true && e.keyword?.kind === 'protection') {
        issue(
          out,
          `${path}.duringYourTurn`,
          'only a keyword without parameters is given on your turn',
        );
      }
      if (e.keyword?.kind === 'protection') {
        // D-451 (CR 702.16): an effect gives protection from named colors or card types, or from the color of the controller's choice (asked as it resolves).
        // The qualities that read a permanent's choice or a commander (`chosenCardType`, `colorsNotInCommanderIdentity`) need a static ability.
        if (e.keyword.from === 'cardType') {
          checkProtectionTypes(e.keyword.types, `${path}.keyword.types`, out);
        } else if (e.keyword.from === 'color') {
          if (!Array.isArray(e.keyword.colors) || e.keyword.colors.length === 0) {
            issue(out, `${path}.keyword.colors`, 'protection needs at least one color');
          } else {
            checkEnumList(out, `${path}.keyword.colors`, e.keyword.colors, COLORS, 'color');
          }
        } else if (e.keyword.from !== 'colorOfChoice' && e.keyword.from !== 'cardTypeOfChoice') {
          issue(
            out,
            `${path}.keyword`,
            `an effect cannot give protection from ${String((e.keyword as { from: unknown }).from)}: only a static ability can`,
          );
        }
      } else if (!GRANTABLE_KEYWORDS.includes(e.keyword?.kind)) {
        issue(
          out,
          `${path}.keyword`,
          'only keywords without parameters can be granted (and afflict and landwalk, D-472, D-473)',
        );
      } else if (e.keyword?.kind === 'riot') {
        // D-185: riot is applied as a permanent enters; an effect that gives it later would have no choice left to make.
        issue(
          out,
          `${path}.keyword`,
          'riot is given by a static ability of a permanent, not by an effect',
        );
      } else {
        checkGrantedParameter(e.keyword, `${path}.keyword`, out);
      }
      break;
    case 'restrict':
      // D-094: "can't block", "can't be blocked" and "attacks each combat if able" last until end of
      // turn; "doesn't untap" and "can't be countered" are not effects the engine runs.
      if (e.blockers !== undefined) {
        // CR 509.1b: "can't be blocked this turn except by Spirits": the creatures that can't block, only of `cantBeBlocked`, as a filter of creatures as they are (no zone, owner or stack kind).
        if (e.restriction !== 'cantBeBlocked') {
          issue(out, `${path}.blockers`, "blockers go with the restriction 'cantBeBlocked'");
        } else if (typeof e.blockers !== 'object' || e.blockers === null) {
          issue(
            out,
            `${path}.blockers`,
            'blockers is a filter of the creatures that can not block',
          );
        } else {
          checkFilter(e.blockers, `${path}.blockers`, out);
          if (
            filterSome(
              e.blockers,
              (m) => m.zone !== undefined || m.stackKind !== undefined || m.owner !== undefined,
            )
          ) {
            issue(
              out,
              `${path}.blockers`,
              'blockers names creatures by what they are: no zone, stackKind or owner',
            );
          }
        }
      }
      if (e.restriction === 'doesntUntap') {
        // D-517: only with the duration that ends at the next untap step.
        if (e.duration !== 'untilNextUntapStep') {
          issue(
            out,
            `${path}.duration`,
            `an effect can give only ${RESTRICTABLE_BY_EFFECT.join(', ')} or doesntUntap with the duration untilNextUntapStep, not doesntUntap with ${JSON.stringify(e.duration)}`,
          );
        }
      } else if (!isOneOf(e.restriction, RESTRICTABLE_BY_EFFECT)) {
        issue(
          out,
          `${path}.restriction`,
          `an effect can give only ${RESTRICTABLE_BY_EFFECT.join(', ')}, not ${JSON.stringify(e.restriction)}`,
        );
      }
      break;
    default: {
      const unreachable: never = e;
      throw new Error(`Unhandled continuous effect ${JSON.stringify(unreachable)}`);
    }
  }
}
