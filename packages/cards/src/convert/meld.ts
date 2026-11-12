/**
 * What the card data says about a meld pair (D-994, CR 701.42, 712.4, 712.5): which card is the other half and which is the melded face. Scryfall lists the
 * parts of a card in `all_parts`, each with a `component`; the stored card keeps their names and components (`StoredCard.relatedParts`).
 *
 * UNVERIFIED (the cloud sandbox cannot reach Scryfall, and no card of the repository's snapshots or golden corpus keeps these entries): the component names
 * `meld_part` (a half of the pair, the card itself included) and `meld_result` (the combined face) are the ones Scryfall's documentation gives, as far as the
 * author knows. They are read here defensively, and every disagreement with what the card's own text says makes the card unsupported with a reason, never a
 * guess: a card is a meld card only if its layout is `meld`; its counterpart and its melded face are the parts the data names; the reminder text "(Melds
 * with X.)" and the meld ability (which the engine checks against the data, `validateCard`) say the same; and the melded face is a card the game could get.
 */
import type { StoredCard } from '../types';

/** The component of a half of a meld pair in `all_parts` (UNVERIFIED, see the file comment). */
export const MELD_PART = 'meld_part';
/** The component of the melded face of a meld pair in `all_parts` (UNVERIFIED, see the file comment). */
export const MELD_RESULT = 'meld_result';

/** What the data says a card is in a meld pair. */
export interface MeldRelation {
  /** `half`: a meld card with its counterpart and melded face named; `result`: the melded face itself; `none`: no (usable) relation. */
  readonly role: 'half' | 'result' | 'none';
  /** The other half's name, for a `half`. */
  readonly partner?: string;
  /** The melded face's name, for a `half`. */
  readonly result?: string;
  /** Why the relation could not be read, when `role` is `none` for a meld card. */
  readonly problems: readonly string[];
}

const normalized = (name: string): string => name.trim().toLowerCase();

/**
 * The relation of a card in a meld pair, from its `relatedParts`. A card is the melded face when its own entry is a `meld_result` (or, when it does not list itself,
 * it is a one-faced card with no mana cost that lists `meld_part` entries and no `meld_result`, whatever its layout: the melded face may itself have the layout
 * `meld`, and a half always has a mana cost); a card of layout `meld` is a half when exactly one other `meld_part` and exactly one `meld_result` are named.
 * Anything else is `none` with the problems that say why.
 */
export function meldRelation(stored: StoredCard): MeldRelation {
  const me = normalized(stored.name);
  const parts = stored.relatedParts.filter((p) => p.component === MELD_PART);
  const results = stored.relatedParts.filter((p) => p.component === MELD_RESULT);
  const listedAsResult = results.some((p) => normalized(p.name) === me);
  const front = stored.faces[0];
  const looksLikeResult =
    results.length === 0 &&
    parts.length > 0 &&
    stored.faces.length === 1 &&
    front !== undefined &&
    (front.manaCost === null || front.manaCost === '') &&
    !parts.some((p) => normalized(p.name) === me);
  if (listedAsResult || looksLikeResult) {
    return { role: 'result', problems: [] };
  }
  if (stored.layout !== 'meld') return { role: 'none', problems: [] };
  const problems: string[] = [];
  const others = parts.filter((p) => normalized(p.name) !== me);
  const otherNames = [...new Set(others.map((p) => p.name))];
  const resultNames = [...new Set(results.map((p) => p.name))];
  if (otherNames.length !== 1) {
    problems.push(
      otherNames.length === 0
        ? 'the card data does not name the other card of its meld pair'
        : `the card data names more than one other card of its meld pair (${otherNames.join(', ')})`,
    );
  }
  if (resultNames.length !== 1) {
    problems.push(
      resultNames.length === 0
        ? 'the card data does not name its melded face'
        : `the card data names more than one melded face (${resultNames.join(', ')})`,
    );
  }
  const partner = otherNames[0];
  const result = resultNames[0];
  if (problems.length > 0 || partner === undefined || result === undefined) {
    return { role: 'none', problems };
  }
  return { role: 'half', partner, result, problems: [] };
}

/**
 * The name the reminder text "(Melds with X.)" of the front face gives, or null when the face has none. The grammar strips reminder text, so it is read from the
 * printed text here, to check it against the data.
 */
export function meldReminderPartner(stored: StoredCard): string | null {
  const text = stored.faces[0]?.oracleText ?? '';
  const match = /\(Melds with ([^)]*?)\.?\)/.exec(text);
  return match === null ? null : (match[1] ?? null);
}

/** What a lookup of the melded face answers: the card, a failure to get it (with why), or nothing known of that name. */
export type MeldLookup = (name: string) => StoredCard | { readonly error: string } | undefined;

/** The names of the melded faces the meld cards among `cards` name (one for each distinct name), for the importer to fetch with the cards it asked for. */
export function meldResultNames(cards: Iterable<StoredCard>): string[] {
  const names = new Map<string, string>();
  for (const card of cards) {
    if (card.layout !== 'meld') continue;
    const relation = meldRelation(card);
    if (relation.role === 'half' && relation.result !== undefined) {
      names.set(normalized(relation.result), relation.result);
    }
  }
  return [...names.values()];
}

/** Whether the lookup answered with a failure rather than a card or nothing. */
export function isMeldLookupError(
  answer: ReturnType<MeldLookup>,
): answer is { readonly error: string } {
  return answer !== undefined && 'error' in answer;
}
