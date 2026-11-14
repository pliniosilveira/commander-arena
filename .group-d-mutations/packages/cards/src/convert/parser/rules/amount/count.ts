/**
 * Counted amounts (stage P13, the engine's `Amount` `countOf`, D-095): "for each creature you
 * control" after a number of one, and "equal to the number of lands you control" after a verb that
 * takes a quantity. The count is of the objects a filter matches (CR 608.2c: counted as the
 * instruction runs). The words after "each" and "the number of" are a noun phrase of the kinds the
 * engine's filter can say, and since stage P28 (D-131) that is one family, shared by every amount that
 * counts or reads objects ("the number of ...", "for each ...", "the greatest power among ...", "the
 * total power of ...", "half the number of ..."):
 *
 * - permanents on the battlefield: types, subtypes, "other", a quality ("with power 4 or greater"), a
 *   controller or "on the battlefield"; a list of kinds joined by "and", "or" or "and/or" ("artifact
 *   and/or enchantment you control", "Angels and Clerics you control"), and "attacking you" ("creatures
 *   attacking you", CR 508.1b);
 * - cards in your hand, in your graveyard, in all graveyards or in your opponents' graveyards, of a type
 *   or a creature type ("Zombie card in your graveyard").
 *
 * A counter, a chosen type and "for each opponent" are not objects of that kind and are not read. "With flying" and
 * "nontoken" are parts of the engine's filter since D-133 (stage P29); a static ability refuses them in a count.
 */
import {
  choice,
  fail,
  literal,
  many,
  map,
  optional,
  type Parser,
  pattern,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrAmount, IrFilter, IrNoun } from '../../ir/types';
import { ATTACHMENT_SUFFIX } from '../noun/danitha-g3';
import {
  BOUNDARY,
  CARD_TYPES,
  CONTROL_SUFFIX,
  NO_PARTS,
  PERMANENT_TYPES,
  permanentPhrase,
  toFilter,
  typeWords,
} from '../noun/phrases';
import { SUBTYPE_WORD_NUMBERED } from '../noun/subtypes';
import { defineRule, spanned } from '../registry';

const ON_THE_BATTLEFIELD = pattern(new RegExp(` on the battlefield${BOUNDARY}`, 'iu'));
const ATTACKING_YOU = pattern(new RegExp(` attacking you${BOUNDARY}`, 'iu'));

/** The words a list of kinds is joined with, in the shapes English has: "A or B", "A, B, or C". */
const CONNECTORS = ['and/or', 'and', 'or'] as const;

/**
 * "artifact and/or enchantment", "Angels and Clerics", "creatures or lands": a list of two or more card types, or
 * of two or more subtypes, in one number (CR 205.2a, 205.3: an object with any of them matches). Two items are
 * joined by the connector alone, more by commas with the connector before the last; the connector is the same
 * throughout and an item is not repeated. The list stands for "an object of any of these kinds".
 */
function kindList(plural: boolean): Parser<readonly IrFilter[]> {
  const types: Parser<IrFilter> = map(
    pattern(new RegExp(`(${PERMANENT_TYPES})${plural ? 's' : ''}${BOUNDARY}`, 'iu')),
    (m): IrFilter => {
      const word = (m[1] ?? '').toLowerCase();
      return { types: [word], raw: word };
    },
  );
  const subtypes: Parser<IrFilter> = map(
    satisfy(SUBTYPE_WORD_NUMBERED, (word) =>
      plural ? word.plural !== false : word.plural !== true,
    ),
    (word): IrFilter => ({ subtypes: [word.subtype], raw: word.subtype }),
  );
  const sameKind = (items: readonly IrFilter[]) =>
    items.every((i) => i.types !== undefined) || items.every((i) => i.subtypes !== undefined);
  return (ctx, pos) => {
    for (const item of [types, subtypes]) {
      const first = item(ctx, pos);
      if (!first.ok) continue;
      const more = many(
        map(
          sequence(pattern(/(, (?:and\/or|and|or) | (?:and\/or|and|or) |, )/), item),
          ([separator, filter]) => ({ separator: separator[0], filter }),
        ),
      )(ctx, first.pos);
      if (!more.ok) continue;
      const items = more.value;
      const last = items[items.length - 1];
      if (last === undefined) continue;
      const connector = CONNECTORS.find((c) => last.separator.includes(` ${c} `));
      if (connector === undefined) continue;
      const shaped =
        items.slice(0, -1).every((i) => i.separator === ', ') &&
        (items.length > 1
          ? last.separator === `, ${connector} `
          : last.separator === ` ${connector} `);
      const all = [first.value, ...items.map((i) => i.filter)];
      const raw = all.map((f) => f.raw);
      if (!shaped || new Set(raw).size !== raw.length || !sameKind(all)) continue;
      return { ok: true, value: all, pos: more.pos };
    }
    return fail(ctx, pos);
  };
}

