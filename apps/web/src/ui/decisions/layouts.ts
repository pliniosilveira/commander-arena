/**
 * Multi-face cards at priority (split CR 709, Adventure CR 715, double-faced CR 712): the engine
 * lists one `castSpell` (or `playLand`) option per castable face of a card, told apart by `face`,
 * so a click can mean several things and the chooser asks which. The labels come from
 * `ObjectView.faces[face]`, the printed characteristics of each face, never from the card's name
 * (for a split card outside the stack that is "A // B"). A card with one option is acted on at
 * once, and the action carries the option's `face` either way.
 */
import type {
  Action,
  FaceView,
  ObjectId,
  ObjectView,
  PriorityDecision,
  PriorityOption,
} from '@commander-arena/engine';
import { typeLine } from '../format';
import { foretellCastLabel } from './alt-cost';
import type { Index } from './lookup';

export type CastOption = Extract<PriorityOption, { kind: 'castSpell' }>;
export type PlayOption = Extract<PriorityOption, { kind: 'playLand' }>;
export type Layout = NonNullable<ObjectView['layout']>;

/** The action for a `playLand` option: its `face` goes with it. */
export function playAction(option: PlayOption): Extract<Action, { kind: 'playLand' }> {
  return option.face === undefined
    ? { kind: 'playLand', object: option.object }
    : { kind: 'playLand', object: option.object, face: option.face };
}

/** Every cast and play option the decision lists for one object, in the engine's order. */
export function castPlayOptions(
  decision: PriorityDecision,
  id: ObjectId,
): readonly (CastOption | PlayOption)[] {
  return decision.options.filter(
    (o): o is CastOption | PlayOption =>
      (o.kind === 'castSpell' || o.kind === 'playLand') && o.object === id,
  );
}

/** "{1}{G}" for a face's mana cost; empty for a face with none (a land). */
export function faceCostText(face: FaceView): string {
  return (face.manaCost ?? []).map((s) => `{${s}}`).join('');
}

/** "{R} · Instant — Adventure": the cost and the type line, the second line of a chooser item. */
export function faceLine(face: FaceView): string {
  const cost = faceCostText(face);
  return cost === '' ? typeLine(face) : `${cost} · ${typeLine(face)}`;
}

/** "Adventure" for the Adventure of an Adventure card, so the cast says what it is. */
const isAdventureFace = (card: ObjectView, face: number): boolean =>
  card.layout === 'adventure' && face === 1;

/** What a chooser item is called: the verb and the face's own name, and the line under it. */
export interface FaceLabel {
  readonly label: string;
  readonly detail: string;
}

/**
 * The item for a `castSpell` or `playLand` option that names a face, or null when the card's view
 * has no such face (then the caller words it from the card's name, as for a single-faced card).
 * "Cast Chop (Adventure)", "Cast Singe", "Play Ridge Pass" and, for the creature of an Adventure
 * card cast from exile, "Cast Brawler Bear (from exile)".
 */
export function faceLabel(
  option: CastOption | PlayOption,
  card: ObjectView | undefined,
): FaceLabel | null {
  const face = option.face === undefined ? undefined : card?.faces?.[option.face];
  if (face === undefined || card === undefined || option.face === undefined) return null;
  if (option.kind === 'playLand') return { label: `Play ${face.name}`, detail: faceLine(face) };
  const how = isAdventureFace(card, option.face)
    ? ' (Adventure)'
    : card.zone === 'exile'
      ? ' (from exile)'
      : '';
  return { label: `Cast ${face.name}${how}`, detail: faceLine(face) };
}

/**
 * Objects in exile that the decision offers to cast or play: an Adventure card (CR 715.3d), a foretold card (D-128) and a card an effect
 * lets its controller play ("You may play that card this turn", D-151: a land is played, a spell is cast).
 */
export function exileCastObjects(decision: PriorityDecision, index: Index): ReadonlySet<ObjectId> {
  const ids = new Set<ObjectId>();
  for (const o of decision.options) {
    if (
      (o.kind === 'castSpell' || o.kind === 'playLand') &&
      index.get(o.object)?.zone === 'exile'
    ) {
      ids.add(o.object);
    }
  }
  return ids;
}

