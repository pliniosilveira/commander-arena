/**
 * Noun rules of group F of the Federation Fleet deck: "any number of target players' graveyards" (Stonespeaker Crystal: "Exile any number of target players' graveyards. Draw a card.").
 */
import { pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule } from '../registry';
import { BOUNDARY } from './phrases';

const ID = 'noun.any-number-target-players-graveyards';

/**
 * `noun.any-number-target-players-graveyards`: "any number of target players' graveyards" (CR 115.1, 601.2c, 404.1, 108.3): a slot of any number of target players (none at least,
 * as many as there are players at most), and the cards each of them owns in their graveyard (a graveyard is its owner's discard pile, a card in it belongs to its owner). The same
 * shape as `noun.player-graveyard` ("target player's graveyard"): every card in the graveyards, selected by their owner, the players a target the noun carries as `of`. Not read:
 * "target players' graveyards" (a fixed number of players), "any number of target players' graveyard", "any number of target player's graveyards", "any number of target opponents'
 * graveyards", "any number of players' graveyards", "any number of target players' libraries".
 */
export const NOUN_ANY_NUMBER_TARGET_PLAYERS_GRAVEYARDS = defineRule<IrNoun>({
  id: ID,
  family: 'noun',
  leading: ['any'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 601.2c (Casting Spells)',
    'CR 404.1 (Graveyard)',
    'CR 108.3 (Cards)',
  ],
  examples: [
    "any number of target players' graveyards",
    'any number of target players’ graveyards',
  ],
  rejects: [
    "target players' graveyards",
    "any number of target players' graveyard",
    "any number of target player's graveyards",
    "any number of target opponents' graveyards",
    "any number of players' graveyards",
    "any number of target players' libraries",
    "any number of target players' graveyards and hands",
    'any number of target players',
    "any number of target cards from target players' graveyards",
  ],
  parse: (ctx, pos) => {
    const r = pattern(new RegExp(`any number of target players['’] graveyards${BOUNDARY}`, 'iu'))(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    const raw = ctx.text.slice(pos, r.pos);
    const start = pos + 'any number of '.length;
    const end = start + 'target players'.length;
    // The players are one slot of any number of targets (the engine's `anyNumber`), which the graveyards below are the cards of.
    const of: IrNoun = {
      kind: 'noun',
      det: 'target',
      filter: { player: 'any', raw: 'target players' },
      upTo: false,
      plural: true,
      other: false,
      anyNumber: true,
      span: { start, end },
      rule: ID,
    };
    return {
      ok: true,
      value: {
        kind: 'noun',
        det: 'each',
        filter: { zone: 'graveyard', card: true, raw },
        upTo: false,
        plural: true,
        other: false,
        of,
        span: { start: pos, end: r.pos },
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

export const FEDERATION_F_NOUN_RULES = [NOUN_ANY_NUMBER_TARGET_PLAYERS_GRAVEYARDS];
