/**
 * CasualAgent's answer to "As this artifact enters, pay any amount of life" (`purpose` 'lifePaid', CR 119.4, 614.12): a permanent that remembers the
 * life it was paid is worth more the more it got, and the life is only worth something while the agent stays out of reach. So the agent pays a quarter
 * of its life total, but never so much that it is left with fewer than `SAFE_LIFE` (it keeps what it has when it is already below that). The options
 * are the whole numbers from 0 to the life total, so the answer is always one of them; deterministic.
 */
import type { Action, ChooseOptionDecision, GameView } from '@commander-arena/engine';

/** The life the agent keeps when it pays: below this a few attackers end the game. */
const SAFE_LIFE = 15;

export function chooseLifePaid(_view: GameView, d: ChooseOptionDecision): Action {
  const last = d.options[d.options.length - 1];
  const life = last === undefined ? 0 : Number(last);
  const pay = Math.max(0, Math.min(Math.floor(life / 4), life - SAFE_LIFE));
  const option = d.options.includes(String(pay)) ? String(pay) : d.options[0];
  if (option === undefined) throw new Error('a choice with no options');
  return { kind: 'chooseOption', option };
}
