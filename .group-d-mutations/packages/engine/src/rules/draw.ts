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
import type { GameEvent } from '../state/events';
import type { GameState, Instruction } from '../state/types';
import { drawReplacementOf } from './draw-replace';
import { drawCard } from './effect-support';
import { miracleOffer } from './miracle';
import { done, type StepOutcome } from './step-outcome';

type DrawInstruction = Extract<Instruction, { kind: 'draw' }>;

export function runDraw(state: GameState, input: DrawInstruction): StepOutcome {
  // CR 614.1a, 614.11a (D-379): a draw that a `drawInstead` replaces becomes the draws it says, which are made first (before the draws this instruction
  // still has to make) and are not replaced again (CR 614.5). The state is not changed until the first of them is drawn, so a question (CR 903.9b) that comes
  // up asks again from the same state and the instruction is replaced the same way.
  const replacedLeft = input.replacedLeft ?? 0;
  const replaced = replacedLeft > 0 ? null : drawReplacementOf(state, input.seat);
  const instruction: DrawInstruction =
    replaced !== null && replaced.count !== 1
      ? { ...input, count: input.count - 1 + replaced.count, replacedLeft: replaced.count }
      : input;
  const marked: GameEvent[] =
    replaced !== null && replaced.count !== 1
      ? [
          {
            kind: 'drawReplaced',
            seat: input.seat,
            sources: replaced.sources,
            count: replaced.count,
          },
        ]
      : [];
  const r = drawCard(state, instruction.seat, instruction.commanderChoice);
  if (r.kind === 'needsDecision') return { state, events: [], front: [], needs: r.decision };
  const { replacedLeft: _left, ...plain } = instruction;
  const stillReplaced = (instruction.replacedLeft ?? 0) - 1;
  const rest: Instruction[] =
    instruction.count > 1
      ? [
          {
            ...plain,
            count: instruction.count - 1,
            commanderChoice: null,
            counted: true,
            ...(stillReplaced > 0 ? { replacedLeft: stillReplaced } : {}),
          },
        ]
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
  const outcome = { ...done(r.state, [...marked, ...r.events], queue), performed: drew ? 1 : 0 };
  return first ? { ...outcome, thisWay: { playersDrew: 1 } } : outcome;
}
