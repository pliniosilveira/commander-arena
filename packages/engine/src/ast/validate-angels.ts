/**
 * Checks of the Angels slice (D-149): the shapes of the triggers, replacements, statics, conditions, costs and effects that slice adds, and
 * what they need of the card they are printed on. `validate.ts` and `validate-parts.ts` call into this file for the kinds they do not
 * know themselves.
 */
import type { Amount, ObjectFilter, Replacement, StaticEffect, Trigger } from './types';
import { isCount, isOneOf, kindOf } from './validate-base';
import {
  type AstIssue,
  checkCosts,
  checkFilter,
  checkManaSpentType,
  checkReplacementToken,
  checkStateAmount,
  filterSome,
  issue,
} from './validate-parts';
import { checkPlainCondition } from './validate-static-condition';

/** The trigger kinds D-149 adds. True when `t` is one of them (it was checked here). */
export function checkAngelsTrigger(t: Trigger, path: string, out: AstIssue[]): boolean {
  switch (t?.kind) {
    case 'lifeGained':
      if (!isOneOf(t.who, ['you', 'opponent', 'any'])) {
        issue(out, `${path}.who`, `unknown player ${String(t.who)}`);
      }
      if (t.firstEachTurn !== undefined && t.firstEachTurn !== true) {
        issue(out, `${path}.firstEachTurn`, 'firstEachTurn must be true when present');
      }
      return true;
    case 'countersAdded':
      checkCountersAddedSubject(t, path, out);
      if (t.counter !== undefined && (typeof t.counter !== 'string' || t.counter === '')) {
        issue(out, `${path}.counter`, 'counter name must be non-empty when present');
      }
      if (!isOneOf(t.by, ['you', 'any'])) {
        issue(out, `${path}.by`, `unknown player ${String(t.by)}`);
      }
      return true;
    case 'attackBatch':
      if (!isOneOf(t.who, ['you', 'opponent', 'any'])) {
        issue(out, `${path}.who`, `unknown player ${String(t.who)}`);
      }
      // D-187: "Whenever you attack" is one or more creatures declared: `atLeast` 1.
      if (!isCount(t.atLeast) || t.atLeast < 1) {
        issue(out, `${path}.atLeast`, 'atLeast is a whole number of 1 or more');
      }
      if (t.what !== undefined) {
        checkFilter(t.what, `${path}.what`, out);
        if (
          filterSome(
            t.what,
            (f) =>
              f.zone !== undefined ||
              f.owner !== undefined ||
              f.stackKind !== undefined ||
              f.attacking !== undefined ||
              f.attackingYou !== undefined ||
              f.attackingOpponents !== undefined ||
              f.attackingOrBlocking !== undefined,
          )
        ) {
          issue(
            out,
            `${path}.what`,
            'the creatures are the ones declared as attackers: no zone, owner, stackKind or attacking',
          );
        }
      }
      return true;
    default:
      return false;
  }
}

function checkCountersAddedSubject(
  t: Extract<Trigger, { kind: 'countersAdded' }>,
  path: string,
  out: AstIssue[],
): void {
  const what = t.what as unknown;
  if (what === null || typeof what !== 'object') {
    issue(out, `${path}.what`, 'countersAdded names the permanent that gets the counters');
    return;
  }
  const kind = (what as { kind?: unknown }).kind;
  if (kind === 'this') return;
  if (kind === 'attached') {
    issue(out, `${path}.what`, 'countersAdded names this permanent or a filter');
    return;
  }
  checkFilter(what as never, `${path}.what`, out);
}

/** The replacement kinds D-149 adds. True when `r` is one of them (it was checked here). */
export function checkAngelsReplacement(r: Replacement, path: string, out: AstIssue[]): boolean {
  switch (r?.kind) {
    case 'lifeGainBonus':
      if (!isCount(r.amount) || r.amount < 1) {
        issue(out, `${path}.amount`, 'the extra life is a positive whole number');
      }
      return true;
    case 'tokensInstead':
      // D-219: the tokens that would be created, as they would be on the battlefield; and the token that is created instead or as well.
      checkEnteringFilter(r.what, `${path}.what`, out);
      if (!isOneOf(r.mode, ['thatMany', 'plus'])) {
        issue(out, `${path}.mode`, `unknown way ${JSON.stringify(r.mode)}`);
      }
      checkReplacementToken(r.token, `${path}.token`, out);
      return true;
    case 'othersEnterWithCounters':
      checkEnteringFilter(r.what, `${path}.what`, out);
      if (filterSome(r.what, (f) => f.power !== undefined || f.toughness !== undefined)) {
        issue(
          out,
          `${path}.what`,
          'a counter changes power and toughness: the permanents that get one are not chosen by them',
        );
      }
      if (typeof r.counter !== 'string' || r.counter === '') {
        issue(out, `${path}.counter`, 'counter name must be non-empty');
      }
      if (kindOf(r.count) === 'countOf') {
        checkStateAmount(r.count as Amount, `${path}.count`, out, 'an enters-with count');
      } else if (kindOf(r.count) === 'manaSpent') {
        // D-183: the mana spent to cast the entering permanent, all of it or from sources of a card type.
        checkManaSpentType(
          (r.count as { fromType?: string }).fromType,
          `${path}.count.fromType`,
          out,
          (r.count as { snow?: unknown }).snow,
        );
      } else if (!isCount(r.count) || r.count < 1) {
        issue(out, `${path}.count`, 'counter count must be a positive integer or a countOf');
      }
      return true;
    case 'skipDraw':
      // D-332: the draw of the controller; the condition is read as it would happen, for the controller, with nothing else.
      if (r.while !== undefined) checkPlainCondition(r.while, `${path}.while`, out);
      return true;
    case 'groupEntersUntapped':
      // D-179: tapped is a state, not something the entering permanent has before it enters; the other fields are read as for the counters.
      checkEnteringFilter(r.what, `${path}.what`, out);
      return true;
    default:
      return false;
  }
}

