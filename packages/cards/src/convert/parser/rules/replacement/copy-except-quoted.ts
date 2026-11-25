/**
 * Replacement rule of issue 167 (Mocking Doppelganger): "You may have ~ enter as a copy of a creature an opponent controls, except it has \"Other creatures with the same name as ~ are
 * goaded.\"" (CR 614.12, 707.2, 707.9a, 707.9b: the permanent enters as a copy of a permanent of the kind, and the ability the exception names is part of its copiable values.)
 */
import { fail, literal, map, pattern, sequence } from '../../combinators';
import type { IrAbility, IrClause, IrNoun } from '../../ir/types';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { readQuotedAbility } from '../static/quoted';
import { replacement } from './shared';

/**
 * `replacement.enters-as-copy-except-quoted`: "You may have ~ enter as a copy of a creature an opponent controls, except it has \"Other creatures with the same name as ~ are goaded.\"" The
 * copy lasts for good (no duration is said). The permanents it may copy are those of the phrase, which names whose they are; the word "any" belongs to the Embalm rule. The exception is
 * one static ability in quotes (the engine's `entersAsCopy` with `addStatics`), which the copy has as its own, so `~` in it is the copy. Not read: no owner named, an ability that is not a
 * static ability, other exceptions besides it, a period after the closing quote, a duration.
 */
export const REPLACEMENT_ENTERS_AS_COPY_EXCEPT_QUOTED = defineRule<IrAbility>({
  id: 'replacement.enters-as-copy-except-quoted',
  family: 'replacement',
  leading: ['you'],
  cites: [
    'CR 614.12 (Replacement Effects)',
    'CR 707.2 (Copying Objects)',
    'CR 707.9a (Copying Objects)',
    'CR 707.9b (Copying Objects)',
  ],
  examples: [
    'You may have ~ enter as a copy of a creature an opponent controls, except it has "Other creatures with the same name as ~ are goaded."',
    'You may have ~ enter as a copy of a creature you control, except it has "Other creatures with the same name as ~ are goaded."',
  ],
  rejects: [
    'You may have ~ enter as a copy of a creature an opponent controls, except it has "Other creatures with the same name as ~ are goaded.".',
    'You may have ~ enter as a copy of a creature an opponent controls, except it has "Other creatures with the same name as ~ are goaded"',
    'You may have ~ enter as a copy of a creature an opponent controls, except it has Other creatures with the same name as ~ are goaded.',
    'You may have ~ enter as a copy of a creature, except it has "Other creatures with the same name as ~ are goaded."',
    'You may have ~ enter as a copy of any creature an opponent controls, except it has "Other creatures with the same name as ~ are goaded."',
    'You may have ~ enter as a copy of a creature an opponent controls, except it has "Draw a card."',
    'You may have ~ enter as a copy of a creature an opponent controls, except it has "Whenever ~ attacks, draw a card."',
    'You may have ~ enter as a copy of a creature an opponent controls until end of turn, except it has "Other creatures with the same name as ~ are goaded."',
    'You may have ~ enter as a copy of a creature an opponent controls, except it has "Other creatures with the same name as ~ are goaded." Draw a card.',
  ],
  parse: (ctx, pos) => {
    const id = 'replacement.enters-as-copy-except-quoted';
    const head = pattern(/you may have ~ enter as a copy of an? /iu)(ctx, pos);
    if (!head.ok) return head;
    const kind = spanned(map(permanentPhrase(false, false), withoutZone))(ctx, head.pos);
    if (!kind.ok) return kind;
    // "of a creature" with no owner named is any creature on the battlefield: another statement.
    if (kind.value.value.controller === undefined) return fail(ctx, pos);
    const lead = sequence(literal(', except it has '))(ctx, kind.pos);
    if (!lead.ok) return lead;
    const quoted = readQuotedAbility(ctx, lead.pos, { mana: false, statics: true });
    if (!quoted.ok) return quoted;
    if (quoted.value.ability.kind !== 'static') return fail(ctx, pos);
    const span = { start: pos, end: quoted.pos };
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
    const event: IrClause = {
      kind: 'clause',
      verb: 'entersAsCopy',
      args: {
        what,
        duration: { kind: 'flag', value: false, span, rule: id },
        addStatic: quoted.value,
      },
      optional: true,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: quoted.pos };
  },
});

export const COPY_EXCEPT_QUOTED_REPLACEMENT_RULES = [REPLACEMENT_ENTERS_AS_COPY_EXCEPT_QUOTED].map(
  quietly,
);
