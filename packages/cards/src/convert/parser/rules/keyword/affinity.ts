/**
 * "Affinity for artifacts" (CR 702.41a, stage P21): the keyword with the kind of permanent it counts, a
 * plural noun phrase of the kinds the engine's filter can say: card types ("artifacts", "artifact
 * creatures") and subtypes ("Equipment", "Plains", "Islands"). Read by `keyword.line` like the other
 * keywords, so it stands alone or in a list ("Flying, affinity for artifacts"). The engine counts the
 * permanents the caster controls (`derive-keywords.ts`), so the text names no controller: "affinity for
 * artifacts you control", a color, a quality ("with power 4 or greater") and "nonland" are not read.
 */
import { choice, fail, literal, map, type Parser, pattern, sequence } from '../../combinators';
import type { IrFilter, IrKeyword, IrNoun } from '../../ir/types';
import { permanentPhrase } from '../noun/phrases';
import { node, spanned } from '../registry';

/** The plural of each basic land type (CR 205.3i); "Plains" is its own plural. */
const LAND_TYPE_PLURALS: readonly (readonly [string, string])[] = [
  ['Plains', 'Plains'],
  ['Island', 'Islands'],
  ['Swamp', 'Swamps'],
  ['Mountain', 'Mountains'],
  ['Forest', 'Forests'],
];

/** "Islands", "Plains": every permanent with that basic land type (CR 305.6). */
const LAND_TYPE_PLURAL: Parser<IrFilter> = (ctx, pos) => {
  for (const [type, plural] of LAND_TYPE_PLURALS) {
    const r = pattern(new RegExp(`${plural}(?![\\p{L}\\p{N}])`, 'u'))(ctx, pos);
    if (r.ok) return { ok: true, value: { subtypes: [type], raw: plural }, pos: r.pos };
  }
  return fail(ctx, pos);
};

/** True for a filter that says only card types and subtypes of permanents on the battlefield. */
function typesAndSubtypesOnly(filter: IrFilter): boolean {
  const { raw: _raw, zone, types, subtypes, ...rest } = filter;
  void _raw;
  return (
    (zone === undefined || zone === 'battlefield') &&
    Object.keys(rest).length === 0 &&
    ((types?.length ?? 0) > 0 || (subtypes?.length ?? 0) > 0)
  );
}

/** "affinity for artifacts": the keyword node, its one parameter the noun that says what is counted. */
export function affinityKeyword(rule: string): Parser<IrKeyword> {
  const what: Parser<IrNoun> = (ctx, pos) => {
    const phrase = choice(permanentPhrase(true, 'all'), LAND_TYPE_PLURAL)(ctx, pos);
    if (!phrase.ok) return phrase;
    if (!typesAndSubtypesOnly(phrase.value)) return fail(ctx, pos);
    const filter: IrFilter = { ...phrase.value, raw: ctx.text.slice(pos, phrase.pos) };
    return {
      ok: true,
      value: {
        kind: 'noun',
        det: 'a',
        filter,
        upTo: false,
        plural: true,
        other: false,
        span: { start: pos, end: phrase.pos },
        rule,
      },
      pos: phrase.pos,
    };
  };
  return node<IrNoun, IrKeyword>(
    rule,
    map(sequence(literal('affinity for '), spanned(what)), ([, read]) => read.value),
    (noun) => ({ kind: 'keyword', name: 'affinity', params: [noun] }),
  );
}
