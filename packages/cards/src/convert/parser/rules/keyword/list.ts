/**
 * A list of keywords the engine can grant, as Oracle text writes it after "has", "have", "gains" or
 * "gain" (CR 613.1f): "flying", "first strike and trample", "flying, first strike, and vigilance".
 * Used by the static grants ("Equipped creature has ...") and by the effects ("Target creature
 * gains ... until end of turn"), so both read the same words in the same shapes.
 */
import { choice, fail, map, type Parser, pattern } from '../../combinators';
import { BOUNDARY } from '../noun/phrases';
import { GRANTABLE_KEYWORDS, LANDWALKS } from './vocabulary';

export const KEYWORD_WORD: Parser<string> = choice(
  ...GRANTABLE_KEYWORDS.map(([word]) =>
    map(pattern(new RegExp(`${word.replace(' ', '\\s+')}${BOUNDARY}`, 'iu')), () => word as string),
  ),
  // D-473 (CR 702.14): a landwalk, "swampwalk", "nonbasic landwalk".
  ...LANDWALKS.map(([word]) =>
    map(pattern(new RegExp(`${word.replace(' ', '\\s+')}${BOUNDARY}`, 'iu')), () => word as string),
  ),
  // D-640 (CR 702.86a): "annihilator 2", the number in digits, the word kept with its number ("annihilator 2").
  map(
    pattern(new RegExp(`annihilator\\s+([1-9]\\d*)${BOUNDARY}`, 'iu')),
    (m) => `annihilator ${m[1]}` as string,
  ),
  // D-638 (CR 702.21a): "ward {2}", the mana cost in braces, the word kept with its cost ("ward {2}").
  map(
    pattern(new RegExp(`ward\\s+((?:\\{[0-9WUBRGC]\\})+)${BOUNDARY}`, 'iu')),
    (m) => `ward ${m[1]}` as string,
  ),
  // Issue 101 (CR 702.181a): "mobilize 2", and "mobilize X, where X is its power" (Infantry Shield), kept as "mobilize power".
  map(
    pattern(new RegExp(`mobilize\\s+([1-9]\\d*)${BOUNDARY}`, 'iu')),
    (m) => `mobilize ${m[1]}` as string,
  ),
  map(
    pattern(new RegExp(`mobilize x, where x is its power${BOUNDARY}`, 'iu')),
    () => 'mobilize power' as string,
  ),
  // Issue 102 (CR 702.52a): "dredge 3", the number in digits, the word kept with its number ("dredge 3").
  map(
    pattern(new RegExp(`dredge\\s+([1-9]\\d*)${BOUNDARY}`, 'iu')),
    (m) => `dredge ${m[1]}` as string,
  ),
  // D-472 (CR 702.130a): "afflict 3", the number in digits, the word kept with its number ("afflict 3").
  map(
    pattern(new RegExp(`afflict\\s+([1-9]\\d*)${BOUNDARY}`, 'iu')),
    (m) => `afflict ${m[1]}` as string,
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
export const KEYWORD_WORDS: Parser<string[]> = keywordWordsOf(KEYWORD_WORD);

/** The list of `KEYWORD_WORDS` over another set of words, one word at a time: the keywords a token may have print more words than a grant may give (issue 104: "with changeling"). */
export function keywordWordsOf(word: Parser<string>): Parser<string[]> {
  return (ctx, pos) => {
    const first = word(ctx, pos);
    if (!first.ok) return first;
    const words = [first.value];
    const separators: { readonly text: string; readonly at: number }[] = [];
    let end = first.pos;
    for (;;) {
      const sep = SEPARATOR.exec(ctx.text.slice(end, end + 6));
      if (sep === null) break;
      const next = word(ctx, end + sep[0].length);
      if (!next.ok) break;
      if (words.includes(next.value)) return fail(ctx, next.pos);
      separators.push({ text: sep[0].toLowerCase(), at: end });
      words.push(next.value);
      end = next.pos;
    }
    // Oracle shape: "A and B", "A, B, and C": commas between all but the last two, ", and" before.
    // CR 613.1f (Nazgûl Battle-Mace): "has menace, deathtouch, and \"Whenever ...\"": when the ", and" belongs to a quoted ability that follows, every separator of the keywords is a comma.
    const quoteFollows = /^, and ["“]/u.test(ctx.text.slice(end, end + 8));
    const last = separators.length - 1;
    for (const [i, sep] of separators.entries()) {
      const expected = quoteFollows || i < last ? ', ' : last === 0 ? ' and ' : ', and ';
      if (sep.text !== expected) return fail(ctx, sep.at);
    }
    return { ok: true, value: words, pos: end };
  };
}
