/**
 * Replacement rule of the Tannuk deck (issue 347): "If a red source you control would deal damage to an opponent or a permanent an opponent controls, it
 * deals that much damage plus 2 instead." (CR 614.1a: "instead" makes it a replacement effect of the permanent; CR 120.3: the same source deals more damage).
 */
import { literal, type Parser, pattern, satisfy, sequence } from '../../combinators';
import type { IrAbility, IrClause, IrFilter, IrNoun } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, quietly, spanned } from '../registry';
import { replacement } from './shared';

const COLOR_WORDS = ['white', 'blue', 'black', 'red', 'green'];
const TYPE_WORDS = ['artifact', 'creature', 'enchantment', 'land', 'planeswalker'];
const WORD = new RegExp(`(${[...COLOR_WORDS, ...TYPE_WORDS].join('|')})(?![\\p{L}\\p{N}])`, 'iu');

/** "red", "red or artifact": a color or a card type of the source, one or more joined by " or " (any one of them is enough, CR 105.2, 205.2a). */
const SOURCE_WORDS: Parser<readonly string[]> = (ctx, pos) => {
  const words: string[] = [];
  let at = pos;
  for (;;) {
    const word = pattern(WORD)(ctx, at);
    if (!word.ok) return word;
    words.push(word.value[1]?.toLowerCase() ?? '');
    at = word.pos;
    const more = literal(' or ')(ctx, at);
    if (!more.ok) break;
    at = more.pos;
  }
  return { ok: true as const, value: words, pos: at };
};

/** The filter of the source: one color or type is the filter itself, several are a disjunction (`anyOf`); the sources are the controller's own. */
function sourceFilter(words: readonly string[]): IrFilter {
  const one = (w: string): IrFilter =>
    COLOR_WORDS.includes(w) ? { raw: w, colors: [w] } : { raw: w, types: [w] };
  const [first] = words;
  if (words.length === 1 && first !== undefined) return { ...one(first), controller: 'you' };
  return { raw: words.join(' or '), anyOf: words.map(one), controller: 'you' };
}

/**
 * `replacement.damage-bonus`: "If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage
 * plus 2 instead.", "If a red or artifact source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much
 * damage plus 1 instead." (CR 614.1a, 120.3, 616.1: combat or not, by a permanent or a spell; the source is a color or a card type, or several joined by "or").
 * The engine's `damageBonus`. Not read: a source of another player or of no player ("a red source"), a source of no color or type ("a source you control"),
 * other recipients ("to a creature", "to any target", "to you"), only combat or noncombat damage, another amount form ("plus X", "twice that much", "double"),
 * "minus", and a missing period.
 */
export const REPLACEMENT_DAMAGE_BONUS = defineRule<IrAbility>({
  id: 'replacement.damage-bonus',
  family: 'replacement',
  leading: ['if'],
  cites: [
    'CR 614.1a (Replacement Effects)',
    'CR 120.3 (Damage)',
    'CR 616.1 (Interaction of Replacement and/or Prevention Effects)',
    'CR 105.2 (Colors)',
  ],
  examples: [
    'If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead.',
    'If a red or artifact source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 1 instead.',
    'If a green source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus three instead.',
    'If an artifact source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 1 instead.',
  ],
  rejects: [
    'If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead',
    'If a red source would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead.',
    'If a source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead.',
    'If a red source an opponent controls would deal damage to you or a permanent you control, it deals that much damage plus 2 instead.',
    'If a red source you control would deal damage to a creature an opponent controls, it deals that much damage plus 2 instead.',
    'If a red source you control would deal damage to an opponent, it deals that much damage plus 2 instead.',
    'If a red source you control would deal damage to any target, it deals that much damage plus 2 instead.',
    'If a red source you control would deal combat damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead.',
    'If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus X instead.',
    'If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 0 instead.',
    'If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals twice that much damage instead.',
    'If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage minus 1 instead.',
    'If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead. Draw a card.',
    'If a red or source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead.',
  ],
  parse: (ctx, pos) => {
    const id = 'replacement.damage-bonus';
    const head = literal('if a')(ctx, pos);
    if (!head.ok) return head;
    // "an artifact source": the article before a vowel.
    const article = pattern(/n? /iu)(ctx, head.pos);
    if (!article.ok) return article;
    const words = spanned(SOURCE_WORDS)(ctx, article.pos);
    if (!words.ok) return words;
    const body = sequence(
      literal(
        ' source you control would deal damage to an opponent or a permanent an opponent controls, ',
      ),
      literal('it deals that much damage plus '),
      spanned(satisfy(quantity, (n) => n >= 1)),
      pattern(/ instead(?![\p{L}\p{N}])/iu),
      literal('.'),
    )(ctx, words.pos);
    if (!body.ok) return body;
    const [, , amount] = body.value;
    const span = { start: pos, end: body.pos };
    const sources: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: sourceFilter(words.value.value),
      upTo: false,
      plural: false,
      other: false,
      span: words.value.span,
      rule: id,
    };
    const event: IrClause = {
      kind: 'clause',
      verb: 'damageBonus',
      args: { sources, amount: { kind: 'number', value: amount.value, span: amount.span } },
      optional: false,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: body.pos };
  },
});

export const DAMAGE_BONUS_REPLACEMENT_RULES = [REPLACEMENT_DAMAGE_BONUS].map(quietly);
