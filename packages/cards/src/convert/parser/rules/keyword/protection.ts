/**
 * "Protection from black", "protection from red and from blue" (CR 702.16: protection from a color; stage P68, D-229). One keyword with the colors it names,
 * read by `keyword.line` in a list with the keywords without a parameter ("Flying, protection from black"). Protection from a quality that is not a color
 * (a card type, a player, everything, monocolored) is not read.
 */
import { choice, fail, type Parser, pattern } from '../../combinators';
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

/** The card types a protection can be from, in the plural as a card says them (CR 205.2a), as the engine's card type words. */
const CARD_TYPE_PLURALS: Readonly<Record<string, string>> = {
  artifacts: 'artifact',
  battles: 'battle',
  creatures: 'creature',
  enchantments: 'enchantment',
  instants: 'instant',
  lands: 'land',
  planeswalkers: 'planeswalker',
  sorceries: 'sorcery',
};

const CARD_TYPE_WORD = new RegExp(
  `(${Object.keys(CARD_TYPE_PLURALS).join('|')})(?![\\p{L}\\p{N}])`,
  'iu',
);

/**
 * "protection from creatures", "protection from artifacts and from enchantments" (D-402, Danitha group 1b; CR 702.16a, 205.2a): protection from one or more card types
 * named in the plural, each once. The singular ("protection from creature") and a type with a modifier ("protection from nonblack creatures") are not read.
 */
export const PROTECTION_CARD_TYPES: Parser<string[]> = (ctx, pos) => {
  const head = pattern(/protection from /iu)(ctx, pos);
  if (!head.ok) return head;
  const types: string[] = [];
  let at = head.pos;
  // The end of the last type read: the words " and from " before one that is not a card type are not part of this protection.
  let end = at;
  for (;;) {
    const word = pattern(CARD_TYPE_WORD)(ctx, at);
    if (!word.ok) return types.length === 0 ? word : { ok: true, value: types, pos: end };
    const type = CARD_TYPE_PLURALS[(word.value[1] ?? '').toLowerCase()];
    if (type === undefined || types.includes(type)) {
      return types.length === 0 ? fail(ctx, pos) : { ok: true, value: types, pos: end };
    }
    types.push(type);
    end = word.pos;
    const more = pattern(/ and from /iu)(ctx, end);
    if (!more.ok) return { ok: true, value: types, pos: end };
    at = more.pos;
  }
};

/** "protection from each color that's not in your commander's color identity" (stage P70, D-259, CR 702.16h, 903.4, 903.4f). */
export const PROTECTION_OUTSIDE_COMMANDER_IDENTITY: Parser<RegExpExecArray> = pattern(
  /protection from each color that['\u2019]s not in your commander['\u2019]s color identity(?![\p{L}\p{N}])/iu,
);

/** "protection from multicolored" (CR 702.16a, 105.2): protection from every source with two or more colors. */
const PROTECTION_MULTICOLORED: Parser<RegExpExecArray> = pattern(
  /protection from multicolored(?![\p{L}\p{N}])/iu,
);

/** "protection from mana value 3 or greater", "... 2 or less", "... mana value 0" (CR 702.16a, 202.3). */
const PROTECTION_MANA_VALUE: Parser<{ cmp: 'atLeast' | 'atMost' | 'equal'; value: number }> = (
  ctx,
  pos,
) => {
  const m = pattern(/protection from mana value (\d+)( or greater| or less)?(?![\p{L}\p{N}])/iu)(
    ctx,
    pos,
  );
  if (!m.ok) return m;
  const tail = (m.value[2] ?? '').toLowerCase();
  const cmp = tail === ' or greater' ? 'atLeast' : tail === ' or less' ? 'atMost' : 'equal';
  return { ok: true, value: { cmp, value: Number(m.value[1]) }, pos: m.pos };
};

export function protectionKeyword(rule: string): Parser<IrKeyword> {
  return choice(
    node<string[], IrKeyword>(rule, PROTECTION_COLORS, (colors) => ({
      kind: 'keyword',
      name: 'protection',
      params: [],
      colors,
    })),
    node<RegExpExecArray, IrKeyword>(rule, PROTECTION_MULTICOLORED, () => ({
      kind: 'keyword',
      name: 'protection',
      params: [],
      quality: 'multicolored',
    })),
    node<{ cmp: 'atLeast' | 'atMost' | 'equal'; value: number }, IrKeyword>(
      rule,
      PROTECTION_MANA_VALUE,
      (manaValue) => ({ kind: 'keyword', name: 'protection', params: [], manaValue }),
    ),
  );
}
