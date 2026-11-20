// A decklist that names its commander's printing: the board draws that printing. Every Scryfall answer here is SYNTHETIC.
import { expect, test } from 'vitest';
import { createPrintingLookup } from '../src/ui/board/commander-art';
import {
  commanderPrintingOf,
  printingOfCommander,
  registerCommanderPrinting,
} from '../src/ui/board/commander-printing';

const IMG = {
  small: 'https://cards.scryfall.io/small/front/p.jpg',
  normal: 'https://cards.scryfall.io/normal/front/p.jpg',
  art_crop: 'https://cards.scryfall.io/art_crop/front/p.jpg',
};

test('the commander line that names a printing gives its set and collector number', () => {
  const text = 'Commander\n1x Zed the Test (FDC) 6\n\nMainboard\n1x Forest (xyz) 12';
  expect(commanderPrintingOf(text)).toEqual({
    name: 'Zed the Test',
    printing: { set: 'fdc', collector: '6' },
  });
  expect(commanderPrintingOf('Commander\n1x Zed the Test\n')).toBeNull();
});

test('a registered printing is found by the commander name, without case or back face', () => {
  registerCommanderPrinting('Commander\n1x Two Faced (abc) 9\n');
  expect(printingOfCommander('TWO FACED // Other Side')).toEqual({ set: 'abc', collector: '9' });
  expect(printingOfCommander('Never Registered')).toBeNull();
});

const queueOf = (json: unknown, urls: string[] = []) => ({
  request: async ({ url }: { url: string }) => {
    urls.push(url);
    return { kind: 'response' as const, status: 200, ok: true, attempts: 1, json };
  },
});

test('the printing lookup asks for the set and number, once, and takes the pictures', async () => {
  const urls: string[] = [];
  const lookup = createPrintingLookup(queueOf({ name: 'Zed the Test', image_uris: IMG }, urls));
  expect((await lookup('fdc', '6', 'Zed the Test'))?.normal).toContain('/p.jpg');
  await lookup('fdc', '6', 'Zed the Test');
  expect(urls).toEqual(['https://api.scryfall.com/cards/fdc/6']);
});

test('a printing of another card or under another printed name is not used', async () => {
  const other = createPrintingLookup(queueOf({ name: 'Someone Else', image_uris: IMG }));
  expect(await other('fdc', '6', 'Zed the Test')).toBeNull();
  const renamed = createPrintingLookup(
    queueOf({ name: 'Zed the Test', printed_name: 'Renamed', image_uris: IMG }),
  );
  expect(await renamed('sld', '1', 'Zed the Test')).toBeNull();
});
