/**
 * Replacement rules of the Niv-Mizzet deck program, group 2b-a (issue 25, D-332): "If you would draw a card while your library has no cards in it, skip
 * that draw instead." (CR 614.11, 121.6: an effect that replaces a card draw, applied even when the library has no cards in it).
 */
import { literal, optional, pattern, sequence } from '../../combinators';
import type { IrAbility, IrClause, IrCondition } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
import { replacement } from './shared';

/**
 * `replacement.skip-draw`: "If you would draw a card, skip that draw instead.", "If you would draw a card while your library has no cards in it, skip that
 * draw instead." (CR 614.1a, 614.11, 121.6: every card draw of the controller of the permanent is replaced by nothing; with "while", only while the
 * condition holds as the draw would happen, and it is applied even when the library has no cards, CR 614.11, 121.6a). The engine's `skipDraw`. The player is
 * the controller of the permanent. Not read: another player ("If an opponent would draw a card"), another replacement ("draw two cards instead", "you
 * lose the game instead"), a count ("If you would draw two cards"), a condition the condition family does not read, a "while" with a condition the engine
 * cannot read at a draw, a missing period.
 */
export const REPLACEMENT_SKIP_DRAW = defineRule<IrAbility>({
  id: 'replacement.skip-draw',
  family: 'replacement',
  leading: ['if'],
  cites: [
    'CR 614.1a (Replacement Effects)',
    'CR 614.11 (Replacement Effects)',
    'CR 121.6 (Drawing a Card)',
    'CR 121.4 (Drawing a Card)',
  ],
  examples: [
    'If you would draw a card, skip that draw instead.',
    'If you would draw a card while your library has no cards in it, skip that draw instead.',
    'If you would draw a card while there are no cards in your library, skip that draw instead.',
    'If you would draw a card while your library has fewer than three cards in it, skip that draw instead.',
  ],
  rejects: [
    'If you would draw a card, skip that draw instead',
    'If you would draw a card, skip that draw.',
    'If you would draw a card while your library has no cards in it, skip that draw instead',
    'If you would draw a card while, skip that draw instead.',
    'If an opponent would draw a card, skip that draw instead.',
    'If a player would draw a card, skip that draw instead.',
    'If you would draw two cards, skip that draw instead.',
    'If you would draw a card, draw two cards instead.',
    'If you would draw a card, you lose the game instead.',
    'If you would draw a card while you control a creature, skip that draw instead.',
    'If you would draw a card while your library has no cards in it, skip that draw instead. Draw a card.',
    'If you would draw a card while your library has no cards in it, skip your draw step instead.',
    'If you would draw a card while your library has no cards in it, skip that draw.',
    'If you would gain life, skip that gain instead.',
  ],
  parse: (ctx, pos) => {
    const id = 'replacement.skip-draw';
    const r = sequence(
      literal('if you would draw a card'),
      optional(
        sequence(
          literal(' while '),
          spanned(family<IrCondition>('condition', { only: ['condition.cards-in-library'] })),
        ),
        null,
      ),
      pattern(/, skip that draw instead(?![\p{L}\p{N}])/iu),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, when] = r.value;
    const span = { start: pos, end: r.pos };
    const event: IrClause = {
      kind: 'clause',
      verb: 'skipDraw',
      args: {},
      optional: false,
      ...(when === null ? {} : { condition: when[1].value }),
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: r.pos };
  },
});

export const SKIP_DRAW_REPLACEMENT_RULES = [REPLACEMENT_SKIP_DRAW].map(quietly);
