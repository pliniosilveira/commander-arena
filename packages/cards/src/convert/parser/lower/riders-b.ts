/**
 * Lowerings of group B of the Riders of Rohan deck: the sentences about the group of creatures the sentence before named (Taunt from the Rampart, Call for Aid).
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause, IrSentence } from '../ir/types';
import { type Effects, failure, operand } from './clauses';
import { missingFeatures } from './features';
import { playerSelectorOf } from './nouns';
import type { LowerFailure, Lowering, LowerResult } from './types';

function refuse(sentence: IrSentence): LowerFailure {
  return {
    ok: false,
    needs: [],
    at: sentence.span,
    rule: sentence.clauses[0]?.rule ?? sentence.rule,
  };
}

/**
 * "Goad all creatures your opponents control. Until your next turn, those creatures can't block." (Taunt from the Rampart, CR 611.2a, 611.2c, 500.1, 509.1b): the engine's `restrict` of
 * `cantBlock` until the controller's next turn, on the group the sentence before it goaded (an `each` selector, read again as the restriction begins: nothing happens in between, and the
 * group's filter does not read the goad). Only after one plain sentence of goads of one group; after anything else "those creatures" has no group and the sentence is refused.
 */
export function lowerThoseRestriction(
  sentence: IrSentence,
  before: { readonly effects: readonly Effect[] } | undefined,
): LowerResult<Effect[]> {
  const [clause] = sentence.clauses;
  const [first] = before?.effects ?? [];
  if (
    clause === undefined ||
    sentence.clauses.length !== 1 ||
    clause.optional ||
    sentence.condition !== undefined ||
    sentence.where !== undefined ||
    sentence.instead === true ||
    sentence.reflexive === true ||
    sentence.delayed !== undefined ||
    sentence.mayBy !== undefined ||
    before === undefined ||
    before.effects.length !== 1 ||
    first?.kind !== 'goad' ||
    first.forever === true ||
    first.objects.kind !== 'each'
  ) {
    return refuse(sentence);
  }
  const blocked = missingFeatures(['effect:restrict', 'duration:untilYourNextTurn']);
  if (blocked.length > 0) return { ...refuse(sentence), needs: blocked };
  return {
    ok: true,
    value: [
      {
        kind: 'restrict',
        objects: first.objects,
        restriction: 'cantBlock',
        duration: 'untilYourNextTurn',
      },
    ],
    rule: clause.rule,
  };
}

/** "You can't attack that player this turn" (Call for Aid, CR 508.1a, 611.2a): the engine's `youCantAttackPlayers` for the player the pronoun names (the target of the sentence before it). */
const CANT_ATTACK_PLAYER: Lowering<IrClause, Effects> = {
  head: 'youCantAttackPlayer',
  id: 'lower.you-cant-attack-player',
  needs: ['effect:youCantAttackPlayers'],
  lower(clause, ctx) {
    const noun = operand(clause, 'player');
    if (noun?.kind !== 'noun') return failure(clause);
    const players = playerSelectorOf(noun, ctx);
    if (!players.ok) return players;
    return {
      ok: true,
      value: [{ kind: 'youCantAttackPlayers', players: players.value, duration: 'untilEndOfTurn' }],
      rule: clause.rule,
    };
  },
};

/** "You can't sacrifice those creatures this turn" (Call for Aid, CR 701.21a, 101.2, 611.2a): the engine's `youCantSacrifice` of the permanents the `gainControl` before it took (`moved`). */
const CANT_SACRIFICE_THOSE: Lowering<IrClause, Effects> = {
  head: 'youCantSacrificeThose',
  id: 'lower.you-cant-sacrifice-those',
  needs: ['effect:youCantSacrifice', 'selector:moved'],
  lower(clause, ctx) {
    if (!ctx.gainedGroup) return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'youCantSacrifice', objects: { kind: 'moved' }, duration: 'untilEndOfTurn' }],
      rule: clause.rule,
    };
  },
};

export const RIDERS_B_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  CANT_ATTACK_PLAYER,
  CANT_SACRIFICE_THOSE,
];
