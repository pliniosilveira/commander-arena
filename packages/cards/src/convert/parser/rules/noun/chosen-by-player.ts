/**
 * Noun rule of the Grand Larceny deck, group D1: "target nonland permanent of that player's choice that one of your opponents controls" (Bladegriff Prototype).
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule } from '../registry';
import { BOUNDARY, permanentPhrase } from './phrases';

/**
 * `noun.target-permanent-of-that-players-choice`: "target nonland permanent of that player's choice that one of your opponents controls" (CR 115.1, 603.3d, 109.4: the player the event of
 * the trigger is about chooses the target as the ability goes on the stack, among the permanents the words name, "your" being the controller of the ability). The engine's
 * `TargetSpec.chosenBy` 'triggerPlayer' over a slot of permanents an opponent of the controller controls. Not read: "each", "target creatures", a controller said before "of that player's
 * choice", another player than "that player", "an opponent controls" without "one of your", a plural, "up to".
 */
export const NOUN_TARGET_PERMANENT_OF_THAT_PLAYERS_CHOICE = defineRule<IrNoun>({
  id: 'noun.target-permanent-of-that-players-choice',
  family: 'noun',
  leading: ['target'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 603.3d (Handling Triggered Abilities)',
    'CR 109.4 (Objects)',
    'CR 102.1 (Players)',
  ],
  examples: [
    "target nonland permanent of that player's choice that one of your opponents controls",
    "target creature of that player's choice that one of your opponents controls",
    'target nonland permanent of that player’s choice that one of your opponents controls',
  ],
  rejects: [
    "target nonland permanent of that player's choice",
    "target nonland permanent of that player's choice that an opponent controls",
    "target nonland permanents of that player's choice that one of your opponents controls",
    "each nonland permanent of that player's choice that one of your opponents controls",
    "target nonland permanent you control of that player's choice that one of your opponents controls",
    "target nonland permanent of that opponent's choice that one of your opponents controls",
    "target nonland permanent of that player's choice that one of your opponents control",
    "target nonland permanent of that player's choice that one of your opponents controls it",
    "up to one target nonland permanent of that player's choice that one of your opponents controls",
    'target nonland permanent of that player that one of your opponents controls',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('target '),
      permanentPhrase(false, 'all'),
      pattern(
        new RegExp(
          ` of that player['’]s choice that one of your opponents controls${BOUNDARY}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, filter] = r.value;
    if (filter.controller !== undefined) return fail(ctx, pos);
    const noun: IrNoun = {
      kind: 'noun',
      det: 'target',
      filter: { ...filter, controller: 'opponent', raw: ctx.text.slice(pos, r.pos) },
      upTo: false,
      plural: false,
      other: false,
      chosenByTriggerPlayer: true,
      span: { start: pos, end: r.pos },
      rule: 'noun.target-permanent-of-that-players-choice',
    };
    return { ok: true, value: noun, pos: r.pos };
  },
});

export const CHOSEN_BY_PLAYER_NOUN_RULES = [NOUN_TARGET_PERMANENT_OF_THAT_PLAYERS_CHOICE];
