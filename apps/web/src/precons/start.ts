/**
 * Starting a game from a deck id (the menu, `?autostart=`): the one place that turns ids into
 * `NewGameOptions`, so every start goes through the rule of D-137. A real precon is prepared by
 * the pipeline of an imported deck and must be valid and fully supported; a hidden test deck
 * (`game/precons.ts`) is passed on by id, which is the one deliberate exception.
 */

import type { AiKind, NewGameOptions } from '../game/protocol';
import type { PreconDeck, Precons } from './build';
import { type ChallengeLevel, emblemsFor } from './challenges/hard';

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

export async function startOptionsFor(
  precons: Precons,
  request: StartRequest,
): Promise<StartOptions> {
  const human = await resolveId(precons, request.humanDeck, request.allowHidden);
  if (!human.ok) return { ok: false, reason: human.reason };
  const ai = await resolveId(precons, request.aiDeck, request.allowHidden);
  if (!ai.ok) return { ok: false, reason: ai.reason };
  const aiPreconName = precons.list.find((info) => info.id === request.aiDeck)?.name;
  const humanPreconName = precons.list.find((info) => info.id === request.humanDeck)?.name;
  const options: NewGameOptions = {
    seed: request.seed,
    humanDeck: request.humanDeck,
    aiDeck: request.aiDeck,
    ...('deck' in human ? { humanCards: human.deck } : {}),
    ...('deck' in ai ? { aiCards: ai.deck } : {}),
    ...(humanPreconName === undefined ? {} : { humanPreconName }),
    ...(aiPreconName === undefined ? {} : { aiPreconName }),
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
  /** Easy (the default) or Hard: the opponent also owns its emblems from the start. */
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
  if (level === 'hard' && emblems.length === 0) {
    return { ok: false, reason: `${ai.info.name} has no Hard level yet.` };
  }
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
      ...(humanPreconName === undefined ? {} : { humanPreconName }),
      aiPreconName: ai.info.name,
      ...(request.freeMulligan === undefined ? {} : { freeMulligan: request.freeMulligan }),
    },
  };
}
