/**
 * Lowerings of group 3 of the Ahoy Mateys deck (put onto the battlefield tapped and attacking): the delayed exile of the token an instruction just made at the end of combat, the
 * look at the defending player's hand with the creature put from it, and the delayed return of that creature. Each sentence is read only where it is about the objects the instruction
 * before it made or put onto the battlefield (`ctx.tokensMade`, `ctx.movedOnto`: the engine's `moved`) and, for the attack, only where the source is the attacker
 * (`ctx.selfAttackTrigger`); after anything else it is not lowered (never guessed).
 */
import type { IrClause } from '../ir/types';
import { type Effects, failure } from './clauses';
import { missingFeatures } from './features';
import type { Lowering } from './types';

const MOVED = { kind: 'moved' } as const;

/** "Exile that token at end of combat": a delayed exile of the tokens made, at the end of combat step. */
const EXILE_AT_END_OF_COMBAT: Lowering<IrClause, Effects> = {
  head: 'exileAtEndOfCombatMade',
  id: 'lower.exile-at-end-of-combat-made',
  needs: ['effect:delayedTrigger', 'effect:exile', 'selector:moved'],
  lower(clause, ctx) {
    if (!ctx.tokensMade) return failure(clause);
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

/** "Look at defending player's hand. You may put a creature card from it onto the battlefield under your control tapped and attacking that player ...". */
const LOOK_HAND_PUT_ATTACKING: Lowering<IrClause, Effects> = {
  head: 'lookHandPutAttacking',
  id: 'lower.look-hand-put-attacking',
  needs: [
    'effect:moveToZone',
    'selector:choose',
    'selector:defendingPlayer',
    'ability:chooseFromDefendersHand',
    'effect:enterAttacking',
  ],
  lower(clause, ctx) {
    // CR 508.4: the creature attacks the player the source attacks; only where the source is the attacker, as for a token that enters attacking.
    if (!ctx.selfAttackTrigger) return failure(clause);
    const blocked = missingFeatures(['effect:enterAttacking']);
    if (blocked.length > 0) return failure(clause, blocked);
    return {
      ok: true,
      value: [
        {
          kind: 'moveToZone',
          objects: {
            kind: 'choose',
            filter: { zone: 'hand', types: ['creature'], controller: 'you', card: true },
            optional: true,
            fromHandOf: { kind: 'defendingPlayer' },
          },
          to: 'battlefield',
          tapped: true,
          controller: 'you',
        },
        { kind: 'enterAttacking', objects: MOVED },
      ],
      rule: clause.rule,
    };
  },
};

/** "Return that creature to its owner's hand at the beginning of the next end step": the delayed move of the creature the instruction before put onto the battlefield. */
const RETURN_AT_END_STEP: Lowering<IrClause, Effects> = {
  head: 'returnThatCreatureAtEndStep',
  id: 'lower.return-that-creature-at-end-step',
  needs: [
    'effect:delayedTrigger',
    'effect:moveToZone',
    'selector:moved',
    'ability:delayedReturnToHand',
  ],
  lower(clause, ctx) {
    if (ctx.movedOnto === null) return failure(clause);
    return {
      ok: true,
      value: [
        {
          kind: 'delayedTrigger',
          at: { step: 'endStep', whose: 'each' },
          effect: { kind: 'moveToZone', objects: MOVED, to: 'hand' },
        },
      ],
      rule: clause.rule,
    };
  },
};

export const AHOY_G3_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EXILE_AT_END_OF_COMBAT,
  LOOK_HAND_PUT_ATTACKING,
  RETURN_AT_END_STEP,
];
