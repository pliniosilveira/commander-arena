// SYNTHETIC token definitions and Scryfall answers; no network or real card data.
import {
  fromSnapshotCard,
  importCard,
  parsePreconSnapshot,
  type RequestQueue,
  tokenSearchQuery as tokenQuery,
} from '@commander-arena/cards';
import { TOKEN_PRESETS, type TokenDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test, vi } from 'vitest';
import artifacts from '../src/precons/snapshots/artifacts.json';
import zombies from '../src/precons/snapshots/zombies.json';
import { createTokenArtLookup, parseTokenSearch } from '../src/ui/board/token-art';

const dragon: TokenDefinition = {
  ...TOKEN_PRESETS.Treasure,
  name: 'Dragon',
  types: ['creature'],
  subtypes: ['Dragon'],
  colors: ['R', 'G'],
  power: 1,
  toughness: 1,
  oracleText: 'Flying, devour 2',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'flying' } },
    { kind: 'keyword', keyword: { kind: 'devour', count: 2 } },
  ],
};
const images = {
  normal: 'https://cards.scryfall.io/normal/token.jpg',
  art_crop: 'https://cards.scryfall.io/art_crop/token.jpg',
};
const answer = { total_cards: 1, has_more: false, data: [{ image_uris: images }] };

describe('token search', () => {
  test('a real precon Zombie excludes enchantment and decayed variants', () => {
    const parsed = parsePreconSnapshot(zombies);
    if (!parsed.ok) throw new Error(parsed.error);
    const stored = parsed.snapshot.cards.find((card) => card.name === 'Moan of the Unhallowed');
    if (stored === undefined) throw new Error('Zombie maker missing from snapshot');
    const card = importCard(fromSnapshotCard(stored)).definition;
    const g = scenario().define(card).seat(0).hand(card.name).pool('CCBB').seat(1).build();
    g.act(0).cast(card.name, { pay: true });
    g.passAll();
    const zombie = g.view(0).battlefield.find((o) => o.name === 'Zombie')?.tokenDefinition;
    expect(zombie?.abilities).toEqual([]);
    expect(zombie?.oracleText).toBe('');
    expect(zombie && tokenQuery(zombie)).toBe(
      '!"Zombie" t:token layout:token t:/^token creature — Zombie$/ c=b pow=2 tou=2 -o:/./ game:paper unique:cards prefer:best',
    );
  });
  test("Sai's Thopter excludes double-faced token cards that duplicate its standalone image", () => {
    const parsed = parsePreconSnapshot(artifacts);
    if (!parsed.ok) throw new Error(parsed.error);
    const stored = parsed.snapshot.cards.find((card) => card.name === 'Sai, Master Thopterist');
    if (stored === undefined) throw new Error('Sai missing from artifacts snapshot');
    const card = importCard(fromSnapshotCard(stored)).definition;
    const g = scenario()
      .define(card)
      .seat(0)
      .battlefield(card.name)
      .hand('Sol Ring')
      .pool('C')
      .seat(1)
      .build();
    g.act(0).cast('Sol Ring', { pay: true });
    g.passAll();
    const thopter = g.view(0).battlefield.find((o) => o.name === 'Thopter')?.tokenDefinition;
    expect(thopter).toBeDefined();
    expect(thopter && tokenQuery(thopter)).toBe(
      '!"Thopter" t:token layout:token t:/^token artifact creature — Thopter$/ c=c pow=1 tou=1 o:"flying" game:paper unique:cards prefer:best',
    );
  });
  test('uses the exact name, types, exact colors, printed stats and ability words', () => {
    expect(tokenQuery(dragon)).toBe(
      '!"Dragon" t:token layout:token t:/^token creature — Dragon$/ c=rg pow=1 tou=1 o:"flying" o:"devour" game:paper unique:cards prefer:best',
    );
    expect(tokenQuery(TOKEN_PRESETS.Treasure)).toBe(
      '!"Treasure" t:token layout:token t:/^token artifact — Treasure$/ c=c game:paper unique:cards prefer:best',
    );
  });

  test('includes legendary and firebreathing; escapes names as query literals', () => {
    expect(
      tokenQuery({
        ...dragon,
        name: 'A "Dragon"',
        supertypes: ['legendary'],
        oracleText: '{R}: This token gets +1/+0 until end of turn.',
      }),
    ).toContain('!"A \\"Dragon\\"" t:token layout:token t:/^token legendary creature — Dragon$/');
    expect(tokenQuery({ ...dragon, oracleText: '+1/+0' })).toContain('o:"+1/+0"');
  });

  test('does not look up synthetic definitions or creature copies with a mana cost', () => {
    expect(tokenQuery({ ...dragon, name: 'SYNTHETIC Dragon' })).toBeNull();
    expect(tokenQuery({ ...dragon, manaCost: ['R'] })).toBeNull();
  });

  test('escapes subtype regex metacharacters and preserves abilities in textless definitions', () => {
    const query = tokenQuery({ ...dragon, subtypes: ['A/B', 'C.+'], oracleText: '' });
    expect(query).toContain('t:/^token creature — A\\/B C\\.\\+$/');
    expect(query).not.toContain('-o:/./');
    expect(tokenQuery({ ...dragon, subtypes: [], abilities: [], oracleText: '' })).toContain(
      't:/^token creature$/',
    );
    expect(tokenQuery({ ...dragon, abilities: [], oracleText: 'Some rules text.' })).not.toContain(
      '-o:/./',
    );
  });
});

describe('token answers', () => {
  test('uses only one unambiguous result and Scryfall HTTPS images', () => {
    expect(parseTokenSearch(answer)).toEqual(images);
    for (const bad of [
      null,
      {},
      { ...answer, total_cards: 0 },
      { ...answer, total_cards: 2 },
      { ...answer, has_more: true },
      { ...answer, data: [...answer.data, ...answer.data] },
      { ...answer, data: [{ image_uris: { normal: 'https://example.com/token.jpg' } }] },
      { ...answer, data: [{ image_uris: { normal: 'http://cards.scryfall.io/token.jpg' } }] },
    ]) {
      expect(parseTokenSearch(bad)).toBeNull();
    }
  });

  test('shares an in-flight lookup and all image sizes across token instances', async () => {
    const request = vi.fn<RequestQueue['request']>().mockResolvedValue({
      kind: 'response',
      status: 200,
      ok: true,
      json: answer,
      attempts: 1,
    });
    const lookup = createTokenArtLookup({ request });
    const query = tokenQuery(dragon) as string;
    const [a, b] = await Promise.all([lookup(query), lookup(query)]);
    expect(a).toEqual(images);
    expect(b).toEqual(a);
    await lookup(query);
    expect(request).toHaveBeenCalledTimes(1);
    const url = new URL(request.mock.calls[0]?.[0].url ?? '');
    expect(url.searchParams.get('q')).toBe(query);
  });

  test('remembers unsuccessful lookups and never rejects on network failure', async () => {
    const request = vi.fn<RequestQueue['request']>().mockRejectedValue(new Error('offline'));
    const lookup = createTokenArtLookup({ request });
    expect(await lookup('unmatched')).toBeNull();
    expect(await lookup('unmatched')).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