/** What a card in exile that may be played says: "Cast from exile" for a spell, "Play from exile" for a land (D-151, CR 305.1). */
export const CAST_FROM_EXILE = 'Cast from exile';
export const PLAY_FROM_EXILE = 'Play from exile';

/**
 * The badge a card in exile shows when it can be cast or played from there: "Cast from exile" for an Adventure or a card an effect lets
 * you play, "Play from exile" for such a land, "Cast for {R}" for a foretold card (D-128); null for anything else. `decision` tells a land
 * (its option is a `playLand`) from a spell.
 */
export function exileBadge(
  playable: ReadonlySet<ObjectId>,
  index: Index,
  id: ObjectId,
  decision?: PriorityDecision,
): string | null {
  const card = index.get(id);
  if (!playable.has(id) || card?.zone !== 'exile') return null;
  if (card.foretold === true) return foretellCastLabel(card);
  const land = decision?.options.some((o) => o.kind === 'playLand' && o.object === id) === true;
  return land ? PLAY_FROM_EXILE : CAST_FROM_EXILE;
}

/** What the top card of the library says when it may be cast from there (D-151, CR 601.3). */
export const CAST_FROM_LIBRARY = 'Cast from the top of your library';

/** The badge of the top card of the library when the decision offers to cast it; null for anything else. */
export function libraryBadge(
  playable: ReadonlySet<ObjectId>,
  index: Index,
  id: ObjectId,
): string | null {
  const card = index.get(id);
  return card?.zone === 'library' && playable.has(id) ? CAST_FROM_LIBRARY : null;
}

/** True for a transformed (or back-face-up) double-faced permanent or spell. */
export function isBackFaceUp(card: ObjectView): boolean {
  return (
    card.face === 1 &&
    (card.layout === 'transform' || card.layout === 'modal_dfc') &&
    (card.zone === 'battlefield' || card.zone === 'stack')
  );
}

/** True for a melded permanent (D-991, CR 701.42a, 712.4a): one object that two cards represent. */
export function isMelded(card: ObjectView): boolean {
  return card.meld !== undefined;
}

/** "Bruna, the Fading Light and Gisela, the Broken Blade": the names of the two cards a melded permanent is made of, in the order of the view. */
export function meldedFrom(card: ObjectView): string {
  return (card.meld?.components ?? []).map((c) => c.name).join(' and ');
}

/** What a face is in its card: "Front face", "Back face", "Adventure", "Split, left half". */
export function faceRole(layout: Layout, index: number): string {
  switch (layout) {
    case 'split':
      return index === 0 ? 'Split, left half' : 'Split, right half';
    case 'adventure':
      return index === 0 ? 'Card' : 'Adventure';
    case 'prepare':
      // CR 722.2a (D-214): the inset frame is the prepare spell.
      return index === 0 ? 'Card' : 'Prepare spell';
    default:
      return index === 0 ? 'Front face' : 'Back face';
  }
}

/** The facts about which face is up, for the preview's State line. */
export function faceFacts(card: ObjectView): string[] {
  const facts: string[] = [];
  if (card.onAdventure === true) facts.push('On an Adventure: it may be cast from exile');
  if (card.prepared === true) facts.push('Prepared: its prepare spell may be cast from exile');
  if (card.preparedSpell === true) {
    facts.push(
      'A copy of a prepare spell: it may be cast from exile while its permanent stays prepared',
    );
  }
  // D-991 (CR 701.42a, 712.8g, 202.3c): two cards, one permanent, with the mana value of the two front faces together.
  if (card.meld !== undefined) {
    facts.push(`Two cards, one permanent (melded from ${meldedFrom(card)})`);
    facts.push(`Mana value ${card.meld.manaValue}, the front faces together`);
  }
  if (card.face === undefined || card.faces === undefined) return facts;
  if (isBackFaceUp(card)) facts.push('Back face up');
  else if (isAdventureFace(card, card.face) && card.zone === 'stack') {
    facts.push('Cast as an Adventure');
  } else if (card.layout === 'split' && card.zone === 'stack') {
    facts.push(`Cast as ${card.faces[card.face]?.name ?? 'one half'}`);
  }
  return facts;
}
