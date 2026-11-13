/**
 * Validation of the "as long as" condition of a static ability (D-133, CR 611.3a). `derive` reads it while it is working out
 * the characteristics of permanents, so it may read only what no layer 7 effect changes (CR 613.8), and only the static
 * abilities that act in a layer or are read where a rule acts (`modifyPt`, `grantKeyword`, `grantAbility`, `restriction`)
 * go through `derive` at all: any other static ability would silently ignore a condition, so it is refused.
 */
import type { Condition, ObjectFilter, StaticEffect } from './types';
import { type AstIssue, issue, kindOf } from './validate-base';
import {
  checkCondition,
  checkFilter,
  filterSome,
  readsCombatOrSource,
  readsKeywords,
} from './validate-parts';

/** The static effects that take a condition. */
const CONDITIONAL_STATICS: readonly StaticEffect['kind'][] = [
  'modifyPt',
  'grantKeyword',
  'grantAbility',
  'restriction',
  // D-133: read where the attackers are declared, with `evaluateCondition` (`rules/attack-tax.ts`).
  'attackTax',
  // D-133: read as the spell is cast, with `evaluateCondition` (`rules/legality.ts`).
  'castFromGraveyard',
  // D-149: "You can't cast ~ during your first, second, or third turns of the game": read as the spell is cast (`rules/cast-restrictions.ts`).
  'cantCastThis',
  // D-179: "As long as this Equipment is attached to a creature, your opponents can't cast spells during your turn": read as a spell is cast.
  'opponentsCantCastOnYourTurn',
  // D-151 (Celebration): "As long as two or more nonland permanents entered ... this turn, ~ is a Dragon with base power and toughness 4/4": the
  // layer 4 and 7b effects of the permanent, with a condition that reads no characteristic (`PLAIN_CONDITIONS`).
  'setTypes',
  'setColors',
  'setPt',
  // D-229: "As long as there are fewer than eight cards in your graveyard, ~ isn't a creature": layer 4, a plain condition.
  'loseTypes',
];

/** The conditions a static ability that works in layer 4 or 5 may have: they read no characteristics, so they cannot depend on the layers (CR 613.8). */
const PLAIN_CONDITIONS: readonly Condition['kind'][] = [
  'lifeTotal',
  'ownTurnNumber',
  'enteredThisTurn',
  'playerDealtDamage',
  'lifeGainedThisTurn',
  'cardsInGraveyard',
  'cardsInLibrary',
  'controlCommander',
  'yourTurn',
  'and',
  'or',
  'not',
];

function plainOnly(
  c: Condition,
  path: string,
  out: AstIssue[],
  owner = 'a static ability that changes types or colors',
): void {
  if (!PLAIN_CONDITIONS.includes(c?.kind)) {
    issue(
      out,
      path,
      `${owner} may only have a condition that reads no characteristic (a life total, a turn, what entered or what damage was dealt this turn, the cards in a zone, a commander), not ${kindOf(c)}`,
    );
    return;
  }
  if (c.kind === 'and' || c.kind === 'or') {
    for (const [i, t] of (c.terms ?? []).entries()) plainOnly(t, `${path}.terms[${i}]`, out, owner);
  } else if (c.kind === 'not') {
    plainOnly(c.term, `${path}.term`, out, owner);
  }
}

/**
 * The `while` of a `skipDraw` replacement (D-332): read by `plainConditionHolds` as the draw would happen, for the controller of the permanent, with no
 * trigger, source or earlier instruction, so it may only be a plain condition (the same set a layer 4 static ability may read).
 */
export function checkPlainCondition(c: Condition, path: string, out: AstIssue[]): void {
  checkCondition(c, path, out);
  plainOnly(c, path, out, 'a replacement of a draw');
}

/** Why a filter cannot be read by `derive` without the layers it is part of (D-111, D-120, D-131, D-133). */
function filterProblem(f: ObjectFilter): string | null {
  if (filterSome(f, readsCombatOrSource)) return 'the combat or the power of the source';
  if (filterSome(f, readsKeywords)) return 'a keyword';
  if (filterSome(f, (m) => m.power !== undefined || m.toughness !== undefined)) {
    return 'a power or a toughness';
  }
  return null;
}

