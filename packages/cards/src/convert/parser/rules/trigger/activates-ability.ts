/**
 * Trigger rule of the Wizened Mentor line (issue 104): "an opponent activates an ability of a permanent that isn't a mana ability" (CR 602.2, 603.2, 605.1a). The engine's `activatesAbility`,
 * once each time the player activates an activated ability (a loyalty ability included) of a permanent that uses the stack.
 */
import { fail, pattern } from '../../combinators';
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

/**
 * `trigger.activate-ability-of-kind`: "an opponent activates an ability of an artifact they control", "a player activates an ability of a creature they control", "you activate an ability of an artifact you control"
 * (CR 602.2, 603.2, 605.1a; Avalanche of Sector 7): the same event with the permanent whose ability it is restricted to a kind the player controls ("they" is the player who activated it: the engine's
 * `ofSource` with the controller `triggerPlayer`, or `you` for the controller of the ability). Not read: no controller words, a controller who is not the actor ("an opponent activates an ability of an artifact you
 * control"), "a permanent" (the other rule), a plural, the past tense, a mana ability.
 */
export const TRIGGER_ACTIVATE_ABILITY_OF_KIND = defineRule<IrTrigger>({
  id: 'trigger.activate-ability-of-kind',
  family: 'trigger',
  leading: ['you', 'an', 'a'],
  cites: [
    'CR 602.2 (Activating Activated Abilities)',
    'CR 605.1a (Activated Mana Abilities)',
    'CR 603.2 (Handling Triggered Abilities)',
  ],
  examples: [
    'an opponent activates an ability of an artifact they control',
    'a player activates an ability of a creature they control',
    'you activate an ability of an artifact you control',
    'an opponent activates an ability of a land they control',
  ],
  rejects: [
    'an opponent activates an ability of an artifact',
    'an opponent activates an ability of an artifact you control',
    'you activate an ability of an artifact they control',
    'an opponent activates an ability of a permanent they control',
    'an opponent activates an ability of artifacts they control',
    'an opponent activated an ability of an artifact they control',
    'an opponent activates a mana ability of an artifact they control',
    "an opponent activates an ability of an artifact they control that isn't a mana ability",
    'an opponent activates an ability of an artifact they control or',
    'you activates an ability of an artifact you control',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `(you activate|an opponent activates|a player activates) an ability of an? (artifact|creature|land|enchantment|planeswalker) (they|you) control${NOT_IN_WORD}(?!\\s+(?:or|and|that)${NOT_IN_WORD})`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const words = (r.value[1] ?? '').replace(/ activates?$/iu, '');
    const actor = words.toLowerCase();
    const pronoun = (r.value[3] ?? '').toLowerCase();
    // "they" is the player who activated the ability; "you" is the controller of this ability, so only the actor "you" says it.
    if ((pronoun === 'you') !== (actor === 'you')) return fail(ctx, pos);
    const type = (r.value[2] ?? '').toLowerCase();
    const span: Span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'activatesAbility',
        actor: actorNoun(words, pos),
        args: {
          ofSource: makeNoun('trigger.activate-ability-of-kind', span, 'a', {
            types: [type],
            controller: pronoun === 'you' ? 'you' : 'triggerPlayer',
            raw: `${type} ${pronoun} control`,
          }),
        },
        span,
        rule: 'trigger.activate-ability-of-kind',
      },
      pos: r.pos,
    };
  },
});

export const ACTIVATES_ABILITY_TRIGGER_RULES = [
  TRIGGER_ACTIVATE_ABILITY,
  TRIGGER_ACTIVATE_ABILITY_OF_KIND,
].map(quietly);
