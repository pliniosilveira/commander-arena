/**
 * Lowering of the Revival Trance deck (issue 97), group D: "that player chooses up to two creatures they control, then sacrifices the rest" (Archfiend of Depravity, CR 608.2d,
 * 701.21a): the engine's `keepOrSacrifice` with `keepAtMost` of the player the subject names.
 */
import type { IrClause } from '../ir/types';
import { type Effects, failure, operand } from './clauses';
import { playerSelectorOf } from './nouns';
import type { Lowering } from './types';

const KEEP_UP_TO_AND_SACRIFICE: Lowering<IrClause, Effects> = {
  head: 'keepUpToAndSacrifice',
  id: 'lower.keep-up-to-and-sacrifice',
  needs: ['effect:keepOrSacrifice'],
  lower(clause, ctx) {
    const who = operand(clause, 'player');
    const limit = clause.args.limit;
    if (who === undefined || who.kind !== 'noun' || limit?.kind !== 'number') {
      return failure(clause);
    }
    const players = playerSelectorOf(who, ctx);
    if (!players.ok) return players;
    return {
      ok: true,
      value: [
        {
          kind: 'keepOrSacrifice',
          players: players.value,
          filter: { types: ['creature'] },
          keepAtMost: limit.value,
        },
      ],
      rule: clause.rule,
    };
  },
};

const KEPT_TYPES = ['land', 'creature', 'artifact', 'enchantment'] as const;

/** "Each player chooses six lands they control, then sacrifices the rest." (Planetary Annihilation, CR 608.2d, 701.21a, 101.4): `keepOrSacrifice` of each player with `keepExactly`. */
const KEEP_EXACTLY_AND_SACRIFICE: Lowering<IrClause, Effects> = {
  head: 'keepExactlyAndSacrifice',
  id: 'lower.keep-exactly-and-sacrifice',
  needs: ['effect:keepOrSacrifice'],
  lower(clause) {
    const limit = clause.args.limit;
    const what = clause.args.what;
    if (limit?.kind !== 'number' || what?.kind !== 'name') return failure(clause);
    const type = KEPT_TYPES.find((t) => t === what.name);
    if (type === undefined) return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'keepOrSacrifice',
          players: { kind: 'eachPlayer' },
          filter: { types: [type] },
          keepExactly: limit.value,
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "You and defending player each discard a card or sacrifice a permanent." (Eumidian Wastewaker, CR 701.9, 701.21a, 101.4): the engine's `playersMay` of the players the subject names, in
 * APNAP order: accepting discards a card (as the player asked), declining sacrifices a permanent of that player's choice.
 */
const DISCARD_OR_SACRIFICE: Lowering<IrClause, Effects> = {
  head: 'eachDiscardOrSacrifice',
  id: 'lower.each-discard-or-sacrifice',
  needs: ['effect:playersMay', 'effect:sacrifice', 'effect:discard'],
  lower(clause, ctx) {
    const who = operand(clause, 'player');
    if (who === undefined || who.kind !== 'noun') return failure(clause);
    const players = playerSelectorOf(who, ctx);
    if (!players.ok) return players;
    return {
      ok: true,
      value: [
        {
          kind: 'playersMay',
          players: players.value,
          runsAs: 'chooser',
          effect: { kind: 'discard', player: { kind: 'you' }, count: 1 },
          otherwise: {
            kind: 'sacrifice',
            objects: { kind: 'choose', filter: {}, count: 1 },
            player: { kind: 'declinedPlayer' },
          },
        },
      ],
      rule: clause.rule,
    };
  },
};

export const KEEPS_UP_TO_LOWERINGS = [
  KEEP_UP_TO_AND_SACRIFICE,
  KEEP_EXACTLY_AND_SACRIFICE,
  DISCARD_OR_SACRIFICE,
];
