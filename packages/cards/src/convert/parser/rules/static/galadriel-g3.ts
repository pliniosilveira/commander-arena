/**
 * Static rules of group 3 of the Galadriel deck (issue 43): "~ saddles Mounts and crews Vehicles as though its power were 2 greater." (the Pilot token of Defend the Rider; CR 702.122a
 * Crew, 702.171a Saddle: tapping creatures with total power N or more; the ability changes the power the creature counts for the cost, not its power).
 */
import { pattern } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule, quietly } from '../registry';

/**
 * `static.crew-saddle-bonus`: "~ saddles Mounts and crews Vehicles as though its power were 2 greater." (CR 702.122a, 702.171a, 604.1: a static ability of the creature itself). A
 * whole number of 1 or more, in digits. The subject is `~` (the card, or the token whose quoted ability it is: "This token" is `~` in the text of the token). Not read: another
 * subject, only Vehicles or only Mounts, a number in words, "less", a condition, other words after the number.
 */
export const STATIC_CREW_SADDLE_BONUS = defineRule<IrStatic>({
  id: 'static.crew-saddle-bonus',
  family: 'static',
  leading: ['~'],
  cites: [
    'CR 702.122a (Crew)',
    'CR 702.171a (Saddle)',
    'CR 604.1 (Handling Static Abilities)',
    'CR 613.4 (Interaction of Continuous Effects)',
  ],
  examples: [
    '~ saddles Mounts and crews Vehicles as though its power were 2 greater.',
    '~ saddles Mounts and crews Vehicles as though its power were 3 greater.',
    '~ saddles Mounts and crews Vehicles as though its power were 1 greater.',
  ],
  rejects: [
    '~ saddles Mounts and crews Vehicles as though its power were 2 greater',
    '~ crews Vehicles as though its power were 2 greater.',
    '~ saddles Mounts as though its power were 2 greater.',
    '~ saddles Mounts and crews Vehicles as though its power were two greater.',
    '~ saddles Mounts and crews Vehicles as though its power were 2 less.',
    '~ saddles Mounts and crews Vehicles as though its power were 0 greater.',
    '~ saddles Mounts and crews Vehicles as though its power were 2 greater if you control a Mount.',
    '~ saddles Mounts and crews Vehicles as though its toughness were 2 greater.',
    'Creatures you control saddle Mounts and crew Vehicles as though their power were 2 greater.',
    'Target creature saddles Mounts and crews Vehicles as though its power were 2 greater.',
    '~ saddles Mounts and crews Vehicles as though its power were 2 greater until end of turn.',
  ],
  parse: (ctx, pos) => {
    const id = 'static.crew-saddle-bonus';
    const r = pattern(
      /~ saddles Mounts and crews Vehicles as though its power were ([1-9]\d*) greater\./iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const who: IrNoun = {
      kind: 'noun',
      det: 'self',
      filter: { raw: '~' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos + 1 },
      rule: id,
    };
    const value: IrStatic = {
      kind: 'static',
      subject: who,
      effects: [{ kind: 'crewSaddleBonus', amount: Number(r.value[1]) }],
      span: { start: pos, end: r.pos },
      rule: id,
    };
    return { ok: true, value, pos: r.pos };
  },
});

export const GALADRIEL_G3_STATIC_RULES = [STATIC_CREW_SADDLE_BONUS].map(quietly);
