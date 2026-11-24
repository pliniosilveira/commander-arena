/**
 * Effect rules of the Elven Council deck (Tales of Middle-earth Commander), group "tokens and shuffles": a target player shuffles their whole graveyard into their library
 * (Learn from the Past) and each player searches for a basic land card and puts it onto the battlefield (Field of Ruin). The lowerings are in `lower/elven-council.ts`.
 */
import { fail, literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrDestinationList, IrFlag, IrNoun, IrZoneSpec } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';
import { type Clauses, single } from './operands';

const SHUFFLE_ID = 'effect.target-player-shuffles-graveyard';

/**
 * `effect.target-player-shuffles-graveyard`: "Target player shuffles their graveyard into their library." (CR 115.1, 701.24, 404.1, 108.3): the player is a target, every card
 * in their graveyard goes into their library and they shuffle it. The engine's `moveToZone` of each card of that player's graveyard to the library, then `shuffle`. Not read:
 * a player that is not a target ("you", "each player"), a graveyard or a library that is not theirs, only some of the cards, a rider after the sentence.
 */
export const EFFECT_TARGET_PLAYER_SHUFFLES_GRAVEYARD = defineRule<Clauses>({
  id: SHUFFLE_ID,
  family: 'effect',
  leading: ['target'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 701.24 (Shuffle)',
    'CR 404.1 (Graveyard)',
    'CR 108.3 (Owner and Controller)',
  ],
  examples: [
    'target player shuffles their graveyard into their library',
    'Target player shuffles their graveyard into their library',
  ],
  rejects: [
    'target player shuffles your graveyard into their library',
    'target player shuffles their graveyard into your library',
    'target player shuffles their graveyard',
    'target player shuffles their library',
    'target player shuffle their graveyard into their library',
    'target players shuffle their graveyards into their libraries',
    'target player shuffles their hand and graveyard into their library',
    'target player shuffles up to three target cards from their graveyard into their library',
    'target player shuffles their graveyard into their library and draws a card',
    'each player shuffles their graveyard into their library',
    'you shuffle your graveyard into your library',
  ],
  parse: single(
    SHUFFLE_ID,
    sequence(
      satisfy(
        family<IrNoun>('noun', { only: ['noun.player'] }),
        (noun) => noun.det === 'target' && noun.filter.player === 'any' && !noun.plural,
      ),
      literal(' '),
      pattern(/shuffles their graveyard into their library(?=\.|$)/iu),
    ),
    ([player]) => ({ verb: 'shuffleGraveyardOf', args: { player } }),
  ),
});

const SEARCH_ID = 'effect.search-each-player';

/**
 * `effect.search-each-player`: "Each player searches their library for a basic land card, puts it onto the battlefield, then shuffles." (CR 701.23, 701.24, 110.2a, 101.4): every
 * player the subject names searches their own library, in turn order (the active player first), puts the card found onto the battlefield under their control and shuffles; a
 * player may find nothing (CR 701.23b, 701.23d). The engine's `search` of that player selector, which is not a "may". Not read: a "may", a number of cards, a reveal, another
 * place than the battlefield, the singular "searches" said of "you", "you search your library".
 */
export const EFFECT_SEARCH_EACH_PLAYER = defineRule<Clauses>({
  id: SEARCH_ID,
  family: 'effect',
  leading: ['each', 'target'],
  cites: [
    'CR 701.23 (Search)',
    'CR 701.23b (Search)',
    'CR 701.24 (Shuffle)',
    'CR 110.2a (Permanents)',
    'CR 101.4 (Handling Simultaneous Decisions)',
  ],
  examples: [
    'each player searches their library for a basic land card, puts it onto the battlefield, then shuffles',
    'each player searches their library for a basic land card, puts it onto the battlefield tapped, then shuffles',
    'each opponent searches their library for a basic land card, puts it onto the battlefield, then shuffles',
    'each player searches their library for a Forest card, puts that card onto the battlefield, then shuffles',
  ],
  rejects: [
    'each player may search their library for a basic land card, puts it onto the battlefield, then shuffles',
    'each player searches their library for a basic land card, puts it onto the battlefield',
    'each player searches their library for a basic land card, puts it onto the battlefield, then shuffle',
    'each player search their library for a basic land card, puts it onto the battlefield, then shuffles',
    'each player searches their library for a basic land card, reveals it, puts it onto the battlefield, then shuffles',
    'each player searches their library for a basic land card, puts it into their hand, then shuffles',
    'each player searches their library for a basic land card, puts them onto the battlefield, then shuffles',
    'each player searches your library for a basic land card, puts it onto the battlefield, then shuffles',
    'each player searches their library for up to two basic land cards, puts them onto the battlefield, then shuffles',
    'target player searches their library for a basic land card, puts it onto the battlefield, then shuffles',
    'you search your library for a basic land card, put it onto the battlefield, then shuffle',
    'each player searches their library for a basic land card, puts it onto the battlefield, then shuffles and draws a card',
  ],
  parse: single(
    SEARCH_ID,
    (ctx, pos) => {
      const head = sequence(
        satisfy(
          family<IrNoun>('noun', { only: ['noun.player'] }),
          (noun) =>
            (noun.det === 'eachPlayer' || noun.det === 'eachOpponent') &&
            !noun.plural &&
            noun.filter.player === undefined,
        ),
        literal(' searches their library for '),
        satisfy(family<IrNoun>('noun', { only: ['noun.library-card'] }), (noun) => !noun.plural),
      )(ctx, pos);
      if (!head.ok) return head;
      const [player, , cards] = head.value;
      const put = pattern(
        /, puts (?:it|that card) onto the battlefield( tapped)?, then shuffles(?![\p{L}\p{N}])/iu,
      )(ctx, head.pos);
      if (!put.ok) return fail(ctx, pos);
      const span = { start: head.pos, end: put.pos };
      const place: IrZoneSpec = {
        kind: 'zoneSpec',
        zone: 'battlefield',
        ...(put.value[1] === undefined ? {} : { tapped: true }),
        count: 1,
        span,
        rule: SEARCH_ID,
      };
      const destinations: IrDestinationList = {
        kind: 'destinations',
        items: [place],
        span,
        rule: SEARCH_ID,
      };
      const flag = (value: boolean): IrFlag => ({ kind: 'flag', value, span, rule: SEARCH_ID });
      return {
        ok: true,
        value: {
          player,
          cards,
          destinations,
          reveal: flag(false),
          shuffle: flag(true),
          may: flag(false),
        },
        pos: put.pos,
      };
    },
    (read) => ({ verb: 'search', args: read }),
  ),
});

export const ELVEN_COUNCIL_EFFECT_RULES = [
  EFFECT_TARGET_PLAYER_SHUFFLES_GRAVEYARD,
  EFFECT_SEARCH_EACH_PLAYER,
].map(quietly);
