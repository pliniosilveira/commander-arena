/**
 * Regeneration (stage P21, CR 701.19, the engine's `regenerate` effect and `destroy.cantBeRegenerated`,
 * D-120): "Regenerate ~." (the activated ability "{1}{B}: Regenerate ~."), "Regenerate target creature."
 * and "Regenerate each creature you control." create a regeneration shield (CR 701.19a), and the sentence
 * after a destroy, "It can't be regenerated.", says that the destruction ignores shields (CR 701.19c,
 * 608.2c: later text may change the meaning of earlier text). A static "creatures can't be regenerated" and a
 * regeneration by a static ability (CR 701.19b) are not built by the engine and are not read.
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrFlag } from '../../ir/types';
import { defineRule } from '../registry';
import { type Clauses, makeClause, operands, SELF_OR_PERMANENT_OPERANDS, single } from './operands';

/** `effect.regenerate`: "Regenerate ~", "Regenerate target creature", "Regenerate each creature you control". */
export const EFFECT_REGENERATE = defineRule<Clauses>({
  id: 'effect.regenerate',
  family: 'effect',
  leading: ['regenerate'],
  cites: [
    'CR 701.19a (Regenerate)',
    'CR 701.19c (Regenerate)',
    'CR 514.2 (Cleanup Step)',
    'CR 614.8 (Replacement Effects)',
  ],
  examples: [
    'regenerate ~',
    'regenerate target creature',
    'regenerate target land',
    'regenerate each creature you control',
    'regenerate all creatures',
    'regenerate all Elves',
    'regenerate target artifact or creature',
    'regenerate two target creatures',
  ],
  rejects: [
    'regenerate',
    'regenerate it',
    'regenerate that creature',
    'regenerate target creature this turn',
    'regenerate target spell',
    'regenerate target player',
    'regenerate target creature until end of turn',
    'regenerates ~',
  ],
  parse: single(
    'effect.regenerate',
    sequence(literal('regenerate '), operands(SELF_OR_PERMANENT_OPERANDS, 'effect.regenerate')),
    ([, objects]) => ({ verb: 'regenerate', args: { objects } }),
  ),
});

/**
 * The words that name what the destroy before it destroyed: the pronoun of one object ("it", "that creature"),
 * of several ("they", "those creatures") or "a creature destroyed this way" (the number is then not said, so
 * it fits any destroy). Read with the words after it in one pattern, so that a sentence that starts with "they"
 * or "those" and says something else reports its stop where it always did.
 */
const KINDS = ['creature', 'permanent', 'artifact', 'land', 'enchantment'];
const SINGULAR = KINDS.join('|');
const PLURAL = KINDS.map((kind) => `${kind}s`).join('|');
const CANT_BE_REGENERATED = new RegExp(
  `(?:(it|that (?:${SINGULAR}))|(they|those (?:${PLURAL}))|(?:an? (?:${SINGULAR})|(?:${PLURAL})) destroyed this way) can['’]t be regenerated(?![\\p{L}\\p{N}])`,
  'iu',
);

/**
 * `effect.cant-be-regenerated`: "It can't be regenerated" after a destroy sentence ("Destroy target
 * creature. It can't be regenerated.", "Destroy all creatures. They can't be regenerated.", "Destroy
 * target creature. A creature destroyed this way can't be regenerated."). It is not an instruction of its
 * own: the lowering attaches it to the destroy before it (CR 608.2c), and is the only thing that reads it,
 * so anywhere else the sentence is read and not run. "... this turn" would also keep a later destruction
 * of the same turn from being regenerated, which the engine's flag does not say, so it is not read.
 */
export const EFFECT_CANT_BE_REGENERATED = defineRule<Clauses>({
  id: 'effect.cant-be-regenerated',
  family: 'effect',
  leading: [
    'it',
    'they',
    'that',
    'those',
    'a',
    'an',
    'creatures',
    'permanents',
    'artifacts',
    'lands',
    'enchantments',
  ],
  cites: [
    'CR 701.19c (Regenerate)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 614.8 (Replacement Effects)',
  ],
  examples: [
    "it can't be regenerated",
    'it can’t be regenerated',
    "they can't be regenerated",
    "that creature can't be regenerated",
    "those creatures can't be regenerated",
    "a creature destroyed this way can't be regenerated",
    "creatures destroyed this way can't be regenerated",
  ],
  rejects: [
    "it can't be regenerated this turn",
    "it can't be regenerated, and",
    'it can be regenerated',
    "it can't regenerate",
    "creatures can't be regenerated",
    "target creature can't be regenerated",
    "~ can't be regenerated",
    "you can't be regenerated",
    "it can't be regenerated.",
    "that spell can't be regenerated",
  ],
  parse: (ctx, pos) => {
    const r = pattern(CANT_BE_REGENERATED)(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const [, one, several] = r.value;
    const plural = several !== undefined ? true : one !== undefined ? false : null;
    const args =
      plural === null
        ? {}
        : ({
            plural: { kind: 'flag', value: plural, span, rule: 'effect.cant-be-regenerated' },
          } satisfies Record<string, IrFlag>);
    return {
      ok: true,
      value: [makeClause('effect.cant-be-regenerated', 'cantBeRegenerated', args, span)],
      pos: r.pos,
    };
  },
});

export const REGENERATE_RULES = [EFFECT_REGENERATE, EFFECT_CANT_BE_REGENERATED];
