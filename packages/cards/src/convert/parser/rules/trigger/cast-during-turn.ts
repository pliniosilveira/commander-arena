/**
 * Trigger rules of a spell cast in a named turn (CR 603.2: an ability triggers only for an event that fits its words): "an opponent casts a spell during your turn", and two
 * events written as one sentence, "Whenever an opponent casts a spell during your turn and when ~ dies" (CR 603.2c: they are two abilities, each triggers on its own, and they
 * share the effect). Both start like `trigger.cast`, which stops before the rest, so they come before it.
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';

/**
 * `trigger.cast-during-your-turn`: a plain cast trigger of `trigger.cast`, then "during your turn" (CR 603.2, 601.2i): the engine's `castSpell` with `duringTurn: 'you'`, true only
 * while the active player is the controller of the ability. Not read: another turn ("during their turn", "during an opponent's turn"), a step or phase, a missing "your".
 */
export const TRIGGER_CAST_DURING_YOUR_TURN = quietly(
  defineRule<IrTrigger>({
    id: 'trigger.cast-during-your-turn',
    family: 'trigger',
    leading: ['you', 'an', 'a'],
    cites: [
      'CR 603.2 (Handling Triggered Abilities)',
      'CR 601.2i (Casting Spells)',
      'CR 500.1 (General)',
    ],
    examples: [
      'an opponent casts a spell during your turn',
      'an opponent casts a creature spell during your turn',
      'a player casts an instant or sorcery spell during your turn',
    ],
    rejects: [
      'an opponent casts a spell during their turn',
      "an opponent casts a spell during an opponent's turn",
      'an opponent casts a spell during your end step',
      'an opponent casts a spell during turn',
      'an opponent casts a spell during your turns',
      'an opponent casts a spell during your turn or',
      'an opponent casts a spell',
    ],
    parse: (ctx, pos) => {
      const r = sequence(
        family<IrTrigger>('trigger', { only: ['trigger.cast'] }),
        pattern(/ during your turn(?![\p{L}\p{N}])(?!\s+or(?![\p{L}\p{N}]))/iu),
      )(ctx, pos);
      if (!r.ok) return r;
      const [cast] = r.value;
      return {
        ok: true,
        value: {
          ...cast,
          duringTurn: 'you',
          span: { start: pos, end: r.pos },
          rule: 'trigger.cast-during-your-turn',
        },
        pos: r.pos,
      };
    },
  }),
);

/**
 * `trigger.cast-turn-and-when`: "an opponent casts a spell during your turn and when ~ dies" (CR 603.2c, 700.4): the cast trigger of `trigger.cast-during-your-turn` and a second
 * event of its own after "and when" (the words of a "When" trigger). Like `trigger.or` it lowers to one engine ability for each event, sharing the effect. Not read: "and
 * whenever", "or when", a second event that is not a creature dying or entering, a third event.
 */
export const TRIGGER_CAST_TURN_AND_WHEN = quietly(
  defineRule<IrTrigger>({
    id: 'trigger.cast-turn-and-when',
    family: 'trigger',
    leading: ['you', 'an', 'a'],
    cites: [
      'CR 603.2c (Handling Triggered Abilities)',
      'CR 603.2 (Handling Triggered Abilities)',
      'CR 700.4 (Dies)',
    ],
    examples: [
      'an opponent casts a spell during your turn and when ~ dies',
      'an opponent casts a creature spell during your turn and when ~ enters',
    ],
    rejects: [
      'an opponent casts a spell during your turn and whenever ~ dies',
      'an opponent casts a spell during your turn or when ~ dies',
      'an opponent casts a spell during your turn and when ~ attacks',
      'an opponent casts a spell during your turn and when',
      'an opponent casts a spell and when ~ dies',
      'an opponent casts a spell during your turn and when ~ dies and when ~ enters',
    ],
    parse: (ctx, pos) => {
      const r = sequence(
        family<IrTrigger>('trigger', { only: ['trigger.cast-during-your-turn'] }),
        literal(' and when '),
        family<IrTrigger>('trigger', { only: ['trigger.dies', 'trigger.enters'] }),
      )(ctx, pos);
      if (!r.ok) return r;
      const [cast, , second] = r.value;
      return {
        ok: true,
        value: {
          ...cast,
          span: { start: pos, end: r.pos },
          rule: 'trigger.cast-turn-and-when',
          alternatives: [second],
        },
        pos: r.pos,
      };
    },
  }),
);

export const CAST_DURING_TURN_TRIGGER_RULES = [
  TRIGGER_CAST_TURN_AND_WHEN,
  TRIGGER_CAST_DURING_YOUR_TURN,
] as const;
