/**
 * Validation of a whole mana ability (CR 605.1a): its costs, what it produces, the effects it
 * carries and the restriction on activating it (CR 602.5b, D-099). It is the mana ability of a card
 * and the one a static `grantAbility` gives. Split from `validate.ts` and `validate-mana.ts`.
 */
import { CARD_TYPES, COLORS } from '../characteristics';
import type { ManaAbility } from './types';
import { checkBattlefieldFilter } from './validate-attach';
import { issue, kindOf, type Out } from './validate-base';
import { checkManaAbilityAlso, checkManaProduction } from './validate-mana';
import { checkCondition, checkCosts, checkEnumList } from './validate-parts';

export function checkManaAbility(a: ManaAbility, path: string, out: Out): void {
  checkCosts(a.cost, `${path}.cost`, out);
  // CR 119.4: paying 0 life is no cost, so a life cost of a mana ability names at least 1.
  (Array.isArray(a.cost) ? a.cost : []).forEach((c, i) => {
    if (c?.kind === 'payLife' && Number.isSafeInteger(c.amount) && c.amount < 1) {
      issue(out, `${path}.cost[${i}].amount`, 'life paid must be at least 1');
    }
    if (c?.kind === 'sacrifice' && c.count !== undefined) {
      issue(
        out,
        `${path}.cost[${i}].count`,
        'a mana ability sacrifices one permanent: no count (D-133)',
      );
    }
  });
  checkManaProduction(a.production, `${path}.production`, out);
  // D-151: "for each ..." mana is added as a spell or a triggered ability resolves; a mana ability makes its mana before it can read anything (CR 605.1a).
  if (a.production?.kind === 'fixed' && a.production.times !== undefined) {
    issue(
      out,
      `${path}.production.times`,
      'a mana ability adds a fixed amount of mana, never a count',
    );
  }
  if (a.production?.kind === 'couldProduce') {
    // The permanents whose mana is looked at are on the battlefield (CR 106.7).
    if (a.production.lands === undefined || a.production.lands === null) {
      issue(out, `${path}.production.lands`, 'couldProduce needs a filter for the permanents');
    } else {
      checkBattlefieldFilter(a.production.lands, `${path}.production.lands`, out);
    }
  }
  if (a.also !== undefined) {
    if (!Array.isArray(a.also) || a.also.length === 0) {
      issue(out, `${path}.also`, 'also must be a non-empty list when present');
    } else {
      a.also.forEach((e, i) => {
        checkManaAbilityAlso(e, `${path}.also[${i}]`, out);
      });
    }
  }
  if (a.activateOnlyIf !== undefined) {
    checkCondition(a.activateOnlyIf, `${path}.activateOnlyIf`, out);
  }
  // D-149: "Spend this mana only to cast an Angel spell": the card types and creature types of the spells it may pay for.
  if (a.spendOnly !== undefined) {
    const only = a.spendOnly;
    if (only === null || typeof only !== 'object') {
      issue(out, `${path}.spendOnly`, 'spendOnly names the types and subtypes of the spells');
    } else {
      if (only.types === undefined && only.subtypes === undefined) {
        issue(out, `${path}.spendOnly`, 'spendOnly names at least one type or subtype');
      }
      // D-151: "... or activate abilities of Dragons".
      if (only.alsoAbilities !== undefined && only.alsoAbilities !== true) {
        issue(out, `${path}.spendOnly.alsoAbilities`, 'alsoAbilities must be true when present');
      }
      checkEnumList(out, `${path}.spendOnly.types`, only.types, CARD_TYPES, 'card type');
      if (only.subtypes !== undefined) {
        if (!Array.isArray(only.subtypes) || only.subtypes.length === 0) {
          issue(
            out,
            `${path}.spendOnly.subtypes`,
            'subtypes must be a non-empty list when present',
          );
        } else {
          only.subtypes.forEach((t, i) => {
            if (typeof t !== 'string' || t === '') {
              issue(out, `${path}.spendOnly.subtypes[${i}]`, 'a subtype is a name');
            }
          });
        }
      }
    }
  }
  // D-151: "If that mana is spent on a Dragon creature spell, it gains haste until end of turn": the spells it names and what it grants.
  if (a.spentRider !== undefined) {
    const rider = a.spentRider;
    if (rider === null || typeof rider !== 'object') {
      issue(out, `${path}.spentRider`, 'spentRider names the spells and what it grants');
    } else {
      const scry = rider.grants;
      if (
        scry !== 'haste' &&
        !(
          typeof scry === 'object' &&
          scry !== null &&
          (('scry' in scry && Number.isInteger(scry.scry) && scry.scry >= 1) ||
            ('scryCommanderCasts' in scry && scry.scryCommanderCasts === true) ||
            // D-951: "copy that spell" with or without "you may choose new targets for the copy".
            ('copySpell' in scry && (scry.copySpell === 'may' || scry.copySpell === 'no')))
        )
      ) {
        issue(
          out,
          `${path}.spentRider.grants`,
          'a rider is haste, a scry of one or more, a scry of the times the commander was cast or a copy of the spell',
        );
      }
      if (rider.spells === null || typeof rider.spells !== 'object') {
        issue(out, `${path}.spentRider.spells`, 'spells names the card types and subtypes');
      } else {
        if (
          rider.spells.types === undefined &&
          rider.spells.subtypes === undefined &&
          rider.spells.sharesTypeWithCommander !== true &&
          rider.spells.commander !== true &&
          rider.spells.colors === undefined
        ) {
          issue(out, `${path}.spentRider.spells`, 'the spells have at least one type or subtype');
        }
        if (
          rider.spells.sharesTypeWithCommander !== undefined &&
          rider.spells.sharesTypeWithCommander !== true
        ) {
          issue(out, `${path}.spentRider.spells.sharesTypeWithCommander`, 'only true is allowed');
        }
        if (rider.spells.commander !== undefined && rider.spells.commander !== true) {
          issue(out, `${path}.spentRider.spells.commander`, 'only true is allowed');
        }
        checkEnumList(
          out,
          `${path}.spentRider.spells.types`,
          rider.spells.types,
          CARD_TYPES,
          'card type',
        );
        // D-951: "a red instant or sorcery spell": the colors of the spell, one or more of the five.
        checkEnumList(
          out,
          `${path}.spentRider.spells.colors`,
          rider.spells.colors,
          COLORS,
          'color',
        );
        if (
          rider.spells.subtypes !== undefined &&
          (!Array.isArray(rider.spells.subtypes) || rider.spells.subtypes.length === 0)
        ) {
          issue(
            out,
            `${path}.spentRider.spells.subtypes`,
            'subtypes must be a non-empty list when present',
          );
        }
      }
    }
  }
  // D-145: "If [condition], add [other mana] instead": the condition is an ordinary one, the production is checked like the ability's.
  if (a.instead !== undefined) {
    if (a.instead === null || typeof a.instead !== 'object') {
      issue(out, `${path}.instead`, 'instead names a condition and the production that replaces');
    } else {
      checkCondition(a.instead.condition, `${path}.instead.condition`, out);
      checkManaProduction(a.instead.production, `${path}.instead.production`, out);
      if (a.instead.production?.kind === 'couldProduce') {
        issue(
          out,
          `${path}.instead.production`,
          'the replacing production does not look at other permanents',
        );
      }
    }
  }
  if (kindOf(a) !== 'mana') issue(out, path, 'a mana ability has kind "mana"');
}
