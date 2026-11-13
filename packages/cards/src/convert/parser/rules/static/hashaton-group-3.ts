/**
 * Static ability rules of the Hashaton deck program, group 3 (D-1152, provisional): "Creatures you control can't have -1/-1 counters put on them." (CR 122.6, 101.2,
 * 604.1), the engine's `cantHaveCounters`.
 */
import { choice, literal, map, pattern, quiet, sequence } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';
import { staticOf } from './angels-words';

/** A group of permanents, in the plural: the nouns `static.permanents` reads, which say "them". */
const GROUPS = [
  'noun.plain-permanents',
  'noun.other-permanents',
  'noun.other-subtype-permanents',
  'noun.subtype-union',
  'noun.all-permanents',
  'noun.token-permanents',
];

/** "can't have -1/-1 counters put on" with the counter it names: a power and toughness counter, as Oracle text writes it. */
const CANT_HAVE = sequence(
  pattern(/ can['’]t have /iu),
  pattern(/([+-]\d+\/[+-]\d+)(?![\p{L}\p{N}/])/u),
  pattern(/ counters put on /iu),
);

type Subject = readonly [IrNoun, string];

/**
 * `static.cant-have-counters`: "Creatures you control can't have -1/-1 counters put on them.", "Other creatures you control can't have +1/+1 counters put on them.", "~ can't
 * have +1/+1 counters put on it.", "Enchanted creature can't have -1/-1 counters put on it." (CR 122.6, 101.2, 604.1: no counter of the kind is put on the permanents, on the
 * battlefield or as they enter; a "can't" effect, so the rest of what puts them there still happens). The subject is a group of permanents (plural, "them"), `~` or
 * the permanent an Aura or Equipment is attached to (singular, "it"). The counter is a power and toughness counter ("+1/+1", "-1/-1"). Not read: another kind of
 * counter ("loyalty", "charge", "counters" without a kind), "players can't get counters", "each creature" (another subject), a condition or a duration, the wrong
 * pronoun, more words after it.
 */
export const STATIC_CANT_HAVE_COUNTERS = defineRule<IrStatic>({
  id: 'static.cant-have-counters',
  family: 'static',
  leading: [],
  cites: [
    'CR 122.6 (Counters)',
    'CR 101.2 (Golden Rules)',
    'CR 604.1 (Handling Static Abilities)',
    'CR 614.12 (Replacement Effects)',
  ],
  examples: [
    "Creatures you control can't have -1/-1 counters put on them.",
    'Creatures you control can’t have -1/-1 counters put on them.',
    "Other creatures you control can't have +1/+1 counters put on them.",
    "Elves you control can't have -1/-1 counters put on them.",
    "~ can't have +1/+1 counters put on it.",
    "Enchanted creature can't have -1/-1 counters put on it.",
    "Equipped creature can't have -1/-1 counters put on it.",
  ],
  rejects: [
    "Creatures you control can't have -1/-1 counters put on them",
    "Creatures you control can't have counters put on them.",
    "Creatures you control can't have loyalty counters put on them.",
    "Creatures you control can't have charge counters put on them.",
    "Creatures you control can't have -1/-1 counters put on it.",
    "~ can't have +1/+1 counters put on them.",
    "Creature you control can't have -1/-1 counters put on them.",
    "Creatures you control can't have -1/-1 counters put on them until end of turn.",
    "Creatures you control can't have -1/-1 counters put on them as long as you control a Dragon.",
    "Creatures you control can't have -1/-1 counters put on them and have flying.",
    "Players can't have -1/-1 counters put on them.",
    'Creatures you control can have -1/-1 counters put on them.',
    "Counters can't be put on creatures you control.",
  ],
  parse: (ctx, pos) => {
    const id = 'static.cant-have-counters';
    const plural = map(
      sequence(quiet(family<IrNoun>('noun', { only: GROUPS })), CANT_HAVE, literal('them')),
      ([noun, [, counter]]): Subject => [noun, counter[1] ?? ''],
    );
    const singular = (only: readonly string[]) =>
      map(
        sequence(quiet(family<IrNoun>('noun', { only })), CANT_HAVE, literal('it')),
        ([noun, [, counter]]): Subject => [noun, counter[1] ?? ''],
      );
    const r = sequence(
      choice(plural, singular(['noun.self']), singular(['noun.attached-permanent'])),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [[noun, counter]] = r.value;
    return {
      ok: true,
      value: staticOf(id, noun, [{ kind: 'cantHaveCounters', counter }], pos, r.pos),
      pos: r.pos,
    };
  },
});

export const HASHATON_G3_STATIC_RULES = [STATIC_CANT_HAVE_COUNTERS].map(quietly);
