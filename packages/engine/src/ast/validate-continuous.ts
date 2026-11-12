/**
 * Validation of the continuous-effect nodes (CR 611.2, 613): "gets +N/+N" (or "+X/+0", "-X/-X", "+1/+1 for each
 * artifact you control": amounts, D-115), "has base power and
 * toughness N/N", "loses all abilities", "becomes a [creature type]" or "an [card type]", "becomes
 * [color]" and "gains [keyword]". `validate.ts` hands them to `checkEffect` (validate-parts.ts)
 * through `Scope.checkContinuous`, because this file needs that one's building blocks.
 */
import { CARD_TYPES, COLORS, isNonCreatureSubtype } from '../characteristics';
import { GRANTABLE_KEYWORDS, RESTRICTABLE_BY_EFFECT } from './features';
import type { Effect } from './types';
import {
  type AstIssue,
  checkAffectedObjects,
  checkEnumList,
  checkPtAmount,
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

/** The static abilities an effect may give for good (D-981): the ones read from the abilities an object has after the layers. */
const GRANTABLE_STATICS = ['cantLoseGame', 'opponentsCantWin'];

/**
 * D-230: Backup's grant (until end of turn) is written by the engine from the abilities printed below the keyword, never in a card. D-981
 * (CR 611.2a): a card gives "You can't lose the game and your opponents can't win the game" with no duration, for the rest of the game; no other
 * ability is given by an effect (an activated or a triggered ability would need its own tests).
 */
function checkGrantAbility(
  e: Extract<ContinuousNode, { kind: 'grantAbility' }>,
  path: string,
  out: AstIssue[],
): void {
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
    if (a?.kind !== 'static' || !isOneOf(a.static?.kind, GRANTABLE_STATICS)) {
      issue(
        out,
        `${path}.abilities[${i}]`,
        `an effect gives only the static abilities ${GRANTABLE_STATICS.join(' and ')}`,
      );
      return;
    }
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
function checkSetTypes(
  e: Extract<ContinuousNode, { kind: 'setTypes' }>,
  path: string,
  out: AstIssue[],
): void {
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
      } else if (isNonCreatureSubtype(s)) {
        // The effect replaces creature types; replacing another card type's subtypes is not run.
        issue(
          out,
          `${path}.subtypes[${i}]`,
          `${s} is not a creature type, which is all that can be set`,
        );
      }
    });
    // CR 205.1a: without the creature type, creature subtypes do not stay. An additive effect may
    // add a creature type to what already is a creature (CR 205.1b), so it is not held to this.
    if (
      e.additive !== true &&
      Array.isArray(e.types) &&
      !e.types.includes('creature') &&
      !e.types.includes('kindred')
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
    e.kind === 'grantKeyword' &&
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
      break;
    case 'setTypes':
      checkSetTypes(e, path, out);
      break;
    case 'setColors':
      checkSetColors(e, path, out);
      break;
    case 'grantAbility':
      checkGrantAbility(e, path, out);
      break;
    case 'grantKeyword':
      if (!GRANTABLE_KEYWORDS.includes(e.keyword?.kind)) {
        issue(out, `${path}.keyword`, 'only keywords without parameters can be granted');
      } else if (e.keyword?.kind === 'riot') {
        // D-185: riot is applied as a permanent enters; an effect that gives it later would have no choice left to make.
        issue(
          out,
          `${path}.keyword`,
          'riot is given by a static ability of a permanent, not by an effect',
        );
      }
      break;
    case 'restrict':
      // D-094: "can't block", "can't be blocked" and "attacks each combat if able" last until end of
      // turn; "doesn't untap" and "can't be countered" are not effects the engine runs.
      if (!isOneOf(e.restriction, RESTRICTABLE_BY_EFFECT)) {
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
