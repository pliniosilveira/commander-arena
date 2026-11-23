// A decklist that names the printings of its cards: the board draws those printings. Every Scryfall answer here is SYNTHETIC.
import { expect, test } from 'vitest';
import {
  commanderArtQuery,
  createPrintingLookup,
  findCommanderArt,
} from '../src/ui/board/commander-art';
import {
  commanderPrintingOf,
  printingOf,
  registerDeckPrintings,
} from '../src/ui/board/deck-printings';

const IMG = {
  small: 'https://cards.scryfall.io/small/front/p.jpg',
  normal: 'https://cards.scryfall.io/normal/front/p.jpg',
  art_crop: 'https://cards.scryfall.io/art_crop/front/p.jpg',
};

test('the commander line that names a printing gives its set and collector number', () => {
  const text = 'Commander\n1x Zed the Test (FDC) 6\n\nMainboard\n1x Forest (xyz) 12';
  expect(commanderPrintingOf(text)).toEqual({
    name: 'Zed the Test',
    printing: { set: 'fdc', collector: '6', explicit: false },
  });
  expect(commanderPrintingOf('Commander\n1x Zed the Test\n')).toBeNull();
});

test('a registered printing is found by the commander name, without case or back face', () => {
  registerDeckPrintings('Commander\n1x Two Faced (abc) 9\n');
  expect(printingOf('TWO FACED // Other Side')).toEqual({
    set: 'abc',
    collector: '9',
    explicit: false,
  });
  expect(printingOf('Never Registered')).toBeNull();
});

test('every card of the commander and main deck that names a printing is registered, and no other', () => {
  registerDeckPrintings(
    'Commander\n1x Lead Card (abc) 1\n\nMainboard\n1x Main Card (abc) 2\n1x Plain Card\n\nSideboard\n1x Side Card (abc) 3',
  );
  expect(printingOf('Lead Card')).toEqual({ set: 'abc', collector: '1', explicit: false });
  expect(printingOf('Main Card')).toEqual({ set: 'abc', collector: '2', explicit: false });
  expect(printingOf('Plain Card')).toBeNull();
  expect(printingOf('Side Card')).toBeNull();
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

test('the query can be limited to one set', () => {
  expect(commanderArtQuery('Zed the Test', 'fdc')).toContain('set:fdc');
  expect(commanderArtQuery('Zed the Test')).not.toContain('set:');
});

const art = (id: string) => ({ normal: `https://cards.scryfall.io/normal/front/${id}.jpg` });

function lookupsOf(answers: { inSet?: string; anywhere?: string; listed?: string }) {
  const asked: string[] = [];
  return {
    asked,
    lookups: {
      search: async (query: string) => {
        asked.push(query.includes('set:fdc') ? 'inSet' : 'anywhere');
        const id = query.includes('set:fdc') ? answers.inSet : answers.anywhere;
        return id === undefined ? null : art(id);
      },
      printing: async () => {
        asked.push('listed');
        return answers.listed === undefined ? null : art(answers.listed);
      },
    },
  };
}

const LISTED = { set: 'fdc', collector: '6' };

test('a special printing in the listed set wins, then one in another set, then the listed one', async () => {
  const a = lookupsOf({ inSet: 'in', anywhere: 'any', listed: 'list' });
  expect((await findCommanderArt('Zed the Test', LISTED, a.lookups))?.normal).toContain('/in.jpg');
  expect(a.asked).toEqual(['inSet']);
  const b = lookupsOf({ anywhere: 'any', listed: 'list' });
  expect((await findCommanderArt('Zed the Test', LISTED, b.lookups))?.normal).toContain('/any.jpg');
  expect(b.asked).toEqual(['inSet', 'anywhere']);
  const c = lookupsOf({ listed: 'list' });
  expect((await findCommanderArt('Zed the Test', LISTED, c.lookups))?.normal).toContain(
    '/list.jpg',
  );
  expect(c.asked).toEqual(['inSet', 'anywhere', 'listed']);
});

test('a list that names no printing searches any set and never asks for a listed one', async () => {
  const none = lookupsOf({});
  expect(await findCommanderArt('Zed the Test', null, none.lookups)).toBeNull();
  expect(none.asked).toEqual(['anywhere']);
});

test('a printing the player chose is asked for first, and a special one is the fallback', async () => {
  const chosen = { ...LISTED, explicit: true };
  const a = lookupsOf({ inSet: 'in', anywhere: 'any', listed: 'list' });
  expect((await findCommanderArt('Zed the Test', chosen, a.lookups))?.normal).toContain(
    '/list.jpg',
  );
  expect(a.asked).toEqual(['listed']);
  const b = lookupsOf({ inSet: 'in' });
  expect((await findCommanderArt('Zed the Test', chosen, b.lookups))?.normal).toContain('/in.jpg');
  expect(b.asked).toEqual(['listed', 'inSet']);
});
