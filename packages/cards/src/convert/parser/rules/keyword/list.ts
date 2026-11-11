/**
 * A list of keywords the engine can grant, as Oracle text writes it after "has", "have", "gains" or
 * "gain" (CR 613.1f): "flying", "first strike and trample", "flying, first strike, and vigilance".
 * Used by the static grants ("Equipped creature has ...") and by the effects ("Target creature
 * gains ... until end of turn"), so both read the same words in the same shapes.
 */
import { choice, fail, map, type Parser, pattern } from '../../combinators';
import { BOUNDARY } from '../noun/phrases';
import { GRANTABLE_KEYWORDS } from './vocabulary';

export const KEYWORD_WORD: Parser<string> = choice(
  ...GRANTABLE_KEYWORDS.map(([word]) =>
    map(pattern(new RegExp(`${word.replace(' ', '\\s+')}${BOUNDARY}`, 'iu')), () => word as string),
  ),
);

const SEPARATOR = /^(?:, and | and |, )/i;

/**
 * At least one keyword the engine can grant, two joined by " and ", more by commas with ", and"
 * before the last (the way Oracle text is written; anything else is not English and is not read),
 * none twice. A separator is looked at without reading, so a list that ends where the sentence goes
 * on ("gains flying and gets +1/+1", "has flying, and ...") ends there with no failure recorded.
 * A list that is not well formed fails at the first wrong separator or at the end of a repeated
 * keyword, so the diagnostic points at the words that are wrong. The words are lowercase, as
 * `SIMPLE_KEYWORDS` spells them ("first strike").
 */
export const KEYWORD_WORDS: Parser<string[]> = (ctx, pos) => {
  const first = KEYWORD_WORD(ctx, pos);
  if (!first.ok) return first;
  const words = [first.value];
  const separators: { readonly text: string; readonly at: number }[] = [];
  let end = first.pos;
  for (;;) {
    const sep = SEPARATOR.exec(ctx.text.slice(end, end + 6));
    if (sep === null) break;
    const next = KEYWORD_WORD(ctx, end + sep[0].length);
    if (!next.ok) break;
    if (words.includes(next.value)) return fail(ctx, next.pos);
    separators.push({ text: sep[0].toLowerCase(), at: end });
    words.push(next.value);
    end = next.pos;
  }
  // Oracle shape: "A and B", "A, B, and C": commas between all but the last two, ", and" before.
  const last = separators.length - 1;
  for (const [i, sep] of separators.entries()) {
    const expected = i < last ? ', ' : last === 0 ? ' and ' : ', and ';
    if (sep.text !== expected) return fail(ctx, sep.at);
  }
  return { ok: true, value: words, pos: end };
};
