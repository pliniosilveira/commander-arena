/**
 * Validation of what D-095 adds to the AST: the additional costs of casting a spell (CR 118.8,
 * 601.2b), the alternative cost "without paying its mana cost" (CR 118.9), and the `costReduction`
 * static ability (CR 118.7, 601.2f). `validate.ts` composes these.
 */
import type { AlternativeCost, Cost, ObjectFilter, StaticEffect } from './types';
import { isCount, isOneOf, issue, kindOf, type Out } from './validate-base';
import {
  checkCondition,
  checkCost,
  checkCosts,
  checkFilter,
  checkStateAmount,
  filterSome,
} from './validate-parts';

/** The costs a spell may have besides its mana cost (`CardFace.additionalCosts`). */
export const ADDITIONAL_COST_KINDS: readonly Cost['kind'][] = [
  'sacrifice',
  'discard',
  'payLife',
  'payXLife',
  'discardX',
  'mana',
];

/**
 * CR 118.8, 601.2b: the additional costs of a face. The caster chooses what to sacrifice and discard
 * as the cost is paid, so one of each is allowed. "Pay X life" (`payXLife`, D-103) is allowed once: X is
 * announced as the spell is cast (CR 107.3a, 601.2b); so is "discard X cards" (`discardX`, D-386), alone in its kind. An {X} in an additional mana cost is not (the
 * announcement and the cost would need the same symbol counted twice).
 */
export function checkAdditionalCosts(costs: readonly Cost[], path: string, out: Out): void {
  if (!Array.isArray(costs) || costs.length === 0) {
    issue(out, path, 'additionalCosts must be a non-empty list when present');
    return;
  }
  let sacrifices = 0;
  let discards = 0;
  let xLife = 0;
  let xDiscard = 0;
  costs.forEach((cost, i) => {
    const p = `${path}[${i}]`;
    checkCost(cost, p, out);
    if (!isOneOf(cost?.kind, ADDITIONAL_COST_KINDS)) {
      issue(out, p, `${kindOf(cost)} is not an additional cost a spell can have in this engine`);
      return;
    }
    switch (cost.kind) {
      case 'sacrifice':
        sacrifices += 1;
        // "Sacrifice this" is a cost of a permanent's ability: a spell sacrifices something else.
        if (kindOf(cost.what) === 'this') {
          issue(out, `${p}.what`, 'a spell cannot sacrifice itself as an additional cost');
        }
        if (cost.count !== undefined) {
          issue(
            out,
            `${p}.count`,
            'a spell sacrifices one permanent as an additional cost: no count (D-133)',
          );
        }
        if (cost.countX !== undefined) {
          issue(
            out,
            `${p}.countX`,
            'an additional cost of a spell sacrifices no X permanents (D-1424)',
          );
        }
        // D-1427: "you may sacrifice one or more creatures" is the one sacrifice of the spell, chosen as the cost is paid (the engine's `sacrificeAny`).
        if (cost.anyNumber === true && costs.some((c, j) => j !== i && c?.kind === 'sacrifice')) {
          issue(
            out,
            `${p}.anyNumber`,
            'any number of permanents is the only sacrifice cost of a spell (D-1427)',
          );
        }
        break;
      case 'discard':
        discards += 1;
        // D-207: the cards a filter or a name picks out are for the cost of an activated ability.
        if (cost.filter !== undefined || cost.named !== undefined) {
          issue(out, p, 'an additional cost discards any cards: no filter and no name (D-207)');
        }
        break;
      case 'payLife':
        if (isCount(cost.amount) && cost.amount < 1) {
          issue(out, `${p}.amount`, 'life paid must be at least 1');
        }
        break;
      case 'payXLife':
        xLife += 1;
        break;
      case 'discardX':
        xDiscard += 1;
        break;
      case 'mana':
        if (Array.isArray(cost.symbols) && cost.symbols.includes('X')) {
          issue(
            out,
            `${p}.symbols`,
            'an {X} in an additional mana cost is not supported (use payXLife for "pay X life")',
          );
        }
        break;
      default:
        break;
    }
  });
  if (sacrifices > 1) issue(out, path, 'more than one sacrifice cost is not supported');
  if (discards > 1) issue(out, path, 'more than one discard cost is not supported');
  if (xLife > 1) issue(out, path, 'more than one "pay X life" cost is not supported');
  // D-386: "discard X cards" is the one discard cost of the spell (the discard of N cards pays into the same cards).
  if (xDiscard > 1 || (xDiscard === 1 && discards > 0)) {
    issue(out, path, 'discard X cards is the only discard cost of a spell (D-386)');
  }
}

/**
 * CR 118.8, 601.2b (D-181): "As an additional cost to cast this spell, sacrifice an artifact or creature or pay {4}": two ways to pay, each a non-empty
 * list of the costs `additionalCosts` takes, and with the face's own `additionalCosts` at most one sacrifice and one discard. No "pay X life" and no {X}
 * (X is announced before the targets and the choice comes first), and the two ways are not the same.
 */
