/**
 * `static.monarch-controls-attached`: "The monarch controls enchanted creature." (Fealty to the Realm; CR 613.1b: a control-changing effect, CR 725.1: the monarch, CR 303.4b: the
 * permanent an Aura enchants). The engine's `controlAttached` by the monarch (layer 2, with the timestamp of the Aura). Read only of the creature an Aura is attached to. Not read: an
 * Equipment ("The monarch controls equipped creature."), another player ("The initiative holder controls ..."), another permanent ("enchanted land", a legendary creature), a line
 * without its period, or more words after it.
 */
import { fail, literal, pattern, quiet, sequence } from '../../combinators';
import type { IrNoun, IrStatic } from '../../ir/types';
import { defineRule, family } from '../registry';

const ID = 'static.monarch-controls-attached';

export const STATIC_MONARCH_CONTROLS_ATTACHED = defineRule<IrStatic>({
  id: ID,
  family: 'static',
  leading: ['the'],
  cites: [
    'CR 613.1b (Interaction of Continuous Effects)',
    'CR 725.1 (The Monarch)',
    'CR 303.4b (Aura)',
  ],
  examples: ['The monarch controls enchanted creature.'],
  rejects: [
    'The monarch controls enchanted creature',
    'The monarch controls equipped creature.',
    'The monarch controls enchanted creature and draws a card.',
    'The monarch controls enchanted creatures.',
    'The monarch controls target creature.',
    'The monarch draws enchanted creature.',
    'The initiative holder controls enchanted creature.',
    'You control enchanted creature.',
  ],
  parse: (ctx, pos) => {
    // The words up to the subject decide whether this is the statement at all: their failure leaves no trace in the diagnostics.
    const head = quiet(pattern(/the monarch controls (?=enchanted )/iu))(ctx, pos);
    if (!head.ok) return head;
    const subject = quiet(family<IrNoun>('noun', { only: ['noun.attached-permanent'] }))(
      ctx,
      head.pos,
    );
    if (!subject.ok) return subject;
    const end = sequence(literal('.'))(ctx, subject.pos);
    if (!end.ok) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: subject.value,
        effects: [{ kind: 'controlByMonarch' }],
        span: { start: pos, end: end.pos },
        rule: ID,
      },
      pos: end.pos,
    };
  },
});

export const MONARCH_CONTROL_STATIC_RULES = [STATIC_MONARCH_CONTROLS_ATTACHED];
