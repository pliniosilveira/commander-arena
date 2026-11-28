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
import { derive } from './derive';
import { drawRedirectOf, drawReplacementOf } from './draw-replace';
import { drawSkippedBy } from './draw-skip';
import { dredgeCandidate, dredgeQuestion, performDredge } from './dredge';
import { drawCard } from './effect-support';
import { miracleOffer } from './miracle';
import { done, type StepOutcome } from './step-outcome';

type DrawInstruction = Extract<Instruction, { kind: 'draw' }>;

export function runDraw(state: GameState, input: DrawInstruction): StepOutcome {
  // CR 614.1a, 614.11 (Notion Thief): "If an opponent would draw a card except the first one ..., instead that player skips that draw and you draw a card": the draw does not happen and
  // its controller draws a card of their own, which the effects that did not replace this draw can replace again (CR 614.5). A `skipDraw` of the player is applied first (D-332) and
  // `drawCard` skips the draw. The draws this instruction still has to make follow the replacement draw.
  const redirect =
    drawSkippedBy(state, input.seat) === null
      ? drawRedirectOf(state, input.seat, input.redirectedBy ?? [])
      : null;
  if (redirect !== null) {
    const { redirectedBy: _by, dredgeAnswer: _a, dredgeAfter: _after, ...plain } = input;
    const stillReplaced = (input.replacedLeft ?? 0) - 1;
    const { replacedLeft: _left, ...bare } = plain;
    const rest: Instruction[] =
      input.count > 1
        ? [
            {
              ...bare,
              count: input.count - 1,
              commanderChoice: null,
              counted: true,
              ...(stillReplaced > 0 ? { replacedLeft: stillReplaced } : {}),
            },
          ]
        : [];
    const instead: Instruction = {
      kind: 'draw',
      seat: redirect.controller,
      count: 1,
      commanderChoice: null,
      redirectedBy: [...(input.redirectedBy ?? []), redirect.source],
    };
    return {
      ...done(
        state,
        [{ kind: 'drawSkipped', seat: input.seat, source: redirect.source }],
        [instead, ...rest],
      ),
      performed: 0,
    };
  }
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
  // CR 702.52a, 614.1a (Dredge, issue 102): "If you would draw a card, you may instead mill N cards and return this card from your graveyard to your hand." The owner is asked about each
  // card with dredge in their graveyard before the card is drawn; the answer is recorded on the instruction, which runs again.
  const dredgeAnswer = instruction.dredgeAnswer;
  if (dredgeAnswer === undefined) {
    const candidate = dredgeCandidate(state, instruction.seat, instruction.dredgeAfter);
    if (candidate !== null) {
      return {
        state,
        events: [],
        front: [],
        needs: dredgeQuestion(state, instruction.seat, candidate.card),
      };
    }
  } else if (!dredgeAnswer.accepted) {
    // Declined: the next card of the graveyard is asked about, and when there is none the card is drawn.
    const { dredgeAnswer: _answer, ...unanswered } = instruction;
    return done(state, [], [{ ...unanswered, dredgeAfter: dredgeAnswer.card }]);
  } else {
    const dredged = performDredge(state, instruction.seat, dredgeAnswer.card);
    if (dredged !== null) {
      // The draw was replaced: no card was drawn (CR 121.1), and the draws that are left go on (CR 121.6b).
      const { dredgeAnswer: _a, dredgeAfter: _after, replacedLeft: _left, ...plain } = instruction;
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
      return { ...done(dredged.state, [...marked, ...dredged.events], rest), performed: 0 };
    }
  }
  const r = drawCard(state, instruction.seat, instruction.commanderChoice);
  if (r.kind === 'needsDecision') return { state, events: [], front: [], needs: r.decision };
  const {
    replacedLeft: _left,
    dredgeAnswer: _dredged,
    dredgeAfter: _after,
    ...plain
  } = instruction;
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
  // CR 701.20a, 400.7j (Galadriel group 3): "Draw a card and reveal it": the card drawn is shown to every player and is what `moved` names for the rest of the resolution (a draw
  // that drew no card reveals nothing and leaves `moved` empty).
  const drawn = r.events.find((e) => e.kind === 'cardDrawn');
  const revealed: GameEvent[] = [];
  if (instruction.reveal === true && drawn?.kind === 'cardDrawn') {
    const card = r.state.objects[drawn.object];
    if (card?.card != null) {
      revealed.push({
        kind: 'cardsRevealed',
        seat: instruction.seat,
        cards: [card.card],
        names: [derive(r.state, card).name],
        from: 'hand',
      });
    }
  }
  // D-135: "if you do" counts the cards actually drawn (an empty library draws none).
  const base = done(r.state, [...marked, ...r.events, ...revealed], queue);
  const outcome = {
    ...base,
    performed: drew ? 1 : 0,
    ...(instruction.reveal === true
      ? { lastMoved: drawn?.kind === 'cardDrawn' ? [drawn.object] : [] }
      : {}),
  };
  // Kwain, Itinerant Meddler (CR 121.1): "each player who drew a card this way" names this player.
  // Communal Brewing (CR 121.1): "for each card drawn this way" counts every card drawn, beside the players who drew.
  if (!drew) return outcome;
  return {
    ...outcome,
    thisWay: first
      ? { playersDrew: 1, drewBy: [instruction.seat], cardsDrawn: 1 }
      : { cardsDrawn: 1 },
  };
}
