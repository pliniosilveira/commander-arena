/**
 * The names of the faces of the invented multi-face cards in the hidden test decks. A face is named
 * without the "SYNTHETIC " prefix its card has ("Brawler Bear" in "SYNTHETIC Brawler Bear // Chop"),
 * and some invented names are also real cards, so the page must not look their art up.
 *
 * The list is written out, not derived from the decks, so that drawing a card does not load the
 * hidden decks (`game/precons.ts`, a chunk of their own); `test/synthetic-names.test.ts` fails when
 * it differs from what the decks hold.
 */
export const SYNTHETIC_FACE_NAMES: readonly string[] = [
  'Brawler Bear',
  'Chop',
  'Grown Knight',
  'Mend',
  'Moon Beast',
  'Moon Cub',
  'Peek',
  'Ridge Drake',
  'Ridge Pass',
  'Shock Pass',
  'Singe',
  'Squire',
  'Study',
  'Twin Knight',
  'Twin Wall',
  'Wise Owl',
  'Zap',
  'Zeal Charm',
];

const NAMES: ReadonlySet<string> = new Set(SYNTHETIC_FACE_NAMES);

/** True for a face of an invented (SYNTHETIC) multi-face card. */
export function isSyntheticFace(name: string): boolean {
  return NAMES.has(name);
}
