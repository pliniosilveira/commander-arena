/**
 * "Protection from black", "protection from red and from blue" (CR 702.16: protection from a color; stage P68, D-229). One keyword with the colors it names,
 * read by `keyword.line` in a list with the keywords without a parameter ("Flying, protection from black"). Protection from a quality that is not a color
 * (a card type, a player, everything, monocolored) is not read.
 */
import { type Parser, pattern } from '../../combinators';
import type { IrKeyword } from '../../ir/types';
import { node } from '../registry';

const COLOR_WORD = /(white|blue|black|red|green)(?![\p{L}\p{N}])/iu;

/** "protection from red", "protection from red and from blue": the color words, lowercase, of a protection from colors. */
export const PROTECTION_COLORS: Parser<string[]> = (ctx, pos) => {
  const head = pattern(/protection from /iu)(ctx, pos);
  if (!head.ok) return head;
  const colors: string[] = [];
  let at = head.pos;
  for (;;) {
    const word = pattern(COLOR_WORD)(ctx, at);
    if (!word.ok) return colors.length === 0 ? word : { ok: true, value: colors, pos: at };
    const color = (word.value[1] ?? '').toLowerCase();
    if (colors.includes(color)) return { ok: true, value: colors, pos: at };
    colors.push(color);
    at = word.pos;
    const more = pattern(/ and from /iu)(ctx, at);
    if (!more.ok) return { ok: true, value: colors, pos: at };
    at = more.pos;
  }
};

/** "protection from each color that's not in your commander's color identity" (stage P70, D-259, CR 702.16h, 903.4, 903.4f). */
export const PROTECTION_OUTSIDE_COMMANDER_IDENTITY: Parser<RegExpExecArray> = pattern(
  /protection from each color that['\u2019]s not in your commander['\u2019]s color identity(?![\p{L}\p{N}])/iu,
);

export function protectionKeyword(rule: string): Parser<IrKeyword> {
  return node<string[], IrKeyword>(rule, PROTECTION_COLORS, (colors) => ({
    kind: 'keyword',
    name: 'protection',
    params: [],
    colors,
  }));
}
