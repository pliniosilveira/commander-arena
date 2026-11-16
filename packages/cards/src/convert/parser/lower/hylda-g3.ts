/**
 * Lowerings of the Hylda deck, group 3 (issue 42): shuffling permanents into their owners' libraries.
 */
import type { Effect, PlayerSelector } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure, operand } from './clauses';
import { itemsOf, objectSelectorOf, playerSelectorOf } from './nouns';
import type { Lowering } from './types';

/**
 * "Shuffle ~ and target creature with a stun counter on it into their owners' libraries" (CR 701.24c, 400.3, 108.3): a `moveToZone` to the library for each object named
 * (the permanent with the ability, a target), then the `shuffle` of every player whose library received one: the owner of each, named together once (`all` names a player
 * once). The owner is read from last-known information once the object has left, as for the shuffle of the Niv-Mizzet rule. The objects are the permanent itself and
 * single targets; "each" and a slot of several targets are not read. A commander goes to the command zone instead at its owner's choice (CR 903.9a), which the engine asks
 * as it moves the cards.
 */
const SHUFFLE_INTO_LIBRARIES: Lowering<IrClause, Effects> = {
  head: 'shuffleIntoLibraries',
  id: 'lower.shuffle-into-libraries',
  needs: ['effect:moveToZone', 'effect:shuffle', 'selector:all', 'selector:ownerOf'],
  lower(clause, ctx) {
    const named = operand(clause, 'objects');
    if (named === undefined) return failure(clause);
    const moves: Effect[] = [];
    const owners: PlayerSelector[] = [];
    for (const item of itemsOf(named)) {
      // One object each: the permanent with the ability (which must still be there to be moved) or a single target of the ability.
      const single =
        item.det === 'self'
          ? ctx.owner === 'ability' && !ctx.selfGone
          : item.det === 'target' &&
            item.filter.player === undefined &&
            item.filter.anyTarget !== true &&
            !item.plural &&
            !item.upTo &&
            item.anyNumber !== true &&
            item.count === undefined;
      if (!single) return failure(clause);
      const selector = objectSelectorOf(item, ctx);
      if (!selector.ok) return selector;
      if (selector.value.kind !== 'this' && selector.value.kind !== 'target') {
        return failure(clause);
      }
      moves.push({ kind: 'moveToZone', objects: selector.value, to: 'library' });
      owners.push({ kind: 'ownerOf', of: selector.value });
    }
    if (moves.length === 0) return failure(clause);
    return {
      ok: true,
      value: [
        ...moves,
        // A player named twice acts once, and one owner needs no list.
        {
          kind: 'shuffle',
          player: owners.length === 1 && owners[0] !== undefined ? owners[0] : { kind: 'all', of: owners },
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "You may tap or untap target creature." (CR 701.26a, 701.26b, 608.2d): the engine's `chooseOne` between the `tap` and the `untap` of the permanent, asked as the effect
 * resolves; with "you may" the choice is `optional` (one more answer, "Do nothing"). The permanent with the ability must be there to be tapped, as for `tap ~`.
 */
const TAP_OR_UNTAP: Lowering<IrClause, Effects> = {
  head: 'tapOrUntap',
  id: 'lower.tap-or-untap',
  needs: ['effect:chooseOne', 'effect:tap', 'effect:untap'],
  lower(clause, ctx) {
    const named = operand(clause, 'objects');
    const flag = arg(clause, 'optional');
    if (named?.kind !== 'noun' || flag?.kind !== 'flag') return failure(clause);
    if (named.det === 'self' && (ctx.owner === 'spell' || ctx.selfGone)) return failure(clause);
    const objects = objectSelectorOf(named, ctx);
    if (!objects.ok) return objects;
    if (objects.value.kind !== 'this' && objects.value.kind !== 'target') return failure(clause);
    const choice: Effect = {
      kind: 'chooseOne',
      options: [
        { label: 'Tap it', effect: { kind: 'tap', objects: objects.value } },
        { label: 'Untap it', effect: { kind: 'untap', objects: objects.value } },
      ],
      ...(flag.value ? { optional: true as const } : {}),
    };
    return { ok: true, value: [choice], rule: clause.rule };
  },
};

/**
 * "You gain hexproof until end of turn" (CR 702.11b, 514.2): the engine's `grantPlayerHexproof` of the player the clause names, for the turn only (the engine runs no other
 * duration for a player).
 */
const GRANT_PLAYER_HEXPROOF: Lowering<IrClause, Effects> = {
  head: 'grantPlayerHexproof',
  id: 'lower.grant-player-hexproof',
  needs: ['effect:grantPlayerHexproof', 'duration:untilEndOfTurn'],
  takesDuration: true,
  lower(clause, ctx) {
    const who = operandPlayer(clause);
    if (who === undefined || clause.duration?.scope !== 'untilEndOfTurn') return failure(clause);
    const player = playerSelectorOf(who, ctx);
    if (!player.ok) return player;
    return {
      ok: true,
      value: [{ kind: 'grantPlayerHexproof', player: player.value, duration: 'untilEndOfTurn' }],
      rule: clause.rule,
    };
  },
};

function operandPlayer(clause: IrClause) {
  const named = arg(clause, 'player');
  return named?.kind === 'noun' ? named : undefined;
}

export const HYLDA_G3_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  SHUFFLE_INTO_LIBRARIES,
  TAP_OR_UNTAP,
  GRANT_PLAYER_HEXPROOF,
];
