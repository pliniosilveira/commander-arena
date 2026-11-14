import { describe, expect, test } from 'vitest';
import { parseStoredCard, scryfallCollectionSchema, toStoredCard } from '../src/scryfall';
import { syntheticCard, syntheticDoubleFaced, syntheticSplit } from './scryfall-helpers';

// SYNTHETIC card objects (see scryfall-helpers.ts).

const FETCHED_AT = 1_700_000_000_000;

describe('toStoredCard: a single-faced card', () => {
  const card = toStoredCard(syntheticCard('Synthetic Bear'), FETCHED_AT);

  test('keeps the stored fields', () => {
    expect(card).toMatchObject({
      oracleId: 'synthetic-oracle-synthetic-bear',
      scryfallId: 'synthetic-id-synthetic-bear',
      name: 'Synthetic Bear',
      layout: 'normal',
      cmc: 2,
      colorIdentity: ['G'],
      keywords: [],
      producedMana: ['G'],
      commanderLegality: 'legal',
      edhrecRank: 1234,
      gameChanger: false,
      fetchedAt: FETCHED_AT,
    });
  });

  test('synthesizes one face from the top-level fields, with the top-level image', () => {
    expect(card?.faces).toHaveLength(1);
    expect(card?.faces[0]).toEqual({
      name: 'Synthetic Bear',
      manaCost: '{1}{G}',
      typeLine: 'Creature — Synthetic Beast',
      oracleText: 'Synthetic rules text.',
      power: '2',
      toughness: '2',
      loyalty: null,
      defense: null,
      colors: ['G'],
      imageUris: {
        normal: 'https://cards.synthetic.invalid/synthetic-bear/normal.jpg',
        large: 'https://cards.synthetic.invalid/synthetic-bear/large.jpg',
        artCrop: 'https://cards.synthetic.invalid/synthetic-bear/art.jpg',
      },
      artist: 'Synthetic Artist',
    });
  });
});

describe('toStoredCard: faces and images', () => {
  test('a double-faced card takes name, text and image from each face', () => {
    const card = toStoredCard(syntheticDoubleFaced('Synthetic Front', 'Synthetic Back'), 1);
    expect(card?.name).toBe('Synthetic Front // Synthetic Back');
    expect(card?.layout).toBe('transform');
    expect(card?.faces.map((face) => face.name)).toEqual(['Synthetic Front', 'Synthetic Back']);
    expect(card?.faces.map((face) => face.oracleText)).toEqual([
      'Synthetic front text.',
      'Synthetic back text.',
    ]);
    expect(card?.faces.map((face) => face.colors)).toEqual([['R'], ['R', 'G']]);
    expect(card?.faces[0]?.imageUris?.normal).toContain('synthetic-front-front/normal');
    expect(card?.faces[1]?.imageUris?.normal).toContain('synthetic-back-back/normal');
    expect(card?.faces.map((face) => face.artist)).toEqual([
      'Synthetic Front Artist',
      'Synthetic Back Artist',
    ]);
  });

  test('a split card shares its top-level image between the faces', () => {
    const card = toStoredCard(syntheticSplit('Synthetic Left', 'Synthetic Right'), 1);
    expect(card?.faces).toHaveLength(2);
    const [left, right] = card?.faces ?? [];
    expect(left?.imageUris).toEqual(right?.imageUris);
    expect(left?.imageUris?.normal).toContain('synthetic-left-synthetic-right/normal');
    expect(left?.artist).toBe('Synthetic Split Artist');
  });

  test('a card without any image has null image uris', () => {
    const card = toStoredCard(syntheticCard('Synthetic Plain', { image_uris: undefined }), 1);
    expect(card?.faces[0]?.imageUris).toBeNull();
  });

  test('a missing image size is null, not invented', () => {
    const card = toStoredCard(
      syntheticCard('Synthetic Plain', { image_uris: { normal: 'https://x.invalid/n.jpg' } }),
      1,
    );
    expect(card?.faces[0]?.imageUris).toEqual({
      normal: 'https://x.invalid/n.jpg',
      large: null,
      artCrop: null,
    });
  });

  test('loyalty and defense reach the face', () => {
    const card = toStoredCard(
      syntheticCard('Synthetic Walker', { loyalty: '4', defense: '3', power: undefined }),
      1,
    );
    expect(card?.faces[0]).toMatchObject({ loyalty: '4', defense: '3', power: null });
  });
});

