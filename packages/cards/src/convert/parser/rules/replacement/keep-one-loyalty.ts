/**
 * Replacement rule of "As long as you control a creature, if damage dealt to a planeswalker you control of the chosen type would result in all loyalty counters
 * on it being removed, instead all but one of those counters are removed." (Deification; CR 614.1a, 120.3c, 704.5i).
 */
import { literal, optional, pattern, sequence } from '../../combinators';
import type { IrAbility, IrClause, IrCondition, IrNoun } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
import { replacement } from './shared';

/**
 * `replacement.keep-one-loyalty`: "As long as you control a creature, if damage dealt to a planeswalker you control of the chosen type would result in all
 * loyalty counters on it being removed, instead all but one of those counters are removed." (CR 614.1a: "instead" makes it a replacement effect of the permanent;
 * CR 120.3c: damage to a planeswalker removes that many loyalty counters). The engine's `keepOneLoyalty`. The "as long as" part is optional and reads a count of
 * permanents the controller controls; "of the chosen type" is optional and reads the planeswalker type the permanent chose as it entered (the card must ask for it).
 * Not read: another player's planeswalkers ("a planeswalker", "a planeswalker an opponent controls"), another number than "all but one", a condition the engine
 * cannot read as damage is dealt, another kind of damage ("combat damage"), and a missing period.
 */
export const REPLACEMENT_KEEP_ONE_LOYALTY = defineRule<IrAbility>({
  id: 'replacement.keep-one-loyalty',
  family: 'replacement',
  leading: ['as', 'if'],
  cites: [
    'CR 614.1a (Replacement Effects)',
    'CR 120.3c (Damage)',
    'CR 704.5i (State-Based Actions)',
    'CR 607.2d (Linked Abilities)',
  ],
  examples: [
    'As long as you control a creature, if damage dealt to a planeswalker you control of the chosen type would result in all loyalty counters on it being removed, instead all but one of those counters are removed.',
    'If damage dealt to a planeswalker you control would result in all loyalty counters on it being removed, instead all but one of those counters are removed.',
    'As long as you control two or more creatures, if damage dealt to a planeswalker you control would result in all loyalty counters on it being removed, instead all but one of those counters are removed.',
  ],
  rejects: [
    'As long as you control a creature, if damage dealt to a planeswalker you control of the chosen type would result in all loyalty counters on it being removed, instead all but one of those counters are removed',
    'As long as you control a creature, if damage dealt to a planeswalker of the chosen type would result in all loyalty counters on it being removed, instead all but one of those counters are removed.',
    'As long as you control a creature, if damage dealt to a planeswalker an opponent controls would result in all loyalty counters on it being removed, instead all but one of those counters are removed.',
    'As long as you control a creature, if damage dealt to a planeswalker you control would result in all loyalty counters on it being removed, instead all but two of those counters are removed.',
    'As long as you control a creature, if combat damage dealt to a planeswalker you control would result in all loyalty counters on it being removed, instead all but one of those counters are removed.',
    'As long as, if damage dealt to a planeswalker you control would result in all loyalty counters on it being removed, instead all but one of those counters are removed.',
    'As long as you control a creature, if damage dealt to a planeswalker you control would result in all loyalty counters on it being removed, instead all but one of those counters are removed. Draw a card.',
    'As long as you have the city’s blessing, if damage dealt to a planeswalker you control would result in all loyalty counters on it being removed, instead all but one of those counters are removed.',
  ],
  parse: (ctx, pos) => {
    const id = 'replacement.keep-one-loyalty';
    const lead = optional(
      sequence(
        pattern(/as long as /iu),
        spanned(
          family<IrCondition>('condition', {
            only: ['condition.control-a', 'condition.control-at-least'],
          }),
        ),
        literal(', '),
      ),
      null,
    )(ctx, pos);
    if (!lead.ok) return lead;
    const body = sequence(
      pattern(/if damage dealt to a planeswalker you control/iu),
      optional(literal(' of the chosen type'), null),
      pattern(
        / would result in all loyalty counters on it being removed, instead all but one of those counters are removed(?![\p{L}\p{N}])/iu,
      ),
      literal('.'),
    )(ctx, lead.pos);
    if (!body.ok) return body;
    const [, chosen] = body.value;
    const span = { start: pos, end: body.pos };
    const walkers: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: {
        raw: 'planeswalker you control',
        types: ['planeswalker'],
        controller: 'you',
        ...(chosen === null ? {} : { chosen: 'type' as const }),
      },
      upTo: false,
      plural: false,
      other: false,
      span,
      rule: id,
    };
    const event: IrClause = {
      kind: 'clause',
      verb: 'keepOneLoyalty',
      args: { planeswalkers: walkers },
      optional: false,
      ...(lead.value === null ? {} : { condition: lead.value[1].value }),
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: body.pos };
  },
});

export const KEEP_ONE_LOYALTY_REPLACEMENT_RULES = [REPLACEMENT_KEEP_ONE_LOYALTY].map(quietly);
