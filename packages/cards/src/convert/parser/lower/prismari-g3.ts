/**
 * Lowerings of group 3 of the Prismari deck (issue 87, D-646 and later): the instructions that exile cards (two piles, as many times as the player chooses, each player until a nonland
 * card, a card revealed until a nonland card) and the ones that follow them (the opponent's choice, the spells cast without paying their mana costs, the rest put into the hand, the
 * delayed copy of the exiled card). Each refers to "them", "those cards" or "the other cards" of the instruction before it, which the engine names `moved`; `ctx.lastEffectKind` says
 * which instruction that was, so a sentence is read only after the instruction that makes it true.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { amountArg, arg, type Effects, failure } from './clauses';
import type { Lowering } from './types';

const NOT_LAND = { notTypes: ['land' as const] };

/** The instructions whose cards "them" and "those cards" are: each leaves `moved` the cards it exiled. */
const EXILES_CARDS: readonly string[] = [
  'exilePiles',
  'exileTopAnyNumber',
  'exileTop',
  'exileUntilFound',
];

/** "Exile the top four cards of your library in a face-down pile, then ... in a face-up pile. An opponent chooses one of those piles. ..." */
const EXILE_PILES: Lowering<IrClause, Effects> = {
  head: 'exilePiles',
  id: 'lower.exile-piles',
  needs: ['effect:exilePiles'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    if (typeof count.value !== 'number' || count.value < 2) return failure(clause);
    const effect: Effect = { kind: 'exilePiles', count: count.value, chosenTo: 'graveyard' };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/** "You may cast a spell / up to two spells / any number of spells from among them / the other cards exiled this way / those cards without paying ...". */
const CAST_FROM_AMONG: Lowering<IrClause, Effects> = {
  head: 'castFromAmong',
  id: 'lower.cast-from-among',
  needs: ['effect:castFree', 'selector:moved'],
  acceptsOptional: true,
  lower(clause, ctx) {
    const other = arg(clause, 'other');
    const may = arg(clause, 'may');
    if (other?.kind !== 'flag' || may?.kind !== 'flag') return failure(clause);
    // The engine asks the controller which spells to cast and lets them stop, which is a "may": a cast with no "you may" would be a duty, and is not lowered.
    if (!may.value && !clause.optional) return failure(clause);
    // "The other cards exiled this way" are the cards the opponent did not choose; "them" and "those cards" are the cards an instruction exiled.
    const before = ctx.lastEffectKind;
    if (
      other.value
        ? before !== 'opponentChoosesCard'
        : before === null || !EXILES_CARDS.includes(before)
    ) {
      return failure(clause);
    }
    const any = arg(clause, 'any');
    let max: number | 'any' | undefined;
    if (any?.kind === 'flag' && any.value) {
      max = 'any';
    } else if (arg(clause, 'max') !== undefined) {
      const counted = amountArg(clause, 'max', ctx);
      // The engine casts one spell, up to a number of two or more, or any number of them.
      if (!counted.ok || typeof counted.value !== 'number' || counted.value < 2) {
        return failure(clause);
      }
      max = counted.value;
    }
    const effect: Effect = {
      kind: 'castFree',
      objects: { kind: 'moved' },
      ...(max === undefined ? {} : { max }),
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/** "Put the rest into your hand": the cards of the instructions before it that were not cast, still in exile. */
const PUT_REST_INTO_HAND: Lowering<IrClause, Effects> = {
  head: 'putRestIntoHand',
  id: 'lower.put-rest-into-hand',
  needs: ['effect:moveToZone', 'selector:moved'],
  lower(clause, ctx) {
    // "The rest" are the cards left after spells were cast from among them.
    if (ctx.lastEffectKind !== 'castFree') return failure(clause);
    const effect: Effect = { kind: 'moveToZone', objects: { kind: 'moved' }, to: 'hand' };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/** "Shuffle your library, then reveal cards from the top of it until you reveal a nonland card. Exile that card and put the rest on the bottom of your library in a random order." */
const SHUFFLE_REVEAL_UNTIL_EXILE: Lowering<IrClause, Effects> = {
  head: 'shuffleRevealUntilExile',
  id: 'lower.shuffle-reveal-until-exile',
  needs: ['effect:shuffle', 'effect:revealUntil'],
  lower(clause) {
    const effects: Effect[] = [
      { kind: 'shuffle', player: { kind: 'you' } },
      { kind: 'revealUntil', filter: NOT_LAND, put: 'exile' },
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

/** "As many times as you choose, you may exile the top card of your library." */
const EXILE_TOP_ANY_NUMBER: Lowering<IrClause, Effects> = {
  head: 'exileTopAnyNumber',
  id: 'lower.exile-top-any-number',
  needs: ['effect:exileTopAnyNumber'],
  lower(clause) {
    return { ok: true, value: [{ kind: 'exileTopAnyNumber' }], rule: clause.rule };
  },
};

/** "Each player exiles cards from the top of their library until they exile a nonland card." */
const EXILE_UNTIL_NONLAND: Lowering<IrClause, Effects> = {
  head: 'exileUntilNonland',
  id: 'lower.exile-until-nonland',
  needs: ['effect:exileUntilFound'],
  lower(clause) {
    const effect: Effect = {
      kind: 'exileUntilFound',
      players: { kind: 'eachPlayer' },
      filter: NOT_LAND,
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/** "An opponent chooses a nonland card exiled this way": only after the cards were exiled. */
const OPPONENT_CHOOSES_NONLAND: Lowering<IrClause, Effects> = {
  head: 'opponentChoosesNonland',
  id: 'lower.opponent-chooses-nonland',
  needs: ['effect:opponentChoosesCard', 'selector:moved'],
  lower(clause, ctx) {
    if (ctx.lastEffectKind !== 'exileUntilFound') return failure(clause);
    const effect: Effect = {
      kind: 'opponentChoosesCard',
      objects: { kind: 'moved' },
      filter: NOT_LAND,
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/** "Whenever a creature you control deals combat damage to a player this turn, copy the exiled card. You may cast the copy without paying its mana cost." */
const DELAYED_COMBAT_DAMAGE_COPY_EXILED: Lowering<IrClause, Effects> = {
  head: 'delayedCombatDamageCopyExiled',
  id: 'lower.delayed-combat-damage-copy-exiled',
  needs: ['effect:delayedCombatDamageTurn', 'effect:copyCardAndCast', 'selector:moved'],
  lower(clause, ctx) {
    // "The exiled card" is the card an earlier sentence of the text exiled (an exile of a target the text chose, read as it is in exile).
    if (ctx.exiledRef === null) return failure(clause);
    const effect: Effect = {
      kind: 'delayedCombatDamageTurn',
      filter: { types: ['creature'], controller: 'you' },
      effect: { kind: 'copyCardAndCast', objects: { kind: 'moved' } },
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

export const PRISMARI_G3_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EXILE_PILES,
  CAST_FROM_AMONG,
  PUT_REST_INTO_HAND,
  SHUFFLE_REVEAL_UNTIL_EXILE,
  EXILE_TOP_ANY_NUMBER,
  EXILE_UNTIL_NONLAND,
  OPPONENT_CHOOSES_NONLAND,
  DELAYED_COMBAT_DAMAGE_COPY_EXILED,
];