describe('toStoredCard: tolerance', () => {
  test('ignores unknown fields', () => {
    const raw = syntheticCard('Synthetic Bear', { brand_new_field: [1, 2, 3] });
    expect(toStoredCard(raw, 1)?.name).toBe('Synthetic Bear');
  });

  test('game_changer absent is null; present is kept', () => {
    expect(
      toStoredCard(syntheticCard('A', { game_changer: undefined }), 1)?.gameChanger,
    ).toBeNull();
    expect(toStoredCard(syntheticCard('A', { game_changer: true }), 1)?.gameChanger).toBe(true);
    expect(toStoredCard(syntheticCard('A', { game_changer: false }), 1)?.gameChanger).toBe(false);
  });

  test('missing optional fields get neutral values', () => {
    const minimal = {
      id: 'synthetic-id-min',
      oracle_id: 'synthetic-oracle-min',
      name: 'Synthetic Min',
    };
    expect(toStoredCard(minimal, 5)).toEqual({
      oracleId: 'synthetic-oracle-min',
      scryfallId: 'synthetic-id-min',
      name: 'Synthetic Min',
      layout: 'unknown',
      faces: [
        {
          name: 'Synthetic Min',
          manaCost: '',
          typeLine: '',
          oracleText: '',
          power: null,
          toughness: null,
          loyalty: null,
          defense: null,
          colors: [],
          imageUris: null,
          artist: null,
        },
      ],
      cmc: 0,
      colorIdentity: [],
      keywords: [],
      producedMana: [],
      commanderLegality: 'not_legal',
      edhrecRank: null,
      gameChanger: null,
      relatedParts: [],
      fetchedAt: 5,
    });
  });

  test('null fields (as Scryfall sends them) count as absent', () => {
    const raw = syntheticCard('A', { power: null, edhrec_rank: null, produced_mana: null });
    expect(toStoredCard(raw, 1)).toMatchObject({ edhrecRank: null, producedMana: [] });
  });

  test('a field of the wrong type is treated as absent, the card survives', () => {
    const raw = syntheticCard('A', { edhrec_rank: 'high', keywords: 'Flying', cmc: 'two' });
    expect(toStoredCard(raw, 1)).toMatchObject({ edhrecRank: null, keywords: [], cmc: 0 });
  });

  test('legalities: all four values are kept, an unknown value is not legal', () => {
    for (const value of ['legal', 'not_legal', 'banned', 'restricted'] as const) {
      const raw = syntheticCard('A', { legalities: { commander: value } });
      expect(toStoredCard(raw, 1)?.commanderLegality).toBe(value);
    }
    expect(
      toStoredCard(syntheticCard('A', { legalities: { commander: 'odd' } }), 1)?.commanderLegality,
    ).toBe('not_legal');
    expect(toStoredCard(syntheticCard('A', { legalities: undefined }), 1)?.commanderLegality).toBe(
      'not_legal',
    );
  });

  test('all_parts keeps names and components, and skips entries without a name', () => {
    const raw = syntheticCard('A', {
      all_parts: [
        { object: 'related_card', name: 'A', component: 'combo_piece', uri: 'x' },
        { object: 'related_card', name: 'Synthetic Token', component: 'token' },
        { object: 'related_card', component: 'token' },
      ],
    });
    expect(toStoredCard(raw, 1)?.relatedParts).toEqual([
      { name: 'A', component: 'combo_piece' },
      { name: 'Synthetic Token', component: 'token' },
    ]);
  });

  test('color letters are filtered to WUBRG', () => {
    const raw = syntheticCard('A', { color_identity: ['G', 'X', 'G', 'W'] });
    expect(toStoredCard(raw, 1)?.colorIdentity).toEqual(['G', 'W']);
  });

  test('the oracle id of a reversible card is read from its faces', () => {
    const raw = syntheticDoubleFaced('F', 'B', { oracle_id: undefined });
    (raw.card_faces as Record<string, unknown>[])[0] = {
      ...(raw.card_faces as Record<string, unknown>[])[0],
      oracle_id: 'synthetic-oracle-face',
    };
    expect(toStoredCard(raw, 1)?.oracleId).toBe('synthetic-oracle-face');
  });
});

describe('toStoredCard: rejection', () => {
  test.each([
    ['oracle_id', 'oracle_id'],
    ['name', 'name'],
    ['id', 'id'],
  ])('a card without %s is rejected with a reason', (field, mention) => {
    const raw = syntheticCard('Synthetic Bear', { [field]: undefined });
    const converted = parseStoredCard(raw, 1);
    expect(converted.card).toBeNull();
    expect(converted.reason).toContain(mention);
    expect(toStoredCard(raw, 1)).toBeNull();
  });

  test('something that is not an object is rejected', () => {
    expect(toStoredCard(null, 1)).toBeNull();
    expect(toStoredCard('card', 1)).toBeNull();
    expect(parseStoredCard(42, 1).reason).toBeTruthy();
  });

  test('an Scryfall error object is rejected', () => {
    expect(toStoredCard({ object: 'error', status: 404, code: 'not_found' }, 1)).toBeNull();
  });
});

describe('collection response schema', () => {
  test('reads data and not_found, ignoring other fields', () => {
    const parsed = scryfallCollectionSchema.parse({
      object: 'list',
      data: [syntheticCard('A')],
      not_found: [{ name: 'Nope' }],
      warnings: ['x'],
    });
    expect(parsed.data).toHaveLength(1);
    expect(parsed.not_found).toEqual([{ name: 'Nope' }]);
  });

  test('a missing not_found is fine', () => {
    expect(scryfallCollectionSchema.parse({ data: [] }).not_found ?? []).toEqual([]);
  });
});
