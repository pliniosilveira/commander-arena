/** Helpers shared by the meld tests (D-991, D-992). */
import type { ScenarioGame } from '../src/testing/index';

/**
 * Resolves what is waiting: triggers that need ordering are put on the stack in their default order, the order of two melded cards is left as it was put, and the
 * stack is passed until it is empty. Stops at any other decision, so a test can answer it.
 */
export function settle(g: ScenarioGame): ScenarioGame {
  for (let i = 0; i < 40; i += 1) {
    const d = g.state.pending;
    if (d?.kind === 'orderTriggers') {
      g.act(d.seat).orderTriggers(...d.triggers.map((_, index) => index));
      continue;
    }
    // The order of the two cards of a melded permanent that left (D-993): the default one, which keeps the cards where they were put.
    if (d?.kind === 'chooseOption' && d.purpose === 'meldOrder') {
      g.act(d.seat).chooseOption(d.options[1] ?? '');
      continue;
    }
    if (d?.kind === 'priority' && g.state.stack.length > 0) {
      g.passAll();
      continue;
    }
    break;
  }
  return g;
}
