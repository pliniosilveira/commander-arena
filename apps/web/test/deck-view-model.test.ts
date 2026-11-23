import type { StoredCard } from '@commander-arena/cards';
import { describe, expect, test } from 'vitest';
import type { ImportedEntry } from '../src/import/types';
import { groupEntries, typeGroupOf } from '../src/ui/import/deck-view-model';

/** SYNTHETIC cards: only the fields the grouping reads. */
function card(name: string, typeLine: string, cmc = 0): StoredCard {
  return { name, cmc, faces: [{ name, typeLine, imageUris: null }] } as unknown as StoredCard;
}
function entry(c: StoredCard, section: 'commander' | 'main' = 'main', count = 1): ImportedEntry {
  return { card: { stored: c }, count, section } as unknown as ImportedEntry;
}

describe('deck screen grouping', () => {
  test('a land creature is a land; an artifact creature is a creature', () => {
    expect(typeGroupOf(card('A', 'Land Creature — Dryad'))).toBe('Land');
    expect(typeGroupOf(card('B', 'Artifact Creature — Golem'))).toBe('Creature');
    expect(typeGroupOf(card('C', 'Legendary Enchantment — Saga'))).toBe('Enchantment');
  });

  test('groups in a fixed order, commander first, sorted alphabetically', () => {
    const groups = groupEntries([
      entry(card('Forest', 'Basic Land — Forest'), 'main', 5),
      entry(card('Big', 'Creature — Giant', 5)),
      entry(card('Small', 'Creature — Elf', 1)),
      entry(card('Boss', 'Legendary Creature — Elf', 3), 'commander'),
    ]);
    expect(groups.map((g) => g.group)).toEqual(['Commander', 'Creature', 'Land']);
    expect(groups[1]?.entries.map((e) => e.card.stored.name)).toEqual(['Big', 'Small']);
    expect(groups[2]?.count).toBe(5);
  });
});
