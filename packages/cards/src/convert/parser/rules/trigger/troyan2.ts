/**
 * Trigger rules of the Troyan 2 deck (issue 400): "When ~ is put into a graveyard from anywhere" (Worldspine Wurm; CR 603.6c, 603.10a, 404.1, 400.7). The card itself goes into
 * the graveyard of its owner from any zone (the battlefield, a hand, a library, the stack, exile). Says what the text says; what the engine can run is the lowering's business
 * (`lower/triggers.ts`).
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule } from '../registry';
import { makeNoun } from './subjects';

const ID = 'trigger.self-put-into-graveyard';

/**
 * `trigger.self-put-into-graveyard`: "~ is put into a graveyard from anywhere" (CR 603.6c: a trigger of an object that changes zones; CR 404.1: a card goes to the graveyard of its
 * owner). The engine's `putIntoGraveyard` with `self`. Not read: another object, "your graveyard", a zone other than "anywhere" (`trigger.dies` reads "from the battlefield"), the
 * past tense, another event joined with "and" or "or".
 */
export const TRIGGER_SELF_PUT_INTO_GRAVEYARD = defineRule<IrTrigger>({
  id: ID,
  family: 'trigger',
  leading: ['~'],
  cites: [
    'CR 603.6c (Handling Triggered Abilities)',
    'CR 603.10a (Handling Triggered Abilities)',
    'CR 404.1 (Graveyard)',
    'CR 400.7 (Zones)',
  ],
  examples: ['~ is put into a graveyard from anywhere'],
  rejects: [
    '~ is put into a graveyard',
    '~ is put into a graveyard from the battlefield',
    '~ is put into your graveyard from anywhere',
    "~ is put into an opponent's graveyard from anywhere",
    '~ was put into a graveyard from anywhere',
    '~ is put into a graveyard from anywhere or attacks',
    '~ is put into a graveyard from anywhere and',
    'another creature is put into a graveyard from anywhere',
    'a creature card is put into a graveyard from anywhere',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('~'),
      pattern(/ is put into a graveyard from anywhere(?![\p{L}\p{N}])(?!\s+(?:and|or)\b)/iu),
    )(ctx, pos);
    if (!r.ok) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'putIntoGraveyard',
        subject: makeNoun(ID, { start: pos, end: pos + 1 }, 'self', { raw: '~' }),
        args: {},
        span,
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

export const TROYAN2_TRIGGER_RULES = [TRIGGER_SELF_PUT_INTO_GRAVEYARD];
