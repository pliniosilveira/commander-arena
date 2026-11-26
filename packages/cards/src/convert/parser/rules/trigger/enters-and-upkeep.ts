/**
 * Trigger rule of the surveil group of the Revenant Recon deck (Unshakable Tail): "When ~ enters and at the beginning of your upkeep, surveil 1." One ability that two events cause,
 * each by its own words (CR 603.2c: it triggers once each time one of the events occurs), as `trigger.enters-and-cast` is.
 */
import { literal, satisfy, sequence } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';

/**
 * `trigger.enters-and-upkeep`: "~ enters and at the beginning of your upkeep" (CR 603.2c, 603.6a, 503.1a). Lowers to one engine ability for each event, sharing the effect. The first
 * event is ~ itself entering, the second a step trigger as the card writes it. Not read: another subject, a comma before "and", "whenever", a step that is not the upkeep.
 */
export const TRIGGER_ENTERS_AND_UPKEEP = quietly(
  defineRule<IrTrigger>({
    id: 'trigger.enters-and-upkeep',
    family: 'trigger',
    leading: ['~'],
    cites: [
      'CR 603.2c (Handling Triggered Abilities)',
      'CR 603.6a (Handling Triggered Abilities)',
      'CR 503.1a (Upkeep Step)',
    ],
    examples: [
      '~ enters and at the beginning of your upkeep',
      '~ enters and at the beginning of each upkeep',
    ],
    rejects: [
      '~ enters and at the beginning of your end step',
      '~ enters, and at the beginning of your upkeep',
      '~ enters and whenever at the beginning of your upkeep',
      '~ enters or at the beginning of your upkeep',
      '~ enters and at your upkeep',
      '~ enters tapped and at the beginning of your upkeep',
      'another creature enters and at the beginning of your upkeep',
      '~ enters and at the beginning of your upkeep and at the beginning of your end step',
    ],
    parse: (ctx, pos) => {
      const r = sequence(
        satisfy(
          family<IrTrigger>('trigger', { only: ['trigger.enters'] }),
          (t) => t.subject?.det === 'self',
        ),
        literal(' and at '),
        family<IrTrigger>('trigger', { only: ['trigger.upkeep'] }),
      )(ctx, pos);
      if (!r.ok) return r;
      const [enters, , upkeep] = r.value;
      const span = { start: pos, end: r.pos };
      return {
        ok: true,
        value: { ...enters, span, rule: 'trigger.enters-and-upkeep', alternatives: [upkeep] },
        pos: r.pos,
      };
    },
  }),
);

export const ENTERS_AND_UPKEEP_TRIGGER_RULES = [TRIGGER_ENTERS_AND_UPKEEP];
