/**
 * Static rule of the Hatsune Miku deck (issue 145): "Creature spells you cast have demonstrate." (Silverquill Lecturer, CR 702.144a, 702.51a, 613.1f, 604.2).
 */
import { choice, fail, literal, map, quiet, sequence } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule } from '../registry';
import { spellSubject } from './cost';

/** The parts of a spell's filter this rule keeps: what the spell is (types, subtypes, colors) and the words it was read from. */
const ALLOWED: ReadonlySet<string> = new Set([
  'raw',
  'types',
  'notTypes',
  'subtypes',
  'notSubtypes',
  'colors',
  'anyOf',
]);

/**
 * `static.spells-you-cast-have-keyword`: "Creature spells you cast have demonstrate." A static ability of a permanent that gives a keyword to the spells its controller casts that the
 * subject names, as they are cast (CR 702.144a: Demonstrate triggers when its spell is cast; CR 702.51a: Convoke applies while its spell is on the stack). The engine's
 * `grantKeywordToSpells`, for the keywords it reads from a spell as it is cast: Demonstrate and Convoke. The subject is the same one the cost reductions of spells read ("Artifact spells",
 * "Creature spells", "Red creature spells", "Instant and sorcery spells"). Not read: spells of other players or of every player ("Creature spells have ...", "... your opponents cast"),
 * other qualities of the spell ("with flying", "with power 4 or greater"), other keywords, two keywords, a keyword with a cost, a duration, no period.
 */
export const STATIC_SPELLS_YOU_CAST_HAVE_KEYWORD = defineRule<IrStatic>({
  id: 'static.spells-you-cast-have-keyword',
  family: 'static',
  leading: [],
  cites: [
    'CR 702.144a (Demonstrate)',
    'CR 702.51a (Convoke)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 604.2 (Handling Static Abilities)',
  ],
  examples: [
    'Creature spells you cast have demonstrate.',
    'Creature spells you cast have convoke.',
    'Spells you cast have convoke.',
    'Noncreature spells you cast have demonstrate.',
    'Red creature spells you cast have convoke.',
    'Instant and sorcery spells you cast have demonstrate.',
  ],
  rejects: [
    'Creature spells you cast have demonstrate',
    'Creature spells have demonstrate.',
    'Creature spells your opponents cast have demonstrate.',
    'Creature spells you control have demonstrate.',
    'Creature spells you cast has demonstrate.',
    'Creature spells you cast have flying.',
    'Creature spells you cast have demonstrate and convoke.',
    'Creature spells you cast have demonstrate {1}.',
    'Creature spells you cast have demonstrate until end of turn.',
    'Creature cards in your hand have demonstrate.',
    'Creature spells you cast with flying have demonstrate.',
    'Creature spells you cast with power 4 or greater have demonstrate.',
    'Creature spells you cast of the chosen type have demonstrate.',
    'Creature spells you cast from your graveyard have demonstrate.',
    'Creature spell you cast has demonstrate.',
  ],
  parse: (ctx, pos) => {
    // The words up to the keyword decide whether this is the statement at all ("Creature spells you cast cost {1} less" never was): their failure is no trace in the diagnostics.
    const r = sequence(
      quiet(
        sequence(
          spellSubject(),
          literal(' you cast have '),
          choice(
            map(literal('demonstrate'), () => 'demonstrate' as const),
            map(literal('convoke'), () => 'convoke' as const),
          ),
        ),
      ),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [[filter, , keyword]] = r.value;
    // The spells are named by what they are: types, colors and subtypes. A quality the engine's filter of a granted spell does not read is never dropped.
    if (!Object.keys(filter).every((k) => ALLOWED.has(k))) return fail(ctx, pos);
    const rule = 'static.spells-you-cast-have-keyword';
    const subject: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: { ...filter, controller: 'you' },
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos, end: pos + filter.raw.length },
      rule,
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [{ kind: 'spellKeyword', keyword }],
        span: { start: pos, end: r.pos },
        rule,
      },
      pos: r.pos,
    };
  },
});

export const SPELL_KEYWORD_GRANT_STATIC_RULES = [STATIC_SPELLS_YOU_CAST_HAVE_KEYWORD];
