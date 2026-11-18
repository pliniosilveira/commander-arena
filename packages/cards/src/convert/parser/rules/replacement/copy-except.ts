/**
 * Replacement rule of issue 103 (Deceptive Frostkite): "You may have ~ enter as a copy of a creature you control with power 4 or greater, except it's a Dragon in addition to its other
 * types and it has flying." (CR 614.12, 707.2, 707.9a, 707.9b: the permanent enters as a copy of a permanent of the kind, and the creature types and the keywords the exception names are
 * part of its copiable values.)
 */
import { fail, literal, map, optional, pattern, sequence } from '../../combinators';
import type { IrAbility, IrClause, IrKeywordList, IrNoun, IrTypeList } from '../../ir/types';
import { KEYWORD_WORDS } from '../keyword/list';
import { CREATURE_TYPES } from '../noun/creature-types';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { replacement } from './shared';

/**
 * `replacement.enters-as-copy-except`: "You may have ~ enter as a copy of a creature you control with power 4 or greater, except it's a Dragon in addition to its other types and it has
 * flying." The copy lasts for good (no duration is said). The permanents it may copy are those of the phrase, which names whose they are ("you control"); the word "any" belongs to the
 * Embalm rule. The exceptions are a creature type "in addition to its other types" and, optionally, keywords; a card type, a color or a set of values is another statement.
 */
export const REPLACEMENT_ENTERS_AS_COPY_EXCEPT = defineRule<IrAbility>({
  id: 'replacement.enters-as-copy-except',
  family: 'replacement',
  leading: ['you'],
  cites: [
    'CR 614.12 (Replacement Effects)',
    'CR 707.2 (Copying Objects)',
    'CR 707.9a (Copying Objects)',
    'CR 707.9b (Copying Objects)',
  ],
  examples: [
    "You may have ~ enter as a copy of a creature you control with power 4 or greater, except it's a Dragon in addition to its other types and it has flying.",
    "You may have ~ enter as a copy of a creature you control, except it's a Dragon in addition to its other types.",
    "You may have ~ enter as a copy of an artifact you control, except it's a Construct in addition to its other types and it has haste.",
  ],
  rejects: [
    "You may have ~ enter as a copy of a creature you control with power 4 or greater, except it's a Dragon in addition to its other types and it has flying",
    "You may have ~ enter as a copy of a creature you control with power 4 or greater, except it's a Dragon and it has flying.",
    "You may have ~ enter as a copy of a creature you control with power 4 or greater, except it's a Dragon in addition to its other types and has flying.",
    "You may have ~ enter as a copy of a creature you control with power 4 or greater, except it's a dragon in addition to its other types.",
    "You may have ~ enter as a copy of a creature you control with power 4 or greater, except it's a Goblinoid in addition to its other types.",
    "You may have ~ enter as a copy of any creature you control, except it's a Dragon in addition to its other types.",
    "You may have ~ enter as a copy of a creature you control with power 4 or greater until end of turn, except it's a Dragon in addition to its other types.",
    "You may have ~ enter as a copy of a creature, except it's a Dragon in addition to its other types and it has flying.",
    "You may have ~ enter as a copy of a creature you control, except it's a Dragon in addition to its other types and it has flash.",
    "You may have ~ enter as a copy of a creature you control, except it's a Dragon in addition to its other types. Draw a card.",
  ],
  parse: (ctx, pos) => {
    const id = 'replacement.enters-as-copy-except';
    const head = pattern(/you may have ~ enter as a copy of an? /iu)(ctx, pos);
    if (!head.ok) return head;
    const kind = spanned(map(permanentPhrase(false, false), withoutZone))(ctx, head.pos);
    if (!kind.ok) return kind;
    // "of a creature" with no owner named is any creature on the battlefield: another statement.
    if (kind.value.value.controller === undefined) return fail(ctx, pos);
    const types = sequence(
      pattern(/, except it['’]s an? /iu),
      spanned(pattern(/[A-Z][a-z]+(?: [A-Z][a-z]+)*(?![\p{L}\p{N}])/u)),
      literal(' in addition to its other types'),
    )(ctx, kind.pos);
    if (!types.ok) return types;
    const subtypes = types.value[1].value[0].split(' ');
    if (!subtypes.every((s) => CREATURE_TYPES.has(s))) return fail(ctx, pos);
    const gains = optional(
      map(sequence(literal(' and it has '), spanned(KEYWORD_WORDS)), ([, words]) => words),
      null,
    )(ctx, types.pos);
    if (!gains.ok) return gains;
    const end = literal('.')(ctx, gains.pos);
    if (!end.ok) return end;
    const span = { start: pos, end: end.pos };
    const what: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: kind.value.value,
      upTo: false,
      plural: false,
      other: false,
      span: kind.value.span,
      rule: id,
    };
    const exceptTypes: IrTypeList = {
      kind: 'typeList',
      subtypes,
      additive: true,
      span: types.value[1].span,
      rule: id,
    };
    const gained: IrKeywordList | null =
      gains.value === null
        ? null
        : { kind: 'keywordList', names: gains.value.value, span: gains.value.span, rule: id };
    const event: IrClause = {
      kind: 'clause',
      verb: 'entersAsCopy',
      args: {
        what,
        duration: { kind: 'flag', value: false, span, rule: id },
        exceptTypes,
        ...(gained === null ? {} : { gains: gained }),
      },
      optional: true,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: end.pos };
  },
});

export const COPY_EXCEPT_REPLACEMENT_RULES = [REPLACEMENT_ENTERS_AS_COPY_EXCEPT].map(quietly);
