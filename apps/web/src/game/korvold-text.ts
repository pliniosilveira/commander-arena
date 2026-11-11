/**
 * The words of the Korvold slice 4 (D-179) that no other file says: a requirement on a group of creatures to attack. Pure; a filter the words
 * cannot say gives null, never a guess (AGENTS.md, honesty).
 */
import type { Effect, ObjectView, SeatId } from '@commander-arena/engine';
import { thingsPhrase } from './filter-text';

/**
 * "Until your next turn, creatures your opponents control attack each combat if able and attack a player other than you if able", "Creatures your
 * opponents control attack this turn if able" (CR 508.1d, 611.2a).
 */
/** The words after "gain control of ..." for how long it lasts (D-189, CR 611.2): none stated is the rest of the game. */
export function controlDurationText(
  duration: Extract<Effect, { kind: 'gainControl' }>['duration'],
  self: string,
): string {
  switch (duration) {
    case 'untilEndOfTurn':
      return ' until end of turn';
    case 'untilEndOfYourNextTurn':
      return ' until the end of your next turn';
    case 'forAsLongAsYouControlThis':
      return ` for as long as you control this ${self}`;
    case 'permanent':
      return '';
  }
}

export function requireAttackText(
  effect: Extract<Effect, { kind: 'requireAttack' }>,
): string | null {
  const group =
    thingsPhrase(effect.creatures, true)
      ?.replace(' on the battlefield', '')
      .replace(/ an opponent controls$/u, ' your opponents control') ?? null;
  if (group === null) return null;
  const subject = `${group.charAt(0).toUpperCase()}${group.slice(1)}`;
  if (effect.duration === 'untilEndOfTurn') return `${subject} attack this turn if able`;
  const away = effect.awayFromYou === true ? ' and attack a player other than you if able' : '';
  return `Until your next turn, ${group} attack each combat if able${away}`;
}

/** What the words of a permanent taken from its owner need of the game (D-189): the viewer, whose turn it is and the name of a permanent by its id. */
export interface ControlContext {
  readonly viewer: SeatId;
  readonly activeSeat: SeatId;
  readonly nameOf: (id: ObjectView['id']) => string | null;
}

/**
 * The line of the card preview for a permanent controlled by a control-changing effect (D-189, CR 613.1b, 611.2): whose it is and how long the
 * control lasts, as the engine says it (`ObjectView.controlEnds`). Null for a permanent no such effect has changed.
 */
export function controlFact(
  o: Pick<ObjectView, 'owner' | 'controlEnds'>,
  ctx: ControlContext,
): string | null {
  const ends = o.controlEnds;
  if (ends === undefined) return null;
  const owner = o.owner === ctx.viewer ? 'yours' : "the opponent's";
  let until: string;
  if (ends === 'endOfTurn') until = 'until end of turn';
  else if (ends === 'never') until = 'with no end stated';
  else if ('endOfTurnOf' in ends) {
    // "Until the end of your next turn": the turn of that player that comes next, or the one that is going on when it has begun.
    const whose = ends.endOfTurnOf === ctx.viewer ? 'your' : "the opponent's";
    until = `until the end of ${whose} ${ends.endOfTurnOf === ctx.activeSeat ? '' : 'next '}turn`;
  } else {
    const by = ctx.nameOf(ends.whileControlling);
    until = `for as long as ${by ?? 'the permanent that took it'} stays under that player's control`;
  }
  return `Taken from its owner (${owner}) ${until}`;
}
