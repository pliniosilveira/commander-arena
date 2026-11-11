/**
 * Log lines for the "cast later" family (D-128): the answers to Suspend's and Madness's questions and the
 * words of a foretell, which must name no card to the player who may not look at it (CR 702.143a). Worded
 * from the decision that was pending before the answer, as `describe-keywords2.ts` is. Pure functions.
 */
import type { GameEvent, GameState, ObjectId, SeatId } from '@commander-arena/engine';
import { manaText } from './later-text';

export interface LaterLine {
  readonly text: string;
  readonly seat: SeatId;
  readonly objects: readonly ObjectId[];
  readonly rule: string;
}

const who = (seat: SeatId, viewer: SeatId): string => (seat === viewer ? 'You' : 'Opponent');

function nameOf(state: GameState, id: ObjectId): string {
  const obj = state.objects[id];
  const card = obj?.card === null || obj?.card === undefined ? undefined : state.cards[obj.card];
  return (card === undefined ? undefined : state.definitions[card.definition]?.name) ?? 'a card';
}

/**
 * The answer to "Cast Name now without paying its mana cost?" (Suspend) and to "Cast Name for its madness
 * cost?" (Madness): the card is public (it is in exile). Null for any other answer.
 */
export function castNowAnswerLine(
  before: GameState,
  event: Extract<GameEvent, { kind: 'optionalAnswered' }>,
  viewer: SeatId,
): LaterLine | null {
  const asked = before.pending;
  if (asked?.kind !== 'confirmOptional' || asked.source !== event.source) return null;
  if (asked.purpose !== 'suspend' && asked.purpose !== 'madness') return null;
  const name =
    asked.subject === undefined
      ? asked.sourceName
      : before.objects[asked.subject] === undefined
        ? asked.sourceName
        : nameOf(before, asked.subject);
  const you = event.seat === viewer;
  const subject = who(event.seat, viewer);
  const objects = asked.subject === undefined ? [] : [asked.subject];
  if (asked.purpose === 'suspend') {
    return {
      text: event.accepted
        ? `${subject} choose${you ? '' : 's'} to cast ${name} without paying its mana cost.`
        : `${subject} ${you ? "don't" : "doesn't"} cast ${name}; it stays in exile.`,
      seat: event.seat,
      objects,
      rule: 'CR 702.62a',
    };
  }
  const cost = asked.cost?.flatMap((c) => (c.kind === 'mana' ? [...c.symbols] : [])) ?? [];
  return {
    text: event.accepted
      ? `${subject} choose${you ? '' : 's'} to cast ${name} for its madness cost${cost.length === 0 ? '' : ` ${manaText(cost)}`}.`
      : `${subject} ${you ? "don't" : "doesn't"} cast ${name}; it goes to the graveyard.`,
    seat: event.seat,
    objects,
    rule: 'CR 702.35a',
  };
}

/**
 * "You foretold Name." for the card's owner, who may look at it; "Opponent foretold a card." for the
 * other player, with no card, no name and no object to hover.
 */
export function foretoldLine(
  after: GameState,
  event: Extract<GameEvent, { kind: 'foretold' }>,
  viewer: SeatId,
): LaterLine {
  if (event.seat !== viewer) {
    return {
      text: 'Opponent foretold a card.',
      seat: event.seat,
      objects: [],
      rule: 'CR 702.143a',
    };
  }
  return {
    text: `You foretold ${nameOf(after, event.object)}.`,
    seat: event.seat,
    objects: [event.object],
    rule: 'CR 702.143a',
  };
}

/**
 * True for the move to exile that a foretell made (the object is foretold): the `foretold` line says it,
 * and this move would name the card to the other player.
 */
export function isForetellMove(
  after: GameState,
  event: Extract<GameEvent, { kind: 'zoneChanged' }>,
): boolean {
  return event.toZone === 'exile' && after.objects[event.to]?.foretoldTurn !== undefined;
}
