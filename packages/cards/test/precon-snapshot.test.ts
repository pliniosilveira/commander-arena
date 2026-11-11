// The precon snapshot format. Every card here is SYNTHETIC: invented names and ids.
import { describe, expect, test } from 'vitest';
import {
  fromSnapshotCard,
  type PreconSnapshot,
  parsePreconSnapshot,
  type SnapshotCard,
  serializePreconSnapshot,
  toSnapshotCard,
} from '../src/index';

function synthetic(name: string, oracleId: string): SnapshotCard {
  return {
    oracleId,
    scryfallId: `${oracleId}-print`,
    name,
    layout: 'normal',
    faces: [
      {
        name,
        manaCost: '{1}{G}',
        typeLine: 'Creature — Synth',
        oracleText: 'Flying',
        power: '2',
        toughness: '2',
        loyalty: null,
        defense: null,
        colors: ['G'],
        imageUris: { normal: 'https://example.invalid/n.jpg', large: null, artCrop: null },
        artist: null,
      },
    ],
    cmc: 2,
    colorIdentity: ['G'],
    keywords: ['Flying'],
    producedMana: [],
    commanderLegality: 'legal',
    edhrecRank: null,
    gameChanger: null,
    relatedParts: [],
  };
}

const SNAPSHOT: PreconSnapshot = {
  id: 'synthetic-deck',
  name: 'SYNTHETIC Deck',
  blurb: 'A SYNTHETIC deck.',
  source: 'oracle.jsonl.gz',
  decklist: 'Commander\n1 SYNTHETIC B\n',
  cards: [synthetic('SYNTHETIC B', 'b'), synthetic('SYNTHETIC A', 'a')],
};

describe('serializePreconSnapshot', () => {
  test('sorts the cards by name and fixes the key order', () => {
    const text = serializePreconSnapshot(SNAPSHOT);
    expect(text.endsWith('}\n')).toBe(true);
    const parsed = JSON.parse(text);
    expect(Object.keys(parsed)).toEqual(['id', 'name', 'blurb', 'source', 'decklist', 'cards']);
    expect(parsed.cards.map((c: SnapshotCard) => c.name)).toEqual(['SYNTHETIC A', 'SYNTHETIC B']);
    expect(Object.keys(parsed.cards[0])).toEqual(Object.keys(synthetic('x', 'x')));
  });

  test('does not depend on the order of the input keys or cards', () => {
    const shuffled: PreconSnapshot = {
      cards: [...SNAPSHOT.cards].reverse(),
      decklist: SNAPSHOT.decklist,
      source: SNAPSHOT.source,
      blurb: SNAPSHOT.blurb,
      name: SNAPSHOT.name,
      id: SNAPSHOT.id,
    };
    expect(serializePreconSnapshot(shuffled)).toBe(serializePreconSnapshot(SNAPSHOT));
  });

  test('round-trips through parsePreconSnapshot', () => {
    const parsed = parsePreconSnapshot(JSON.parse(serializePreconSnapshot(SNAPSHOT)));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(serializePreconSnapshot(parsed.snapshot)).toBe(serializePreconSnapshot(SNAPSHOT));
  });
});

describe('parsePreconSnapshot', () => {
  test('refuses what is not a snapshot, with a short reason', () => {
    expect(parsePreconSnapshot(null)).toEqual({
      ok: false,
      error: 'not a precon snapshot (top level)',
    });
    const bad = JSON.parse(serializePreconSnapshot(SNAPSHOT));
    bad.id = 'Not An Id';
    expect(parsePreconSnapshot(bad)).toEqual({ ok: false, error: 'not a precon snapshot (id)' });
    const extra = JSON.parse(serializePreconSnapshot(SNAPSHOT));
    extra.cards[0].fetchedAt = 5;
    expect(parsePreconSnapshot(extra).ok).toBe(false);
    const noFaces = JSON.parse(serializePreconSnapshot(SNAPSHOT));
    noFaces.cards[0].faces = [];
    expect(parsePreconSnapshot(noFaces).ok).toBe(false);
  });
});

describe('snapshot cards', () => {
  test('a stored card loses its fetch time; reading one back sets it to 0', () => {
    const stored = { ...synthetic('SYNTHETIC A', 'a'), fetchedAt: 1_800_000_000_000 };
    const snapshotCard = toSnapshotCard(stored);
    expect('fetchedAt' in snapshotCard).toBe(false);
    expect(fromSnapshotCard(snapshotCard)).toEqual({
      ...synthetic('SYNTHETIC A', 'a'),
      fetchedAt: 0,
    });
  });
});
