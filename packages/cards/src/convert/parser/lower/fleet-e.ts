/**
 * Lowerings of the Federation Fleet deck, group E (Spacecraft and chapters): "The owner of up to one target creature draws two cards, then shuffles that creature into their library"
 * and "Exile that token at end of combat". Same contract as effects.ts: each declares the engine features it needs and is checked before it runs.
 */
import type { IrClause } from '../ir/types';
import { amountArg, arg, type Effects, failure } from './clauses';
import { objectSelectorOf } from './nouns';
import type { LowerContext, Lowering } from './types';

const MOVED = { kind: 'moved' } as const;

/**
 * "The owner of up to one target creature draws two cards, then shuffles that creature into their library." (CR 108.3, 121.1, 701.24, 608.2c): the engine's `draw` of the owner of the
 * target, the `moveToZone` of the target to the library, then the `shuffle` of the owner's library. The owner is read from last-known information once the creature has left (as for
 * the shuffle of the Hylda rule). With no target chosen ("up to one") the owner is nobody and nothing happens. A commander goes to the command zone at its owner's choice
 * (CR 903.9a), which the engine asks as it moves the card. One target only.
 */
const OWNER_DRAWS_THEN_SHUFFLES: Lowering<IrClause, Effects> = {
  head: 'ownerDrawsThenShuffles',
  id: 'lower.owner-draws-then-shuffles',
  needs: ['effect:draw', 'effect:moveToZone', 'effect:shuffle', 'selector:ownerOf'],
  lower(clause, ctx) {
    const named = arg(clause, 'objects');
    if (named?.kind !== 'noun' || named.det !== 'target') return failure(clause);
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    const objects = objectSelectorOf(named, ctx);
    if (!objects.ok) return objects;
    if (objects.value.kind !== 'target') return failure(clause);
    const owner = { kind: 'ownerOf', of: objects.value } as const;
    return {
      ok: true,
      value: [
        { kind: 'draw', player: owner, count: count.value },
        { kind: 'moveToZone', objects: objects.value, to: 'library' },
        { kind: 'shuffle', player: owner },
      ],
      rule: clause.rule,
    };
  },
};

/** The clause is about the tokens the instruction before made. */
const aboutMadeTokens = (ctx: LowerContext): boolean => ctx.tokensMade;

/**
 * "Exile that token at end of combat." (CR 603.7, 603.7c, 511.1): one delayed ability at the end of combat step, of the whole turn (`each`), that exiles the token the instruction before
 * made (`moved`). Read only as the token the instruction before made (`ctx.tokensMade`), never another object.
 */
const EXILE_AT_END_OF_COMBAT_MADE: Lowering<IrClause, Effects> = {
  head: 'exileAtEndOfCombatMade',
  id: 'lower.exile-at-end-of-combat-made',
  needs: ['effect:delayedTrigger', 'effect:exile', 'selector:moved'],
  lower(clause, ctx) {
    if (!aboutMadeTokens(ctx)) return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'delayedTrigger',
          at: { step: 'combatEnd', whose: 'each' },
          effect: { kind: 'exile', objects: MOVED },
        },
      ],
      rule: clause.rule,
    };
  },
};

export const FLEET_E_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  OWNER_DRAWS_THEN_SHUFFLES,
  EXILE_AT_END_OF_COMBAT_MADE,
];
