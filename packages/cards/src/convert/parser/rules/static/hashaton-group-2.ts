/**
 * Static ability rules of the Hashaton deck program, group 2 (D-363, provisional): "Your opponents can't gain life." (CR 119.7, 604.1), the engine's
 * `cantGainLife`.
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrStatic } from '../../ir/types';
import { defineRule, quietly, spanned } from '../registry';
import { staticOf, subjectNoun } from './angels-words';

/**
 * `static.opponents-cant-gain-life`: "Your opponents can't gain life." (CR 119.7: while the permanent has the ability, no opponent of its controller can
 * gain life, by any means: an effect, lifelink, an exchange that would raise the life total; CR 604.1: a static ability of the permanent, lost with the
 * abilities). The subject is the controller of the permanent. Not read: another group ("Each opponent", "Players", "You"), "lose life", a duration or
 * a condition ("until end of turn", "as long as ..."), and more words after it ("and draw a card").
 */
export const STATIC_OPPONENTS_CANT_GAIN_LIFE = defineRule<IrStatic>({
  id: 'static.opponents-cant-gain-life',
  family: 'static',
  leading: ['your'],
  cites: [
    'CR 119.7 (Life)',
    'CR 604.1 (Handling Static Abilities)',
    'CR 702.15b (Lifelink)',
    'CR 101.2 (Golden Rules)',
  ],
  examples: ["Your opponents can't gain life.", 'Your opponents can’t gain life.'],
  rejects: [
    "Your opponents can't gain life",
    "Each opponent can't gain life.",
    "Players can't gain life.",
    "You can't gain life.",
    "Your opponents can't lose life.",
    "Your opponents can't gain life until end of turn.",
    "Your opponents can't gain life as long as you control a Dragon.",
    "Your opponents can't gain life and you draw a card.",
    "Your opponents can't gain life or lose life.",
    "Target opponent can't gain life.",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      spanned(literal('your')),
      pattern(/ opponents can['’]t gain life/iu),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [you] = r.value;
    return {
      ok: true,
      value: staticOf(
        'static.opponents-cant-gain-life',
        subjectNoun('you', 'your', you.span, 'static.opponents-cant-gain-life'),
        [{ kind: 'cantGainLife', who: 'opponents' }],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

export const HASHATON_G2_STATIC_RULES = [STATIC_OPPONENTS_CANT_GAIN_LIFE].map(quietly);
