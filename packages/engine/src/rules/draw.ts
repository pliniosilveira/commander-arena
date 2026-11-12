/**
 * "Draw N cards" as instructions of a resolving effect (CR 121.2: cards are drawn one at a time).
 *
 * Each run draws one card and queues the rest, so the commander question of CR 903.9b (a commander
 * on top of the library would be put into its owner's hand; its owner may put it into the command
 * zone instead) can come between two draws and the remaining draws then go on (CR 121.6b). The
 * instruction stays at the head of the queue while the owner answers; the answer is recorded on it
 * (`answerResolutionCommanderChoice`) and the same draw runs again. The turn-based draw of the draw
 * step (CR 504.1) has no resolution and keeps its own pending decision (flow.ts). A card drawn as the first of its owner's turn that has
 * miracle is followed by the instruction `miracleReveal` (CR 702.94a, D-274, `rules/miracle.ts`).
 */
import type { GameState, Instruction } from '../state/types';
import { drawCard } from './effect-support';
import { miracleOffer } from './miracle';
import { done, type StepOutcome } from './step-outcome';

type DrawInstruction = Extract<Instruction, { kind: 'draw' }>;

export function runDraw(state: GameState, instruction: DrawInstruction): StepOutcome {
  const r = drawCard(state, instruction.seat, instruction.commanderChoice);
  if (r.kind === 'needsDecision') return { state, events: [], front: [], needs: r.decision };
  const rest: Instruction[] =
    instruction.count > 1
      ? [{ ...instruction, count: instruction.count - 1, commanderChoice: null, counted: true }]
      : [];
  // D-131: "for each opponent who drew a card this way" counts a player once, at their first card drawn.
  const drew = r.events.some((e) => e.kind === 'cardDrawn');
  const first = instruction.counted !== true && drew;
  // CR 702.94a (D-274): the card drawn may be revealed as it is drawn, so the question comes before the next card of this instruction.
  const offer = miracleOffer(r.state, instruction.seat, r.events);
  const queue: Instruction[] =
    offer === null
      ? rest
      : [{ kind: 'miracleReveal', seat: instruction.seat, card: offer, answer: null }, ...rest];
  // D-135: "if you do" counts the cards actually drawn (an empty library draws none).
  const outcome = { ...done(r.state, r.events, queue), performed: drew ? 1 : 0 };
  return first ? { ...outcome, thisWay: { playersDrew: 1 } } : outcome;
}
