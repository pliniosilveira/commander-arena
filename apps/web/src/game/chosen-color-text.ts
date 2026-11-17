/**
 * The words of "Choose a color. Target player adds three mana of the chosen color for each artifact sacrificed this way." (D-585): the engine's `chooseOne` of the five colors, each
 * option `addMana` of that color for the same player, read back as the two sentences of the card. Nothing is guessed: any other shape of `chooseOne` keeps its words (null here).
 */
import type { Amount, Effect, PlayerSelector } from '@commander-arena/engine';
import { NUMBER_WORDS } from './cost-words';

const COLORS: readonly (readonly [string, string])[] = [
  ['white', 'W'],
  ['blue', 'U'],
  ['black', 'B'],
  ['red', 'R'],
  ['green', 'G'],
];

/** What "for each" counts, in the singular, for the amounts a choice of a color reads; null for any other amount (its own words say it). */
function eachWords(times: Amount): string | null {
  return typeof times === 'object' && times.kind === 'sacrificedAsCost'
    ? 'permanent sacrificed this way'
    : null;
}

/**
 * "Choose a color. Target player adds three mana of that color for each permanent sacrificed this way", or null when the effect is not a choice of the five colors that adds the
 * same number of mana of each to the same player. `who` says the player ("target player").
 */
export function chosenColorManaText(
  effect: Extract<Effect, { kind: 'chooseOne' }>,
  who: (player: PlayerSelector) => string,
): string | null {
  if (effect.options.length !== COLORS.length || effect.optional === true) return null;
  if (effect.times !== undefined || effect.chooser !== undefined) return null;
  const first = effect.options[0]?.effect;
  if (first?.kind !== 'addMana' || first.mana.kind !== 'fixed' || first.player === undefined) {
    return null;
  }
  const count = first.mana.mana.length;
  const times = first.mana.times;
  const same = effect.options.every((option, i) => {
    const [label, symbol] = COLORS[i] ?? ['', ''];
    const e = option.effect;
    return (
      option.label === label &&
      e.kind === 'addMana' &&
      e.mana.kind === 'fixed' &&
      e.mana.mana.length === count &&
      e.mana.mana.every((m) => m === symbol) &&
      JSON.stringify(e.mana.times) === JSON.stringify(times) &&
      JSON.stringify(e.player) === JSON.stringify(first.player)
    );
  });
  if (!same) return null;
  const each = times === undefined ? '' : eachWords(times);
  if (each === null) return null;
  const player = who(first.player);
  const words = count === 1 ? 'one' : (NUMBER_WORDS[count] ?? String(count));
  return `Choose a color. ${player.charAt(0).toUpperCase()}${player.slice(1)} adds ${words} mana of that color${each === '' ? '' : ` for each ${each}`}`;
}
