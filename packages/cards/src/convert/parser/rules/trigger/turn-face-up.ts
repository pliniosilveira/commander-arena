/**
 * Trigger rule of the player's own action of turning a permanent face up (CR 701.40b, 116.2b, 708.8, 603.2): `trigger.you-turn-face-up`. The passive wording ("a permanent you control is
 * turned face up", "~ is turned face up") is `trigger.turned-face-up` (`rules/trigger/index.ts`).
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule } from '../registry';
import { objectSubject } from './subjects';

const ID = 'trigger.you-turn-face-up';

/**
 * `trigger.you-turn-face-up`: "you turn a permanent face up" (CR 701.40b: the player turns a manifested permanent face up by the special action; CR 116.2b). The engine's `turnedFaceUp` with `by`
 * `you`: the player who turned the permanent face up is the controller of the ability. The permanent is "a permanent", "a creature", "another creature" and the like; "it" in the effect is that
 * permanent. Not read: another player ("an opponent turns ..."), "~" as the object, "turns face down", "turn up".
 */
export const TRIGGER_YOU_TURN_FACE_UP = defineRule<IrTrigger>({
  id: ID,
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 701.40b (Manifest)',
    'CR 116.2b (Special Actions)',
    'CR 708.8 (Face-Down Spells and Permanents)',
  ],
  examples: [
    'you turn a permanent face up',
    'you turn a creature face up',
    'you turn another creature face up',
  ],
  rejects: [
    'you turn a permanent face down',
    'an opponent turns a permanent face up',
    'you turn ~ face up',
    'you turn a permanent face up or attack',
    'you turn permanents face up',
    'you turn up a permanent',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('you turn '),
      objectSubject(ID),
      pattern(/ face up(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'turnedFaceUp',
        subject: r.value[1],
        by: 'you',
        args: {},
        span: { start: pos, end: r.pos },
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

export const TURN_FACE_UP_TRIGGER_RULES = [TRIGGER_YOU_TURN_FACE_UP] as const;
