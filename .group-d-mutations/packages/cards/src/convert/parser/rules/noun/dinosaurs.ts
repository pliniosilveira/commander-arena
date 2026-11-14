/**
 * Noun rules of stage P32 (D-145, D-147): "target commander" (CR 903.3: a card a player designated as a commander, wherever it is) and
 * "any number of target creatures" (CR 115.1, 601.2d: a number of targets from none to as many as the spell can divide among).
 */
import { fail, map, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { BOUNDARY, permanentPhrase } from './phrases';

type Bare = Omit<IrNoun, 'span' | 'rule'>;

/**
 * `noun.target-commander`: "target commander", "target creature commander", "another target commander" (CR 903.3: a commander is a card,
 * on the battlefield or elsewhere; a token or a copy of one is not). One target; the filter says the object is a commander, and "creature
 * commander" that it is also a creature. The zone is not said: where the engine looks is its own business.
 */
export const NOUN_TARGET_COMMANDER = defineRule<IrNoun>({
  id: 'noun.target-commander',
  family: 'noun',
  leading: ['target', 'another'],
  cites: ['CR 903.3 (Commander)', 'CR 115.1 (Targets)'],
  examples: [
    'target commander',
    'target creature commander',
    'another target commander',
    'Target commander',
    // Group 4 of the Vraska deck (CR 400.7): the commander is a permanent that entered the battlefield during this turn.
    'target commander that entered this turn',
    'target creature commander that entered this turn',
  ],
  rejects: [
    'target commanders',
    'two target commanders',
    'target commander you control',
    'target nonland commander',
    'commander',
    'target creature',
    'target commandering',
    'up to one target commander',
    'target commander that entered',
    'target commander that entered this turn or last turn',
    'target commander that entered the battlefield this turn',
  ],
  parse: node<Bare, IrNoun>(
    'noun.target-commander',
    map(
      pattern(
        new RegExp(
          `(another )?target (creature )?commander(?<entered> that entered this turn)?${BOUNDARY}`,
          'iu',
        ),
      ),
      (m): Bare => ({
        kind: 'noun',
        det: 'target',
        filter: {
          ...(m[2] === undefined ? {} : { types: ['creature'] }),
          commander: true,
          ...(m.groups?.entered === undefined ? {} : { enteredThisTurn: true as const }),
          raw: m[0].toLowerCase(),
        },
        upTo: false,
        plural: false,
        other: m[1] !== undefined,
      }),
    ),
    (b) => b,
  ),
});

/**
 * `noun.any-number-targets`: "any number of target creatures", "any number of target creatures and/or planeswalkers" is not read (CR
 * 115.1, 601.2d): no fewest and no most, which only a divided damage reads (`effect.damage-divided`), as it needs a total to share.
 */
export const NOUN_ANY_NUMBER_TARGETS = defineRule<IrNoun>({
  id: 'noun.any-number-targets',
  family: 'noun',
  leading: ['any'],
  cites: ['CR 115.1 (Targets)', 'CR 601.2d (Casting Spells)'],
  examples: [
    'any number of target creatures',
    'any number of target nonland permanents',
    'any number of target creatures you don’t control',
    // Stage P74 (D-234): "any number of other target creatures you control".
    'any number of other target creatures you control',
  ],
  rejects: [
    'any number of target creature',
    'any number of creatures',
    'any number of',
    'any target',
    'any number of target',
    'any number of targets',
  ],
  parse: (ctx, pos) => {
    const r = sequence(pattern(/any number of (other )?target /iu), permanentPhrase(true, 'all'))(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    const [lead, filter] = r.value;
    if (filter.anyOf !== undefined) return fail(ctx, pos);
    const noun: IrNoun = {
      kind: 'noun',
      det: 'target',
      filter,
      upTo: false,
      plural: true,
      other: lead[1] !== undefined,
      anyNumber: true,
      span: { start: pos, end: r.pos },
      rule: 'noun.any-number-targets',
    };
    return { ok: true, value: noun, pos: r.pos };
  },
});

export const DINOSAUR_NOUN_RULES = [NOUN_TARGET_COMMANDER, NOUN_ANY_NUMBER_TARGETS];
