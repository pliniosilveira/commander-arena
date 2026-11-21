/**
 * Conditions of group 8 of the Ahoy Mateys deck (graveyard and library effects): "you control three or more tapped Pirates and/or Vehicles" (The Indomitable, CR 205.3, 205.2a, 110.5,
 * 109.4).
 */
import { fail, literal, map, optional, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrCondition, IrFilter } from '../../ir/types';
import { quantity } from '../amount/index';
import { SUBTYPE_WORD_NUMBERED } from '../noun/subtypes';
import { defineRule, spanned } from '../registry';

const ID = 'condition.control-at-least-subtypes';

/**
 * `condition.control-at-least-subtypes`: "you control three or more tapped Pirates and/or Vehicles" (CR 205.3: subtypes; CR 110.5: tapped; CR 109.4: you control them): at least that many
 * permanents, each tapped when the text says so, that have the one subtype or the other (a Pirate creature, a Vehicle artifact; "and/or" is "or" for the permanent counted). Two plural
 * subtype words joined by " and/or " or " or ". The engine's `controlsAtLeast` of a choice of subtypes. Not read: one subtype (that is `condition.control-at-least`), "and" alone, three
 * words, a singular, "other", "untapped", fewer.
 */
export const CONDITION_CONTROL_AT_LEAST_SUBTYPES = defineRule<IrCondition>({
  id: ID,
  family: 'condition',
  leading: ['you'],
  cites: [
    'CR 205.3 (Subtypes)',
    'CR 110.5 (Permanents)',
    'CR 109.4 (Objects)',
    'CR 603.4 (Handling Triggered Abilities)',
  ],
  examples: [
    'you control three or more tapped Pirates and/or Vehicles',
    'you control three or more Pirates and/or Vehicles',
    'you control two or more tapped Goblins or Vehicles',
  ],
  rejects: [
    'you control three or more tapped Pirates',
    'you control three or more tapped Pirates and Vehicles',
    'you control three or more tapped Pirates and/or Vehicles and/or Dragons',
    'you control three or more tapped Pirate and/or Vehicle',
    'you control three or more other Pirates and/or Vehicles',
    'you control three or more untapped Pirates and/or Vehicles',
    'you control three or fewer tapped Pirates and/or Vehicles',
    'you control a tapped Pirate and/or Vehicle',
    'an opponent controls three or more tapped Pirates and/or Vehicles',
  ],
  parse: (ctx, pos) => {
    // A plural subtype word ("Pirates", "Vehicles"): the singular form is the subtype.
    const word = map(
      satisfy(SUBTYPE_WORD_NUMBERED, (w) => w.plural === true),
      (w) => w.subtype,
    );
    const r = sequence(
      literal('you control '),
      spanned(satisfy(quantity, (n) => n >= 1)),
      literal(' or more '),
      optional(literal('tapped '), null),
      word,
      pattern(/ (?:and\/or|or) /iu),
      word,
    )(ctx, pos);
    if (!r.ok) return r;
    const [, count, , tapped, first, , second] = r.value;
    if (first === second || /^ (?:and\/or|or) /iu.test(ctx.text.slice(r.pos))) {
      return fail(ctx, pos);
    }
    const span = { start: pos, end: r.pos };
    const members: IrFilter[] = [first, second].map((w) => ({ subtypes: [w], raw: w }));
    const filter: IrFilter = {
      anyOf: members,
      ...(tapped === null ? {} : { tapped: true }),
      raw: ctx.text.slice(pos, r.pos),
    };
    const atLeast: IrAmount = { kind: 'number', value: count.value, span: count.span };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: {
          kind: 'control',
          noun: {
            kind: 'noun',
            det: 'a',
            filter,
            upTo: false,
            plural: true,
            other: false,
            span,
            rule: ID,
          },
          atLeast,
        },
        span,
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

export const AHOY_G8_CONDITION_RULES = [CONDITION_CONTROL_AT_LEAST_SUBTYPES];
