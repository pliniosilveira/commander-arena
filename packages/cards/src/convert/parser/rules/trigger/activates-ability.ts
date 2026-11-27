/**
 * Trigger rule of the Wizened Mentor line (issue 104): "an opponent activates an ability of a permanent that isn't a mana ability" (CR 602.2, 603.2, 605.1a). The engine's `activatesAbility`,
 * once each time the player activates an activated ability (a loyalty ability included) of a permanent that uses the stack.
 */
import { fail, pattern } from '../../combinators';
import type { IrFilter, IrNoun, IrTrigger, Span } from '../../ir/types';
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

const KIND = '(?:artifact|creature|land|enchantment|planeswalker)';

/**
 * `trigger.activate-ability-of-kinds`: "an opponent activates an ability of an artifact, creature, or land on the battlefield, if it isn't a mana ability" (CR 602.2, 603.2, 603.4, 605.1a;
 * Harsh Mentor): the same event with the permanent whose ability it is restricted to any of several kinds, whoever controls it (the engine's `ofSource` with an `anyOf`). The intervening "if it isn't a
 * mana ability" is the whole reading of the engine's trigger, which only ever sees an ability that uses the stack, so it is part of this rule. Not read: one kind (the other rule), a controller, a missing
 * "on the battlefield" or "if it isn't a mana ability", the past tense, a mana ability, a plural.
 */
export const TRIGGER_ACTIVATE_ABILITY_OF_KINDS = defineRule<IrTrigger>({
  id: 'trigger.activate-ability-of-kinds',
  family: 'trigger',
  leading: ['you', 'an', 'a'],
  cites: [
    'CR 602.2 (Activating Activated Abilities)',
    'CR 603.4 (Handling Triggered Abilities)',
    'CR 605.1a (Activated Mana Abilities)',
  ],
  examples: [
    "an opponent activates an ability of an artifact, creature, or land on the battlefield, if it isn't a mana ability",
    "a player activates an ability of an artifact or creature on the battlefield, if it isn't a mana ability",
    "you activate an ability of an artifact, creature, or land on the battlefield, if it isn't a mana ability",
  ],
  rejects: [
    "an opponent activates an ability of an artifact on the battlefield, if it isn't a mana ability",
    "an opponent activates an ability of an artifact, creature, or land, if it isn't a mana ability",
    'an opponent activates an ability of an artifact, creature, or land on the battlefield',
    "an opponent activated an ability of an artifact, creature, or land on the battlefield, if it isn't a mana ability",
    "an opponent activates an ability of an artifact, creature, or land you control on the battlefield, if it isn't a mana ability",
    "an opponent activates an ability of an artifact, creature, or land on the battlefield, if it isn't a mana ability or",
    "an opponent activates an ability of artifacts, creatures, or lands on the battlefield, if it isn't a mana ability",
    'an opponent activates an ability of an artifact, creature, or land on the battlefield, if it is a mana ability',
    "each opponent activates an ability of an artifact, creature, or land on the battlefield, if it isn't a mana ability",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `(you activate|an opponent activates|a player activates) an ability of an? (${KIND}(?:, ${KIND})*,? or ${KIND}|${KIND} or ${KIND}) on the battlefield, if it (?:isn['’]t|is not) a mana ability${NOT_IN_WORD}(?!\\s+(?:or|and)${NOT_IN_WORD})`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const words = (r.value[1] ?? '').replace(/ activates?$/iu, '');
    const kinds = (r.value[2] ?? '').toLowerCase().split(/,\s*(?:or\s+)?|\s+or\s+/u);
    const span: Span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'activatesAbility',
        actor: actorNoun(words, pos),
        args: {
          ofSource: makeNoun('trigger.activate-ability-of-kinds', span, 'a', {
            anyOf: kinds.map((type): IrFilter => ({ types: [type], raw: type })),
            raw: (r.value[2] ?? '').toLowerCase(),
          }),
        },
        span,
        rule: 'trigger.activate-ability-of-kinds',
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.activate-any-ability`: "you activate an ability that isn't a mana ability" (CR 602.2, 605.1a, 603.2; the emblem of Rowan Kenrith): the engine's `activatesAbility` with `anySource`, any ability that uses the stack, also one of a card in a hand or a graveyard and a loyalty ability (a mana ability is never put on the stack,
 * CR 605.1a). Only the controller ("you"): another player's activation of "an ability" is a different reading, as the parser tests of Wizened Mentor pin. Not read: "of a permanent" (the
 * other rules), a mana ability, the past tense, "an ability" alone, "abilities", "an opponent", "a player".
 */
export const TRIGGER_ACTIVATE_ANY_ABILITY = defineRule<IrTrigger>({
  id: 'trigger.activate-any-ability',
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 602.2 (Activating Activated Abilities)',
    'CR 605.1a (Activated Mana Abilities)',
    'CR 603.2 (Handling Triggered Abilities)',
  ],
  examples: ["you activate an ability that isn't a mana ability"],
  rejects: [
    "an opponent activates an ability that isn't a mana ability",
    "a player activates an ability that isn't a mana ability",
    "you activates an ability that isn't a mana ability",
    "an opponent activate an ability that isn't a mana ability",
    "you activated an ability that isn't a mana ability",
    "you activate an ability of a permanent that isn't a mana ability",
    'you activate an ability',
    'you activate a mana ability',
    "each opponent activates an ability that isn't a mana ability",
    "you activate abilities that aren't mana abilities",
    "you activate an ability that isn't a mana ability or",
    "you activate an ability that isn't a mana ability and",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `(you activate) an ability that (?:isn['’]t|is not) a mana ability${NOT_IN_WORD}(?!\\s+(?:or|and)${NOT_IN_WORD})`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const words = (r.value[1] ?? '').replace(/ activates?$/iu, '');
    const span: Span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'activatesAbility',
        actor: actorNoun(words, pos),
        // The ability activated is what "it" of "copy it" says (CR 707.10, 113.7a), so it is the subject the binding pass seeds.
        subject: makeNoun('trigger.activate-any-ability', span, 'a', { raw: 'ability' }),
        args: {
          anySource: { kind: 'flag', value: true, span, rule: 'trigger.activate-any-ability' },
        },
        span,
        rule: 'trigger.activate-any-ability',
      },
      pos: r.pos,
    };
  },
});

export const ACTIVATES_ABILITY_TRIGGER_RULES = [
  TRIGGER_ACTIVATE_ABILITY,
  TRIGGER_ACTIVATE_ABILITY_OF_KIND,
  TRIGGER_ACTIVATE_ABILITY_OF_KINDS,
  TRIGGER_ACTIVATE_ANY_ABILITY,
].map(quietly);
