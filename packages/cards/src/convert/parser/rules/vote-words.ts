/**
 * The words of the options of a vote (CR 701.38a, 701.38b), shared by the rules that read them: the vote itself (`effect.vote`), the votes counted ("for each past vote",
 * `amount.for-each-vote`) and the results of a vote ("if time gets more votes", `condition.vote-result`). An option is a choice the card words, with no rules meaning of its own: usually
 * one lowercase word ("profit", "left-handed"), sometimes a name written with capitals ("Redhorn Pass", "Mines of Moria").
 */

/** One lowercase option: "profit", "left-handed". */
const LOWER_WORD = '[\\p{Ll}]+(?:-[\\p{Ll}]+)*';

/** One capitalised option, a name of one or more words that may hold "of" or "the" between capitalised ones: "Redhorn Pass", "Mines of Moria". */
const NAME_WORDS = "\\p{Lu}[\\p{Ll}'’]*(?: (?:of |the )?\\p{Lu}[\\p{Ll}'’]*)*";

/** One option of a vote as the source of a regular expression with no flag `i` (a capital letter is only itself): a lowercase word or a capitalised name. */
export const VOTE_OPTION = `(?:${LOWER_WORD}|${NAME_WORDS})`;

/** The words that stand before "vote" or "votes" and name no option: "for each extra vote", "the number of total votes". Compared in lowercase. */
export const NOT_AN_OPTION = new Set([
  'a',
  'additional',
  'all',
  'an',
  'any',
  'each',
  'extra',
  'its',
  'no',
  'opponent',
  'opponents',
  'other',
  'player',
  'players',
  'the',
  'their',
  'these',
  'those',
  'total',
  'your',
]);
