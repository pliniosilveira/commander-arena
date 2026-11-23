/**
 * Noun rules of the Abzan Armor precon, group C (spells with choices): "all creatures with power greater than or equal to the chosen number" (Expel the Interlopers, CR 208.1, 608.2c).
 */
import { fail, literal, map, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { BOUNDARY, graveyardPhrase, permanentPhrase } from './phrases';

const ID = 'noun.all-with-power-at-least-chosen-number';

/**
 * `noun.all-with-power-at-least-chosen-number`: "all creatures with power greater than or equal to the chosen number" (CR 208.1, 608.2c): every creature whose power, as the
 * effect resolves, is at least the number a "choose a number" instruction before it in the same text had its controller choose. The engine's `powerAtLeastChosenNumber`, read
 * where an effect's `each` selector is read, and valid only after a `chooseNumber` of the same sequence (`validateCard`). Not read: "each", "other", a number written in the phrase,
 * "less than", "greater than" alone, a controller said in the phrase, a singular.
 */
export const NOUN_ALL_WITH_POWER_AT_LEAST_CHOSEN_NUMBER = defineRule<IrNoun>({
  id: ID,
  family: 'noun',
  leading: ['all'],
  cites: ['CR 208.1 (Power/Toughness)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'all creatures with power greater than or equal to the chosen number',
    'all creatures with power equal to or greater than the chosen number',
  ],
  rejects: [
    'each creature with power greater than or equal to the chosen number',
    'all creatures with power greater than the chosen number',
    'all creatures with power less than or equal to the chosen number',
    'all creatures with power greater than or equal to 3',
    'all creatures with power greater than or equal to the number',
    'all creature with power greater than or equal to the chosen number',
    'all other creatures with power greater than or equal to the chosen number',
    'all creatures you control with power greater than or equal to the chosen number',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('all '),
      permanentPhrase(true, 'all'),
      pattern(
        / with power (?:greater than or equal to|equal to or greater than) the chosen number(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, filter] = r.value;
    // A phrase that already says who controls the creatures is not this one.
    if (filter.controller !== undefined) return fail(ctx, pos);
    const noun: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: { ...filter, powerAtLeastChosenNumber: true, raw: ctx.text.slice(pos, r.pos) },
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos, end: r.pos },
      rule: ID,
    };
    return { ok: true, value: noun, pos: r.pos };
  },
});

/**
 * `noun.any-number-target-graveyard-cards-total-power`: "any number of target creature cards with total power 10 or less from your graveyard" (Reunion of the House, CR 115.1, 601.2c,
 * 208.1): one slot of any number of targets, cards of the graveyard of the controller of the spell, whose powers add up to at most the number. The engine's `TargetSpec` with `anyNumber`
 * and `totalPowerAtMost`. Not read: a single target, a limit on anything else than power ("total mana value"), "or more", another graveyard, "up to" a number, a number of targets.
 */
export const NOUN_ANY_NUMBER_TARGET_GRAVEYARD_CARDS_TOTAL_POWER = defineRule<IrNoun>({
  id: 'noun.any-number-target-graveyard-cards-total-power',
  family: 'noun',
  leading: ['any'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 601.2c (Casting Spells)',
    'CR 208.1 (Power/Toughness)',
    'CR 404.1 (Graveyard)',
  ],
  examples: [
    'any number of target creature cards with total power 10 or less from your graveyard',
    'any number of target creature cards with total power 4 or less from your graveyard',
  ],
  rejects: [
    'any number of target creature cards from your graveyard',
    'any number of target creature cards with total mana value 10 or less from your graveyard',
    'any number of target creature cards with total power 10 or more from your graveyard',
    'any number of target creature cards with total power 10 or less from an opponent’s graveyard',
    'target creature card with total power 10 or less from your graveyard',
    'up to two target creature cards with total power 10 or less from your graveyard',
    'any number of creature cards with total power 10 or less from your graveyard',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('any number of target '),
      graveyardPhrase(true, 'from', undefined, false, true),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, filter] = r.value;
    // Only the phrase with a total power is this one: without it `noun.any-number-targets` and its kin read the words.
    if (filter.totalPowerAtMost === undefined || filter.controller !== 'you') {
      return fail(ctx, pos);
    }
    const noun: IrNoun = {
      kind: 'noun',
      det: 'target',
      filter: { ...filter, raw: ctx.text.slice(pos, r.pos) },
      upTo: false,
      plural: true,
      other: false,
      anyNumber: true,
      span: { start: pos, end: r.pos },
      rule: 'noun.any-number-target-graveyard-cards-total-power',
    };
    return { ok: true, value: noun, pos: r.pos };
  },
});

/**
 * `noun.any-number-target-opponents`: "any number of target opponents each" (Will of the Abzan, CR 115.1, 102.2, 101.4): none, one or several target opponents, and each of them does what the verb
 * says, in the order of CR 101.4. The "each" is part of the phrase, and the verbs that follow have no "s", as they have none for "you". One slot of targets, none at least and every
 * opponent at most (the engine's `anyNumber` player slot). Not read: a number, "up to", "players" (`noun.any-number-target-players`), the singular, no "each".
 */
export const NOUN_ANY_NUMBER_TARGET_OPPONENTS = defineRule<IrNoun>({
  id: 'noun.any-number-target-opponents',
  family: 'noun',
  leading: ['any'],
  cites: ['CR 115.1 (Targets)', 'CR 102.2 (Players)', 'CR 101.4 (Handling Simultaneous Decisions)'],
  examples: ['any number of target opponents each', 'Any number of target opponents each'],
  rejects: [
    'any number of target opponents',
    'any number of target opponent each',
    'any number of target players each',
    'any number of opponents each',
    'any number of target opponents every',
    'up to two target opponents each',
    'any number of other target opponents each',
    'any number of target opponents each other',
  ],
  parse: node<string, IrNoun>(
    'noun.any-number-target-opponents',
    map(pattern(new RegExp(`any number of target opponents each${BOUNDARY}`, 'iu')), (m) => m[0]),
    (raw) => ({
      kind: 'noun',
      det: 'target',
      filter: { player: 'opponent', raw },
      upTo: false,
      plural: true,
      other: false,
      anyNumber: true,
    }),
  ),
});

export const ABZAN_SPELLS_NOUN_RULES = [
  NOUN_ANY_NUMBER_TARGET_OPPONENTS,
  NOUN_ALL_WITH_POWER_AT_LEAST_CHOSEN_NUMBER,
  NOUN_ANY_NUMBER_TARGET_GRAVEYARD_CARDS_TOTAL_POWER,
];
