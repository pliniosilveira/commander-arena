/**
 * Static ability rule: "Creatures your opponents control with power less than ~'s power are goaded." (Baeloth Barrityl; CR 701.15a, 701.15b, 208.1, 604.1), the engine's `goaded`
 * static ability of a group whose subject compares power with the permanent that has it (`powerLessThanSource`).
 */
import { literal } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { staticOf } from './angels-words';

const SUBJECT = 'Creatures your opponents control with power less than ~';

/**
 * `static.power-less-goaded`: "Creatures your opponents control with power less than ~'s power are goaded." (CR 701.15a: the controller of the permanent goads them for as long as the
 * ability applies; CR 208.1: the power each creature has now, against the power of the permanent now). The engine's `goaded` static ability whose subject is the creatures the
 * opponents of its controller control with less power than the permanent has. Not read: another group, "your" creatures, "other", a number instead of the source's power, a condition,
 * more words after it.
 */
export const STATIC_POWER_LESS_GOADED = defineRule<IrStatic>({
  id: 'static.power-less-goaded',
  family: 'static',
  leading: [],
  cites: [
    'CR 701.15a (Goad)',
    'CR 701.15b (Goad)',
    'CR 208.1 (Power/Toughness)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: ["Creatures your opponents control with power less than ~'s power are goaded."],
  rejects: [
    "Creatures your opponents control with power less than ~'s power are goaded",
    "Creatures you control with power less than ~'s power are goaded.",
    "Creatures with power less than ~'s power are goaded.",
    "Other creatures your opponents control with power less than ~'s power are goaded.",
    "Creatures your opponents control with power greater than ~'s power are goaded.",
    'Creatures your opponents control with power less than 3 are goaded.',
    "Creatures your opponents control with power less than ~'s power are goaded. Draw a card.",
    "Artifacts your opponents control with power less than ~'s power are goaded.",
    "Creatures your opponents control with power less than ~'s power can't block.",
  ],
  parse: (ctx, pos) => {
    const r = literal(`${SUBJECT}'s power are goaded.`)(ctx, pos);
    if (!r.ok) return r;
    const subject: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: {
        raw: `${SUBJECT}'s power`,
        types: ['creature'],
        controller: 'opponent',
        powerLessThanSource: true,
      },
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos, end: pos + SUBJECT.length + "'s power".length },
      rule: 'static.power-less-goaded',
    };
    return {
      ok: true,
      value: staticOf(
        'static.power-less-goaded',
        subject,
        [{ kind: 'restriction', restriction: 'goaded' }],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

export const POWER_LESS_GOADED_STATIC_RULES = [STATIC_POWER_LESS_GOADED].map(quietly);
