/**
 * Condition of Evendo Brushrazer: "you've sacrificed a nontoken permanent this turn" (CR 701.21a: sacrifice; CR 111.1: tokens; CR 603.4, 611.3a).
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, spanned } from '../registry';

/**
 * `condition.sacrificed-this-turn`: "you've sacrificed a nontoken permanent this turn", "you have sacrificed a creature this turn" (CR 701.21a, 111.1): the controller has sacrificed a
 * permanent this turn, of the card type the words name (any permanent for "permanent") and, with "nontoken" or "token", a card or a token. The engine's `sacrificedThisTurn`, read from the
 * turn log (a permanent that has left since still counts as it was). Not read: "an opponent has sacrificed", a count ("two or more"), a plural, another turn or period, a quality other than
 * "nontoken" or "token" ("a black permanent"), "a creature or artifact".
 */
export const CONDITION_SACRIFICED_THIS_TURN = defineRule<IrCondition>({
  id: 'condition.sacrificed-this-turn',
  family: 'condition',
  leading: ["you've", 'you’ve', 'you'],
  cites: [
    'CR 701.21a (Sacrifice)',
    'CR 111.1 (Tokens)',
    'CR 603.4 (Handling Triggered Abilities)',
    'CR 611.3a (Continuous Effects from Static Abilities)',
  ],
  examples: [
    "you've sacrificed a nontoken permanent this turn",
    'you’ve sacrificed a nontoken permanent this turn',
    'you have sacrificed a permanent this turn',
    "you've sacrificed a creature this turn",
    "you've sacrificed a nontoken creature this turn",
    "you've sacrificed an artifact this turn",
    "you've sacrificed a token this turn",
  ],
  rejects: [
    "you've sacrificed a nontoken permanent",
    "you've sacrificed a nontoken permanent this turn.",
    "you've sacrificed a nontoken permanent this game",
    "you've sacrificed two or more permanents this turn",
    "you've sacrificed nontoken permanents this turn",
    "you've sacrificed a creature or artifact this turn",
    "you've sacrificed a black permanent this turn",
    "you've sacrificed a nontoken token this turn",
    "you've sacrificed a artifact this turn",
    "you've sacrificed an creature this turn",
    'an opponent has sacrificed a permanent this turn',
    'you sacrificed a permanent this turn',
    "you've sacrificed this turn",
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `you(?:['’]ve| have) sacrificed (?:(a) (nontoken )?(permanent|creature|land|enchantment|planeswalker)|(an) (nontoken )?(artifact)|(a) (token)) this turn${BOUNDARY}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const m = r.value.value;
    const nontoken = (m[2] ?? m[5]) !== undefined;
    const token = m[8] !== undefined;
    const word = (m[3] ?? m[6] ?? '').toLowerCase();
    const types = word === '' || word === 'permanent' ? undefined : [word];
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: {
          kind: 'sacrificedThisTurn',
          ...(types === undefined ? {} : { types }),
          ...(nontoken ? { token: false as const } : token ? { token: true as const } : {}),
        },
        span: { start: pos, end: r.pos },
        rule: 'condition.sacrificed-this-turn',
      },
      pos: r.pos,
    };
  },
});

export const SACRIFICED_THIS_TURN_CONDITION_RULES = [CONDITION_SACRIFICED_THIS_TURN];
