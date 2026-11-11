import { describe, expect, test } from 'vitest';
import { placePopover } from '../src/ui/decisions/popover-place';

/** Issue 85: the Cast / Cycling bubble was always under the card, and out of sight under a hand card. */
const size = { width: 200, height: 90 };
const bounds = { width: 900, height: 700 };

describe('placePopover', () => {
  test('under the card when the whole popover fits there', () => {
    const place = placePopover({ left: 100, top: 200, bottom: 300 }, size, bounds);
    expect(place).toEqual({ left: 100, top: 304, side: 'below' });
  });

  test('above the card when under it does not fit (a card at the foot of the window)', () => {
    // A hand card: its top is 108px above the edge of the layer and its foot is below the edge.
    const place = placePopover({ left: 100, top: 592, bottom: 742 }, size, bounds);
    expect(place.side).toBe('above');
    expect(place.top).toBe(592 - 4 - size.height);
    expect(place.top + size.height).toBeLessThanOrEqual(592);
  });

  test('under the card when it just fits, above it when one pixel more does not', () => {
    const fits = placePopover({ left: 0, top: 400, bottom: 602 }, size, bounds);
    expect(fits.side).toBe('below');
    expect(fits.top + size.height).toBeLessThanOrEqual(bounds.height - 4);
    const tight = placePopover({ left: 0, top: 400, bottom: 603 }, size, bounds);
    expect(tight.side).toBe('above');
  });

  test('pushed in from the right edge and from the left edge', () => {
    expect(placePopover({ left: 850, top: 100, bottom: 180 }, size, bounds).left).toBe(
      bounds.width - size.width - 4,
    );
    expect(placePopover({ left: -30, top: 100, bottom: 180 }, size, bounds).left).toBe(4);
  });

  test('inside the box, on the card, when neither side has room', () => {
    const small = { width: 900, height: 120 };
    const place = placePopover({ left: 10, top: 40, bottom: 110 }, size, small);
    expect(place.side).toBe('inside');
    expect(place.top).toBeGreaterThanOrEqual(4);
    expect(place.top + size.height).toBeLessThanOrEqual(small.height);
  });

  test('taller than the box: pinned to the top edge', () => {
    const place = placePopover(
      { left: 10, top: 40, bottom: 110 },
      { width: 200, height: 400 },
      { width: 900, height: 300 },
    );
    expect(place.top).toBe(4);
  });

  test('every result stays in the box for a sweep of card places', () => {
    for (let top = -50; top <= 800; top += 25) {
      for (let left = -50; left <= 1000; left += 50) {
        const place = placePopover({ left, top, bottom: top + 150 }, size, bounds);
        expect(place.left).toBeGreaterThanOrEqual(4);
        expect(place.left + size.width).toBeLessThanOrEqual(bounds.width);
        expect(place.top).toBeGreaterThanOrEqual(4);
        expect(place.top + size.height).toBeLessThanOrEqual(bounds.height);
      }
    }
  });
});