/**
 * Permanents: "creature you control", "other creature you control", "creature on the battlefield",
 * "creatures your opponents control", "artifact and/or enchantment you control", "creatures attacking you". A
 * phrase that names no controller must say "on the battlefield" (the words of Oracle text), so "for each
 * creature" alone is not read; "attacking you" names the objects by what they do and needs no more.
 */
function battlefield(plural: boolean): Parser<{ filter: IrFilter; other: boolean }> {
  const kinds: Parser<IrFilter> = (ctx, pos) => {
    const list = kindList(plural)(ctx, pos);
    if (!list.ok) return list;
    const control = optional(CONTROL_SUFFIX, undefined)(ctx, list.pos);
    if (!control.ok) return control;
    const base = toFilter(
      'battlefield',
      { ...NO_PARTS, controller: control.value },
      ctx.text.slice(pos, control.pos),
    );
    return { ok: true, value: { ...base, anyOf: list.value }, pos: control.pos };
  };
  const phrase = choice(kinds, permanentPhrase(plural, 'all'));
  return (ctx, pos) => {
    const other = optional(
      map(literal('other '), () => true),
      false,
    )(ctx, pos);
    if (!other.ok) return other;
    const found = phrase(ctx, other.pos);
    if (!found.ok) return found;
    let end = found.pos;
    let filter: IrFilter = found.value;
    // D-426 (Danitha group 3): "Aura attached to it", "Aura you control that's attached to a creature": the permanents an attachment is on, which also names the
    // objects, so a phrase with no controller needs no "on the battlefield".
    const attached = plural
      ? { ok: true as const, value: null, pos: end }
      : optional(ATTACHMENT_SUFFIX, null)(ctx, end);
    if (!attached.ok) return attached;
    if (attached.value !== null) {
      filter = { ...filter, attachedTo: attached.value };
      end = attached.pos;
      return {
        ok: true,
        value: { filter: { ...filter, raw: ctx.text.slice(pos, end) }, other: other.value },
        pos: end,
      };
    }
    const attacking = optional(ATTACKING_YOU, null)(ctx, end);
    if (!attacking.ok) return attacking;
    if (attacking.value !== null) {
      // "creatures attacking you" is said of every player's creatures: a controller of its own is another phrase.
      if (filter.controller !== undefined) return fail(ctx, end);
      filter = { ...filter, attackingYou: true };
      end = attacking.pos;
    } else if (filter.controller === undefined) {
      const suffix = ON_THE_BATTLEFIELD(ctx, end);
      if (!suffix.ok) return suffix;
      end = suffix.pos;
    }
    return {
      ok: true,
      value: { filter: { ...filter, raw: ctx.text.slice(pos, end) }, other: other.value },
      pos: end,
    };
  };
}

/**
 * Cards of a zone: "card in your hand", "creature cards in your graveyard", "Zombie card in your graveyard",
 * "card in all graveyards", "creature cards in your opponents' graveyards" (a card outside the battlefield is
 * the object of its owner, CR 400.3, so "your opponents'" is the opponents as owners).
 */
function cards(plural: boolean): Parser<IrFilter> {
  const where = choice<{ zone: 'hand' | 'graveyard'; controller?: 'you' | 'opponent' }>(
    map(literal(' in your hand'), () => ({ zone: 'hand' as const, controller: 'you' as const })),
    map(literal(' in your graveyard'), () => ({
      zone: 'graveyard' as const,
      controller: 'you' as const,
    })),
    map(literal(' in all graveyards'), () => ({ zone: 'graveyard' as const })),
    // "for each creature card in your opponents' graveyards": a singular card, the graveyards of all the opponents.
    map(pattern(/ in your opponents['’] graveyards/), () => ({
      zone: 'graveyard' as const,
      controller: 'opponent' as const,
    })),
  );
  // Creature types before the card types ("Zombie creature card"), each in the singular.
  const words = map(
    sequence(
      many(
        map(
          sequence(
            satisfy(SUBTYPE_WORD_NUMBERED, (w) => w.plural !== true),
            literal(' '),
          ),
          ([w]) => w.subtype,
        ),
      ),
      optional(
        map(sequence(typeWords(CARD_TYPES, false), literal(' ')), ([w]) => w),
        [] as string[],
      ),
    ),
    ([subtypes, types]) => ({ subtypes, types }),
  );
  return (ctx, pos) => {
    const r = sequence(
      words,
      pattern(new RegExp(`card${plural ? 's' : ''}${BOUNDARY}`, 'iu')),
      where,
      pattern(new RegExp(BOUNDARY, 'u')),
    )(ctx, pos);
    if (!r.ok) return r;
    const [{ subtypes, types }, , place] = r.value;
    const raw = ctx.text.slice(pos, r.pos);
    const base = toFilter(place.zone, { ...NO_PARTS, types, controller: place.controller }, raw);
    return {
      ok: true,
      value: { ...base, ...(subtypes.length > 0 ? { subtypes } : {}), card: true },
      pos: r.pos,
    };
  };
}

