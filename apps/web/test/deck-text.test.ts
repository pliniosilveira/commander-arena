// The printing picker writes its choice into the deck's own text; the board then reads it back like any listed printing.
// Card names here are SYNTHETIC.
import { parseDecklist } from '@commander-arena/cards';
import { expect, test } from 'vitest';
import {
  commanderPrintingOf,
  printingOf,
  registerDeckPrintings,
} from '../src/ui/board/deck-printings';
import { printingInText, printingsInText, withPrinting } from '../src/ui/import/deck-text';

const TEXT = [
  'Commander',
  '1x Zed the Test (abc) 6',
  '',
  'Deck',
  '1 Plain Card',
  '2 Other Card (xyz) 12 *F*',
  '',
].join('\n');

test('a card with no printing gets one, marked as chosen, and the other lines stay as they were', () => {
  const next = withPrinting(TEXT, 'plain card', 'fdc', '6');
  expect(next?.split('\n')).toEqual([
    'Commander',
    '1x Zed the Test (abc) 6',
    '',
    'Deck',
    '1 Plain Card (fdc) 6 ^Chosen printing^',
    '2 Other Card (xyz) 12 *F*',
    '',
  ]);
  expect(printingInText(next ?? '', 'Plain Card')).toEqual({
    set: 'fdc',
    collector: '6',
    chosen: true,
  });
});

test('a listed printing is replaced, and a foil mark or an earlier choice is kept or replaced, not duplicated', () => {
  const a = withPrinting(TEXT, 'Other Card', 'abc', '7') ?? '';
  expect(a).toContain('2 Other Card *F* (abc) 7 ^Chosen printing^');
  const b = withPrinting(a, 'Other Card', 'def', '8') ?? '';
  expect(b).toContain('2 Other Card *F* (def) 8 ^Chosen printing^');
  expect(b.match(/Chosen printing/g)).toHaveLength(1);
  expect(parseDecklist(b).errors).toEqual([]);
});

test('a card the text does not list, or a collector number the line cannot hold, changes nothing', () => {
  expect(withPrinting(TEXT, 'Missing Card', 'fdc', '6')).toBeNull();
  expect(withPrinting(TEXT, 'Plain Card', 'fdc', '6*')).toBeNull();
});

test('a double-faced card is found by its front face and CRLF lines keep their ending', () => {
  const text = 'Deck\r\n1 Front Face // Back Face\r\n';
  expect(withPrinting(text, 'Front Face', 'abc', '9')).toBe(
    'Deck\r\n1 Front Face // Back Face (abc) 9 ^Chosen printing^\r\n',
  );
});

test('the board reads a chosen printing like any listed one', () => {
  const next = withPrinting(TEXT, 'Zed the Test', 'fdc', '6') ?? '';
  expect(commanderPrintingOf(next)?.printing).toEqual({ set: 'fdc', collector: '6' });
  registerDeckPrintings(next);
  expect(printingOf('Zed the Test')).toEqual({ set: 'fdc', collector: '6' });
  expect(printingOf('Other Card')).toEqual({ set: 'xyz', collector: '12' });
});

test('every listed printing is read by the lower-case front face of the card', () => {
  const all = printingsInText(
    'Commander\n1 Zed the Test (abc) 6\n\nDeck\n1 Front // Back (xyz) 9 ^Chosen printing^\n1 No Printing\n',
  );
  expect([...all.keys()]).toEqual(['zed the test', 'front']);
  expect(all.get('front')).toEqual({ set: 'xyz', collector: '9', chosen: true });
});
