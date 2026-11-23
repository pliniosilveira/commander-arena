/** The menu's form logic, pure so it is tested without a DOM. */
import type { AiKind, NewGameOptions } from '../../game/protocol';
import type { DeckChoice, Precons } from '../../precons';
import { startOptionsFor, startTableOptionsFor } from '../../precons/start';

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

/** The names of the opponents' deck steps, in seat order. */
export const OPPONENT_ORDINALS = ['first', 'second', 'third'] as const;

/** The title of the deck dialog of opponent `index` (from 0) at a table of `count` opponents. */
export function opponentDeckTitle(index: number, count: number): string {
  if (count === 1) return "Choose opponent's deck";
  return `Choose ${OPPONENT_ORDINALS[index] ?? `#${index + 1}`} opponent's deck`;
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
  await startGame({ ...result.options, intro: true });
  return { started: true };
}

/**
 * Starts a game with several opponents from the human deck and one deck per opponent, as
 * `startFromForm` does for one: nothing starts on an invalid seed or when a deck is refused.
 */
export async function startTableFromForm(
  startGame: (options: NewGameOptions) => Promise<void>,
  form: {
    readonly humanDeck: string;
    readonly opponentDecks: readonly string[];
    readonly seed: string;
    readonly freeMulligan?: boolean;
    readonly ai?: AiKind;
  },
  precons: Precons,
  pickSeed: () => number = randomSeed,
): Promise<StartResult> {
  const parsed = parseSeed(form.seed);
  if (!parsed.ok) return { started: false, kind: 'seed' };
  if (form.humanDeck === '' || form.opponentDecks.some((id) => id === '')) {
    return { started: false, kind: 'refused', reason: 'No precon is installed yet.' };
  }
  const result = await startTableOptionsFor(precons, {
    seed: parsed.seed ?? pickSeed(),
    humanDeck: form.humanDeck,
    opponentDecks: form.opponentDecks,
    freeMulligan: form.freeMulligan ?? true,
    ...(form.ai === undefined ? {} : { ai: form.ai }),
    allowHidden: false,
  });
  if (!result.ok) return { started: false, kind: 'refused', reason: result.reason };
  await startGame({ ...result.options, intro: true });
  return { started: true };
}

/** Where a random deck comes from: every deck, only the precons or only the decks you saved. */
export type RandomScope = 'all' | 'precon' | 'saved';

/**
 * A random deck of the scope, or null when the scope has none. `random` gives a whole number in
 * `[0, n)`; by default it comes from the browser's crypto source, so call this from an event
 * handler, never in render. Decks in `exclude` (ids already chosen for this game) are left out of
 * the pool, so a Random button never gives two equal decks in one game.
 */
export function pickRandomDeck(
  decks: readonly DeckChoice[],
  scope: RandomScope,
  random: (n: number) => number = randomBelow,
  exclude: readonly string[] = [],
): DeckChoice | null {
  const on = decks.filter((deck) => deck.enabled !== false && !exclude.includes(deck.id));
  const pool = scope === 'all' ? on : on.filter((deck) => deck.kind === scope);
  return pool[random(pool.length)] ?? null;
}

function randomBelow(n: number): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return (buffer[0] ?? 0) % Math.max(n, 1);
}

/** The color filter's buttons, in WUBRG order; "C" is colorless. */
export const COLOR_FILTERS = ['W', 'U', 'B', 'R', 'G', 'C'] as const;
export type ColorFilter = (typeof COLOR_FILTERS)[number];

/** Toggles one filter button. Colorless excludes the five colors, and they exclude it. */
export function toggleColorFilter(
  selected: readonly ColorFilter[],
  color: ColorFilter,
): readonly ColorFilter[] {
  if (selected.includes(color)) return selected.filter((c) => c !== color);
  if (color === 'C') return ['C'];
  return [...selected.filter((c) => c !== 'C'), color];
}

/**
 * Does a deck's color identity match the filter exactly? Red alone is the mono-red decks, red and
 * blue is the Izzet decks only, colorless is the decks with no color. No selection matches every
 * deck; a deck of unknown colors matches only that empty filter.
 */
export function matchesColorFilter(
  colors: readonly string[] | undefined,
  selected: readonly ColorFilter[],
): boolean {
  if (selected.length === 0) return true;
  if (colors === undefined) return false;
  const want = selected.filter((c) => c !== 'C');
  return colors.length === want.length && want.every((c) => colors.includes(c));
}
