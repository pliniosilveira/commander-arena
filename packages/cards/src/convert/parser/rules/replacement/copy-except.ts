/**
 * Replacement rule of issue 103 (Deceptive Frostkite): "You may have ~ enter as a copy of a creature you control with power 4 or greater, except it's a Dragon in addition to its other
 * types and it has flying." (CR 614.12, 707.2, 707.9a, 707.9b: the permanent enters as a copy of a permanent of the kind, and the creature types and the keywords the exception names are
 * part of its copiable values.)
 */
import { fail, literal, map, optional, pattern, sequence } from '../../combinators';
import type { IrAbility, IrClause, IrKeywordList, IrNoun, IrTypeList } from '../../ir/types';
import { KEYWORD_WORDS } from '../keyword/list';
import { CREATURE_TYPES } from '../noun/creature-types';
import { graveyardPhrase, permanentPhrase, withoutZone } from '../noun/phrases';
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

/**
 * `replacement.enters-as-copy-extra-counters`: "You may have ~ enter as a copy of a creature or planeswalker you control, except it enters with an additional +1/+1 counter on it if it's a
 * creature, it enters with an additional loyalty counter on it if it's a planeswalker, and it isn't legendary." (Spark Double; CR 614.12, 707.2, 707.9b, 205.4a, 122.6): it enters as a
 * copy of one permanent of the kinds the controller controls, with a counter more for each of the two kinds the copy is, and without the supertype legendary. The engine's `entersAsCopy`
 * with `extraCounters` and `notLegendary`. Not read: another kind of permanent or controller, another counter, a missing part of the exception, no end.
 */
