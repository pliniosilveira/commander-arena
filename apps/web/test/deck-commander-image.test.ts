import { expect, test } from 'vitest';
import { deckChoices, infoOf, SHIPPED } from '../src/precons';

test('a shipped precon lists its commander art, and an edit to another commander drops it', () => {
  const infos = SHIPPED.snapshots.map(infoOf);
  const withArt = infos.find((i) => i.commanderImage !== undefined);
  expect(withArt?.commanderImage).toMatch(/^https:\/\/cards\.scryfall\.io\/art_crop\//);
  if (withArt === undefined) return;
  const [choice] = deckChoices([withArt], [], []);
  expect(choice?.commanderImage).toBe(withArt.commanderImage);
  expect(choice?.colors).toEqual(withArt.colors);
  expect(withArt.colors?.every((c) => 'WUBRG'.includes(c))).toBe(true);
  const edited = deckChoices(
    [withArt],
    [
      {
        id: 'o',
        name: withArt.name,
        text: 'Commander\n1 Some Other Commander\n',
        preconId: withArt.id,
      } as never,
    ],
    [],
  );
  expect(edited[0]?.commanderImage).toBeUndefined();
  expect(edited[0]?.colors).toBeUndefined();
});

test('a saved deck gets the art and colors of its commander from the looked-up cards', () => {
  const saved = [{ id: 's1', name: 'Mine', text: 'Commander\n1 Some Commander\n', savedAt: '' }];
  const looks = new Map([['Some Commander', { image: 'https://x/art.jpg', colors: ['U', 'R'] }]]);
  const [choice] = deckChoices([], [], saved, looks);
  expect(choice?.commanderImage).toBe('https://x/art.jpg');
  expect(choice?.colors).toEqual(['U', 'R']);
  expect(deckChoices([], [], saved)[0]?.colors).toBeUndefined();
});
