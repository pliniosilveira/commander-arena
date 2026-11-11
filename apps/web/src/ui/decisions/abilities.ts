/**
 * Activated abilities at priority (CR 602): what clicking a card or permanent offers when the
 * engine lists `activate` options for it. One thing to do means doing it; several (cast or play
 * plus an ability, several abilities) mean a small menu, and the existing target and payment
 * flows take over once an item is chosen.
 */
import type { Action, ObjectId, PriorityDecision } from '@commander-arena/engine';
import { specialActionDetail, specialActionLabel } from '../../game/later-text';
import { activationLabel } from './ability-label';
import { castAction, castLabel } from './flashback';
import { type CastOption, castPlayOptions, faceLabel, playAction } from './layouts';
import { type Index, nameOf } from './lookup';
import { lifeCostOf, lifeNote, manaChoiceLabel } from './mana-choice';

/** One entry of the ability chooser. */
export interface MenuItem {
  readonly key: string;
  readonly label: string;
  /** A second line under the label: the cost and type line of a face (layouts.ts). */
  readonly detail?: string;
  readonly action: Action;
}

type ManaOption = Extract<PriorityDecision['options'][number], { kind: 'activateAbility' }>;

/** The action of a mana ability option: its color or, for a filter land, its combination (D-099). */
export function manaAction(
  source: ObjectId,
  o: ManaOption,
): Extract<Action, { kind: 'activateAbility' }> {
  return {
    kind: 'activateAbility',
    source,
    abilityIndex: o.abilityIndex,
    color: o.color,
    ...(o.combination === undefined ? {} : { combination: o.combination }),
    ...(o.sacrifice === undefined ? {} : { sacrifice: o.sacrifice }),
  };
}

/** True when the decision has an `activate` option for this object. */
export function hasActivation(decision: PriorityDecision, id: ObjectId): boolean {
  return decision.options.some((o) => o.kind === 'activate' && o.object === id);
}

/** True when the decision lists a special action (Suspend, Foretell: D-128) for this card in the hand. */
export function hasSpecialAction(decision: PriorityDecision, id: ObjectId): boolean {
  return decision.options.some(
    (o) => (o.kind === 'suspend' || o.kind === 'foretell') && o.object === id,
  );
}

/** One key for each cast option of a card: its face and its alternative cost tell them apart. */
export const castKey = (o: CastOption): string =>
  [
    'cast',
    ...(o.face === undefined ? [] : ['face', String(o.face)]),
    ...(o.alternative === undefined ? [] : [o.alternative]),
  ].join('-');

/**
 * Everything a click on `id` may do, in the order the menu lists it: cast or play first, then the
 * activated abilities in the card's order, then mana abilities. `index` gives the card's name and
 * its abilities for the labels; without it a label falls back to the ability's number.
 */
export function menuItems(decision: PriorityDecision, id: ObjectId, index?: Index): MenuItem[] {
  const card = index?.get(id);
  const name = index === undefined ? 'it' : nameOf(index, id);
  const items: MenuItem[] = [];
  for (const o of castPlayOptions(decision, id)) {
    // An option that names a face of a multi-face card is one item per face, with the face's own
    // name, cost and type line (layouts.ts); anything else is worded from the card's name.
    const face = faceLabel(o, card);
    const detail = face === null ? {} : { detail: face.detail };
    if (o.kind === 'castSpell') {
      items.push({
        key: castKey(o),
        label: castLabel(o, card, name),
        ...detail,
        action: castAction(o),
      });
    } else {
      items.push({
        key: o.face === undefined ? 'play' : `play-face-${o.face}`,
        // D-151 (CR 305.1): a land an effect lets you play from exile says where it is.
        label: face?.label ?? `Play ${name}${card?.zone === 'exile' ? ' from exile' : ''}`,
        ...detail,
        action: playAction(o),
      });
    }
  }
  // The special actions of a card in the hand (CR 116.2f, 116.2h): "Suspend 2 — {1}{B}", "Foretell {2}".
  for (const o of decision.options) {
    if ((o.kind !== 'suspend' && o.kind !== 'foretell') || o.object !== id) continue;
    items.push({
      key: o.kind,
      label: specialActionLabel(o.kind, card),
      detail: specialActionDetail(o.kind, card),
      action: { kind: o.kind, object: id },
    });
  }
  for (const o of decision.options) {
    if (o.kind !== 'activate' || o.object !== id) continue;
    const entry = card?.activated?.find((a) => a.abilityIndex === o.abilityIndex);
    items.push({
      key: `activate-${o.abilityIndex}`,
      label: entry === undefined ? `Ability ${o.abilityIndex + 1}` : activationLabel(card, entry),
      action: { kind: 'activate', object: id, abilityIndex: o.abilityIndex },
    });
  }
  for (const o of decision.options) {
    if (o.kind !== 'activateAbility' || o.source !== id) continue;
    const life = lifeNote(lifeCostOf(card, o.color, o.combination));
    const base =
      o.color === null && o.combination === undefined
        ? `Mana ability ${o.abilityIndex + 1}`
        : manaChoiceLabel(o.abilityIndex, o.color, o.combination);
    // D-222: one item for each permanent a cost "Sacrifice a Spirit" may give up.
    const what =
      o.sacrifice === undefined
        ? base
        : `${base}, sacrificing ${index === undefined ? 'it' : nameOf(index, o.sacrifice)}`;
    items.push({
      key: `mana-${o.abilityIndex}-${o.combination?.join('') ?? o.color ?? 'x'}${o.sacrifice === undefined ? '' : `-${o.sacrifice}`}`,
      label: life === '' ? what : `${what} (${life.toLowerCase()})`,
      action: manaAction(id, o),
    });
  }
  return items;
}
