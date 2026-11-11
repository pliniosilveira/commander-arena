/**
 * Static ability rules of the Vraska EDHREC deck (stage P67, D-220): "If a triggered ability of a Shaman or another Wizard you control triggers, that ability
 * triggers an additional time." and "If a triggered ability of equipped creature triggers, that ability triggers an additional time." (CR 603.2d).
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { CREATURE_TYPES } from '../noun/creature-types';
import { defineRule, family, quietly, spanned } from '../registry';
import { staticOf } from './angels-words';

const TAIL = ', that ability triggers an additional time.';

/**
 * `static.triggers-additional-time`: "If a triggered ability of a Shaman or another Wizard you control triggers, that ability triggers an additional time."
 * and "If a triggered ability of equipped creature triggers, that ability triggers an additional time." (CR 603.2d: each time such a triggered ability
 * triggers, it triggers once more, a copy of the trigger). The permanents are one or two creature types of the controller ("a Shaman or another Wizard you control":
 * the second type excludes the permanent itself) or the permanent the source is attached to. Not read: "a creature you control", another number of times,
 * a condition, "or an emblem", a type that is not one, "another" on the first type, "that ability" for another ability.
 */
export const STATIC_TRIGGERS_ADDITIONAL_TIME = defineRule<IrStatic>({
  id: 'static.triggers-additional-time',
  family: 'static',
  leading: ['if'],
  cites: [
    'CR 603.2d (Handling Triggered Abilities)',
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    'If a triggered ability of a Shaman or another Wizard you control triggers, that ability triggers an additional time.',
    'If a triggered ability of equipped creature triggers, that ability triggers an additional time.',
    'If a triggered ability of a Wizard you control triggers, that ability triggers an additional time.',
  ],
  rejects: [
    'If a triggered ability of a Shaman or another Wizard you control triggers, that ability triggers an additional time',
    'If a triggered ability of a creature you control triggers, that ability triggers an additional time.',
    'If a triggered ability of another Shaman or a Wizard you control triggers, that ability triggers an additional time.',
    'If a triggered ability of a Shaman or another Wizard you control triggers, that ability triggers two additional times.',
    'If a triggered ability of a Shaman or another Wizard triggers, that ability triggers an additional time.',
    'If a triggered ability of a Shaman or another Wizzard you control triggers, that ability triggers an additional time.',
    'If a triggered ability of enchanted creature triggers, that ability triggers an additional time.',
    'If a triggered ability of equipped creature triggers, that ability triggers an additional time. Draw a card.',
    'If an activated ability of equipped creature triggers, that ability triggers an additional time.',
  ],
  parse: (ctx, pos) => {
    const id = 'static.triggers-additional-time';
    const lead = literal('if a triggered ability of ')(ctx, pos);
    if (!lead.ok) return lead;
    const attached = family<IrNoun>('noun', { only: ['noun.attached-permanent'] })(ctx, lead.pos);
    if (attached.ok) {
      if (attached.value.det !== 'equipped') return fail(ctx, pos);
      const tail = sequence(literal(' triggers'), literal(TAIL))(ctx, attached.pos);
      if (!tail.ok) return tail;
      return {
        ok: true,
        value: staticOf(id, attached.value, [{ kind: 'doubleTriggers' }], pos, tail.pos),
        pos: tail.pos,
      };
    }
    // "a Shaman or another Wizard you control" / "a Wizard you control": creature types of the controller.
    const kinds = spanned(
      pattern(/an? ([A-Z][a-z]+)(?: or another ([A-Z][a-z]+))? you control(?![\p{L}\p{N}])/u),
    )(ctx, lead.pos);
    if (!kinds.ok) return kinds;
    const [, first, second] = kinds.value.value;
    if (first === undefined || !CREATURE_TYPES.has(first)) return fail(ctx, pos);
    if (second !== undefined && !CREATURE_TYPES.has(second)) return fail(ctx, pos);
    const tail = sequence(literal(' triggers'), literal(TAIL))(ctx, kinds.pos);
    if (!tail.ok) return tail;
    const members = [
      { subtypes: [first], controller: 'you' as const, raw: first },
      ...(second === undefined
        ? []
        : [{ subtypes: [second], controller: 'you' as const, other: true as const, raw: second }]),
    ];
    const subject: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter:
        members.length === 1
          ? { ...members[0], raw: kinds.value.span.start >= 0 ? first : first }
          : { controller: 'you', anyOf: members, raw: `${first} or another ${second}` },
      upTo: false,
      plural: false,
      other: false,
      span: kinds.value.span,
      rule: id,
    };
    return {
      ok: true,
      value: staticOf(id, subject, [{ kind: 'doubleTriggers' }], pos, tail.pos),
      pos: tail.pos,
    };
  },
});

export const EDHREC_STATIC_RULES = [STATIC_TRIGGERS_ADDITIONAL_TIME].map(quietly);
