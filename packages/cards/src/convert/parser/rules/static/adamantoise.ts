/**
 * Static ability rule of stage P43 (D-193): the damage that stays, of the Korvold deck's Ancient Adamantoise: "Damage isn't removed from ~ during
 * cleanup steps." (CR 514.2). It is one whole line. The redirection of the same card is a replacement rule (`replacement/adamantoise.ts`: the
 * segmenter hands a line with "would" and "instead" to the replacement family).
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrStatic } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { staticOf, subjectNoun } from './angels-words';

const PERIOD = literal('.');

/**
 * `static.keeps-damage`: "Damage isn't removed from ~ during cleanup steps." (CR 514.2: the damage marked on permanents is removed in the cleanup
 * step; a static ability of the permanent stops it for that permanent alone). Not read: another permanent ("from creatures you control"), another
 * step ("during the end step"), "all" of a kind, a duration, a condition and "damage isn't removed from ~" with no step.
 */
export const STATIC_KEEPS_DAMAGE = defineRule<IrStatic>({
  id: 'static.keeps-damage',
  family: 'static',
  leading: ['damage'],
  cites: [
    'CR 514.2 (Cleanup Step)',
    'CR 604.1 (Handling Static Abilities)',
    'CR 704.5g (State-Based Actions)',
  ],
  examples: [
    "Damage isn't removed from ~ during cleanup steps.",
    'Damage isn’t removed from ~ during cleanup steps.',
    "damage isn't removed from ~ during cleanup steps.",
  ],
  rejects: [
    "Damage isn't removed from ~ during cleanup steps",
    "Damage isn't removed from creatures you control during cleanup steps.",
    "Damage isn't removed from ~ during the cleanup step.",
    "Damage isn't removed from ~ during end steps.",
    "Damage isn't removed from ~.",
    "Damage isn't removed from ~ during cleanup steps this turn.",
    "Damage isn't removed from ~ during cleanup steps as long as you control a Turtle.",
    "Damage isn't removed from ~ during cleanup steps and ~ has hexproof.",
    "Damage isn't removed from target creature during cleanup steps.",
    'Damage is removed from ~ during cleanup steps.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(/damage isn['’]t removed from /iu),
      spanned(literal('~')),
      literal(' during cleanup steps'),
      PERIOD,
    )(ctx, pos);
    if (!r.ok) return r;
    const [, self] = r.value;
    return {
      ok: true,
      value: staticOf(
        'static.keeps-damage',
        subjectNoun('self', '~', self.span, 'static.keeps-damage'),
        [{ kind: 'keepsDamage' }],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

export const ADAMANTOISE_STATIC_RULES = [STATIC_KEEPS_DAMAGE];
