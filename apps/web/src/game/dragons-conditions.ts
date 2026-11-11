/**
 * The conditions of the Dragons slice (D-151) as the words after "if": the permanents that entered this turn ("two or more nonland
 * permanents entered the battlefield under your control this turn"), the damage a player was dealt this turn, the option a permanent
 * chose as it entered ("Khans was chosen"), the creature that attacks the player with the most life and the total power of the
 * attackers. A leaf module (`condition-text.ts` imports it), so it imports nothing that imports the conditions. Null for any other
 * condition; never a guess. Pure.
 */
import type { CardType, Condition } from '@commander-arena/engine';

type Entered = Extract<Condition, { kind: 'enteredThisTurn' }>;

/** "nonland permanent", "creature token", "nontoken artifact": what the count of permanents that entered names (CR 400.7). */
function enteredNoun(condition: Entered, plural: boolean): string {
  const types: readonly CardType[] = condition.types ?? [];
  const s = plural ? 's' : '';
  const not = (condition.notTypes ?? []).map((t) => `non${t}`);
  const adjectives = [...not, ...(condition.token === false ? ['nontoken'] : [])];
  // "creature token": a token is named after what it is.
  const kinds = types.length === 0 ? ['permanent'] : types;
  const noun =
    condition.token === true
      ? `${kinds.join(' or ')} token${s}`
      : kinds.map((t) => `${t}${s}`).join(' or ');
  return [...adjectives, noun].join(' ');
}

/**
 * "two or more nonland permanents entered the battlefield under your control this turn", "a creature entered the battlefield
 * under your control this turn"; negated, "fewer than two ... entered ..." and "no ... entered ...".
 */
function enteredWords(condition: Entered, negate: boolean): string {
  const tail = 'entered the battlefield under your control this turn';
  if (condition.count <= 1) {
    const noun = enteredNoun(condition, false);
    const article = /^[aeiou]/i.test(noun) ? 'an' : 'a';
    return negate ? `no ${noun} ${tail}` : `${article} ${noun} ${tail}`;
  }
  const many = enteredNoun(condition, true);
  return negate
    ? `fewer than ${condition.count} ${many} ${tail}`
    : `${condition.count} or more ${many} ${tail}`;
}

/** "an opponent was dealt 7 or more damage this turn", "you were dealt damage this turn". */
function damageWords(
  condition: Extract<Condition, { kind: 'playerDealtDamage' }>,
  negate: boolean,
): string {
  const { player, atLeast } = condition;
  const amount = atLeast <= 1 ? 'damage' : `${atLeast} or more damage`;
  if (player === 'you') {
    return `you ${negate ? "weren't" : 'were'} dealt ${amount} this turn`;
  }
  return negate
    ? `no opponent was dealt ${amount} this turn`
    : `an opponent was dealt ${amount} this turn`;
}

/**
 * The conditions of the slice as the words after "if". `negate` is the sense of the enclosing "not". Null for any other condition.
 */
export function dragonsConditionWords(condition: Condition, negate: boolean): string | null {
  switch (condition.kind) {
    case 'enteredThisTurn':
      return enteredWords(condition, negate);
    case 'playerDealtDamage':
      return damageWords(condition, negate);
    case 'chosenOption':
      // CR 607.2d: "Khans was chosen" (the option the permanent chose as it entered).
      return `${condition.option} ${negate ? "wasn't" : 'was'} chosen`;
    case 'attackingMostLife':
      // CR 702.105a (Dethrone).
      return `it's ${negate ? 'not ' : ''}attacking the player with the most life or tied for most life`;
    case 'attackersTotalPower':
      // "Pack tactics": the creatures the controller has attacking now.
      return negate
        ? `you attacked with creatures with total power less than ${condition.atLeast} this combat`
        : `you attacked with creatures with total power ${condition.atLeast} or greater this combat`;
    default:
      return null;
  }
}
