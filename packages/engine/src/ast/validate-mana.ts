/**
 * Validation of mana: the symbols of a cost, what a mana ability produces, and the extra effects it
 * may carry (CR 107.4, 106, 605.1a). Split from `validate-parts.ts`.
 */

import { isValidManaSymbol } from './symbols';
import type { Effect, ManaProduction } from './types';
import { isOneOf, issue, kindOf, type Out } from './validate-base';

export function checkManaSymbols(symbols: readonly unknown[], path: string, out: Out): void {
  if (!Array.isArray(symbols) || symbols.length === 0) {
    issue(out, path, 'a mana cost needs at least one symbol (use {0} for a zero cost)');
    return;
  }
  symbols.forEach((s, i) => {
    if (typeof s !== 'string' || !isValidManaSymbol(s)) {
      issue(out, `${path}[${i}]`, `invalid mana symbol ${JSON.stringify(s)} (CR 107.4)`);
    }
  });
}

const MANA_COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];

export function checkManaProduction(mp: ManaProduction, path: string, out: Out): void {
  switch (mp?.kind) {
    case 'fixed':
      if (!Array.isArray(mp.mana) || mp.mana.length === 0) {
        issue(out, `${path}.mana`, 'fixed mana production must list at least one mana');
      } else {
        mp.mana.forEach((m, i) => {
          if (!isOneOf(m, MANA_COLORS)) {
            issue(out, `${path}.mana[${i}]`, `unknown mana color ${JSON.stringify(m)}`);
          }
        });
      }
      break;
    case 'oneOf':
      // "Add {U} or {B}" is a choice among at least two different types of mana (CR 106.1b).
      if (!Array.isArray(mp.colors) || mp.colors.length < 2) {
        issue(out, `${path}.colors`, 'oneOf mana production needs at least two colors');
      } else {
        mp.colors.forEach((m, i) => {
          if (!isOneOf(m, MANA_COLORS)) {
            issue(out, `${path}.colors[${i}]`, `unknown mana color ${JSON.stringify(m)}`);
          }
        });
        if (new Set(mp.colors).size !== mp.colors.length) {
          issue(out, `${path}.colors`, 'oneOf mana production lists a color twice');
        }
      }
      break;
    case 'anyColor':
      // D-145: "two mana of any one color": a count of 2 or more (one mana is the plain production).
      if (mp.count !== undefined && (!Number.isSafeInteger(mp.count) || mp.count < 2)) {
        issue(
          out,
          `${path}.count`,
          'count is a whole number of 2 or more (one mana is the plain production)',
        );
      }
      break;
    case 'anyCombination':
      // D-151: "two mana in any combination of colors": 2 to 4 mana, each a color chosen on its own.
      if (!Number.isSafeInteger(mp.count) || mp.count < 2 || mp.count > 4) {
        issue(out, `${path}.count`, 'count is a whole number from 2 to 4');
      }
      // D-982: "two mana of different colors": no color twice. `distinct` is true or absent.
      if (mp.distinct !== undefined && mp.distinct !== true) {
        issue(out, `${path}.distinct`, 'distinct is true or absent');
      }
      break;
    case 'anyColorDevotion': // the color is chosen as the ability resolves: nothing to check
    case 'commanderIdentity':
    case 'chosenColor': // D-149: the face must ask for the color as the permanent enters (`validate-chosen.ts`)
      break;
    case 'couldProduce':
      // The `lands` filter is checked with the mana ability (validate-mana-ability.ts).
      if (mp.anyType !== undefined && typeof mp.anyType !== 'boolean') {
        issue(out, `${path}.anyType`, 'anyType must be a boolean');
      }
      break;
    case 'combination':
      checkCombinations(mp.options, `${path}.options`, out);
      break;
    default:
      issue(out, path, `unknown mana production ${kindOf(mp)}`);
  }
}

/**
 * "Add {R}{R}, {R}{W}, or {W}{W}": at least two combinations, each of at least one valid mana, that
 * differ as multisets (the order inside one does not matter, CR 106.4).
 */
function checkCombinations(options: unknown, path: string, out: Out): void {
  if (!Array.isArray(options) || options.length < 2) {
    issue(out, path, 'a combination production needs at least two combinations');
    return;
  }
  const seen = new Set<string>();
  options.forEach((option: unknown, i) => {
    const p = `${path}[${i}]`;
    if (!Array.isArray(option) || option.length === 0) {
      issue(out, p, 'a combination must list at least one mana');
      return;
    }
    let valid = true;
    option.forEach((m: unknown, j) => {
      if (!isOneOf(m, MANA_COLORS)) {
        valid = false;
        issue(out, `${p}[${j}]`, `unknown mana color ${JSON.stringify(m)}`);
      }
    });
    if (!valid) return;
    const key = [...option].sort().join('');
    if (seen.has(key)) issue(out, p, 'two combinations are the same mana in a different order');
    seen.add(key);
  });
}

/**
 * The extra effects a mana ability may carry (CR 605.1a). They run inside the activation, which
 * cannot stop for a choice or a target, so only damage to you and your own life total qualify.
 */
export function checkManaAbilityAlso(e: Effect, path: string, out: Out): void {
  const amountOk = (amount: unknown): boolean =>
    typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 1;
  switch (e?.kind) {
    case 'dealDamage':
      if (kindOf(e.to) !== 'you') {
        issue(out, `${path}.to`, 'a mana ability may only deal damage to you');
      }
      if (!amountOk(e.amount)) issue(out, `${path}.amount`, 'amount must be a positive integer');
      break;
    case 'loseLife':
    case 'gainLife':
      if (kindOf(e.player) !== 'you') {
        issue(out, `${path}.player`, 'a mana ability may only change your own life total');
      }
      if (!amountOk(e.amount)) issue(out, `${path}.amount`, 'amount must be a positive integer');
      break;
    default:
      issue(
        out,
        path,
        `a mana ability's extra effect must be damage to you or you losing or gaining life, not ${kindOf(e)} (CR 605.1a)`,
      );
  }
}
