import { type CardLayout, SUPPORTED_FEATURES } from '@commander-arena/engine';
import type { StoredCard, StoredFace } from '../types';
import { parseTypeLine } from './type-line';

/** How many faces the engine's definition has for each layout it models (see validateCardStructure). */
const LAYOUT_FACES: Readonly<Record<string, { layout: CardLayout; faces: number }>> = {
  normal: { layout: 'normal', faces: 1 },
  saga: { layout: 'saga', faces: 1 },
  // CR 716 (stage P75, D-235): a Class, one face.
  class: { layout: 'class', faces: 1 },
  split: { layout: 'split', faces: 2 },
  adventure: { layout: 'adventure', faces: 2 },
  transform: { layout: 'transform', faces: 2 },
  modal_dfc: { layout: 'modal_dfc', faces: 2 },
  // CR 722 (stage P56, D-214): a preparation card, its prepare spell the second face.
  prepare: { layout: 'prepare', faces: 2 },
  // CR 701.42, 712.4 (D-991, D-994): a meld card is one card face in the data; the engine's definition adds the combined face of its pair as a second
  // face, which the importer reads from the card of that face (`convert/meld.ts`), so `faces` here counts the stored faces.
  meld: { layout: 'meld', faces: 1 },
};

export interface ResolvedLayout {
  readonly layout: CardLayout;
  /** The faces the definition has: all of them for a layout the engine models, else face 0. */
  readonly faces: readonly { readonly index: number; readonly face: StoredFace }[];
  /** Why the layout is not (fully) usable; empty for a card whose layout the engine runs. */
  readonly reasons: string[];
}

/**
 * The reasons the second face of an Adventure card is not an Adventure (CR 715.2): it must be an
 * instant or sorcery with the Adventure subtype. The engine checks the card type only, and says
 * `faces[1].types`; the subtype is the printed fact the face is told apart by.
 */
function adventureReasons(faces: ResolvedLayout['faces']): string[] {
  const second = faces[1];
  if (second === undefined) return [];
  const line = parseTypeLine(second.face.typeLine);
  const spell = line.types.includes('instant') || line.types.includes('sorcery');
  if (spell && line.subtypes.includes('Adventure')) return [];
  return [
    `layout "adventure": face ${second.index} (${second.face.name}) must be an instant or sorcery with the Adventure subtype`,
  ];
}

/**
 * Maps Scryfall's layout string to the engine's and decides whether the engine runs it. The gate is
 * the engine's own registry, `SUPPORTED_FEATURES.layouts`, read at call time: a layout the engine
 * starts to run and that `LAYOUT_FACES` already maps (saga) needs no change here (D-087); a layout
 * the engine adds to `CardLayout` needs its line in `LAYOUT_FACES`. Layouts the engine does not model (flip, leveler, prototype, token and so on) and layouts whose face count does not fit become `normal`
 * with face 0, a definition the engine can still load, together with a reason naming the layout.
 * A layout the engine models but does not list (saga before it ran, say) keeps all its faces and
 * says "is not supported yet"; `validateCard` would report the same.
 *
 * Scryfall's `split` also covers Fuse, Aftermath and Room cards; those are the engine's to refuse
 * (`layoutSupportIssues`, by the keyword line or a permanent half) and arrive from `validateCard`.
 */
export function resolveLayout(stored: StoredCard): ResolvedLayout {
  const all = stored.faces.map((face, index) => ({ index, face }));
  const entry = Object.hasOwn(LAYOUT_FACES, stored.layout)
    ? LAYOUT_FACES[stored.layout]
    : undefined;
  if (entry !== undefined && entry.faces === all.length) {
    const reasons: string[] = [];
    if (!SUPPORTED_FEATURES.layouts.includes(entry.layout)) {
      reasons.push(`layout "${stored.layout}" is not supported yet`);
    } else if (entry.layout === 'adventure') {
      reasons.push(...adventureReasons(all));
    }
    return { layout: entry.layout, faces: all, reasons };
  }
  const reasons =
    entry === undefined
      ? [`layout "${stored.layout}" is not supported`]
      : [`layout "${stored.layout}" needs ${entry.faces} face(s), found ${all.length}`];
  if (all.length === 0) reasons.push('card has no faces');
  return { layout: 'normal', faces: all.slice(0, 1), reasons };
}
