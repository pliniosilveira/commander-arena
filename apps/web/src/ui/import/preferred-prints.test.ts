import { describe, expect, it } from 'vitest';
import { printingsInText, withPreferredPrintings } from './deck-text';

const prefs = new Map([['sol ring', { set: 'c21', collector: '263' }]]);

describe('withPreferredPrintings', () => {
  it('writes the printing chosen for all decks onto the card line', () => {
    const out = withPreferredPrintings('1 Sol Ring\n1 Island\n', prefs);
    expect(printingsInText(out).get('sol ring')).toEqual({
      set: 'c21',
      collector: '263',
      chosen: true,
    });
    expect(printingsInText(out).has('island')).toBe(false);
  });

  it('replaces the printing an export listed', () => {
    const out = withPreferredPrintings('1 Sol Ring (cmm) 400\n', prefs);
    expect(printingsInText(out).get('sol ring')?.set).toBe('c21');
  });

  it('keeps a printing already chosen in this very list', () => {
    const text = '1 Sol Ring (lea) 1 ^Chosen printing^\n';
    expect(withPreferredPrintings(text, prefs)).toBe(text);
  });

  it('is the identity without preferences', () => {
    expect(withPreferredPrintings('1 Sol Ring\n', new Map())).toBe('1 Sol Ring\n');
  });
});
