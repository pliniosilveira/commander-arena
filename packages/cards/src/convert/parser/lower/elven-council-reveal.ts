/**
 * Lowerings of the Elven Council deck, group "reveal": Genesis Wave (reveal the top X cards, put any number of permanent cards with mana value X or less onto the battlefield, the rest
 * into the graveyard) and Gandalf, Westward Voyager (each opponent reveals the top card of their library, and the cards decide between a copy of the spell and a card for you). Same
 * contract as effects.ts: each declares the engine features it needs and is checked before it runs.
 */
import { type Effect, PERMANENT_TYPES } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { amountArg, type Effects } from './clauses';
import type { FeatureRef } from './features';
import type { Lowering } from './types';

/**
 * "Reveal the top X cards of your library. You may put any number of permanent cards with mana value X or less from among them onto the battlefield. Then put all cards revealed this
 * way that weren't put onto the battlefield into your graveyard." (CR 701.20a, 202.3, 107.3a): the engine's `lookAtTop` of a reveal (`revealAll`) whose take is any number (`take.any`)
 * of the permanent cards with mana value at most the same X, onto the battlefield, the rest into the graveyard.
 */
const REVEAL_TOP_ANY_PERMANENTS: Lowering<IrClause, Effects> = {
  head: 'revealTopAnyPermanents',
  id: 'lower.reveal-top-any-permanents',
  needs: ['effect:lookAtTop', 'ability:lookTakeAny', 'amount:x'],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    const effect: Effect = {
      kind: 'lookAtTop',
      count: count.value,
      revealAll: true,
      take: {
        filter: { anyOf: PERMANENT_TYPES.map((type) => ({ types: [type] })) },
        max: 1,
        to: 'battlefield',
        any: true,
        manaValueAtMost: { kind: 'x' },
      },
      rest: 'graveyard',
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/**
 * "Each opponent reveals the top card of their library. If any of those cards shares a card type with that spell, copy that spell, you may choose new targets for the copy, and each
 * opponent draws a card. Otherwise, you draw a card." (CR 701.20a, 608.2c, 205.2a, 707.10c): `revealTopCard` of each opponent (the cards are what `moved` names), then a `conditional`
 * on any of them sharing a card type with the spell the trigger is about. The spell is `triggerSubject`: the engine's validation refuses the effect anywhere but in a trigger about a
 * cast spell.
 */
const OPPONENTS_REVEAL_SHARE_TYPE: Lowering<IrClause, Effects> = {
  head: 'opponentsRevealShareType',
  id: 'lower.opponents-reveal-share-type',
  needs: [
    'effect:revealTopCard',
    'effect:conditional',
    'condition:objectMatches',
    'ability:movedSharesTypeWithSpell',
    'effect:copySpell',
    'effect:draw',
    'selector:triggerSubject',
    'selector:moved',
  ],
  lower(clause) {
    const reveal: Effect = { kind: 'revealTopCard', player: { kind: 'eachOpponent' } };
    const branch: Effect = {
      kind: 'conditional',
      condition: {
        kind: 'objectMatches',
        of: { kind: 'moved' },
        filter: { sharesCardTypeWith: 'triggerSubject' },
        any: true,
      },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'may' },
          { kind: 'draw', player: { kind: 'eachOpponent' }, count: 1 },
        ],
      },
      else: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    };
    return { ok: true, value: [reveal, branch], rule: clause.rule };
  },
};

export const ELVEN_COUNCIL_REVEAL_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  REVEAL_TOP_ANY_PERMANENTS,
  OPPONENTS_REVEAL_SHARE_TYPE,
];

/** Features the lowerings of this file can name, for the dimension test. */
export const ELVEN_COUNCIL_REVEAL_NEEDS: readonly FeatureRef[] = [
  'effect:lookAtTop',
  'ability:lookTakeAny',
  'amount:x',
  'effect:revealTopCard',
  'effect:conditional',
  'condition:objectMatches',
  'ability:movedSharesTypeWithSpell',
  'effect:copySpell',
  'effect:draw',
  'selector:triggerSubject',
  'selector:moved',
];
