/** Word tables shared by the wording of the game log, the cards and the dialogs. */

/** The color letters of the engine and the English words for them. */
export const COLOR_NAMES: Readonly<Record<string, string>> = {
  W: 'white',
  U: 'blue',
  B: 'black',
  R: 'red',
  G: 'green',
};

/** "one" to "five": the small counts the cards print in words. */
export const SMALL_COUNT_WORDS: Readonly<Record<number, string>> = {
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
};
