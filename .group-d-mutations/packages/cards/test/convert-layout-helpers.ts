// Builders of SYNTHETIC multi-face stored cards in the shape Scryfall sends them (the name `A // B`,
// one face per half, `colors` on each face, no mana cost on a back face). Names and text are
// invented; nothing here is a real card.
import type { ColorLetter, StoredCard, StoredFace } from '../src/index';
import { syntheticCard, syntheticFace } from './convert-helpers';

/** A green 2/2 Bear creature face; `extra` overrides any field. */
export const creature = (name: string, extra: Partial<StoredFace> = {}): StoredFace =>
  syntheticFace({
    name,
    manaCost: '{1}{G}',
    typeLine: 'Creature — Bear',
    power: '2',
    toughness: '2',
    colors: ['G'],
    ...extra,
  });

/** A red {R} instant face with the given text; `extra` overrides any field. */
export const instant = (
  name: string,
  oracleText: string,
  extra: Partial<StoredFace> = {},
): StoredFace =>
  syntheticFace({
    name,
    manaCost: '{R}',
    typeLine: 'Instant',
    oracleText,
    colors: ['R'],
    ...extra,
  });

/** A card of the layout with these faces; its name is the face names joined as Scryfall writes it. */
export function multi(
  layout: string,
  faces: readonly StoredFace[],
  colorIdentity: readonly ColorLetter[] = ['G'],
): StoredCard {
  return syntheticCard(
    {},
    { name: faces.map((f) => f.name).join(' // '), layout, faces, colorIdentity },
  );
}
