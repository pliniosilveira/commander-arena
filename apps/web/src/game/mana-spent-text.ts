/**
 * The mana spent to cast a spell, in words (D-183, CR 601.2h): "mana spent to cast it", "mana from an artifact source spent to cast it". The
 * amount `manaSpent` of the engine says it as "the amount of ...", and the count of an "enters with a counter" ability as "for each ...".
 */

/** "mana spent to cast it", or with a card type of the source "mana from an artifact source spent to cast it". */
export function manaSpentWords(fromType: string | undefined): string {
  if (fromType === undefined) return 'mana spent to cast it';
  const article = /^[aeiou]/i.test(fromType) ? 'an' : 'a';
  return `mana from ${article} ${fromType} source spent to cast it`;
}
