/**
 * Trigger rule of the Wizened Mentor line (issue 104): "an opponent activates an ability of a permanent that isn't a mana ability" (CR 602.2, 603.2, 605.1a). The engine's `activatesAbility`,
 * once each time the player activates an activated ability (a loyalty ability included) of a permanent that uses the stack.
 */
import { pattern } from '../../combinators';
import type { IrNoun, IrTrigger, Span } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { makeNoun } from './subjects';

const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';

/** The player of the trigger as the noun the lowering reads: `you`, any player (`eachPlayer`) or an opponent (`eachOpponent`). */
function actorNoun(words: string, start: number): IrNoun {
  const span: Span = { start, end: start + words.length };
  const lower = words.toLowerCase();
  const det = lower === 'you' ? 'you' : lower === 'a player' ? 'eachPlayer' : 'eachOpponent';
  return makeNoun('trigger.activate-ability', span, det, { raw: words });
}

/**
 * `trigger.activate-ability`: "you activate an ability of a permanent that isn't a mana ability", "an opponent activates ...", "a player activates ..." (CR 602.2 activating an activated
 * ability; CR 605.1a: a mana ability is an activated ability that has no target, could add mana and is not a loyalty ability, so the ability that "isn't a mana ability" is one that uses the
 * stack). Not read: the past tense, "an ability of a creature" (a kind of permanent), "an ability" with no permanent (an ability of a card in a hand is no ability of a permanent), "a mana
 * ability", "an ability of a permanent you control".
 */
export const TRIGGER_ACTIVATE_ABILITY = defineRule<IrTrigger>({
  id: 'trigger.activate-ability',
  family: 'trigger',
  leading: ['you', 'an', 'a'],
  cites: [
    'CR 602.2 (Activating Activated Abilities)',
    'CR 605.1a (Activated Mana Abilities)',
    'CR 603.2 (Handling Triggered Abilities)',
  ],
  examples: [
    "an opponent activates an ability of a permanent that isn't a mana ability",
    "a player activates an ability of a permanent that isn't a mana ability",
    "you activate an ability of a permanent that isn't a mana ability",
  ],
  rejects: [
    "you activates an ability of a permanent that isn't a mana ability",
    "an opponent activate an ability of a permanent that isn't a mana ability",
    "an opponent activated an ability of a permanent that isn't a mana ability",
    "an opponent activates an ability of a creature that isn't a mana ability",
    "an opponent activates an ability of a permanent you control that isn't a mana ability",
    'an opponent activates an ability of a permanent',
    "an opponent activates an ability that isn't a mana ability",
    'an opponent activates a mana ability of a permanent',
    "each opponent activates an ability of a permanent that isn't a mana ability",
    "an opponent activates an ability of a permanent that isn't a mana ability or",
    "an opponent activates an ability of a permanent that isn't a mana ability and",
    'you activate',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `(you activate|an opponent activates|a player activates) an ability of a permanent that (?:isn['’]t|is not) a mana ability${NOT_IN_WORD}(?!\\s+(?:or|and)${NOT_IN_WORD})`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const words = (r.value[1] ?? '').replace(/ activates?$/iu, '');
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'activatesAbility',
        actor: actorNoun(words, pos),
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.activate-ability',
      },
      pos: r.pos,
    };
  },
});

export const ACTIVATES_ABILITY_TRIGGER_RULES = [TRIGGER_ACTIVATE_ABILITY].map(quietly);
