/**
 * Lowerings of group 9 of the Hashaton deck (issue 31, D-393 and D-394 provisional): the three instructions of the body of Rona, Tolarian Obliterator that no other file lowers.
 */
import type { IrClause, IrNoun } from '../ir/types';
import { arg, type Effects, failure, operand } from './clauses';
import { graveyardCardTarget } from './danitha-g1b';
import { missingFeatures } from './features';
import { playerSelectorOf } from './nouns';
import type { Lowering } from './types';

/** Whether the operand is "it" of the card the instruction before exiled (the binding pass named it `moved`), and nothing else. */
function isMovedCard(noun: IrNoun | undefined): boolean {
  return noun?.det === 'anaphor' && noun.ref === 'moved';
}

/**
 * "That source's controller exiles a card from their hand at random" (CR 701.13, 406.3): the engine's `exileRandomFromHand` of the player the noun names, which the lowering
 * of a trigger about a source says is the trigger player. The engine names one player, so a selector of several (`validateCard`) is a card it refuses.
 */
const EXILE_RANDOM_FROM_HAND: Lowering<IrClause, Effects> = {
  head: 'exileRandomFromHand',
  id: 'lower.exile-random-from-hand',
  needs: ['effect:exileRandomFromHand'],
  lower(clause, ctx) {
    const who = operand(clause, 'player');
    if (who === undefined || who.kind !== 'noun') return failure(clause);
    const player = playerSelectorOf(who, ctx);
    if (!player.ok) return player;
    return {
      ok: true,
      value: [{ kind: 'exileRandomFromHand', player: player.value }],
      rule: clause.rule,
    };
  },
};

/**
 * "Put it onto the battlefield under your control", with or without "you may" (CR 400.7, 110.2a, 608.2d): the engine's `moveToZone` of the card the instruction before exiled
 * (`moved`) to the battlefield under the control of the player who puts it. With "you may" it is the engine's `may` of that move, asked as it comes up (`acceptsOptional`). "It" is
 * only that card, or (D-1213, Danitha group 1b, Cosmic Rebirth) a target card of a graveyard that an earlier sentence chose ("Choose target permanent card in your graveyard"): after any
 * other instruction it names a permanent or nothing, and the clause is not lowered.
 */
const PUT_MOVED_ONTO_BATTLEFIELD: Lowering<IrClause, Effects> = {
  head: 'putMovedOntoBattlefield',
  id: 'lower.put-moved-onto-battlefield',
  needs: ['effect:moveToZone', 'selector:moved', 'selector:target'],
  acceptsOptional: true,
  lower(clause, ctx) {
    const what = operand(clause, 'objects');
    if (what?.kind !== 'noun') return failure(clause);
    const target = graveyardCardTarget(what, ctx, false);
    if (!isMovedCard(what) && target === null) return failure(clause);
    const move: Effects[number] = {
      kind: 'moveToZone',
      objects: target === null ? { kind: 'moved' } : { kind: 'target', id: target },
      to: 'battlefield',
      controller: 'you',
    };
    if (!clause.optional) return { ok: true, value: [move], rule: clause.rule };
    const blocked = missingFeatures(['effect:may']);
    if (blocked.length > 0) return failure(clause, blocked);
    return { ok: true, value: [{ kind: 'may', effect: move }], rule: clause.rule };
  },
};

/**
 * "You may cast it without paying its mana cost" (CR 608.2g, 118.9): the engine's `castFree` of the card the instruction before exiled (`moved`): the controller chooses whether
 * to cast it, as its own question (so the sentence's "you may" is that question and not a `may` of its own: `acceptsOptional`), and no mana cost is paid. A cast with no "you may"
 * would be mandatory, which the engine does not run, so it is not lowered; neither is another "it".
 */
const CAST_MOVED_FREE: Lowering<IrClause, Effects> = {
  head: 'castMovedFree',
  id: 'lower.cast-moved-free',
  needs: ['effect:castFree', 'selector:moved'],
  acceptsOptional: true,
  lower(clause) {
    const what = operand(clause, 'objects');
    if (what?.kind !== 'noun' || !isMovedCard(what) || !clause.optional) return failure(clause);
    if (arg(clause, 'play') !== undefined) return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'castFree', objects: { kind: 'moved' } }],
      rule: clause.rule,
    };
  },
};

export const HASHATON_G9_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EXILE_RANDOM_FROM_HAND,
  PUT_MOVED_ONTO_BATTLEFIELD,
  CAST_MOVED_FREE,
];
