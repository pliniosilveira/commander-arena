/**
 * Checks of the Angels slice (D-149): the shapes of the triggers, replacements, statics, conditions, costs and effects that slice adds, and
 * what they need of the card they are printed on. `validate.ts` and `validate-parts.ts` call into this file for the kinds they do not
 * know themselves.
 */

import { CARD_TYPES } from '../characteristics';
import type { Amount, Condition, ObjectFilter, Replacement, StaticEffect, Trigger } from './types';
import { checkProtectionTypes } from './validate-attach';
import { isCount, isOneOf, kindOf } from './validate-base';
import {
  type AstIssue,
  checkCondition,
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
    case 'lifeLost':
      if (!isOneOf(t.who, ['you', 'opponent', 'any'])) {
        issue(out, `${path}.who`, `unknown player ${String(t.who)}`);
      }
      if (t.firstEachTurn !== undefined && t.firstEachTurn !== true) {
        issue(out, `${path}.firstEachTurn`, 'firstEachTurn must be true when present');
      }
      if (t.kind === 'lifeLost' && t.batch !== undefined) {
        if (t.batch !== true) issue(out, `${path}.batch`, 'batch must be true when present');
        if (t.who === 'you')
          issue(out, `${path}.batch`, 'a batch of life loss is of other players');
        if (t.firstEachTurn === true) {
          issue(out, `${path}.batch`, 'batch does not go with firstEachTurn');
        }
      }
      return true;
    case 'lastCounterRemoved':
      // CR 702.63a: the permanent the ability belongs to, and the kind of counter it is about.
      if ((t.what as { kind?: unknown } | null)?.kind !== 'this') {
        issue(out, `${path}.what`, 'lastCounterRemoved names this permanent');
      }
      if (typeof t.counter !== 'string' || t.counter === '') {
        issue(out, `${path}.counter`, 'counter name must be non-empty');
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
      // Issue 121: "When the twelfth hour counter is put on ~": a kind of counter and a number of 2 or more.
      if (t.reaches !== undefined) {
        if (!Number.isSafeInteger(t.reaches) || t.reaches < 2) {
          issue(out, `${path}.reaches`, 'reaches is a whole number of 2 or more');
        }
        if (t.counter === undefined) {
          issue(out, `${path}.counter`, 'reaches needs the kind of counter');
        }
      }
      // Flourishing Defenses: "Whenever a -1/-1 counter is put on a creature" triggers once for each counter.
      if (t.each !== undefined) {
        if (t.each !== true) issue(out, `${path}.each`, 'each must be true when present');
        if (t.reaches !== undefined) issue(out, `${path}.each`, 'each does not go with reaches');
      }
      return true;
    case 'playerAttacksOpponent':
      // D-648: no parameters.
      return true;
    case 'unblockedAttackBatch':
      // CR 509.1h: the creatures of an opponent attacking you.
      if (t.who !== 'opponent') {
        issue(out, `${path}.who`, "unblockedAttackBatch is about the creatures of an 'opponent'");
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
      if (t.attackedEnchantedPlayer !== undefined && t.attackedEnchantedPlayer !== true) {
        issue(
          out,
          `${path}.attackedEnchantedPlayer`,
          'attackedEnchantedPlayer is true when present',
        );
      }
      if (t.eachAttackedPlayer !== undefined && t.eachAttackedPlayer !== true) {
        issue(out, `${path}.eachAttackedPlayer`, 'eachAttackedPlayer is true when present');
      }
      if (t.eachAttackedPlayer === true && t.attackedEnchantedPlayer === true) {
        issue(
          out,
          `${path}.eachAttackedPlayer`,
          'eachAttackedPlayer does not go with attackedEnchantedPlayer',
        );
      }
      if (t.what !== undefined) {
        checkFilter(t.what, `${path}.what`, out, undefined, undefined, { sourceOk: true });
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
              f.attackingOrBlocking !== undefined ||
              f.blocking !== undefined ||
              f.unblocked !== undefined,
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
    case 'lifeGainDouble':
      return true;
    case 'countersPlus':
      // CR 614.1a, 122.6: the permanents that get more counters of one kind, and how many more.
      checkEnteringFilter(r.what, `${path}.what`, out);
      if (typeof r.counter !== 'string' || r.counter === '') {
        issue(out, `${path}.counter`, 'counter name must be non-empty');
      }
      if (!isCount(r.extra) || r.extra < 1) {
        issue(out, `${path}.extra`, 'the extra counters are a positive whole number');
      }
      return true;
    case 'tokensInstead':
      // D-219: the tokens that would be created, as they would be on the battlefield; and the token that is created instead or as well.
      checkEnteringFilter(r.what, `${path}.what`, out);
      if (!isOneOf(r.mode, ['thatMany', 'plus', 'double'])) {
        issue(out, `${path}.mode`, `unknown way ${JSON.stringify(r.mode)}`);
      }
      if (r.mode === 'double') {
        // D-378 (CR 614.1a): "twice that many of those tokens" makes more of the tokens `what` names, not a token of its own.
        if ((r as { token?: unknown }).token !== undefined) {
          issue(out, `${path}.token`, 'a doubling of tokens makes no token of its own');
        }
      } else {
        checkReplacementToken(r.token, `${path}.token`, out);
      }
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
      if (['countOf', 'enteredThisTurn', 'diedThisTurn'].includes(kindOf(r.count))) {
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
    case 'keepOneLoyalty': {
      // CR 614.1a, 120.3c (Deification): the planeswalkers the controller controls, and an "as long as" the engine reads as the damage is dealt.
      checkFilter(r.planeswalkers, `${path}.planeswalkers`, out);
      if (r.planeswalkers?.controller !== 'you') {
        issue(
          out,
          `${path}.planeswalkers`,
          'the planeswalkers are those the controller controls (controller: you)',
        );
      }
      if (r.while !== undefined) checkKeepOneLoyaltyCondition(r.while, `${path}.while`, out);
      return true;
    }
    case 'drawInstead':
      // D-379 (CR 614.1a, 614.11): the draws of the controller are replaced by more draws, all but the first of each draw step (the only form the engine runs).
      if (!Number.isInteger(r.count) || r.count < 2) {
        issue(out, `${path}.count`, 'the draws made instead are a whole number of two or more');
      }
      if (r.exceptFirstInDrawStep !== true) {
        issue(
          out,
          `${path}.exceptFirstInDrawStep`,
          'only a replacement of every draw but the first of the draw step is run',
        );
      }
      return true;
    case 'groupEntersUntapped':
    case 'groupEntersTapped':
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
        f.blocking !== undefined ||
        f.unblocked !== undefined ||
        f.manaValueX !== undefined ||
        f.powerLessThanSource !== undefined ||
        f.powerGreaterThanSource !== undefined ||
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
      if (s.removeCounter !== undefined && !isOneOf(s.removeCounter, ['+1/+1', '-1/-1'])) {
        issue(out, `${path}.removeCounter`, 'removeCounter is a +1/+1 or a -1/-1 counter');
      }
      return true;
    case 'blockTax':
      checkBlockTax(s, path, out);
      return true;
    case 'playerHexproof':
    case 'cantLoseGame':
    case 'opponentsCantWin':
      return true;
    case 'playerProtection':
      // CR 702.16 (D-376): the chosen card type (the card must ask the question, `validate-chosen.ts`) or card types it names.
      if (s.from === 'cardType') checkProtectionTypes(s.types, `${path}.types`, out);
      else if (s.from !== 'chosenCardType') {
        issue(
          out,
          `${path}.from`,
          `unknown protection quality ${String((s as { from: unknown }).from)}`,
        );
      }
      return true;
    case 'cantGainLife':
      // CR 119.7 (D-363): the opponents of the controller, or every player.
      if (s.who !== 'opponents' && s.who !== 'players') {
        issue(
          out,
          `${path}.who`,
          'cantGainLife is said of the opponents of the controller or of the players',
        );
      }
      return true;
    case 'damageCantBePrevented':
    case 'damageAsThoughWither':
      return true;
    case 'cantBeSacrificed':
      // CR 701.21a: said of the permanent itself, with nothing to check.
      return true;
    case 'cantHaveCounters':
      // D-380 (CR 122.6): the permanents that can't have the counter: this one, the one this is attached to, or a group on the battlefield.
      if (s.subject?.kind === 'filter') {
        checkEnteringFilter(s.subject.filter, `${path}.subject.filter`, out);
      } else if (s.subject?.kind !== 'attached' && s.subject?.kind !== 'this') {
        issue(
          out,
          `${path}.subject`,
          'the permanents are a group, this one or the one this is attached to',
        );
      }
      if (typeof s.counter !== 'string' || s.counter === '') {
        issue(out, `${path}.counter`, 'counter name must be non-empty');
      }
      return true;
    case 'doubleTriggers':
      // D-220 (CR 603.2d): the permanents whose triggered abilities trigger again: a group on the battlefield, or the permanent this is attached to.
      if (s.subject?.kind === 'filter') {
        checkEnteringFilter(s.subject.filter, `${path}.subject.filter`, out);
      } else if (s.subject?.kind !== 'attached') {
        issue(out, `${path}.subject`, 'the permanents are a group or the one this is attached to');
      }
      // D-339 (CR 603.2d): the cause is the controller casting or copying a spell the filter names, which is a filter of spells.
      if (s.cause !== undefined) {
        if (kindOf(s.cause) === 'creatureAttacks' || kindOf(s.cause) === 'permanentEnters') {
          // Issue 81 (CR 603.2d): a creature attacking, no parameter. Issue 105: the entering permanent may be limited to card types.
          const entering = (s.cause as { entering?: unknown }).entering;
          if (
            entering !== undefined &&
            (kindOf(s.cause) !== 'permanentEnters' ||
              !Array.isArray(entering) ||
              entering.length === 0 ||
              !entering.every((t) => isOneOf(t, CARD_TYPES)))
          ) {
            issue(out, `${path}.cause.entering`, 'entering is a non-empty list of card types');
          }
        } else if (kindOf(s.cause) !== 'castOrCopySpell') {
          issue(
            out,
            `${path}.cause`,
            'the cause of an additional trigger is castOrCopySpell, creatureAttacks or permanentEnters',
          );
        } else {
          const spell = (s.cause as Extract<typeof s.cause, { kind: 'castOrCopySpell' }>).spell;
          if (spell === undefined || spell.stackKind !== 'spell') {
            issue(
              out,
              `${path}.cause.spell`,
              'the spell is a filter of spells (stackKind "spell")',
            );
          } else {
            checkFilter(spell, `${path}.cause.spell`, out);
          }
        }
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

const LOYALTY_FLOOR_CONDITIONS = [
  'controlsAtLeast',
  'lifeTotal',
  'controlCommander',
  'cardsInGraveyard',
  'cardsInLibrary',
  'yourTurn',
  'and',
  'or',
  'not',
] as const;

/** The `while` of a `keepOneLoyalty` (CR 614.1a): read with `evaluateCondition` for the controller of the permanent as the damage is dealt, with no trigger or earlier instruction. */
function checkKeepOneLoyaltyCondition(c: Condition, path: string, out: AstIssue[]): void {
  checkCondition(c, path, out);
  if (!(LOYALTY_FLOOR_CONDITIONS as readonly string[]).includes(c?.kind)) {
    issue(out, path, `a keepOneLoyalty condition cannot read ${kindOf(c)}`);
    return;
  }
  if (c.kind === 'and' || c.kind === 'or') {
    for (const [i, t] of (c.terms ?? []).entries()) {
      checkKeepOneLoyaltyCondition(t, `${path}.terms[${i}]`, out);
    }
  } else if (c.kind === 'not') {
    checkKeepOneLoyaltyCondition(c.term, `${path}.term`, out);
  }
}
