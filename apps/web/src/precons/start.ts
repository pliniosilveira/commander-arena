/**
 * Starting a game from a deck id (the menu, `?autostart=`): the one place that turns ids into
 * `NewGameOptions`, so every start goes through the rule of D-137. A real precon is prepared by
 * the pipeline of an imported deck and must be valid and fully supported; a hidden test deck
 * (`game/precons.ts`) is passed on by id, which is the one deliberate exception.
 */

import type { ReplayDeck } from '@commander-arena/cards';
import type { AiKind, NewGameOptions, OpponentOptions } from '../game/protocol';
import { setGameImages } from '../ui/board/deck-images';
import { setGamePrintings } from '../ui/board/deck-printings';
import type { PreconDeck, Precons } from './build';
import { type ChallengeLevel, emblemsFor } from './challenges/levels';

export type StartOptions =
  | { readonly ok: true; readonly options: NewGameOptions }
  | { readonly ok: false; readonly reason: string };

export interface StartRequest {
  readonly seed: number;
  readonly humanDeck: string;
  readonly aiDeck: string;
  readonly freeMulligan?: boolean;
  /** Which agent plays the opponent (D-164); left out, the options carry none and the host plays `casual`. */
  readonly ai?: AiKind;
  /** True for `?autostart=`: ids of the hidden test decks are accepted too. */
  readonly allowHidden: boolean;
}

/** A deck id as the game needs it: a prepared real precon, a hidden id, or a refusal. */
async function resolveId(
  precons: Precons,
  id: string,
  allowHidden: boolean,
): Promise<
  | PreconDeck
  | { readonly ok: true; readonly hidden: true }
  | { readonly ok: false; readonly reason: string }
> {
  if (precons.list.some((info) => info.id === id)) return precons.prepare(id);
  // The hidden decks are test fixtures: their chunk loads only when a start asks for one.
  if (allowHidden && (await import('../game/precons')).isHiddenDeckId(id)) {
    return { ok: true, hidden: true };
  }
  return precons.prepare(id); // an unknown id: refused with a reason
}

/** The list of a prepared deck, which names the printings the board draws; a hidden test deck has none. */
const listOf = (deck: PreconDeck | { readonly ok: true; readonly hidden: true }): string =>
  'info' in deck && deck.info !== null ? deck.info.decklist : '';

/** The stored cards of a prepared deck, which the board draws from their own picture links; a hidden test deck has none. */
const imagesOf = (deck: PreconDeck | { readonly ok: true; readonly hidden: true }) =>
  'images' in deck ? deck.images : [];

/** How a resolved deck was built, for the replay of an AI report (issue 627); a hidden test deck is rebuilt from its id. */
const replayOf = (
  deck: PreconDeck | { readonly ok: true; readonly hidden: true },
  id: string,
): ReplayDeck => ('replay' in deck ? deck.replay : { name: id, hidden: id });

export async function startOptionsFor(
  precons: Precons,
  request: StartRequest,
): Promise<StartOptions> {
  const human = await resolveId(precons, request.humanDeck, request.allowHidden);
  if (!human.ok) return { ok: false, reason: human.reason };
  const ai = await resolveId(precons, request.aiDeck, request.allowHidden);
  if (!ai.ok) return { ok: false, reason: ai.reason };
  // The board draws each seat in the printings its own deck lists: the human is seat 0, the opponent seat 1.
  setGamePrintings([listOf(human), listOf(ai)]);
  setGameImages([imagesOf(human), imagesOf(ai)]);
  const aiPreconName = precons.list.find((info) => info.id === request.aiDeck)?.name;
  const humanPreconName = precons.list.find((info) => info.id === request.humanDeck)?.name;
  const options: NewGameOptions = {
    seed: request.seed,
    humanDeck: request.humanDeck,
    aiDeck: request.aiDeck,
    ...('deck' in human ? { humanCards: human.deck } : {}),
    ...('deck' in ai ? { aiCards: ai.deck } : {}),
    replayDecks: [replayOf(human, request.humanDeck), replayOf(ai, request.aiDeck)],
    ...(humanPreconName === undefined ? {} : { humanPreconName }),
    ...(aiPreconName === undefined ? {} : { aiPreconName }),
    ...(request.freeMulligan === undefined ? {} : { freeMulligan: request.freeMulligan }),
    ...(request.ai === undefined ? {} : { ai: request.ai }),
  };
  return { ok: true, options };
}

