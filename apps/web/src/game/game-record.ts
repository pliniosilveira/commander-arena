/**
 * The game as a replay (issue 627): what the host knows of the game it plays, in the record an AI report carries
 * (`GameRecord` of the cards package). Framework-free; the host calls it with its options and its action log.
 */
import type { GameRecord, ReplayDeck, ReplayEmblem } from '@commander-arena/cards';
import type { Action } from '@commander-arena/engine';
import type { NewGameOptions, OpponentOptions } from './protocol';

/** How one seat's deck was built: the options' own record, else a hidden test deck when the seat had no cards. */
function deckOf(given: ReplayDeck | undefined, id: string, hasCards: boolean): ReplayDeck | null {
  if (given !== undefined) return given;
  return hasCards ? null : { name: id, hidden: id };
}

/** The record of a game started with `options` that applied `actions`; null when a deck's origin is not known. */
export function gameRecordOf(
  options: NewGameOptions,
  opponents: readonly OpponentOptions[],
  actions: readonly { readonly seat: number; readonly action: Action }[],
): GameRecord | null {
  const given = options.replayDecks ?? [];
  const decks: ReplayDeck[] = [];
  const human = deckOf(given[0], options.humanDeck, options.humanCards !== undefined);
  if (human === null) return null;
  decks.push(human);
  for (const [i, opponent] of opponents.entries()) {
    const deck = deckOf(given[i + 1], opponent.deck, opponent.cards !== undefined);
    if (deck === null) return null;
    decks.push(deck);
  }
  const emblems: ReplayEmblem[] = opponents.flatMap((opponent, i) =>
    (opponent.emblems ?? []).map((e) => ({ seat: i + 1, text: e.text, abilities: e.abilities })),
  );
  return {
    seed: options.seed,
    freeMulligan: options.freeMulligan ?? true,
    ai: options.ai ?? 'casual',
    decks,
    emblems,
    actions: actions.map((a) => ({ seat: a.seat, action: a.action })),
  };
}
