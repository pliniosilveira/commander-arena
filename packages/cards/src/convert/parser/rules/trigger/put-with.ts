/**
 * Trigger rule of a permanent whose ability put a creature onto the battlefield (Diabolic Servitude; CR 607.1, 607.2, 400.7, 603.10a): "When the creature put onto the battlefield with ~
 * dies, ...". The creature is the one an effect of this permanent put there (the engine's `putWithSource`); the death is read by looking back in time (CR 603.10a). Says what the text says;
 * what the engine can run is the lowering's business (`lower/triggers.ts`).
 */
import { literal, map, pattern, sequence } from '../../combinators';
import type { IrFilter, IrTrigger } from '../../ir/types';
import { defineRule, quietly, spanned } from '../registry';
import { makeNoun } from './subjects';

const ID = 'trigger.put-with-self-dies';
const PERMANENT_TYPES = ['creature', 'artifact', 'enchantment', 'land', 'planeswalker'] as const;

/**
 * `trigger.put-with-self-dies`: "the creature put onto the battlefield with ~ dies" (CR 700.4: "dies" means "is put into a graveyard from the battlefield"; CR 607.2: the ability is linked
 * to the one that put the creature onto the battlefield). The engine's `dies` of a creature that `putWithSource`. Not read: "a creature", the plural, a pronoun ("with it"), another
 * permanent ("with target Aura"), another event, "dies" joined to another event with "or" or "and", a card type that is not a permanent type.
 */
export const TRIGGER_PUT_WITH_SELF_DIES = defineRule<IrTrigger>({
  id: ID,
  family: 'trigger',
  leading: ['the'],
  cites: [
    'CR 700.4 (General)',
    'CR 607.2 (Linked Abilities)',
    'CR 603.10a (Handling Triggered Abilities)',
    'CR 400.7 (General)',
  ],
  examples: [
    'the creature put onto the battlefield with ~ dies',
    'the permanent put onto the battlefield with ~ dies',
    'the artifact put onto the battlefield with ~ dies',
  ],
  rejects: [
    'a creature put onto the battlefield with ~ dies',
    'the creatures put onto the battlefield with ~ die',
    'the creature put onto the battlefield with it dies',
    'the creature put onto the battlefield with target Aura dies',
    'the creature put onto the battlefield with ~ attacks',
    'the creature put onto the battlefield with ~ dies or attacks',
    'the creature put onto the battlefield with ~ dies and',
    'the instant put onto the battlefield with ~ dies',
    'the creature put onto the battlefield dies',
    'creature put onto the battlefield with ~ dies',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      map(
        sequence(
          literal('the '),
          pattern(new RegExp(`(${[...PERMANENT_TYPES, 'permanent'].join('|')})(?= put )`, 'iu')),
          literal(' put onto the battlefield with ~ dies'),
          pattern(/(?![\p{L}\p{N}])(?!\s*(?:or|and)\b)/iu),
        ),
        ([, word]) => (word[1] ?? '').toLowerCase(),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const type = r.value.value;
    const filter: IrFilter = {
      ...(type === 'permanent' ? {} : { types: [type] }),
      putWithSelf: true,
      raw: ctx.text.slice(pos + 'the '.length, r.pos - ' dies'.length),
    };
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'dies',
        args: {},
        subject: makeNoun(ID, span, 'a', filter),
        span,
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

/** Quiet: the rule tries wherever "the" stands and must not move the point where another line stops (the diagnostics of the golden corpus). */
export const PUT_WITH_TRIGGER_RULES = [TRIGGER_PUT_WITH_SELF_DIES].map(quietly);
