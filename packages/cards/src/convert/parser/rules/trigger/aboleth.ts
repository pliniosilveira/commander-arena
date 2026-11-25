/**
 * Trigger rule of Aboleth Spawn (Mind Flayarrrs deck, group 7): "a creature entering under an opponent's control causes a triggered ability of that creature to trigger" (CR 603.2,
 * 603.6a). The engine's `entersCausesTrigger`: the creature's own "When this creature enters" ability, as it is put on the stack, is the subject of the trigger.
 */
import { pattern } from '../../combinators';
import type { IrNoun, IrTrigger, Span } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { makeNoun } from './subjects';

const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';

/**
 * `trigger.enters-causes-trigger`: "a creature entering under an opponent's control causes a triggered ability of that creature to trigger", and the same with "your" and "a player's"
 * (CR 603.2: an event causes a triggered ability to trigger; CR 603.6a: an enters-the-battlefield ability triggers as the permanent enters). Not read: another kind than "a creature", the
 * past tense, an ability of another permanent ("a triggered ability of a permanent"), "an activated ability", several creatures, a join with another event.
 */
export const TRIGGER_ENTERS_CAUSES_TRIGGER = quietly(
  defineRule<IrTrigger>({
    id: 'trigger.enters-causes-trigger',
    family: 'trigger',
    leading: ['a'],
    cites: ['CR 603.2 (Handling Triggered Abilities)', 'CR 603.6a (Handling Triggered Abilities)'],
    examples: [
      "a creature entering under an opponent's control causes a triggered ability of that creature to trigger",
      'a creature entering under your control causes a triggered ability of that creature to trigger',
      'a creature entering under a player’s control causes a triggered ability of that creature to trigger',
    ],
    rejects: [
      "a creature entering under an opponent's control causes a triggered ability of a permanent to trigger",
      "a creature entering under an opponent's control causes an activated ability of that creature to trigger",
      "a creature entering under an opponent's control causes a triggered ability of that creature to trigger and",
      "a creature entered under an opponent's control and caused a triggered ability of that creature to trigger",
      "a permanent entering under an opponent's control causes a triggered ability of that creature to trigger",
      "creatures entering under an opponent's control cause a triggered ability of that creature to trigger",
      "a creature entering under an opponent's control causes a triggered ability of it to trigger",
      'a creature entering causes a triggered ability of that creature to trigger',
      "a creature entering under each opponent's control causes a triggered ability of that creature to trigger",
    ],
    parse: (ctx, pos) => {
      const r = pattern(
        new RegExp(
          `a creature entering under (an opponent['’]s|your|a player['’]s) control causes a triggered ability of that creature to trigger${NOT_IN_WORD}(?!\\s+(?:and|or)${NOT_IN_WORD})`,
          'iu',
        ),
      )(ctx, pos);
      if (!r.ok) return r;
      const whose = (r.value[1] ?? '').toLowerCase();
      const span: Span = { start: pos, end: r.pos };
      const actor: IrNoun = makeNoun(
        'trigger.enters-causes-trigger',
        span,
        whose === 'your' ? 'you' : whose.startsWith('an opponent') ? 'eachOpponent' : 'eachPlayer',
        { raw: whose },
      );
      return {
        ok: true,
        value: {
          kind: 'trigger',
          event: 'entersCausesTrigger',
          actor,
          args: {
            entered: makeNoun('trigger.enters-causes-trigger', span, 'a', {
              types: ['creature'],
              raw: 'creature',
            }),
          },
          span,
          rule: 'trigger.enters-causes-trigger',
        },
        pos: r.pos,
      };
    },
  }),
);

export const ABOLETH_TRIGGER_RULES = [TRIGGER_ENTERS_CAUSES_TRIGGER];
