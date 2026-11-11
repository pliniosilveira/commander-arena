/** The menu's form logic, pure so it is tested without a DOM. */
import type { AiKind, NewGameOptions } from '../../game/protocol';
import type { Precons } from '../../precons';
import { startOptionsFor } from '../../precons/start';

export interface MenuForm {
  readonly humanDeck: string;
  readonly aiDeck: string;
  /** Empty means "pick a random seed when the game starts". */
  readonly seed: string;
  /** The first mulligan is free (default true). */
  readonly freeMulligan?: boolean;
  /** The opponent: the player's difficulty setting (D-164). Left out, the game starts with the host's default. */
  readonly ai?: AiKind;
}

export const MAX_SEED = 0xffffffff;

/**
 * The decks the menu starts with: you get the first precon and the AI the second, so a game started
 * without touching the pickers is not a mirror match; with one precon both play it.
 */
export function defaultDecks(ids: readonly string[]): Pick<MenuForm, 'humanDeck' | 'aiDeck'> {
  const first = ids[0] ?? '';
  return { humanDeck: first, aiDeck: ids[1] ?? first };
}

export type SeedParse =
  | { readonly ok: true; readonly seed: number | null }
  | { readonly ok: false };

/** A seed is a whole number from 0 to 2^32-1; an empty field is allowed (random). */
export function parseSeed(text: string): SeedParse {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, seed: null };
  if (!/^\d{1,10}$/.test(trimmed)) return { ok: false };
  const value = Number(trimmed);
  return value <= MAX_SEED ? { ok: true, seed: value } : { ok: false };
}

/** A random seed from the browser's crypto source. Call from an event handler, never in render. */
export function randomSeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] ?? 1;
}

/** What pressing Start did: it started a game, or it did not: the seed is invalid, or the decks were refused with a reason. */
export type StartResult =
  | { readonly started: true }
  | { readonly started: false; readonly kind: 'seed' }
  | { readonly started: false; readonly kind: 'refused'; readonly reason: string };

/**
 * Starts a game from the form with the real precons the form names (D-137). Nothing starts when
 * the seed is invalid (`kind` is `'seed'`), when no precon is chosen, or when a precon is not a
 * valid Commander deck of fully supported cards (`reason` says why).
 */
export async function startFromForm(
  startGame: (options: NewGameOptions) => Promise<void>,
  form: MenuForm,
  precons: Precons,
  pickSeed: () => number = randomSeed,
): Promise<StartResult> {
  const parsed = parseSeed(form.seed);
  if (!parsed.ok) return { started: false, kind: 'seed' };
  if (form.humanDeck === '' || form.aiDeck === '') {
    return { started: false, kind: 'refused', reason: 'No precon is installed yet.' };
  }
  const result = await startOptionsFor(precons, {
    seed: parsed.seed ?? pickSeed(),
    humanDeck: form.humanDeck,
    aiDeck: form.aiDeck,
    freeMulligan: form.freeMulligan ?? true,
    ...(form.ai === undefined ? {} : { ai: form.ai }),
    allowHidden: false,
  });
  if (!result.ok) return { started: false, kind: 'refused', reason: result.reason };
  await startGame(result.options);
  return { started: true };
}
