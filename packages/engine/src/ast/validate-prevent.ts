/**
 * Validation of the `preventDamage` effect (CR 615): a shield on a recipient, for a scope of damage,
 * of all damage or the next N, optionally only for damage from one source (CR 609.7a). `validate.ts`
 * reaches it through `Scope.checkContinuous`, because this file needs the building blocks of
 * `validate-parts.ts`.
 */
import type { Effect } from './types';
import { isOneOf, kindOf } from './validate-base';
import {
  type AstIssue,
  checkDamageRecipient,
  checkFilter,
  checkRef,
  checkReplacementToken,
  isCount,
  issue,
  type Scope,
} from './validate-parts';

type PreventNode = Extract<Effect, { kind: 'preventDamage' }>;

export function checkPreventDamage(
  e: PreventNode,
  path: string,
  scope: Scope,
  out: AstIssue[],
): void {
  if (!isOneOf(e.scope, ['all', 'combat', 'noncombat'])) {
    issue(out, `${path}.scope`, `unknown prevention scope ${JSON.stringify(e.scope)}`);
  }
  if (e.amount !== 'all' && !(isCount(e.amount) && e.amount >= 1)) {
    issue(out, `${path}.amount`, "amount must be 'all' or a positive integer");
  }
  if (e.duration === 'forAsLongAsThisRemains') {
    // D-207, CR 611.2b: "for as long as this Saga remains on the battlefield" is the duration of an ability of a permanent.
    if (scope.owner !== 'ability') {
      issue(
        out,
        `${path}.duration`,
        '"for as long as this remains on the battlefield" is the effect of an ability of a permanent',
      );
    }
  } else if (e.duration !== 'untilEndOfTurn') {
    issue(out, `${path}.duration`, "a prevention shield lasts 'untilEndOfTurn' (CR 514.2)");
  }
  // `any` is every creature, planeswalker, battle and player: nothing to look up.
  if (kindOf(e.to) !== 'any') {
    checkDamageRecipient(
      e.to as Parameters<typeof checkDamageRecipient>[0],
      `${path}.to`,
      scope,
      out,
    );
    if (e.to.kind === 'each' && e.to.filter?.owner !== undefined) {
      issue(
        out,
        `${path}.to.filter.owner`,
        'a prevention shield does not read the owner of a card',
      );
    }
    // CR 120.1: only permanents can be dealt damage, so an `each` filter looks at the battlefield.
    if (
      e.to.kind === 'each' &&
      e.to.filter?.zone !== undefined &&
      e.to.filter.zone !== 'battlefield'
    ) {
      issue(out, `${path}.to.filter.zone`, 'damage is dealt to permanents on the battlefield');
    }
  }
  if (e.by !== undefined) {
    if (kindOf(e.by) === 'each') {
      issue(out, `${path}.by`, "'by' names one source ('this' or a target), not 'each'");
    } else {
      checkRef(e.by, 'object', `${path}.by`, scope, out);
    }
  }
  // D-145: "by non-Spider creatures": every source a filter matches, read as the damage would be dealt (CR 611.2c).
  if (e.byFilter !== undefined) {
    if (e.by !== undefined) {
      issue(out, `${path}.byFilter`, "name the source with 'by' or with 'byFilter', not both");
    }
    if (e.byFilter === null || typeof e.byFilter !== 'object') {
      issue(out, `${path}.byFilter`, 'byFilter is a filter of the sources of the damage');
    } else {
      checkFilter(e.byFilter, `${path}.byFilter`, out);
      if (e.byFilter.zone !== undefined && e.byFilter.zone !== 'battlefield') {
        issue(out, `${path}.byFilter.zone`, 'the source of damage is read on the battlefield');
      }
    }
  }
  // CR 615.5 (Gatta and Luzzu): "prevent that damage and put that many +1/+1 counters on it": the counters go on the permanent that would have been damaged.
  if (e.countersPrevented !== undefined) {
    if (typeof e.countersPrevented !== 'string' || e.countersPrevented === '') {
      issue(out, `${path}.countersPrevented`, 'countersPrevented names a kind of counter');
    }
    if (e.amount !== 'all') {
      issue(
        out,
        `${path}.countersPrevented`,
        'counters for prevented damage go with a shield that prevents all of it',
      );
    }
    if (e.perPrevented !== undefined) {
      issue(
        out,
        `${path}.countersPrevented`,
        'name tokens or counters for the prevented damage, not both',
      );
    }
    if (e.to?.kind !== 'target' && e.to?.kind !== 'this' && e.to?.kind !== 'each') {
      issue(
        out,
        `${path}.countersPrevented`,
        'counters are put on a permanent: the recipient is this, a target or each permanent',
      );
    }
  }
  // CR 615.5: "for each 1 damage prevented this way, create a token": a predefined or a described token, made as the damage is prevented (no question can be asked).
  if (e.perPrevented !== undefined) {
    if (e.perPrevented === null || typeof e.perPrevented !== 'object') {
      issue(out, `${path}.perPrevented`, 'perPrevented is { token }');
    } else {
      checkReplacementToken(e.perPrevented.token, `${path}.perPrevented.token`, out);
      if (e.perPrevented.token.kind === 'custom' && e.perPrevented.token.ptAmount !== undefined) {
        issue(
          out,
          `${path}.perPrevented.token.ptAmount`,
          'the token made for prevented damage has a fixed power and toughness',
        );
      }
    }
  }
}
