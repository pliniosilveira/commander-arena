/**
 * Replacement rule of stage P43 (D-193): "All damage that would be dealt to you and other permanents you control is dealt to ~ instead." (CR 614.9,
 * 614.1a: a redirection effect of the permanent; CR 120.3: the same damage from the same source, with the results for the creature that gets it).
 */
import { choice, fail, literal, optional, pattern, quiet, sequence } from '../../combinators';
import type { IrAbility, IrClause, IrNoun } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';
import { replacement } from './shared';

/** "other permanents you control": the plural group of the controller's own, as "other" leaves the permanent itself out. */
const OTHER_PERMANENTS: ReturnType<typeof family<IrNoun>> = (ctx, pos) => {
  const other = literal('other ')(ctx, pos);
  if (!other.ok) return other;
  const group = quiet(family<IrNoun>('noun', { only: ['noun.plain-permanents'] }))(ctx, other.pos);
  if (!group.ok) return group;
  // The permanents are the controller's own (the engine's `redirectDamage`: the player who orders the effects is the one who chose it).
  if (group.value.filter.controller !== 'you' || group.value.other) return fail(ctx, pos);
  return group;
};

/**
 * `replacement.redirect-damage`: "All damage that would be dealt to you and other permanents you control is dealt to ~ instead." (CR 614.9: damage
 * that would be dealt to a player or permanent is dealt to another instead; CR 614.1a: "instead" makes it a replacement effect; CR 120.3: it is the
 * same damage from the same source, with the results for the creature that gets it). The recipients are "you", "other <permanents> you control" or
 * both ("you and other permanents you control"); the creature that gets the damage is `~`. Not read: damage dealt by something ("All damage that
 * would be dealt by ..."), combat damage only, "the next 3", "target", another creature than `~`, another controller ("your opponents"), a
 * condition ("as long as"), "unless", the singular, and a second part ("and you gain 1 life").
 */
export const REPLACEMENT_REDIRECT_DAMAGE = defineRule<IrAbility>({
  id: 'replacement.redirect-damage',
  family: 'replacement',
  leading: ['all'],
  cites: [
    'CR 614.9 (Replacement Effects)',
    'CR 614.1a (Replacement Effects)',
    'CR 120.3 (Damage)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    'All damage that would be dealt to you and other permanents you control is dealt to ~ instead.',
    'All damage that would be dealt to you and other creatures you control is dealt to ~ instead.',
    'All damage that would be dealt to you is dealt to ~ instead.',
    'All damage that would be dealt to other creatures you control is dealt to ~ instead.',
    'all damage that would be dealt to you and other permanents you control is dealt to ~ instead.',
  ],
  rejects: [
    'All damage that would be dealt to you and other permanents you control is dealt to ~ instead',
    'All damage that would be dealt to you and permanents you control is dealt to ~ instead.',
    'All damage that would be dealt to you and other permanents is dealt to ~ instead.',
    'All damage that would be dealt to you and other permanents your opponents control is dealt to ~ instead.',
    'All damage that would be dealt to your opponents is dealt to ~ instead.',
    'All damage that would be dealt to you and other permanents you control is dealt to target creature instead.',
    'All damage that would be dealt to you and other permanents you control is dealt to ~.',
    'All combat damage that would be dealt to you is dealt to ~ instead.',
    'All damage that would be dealt by you is dealt to ~ instead.',
    'All damage that would be dealt to you and other permanents you control is dealt to ~ instead as long as you control a Turtle.',
    'All damage that would be dealt to you and other permanents you control is dealt to ~ instead and you gain 1 life.',
    'The next 3 damage that would be dealt to you is dealt to ~ instead.',
    'If damage would be dealt to you, it is dealt to ~ instead.',
    'All damage that would be dealt to you and another permanent you control is dealt to ~ instead.',
    'All damage that would be dealt to you and other permanents you control is dealt to ~ instead. Draw a card.',
  ],
  parse: (ctx, pos) => {
    const id = 'replacement.redirect-damage';
    const head = pattern(/all damage that would be dealt to /iu)(ctx, pos);
    if (!head.ok) return head;
    const recipients = choice(
      // "you", "you and other permanents you control"
      (c, p) => {
        const you = pattern(/you(?![\p{L}\p{N}])/iu)(c, p);
        if (!you.ok) return you;
        const more = optional(sequence(literal(' and '), OTHER_PERMANENTS), null)(c, you.pos);
        if (!more.ok) return more;
        return {
          ok: true as const,
          value: { you: true, permanents: more.value === null ? undefined : more.value[1] },
          pos: more.pos,
        };
      },
      // "other permanents you control"
      (c, p) => {
        const group = OTHER_PERMANENTS(c, p);
        if (!group.ok) return group;
        return {
          ok: true as const,
          value: { you: false, permanents: group.value },
          pos: group.pos,
        };
      },
    )(ctx, head.pos);
    if (!recipients.ok) return recipients;
    const tail = sequence(literal(' is dealt to ~ instead'), literal('.'))(ctx, recipients.pos);
    if (!tail.ok) return tail;
    const { you, permanents } = recipients.value;
    const span = { start: pos, end: tail.pos };
    const event: IrClause = {
      kind: 'clause',
      verb: 'redirectDamage',
      args: {
        you: { kind: 'flag', value: you, span, rule: id },
        ...(permanents === undefined ? {} : { permanents }),
      },
      optional: false,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: tail.pos };
  },
});

export const ADAMANTOISE_REPLACEMENT_RULES = [REPLACEMENT_REDIRECT_DAMAGE].map(quietly);
