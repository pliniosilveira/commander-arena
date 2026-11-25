/**
 * Amounts of the players who lost life, or were dealt combat damage, this turn: "for each player who lost life this turn" (Reaper's Scythe), "the number of your opponents who were dealt
 * combat damage by ~ or a Dragon this turn" (Estinien Varlineau). The words of the group are the noun parser of `noun/players-who.ts`.
 */
import { choice, fail, type Parser, pattern, sequence } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { BOUNDARY, permanentPhrase, withoutZone } from '../noun/phrases';
import { type PlayersWhoHead, playersWho } from '../noun/players-who';
import { defineRule } from '../registry';

function playerCount(heads: readonly PlayersWhoHead[]): Parser<IrAmount> {
  const noun = playersWho(heads);
  return (ctx, pos) => {
    const r = noun(ctx, pos);
    return r.ok
      ? {
          ok: true,
          value: { kind: 'playerCount', of: r.value, span: { start: pos, end: r.pos } },
          pos: r.pos,
        }
      : r;
  };
}

/**
 * "the number of your opponents who were dealt combat damage by ~ this turn", "the number of players who lost life this turn" (CR 102.1, 102.2, 119.3, 120.2a, 608.2c): the same `playerCount`,
 * read as a value of `amount.where-x` and `amount.equal-to` (their examples hold it). Not read: "the number of opponents you have" (`opponentCount`), "the number of creatures who ...", a verb that
 * does not agree ("who was" with a plural), another span.
 */
const NUMBER_OF_PLAYERS_WHO_LOST_OR_DAMAGED: Parser<IrAmount> = playerCount([
  { words: 'the number of your opponents', group: 'eachOpponent', plural: true },
  { words: 'the number of players', group: 'eachPlayer', plural: true },
]);

/**
 * "the number of players who control more lands than you" (Oreskos Explorer; CR 102.1, 109.4, 608.2c): the `playerCount` of the players other than the controller who control more
 * battlefield permanents of the kind than the controller, read as the amount is read. The kind is a plural phrase of permanents that names no controller. Not read: "the number of
 * opponents who control more ...", "fewer", "as many", another end than "than you", a kind with a controller of its own.
 */
const NUMBER_OF_PLAYERS_WHO_CONTROL_MORE: Parser<IrAmount> = (ctx, pos) => {
  const r = sequence(
    pattern(/the number of players who control more /iu),
    permanentPhrase(true, 'all'),
    pattern(new RegExp(` than you${BOUNDARY}`, 'iu')),
  )(ctx, pos);
  if (!r.ok) return r;
  const filter = withoutZone(r.value[1]);
  if (filter.controller !== undefined) return fail(ctx, pos);
  const span = { start: pos, end: r.pos };
  return {
    ok: true,
    value: {
      kind: 'playerCount',
      of: {
        kind: 'noun',
        det: 'eachPlayerControllingMore',
        filter: { raw: ctx.text.slice(pos, r.pos) },
        upTo: false,
        plural: true,
        other: false,
        of: {
          kind: 'noun',
          det: 'each',
          filter,
          upTo: false,
          plural: true,
          other: false,
          span,
          rule: 'amount.where-x',
        },
        span,
        rule: 'amount.where-x',
      },
      span,
    },
    pos: r.pos,
  };
};

export const NUMBER_OF_PLAYERS_WHO: Parser<IrAmount> = choice(
  NUMBER_OF_PLAYERS_WHO_LOST_OR_DAMAGED,
  NUMBER_OF_PLAYERS_WHO_CONTROL_MORE,
);

/**
 * `amount.for-each-player-who`: "for each player who lost life this turn", "for each opponent who was dealt combat damage by ~ this turn" (CR 102.1, 119.3, 120.2a, 608.2c: the number
 * of the players of the group the turn log says lost life, or were dealt combat damage by the source). The engine's `playerCount` of a `lostLifeThisTurn` or `combatDamagedThisTurn`
 * selector, read as the amount is read. Not read: "for each opponent" alone, another span, "for each player who gained life".
 */
export const AMOUNT_FOR_EACH_PLAYER_WHO = defineRule<IrAmount>({
  id: 'amount.for-each-player-who',
  family: 'amount',
  leading: ['for'],
  cites: [
    'CR 102.1 (Players)',
    'CR 119.3 (Life)',
    'CR 120.2a (Damage)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'for each player who lost life this turn',
    'for each opponent who lost life this turn',
    'for each opponent who was dealt combat damage by ~ this turn',
  ],
  rejects: [
    'for each player',
    'for each player who lost life',
    'for each player who lost life last turn',
    'for each player who gained life this turn',
    'for each players who lost life this turn',
    'for each opponent who was dealt damage by ~ this turn',
    'each player who lost life this turn',
  ],
  parse: playerCount([
    { words: 'for each player', group: 'eachPlayer', plural: false },
    { words: 'for each opponent', group: 'eachOpponent', plural: false },
  ]),
});

export const PLAYERS_WHO_AMOUNT_RULES = [AMOUNT_FOR_EACH_PLAYER_WHO];