function walk(c: Condition, path: string, out: AstIssue[]): void {
  switch (c?.kind) {
    case 'controlsAtLeast':
    case 'thisMatches': {
      const problem = filterProblem(c.filter);
      if (problem !== null) {
        issue(
          out,
          `${path}.filter`,
          `a static ability's condition cannot read ${problem}: it would depend on the layer it applies in (CR 613.8)`,
        );
      }
      return;
    }
    case 'objectMatches': {
      // D-179: "as long as this Equipment is attached to a creature": the permanent this one is attached to matches the filter.
      if (c.inZone !== undefined) {
        issue(out, `${path}.inZone`, "a static ability's condition does not read inZone (D-412)");
      }
      if (kindOf(c.of) !== 'attached') {
        issue(
          out,
          `${path}.of`,
          "a static ability's condition reads the permanent it is attached to (attached), not another object",
        );
      }
      const problem = filterProblem(c.filter);
      if (problem !== null) {
        issue(
          out,
          `${path}.filter`,
          `a static ability's condition cannot read ${problem}: it would depend on the layer it applies in (CR 613.8)`,
        );
      }
      return;
    }
    case 'yourTurn': // D-206: the active player, which no layer changes
    case 'controlCommander':
    case 'lifeTotal':
    case 'ownTurnNumber': // D-149: the turns the controller has had, which no layer changes
    case 'enteredThisTurn': // D-151: the turn log, which no layer changes
    case 'playerDealtDamage':
    case 'lifeGainedThisTurn': // D-252: the turn log, which no layer changes
    case 'cardsInGraveyard': // D-229: the cards in a zone, which no layer changes
    case 'cardsInLibrary': // D-331: the cards in a zone, which no layer changes
    case 'chosenOption': // D-151: what the permanent chose as it entered
    case 'paired': // D-286: the pair, read from the object table and no characteristic (`rules/pairing.ts`)
      return;
    case 'playerHasDesignation':
      if (
        !['you', 'eachPlayer', 'eachOpponent', 'all', 'controllerOf', 'ownerOf'].includes(
          kindOf(c.player),
        )
      ) {
        issue(
          out,
          `${path}.player`,
          'a static ability names players by you, each player or each opponent',
        );
      }
      return;
    case 'and':
    case 'or':
      for (const [i, t] of (c.terms ?? []).entries()) walk(t, `${path}.terms[${i}]`, out);
      return;
    case 'not':
      walk(c.term, `${path}.term`, out);
      return;
    default:
      issue(
        out,
        path,
        `a static ability's condition is a count of permanents, a life total, a commander, a designation or whether this permanent matches a filter, not ${kindOf(c)}`,
      );
  }
}

/**
 * The plain checks of a static ability's condition. `objectMatches` (D-179, "as long as this Equipment is attached to a creature") is read by the
 * static ability itself, not by a resolving effect, so its filter is checked here and `walk` checks what it names.
 */
function checkStaticTerm(c: Condition, path: string, out: AstIssue[]): void {
  if (c?.kind === 'objectMatches') {
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
  } else if (c?.kind === 'and' || c?.kind === 'or') {
    for (const [i, t] of (c.terms ?? []).entries()) checkStaticTerm(t, `${path}.terms[${i}]`, out);
  } else if (c?.kind === 'not') {
    checkStaticTerm(c.term, `${path}.term`, out);
  } else {
    checkCondition(c, path, out);
  }
}

/** The condition of the static ability `s`, if it has one. */
export function checkStaticCondition(
  s: StaticEffect,
  condition: Condition | undefined,
  path: string,
  out: AstIssue[],
): void {
  if (condition === undefined) return;
  // D-181, CR 601.2f: "This spell costs {3} less to cast if you control a creature with power 4 or greater": the spell's own reduction, read as its
  // cost is determined (`rules/cast-cost.ts`), not by `derive`, so it may read the game as an `amountIs` condition does, power included.
  if (s?.kind === 'costReduction') {
    if (kindOf(s.spells) !== 'this') {
      issue(
        out,
        `${path}.condition`,
        'only the spell\'s own cost reduction ("this spell costs {3} less to cast if ...") takes a condition',
      );
      return;
    }
    checkCondition(condition, `${path}.condition`, out);
    return;
  }
  // D-408, CR 601.3b, 601.3d: "You may cast this spell as though it had flash if it targets a commander": the spell's own permission, read as the spell is cast
  // (`rules/flash-targets.ts`), not by `derive`. A permanent's own `castAsThoughFlash` takes no condition.
  if (s?.kind === 'castAsThoughFlash') {
    if (kindOf(s.spells) !== 'this') {
      issue(
        out,
        `${path}.condition`,
        'only the spell\'s own permission ("You may cast this spell as though it had flash if ...") takes a condition',
      );
      return;
    }
    checkCondition(condition, `${path}.condition`, out);
    return;
  }
  if (!CONDITIONAL_STATICS.includes(s?.kind)) {
    issue(
      out,
      `${path}.condition`,
      `a "${kindOf(s)}" static ability takes no condition: only +N/+N, keyword and mana-ability grants and restrictions apply "as long as" something is true`,
    );
    return;
  }
  // CR 113.6g: "can't be countered" is the spell's own ability, read on the stack, not through `derive`'s battlefield pass.
  if (s.kind === 'restriction' && s.restriction === 'cantBeCountered') {
    issue(
      out,
      `${path}.condition`,
      '"can\'t be countered" takes no condition: it works on the stack',
    );
    return;
  }
  checkStaticTerm(condition, `${path}.condition`, out);
  walk(condition, `${path}.condition`, out);
  if (s.kind === 'setTypes' || s.kind === 'setColors' || s.kind === 'loseTypes')
    plainOnly(condition, `${path}.condition`, out);
}
