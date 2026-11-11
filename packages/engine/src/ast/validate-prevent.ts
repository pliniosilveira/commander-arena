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
}
