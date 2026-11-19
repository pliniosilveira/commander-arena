/**
 * Effect rule of issue 89 (Silverquill Influence, D-651): "Goad target creature." and "goad it." (CR 701.15a).
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, makeClause, operands, single } from './operands';

/**
 * `effect.goad`: "goad target creature", "goad up to one target creature", "goad it" (CR 701.15a: the creature is goaded by the controller of the spell or ability until
 * their next turn; D-639, D-651). One creature: a target or the pronoun an earlier sentence of the text chose. Not read: "goad each creature", "goad all creatures",
 * "goad them", "goad target player", a number of creatures, "goads", a duration.
 */
export const EFFECT_GOAD = defineRule<Clauses>({
  id: 'effect.goad',
  family: 'effect',
  leading: ['goad'],
  cites: ['CR 701.15a (Goad)', 'CR 701.15d (Goad)'],
  examples: [
    'goad target creature',
    'goad up to one target creature',
    'goad it',
    'Goad target creature',
  ],
  rejects: [
    'goad each creature',
    'goad all creatures your opponents control',
    'goad them',
    'goad target player',
    'goads target creature',
    'goad',
    'goad target creature until end of turn',
  ],
  parse: single(
    'effect.goad',
    sequence(literal('goad '), operands(['noun.target-permanent', 'noun.it'], 'effect.goad')),
    ([, objects]) => ({ verb: 'goad', args: { objects } }),
  ),
});

/**
 * `effect.attack-random-opponent`: "choose an opponent at random that ~ didn't attack during your last combat. ~ attacks that player this combat if able. If you can't choose an
 * opponent this way, tap ~." (CR 508.1d, 508.6, 506.1, 701.26a: Territorial Hellkite). Three sentences that `segment.ts` keeps together; the creature is the card itself in all three.
 * The engine's `attackRandomOpponent`. Not read: another creature, a player that is not "an opponent", "any combat", another consequence than tapping, "target opponent".
 */
