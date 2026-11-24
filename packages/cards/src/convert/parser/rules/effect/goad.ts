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
 * their next turn; D-639, D-651). One creature: a target or the pronoun an earlier sentence of the text chose; or "each creature target player controls" (Geode Rager). Not read: "goad each creature", "goad all creatures",
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
    'goad each creature target player controls',
    'goad each creature target opponent controls',
    // Issue 144 (Grenzo, Havoc Raiser): the creature of the player the trigger is about.
    'goad target creature that player controls',
    // Riders of Rohan deck, group B (Taunt from the Rampart, CR 701.15a): a group of the creatures a player or the players name control.
    'goad all creatures your opponents control',
    'goad each creature your opponents control',
    'goad all creatures target opponent controls',
  ],
  rejects: [
    'goad each creature',
    'goad all creatures',
    'goad all artifacts your opponents control',
    'goad all creatures your opponents control until end of turn',
    'goad them',
    'goad target player',
    'goads target creature',
    'goad',
    'goad target creature until end of turn',
  ],
  parse: single(
    'effect.goad',
    sequence(
      literal('goad '),
      operands(
        [
          'noun.target-permanent-of-that-player',
          'noun.target-permanent',
          'noun.it',
          'noun.each-permanent-of-target-player',
          'noun.all-permanents-of-target-player',
          // Riders of Rohan deck, group B (Taunt from the Rampart): "goad all creatures your opponents control".
          'noun.all-permanents',
          'noun.each-permanent',
        ],
        'effect.goad',
        {
          // A group names whose creatures it is ("your opponents control"): "goad all creatures" and a group of a kind other than creatures are other lines.
          accept: (n) =>
            n.rule !== 'noun.all-permanents' && n.rule !== 'noun.each-permanent'
              ? true
              : n.filter.controller !== undefined &&
                n.filter.types?.length === 1 &&
                n.filter.types[0] === 'creature',
          locate: (n) => n.span.start,
        },
      ),
    ),
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

/**
 * `effect.explore` (Francisco, Fowl Marauder): "~ explores", "it explores" (CR 701.44a: the permanent's controller reveals the top card of their library; a land goes to their hand,
 * otherwise the permanent gets a +1/+1 counter and the card may go to the graveyard). One permanent, the card itself or the one an earlier sentence chose. Not read: "target creature
 * explores" (a target is no subject of this rule yet), several permanents, "explore" without a subject, "explores twice".
 */
export const EFFECT_EXPLORE = defineRule<Clauses>({
  id: 'effect.explore',
  family: 'effect',
  leading: ['~', 'it'],
  cites: ['CR 701.44a (Explore)'],
  examples: ['~ explores', 'it explores'],
  rejects: [
    'target creature explores',
    '~ explore',
    'explore',
    '~ explores twice',
    'it explores it',
    'they explore',
  ],
  parse: single(
    'effect.explore',
    sequence(operands(['noun.self', 'noun.it'], 'effect.explore'), literal(' explores')),
    ([objects]) => ({ verb: 'explore', args: { objects } }),
  ),
});

/**
 * `effect.remove-from-combat`: "remove enchanted creature from combat", "remove target creature from combat" (CR 506.4: the creature stops attacking or blocking, and is no longer in
 * the combat in progress; Observed Stasis). One creature: the permanent an Aura or Equipment is attached to, a target, or the pronoun an earlier sentence chose. Not read: "each
 * creature", "all attacking creatures", "them", "remove it from the game", "remove from combat" with no creature, a duration.
 */
export const EFFECT_REMOVE_FROM_COMBAT = defineRule<Clauses>({
  id: 'effect.remove-from-combat',
  family: 'effect',
  leading: ['remove'],
  cites: ['CR 506.4 (Combat Phase)'],
  examples: [
    'remove enchanted creature from combat',
    'remove equipped creature from combat',
    'remove target creature from combat',
    'remove up to one target creature from combat',
    'remove it from combat',
    'Remove target attacking creature from combat',
  ],
  rejects: [
    'remove each creature from combat',
    'remove all attacking creatures from combat',
    'remove them from combat',
    'remove target player from combat',
    'remove enchanted creature from the game',
    'remove enchanted creature from combat until end of turn',
    'remove from combat',
    'removes enchanted creature from combat',
    'remove target creature from the combat',
  ],
  parse: single(
    'effect.remove-from-combat',
    sequence(
      literal('remove '),
      operands(
        ['noun.attached-permanent', 'noun.target-permanent', 'noun.it'],
        'effect.remove-from-combat',
      ),
      pattern(/ from combat(?![\p{L}\p{N}])/iu),
    ),
    ([, objects]) => ({ verb: 'removeFromCombat', args: { objects } }),
  ),
});

export const GOAD_EFFECT_RULES = [
  EFFECT_REMOVE_FROM_COMBAT,
  EFFECT_EXPLORE,
  EFFECT_GOAD,
  EFFECT_TOKENS_GOADED,
  EFFECT_ATTACK_RANDOM_OPPONENT,
  EFFECT_ATTACK_RANDOM_OPPONENT_ANY,
];
