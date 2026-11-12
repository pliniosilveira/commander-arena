/**
 * Conditions of the Niv-Mizzet deck program (issue 25, D-981): what the engine's per-seat count of spells cast tells. "You've cast three or more spells this
 * turn" (CR 601.2i: a spell is cast once it is on the stack with its costs paid; the count of the turn adds them up).
 */
import { pattern, satisfy, sequence } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { quantity } from '../amount/index';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, spanned } from '../registry';

/**
 * `condition.spells-cast-this-turn`: "you've cast three or more spells this turn", "you have cast two or more spells this turn" (CR 602.5b, 601.2i: the spells
 * the controller has cast this turn, from every zone, a copy never counted, CR 707.10). The engine's `spellsCastThisTurn`, read as the ability is activated.
 * Not read: a kind of spell ("instant or sorcery spells"), "or fewer", "an opponent has cast", one spell ("a spell"), zero, a variable count.
 */
export const CONDITION_SPELLS_CAST_THIS_TURN = defineRule<IrCondition>({
  id: 'condition.spells-cast-this-turn',
  family: 'condition',
  leading: ["you've", 'you’ve', 'you'],
  cites: [
    'CR 602.5b (Activating Activated Abilities)',
    'CR 601.2i (Casting Spells)',
    'CR 707.10 (Copying Objects)',
  ],
  examples: [
    "you've cast three or more spells this turn",
    'you’ve cast three or more spells this turn',
    'you have cast two or more spells this turn',
    "you've cast 3 or more spells this turn",
    "you've cast five or more spells this turn",
    "you've cast one or more spells this turn",
  ],
  rejects: [
    "you've cast three or more spells",
    "you've cast three or more spells this turn.",
    "you've cast three or more instant or sorcery spells this turn",
    "you've cast three or fewer spells this turn",
    "you've cast a spell this turn",
    "you've cast 0 or more spells this turn",
    "you've cast X or more spells this turn",
    'an opponent has cast three or more spells this turn',
    "you've cast three spells this turn",
    "you've cast three or more spells this game",
    'you cast three or more spells this turn',
    "you've cast three or more spells this turn and",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(/you(?:'ve|’ve| have) cast /iu),
      spanned(satisfy(quantity, (n) => n >= 1)),
      pattern(new RegExp(` or more spells this turn${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, count] = r.value;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'spellsCastThisTurn', atLeast: count.value },
        span: { start: pos, end: r.pos },
        rule: 'condition.spells-cast-this-turn',
      },
      pos: r.pos,
    };
  },
});

export const SPELLS_CAST_CONDITION_RULES = [CONDITION_SPELLS_CAST_THIS_TURN];