/** The filter of a replacement that reads the permanent that enters (D-149, D-179): it is not on the battlefield yet. */
function checkEnteringFilter(what: ObjectFilter, path: string, out: AstIssue[]): void {
  checkFilter(what, path, out);
  if (
    filterSome(
      what,
      (f) =>
        f.zone !== undefined ||
        f.owner !== undefined ||
        f.stackKind !== undefined ||
        f.attacking !== undefined ||
        f.attackingYou !== undefined ||
        f.attackingOpponents !== undefined ||
        f.attackingOrBlocking !== undefined ||
        f.manaValueX !== undefined ||
        f.powerLessThanSource !== undefined ||
        f.controllerDealtDamageBySource !== undefined ||
        f.tapped !== undefined,
    )
  ) {
    issue(
      out,
      path,
      'the permanent that enters is not on the battlefield yet: no zone, owner, stackKind, tapped, X or combat',
    );
  }
}

/** The static effects D-149 adds. True when `s` is one of them (it was checked here). */
export function checkAngelsStatic(s: StaticEffect, path: string, out: AstIssue[]): boolean {
  switch (s?.kind) {
    case 'preventDamageToThis':
      if (kindOf(s.subject) !== 'this') {
        issue(out, `${path}.subject`, 'preventDamageToThis is about the permanent itself ("this")');
      }
      if (!isOneOf(s.scope, ['all', 'combat', 'noncombat'])) {
        issue(out, `${path}.scope`, `unknown scope ${JSON.stringify(s.scope)}`);
      }
      return true;
    case 'blockTax':
      checkBlockTax(s, path, out);
      return true;
    case 'playerHexproof':
    case 'cantLoseGame':
    case 'opponentsCantWin':
      return true;
    case 'doubleTriggers':
      // D-220 (CR 603.2d): the permanents whose triggered abilities trigger again: a group on the battlefield, or the permanent this is attached to.
      if (s.subject?.kind === 'filter') {
        checkEnteringFilter(s.subject.filter, `${path}.subject.filter`, out);
      } else if (s.subject?.kind !== 'attached') {
        issue(out, `${path}.subject`, 'the permanents are a group or the one this is attached to');
      }
      return true;
    case 'cantCastThis':
      // The condition (checked with the ability) says when; without one the card could never be cast.
      return true;
    case 'opponentsCantCastOnYourTurn':
      // D-179: no parameters; an optional condition is read when a spell is cast.
      return true;
    default:
      return false;
  }
}

function checkBlockTax(
  s: Extract<StaticEffect, { kind: 'blockTax' }>,
  path: string,
  out: AstIssue[],
): void {
  if (!Array.isArray(s.cost) || s.cost.length === 0) {
    issue(out, `${path}.cost`, 'a block tax needs a cost');
    return;
  }
  checkCosts(s.cost, `${path}.cost`, out);
  let symbols = 0;
  s.cost.forEach((c, i) => {
    if (c?.kind !== 'mana') {
      issue(out, `${path}.cost[${i}]`, 'a block tax may be mana only in this engine');
    } else if (Array.isArray(c.symbols)) {
      symbols += c.symbols.length;
      if (c.symbols.includes('X'))
        issue(out, `${path}.cost[${i}]`, 'X in a block tax is not supported');
    }
  });
  if (symbols === 0 && s.cost.every((c) => c?.kind === 'mana')) {
    issue(out, `${path}.cost`, 'a block tax needs at least one mana symbol');
  }
  if (s.whileAttacking !== undefined && s.whileAttacking !== true) {
    issue(out, `${path}.whileAttacking`, 'whileAttacking is true or absent');
  }
}
