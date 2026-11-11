/**
 * The Text size setting (issue 43): Normal or Large, Large by default. CSS scales the fonts through
 * `--text-scale`; the board scales tile and hand card sizes by the same factor, where there is room.
 */
import { afterEach, describe, expect, test } from 'vitest';
import { handScale, handStep } from '../src/ui/board/layout';
import { rowSpec } from '../src/ui/board/Row';
import {
  currentTextSize,
  readStoredTextSize,
  setTextSize,
  TEXT_SCALES,
} from '../src/ui/panels/text-size';

type Storage = { getItem(k: string): string | null; setItem(k: string, v: string): void };

function fakeWindow(store: Map<string, string> | null) {
  const localStorage: Storage =
    store === null
      ? {
          getItem() {
            throw new Error('blocked');
          },
          setItem() {
            throw new Error('blocked');
          },
        }
      : { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) };
  Object.assign(globalThis, { window: { localStorage } });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
  setTextSize('large', false);
});

describe('the text size setting', () => {
  test('Large grows the scale by a fifth, Normal is the old size', () => {
    expect(TEXT_SCALES.normal).toBe(1);
    expect(TEXT_SCALES.large).toBeGreaterThanOrEqual(1.15);
    expect(TEXT_SCALES.large).toBeLessThanOrEqual(1.25);
  });

  test('the choice is remembered and read back', () => {
    const store = new Map<string, string>();
    fakeWindow(store);
    expect(readStoredTextSize()).toBeNull();
    setTextSize('normal', true);
    expect(currentTextSize()).toBe('normal');
    expect(store.get('commander-arena.text-size')).toBe('normal');
    expect(readStoredTextSize()).toBe('normal');
  });

  test('a choice that is not remembered still applies, and unreadable storage is no error', () => {
    fakeWindow(null);
    expect(readStoredTextSize()).toBeNull();
    expect(() => setTextSize('normal', true)).not.toThrow();
    expect(currentTextSize()).toBe('normal');
  });

  test('garbage in storage is ignored', () => {
    fakeWindow(new Map([['commander-arena.text-size', 'huge']]));
    expect(readStoredTextSize()).toBeNull();
  });
});

describe('tile sizes follow the text size', () => {
  test('a row with room grows its tiles by the scale; a short row never grows past its room', () => {
    const roomy = rowSpec('creature', 400);
    const roomyLarge = rowSpec('creature', 400, 0, TEXT_SCALES.large);
    expect(roomyLarge.tileH).toBe(Math.round(roomy.tileH * TEXT_SCALES.large));
    expect(roomyLarge.preferredW).toBeGreaterThan(roomy.preferredW);
    const short = rowSpec('creature', 100);
    expect(rowSpec('creature', 100, 0, TEXT_SCALES.large).tileH).toBe(short.tileH);
  });

  test('the minimum width a tile may shrink to grows with the text', () => {
    expect(rowSpec('creature', 400, 0, 1.2).minW).toBeGreaterThan(rowSpec('creature', 400).minW);
  });
});

describe('hand cards follow the text size while the fan keeps their middles visible', () => {
  test('a short hand takes the whole factor, a long one stays near the normal size', () => {
    expect(handScale(1, 108, 510, 1.2)).toBe(1.2);
    expect(handScale(4, 108, 510, 1.2)).toBe(1.2);
    // 7 cards in the 510 px left of the dock at 1366: larger cards would hide each other's middle.
    expect(handScale(7, 108, 510, 1.2)).toBe(1);
    // Never below the normal size, whatever the room.
    expect(handScale(20, 108, 510, 1.2)).toBe(1);
    // With room (1920 wide) seven cards take the whole factor.
    expect(handScale(7, 108, 1064, 1.2)).toBe(1.2);
  });

  test('the step that goes with it leaves more than half of each card showing', () => {
    for (const count of [2, 5, 7, 9, 11]) {
      const scale = handScale(count, 108, 510, 1.2);
      const cardW = Math.round(108 * scale);
      const step = handStep(count, cardW, 510);
      // Either the card is at its normal size, or a lifted neighbour (1.1 of a width) leaves its middle.
      expect(cardW === 108 || step >= 0.65 * cardW).toBe(true);
    }
  });

  test('the normal setting never changes the hand', () => {
    expect(handScale(7, 108, 510, 1)).toBe(1);
    expect(handScale(1, 108, 510, 1)).toBe(1);
  });
});
