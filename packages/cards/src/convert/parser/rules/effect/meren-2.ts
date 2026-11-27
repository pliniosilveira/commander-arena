/**
 * Effect rules of the Meren 2 deck (issue 712): "Return up to one creature card and up to one land card from your graveyard to your hand." (Druidic Ritual).
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrFlag, IrNoun, IrZoneSpec } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { type Clauses, makeClause } from './operands';

const RULE = 'effect.return-up-to-one-of-each-kind';
const KINDS = 'artifact|battle|creature|enchantment|land|planeswalker';

/**
 * `effect.return-up-to-one-of-each-kind`: "return up to one creature card and up to one land card from your graveyard to your hand" (CR 608.2d: the player chooses as it comes up; CR
 * 404.1: the cards of their own graveyard, any card of the kind in it, not a target; CR 400.7: a card that changes zones is a new object). One choice for each kind, of none or one
 * card: the engine's `moveToZone` of a `choose` with `optional`, one after the other (a card put into the hand by the first is no longer in the graveyard for the second, so no card
 * is returned twice). One kind alone ("return up to one creature card from your graveyard to your hand") is read the same. Not read: a number but one, a target, another zone, a
 * graveyard that is not yours, the same kind twice, three kinds, "or", a kind with no "card".
 */
export const EFFECT_RETURN_UP_TO_ONE_OF_EACH_KIND = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['return'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 404.1 (Graveyard)',
    'CR 400.7 (General)',
  ],
  examples: [
    'return up to one creature card and up to one land card from your graveyard to your hand',
    'return up to one creature card from your graveyard to your hand',
    'return up to one artifact card and up to one enchantment card from your graveyard to your hand',
  ],
  rejects: [
    'return up to two creature cards from your graveyard to your hand',
    'return up to one target creature card from your graveyard to your hand',
    'return up to one creature card and up to one creature card from your graveyard to your hand',
    'return up to one creature card and up to one land card and up to one artifact card from your graveyard to your hand',
    'return up to one creature card or up to one land card from your graveyard to your hand',
    'return up to one creature card and up to one land card from a graveyard to your hand',
    'return up to one creature card and up to one land card from your graveyard to the battlefield',
    'return up to one creature and up to one land card from your graveyard to your hand',
    'return up to one creature card and up to one land card from your graveyard to your hand and draw a card',
  ],
  parse: (ctx, pos) => {
    const head = sequence(
      literal('return up to one '),
      pattern(new RegExp(`(${KINDS}) card`, 'iu')),
      pattern(new RegExp(`(?: and up to one (${KINDS}) card)?`, 'iu')),
      literal(' from your graveyard to your hand'),
      pattern(/(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/u),
    )(ctx, pos);
    if (!head.ok) return head;
    const first = (head.value[1][1] ?? '').toLowerCase();
    const second = head.value[2][1]?.toLowerCase();
    if (second === first) return fail(ctx, pos);
    const span = { start: pos, end: head.pos };
    const to: IrZoneSpec = { kind: 'zoneSpec', zone: 'hand', whose: 'you', span, rule: RULE };
    const may: IrFlag = { kind: 'flag', value: true, span, rule: RULE };
    // Each kind has its own span (the words of its own "card"), so the lowering never reads one kind for the other.
    const firstStart = pos + 'return up to one '.length;
    const spans = [
      { start: firstStart, end: firstStart + first.length + ' card'.length },
      ...(second === undefined
        ? []
        : [
            {
              start: firstStart + first.length + ' card and up to one '.length,
              end:
                firstStart +
                first.length +
                ' card and up to one '.length +
                second.length +
                ' card'.length,
            },
          ]),
    ];
    const clauses = [first, ...(second === undefined ? [] : [second])].map((kind, i) => {
      const at = spans[i] ?? span;
      const objects: IrNoun = {
        kind: 'noun',
        det: 'a',
        filter: {
          zone: 'graveyard',
          controller: 'you',
          card: true,
          types: [kind],
          raw: `${kind} card`,
        },
        upTo: false,
        plural: false,
        other: false,
        span: at,
        rule: RULE,
      };
      return makeClause(RULE, 'putFromZone', { objects, to, may }, at);
    });
    return { ok: true, value: clauses, pos: head.pos };
  },
});

export const MEREN_2_EFFECT_RULES = [quietly(EFFECT_RETURN_UP_TO_ONE_OF_EACH_KIND)];
