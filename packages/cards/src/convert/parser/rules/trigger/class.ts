/** The level reached by a Class, for "When this Class becomes level 3" (CR 716.2, D-235). */
import { pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule } from '../registry';

export const TRIGGER_CLASS_LEVEL = defineRule<IrTrigger>({
  id: 'trigger.class-level',
  family: 'trigger',
  leading: ['~'],
  cites: ['CR 716.2 (Class Cards)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: ['~ becomes level 2', '~ becomes level 3'],
  rejects: [
    '~ becomes level 1',
    '~ becomes level 0',
    '~ becomes level X',
    '~ becomes level 3 or',
    '~ was level 3',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/~ becomes level ([2-9]|[1-9]\d+)(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    const level = Number(r.value[1]);
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'classLevel',
        args: {},
        level,
        span: { start: pos, end: r.pos },
        rule: 'trigger.class-level',
      },
      pos: r.pos,
    };
  },
});

export const CLASS_TRIGGER_RULES = [TRIGGER_CLASS_LEVEL];
