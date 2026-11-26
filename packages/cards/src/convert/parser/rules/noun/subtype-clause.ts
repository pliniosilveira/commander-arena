/**
 * The words after a phrase about permanents that say which creature types it has or has not (CR 205.3d, 205.3m): "creature you control that's an Insect, Rat, Spider, or Squirrel"
 * (the object has at least one of them) and "creature that isn't an Insect, Rat, Spider, or Squirrel" (it has none of them). The same meaning as "non-Insect" words, said as a
 * clause after the noun, as `withColorList` does for colors.
 */
import { optional, type Parser, pattern, quiet } from '../../combinators';
import type { IrFilter } from '../../ir/types';
import { SUBTYPE_WORD_NUMBERED } from './subtypes';

/** " that's an", " that isn't a": the verb and the article, which says the words after it are in the singular. */
const LEAD = /[ ]that(?:(['’]s)|[ ]isn['’]t) an?[ ]/iu;

/**
 * `phrase`, optionally followed by " that's a(n) A, B, or C" (the object has one of the creature types: the filter becomes a choice with one member for each, as "Insect, Rat, Spider,
 * or Squirrel you control" is) or " that isn't a(n) A, B, or C" (the engine's `notSubtypes`). Only singular words of the table of creature types are read, and a phrase that
 * already has a creature type, a choice of types or a type of its own to deny is left as it was, with the clause unread (the sentence then stops there, never half run).
 */
export function withSubtypeClause(
  phrase: Parser<IrFilter>,
  /** `has`: only "that's a ..."; `hasNot`: only "that isn't a ..."; both by default. A noun that another rule already reads with "that's a A or B" says which half is new. */
  only?: 'has' | 'hasNot',
): Parser<IrFilter> {
  return (ctx, pos) => {
    const base = phrase(ctx, pos);
    if (!base.ok) return base;
    const filter = base.value;
    if (
      filter.anyOf !== undefined ||
      (filter.subtypes?.length ?? 0) > 0 ||
      (filter.notSubtypes?.length ?? 0) > 0
    ) {
      return base;
    }
    const lead = quiet(pattern(LEAD))(ctx, base.pos);
    if (!lead.ok) return base;
    const has = lead.value[1] !== undefined;
    if (only === (has ? 'hasNot' : 'has')) return base;
    const words: string[] = [];
    let at = lead.pos;
    for (;;) {
      const word = SUBTYPE_WORD_NUMBERED(ctx, at);
      if (!word.ok || word.value.plural === true) return base;
      words.push(word.value.subtype);
      const next = optional(quiet(pattern(/(?:, or |, | or )/u)), null)(ctx, word.pos);
      if (!next.ok || next.value === null) {
        at = word.pos;
        break;
      }
      at = next.pos;
    }
    // A word may not be named twice ("Rat or Rat").
    if (new Set(words).size !== words.length) return base;
    const raw = ctx.text.slice(pos, at);
    if (!has) return { ok: true, value: { ...filter, notSubtypes: words, raw }, pos: at };
    if (words.length === 1)
      return { ok: true, value: { ...filter, subtypes: words, raw }, pos: at };
    return {
      ok: true,
      value: { ...filter, anyOf: words.map((w): IrFilter => ({ subtypes: [w], raw: w })), raw },
      pos: at,
    };
  };
}
