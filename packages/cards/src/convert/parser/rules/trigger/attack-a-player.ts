/**
 * Trigger rule of Landroval, Horizon Witness (Food and Fellowship deck): "Whenever two or more creatures you control attack a player" (CR 508.1b, 508.6, 603.2c).
 */
import { fail, literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { quantity } from '../amount/index';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, spanned } from '../registry';
import { makeNoun, youNoun } from './subjects';

/**
 * `trigger.n-or-more-attack-a-player`: "two or more creatures you control attack a player" (CR 508.1b, 508.6: a creature attacks a player when it is declared attacking that
 * player, not their planeswalker or battle; CR 603.2c: one trigger for each player attacked, counting only the creatures that attack that player). The engine's `attackBatch`
 * of `who` "you" with `atLeast` the number and `eachAttackedPlayer`. Not read: one ("one or more" is `trigger.attack-one-or-more`), a kind of creature, another controller,
 * "attack you", "attacks", more words after "a player".
 */
export const TRIGGER_N_OR_MORE_ATTACK_A_PLAYER = defineRule<IrTrigger>({
  id: 'trigger.n-or-more-attack-a-player',
  family: 'trigger',
  leading: ['two', 'three', 'four', 'five', 'six'],
  cites: [
    'CR 508.1b (Declare Attackers Step)',
    'CR 508.6 (Declare Attackers Step)',
    'CR 603.2c (Handling Triggered Abilities)',
  ],
  examples: [
    'two or more creatures you control attack a player',
    'three or more creatures you control attack a player',
  ],
  rejects: [
    'one or more creatures you control attack a player',
    'two or more creatures attack a player',
    'two or more creatures an opponent controls attack a player',
    'two or more Elves you control attack a player',
    'two or more creatures you control attack',
    'two or more creatures you control attack you',
    'two or more creatures you control attacks a player',
    'two or more creatures you control attack a players',
    'two or more creatures you control attack a player and',
    'two or more creatures you control attack a player or',
    'two creatures you control attack a player',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.n-or-more-attack-a-player';
    const r = sequence(
      spanned(satisfy(quantity, (n) => n >= 2)),
      literal(' or more creatures you control attack a player'),
    )(ctx, pos);
    if (!r.ok) return r;
    if (pattern(/(?:[\p{L}\p{N}]|\s+(?:and|or)(?![\p{L}\p{N}]))/iu)(ctx, r.pos).ok) {
      return fail(ctx, pos);
    }
    const actor = makeNoun(id, { start: pos, end: pos }, 'you', { raw: '' });
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'attackBatch',
        actor,
        atLeast: r.value[0].value,
        eachAttackedPlayer: true,
        args: {},
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.you-attack-player-with-one-or-more`: "you attack a player with one or more creatures with power 4 or greater" (Bitter Work, CR 508.1b, 508.6, 603.2c: a creature attacks
 * a player when it is declared attacking that player, not their planeswalker or battle; one trigger for each player attacked with at least one creature of the kind, counting
 * only the creatures that attack that player). The engine's `attackBatch` of `who` "you" with `atLeast` 1, the kind of creature as `what` and `eachAttackedPlayer`. Not read: a
 * number other than one, a kind that is not creatures, "attack with" without "a player", more words after the creatures.
 */
export const TRIGGER_YOU_ATTACK_PLAYER_WITH_ONE_OR_MORE = defineRule<IrTrigger>({
  id: 'trigger.you-attack-player-with-one-or-more',
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 508.1b (Declare Attackers Step)',
    'CR 508.6 (Declare Attackers Step)',
    'CR 603.2c (Handling Triggered Abilities)',
  ],
  examples: [
    'you attack a player with one or more creatures with power 4 or greater',
    'you attack a player with one or more creatures with toughness 5 or greater',
  ],
  rejects: [
    'you attack a player with two or more creatures with power 4 or greater',
    'you attack a player with one or more noncreature permanents',
    'you attack a player with one or more creatures with power 4 or greater and gain life',
    'you attack with one or more creatures with power 4 or greater',
    'you attack a player with a creature with power 4 or greater',
    'you attack a players with one or more creatures with power 4 or greater',
    'you attack a player with one or more creatures with power 4 or greater or',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.you-attack-player-with-one-or-more';
    const r = sequence(
      youNoun(id),
      literal(' attack a player with one or more '),
      spanned(map(permanentPhrase(true, 'all'), withoutZone)),
    )(ctx, pos);
    if (!r.ok) return r;
    const [actor, , phrase] = r.value;
    if (
      phrase.value.types?.length !== 1 ||
      phrase.value.types[0] !== 'creature' ||
      phrase.value.notTypes !== undefined
    ) {
      return fail(ctx, pos);
    }
    if (pattern(/(?:[\p{L}\p{N}]|\s+(?:and|or)(?![\p{L}\p{N}]))/iu)(ctx, r.pos).ok) {
      return fail(ctx, pos);
    }
    const { zone: _zone, ...filter } = phrase.value;
    void _zone;
    const subject = makeNoun(id, phrase.span, 'a', filter);
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'attackBatch',
        actor,
        atLeast: 1,
        subject: { ...subject, plural: true },
        eachAttackedPlayer: true,
        args: {},
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const ATTACK_A_PLAYER_TRIGGER_RULES = [
  TRIGGER_N_OR_MORE_ATTACK_A_PLAYER,
  TRIGGER_YOU_ATTACK_PLAYER_WITH_ONE_OR_MORE,
];
