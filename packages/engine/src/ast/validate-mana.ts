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
    case 'byEffects':
      // Selvala (issue 128): what the ability makes is made by its `also` effects (`checkByEffectsAlso`); there is nothing to list here.
      break;
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
      // D-650 (CR 500.5): "you don't lose this mana as steps and phases end" until end of turn: true or absent.
      if (mp.staysUntilEndOfTurn !== undefined && mp.staysUntilEndOfTurn !== true) {
        issue(out, `${path}.staysUntilEndOfTurn`, 'staysUntilEndOfTurn is true or absent');
      }
      // CR 702.189a (Firebending): "until end of combat", true or absent, and not both durations.
      if (mp.staysUntilEndOfCombat !== undefined && mp.staysUntilEndOfCombat !== true) {
        issue(out, `${path}.staysUntilEndOfCombat`, 'staysUntilEndOfCombat is true or absent');
      }
      if (mp.staysUntilEndOfCombat === true && mp.staysUntilEndOfTurn === true) {
        issue(
          out,
          `${path}.staysUntilEndOfCombat`,
          'the mana stays until end of turn or until end of combat, not both',
        );
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
      // D-319: "two mana of different colors": no color twice. `distinct` is true or absent.
      if (mp.distinct !== undefined && mp.distinct !== true) {
        issue(out, `${path}.distinct`, 'distinct is true or absent');
      }
      // "in any combination of {U}, {B}, and/or {R}": two to four different colors of the five.
      if (mp.colors !== undefined) {
        if (!Array.isArray(mp.colors) || mp.colors.length < 2 || mp.colors.length > 4) {
          issue(out, `${path}.colors`, 'colors lists two to four colors');
        } else {
          for (const c of mp.colors) {
            if (!isOneOf(c, ['W', 'U', 'B', 'R', 'G'])) {
              issue(out, `${path}.colors`, `unknown mana color ${JSON.stringify(c)}`);
            }
          }
          if (new Set(mp.colors).size !== mp.colors.length) {
            issue(out, `${path}.colors`, 'colors lists a color twice');
          }
        }
      }
      break;
    case 'producedType': // read from the mana ability that was tapped for mana; only a `tappedForMana` effect (validate.ts, validate-parts.ts)
    case 'anyColorDevotion': // the color is chosen as the ability resolves: nothing to check
    case 'anyColorAmount': // the amount is checked with the mana ability (validate-mana-ability.ts)
    case 'anyCombinationAmount': // so is this one
    case 'anyCombinationTapped': // paired with the cost that taps X permanents (validate-mana-ability.ts)
    case 'commanderIdentity':
      break;
    case 'eachColorAmong': // the filter is checked with the mana ability (validate-mana-ability.ts)
      break;
    case 'chosenColor': // D-149: the face must ask for the color as the permanent enters (`validate-chosen.ts`)
      // Issue 184: "Add {U} or one mana of the chosen color".
      if (mp.or !== undefined && !isOneOf(mp.or, MANA_COLORS)) {
        issue(out, `${path}.or`, `unknown mana color ${JSON.stringify(mp.or)}`);
      }
      // Issue 144: "Add four mana of the chosen color": a whole number of 2 or more, of the chosen color alone.
      if (mp.count !== undefined) {
        if (!Number.isSafeInteger(mp.count) || mp.count < 2) {
          issue(
            out,
            `${path}.count`,
            'count is a whole number of 2 or more (one mana is the plain production)',
          );
        }
        if (mp.or !== undefined) {
          issue(out, `${path}.count`, 'a count of the chosen color has no other color to choose');
        }
      }
      break;
    case 'anyColorAmong': // the filter is checked with the mana ability (validate-mana-ability.ts)
      break;
    case 'couldProduce':
      // The `lands` filter is checked with the mana ability (validate-mana-ability.ts).
      if (mp.anyType !== undefined && typeof mp.anyType !== 'boolean') {
        issue(out, `${path}.anyType`, 'anyType must be a boolean');
      }
      if (mp.count !== undefined && (!Number.isSafeInteger(mp.count) || mp.count < 2)) {
        issue(
          out,
          `${path}.count`,
          'count is a whole number of 2 or more (one mana is the plain production)',
        );
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

/**
 * The effects of a mana ability that makes its mana by them (`ManaProduction` `byEffects`, Selvala, Explorer Returned; issue 128; CR 605.1a, 605.3b, 701.20a): run at once, in order, as a
 * short resolution with no target and no decision a player must make (a draw that would ask about a commander is answered "no"). Allowed: the reveal of the top card of the libraries of
 * players, with a branch for each kind of card whose effect is one of these effects (done by the controller of the ability), adding fixed mana, gaining your own life, and a draw of a number of
 * cards by you or every player, and several of them in a sequence.
 */
export function checkByEffectsAlso(e: Effect, path: string, out: Out): void {
  switch (e?.kind) {
    case 'sequence':
      if (!Array.isArray(e.effects) || e.effects.length === 0) {
        issue(out, `${path}.effects`, 'a sequence needs effects');
      } else {
        e.effects.forEach((child, i) => {
          checkByEffectsAlso(child, `${path}.effects[${i}]`, out);
        });
      }
      break;
    case 'revealTopBranches':
      if (!['eachPlayer', 'you'].includes(kindOf(e.player) ?? '')) {
        issue(out, `${path}.player`, 'the libraries revealed are those of each player or yours');
      }
      (Array.isArray(e.branches) ? e.branches : []).forEach((branch, i) => {
        if (branch.to !== undefined || branch.onMatch === undefined) {
          issue(
            out,
            `${path}.branches[${i}]`,
            'a branch of a mana ability does an effect and moves no card',
          );
        } else {
          checkByEffectsAlso(branch.onMatch, `${path}.branches[${i}].onMatch`, out);
        }
        if (branch.asController !== true) {
          issue(
            out,
            `${path}.branches[${i}].asController`,
            'the controller of the ability does the effect of a branch',
          );
        }
      });
      break;
    case 'addMana':
      if (e.mana?.kind !== 'fixed' || e.mana.times !== undefined || e.player !== undefined) {
        issue(
          out,
          `${path}.mana`,
          'a mana ability adds fixed mana for its controller: no amount, no other player',
        );
      }
      break;
    case 'gainLife':
      if (kindOf(e.player) !== 'you' || typeof e.amount !== 'number' || e.amount < 1) {
        issue(out, path, 'a mana ability gains a positive number of life for you');
      }
      break;
    case 'draw':
      if (
        !['eachPlayer', 'you'].includes(kindOf(e.player) ?? '') ||
        typeof e.count !== 'number' ||
        e.count < 1
      ) {
        issue(out, path, 'a mana ability draws a positive number of cards for you or each player');
      }
      if (e.upTo !== undefined) issue(out, `${path}.upTo`, 'a mana ability draws no "up to" cards');
      break;
    default:
      issue(
        out,
        path,
        `a mana ability that makes its mana by effects may reveal, add mana, gain your life and draw, not ${kindOf(e)} (CR 605.1a)`,
      );
  }
}
