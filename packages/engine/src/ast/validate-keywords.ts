/**
 * Validation of the keywords of keyword batch 1 (D-110): Changeling, Devoid, Partner, Exalted, Annihilator,
 * Persist, Undying, Infect, Wither, Toxic, Split second, typecycling and Multikicker, and of batch 2 (D-120):
 * Skulk, Battle cry, Mentor, Evolve, Bushido, Extort, Affinity, Convoke, Improvise, Delve and Cascade; and
 * Unearth (D-124), Echo and Cumulative upkeep (D-127), Suspend (D-128), Storm and Replicate (D-129).
 * `validate.ts` hands each keyword to `checkBatchKeyword` and treats an unknown kind as an error.
 */
import type { Keyword } from './types';
import { checkKickerCost } from './validate-cast';
import {
  type AstIssue,
  checkCosts,
  checkFilter,
  filterSome,
  isCount,
  issue,
  readsCombatOrSource,
  readsKeywords,
} from './validate-parts';

/** The keywords that take no parameter and have nothing to check. */
const PLAIN: readonly Keyword['kind'][] = [
  'changeling',
  'devoid',
  'partner',
  'chooseBackground',
  'canBeCommander',
  'ascend',
  'soulbond',
  'exalted',
  'persist',
  'undying',
  'infect',
  'wither',
  'splitSecond',
  'skulk',
  'battleCry',
  'mentor',
  'evolve',
  'extort',
  'convoke',
  'improvise',
  'delve',
  'cascade',
  'storm',
  'gravestorm',
  'livingWeapon',
  'jobSelect',
];