export const EFFECT_ATTACK_RANDOM_OPPONENT = defineRule<Clauses>({
  id: 'effect.attack-random-opponent',
  family: 'effect',
  leading: ['choose'],
  cites: [
    'CR 508.1d (Declare Attackers Step)',
    'CR 508.6 (Declare Attackers Step)',
    'CR 506.1 (Combat Phase)',
    'CR 701.26a (Tap and Untap)',
  ],
  examples: [
    "choose an opponent at random that ~ didn't attack during your last combat. ~ attacks that player this combat if able. If you can't choose an opponent this way, tap ~",
    'Choose an opponent at random that ~ didn’t attack during your last combat. ~ attacks that player this combat if able. If you can’t choose an opponent this way, tap ~',
  ],
  rejects: [
    "choose an opponent at random that ~ didn't attack during your last combat. ~ attacks that player this combat if able",
    "choose an opponent at random that ~ didn't attack during your last combat. ~ attacks that player this combat if able. If you can't choose an opponent this way, sacrifice ~",
    "choose an opponent at random that ~ didn't attack during your last combat. ~ attacks that player this turn if able. If you can't choose an opponent this way, tap ~",
    "choose a player at random that ~ didn't attack during your last combat. ~ attacks that player this combat if able. If you can't choose an opponent this way, tap ~",
    "choose an opponent at random that ~ didn't attack during your last combat. ~ attacks that player this combat if able. If you can't choose an opponent this way, tap target creature",
    "choose an opponent at random that ~ didn't attack this turn. ~ attacks that player this combat if able. If you can't choose an opponent this way, tap ~",
    "choose target opponent that ~ didn't attack during your last combat. ~ attacks that player this combat if able. If you can't choose an opponent this way, tap ~",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /choose an opponent at random that ~ didn['’]t attack during your last combat\. ~ attacks that player this combat if able\. if you can['’]t choose an opponent this way, tap ~(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [
        makeClause(
          'effect.attack-random-opponent',
          'attackRandomOpponent',
          {},
          { start: pos, end: r.pos },
        ),
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.attack-random-opponent-any`: "choose an opponent at random. ~ attacks that player this combat if able." (CR 508.1d, 508.6, 506.1: Ursine Monstrosity). Two sentences that
 * `segment.ts` keeps together; the creature is the card itself in both. The engine's `attackRandomOpponent` with `anyOpponent`: every opponent is a candidate. Not read: another
 * creature, "a player at random", "target opponent", "this turn", the exclusion of the last combat (`effect.attack-random-opponent`).
 */
export const EFFECT_ATTACK_RANDOM_OPPONENT_ANY = defineRule<Clauses>({
  id: 'effect.attack-random-opponent-any',
  family: 'effect',
  leading: ['choose'],
  cites: [
    'CR 508.1d (Declare Attackers Step)',
    'CR 508.6 (Declare Attackers Step)',
    'CR 506.1 (Combat Phase)',
  ],
  examples: ['choose an opponent at random. ~ attacks that player this combat if able'],
  rejects: [
    'choose an opponent at random. ~ attacks that player this turn if able',
    'choose a player at random. ~ attacks that player this combat if able',
    'choose target opponent. ~ attacks that player this combat if able',
    'choose an opponent at random. target creature attacks that player this combat if able',
    'choose an opponent at random',
    'choose an opponent at random. ~ attacks that player this combat',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /choose an opponent at random\. ~ attacks that player this combat if able(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [
        makeClause(
          'effect.attack-random-opponent-any',
          'attackRandomOpponentAny',
          {},
          { start: pos, end: r.pos },
        ),
      ],
      pos: r.pos,
    };
  },
});


/**
 * `effect.tokens-goaded`: "the tokens are goaded for the rest of the game" (Death Toll deck, group D, CR 701.15a, 701.15b, 611.2b; Rendmaw, Creaking Nest): the tokens the instruction before it
 * created (each player's, the engine's `moved`) are goaded by the controller of the ability with no end. The engine's `goad` with `forever`. Not read: a goad with an end ("until your next
 * turn"), another group ("the creatures", "those tokens"), the active voice ("goad the tokens"), "each of them", another duration.
 */
export const EFFECT_TOKENS_GOADED = defineRule<Clauses>({
  id: 'effect.tokens-goaded',
  family: 'effect',
  leading: ['the'],
  cites: ['CR 701.15a (Goad)', 'CR 701.15b (Goad)', 'CR 611.2b (Continuous Effects)'],
  examples: [
    'the tokens are goaded for the rest of the game',
    'The tokens are goaded for the rest of the game',
  ],
  rejects: [
    'the tokens are goaded',
    'the tokens are goaded until your next turn',
    'the tokens are goaded for the rest of the turn',
    'the creatures are goaded for the rest of the game',
    'those tokens are goaded for the rest of the game',
    'the token is goaded for the rest of the game',
    'goad the tokens for the rest of the game',
    'the tokens are goaded for the rest of the game and',
    'tokens are goaded for the rest of the game',
  ],
  parse: single(
    'effect.tokens-goaded',
    spanned(pattern(/the tokens are goaded for the rest of the game(?![\p{L}\p{N}])/iu)),
    (found) => {
      // "the tokens" are the tokens the instruction before it made, which the binding pass names for "that token": the noun is that pronoun (the engine's `moved` holds all of them).
      const objects: IrNoun = {
        kind: 'noun',
        det: 'anaphor',
        filter: { raw: 'that token' },
        upTo: false,
        plural: false,
        other: false,
        span: found.span,
        rule: 'effect.tokens-goaded',
      };
      return {
        verb: 'goad',
        args: { objects, forever: flag('effect.tokens-goaded', true, found.span) },
      };
    },
  ),
});

export const GOAD_EFFECT_RULES = [
  EFFECT_GOAD,
  EFFECT_TOKENS_GOADED,
  EFFECT_ATTACK_RANDOM_OPPONENT,
  EFFECT_ATTACK_RANDOM_OPPONENT_ANY,
];
