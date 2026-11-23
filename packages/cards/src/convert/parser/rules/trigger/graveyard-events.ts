/**
 * Trigger rules about cards and a graveyard (Syr Konrad, the Grim; Insidious Roots): "a creature card leaves your graveyard" and "a creature card is put into a graveyard from
 * anywhere other than the battlefield" (CR 603.2, 400.7, 404.1, 700.4), and a trigger of several such events joined with commas and "or" ("Whenever another creature dies, or a
 * creature card is put into a graveyard from anywhere other than the battlefield, or a creature card leaves your graveyard", CR 603.2c). Each says what the text says; what the
 * engine can run is the lowering's business (`lower/triggers.ts`).
 */
import { choice, fail, literal, many, type Parser, pattern, sequence } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { CARD_KINDS, cardFilter } from './death-toll-b';
import { makeNoun, permanentOrAttachedSubject } from './subjects';

const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';
const ID = 'trigger.graveyard-events';

/** The card noun of a clause: "a creature card", "a nonland card", "a card" (the article agrees with the next word). */
const CARD_NOUN = `(an?) (?:(non)?(${CARD_KINDS}) )?card`;

/** "a creature card leaves your graveyard": once for each card that leaves (CR 603.2, 400.7). */
const leavesYourGraveyard: Parser<IrTrigger> = (ctx, pos) => {
  const r = pattern(
    new RegExp(`${CARD_NOUN} leaves your graveyard( during your turn)?${NOT_IN_WORD}`, 'iu'),
  )(ctx, pos);
  if (!r.ok) return r;
  const [, article, non, kind, during] = r.value;
  const filter = cardFilter(article, non, kind);
  if (filter === null) return fail(ctx, pos);
  const span = { start: pos, end: r.pos };
  return {
    ok: true,
    value: {
      kind: 'trigger',
      event: 'leftGraveyard',
      subject: makeNoun(ID, span, 'a', filter),
      each: true,
      ...(during === undefined ? {} : { duringTurn: 'you' as const }),
      args: {},
      span,
      rule: ID,
    },
    pos: r.pos,
  };
};

/** "a creature card is put into a graveyard from anywhere other than the battlefield" (CR 603.2, 404.1, 700.4). */
const putIntoAnyGraveyard: Parser<IrTrigger> = (ctx, pos) => {
  const r = pattern(
    new RegExp(
      `${CARD_NOUN} is put into a graveyard from anywhere other than the battlefield${NOT_IN_WORD}`,
      'iu',
    ),
  )(ctx, pos);
  if (!r.ok) return r;
  const [, article, non, kind] = r.value;
  const filter = cardFilter(article, non, kind);
  if (filter === null) return fail(ctx, pos);
  const span = { start: pos, end: r.pos };
  return {
    ok: true,
    value: {
      kind: 'trigger',
      event: 'putIntoGraveyard',
      subject: makeNoun(ID, span, 'a', filter),
      fromNotBattlefield: true,
      args: {},
      span,
      rule: ID,
    },
    pos: r.pos,
  };
};

/** "another creature dies" (CR 700.4). */
const subjectDies: Parser<IrTrigger> = (ctx, pos) => {
  const r = sequence(
    permanentOrAttachedSubject(ID),
    pattern(new RegExp(` dies${NOT_IN_WORD}`, 'iu')),
  )(ctx, pos);
  if (!r.ok) return r;
  return {
    ok: true,
    value: {
      kind: 'trigger',
      event: 'dies',
      subject: r.value[0],
      args: {},
      span: { start: pos, end: r.pos },
      rule: ID,
    },
    pos: r.pos,
  };
};

const CLAUSE: Parser<IrTrigger> = choice(subjectDies, putIntoAnyGraveyard, leavesYourGraveyard);

/** The kind of a clause, to refuse the same event twice. */
function clauseKey(t: IrTrigger): string {
  return `${t.event}:${t.subject?.filter.raw ?? ''}`;
}

/**
 * `trigger.graveyard-events`: "a creature card leaves your graveyard" (once for each card, CR 603.2, 400.7) and "a creature card is put into a graveyard from anywhere other than
 * the battlefield" (any player's graveyard, CR 603.2, 404.1), alone or with "another creature dies" in a list "A, B, or C" (CR 603.2c: the ability triggers once each time one of the events occurs; it lowers to one engine ability for each, as `trigger.or`
 * does). A card put into a graveyard from the battlefield is a death and not the second event (CR 700.4), so no event counts twice. Not read: a repeated clause, a death
 * alone (the rule of `dies` reads it), a clause of another event, the graveyard of another player.
 */
export const TRIGGER_GRAVEYARD_EVENTS = defineRule<IrTrigger>({
  id: ID,
  family: 'trigger',
  leading: ['another', 'a', 'an'],
  cites: [
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 603.2c (Handling Triggered Abilities)',
    'CR 400.7 (Zones)',
    'CR 700.4 (General)',
  ],
  examples: [
    'another creature dies, or a creature card is put into a graveyard from anywhere other than the battlefield, or a creature card leaves your graveyard',
    'another creature dies, or a creature card leaves your graveyard',
    'a creature card is put into a graveyard from anywhere other than the battlefield or a creature card leaves your graveyard',
    'a creature card leaves your graveyard',
    'a nonland card leaves your graveyard',
    'a card leaves your graveyard',
    // Issue 102 (Kishla Skimmer): only while it is the controller's turn.
    'a card leaves your graveyard during your turn',
    'a creature card is put into a graveyard from anywhere other than the battlefield',
  ],
  rejects: [
    'another creature dies',
    'a creature card leaves a graveyard',
    'a creature card leaves your graveyard and',
    'a creature card is put into a graveyard from anywhere',
    'a creature card is put into a graveyard from anywhere other than the library',
    'an creature card leaves your graveyard',
    'another creature dies, or another creature dies',
    "another creature dies, or a creature card leaves an opponent's graveyard",
    'another creature dies, or a creature card leaves your graveyard, or',
    'another creature dies, or a creature card leaves your graveyard and a creature card is put into a graveyard from anywhere other than the battlefield',
    'a creature card leaves your graveyard, or another creature dies, or',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      CLAUSE,
      many(sequence(choice(literal(', or '), literal(' or '), literal(', ')), CLAUSE)),
    )(ctx, pos);
    if (!r.ok) return r;
    const [first, more] = r.value;
    // A death alone is the rule of `dies`; the other two events are read alone here.
    if (more.length === 0 && first.event === 'dies') return fail(ctx, pos);
    const all = [first, ...more.map(([, c]) => c)];
    if (new Set(all.map(clauseKey)).size !== all.length) return fail(ctx, pos);
    const joins = more.map(([join]) => join);
    // "A or B", "A, or B, or C" (every join with "or"), or "A, B, or C": a list that ends with an "or".
    const last = joins[joins.length - 1];
    if (last !== undefined && last !== ', or ' && last !== ' or ') return fail(ctx, pos);
    if (joins.slice(0, -1).some((j) => j === ' or ')) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    const [head, ...alternatives] = all;
    if (head === undefined) return fail(ctx, pos);
    return {
      ok: true,
      value: { ...head, span, ...(alternatives.length === 0 ? {} : { alternatives }) },
      pos: r.pos,
    };
  },
});

export const GRAVEYARD_EVENTS_TRIGGER_RULES = [TRIGGER_GRAVEYARD_EVENTS].map(quietly);
