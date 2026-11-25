/**
 * Trigger rule of the Sauron deck (March from the Black Gate): "~ enters and whenever an Army you control attacks" (CR 603.2c, 603.6a, 508.1, 508.2a): one ability that two events
 * cause, each by its own words ("When ~ enters and whenever ..."). It lowers to one engine ability for each event, sharing the effect, as `trigger.enters-and-upkeep` does.
 */
import { literal, satisfy, sequence } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';

/**
 * `trigger.enters-and-attacks`: "~ enters and whenever a creature you control attacks". The first event is `~` entering and the second is `trigger.attacks` as the card writes it
 * (a creature of a kind, or another permanent, attacks). Not read: another first event, "when" for the second, a comma, a second event that is not an attack, a third event.
 */
export const TRIGGER_ENTERS_AND_ATTACKS = quietly(
  defineRule<IrTrigger>({
    id: 'trigger.enters-and-attacks',
    family: 'trigger',
    leading: ['~'],
    cites: [
      'CR 603.2c (Handling Triggered Abilities)',
      'CR 603.6a (Handling Triggered Abilities)',
      'CR 508.1 (Declare Attackers Step)',
    ],
    examples: [
      '~ enters and whenever an Army you control attacks',
      '~ enters and whenever a creature you control attacks',
      '~ enters and whenever another creature you control attacks',
    ],
    rejects: [
      '~ enters and whenever an Army you control attacks and whenever a creature dies',
      '~ enters, and whenever an Army you control attacks',
      '~ enters or whenever an Army you control attacks',
      '~ enters and when an Army you control attacks',
      '~ enters and an Army you control attacks',
      '~ enters and whenever an Army you control blocks',
      '~ enters and whenever you cast a creature spell',
      '~ enters and whenever ~ attacks you',
      '~ dies and whenever an Army you control attacks',
      'another creature enters and whenever an Army you control attacks',
    ],
    parse: (ctx, pos) => {
      const r = sequence(
        satisfy(
          family<IrTrigger>('trigger', { only: ['trigger.enters'] }),
          (t) => t.subject?.det === 'self',
        ),
        literal(' and whenever '),
        family<IrTrigger>('trigger', { only: ['trigger.attacks'] }),
      )(ctx, pos);
      if (!r.ok) return r;
      const [enters, , attacks] = r.value;
      return {
        ok: true,
        value: {
          ...enters,
          span: { start: pos, end: r.pos },
          rule: 'trigger.enters-and-attacks',
          alternatives: [attacks],
        },
        pos: r.pos,
      };
    },
  }),
);

export const ENTERS_AND_ATTACKS_TRIGGER_RULES = [TRIGGER_ENTERS_AND_ATTACKS];
