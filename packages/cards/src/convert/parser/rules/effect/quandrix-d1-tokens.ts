/**
 * "Each player creates a 0/0 green and blue Fractal creature token and puts a number of +1/+1 counters on it equal to the total power of creatures they controlled that were
 * exiled this way." (Oversimplify, CR 111.2, 122.6, 608.2c, 608.2h): after an `exile` of the same resolution, every player creates the token and puts on it as many counters as
 * the creatures they controlled that really were exiled had power between them, as they were before they left. Two clauses: the token each player creates (the same clause
 * `effect.player` reads) and the counters put on the tokens just made, counted for the controller of each.
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrNoun, IrToken } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';
import { tokenWithEach } from './token';

const ID = 'effect.each-player-token-and-exiled-power';

export const EFFECT_EACH_PLAYER_TOKEN_EXILED_POWER = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 111.2 (Tokens)',
    'CR 122.6 (Counters)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 608.2h (Resolving Spells and Abilities)',
  ],
  examples: [
    'Each player creates a 0/0 green and blue Fractal creature token and puts a number of +1/+1 counters on it equal to the total power of creatures they controlled that were exiled this way',
  ],
  rejects: [
    'Each player creates a 0/0 green and blue Fractal creature token and puts a number of +1/+1 counters on it',
    'Each player creates a 0/0 green and blue Fractal creature token and puts a number of -1/-1 counters on it equal to the total power of creatures they controlled that were exiled this way',
    'Each player creates a 0/0 green and blue Fractal creature token and puts a number of +1/+1 counters on it equal to the total power of creatures you controlled that were exiled this way',
    'Each player creates a 0/0 green and blue Fractal creature token and puts a number of +1/+1 counters on it equal to the total toughness of creatures they controlled that were exiled this way',
    'Each opponent creates a 0/0 green and blue Fractal creature token and puts a number of +1/+1 counters on it equal to the total power of creatures they controlled that were exiled this way',
    'Each player create a 0/0 green and blue Fractal creature token and puts a number of +1/+1 counters on it equal to the total power of creatures they controlled that were exiled this way',
    'Each player creates a 0/0 green and blue Fractal creature token and puts a number of +1/+1 counters on it equal to the total power of creatures they controlled that were destroyed this way',
    'Each player creates a 0/0 green and blue Fractal creature token and puts a number of +1/+1 counters on it equal to the total power of creatures they controlled that were exiled this way and draws a card',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      family<IrNoun>('noun', { only: ['noun.player'] }),
      literal(' creates '),
      tokenWithEach(['token.custom']),
      literal(' and puts a number of +1/+1 counters on it equal to the total power of '),
      spanned(
        pattern(new RegExp(`creatures they controlled that were exiled this way${BOUNDARY}`, 'iu')),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [subject, , token, , tail] = r.value;
    if (subject.det !== 'eachPlayer') return fail(ctx, pos);
    const made: IrToken = token;
    return {
      ok: true,
      value: [
        {
          ...makeClause(ID, 'createToken', { player: subject, token: made }, made.span),
          connector: 'and' as const,
        },
        makeClause(ID, 'addExiledPowerCounters', {}, tail.span),
      ],
      pos: r.pos,
    };
  },
});

export const QUANDRIX_D1_TOKEN_RULES = [EFFECT_EACH_PLAYER_TOKEN_EXILED_POWER];
