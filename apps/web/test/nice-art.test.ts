// "Use a special-frame commander art": at import, a commander whose list names no printing gets the newest special one written on its
// line, so the saved deck, the board and the lists all agree. Printings here are SYNTHETIC.
import { expect, test } from 'vitest';
import type { CardPrint } from '../src/ui/import/card-prints';
import { printingInText } from '../src/ui/import/deck-text';
import { nicePrint, withNiceCommanderArt } from '../src/ui/import/nice-art';

const print = (over: Partial<CardPrint>): CardPrint => ({
  id: 'x',
  setCode: 'ABC',
  setName: 'Alpha',
  collector: '1',
  released: '2026-01-01',
  rarity: 'mythic',
  frames: [],
  foilOnly: false,
  renamed: false,
  small: null,
  normal: 'https://cards.scryfall.io/normal/front/x.jpg',
  large: 'https://cards.scryfall.io/large/front/x.jpg',
  artCrop: null,
  ...over,
});

test('the first special-frame printing in the order given is the nice one; a plain or renamed one is not', () => {
  expect(nicePrint([])).toBeNull();
  expect(nicePrint([print({ collector: '1' }), print({ collector: '2' })])).toBeNull();
  // A Universes Beyond reprint shows another name: the card on the table would look like another card.
  expect(nicePrint([print({ collector: '3', frames: ['Borderless'], renamed: true })])).toBeNull();
  const nice = nicePrint([
    print({ collector: '1' }),
    print({ collector: '2', setCode: 'FDC', frames: ['Borderless'] }),
    print({ collector: '3', frames: ['Showcase'] }),
  ]);
  expect(nice?.collector).toBe('2');
});

const LIST = ['Commander', '1 Zed the Test', '', 'Deck', '1 Plain Card', ''].join('\n');
const found = (prints: readonly CardPrint[]) => async () => prints;
const SPECIAL = [print({ setCode: 'FDC', collector: '6', frames: ['Borderless'] })];

test('a commander with no printing gets the nice one on its line, the rest of the list untouched', async () => {
  const asked: string[] = [];
  const next = await withNiceCommanderArt(LIST, async (name) => {
    asked.push(name);
    return SPECIAL;
  });
  expect(asked).toEqual(['Zed the Test']);
  expect(printingInText(next, 'Zed the Test')).toMatchObject({ set: 'fdc', collector: '6' });
  expect(next.split('\n').filter((l) => !l.includes('Zed'))).toEqual(
    LIST.split('\n').filter((l) => !l.includes('Zed')),
  );
});

test('a commander whose list names a printing is left as it is, and Scryfall is not asked', async () => {
  const named = LIST.replace('1 Zed the Test', '1 Zed the Test (abc) 9');
  let asked = 0;
  const next = await withNiceCommanderArt(named, async () => {
    asked += 1;
    return SPECIAL;
  });
  expect(next).toBe(named);
  expect(asked).toBe(0);
});

test('nothing changes when there is no special printing, no commander line, or Scryfall cannot be reached', async () => {
  expect(await withNiceCommanderArt(LIST, found([print({})]))).toBe(LIST);
  expect(await withNiceCommanderArt('1 Plain Card\n', found(SPECIAL))).toBe('1 Plain Card\n');
  expect(
    await withNiceCommanderArt(LIST, async () => {
      throw new Error('offline');
    }),
  ).toBe(LIST);
});
