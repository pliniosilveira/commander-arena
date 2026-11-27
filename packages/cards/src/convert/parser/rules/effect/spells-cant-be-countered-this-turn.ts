/**
 * Effect rule of the Animated Army deck (issue 110, Domri, Anarch of Bolas): "Creature spells you cast this turn can't be countered." (CR 101.2, 701.6a, 611.2a). The engine's
 * `spellsCantBeCounteredThisTurn`.
 */
import { fail, type Parser, pattern, quiet, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule } from '../registry';
import { spellSubject } from '../static/cost';
import { type Clauses, single } from './operands';

const ID = 'effect.spells-you-cast-this-turn-cant-be-countered';

/** The parts of a spell's filter this rule keeps: what the spell is (types, subtypes, colors, supertypes) and the words it was read from. */
const ALLOWED: ReadonlySet<string> = new Set([
  'raw',
  'types',
  'notTypes',
  'subtypes',
  'notSubtypes',
  'colors',
  'supertypes',
  'anyOf',
]);

/**
 * `effect.spells-you-cast-this-turn-cant-be-countered`: "Creature spells you cast this turn can't be countered" (CR 101.2: a "can't" effect wins over one that counters; CR 611.2a: the
 * effect lasts for the turn, and covers a spell cast before or after it resolved). The subject is the one the cost reductions read ("Creature spells", "Noncreature spells", "Red
 * spells", "Instant and sorcery spells"). Not read: spells of other players, the permanent's static ability (`static.spells-cant-be-countered`), another length, a quality of the spell
 * other than its types, colors and subtypes.
 */
/** The spells and the words after them, read as one (a line that merely starts like a subject was never this clause); the spells are those of the controller of the effect. */
const spellsNoun: Parser<IrNoun> = (ctx, pos) => {
  const r = sequence(
    quiet(spellSubject()),
    pattern(/ you cast this turn can['’]t be countered(?![\p{L}\p{N}])(?! and\b| then\b|,)/iu),
  )(ctx, pos);
  if (!r.ok) return r;
  const [filter] = r.value;
  // The spells are named by what they are: a quality the engine's filter does not read here is never dropped.
  if (!Object.keys(filter).every((k) => ALLOWED.has(k))) return fail(ctx, pos);
  return {
    ok: true,
    value: {
      kind: 'noun',
      det: 'each',
      filter: { ...filter, controller: 'you' },
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos, end: pos + filter.raw.length },
      rule: ID,
    },
    pos: r.pos,
  };
};

export const EFFECT_SPELLS_YOU_CAST_THIS_TURN_CANT_BE_COUNTERED = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: [],
  cites: ['CR 101.2 (Golden Rules)', 'CR 701.6a (Counter)', 'CR 611.2a (Continuous Effects)'],
  examples: [
    "Creature spells you cast this turn can't be countered",
    'Creature spells you cast this turn can’t be countered',
    "Spells you cast this turn can't be countered",
    "Noncreature spells you cast this turn can't be countered",
    "Instant and sorcery spells you cast this turn can't be countered",
  ],
  rejects: [
    "Creature spells you cast can't be countered",
    "Creature spells you cast this turn can't be countered and you draw a card",
    "Creature spells your opponents cast this turn can't be countered",
    "Creature spells you cast until end of turn can't be countered",
    "Creature spells you cast this turn can't be copied",
    "Creature spells you cast with flying this turn can't be countered",
    "Creature spells you cast from your hand this turn can't be countered",
  ],
  parse: single(ID, spellsNoun, (spells) => ({
    verb: 'spellsCantBeCounteredThisTurn',
    args: { spells },
  })),
});

export const SPELLS_CANT_BE_COUNTERED_THIS_TURN_EFFECT_RULES = [
  EFFECT_SPELLS_YOU_CAST_THIS_TURN_CANT_BE_COUNTERED,
];