/** What a count is of, as the group noun it is: `det` `each`, the filter and `other`. */
export function counted(rule: string, plural: boolean): Parser<IrNoun> {
  const phrase = choice(
    battlefield(plural),
    map(cards(plural), (filter) => ({ filter, other: false })),
  );
  return (ctx, pos) => {
    const r = phrase(ctx, pos);
    if (!r.ok) return r;
    const { filter, other } = r.value;
    const noun: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter,
      upTo: false,
      plural,
      other,
      span: { start: pos, end: r.pos },
      rule,
    };
    return { ok: true, value: noun, pos: r.pos };
  };
}

/** "<head> <counted noun>" as a `countOf` amount: the head is what introduces the count ("for each ", ...). */
export function countAmount(id: string, head: Parser<unknown>, plural: boolean): Parser<IrAmount> {
  return (ctx, pos) => {
    const r = spanned(sequence(head, counted(id, plural)))(ctx, pos);
    if (!r.ok) return r;
    const [, of] = r.value.value;
    return {
      ok: true,
      value: { kind: 'countOf', of, span: r.value.span },
      pos: r.pos,
    };
  };
}

/**
 * `amount.for-each`: "for each creature you control", "for each other creature you control", "for
 * each creature on the battlefield", "for each card in your hand", "for each creature card in
 * your graveyard", "for each artifact and/or enchantment you control", "for each creature attacking you" (CR
 * 608.2c: the instruction counts the objects as it runs; CR 109 and 205 are what a filter matches). It
 * follows a quantity ("Draw a card for each ...", "gain 1 life for each ...", "costs {1} less to cast for each
 * ...", "gain 2 life for each ...": a quantity above one multiplies the count) and makes the count the amount.
 * The noun is singular; the phrase must name a controller, "on the battlefield", "attacking you" or a zone.
 */
export const AMOUNT_FOR_EACH = defineRule<IrAmount>({
  id: 'amount.for-each',
  family: 'amount',
  leading: ['for'],
  cites: [
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 109.1 (Objects)',
    'CR 205.2a (Card Types)',
  ],
  examples: [
    'for each creature you control',
    'for each creature on the battlefield',
    'for each other creature you control',
    'for each artifact you control',
    'for each land you control',
    'for each card in your hand',
    'for each creature card in your graveyard',
    'for each card in all graveyards',
    'for each nonland permanent your opponents control',
    'for each Elf you control',
    'for each Plant creature you control',
    'for each Swamp you control',
    'for each artifact and/or enchantment you control',
    'for each Angel or Cleric you control',
    'for each creature attacking you',
    'for each Zombie card in your graveyard',
    'for each creature you control with power 4 or greater',
    'for each creature card in your opponents’ graveyards',
  ],
  rejects: [
    'for each',
    'for each creature',
    'for each creatures you control',
    'for each opponent',
    'for each burden counter on ~',
    'for each color among permanents you control',
    'for each target creature',
    'for each card in target opponent’s hand',
    'each creature you control',
    'for every creature you control',
    'for each artifact and creature and land you control',
    'for each artifact and/or enchantment',
    'for each creature you control attacking you',
    'for each creature card in your opponent’s graveyard',
  ],
  parse: countAmount('amount.for-each', literal('for each '), false),
});

/**
 * `amount.number-of`: "equal to the number of lands you control", "equal to the number of creatures
 * on the battlefield", "equal to the number of cards in your hand", "equal to the number of creature
 * cards in your graveyard", "equal to the number of creatures attacking you". After "gain life",
 * "lose life" and "deals damage to ...": the amount is the count (CR 119.3, 120.3; counted as the
 * instruction runs, CR 608.2c). The noun is plural.
 */
export const AMOUNT_NUMBER_OF = defineRule<IrAmount>({
  id: 'amount.number-of',
  family: 'amount',
  leading: ['equal'],
  cites: [
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 109.1 (Objects)',
    'CR 205.2a (Card Types)',
  ],
  examples: [
    'equal to the number of lands you control',
    'equal to the number of creatures on the battlefield',
    'equal to the number of cards in your hand',
    'equal to the number of creature cards in your graveyard',
    'equal to the number of other creatures you control',
    'equal to the number of artifacts you control',
    'equal to the number of Elves you control',
    'equal to the number of Treasures you control',
    'equal to the number of creatures you control of the chosen type',
    'equal to the number of creature cards in your opponents’ graveyards',
    'equal to the number of creatures attacking you',
    'equal to the number of creatures with flying you control',
    'equal to the number of Zombies you control',
    'equal to the number of nontoken creatures you control',
  ],
  rejects: [
    'equal to the number of',
    'equal to the number of creatures',
    'equal to the number of creature you control',
    'equal to the number of colors in your commanders’ color identity',
    'equal to the number of cards in target opponent’s hand',
    'equal to the number of creatures you control of that type',
    'equal to its power',
    'the number of lands you control',
  ],
  parse: countAmount('amount.number-of', literal('equal to the number of '), true),
});

export const COUNT_AMOUNT_RULES = [AMOUNT_FOR_EACH, AMOUNT_NUMBER_OF];
