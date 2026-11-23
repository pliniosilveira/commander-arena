/** Pure view-model of the deck screen: the cards of an import report grouped by card type. */
import type { StoredCard } from '@commander-arena/cards';
import type { ImportedEntry } from '../../import/types';

export const TYPE_GROUPS = [
  'Commander',
  'Creature',
  'Planeswalker',
  'Battle',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
  'Land',
  'Other',
] as const;
export type TypeGroup = (typeof TYPE_GROUPS)[number];

/** The group of a card: Land first (a land creature is a land), then the usual Commander order. */
const ORDER: readonly Exclude<TypeGroup, 'Commander' | 'Other'>[] = [
  'Land',
  'Creature',
  'Planeswalker',
  'Battle',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
];

export function typeGroupOf(card: StoredCard): Exclude<TypeGroup, 'Commander'> {
  const line = card.faces[0]?.typeLine ?? '';
  const types = line.split('—')[0] ?? '';
  return ORDER.find((t) => new RegExp(`\\b${t}\\b`).test(types)) ?? 'Other';
}

export interface DeckGroup {
  readonly group: TypeGroup;
  readonly entries: readonly ImportedEntry[];
  /** Copies, not distinct cards. */
  readonly count: number;
}

export function groupEntries(entries: readonly ImportedEntry[]): readonly DeckGroup[] {
  const buckets = new Map<TypeGroup, ImportedEntry[]>();
  for (const entry of entries) {
    const group = entry.section === 'commander' ? 'Commander' : typeGroupOf(entry.card.stored);
    buckets.set(group, [...(buckets.get(group) ?? []), entry]);
  }
  return TYPE_GROUPS.flatMap((group) => {
    const list = buckets.get(group);
    if (list === undefined) return [];
    const sorted = [...list].sort((a, b) => {
      const an = a.card.stored.name.toLowerCase();
      const bn = b.card.stored.name.toLowerCase();
      return an < bn ? -1 : an > bn ? 1 : 0;
    });
    return [{ group, entries: sorted, count: sorted.reduce((n, e) => n + e.count, 0) }];
  });
}

export function imageOf(card: StoredCard, size: 'normal' | 'large'): string | null {
  const uris = card.faces[0]?.imageUris;
  if (uris === null || uris === undefined) return null;
  return (size === 'large' ? (uris.large ?? uris.normal) : (uris.normal ?? uris.large)) ?? null;
}
