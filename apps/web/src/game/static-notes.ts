/**
 * The words of the play-rule static abilities of the visible permanents (D-125), by object id. The engine's
 * view carries no static abilities, so the host reads each battlefield permanent's printed face and sends the
 * page a note for the ones that have any of the four (`playRuleWordings`) or a lord, grant, restriction,
 * condition or death replacement (`lordWordings`, D-133). The battlefield is looked at, and the graveyards
 * for the permission to cast from there, and only objects the viewer can see, so nothing hidden is named. A permanent that lost its abilities
 * still shows its printed ones: the view does not say, and the note is the card's text, not a ruling.
 */
import type { GameState, GameView } from '@commander-arena/engine';
import { manaRestrictionWordings } from './angels-text';
import { nounOfTypes } from './artifacts-text';
import { manaInsteadWordings } from './dinosaurs-text';
import { graveyardWordings } from './graveyard-notes';
import { playRuleWordings } from './play-rule-text';
import { lordWordings } from './static-text';

export function staticNotes(
  state: GameState,
  view: GameView,
): Readonly<Record<string, readonly string[]>> {
  const notes: Record<string, readonly string[]> = {};
  for (const o of view.battlefield) {
    if (o.isToken) continue;
    const obj = state.objects[o.id];
    // CR 708.2 (D-965): a face-down permanent has no abilities to put in words: its card's rules are nobody's to read.
    if (obj?.faceDown !== undefined) continue;
    const card = obj?.card === null || obj === undefined ? undefined : state.cards[obj.card];
    const face =
      card === undefined ? undefined : state.definitions[card.definition]?.faces?.[obj?.face ?? 0];
    if (face === undefined) continue;
    const words = [
      ...playRuleWordings(face.abilities),
      // D-133: lords, grants, restrictions, conditions and the replacement of a death.
      ...lordWordings(face.abilities, { noun: nounOfTypes(o.types), subtypes: o.subtypes }),
      // D-145 (CR 605.3b): "... If you control a creature with power 4 or greater, add two mana of any one color instead."
      ...manaInsteadWordings(face.abilities),
      // D-149 (CR 106.6): "Spend this mana only to cast an Angel spell", "Add one mana of the chosen color".
      ...manaRestrictionWordings(face.abilities),
    ];
    if (words.length > 0) notes[o.id] = words;
  }
  // D-133: a card in a graveyard says what lets it be cast from there (the graveyards are public).
  for (const seat of view.seats) {
    for (const o of seat.graveyard) {
      if (o.isToken) continue;
      const obj = state.objects[o.id];
      const card = obj?.card === null || obj === undefined ? undefined : state.cards[obj.card];
      const face = card === undefined ? undefined : state.definitions[card.definition]?.faces?.[0];
      if (face === undefined) continue;
      // D-151 (CR 113.6b): and what it does from there (an ability marked `functionsIn: 'graveyard'`).
      const words = graveyardWordings(face.abilities, o);
      if (words.length > 0) notes[o.id] = words;
    }
  }
  return notes;
}
