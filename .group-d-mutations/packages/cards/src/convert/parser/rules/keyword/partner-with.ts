/**
 * "Partner with [name]" (CR 702.124j, D-490; Krav, the Unredeemed): a keyword line that stands for two abilities, a deck-construction one ("You may designate two legendary cards as
 * your commander rather than one if each has a 'partner with [name]' ability with the other's name", which `packages/cards` reads from the stored card, D-053) and a triggered
 * ability ("When this permanent enters, target player may search their library for a card named [name], reveal it, put it into their hand, then shuffle", which the engine builds
 * for the keyword). The reminder text in parentheses is not part of the line the grammar reads.
 */
import { fail, pattern } from '../../combinators';
import type { IrKeyword } from '../../ir/types';
import { defineRule, spanned } from '../registry';

/**
 * `keyword.partner-with`: "Partner with Regna, the Redeemer", "Partner with Pir, Imaginative Rascal" (CR 702.124j). The name is one card name: capitalised words with commas,
 * apostrophes and hyphens, nothing after it. Not read: "Partner" alone, "Partner—Friends forever", a name that is not capitalised, a second keyword on the line, a period.
 */
export const KEYWORD_PARTNER_WITH = defineRule<readonly IrKeyword[]>({
  id: 'keyword.partner-with',
  family: 'keyword',
  leading: ['partner'],
  cites: ['CR 702.124j (Partner)', 'CR 702.124a (Partner)', 'CR 201.2 (Name)'],
  examples: [
    'Partner with Regna, the Redeemer',
    'Partner with Pir, Imaginative Rascal',
    'partner with Toothy, Imaginary Friend',
    'Partner with Brallin, Skyshark Rider',
    'Partner with Rowan, the Rebel',
  ],
  rejects: [
    'Partner',
    'Partner with',
    'Partner with regna',
    'Partner with Regna, the Redeemer.',
    'Partner with Regna, the Redeemer, flying',
    'Partner with Regna, the Redeemer and Krav',
    'Partner—Friends forever',
    'Partner with Regna, the Redeemer (When this creature enters, target player may put Regna into their hand from their library, then shuffle.)',
    'Partner with 2 cards',
    'Partner with Regna, then draw a card',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /[Pp]artner with ([A-Z][\p{L}'’-]*(?:,? (?:[A-Z][\p{L}'’-]*|the|of|a|an|in|to|de|la|le|von|van))*)(?![\p{L}\p{N}'’,.-])/u,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const name = r.value.value[1];
    if (name === undefined || /, (?:then|and)\b/u.test(name)) return fail(ctx, pos);
    const keyword: IrKeyword = {
      kind: 'keyword',
      name: 'partnerWith',
      params: [{ kind: 'name', name, span: r.value.span, rule: 'keyword.partner-with' }],
      span: r.value.span,
      rule: 'keyword.partner-with',
    };
    return { ok: true, value: [keyword], pos: r.pos };
  },
});

export const PARTNER_WITH_KEYWORD_RULES = [KEYWORD_PARTNER_WITH];
