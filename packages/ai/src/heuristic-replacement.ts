/**
 * HeuristicAgent and the order of prevention and redirection effects on a damage event (CR 616.1, D-191, D-192, `purpose` 'replacement'): the agent is
 * the affected player, so it picks the effect to apply first whose result is best for it, read from what each choice leads to if the rest follow the
 * default order (`ReplacementChoice.outcome`): the least damage that lands where it ends (`outcome.to`: a point of damage to the agent's player is
 * life, and costs a full point, a point that a redirection puts on a permanent costs half, as the damage on a permanent is removed at the end of the turn
 * unless something says otherwise), then the most damage prevented, and on a tie the first option, which is the default order (prevention first, the
 * owner's decision). It reads the decision only, never engine internals, so it stays within the engine's public API and is deterministic. Every answer is
 * one of the options, so it is always legal. For the order of the replacement effects of the creation of tokens (D-221) it picks the choice that makes the most tokens. For
 * the order of a regeneration shield and Umbra armor on a permanent that would be destroyed (D-418) it picks the shield, which costs no Aura, else the first option.
 */
import type { Action, ChooseOptionDecision } from '@commander-arena/engine';

/** What damage costs the agent where the outcome ends: a point on a player is life, a point on a permanent is worth half. */
const costOf = (outcome: { readonly to: { readonly kind: string }; readonly amount: number }) =>
  outcome.to.kind === 'player' ? outcome.amount : outcome.amount / 2;

export function chooseReplacementByOutcome(d: ChooseOptionDecision): Action {
  const first = d.options[0];
  if (first === undefined) throw new Error('a choice with no options');
  let best = first;
  let bestCost = Number.POSITIVE_INFINITY;
  let bestPrevented = -1;
  for (const choice of d.replacement?.choices ?? []) {
    if (choice.kind === 'tokens') {
      // CR 616.1 (D-221): the order of the replacement effects of the creation of tokens: the order that makes the most tokens, the first on a tie (the engine
      // lists the order that makes the most tokens first).
      const made = -choice.outcome.total;
      if (made < bestCost) {
        best = choice.option;
        bestCost = made;
      }
      continue;
    }
    if ('aura' in choice.outcome) {
      // CR 616.1 (D-418): the order of a regeneration shield and the Umbra armor of the Auras on the permanent that would be destroyed: the effect that
      // costs no Aura first (the shield lasts only this turn), else the first, the oldest Aura, which is the default order the engine lists.
      if (choice.outcome.aura === null) return { kind: 'chooseOption', option: choice.option };
      continue;
    }
    const cost = costOf(choice.outcome);
    const { prevented } = choice.outcome;
    if (cost < bestCost || (cost === bestCost && prevented > bestPrevented)) {
      best = choice.option;
      bestCost = cost;
      bestPrevented = prevented;
    }
  }
  return { kind: 'chooseOption', option: best };
}