export const REPLACEMENT_ENTERS_AS_COPY_EXTRA_COUNTERS = defineRule<IrAbility>({
  id: 'replacement.enters-as-copy-extra-counters',
  family: 'replacement',
  leading: ['you'],
  cites: [
    'CR 614.12 (Replacement Effects)',
    'CR 707.2 (Copying Objects)',
    'CR 707.9b (Copying Objects)',
    'CR 205.4a (Supertypes)',
    'CR 122.6 (Counters)',
  ],
  examples: [
    "You may have ~ enter as a copy of a creature or planeswalker you control, except it enters with an additional +1/+1 counter on it if it's a creature, it enters with an additional loyalty counter on it if it's a planeswalker, and it isn't legendary.",
    'You may have ~ enter as a copy of a creature or planeswalker you control, except it enters with an additional +1/+1 counter on it if it’s a creature, it enters with an additional loyalty counter on it if it’s a planeswalker, and it isn’t legendary.',
  ],
  rejects: [
    "You may have ~ enter as a copy of a creature or planeswalker you control, except it enters with an additional +1/+1 counter on it if it's a creature, it enters with an additional loyalty counter on it if it's a planeswalker, and it isn't legendary",
    "You may have ~ enter as a copy of a creature or planeswalker, except it enters with an additional +1/+1 counter on it if it's a creature, it enters with an additional loyalty counter on it if it's a planeswalker, and it isn't legendary.",
    "You may have ~ enter as a copy of a creature you control, except it enters with an additional +1/+1 counter on it if it's a creature, it enters with an additional loyalty counter on it if it's a planeswalker, and it isn't legendary.",
    "You may have ~ enter as a copy of a creature or planeswalker you control, except it enters with an additional +1/+1 counter on it if it's a creature, and it isn't legendary.",
    "You may have ~ enter as a copy of a creature or planeswalker you control, except it enters with an additional charge counter on it if it's a creature, it enters with an additional loyalty counter on it if it's a planeswalker, and it isn't legendary.",
    "You may have ~ enter as a copy of a creature or planeswalker you control, except it enters with an additional +1/+1 counter on it if it's a creature, it enters with an additional loyalty counter on it if it's a planeswalker, and it isn't legendary. Draw a card.",
  ],
  parse: (ctx, pos) => {
    const id = 'replacement.enters-as-copy-extra-counters';
    const head = pattern(/you may have ~ enter as a copy of an? /iu)(ctx, pos);
    if (!head.ok) return head;
    const kind = spanned(map(permanentPhrase(false, false), withoutZone))(ctx, head.pos);
    if (!kind.ok) return kind;
    const types = kind.value.value.anyOf?.flatMap((m) => m.types ?? []) ?? [];
    if (
      kind.value.value.controller === undefined ||
      types.length !== 2 ||
      !types.includes('creature') ||
      !types.includes('planeswalker')
    ) {
      return fail(ctx, pos);
    }
    const tail = pattern(
      /, except it enters with an additional \+1\/\+1 counter on it if it['’]s a creature, it enters with an additional loyalty counter on it if it['’]s a planeswalker, and it isn['’]t legendary\./iu,
    )(ctx, kind.pos);
    if (!tail.ok) return tail;
    const span = { start: pos, end: tail.pos };
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
    const flag = (value: boolean) => ({ kind: 'flag' as const, value, span, rule: id });
    const event: IrClause = {
      kind: 'clause',
      verb: 'entersAsCopy',
      args: {
        what,
        duration: flag(false),
        extraCounters: flag(true),
        notLegendary: flag(true),
      },
      optional: true,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: tail.pos };
  },
});

/**
 * `replacement.enters-as-copy-graveyard`: "You may have ~ enter as a copy of any creature card in your graveyard that was put there from the battlefield this turn, except her name is ~
 * and she's a legendary Trill in addition to her other types." (Federation Fleet deck, CR 614.12, 707.2, 707.9a, 707.9b, 700.4, 205.4a: it enters as a copy of a card of the
 * controller's graveyard, keeps its own name, and is also legendary and of the creature type.) The engine's `entersAsCopy` with `fromGraveyard`, `keepName` and `addSupertypes`. The copy
 * lasts for good; the cards it may copy are those of the phrase, which names whose graveyard ("your"). Not read: another owner, a name that is not the card's own, an exception
 * without the name, without "legendary" or with a type that is not a creature type, a pronoun that does not agree.
 */
export const REPLACEMENT_ENTERS_AS_COPY_GRAVEYARD = defineRule<IrAbility>({
  id: 'replacement.enters-as-copy-graveyard',
  family: 'replacement',
  leading: ['you'],
  cites: [
    'CR 614.12 (Replacement Effects)',
    'CR 707.2 (Copying Objects)',
    'CR 707.9a (Copying Objects)',
    'CR 707.9b (Copying Objects)',
    'CR 700.4 (Dies)',
    'CR 205.4a (Supertypes)',
  ],
  examples: [
    "You may have ~ enter as a copy of any creature card in your graveyard that was put there from the battlefield this turn, except her name is ~ and she's a legendary Trill in addition to her other types.",
    "You may have ~ enter as a copy of any creature card in your graveyard, except his name is ~ and he's a legendary Trill in addition to his other types.",
  ],
  rejects: [
    "You may have ~ enter as a copy of any creature card in your graveyard that was put there from the battlefield this turn, except her name is ~ and she's a legendary Trill in addition to her other types",
    "You may have ~ enter as a copy of any creature card in a graveyard that was put there from the battlefield this turn, except her name is ~ and she's a legendary Trill in addition to her other types.",
    "You may have ~ enter as a copy of any creature card in your graveyard that was put there from the battlefield this turn, except her name is Bob and she's a legendary Trill in addition to her other types.",
    "You may have ~ enter as a copy of any creature card in your graveyard that was put there from the battlefield this turn, except her name is ~ and she's a Trill in addition to her other types.",
    "You may have ~ enter as a copy of any creature card in your graveyard that was put there from the battlefield this turn, except her name is ~ and she's a legendary Goblinoid in addition to her other types.",
    "You may have ~ enter as a copy of any creature card in your graveyard that was put there from the battlefield this turn, except her name is ~ and he's a legendary Trill in addition to her other types.",
    'You may have ~ enter as a copy of any creature card in your graveyard that was put there from the battlefield this turn.',
    "You may have ~ enter as a copy of any creature card in your graveyard that was put there from the battlefield this turn, except her name is ~ and she's a legendary Trill in addition to her other types. Draw a card.",
    "You may have ~ enter as a copy of a creature card in your graveyard that was put there from the battlefield this turn, except her name is ~ and she's a legendary Trill in addition to her other types.",
  ],
  parse: (ctx, pos) => {
    const id = 'replacement.enters-as-copy-graveyard';
    const head = literal('you may have ~ enter as a copy of any ')(ctx, pos);
    if (!head.ok) return head;
    const kind = spanned(graveyardPhrase(false, 'in'))(ctx, head.pos);
    if (!kind.ok) return kind;
    // The cards it may copy are those of the controller's graveyard.
    if (kind.value.value.controller !== 'you') return fail(ctx, pos);
    // The pronoun agrees with itself: "her ... she's ... her", "his ... he's ... his", "its ... it's ... its".
    const name = pattern(
      /, except (?:(her) name is ~ and she|(his) name is ~ and he|(its) name is ~ and it)['’]s a legendary /iu,
    )(ctx, kind.pos);
    if (!name.ok) return name;
    const possessive = (name.value[1] ?? name.value[2] ?? name.value[3] ?? '').toLowerCase();
    const type = spanned(pattern(/[A-Z][a-z]+(?![\p{L}\p{N}])/u))(ctx, name.pos);
    if (!type.ok) return type;
    const [subtype] = type.value.value;
    if (!CREATURE_TYPES.has(subtype)) return fail(ctx, pos);
    const end = literal(` in addition to ${possessive} other types.`)(ctx, type.pos);
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
    const flag = { kind: 'flag' as const, value: true, span, rule: id };
    const event: IrClause = {
      kind: 'clause',
      verb: 'entersAsCopy',
      args: {
        what,
        duration: { kind: 'flag', value: false, span, rule: id },
        exceptTypes: {
          kind: 'typeList',
          subtypes: [subtype],
          additive: true,
          span: type.value.span,
          rule: id,
        },
        fromGraveyard: flag,
        keepName: flag,
        addLegendary: flag,
      },
      optional: true,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: end.pos };
  },
});

export const COPY_EXCEPT_REPLACEMENT_RULES = [
  REPLACEMENT_ENTERS_AS_COPY_EXCEPT,
  REPLACEMENT_ENTERS_AS_COPY_EXTRA_COUNTERS,
  REPLACEMENT_ENTERS_AS_COPY_GRAVEYARD,
].map(quietly);
