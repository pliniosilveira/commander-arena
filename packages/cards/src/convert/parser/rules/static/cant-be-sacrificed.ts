/**
 * Static ability rule: "This artifact can't be sacrificed." (CR 701.21a, 101.2, 604.1), the engine's `cantBeSacrificed`.
 */
import { literal, pattern, quiet, sequence } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';
import { staticOf } from './angels-words';

/**
 * `static.cant-be-sacrificed`: "~ can't be sacrificed." (CR 701.21a, 101.2, 604.1: no player can sacrifice the permanent; a "can't" effect makes the
 * instruction do nothing). Said of the permanent itself, whose name or type the text may use ("This artifact"). Not read: another subject, a group
 * ("Creatures you control can't be sacrificed"), a condition or a duration, more words after it.
 */
export const STATIC_CANT_BE_SACRIFICED = defineRule<IrStatic>({
  id: 'static.cant-be-sacrificed',
  family: 'static',
  leading: [],
  cites: [
    'CR 701.21a (Sacrifice)',
    'CR 101.2 (Golden Rules)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    "~ can't be sacrificed.",
    'This artifact can’t be sacrificed.',
    "This creature can't be sacrificed.",
  ],
  rejects: [
    "~ can't be sacrificed",
    "~ can't be sacrificed until end of turn.",
    "~ can't be sacrificed as long as you control a Dragon.",
    "~ can't be sacrificed and has flying.",
    "Creatures you control can't be sacrificed.",
    "Enchanted creature can't be sacrificed.",
    "~ can't be sacrificed or exiled.",
    '~ can be sacrificed.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      quiet(family<IrNoun>('noun', { only: ['noun.self'] })),
      pattern(/ can['’]t be sacrificed/iu),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [noun] = r.value;
    return {
      ok: true,
      value: staticOf(
        'static.cant-be-sacrificed',
        noun,
        [{ kind: 'cantBeSacrificed' }],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

export const CANT_BE_SACRIFICED_STATIC_RULES = [STATIC_CANT_BE_SACRIFICED].map(quietly);
