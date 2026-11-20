/**
 * The player verbs of an exile of a whole graveyard and the return of what was exiled (Living Death; CR 404.1, 406.1, 608.2c, 101.4): "each player exiles all creature cards from their
 * graveyard" and "each player puts all cards they exiled this way onto the battlefield". Said of "each player" only: the engine's `exile` of every graveyard is the cards of every
 * player's own graveyard only when every player is named. The words are the whole phrase; another zone, a count, a target and "you" are other instructions and stay unread.
 */

import type { Parser } from '../../combinators';
import { fail, literal, map, pattern, sequence } from '../../combinators';
import type { IrClause, IrNoun } from '../../ir/types';
import { graveyardPhrase } from '../noun/phrases';
import { spanned } from '../registry';
import { makeClause } from './operands';

/** The shape of a player verb of `effect.player` (the same as its `Action`, which this file cannot import without a cycle). */
type Action = (subject: IrNoun, you: boolean, rule: string) => Parser<IrClause>;

const eachPlayer = (subject: IrNoun): boolean => subject.det === 'eachPlayer';

/** "exiles all creature cards from their graveyard": the cards of each player's own graveyard, as one instruction. */
export const exileGraveyardCardsAction: Action = (subject, you, rule) =>
  you || !eachPlayer(subject)
    ? (ctx, pos) => fail(ctx, pos)
    : map(
        spanned(sequence(literal('exiles all '), graveyardPhrase(true, 'fromTheirs'))),
        ({ value, span }) =>
          makeClause(
            rule,
            'exileOwnGraveyardCards',
            {
              player: subject,
              objects: {
                kind: 'noun',
                det: 'each',
                filter: value[1],
                upTo: false,
                plural: true,
                other: false,
                span,
                rule,
              },
            },
            span,
          ),
      );

/** "puts all cards they exiled this way onto the battlefield": each of those cards goes under the control of its owner, the player who exiled it from their own graveyard. */
export const putExiledCardsAction: Action = (subject, you, rule) =>
  you || !eachPlayer(subject)
    ? (ctx, pos) => fail(ctx, pos)
    : map(
        spanned(
          pattern(/puts all cards they exiled this way onto the battlefield(?![\p{L}\p{N}])/iu),
        ),
        ({ span }) => makeClause(rule, 'putExiledCardsThisWay', { player: subject }, span),
      );