export function checkAdditionalCostChoice(
  choice: readonly [readonly Cost[], readonly Cost[]],
  fixed: readonly Cost[],
  path: string,
  out: Out,
): void {
  if (!Array.isArray(choice) || choice.length !== 2) {
    issue(out, path, 'additionalCostChoice has exactly two ways to pay');
    return;
  }
  choice.forEach((way, i) => {
    const p = `${path}[${i}]`;
    if (!Array.isArray(way) || way.length === 0) {
      issue(out, p, 'a way to pay is a non-empty list of costs');
      return;
    }
    // With the fixed additional costs, as they are paid together: one sacrifice and one discard at most.
    checkAdditionalCosts([...fixed, ...way], p, out);
    if (way.some((c) => c?.kind === 'payXLife' || c?.kind === 'discardX')) {
      issue(out, p, 'a choice of additional costs has no "pay X life" and no "discard X cards"');
    }
    if (way.some((c) => c?.kind === 'sacrifice' && c.anyNumber !== undefined)) {
      issue(out, p, 'a choice of additional costs has no "you may sacrifice any number" (D-1427)');
    }
  });
  if (JSON.stringify(choice[0]) === JSON.stringify(choice[1])) {
    issue(out, path, 'the two ways to pay are the same');
  }
}

/** The kinds a face may list (`CardFace.alternativeCosts`): `free` and the named, mana-paid ones (D-121). */
const ALTERNATIVE_KINDS: readonly AlternativeCost['kind'][] = [
  'free',
  'overload',
  'evoke',
  'dash',
  'spectacle',
  'escape',
  'madness',
  'miracle',
  'foretell',
  'tapPermanents',
];

/**
 * CR 118.9a: a face lists at most one alternative cost of each kind (the caster names the one that
 * applies as the spell is cast, CR 601.2b). A named alternative has a mana cost, with no {X}: the cost
 * is paid instead of the mana cost and an {X} in it would be announced (CR 107.3b, 702.96a).
 */
export function checkAlternativeCosts(
  alternatives: readonly AlternativeCost[],
  path: string,
  out: Out,
): void {
  if (!Array.isArray(alternatives) || alternatives.length === 0) {
    issue(out, path, 'alternativeCosts must be a non-empty list when present');
    return;
  }
  const seen = new Set<string>();
  alternatives.forEach((alt, i) => {
    const p = `${path}[${i}]`;
    if (!isOneOf(alt?.kind, ALTERNATIVE_KINDS)) {
      issue(out, p, `unknown alternative cost ${kindOf(alt)}`);
      return;
    }
    if (seen.has(alt.kind)) {
      issue(
        out,
        p,
        `more than one alternative cost of kind ${alt.kind} on a face is not supported`,
      );
    }
    seen.add(alt.kind);
    if (alt.kind !== 'free') {
      checkNamedAlternativeCost(alt.cost, `${p}.cost`, out, alt.kind === 'miracle');
    }
    // CR 702.138a (D-124): an escape cost exiles at least one other card; no other kind has the field.
    const exile = (alt as { readonly exile?: unknown }).exile;
    if (alt.kind === 'escape') {
      if (!Number.isSafeInteger(exile) || (exile as number) < 1) {
        issue(out, `${p}.exile`, 'escape exiles a positive whole number of other cards');
      }
    } else if (exile !== undefined) {
      issue(out, `${p}.exile`, `only escape exiles cards (${alt.kind} has no exile)`);
    }
    // D-149: the permanents tapped as part of the cost are checked as the tap cost of an ability is (same fields, same rules).
    if (alt.kind === 'tapPermanents') {
      checkCost({ kind: 'tapPermanents', filter: alt.filter, count: alt.count }, p, out);
    } else if (
      (alt as { readonly filter?: unknown }).filter !== undefined ||
      (alt as { readonly count?: unknown }).count !== undefined
    ) {
      issue(out, p, `only tapPermanents taps permanents (${alt.kind} has no filter or count)`);
    }
    if (alt.condition !== undefined) checkCondition(alt.condition, `${p}.condition`, out);
  });
}

/**
 * The cost of a named alternative cost: a mana cost, with no {X} (the engine pays no other kind, D-121). Miracle may have an {X}
 * (D-274, CR 107.3a: it is announced as the spell is cast): the one named alternative that is cast with a choice of its own.
 */
function checkNamedAlternativeCost(
  cost: readonly Cost[],
  path: string,
  out: Out,
  allowX = false,
): void {
  checkCosts(cost, path, out);
  if (!Array.isArray(cost)) return;
  cost.forEach((c, i) => {
    if (c?.kind !== 'mana') {
      issue(out, `${path}[${i}]`, 'an alternative cost may be mana only in this engine');
    } else if (!allowX && c.symbols?.includes('X')) {
      issue(out, `${path}[${i}]`, 'X in an alternative cost is not supported');
    }
  });
}

/**
 * CR 118.7a, 601.2f: a reduction of generic mana. `spells` is `this` (the spell's own ability, CR
 * 113.6d) or a filter describing spells on the stack. The amount is a positive number or a count.
 */