/** Checks the keyword when it is one of the batch; false when it is some other keyword. */
export function checkBatchKeyword(k: Keyword, path: string, out: AstIssue[]): boolean {
  if (PLAIN.includes(k?.kind)) return true;
  switch (k?.kind) {
    case 'affinity':
      // CR 702.41a: "Affinity for [text]": the permanents the caster controls that the text names.
      if (k.filter === undefined || k.filter === null || typeof k.filter !== 'object') {
        issue(out, `${path}.filter`, 'affinity needs the text to count: a filter');
      } else {
        checkFilter(k.filter, `${path}.filter`, out);
        if (filterSome(k.filter, (f) => f.controller !== undefined && f.controller !== 'you')) {
          issue(out, `${path}.filter`, 'affinity counts what the caster controls');
        }
        if (filterSome(k.filter, (f) => f.zone !== undefined && f.zone !== 'battlefield')) {
          issue(out, `${path}.filter`, 'affinity counts permanents on the battlefield');
        }
        if (filterSome(k.filter, readsCombatOrSource)) {
          issue(
            out,
            `${path}.filter`,
            'affinity does not count attacking creatures or compare power',
          );
        }
        if (filterSome(k.filter, readsKeywords)) {
          issue(out, `${path}.filter`, 'affinity does not count by keyword');
        }
        if (filterSome(k.filter, (f) => f.owner !== undefined || f.stackKind !== undefined)) {
          issue(out, `${path}.filter`, 'affinity sets neither owner nor stackKind');
        }
      }
      return true;
    case 'afflict':
    case 'annihilator':
    case 'backup':
    case 'bushido':
    case 'toxic':
      // CR 702.86a, 702.45a, 702.164a: "Annihilator N", "Bushido N", "Toxic N": N is a number, at least 1.
      if (!isCount(k.count) || k.count < 1) {
        issue(out, `${path}.count`, `${k.kind} needs a positive integer`);
      }
      return true;
    case 'partnerWith':
      // CR 702.124j (D-490): the name of the card the other commander is, and the card the enters trigger searches for.
      if (typeof k.name !== 'string' || k.name.trim() === '') {
        issue(out, `${path}.name`, 'partner with names a card');
      }
      return true;
    case 'typecycling':
      // CR 702.29e: the cost is paid like a cycling cost, and the discard is its own.
      checkCosts(k.cost, `${path}.cost`, out);
      if (Array.isArray(k.cost) && k.cost.some((c) => c?.kind === 'discardThis')) {
        issue(
          out,
          `${path}.cost`,
          'typecycling already discards the card; do not list discardThis',
        );
      }
      if (k.filter === undefined || k.filter === null || typeof k.filter !== 'object') {
        issue(out, `${path}.filter`, 'typecycling needs the type to search for');
      } else {
        checkFilter(k.filter, `${path}.filter`, out);
        // As for a `search` effect: the searched zone is the player's own library.
        if (filterSome(k.filter, (f) => f.zone !== undefined || f.controller !== undefined)) {
          issue(out, `${path}.filter`, 'a typecycling filter sets neither zone nor controller');
        }
        if (filterSome(k.filter, (f) => f.tapped !== undefined || f.other === true)) {
          issue(out, `${path}.filter`, 'tapped and other do not apply to cards in a library');
        }
        if (Object.keys(k.filter).length === 0) {
          issue(
            out,
            `${path}.filter`,
            'typecycling names a type: an empty filter is plain cycling',
          );
        }
      }
      return true;
    case 'multikicker':
      // CR 702.33c: a kicker cost paid any number of times: mana or life, no X.
      checkKickerCost(k.cost, `${path}.cost`, out);
      return true;
    case 'replicate':
      // CR 702.56a (D-129): the replicate cost is paid any number of times as the spell is cast: mana, no X.
      checkCosts(k.cost, `${path}.cost`, out);
      if (Array.isArray(k.cost)) {
        if (k.cost.length === 0) issue(out, `${path}.cost`, 'replicate needs a cost to pay');
        k.cost.forEach((c, i) => {
          if (c?.kind !== 'mana') {
            issue(out, `${path}.cost[${i}]`, 'a replicate cost may be mana only in this engine');
          } else if (c.symbols?.includes('X')) {
            issue(out, `${path}.cost[${i}]`, 'X in a replicate cost is not supported');
          }
        });
      }
      return true;
    case 'escalate':
      // CR 702.120a (D-145): an additional cost for each mode chosen beyond the first: mana, no X.
      checkCosts(k.cost, `${path}.cost`, out);
      if (Array.isArray(k.cost)) {
        if (k.cost.length === 0) issue(out, `${path}.cost`, 'escalate needs a cost to pay');
        k.cost.forEach((c, i) => {
          if (c?.kind !== 'mana') {
            issue(out, `${path}.cost[${i}]`, 'an escalate cost may be mana only in this engine');
          } else if (c.symbols?.includes('X')) {
            issue(out, `${path}.cost[${i}]`, 'X in an escalate cost is not supported');
          }
        });
      }
      return true;
    case 'dethrone':
    case 'myriad':
    case 'decayed':
      // CR 702.105a, 702.116a (D-151): no parameter.
      return true;
    case 'readAhead':
      // CR 702.155 (D-151): no parameter; the face is checked as a whole (`checkReadAheadFace`).
      return true;
    case 'hideaway':
      // CR 702.75a (D-145): N is the number of cards looked at, a positive whole number.
      if (!Number.isSafeInteger(k.count) || k.count < 1) {
        issue(out, `${path}.count`, 'hideaway looks at a positive number of cards');
      }
      return true;
    case 'encore':
      // CR 702.141a (D-185): the encore cost is paid like an activation cost from the graveyard: mana, no X.
      checkCosts(k.cost, `${path}.cost`, out);
      if (Array.isArray(k.cost)) {
        k.cost.forEach((c, i) => {
          if (c?.kind !== 'mana') {
            issue(out, `${path}.cost[${i}]`, 'an encore cost may be mana only in this engine');
          } else if (c.symbols?.includes('X')) {
            issue(out, `${path}.cost[${i}]`, 'X in an encore cost is not supported');
          }
        });
      }
      return true;
    case 'eternalize':
      // CR 702.129a (D-384): the eternalize cost is paid like an activation cost from the graveyard: mana, no X.
      checkCosts(k.cost, `${path}.cost`, out);
      if (Array.isArray(k.cost)) {
        k.cost.forEach((c, i) => {
          if (c?.kind !== 'mana') {
            issue(out, `${path}.cost[${i}]`, 'an eternalize cost may be mana only in this engine');
          } else if (c.symbols?.includes('X')) {
            issue(out, `${path}.cost[${i}]`, 'X in an eternalize cost is not supported');
          }
        });
      }
      return true;
    case 'devour':
      // CR 702.82a (D-185): N is a positive whole number.
      if (!isCount(k.count) || k.count < 1) {
        issue(out, `${path}.count`, 'devour N: N is a positive whole number');
      }
      return true;
    case 'riot':
      // CR 702.136a (D-185): no parameter.
      return true;
    case 'unearth':
      // CR 702.84a (D-124): the unearth cost is paid like an activation cost from the graveyard: mana, no X.
      checkCosts(k.cost, `${path}.cost`, out);
      if (Array.isArray(k.cost)) {
        k.cost.forEach((c, i) => {
          if (c?.kind !== 'mana') {
            issue(out, `${path}.cost[${i}]`, 'an unearth cost may be mana only in this engine');
          } else if (c.symbols?.includes('X')) {
            issue(out, `${path}.cost[${i}]`, 'X in an unearth cost is not supported');
          }
        });
      }
      return true;
    case 'suspend':
      // CR 702.62a (D-128): "Suspend N—[cost]": N time counters, and a mana cost with no {X} paid to exile the card.
      if (!isCount(k.count) || k.count < 1) {
        issue(out, `${path}.count`, 'suspend needs a positive number of time counters');
      }
      checkCosts(k.cost, `${path}.cost`, out);
      if (Array.isArray(k.cost)) {
        k.cost.forEach((c, i) => {
          if (c?.kind !== 'mana') {
            issue(out, `${path}.cost[${i}]`, 'a suspend cost may be mana only in this engine');
          } else if (c.symbols?.includes('X')) {
            issue(out, `${path}.cost[${i}]`, 'X in a suspend cost is not supported');
          }
        });
      }
      return true;
    case 'gift':
      // CR 702.174d (D-135): "Gift a card": the one gift the engine gives.
      if (k.gift !== 'card') {
        issue(out, `${path}.gift`, `gift ${JSON.stringify(k.gift)} is not supported (only a card)`);
      }
      return true;
    case 'echo':
    case 'cumulativeUpkeep':
      // CR 702.30a, 702.24a (D-127): a cost paid as the upkeep trigger resolves; there must be one to pay.
      checkCosts(k.cost, `${path}.cost`, out);
      if (Array.isArray(k.cost) && k.cost.length === 0) {
        issue(out, `${path}.cost`, `${k.kind} needs a cost to pay`);
      }
      return true;
    default:
      return false;
  }
}
