/**
 * CasualAgent's answers to the questions of Devour and Riot (D-185, the Korvold slice 6), the two keywords a permanent applies as it enters. Both are
 * deterministic: they read the view and use no randomness. Encore needs no handler: it is an `activate` option from the graveyard (the casual agent's
 * activation choice, `casual-activations.ts`, decides whether it is worth the mana) and what it creates asks only the questions of these two.
 */
import type {
  Action,
  ChooseOptionDecision,
  ChoosePermanentDecision,
  GameView,
  ObjectView,
} from '@commander-arena/engine';
import { findObject, isCreature, powerOf } from './casual-view';

/** The most power a token may have and still be given up for counters: a 1/1 token is worth less than the +1/+1 counters it buys. */
const TOKEN_POWER_FOR_DEVOUR = 1;

/**
 * "As this enters, you may sacrifice any number of creatures" (CR 702.82a): the tokens that have little power, never a card and never a commander. The
 * counters the permanent gets (N for each creature) are worth more than a token of power 1; anything with a card behind it is kept. Answering with
 * none is always legal.
 */
export function chooseDevourSacrifice(view: GameView, d: ChoosePermanentDecision): Action {
  const chosen = d.legal.filter((id) => {
    const o = findObject(view, id);
    if (o === undefined) return false;
    return o.isToken && isCreature(o) && !o.isCommander && powerOf(o) <= TOKEN_POWER_FOR_DEVOUR;
  });
  return { kind: 'choosePermanents', objects: chosen.slice(0, d.max) };
}

/** Whether the opponent has an untapped creature that could block a creature that attacks this turn (the view shows the battlefield). */
function opponentCanBlock(view: GameView): boolean {
  return view.battlefield.some(
    (o: ObjectView) => o.controller !== view.viewer && isCreature(o) && !o.tapped,
  );
}

/**
 * "You may have this permanent enter with an additional +1/+1 counter on it. If you don't, it gains haste" (CR 702.136a): haste when the agent
 * can attack with the creature now, which is in its own turn before combat, and the opponent has no untapped creature to block it; else the counter,
 * which stays for the whole game. The answer is always one of the options the decision lists.
 */
export function chooseRiot(view: GameView, d: ChooseOptionDecision): Action {
  const mine = view.activeSeat === view.viewer;
  const beforeCombat = view.phase === 'precombatMain';
  const wantsHaste = mine && beforeCombat && !opponentCanBlock(view) && d.options.includes('haste');
  const option = wantsHaste ? 'haste' : d.options.includes('counter') ? 'counter' : d.options[0];
  if (option === undefined) throw new Error('a choice with no options');
  return { kind: 'chooseOption', option };
}
