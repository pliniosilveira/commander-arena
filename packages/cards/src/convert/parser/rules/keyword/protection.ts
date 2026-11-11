/**
 * "Protection from black", "protection from red and from blue" (CR 702.16: protection from a color; stage P68, D-229). One keyword with the colors it names,
 * read by `keyword.line` in a list with the keywords without a parameter ("Flying, protection from black"). Protection from a quality that is not a color
 * (a card type, a player, everything, monocolored) is not read.
 */
import { type Parser, pattern } from '../../combinators';
import type { IrKeyword } from '../../ir/types';
import { node } from '../registry';

const COLOR_WORD = /(white|blue|black|red|green)(?![\p{L}\p{N}])/iu;

export function protectionKeyword(rule: string): Parser<IrKeyword> {
  return node<string[], IrKeyword>(
    rule,
    (ctx, pos) => {
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
    },
    (colors) => ({ kind: 'keyword', name: 'protection', params: [], colors }),
  );
}