export interface TableRequest {
  readonly seed: number;
  readonly humanDeck: string;
  /** One deck id per opponent, in seat order (two or three). */
  readonly opponentDecks: readonly string[];
  readonly freeMulligan?: boolean;
  readonly ai?: AiKind;
  readonly allowHidden: boolean;
}

/**
 * The options of a game with several opponents: every deck goes through the rule of D-137 as in
 * `startOptionsFor`, and a refusal says which opponent's deck it is. `aiDeck` carries the first
 * opponent's id only because the type asks for it; `opponents` is what the host plays.
 */
export async function startTableOptionsFor(
  precons: Precons,
  request: TableRequest,
): Promise<StartOptions> {
  const human = await resolveId(precons, request.humanDeck, request.allowHidden);
  if (!human.ok) return { ok: false, reason: human.reason };
  const opponents: OpponentOptions[] = [];
  const lists: string[] = [];
  const pictures = [imagesOf(human)];
  const replays: ReplayDeck[] = [replayOf(human, request.humanDeck)];
  for (const [index, id] of request.opponentDecks.entries()) {
    const resolved = await resolveId(precons, id, request.allowHidden);
    if (!resolved.ok) return { ok: false, reason: `Opponent ${index + 1}: ${resolved.reason}` };
    lists.push(listOf(resolved));
    pictures.push(imagesOf(resolved));
    replays.push(replayOf(resolved, id));
    const preconName = precons.list.find((info) => info.id === id)?.name;
    opponents.push({
      deck: id,
      ...('deck' in resolved ? { cards: resolved.deck } : {}),
      ...(preconName === undefined ? {} : { preconName }),
    });
  }
  setGamePrintings([listOf(human), ...lists]);
  setGameImages(pictures);
  const humanPreconName = precons.list.find((info) => info.id === request.humanDeck)?.name;
  const options: NewGameOptions = {
    seed: request.seed,
    humanDeck: request.humanDeck,
    aiDeck: request.opponentDecks[0] ?? '',
    opponents,
    replayDecks: replays,
    ...('deck' in human ? { humanCards: human.deck } : {}),
    ...(humanPreconName === undefined ? {} : { humanPreconName }),
    ...(request.freeMulligan === undefined ? {} : { freeMulligan: request.freeMulligan }),
    ...(request.ai === undefined ? {} : { ai: request.ai }),
  };
  return { ok: true, options };
}

export interface ChallengeRequest {
  readonly seed: number;
  /** The player's deck: a precon id or `saved:<deck id>`. */
  readonly humanDeck: string;
  /** The challenge opponent: an id of the challenge list. */
  readonly challenge: string;
  /** Easy (the default), Medium or Hard: the opponent also owns its emblems from the start. */
  readonly level?: ChallengeLevel;
  readonly freeMulligan?: boolean;
}

/**
 * Starting a challenge: the player's deck comes from the precons and saved decks, the opponent's
 * from the challenge list. Both go through the same preparation and refusal rule as any deck.
 */
export async function startChallengeOptions(
  precons: Precons,
  challenges: Precons,
  request: ChallengeRequest,
): Promise<StartOptions> {
  const human = await precons.prepare(request.humanDeck);
  if (!human.ok) return { ok: false, reason: human.reason };
  const ai = await challenges.prepare(request.challenge);
  if (!ai.ok) return { ok: false, reason: ai.reason };
  const level = request.level ?? 'easy';
  const emblems = emblemsFor(level, request.challenge);
  if (level !== 'easy' && emblems.length === 0) {
    return {
      ok: false,
      reason: `${ai.info.name} has no ${level === 'medium' ? 'Medium' : 'Hard'} level yet.`,
    };
  }
  setGamePrintings([human.info.decklist, ai.info.decklist]);
  setGameImages([imagesOf(human), imagesOf(ai)]);
  const humanPreconName = precons.list.find((info) => info.id === request.humanDeck)?.name;
  return {
    ok: true,
    options: {
      seed: request.seed,
      humanDeck: request.humanDeck,
      aiDeck: request.challenge,
      ...(emblems.length === 0 ? {} : { aiEmblems: emblems }),
      humanCards: human.deck,
      aiCards: ai.deck,
      replayDecks: [human.replay, ai.replay],
      ...(humanPreconName === undefined ? {} : { humanPreconName }),
      aiPreconName: ai.info.name,
      ...(request.freeMulligan === undefined ? {} : { freeMulligan: request.freeMulligan }),
    },
  };
}