export function checkCostReduction(
  s: Extract<StaticEffect, { kind: 'costReduction' }>,
  path: string,
  out: Out,
): void {
  if (kindOf(s.spells) !== 'this') {
    const filter = s.spells as ObjectFilter;
    // D-424 (CR 601.2c, 601.2f): "Aura spells you cast that target enchanted creature cost {3} less": the targets are chosen before the cost is determined, so the outer
    // filter may say what the spell targets; the object it targets is a permanent, described by a filter of its own.
    const { targetsObject, ...spell } = filter;
    checkFilter(spell, `${path}.spells`, out);
    if (targetsObject !== undefined) {
      checkFilter(targetsObject, `${path}.spells.targetsObject`, out);
      if (
        filterSome(targetsObject, (f) => f.zone !== undefined && f.zone !== 'battlefield') ||
        filterSome(targetsObject, (f) => f.targetsObject !== undefined)
      ) {
        issue(
          out,
          `${path}.spells.targetsObject`,
          'the object a spell targets is a permanent on the battlefield, described without a zone of its own',
        );
      }
    }
    if (filterSome(spell, (f) => f.zone !== undefined || f.stackKind !== undefined)) {
      issue(
        out,
        `${path}.spells`,
        'the filter describes a spell being cast: zone and stackKind are not set',
      );
    }
  }
  const amount = s.amount;
  if (typeof amount === 'number') {
    if (!isCount(amount) || amount < 1) {
      issue(out, `${path}.amount`, 'a cost reduction must be a positive integer');
    }
  } else if (
    kindOf(amount) === 'powerOf' &&
    kindOf((amount as { of?: unknown }).of) === 'this' &&
    kindOf(s.spells) !== 'this'
  ) {
    // D-420 (CR 601.2f, 208.1): "Aura and Equipment spells you cast cost {X} less to cast, where X is this creature's power": the power of the permanent
    // with the ability, read as the cost is determined. A spell's own reduction has no such permanent ("this" is the spell).
  } else {
    // D-131: a count, or any amount that reads the game as the spell is cast (total power, devotion, counters on this
    // permanent, ...): worked out at CR 601.2f.
    checkStateAmount(amount, `${path}.amount`, out, 'a cost reduction');
  }
}

/**
 * D-425, CR 601.2f, 602.2b, 702.6a: "Equip abilities you activate that target enchanted creature cost {3} less to activate." `abilities` is `equip`; `targeting` describes the
 * object the activation targets (a permanent on the battlefield: the source of this ability is the permanent that has it, so `hostOfSource` is the permanent it is attached to);
 * `amount` is read as `costReduction`'s is.
 */
export function checkAbilityCostReduction(
  s: Extract<StaticEffect, { kind: 'abilityCostReduction' }>,
  path: string,
  out: Out,
): void {
  if (s.abilities !== 'equip') {
    issue(out, `${path}.abilities`, 'only Equip abilities are named (abilities: "equip")');
  }
  if (s.targeting === undefined || s.targeting === null || typeof s.targeting !== 'object') {
    issue(out, `${path}.targeting`, 'an ability cost reduction needs a filter of what it targets');
  } else {
    checkFilter(s.targeting, `${path}.targeting`, out);
    if (
      filterSome(
        s.targeting,
        (f) => f.zone !== undefined || f.stackKind !== undefined || f.targetsObject !== undefined,
      )
    ) {
      issue(
        out,
        `${path}.targeting`,
        'the object an ability targets is a permanent on the battlefield: no zone, stackKind or targetsObject',
      );
    }
  }
  if (typeof s.amount === 'number') {
    if (!isCount(s.amount) || s.amount < 1) {
      issue(out, `${path}.amount`, 'a cost reduction must be a positive integer');
    }
  } else {
    checkStateAmount(s.amount, `${path}.amount`, out, 'a cost reduction');
  }
}

/**
 * CR 508.1h (D-125): the cost of "can't attack you unless their controller pays [cost] for each creature":
 * mana only, at least one symbol, no {X} (nobody announces X when attacking), and `planeswalkers` true or absent.
 */
export function checkAttackTax(
  s: Extract<StaticEffect, { kind: 'attackTax' }>,
  path: string,
  out: Out,
): void {
  if (!Array.isArray(s.cost) || s.cost.length === 0) {
    issue(out, `${path}.cost`, 'an attack tax needs a cost');
    return;
  }
  checkCosts(s.cost, `${path}.cost`, out);
  let symbols = 0;
  s.cost.forEach((c, i) => {
    if (c?.kind !== 'mana') {
      issue(out, `${path}.cost[${i}]`, 'an attack tax may be mana only in this engine');
    } else if (Array.isArray(c.symbols)) {
      symbols += c.symbols.length;
      if (c.symbols.includes('X'))
        issue(out, `${path}.cost[${i}]`, 'X in an attack tax is not supported');
    }
  });
  if (symbols === 0 && s.cost.every((c) => c?.kind === 'mana')) {
    issue(out, `${path}.cost`, 'an attack tax needs at least one mana symbol');
  }
  if (s.planeswalkers !== undefined && s.planeswalkers !== true) {
    issue(out, `${path}.planeswalkers`, 'planeswalkers is true or absent');
  }
}
