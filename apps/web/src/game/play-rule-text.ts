/**
 * The four play-rule static abilities (D-125) in words, composed from the AST node and never from a card
 * name: additional land drops (CR 305.2), looking at the top card of the library (CR 401.5), the cost of
 * attacking (CR 508.1h) and the optional untap (CR 502.3). The host reads them off the printed face of a
 * visible permanent (`staticNotes`), because `ObjectView` carries no static abilities of its own.
 */
import type { Ability, StaticEffect } from '@commander-arena/engine';
import { activationCostText } from './cost-text';

const NUMBER_WORDS: readonly string[] = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];

/** "an additional land", "two additional lands". */
function additionalLands(count: number): string {
  if (count === 1) return 'an additional land';
  return `${NUMBER_WORDS[count] ?? String(count)} additional lands`;
}

/** The sentence of one play-rule static effect, without the final period; null for any other effect. */
export function staticWording(effect: StaticEffect): string | null {
  switch (effect.kind) {
    case 'additionalLandDrops':
      return effect.eachPlayer === true
        ? `Each player may play ${additionalLands(effect.count)} on each of their turns`
        : `You may play ${additionalLands(effect.count)} on each of your turns`;
    case 'lookAtTopOfLibrary':
      return 'You may look at the top card of your library any time';
    case 'attackTax': {
      const cost = activationCostText(effect.cost);
      return effect.planeswalkers === true
        ? `Creatures can't attack you or planeswalkers you control unless their controller pays ${cost} for each of those creatures`
        : `Creatures can't attack you unless their controller pays ${cost} for each creature they control that's attacking you`;
    }
    case 'optionalUntap':
      return 'You may choose not to untap this permanent during your untap step';
    case 'untapInOthersUntapStep':
      return "Untap all creatures you control during each other player's untap step";
    default:
      return null;
  }
}

/** The sentences of the play-rule static abilities among `abilities`, in order; empty for none. */
export function playRuleWordings(abilities: readonly Ability[]): readonly string[] {
  return abilities.flatMap((a) => {
    const text = a.kind === 'static' ? staticWording(a.static) : null;
    return text === null ? [] : [`${text}.`];
  });
}
