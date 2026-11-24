// A decklist that names the printings of its cards: the board draws those printings. Every Scryfall answer here is SYNTHETIC.
import { expect, test } from 'vitest';
import { createPrintingLookup } from '../src/ui/board/commander-art';
import { commanderPrintingOf, printingOf, setGamePrintings } from '../src/ui/board/deck-printings';

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
  setGamePrintings(['Commander\n1x Two Faced (abc) 9\n']);
  expect(printingOf('TWO FACED // Other Side')).toEqual({
    set: 'abc',
    collector: '9',
  });
  expect(printingOf('Never Registered')).toBeNull();
});

test('every card of the commander and main deck that names a printing is registered, and no other', () => {
  setGamePrintings([
    'Commander\n1x Lead Card (abc) 1\n\nMainboard\n1x Main Card (abc) 2\n1x Plain Card\n\nSideboard\n1x Side Card (abc) 3',
  ]);
  expect(printingOf('Lead Card')).toEqual({ set: 'abc', collector: '1' });
  expect(printingOf('Main Card')).toEqual({ set: 'abc', collector: '2' });
  expect(printingOf('Plain Card')).toBeNull();
  expect(printingOf('Side Card')).toBeNull();
});

test('on a card both decks name, a basic land above all, the last list is the one drawn, and a game leaves nothing for the next', () => {
  const opponent =
    'Commander\n1x Opp Leader (abc) 1\n\nMainboard\n30x Plains (old) 5\n1x Opp Only (old) 7';
  const mine = 'Commander\n1x My Leader (abc) 2\n\nMainboard\n30x Plains (bbb) 2 ^Chosen printing^';
  setGamePrintings([opponent, mine]);
  expect(printingOf('Plains')).toEqual({ set: 'bbb', collector: '2' });
  expect(printingOf('Opp Only')).toEqual({ set: 'old', collector: '7' });
  // The next game starts from nothing: the opponent's printing of a card the new decks do not name is gone.
  setGamePrintings([mine]);
  expect(printingOf('Opp Only')).toBeNull();
  setGamePrintings([]);
  expect(printingOf('Plains')).toBeNull();
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

test('a printing of another card is not used; one under another printed name, which the list chose, is', async () => {
  const other = createPrintingLookup(queueOf({ name: 'Someone Else', image_uris: IMG }));
  expect(await other('fdc', '6', 'Zed the Test')).toBeNull();
  const renamed = createPrintingLookup(
    queueOf({ name: 'Zed the Test', printed_name: 'Renamed', image_uris: IMG }),
  );
  expect((await renamed('sld', '1', 'Zed the Test'))?.normal).toContain('/p.jpg');
});
