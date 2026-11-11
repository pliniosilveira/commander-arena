/**
 * CasualAgent's answers to the questions of the Dragons slice (D-151): the named option a permanent chooses as it enters ("choose Khans or Dragons", the
 * chapter a Saga with read ahead starts at), the creature an artifact copies as it enters, the Dragon it beholds, and the cards it discards when it may
 * discard any number. All are deterministic: they read the view and use no randomness.
 */
import type {
  Action,
  ChooseCardsDecision,
  ChooseOptionDecision,
  ChoosePermanentDecision,
  GameView,
  ObjectId,
} from '@commander-arena/engine';
import { findObject, isLand, manaValueOf, powerOf, toughnessOf } from './casual-view';

/** The lands on the agent's side after which a land in the hand is worth less than a fresh card. */
const LANDS_ENOUGH = 6;

/**
 * "Choose Khans or Dragons" takes the first option (the one that gives the agent cards); "Read ahead" (options "1" to the final chapter) starts at the
 * last chapter: the last chapter's effect at once and the Saga is gone, rather than an early chapter that may hurt its own board.
 */
export function chooseNamedOption(d: ChooseOptionDecision): Action {
  const numbers = d.options.map((o) => Number(o));
  const last = d.options[d.options.length - 1];
  const option =
    numbers.every((n) => Number.isInteger(n)) && last !== undefined ? last : d.options[0];
  if (option === undefined) throw new Error('a choice with no options');
  return { kind: 'chooseOption', option };
}

/** "You may have it become a copy of any creature": the creature with the most power and toughness, the first listed on a tie. */
export function chooseEntersCopy(view: GameView, d: ChoosePermanentDecision): Action {
  let best: ObjectId | undefined;
  let bestScore = -1;
  for (const id of d.legal) {
    const o = findObject(view, id);
    if (o === undefined) continue;
    const score = powerOf(o) * 2 + toughnessOf(o);
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return { kind: 'choosePermanents', objects: best === undefined || d.max < 1 ? [] : [best] };
}

/** "Behold a Dragon": a permanent it controls over a card of the hand (nothing is revealed), the cheapest first. */
export function chooseBehold(view: GameView, d: ChooseCardsDecision): Action {
  const rank = (id: ObjectId, index: number) => {
    const o = findObject(view, id);
    return {
      id,
      index,
      onBattlefield: o !== undefined && view.battlefield.some((b) => b.id === id),
      mv: o === undefined ? 0 : manaValueOf(o),
    };
  };
  const [pick] = d.legal
    .map(rank)
    .sort(
      (a, b) =>
        Number(b.onBattlefield) - Number(a.onBattlefield) || a.mv - b.mv || a.index - b.index,
    );
  return { kind: 'chooseCards', objects: pick === undefined ? [] : [pick.id] };
}

/**
 * "Discard any number of cards, then draw that many": the lands it no longer needs (all of those in the hand once it has enough on the battlefield),
 * nothing else: a card it can cast is worth more than the one it would draw.
 */
export function chooseAnyNumberToDiscard(view: GameView, d: ChooseCardsDecision): Action {
  const lands = view.battlefield.filter((o) => o.controller === view.viewer && isLand(o)).length;
  const objects =
    lands < LANDS_ENOUGH
      ? []
      : d.legal.filter((id) => {
          const o = findObject(view, id);
          return o !== undefined && isLand(o);
        });
  return { kind: 'chooseCards', objects: objects.slice(0, d.max) };
}
