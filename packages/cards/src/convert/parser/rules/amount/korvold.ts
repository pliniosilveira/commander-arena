/**
 * Amount rules of stage P37 (D-180): "for each color among permanents you control" (CR 105.2: the colors the objects have between them, each
 * once). The counted objects are a plural group of permanents of the kinds `noun.plain-permanents` reads, with the controller they name.
 */
import { fail, literal, type Parser, sequence } from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';

/**
 * `amount.for-each-color`: "for each color among permanents you control", "for each color among creatures you control" (CR 105.2, 700.5): how
 * many of the five colors the permanents have between them (a color counts once however many have it, colorless is no color). The engine's
 * `colorsAmong`, read by a static ability's "+N/+N" and as an effect's amount. Not read: "for each color of mana", "for each color among cards in your hand" and a
 * group with no controller.
 */
export const AMOUNT_FOR_EACH_COLOR = defineRule<IrAmount>({
  id: 'amount.for-each-color',
  family: 'amount',
  leading: ['for'],
  cites: ['CR 105.2 (Colors)', 'CR 611.3a (Continuous Effects)'],
  examples: [
    'for each color among permanents you control',
    'for each color among creatures you control',
    'for each color among nonland permanents you control',
  ],
  rejects: [
    'for each color',
    'for each color among permanents',
    'for each color among cards in your hand',
    'for each color of mana',
    'for each colors among permanents you control',
    'for each color among your permanents',
    'each color among permanents you control',
    'for each color among permanents your opponents control',
  ],
  parse: colorsAmong('for each color among '),
});

/**
 * `<head>colors among permanents you control`: the colors the permanents have between them, each once (CR 105.2). The permanents are the controller's own ("you control" is part
 * of the phrase) and not "other" ones; the engine's `colorsAmong`.
 */
function colorsAmong(head: string): Parser<IrAmount> {
  return (ctx, pos) => {
    const r = spanned(
      sequence(literal(head), family<IrNoun>('noun', { only: ['noun.plain-permanents'] })),
    )(ctx, pos);
    if (!r.ok) return r;
    const of = r.value.value[1];
    if (of.filter.controller !== 'you' || of.other) return fail(ctx, pos);
    return {
      ok: true,
      value: { kind: 'colorsAmong', of, span: { start: pos, end: r.pos } },
      pos: r.pos,
    };
  };
}

/**
 * "the number of colors among permanents you control" (Vivid, CR 105.2: how many of the five colors the permanents have between them, colorless being no color): the amount of an
 * instruction, read after "equal to" and "where X is" (`amount/value.ts`). Not read: another controller, a plural "colours", "the number of colors" with no permanents.
 */
export const COLORS_AMONG_VALUE: Parser<IrAmount> = colorsAmong('the number of colors among ');

export const KORVOLD_AMOUNT_RULES = [AMOUNT_FOR_EACH_COLOR];
